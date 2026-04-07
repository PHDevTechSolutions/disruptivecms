"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Inbox,
  ClipboardList,
  ShieldOff,
  MessageSquare,
  AlertCircle,
  X,
} from "lucide-react";

import { MainLayout } from "@/components/layouts/MainLayout";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";

import { useAuth } from "@/lib/useAuth";
import { hasAccess } from "@/lib/rbac";
import {
  PendingRequest,
  RequestStatus,
  bulkApproveRequests,
} from "@/lib/requestService";
import { RequestPreviewModal } from "@/components/notifications/request-preview-modal";
import { ProtectedLayout } from "@/components/layouts/protected-layout";
import { NotificationsDropdown } from "@/components/notifications/notifications-dropdown";
import { useRemarksAction } from "@/lib/useRemarksAction";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  try {
    return format(ts.toDate(), "MMM d, yyyy · h:mm");
  } catch {
    return "—";
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-2.5 h-2.5" /> Pending
      </span>
    );
  if (status === "approved")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-2.5 h-2.5" /> Approved
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
      <XCircle className="w-2.5 h-2.5" /> Rejected
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    create: "bg-sky-50 text-sky-700 border-sky-200",
    update: "bg-violet-50 text-violet-700 border-violet-200",
    delete: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span
      className={`inline-flex text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${styles[type] ?? "bg-muted text-muted-foreground border-border"}`}
    >
      {type}
    </span>
  );
}

// ─── Bulk Approve Dialog ───────────────────────────────────────────────────────

function BulkApproveDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  onConfirm: (remarks: string) => Promise<void>;
}) {
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setRemarks("");
      setError(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!remarks.trim()) {
      setError(true);
      return;
    }
    setLoading(true);
    try {
      await onConfirm(remarks.trim());
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <DialogTitle className="text-base">Bulk Approve</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Approve{" "}
                <span className="font-semibold text-foreground">{count}</span>{" "}
                pending request{count !== 1 ? "s" : ""} at once.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" />
              Shared Remarks <span className="text-destructive">*</span>
            </label>
            <Textarea
              autoFocus
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value);
                if (e.target.value.trim()) setError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder="Enter approval remarks applied to all selected requests…"
              className={cn(
                "resize-none min-h-[80px] text-sm",
                error && "border-destructive focus-visible:ring-destructive/30",
              )}
              disabled={loading}
            />
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Remarks are required before approving.
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              This remark will be saved to all {count} selected request
              {count !== 1 ? "s" : ""}. Press Ctrl+Enter / ⌘+Enter to confirm.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className={cn(
              "gap-1.5",
              remarks.trim()
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-emerald-200 text-emerald-400 cursor-not-allowed",
            )}
            onClick={handleConfirm}
            disabled={loading || !remarks.trim()}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            {loading ? "Approving…" : `Approve ${count}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductRequestsPage() {
  const { user } = useAuth();

  const isVerifier = hasAccess(user, "verify", "products");
  const canWrite = hasAccess(user, "write", "products");
  const canAccess = isVerifier || canWrite;
  const reviewer = { uid: user?.uid ?? "", name: user?.name };

  const [allRequests, setAllRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PendingRequest | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">(
    "all",
  );
  const [page, setPage] = useState(0);

  // ── Bulk selection state ───────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);

  // ── Remarks-gated single approve/reject ──────────────────────────────────
  const { setRemarksTarget, RemarksDialog } = useRemarksAction({ reviewer });

  // ── Firestore listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!canAccess || !user) return;
    setLoading(true);

    const q = isVerifier
      ? query(collection(db, "requests"), orderBy("createdAt", "desc"))
      : query(collection(db, "requests"), where("requestedBy", "==", user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        let docs = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as PendingRequest,
        );
        if (!isVerifier) {
          docs = docs.sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() ?? 0) -
              (a.createdAt?.toMillis?.() ?? 0),
          );
        }
        setAllRequests(docs);
        setLoading(false);
      },
      (err) => {
        console.error("[ProductRequests]", err);
        toast.error("Failed to load requests");
        setLoading(false);
      },
    );

    return unsub;
  }, [canAccess, isVerifier, user]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allRequests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.id.toLowerCase().includes(q) ||
          (r.meta?.productName ?? "").toLowerCase().includes(q) ||
          (r.meta?.litItemCode ?? "").toLowerCase().includes(q) ||
          (r.meta?.ecoItemCode ?? "").toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          (r.requestedByName ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allRequests, statusFilter, search]);

  // Clear selection and reset page when filters change
  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [statusFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Pending rows on current page (for bulk selection)
  const pendingOnPage = paged.filter((r) => r.status === "pending");

  const pendingCount = allRequests.filter((r) => r.status === "pending").length;
  const approvedCount = allRequests.filter(
    (r) => r.status === "approved",
  ).length;
  const rejectedCount = allRequests.filter(
    (r) => r.status === "rejected",
  ).length;

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (
      pendingOnPage.length > 0 &&
      pendingOnPage.every((r) => selectedIds.has(r.id))
    ) {
      // Deselect all pending on page
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pendingOnPage.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      // Select all pending on page
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pendingOnPage.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const allPagePendingSelected =
    pendingOnPage.length > 0 &&
    pendingOnPage.every((r) => selectedIds.has(r.id));
  const somePendingSelected =
    pendingOnPage.some((r) => selectedIds.has(r.id)) && !allPagePendingSelected;

  // ── Bulk approve handler ──────────────────────────────────────────────────
  const handleBulkApprove = async (remarks: string) => {
    const ids = Array.from(selectedIds);
    const t = toast.loading(
      `Approving ${ids.length} request${ids.length !== 1 ? "s" : ""}…`,
    );
    try {
      const { succeeded, failed } = await bulkApproveRequests(
        ids,
        reviewer,
        remarks,
      );
      if (failed === 0) {
        toast.success(
          `${succeeded} request${succeeded !== 1 ? "s" : ""} approved.`,
          { id: t },
        );
      } else {
        toast.warning(`${succeeded} approved, ${failed} failed.`, { id: t });
      }
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err.message || "Bulk approval failed.", { id: t });
    }
  };

  // ── Access denied ─────────────────────────────────────────────────────────
  if (!canAccess) {
    return (
      <ProtectedLayout>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center space-y-2">
            <ShieldOff className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              You need{" "}
              <code className="text-xs bg-muted px-1 rounded">
                write:products
              </code>{" "}
              or{" "}
              <code className="text-xs bg-muted px-1 rounded">
                verify:products
              </code>{" "}
              to view this page.
            </p>
          </div>
        </div>
      </ProtectedLayout>
    );
  }

  // Number of columns in the table (used for colspan)
  const colCount = isVerifier ? 10 : 6; // +1 for checkbox column (verifier only)

  return (
    <ProtectedLayout>
      <MainLayout>
        <TooltipProvider delayDuration={0}>
          {/* Header */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <div className="flex items-center gap-2 flex-1">
              <Separator orientation="vertical" className="mr-2 h-4" />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink href="/products/all-products">
                        Products
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>Requests</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <div className="px-4">
                <NotificationsDropdown />
              </div>
            </header>

            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
              {/* Page title */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ClipboardList className="w-5 h-5 text-muted-foreground" />
                  <h1 className="text-xl font-semibold tracking-tight">
                    {isVerifier ? "Approval Requests" : "My Requests"}
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {isVerifier
                    ? "Review and manage pending write requests from your team."
                    : "Track the status of your submitted product change requests."}
                </p>

                {/* Read-only banner for submitters */}
                {!isVerifier && (
                  <div className="flex items-start gap-3 rounded-none border border-amber-200 bg-amber-50 px-4 py-3 mb-4 dark:bg-amber-950/20 dark:border-amber-900">
                    <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Showing your submitted requests. Approval or rejection is
                      handled by a PD Manager or Admin.
                    </p>
                  </div>
                )}

                {/* Stats */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {[
                    {
                      label: "Pending",
                      count: pendingCount,
                      color: "bg-amber-50 text-amber-700 border-amber-200",
                    },
                    {
                      label: "Approved",
                      count: approvedCount,
                      color:
                        "bg-emerald-50 text-emerald-700 border-emerald-200",
                    },
                    {
                      label: "Rejected",
                      count: rejectedCount,
                      color: "bg-rose-50 text-rose-700 border-rose-200",
                    },
                  ].map(({ label, count, color }) => (
                    <span
                      key={label}
                      className={`inline-flex items-center gap-1.5 border text-xs font-semibold px-2.5 py-1 rounded-full ${color}`}
                    >
                      {label} <span className="font-bold">{count}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* ── Bulk actions bar (verifiers only, when items selected) ── */}
              {isVerifier && selectedIds.size > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      {selectedIds.size} pending request
                      {selectedIds.size !== 1 ? "s" : ""} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs text-muted-foreground"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      <X className="w-3 h-3" /> Clear
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                      onClick={() => setBulkApproveOpen(true)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve {selectedIds.size}
                    </Button>
                  </div>
                </div>
              )}

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-48 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by product name or code…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(v) =>
                    setStatusFilter(v as RequestStatus | "all")
                  }
                >
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground ml-auto">
                  {filtered.length} request{filtered.length !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      {/* Checkbox column — verifiers only, selects pending rows */}
                      {isVerifier && (
                        <TableHead className="w-10">
                          <Checkbox
                            checked={
                              allPagePendingSelected
                                ? true
                                : somePendingSelected
                                  ? "indeterminate"
                                  : false
                            }
                            onCheckedChange={toggleSelectAll}
                            disabled={pendingOnPage.length === 0}
                            aria-label="Select all pending on page"
                          />
                        </TableHead>
                      )}
                      <TableHead className="text-[10px] font-bold uppercase">
                        Product
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Item Code
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Action
                      </TableHead>
                      {isVerifier && (
                        <TableHead className="text-[10px] font-bold uppercase">
                          Requested By
                        </TableHead>
                      )}
                      <TableHead className="text-[10px] font-bold uppercase">
                        Status
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Submitted
                      </TableHead>
                      {isVerifier && (
                        <>
                          <TableHead className="text-[10px] font-bold uppercase">
                            Reviewed By
                          </TableHead>
                          <TableHead className="text-[10px] font-bold uppercase">
                            Reviewed At
                          </TableHead>
                        </>
                      )}
                      <TableHead className="text-[10px] font-bold uppercase text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell
                          colSpan={colCount}
                          className="text-center py-12"
                        >
                          <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Loading requests…</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : paged.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={colCount}
                          className="text-center py-12"
                        >
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Inbox className="w-8 h-8 opacity-30" />
                            <span className="text-sm">No requests found</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      paged.map((req) => {
                        const isPending = req.status === "pending";
                        const canAct = isPending && isVerifier;
                        const isSelected = selectedIds.has(req.id);

                        const productName =
                          (req.meta?.productName as string) ||
                          req.resourceId ||
                          "—";
                        const itemCode =
                          (req.meta?.litItemCode as string) ||
                          (req.meta?.ecoItemCode as string) ||
                          "—";

                        return (
                          <TableRow
                            key={req.id}
                            data-state={isSelected && "selected"}
                            className={cn(
                              "cursor-pointer hover:bg-muted/30 transition-colors",
                              isSelected &&
                                "bg-emerald-50/40 dark:bg-emerald-950/10",
                            )}
                            onClick={() => setPreview(req)}
                          >
                            {/* Checkbox — only for pending rows when verifier */}
                            {isVerifier && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                {isPending && (
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleSelect(req.id)}
                                    aria-label={`Select request for ${productName}`}
                                  />
                                )}
                              </TableCell>
                            )}
                            <TableCell>
                              <p className="text-xs font-medium truncate max-w-[200px]">
                                {productName}
                              </p>
                            </TableCell>
                            <TableCell>
                              <p className="text-xs font-mono text-muted-foreground">
                                {itemCode}
                              </p>
                            </TableCell>
                            <TableCell>
                              <TypeBadge type={req.type} />
                            </TableCell>
                            {isVerifier && (
                              <TableCell>
                                <p className="text-xs">
                                  {req.requestedByName ||
                                    req.requestedBy ||
                                    "—"}
                                </p>
                              </TableCell>
                            )}
                            <TableCell>
                              <StatusBadge status={req.status} />
                            </TableCell>
                            <TableCell>
                              <p className="text-xs text-muted-foreground">
                                {formatTs(req.createdAt)}
                              </p>
                            </TableCell>
                            {isVerifier && (
                              <>
                                <TableCell>
                                  <p className="text-xs">
                                    {req.reviewedByName ||
                                      req.reviewedBy ||
                                      "—"}
                                  </p>
                                </TableCell>
                                <TableCell>
                                  <p className="text-xs text-muted-foreground">
                                    {formatTs(req.reviewedAt ?? null)}
                                  </p>
                                </TableCell>
                              </>
                            )}
                            <TableCell
                              className="text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-1">
                                {/* Preview */}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreview(req);
                                  }}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>

                                {/* Approve / Reject — verifiers only */}
                                {canAct && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[10px] gap-1 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRemarksTarget({
                                          request: req,
                                          action: "approve",
                                        });
                                      }}
                                    >
                                      <CheckCircle2 className="w-3 h-3" />{" "}
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[10px] gap-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRemarksTarget({
                                          request: req,
                                          action: "reject",
                                        });
                                      }}
                                    >
                                      <XCircle className="w-3 h-3" /> Reject
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between py-2">
                  <p className="text-xs text-muted-foreground">
                    Page {page + 1} of {totalPages} · {filtered.length} total
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="h-8 gap-1 text-xs"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages - 1, p + 1))
                      }
                      disabled={page >= totalPages - 1}
                      className="h-8 gap-1 text-xs"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
        </TooltipProvider>
      </MainLayout>

      <RequestPreviewModal
        request={preview}
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        onActionComplete={() => setPreview(null)}
      />

      {/* Single remarks-gated confirm dialog */}
      <RemarksDialog />

      {/* Bulk approve dialog */}
      <BulkApproveDialog
        open={bulkApproveOpen}
        onOpenChange={setBulkApproveOpen}
        count={selectedIds.size}
        onConfirm={handleBulkApprove}
      />
    </ProtectedLayout>
  );
}
