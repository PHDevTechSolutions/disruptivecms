"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import {
  Pencil,
  Trash2,
  Loader2,
  X,
  RotateCcw,
  FolderPlus,
  Image as ImageIcon,
  Zap,
  Upload,
  Layers,
  CheckCircle2,
  AlertCircle,
  CheckSquare,
  Square,
  Filter,
  Minus,
  ChevronRight,
  Ban,
} from "lucide-react";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { useDropzone } from "react-dropzone";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Project = {
  id: string;
  title: string;
  description: string;
  category: string;
  website: string;
  imageUrl?: string;
  logoUrl?: string;
  createdAt?: any;
  updatedAt?: any;
};

type BulkItem = {
  id: string;
  file: File;
  previewUrl: string;
  title: string;
  category: string;
  status: "pending" | "uploading" | "done" | "error" | "cancelled";
  logoFile?: File;
  logoPrev?: string;
};

type BulkStep = "website" | "images" | "logos" | "review";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<number, string> = {
  1: "Offices & Communication",
  2: "Education & Science",
  3: "Presentation & Retail",
  4: "Hotel & Wellness",
  5: "Art & Culture",
  6: "Health & Care",
  7: "Industrial & Service",
  8: "Pathways & Safety",
};

const CATEGORY_OPTIONS = Object.values(CATEGORY_MAP);
const ALL_CATEGORIES = "All Categories";

const WEBSITE_OPTIONS = [
  "Disruptive Solutions Inc",
  "Ecoshift Corporation",
  "Value Acquisitions Holdings",
];

const BULK_STEPS: { key: BulkStep; label: string }[] = [
  { key: "website", label: "Website" },
  { key: "images", label: "Images" },
  { key: "logos", label: "Logos" },
  { key: "review", label: "Review" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseProjectFilename(filename: string): {
  title: string;
  category: string;
} {
  const base = filename.replace(/\.[^/.]+$/, "");
  const normalised = base.replace(/_-_/g, "|").replace(/ - /g, "|");
  const parts = normalised.split("|");
  const titleRaw =
    parts.length >= 3
      ? parts.slice(1, parts.length - 1).join(" ")
      : parts.slice(1).join(" ");
  const numberRaw = parts[parts.length - 1]?.trim();
  const categoryNumber = parseInt(numberRaw ?? "", 10);
  const title = titleRaw.replace(/_/g, " ").trim();
  const category = CATEGORY_MAP[categoryNumber] ?? CATEGORY_OPTIONS[0];
  return { title, category };
}

/** Extracts the target project name from a logo filename.
 *  Supports: "Logo - My Project.png" / "LOGO_-_My_Project.png"
 *  Returns null if the file doesn't start with "logo". */
function parseLogoFilename(filename: string): string | null {
  const base = filename.replace(/\.[^/.]+$/, "");
  const normalised = base.replace(/_-_/g, "|").replace(/ - /g, "|");
  const parts = normalised.split("|");
  if (parts[0]?.trim().toLowerCase() !== "logo") return null;
  return parts.slice(1).join(" ").replace(/_/g, " ").trim() || null;
}

// ─── BulkReviewCard ───────────────────────────────────────────────────────────
// Per-item card in the Review step. Own useDropzone so each item can accept a logo.

type BulkReviewCardProps = {
  item: BulkItem;
  onRemove: (id: string) => void;
  onUpdateField: (
    id: string,
    field: "title" | "category",
    value: string,
  ) => void;
  onLogoSet: (id: string, file: File, previewUrl: string) => void;
  onLogoClear: (id: string) => void;
};

function BulkReviewCard({
  item,
  onRemove,
  onUpdateField,
  onLogoSet,
  onLogoClear,
}: BulkReviewCardProps) {
  const isPending = item.status === "pending";

  const itemLogoDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    disabled: !isPending,
    onDrop: (files) => {
      if (!files[0]) return;
      onLogoSet(item.id, files[0], URL.createObjectURL(files[0]));
    },
  });

  return (
    <div
      className={cn(
        "border transition-colors",
        item.status === "done" &&
          "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800",
        item.status === "error" &&
          "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
        item.status === "uploading" &&
          "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800",
        item.status === "cancelled" &&
          "bg-muted/40 border-foreground/10 opacity-50",
        item.status === "pending" && "border-foreground/10",
      )}
    >
      {/* Row 1: thumbnail + fields + remove */}
      <div className="flex gap-2 p-2">
        <div className="w-14 h-14 shrink-0 bg-muted border overflow-hidden relative">
          <img
            src={item.previewUrl}
            className="w-full h-full object-cover"
            alt=""
          />
          {item.status === "uploading" && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 size={12} className="animate-spin text-white" />
            </div>
          )}
          {item.status === "done" && (
            <div className="absolute inset-0 bg-green-500/60 flex items-center justify-center">
              <CheckCircle2 size={12} className="text-white" />
            </div>
          )}
          {item.status === "error" && (
            <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center">
              <AlertCircle size={12} className="text-white" />
            </div>
          )}
          {item.status === "cancelled" && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Ban size={12} className="text-white" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <Input
            value={item.title}
            onChange={(e) => onUpdateField(item.id, "title", e.target.value)}
            disabled={!isPending}
            className="rounded-none h-6 text-[9px] font-bold uppercase px-1.5 py-0"
          />
          <Select
            value={item.category}
            onValueChange={(v) => onUpdateField(item.id, "category", v)}
            disabled={!isPending}
          >
            <SelectTrigger className="rounded-none h-6 text-[8px] px-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              {CATEGORY_OPTIONS.map((cat) => (
                <SelectItem key={cat} value={cat} className="text-[9px]">
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isPending && (
          <button
            onClick={() => onRemove(item.id)}
            className="shrink-0 self-start p-0.5 text-muted-foreground hover:text-destructive transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Row 2: logo dropzone — identical UX to single form */}
      <div className="px-2 pb-2">
        {item.logoPrev ? (
          <div className="relative flex items-center gap-2.5 bg-muted border p-2">
            <div className="w-10 h-10 shrink-0 bg-background border flex items-center justify-center overflow-hidden">
              <img
                src={item.logoPrev}
                className="w-full h-full object-contain"
                alt="logo"
              />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[7px] font-black uppercase text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                <Zap size={8} /> Logo Active
              </span>
              <span className="text-[7px] text-muted-foreground truncate">
                {item.logoFile?.name ?? "auto-matched"}
              </span>
            </div>
            {isPending && (
              <button
                onClick={() => onLogoClear(item.id)}
                className="absolute top-1 right-1 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ) : (
          <div
            {...itemLogoDropzone.getRootProps()}
            className={cn(
              "flex items-center justify-center gap-2 border-2 border-dashed transition-colors min-h-[36px] px-3",
              isPending
                ? "cursor-pointer hover:bg-accent"
                : "cursor-not-allowed opacity-30",
              itemLogoDropzone.isDragActive &&
                isPending &&
                "border-primary bg-primary/5",
            )}
          >
            <input {...itemLogoDropzone.getInputProps()} />
            <Zap size={9} className="text-muted-foreground/50 shrink-0" />
            <p className="text-[8px] font-bold uppercase text-muted-foreground">
              {isPending ? "Drop logo (optional)" : "No logo"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");

  // ── Single form ──
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [website, setWebsite] = useState(WEBSITE_OPTIONS[0]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePrev, setImagePrev] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPrev, setLogoPrev] = useState<string | null>(null);

  // ── Bulk stepper ──
  const [bulkStep, setBulkStep] = useState<BulkStep>("website");
  const [bulkWebsite, setBulkWebsite] = useState<string>("");
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const cancelUploadRef = useRef(false);

  // Logos dropped in step 3 that couldn't be auto-matched
  const [unmatchedLogos, setUnmatchedLogos] = useState<
    { file: File; previewUrl: string }[]
  >([]);

  // ── Grid selection & filter ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>(ALL_CATEGORIES);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // ── Firestore sync ──
  useEffect(() => {
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProjects(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Project),
      );
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // ── Derived ──
  const filteredProjects =
    activeFilter === ALL_CATEGORIES
      ? projects
      : projects.filter((p) => p.category === activeFilter);

  const categoryCounts = projects.reduce<Record<string, number>>((acc, p) => {
    const cat = p.category || "Uncategorized";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const pendingCount = bulkItems.filter((i) => i.status === "pending").length;
  const doneCount = bulkItems.filter((i) => i.status === "done").length;
  const logoCount = bulkItems.filter((i) => !!i.logoPrev).length;

  const allVisibleSelected =
    filteredProjects.length > 0 &&
    filteredProjects.every((p) => selectedIds.has(p.id));
  const someVisibleSelected =
    filteredProjects.some((p) => selectedIds.has(p.id)) && !allVisibleSelected;

  // ── Reset entire bulk flow ──
  const resetBulk = useCallback(() => {
    cancelUploadRef.current = true;
    setBulkStep("website");
    setBulkWebsite("");
    setBulkItems([]);
    setUnmatchedLogos([]);
    setIsBulkUploading(false);
    setBulkProgress(0);
  }, []);

  // ── Selection ──
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProjects.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredProjects.map((p) => p.id)));
  };
  const clearSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    setIsBulkDeleting(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => batch.delete(doc(db, "projects", id)));
      await batch.commit();
      toast.success(`${selectedIds.size} project(s) deleted`);
      clearSelection();
    } catch (err) {
      console.error(err);
      toast.error("Error deleting projects");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // ── Single dropzones ──
  const backgroundDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (files) => {
      setImageFile(files[0]);
      setImagePrev(URL.createObjectURL(files[0]));
    },
  });
  const singleLogoDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (files) => {
      setLogoFile(files[0]);
      setLogoPrev(URL.createObjectURL(files[0]));
    },
  });

  // ── Step 2: Images — ALL files become project items, none treated as logos ──
  const onImagesDrop = useCallback((acceptedFiles: File[]) => {
    const newItems: BulkItem[] = acceptedFiles.map((file) => {
      const { title, category } = parseProjectFilename(file.name);
      return {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        title,
        category,
        status: "pending",
      };
    });
    setBulkItems((prev) => [...prev, ...newItems]);
  }, []);

  const imagesDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: true,
    onDrop: onImagesDrop,
  });

  // ── Step 3: Logos — ALL files are logos, auto-matched by filename ──
  const onLogosDrop = useCallback((acceptedFiles: File[]) => {
    const newUnmatched: { file: File; previewUrl: string }[] = [];
    let matchCount = 0;

    setBulkItems((prev) => {
      const updated = [...prev];
      for (const file of acceptedFiles) {
        const targetTitle = parseLogoFilename(file.name);
        if (targetTitle) {
          const idx = updated.findIndex(
            (item) =>
              item.title.trim().toLowerCase() ===
              targetTitle.trim().toLowerCase(),
          );
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              logoFile: file,
              logoPrev: URL.createObjectURL(file),
            };
            matchCount++;
          } else {
            newUnmatched.push({ file, previewUrl: URL.createObjectURL(file) });
          }
        } else {
          // No "Logo -" prefix — goes to unmatched pool for manual assignment
          newUnmatched.push({ file, previewUrl: URL.createObjectURL(file) });
        }
      }
      return updated;
    });

    setUnmatchedLogos((prev) => [...prev, ...newUnmatched]);
    if (matchCount > 0) toast.success(`${matchCount} logo(s) auto-matched`);
    if (newUnmatched.length > 0)
      toast.info(`${newUnmatched.length} logo(s) unmatched — assign below`);
  }, []);

  const logosDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: true,
    onDrop: onLogosDrop,
  });

  // ── Single submit ──
  const handleSubmit = async () => {
    if (!title) return toast.error("Project name is required");
    if (!imagePrev && !imageFile)
      return toast.error("Background image is required");
    setIsSubmitLoading(true);
    try {
      let finalImageUrl = imagePrev;
      if (imageFile) finalImageUrl = await uploadToCloudinary(imageFile);
      let finalLogoUrl = logoPrev ?? null;
      if (logoFile) finalLogoUrl = await uploadToCloudinary(logoFile);

      const projectData = {
        title,
        description,
        category,
        website,
        imageUrl: finalImageUrl,
        logoUrl: finalLogoUrl,
        updatedAt: serverTimestamp(),
      };
      if (editId) {
        await updateDoc(doc(db, "projects", editId), projectData);
        toast.success("Project updated");
      } else {
        await addDoc(collection(db, "projects"), {
          ...projectData,
          createdAt: serverTimestamp(),
        });
        toast.success("Project created");
      }
      resetSingleForm();
    } catch (err) {
      console.error(err);
      toast.error("Error saving project");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const resetSingleForm = () => {
    setEditId(null);
    setTitle("");
    setDescription("");
    setCategory(CATEGORY_OPTIONS[0]);
    setWebsite(WEBSITE_OPTIONS[0]);
    setImageFile(null);
    setImagePrev(null);
    setLogoFile(null);
    setLogoPrev(null);
  };

  const handleEditClick = (project: Project) => {
    setActiveTab("single");
    setEditId(project.id);
    setTitle(project.title);
    setDescription(project.description);
    setCategory(project.category || CATEGORY_OPTIONS[0]);
    setWebsite(project.website || WEBSITE_OPTIONS[0]);
    setImagePrev(project.imageUrl || null);
    setLogoPrev(project.logoUrl || null);
    setImageFile(null);
    setLogoFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Bulk upload with cancel support ──
  const handleBulkUpload = async () => {
    const pending = bulkItems.filter((i) => i.status === "pending");
    if (!pending.length) return toast.error("No pending items to upload");

    cancelUploadRef.current = false;
    setIsBulkUploading(true);
    setBulkProgress(0);

    let done = 0;
    for (const item of pending) {
      if (cancelUploadRef.current) {
        setBulkItems((prev) =>
          prev.map((i) =>
            i.status === "pending" ? { ...i, status: "cancelled" } : i,
          ),
        );
        break;
      }

      setBulkItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i)),
      );

      try {
        const imageUrl = await uploadToCloudinary(item.file);
        let logoUrl: string | null = null;
        if (item.logoFile) logoUrl = await uploadToCloudinary(item.logoFile);

        // Firestore doc — schema identical to single form
        await addDoc(collection(db, "projects"), {
          title: item.title,
          description: "",
          category: item.category,
          website: bulkWebsite,
          imageUrl, // background → shown as card image
          logoUrl, // client logo → drives hover overlay in gallery
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setBulkItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "done" } : i)),
        );
      } catch {
        setBulkItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "error" } : i)),
        );
      }

      done++;
      setBulkProgress(Math.round((done / pending.length) * 100));
    }

    setIsBulkUploading(false);
    cancelUploadRef.current
      ? toast.warning("Upload cancelled")
      : toast.success(`${done} project(s) uploaded successfully`);
  };

  const handleCancelUpload = () => {
    cancelUploadRef.current = true;
  };

  // ── Bulk item helpers ──
  const removeBulkItem = (id: string) =>
    setBulkItems((prev) => prev.filter((i) => i.id !== id));
  const updateBulkItem = (
    id: string,
    field: "title" | "category",
    value: string,
  ) =>
    setBulkItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    );
  const setBulkItemLogo = (id: string, file: File, previewUrl: string) =>
    setBulkItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, logoFile: file, logoPrev: previewUrl } : i,
      ),
    );
  const clearBulkItemLogo = (id: string) =>
    setBulkItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, logoFile: undefined, logoPrev: undefined } : i,
      ),
    );

  const assignUnmatchedLogo = (
    itemId: string,
    logo: { file: File; previewUrl: string },
  ) => {
    setBulkItemLogo(itemId, logo.file, logo.previewUrl);
    setUnmatchedLogos((prev) =>
      prev.filter((l) => l.previewUrl !== logo.previewUrl),
    );
  };

  // ── Stepper helpers ──
  const stepIndex = BULK_STEPS.findIndex((s) => s.key === bulkStep);
  const goNext = () => {
    const n = BULK_STEPS[stepIndex + 1];
    if (n) setBulkStep(n.key);
  };
  const goBack = () => {
    const p = BULK_STEPS[stepIndex - 1];
    if (p) setBulkStep(p.key);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admin">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Project Manager</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Project Manager
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage showcase projects and portfolio entries.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* ═══════════════════════════ LEFT PANEL ═══════════════════════════ */}
              <div className="lg:col-span-4 sticky top-6 z-10">
                <Card className="rounded-none shadow-none border-foreground/10 max-h-[calc(100vh-6rem)] overflow-y-auto">
                  {/* Tab strip */}
                  <CardHeader className="border-b py-0 px-0 sticky top-0 bg-background z-10">
                    <div className="flex">
                      <button
                        onClick={() => setActiveTab("single")}
                        className={cn(
                          "flex-1 py-3 text-[9px] font-black uppercase tracking-widest border-b-2 transition-colors",
                          activeTab === "single"
                            ? "border-foreground text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Single Project
                      </button>
                      <button
                        onClick={() => setActiveTab("bulk")}
                        className={cn(
                          "flex-1 py-3 text-[9px] font-black uppercase tracking-widest border-b-2 transition-colors flex items-center justify-center gap-1.5",
                          activeTab === "bulk"
                            ? "border-foreground text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Layers size={10} />
                        Bulk Upload
                        {bulkItems.length > 0 && (
                          <span className="bg-foreground text-background text-[7px] font-black px-1 py-0.5 leading-none">
                            {bulkItems.length}
                          </span>
                        )}
                      </button>
                    </div>

                    {activeTab === "single" && editId && (
                      <div className="flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-800">
                        <span className="text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400">
                          Editing Project
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={resetSingleForm}
                          className="h-6 rounded-none text-[8px] uppercase font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 px-2"
                        >
                          <RotateCcw className="mr-1 h-2.5 w-2.5" /> Cancel
                        </Button>
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="pt-5 space-y-5">
                    {/* ═══════════════ SINGLE FORM ═══════════════ */}
                    {activeTab === "single" && (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60">
                            Project Name
                          </label>
                          <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="E.G. NEXT-GEN LOGISTICS HUB"
                            className="rounded-none h-10 text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60">
                            Description
                          </label>
                          <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief details about the project..."
                            className="rounded-none min-h-[80px] text-xs resize-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60">
                            Category
                          </label>
                          <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className="rounded-none h-10 text-xs">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                              {CATEGORY_OPTIONS.map((cat) => (
                                <SelectItem
                                  key={cat}
                                  value={cat}
                                  className="text-xs"
                                >
                                  {cat}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60">
                            Website
                          </label>
                          <Select value={website} onValueChange={setWebsite}>
                            <SelectTrigger className="rounded-none h-10 text-xs">
                              <SelectValue placeholder="Select website" />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                              {WEBSITE_OPTIONS.map((site) => (
                                <SelectItem
                                  key={site}
                                  value={site}
                                  className="text-xs"
                                >
                                  {site}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Background */}
                        <div className="space-y-1.5 pt-4 border-t">
                          <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                            <ImageIcon size={11} /> Background Cover
                          </label>
                          <div
                            {...backgroundDropzone.getRootProps()}
                            className={cn(
                              "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors min-h-[120px]",
                              backgroundDropzone.isDragActive &&
                                "border-primary bg-primary/5",
                            )}
                          >
                            <input {...backgroundDropzone.getInputProps()} />
                            {imagePrev ? (
                              <div className="relative w-full aspect-video border bg-muted overflow-hidden">
                                <img
                                  src={imagePrev}
                                  className="h-full w-full object-cover"
                                  alt="Background preview"
                                />
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  className="absolute top-1 right-1 h-6 w-6 rounded-none"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setImagePrev(null);
                                    setImageFile(null);
                                  }}
                                >
                                  <X size={12} />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2">
                                <ImageIcon
                                  size={20}
                                  className="text-muted-foreground opacity-40"
                                />
                                <p className="text-[10px] font-bold uppercase tracking-tight">
                                  Drop Background Here
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Logo */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                            <Zap size={11} /> Client Logo{" "}
                            <span className="font-normal normal-case opacity-50">
                              (optional · hover)
                            </span>
                          </label>
                          <div
                            {...singleLogoDropzone.getRootProps()}
                            className={cn(
                              "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors min-h-[100px]",
                              singleLogoDropzone.isDragActive &&
                                "border-primary bg-primary/5",
                            )}
                          >
                            <input {...singleLogoDropzone.getInputProps()} />
                            {logoPrev ? (
                              <div className="relative w-full flex items-center justify-center bg-muted border p-4 overflow-hidden">
                                <img
                                  src={logoPrev}
                                  className="h-20 w-auto object-contain"
                                  alt="Logo preview"
                                />
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  className="absolute top-1 right-1 h-6 w-6 rounded-none"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLogoPrev(null);
                                    setLogoFile(null);
                                  }}
                                >
                                  <X size={12} />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2">
                                <ImageIcon
                                  size={20}
                                  className="text-muted-foreground opacity-40"
                                />
                                <p className="text-[10px] font-bold uppercase tracking-tight">
                                  Drop PNG Logo
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        <Button
                          onClick={handleSubmit}
                          disabled={isSubmitLoading}
                          className="w-full rounded-none uppercase font-bold text-[10px] h-11 tracking-widest"
                        >
                          {isSubmitLoading ? (
                            <Loader2 className="animate-spin h-4 w-4" />
                          ) : editId ? (
                            "Push Update"
                          ) : (
                            "Save Project"
                          )}
                        </Button>
                      </>
                    )}

                    {/* ═══════════════ BULK STEPPER ═══════════════ */}
                    {activeTab === "bulk" && (
                      <div className="space-y-5">
                        {/* Stepper indicator */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            {BULK_STEPS.map((s, i) => (
                              <React.Fragment key={s.key}>
                                <div className="flex flex-col items-center gap-0.5">
                                  <div
                                    className={cn(
                                      "w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-black transition-all",
                                      i < stepIndex &&
                                        "bg-foreground text-background",
                                      i === stepIndex &&
                                        "bg-foreground text-background ring-2 ring-foreground ring-offset-1",
                                      i > stepIndex &&
                                        "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {i < stepIndex ? (
                                      <CheckCircle2 size={10} />
                                    ) : (
                                      i + 1
                                    )}
                                  </div>
                                  <span
                                    className={cn(
                                      "text-[7px] font-black uppercase tracking-widest",
                                      i === stepIndex
                                        ? "text-foreground"
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    {s.label}
                                  </span>
                                </div>
                                {i < BULK_STEPS.length - 1 && (
                                  <div
                                    className={cn(
                                      "w-6 h-px mb-3 mx-0.5 transition-colors",
                                      i < stepIndex
                                        ? "bg-foreground"
                                        : "bg-muted",
                                    )}
                                  />
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                          <button
                            onClick={resetBulk}
                            className="text-[8px] font-black uppercase text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                          >
                            <RotateCcw size={9} /> Reset
                          </button>
                        </div>

                        {/* ─── STEP 1: Website ─── */}
                        {bulkStep === "website" && (
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold uppercase opacity-60">
                                Which website are these projects for?
                              </label>
                              <Select
                                value={bulkWebsite}
                                onValueChange={setBulkWebsite}
                              >
                                <SelectTrigger className="rounded-none h-10 text-xs">
                                  <SelectValue placeholder="Choose a website…" />
                                </SelectTrigger>
                                <SelectContent className="rounded-none">
                                  {WEBSITE_OPTIONS.map((site) => (
                                    <SelectItem
                                      key={site}
                                      value={site}
                                      className="text-xs"
                                    >
                                      {site}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              onClick={goNext}
                              disabled={!bulkWebsite}
                              className="w-full rounded-none uppercase font-bold text-[10px] h-10 tracking-widest"
                            >
                              Continue{" "}
                              <ChevronRight size={12} className="ml-1" />
                            </Button>
                          </div>
                        )}

                        {/* ─── STEP 2: Project Images ─── */}
                        {bulkStep === "images" && (
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold uppercase opacity-60">
                                Drop project background images
                              </label>
                              <p className="text-[8px] text-muted-foreground">
                                Only project images here — logos come in the
                                next step.
                              </p>

                              <div
                                {...imagesDropzone.getRootProps()}
                                className={cn(
                                  "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-all min-h-[140px]",
                                  imagesDropzone.isDragActive &&
                                    "border-primary bg-primary/5 scale-[1.01]",
                                )}
                              >
                                <input {...imagesDropzone.getInputProps()} />
                                <div className="flex flex-col items-center gap-3 text-center">
                                  <div className="p-3 rounded-full bg-muted">
                                    <ImageIcon
                                      size={18}
                                      className="text-foreground/60"
                                    />
                                  </div>
                                  <p className="text-[10px] font-black uppercase tracking-tight">
                                    {bulkItems.length > 0
                                      ? `${bulkItems.length} image${bulkItems.length !== 1 ? "s" : ""} queued — drop more`
                                      : "Drop Project Images"}
                                  </p>
                                  <p className="text-[9px] text-muted-foreground uppercase max-w-[180px] leading-relaxed">
                                    Titles & categories auto-parsed from
                                    filenames
                                  </p>
                                </div>
                              </div>

                              {/* Filename hint */}
                              <div className="bg-muted/40 border border-dashed p-3 space-y-1.5">
                                <p className="text-[8px] font-black uppercase opacity-40 tracking-widest">
                                  Filename Format
                                </p>
                                <code className="text-[9px] text-muted-foreground block font-mono">
                                  Projects_-_{"<title>"}_-_{"<1–8>"}.jpg
                                </code>
                                <div className="pt-1 border-t border-dashed grid grid-cols-2 gap-x-3 gap-y-0.5">
                                  {Object.entries(CATEGORY_MAP).map(
                                    ([num, cat]) => (
                                      <div
                                        key={num}
                                        className="flex items-center gap-1"
                                      >
                                        <span className="text-[7px] font-black text-foreground/40 w-3 shrink-0">
                                          {num}
                                        </span>
                                        <span className="text-[7px] text-muted-foreground truncate">
                                          {cat}
                                        </span>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Thumbnail preview grid */}
                            {bulkItems.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-[9px] font-black uppercase opacity-50">
                                  {bulkItems.length} project
                                  {bulkItems.length !== 1 ? "s" : ""} queued
                                </p>
                                <div className="grid grid-cols-5 gap-1 max-h-[100px] overflow-y-auto">
                                  {bulkItems.map((item) => (
                                    <div
                                      key={item.id}
                                      className="relative group"
                                    >
                                      <div className="aspect-square bg-muted border overflow-hidden">
                                        <img
                                          src={item.previewUrl}
                                          className="w-full h-full object-cover"
                                          alt=""
                                        />
                                      </div>
                                      <button
                                        onClick={() => removeBulkItem(item.id)}
                                        className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                        <X size={8} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                onClick={goBack}
                                className="rounded-none uppercase font-bold text-[9px] h-10 px-4 tracking-widest"
                              >
                                Back
                              </Button>
                              <Button
                                onClick={goNext}
                                disabled={bulkItems.length === 0}
                                className="flex-1 rounded-none uppercase font-bold text-[10px] h-10 tracking-widest"
                              >
                                {bulkItems.length} Image
                                {bulkItems.length !== 1 ? "s" : ""} — Next{" "}
                                <ChevronRight size={12} className="ml-1" />
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* ─── STEP 3: Logos ─── */}
                        {bulkStep === "logos" && (
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                                <Zap size={11} /> Drop client logos
                              </label>
                              <p className="text-[8px] text-muted-foreground">
                                Every file here is treated as a logo — never
                                saved as its own project. Auto-matched by{" "}
                                <code className="text-[8px]">
                                  Logo - {"<project name>"}.png
                                </code>
                                .
                              </p>

                              <div
                                {...logosDropzone.getRootProps()}
                                className={cn(
                                  "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-all min-h-[120px]",
                                  logosDropzone.isDragActive &&
                                    "border-amber-400 bg-amber-50/30 dark:bg-amber-950/20 scale-[1.01]",
                                )}
                              >
                                <input {...logosDropzone.getInputProps()} />
                                <div className="flex flex-col items-center gap-3 text-center">
                                  <div className="p-3 rounded-full bg-amber-50 dark:bg-amber-950/30">
                                    <Zap
                                      size={18}
                                      className="text-amber-600 dark:text-amber-400"
                                    />
                                  </div>
                                  <p className="text-[10px] font-black uppercase tracking-tight">
                                    Drop All Logo Files
                                  </p>
                                  <p className="text-[9px] text-muted-foreground uppercase max-w-[180px] leading-relaxed">
                                    Optional — skip if no logos
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Per-project match status */}
                            <div className="space-y-1">
                              <p className="text-[9px] font-black uppercase opacity-50">
                                Match Status
                              </p>
                              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                {bulkItems.map((item) => (
                                  <div
                                    key={item.id}
                                    className="flex items-center gap-2 p-1.5 border border-foreground/5 bg-muted/20"
                                  >
                                    <div className="w-8 h-8 shrink-0 bg-muted border overflow-hidden">
                                      <img
                                        src={item.previewUrl}
                                        className="w-full h-full object-cover"
                                        alt=""
                                      />
                                    </div>
                                    <span className="text-[8px] font-bold uppercase truncate flex-1 min-w-0">
                                      {item.title}
                                    </span>
                                    {item.logoPrev ? (
                                      <div className="flex items-center gap-1 shrink-0">
                                        <div className="w-6 h-6 border bg-background overflow-hidden">
                                          <img
                                            src={item.logoPrev}
                                            className="w-full h-full object-contain"
                                            alt=""
                                          />
                                        </div>
                                        <span className="text-[7px] font-black text-amber-600 dark:text-amber-400">
                                          ✓
                                        </span>
                                        <button
                                          onClick={() =>
                                            clearBulkItemLogo(item.id)
                                          }
                                          className="text-muted-foreground hover:text-destructive transition-colors"
                                        >
                                          <X size={9} />
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-[7px] font-bold uppercase text-muted-foreground/40 shrink-0">
                                        No logo
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Unmatched logos — click to assign */}
                            {unmatchedLogos.length > 0 && (
                              <div className="space-y-2 pt-2 border-t">
                                <p className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-400">
                                  {unmatchedLogos.length} Unmatched Logo
                                  {unmatchedLogos.length !== 1 ? "s" : ""}
                                </p>
                                <p className="text-[8px] text-muted-foreground">
                                  Click a logo button next to the project you
                                  want to assign it to.
                                </p>
                                {bulkItems
                                  .filter((i) => !i.logoPrev)
                                  .map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center gap-2"
                                    >
                                      <span className="text-[8px] font-bold uppercase truncate flex-1 min-w-0">
                                        {item.title}
                                      </span>
                                      <div className="flex gap-1">
                                        {unmatchedLogos.map((logo) => (
                                          <button
                                            key={logo.previewUrl}
                                            onClick={() =>
                                              assignUnmatchedLogo(item.id, logo)
                                            }
                                            title={`Assign ${logo.file.name}`}
                                            className="w-7 h-7 border-2 border-dashed border-amber-300 hover:border-amber-500 bg-muted flex items-center justify-center overflow-hidden transition-colors"
                                          >
                                            <img
                                              src={logo.previewUrl}
                                              className="w-full h-full object-contain"
                                              alt=""
                                            />
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}

                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                onClick={goBack}
                                className="rounded-none uppercase font-bold text-[9px] h-10 px-4 tracking-widest"
                              >
                                Back
                              </Button>
                              <Button
                                onClick={goNext}
                                className="flex-1 rounded-none uppercase font-bold text-[10px] h-10 tracking-widest"
                              >
                                {logoCount > 0
                                  ? `${logoCount} Logo${logoCount !== 1 ? "s" : ""} Assigned — Review`
                                  : "Skip Logos — Review"}
                                <ChevronRight size={12} className="ml-1" />
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* ─── STEP 4: Review & Upload ─── */}
                        {bulkStep === "review" && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <p className="text-[9px] font-black uppercase opacity-50">
                                {pendingCount} to upload
                                {logoCount > 0 && ` · ${logoCount} with logo`}
                              </p>
                              <button
                                onClick={() =>
                                  setBulkItems((prev) =>
                                    prev.filter((i) => i.status !== "done"),
                                  )
                                }
                                className="text-[8px] uppercase font-bold text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Clear Done
                              </button>
                            </div>

                            {isBulkUploading && (
                              <div className="space-y-1.5">
                                <Progress
                                  value={bulkProgress}
                                  className="h-1 rounded-none"
                                />
                                <p className="text-[8px] uppercase font-bold text-muted-foreground text-right">
                                  {bulkProgress}%
                                </p>
                              </div>
                            )}

                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                              {bulkItems.map((item) => (
                                <BulkReviewCard
                                  key={item.id}
                                  item={item}
                                  onRemove={removeBulkItem}
                                  onUpdateField={updateBulkItem}
                                  onLogoSet={setBulkItemLogo}
                                  onLogoClear={clearBulkItemLogo}
                                />
                              ))}
                            </div>

                            {doneCount > 0 &&
                              pendingCount === 0 &&
                              !isBulkUploading && (
                                <div className="flex items-center justify-center gap-2 py-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                                  <CheckCircle2
                                    size={13}
                                    className="text-green-600"
                                  />
                                  <span className="text-[9px] font-black uppercase text-green-700 dark:text-green-400">
                                    All {doneCount} projects uploaded
                                  </span>
                                </div>
                              )}

                            <div className="flex gap-2">
                              {!isBulkUploading && (
                                <Button
                                  variant="outline"
                                  onClick={goBack}
                                  disabled={doneCount > 0}
                                  className="rounded-none uppercase font-bold text-[9px] h-11 px-4 tracking-widest"
                                >
                                  Back
                                </Button>
                              )}
                              {isBulkUploading ? (
                                <Button
                                  onClick={handleCancelUpload}
                                  variant="destructive"
                                  className="flex-1 rounded-none uppercase font-bold text-[10px] h-11 tracking-widest"
                                >
                                  <Ban size={12} className="mr-2" /> Cancel
                                  Upload
                                </Button>
                              ) : pendingCount > 0 ? (
                                <Button
                                  onClick={handleBulkUpload}
                                  className="flex-1 rounded-none uppercase font-bold text-[10px] h-11 tracking-widest"
                                >
                                  <Upload className="h-3 w-3 mr-2" />
                                  Upload {pendingCount} Project
                                  {pendingCount !== 1 ? "s" : ""}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ═══════════════════════════ RIGHT PANEL ═══════════════════════════ */}
              <div className="lg:col-span-8 space-y-4">
                {/* Toolbar */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-muted-foreground mr-1">
                      <Filter size={10} /> Filter
                    </div>
                    {[ALL_CATEGORIES, ...CATEGORY_OPTIONS].map((cat) => {
                      const count =
                        cat === ALL_CATEGORIES
                          ? projects.length
                          : (categoryCounts[cat] ?? 0);
                      if (cat !== ALL_CATEGORIES && count === 0) return null;
                      return (
                        <button
                          key={cat}
                          onClick={() => {
                            setActiveFilter(cat);
                            setSelectedIds(new Set());
                          }}
                          className={cn(
                            "flex items-center gap-1 px-2.5 py-1 text-[8px] font-black uppercase tracking-wider border transition-all",
                            activeFilter === cat
                              ? "bg-foreground text-background border-foreground"
                              : "bg-background text-muted-foreground border-foreground/10 hover:border-foreground/40 hover:text-foreground",
                          )}
                        >
                          {cat === ALL_CATEGORIES ? "All" : cat}
                          <span
                            className={cn(
                              "text-[7px] font-black",
                              activeFilter === cat
                                ? "text-background/70"
                                : "text-muted-foreground/60",
                            )}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 h-8">
                    {!isSelectionMode ? (
                      <>
                        <button
                          onClick={() => setIsSelectionMode(true)}
                          className="flex items-center gap-1.5 text-[9px] font-black uppercase text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <CheckSquare size={12} /> Select
                        </button>
                        <span className="ml-auto text-[9px] font-bold uppercase text-muted-foreground">
                          {filteredProjects.length} project
                          {filteredProjects.length !== 1 ? "s" : ""}
                          {activeFilter !== ALL_CATEGORIES &&
                            ` · ${activeFilter}`}
                        </span>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={toggleSelectAll}
                          className="flex items-center gap-1.5 text-[9px] font-black uppercase text-foreground hover:text-foreground/70 transition-colors"
                        >
                          {allVisibleSelected ? (
                            <CheckSquare size={12} />
                          ) : someVisibleSelected ? (
                            <Minus size={12} />
                          ) : (
                            <Square size={12} />
                          )}
                          {allVisibleSelected ? "Deselect All" : "Select All"}
                        </button>
                        {selectedIds.size > 0 && (
                          <span className="text-[9px] font-bold text-muted-foreground">
                            {selectedIds.size} selected
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          {selectedIds.size > 0 && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={isBulkDeleting}
                                  className="h-7 rounded-none text-[8px] uppercase font-bold tracking-wider px-3"
                                >
                                  {isBulkDeleting ? (
                                    <Loader2 className="animate-spin h-3 w-3 mr-1.5" />
                                  ) : (
                                    <Trash2 size={10} className="mr-1.5" />
                                  )}
                                  Delete {selectedIds.size}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-none">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-sm font-bold uppercase">
                                    Confirm Bulk Deletion
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-xs">
                                    Permanently delete{" "}
                                    <strong>
                                      {selectedIds.size} selected project
                                      {selectedIds.size !== 1 ? "s" : ""}
                                    </strong>
                                    ? This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-none text-xs">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-none bg-destructive text-xs"
                                    onClick={handleBulkDelete}
                                  >
                                    Delete {selectedIds.size} Project
                                    {selectedIds.size !== 1 ? "s" : ""}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          <button
                            onClick={clearSelection}
                            className="flex items-center gap-1 text-[9px] font-black uppercase text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X size={10} /> Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Grid */}
                {loading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mb-4 shadow-sm">
                      <FolderPlus className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                      {activeFilter === ALL_CATEGORIES
                        ? "No Projects"
                        : `No ${activeFilter} Projects`}
                    </h3>
                    <p className="text-[11px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
                      {activeFilter === ALL_CATEGORIES
                        ? "Add a project using the panel on the left."
                        : "No projects found for this category."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredProjects.map((project) => {
                      const isSelected = selectedIds.has(project.id);
                      return (
                        <Card
                          key={project.id}
                          onClick={() =>
                            isSelectionMode && toggleSelection(project.id)
                          }
                          className={cn(
                            "rounded-none shadow-none group relative overflow-hidden border-foreground/10 transition-all",
                            isSelectionMode && "cursor-pointer",
                            isSelected &&
                              "ring-2 ring-foreground border-foreground",
                          )}
                        >
                          <div className="aspect-[4/3] relative bg-muted border-b overflow-hidden">
                            <img
                              src={project.imageUrl || "/placeholder.png"}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              alt={project.title}
                            />

                            {isSelectionMode && (
                              <div
                                className={cn(
                                  "absolute inset-0 transition-all duration-200",
                                  isSelected
                                    ? "bg-foreground/30"
                                    : "bg-transparent group-hover:bg-foreground/10",
                                )}
                              >
                                <div
                                  className={cn(
                                    "absolute top-2 left-2 w-6 h-6 border-2 flex items-center justify-center transition-all",
                                    isSelected
                                      ? "bg-foreground border-foreground"
                                      : "bg-white/80 border-white",
                                  )}
                                >
                                  {isSelected && (
                                    <CheckCircle2
                                      size={14}
                                      className="text-background"
                                    />
                                  )}
                                </div>
                              </div>
                            )}

                            {project.logoUrl && !isSelectionMode && (
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                <img
                                  src={project.logoUrl}
                                  className="w-24 h-24 object-contain"
                                  alt={`${project.title} logo`}
                                />
                              </div>
                            )}

                            {!isSelectionMode && (
                              <div className="absolute top-2 right-2 flex gap-1">
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="h-7 w-7 rounded-none shadow-sm"
                                  onClick={() => handleEditClick(project)}
                                >
                                  <Pencil size={12} />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="destructive"
                                      className="h-7 w-7 rounded-none shadow-sm"
                                    >
                                      <Trash2 size={12} />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="rounded-none">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className="text-sm font-bold uppercase">
                                        Confirm Removal
                                      </AlertDialogTitle>
                                      <AlertDialogDescription className="text-xs">
                                        Delete "{project.title}"? This cannot be
                                        undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="rounded-none text-xs">
                                        Cancel
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        className="rounded-none bg-destructive text-xs"
                                        onClick={() =>
                                          deleteDoc(
                                            doc(db, "projects", project.id),
                                          )
                                        }
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </div>

                          <div className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-[11px] font-black uppercase truncate">
                                {project.title}
                              </h3>
                              <Badge
                                variant="outline"
                                className="rounded-none text-[7px] px-1 h-4 uppercase shrink-0"
                              >
                                {project.website?.split(" ")[0] ?? "—"}
                              </Badge>
                            </div>
                            {project.description && (
                              <p className="text-[9px] text-muted-foreground uppercase line-clamp-2 italic">
                                {project.description}
                              </p>
                            )}
                            <div className="flex gap-1 flex-wrap pt-1">
                              <Badge
                                variant="secondary"
                                className="rounded-none text-[7px] px-1.5 h-4 uppercase"
                              >
                                {project.category}
                              </Badge>
                              {project.logoUrl && (
                                <Badge
                                  variant="secondary"
                                  className="rounded-none text-[7px] px-1.5 h-4 uppercase"
                                >
                                  Logo Active
                                </Badge>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
