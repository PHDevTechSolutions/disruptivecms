"use client";

import React, { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
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
  ChevronRight,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
};

type BulkItem = {
  id: string; // temp local id
  file: File;
  previewUrl: string;
  title: string;
  category: string;
  status: "pending" | "uploading" | "done" | "error";
  // Logo (matched from LOGO - <title>.ext files)
  logoFile?: File;
  logoPrev?: string;
};

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

const WEBSITE_OPTIONS = [
  "Disruptive Solutions Inc",
  "Ecoshift Corporation",
  "Value Acquisitions Holdings",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses filenames like:
 *   "Projects_-_30th_SEA_Games_2019_-_5.png"
 *   "Projects - 30th SEA Games 2019 - 5.png"
 *
 * Returns { title, category }
 */
function parseProjectFilename(filename: string): {
  title: string;
  category: string;
} {
  // Strip extension
  const base = filename.replace(/\.[^/.]+$/, "");

  // Normalise separators: replace "_-_" or " - " with a pipe for splitting
  const normalised = base.replace(/_-_/g, "|").replace(/ - /g, "|");
  const parts = normalised.split("|");

  // Expect: ["Projects", "<title>", "<number>"]
  // Be flexible — title is everything between first and last segment
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

/**
 * Detects logo files and extracts the matched project title.
 * Supports formats like:
 *   "LOGO - 30th SEA Games 2019.png"
 *   "LOGO_-_30th_SEA_Games_2019.png"
 * Returns the project title string, or null if not a logo file.
 */
function parseLogoFilename(filename: string): string | null {
  const base = filename.replace(/\.[^/.]+$/, "");
  const normalised = base.replace(/_-_/g, "|").replace(/ - /g, "|");
  const parts = normalised.split("|");
  if (parts[0]?.trim().toUpperCase() !== "Logo") return null;
  return parts.slice(1).join(" ").replace(/_/g, " ").trim();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");

  // ── Single form state ──
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [website, setWebsite] = useState(WEBSITE_OPTIONS[0]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePrev, setImagePrev] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPrev, setLogoPrev] = useState<string | null>(null);

  // ── Bulk state ──
  const [bulkWebsite, setBulkWebsite] = useState<string>("");
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  // ── Real-time sync ──
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

  // ── Single dropzones ──
  const backgroundDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (files) => {
      setImageFile(files[0]);
      setImagePrev(URL.createObjectURL(files[0]));
    },
  });

  const logoDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (files) => {
      setLogoFile(files[0]);
      setLogoPrev(URL.createObjectURL(files[0]));
    },
  });

  // ── Bulk dropzone ──
  const onBulkDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (!bulkWebsite) return;

      const logoFiles: { title: string; file: File }[] = [];
      const projectFiles: File[] = [];

      // Separate logos from project images
      for (const file of acceptedFiles) {
        const logoTitle = parseLogoFilename(file.name);
        if (logoTitle) {
          logoFiles.push({ title: logoTitle, file });
        } else {
          projectFiles.push(file);
        }
      }

      // Build new project items
      const newItems: BulkItem[] = projectFiles.map((file) => {
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

      setBulkItems((prev) => {
        // Combine existing + new project items
        const allItems = [...prev, ...newItems];

        // Match logo files against all items (existing + new) by title
        for (const logo of logoFiles) {
          const matchIndex = allItems.findIndex(
            (item) =>
              item.title.trim().toLowerCase() ===
              logo.title.trim().toLowerCase(),
          );
          if (matchIndex !== -1) {
            allItems[matchIndex] = {
              ...allItems[matchIndex],
              logoFile: logo.file,
              logoPrev: URL.createObjectURL(logo.file),
            };
          } else {
            // No matching project found — warn via toast after state update
            setTimeout(() => {
              toast.warning(
                `Logo "${logo.file.name}" — no matching project found for "${logo.title}"`,
              );
            }, 0);
          }
        }

        if (logoFiles.length > 0 && projectFiles.length === 0) {
          // Only logos were dropped — show a summary
          const matched = logoFiles.filter((logo) =>
            allItems.some(
              (item) =>
                item.title.trim().toLowerCase() ===
                logo.title.trim().toLowerCase(),
            ),
          ).length;
          setTimeout(() => {
            toast.info(
              `${matched} of ${logoFiles.length} logo(s) matched to existing projects`,
            );
          }, 0);
        }

        return allItems;
      });
    },
    [bulkWebsite],
  );

  const bulkDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: true,
    disabled: !bulkWebsite,
    onDrop: onBulkDrop,
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

      let finalLogoUrl = logoPrev;
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
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error("Error saving project");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const resetForm = () => {
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

  // ── Bulk submit ──
  const handleBulkUpload = async () => {
    const pending = bulkItems.filter((i) => i.status === "pending");
    if (!pending.length) return toast.error("No pending items to upload");

    setIsBulkUploading(true);
    setBulkProgress(0);

    let done = 0;
    for (const item of pending) {
      setBulkItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i)),
      );
      try {
        const imageUrl = await uploadToCloudinary(item.file);

        // Upload logo if one was matched
        let logoUrl: string | null = null;
        if (item.logoFile) {
          logoUrl = await uploadToCloudinary(item.logoFile);
        }

        await addDoc(collection(db, "projects"), {
          title: item.title,
          description: "",
          category: item.category,
          website: bulkWebsite,
          imageUrl,
          logoUrl,
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
    toast.success(`${done} project(s) uploaded`);
  };

  const removeBulkItem = (id: string) => {
    setBulkItems((prev) => prev.filter((i) => i.id !== id));
  };

  const updateBulkItem = (
    id: string,
    field: "title" | "category",
    value: string,
  ) => {
    setBulkItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    );
  };

  const pendingCount = bulkItems.filter((i) => i.status === "pending").length;
  const doneCount = bulkItems.filter((i) => i.status === "done").length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* ── Header ── */}
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
              {/* ══════════════════════════════════════════════
                  LEFT PANEL — FORM (Single) / BULK UPLOAD
              ══════════════════════════════════════════════ */}
              <div className="lg:col-span-4 sticky top-6 z-10">
                <Card className="rounded-none shadow-none border-foreground/10 max-h-[calc(100vh-6rem)] overflow-y-auto">
                  {/* Tab Header */}
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

                    {/* Edit mode indicator for single tab */}
                    {activeTab === "single" && editId && (
                      <div className="flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-800">
                        <span className="text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400">
                          Editing Project
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={resetForm}
                          className="h-6 rounded-none text-[8px] uppercase font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 px-2"
                        >
                          <RotateCcw className="mr-1 h-2.5 w-2.5" /> Cancel
                        </Button>
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="pt-5 space-y-5">
                    {/* ════════════════════════════════
                        SINGLE PROJECT FORM
                    ════════════════════════════════ */}
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

                        {/* Background Cover */}
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
                            {...logoDropzone.getRootProps()}
                            className={cn(
                              "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors min-h-[100px]",
                              logoDropzone.isDragActive &&
                                "border-primary bg-primary/5",
                            )}
                          >
                            <input {...logoDropzone.getInputProps()} />
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

                    {/* ════════════════════════════════
                        BULK UPLOAD PANEL
                    ════════════════════════════════ */}
                    {activeTab === "bulk" && (
                      <div className="space-y-5">
                        {/* Step 1: Select Website */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-foreground text-background text-[8px] font-black">
                              1
                            </span>
                            Select Website First
                          </label>
                          <Select
                            value={bulkWebsite}
                            onValueChange={setBulkWebsite}
                          >
                            <SelectTrigger className="rounded-none h-10 text-xs">
                              <SelectValue placeholder="Choose a website to continue…" />
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

                        {/* Step 2: Dropzone (locked until website chosen) */}
                        <div className="space-y-1.5">
                          <label
                            className={cn(
                              "text-[10px] font-bold uppercase flex items-center gap-1.5 transition-opacity",
                              bulkWebsite ? "opacity-60" : "opacity-30",
                            )}
                          >
                            <span
                              className={cn(
                                "inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-black transition-colors",
                                bulkWebsite
                                  ? "bg-foreground text-background"
                                  : "bg-muted-foreground/20 text-muted-foreground",
                              )}
                            >
                              2
                            </span>
                            Drop Multiple Images
                          </label>

                          <div
                            {...bulkDropzone.getRootProps()}
                            className={cn(
                              "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-none transition-all min-h-[140px]",
                              bulkWebsite
                                ? "cursor-pointer hover:bg-accent"
                                : "cursor-not-allowed opacity-40 bg-muted/30",
                              bulkDropzone.isDragActive &&
                                bulkWebsite &&
                                "border-primary bg-primary/5 scale-[1.01]",
                            )}
                          >
                            <input {...bulkDropzone.getInputProps()} />
                            <div className="flex flex-col items-center gap-3 text-center">
                              <div
                                className={cn(
                                  "p-3 rounded-full transition-colors",
                                  bulkWebsite ? "bg-muted" : "bg-muted/50",
                                )}
                              >
                                <Upload
                                  size={18}
                                  className={cn(
                                    bulkWebsite
                                      ? "text-foreground/60"
                                      : "text-muted-foreground/30",
                                  )}
                                />
                              </div>
                              {bulkWebsite ? (
                                <>
                                  <p className="text-[10px] font-black uppercase tracking-tight">
                                    Drop All Project Images
                                  </p>
                                  <p className="text-[9px] text-muted-foreground uppercase max-w-[180px] leading-relaxed">
                                    Titles & categories auto-parsed from
                                    filenames
                                  </p>
                                </>
                              ) : (
                                <p className="text-[10px] font-bold uppercase text-muted-foreground/60">
                                  Select a website above to unlock
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Filename format hint */}
                          {bulkWebsite && (
                            <div className="bg-muted/40 border border-dashed p-3 space-y-2">
                              <div className="space-y-0.5">
                                <p className="text-[8px] font-black uppercase opacity-40 tracking-widest">
                                  Project Filename Format
                                </p>
                                <code className="text-[9px] text-muted-foreground block font-mono">
                                  Projects_-_{"<n>"}_-_{"<1–8>"}.jpg
                                </code>
                              </div>
                              <div className="space-y-0.5 pt-1 border-t border-dashed">
                                <p className="text-[8px] font-black uppercase opacity-40 tracking-widest flex items-center gap-1 pt-1">
                                  <Zap size={8} /> Logo Filename Format
                                </p>
                                <code className="text-[9px] text-amber-600 dark:text-amber-400 block font-mono">
                                  Logo - {"<matching project name>"}.png
                                </code>
                                <p className="text-[7px] text-muted-foreground/60 italic">
                                  Drop logos alongside project images —
                                  auto-matched by name
                                </p>
                              </div>
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
                          )}
                        </div>

                        {/* Bulk Items List */}
                        {bulkItems.length > 0 && (
                          <div className="space-y-2 pt-2 border-t">
                            <div className="flex items-center justify-between">
                              <p className="text-[9px] font-black uppercase opacity-50">
                                {bulkItems.length} Image
                                {bulkItems.length !== 1 ? "s" : ""} Queued
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

                            {/* Progress bar during upload */}
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

                            {/* Item rows */}
                            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                              {bulkItems.map((item) => (
                                <div
                                  key={item.id}
                                  className={cn(
                                    "flex gap-2 p-2 border transition-colors",
                                    item.status === "done" &&
                                      "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800",
                                    item.status === "error" &&
                                      "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
                                    item.status === "uploading" &&
                                      "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800",
                                    item.status === "pending" &&
                                      "border-foreground/10",
                                  )}
                                >
                                  {/* Project Thumb */}
                                  <div className="w-12 h-12 shrink-0 bg-muted border overflow-hidden relative">
                                    <img
                                      src={item.previewUrl}
                                      className="w-full h-full object-cover"
                                      alt=""
                                    />
                                    {item.status === "uploading" && (
                                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                        <Loader2
                                          size={12}
                                          className="animate-spin text-white"
                                        />
                                      </div>
                                    )}
                                    {item.status === "done" && (
                                      <div className="absolute inset-0 bg-green-500/60 flex items-center justify-center">
                                        <CheckCircle2
                                          size={12}
                                          className="text-white"
                                        />
                                      </div>
                                    )}
                                    {item.status === "error" && (
                                      <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center">
                                        <AlertCircle
                                          size={12}
                                          className="text-white"
                                        />
                                      </div>
                                    )}
                                  </div>

                                  {/* Editable fields + logo indicator */}
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <Input
                                      value={item.title}
                                      onChange={(e) =>
                                        updateBulkItem(
                                          item.id,
                                          "title",
                                          e.target.value,
                                        )
                                      }
                                      disabled={item.status !== "pending"}
                                      className="rounded-none h-6 text-[9px] font-bold uppercase px-1.5 py-0"
                                    />
                                    <Select
                                      value={item.category}
                                      onValueChange={(v) =>
                                        updateBulkItem(item.id, "category", v)
                                      }
                                      disabled={item.status !== "pending"}
                                    >
                                      <SelectTrigger className="rounded-none h-6 text-[8px] px-1.5">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent className="rounded-none">
                                        {CATEGORY_OPTIONS.map((cat) => (
                                          <SelectItem
                                            key={cat}
                                            value={cat}
                                            className="text-[9px]"
                                          >
                                            {cat}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>

                                    {/* Logo match badge */}
                                    {item.logoPrev ? (
                                      <div className="flex items-center gap-1.5 pt-0.5">
                                        <div className="w-5 h-5 border bg-muted overflow-hidden shrink-0">
                                          <img
                                            src={item.logoPrev}
                                            className="w-full h-full object-contain"
                                            alt="logo"
                                          />
                                        </div>
                                        <span className="text-[7px] font-black uppercase text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                          <Zap size={8} />
                                          Logo Matched
                                        </span>
                                        {item.status === "pending" && (
                                          <button
                                            onClick={() =>
                                              setBulkItems((prev) =>
                                                prev.map((i) =>
                                                  i.id === item.id
                                                    ? {
                                                        ...i,
                                                        logoFile: undefined,
                                                        logoPrev: undefined,
                                                      }
                                                    : i,
                                                ),
                                              )
                                            }
                                            className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                                          >
                                            <X size={9} />
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1 pt-0.5 opacity-30">
                                        <Zap
                                          size={8}
                                          className="text-muted-foreground"
                                        />
                                        <span className="text-[7px] uppercase font-bold text-muted-foreground">
                                          No Logo
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Remove button */}
                                  {item.status === "pending" && (
                                    <button
                                      onClick={() => removeBulkItem(item.id)}
                                      className="shrink-0 self-start p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                      <X size={12} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Upload All CTA */}
                            {pendingCount > 0 && (
                              <Button
                                onClick={handleBulkUpload}
                                disabled={isBulkUploading}
                                className="w-full rounded-none uppercase font-bold text-[10px] h-11 tracking-widest mt-3"
                              >
                                {isBulkUploading ? (
                                  <>
                                    <Loader2 className="animate-spin h-3 w-3 mr-2" />
                                    Uploading {pendingCount} Project
                                    {pendingCount !== 1 ? "s" : ""}…
                                  </>
                                ) : (
                                  <>
                                    <Upload className="h-3 w-3 mr-2" />
                                    Upload {pendingCount} Project
                                    {pendingCount !== 1 ? "s" : ""}
                                  </>
                                )}
                              </Button>
                            )}

                            {doneCount > 0 && pendingCount === 0 && (
                              <div className="flex items-center justify-center gap-2 py-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                                <CheckCircle2
                                  size={13}
                                  className="text-green-600"
                                />
                                <span className="text-[9px] font-black uppercase text-green-700 dark:text-green-400">
                                  All {doneCount} projects uploaded successfully
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ══════════════════════════════════════════════
                  RIGHT PANEL — PROJECT GRID
              ══════════════════════════════════════════════ */}
              <div className="lg:col-span-8">
                {loading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : projects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mb-4 shadow-sm">
                      <FolderPlus className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                      No Projects
                    </h3>
                    <p className="text-[11px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
                      Your portfolio is currently empty. Add a project using the
                      panel on the left.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {projects.map((project) => (
                      <Card
                        key={project.id}
                        className="rounded-none shadow-none group relative overflow-hidden border-foreground/10"
                      >
                        <div className="aspect-[4/3] relative bg-muted border-b overflow-hidden">
                          <img
                            src={project.imageUrl || "/placeholder.png"}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            alt={project.title}
                          />
                          {project.logoUrl && (
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                              <img
                                src={project.logoUrl}
                                className="w-24 h-24 object-contain"
                                alt={`${project.title} logo`}
                              />
                            </div>
                          )}
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
                                      deleteDoc(doc(db, "projects", project.id))
                                    }
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
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
                    ))}
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
