"use client";

/**
 * components/notifications/notifications-dropdown.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Global header notifications bell — dual-mode.
 *
 * VERIFIER MODE  (verify:products | verify:* | superadmin)
 *   - Shows ALL pending requests system-wide
 *   - Badge = total pending count
 *   - Inline Approve / Reject actions on each item
 *   - Header: "Pending Approvals"
 *
 * SUBMITTER MODE  (write:products only — no verify)
 *   - Shows only the current user's OWN requests (all statuses)
 *   - Badge = only THEIR pending ones (items still awaiting review)
 *   - Read-only — no approve/reject, just Preview
 *   - Status chip (Pending / Approved / Rejected) on each row
 *   - Header: "My Requests"
 * ─────────────────────────────────────────────────────────────────────────────
 */

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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";

import { useAuth } from "@/lib/useAuth";
import { canSeeNotifications, hasAccess } from "@/lib/rbac";
import {
  PendingRequest,
  approveRequest,
  rejectRequest,
} from "@/lib/requestService";
import { RequestPreviewModal } from "./request-preview-modal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Mini status chip used in submitter mode rows
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

// ─── Display name / subtitle resolvers ────────────────────────────────────────

function getRequestDisplayName(req: PendingRequest): string {
  const meta = req.meta ?? {};
  if (meta.productName) return meta.productName;
  const payload = req.payload ?? {};
  const d = payload.after ?? payload.productSnapshot ?? payload;
  return d?.itemDescription || d?.name || d?.itemCode || req.resourceId || "—";
}

function getRequestSubtitle(req: PendingRequest): string | null {
  const meta = req.meta ?? {};
  const parts: string[] = [];
  if (meta.litItemCode) parts.push(meta.litItemCode);
  if (meta.ecoItemCode && meta.ecoItemCode !== meta.litItemCode)
    parts.push(meta.ecoItemCode);
  if (meta.productFamily) parts.push(meta.productFamily);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ─── Verifier notification row (with Approve / Reject) ───────────────────────

function VerifierNotificationItem({
  req,
  reviewer,
  onPreview,
}: {
  req: PendingRequest;
  reviewer: { uid: string; name?: string };
  onPreview: (r: PendingRequest) => void;
}) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const busy = approving || rejecting;

  const handleApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setApproving(true);
    const t = toast.loading("Approving…");
    try {
      await approveRequest(req.id, reviewer);
      toast.success("Approved and executed.", { id: t });
    } catch (err: any) {
      toast.error(err.message || "Approval failed.", { id: t });
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRejecting(true);
    const t = toast.loading("Rejecting…");
    try {
      await rejectRequest(req.id, reviewer);
      toast.success("Request rejected.", { id: t });
    } catch (err: any) {
      toast.error(err.message || "Rejection failed.", { id: t });
    } finally {
      setRejecting(false);
    }
  };

  const displayName = getRequestDisplayName(req);
  const subtitle = getRequestSubtitle(req);

  return (
    <div
      className="px-3 py-2.5 hover:bg-muted/40 transition-colors border-b last:border-b-0 cursor-pointer"
      onClick={() => onPreview(req)}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Package className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <TypeChip type={req.type} />
            <span className="text-[10px] text-muted-foreground">
              {req.resource}
            </span>
          </div>
          <p className="text-xs font-medium leading-tight truncate">
            {displayName}
          </p>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              {subtitle}
            </p>
          )}
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              {req.requestedByName || "Unknown"} · {relativeTime(req.createdAt)}
            </p>
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => onPreview(req)}
              >
                <Eye className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] gap-1 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                onClick={handleApprove}
                disabled={busy}
              >
                {approving ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] gap-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                onClick={handleReject}
                disabled={busy}
              >
                {rejecting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                Reject
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Submitter notification row (view-only, shows status) ─────────────────────

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
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Package className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <TypeChip type={req.type} />
            <StatusChip status={req.status} />
          </div>
          <p className="text-xs font-medium leading-tight truncate">
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
            {/* Show who reviewed it if already resolved */}
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

// ─── Main dropdown ────────────────────────────────────────────────────────────

export function NotificationsDropdown() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [preview, setPreview] = useState<PendingRequest | null>(null);
  const [open, setOpen] = useState(false);

  const visible = canSeeNotifications(user);

  // isVerifier: can approve/reject — sees all pending requests
  // isSubmitter: can only write — sees only their own requests (all statuses)
  const isVerifier = hasAccess(user, "verify", "products");
  const isSubmitter = !isVerifier && hasAccess(user, "write", "products");

  useEffect(() => {
    if (!visible || !user) return;

    let q;

    if (isVerifier) {
      // All pending requests — for approval workflow
      q = query(
        collection(db, "requests"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc"),
      );
    } else {
      // Own requests only (all statuses) — sorted client-side to avoid
      // needing a composite Firestore index on requestedBy + createdAt
      q = query(
        collection(db, "requests"),
        where("requestedBy", "==", user.uid),
      );
    }

    const unsub = onSnapshot(
      q,
      (snap) => {
        let docs = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as PendingRequest,
        );

        // For submitter mode: sort newest-first client-side
        if (isSubmitter) {
          docs = docs.sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() ?? 0;
            const tb = b.createdAt?.toMillis?.() ?? 0;
            return tb - ta;
          });
        }

        setRequests(docs);
      },
      (err) => {
        console.error("[Notifications] Firestore error:", err);
      },
    );

    return unsub;
  }, [visible, isVerifier, isSubmitter, user]);

  if (!visible) return null;

  // Badge count:
  //   Verifier  → all pending (same as before)
  //   Submitter → only THEIR pending items (the ones still awaiting action)
  const badgeCount = isVerifier
    ? requests.length
    : requests.filter((r) => r.status === "pending").length;

  const reviewer = { uid: user?.uid ?? "", name: user?.name };

  const headerTitle = isVerifier ? "Pending Approvals" : "My Requests";
  const emptyMessage = isVerifier
    ? "No pending requests"
    : "No requests submitted yet";

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

        <DropdownMenuContent
          align="end"
          className="w-80 p-0 shadow-lg"
          sideOffset={8}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-muted-foreground" />
              <DropdownMenuLabel className="p-0 text-sm font-semibold">
                {headerTitle}
              </DropdownMenuLabel>
            </div>
            {badgeCount > 0 && (
              <Badge
                variant="secondary"
                className="text-[10px] font-bold h-5 px-1.5"
              >
                {badgeCount}
              </Badge>
            )}
          </div>

          <DropdownMenuSeparator className="m-0" />

          {/* Content */}
          {requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Inbox className="w-8 h-8 opacity-30" />
              <p className="text-xs">{emptyMessage}</p>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              {requests.map((req) =>
                isVerifier ? (
                  <VerifierNotificationItem
                    key={req.id}
                    req={req}
                    reviewer={reviewer}
                    onPreview={(r) => {
                      setPreview(r);
                      setOpen(false);
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

          {/* Footer */}
          <DropdownMenuSeparator className="m-0" />
          <div className="px-3 py-2">
            {isVerifier ? (
              <a
                href="/admin/requests"
                className="text-[11px] text-primary hover:underline"
              >
                View all requests →
              </a>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {requests.filter((r) => r.status === "pending").length > 0
                  ? "Your requests are awaiting review by a manager."
                  : "All your requests have been reviewed."}
              </p>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Shared preview modal — read-only for submitters (canApprove is false) */}
      <RequestPreviewModal
        request={preview}
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        onActionComplete={() => setPreview(null)}
      />
    </>
  );
}
