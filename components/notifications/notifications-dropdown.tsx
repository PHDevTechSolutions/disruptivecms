"use client";

/**
 * components/notifications/notifications-dropdown.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Global header notifications bell.
 *
 * Visibility: only rendered when the user has verify:<resource> or superadmin.
 * Data:       real-time Firestore onSnapshot on requests where status=="pending"
 * Actions:    Approve / Reject (inline) + Preview (opens RequestPreviewModal)
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

// ─── Product label resolver ───────────────────────────────────────────────────
// Resolves the best display name from a request — uses canonical product schema
// fields stored in meta (populated by createRequest / resolveProductMeta).

function getRequestDisplayName(req: PendingRequest): string {
  const meta = req.meta ?? {};

  // meta.productName is always set for product requests (resolveProductName:
  // itemDescription → name → itemCode).
  if (meta.productName) return meta.productName;

  // Fallback: try to pull directly from payload for legacy requests that
  // predate meta enrichment.
  const payload = req.payload ?? {};
  const doc =
    payload.after ?? // update request
    payload.productSnapshot ?? // delete request
    payload; // create request (flat)

  return (
    doc?.itemDescription || doc?.name || doc?.itemCode || req.resourceId || "—"
  );
}

function getRequestSubtitle(req: PendingRequest): string | null {
  const meta = req.meta ?? {};

  // Show LIT / ECO item codes as subtitle when available.
  const parts: string[] = [];
  if (meta.litItemCode) parts.push(meta.litItemCode);
  if (meta.ecoItemCode && meta.ecoItemCode !== meta.litItemCode)
    parts.push(meta.ecoItemCode);
  if (meta.productFamily) parts.push(meta.productFamily);

  return parts.length > 0 ? parts.join(" · ") : null;
}

// ─── Single notification row ──────────────────────────────────────────────────

function NotificationItem({
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

  const busy = approving || rejecting;
  const displayName = getRequestDisplayName(req);
  const subtitle = getRequestSubtitle(req);

  return (
    <div className="group flex flex-col gap-1.5 px-3 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0">
      {/* Top row: resource chip + type chip + timestamp */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold capitalize text-muted-foreground">
            <Package className="w-3 h-3 shrink-0" />
            {req.resource}
          </span>
          <TypeChip type={req.type} />
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
          {relativeTime(req.createdAt)}
        </span>
      </div>

      {/* Product identity */}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground truncate leading-snug">
          {displayName}
        </p>
        {subtitle && (
          <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
            {subtitle}
          </p>
        )}
      </div>

      {/* Requested by */}
      <p className="text-[11px] text-muted-foreground">
        By{" "}
        <span className="font-medium text-foreground">
          {req.requestedByName || req.requestedBy}
        </span>
      </p>

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-0.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => onPreview(req)}
          disabled={busy}
        >
          <Eye className="w-3 h-3" />
          Preview
        </Button>
        <Button
          size="sm"
          className="h-6 px-2 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
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
  );
}

// ─── Main dropdown ────────────────────────────────────────────────────────────

export function NotificationsDropdown() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [preview, setPreview] = useState<PendingRequest | null>(null);
  const [open, setOpen] = useState(false);

  const visible = canSeeNotifications(user);

  useEffect(() => {
    if (!visible) return;

    const q = query(
      collection(db, "requests"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setRequests(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PendingRequest),
        );
      },
      (err) => {
        console.error("[Notifications] Firestore error:", err);
      },
    );

    return unsub;
  }, [visible]);

  if (!visible) return null;

  const count = requests.length;
  const reviewer = { uid: user?.uid ?? "", name: user?.name };

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
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-bold px-1 leading-none">
                {count > 99 ? "99+" : count}
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
                Pending Approvals
              </DropdownMenuLabel>
            </div>
            {count > 0 && (
              <Badge
                variant="secondary"
                className="text-[10px] font-bold h-5 px-1.5"
              >
                {count}
              </Badge>
            )}
          </div>

          <DropdownMenuSeparator className="m-0" />

          {/* Content */}
          {count === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Inbox className="w-8 h-8 opacity-30" />
              <p className="text-xs">No pending requests</p>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              {requests.map((req) => (
                <NotificationItem
                  key={req.id}
                  req={req}
                  reviewer={reviewer}
                  onPreview={(r) => {
                    setPreview(r);
                    setOpen(false);
                  }}
                />
              ))}
            </ScrollArea>
          )}

          {/* Footer link */}
          {count > 0 && (
            <>
              <DropdownMenuSeparator className="m-0" />
              <div className="px-3 py-2">
                <a
                  href="/admin/requests"
                  className="text-[11px] text-primary hover:underline"
                >
                  View all requests →
                </a>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Shared preview modal */}
      <RequestPreviewModal
        request={preview}
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        onActionComplete={() => setPreview(null)}
      />
    </>
  );
}
