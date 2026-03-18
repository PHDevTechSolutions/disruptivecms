"use client";

/**
 * app/products/requests/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Product requests tracking page. Replaces /admin/requests for all PD roles.
 *
 * Access (enforced via scopeAccess, not just role):
 *   verify:products | verify:* | superadmin
 *     → sees ALL requests, inline Approve / Reject actions
 *   write:products (no verify) — e.g. pd_engineer
 *     → sees ONLY their own submitted requests, read-only, no actions
 *
 * Both modes use the same table + shared RequestPreviewModal.
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
  ChevronLeft,
  ChevronRight,
  Inbox,
  ClipboardList,
  ShieldOff,
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
  where,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";

import { useAuth } from "@/lib/useAuth";
import { hasAccess } from "@/lib/rbac";
import {
  PendingRequest,
  RequestStatus,
  approveRequest,
  rejectRequest,
} from "@/lib/requestService";
import { RequestPreviewModal } from "@/components/notifications/request-preview-modal";
import { ProtectedLayout } from "@/components/layouts/protected-layout";
import { NotificationsDropdown } from "@/components/notifications/notifications-dropdown";

const PAGE_SIZE = 20;

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
        <Clock className="w-2.5 h-2.5" />
        Pending
      </span>
    );
  if (status === "approved")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-2.5 h-2.5" />
        Approved
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
      <XCircle className="w-2.5 h-2.5" />
      Rejected
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

export default function ProductRequestsPage() {
  const { user } = useAuth();

  // Determine mode from scopeAccess — not role string
  const isVerifier = hasAccess(user, "verify", "products");
  const canWrite = hasAccess(user, "write", "products");

  // Only users with write:products or verify:products should be here
  const canAccess = isVerifier || canWrite;

  const [allRequests, setAllRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PendingRequest | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">(
    "all",
  );
  const [page, setPage] = useState(0);

  const reviewer = { uid: user?.uid ?? "", name: user?.name };

  // ── Firestore listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!canAccess || !user) return;

    setLoading(true);

    let q;
    if (isVerifier) {
      // Verifiers: all requests ordered by date
      q = query(collection(db, "requests"), orderBy("createdAt", "desc"));
    } else {
      // Submitters: only their own requests
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
        // Client-side sort for submitter query (avoids composite index requirement)
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
        console.error("[ProductRequests] Firestore error:", err);
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
        const hit =
          r.id.toLowerCase().includes(q) ||
          (r.meta?.productName ?? "").toLowerCase().includes(q) ||
          (r.meta?.litItemCode ?? "").toLowerCase().includes(q) ||
          (r.meta?.ecoItemCode ?? "").toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          (r.requestedByName ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [allRequests, statusFilter, search]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const pendingCount = allRequests.filter((r) => r.status === "pending").length;
  const approvedCount = allRequests.filter(
    (r) => r.status === "approved",
  ).length;
  const rejectedCount = allRequests.filter(
    (r) => r.status === "rejected",
  ).length;

  // ── Actions (verifiers only) ──────────────────────────────────────────────
  const handleApprove = async (req: PendingRequest) => {
    if (!isVerifier) return;
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
    if (!isVerifier) return;
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

  // ── Access denied (in-page guard for scopeAccess edge cases) ─────────────
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

  return (
    <ProtectedLayout>
      <TooltipProvider delayDuration={0}>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            {/* Header */}
            <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
              <div className="flex items-center gap-2 px-4 flex-1">
                <SidebarTrigger className="-ml-1" />
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
                          colSpan={isVerifier ? 9 : 6}
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
                          colSpan={isVerifier ? 9 : 6}
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
                        const canAct =
                          isPending && isVerifier && actionId !== req.id;
                        const isActing = actionId === req.id;

                        // Resolve display name from meta
                        const productName =
                          req.meta?.productName || req.resourceId || "—";
                        const itemCode =
                          req.meta?.litItemCode || req.meta?.ecoItemCode || "—";

                        return (
                          <TableRow
                            key={req.id}
                            className="cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => setPreview(req)}
                          >
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
                                {/* Preview — always visible */}
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

                                {/* Approve / Reject — verifiers only, pending only */}
                                {canAct && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[10px] gap-1 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleApprove(req);
                                      }}
                                      disabled={isActing}
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[10px] gap-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleReject(req);
                                      }}
                                      disabled={isActing}
                                    >
                                      <XCircle className="w-3 h-3" />
                                      Reject
                                    </Button>
                                  </>
                                )}

                                {isActing && (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
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
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>

      <RequestPreviewModal
        request={preview}
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        onActionComplete={() => setPreview(null)}
      />
    </ProtectedLayout>
  );
}
