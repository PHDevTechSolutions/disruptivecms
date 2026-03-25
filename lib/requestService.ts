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
 *
 * TDS auto-regeneration:
 *   When a product "update" request is approved, the TDS PDF is automatically
 *   regenerated in the background using payload.after. This keeps the TDS in
 *   sync without requiring the approver to manually re-save the product form.
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

// ─── TDS auto-regeneration ────────────────────────────────────────────────────

/**
 * Determines the best TDS brand from a product's brand field.
 *
 * A flexible check — "Ecoshift Corporation", "ECOSHIFT", "ecoshift" all resolve
 * to ECOSHIFT. Everything else defaults to LIT (matching the bulk-uploader
 * and tdsGenerator.normaliseBrand contract).
 */
function resolveTdsBrand(raw?: string | null): "LIT" | "ECOSHIFT" {
  const upper = String(raw ?? "")
    .toUpperCase()
    .trim();
  return upper.includes("ECOSHIFT") ? "ECOSHIFT" : "LIT";
}

/**
 * Resolves the best display code for a TDS filename.
 * Priority: litItemCode → ecoItemCode → productId
 */
function resolveTdsCode(data: Record<string, any>, fallback: string): string {
  const isBlank = (v?: string) =>
    !v || v.trim().toUpperCase() === "N/A" || v.trim() === "";
  return (
    (!isBlank(data.litItemCode) ? data.litItemCode : null) ??
    (!isBlank(data.ecoItemCode) ? data.ecoItemCode : null) ??
    fallback
  );
}

/**
 * regenerateTdsAfterUpdate
 * ─────────────────────────────────────────────────────────────────────────────
 * Fired (void / fire-and-forget) immediately after a product update doc is
 * written to Firestore. Re-generates the TDS PDF from the new product data and
 * writes the resulting Cloudinary URL back to the product document.
 *
 * Design decisions:
 *  • Dynamic import of tdsGenerator to avoid pulling jsPDF into the SSR bundle.
 *  • All errors are caught and logged — TDS regeneration is best-effort; it
 *    must NEVER cause the approval itself to fail or roll back.
 *  • Skips generation if technicalSpecs is empty after filtering N/A values,
 *    matching the behaviour of the bulk importer and product forms.
 */
async function regenerateTdsAfterUpdate(
  productId: string,
  productData: Record<string, any>,
): Promise<void> {
  try {
    // ── 1. Build filtered technicalSpecs (exclude N/A and empty values) ──────
    const technicalSpecs = (productData.technicalSpecs ?? [])
      .map((group: any) => ({
        specGroup: String(group.specGroup ?? group.name ?? "")
          .toUpperCase()
          .trim(),
        specs: (group.specs ?? [])
          .filter((s: any) => {
            const v = String(s.value ?? "")
              .toUpperCase()
              .trim();
            return v !== "" && v !== "N/A";
          })
          .map((s: any) => ({
            name: String(s.name ?? s.label ?? "")
              .toUpperCase()
              .trim(),
            value: String(s.value ?? "")
              .toUpperCase()
              .trim(),
          })),
      }))
      .filter((g: any) => g.specs.length > 0);

    // Skip entirely if there are no meaningful specs — a TDS without specs
    // would be a nearly-blank PDF, which is worse than keeping the old one.
    if (technicalSpecs.length === 0) {
      console.info(
        `[requestService] TDS skipped for ${productId} — no non-N/A specs after approval.`,
      );
      return;
    }

    // ── 2. Dynamic import (keeps jsPDF out of the SSR bundle) ────────────────
    const { generateTdsPdf, uploadTdsPdf } = await import("@/lib/tdsGenerator");

    // ── 3. Resolve Cloudinary config from env (with sensible defaults) ───────
    const cloudName =
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "dvmpn8mjh";
    const uploadPreset =
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "taskflow_preset";

    // ── 4. Map product image fields → TDS generator input ───────────────────
    //    Field names are normalised across the three product schemas:
    //      JARIS bulk   : dimensionalDrawingImage, recommendedMountingHeightImage, …
    //      All-products  : same, plus legacy dimensionDrawingImage alias
    const p = productData as any;

    const tdsBlob = await generateTdsPdf({
      itemDescription: p.itemDescription || p.name || "PRODUCT",
      litItemCode: p.litItemCode,
      ecoItemCode: p.ecoItemCode,
      technicalSpecs,
      brand: resolveTdsBrand(p.brand),

      // Product images — fall back across known field aliases
      mainImageUrl: p.mainImage || p.rawImage || undefined,

      // Technical drawing images
      dimensionalDrawingUrl:
        p.dimensionalDrawingImage || p.dimensionDrawingImage || undefined,
      recommendedMountingHeightUrl:
        p.recommendedMountingHeightImage || p.mountingHeightImage || undefined,
      driverCompatibilityUrl: p.driverCompatibilityImage || undefined,
      baseImageUrl: p.baseImage || undefined,
      illuminanceLevelUrl: p.illuminanceLevelImage || undefined,
      wiringDiagramUrl: p.wiringDiagramImage || undefined,
      installationUrl: p.installationImage || undefined,
      wiringLayoutUrl: p.wiringLayoutImage || undefined,
      terminalLayoutUrl: p.terminalLayoutImage || undefined,
      accessoriesImageUrl: p.accessoriesImage || undefined,
      typeOfPlugUrl: p.typeOfPlugImage || undefined,
    });

    // ── 5. Upload PDF to Cloudinary ──────────────────────────────────────────
    const filename = `${resolveTdsCode(p, productId)}_TDS.pdf`;
    const tdsUrl = await uploadTdsPdf(
      tdsBlob,
      filename,
      cloudName,
      uploadPreset,
    );

    if (!tdsUrl.startsWith("http")) {
      console.warn(
        `[requestService] TDS upload for ${productId} returned an unexpected URL: ${tdsUrl}`,
      );
      return;
    }

    // ── 6. Persist the new TDS URL back to the product document ─────────────
    await updateDoc(doc(db, "products", productId), {
      tdsFileUrl: tdsUrl,
      updatedAt: serverTimestamp(),
    });

    console.info(
      `[requestService] TDS auto-regenerated for product ${productId} → ${tdsUrl}`,
    );
  } catch (err: any) {
    // ── Non-fatal — log and continue ─────────────────────────────────────────
    // The request was already approved and the product doc updated.
    // A failed TDS regeneration must not surface as an error to the approver.
    console.warn(
      `[requestService] TDS auto-regeneration failed for product ${productId}:`,
      err?.message ?? err,
    );
  }
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
 *   → TDS is automatically regenerated from payload.after (fire-and-forget).
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

      // ── Auto-regenerate TDS for product updates ────────────────────────────
      // Fired as void (fire-and-forget) so TDS generation — which can take
      // 5–20 s due to image fetching and PDF rendering — never blocks the
      // approval confirmation from reaching the reviewer.
      //
      // Errors are swallowed inside regenerateTdsAfterUpdate and logged to the
      // console; they will NOT cause the approval to fail or roll back.
      if (resource === "products") {
        void regenerateTdsAfterUpdate(resourceId, updateData);
      }

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
 *
 * Note on TDS:
 *   When skipExecution is false (the normal path), executeRequest fires TDS
 *   regeneration automatically in the background for product updates.
 *
 *   When skipExecution is true (privileged direct-write path in useProductWorkflow),
 *   the caller has already written the product doc via updateDoc. In this case
 *   we also fire TDS regeneration here so that direct writes from privileged
 *   users are equally covered.
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
  } else {
    // ── skipExecution = true: caller wrote the doc directly ─────────────────
    // Re-read the request to determine if TDS regeneration is needed.
    // This covers the privileged path in useProductWorkflow.submitProductUpdate
    // where updateDoc is called outside executeRequest.
    try {
      const snap = await getDoc(requestRef(requestId));
      if (snap.exists()) {
        const req = snap.data() as PendingRequest;
        if (
          req.resource === "products" &&
          req.type === "update" &&
          req.resourceId
        ) {
          const updateData =
            req.payload?.after !== undefined ? req.payload.after : req.payload;
          void regenerateTdsAfterUpdate(req.resourceId, updateData);
        }
      }
    } catch {
      // Non-fatal — TDS regeneration best-effort even in the skip path
    }
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
