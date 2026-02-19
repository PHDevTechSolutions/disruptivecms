"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  XCircle,
  FileText,
  Tag,
  Package,
  Globe,
  Eye,
  EyeOff,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedProduct {
  category: string;
  productCode: string;
  csvSku: string;
  cloudinaryUrl: string;
  productName: string;
  specs: Record<string, { label: string; value: string }[]>;
}

interface ImportStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

type PreviewTab = "files" | "categories" | "products";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "text" in (v as any))
    return String((v as any).text).trim();
  if (typeof v === "object" && "result" in (v as any))
    return String((v as any).result).trim();
  return String(v)
    .replace(/[\r\n]+/g, " ")
    .trim();
}

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

async function parseWorkbook(
  file: File,
): Promise<{ sheetName: string; products: ParsedProduct[] }> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const candidateSheets = wb.worksheets.filter(
    (s) => !/^all\s*products$/i.test(s.name.trim()),
  );
  let ws = candidateSheets[0];

  if (candidateSheets.length > 1) {
    let bestCount = -1;
    for (const sheet of candidateSheets) {
      let count = 0;
      sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum <= 2) return;
        if (row.getCell(2).value != null && String(row.getCell(2).value).trim())
          count++;
      });
      if (count > bestCount) {
        bestCount = count;
        ws = sheet;
      }
    }
  }

  if (!ws) ws = wb.worksheets[0];
  if (!ws) throw new Error(`No usable worksheet found in ${file.name}.`);

  const allRows: (string | null)[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: (string | null)[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const colIndex = Number(cell.col) - 1;
      cells[colIndex] = cell.value != null ? cellStr(cell.value) : null;
    });
    allRows.push(cells);
  });

  if (allRows.length < 3) throw new Error("Sheet has no data rows.");

  const headerRow = allRows[0];
  const groupRow = allRows[1];
  const dataRows = allRows.slice(2);
  const groupMap = buildGroupMap(groupRow as string[]);

  const IDENTITY_COLS = new Set([0, 1, 2, 3, 4]);
  const labelMap: Record<number, string> = {};
  headerRow.forEach((h, i) => {
    if (!IDENTITY_COLS.has(i) && h) labelMap[i] = h.trim();
  });

  let lastCategory = "",
    lastProductName = "",
    lastCloudinaryUrl = "";
  const products: ParsedProduct[] = [];

  for (const row of dataRows) {
    if (!row || row.every((c) => c == null || c === "")) continue;

    const category = row[0] || lastCategory;
    const productCode = row[1] || "";
    const csvSku = row[2] || "";
    const cloudinaryUrl = row[3] || lastCloudinaryUrl;
    const productName = row[4] || lastProductName;

    if (row[0]) lastCategory = row[0];
    if (row[4]) lastProductName = row[4];
    if (row[3]) lastCloudinaryUrl = row[3];
    if (!productCode) continue;

    const specsByGroup: Record<string, { label: string; value: string }[]> = {};
    for (const [colIdxStr, label] of Object.entries(labelMap)) {
      const colIndex = Number(colIdxStr);
      const rawVal = row[colIndex];
      if (rawVal == null || rawVal === "") continue;
      const groupName = groupMap[colIndex];
      if (!groupName) continue;
      if (!specsByGroup[groupName]) specsByGroup[groupName] = [];
      specsByGroup[groupName].push({ label, value: rawVal });
    }

    products.push({
      category,
      productCode,
      csvSku,
      cloudinaryUrl,
      productName: productName || `${category} ${productCode}`.trim(),
      specs: specsByGroup,
    });
  }

  return { sheetName: ws.name, products };
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

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

async function upsertSpecGroup(
  groupName: string,
  labels: string[],
  websites: string[],
): Promise<string> {
  const existingId = await findDoc("specs", "name", groupName);
  if (existingId) {
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

async function upsertProductFamily(
  title: string,
  specIds: string[],
  websites: string[],
): Promise<string> {
  const existingId = await findDoc("productfamilies", "title", title);
  if (existingId) {
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

async function checkDuplicate(
  itemCode: string,
): Promise<{ isDuplicate: boolean; reason: string }> {
  const byItemCode = await getDocs(
    query(collection(db, "products"), where("itemCode", "==", itemCode)),
  );
  if (!byItemCode.empty)
    return { isDuplicate: true, reason: `itemCode "${itemCode}"` };
  return { isDuplicate: false, reason: "" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
      <span
        className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
          active
            ? "bg-white/20 text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function FilesPanel({
  fileSummary,
}: {
  fileSummary: {
    name: string;
    sheetName: string;
    productCount: number;
    categories: Set<string>;
  }[];
}) {
  return (
    <div className="h-full overflow-y-auto space-y-2 pr-1">
      {fileSummary.map((file, idx) => (
        <div key={idx} className="rounded-lg border bg-card p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{file.name}</p>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                Sheet: <span className="text-foreground">{file.sheetName}</span>
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {file.productCount} products
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1">
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
  );
}

function CategoriesPanel({
  categorySummary,
  allProducts,
}: {
  categorySummary: Record<string, number>;
  allProducts: ParsedProduct[];
}) {
  return (
    <div className="h-full overflow-y-auto space-y-2 pr-1">
      {Object.entries(categorySummary).map(([cat, count]) => {
        const groups = new Set(
          allProducts
            .filter((p) => p.category === cat)
            .flatMap((p) => Object.keys(p.specs)),
        );
        return (
          <div key={cat} className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">{cat}</span>
              <Badge variant="secondary" className="text-xs">
                {count} products
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1">
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
  );
}

function ProductsPanel({
  uploadedFiles,
}: {
  uploadedFiles: { name: string; products: ParsedProduct[] }[];
}) {
  return (
    <div className="h-full flex flex-col rounded-lg border overflow-hidden">
      {/* Sticky header */}
      <div className="grid grid-cols-[1fr_110px_90px_32px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/60 px-3 py-2 border-b shrink-0">
        <span>Product / Code</span>
        <span>File</span>
        <span>Item Code</span>
        <span className="text-center">Img</span>
      </div>
      {/* Scrollable rows */}
      <div className="flex-1 overflow-y-auto divide-y">
        {uploadedFiles.map((file, fileIdx) =>
          file.products.map((p, prodIdx) => (
            <div
              key={`${fileIdx}-${prodIdx}`}
              className="grid grid-cols-[1fr_110px_90px_32px] items-center px-3 py-2 text-xs hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0 pr-2">
                <p className="font-medium truncate">{p.productName || "—"}</p>
                <p className="text-muted-foreground font-mono text-[10px]">
                  {p.productCode}
                </p>
              </div>
              <span
                className="text-muted-foreground text-[10px] truncate pr-2"
                title={file.name}
              >
                {file.name.replace(".xlsx", "")}
              </span>
              <span className="font-mono text-muted-foreground text-[10px] pr-2">
                {p.csvSku || "—"}
              </span>
              <span className="flex justify-center">
                {p.cloudinaryUrl ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                )}
              </span>
            </div>
          )),
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
    { type: "ok" | "err" | "skip" | "info" | "warn"; msg: string }[]
  >([]);
  const [currentItem, setCurrentItem] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<
    { name: string; sheetName: string; products: ParsedProduct[] }[]
  >([]);
  const [step, setStep] = useState<
    "idle" | "preview" | "importing" | "done" | "cancelled"
  >("idle");
  const [activeTab, setActiveTab] = useState<PreviewTab>("files");

  // ── Step-1 config ────────────────────────────────────────────────────────────
  const WEBSITE_OPTIONS = [
    "Disruptive Solutions Inc",
    "Ecoshift Corporation",
    "Value Acquisitions Holdings",
    "Taskflow",
  ] as const;

  const [selectedWebsites, setSelectedWebsites] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<"draft" | "public" | "">("");

  const configComplete = selectedWebsites.length > 0 && importStatus !== "";

  const toggleWebsite = (site: string) =>
    setSelectedWebsites((prev) =>
      prev.includes(site) ? prev.filter((w) => w !== site) : [...prev, site],
    );

  const cancelledRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (
    type: "ok" | "err" | "skip" | "info" | "warn",
    msg: string,
  ) => {
    setLogs((prev) => [
      ...prev,
      { type, msg: `${new Date().toLocaleTimeString()} ${msg}` },
    ]);
  };

  const handleFileDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
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

    if (!parsedFiles.length) {
      toast.error("No files were successfully parsed");
      return;
    }

    setUploadedFiles(parsedFiles);
    setActiveTab("files");
    setStep("preview");
    const total = parsedFiles.reduce((s, f) => s + f.products.length, 0);
    addLog(
      "info",
      `✅ Parsed ${parsedFiles.length} file(s) — ${total} total products`,
    );
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
    multiple: true,
    disabled: step !== "idle" || importing || !configComplete,
  });

  const handleCancel = () => {
    cancelledRef.current = true;
    addLog(
      "warn",
      "⚠️  Cancellation requested — stopping after current item...",
    );
  };

  const runImport = async () => {
    const allProducts = uploadedFiles.flatMap((f) => f.products);
    if (!allProducts.length) return;

    cancelledRef.current = false;
    setImporting(true);
    setStep("importing");
    setProgress(0);
    setStats({ total: allProducts.length, success: 0, failed: 0, skipped: 0 });
    addLog(
      "info",
      `🚀 Starting import of ${allProducts.length} products from ${uploadedFiles.length} file(s)...`,
    );

    const websiteList = selectedWebsites;
    const allSpecGroups: Record<string, Set<string>> = {};
    const categoryToGroups: Record<string, Set<string>> = {};

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
    const specGroupIds: Record<string, string> = {};
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

    addLog(
      "info",
      `📦 Upserting ${Object.keys(categoryToGroups).length} product family/families...`,
    );
    for (const [catTitle, groupNames] of Object.entries(categoryToGroups)) {
      const specIds = Array.from(groupNames)
        .map((g) => specGroupIds[g])
        .filter(Boolean);
      try {
        const id = await upsertProductFamily(catTitle, specIds, websiteList);
        addLog("info", `  ✓ Product family "${catTitle}" → ${id}`);
      } catch (err: any) {
        addLog("err", `  ✗ Product family "${catTitle}": ${err.message}`);
      }
    }

    addLog("info", `\n📝 Importing products...`);

    for (let i = 0; i < allProducts.length; i++) {
      if (cancelledRef.current) {
        const remaining = allProducts.length - i;
        addLog(
          "warn",
          `🛑 Import cancelled. ${i} processed, ${remaining} remaining skipped.`,
        );
        setStats((prev) => ({ ...prev, skipped: prev.skipped + remaining }));
        break;
      }

      const p = allProducts[i];
      setCurrentItem(p.productCode);

      try {
        const itemCodeField = p.csvSku || p.productCode;
        const resolvedName =
          p.productName || `${p.category} ${p.productCode}`.trim();
        const { isDuplicate, reason } = await checkDuplicate(itemCodeField);

        if (isDuplicate) {
          addLog(
            "skip",
            `⏭  SKIPPED (duplicate ${reason}): ${p.productCode} — ${resolvedName}`,
          );
          setStats((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
          setProgress(((i + 1) / allProducts.length) * 100);
          await new Promise((r) => setTimeout(r, 20));
          continue;
        }

        const technicalSpecs = Object.entries(p.specs).map(
          ([groupName, entries]) => ({
            specGroup: groupName,
            specs: entries.map((e) => ({ name: e.label, value: e.value })),
          }),
        );

        const slug = p.productCode.toLowerCase().replace(/[^a-z0-9]+/g, "-");

        await addDoc(collection(db, "products"), {
          name: resolvedName,
          shortDescription: "",
          slug,
          itemCode: p.productCode,
          regularPrice: 0,
          salePrice: 0,
          mainImage: p.cloudinaryUrl || "",
          qrCodeImage: "",
          galleryImages: [],
          productFamily: p.category,
          website: websiteList,
          websites: websiteList,
          status: importStatus,
          brand: "",
          applications: [],
          technicalSpecs,
          seo: {
            title: resolvedName,
            description: "",
            canonical: "",
            ogImage: p.cloudinaryUrl || "",
            robots: "index, follow",
            lastUpdated: new Date().toISOString(),
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          importSource: "bulk-uploader",
        });

        addLog("ok", `✅ ${p.productCode} — ${resolvedName}`);
        setStats((prev) => ({ ...prev, success: prev.success + 1 }));
      } catch (err: any) {
        addLog("err", `❌ FAILED ${p.productCode}: ${err.message}`);
        setStats((prev) => ({ ...prev, failed: prev.failed + 1 }));
      }

      setProgress(((i + 1) / allProducts.length) * 100);
      await new Promise((r) => setTimeout(r, 40));
    }

    setImporting(false);
    setCurrentItem("");

    if (cancelledRef.current) {
      setStep("cancelled");
      addLog("warn", "🛑 Import was cancelled by user.");
      toast.warning("Import cancelled.");
    } else {
      setStep("done");
      addLog("info", "🏁 Import complete.");
      toast.success("Bulk import complete!");
      onUploadComplete?.();
    }
  };

  const reset = () => {
    setStep("idle");
    setLogs([]);
    setUploadedFiles([]);
    setStats({ total: 0, success: 0, failed: 0, skipped: 0 });
    setProgress(0);
    setCurrentItem("");
    setSelectedWebsites([]);
    setImportStatus("");
    cancelledRef.current = false;
  };

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

  const logColor = (type: string) => {
    if (type === "ok") return "text-emerald-400";
    if (type === "err") return "text-red-400";
    if (type === "skip") return "text-yellow-400";
    if (type === "warn") return "text-orange-400";
    return "text-slate-400";
  };

  const STEPS = ["idle", "preview", "importing", "done"] as const;

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

      {/* Fixed-height dialog — nothing escapes */}
      <DialogContent className="sm:max-w-[760px] h-[88vh] flex flex-col p-0 overflow-hidden">
        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <PackagePlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold leading-tight">
                Bulk Product Importer
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Drop{" "}
                <code className="font-mono bg-muted px-1 rounded">.xlsx</code>{" "}
                files — specs &amp; product families are auto-created.
                Duplicates checked by item code <em>and</em> name.
              </DialogDescription>
            </div>
          </div>

          {/* Step pills */}
          <div className="flex items-center gap-1.5 mt-3 text-[11px] font-medium">
            {STEPS.map((s, idx) => {
              const displayStep = step === "cancelled" ? "importing" : step;
              const isCancelledStep = step === "cancelled" && s === "importing";
              const isPast = idx < STEPS.indexOf(displayStep);
              const isActive = displayStep === s;
              return (
                <React.Fragment key={s}>
                  <span
                    className={`px-2 py-0.5 rounded-full transition-colors ${
                      isCancelledStep
                        ? "bg-orange-500 text-white"
                        : isActive
                          ? "bg-primary text-primary-foreground"
                          : isPast
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {idx + 1}.{" "}
                    {isCancelledStep
                      ? "Cancelled"
                      : s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                  {idx < 3 && (
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </DialogHeader>

        {/* ── Body — flex-1, each step owns its own scroll strategy ── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* IDLE */}
          {step === "idle" && (
            <div className="h-full overflow-y-auto">
              <div className="p-6 space-y-5">
                {/* ── Step 1: Website & Status config ── */}
                <div className="rounded-xl border bg-card overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">
                      1
                    </div>
                    <p className="text-sm font-semibold">
                      Configure Import Settings
                    </p>
                    {configComplete && (
                      <CheckCircle className="w-4 h-4 text-emerald-500 ml-auto" />
                    )}
                  </div>
                  <div className="p-4 space-y-4">
                    {/* Website multi-select */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Target Websites{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        {selectedWebsites.length > 0 && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-mono ml-auto"
                          >
                            {selectedWebsites.length} selected
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {WEBSITE_OPTIONS.map((site) => {
                          const checked = selectedWebsites.includes(site);
                          return (
                            // ✅ FIX: Changed from <button> to <div> to avoid
                            // invalid nested <button> inside <button> (Checkbox renders a button).
                            <div
                              key={site}
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleWebsite(site)}
                              onKeyDown={(e) =>
                                e.key === "Enter" && toggleWebsite(site)
                              }
                              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs transition-all cursor-pointer select-none
                                ${
                                  checked
                                    ? "border-primary bg-primary/5 text-primary font-medium"
                                    : "border-border hover:border-primary/40 hover:bg-muted/40 text-muted-foreground"
                                }`}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleWebsite(site)}
                                className="shrink-0 pointer-events-none"
                              />
                              <span className="truncate">{site}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Status selector */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Import Status{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            {
                              value: "public",
                              label: "Public",
                              desc: "Visible on website immediately",
                              icon: <Eye className="w-4 h-4" />,
                              color: "text-emerald-600",
                              activeBg: "border-emerald-500 bg-emerald-50",
                            },
                            {
                              value: "draft",
                              label: "Draft",
                              desc: "Hidden, for review before publishing",
                              icon: <EyeOff className="w-4 h-4" />,
                              color: "text-amber-600",
                              activeBg: "border-amber-500 bg-amber-50",
                            },
                          ] as const
                        ).map((opt) => {
                          const active = importStatus === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setImportStatus(opt.value)}
                              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all
                                ${
                                  active
                                    ? `${opt.activeBg} ${opt.color} font-semibold`
                                    : "border-border hover:border-primary/40 hover:bg-muted/40 text-muted-foreground"
                                }`}
                            >
                              <span
                                className={
                                  active ? opt.color : "text-muted-foreground"
                                }
                              >
                                {opt.icon}
                              </span>
                              <div>
                                <p className="text-xs font-semibold">
                                  {opt.label}
                                </p>
                                <p className="text-[10px] font-normal opacity-70">
                                  {opt.desc}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Step 2: Drop files ── */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors
                      ${configComplete ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      2
                    </div>
                    <p
                      className={`text-sm font-semibold transition-colors ${configComplete ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      Upload Excel Files
                    </p>
                    {!configComplete && (
                      <span className="text-[11px] text-muted-foreground ml-1">
                        — complete step 1 first
                      </span>
                    )}
                  </div>

                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-2xl p-10 text-center
                      flex flex-col items-center justify-center gap-3 transition-all duration-200
                      ${
                        !configComplete
                          ? "opacity-50 cursor-not-allowed border-border bg-muted/20"
                          : isDragActive
                            ? "border-primary bg-primary/8 scale-[1.01] cursor-copy"
                            : "border-border hover:border-primary/40 hover:bg-primary/3 cursor-pointer"
                      }`}
                  >
                    <input {...getInputProps()} />
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors
                      ${isDragActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {isDragActive ? (
                        <FileUp className="w-7 h-7 animate-bounce" />
                      ) : (
                        <Upload className="w-7 h-7" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {!configComplete
                          ? "Select websites and status above to enable"
                          : isDragActive
                            ? "Release to parse"
                            : "Drop your Excel files here"}
                      </p>
                      {configComplete && (
                        <p className="text-xs text-muted-foreground mt-1">
                          or{" "}
                          <span className="text-primary underline underline-offset-2 cursor-pointer">
                            browse
                          </span>{" "}
                          — accepts multiple .xlsx files
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Info cards */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border p-3 space-y-1.5 bg-card">
                    <p className="font-semibold flex items-center gap-1.5 text-primary">
                      <Layers className="w-3.5 h-3.5" /> Required Columns (Row
                      1)
                    </p>
                    {[
                      "A — Category",
                      "B — Product Code",
                      "C — CSV SKU",
                      "D — Cloudinary URL",
                      "E — Product Name (OCR)",
                    ].map((c) => (
                      <div key={c} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                        <code className="font-mono">{c}</code>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border p-3 space-y-1.5 bg-card">
                    <p className="font-semibold flex items-center gap-1.5 text-amber-600">
                      <AlertCircle className="w-3.5 h-3.5" /> Duplicate
                      detection
                    </p>
                    {[
                      "Checks existing itemCode in Firestore",
                      "Checks existing product name in Firestore",
                      "Skips if either match is found",
                      "Product name falls back to Category + Code",
                    ].map((c) => (
                      <div key={c} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-muted-foreground">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PREVIEW — tab bar fixed, panel scrolls */}
          {step === "preview" && (
            <div className="h-full flex flex-col">
              {/* Summary bar */}
              <div className="px-6 py-3 border-b shrink-0 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      {uploadedFiles.length} file
                      {uploadedFiles.length !== 1 ? "s" : ""} ready —{" "}
                      <span className="text-primary font-bold">
                        {allProducts.length}
                      </span>{" "}
                      products across {Object.keys(categorySummary).length}{" "}
                      categories
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Existing duplicates will be skipped automatically during
                      import.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    className="gap-1.5 text-xs h-7 shrink-0 ml-4"
                  >
                    <RefreshCw className="w-3 h-3" /> Change files
                  </Button>
                </div>
                {/* Config summary chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
                    Importing to:
                  </span>
                  {selectedWebsites.map((w) => (
                    <Badge
                      key={w}
                      variant="secondary"
                      className="text-[10px] gap-1"
                    >
                      <Globe className="w-2.5 h-2.5" /> {w}
                    </Badge>
                  ))}
                  <Badge
                    variant="outline"
                    className={`text-[10px] gap-1 ml-1 ${importStatus === "public" ? "border-emerald-400 text-emerald-600" : "border-amber-400 text-amber-600"}`}
                  >
                    {importStatus === "public" ? (
                      <Eye className="w-2.5 h-2.5" />
                    ) : (
                      <EyeOff className="w-2.5 h-2.5" />
                    )}
                    {importStatus === "public" ? "Public" : "Draft"}
                  </Badge>
                </div>
              </div>

              {/* Tab bar */}
              <div className="px-6 py-2.5 border-b shrink-0 flex items-center gap-1 bg-background">
                <TabBtn
                  active={activeTab === "files"}
                  onClick={() => setActiveTab("files")}
                  icon={<FileText className="w-3 h-3" />}
                  label="Files"
                  count={uploadedFiles.length}
                />
                <TabBtn
                  active={activeTab === "categories"}
                  onClick={() => setActiveTab("categories")}
                  icon={<Tag className="w-3 h-3" />}
                  label="Categories"
                  count={Object.keys(categorySummary).length}
                />
                <TabBtn
                  active={activeTab === "products"}
                  onClick={() => setActiveTab("products")}
                  icon={<Package className="w-3 h-3" />}
                  label="Products"
                  count={allProducts.length}
                />
              </div>

              {/* Panel — flex-1, self-contained */}
              <div className="flex-1 min-h-0 p-5">
                {activeTab === "files" && (
                  <FilesPanel fileSummary={fileSummary} />
                )}
                {activeTab === "categories" && (
                  <CategoriesPanel
                    categorySummary={categorySummary}
                    allProducts={allProducts}
                  />
                )}
                {activeTab === "products" && (
                  <ProductsPanel uploadedFiles={uploadedFiles} />
                )}
              </div>
            </div>
          )}

          {/* IMPORTING / DONE / CANCELLED */}
          {(step === "importing" ||
            step === "done" ||
            step === "cancelled") && (
            <div className="h-full flex flex-col p-6 gap-4">
              {/* Progress */}
              <div className="space-y-2 shrink-0">
                <div className="flex justify-between text-sm font-semibold">
                  <span className="flex items-center gap-2 text-slate-600">
                    {importing ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : step === "cancelled" ? (
                      <XCircle className="w-4 h-4 text-orange-500" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    )}
                    {importing
                      ? `Processing: ${currentItem}`
                      : step === "cancelled"
                        ? "Import cancelled"
                        : "Import complete"}
                  </span>
                  <span className="font-mono text-primary">
                    {Math.round(progress)}%
                  </span>
                </div>
                <Progress
                  value={progress}
                  className={`h-2.5 ${step === "cancelled" ? "[&>div]:bg-orange-500" : ""}`}
                />
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-4 gap-2.5 shrink-0">
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
                    <p className={`text-2xl font-black tabular-nums ${s.cls}`}>
                      {s.val}
                    </p>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-0.5">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>

              {/* Console — grows to fill remaining height */}
              <div className="flex-1 min-h-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-widest shrink-0">
                  <Terminal className="w-3 h-3" /> Import Console
                </div>
                <div className="flex-1 min-h-0 bg-slate-950 rounded-xl p-4 font-mono text-[11px] overflow-y-auto space-y-1 border border-slate-800 shadow-inner">
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

        {/* ── Footer ── */}
        <div className="border-t px-6 py-3 flex justify-between items-center shrink-0 bg-muted/20">
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
            {step === "importing" && importing && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleCancel}
                disabled={cancelledRef.current}
                className="gap-2 h-8 text-xs font-semibold"
              >
                <XCircle className="w-3.5 h-3.5" />
                {cancelledRef.current ? "Cancelling..." : "Cancel Import"}
              </Button>
            )}
            {(step === "done" || step === "cancelled") && (
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
