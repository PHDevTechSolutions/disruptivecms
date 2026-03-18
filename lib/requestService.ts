/**
 * lib/requestService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized approval-workflow service.
 *
 * All write operations that require approval go through this module.
 * The module is resource-agnostic — it works for products, jobs, content, etc.
 *
 * Collection: "requests"
 *
 * Product payload conventions:
 *   update → { before: ProductDoc, after: ProductDoc }
 *   delete → { productSnapshot: ProductDoc, deletedBy, originPage }
 *   create → full product doc (flat)
 *
 * Canonical product name field: itemDescription (falls back to name)
 * Canonical product codes:       litItemCode, ecoItemCode
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RequestType = "create" | "update" | "delete";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface PendingRequest {
  id: string;
  type: RequestType;
  resource: string; // e.g. "products", "jobs"
  resourceId?: string; // target document id (for update / delete)
  payload: Record<string, any>;
  requestedBy: string; // uid
  requestedByName?: string;
  status: RequestStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: Timestamp | null;
  createdAt: Timestamp;
  /**
   * meta — human-readable context stored alongside every request.
   *
   * For products the canonical fields are:
   *   productName  → itemDescription (display label)
   *   litItemCode  → LIT item code
   *   ecoItemCode  → ECO item code
   *   source       → originating component string
   *   page         → originating route
   *   autoApproved → true when created by a privileged user (audit trail only)
   */
  meta?: Record<string, any>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REQUESTS_COL = "requests";

function requestsRef() {
  return collection(db, REQUESTS_COL);
}

function requestRef(id: string) {
  return doc(db, REQUESTS_COL, id);
}

/**
 * resolveProductName
 * Given any product-shaped object, return the best display name following the
 * canonical schema: itemDescription → name → id
 */
export function resolveProductName(
  data: Record<string, any> | null | undefined,
  fallback = "",
): string {
  if (!data) return fallback;
  return data.itemDescription || data.name || data.itemCode || fallback;
}

/**
 * resolveProductMeta
 * Extracts the canonical identifying fields from a product document so they
 * can be stored in request.meta for fast display in the notifications panel
 * without needing to re-fetch the product.
 */
export function resolveProductMeta(
  data: Record<string, any> | null | undefined,
): Record<string, string> {
  if (!data) return {};
  return {
    productName: resolveProductName(data),
    litItemCode: data.litItemCode || data.itemCode || "",
    ecoItemCode: data.ecoItemCode || "",
    productFamily: data.productFamily || "",
    brand: Array.isArray(data.brands)
      ? (data.brands[0] ?? "")
      : data.brand || "",
  };
}

// ─── createRequest ────────────────────────────────────────────────────────────

export async function createRequest(data: {
  type: RequestType;
  resource: string;
  resourceId?: string;
  payload: Record<string, any>;
  requestedBy: string;
  requestedByName?: string;
  /**
   * meta is merged with auto-resolved product identifiers when resource="products".
   * Callers should pass { productName, source, page, ... }; this function will
   * enrich it with litItemCode / ecoItemCode from payload when missing.
   */
  meta?: Record<string, any>;
}): Promise<string> {
  // ── Auto-enrich meta with canonical product fields ─────────────────────────
  let enrichedMeta = data.meta ?? {};

  if (data.resource === "products") {
    // Determine the relevant product doc to extract identifiers from.
    // For update requests the identifiers live in payload.before (original values).
    // For delete requests they live in payload.productSnapshot.
    // For create requests they live at the payload root.
    const sourceDoc =
      data.payload?.before ??
      data.payload?.productSnapshot ??
      data.payload ??
      null;

    const productMeta = resolveProductMeta(sourceDoc);

    enrichedMeta = {
      ...productMeta, // litItemCode, ecoItemCode, productFamily, brand, productName (from doc)
      ...enrichedMeta, // caller-supplied values take precedence (e.g. explicit productName)
    };
  }

  const ref = await addDoc(requestsRef(), {
    type: data.type,
    resource: data.resource,
    resourceId: data.resourceId ?? null,
    payload: data.payload,
    requestedBy: data.requestedBy,
    requestedByName: data.requestedByName ?? null,
    status: "pending" as RequestStatus,
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    meta: enrichedMeta,
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

// ─── executeRequest ───────────────────────────────────────────────────────────

/**
 * Execute the actual Firestore mutation described by a request.
 *
 * Idempotency: re-reads status before executing — throws if already resolved.
 *
 * Product update payload shape: { before: ProductDoc, after: ProductDoc }
 *   → only payload.after is written to Firestore.
 *
 * Product delete payload shape: { productSnapshot, deletedBy, originPage }
 *   → soft-delete: move to recycle_bin, delete from products.
 */
export async function executeRequest(request: PendingRequest): Promise<void> {
  const { type, resource, resourceId, payload } = request;

  // Idempotency guard — re-read from Firestore before mutating.
  const snap = await getDoc(requestRef(request.id));
  if (!snap.exists()) throw new Error("Request not found");
  const current = snap.data() as PendingRequest;
  if (current.status !== "pending") {
    throw new Error(`Request already ${current.status} — cannot execute again`);
  }

  switch (type) {
    // ── CREATE ──────────────────────────────────────────────────────────────
    case "create": {
      const newRef = doc(collection(db, resource));
      await setDoc(newRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      break;
    }

    // ── UPDATE ──────────────────────────────────────────────────────────────
    case "update": {
      if (!resourceId) throw new Error("resourceId required for update");

      const targetRef = doc(db, resource, resourceId);

      /**
       * IMPORTANT — product update payloads have the shape:
       *   { before: <original product fields>, after: <new product fields> }
       *
       * We must apply payload.after — NOT spread the outer payload object
       * (which would write "before" and "after" as document fields).
       *
       * For non-product resources that store the update data flat (no before/after
       * wrapper) we fall back to spreading payload directly.
       */
      const updateData = payload.after !== undefined ? payload.after : payload;

      await updateDoc(targetRef, {
        ...updateData,
        updatedAt: serverTimestamp(),
      });
      break;
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    case "delete": {
      if (!resourceId) throw new Error("resourceId required for delete");

      if (resource === "products") {
        /**
         * Products use soft-delete:
         *   1. Copy snapshot into recycle_bin/{resourceId}
         *   2. Delete from products/{resourceId}
         *
         * Payload shape: { productSnapshot, deletedBy, originPage }
         * The productSnapshot must use the canonical schema fields
         * (itemDescription, litItemCode, ecoItemCode, etc.) exactly as stored.
         */
        const snapshot =
          payload.productSnapshot ??
          // Fallback: older requests stored the snapshot flat at payload root
          // (minus the wrapper keys) — reconstruct it.
          (() => {
            const { deletedBy: _d, originPage: _o, ...rest } = payload as any;
            return Object.keys(rest).length > 0 ? rest : null;
          })();

        if (snapshot) {
          const { writeBatch: makeBatch } = await import("firebase/firestore");
          const batch = makeBatch(db);

          batch.set(doc(db, "recycle_bin", resourceId), {
            ...snapshot,
            originalCollection: "products",
            originPage: payload.originPage ?? "/products",
            deletedAt: serverTimestamp(),
            deletedBy: payload.deletedBy ?? null,
          });

          batch.delete(doc(db, "products", resourceId));
          await batch.commit();
          break;
        }
      }

      // Generic hard-delete for all other resources.
      await deleteDoc(doc(db, resource, resourceId));
      break;
    }

    default:
      throw new Error(`Unknown request type: ${type}`);
  }
}

// ─── approveRequest ───────────────────────────────────────────────────────────

/**
 * Approve a pending request.
 *
 * @param requestId    - Firestore document ID in the "requests" collection
 * @param reviewer     - { uid, name } of the approving user
 * @param skipExecution - When true the document mutation is skipped (use when
 *                        the caller already applied it directly — audit trail only)
 */
export async function approveRequest(
  requestId: string,
  reviewer: { uid: string; name?: string },
  skipExecution = false,
): Promise<void> {
  if (!skipExecution) {
    const snap = await getDoc(requestRef(requestId));
    if (!snap.exists()) throw new Error("Request not found");
    const request = { id: requestId, ...snap.data() } as PendingRequest;
    await executeRequest(request);
  }

  await updateDoc(requestRef(requestId), {
    status: "approved" as RequestStatus,
    reviewedBy: reviewer.uid,
    reviewedByName: reviewer.name ?? null,
    reviewedAt: serverTimestamp(),
  });
}

// ─── rejectRequest ────────────────────────────────────────────────────────────

/**
 * Reject a pending request without executing it.
 * The underlying resource document is left untouched.
 */
export async function rejectRequest(
  requestId: string,
  reviewer: { uid: string; name?: string },
): Promise<void> {
  const snap = await getDoc(requestRef(requestId));
  if (!snap.exists()) throw new Error("Request not found");

  const data = snap.data() as PendingRequest;
  if (data.status !== "pending") {
    throw new Error(`Request is already ${data.status}`);
  }

  await updateDoc(requestRef(requestId), {
    status: "rejected" as RequestStatus,
    reviewedBy: reviewer.uid,
    reviewedByName: reviewer.name ?? null,
    reviewedAt: serverTimestamp(),
  });
}
