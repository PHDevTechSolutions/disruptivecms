"use client";
/**
 * lib/useProductWorkflow.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * RBAC-aware hook for product write operations.
 *
 * Rules:
 *  - If user has verify:products | verify:* | superadmin
 *      → execute directly AND create an auto-approved request (audit trail)
 *  - Otherwise (pd_engineer, etc.)
 *      → create a pending request only; do NOT touch the product document
 *
 * Usage:
 *   const { submitProductUpdate, submitProductDelete } = useProductWorkflow();
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback } from "react";
import {
  doc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";
import { hasAccess, isSuperAdmin } from "@/lib/rbac";
import {
  createRequest,
  approveRequest,
  PendingRequest,
} from "@/lib/requestService";
import { logAuditEvent } from "@/lib/logger";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkflowResult =
  | { mode: "direct"; message: string }
  | { mode: "pending"; requestId: string; message: string };

interface SubmitUpdateOptions {
  /** The Firestore document ID of the product being updated */
  productId: string;
  /** Full original product data (before changes) */
  before: Record<string, any>;
  /** The new payload to be written (after changes) */
  after: Record<string, any>;
  /** Human-readable product name for toast messages */
  productName?: string;
  /** Audit source string e.g. "all-products:edit" */
  source?: string;
  /** Which page this is called from */
  page?: string;
}

interface SubmitDeleteOptions {
  /** Full product object including .id */
  product: Record<string, any> & { id: string };
  /** Page this is called from, used for recycle_bin metadata */
  originPage?: string;
  /** Audit source string */
  source?: string;
}

// ─── Helper: check for existing pending request ──────────────────────────────

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
        productName = productId,
        source = "product-form:update",
        page = "/products",
      } = opts;

      const reviewer = { uid: user.uid, name: user.name };

      if (canVerify()) {
        // ── PRIVILEGED: execute directly + auto-approve request (audit trail) ──
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
          meta: { productName, source, page, autoApproved: true },
        });

        // Auto-approve to mark it resolved immediately (no Firestore re-execution)
        await approveRequest(reqId, reviewer, true).catch(() => {
          // skipExecution=true: product already updated directly above
        });

        await logAuditEvent({
          action: "update",
          entityType: "product",
          entityId: productId,
          entityName: productName,
          context: { page, source, collection: "products" },
        });

        return { mode: "direct", message: "Product updated successfully." };
      } else {
        // ── RESTRICTED: check for duplicate pending update ─────────────────
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
          meta: { productName, source, page },
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
      const productName =
        productSnapshot.itemDescription || productSnapshot.name || productId;
      const reviewer = { uid: user.uid, name: user.name };

      // Block if there's a pending delete already
      const existingDelete = await getExistingPendingRequest(
        productId,
        "delete",
      );
      if (existingDelete) {
        throw new Error(
          "A delete request for this product is already pending.",
        );
      }

      const payload = {
        productSnapshot,
        deletedBy: { uid: user.uid, name: user.name, role: user.role },
        originPage,
      };

      if (canVerify()) {
        // ── PRIVILEGED: soft-delete immediately via batch ──────────────────
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

        // Create auto-approved request for audit trail
        const reqId = await createRequest({
          type: "delete",
          resource: "products",
          resourceId: productId,
          payload,
          requestedBy: user.uid,
          requestedByName: user.name,
          meta: { productName, source, originPage, autoApproved: true },
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
        // ── RESTRICTED: block if pending update exists (can't delete while update pending) ──
        const pendingUpdate = await getExistingPendingRequest(
          productId,
          "update",
        );
        if (pendingUpdate) {
          throw new Error(
            "Cannot delete — this product has a pending update request. Resolve it first.",
          );
        }

        const reqId = await createRequest({
          type: "delete",
          resource: "products",
          resourceId: productId,
          payload,
          requestedBy: user.uid,
          requestedByName: user.name,
          meta: { productName, source, originPage },
        });

        return {
          mode: "pending",
          requestId: reqId,
          message: `Delete request submitted for approval.`,
        };
      }
    },
    [user, canVerify, canWrite],
  );

  return {
    submitProductUpdate,
    submitProductDelete,
    canVerifyProducts: canVerify,
    canWriteProducts: canWrite,
    isPrivileged: canVerify,
  };
}
