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
} from "@/lib/firestore/client";
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
 */
function resolveTdsBrand(raw?: string | null): "LIT" | "ECOSHIFT" {
  const upper = String(raw ?? "")
    .toUpperCase()
    .trim();
  return upper.includes("ECOSHIFT") ? "ECOSHIFT" : "LIT";
}

/**
 * Resolves the best display code for a TDS filename.
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
 * regenerateTdsAfterUpdate — fire-and-forget TDS regeneration after approval.
 */
async function regenerateTdsAfterUpdate(
  productId: string,
  productData: Record<string, any>,
): Promise<void> {
  try {
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

    if (technicalSpecs.length === 0) {
      console.info(
        `[requestService] TDS skipped for ${productId} — no non-N/A specs after approval.`,
      );
      return;
    }

    const { generateTdsPdf, uploadTdsPdf } = await import("@/lib/tdsGenerator");

    const cloudName =
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "dvmpn8mjh";
    const uploadPreset =
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "taskflow_preset";

    const p = productData as any;

    const tdsBlob = await generateTdsPdf({
      itemDescription: p.itemDescription || p.name || "PRODUCT",
      litItemCode: p.litItemCode,
      ecoItemCode: p.ecoItemCode,
      technicalSpecs,
      brand: resolveTdsBrand(p.brand),
      mainImageUrl: p.mainImage || p.rawImage || undefined,
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

    await updateDoc(doc(db, "products", productId), {
      tdsFileUrl: tdsUrl,
      updatedAt: serverTimestamp(),
    });

    console.info(
      `[requestService] TDS auto-regenerated for product ${productId} → ${tdsUrl}`,
    );
  } catch (err: any) {
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
  meta?: Record<string, any>;
}): Promise<string> {
  let enrichedMeta = data.meta ?? {};

  if (data.resource === "products") {
    const sourceDoc =
      data.payload?.before ??
      data.payload?.productSnapshot ??
      data.payload ??
      null;

    const productMeta = resolveProductMeta(sourceDoc);

    enrichedMeta = {
      ...productMeta,
      ...enrichedMeta,
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

export async function executeRequest(request: PendingRequest): Promise<void> {
  const { type, resource, resourceId, payload } = request;

  const snap = await getDoc(requestRef(request.id));
  if (!snap.exists()) throw new Error("Request not found");
  const current = snap.data() as PendingRequest;
  if (current.status !== "pending") {
    throw new Error(`Request already ${current.status} — cannot execute again`);
  }

  switch (type) {
    case "create": {
      const newRef = doc(collection(db, resource));
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
      const updateData = payload.after !== undefined ? payload.after : payload;

      await updateDoc(targetRef, {
        ...updateData,
        updatedAt: serverTimestamp(),
      });

      if (resource === "products") {
        void regenerateTdsAfterUpdate(resourceId, updateData);
      }

      break;
    }

    case "delete": {
      if (!resourceId) throw new Error("resourceId required for delete");

      if (resource === "products") {
        const snapshot =
          payload.productSnapshot ??
          (() => {
            const { deletedBy: _d, originPage: _o, ...rest } = payload as any;
            return Object.keys(rest).length > 0 ? rest : null;
          })();

        if (snapshot) {
          const { writeBatch: makeBatch } = await import("@/lib/firestore/client");
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

      await deleteDoc(doc(db, resource, resourceId));
      break;
    }

    default:
      throw new Error(`Unknown request type: ${type}`);
  }
}

// ─── approveRequest ───────────────────────────────────────────────────────────

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

// ─── bulkApproveRequests ─────────────────────────────────────────────────────

/**
 * Approve multiple pending requests in parallel with a single shared remark.
 *
 * Runs all approvals concurrently. Individual failures are swallowed so that
 * one bad request does not block the others. The caller receives a count of
 * successes and failures so it can surface an appropriate toast message.
 *
 * @param requestIds - Array of request document IDs to approve
 * @param reviewer   - { uid, name } of the approving user
 * @param remarks    - Shared review remarks saved to every request
 */
export async function bulkApproveRequests(
  requestIds: string[],
  reviewer: { uid: string; name?: string },
  remarks: string,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  await Promise.all(
    requestIds.map(async (id) => {
      try {
        await approveRequest(id, reviewer);
        if (remarks.trim()) {
          await updateDoc(doc(db, REQUESTS_COL, id), {
            reviewRemarks: remarks.trim(),
          }).catch(() => {});
        }
        succeeded++;
      } catch (err) {
        console.warn(`[bulkApproveRequests] Failed for request ${id}:`, err);
        failed++;
      }
    }),
  );

  return { succeeded, failed };
}
