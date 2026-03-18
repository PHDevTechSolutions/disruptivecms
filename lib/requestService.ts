/**
 * lib/requestService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized approval-workflow service.
 *
 * All write operations that require approval go through this module.
 * The module is resource-agnostic — it works for products, jobs, content, etc.
 *
 * Collection: "requests"
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
import { hasAccess } from "@/lib/rbac";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RequestType = "create" | "update" | "delete";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface PendingRequest {
  id: string;
  type: RequestType;
  resource: string; // e.g. "products", "jobs"
  resourceId?: string; // target document id (for update/delete)
  payload: Record<string, any>;
  requestedBy: string; // uid
  requestedByName?: string; // display name (denormalized)
  status: RequestStatus;
  reviewedBy?: string; // uid
  reviewedByName?: string;
  reviewedAt?: Timestamp | null;
  createdAt: Timestamp;
  // optional metadata for UI display
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

// ─── createRequest ────────────────────────────────────────────────────────────

/**
 * Store a write operation as a pending request instead of executing it.
 * Call this whenever a user with write-but-not-verify permission tries to mutate.
 *
 * @returns The newly created request document ID
 */
export async function createRequest(data: {
  type: RequestType;
  resource: string;
  resourceId?: string;
  payload: Record<string, any>;
  requestedBy: string;
  requestedByName?: string;
  meta?: Record<string, any>;
}): Promise<string> {
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
    meta: data.meta ?? null,
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

// ─── executeRequest ───────────────────────────────────────────────────────────

/**
 * Execute the actual Firestore mutation described by a request.
 *
 * Idempotency: checks status is still "pending" before executing.
 * This is the ONLY place where real DB mutations happen for workflow requests.
 */
export async function executeRequest(request: PendingRequest): Promise<void> {
  const { type, resource, resourceId, payload } = request;

  // Double-check status to prevent duplicate execution
  const snap = await getDoc(requestRef(request.id));
  if (!snap.exists()) throw new Error("Request not found");
  const current = snap.data() as PendingRequest;
  if (current.status !== "pending") {
    throw new Error(`Request already ${current.status} — cannot execute again`);
  }

  const targetCollection = collection(db, resource);

  switch (type) {
    case "create": {
      // Use setDoc with a new doc ref so we get a predictable ID
      const newRef = doc(targetCollection);
      await setDoc(newRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      break;
    }
    case "update": {
      if (!resourceId) throw new Error("resourceId required for update");
      const targetRef = doc(db, resource, resourceId);
      await updateDoc(targetRef, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
      break;
    }
    case "delete": {
      if (!resourceId) throw new Error("resourceId required for delete");

      // Products use soft-delete: move to recycle_bin, then remove from products.
      // Payload must carry productSnapshot + optional deletedBy / originPage.
      if (resource === "products") {
        const snap = (payload as any).productSnapshot;
        if (snap) {
          const { writeBatch: makeBatch } = await import("firebase/firestore");
          const batch = makeBatch(db);
          batch.set(doc(db, "recycle_bin", resourceId), {
            ...snap,
            originalCollection: "products",
            originPage: (payload as any).originPage ?? "/products",
            deletedAt: serverTimestamp(),
            deletedBy: (payload as any).deletedBy ?? null,
          });
          batch.delete(doc(db, "products", resourceId));
          await batch.commit();
          break;
        }
      }

      // Generic hard-delete for all other resources
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
 * 1. Executes the underlying mutation (idempotent guard inside executeRequest)
 * 2. Marks the request document as "approved"
 *
 * @param requestId  - Firestore document ID in "requests" collection
 * @param reviewer   - { uid, name } of the approving user
 */
export async function approveRequest(
  requestId: string,
  reviewer: { uid: string; name?: string },
  /**
   * When true, skip executeRequest. Used when the mutation was already
   * performed directly by a privileged user — request exists for audit only.
   */
  skipExecution = false,
): Promise<void> {
  const snap = await getDoc(requestRef(requestId));
  if (!snap.exists()) throw new Error("Request not found");

  const request = { id: snap.id, ...snap.data() } as PendingRequest;

  if (request.status !== "pending") {
    throw new Error(
      `Cannot approve a request that is already ${request.status}`,
    );
  }

  // Execute the actual mutation (skip if already done by privileged user)
  if (!skipExecution) {
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
 *
 * @param requestId - Firestore document ID
 * @param reviewer  - { uid, name } of the rejecting user
 */
export async function rejectRequest(
  requestId: string,
  reviewer: { uid: string; name?: string },
): Promise<void> {
  const snap = await getDoc(requestRef(requestId));
  if (!snap.exists()) throw new Error("Request not found");

  const request = snap.data() as PendingRequest;
  if (request.status !== "pending") {
    throw new Error(
      `Cannot reject a request that is already ${request.status}`,
    );
  }

  await updateDoc(requestRef(requestId), {
    status: "rejected" as RequestStatus,
    reviewedBy: reviewer.uid,
    reviewedByName: reviewer.name ?? null,
    reviewedAt: serverTimestamp(),
  });
}
