"use client";

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
      className={`border text-xs font-semibold ${styles[type] ?? "bg-muted text-muted-foreground border-border"}`}
    >
      {type}
    </Badge>
  );
}

function ProductIdentityPanel({ request }: { request: PendingRequest }) {
  if (request.resource !== "products") return null;

  const meta = request.meta ?? {};
  const payload = request.payload ?? {};
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
    <div className="rounded-md border bg-muted/30 p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <Package className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
            Item Description
          </p>
          <p className="text-base font-semibold leading-snug break-words">
            {productName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-start gap-2">
          <Hash className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
              LIT Item Code
            </p>
            <p className="text-sm font-mono font-semibold">{litItemCode}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Hash className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
              ECO Item Code
            </p>
            <p className="text-sm font-mono font-semibold">{ecoItemCode}</p>
          </div>
        </div>
      </div>

      {(productFamily || brand) && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
          {productFamily && (
            <div className="flex items-start gap-2">
              <Layers className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
                  Product Family
                </p>
                <p className="text-sm truncate">{productFamily}</p>
              </div>
            </div>
          )}
          {brand && (
            <div className="flex items-start gap-2">
              <Tag className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
                  Brand
                </p>
                <p className="text-sm">{brand}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
      <DialogContent className="max-w-4xl rounded-none p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-none bg-muted flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-sm font-bold uppercase tracking-tight flex items-center gap-2 flex-wrap">
                Request Details
                <StatusBadge status={request.status} />
                <TypeBadge type={request.type} />
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5 font-mono text-muted-foreground truncate">
                ID: {request.id}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="px-6 py-5 space-y-5">
            {/* 1. Product identity */}
            <ProductIdentityPanel request={request} />

            {/* 2. Request metadata — 4-column grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                  <Calendar className="w-3 h-3" /> Submitted
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTs(request.createdAt)}
                </p>
              </div>
            </div>

            {request.resourceId && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                  Target Document ID
                </p>
                <p className="text-xs font-mono text-muted-foreground break-all bg-muted/50 border rounded px-2.5 py-1.5">
                  {request.resourceId}
                </p>
              </div>
            )}

            {/* 3. Review info — only when resolved */}
            {request.status !== "pending" && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
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

        {/* Footer */}
        {isPending && canApprove && (
          <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2">
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
              Approve &amp; Execute
            </Button>
          </DialogFooter>
        )}

        {isPending && !canApprove && (
          <div className="px-6 py-4 border-t">
            <p className="text-xs text-muted-foreground text-center">
              Awaiting review by a PD Manager or Admin.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
