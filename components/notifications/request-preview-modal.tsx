"use client";

/**
 * components/notifications/request-preview-modal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared modal used by NotificationsDropdown and /admin/requests.
 * Shows full request metadata, a schema-aware product identity panel,
 * and a clean before/after diff for update requests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  User,
  Calendar,
  Tag,
  Database,
  Loader2,
  Package,
  Hash,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  approveRequest,
  rejectRequest,
  PendingRequest,
  resolveProductName,
  resolveProductMeta,
} from "@/lib/requestService";
import { useAuth } from "@/lib/useAuth";
import { hasAccess } from "@/lib/rbac";
import { Timestamp } from "firebase/firestore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  try {
    return format(ts.toDate(), "MMM d, yyyy · h:mm a");
  } catch {
    return "—";
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending")
    return (
      <Badge className="bg-amber-50 text-amber-700 border-amber-200 border gap-1.5 text-xs font-semibold">
        <Clock className="w-3 h-3" />
        Pending
      </Badge>
    );
  if (status === "approved")
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border gap-1.5 text-xs font-semibold">
        <CheckCircle2 className="w-3 h-3" />
        Approved
      </Badge>
    );
  return (
    <Badge className="bg-rose-50 text-rose-700 border-rose-200 border gap-1.5 text-xs font-semibold">
      <XCircle className="w-3 h-3" />
      Rejected
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    create: "bg-sky-50 text-sky-700 border-sky-200",
    update: "bg-violet-50 text-violet-700 border-violet-200",
    delete: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <Badge
      className={`border text-xs font-semibold ${
        styles[type] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {type}
    </Badge>
  );
}

// ─── Product Identity Panel ───────────────────────────────────────────────────
// Surfaces the canonical product schema fields prominently above the raw payload.

interface ProductIdentityProps {
  request: PendingRequest;
}

function ProductIdentityPanel({ request }: ProductIdentityProps) {
  if (request.resource !== "products") return null;

  const meta = request.meta ?? {};
  const payload = request.payload ?? {};

  // Resolve from meta first (already enriched by createRequest),
  // fall back to extracting directly from payload for legacy requests.
  const sourceDoc =
    payload.after ??
    payload.productSnapshot ??
    (request.type === "create" ? payload : null);

  const fallbackMeta = resolveProductMeta(sourceDoc);

  const productName =
    meta.productName ||
    fallbackMeta.productName ||
    resolveProductName(sourceDoc) ||
    "—";
  const litItemCode = meta.litItemCode || fallbackMeta.litItemCode || "—";
  const ecoItemCode = meta.ecoItemCode || fallbackMeta.ecoItemCode || "—";
  const productFamily = meta.productFamily || fallbackMeta.productFamily || "";
  const brand = meta.brand || fallbackMeta.brand || "";

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      {/* Product name */}
      <div className="flex items-start gap-2">
        <Package className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
            Item Description
          </p>
          <p className="text-sm font-semibold leading-snug break-words">
            {productName}
          </p>
        </div>
      </div>

      {/* Item codes */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-start gap-2">
          <Hash className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
              LIT Item Code
            </p>
            <p className="text-xs font-mono font-semibold">{litItemCode}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Hash className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
              ECO Item Code
            </p>
            <p className="text-xs font-mono font-semibold">{ecoItemCode}</p>
          </div>
        </div>
      </div>

      {/* Product family + brand */}
      {(productFamily || brand) && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
          {productFamily && (
            <div className="flex items-start gap-2">
              <Layers className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
                  Product Family
                </p>
                <p className="text-xs truncate">{productFamily}</p>
              </div>
            </div>
          )}
          {brand && (
            <div className="flex items-start gap-2">
              <Tag className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
                  Brand
                </p>
                <p className="text-xs">{brand}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Payload display ──────────────────────────────────────────────────────────
// For update requests: render a clean side-by-side diff of changed fields.
// For others: render the full payload JSON.

/**
 * Fields to exclude from the diff display — they're shown in the identity panel
 * above or are noisy internal timestamps.
 */
const DIFF_EXCLUDE = new Set(["updatedAt", "createdAt", "id"]);

function UpdateDiff({
  before,
  after,
}: {
  before: Record<string, any>;
  after: Record<string, any>;
}) {
  // Find keys that actually changed (string-compare via JSON).
  const changedKeys = Object.keys(after).filter((k) => {
    if (DIFF_EXCLUDE.has(k)) return false;
    return JSON.stringify(after[k]) !== JSON.stringify(before[k]);
  });

  // Surface identity fields first.
  const PRIORITY = [
    "itemDescription",
    "litItemCode",
    "ecoItemCode",
    "name",
    "itemCode",
  ];
  const sorted = [
    ...PRIORITY.filter((k) => changedKeys.includes(k)),
    ...changedKeys.filter((k) => !PRIORITY.includes(k)),
  ];

  if (sorted.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No changed fields detected.
      </p>
    );
  }

  const fmt = (v: any): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") return JSON.stringify(v, null, 2);
    return String(v);
  };

  return (
    <div className="space-y-2">
      {sorted.map((key) => (
        <div
          key={key}
          className="rounded-md border overflow-hidden text-xs font-mono"
        >
          <div className="px-2.5 py-1 bg-muted/50 border-b font-sans font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">
            {key}
          </div>
          <div className="grid grid-cols-2 divide-x">
            <div className="px-2.5 py-2 bg-rose-50/50 dark:bg-rose-950/20">
              <p className="text-[9px] font-sans font-bold uppercase text-rose-500 mb-1">
                Before
              </p>
              <p className="break-all whitespace-pre-wrap text-foreground">
                {fmt(before[key])}
              </p>
            </div>
            <div className="px-2.5 py-2 bg-emerald-50/50 dark:bg-emerald-950/20">
              <p className="text-[9px] font-sans font-bold uppercase text-emerald-600 mb-1">
                After
              </p>
              <p className="break-all whitespace-pre-wrap text-foreground">
                {fmt(after[key])}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PayloadView({ request }: { request: PendingRequest }) {
  const { type, payload } = request;

  if (type === "update" && payload.before && payload.after) {
    return (
      <UpdateDiff
        before={payload.before as Record<string, any>}
        after={payload.after as Record<string, any>}
      />
    );
  }

  // delete: show the snapshot cleanly
  if (type === "delete" && payload.productSnapshot) {
    return (
      <pre className="text-xs bg-muted/50 border rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
        {JSON.stringify(payload.productSnapshot, null, 2)}
      </pre>
    );
  }

  // fallback: raw JSON
  return (
    <pre className="text-xs bg-muted/50 border rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface RequestPreviewModalProps {
  request: PendingRequest | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onActionComplete?: () => void;
}

export function RequestPreviewModal({
  request,
  open,
  onOpenChange,
  onActionComplete,
}: RequestPreviewModalProps) {
  const { user } = useAuth();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const canApprove =
    !!user &&
    (hasAccess(user, "verify", request?.resource ?? "") ||
      hasAccess(user, "verify", "*"));

  const reviewer = { uid: user?.uid ?? "", name: user?.name };

  const handleApprove = async () => {
    if (!request) return;
    setApproving(true);
    const t = toast.loading("Approving request…");
    try {
      await approveRequest(request.id, reviewer);
      toast.success("Request approved and executed.", { id: t });
      onActionComplete?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Approval failed.", { id: t });
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!request) return;
    setRejecting(true);
    const t = toast.loading("Rejecting request…");
    try {
      await rejectRequest(request.id, reviewer);
      toast.success("Request rejected.", { id: t });
      onActionComplete?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Rejection failed.", { id: t });
    } finally {
      setRejecting(false);
    }
  };

  const busy = approving || rejecting;
  const isPending = request?.status === "pending";

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-none p-0 overflow-hidden">
        {/* ── Header ── */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-none bg-muted flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-sm font-bold uppercase tracking-tight flex items-center gap-2 flex-wrap">
                Request Preview
                <StatusBadge status={request.status} />
                <TypeBadge type={request.type} />
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5 font-mono text-muted-foreground truncate">
                {request.id}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="px-5 py-4 space-y-4">
            {/* ── Product Identity Panel (products only) ── */}
            <ProductIdentityPanel request={request} />

            {/* ── Request metadata ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  <Database className="w-3 h-3" /> Resource
                </p>
                <p className="text-sm capitalize">{request.resource}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Action
                </p>
                <TypeBadge type={request.type} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  <User className="w-3 h-3" /> Requested By
                </p>
                <p className="text-sm">
                  {request.requestedByName || request.requestedBy}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Created At
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTs(request.createdAt)}
                </p>
              </div>
              {request.resourceId && (
                <div className="col-span-2 space-y-1">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                    Target Document ID
                  </p>
                  <p className="text-xs font-mono text-muted-foreground break-all">
                    {request.resourceId}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* ── Payload / Diff ── */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                {request.type === "update"
                  ? "Changed Fields"
                  : request.type === "delete"
                    ? "Product Snapshot"
                    : "Payload"}
              </p>
              <PayloadView request={request} />
            </div>

            {/* ── Review info (if resolved) ── */}
            {request.status !== "pending" && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                      Reviewed By
                    </p>
                    <p className="text-sm">
                      {request.reviewedByName || request.reviewedBy || "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                      Reviewed At
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTs(request.reviewedAt ?? null)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* ── Footer actions ── */}
        {isPending && canApprove && (
          <DialogFooter className="px-5 py-3 border-t gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-none border-rose-200 text-rose-600 hover:bg-rose-50 gap-1.5"
              onClick={handleReject}
              disabled={busy}
            >
              {rejecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              Reject
            </Button>
            <Button
              size="sm"
              className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              onClick={handleApprove}
              disabled={busy}
            >
              {approving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              Approve & Execute
            </Button>
          </DialogFooter>
        )}

        {isPending && !canApprove && (
          <div className="px-5 py-3 border-t">
            <p className="text-xs text-muted-foreground text-center">
              You do not have permission to approve or reject this request.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
