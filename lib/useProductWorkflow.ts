"use client";
/**
 * lib/useProductWorkflow.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * RBAC-aware hook for ALL product write operations.
 *
 * Exported functions:
 *   submitProductUpdate        – edit product fields
 *   submitProductDelete        – soft-delete to recycle_bin
 *   submitProductAssignWebsite – assign websites (incl. schema transform)
 *   submitProductSetClass      – set productClass (spf | standard)
 *
 * Rules:
 *   verify:products | verify:* | superadmin  → direct write + auto-approved audit request
 *   write:products (no verify)               → pending request only
 *
 * Product schema conventions:
 *   Primary name : itemDescription  (falls back to name)
 *   Item codes   : litItemCode, ecoItemCode  (falls back to itemCode)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback } from "react";
import {
  doc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";
import { hasAccess } from "@/lib/rbac";
import {
  createRequest,
  approveRequest,
  resolveProductName,
  resolveProductMeta,
} from "@/lib/requestService";
import { logAuditEvent } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkflowResult =
  | { mode: "direct"; message: string }
  | { mode: "pending"; requestId: string; message: string };

export interface BulkWorkflowResult {
  direct: number;
  pending: number;
  errors: number;
}

interface SubmitUpdateOptions {
  productId: string;
  before: Record<string, any>;
  after: Record<string, any>;
  productName?: string;
  source?: string;
  page?: string;
}

interface SubmitDeleteOptions {
  product: Record<string, any> & { id: string };
  originPage?: string;
  source?: string;
}

interface SubmitAssignWebsiteOptions {
  product: Record<string, any> & { id: string };
  websites: string[];
  /** Pre-built schema-transformed fields (Taskflow / Shopify only) */
  transformedFields?: Record<string, any>;
  originPage?: string;
  source?: string;
}

interface SubmitSetProductClassOptions {
  product: Record<string, any> & { id: string };
  productClass: "spf" | "standard";
  originPage?: string;
  source?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getExistingPendingRequest(
  productId: string,
  type: "update" | "delete",
): Promise<string | null> {
  const q = query(
    collection(db, "requests"),
    where("resource", "==", "products"),
    where("resourceId", "==", productId),
    where("type", "==", type),
    where("status", "==", "pending"),
  );
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].id;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProductWorkflow() {
  const { user } = useAuth();

  const canVerify = useCallback(
    () => hasAccess(user, "verify", "products"),
    [user],
  );

  const canWrite = useCallback(
    () => hasAccess(user, "write", "products"),
    [user],
  );

  // ── submitProductUpdate ───────────────────────────────────────────────────
  const submitProductUpdate = useCallback(
    async (opts: SubmitUpdateOptions): Promise<WorkflowResult> => {
      if (!user) throw new Error("Not authenticated");
      if (!canWrite())
        throw new Error("Insufficient permissions to edit products");

      const {
        productId,
        before,
        after,
        source = "product-form:update",
        page = "/products",
      } = opts;

      const productName =
        opts.productName ||
        resolveProductName(after) ||
        resolveProductName(before) ||
        productId;

      const meta = {
        ...resolveProductMeta(before),
        ...resolveProductMeta(after),
        productName,
        source,
        page,
      };

      const reviewer = { uid: user.uid, name: user.name };

      if (canVerify()) {
        await updateDoc(doc(db, "products", productId), {
          ...after,
          updatedAt: serverTimestamp(),
        });

        const reqId = await createRequest({
          type: "update",
          resource: "products",
          resourceId: productId,
          payload: { before, after },
          requestedBy: user.uid,
          requestedByName: user.name,
          meta: { ...meta, autoApproved: true },
        });

        await approveRequest(reqId, reviewer, true).catch(() => {});

        await logAuditEvent({
          action: "update",
          entityType: "product",
          entityId: productId,
          entityName: productName,
          context: { page, source, collection: "products" },
        });

        return { mode: "direct", message: "Product updated successfully." };
      } else {
        const existing = await getExistingPendingRequest(productId, "update");
        if (existing) {
          throw new Error(
            "This product already has a pending update request. Wait for it to be resolved before submitting another.",
          );
        }

        const reqId = await createRequest({
          type: "update",
          resource: "products",
          resourceId: productId,
          payload: { before, after },
          requestedBy: user.uid,
          requestedByName: user.name,
          meta,
        });

        return {
          mode: "pending",
          requestId: reqId,
          message: "Update submitted for approval.",
        };
      }
    },
    [user, canVerify, canWrite],
  );

  // ── submitProductDelete ───────────────────────────────────────────────────
  const submitProductDelete = useCallback(
    async (opts: SubmitDeleteOptions): Promise<WorkflowResult> => {
      if (!user) throw new Error("Not authenticated");
      if (!canWrite())
        throw new Error("Insufficient permissions to delete products");

      const {
        product,
        originPage = "/products",
        source = "product-page:delete",
      } = opts;
      const { id: productId, ...productSnapshot } = product;
      const productName = resolveProductName(productSnapshot, productId);
      const reviewer = { uid: user.uid, name: user.name };

      const meta = {
        ...resolveProductMeta(productSnapshot),
        productName,
        source,
        originPage,
      };

      const deletePayload = {
        productSnapshot,
        deletedBy: { uid: user.uid, name: user.name, role: user.role },
        originPage,
      };

      if (canVerify()) {
        const batch = writeBatch(db);
        batch.set(doc(db, "recycle_bin", productId), {
          ...productSnapshot,
          originalCollection: "products",
          originPage,
          deletedAt: serverTimestamp(),
          deletedBy: { uid: user.uid, name: user.name, role: user.role },
        });
        batch.delete(doc(db, "products", productId));
        await batch.commit();

        const reqId = await createRequest({
          type: "delete",
          resource: "products",
          resourceId: productId,
          payload: deletePayload,
          requestedBy: user.uid,
          requestedByName: user.name,
          meta: { ...meta, autoApproved: true },
        });

        await approveRequest(reqId, reviewer, true).catch(() => {});

        await logAuditEvent({
          action: "delete",
          entityType: "product",
          entityId: productId,
          entityName: productName,
          context: { page: originPage, source, collection: "products" },
        });

        return {
          mode: "direct",
          message: `"${productName}" moved to recycle bin.`,
        };
      } else {
        const pendingUpdate = await getExistingPendingRequest(
          productId,
          "update",
        );
        if (pendingUpdate) {
          throw new Error(
            "Cannot delete — this product has a pending update request. Resolve it first.",
          );
        }

        const existingDelete = await getExistingPendingRequest(
          productId,
          "delete",
        );
        if (existingDelete) {
          throw new Error(
            "A delete request for this product is already pending.",
          );
        }

        const reqId = await createRequest({
          type: "delete",
          resource: "products",
          resourceId: productId,
          payload: deletePayload,
          requestedBy: user.uid,
          requestedByName: user.name,
          meta,
        });

        return {
          mode: "pending",
          requestId: reqId,
          message: "Delete request submitted for approval.",
        };
      }
    },
    [user, canVerify, canWrite],
  );

  // ── submitProductAssignWebsite ────────────────────────────────────────────
  /**
   * Assigns one or more websites to a single product.
   *
   * The payload is always stored as { before, after } so that executeRequest
   * (via approveRequest) can apply payload.after correctly on approval.
   *
   * "after" includes the merged websites array + any transformedFields.
   * transformedFields is only supplied for schema-transform sites (Taskflow, Shopify).
   */
  const submitProductAssignWebsite = useCallback(
    async (opts: SubmitAssignWebsiteOptions): Promise<WorkflowResult> => {
      if (!user) throw new Error("Not authenticated");
      if (!canWrite())
        throw new Error(
          "Insufficient permissions to assign products to websites",
        );

      const {
        product,
        websites,
        transformedFields,
        originPage = "/products/all-products",
        source = "all-products:assign-website",
      } = opts;

      const { id: productId, ...productSnapshot } = product;
      const productName = resolveProductName(productSnapshot, productId);
      const reviewer = { uid: user.uid, name: user.name };

      // Build merged websites array (the "after" state).
      const existingWebsites: string[] = Array.isArray(productSnapshot.websites)
        ? productSnapshot.websites
        : Array.isArray(productSnapshot.website)
          ? productSnapshot.website
          : productSnapshot.website
            ? [productSnapshot.website as string]
            : [];

      const mergedWebsites = Array.from(
        new Set([...existingWebsites, ...websites]),
      );

      // "after" = what the doc will look like — used by executeRequest on approval.
      const after: Record<string, any> = {
        ...productSnapshot,
        websites: mergedWebsites,
        website: mergedWebsites,
        updatedAt: serverTimestamp(),
        ...(transformedFields ?? {}),
      };

      const meta = {
        ...resolveProductMeta(productSnapshot),
        productName,
        source,
        originPage,
        assignedWebsites: websites,
        actionType: "assign-website",
      };

      if (canVerify()) {
        // Privileged: write directly, then create auto-approved audit request.
        const batch = writeBatch(db);
        const ref = doc(db, "products", productId);

        batch.update(ref, {
          websites: arrayUnion(...websites),
          website: arrayUnion(...websites),
          updatedAt: serverTimestamp(),
        });

        if (transformedFields && Object.keys(transformedFields).length > 0) {
          batch.set(ref, transformedFields, { merge: true });
        }

        await batch.commit();

        const reqId = await createRequest({
          type: "update",
          resource: "products",
          resourceId: productId,
          payload: { before: productSnapshot, after },
          requestedBy: user.uid,
          requestedByName: user.name,
          meta: { ...meta, autoApproved: true },
        });

        await approveRequest(reqId, reviewer, true).catch(() => {});

        await logAuditEvent({
          action: "update",
          entityType: "product",
          entityId: productId,
          entityName: productName,
          context: { page: originPage, source, collection: "products" },
          metadata: { assignedWebsites: websites },
        });

        return {
          mode: "direct",
          message: `Assigned to ${websites.join(", ")}.`,
        };
      } else {
        // Restricted: create a pending request. No Firestore write yet.
        const existing = await getExistingPendingRequest(productId, "update");
        if (existing) {
          throw new Error(
            "This product already has a pending update request. Resolve it before assigning websites.",
          );
        }

        const reqId = await createRequest({
          type: "update",
          resource: "products",
          resourceId: productId,
          payload: { before: productSnapshot, after },
          requestedBy: user.uid,
          requestedByName: user.name,
          meta,
        });

        return {
          mode: "pending",
          requestId: reqId,
          message: `Website assignment submitted for approval.`,
        };
      }
    },
    [user, canVerify, canWrite],
  );

  // ── submitProductSetClass ─────────────────────────────────────────────────
  /**
   * Sets productClass ("spf" | "standard") on a single product.
   * Privileged users → direct write. Others → pending request.
   */
  const submitProductSetClass = useCallback(
    async (opts: SubmitSetProductClassOptions): Promise<WorkflowResult> => {
      if (!user) throw new Error("Not authenticated");
      if (!canWrite())
        throw new Error("Insufficient permissions to set product class");

      const {
        product,
        productClass,
        originPage = "/products/all-products",
        source = "all-products:set-product-class",
      } = opts;

      const { id: productId, ...productSnapshot } = product;
      const productName = resolveProductName(productSnapshot, productId);
      const reviewer = { uid: user.uid, name: user.name };

      const after = {
        ...productSnapshot,
        productClass,
        updatedAt: serverTimestamp(),
      };

      const meta = {
        ...resolveProductMeta(productSnapshot),
        productName,
        source,
        originPage,
        productClass,
        actionType: "set-product-class",
      };

      if (canVerify()) {
        await updateDoc(doc(db, "products", productId), {
          productClass,
          updatedAt: serverTimestamp(),
        });

        const reqId = await createRequest({
          type: "update",
          resource: "products",
          resourceId: productId,
          payload: { before: productSnapshot, after },
          requestedBy: user.uid,
          requestedByName: user.name,
          meta: { ...meta, autoApproved: true },
        });

        await approveRequest(reqId, reviewer, true).catch(() => {});

        return {
          mode: "direct",
          message: `Product class set to "${productClass}".`,
        };
      } else {
        const existing = await getExistingPendingRequest(productId, "update");
        if (existing) {
          throw new Error("This product already has a pending update request.");
        }

        const reqId = await createRequest({
          type: "update",
          resource: "products",
          resourceId: productId,
          payload: { before: productSnapshot, after },
          requestedBy: user.uid,
          requestedByName: user.name,
          meta,
        });

        return {
          mode: "pending",
          requestId: reqId,
          message: "Product class change submitted for approval.",
        };
      }
    },
    [user, canVerify, canWrite],
  );

  return {
    submitProductUpdate,
    submitProductDelete,
    submitProductAssignWebsite,
    submitProductSetClass,
    canVerifyProducts: canVerify,
    canWriteProducts: canWrite,
    isPrivileged: canVerify,
  };
}
