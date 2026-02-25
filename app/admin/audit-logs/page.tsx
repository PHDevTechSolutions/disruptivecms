"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  limit,
} from "firebase/firestore";
import {
  Shield,
  Search,
  Activity,
  Clock,
  FileText,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Layers,
  Globe,
  Package,
  X,
  RefreshCw,
  Eye,
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
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditAction = "create" | "update" | "delete" | "restore";

interface AuditActor {
  uid?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  accessLevel?: string | null;
}

interface AuditContext {
  page?: string;
  source?: string;
  collection?: string;
  bulk?: boolean;
  [key: string]: unknown;
}

interface AuditLog {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  metadata?: Record<string, unknown> | null;
  context?: AuditContext | null;
  actor?: AuditActor | null;
  timestamp?: Timestamp | null;
}

const PAGE_SIZE = 15;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<
  AuditAction,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  create: {
    label: "Created",
    icon: <Plus className="h-3 w-3" />,
    color: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800",
  },
  update: {
    label: "Updated",
    icon: <Pencil className="h-3 w-3" />,
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800",
  },
  delete: {
    label: "Deleted",
    icon: <Trash2 className="h-3 w-3" />,
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800",
  },
  restore: {
    label: "Restored",
    icon: <RotateCcw className="h-3 w-3" />,
    color: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-50 border-violet-200 dark:bg-violet-950/40 dark:border-violet-800",
  },
};

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  product: <Package className="h-3.5 w-3.5" />,
  brand: <Layers className="h-3.5 w-3.5" />,
  application: <Globe className="h-3.5 w-3.5" />,
  category: <FileText className="h-3.5 w-3.5" />,
};

function formatTimestamp(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  }).format(ts.toDate());
}

function timeAgo(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - ts.toDate().getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarColor(str: string | null | undefined): string {
  if (!str) return "from-slate-400 to-slate-600";
  const colors = [
    "from-blue-400 to-blue-600",
    "from-violet-400 to-violet-600",
    "from-emerald-400 to-emerald-600",
    "from-amber-400 to-amber-600",
    "from-rose-400 to-rose-600",
    "from-cyan-400 to-cyan-600",
    "from-fuchsia-400 to-fuchsia-600",
    "from-teal-400 to-teal-600",
  ];
  const hash = str.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    creates: 0,
    updates: 0,
    deletes: 0,
    restores: 0,
  });

  // Live Firestore subscription
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "cms_audit_logs"),
      orderBy("timestamp", "desc"),
      limit(500),
    );
    const unsub = onSnapshot(q, (snap) => {
      const items: AuditLog[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AuditLog, "id">),
      }));
      setLogs(items);
      const s = {
        total: items.length,
        creates: 0,
        updates: 0,
        deletes: 0,
        restores: 0,
      };
      items.forEach((l) => {
        if (l.action === "create") s.creates++;
        else if (l.action === "update") s.updates++;
        else if (l.action === "delete") s.deletes++;
        else if (l.action === "restore") s.restores++;
      });
      setStats(s);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const isWithinDateRange = useCallback(
    (ts: Timestamp | null | undefined) => {
      if (filterDate === "all" || !ts) return true;
      const date = ts.toDate();
      const now = new Date();
      if (filterDate === "today")
        return date.toDateString() === now.toDateString();
      if (filterDate === "week")
        return date >= new Date(now.getTime() - 7 * 86400000);
      if (filterDate === "month")
        return date >= new Date(now.getTime() - 30 * 86400000);
      return true;
    },
    [filterDate],
  );

  const filtered = logs.filter((log) => {
    if (filterAction !== "all" && log.action !== filterAction) return false;
    if (filterEntity !== "all" && log.entityType !== filterEntity) return false;
    if (!isWithinDateRange(log.timestamp)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        log.entityName?.toLowerCase().includes(q) ||
        log.entityId?.toLowerCase().includes(q) ||
        log.actor?.name?.toLowerCase().includes(q) ||
        log.actor?.email?.toLowerCase().includes(q) ||
        log.actor?.role?.toLowerCase().includes(q) ||
        log.context?.page?.toLowerCase().includes(q) ||
        log.entityType?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const entityTypes = [
    ...new Set(logs.map((l) => l.entityType).filter(Boolean)),
  ];

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterAction, filterEntity, filterDate]);

  const clearFilters = () => {
    setSearch("");
    setFilterAction("all");
    setFilterEntity("all");
    setFilterDate("all");
  };

  const hasFilters =
    !!search ||
    filterAction !== "all" ||
    filterEntity !== "all" ||
    filterDate !== "all";

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* ── Header — identical pattern to blogs page ── */}
          <header className="flex h-16 shrink-0 items-center border-b bg-background px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-3 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Settings</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Audit Logs</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          {/* ── Main content — identical padding to blogs page ── */}
          <main className="p-6 md:p-10 space-y-6">
            {/* Page heading */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Audit Logs
                </h2>
                <p className="text-sm text-muted-foreground">
                  Real-time activity trail —{" "}
                  {loading ? (
                    "Loading..."
                  ) : (
                    <>
                      <span className="font-semibold text-foreground">
                        {filtered.length}
                      </span>{" "}
                      events
                    </>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                {
                  label: "Total Events",
                  value: stats.total,
                  icon: <Activity className="h-4 w-4" />,
                  color: "text-foreground",
                  bg: "bg-muted/50 border",
                },
                {
                  label: "Created",
                  value: stats.creates,
                  icon: <Plus className="h-4 w-4" />,
                  color: ACTION_CONFIG.create.color,
                  bg: ACTION_CONFIG.create.bg,
                },
                {
                  label: "Updated",
                  value: stats.updates,
                  icon: <Pencil className="h-4 w-4" />,
                  color: ACTION_CONFIG.update.color,
                  bg: ACTION_CONFIG.update.bg,
                },
                {
                  label: "Deleted",
                  value: stats.deletes,
                  icon: <Trash2 className="h-4 w-4" />,
                  color: ACTION_CONFIG.delete.color,
                  bg: ACTION_CONFIG.delete.bg,
                },
                {
                  label: "Restored",
                  value: stats.restores,
                  icon: <RotateCcw className="h-4 w-4" />,
                  color: ACTION_CONFIG.restore.color,
                  bg: ACTION_CONFIG.restore.bg,
                },
              ].map((stat) => (
                <Card key={stat.label} className={cn("border", stat.bg)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn("text-xs font-medium", stat.color)}>
                        {stat.label}
                      </span>
                      <span className={cn(stat.color)}>{stat.icon}</span>
                    </div>
                    <p
                      className={cn(
                        "text-2xl font-bold tabular-nums",
                        stat.color,
                      )}
                    >
                      {loading ? "—" : stat.value.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Filter bar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9 h-9 text-sm"
                      placeholder="Search by name, user, page, entity..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <Select value={filterAction} onValueChange={setFilterAction}>
                    <SelectTrigger className="h-9 w-[140px] text-xs">
                      <SelectValue placeholder="Action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      <SelectItem value="create">Created</SelectItem>
                      <SelectItem value="update">Updated</SelectItem>
                      <SelectItem value="delete">Deleted</SelectItem>
                      <SelectItem value="restore">Restored</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterEntity} onValueChange={setFilterEntity}>
                    <SelectTrigger className="h-9 w-[150px] text-xs">
                      <SelectValue placeholder="Entity Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Entities</SelectItem>
                      {entityTypes.map((e) => (
                        <SelectItem key={e} value={e} className="capitalize">
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterDate} onValueChange={setFilterDate}>
                    <SelectTrigger className="h-9 w-[140px] text-xs">
                      <SelectValue placeholder="Date Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">Last 7 Days</SelectItem>
                      <SelectItem value="month">Last 30 Days</SelectItem>
                    </SelectContent>
                  </Select>

                  {hasFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 gap-2 text-xs text-muted-foreground"
                      onClick={clearFilters}
                    >
                      <X className="h-3.5 w-3.5" />
                      Clear filters
                    </Button>
                  )}

                  <span className="ml-auto text-xs text-muted-foreground">
                    {loading ? "Loading..." : `${filtered.length} events`}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[180px]">
                          User
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[110px]">
                          Action
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Entity
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[160px]">
                          Source Page
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[160px]">
                          Timestamp
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[60px]">
                          Detail
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {loading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            {Array.from({ length: 6 }).map((_, j) => (
                              <td key={j} className="px-4 py-3">
                                <div className="h-4 bg-muted rounded w-full" />
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : paginated.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-16">
                            <div className="flex flex-col items-center gap-3 text-muted-foreground">
                              <Shield className="h-10 w-10 opacity-20" />
                              <p className="text-sm font-medium">
                                No audit logs found
                              </p>
                              {hasFilters && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={clearFilters}
                                  className="text-xs"
                                >
                                  Clear filters
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginated.map((log) => {
                          const action =
                            ACTION_CONFIG[log.action] ?? ACTION_CONFIG.update;
                          return (
                            <tr
                              key={log.id}
                              className="hover:bg-muted/30 transition-colors"
                            >
                              {/* Actor */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={cn(
                                      "w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold",
                                      avatarColor(
                                        log.actor?.name || log.actor?.email || log.actor?.role
                                      ),
                                    )}
                                  >
                                    {getInitials(
                                      log.actor?.name || log.actor?.email || log.actor?.role
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold truncate leading-tight">
                                      {log.actor?.name || "Unknown"}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground truncate leading-tight">
                                      {log.actor?.email ||
                                        "—"}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground truncate leading-tight">
                                      {log.actor?.role || "—"}
                                    </p>
                                  </div>
                                </div>
                              </td>

                              {/* Action */}
                              <td className="px-4 py-3">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "gap-1 text-[11px] font-semibold border",
                                    action.bg,
                                    action.color,
                                  )}
                                >
                                  {action.icon}
                                  {action.label}
                                </Badge>
                              </td>

                              {/* Entity */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">
                                    {ENTITY_ICONS[log.entityType] ?? (
                                      <FileText className="h-3.5 w-3.5" />
                                    )}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium truncate max-w-[200px]">
                                      {log.entityName || "—"}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground capitalize">
                                      {log.entityType}
                                      {log.entityId && (
                                        <span className="ml-1 font-mono opacity-50">
                                          #{log.entityId.slice(-6)}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </td>

                              {/* Source */}
                              <td className="px-4 py-3">
                                <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                                  {log.context?.page || "—"}
                                </p>
                              </td>

                              {/* Timestamp */}
                              <td className="px-4 py-3">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="cursor-default">
                                      <p className="text-xs font-medium">
                                        {timeAgo(log.timestamp)}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground">
                                        {formatTimestamp(log.timestamp)}
                                      </p>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">
                                      {formatTimestamp(log.timestamp)}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </td>

                              {/* Detail */}
                              <td className="px-4 py-3 text-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setSelectedLog(log)}
                                >
                                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {!loading && filtered.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                    <p className="text-xs text-muted-foreground">
                      Showing{" "}
                      <span className="font-medium text-foreground">
                        {(currentPage - 1) * PAGE_SIZE + 1}–
                        {Math.min(currentPage * PAGE_SIZE, filtered.length)}
                      </span>{" "}
                      of{" "}
                      <span className="font-medium text-foreground">
                        {filtered.length}
                      </span>{" "}
                      events
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          let page: number;
                          if (totalPages <= 5) page = i + 1;
                          else if (currentPage <= 3) page = i + 1;
                          else if (currentPage >= totalPages - 2)
                            page = totalPages - 4 + i;
                          else page = currentPage - 2 + i;
                          return (
                            <Button
                              key={page}
                              variant={
                                currentPage === page ? "default" : "outline"
                              }
                              size="icon"
                              className="h-7 w-7 text-xs"
                              onClick={() => setCurrentPage(page)}
                            >
                              {page}
                            </Button>
                          );
                        },
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
      </SidebarProvider>

      {/* Detail Dialog — outside SidebarProvider so it renders over everything */}
      {selectedLog && (
        <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-primary" />
                Audit Log Detail
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {(() => {
                const cfg =
                  ACTION_CONFIG[selectedLog.action] ?? ACTION_CONFIG.update;
                return (
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1 text-xs font-semibold border",
                      cfg.bg,
                      cfg.color,
                    )}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </Badge>
                );
              })()}

              {/* Actor */}
              <div className="p-3 rounded-lg bg-muted/40 border space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Actor
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold",
                      avatarColor(
                        selectedLog.actor?.name || selectedLog.actor?.email,
                      ),
                    )}
                  >
                    {getInitials(
                      selectedLog.actor?.name || selectedLog.actor?.email,
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {selectedLog.actor?.name || "Unknown User"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedLog.actor?.email || "No email"}
                    </p>
                    {selectedLog.actor?.role && (
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {selectedLog.actor.role}
                        {selectedLog.actor.accessLevel &&
                          ` · Level ${selectedLog.actor.accessLevel}`}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Entity */}
              <div className="p-3 rounded-lg bg-muted/40 border space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Entity
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Type</p>
                    <p className="font-medium capitalize">
                      {selectedLog.entityType || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">ID</p>
                    <p className="font-mono text-xs">
                      {selectedLog.entityId || "—"}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-muted-foreground">Name</p>
                    <p className="font-medium">
                      {selectedLog.entityName || "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Context */}
              {selectedLog.context && (
                <div className="p-3 rounded-lg bg-muted/40 border space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Context
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {selectedLog.context.page && (
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Page
                        </p>
                        <p className="text-xs font-medium">
                          {selectedLog.context.page}
                        </p>
                      </div>
                    )}
                    {selectedLog.context.source && (
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Source
                        </p>
                        <p className="text-xs font-medium">
                          {selectedLog.context.source}
                        </p>
                      </div>
                    )}
                    {selectedLog.context.collection && (
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Collection
                        </p>
                        <p className="text-xs font-mono">
                          {selectedLog.context.collection}
                        </p>
                      </div>
                    )}
                    {selectedLog.context.bulk && (
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Bulk Action
                        </p>
                        <p className="text-xs font-medium">Yes</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Timestamp */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatTimestamp(selectedLog.timestamp)}
              </div>

              {/* Raw metadata */}
              {selectedLog.metadata &&
                Object.keys(selectedLog.metadata).length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none">
                      Raw Metadata ▸
                    </summary>
                    <pre className="mt-2 p-3 bg-muted/60 border rounded-lg text-[10px] overflow-x-auto">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </details>
                )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </TooltipProvider>
  );
}
