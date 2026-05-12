"use client";

/**
 * app/admin/requests/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full request management page.
 * Access: users with verify:<resource>, verify:*, or superadmin.
 *
 * Features:
 *  - Real-time Firestore listener (all statuses)
 *  - Status / resource / date-range filters
 *  - Cursor-based pagination
 *  - Preview modal (reuses RequestPreviewModal)
 *  - Inline Approve / Reject for pending rows
 * ─────────────────────────────────────────────────────────────────────────────
 */

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
  Filter,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Inbox,
  ClipboardList,
} from "lucide-react";

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
  startAfter,
  endBefore,
  limitToLast,
  getDocs,
  DocumentSnapshot,
  Timestamp,
} from "@/lib/firestore/client";

import { useAuth } from "@/lib/useAuth";
import { canSeeNotifications, hasAccess } from "@/lib/rbac";
import {
  PendingRequest,
  RequestStatus,
  approveRequest,
  rejectRequest,
} from "@/lib/requestService";
import { RequestPreviewModal } from "@/components/notifications/request-preview-modal";
import { ProtectedLayout } from "@/components/layouts/protected-layout";
import { NotificationsDropdown } from "@/components/notifications/notifications-dropdown";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

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
      <Badge className="bg-amber-50 text-amber-700 border-amber-200 border gap-1 text-[10px] font-semibold">
        <Clock className="w-2.5 h-2.5" />
        Pending
      </Badge>
    );
  if (status === "approved")
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border gap-1 text-[10px] font-semibold">
        <CheckCircle2 className="w-2.5 h-2.5" />
        Approved
      </Badge>
    );
  return (
    <Badge className="bg-rose-50 text-rose-700 border-rose-200 border gap-1 text-[10px] font-semibold">
      <XCircle className="w-2.5 h-2.5" />
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
      className={`border text-[10px] font-semibold ${styles[type] ?? "bg-muted text-muted-foreground"}`}
    >
      {type}
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const { user } = useAuth();

  // ── Filters ───────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">(
    "all",
  );
  const [resourceFilter, setResourceFilter] = useState("all");
  const [search, setSearch] = useState("");

  // ── All requests (real-time) ──────────────────────────────────────────────
  const [allRequests, setAllRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(0);

  // ── Preview modal ─────────────────────────────────────────────────────────
  const [preview, setPreview] = useState<PendingRequest | null>(null);

  // ── Row action states ─────────────────────────────────────────────────────
  const [actionId, setActionId] = useState<string | null>(null);

  const reviewer = { uid: user?.uid ?? "", name: user?.name };

  // Access guard
  const canSee = canSeeNotifications(user);

  // ── Firestore listener (all requests, client-filtered) ────────────────────
  useEffect(() => {
    if (!canSee) return;

    setLoading(true);
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setAllRequests(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PendingRequest),
        );
        setLoading(false);
      },
      (err) => {
        console.error("[Requests] Firestore error:", err);
        toast.error("Failed to load requests");
        setLoading(false);
      },
    );

    return unsub;
  }, [canSee]);

  // ── Collect unique resources for filter dropdown ──────────────────────────
  const resourceOptions = useMemo(() => {
    const set = new Set(allRequests.map((r) => r.resource));
    return Array.from(set).sort();
  }, [allRequests]);

  // ── Apply filters ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allRequests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (resourceFilter !== "all" && r.resource !== resourceFilter)
        return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          r.id.toLowerCase().includes(q) ||
          r.resource.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          (r.requestedByName || "").toLowerCase().includes(q) ||
          (r.requestedBy || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [allRequests, statusFilter, resourceFilter, search]);

  // Reset to page 0 on filter change
  useEffect(() => {
    setPage(0);
  }, [statusFilter, resourceFilter, search]);

  // ── Paginate ──────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Approve / Reject handlers ─────────────────────────────────────────────
  const handleApprove = async (req: PendingRequest) => {
    setActionId(req.id);
    const t = toast.loading("Approving…");
    try {
      await approveRequest(req.id, reviewer);
      toast.success("Approved and executed.", { id: t });
    } catch (err: any) {
      toast.error(err.message || "Approval failed.", { id: t });
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (req: PendingRequest) => {
    setActionId(req.id);
    const t = toast.loading("Rejecting…");
    try {
      await rejectRequest(req.id, reviewer);
      toast.success("Request rejected.", { id: t });
    } catch (err: any) {
      toast.error(err.message || "Rejection failed.", { id: t });
    } finally {
      setActionId(null);
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const pendingCount = allRequests.filter((r) => r.status === "pending").length;
  const approvedCount = allRequests.filter(
    (r) => r.status === "approved",
  ).length;
  const rejectedCount = allRequests.filter(
    (r) => r.status === "rejected",
  ).length;

  // ── Access denied fallback ────────────────────────────────────────────────
  if (!loading && !canSee) {
    return (
      <ProtectedLayout>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground text-sm">
            Access denied. You do not have permission to view this page.
          </p>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <TooltipProvider delayDuration={0}>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            {/* ── Header ── */}
            <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
              <div className="flex items-center gap-2 px-4 flex-1">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink href="#">Admin</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>Requests</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              {/* Notifications bell */}
              <div className="px-4">
                <NotificationsDropdown />
              </div>
            </header>

            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
              {/* ── Page title + stats ── */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ClipboardList className="w-5 h-5 text-muted-foreground" />
                  <h1 className="text-xl font-semibold tracking-tight">
                    Approval Requests
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Review and manage pending write requests from your team.
                </p>

                {/* Stat pills */}
                <div className="flex flex-wrap gap-2">
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
                      {label}
                      <span className="font-bold">{count}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* ── Toolbar: filters + search ── */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative flex-1 min-w-45 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search requests…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>

                {/* Status filter */}
                <Select
                  value={statusFilter}
                  onValueChange={(v) =>
                    setStatusFilter(v as RequestStatus | "all")
                  }
                >
                  <SelectTrigger className="h-8 w-32.5 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>

                {/* Resource filter */}
                <Select
                  value={resourceFilter}
                  onValueChange={setResourceFilter}
                >
                  <SelectTrigger className="h-8 w-35 text-xs">
                    <SelectValue placeholder="Resource" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Resources</SelectItem>
                    {resourceOptions.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Reset */}
                {(statusFilter !== "all" ||
                  resourceFilter !== "all" ||
                  search) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-muted-foreground"
                    onClick={() => {
                      setStatusFilter("all");
                      setResourceFilter("all");
                      setSearch("");
                    }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </Button>
                )}

                <span className="ml-auto text-xs text-muted-foreground">
                  {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* ── Table ── */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-[10px] font-bold uppercase w-22.5">
                        ID
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Resource
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Type
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Requested By
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Status
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Created At
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Reviewed By
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Reviewed At
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12">
                          <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Loading requests…</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : paged.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Inbox className="w-8 h-8 opacity-30" />
                            <span className="text-sm">No requests found</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      paged.map((req) => {
                        const isPending = req.status === "pending";
                        const canAct =
                          isPending &&
                          !!user &&
                          hasAccess(user, "verify", req.resource);
                        const busy = actionId === req.id;

                        return (
                          <TableRow
                            key={req.id}
                            className={isPending ? "bg-amber-50/30" : ""}
                          >
                            {/* ID */}
                            <TableCell className="font-mono text-[10px] text-muted-foreground max-w-22.5 truncate">
                              {req.id.slice(0, 8)}…
                            </TableCell>
                            {/* Resource */}
                            <TableCell className="text-xs font-semibold capitalize">
                              {req.resource}
                            </TableCell>
                            {/* Type */}
                            <TableCell>
                              <TypeBadge type={req.type} />
                            </TableCell>
                            {/* Requested by */}
                            <TableCell className="text-xs">
                              {req.requestedByName || req.requestedBy}
                            </TableCell>
                            {/* Status */}
                            <TableCell>
                              <StatusBadge status={req.status} />
                            </TableCell>
                            {/* Created at */}
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatTs(req.createdAt)}
                            </TableCell>
                            {/* Reviewed by */}
                            <TableCell className="text-xs text-muted-foreground">
                              {req.reviewedByName || req.reviewedBy || "—"}
                            </TableCell>
                            {/* Reviewed at */}
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatTs(req.reviewedAt ?? null)}
                            </TableCell>
                            {/* Actions */}
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {/* Preview */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => setPreview(req)}
                                  disabled={busy}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>

                                {canAct && (
                                  <>
                                    <Button
                                      size="sm"
                                      className="h-7 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                      onClick={() => handleApprove(req)}
                                      disabled={busy}
                                    >
                                      {busy ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="w-3 h-3" />
                                      )}
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[10px] border-rose-200 text-rose-600 hover:bg-rose-50 gap-1"
                                      onClick={() => handleReject(req)}
                                      disabled={busy}
                                    >
                                      {busy ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <XCircle className="w-3 h-3" />
                                      )}
                                      Reject
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

              {/* ── Pagination ── */}
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
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Previous
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
                      Next
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>

      {/* Shared preview modal */}
      <RequestPreviewModal
        request={preview}
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
      />
    </ProtectedLayout>
  );
}
