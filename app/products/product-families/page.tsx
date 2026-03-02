"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore";
import {
  Pencil,
  Trash2,
  Image as ImageIcon,
  Loader2,
  Check,
  X,
  RotateCcw,
  Layers,
  FolderPlus,
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const WEBSITE_OPTIONS = [
  "Disruptive Solutions Inc",
  "Ecoshift Corporation",
  "Value Acquisitions Holdings",
  "Taskflow",
  "Shopify",
];

/**
 * These labels appear in the TDS PDF but are image placeholder slots, NOT
 * specification fields. They must be excluded from SpecGroup creation.
 */
const NON_SPEC_FIELDS = new Set([
  "DIMENSIONAL DRAWING",
  "RECOMMENDED MOUNTING HEIGHT",
  "DRIVER COMPATIBILITY",
  "BASE",
  "ILLUMINANCE LEVEL",
  "WIRING DIAGRAM",
  "INSTALLATION",
  "WIRING LAYOUT",
  "TERMINAL LAYOUT",
  "ACCESSORIES",
  "ACCESORIOS", // common typo variant
  // Metadata rows — not specs
  "BRAND",
  "ITEM CODE",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedGroup {
  name: string;
  items: string[];
}

interface ParsedPdfResult {
  title: string;
  groups: ParsedGroup[];
}

type LogLevel = "info" | "success" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  msg: string;
}

type FileStep = "idle" | "uploading" | "parsing" | "saving" | "done" | "error";

interface FileStatus {
  file: File;
  step: FileStep;
  title: string;
  logs: LogEntry[];
  pdfUrl?: string;
  expanded: boolean;
}

async function parseTdsPdf(file: File): Promise<ParsedPdfResult> {
  // Dynamic import keeps the pdfjs bundle out of the initial chunk
  const pdfjsLib = await import("pdfjs-dist");

  // ✅ FIX: unpkg mirrors npm exactly and hosts .mjs workers required for
  // pdfjs-dist v4+. cdnjs only has the legacy .js build (v2/v3).
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) })
    .promise;

  // ── Derive title ──────────────────────────────────────────────────────────
  let title = file.name
    .replace(/\.pdf$/i, "")
    .replace(/[_\-]+/g, " ")
    .trim()
    .toUpperCase();

  try {
    const meta = await pdf.getMetadata();
    const metaTitle = (meta.info as Record<string, any>)?.Title?.trim();
    if (metaTitle) title = metaTitle.toUpperCase();
  } catch {
    // metadata unavailable — filename fallback already set
  }

  // ── Extract text from page 1 only ─────────────────────────────────────────
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const pageWidth = viewport.width;
  // Only consider text in the LEFT half of the page (label column)
  const LEFT_CUTOFF = pageWidth * 0.5;

  const textContent = await page.getTextContent();

  // Collect positioned text items from the label column
  const rawItems: { text: string; y: number; x: number }[] = [];
  for (const item of textContent.items) {
    if (!("str" in item)) continue;
    const str = (item as any).str.trim();
    if (!str || str === ":") continue;

    const x: number = (item as any).transform[4];
    const y: number = (item as any).transform[5];

    // Skip right-column items (values, colons, brand text)
    if (x > LEFT_CUTOFF) continue;

    rawItems.push({ text: str, y, x });
  }

  // Sort top-to-bottom (PDF Y is bottom-up, so descending = document order)
  rawItems.sort((a, b) => b.y - a.y);

  // Merge items on the same line (Y within 3pt)
  const Y_THRESHOLD = 3;
  const lines: string[] = [];
  let lineBuffer: { text: string; x: number }[] = [];
  let lineY = NaN;

  const flushLine = () => {
    if (lineBuffer.length === 0) return;
    lineBuffer.sort((a, b) => a.x - b.x);
    const merged = lineBuffer
      .map((l) => l.text)
      .join(" ")
      .trim();
    if (merged) lines.push(merged);
    lineBuffer = [];
  };

  for (const item of rawItems) {
    if (isNaN(lineY) || Math.abs(item.y - lineY) > Y_THRESHOLD) {
      flushLine();
      lineY = item.y;
    }
    lineBuffer.push({ text: item.text, x: item.x });
  }
  flushLine();

  // ── Classify lines → groups ───────────────────────────────────────────────
  const groups: ParsedGroup[] = [];
  let currentGroup: ParsedGroup | null = null;

  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;

    // Detect section header: ALL letters are uppercase (Title Case items fail this)
    const letters = clean.replace(/[^a-zA-Z]/g, "");
    const isHeader =
      letters.length > 0 &&
      letters === letters.toUpperCase() &&
      !NON_SPEC_FIELDS.has(clean.toUpperCase());

    if (isHeader) {
      // Save previous group before starting a new one
      if (currentGroup && currentGroup.items.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = { name: clean.toUpperCase().trim(), items: [] };
    } else {
      // Field label — add to current group if not excluded
      if (!currentGroup) continue;
      const labelKey = clean.toUpperCase().trim();
      if (!labelKey || NON_SPEC_FIELDS.has(labelKey)) continue;
      if (!currentGroup.items.includes(labelKey)) {
        currentGroup.items.push(labelKey);
      }
    }
  }

  // Flush the last group
  if (currentGroup && currentGroup.items.length > 0) {
    groups.push(currentGroup);
  }

  return { title, groups };
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function StepIcon({ step }: { step: FileStep }) {
  if (step === "done")
    return (
      <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
    );
  if (step === "error")
    return <XCircle size={14} className="text-destructive flex-shrink-0" />;
  if (step === "idle")
    return (
      <Clock size={14} className="text-muted-foreground/40 flex-shrink-0" />
    );
  return (
    <Loader2 size={14} className="animate-spin text-primary flex-shrink-0" />
  );
}

function stepLabel(step: FileStep): string {
  return (
    {
      idle: "Queued",
      uploading: "Uploading PDF…",
      parsing: "Parsing AcroForm…",
      saving: "Saving to Firestore…",
      done: "Complete",
      error: "Failed",
    }[step] ?? step
  );
}

function logColor(level: LogLevel): string {
  return (
    {
      info: "text-muted-foreground",
      success: "text-emerald-600 dark:text-emerald-400",
      warn: "text-amber-500",
      error: "text-destructive",
    }[level] ?? "text-muted-foreground"
  );
}

function logPrefix(level: LogLevel): string {
  return { info: "·", success: "✓", warn: "~", error: "✕" }[level] ?? "·";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CategoryMaintenance() {
  const CLOUDINARY_UPLOAD_PRESET = "taskflow_preset";
  const CLOUDINARY_CLOUD_NAME = "dvmpn8mjh";

  // ── Shared data ─────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<any[]>([]);
  const [specifications, setSpecifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Manual form ──────────────────────────────────────────────────────────
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [openSpecs, setOpenSpecs] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedWebsites, setSelectedWebsites] = useState<string[]>([]);
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // ── Tab ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"manual" | "bulk">("manual");

  // ── Bulk upload ──────────────────────────────────────────────────────────
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // ── Firestore listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "productfamilies"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, "specs"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setSpecifications(
        snap.docs.map((d) => ({ id: d.id, name: d.data().name })),
      );
    });
  }, []);

  // ── Image dropzone (manual form) ─────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (files) => {
      const f = files[0];
      setImageFile(f);
      setPreviewUrl(URL.createObjectURL(f));
    },
  });

  // ── PDF dropzone (bulk upload) ────────────────────────────────────────────
  const {
    getRootProps: pdfRoot,
    getInputProps: pdfInput,
    isDragActive: isPdfDragActive,
  } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    multiple: true,
    onDrop: (accepted, rejected) => {
      if (rejected.length > 0) {
        toast.error(`${rejected.length} file(s) rejected — PDF only`);
      }
      if (accepted.length === 0) return;

      const newEntries: FileStatus[] = accepted.map((f) => ({
        file: f,
        step: "idle",
        title: f.name
          .replace(/\.pdf$/i, "")
          .replace(/[_\-]+/g, " ")
          .toUpperCase(),
        logs: [],
        expanded: false,
      }));
      setFileStatuses((prev) => [...prev, ...newEntries]);
    },
  });

  // ── Manual form helpers ───────────────────────────────────────────────────
  const resetForm = () => {
    setEditId(null);
    setTitle("");
    setDescription("");
    setSelectedWebsites([]);
    setSelectedSpecs([]);
    setImageFile(null);
    setPreviewUrl("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || selectedWebsites.length === 0)
      return toast.error("Required fields missing");

    setIsSubmitLoading(true);
    try {
      let finalImageUrl = previewUrl;
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: "POST", body: fd },
        );
        finalImageUrl = (await res.json()).secure_url;
      }

      const payload = {
        title: title.toUpperCase(),
        description,
        websites: selectedWebsites,
        specifications: selectedSpecs,
        imageUrl: finalImageUrl,
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await updateDoc(doc(db, "productfamilies", editId), payload);
        toast.success("Updated Successfully");
      } else {
        await addDoc(collection(db, "productfamilies"), {
          ...payload,
          isActive: true,
          createdAt: serverTimestamp(),
        });
        toast.success("Category Created");
      }
      resetForm();
    } catch {
      toast.error("Error processing request");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleBulkUpdateWebsites = async () => {
    if (selectedWebsites.length === 0)
      return toast.error("Select at least one website first.");
    setIsBulkUpdating(true);
    try {
      await Promise.all(
        categories.map((cat) =>
          updateDoc(doc(db, "productfamilies", cat.id), {
            websites: selectedWebsites,
            updatedAt: serverTimestamp(),
          }),
        ),
      );
      toast.success(`Updated ${categories.length} categories`);
    } catch {
      toast.error("Bulk update failed");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // ── Bulk upload helpers ─────────────────────────��─────────────────────────

  /** Upload a raw file (PDF) to Cloudinary and return the secure URL. */
  const uploadRawToCloudinary = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`,
      { method: "POST", body: fd },
    );
    const json = await res.json();
    if (!json?.secure_url)
      throw new Error(json?.error?.message ?? "Cloudinary raw upload failed");
    return json.secure_url as string;
  };

  /** Mutate a single FileStatus entry by index. */
  const patchFile = useCallback((idx: number, patch: Partial<FileStatus>) => {
    setFileStatuses((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  /** Append a log entry to a FileStatus by index. */
  const appendLog = useCallback((idx: number, level: LogLevel, msg: string) => {
    setFileStatuses((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        logs: [...next[idx].logs, { level, msg }],
        // Auto-expand logs when saving starts
        expanded: next[idx].expanded || level !== "info",
      };
      return next;
    });
  }, []);

  /**
   * Main bulk processing loop.
   *
   * For each queued PDF:
   *  1. Upload PDF → Cloudinary (raw) → tdsTemplate URL
   *  2. Parse AcroForm fields → groups
   *  3. Upsert each SpecGroup (create or extend, no duplicates)
   *  4. Create ProductFamily document with tdsTemplate + specGroup IDs
   */
  const processBulkPdfs = async () => {
    const pending = fileStatuses.filter((f) => f.step === "idle");
    if (pending.length === 0) return;
    setIsBulkProcessing(true);

    // Snapshot current spec groups from Firestore for deduplication
    const specsSnap = await getDocs(collection(db, "specs"));
    // Map: UPPERCASE_GROUP_NAME → { id, existingLabels: Set<uppercase_label> }
    const groupCache = new Map<string, { id: string; labels: Set<string> }>();
    specsSnap.forEach((d) => {
      const data = d.data();
      const name = (data.name as string).toUpperCase().trim();
      const labels = new Set<string>(
        ((data.items as { label: string }[]) || []).map((i) =>
          i.label.toUpperCase().trim(),
        ),
      );
      groupCache.set(name, { id: d.id, labels });
    });

    for (let idx = 0; idx < fileStatuses.length; idx++) {
      const fs = fileStatuses[idx];
      if (fs.step !== "idle") continue;

      try {
        // ── Step 1: Upload PDF to Cloudinary ──────────────────────────────
        patchFile(idx, { step: "uploading" });
        appendLog(idx, "info", `Uploading "${fs.file.name}"…`);

        const pdfUrl = await uploadRawToCloudinary(fs.file);
        appendLog(idx, "success", `PDF stored on Cloudinary`);

        // ── Step 2: Parse AcroForm ────────────────────────────────────────
        patchFile(idx, { step: "parsing" });
        appendLog(idx, "info", "Extracting AcroForm structure…");

        const parsed = await parseTdsPdf(fs.file);

        patchFile(idx, { title: parsed.title });
        appendLog(idx, "info", `Title → "${parsed.title}"`);
        appendLog(
          idx,
          "info",
          `Found ${parsed.groups.length} spec group(s): ${parsed.groups.map((g) => g.name).join(", ")}`,
        );

        if (parsed.groups.length === 0) {
          appendLog(
            idx,
            "warn",
            "No spec groups found — only ProductFamily will be created",
          );
        }

        // ── Step 3: Upsert SpecGroups ─────────────────────────────────────
        patchFile(idx, { step: "saving" });
        const specGroupIds: string[] = [];

        for (const group of parsed.groups) {
          const groupKey = group.name.toUpperCase().trim();
          const cached = groupCache.get(groupKey);

          if (cached) {
            // Group already exists — find genuinely new labels
            const newLabels = group.items.filter(
              (item) => !cached.labels.has(item.toUpperCase().trim()),
            );

            if (newLabels.length > 0) {
              const merged = [
                ...Array.from(cached.labels).map((l) => ({ label: l })),
                ...newLabels.map((l) => ({ label: l.toUpperCase() })),
              ];
              await updateDoc(doc(db, "specs", cached.id), {
                items: merged,
                updatedAt: serverTimestamp(),
              });
              newLabels.forEach((l) => {
                cached.labels.add(l.toUpperCase().trim());
                appendLog(
                  idx,
                  "success",
                  `  + Spec "${l}" added to existing group "${group.name}"`,
                );
              });
            } else {
              appendLog(
                idx,
                "warn",
                `  Group "${group.name}" already up-to-date (${group.items.length} specs skipped)`,
              );
            }

            specGroupIds.push(cached.id);
          } else {
            // Create brand-new SpecGroup
            const newRef = await addDoc(collection(db, "specs"), {
              name: groupKey,
              items: group.items.map((l) => ({ label: l.toUpperCase() })),
              isActive: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            // Populate cache for subsequent PDFs in the same batch
            groupCache.set(groupKey, {
              id: newRef.id,
              labels: new Set(group.items.map((l) => l.toUpperCase().trim())),
            });
            specGroupIds.push(newRef.id);
            appendLog(
              idx,
              "success",
              `  ✦ Created group "${group.name}" with ${group.items.length} spec(s)`,
            );
          }
        }

        // ── Step 4: Build TDS Spec Mapping ───────────────────────────────
        // Extract which spec items are relevant based on TDS template fields
        let tdsSpecMapping: Record<string, string[]> = {};
        try {
          const { buildTdsSpecMapping } = await import("@/lib/fillTdsPdf");
          const specGroupsForMapping = parsed.groups.map((g) => ({
            id: groupCache.get(g.name.toUpperCase().trim())?.id || "",
            name: g.name,
            items: g.items.map((label) => ({ label })),
          }));
          tdsSpecMapping = await buildTdsSpecMapping(pdfUrl, specGroupsForMapping);
          appendLog(idx, "info", "TDS spec mapping computed");
        } catch (e) {
          appendLog(idx, "warn", "Could not compute TDS spec mapping (will use all specs)");
        }

        // ── Step 5: Create ProductFamily ──────────────────────────────────
        await addDoc(collection(db, "productfamilies"), {
          title: parsed.title,
          description: "",
          websites: [],
          specifications: specGroupIds,
          imageUrl: "",
          tdsTemplate: pdfUrl,
          tdsSpecMapping: tdsSpecMapping, // Store filtered spec items per group
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        appendLog(idx, "success", `ProductFamily "${parsed.title}" created`);
        patchFile(idx, { step: "done", pdfUrl });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        appendLog(idx, "error", msg);
        patchFile(idx, { step: "error" });
      }
    }

    setIsBulkProcessing(false);

    const doneCount = fileStatuses.filter(
      (_, i) => fileStatuses[i]?.step === "done",
    ).length;
    toast.success(`Bulk processing complete — check logs for details`);
  };

  // ── JSX ──────────────────────────────────────────────────────────────────

  const pendingCount = fileStatuses.filter((f) => f.step === "idle").length;

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* ── Top bar ── */}
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
                  <BreadcrumbPage>Maintenance</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Product Families
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage product families and specifications.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* ══════════════ FORM COLUMN ══════════════ */}
              <div className="lg:col-span-4 sticky top-6 z-10">
                <Card className="rounded-none shadow-none border-foreground/10 max-h-[calc(100vh-6rem)] overflow-y-auto">
                  {/* ── Card Header with tabs ── */}
                  <CardHeader className="border-b py-0 sticky top-0 bg-background z-10">
                    {/* Tab strip */}
                    <div className="flex">
                      <button
                        type="button"
                        onClick={() => setActiveTab("manual")}
                        className={cn(
                          "flex-1 py-3.5 text-[9px] font-black uppercase tracking-widest transition-colors border-b-2",
                          activeTab === "manual"
                            ? "border-foreground text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {editId ? "Edit Category" : "Add Category"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("bulk")}
                        className={cn(
                          "flex-1 py-3.5 text-[9px] font-black uppercase tracking-widest transition-colors border-b-2 flex items-center justify-center gap-1.5",
                          activeTab === "bulk"
                            ? "border-foreground text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Upload size={10} />
                        PDF Bulk Upload
                        {fileStatuses.length > 0 && (
                          <span className="bg-primary text-primary-foreground text-[7px] font-black rounded-full px-1 py-px min-w-[14px] text-center leading-tight">
                            {fileStatuses.length}
                          </span>
                        )}
                      </button>
                    </div>
                  </CardHeader>

                  {/* ══ TAB: Manual Add / Edit ══ */}
                  {activeTab === "manual" && (
                    <CardContent className="pt-5 space-y-5">
                      {/* Cancel edit button */}
                      {editId && (
                        <div className="flex justify-end -mt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetForm}
                            className="h-7 rounded-none text-[9px] uppercase font-bold text-muted-foreground"
                          >
                            <RotateCcw className="mr-1 h-3 w-3" /> Cancel Edit
                          </Button>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Category Title
                        </label>
                        <Input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="E.G. RECESSED LIGHTS"
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
                          placeholder="Enter overview…"
                          className="rounded-none min-h-[80px] text-xs resize-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Websites
                        </label>
                        <div className="grid grid-cols-2 gap-1">
                          {WEBSITE_OPTIONS.map((site) => (
                            <Button
                              key={site}
                              type="button"
                              variant={
                                selectedWebsites.includes(site)
                                  ? "default"
                                  : "outline"
                              }
                              className="rounded-none h-8 text-[9px] uppercase font-bold px-2"
                              onClick={() =>
                                setSelectedWebsites((prev) =>
                                  prev.includes(site)
                                    ? prev.filter((s) => s !== site)
                                    : [...prev, site],
                                )
                              }
                            >
                              {site.split(" ")[0]}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Specifications
                        </label>
                        <Popover open={openSpecs} onOpenChange={setOpenSpecs}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-between rounded-none h-10 text-[10px] font-bold uppercase"
                            >
                              {selectedSpecs.length > 0
                                ? `${selectedSpecs.length} Spec${selectedSpecs.length > 1 ? "s" : ""} Attached`
                                : "Select Specifications…"}
                              <Layers className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none"
                            align="start"
                          >
                            <Command>
                              <CommandInput
                                placeholder="Search spec name…"
                                className="h-9 text-xs"
                              />
                              <CommandList>
                                <CommandEmpty>
                                  No specifications found.
                                </CommandEmpty>
                                <CommandGroup>
                                  {specifications.map((spec) => (
                                    <CommandItem
                                      key={spec.id}
                                      onSelect={() =>
                                        setSelectedSpecs((prev) =>
                                          prev.includes(spec.id)
                                            ? prev.filter(
                                                (id) => id !== spec.id,
                                              )
                                            : [...prev, spec.id],
                                        )
                                      }
                                      className="text-[10px] uppercase font-bold"
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-3 w-3",
                                          selectedSpecs.includes(spec.id)
                                            ? "opacity-100"
                                            : "opacity-0",
                                        )}
                                      />
                                      {spec.name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Category Cover
                        </label>
                        <div
                          {...getRootProps()}
                          className={cn(
                            "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors min-h-[120px]",
                            isDragActive && "border-primary bg-primary/5",
                          )}
                        >
                          <input {...getInputProps()} />
                          {previewUrl ? (
                            <div className="relative w-full aspect-video border bg-muted overflow-hidden">
                              <img
                                src={previewUrl}
                                className="h-full w-full object-cover"
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute top-1 right-1 h-6 w-6 rounded-none"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewUrl("");
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
                                Drop Image Here
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
                          "Save Category"
                        )}
                      </Button>
                    </CardContent>
                  )}

                  {/* ══ TAB: PDF Bulk Upload ══ */}
                  {activeTab === "bulk" && (
                    <CardContent className="pt-5 space-y-5">
                      {/* Description */}
                      <p className="text-[10px] text-muted-foreground uppercase font-bold leading-relaxed border border-dashed border-foreground/10 p-3 bg-muted/30">
                        Drop AcroForm TDS PDFs below. Each file becomes a new
                        ProductFamily. SpecGroups & Specs are extracted and
                        synced automatically — duplicates are skipped.
                      </p>

                      {/* PDF Dropzone */}
                      <div
                        {...pdfRoot()}
                        className={cn(
                          "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors",
                          isPdfDragActive && "border-primary bg-primary/5",
                        )}
                      >
                        <input {...pdfInput()} />
                        <Upload
                          size={22}
                          className={cn(
                            "mb-2 transition-colors",
                            isPdfDragActive
                              ? "text-primary"
                              : "text-muted-foreground opacity-40",
                          )}
                        />
                        <p className="text-[10px] font-bold uppercase tracking-tight">
                          {isPdfDragActive
                            ? "Release to add"
                            : "Drop PDF Files Here"}
                        </p>
                        <p className="text-[9px] text-muted-foreground/60 mt-1">
                          .pdf only · Multiple files supported
                        </p>
                      </div>

                      {/* File queue */}
                      {fileStatuses.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold uppercase opacity-60">
                              Queue — {fileStatuses.length} file
                              {fileStatuses.length !== 1 ? "s" : ""}
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                if (!isBulkProcessing)
                                  setFileStatuses((p) =>
                                    p.filter((f) => f.step !== "idle"),
                                  );
                              }}
                              className="text-[8px] uppercase font-black text-muted-foreground hover:text-destructive transition-colors"
                            >
                              Clear idle
                            </button>
                          </div>

                          <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-0.5">
                            {fileStatuses.map((fs, idx) => (
                              <div
                                key={idx}
                                className={cn(
                                  "border border-foreground/10 rounded-none overflow-hidden",
                                  fs.step === "done" &&
                                    "border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10",
                                  fs.step === "error" &&
                                    "border-destructive/30 bg-destructive/5",
                                )}
                              >
                                {/* File row */}
                                <div className="flex items-center gap-2 p-2.5">
                                  <StepIcon step={fs.step} />

                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black uppercase truncate leading-tight">
                                      {fs.title ||
                                        fs.file.name.replace(/\.pdf$/i, "")}
                                    </p>
                                    <p className="text-[8px] text-muted-foreground uppercase">
                                      {stepLabel(fs.step)}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {/* Toggle log panel */}
                                    {fs.logs.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          patchFile(idx, {
                                            expanded: !fs.expanded,
                                          })
                                        }
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        {fs.expanded ? (
                                          <ChevronDown size={12} />
                                        ) : (
                                          <ChevronRight size={12} />
                                        )}
                                      </button>
                                    )}
                                    {/* Remove idle file */}
                                    {fs.step === "idle" &&
                                      !isBulkProcessing && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setFileStatuses((p) =>
                                              p.filter((_, i) => i !== idx),
                                            )
                                          }
                                          className="text-muted-foreground hover:text-destructive transition-colors"
                                        >
                                          <X size={11} />
                                        </button>
                                      )}
                                  </div>
                                </div>

                                {/* Expandable log panel */}
                                {fs.expanded && fs.logs.length > 0 && (
                                  <div className="border-t border-foreground/5 bg-background/60 px-3 py-2 space-y-0.5 max-h-[140px] overflow-y-auto">
                                    {fs.logs.map((entry, li) => (
                                      <p
                                        key={li}
                                        className={cn(
                                          "text-[8px] font-mono leading-relaxed",
                                          logColor(entry.level),
                                        )}
                                      >
                                        <span className="mr-1 opacity-60">
                                          {logPrefix(entry.level)}
                                        </span>
                                        {entry.msg}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Summary badges */}
                      {fileStatuses.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {(["idle", "done", "error"] as FileStep[]).map(
                            (step) => {
                              const count = fileStatuses.filter(
                                (f) => f.step === step,
                              ).length;
                              if (count === 0) return null;
                              return (
                                <Badge
                                  key={step}
                                  variant="outline"
                                  className={cn(
                                    "rounded-none text-[8px] font-black uppercase px-2 h-5",
                                    step === "done" &&
                                      "border-emerald-500 text-emerald-600",
                                    step === "error" &&
                                      "border-destructive text-destructive",
                                    step === "idle" && "text-muted-foreground",
                                  )}
                                >
                                  {count} {step}
                                </Badge>
                              );
                            },
                          )}
                        </div>
                      )}

                      {/* Process button */}
                      <Button
                        onClick={processBulkPdfs}
                        disabled={pendingCount === 0 || isBulkProcessing}
                        className="w-full rounded-none uppercase font-bold text-[10px] h-11 tracking-widest"
                      >
                        {isBulkProcessing ? (
                          <>
                            <Loader2 className="animate-spin h-3.5 w-3.5 mr-2" />
                            Processing…
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5 mr-2" />
                            {pendingCount > 0
                              ? `Process ${pendingCount} PDF${pendingCount !== 1 ? "s" : ""}`
                              : "No PDFs Queued"}
                          </>
                        )}
                      </Button>

                      {/* Note about tdsTemplate */}
                      <p className="text-[8px] text-muted-foreground uppercase font-bold text-center opacity-60">
                        Each PDF is uploaded to Cloudinary and saved as{" "}
                        <span className="font-mono">tdsTemplate</span> on the
                        ProductFamily document.
                      </p>
                    </CardContent>
                  )}
                </Card>
              </div>

              {/* ══════════════ LIST VIEW ══════════════ */}
              <div className="lg:col-span-8">
                {loading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : categories.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mb-4 shadow-sm">
                      <FolderPlus className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                      No Product Families
                    </h3>
                    <p className="text-[11px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
                      Your database is currently empty. Define a new category
                      using the panel on the left or bulk-upload TDS PDFs.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {categories.map((cat) => (
                      <Card
                        key={cat.id}
                        className="rounded-none shadow-none group relative overflow-hidden border-foreground/10"
                      >
                        <div className="aspect-[4/3] relative bg-muted border-b overflow-hidden">
                          <img
                            src={cat.imageUrl || "/placeholder.png"}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute top-2 right-2 flex gap-1">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-7 w-7 rounded-none shadow-sm"
                              onClick={() => {
                                setActiveTab("manual");
                                setEditId(cat.id);
                                setTitle(cat.title);
                                setDescription(cat.description || "");
                                setSelectedWebsites(cat.websites || []);
                                setSelectedSpecs(cat.specifications || []);
                                setPreviewUrl(cat.imageUrl);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
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
                                    Delete "{cat.title}"? This cannot be undone.
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
                                        doc(db, "productfamilies", cat.id),
                                      )
                                    }
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>

                          {/* TDS badge — shown when a template PDF is attached */}
                          {cat.tdsTemplate && (
                            <a
                              href={cat.tdsTemplate}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="absolute bottom-2 left-2"
                            >
                              <Badge className="rounded-none text-[7px] px-1.5 h-4 uppercase bg-amber-500 hover:bg-amber-600 text-white gap-1 cursor-pointer">
                                <FileText size={8} />
                                TDS
                              </Badge>
                            </a>
                          )}
                        </div>

                        <div className="p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-[11px] font-black uppercase truncate">
                              {cat.title}
                            </h3>
                            <Badge
                              variant={cat.isActive ? "default" : "outline"}
                              className="rounded-none text-[7px] px-1 h-4 uppercase"
                            >
                              {cat.isActive ? "Live" : "Hidden"}
                            </Badge>
                          </div>
                          {cat.description && (
                            <p className="text-[9px] text-muted-foreground uppercase line-clamp-1 italic">
                              {cat.description}
                            </p>
                          )}
                          {Array.isArray(cat.specifications) &&
                            cat.specifications.length > 0 && (
                              <p className="text-[8px] text-muted-foreground/60 uppercase font-bold">
                                {cat.specifications.length} spec group
                                {cat.specifications.length !== 1 ? "s" : ""}
                              </p>
                            )}
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
