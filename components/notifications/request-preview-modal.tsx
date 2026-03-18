"use client";

/**
 * components/notifications/request-preview-modal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared modal that shows full request details and exposes Approve / Reject
 * actions.  Used identically by:
 *   - NotificationsDropdown  (inline bell-icon panel)
 *   - /admin/requests page   (full management table)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  FileText,
  User,
  Calendar,
  Tag,
  Database,
  Loader2,
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
import { approveRequest, rejectRequest, PendingRequest } from "@/lib/requestService";
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
    <Badge className={`border text-xs font-semibold ${styles[type] ?? "bg-muted text-muted-foreground border-border"}`}>
      {type}
    </Badge>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface RequestPreviewModalProps {
  request: PendingRequest | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called after a successful approve / reject so the parent can refresh */
  onActionComplete?: () => void;
}

export function RequestPreviewModal({
  request,
  open,
  onOpenChange,
  onActionComplete,
}: RequestPreviewModalProps) {
  const { user } = useAuth();
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  if (!request) return null;

  // Permission check: can current user approve/reject?
  const canAct =
    !!user &&
    request.status === "pending" &&
    hasAccess(user, "verify", request.resource);

  const reviewer = { uid: user?.uid ?? "", name: user?.name };

  const handleApprove = async () => {
    if (!user) return;
    setIsApproving(true);
    const t = toast.loading("Approving request…");
    try {
      await approveRequest(request.id, reviewer);
      toast.success("Request approved and executed.", { id: t });
      onActionComplete?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Approval failed.", { id: t });
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!user) return;
    setIsRejecting(true);
    const t = toast.loading("Rejecting request…");
    try {
      await rejectRequest(request.id, reviewer);
      toast.success("Request rejected.", { id: t });
      onActionComplete?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Rejection failed.", { id: t });
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">Request Details</DialogTitle>
              <DialogDescription className="text-xs mt-0.5 font-mono truncate">
                #{request.id}
              </DialogDescription>
            </div>
            <StatusBadge status={request.status} />
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-1">
          <div className="space-y-4 py-1">

            {/* ── Meta row ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  <Database className="w-3 h-3" /> Resource
                </p>
                <p className="text-sm font-semibold capitalize">{request.resource}</p>
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
                <p className="text-sm">{request.requestedByName || request.requestedBy}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Created At
                </p>
                <p className="text-xs text-muted-foreground">{formatTs(request.createdAt)}</p>
              </div>
              {request.resourceId && (
                <div className="col-span-2 space-y-1">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                    Target ID
                  </p>
                  <p className="text-xs font-mono text-muted-foreground break-all">{request.resourceId}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* ── Payload ── */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                Payload
              </p>
              <pre className="text-xs bg-muted/50 border rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
                {JSON.stringify(request.payload, null, 2)}
              </pre>
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
                    <p className="text-sm">{request.reviewedByName || request.reviewedBy || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                      Reviewed At
                    </p>
                    <p className="text-xs text-muted-foreground">{formatTs(request.reviewedAt ?? null)}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* ── Actions (only shown if pending + user has verify perm) ── */}
        {canAct && (
          <>
            <Separator />
            <DialogFooter className="gap-2 sm:gap-2 pt-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isApproving || isRejecting}
              >
                Close
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReject}
                disabled={isApproving || isRejecting}
                className="border-rose-200 text-rose-700 hover:bg-rose-50 gap-1.5"
              >
                {isRejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                Reject
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isApproving || isRejecting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approve
              </Button>
            </DialogFooter>
          </>
        )}

        {!canAct && (
          <DialogFooter className="pt-0">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}