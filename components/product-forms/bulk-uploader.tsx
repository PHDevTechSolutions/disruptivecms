"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import ExcelJS from "exceljs";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  PackagePlus,
  Terminal,
  FileUp,
  FileSpreadsheet,
  ChevronRight,
  Layers,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedProduct {
  // Identity
  category: string; // sheet category col → productFamily title
  productCode: string; // Product Code
  csvSku: string; // CSV SKU → itemCode
  cloudinaryUrl: string; // mainImage
  productName: string; // Product Name (OCR) → name

  // Spec groups (keyed by group name → { label, value }[])
  specs: Record<string, { label: string; value: string }[]>;
}

interface ImportStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

// ─── Excel spec-group map ─────────────────────────────────────────────────────
// Row 2 contains group labels at specific column indices (0-based).
// Everything between two group anchors belongs to the group at the left anchor.
// Columns with no group label in row 2 are assigned to the nearest left anchor.

const FIXED_COLUMN_META: {
  colIndex: number; // 0-based A=0
  label: string; // spec label shown in Firestore
  groupHint: string; // fallback group name if row-2 is blank at this col
}[] = [
  // col 5 = F  (Wattage)     — group anchor "LAMP DETAILS" at col 5
  { colIndex: 5, label: "Wattage", groupHint: "LAMP DETAILS" },
  { colIndex: 6, label: "Lumens Output", groupHint: "LAMP DETAILS" },
  { colIndex: 7, label: "Color Temperature", groupHint: "LAMP DETAILS" },
  { colIndex: 8, label: "CRI", groupHint: "LAMP DETAILS" },
  { colIndex: 9, label: "Visual Angle", groupHint: "LAMP DETAILS" },
  { colIndex: 10, label: "Light Source", groupHint: "LAMP DETAILS" },
  { colIndex: 11, label: "Life Hours", groupHint: "LAMP DETAILS" },
  // col 12 = M — group anchor "ELECTRICAL SPECIFICATION" at col 12
  {
    colIndex: 12,
    label: "Working Voltage",
    groupHint: "ELECTRICAL SPECIFICATION",
  },
  {
    colIndex: 13,
    label: "Power Factor",
    groupHint: "ELECTRICAL SPECIFICATION",
  },
  // col 14 = O — group anchor "FIXTURE DETAILS" at col 14
  { colIndex: 14, label: "Dimension", groupHint: "FIXTURE DETAILS" },
  { colIndex: 15, label: "Materials", groupHint: "FIXTURE DETAILS" },
  { colIndex: 16, label: "Cover", groupHint: "FIXTURE DETAILS" },
  { colIndex: 17, label: "Working Temperature", groupHint: "FIXTURE DETAILS" },
  { colIndex: 18, label: "Ceiling", groupHint: "FIXTURE DETAILS" },
  { colIndex: 19, label: "IP Rating", groupHint: "FIXTURE DETAILS" },
];

// ─── Helper: derive group map from row 2 of the sheet ────────────────────────
function buildGroupMap(groupRow: (string | null)[]): Record<number, string> {
  const map: Record<number, string> = {};
  let currentGroup = "";
  for (let i = 0; i < groupRow.length; i++) {
    const cell = groupRow[i];
    if (cell && cell.trim()) currentGroup = cell.trim();
    if (currentGroup) map[i] = currentGroup;
  }
  return map;
}

// ─── Helper: normalise a cell value to clean string ──────────────────────────
function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "text" in (v as any))
    return String((v as any).text).trim();
  if (typeof v === "object" && "result" in (v as any))
    return String((v as any).result).trim();
  return String(v).trim();
}

// ─── Parse the workbook ───────────────────────────────────────────────────────
async function parseWorkbook(file: File): Promise<{
  sheetName: string;
  products: ParsedProduct[];
}> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // Sheet name = filename without extension
  const targetName = file.name.replace(/\.xlsx$/i, "");
  const ws = wb.getWorksheet(targetName) ?? wb.getWorksheet(1); // fallback to first sheet

  if (!ws) throw new Error(`Sheet "${targetName}" not found in workbook.`);

  const allRows: (string | null)[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: (string | null)[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const raw = cell.value;
      const colIndex = Number(cell.col) - 1;
      cells[colIndex] = raw != null ? cellStr(raw) : null;
    });
    allRows.push(cells);
  });

  if (allRows.length < 3) throw new Error("Sheet has no data rows.");

  const headerRow = allRows[0]; // row 1 — column labels
  const groupRow = allRows[1]; // row 2 — spec group anchors
  const dataRows = allRows.slice(2); // rows 3+

  const groupMap = buildGroupMap(groupRow as string[]);

  let lastCategory = "";
  let lastProductName = "";
  let lastCloudinaryUrl = "";

  const products: ParsedProduct[] = [];

  for (const row of dataRows) {
    if (!row || row.every((c) => c == null || c === "")) continue;

    // Inherit sparse cells from above (merged-looking data)
    const category = row[0] || lastCategory;
    const productCode = row[1] || "";
    const csvSku = row[2] || "";
    const cloudinaryUrl = row[3] || lastCloudinaryUrl;
    const productName = row[4] || lastProductName;

    // Update inherited state
    if (row[0]) lastCategory = row[0];
    if (row[4]) lastProductName = row[4];
    if (row[3]) lastCloudinaryUrl = row[3];

    if (!productCode) continue; // skip rows without a product code

    // Build spec groups
    const specsByGroup: Record<string, { label: string; value: string }[]> = {};

    for (const meta of FIXED_COLUMN_META) {
      const rawVal = row[meta.colIndex];
      if (rawVal == null || rawVal === "") continue;

      // Determine group name: prefer dynamic groupMap, fallback to hint
      const groupName = groupMap[meta.colIndex] || meta.groupHint;

      if (!specsByGroup[groupName]) specsByGroup[groupName] = [];
      specsByGroup[groupName].push({ label: meta.label, value: rawVal });
    }

    products.push({
      category,
      productCode,
      csvSku,
      cloudinaryUrl,
      productName,
      specs: specsByGroup,
    });
  }

  return { sheetName: ws.name, products };
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

/** Find doc by field value; returns null if not found */
async function findDoc(
  col: string,
  field: string,
  value: string,
): Promise<string | null> {
  const snap = await getDocs(
    query(collection(db, col), where(field, "==", value)),
  );
  return snap.empty ? null : snap.docs[0].id;
}

/** Upsert a spec group doc; returns its ID */
async function upsertSpecGroup(
  groupName: string,
  labels: string[],
  websites: string[],
): Promise<string> {
  const existingId = await findDoc("specs", "name", groupName);

  if (existingId) {
    // Merge any new labels into items array
    const existing = (
      await getDocs(
        query(collection(db, "specs"), where("name", "==", groupName)),
      )
    ).docs[0];
    const existingItems: { label: string }[] = existing.data().items || [];
    const existingLabels = new Set(existingItems.map((i) => i.label));
    const newItems = [...existingItems];
    for (const label of labels) {
      if (!existingLabels.has(label)) newItems.push({ label });
    }
    await updateDoc(doc(db, "specs", existingId), {
      items: newItems,
      updatedAt: serverTimestamp(),
    });
    return existingId;
  }

  // Create new
  const ref = await addDoc(collection(db, "specs"), {
    name: groupName,
    items: labels.map((label) => ({ label })),
    isActive: true,
    websites,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Upsert a productfamily doc; returns its ID */
async function upsertProductFamily(
  title: string,
  specIds: string[],
  websites: string[],
): Promise<string> {
  const existingId = await findDoc("productfamilies", "title", title);

  if (existingId) {
    // Merge any new spec IDs
    const existing = (
      await getDocs(
        query(collection(db, "productfamilies"), where("title", "==", title)),
      )
    ).docs[0];
    const existingSpecs: string[] = existing.data().specifications || [];
    const merged = Array.from(new Set([...existingSpecs, ...specIds]));
    await updateDoc(doc(db, "productfamilies", existingId), {
      specifications: merged,
      updatedAt: serverTimestamp(),
    });
    return existingId;
  }

  const ref = await addDoc(collection(db, "productfamilies"), {
    title,
    description: "",
    imageUrl: "",
    isActive: true,
    specifications: specIds,
    websites,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BulkUploader({
  onUploadComplete,
}: {
  onUploadComplete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<ImportStats>({
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
  });
  const [logs, setLogs] = useState<
    { type: "ok" | "err" | "skip" | "info"; msg: string }[]
  >([]);
  const [currentItem, setCurrentItem] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<
    { name: string; sheetName: string; products: ParsedProduct[] }[]
  >([]);
  const [step, setStep] = useState<"idle" | "preview" | "importing" | "done">(
    "idle",
  );
  const [showFiles, setShowFiles] = useState(true);
  const [showCategories, setShowCategories] = useState(true);
  const [showProducts, setShowProducts] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (type: "ok" | "err" | "skip" | "info", msg: string) => {
    setLogs((prev) => [
      ...prev,
      { type, msg: `${new Date().toLocaleTimeString()} ${msg}` },
    ]);
  };

  // ── Parse file for preview ──────────────────────────────────────────────────
  const handleFileDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;

    try {
      addLog("info", `📂 Parsing ${files.length} file(s)...`);
      const parsedFiles: {
        name: string;
        sheetName: string;
        products: ParsedProduct[];
      }[] = [];

      for (const file of files) {
        try {
          const { sheetName, products } = await parseWorkbook(file);
          parsedFiles.push({ name: file.name, sheetName, products });
          addLog("info", `  ✅ ${file.name}: ${products.length} products`);
        } catch (err: any) {
          addLog("err", `  ❌ ${file.name}: ${err.message}`);
        }
      }

      if (parsedFiles.length === 0) {
        toast.error("No files were successfully parsed");
        return;
      }

      setUploadedFiles(parsedFiles);
      setStep("preview");

      const totalProducts = parsedFiles.reduce(
        (sum, f) => sum + f.products.length,
        0,
      );
      addLog(
        "info",
        `✅ Successfully parsed ${parsedFiles.length} file(s) with ${totalProducts} total products`,
      );
    } catch (err: any) {
      addLog("err", `❌ Parse error: ${err.message}`);
      toast.error(err.message || "Failed to parse Excel files");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
    multiple: true,
    disabled: step !== "idle" || importing,
  });

  // ── Run import ──────────────────────────────────────────────────────────────
  const runImport = async () => {
    // Flatten all products from all files
    const allProducts = uploadedFiles.flatMap((f) => f.products);

    if (!allProducts.length) return;

    setImporting(true);
    setStep("importing");
    setProgress(0);
    setStats({ total: allProducts.length, success: 0, failed: 0, skipped: 0 });

    addLog(
      "info",
      `🚀 Starting import of ${allProducts.length} products from ${uploadedFiles.length} file(s)...`,
    );

    // Pre-compute all unique spec groups & product families across all products
    // so we can upsert them in batches before touching products.
    const websiteList = ["Taskflow"]; // BulkUploader is Taskflow-scoped

    // Collect all spec groups
    const allSpecGroups: Record<string, Set<string>> = {}; // groupName → labels
    const categoryToGroups: Record<string, Set<string>> = {}; // category → groupNames

    for (const p of allProducts) {
      if (!categoryToGroups[p.category])
        categoryToGroups[p.category] = new Set();
      for (const [groupName, specEntries] of Object.entries(p.specs)) {
        if (!allSpecGroups[groupName]) allSpecGroups[groupName] = new Set();
        specEntries.forEach((e) => allSpecGroups[groupName].add(e.label));
        categoryToGroups[p.category].add(groupName);
      }
    }

    addLog(
      "info",
      `🗂️  Upserting ${Object.keys(allSpecGroups).length} spec group(s)...`,
    );

    // Upsert spec groups → get IDs
    const specGroupIds: Record<string, string> = {}; // groupName → firestoreId
    for (const [groupName, labelsSet] of Object.entries(allSpecGroups)) {
      try {
        const id = await upsertSpecGroup(
          groupName,
          Array.from(labelsSet),
          websiteList,
        );
        specGroupIds[groupName] = id;
        addLog("info", `  ✓ Spec group "${groupName}" → ${id}`);
      } catch (err: any) {
        addLog("err", `  ✗ Spec group "${groupName}": ${err.message}`);
      }
    }

    // Upsert product families
    addLog(
      "info",
      `📦 Upserting ${Object.keys(categoryToGroups).length} product family/families...`,
    );
    const familyIds: Record<string, string> = {}; // category title → firestoreId
    for (const [catTitle, groupNames] of Object.entries(categoryToGroups)) {
      const specIds = Array.from(groupNames)
        .map((g) => specGroupIds[g])
        .filter(Boolean);
      try {
        const id = await upsertProductFamily(catTitle, specIds, websiteList);
        familyIds[catTitle] = id;
        addLog("info", `  ✓ Product family "${catTitle}" → ${id}`);
      } catch (err: any) {
        addLog("err", `  ✗ Product family "${catTitle}": ${err.message}`);
      }
    }

    // Import products
    addLog("info", `\n📝 Importing products...`);

    for (let i = 0; i < allProducts.length; i++) {
      const p = allProducts[i];
      setCurrentItem(p.productCode);

      try {
        // Duplicate check by itemCode on Taskflow
        const dupSnap = await getDocs(
          query(
            collection(db, "products"),
            where("itemCode", "==", p.productCode),
          ),
        );
        if (!dupSnap.empty) {
          addLog("skip", `⏭  SKIPPED (duplicate): ${p.productCode}`);
          setStats((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
          setProgress(((i + 1) / allProducts.length) * 100);
          await new Promise((r) => setTimeout(r, 20));
          continue;
        }

        // Build technicalSpecs in AddNewProduct schema:
        // [{ specGroup: string, specs: [{ name, value }] }]
        const technicalSpecs = Object.entries(p.specs).map(
          ([groupName, entries]) => ({
            specGroup: groupName,
            specs: entries.map((e) => ({ name: e.label, value: e.value })),
          }),
        );

        // Slug from product code
        const slug = p.productCode.toLowerCase().replace(/[^a-z0-9]+/g, "-");

        const payload = {
          // Core identity — matches AddNewProduct handlePublish payload exactly
          name: p.productName || p.productCode,
          shortDescription: "",
          slug,
          itemCode: p.productCode,
          regularPrice: 0,
          salePrice: 0,

          // Media
          mainImage: p.cloudinaryUrl || "",
          qrCodeImage: "",
          galleryImages: [],

          // Classification — matches form schema
          productFamily: p.category, // stored as title string
          website: websiteList, // array (matches form's website field)
          brand: "",
          applications: [],

          // Specs — grouped, same as form
          technicalSpecs,

          // SEO stub
          seo: {
            title: p.productName || p.productCode,
            description: "",
            canonical: "",
            ogImage: p.cloudinaryUrl || "",
            robots: "index, follow",
            lastUpdated: new Date().toISOString(),
          },

          // Timestamps & meta
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          importSource: "bulk-uploader",
        };

        await addDoc(collection(db, "products"), payload);
        addLog("ok", `✅ ${p.productCode} — ${p.productName}`);
        setStats((prev) => ({ ...prev, success: prev.success + 1 }));
      } catch (err: any) {
        addLog("err", `❌ FAILED ${p.productCode}: ${err.message}`);
        setStats((prev) => ({ ...prev, failed: prev.failed + 1 }));
      }

      setProgress(((i + 1) / allProducts.length) * 100);
      await new Promise((r) => setTimeout(r, 40)); // breathing room
    }

    setImporting(false);
    setStep("done");
    setCurrentItem("");
    addLog("info", "🏁 Import complete.");
    toast.success("Bulk import complete!");
    onUploadComplete?.();
  };

  const reset = () => {
    setStep("idle");
    setLogs([]);
    setUploadedFiles([]);
    setStats({ total: 0, success: 0, failed: 0, skipped: 0 });
    setProgress(0);
    setCurrentItem("");
  };

  // ── Grouped preview ──────────────────────────────────────────────────────────
  const allProducts = uploadedFiles.flatMap((f) => f.products);

  const categorySummary = allProducts.reduce<Record<string, number>>(
    (acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    },
    {},
  );

  const fileSummary = uploadedFiles.map((file) => ({
    name: file.name,
    sheetName: file.sheetName,
    productCount: file.products.length,
    categories: new Set(file.products.map((p) => p.category)),
  }));

  // ── Log colour helper ────────────────────────────────────────────────────────
  const logColor = (type: string) => {
    if (type === "ok") return "text-emerald-400";
    if (type === "err") return "text-red-400";
    if (type === "skip") return "text-yellow-400";
    return "text-slate-400";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 border-primary/20 hover:bg-primary/5 font-semibold"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Bulk Import
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[760px] max-h-[92vh] flex flex-col p-0 overflow-hidden">
        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <PackagePlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold leading-tight">
                Bulk Product Importer
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Drop{" "}
                <code className="font-mono bg-muted px-1 rounded">.xlsx</code>{" "}
                files (multiple allowed) — specs &amp; product families are
                auto-created if missing.
              </DialogDescription>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mt-3 text-[11px] font-medium">
            {(["idle", "preview", "importing", "done"] as const).map(
              (s, idx) => (
                <React.Fragment key={s}>
                  <span
                    className={`px-2 py-0.5 rounded-full transition-colors ${
                      step === s
                        ? "bg-primary text-primary-foreground"
                        : idx <
                            ["idle", "preview", "importing", "done"].indexOf(
                              step,
                            )
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {idx + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                  {idx < 3 && (
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  )}
                </React.Fragment>
              ),
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-5">
            {/* ── Step: IDLE — dropzone ── */}
            {step === "idle" && (
              <>
                <div className="rounded-xl border border-dashed bg-muted/20 p-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
                  <span>
                    The sheet name must match the filename (e.g.{" "}
                    <code className="font-mono bg-muted px-1 rounded">
                      LED_SURFACE_SLIM_DOWNLIGHT.xlsx
                    </code>{" "}
                    → sheet{" "}
                    <code className="font-mono bg-muted px-1 rounded">
                      LED SURFACE SLIM DOWNLIGHT
                    </code>
                    ). Spec groups &amp; product families are upserted
                    automatically.
                  </span>
                </div>

                <div
                  {...getRootProps()}
                  className={`
                    relative border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer
                    flex flex-col items-center justify-center gap-4 transition-all duration-200
                    ${
                      isDragActive
                        ? "border-primary bg-primary/8 scale-[1.01]"
                        : "border-border hover:border-primary/40 hover:bg-primary/3"
                    }
                  `}
                >
                  <input {...getInputProps()} />
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
                    ${isDragActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {isDragActive ? (
                      <FileUp className="w-8 h-8 animate-bounce" />
                    ) : (
                      <Upload className="w-8 h-8" />
                    )}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      {isDragActive
                        ? "Release to parse"
                        : "Drop your Excel files here"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      or{" "}
                      <span className="text-primary underline underline-offset-2 cursor-pointer">
                        browse
                      </span>{" "}
                      — accepts multiple .xlsx files
                    </p>
                  </div>
                </div>

                {/* Schema reminder */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border p-3 space-y-1.5 bg-card">
                    <p className="font-semibold flex items-center gap-1.5 text-primary">
                      <Layers className="w-3.5 h-3.5" /> Required Columns
                    </p>
                    {[
                      "Category",
                      "Product Code",
                      "CSV SKU",
                      "Cloudinary URL",
                      "Product Name (OCR)",
                    ].map((c) => (
                      <div key={c} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                        <code className="font-mono">{c}</code>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border p-3 space-y-1.5 bg-card">
                    <p className="font-semibold flex items-center gap-1.5 text-amber-600">
                      <AlertCircle className="w-3.5 h-3.5" /> Auto-created if
                      missing
                    </p>
                    {[
                      "specs (by group label in row 2)",
                      "productfamilies (by Category col)",
                    ].map((c) => (
                      <div key={c} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-muted-foreground">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Step: PREVIEW ── */}
            {step === "preview" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">
                      Preview — {uploadedFiles.length} file
                      {uploadedFiles.length !== 1 ? "s" : ""} loaded
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {allProducts.length} total products across{" "}
                      {Object.keys(categorySummary).length} categories will be
                      imported.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    className="gap-1.5 text-xs h-7"
                  >
                    <RefreshCw className="w-3 h-3" /> Change files
                  </Button>
                </div>

                {/* File-by-file summary */}
                <div className="space-y-2">
                  <button
                    onClick={() => setShowFiles(!showFiles)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  >
                    <span>Files ({uploadedFiles.length})</span>
                    {showFiles ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {showFiles && (
                    <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                      {fileSummary.map((file, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border bg-card p-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">
                                {file.name}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                Sheet: {file.sheetName}
                              </p>
                            </div>
                            <Badge
                              variant="secondary"
                              className="text-xs ml-2 shrink-0"
                            >
                              {file.productCount} products
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from(file.categories).map((cat) => (
                              <Badge
                                key={cat}
                                variant="outline"
                                className="text-[10px] font-normal"
                              >
                                {cat}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Category summary across all files */}
                <div className="space-y-2">
                  <button
                    onClick={() => setShowCategories(!showCategories)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  >
                    <span>
                      Categories Summary ({Object.keys(categorySummary).length})
                    </span>
                    {showCategories ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {showCategories && (
                    <div className="max-h-[180px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                      {Object.entries(categorySummary).map(([cat, count]) => {
                        const groups = new Set(
                          allProducts
                            .filter((p) => p.category === cat)
                            .flatMap((p) => Object.keys(p.specs)),
                        );
                        return (
                          <div
                            key={cat}
                            className="rounded-lg border bg-card p-3 hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold">
                                {cat}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {count} products
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from(groups).map((g) => (
                                <Badge
                                  key={g}
                                  variant="outline"
                                  className="text-[10px] font-normal"
                                >
                                  {g}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Product list across all files */}
                <div className="space-y-2">
                  <button
                    onClick={() => setShowProducts(!showProducts)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  >
                    <span>All Products ({allProducts.length})</span>
                    {showProducts ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {showProducts && (
                    <div className="rounded-lg border overflow-hidden relative">
                      <div className="grid grid-cols-[1fr_auto_auto_auto] text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/50 px-3 py-2 border-b">
                        <span>Product Name / Code</span>
                        <span className="text-right pr-4">File</span>
                        <span className="text-right pr-4">Item Code</span>
                        <span className="text-right">Image</span>
                      </div>
                      <div className="divide-y max-h-[160px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                        {uploadedFiles.map((file, fileIdx) =>
                          file.products.map((p, prodIdx) => (
                            <div
                              key={`${fileIdx}-${prodIdx}`}
                              className="grid grid-cols-[1fr_auto_auto_auto] items-center px-3 py-2 text-xs hover:bg-muted/30 transition-colors bg-card"
                            >
                              <div>
                                <p className="font-medium truncate max-w-[220px]">
                                  {p.productName || "—"}
                                </p>
                                <p className="text-muted-foreground font-mono text-[11px]">
                                  {p.productCode}
                                </p>
                              </div>
                              <span
                                className="text-muted-foreground text-[10px] pr-4 truncate max-w-[100px]"
                                title={file.name}
                              >
                                {file.name.replace(".xlsx", "")}
                              </span>
                              <span className="font-mono text-muted-foreground text-[11px] pr-4">
                                {p.csvSku || "—"}
                              </span>
                              <span>
                                {p.cloudinaryUrl ? (
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                                )}
                              </span>
                            </div>
                          )),
                        )}
                      </div>
                      {/* Solid white gradient at bottom */}
                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-none" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Step: IMPORTING / DONE ── */}
            {(step === "importing" || step === "done") && (
              <div className="space-y-5">
                {/* Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="flex items-center gap-2 text-slate-600">
                      {importing ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      )}
                      {importing
                        ? `Processing: ${currentItem}`
                        : "Import complete"}
                    </span>
                    <span className="font-mono text-primary">
                      {Math.round(progress)}%
                    </span>
                  </div>
                  <Progress value={progress} className="h-2.5" />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-2.5">
                  {[
                    {
                      label: "Total",
                      val: stats.total,
                      cls: "text-blue-600",
                      bg: "bg-blue-50 border-blue-100",
                    },
                    {
                      label: "Success",
                      val: stats.success,
                      cls: "text-emerald-600",
                      bg: "bg-emerald-50 border-emerald-100",
                    },
                    {
                      label: "Failed",
                      val: stats.failed,
                      cls: "text-red-600",
                      bg: "bg-red-50 border-red-100",
                    },
                    {
                      label: "Skipped",
                      val: stats.skipped,
                      cls: "text-amber-600",
                      bg: "bg-amber-50 border-amber-100",
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className={`${s.bg} border rounded-xl p-3 text-center`}
                    >
                      <p
                        className={`text-2xl font-black tabular-nums ${s.cls}`}
                      >
                        {s.val}
                      </p>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-0.5">
                        {s.label}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Console */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    <Terminal className="w-3 h-3" /> Import Console
                  </div>
                  <div className="bg-slate-950 rounded-xl p-4 font-mono text-[11px] h-[200px] overflow-y-auto space-y-1 border border-slate-800 shadow-inner">
                    {logs.map((log, i) => (
                      <div
                        key={i}
                        className={`flex gap-2.5 ${logColor(log.type)}`}
                      >
                        <span className="text-slate-600 shrink-0 select-none tabular-nums">
                          [{String(i + 1).padStart(3, "0")}]
                        </span>
                        <span className="break-all">{log.msg}</span>
                      </div>
                    ))}
                    {importing && (
                      <span className="inline-block w-2 h-3.5 bg-primary animate-pulse ml-0.5" />
                    )}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Footer actions ── */}
        <div className="border-t px-6 py-3 flex justify-between items-center shrink-0 bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            className="text-xs h-8"
          >
            Close
          </Button>
          <div className="flex gap-2">
            {step === "preview" && (
              <Button
                size="sm"
                onClick={runImport}
                disabled={importing}
                className="gap-2 h-8 text-xs font-semibold"
              >
                <Upload className="w-3.5 h-3.5" />
                Import {allProducts.length} Products
              </Button>
            )}
            {step === "done" && (
              <Button
                size="sm"
                variant="outline"
                onClick={reset}
                className="gap-2 h-8 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Import Another
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
