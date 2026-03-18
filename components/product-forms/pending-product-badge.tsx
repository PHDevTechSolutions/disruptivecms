"use client";
/**
 * components/product-forms/pending-product-badge.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight badge + tooltip shown on products that have active pending
 * requests.  Uses a Firestore query against the "requests" collection.
 *
 * Exported helpers:
 *  - <PendingProductBadge productId={...} />     → inline badge
 *  - usePendingProducts(productIds)               → bulk hook (for tables)
 *  - usePendingProduct(productId)                 → single-product hook
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import { Clock, Trash2, Pencil } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PendingStatus = "update" | "delete" | null;

/** Map of productId → pending action type */
export type PendingMap = Map<string, PendingStatus>;

// ─── Single-product hook ──────────────────────────────────────────────────────

export function usePendingProduct(
  productId: string | null | undefined,
): PendingStatus {
  const [status, setStatus] = useState<PendingStatus>(null);

  useEffect(() => {
    if (!productId) return;

    const q = query(
      collection(db, "requests"),
      where("resource", "==", "products"),
      where("resourceId", "==", productId),
      where("status", "==", "pending"),
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setStatus(null);
        return;
      }
      // Priority: delete > update
      const types = snap.docs.map((d) => d.data().type as string);
      if (types.includes("delete")) setStatus("delete");
      else if (types.includes("update")) setStatus("update");
      else setStatus(null);
    });

    return unsub;
  }, [productId]);

  return status;
}

// ─── Bulk hook (efficient for tables with many rows) ─────────────────────────

/**
 * usePendingProducts
 * Listens to ALL pending product requests once and builds a lookup map.
 * More efficient than calling usePendingProduct per row.
 */
export function usePendingProducts(): PendingMap {
  const [map, setMap] = useState<PendingMap>(new Map());

  useEffect(() => {
    const q = query(
      collection(db, "requests"),
      where("resource", "==", "products"),
      where("status", "==", "pending"),
    );

    const unsub = onSnapshot(q, (snap) => {
      const next = new Map<string, PendingStatus>();
      snap.docs.forEach((d) => {
        const { resourceId, type } = d.data() as {
          resourceId: string;
          type: string;
        };
        if (!resourceId) return;
        const current = next.get(resourceId);
        // delete takes priority over update
        if (type === "delete" || !current) {
          next.set(resourceId, type as PendingStatus);
        }
      });
      setMap(next);
    });

    return unsub;
  }, []);

  return map;
}

// ─── Badge component ──────────────────────────────────────────────────────────

interface PendingProductBadgeProps {
  productId: string;
  /** Pass pre-fetched status from usePendingProducts() to avoid extra listeners */
  status?: PendingStatus;
  className?: string;
}

export function PendingProductBadge({
  productId,
  status: externalStatus,
  className = "",
}: PendingProductBadgeProps) {
  // Only subscribe individually if no external status provided
  const internalStatus = usePendingProduct(
    externalStatus === undefined ? productId : null,
  );
  const status = externalStatus !== undefined ? externalStatus : internalStatus;

  if (!status) return null;

  const isDelete = status === "delete";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          className={`gap-1 text-[9px] font-bold border cursor-default select-none
            ${
              isDelete
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            } ${className}`}
        >
          <Clock className="w-2.5 h-2.5" />
          {isDelete ? "Pending Deletion" : "Pending Update"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-xs">
        {isDelete
          ? "A delete request for this product is awaiting approval from a PD Manager or Admin."
          : "An update for this product is awaiting approval from a PD Manager or Admin."}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Row overlay (for table cells) ───────────────────────────────────────────

/** Compact inline indicator — fits inside a table cell beside action buttons */
export function PendingRowIndicator({ status }: { status: PendingStatus }) {
  if (!status) return null;
  const isDelete = status === "delete";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full
            ${isDelete ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"}`}
        >
          {isDelete ? (
            <Trash2 className="w-2.5 h-2.5" />
          ) : (
            <Pencil className="w-2.5 h-2.5" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {isDelete ? "Pending Deletion" : "Pending Update"} — awaiting approval
      </TooltipContent>
    </Tooltip>
  );
}
