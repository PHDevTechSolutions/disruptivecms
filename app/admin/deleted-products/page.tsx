"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Trash2,
  RotateCcw,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
  Package,
  X,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  writeBatch,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { logAuditEvent } from "@/lib/logger";
import { ProtectedLayout } from "@/components/layouts/protected-layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificationsDropdown } from "@/components/notifications/notifications-dropdown";

// ── RBAC ──────────────────────────────────────────────────────────────────────
import { useAuth } from "@/lib/useAuth";
import { hasAccess } from "@/lib/rbac";

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 20;
const LONG_PRESS_MS = 2000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDeletedAt(ts: any): string {
  if (!ts) return "—";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function getPaginationPages(currentPage: number, totalPages: number): number[] {
  const pages: number[] = [];
  for (
    let i = Math.max(1, currentPage - 2);
    i <= Math.min(totalPages, currentPage + 2);
    i++
  ) {
    pages.push(i);
  }
  return pages;
}

// ─── Long-press button ────────────────────────────────────────────────────────

function LongPressButton({
  onComplete,
  disabled,
  className,
  label,
  progressLabel,
}: {
  onComplete: () => void;
  disabled?: boolean;
  className?: string;
  label: React.ReactNode;
  progressLabel: (pct: number) => React.ReactNode;
}) {
  const [progress, setProgress] = useState(0);
  const [pressing, setPressing] = useState(false);
  const pressStart = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const tick = useCallback(() => {
    if (!pressStart.current) return;
    const elapsed = Date.now() - pressStart.current;
    const pct = Math.min((elapsed / LONG_PRESS_MS) * 100, 100);
    setProgress(pct);
    if (pct >= 100 && !firedRef.current) {
      firedRef.current = true;
      onComplete();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onComplete]);

  const start = useCallback(() => {
    if (disabled || firedRef.current) return;
    pressStart.current = Date.now();
    firedRef.current = false;
    setProgress(0);
    setPressing(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  const cancel = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    pressStart.current = null;
    setPressing(false);
    if (!firedRef.current) setProgress(0);
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return (
    <div className={cn("relative overflow-hidden rounded-none", className)}>
      <div
        className="absolute inset-0 bg-white/20 pointer-events-none origin-left"
        style={{ transform: `scaleX(${progress / 100})`, transition: "none" }}
      />
      <Button
        variant="destructive"
        size="sm"
        disabled={disabled}
        className="rounded-none relative select-none w-full"
        onMouseDown={start}
        onMouseUp={cancel}
        onMouseLeave={cancel}
        onTouchStart={(e) => {
          e.preventDefault();
          start();
        }}
        onTouchEnd={cancel}
        onTouchCancel={cancel}
      >
        {pressing ? progressLabel(Math.round(progress)) : label}
      </Button>
    </div>
  );
}

// ─── Restore dialog ───────────────────────────────────────────────────────────

function RestoreDialog({
  open,
  onOpenChange,
  item,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: any | null;
  onConfirm: (item: any) => Promise<void>;
}) {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const required = item?.itemDescription || item?.name || "";
  const isMatch = inputValue === required;

  useEffect(() => {
    if (!open) setInputValue("");
  }, [open]);

  const handleConfirm = async () => {
    if (!isMatch || !item) return;
    setIsLoading(true);
    try {
      await onConfirm(item);
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-none flex items-center justify-center shrink-0 bg-emerald-100 dark:bg-emerald-950/40">
              <RotateCcw className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold uppercase tracking-tight">
                Restore Product
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                This item will be moved back to the products collection.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 rounded-none bg-muted/50 border px-3 py-2.5">
            <div className="w-10 h-10 shrink-0 bg-background border rounded-none overflow-hidden flex items-center justify-center">
              {item?.mainImage ? (
                <img
                  src={item.mainImage}
                  alt={item.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <Package className="h-4 w-4 text-muted-foreground/40" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item?.name}</p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {item?.itemCode || "---"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Type{" "}
              <span className="font-bold text-foreground font-mono">
                {required}
              </span>{" "}
              to restore
            </Label>
            <Input
              autoFocus
              placeholder={required}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isMatch) handleConfirm();
              }}
              className={cn(
                "rounded-none font-mono text-sm transition-colors",
                inputValue.length > 0 &&
                  (isMatch ? "border-emerald-500" : "border-destructive/50"),
              )}
            />
            {inputValue.length > 0 && !isMatch && (
              <p className="text-[10px] text-destructive">
                Name doesn't match. Type exactly as shown.
              </p>
            )}
            {isMatch && (
              <p className="text-[10px] text-emerald-600 font-medium">
                ✓ Confirmed — ready to restore.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-none"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleConfirm}
            disabled={!isMatch || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Restore"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Permanent delete dialog ──────────────────────────────────────────────────

function PermanentDeleteDialog({
  open,
  onOpenChange,
  item,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: any | null;
  onConfirm: (item: any) => Promise<void>;
}) {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const required = item?.itemDescription || item?.name || "";
  const isMatch = inputValue === required;

  useEffect(() => {
    if (!open) setInputValue("");
  }, [open]);

  const handleConfirm = async () => {
    if (!isMatch || !item) return;
    setIsLoading(true);
    try {
      await onConfirm(item);
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-none flex items-center justify-center shrink-0 bg-destructive/10">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold uppercase tracking-tight">
                Permanently Delete
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                The item will be gone forever.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 rounded-none bg-muted/50 border px-3 py-2.5">
            <div className="w-10 h-10 shrink-0 bg-background border rounded-none overflow-hidden flex items-center justify-center">
              {item?.mainImage ? (
                <img
                  src={item.mainImage}
                  alt={item.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <Package className="h-4 w-4 text-muted-foreground/40" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item?.name}</p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {item?.itemCode || "---"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Type{" "}
              <span className="font-bold text-foreground font-mono">
                {required}
              </span>{" "}
              to permanently delete
            </Label>
            <Input
              autoFocus
              placeholder={required}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isMatch) handleConfirm();
              }}
              className={cn(
                "rounded-none font-mono text-sm transition-colors",
                inputValue.length > 0 &&
                  (isMatch ? "border-emerald-500" : "border-destructive/50"),
              )}
            />
            {inputValue.length > 0 && !isMatch && (
              <p className="text-[10px] text-destructive">
                Name doesn't match. Type exactly as shown.
              </p>
            )}
            {isMatch && (
              <p className="text-[10px] text-emerald-600 font-medium">
                ✓ Confirmed — this will be deleted permanently.
              </p>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-none bg-destructive/5 border border-destructive/20 px-3 py-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-[10px] text-destructive leading-relaxed">
              Permanent deletion cannot be reversed. This item will not be
              recoverable.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-none"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="rounded-none"
            onClick={handleConfirm}
            disabled={!isMatch || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Delete Forever"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk permanent delete dialog ────────────────────────────────────────────

function BulkPermanentDeleteDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  onConfirm: () => Promise<void>;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-none flex items-center justify-center shrink-0 bg-destructive/10">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold uppercase tracking-tight">
                Delete {count} Items Forever
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                These items will be permanently removed.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-none bg-muted/50 border px-3 py-3 space-y-1">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {count} items
              </span>{" "}
              will be permanently deleted from the recycle bin.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Hold the button below for 2 seconds to confirm.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-none bg-destructive/5 border border-destructive/20 px-3 py-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-[10px] text-destructive leading-relaxed">
              Permanent deletion cannot be reversed. These items will not be
              recoverable.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-none"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <LongPressButton
            onComplete={handleComplete}
            disabled={isLoading}
            className="min-w-[200px]"
            label={
              isLoading ? (
                <span className="animate-pulse">Deleting...</span>
              ) : (
                <>
                  <Trash2 className="mr-1.5 h-3 w-3" /> Hold to Delete {count}{" "}
                  Forever
                </>
              )
            }
            progressLabel={(pct) => (
              <>
                <Trash2 className="mr-1.5 h-3 w-3" /> Hold… {pct}%
              </>
            )}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RecycleBinPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [restoreTarget, setRestoreTarget] = useState<any>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<any>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkRestoring, setIsBulkRestoring] = useState(false);

  // ── RBAC ────────────────────────────────────────────────────────────────────
  const { user } = useAuth();

  // Only verify:products | verify:* | superadmin can restore or permanently delete.
  // PD Engineers (write only) reach this page only if routes are misconfigured —
  // the guard below stops them at the action level too.
  const canManageRecycleBin = hasAccess(user, "verify", "products");

  // ── Firestore listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "recycle_bin"),
      orderBy("deletedAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load recycle bin.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [searchQuery]);

  // ── Filtered + paginated data ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const name = (item.name ?? item.itemDescription ?? "").toLowerCase();
      const code = (
        item.itemCode ??
        item.litItemCode ??
        item.ecoItemCode ??
        ""
      ).toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [items, searchQuery]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = useMemo(
    () =>
      filtered.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
      ),
    [filtered, currentPage],
  );

  // ── Mutation handlers — all guarded by canManageRecycleBin ──────────────────

  const handleRestore = async (item: any) => {
    // RBAC guard: only verify:products or higher may restore
    if (!canManageRecycleBin) {
      toast.error("You don't have permission to restore products.");
      return;
    }

    const targetCollection = item.originalCollection || "products";
    const batch = writeBatch(db);
    const {
      id,
      deletedAt,
      deletedBy,
      originalCollection,
      originPage,
      ...originalData
    } = item;
    batch.set(doc(db, targetCollection, id), originalData);
    batch.delete(doc(db, "recycle_bin", id));
    await batch.commit();

    await logAuditEvent({
      action: "restore",
      entityType: targetCollection,
      entityId: id,
      entityName: item.name,
      context: {
        page: "/admin/deleted-products",
        source: "recycle-bin:restore",
        collection: targetCollection,
      },
    });

    toast.success(
      `"${item.name || item.itemDescription}" restored successfully.`,
    );
  };

  const handlePermanentDelete = async (item: any) => {
    // RBAC guard: only verify:products or higher may permanently delete
    if (!canManageRecycleBin) {
      toast.error("You don't have permission to permanently delete products.");
      return;
    }

    await deleteDoc(doc(db, "recycle_bin", item.id));

    await logAuditEvent({
      action: "delete",
      entityType: item.originalCollection || "products",
      entityId: item.id,
      entityName: item.name || item.itemDescription,
      context: {
        page: "/admin/deleted-products",
        source: "recycle-bin:permanent-delete",
        collection: "recycle_bin",
      },
    });

    toast.success(
      `"${item.name || item.itemDescription}" permanently deleted.`,
    );
  };

  const handleBulkRestore = async () => {
    // RBAC guard
    if (!canManageRecycleBin) {
      toast.error("You don't have permission to restore products.");
      return;
    }

    const selectedItems = items.filter((item) => selectedIds.has(item.id));
    if (selectedItems.length === 0) return;

    setIsBulkRestoring(true);
    try {
      const CHUNK_SIZE = 200;
      for (let i = 0; i < selectedItems.length; i += CHUNK_SIZE) {
        const chunk = selectedItems.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((item) => {
          const targetCollection = item.originalCollection || "products";
          const {
            id,
            deletedAt,
            deletedBy,
            originalCollection,
            originPage,
            ...originalData
          } = item;
          batch.set(doc(db, targetCollection, id), originalData);
          batch.delete(doc(db, "recycle_bin", id));
        });
        await batch.commit();
      }

      await logAuditEvent({
        action: "restore",
        entityType: "products",
        entityId: null,
        entityName: `${selectedItems.length} items`,
        context: {
          page: "/admin/deleted-products",
          source: "recycle-bin:bulk-restore",
          collection: "recycle_bin",
          bulk: true,
        },
        metadata: { ids: selectedItems.map((i) => i.id) },
      });

      toast.success(
        `${selectedItems.length} item${selectedItems.length !== 1 ? "s" : ""} restored successfully.`,
      );
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Bulk restore error:", error);
      toast.error("Failed to restore selected items.");
    } finally {
      setIsBulkRestoring(false);
    }
  };

  const handleBulkPermanentDelete = async () => {
    // RBAC guard
    if (!canManageRecycleBin) {
      toast.error("You don't have permission to permanently delete products.");
      return;
    }

    const batch = writeBatch(db);
    const ids: string[] = [];
    selectedIds.forEach((id) => {
      ids.push(id);
      batch.delete(doc(db, "recycle_bin", id));
    });
    await batch.commit();

    await logAuditEvent({
      action: "delete",
      entityType: "products",
      entityId: null,
      entityName: `${selectedIds.size} items`,
      context: {
        page: "/admin/deleted-products",
        source: "recycle-bin:bulk-permanent-delete",
        collection: "recycle_bin",
        bulk: true,
      },
      metadata: { ids },
    });

    toast.success(`${selectedIds.size} item(s) permanently deleted.`);
    setSelectedIds(new Set());
  };

  // ── Selection helpers ────────────────────────────────────────────────────────
  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginated.map((i) => i.id)));
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
     <TooltipProvider>
    <ProtectedLayout>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* ── Header ── */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admin">Admin</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Deleted Products</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2">
              <NotificationsDropdown />
            </div>
          </header>

          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold tracking-tight">
                  Recycle Bin
                </h1>
                <p className="text-xs text-muted-foreground">
                  {filtered.length} item{filtered.length !== 1 ? "s" : ""} in
                  bin
                </p>
              </div>
            </div>

            {/* ── Read-only banner for non-privileged users ── */}
            {!canManageRecycleBin && (
              <div className="flex items-start gap-3 rounded-none border border-amber-200 bg-amber-50 px-4 py-3 dark:bg-amber-950/20 dark:border-amber-900">
                <ShieldOff className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  You have read-only access to the recycle bin. Restoring or
                  permanently deleting items requires{" "}
                  <span className="font-semibold">verify:products</span>{" "}
                  permission.
                </p>
              </div>
            )}

            {/* ── Bulk toolbar — only shown when items are selected AND user can manage ── */}
            {selectedIds.size > 0 && canManageRecycleBin && (
              <div className="flex items-center gap-2 rounded-none border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {selectedIds.size}
                  </span>{" "}
                  selected
                </p>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-none text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                    onClick={handleBulkRestore}
                    disabled={isBulkRestoring}
                  >
                    {isBulkRestoring ? (
                      <span className="flex items-center gap-1 text-xs">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Restoring…
                      </span>
                    ) : (
                      <>
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Restore selected
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-none"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Clear
                  </Button>
                  <LongPressButton
                    onComplete={() => setBulkDeleteOpen(true)}
                    className="min-w-[180px]"
                    label={
                      <>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Hold to Delete{" "}
                        {selectedIds.size} Forever
                      </>
                    }
                    progressLabel={(pct) => (
                      <>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Hold… {pct}%
                      </>
                    )}
                  />
                </div>
              </div>
            )}

            {/* ── Search ── */}
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or item code..."
                className="pl-8 rounded-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* ── Info banner ── */}
            <div className="flex items-start gap-2 rounded-none bg-amber-50 border border-amber-200 px-4 py-3 dark:bg-amber-950/20 dark:border-amber-900">
              <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                Items in the recycle bin are soft-deleted and can be restored.
                {canManageRecycleBin
                  ? " To restore or permanently delete a single item, type the item's exact name to confirm. For bulk deletion, hold the button for 2 seconds."
                  : " Contact a PD Manager or Admin to restore or remove items."}
              </p>
            </div>

            {/* ── Table ── */}
            <div className="rounded-none border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Checkbox column only shown to users who can take action */}
                    {canManageRecycleBin && (
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            selectedIds.size === paginated.length &&
                            paginated.length > 0
                          }
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                    )}
                    <TableHead className="w-16">Image</TableHead>
                    <TableHead>Product Info</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Deleted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={canManageRecycleBin ? 7 : 6}
                        className="h-60 text-center"
                      >
                        <Loader2 className="animate-spin mx-auto h-8 w-8 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : paginated.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={canManageRecycleBin ? 7 : 6}
                        className="h-60 text-center"
                      >
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Trash2 className="h-8 w-8 opacity-20" />
                          <p className="text-sm">Recycle bin is empty</p>
                          <p className="text-xs opacity-60">
                            Deleted items will appear here
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((item) => (
                      <TableRow
                        key={item.id}
                        data-state={selectedIds.has(item.id) && "selected"}
                        className="opacity-75 hover:opacity-100 transition-opacity"
                      >
                        {canManageRecycleBin && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(item.id)}
                              onCheckedChange={() => toggleSelect(item.id)}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="w-12 h-12 bg-background rounded-none border overflow-hidden flex items-center justify-center grayscale">
                            {item.mainImage ? (
                              <img
                                src={item.mainImage}
                                alt={item.name}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <Package className="h-5 w-5 text-muted-foreground/30" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm font-medium leading-tight">
                              {item.itemDescription || item.name || "Unnamed"}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 rounded-none"
                              >
                                {Array.isArray(item.brands)
                                  ? item.brands.join(", ")
                                  : item.brand || "Generic"}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 rounded-none opacity-60"
                              >
                                {item.originalCollection || "products"}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono text-muted-foreground">
                            {item.litItemCode ||
                              item.ecoItemCode ||
                              item.itemCode ||
                              "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {item.originPage || "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {formatDeletedAt(item.deletedAt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {canManageRecycleBin ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-none h-8 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => setRestoreTarget(item)}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" /> Restore
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-none h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setPermanentDeleteTarget(item)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" /> Delete
                              </Button>
                            </div>
                          ) : (
                            // Read-only indicator for non-privileged users
                            <span className="text-[10px] text-muted-foreground italic">
                              read only
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* ── Pagination ── */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-between border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of{" "}
                  {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-none"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  {getPaginationPages(currentPage, totalPages).map((p) => (
                    <Button
                      key={p}
                      variant={currentPage === p ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8 rounded-none text-xs"
                      onClick={() => setCurrentPage(p)}
                    >
                      {p}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-none"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* ── Dialogs ── */}
      <RestoreDialog
        open={!!restoreTarget}
        onOpenChange={(v) => !v && setRestoreTarget(null)}
        item={restoreTarget}
        onConfirm={handleRestore}
      />
      <PermanentDeleteDialog
        open={!!permanentDeleteTarget}
        onOpenChange={(v) => !v && setPermanentDeleteTarget(null)}
        item={permanentDeleteTarget}
        onConfirm={handlePermanentDelete}
      />
      <BulkPermanentDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        count={selectedIds.size}
        onConfirm={handleBulkPermanentDelete}
      />
    </ProtectedLayout>
    </TooltipProvider>
  );
}
