"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  getDoc,
  writeBatch,
} from "@/lib/firestore/client";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  RotateCcw,
  AlertTriangle,
  Clock,
  Image as ImageIcon,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/logger";
import { sanitizeDocument } from "@/lib/firestore-sanitize";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { DeleteToRecycleBinDialog } from "@/components/deletedialog";

import BlogCreator, { BlogPayload } from "./BlogCreator";

interface RecycleBinItem {
  id: string;
  originalCollection: string;
  deletedAt?: any;
  title?: string;
  category?: string;
  coverImage?: string;
  [key: string]: any; // Allow other properties from the original blog
}

const ITEMS_PER_PAGE = 5;
const LONG_PRESS_MS = 2000;

const WEBSITE_FILTER_OPTIONS = [
  { label: "All Websites", value: "all" },
  { label: "Disruptive Solutions Inc", value: "disruptivesolutionsinc" },
  { label: "Ecoshift Corporation", value: "ecoshiftcorporation" },
  { label: "Buildchem Solutions Inc", value: "buildchem" },
];

// --- Long-press button ---
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

  const tick = useRef(() => {
    if (!pressStart.current) return;
    const elapsed = Date.now() - pressStart.current;
    const pct = Math.min((elapsed / LONG_PRESS_MS) * 100, 100);
    setProgress(pct);
    if (pct >= 100 && !firedRef.current) {
      firedRef.current = true;
      onComplete();
      return;
    }
    rafRef.current = requestAnimationFrame(tick.current);
  });

  const start = useCallback(() => {
    if (disabled || firedRef.current) return;
    pressStart.current = Date.now();
    firedRef.current = false;
    setProgress(0);
    setPressing(true);
    rafRef.current = requestAnimationFrame(tick.current);
  }, [disabled]);

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

// --- Restore dialog ---
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

  const required = item?.title || "";
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
      <DialogContent className="rounded-none max-w-[calc(100%-2rem)] sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-none flex items-center justify-center shrink-0 bg-emerald-100 dark:bg-emerald-950/40">
              <RotateCcw className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold uppercase tracking-tight">
                Restore Blog Post
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                This blog post will be moved back to the blogs collection.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 py-2 pr-2">
            <div className="flex items-center gap-3 rounded-none bg-muted/50 border px-3 py-2.5">
              <div className="w-10 h-10 shrink-0 bg-background border rounded-none overflow-hidden flex items-center justify-center">
                {item?.coverImage ? (
                  <img
                    src={item.coverImage}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item?.title}</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {item?.category || "—"}
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
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2 pt-2">
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

// --- Permanent delete dialog ---
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

  const required = item?.title || "";
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
      <DialogContent className="rounded-none max-w-[calc(100%-2rem)] sm:max-w-md md:max-w-lg">
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
                The blog post will be gone forever.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 py-2 pr-2">
            <div className="flex items-center gap-3 rounded-none bg-muted/50 border px-3 py-2.5">
              <div className="w-10 h-10 shrink-0 bg-background border rounded-none overflow-hidden flex items-center justify-center">
                {item?.coverImage ? (
                  <img
                    src={item.coverImage}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item?.title}</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {item?.category || "—"}
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
                Permanent deletion cannot be reversed. This blog post will not be
                recoverable.
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2 pt-2">
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

// --- Bulk permanent delete dialog ---
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
      <DialogContent className="rounded-none max-w-[calc(100%-2rem)] sm:max-w-md md:max-w-lg">
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

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 py-2 pr-2">
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
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2 pt-2">
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

export default function BlogManager() {
  const [blogs, setBlogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [editingBlog, setEditingBlog] = useState<any | null>(null);
  const [websiteFilter, setWebsiteFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [showRecycleBin, setShowRecycleBin] = useState(false);

  // Recycle bin state
  const [recycleBinItems, setRecycleBinItems] = useState<RecycleBinItem[]>([]);
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);
  const [recycleBinSearchQuery, setRecycleBinSearchQuery] = useState("");
  const [recycleBinCurrentPage, setRecycleBinCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [restoreTarget, setRestoreTarget] = useState<RecycleBinItem | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<RecycleBinItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkRestoring, setIsBulkRestoring] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [blogToDelete, setBlogToDelete] = useState<any>(null);

  useEffect(() => {
    const q = query(collection(db, "blogs"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setBlogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  // Poll scheduled publisher when viewing the blogs list (dev/Hobby safety net)
  useEffect(() => {
    if (isCreatorOpen || showRecycleBin) return;

    const triggerPublish = () => {
      void fetch("/api/blogs/publish-scheduled").catch(() => {});
    };

    triggerPublish();
    const interval = setInterval(triggerPublish, 60_000);
    return () => clearInterval(interval);
  }, [isCreatorOpen, showRecycleBin]);

  useEffect(() => {
    if (showRecycleBin) {
      setRecycleBinLoading(true);
      const q = query(
        collection(db, "recycle_bin"),
        orderBy("deletedAt", "desc"),
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          const items = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as RecycleBinItem))
            .filter((item) => item.originalCollection === "blogs");
          setRecycleBinItems(items);
          setRecycleBinLoading(false);
        },
        (err) => {
          console.error(err);
          toast.error("Failed to load recycle bin.");
          setRecycleBinLoading(false);
        },
      );
      return () => unsub();
    }
  }, [showRecycleBin]);

  useEffect(() => {
    setCurrentPage(1);
  }, [websiteFilter]);

  useEffect(() => {
    setRecycleBinCurrentPage(1);
    setSelectedIds(new Set());
  }, [recycleBinSearchQuery]);

  const filteredBlogs =
    websiteFilter === "all"
      ? blogs
      : blogs.filter((b) => b.website === websiteFilter);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredBlogs.length / ITEMS_PER_PAGE),
  );
  const paginatedBlogs = filteredBlogs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  // Recycle bin filtered and paginated
  const recycleBinFiltered = useMemo(() => {
    const q = recycleBinSearchQuery.trim().toLowerCase();
    return recycleBinItems.filter((item) => {
      const title = (item.title ?? "").toLowerCase();
      const category = (item.category ?? "").toLowerCase();
      return title.includes(q) || category.includes(q);
    });
  }, [recycleBinItems, recycleBinSearchQuery]);

  const recycleBinTotalPages = Math.max(
    1,
    Math.ceil(recycleBinFiltered.length / ITEMS_PER_PAGE),
  );
  const recycleBinPaginated = useMemo(
    () =>
      recycleBinFiltered.slice(
        (recycleBinCurrentPage - 1) * ITEMS_PER_PAGE,
        recycleBinCurrentPage * ITEMS_PER_PAGE,
      ),
    [recycleBinFiltered, recycleBinCurrentPage],
  );

  const handleCreateNew = () => {
    setEditingBlog(null);
    setIsCreatorOpen(true);
  };

  const handleEdit = (blog: any) => {
    setEditingBlog(blog);
    setIsCreatorOpen(true);
  };

  const handleClose = () => {
    setIsCreatorOpen(false);
    setEditingBlog(null);
  };

  const handleSubmit = async (
    payload: BlogPayload,
    editingId: string | null,
  ) => {
    const base = { ...payload, updatedAt: serverTimestamp() };
    // #region debug-point E:page-submit
    fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"blog-schedule-not-publishing",runId:"pre-fix",hypothesisId:"E",location:"blogs/page.tsx:handleSubmit",msg:"[DEBUG] page submit received blog payload",data:{editingId,title:payload.title,isPublished:payload.isPublished,scheduledFor:payload.scheduledFor?.toDate().toISOString() ?? null},ts:Date.now()})}).catch(()=>{});
    // #endregion
    if (editingId) {
      await updateDoc(doc(db, "blogs", editingId), base);
      // #region debug-point E:page-submit-success
      fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"blog-schedule-not-publishing",runId:"pre-fix",hypothesisId:"E",location:"blogs/page.tsx:handleSubmit",msg:"[DEBUG] page submit updated existing blog doc",data:{editingId,title:payload.title},ts:Date.now()})}).catch(()=>{});
      // #endregion
      await logAuditEvent({
        action: "update",
        entityType: "blog",
        entityId: editingId,
        entityName: payload.title,
        context: {
          page: "/content/blogs",
          source: "blogs:edit",
          collection: "blogs",
        },
      });
    } else {
      const docRef = await addDoc(collection(db, "blogs"), {
        ...base,
        createdAt: serverTimestamp(),
      });
      // #region debug-point E:page-create-success
      fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"blog-schedule-not-publishing",runId:"pre-fix",hypothesisId:"E",location:"blogs/page.tsx:handleSubmit",msg:"[DEBUG] page submit created blog doc",data:{createdId:docRef.id,title:payload.title,isPublished:payload.isPublished,scheduledFor:payload.scheduledFor?.toDate().toISOString() ?? null},ts:Date.now()})}).catch(()=>{});
      // #endregion
      await logAuditEvent({
        action: "create",
        entityType: "blog",
        entityId: docRef.id,
        entityName: payload.title,
        context: {
          page: "/content/blogs",
          source: "blogs:create",
          collection: "blogs",
        },
      });
    }
  };

  const handleSoftDelete = (blog: any) => {
    setBlogToDelete(blog);
    setDeleteDialogOpen(true);
  };

  const confirmSoftDelete = async () => {
    if (!blogToDelete) return;
    try {
      const { id, ...existing } = blogToDelete;
      // Move to recycle bin
      const batch = writeBatch(db);
      batch.set(
        doc(db, "recycle_bin", id),
        sanitizeDocument({
          ...existing,
          id,
          deletedAt: serverTimestamp(),
          originalCollection: "blogs",
          originPage: "/content/blogs",
        }),
      );
      batch.delete(doc(db, "blogs", id));
      await batch.commit();

      await logAuditEvent({
        action: "delete",
        entityType: "blog",
        entityId: id,
        entityName: existing.title ?? null,
        context: {
          page: "/content/blogs",
          source: "blogs:soft-delete",
          collection: "recycle_bin",
        },
      });

      toast.success("Blog post moved to recycle bin");
      setDeleteDialogOpen(false);
      setBlogToDelete(null);
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleRestore = async (item: any) => {
    const batch = writeBatch(db);
    const {
      id,
      deletedAt,
      deletedBy,
      originalCollection,
      originPage,
      ...originalData
    } = item;
    batch.set(
      doc(db, "blogs", id),
      sanitizeDocument(originalData as Record<string, unknown>),
    );
    batch.delete(doc(db, "recycle_bin", id));
    await batch.commit();

    await logAuditEvent({
      action: "restore",
      entityType: "blog",
      entityId: id,
      entityName: item.title,
      context: {
        page: "/content/blogs",
        source: "blogs:recycle-bin:restore",
        collection: "blogs",
      },
    });

    toast.success(`"${item.title}" restored successfully.`);
  };

  const handlePermanentDelete = async (item: any) => {
    await deleteDoc(doc(db, "recycle_bin", item.id));

    await logAuditEvent({
      action: "delete",
      entityType: "blog",
      entityId: item.id,
      entityName: item.title,
      context: {
        page: "/content/blogs",
        source: "blogs:recycle-bin:permanent-delete",
        collection: "recycle_bin",
      },
    });

    toast.success(`"${item.title}" permanently deleted.`);
  };

  const handleBulkRestore = async () => {
    const selectedItems = recycleBinItems.filter((item) =>
      selectedIds.has(item.id),
    );
    if (selectedItems.length === 0) return;

    setIsBulkRestoring(true);
    try {
      const CHUNK_SIZE = 200;
      for (let i = 0; i < selectedItems.length; i += CHUNK_SIZE) {
        const chunk = selectedItems.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((item) => {
          const {
            id,
            deletedAt,
            deletedBy,
            originalCollection,
            originPage,
            ...originalData
          } = item;
          batch.set(
            doc(db, "blogs", id),
            sanitizeDocument(originalData as Record<string, unknown>),
          );
          batch.delete(doc(db, "recycle_bin", id));
        });
        await batch.commit();
      }

      await logAuditEvent({
        action: "restore",
        entityType: "blogs",
        entityId: null,
        entityName: `${selectedItems.length} items`,
        context: {
          page: "/content/blogs",
          source: "blogs:recycle-bin:bulk-restore",
          collection: "recycle_bin",
          bulk: true,
        },
        metadata: { ids: selectedItems.map((i) => i.id) },
      });

      toast.success(
        `${selectedItems.length} item${
          selectedItems.length !== 1 ? "s" : ""
        } restored successfully.`,
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
    const batch = writeBatch(db);
    const ids: string[] = [];
    selectedIds.forEach((id) => {
      ids.push(id);
      batch.delete(doc(db, "recycle_bin", id));
    });
    await batch.commit();

    await logAuditEvent({
      action: "delete",
      entityType: "blogs",
      entityId: null,
      entityName: `${selectedIds.size} items`,
      context: {
        page: "/content/blogs",
        source: "blogs:recycle-bin:bulk-permanent-delete",
        collection: "recycle_bin",
        bulk: true,
      },
      metadata: { ids },
    });

    toast.success(`${selectedIds.size} item(s) permanently deleted.`);
    setSelectedIds(new Set());
  };

  // Selection helpers
  const toggleSelectAll = () => {
    if (selectedIds.size === recycleBinPaginated.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recycleBinPaginated.map((i) => i.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // --- RENDER: EDIT MODE ---
  const renderEditMode = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={handleClose} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Publications
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <p className="text-sm text-muted-foreground">
          {editingBlog
            ? `Editing: ${editingBlog?.title}`
            : "Creating New Publication"}
        </p>
      </div>
      <BlogCreator
        initialData={editingBlog}
        onClose={handleClose}
        onSubmit={handleSubmit}
      />
    </div>
  );

  // --- RENDER: RECYCLE BIN ---
  const renderRecycleBin = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => setShowRecycleBin(false)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Publications
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              Recycle Bin
            </h1>
            <p className="text-xs text-muted-foreground">
              {recycleBinFiltered.length} item{recycleBinFiltered.length !== 1 ? "s" : ""} in bin
            </p>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-none bg-amber-50 border border-amber-200 px-4 py-3 dark:bg-amber-950/20 dark:border-amber-900">
        <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
          Items in the recycle bin are soft-deleted and can be restored. To restore
          or permanently delete a single item, type the item's exact title to confirm.
          For bulk deletion, hold the button for 2 seconds.
        </p>
      </div>

      {/* Bulk toolbar */}
      {selectedIds.size > 0 && (
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
              className="min-w-[200px]"
              label={
                <>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Hold to Delete {selectedIds.size}{" "}
                  Forever
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by title or category..."
          className="pl-8 rounded-none"
          value={recycleBinSearchQuery}
          onChange={(e) => setRecycleBinSearchQuery(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-foreground/10 border-t-0 overflow-hidden">
        {recycleBinLoading ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <Loader2 className="animate-spin h-8 w-8 mb-2" />
            <span className="text-[10px] font-bold uppercase">
              Loading Recycle Bin
            </span>
          </div>
        ) : recycleBinPaginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <Trash2 className="h-8 w-8 mb-2" />
            <span className="text-[10px] font-bold uppercase">
              Recycle Bin is Empty
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[720px]">
              <thead className="border-b border-foreground/5">
                <tr className="text-[9px] font-bold uppercase tracking-widest opacity-30">
                  <th className="w-12 px-6 py-4">
                    <Checkbox
                      checked={
                        selectedIds.size === recycleBinPaginated.length &&
                        recycleBinPaginated.length > 0
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-4">Preview</th>
                  <th className="px-6 py-4">Blog Post Info</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Deleted</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {recycleBinPaginated.map((blog) => (
                  <tr
                    key={blog.id}
                    className="hover:bg-gray-50/50 transition-colors group"
                  >
                    <td className="px-6 py-5">
                      <Checkbox
                        checked={selectedIds.has(blog.id)}
                        onCheckedChange={() => toggleSelect(blog.id)}
                      />
                    </td>
                    <td className="px-6 py-5">
                      <div className="w-20 h-14 overflow-hidden border border-foreground/5 grayscale">
                        <img
                          src={blog.coverImage || "/placeholder.png"}
                          className="w-full h-full object-cover"
                          alt={blog.title}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <h4 className="font-bold text-[11px] uppercase tracking-wide line-clamp-1 max-w-[280px] mb-1">
                        {blog.title}
                      </h4>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {blog.category || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDeletedAt(blog.deletedAt)}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-none h-8 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => setRestoreTarget(blog)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-none h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setPermanentDeleteTarget(blog)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!recycleBinLoading && recycleBinTotalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-foreground/5">
            <p className="text-[9px] font-bold uppercase opacity-30 tracking-widest">
              Page {recycleBinCurrentPage} of {recycleBinTotalPages}
            </p>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setRecycleBinCurrentPage((p) => Math.max(p - 1, 1))
                }
                disabled={recycleBinCurrentPage === 1}
                className="h-8 w-8 rounded-none"
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setRecycleBinCurrentPage((p) =>
                    Math.min(p + 1, recycleBinTotalPages)
                  )
                }
                disabled={recycleBinCurrentPage === recycleBinTotalPages}
                className="h-8 w-8 rounded-none"
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // --- RENDER: TABLE MODE ---
  const renderTableMode = () => (
    <>
      {/* Filter bar */}
      <div className="bg-white border border-foreground/10 px-6 py-4 flex items-center gap-4">
        <Filter size={14} className="opacity-30 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 shrink-0">
          Filter by Website
        </span>
        <Select value={websiteFilter} onValueChange={setWebsiteFilter}>
          <SelectTrigger className="h-8 w-56 rounded-none border-foreground/10 text-[10px] font-bold uppercase focus:ring-1 focus:ring-[#d11a2a]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            {WEBSITE_FILTER_OPTIONS.map((o) => (
              <SelectItem
                key={o.value}
                value={o.value}
                className="text-[10px] font-bold uppercase"
              >
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {websiteFilter !== "all" && (
          <span className="text-[10px] font-bold opacity-40">
            {filteredBlogs.length}{" "}
            {filteredBlogs.length === 1 ? "blog" : "blogs"}
          </span>
        )}
        <Button
          onClick={() => setShowRecycleBin(true)}
          variant="outline"
          className="h-8 rounded-none text-[10px] font-bold uppercase tracking-widest px-4 transition-all"
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Recycle Bin
        </Button>
        <Button
          onClick={handleCreateNew}
          className="ml-auto h-8 rounded-none bg-black hover:bg-[#d11a2a] text-[10px] font-bold uppercase tracking-widest px-6 transition-all"
        >
          <Plus className="mr-2 h-3.5 w-3.5" /> New Story
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white border border-foreground/10 border-t-0 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <Loader2 className="animate-spin h-8 w-8 mb-2" />
            <span className="text-[10px] font-bold uppercase">
              Loading Archive
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[720px]">
              <thead className="border-b border-foreground/5">
                <tr className="text-[9px] font-bold uppercase tracking-widest opacity-30">
                  <th className="px-6 py-4">Preview</th>
                  <th className="px-6 py-4">Story Details</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {paginatedBlogs.map((blog) => (
                  <tr
                    key={blog.id}
                    className="hover:bg-gray-50/50 transition-colors group"
                  >
                    <td className="px-6 py-5">
                      <div className="w-20 h-14 overflow-hidden border border-foreground/5">
                        <img
                          src={blog.coverImage || "/placeholder.png"}
                          className="w-full h-full object-cover"
                          alt={blog.title}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <h4 className="font-bold text-[11px] uppercase tracking-wide line-clamp-1 max-w-[280px] mb-1">
                        {blog.title}
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-[#d11a2a] uppercase tracking-widest">
                          {blog.category}
                        </span>
                        <span className="text-[8px] opacity-30 font-bold uppercase">
                          | {blog.website || "N/A"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <Badge
                        className={`rounded-none text-[8px] h-5 px-2 font-bold uppercase tracking-widest ${
                          blog.isPublished
                            ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-50"
                            : blog.scheduledFor
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-50"
                            : "bg-amber-50 text-amber-600 hover:bg-amber-50"
                        }`}
                      >
                        {blog.isPublished
                          ? "Published"
                          : blog.scheduledFor
                          ? "Scheduled"
                          : "Draft"}
                      </Badge>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(blog)}
                          className="h-8 w-8 rounded-none opacity-0 group-hover:opacity-100 transition-all hover:bg-black hover:text-white"
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSoftDelete(blog)}
                          className="h-8 w-8 rounded-none opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedBlogs.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center py-20 text-[10px] font-bold uppercase opacity-20"
                    >
                      No publications found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-foreground/5">
          <p className="text-[9px] font-bold uppercase opacity-30 tracking-widest">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 rounded-none disabled:opacity-20"
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setCurrentPage((p) => Math.min(p + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="h-8 w-8 rounded-none disabled:opacity-20"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-white">
          {/* Top header */}
          <header className="flex h-16 shrink-0 items-center border-b bg-white px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-3 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Editorial</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {isCreatorOpen
                      ? editingBlog
                        ? "Edit Publication"
                        : "New Publication"
                      : showRecycleBin
                      ? "Recycle Bin"
                      : "Publications"}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="p-6 md:p-10">
            {isCreatorOpen
              ? renderEditMode()
              : showRecycleBin
              ? renderRecycleBin()
              : renderTableMode()}
          </main>
        </SidebarInset>
      </SidebarProvider>

      {/* Dialogs */}
      <DeleteToRecycleBinDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={blogToDelete?.title || ""}
        onConfirm={confirmSoftDelete}
        itemNamePlural="Blogs"
        itemNameSingular="Blog"
      />
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
    </TooltipProvider>
  );
}
