"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Bell,
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  Inbox,
  Clock,
  Package,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  doc,
  updateDoc,
} from "firebase/firestore";

import { useAuth } from "@/lib/useAuth";
import { canSeeNotifications, hasAccess } from "@/lib/rbac";
import {
  PendingRequest,
  approveRequest,
  rejectRequest,
} from "@/lib/requestService";
import { RequestPreviewModal } from "./request-preview-modal";
import {
  RemarksConfirmDialog,
  RemarksTarget,
  RemarksAction,
} from "./remarks-confirm-dialog";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts: Timestamp | null | undefined): string {
  if (!ts) return "";
  try {
    const diff = Date.now() - ts.toDate().getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return format(ts.toDate(), "MMM d");
  } catch {
    return "";
  }
}

function TypeChip({ type }: { type: string }) {
  const styles: Record<string, string> = {
    create: "bg-sky-100 text-sky-700",
    update: "bg-violet-100 text-violet-700",
    delete: "bg-rose-100 text-rose-700",
  };
  return (
    <span
      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
        styles[type] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {type}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  if (status === "pending")
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
        <Clock className="w-2.5 h-2.5" />
        Pending
      </span>
    );
  if (status === "approved")
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="w-2.5 h-2.5" />
        Approved
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
      <XCircle className="w-2.5 h-2.5" />
      Rejected
    </span>
  );
}

function getRequestDisplayName(req: PendingRequest): string {
  const meta = req.meta ?? {};
  if (meta.productName) return String(meta.productName);
  const payload = req.payload ?? {};
  const d = payload.after ?? payload.productSnapshot ?? payload;
  return d?.itemDescription || d?.name || d?.itemCode || req.resourceId || "—";
}

function getRequestSubtitle(req: PendingRequest): string | null {
  const meta = req.meta ?? {};
  const parts: string[] = [];
  if (meta.litItemCode) parts.push(String(meta.litItemCode));
  if (meta.ecoItemCode && meta.ecoItemCode !== meta.litItemCode)
    parts.push(String(meta.ecoItemCode));
  if (meta.productFamily) parts.push(String(meta.productFamily));
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ─── Verifier notification row ──────────────────────────────────────────────────

function VerifierNotificationItem({
  req,
  onPreview,
  onRequestAction,
}: {
  req: PendingRequest;
  onPreview: (r: PendingRequest) => void;
  onRequestAction: (target: RemarksTarget) => void;
}) {
  const displayName = getRequestDisplayName(req);
  const subtitle = getRequestSubtitle(req);

  return (
    <div
      className="px-3 py-2.5 hover:bg-muted/40 transition-colors border-b last:border-b-0 cursor-pointer"
      onClick={() => onPreview(req)}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Package className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <TypeChip type={req.type} />
            <span className="text-[10px] text-muted-foreground truncate">
              {req.resource}
            </span>
          </div>
          {/* Product name — truncated to prevent layout break */}
          <p className="text-xs font-medium leading-tight truncate max-w-full">
            {displayName}
          </p>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              {subtitle}
            </p>
          )}
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <p className="text-[10px] text-muted-foreground shrink-0">
              {req.requestedByName || "Unknown"} · {relativeTime(req.createdAt)}
            </p>
            {/* Action buttons — stop propagation so click doesn't open preview */}
            <div
              className="flex gap-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Preview */}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => onPreview(req)}
              >
                <Eye className="w-3 h-3" />
              </Button>

              {/* Approve */}
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] gap-1 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                onClick={() =>
                  onRequestAction({ request: req, action: "approve" })
                }
              >
                <CheckCircle2 className="w-3 h-3" />
                Approve
              </Button>

              {/* Reject */}
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] gap-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                onClick={() =>
                  onRequestAction({ request: req, action: "reject" })
                }
              >
                <XCircle className="w-3 h-3" />
                Reject
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Submitter notification row (read-only) ─────────────────────────────────────

function SubmitterNotificationItem({
  req,
  onPreview,
}: {
  req: PendingRequest;
  onPreview: (r: PendingRequest) => void;
}) {
  const displayName = getRequestDisplayName(req);
  const subtitle = getRequestSubtitle(req);

  return (
    <div
      className="px-3 py-2.5 hover:bg-muted/40 transition-colors border-b last:border-b-0 cursor-pointer"
      onClick={() => onPreview(req)}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Package className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <TypeChip type={req.type} />
            <StatusChip status={req.status} />
          </div>
          {/* Product name — truncated */}
          <p className="text-xs font-medium leading-tight truncate max-w-full">
            {displayName}
          </p>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              {subtitle}
            </p>
          )}
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              {relativeTime(req.createdAt)}
            </p>
            {req.status !== "pending" && req.reviewedByName && (
              <p className="text-[10px] text-muted-foreground">
                by {req.reviewedByName}
              </p>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onPreview(req);
              }}
            >
              <Eye className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main dropdown ──────────────────────────────────────────────────────────────

export function NotificationsDropdown() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [preview, setPreview] = useState<PendingRequest | null>(null);
  const [open, setOpen] = useState(false);

  const [remarksTarget, setRemarksTarget] = useState<RemarksTarget | null>(
    null,
  );

  const visible = canSeeNotifications(user);
  const isVerifier = hasAccess(user, "verify", "products");
  const isSubmitter = !isVerifier && hasAccess(user, "write", "products");
  const reviewer = { uid: user?.uid ?? "", name: user?.name };

  useEffect(() => {
    if (!visible || !user) return;

    const q = isVerifier
      ? query(
          collection(db, "requests"),
          where("status", "==", "pending"),
          orderBy("createdAt", "desc"),
        )
      : query(collection(db, "requests"), where("requestedBy", "==", user.uid));

    const unsub = onSnapshot(q, (snap) => {
      let docs = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as PendingRequest,
      );
      if (isSubmitter) {
        docs = docs.sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
        );
      }
      setRequests(docs);
    });

    return unsub;
  }, [visible, isVerifier, isSubmitter, user]);

  if (!visible) return null;

  const badgeCount = isVerifier
    ? requests.length
    : requests.filter((r) => r.status === "pending").length;

  const handleRemarksConfirm = async (
    action: RemarksAction,
    requestId: string,
    remarks: string,
  ) => {
    const t = toast.loading(action === "approve" ? "Approving…" : "Rejecting…");
    try {
      if (action === "approve") {
        await approveRequest(requestId, reviewer);
      } else {
        await rejectRequest(requestId, reviewer);
      }
      await updateDoc(doc(db, "requests", requestId), {
        reviewRemarks: remarks,
      }).catch(() => {});
      toast.success(
        action === "approve"
          ? "Request approved and executed."
          : "Request rejected.",
        { id: t },
      );
    } catch (err: any) {
      toast.error(
        err.message ||
          `${action === "approve" ? "Approval" : "Rejection"} failed.`,
        { id: t },
      );
      throw err;
    }
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 rounded-full"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {badgeCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-bold px-1 leading-none">
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>

        {/*
          Increased from w-80 (320px) to w-[26rem] (416px) so the
          Approve / Reject buttons always have enough room to render
          side-by-side without wrapping or overflowing.
        */}
        <DropdownMenuContent
          align="end"
          className="w-[26rem] p-0 shadow-lg"
          sideOffset={8}
        >
          {/* Sticky header */}
          <div className="sticky top-0 z-10 bg-popover border-b">
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold">
                  {isVerifier ? "Pending Approvals" : "My Requests"}
                </span>
                {badgeCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-bold h-5 px-1.5"
                  >
                    {badgeCount}
                  </Badge>
                )}
              </div>
              {isVerifier && (
                <a
                  href="/products/requests"
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                  onClick={() => setOpen(false)}
                >
                  View all
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {/* Content */}
          {requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Inbox className="w-8 h-8 opacity-30" />
              <p className="text-xs">
                {isVerifier
                  ? "No pending requests"
                  : "No requests submitted yet"}
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              {requests.map((req) =>
                isVerifier ? (
                  <VerifierNotificationItem
                    key={req.id}
                    req={req}
                    onPreview={(r) => {
                      setPreview(r);
                      setOpen(false);
                    }}
                    onRequestAction={(target) => {
                      setOpen(false);
                      setRemarksTarget(target);
                    }}
                  />
                ) : (
                  <SubmitterNotificationItem
                    key={req.id}
                    req={req}
                    onPreview={(r) => {
                      setPreview(r);
                      setOpen(false);
                    }}
                  />
                ),
              )}
            </ScrollArea>
          )}

          {isSubmitter && requests.length > 0 && (
            <>
              <DropdownMenuSeparator className="m-0" />
              <div className="px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  {requests.filter((r) => r.status === "pending").length > 0
                    ? "Your requests are awaiting review by a manager."
                    : "All your requests have been reviewed."}
                </p>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Full preview modal */}
      <RequestPreviewModal
        request={preview}
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        onActionComplete={() => setPreview(null)}
      />

      {/* Remarks-gated approve/reject dialog */}
      <RemarksConfirmDialog
        target={remarksTarget}
        open={!!remarksTarget}
        onOpenChange={(v) => !v && setRemarksTarget(null)}
        onConfirm={handleRemarksConfirm}
      />
    </>
  );
}
