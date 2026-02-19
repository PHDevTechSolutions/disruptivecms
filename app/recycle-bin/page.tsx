"use client";

import * as React from "react";
import { useEffect, useState, useMemo } from "react";
import {
  Trash2,
  RotateCcw,
  Search,
  Package,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Clock,
  X,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  deleteDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

const ITEMS_PER_PAGE = 10;

// ── Restore Confirmation Dialog ───────────────────────────────────────────────
interface RestoreDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: any;
  onConfirm: () => Promise<void>;
}

function RestoreDialog({ open, onOpenChange, item, onConfirm }: RestoreDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const required = item?.name ?? "";
  const isMatch = inputValue === required;

  useEffect(() => {
    if (!open) {
      setInputValue("");
      setIsLoading(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!isMatch) return;
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
            <div className="h-10 w-10 rounded-none bg-emerald-500/10 flex items-center justify-center shrink-0">
              <RotateCcw className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold uppercase tracking-tight">
                Restore Item
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                This item will be restored to its original location.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Item preview */}
          <div className="flex items-center gap-3 rounded-none bg-muted/50 border px-3 py-2.5">
            <div className="w-10 h-10 shrink-0 bg-background border rounded-none overflow-hidden flex items-center justify-center">
              {item?.mainImage ? (
                <img src={item.mainImage} alt={item.name} className="w-full h-full object-contain" />
              ) : (
                <Package className="h-4 w-4 text-muted-foreground/40" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item?.name}</p>
              <p className="text-[11px] text-muted-foreground font-mono">{item?.itemCode || "---"}</p>
            </div>
          </div>

          {/* Confirmation input */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Type{" "}
              <span className="font-bold text-foreground font-mono">{required}</span>{" "}
              to restore
            </Label>
            <Input
              autoFocus
              placeholder={required}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && isMatch) handleConfirm(); }}
              className={cn(
                "rounded-none font-mono text-sm transition-colors",
                inputValue.length > 0 && (
                  isMatch
                    ? "border-emerald-500 focus-visible:ring-emerald-500/20"
                    : "border-destructive/50 focus-visible:ring-destructive/20"
                ),
              )}
            />
            {inputValue.length > 0 && !isMatch && (
              <p className="text-[10px] text-destructive">Name doesn't match. Type exactly as shown.</p>
            )}
            {isMatch && (
              <p className="text-[10px] text-emerald-600 font-medium">✓ Confirmed — ready to restore.</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" className="rounded-none" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleConfirm}
            disabled={!isMatch || isLoading}
          >
            {isLoading ? <span className="animate-pulse">Restoring...</span> : (
              <><RotateCcw className="mr-1.5 h-3 w-3" /> Restore Item</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Permanent Delete Dialog ───────────────────────────────────────────────────
interface PermanentDeleteDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: any;
  onConfirm: () => Promise<void>;
}

function PermanentDeleteDialog({ open, onOpenChange, item, onConfirm }: PermanentDeleteDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const required = item?.name ?? "";
  const isMatch = inputValue === required;

  useEffect(() => {
    if (!open) {
      setInputValue("");
      setIsLoading(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!isMatch) return;
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
            <div className="h-10 w-10 rounded-none bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold uppercase tracking-tight">
                Permanently Delete
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                This cannot be undone. The item will be gone forever.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 rounded-none bg-muted/50 border px-3 py-2.5">
            <div className="w-10 h-10 shrink-0 bg-background border rounded-none overflow-hidden flex items-center justify-center">
              {item?.mainImage ? (
                <img src={item.mainImage} alt={item.name} className="w-full h-full object-contain" />
              ) : (
                <Package className="h-4 w-4 text-muted-foreground/40" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item?.name}</p>
              <p className="text-[11px] text-muted-foreground font-mono">{item?.itemCode || "---"}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Type{" "}
              <span className="font-bold text-foreground font-mono">{required}</span>{" "}
              to permanently delete
            </Label>
            <Input
              autoFocus
              placeholder={required}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && isMatch) handleConfirm(); }}
              className={cn(
                "rounded-none font-mono text-sm transition-colors",
                inputValue.length > 0 && (
                  isMatch
                    ? "border-emerald-500 focus-visible:ring-emerald-500/20"
                    : "border-destructive/50 focus-visible:ring-destructive/20"
                ),
              )}
            />
            {inputValue.length > 0 && !isMatch && (
              <p className="text-[10px] text-destructive">Name doesn't match. Type exactly as shown.</p>
            )}
            {isMatch && (
              <p className="text-[10px] text-emerald-600 font-medium">✓ Confirmed — this will be deleted permanently.</p>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-none bg-destructive/5 border border-destructive/20 px-3 py-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-[10px] text-destructive leading-relaxed">
              Permanent deletion cannot be reversed. This item will not be recoverable.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" className="rounded-none" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="rounded-none"
            onClick={handleConfirm}
            disabled={!isMatch || isLoading}
          >
            {isLoading ? <span className="animate-pulse">Deleting...</span> : (
              <><Trash2 className="mr-1.5 h-3 w-3" /> Delete Forever</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Recycle Bin Page ─────────────────────────────────────────────────────
export default function RecycleBinPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Dialog states
  const [restoreTarget, setRestoreTarget] = useState<any>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<any>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // ── Fetch deleted items ─────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "recycle_bin"),
      orderBy("deletedAt", "desc"),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error(err);
      toast.error("Failed to load recycle bin.");
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [searchQuery]);

  // ── Filter + paginate ───────────────────────────────────────────────────
  const filtered = useMemo(() =>
    items.filter((item) =>
      item.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.itemCode?.toLowerCase().includes(searchQuery.toLowerCase()),
    ), [items, searchQuery]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = useMemo(() =>
    filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [filtered, currentPage]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleRestore = async (item: any) => {
    // Move back to original collection (determined by item.originalCollection)
    const targetCollection = item.originalCollection || "products";
    const batch = writeBatch(db);
    const { id, deletedAt, deletedBy, originalCollection, ...originalData } = item;
    batch.set(doc(db, targetCollection, id), originalData);
    batch.delete(doc(db, "recycle_bin", id));
    await batch.commit();
    toast.success(`"${item.name}" restored successfully.`);
  };

  const handlePermanentDelete = async (item: any) => {
    await deleteDoc(doc(db, "recycle_bin", item.id));
    toast.success(`"${item.name}" permanently deleted.`);
  };

  const handleBulkPermanentDelete = async () => {
    setIsBulkDeleting(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => batch.delete(doc(db, "recycle_bin", id)));
      await batch.commit();
      toast.success(`${selectedIds.size} item(s) permanently deleted.`);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    } catch {
      toast.error("Failed to delete items.");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginated.map((i) => i.id)));
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const formatDeletedAt = (ts: any) => {
    if (!ts) return "---";
    try {
      return ts.toDate().toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });
    } catch { return "---"; }
  };

  const getPaginationPages = () => {
    const max = 5;
    if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: number[] = [];
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + max - 1);
    if (end - start < max - 1) start = Math.max(1, end - max + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* HEADER */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/admin">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Recycle Bin</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-4 p-4 pt-0 mt-4">
            {/* PAGE TITLE */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                  <Trash2 className="h-6 w-6 text-muted-foreground" />
                  Recycle Bin
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {loading ? "Loading..." : (
                    <><span className="font-semibold text-foreground">{filtered.length}</span> item{filtered.length !== 1 ? "s" : ""} in recycle bin</>
                  )}
                </p>
              </div>

              {/* Bulk delete */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                  <Button variant="ghost" size="sm" className="rounded-none" onClick={() => setSelectedIds(new Set())}>
                    <X className="h-3.5 w-3.5 mr-1" /> Clear
                  </Button>
                  <Button variant="destructive" size="sm" className="rounded-none" onClick={() => setBulkDeleteOpen(true)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete {selectedIds.size} Forever
                  </Button>
                </div>
              )}
            </div>

            {/* SEARCH */}
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or item code..."
                className="pl-8 rounded-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* INFO BANNER */}
            <div className="flex items-start gap-2 rounded-none bg-amber-50 border border-amber-200 px-4 py-3 dark:bg-amber-950/20 dark:border-amber-900">
              <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                Items in the recycle bin are soft-deleted and can be restored. To restore or permanently delete, you must type the item's exact name to confirm.
              </p>
            </div>

            {/* TABLE */}
            <div className="rounded-none border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedIds.size === paginated.length && paginated.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
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
                      <TableCell colSpan={7} className="h-60 text-center">
                        <Loader2 className="animate-spin mx-auto h-8 w-8 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-60 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Trash2 className="h-8 w-8 opacity-20" />
                          <p className="text-sm">Recycle bin is empty</p>
                          <p className="text-xs opacity-60">Deleted items will appear here</p>
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
                        {/* CHECKBOX */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => toggleSelect(item.id)}
                          />
                        </TableCell>

                        {/* IMAGE */}
                        <TableCell>
                          <div className="w-12 h-12 bg-background rounded-none border overflow-hidden flex items-center justify-center grayscale">
                            {item.mainImage ? (
                              <img src={item.mainImage} alt={item.name} className="w-full h-full object-contain" />
                            ) : (
                              <Package className="h-5 w-5 text-muted-foreground/30" />
                            )}
                          </div>
                        </TableCell>

                        {/* PRODUCT INFO */}
                        <TableCell>
                          <div className="flex flex-col max-w-[250px]">
                            <span className="font-medium text-sm line-clamp-1 text-muted-foreground">{item.name}</span>
                            <span className="text-xs text-muted-foreground/70">
                              {item.productFamily || item.categories || "No Category"}
                            </span>
                          </div>
                        </TableCell>

                        {/* ITEM CODE */}
                        <TableCell>
                          <span className="text-xs text-muted-foreground font-mono">
                            {item.itemCode || "---"}
                          </span>
                        </TableCell>

                        {/* SOURCE */}
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="w-fit text-xs opacity-60">
                              {Array.isArray(item.brands) ? item.brands.join(", ") : item.brand || "Generic"}
                            </Badge>
                            <Badge variant="secondary" className="w-fit text-xs opacity-60">
                              {item.originalCollection || "products"}
                            </Badge>
                          </div>
                        </TableCell>

                        {/* DELETED AT */}
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {formatDeletedAt(item.deletedAt)}
                          </span>
                        </TableCell>

                        {/* ACTIONS */}
                        <TableCell className="text-right">
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
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* PAGINATION */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-between border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-none" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>
                    <ChevronLeft size={14} />
                  </Button>
                  {getPaginationPages().map((p) => (
                    <Button key={p} variant={currentPage === p ? "default" : "outline"} size="icon" className="h-8 w-8 rounded-none text-xs" onClick={() => setCurrentPage(p)}>
                      {p}
                    </Button>
                  ))}
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-none" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* RESTORE DIALOG */}
      <RestoreDialog
        open={!!restoreTarget}
        onOpenChange={(v) => !v && setRestoreTarget(null)}
        item={restoreTarget}
        onConfirm={() => handleRestore(restoreTarget)}
      />

      {/* PERMANENT DELETE DIALOG */}
      <PermanentDeleteDialog
        open={!!permanentDeleteTarget}
        onOpenChange={(v) => !v && setPermanentDeleteTarget(null)}
        item={permanentDeleteTarget}
        onConfirm={() => handlePermanentDelete(permanentDeleteTarget)}
      />

      {/* BULK PERMANENT DELETE */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold uppercase">
              Permanently Delete {selectedIds.size} Items?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will permanently delete{" "}
              <span className="font-semibold text-foreground">{selectedIds.size}</span>{" "}
              selected item{selectedIds.size > 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none bg-destructive text-xs"
              onClick={handleBulkPermanentDelete}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}