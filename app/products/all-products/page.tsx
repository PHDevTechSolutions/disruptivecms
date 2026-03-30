"use client";

import { ProtectedLayout } from "@/components/layouts/protected-layout";
import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  FilterFn,
} from "@tanstack/react-table";
import {
  Pencil,
  Trash2,
  Loader2,
  Search,
  ArrowLeft,
  PlusCircle,
  Package,
  SlidersHorizontal,
  ChevronDown,
  X,
  Sparkles,
  Globe,
  Check,
  Tag,
  FileText,
  FilePlus2,
  CheckCircle2,
  AlertCircle,
  CircleDashed,
  ShoppingBag,
  Download,
  ExternalLink,
  Layers,
  ArrowUpAZ,
  ArrowDownAZ,
  Clock,
  ArrowUp,
  ArrowDown,
  Sun,
  Trees,
  Home,
  Hash,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  writeBatch,
  serverTimestamp,
  where,
  arrayUnion,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/logger";
import { useProductWorkflow } from "@/lib/useProductWorkflow";
import { useAuth } from "@/lib/useAuth";
import { canWrite as rbacCanWrite } from "@/lib/rbac";
import {
  usePendingProducts,
  PendingRowIndicator,
} from "@/components/product-forms/pending-product-badge";
import { NotificationsDropdown } from "@/components/notifications/notifications-dropdown";

import AddNewProduct from "@/components/product-forms/add-new-product-form";
import BulkUploader from "@/components/product-forms/bulk-uploader";
import { DeleteToRecycleBinDialog } from "@/components/deletedialog";

import { generateTdsPdf, uploadTdsPdf } from "@/lib/tdsGenerator";

// ── New itemCodes schema imports ──────────────────────────────────────────────
import {
  type ItemCodes,
  type ItemCodeBrand,
  ITEM_CODE_BRAND_CONFIG,
  ALL_BRANDS,
  getFilledItemCodes,
  getPrimaryItemCode,
  migrateToItemCodes,
  hasAtLeastOneItemCode,
} from "@/types/product";
import { ItemCodesDisplay } from "@/components/ItemCodesDisplay";

const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "dvmpn8mjh";
const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "taskflow_preset";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Product = {
  id: string;
  itemDescription: string;
  // New schema
  itemCodes?: ItemCodes;
  // Legacy fields kept for backward compat
  ecoItemCode: string;
  litItemCode: string;
  productClass: "spf" | "standard" | "";
  name: string;
  itemCode: string;
  mainImage: string;
  rawImage: string[];
  categories: string;
  productFamily?: string;
  brand: string | string[];
  website: string | string[];
  brands?: string[];
  websites?: string[];
  tdsFileUrl?: string;
  technicalSpecs?: any[];
  dynamicSpecs?: { title: string; value: string }[];
  dimensionDrawingUrl?: string;
  mountingHeightUrl?: string;
  productUsage?: string[];
  createdAt: any;
};

type TdsJobStatus = "pending" | "generating" | "done" | "error";

interface TdsJob {
  productId: string;
  productName: string;
  status: TdsJobStatus;
  error?: string;
}

type SortOption =
  | "alpha-asc"
  | "alpha-desc"
  | "recent-12h"
  | "newest"
  | "oldest"
  | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve all item codes from a product, preferring new schema */
function resolveItemCodes(product: Product): ItemCodes {
  if (product.itemCodes && hasAtLeastOneItemCode(product.itemCodes)) {
    return product.itemCodes;
  }
  return migrateToItemCodes({
    litItemCode: product.litItemCode,
    ecoItemCode: product.ecoItemCode,
    itemCode: product.itemCode,
  });
}

/** Get the primary display code string for a product */
function getPrimaryCode(product: Product): string {
  const codes = resolveItemCodes(product);
  const primary = getPrimaryItemCode(codes);
  if (primary) return primary.code;
  return (
    product.litItemCode || product.ecoItemCode || product.itemCode || product.id
  );
}

/** Build a safe filename from a product */
function safeProductFilename(product: Product): string {
  const code = getPrimaryCode(product);
  return code.replace(/[/\\:*?"<>|]/g, "-").trim();
}

async function downloadPdf(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

function buildTransformedProduct(product: Product, newWebsites: string[]) {
  const existingWebsites: string[] = Array.isArray(product.websites)
    ? product.websites
    : product.website
      ? [product.website as string]
      : [];
  const mergedWebsites = Array.from(
    new Set([...existingWebsites, ...newWebsites]),
  );

  const codes = resolveItemCodes(product);
  const primaryCode = getPrimaryItemCode(codes)?.code ?? "";
  const name = product.itemDescription || product.name || "";
  const brand = Array.isArray(product.brands)
    ? (product.brands[0] ?? "")
    : Array.isArray(product.brand)
      ? ((product.brand as string[])[0] ?? "")
      : ((product.brand as string) ?? "");
  const productFamily =
    product.productFamily || (product.categories as string) || "";
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const rawMain =
    Array.isArray(product.rawImage) && product.rawImage.length > 0
      ? product.rawImage[0]
      : (product.rawImage as unknown as string) || "";
  const mainImage = product.mainImage || rawMain || "";

  return {
    applications: [],
    brand,
    createdAt: serverTimestamp(),
    galleryImages: [],
    importSource: "bulk-assign",
    itemCodes: codes,
    // Legacy compat
    ecoItemCode: codes.ECOSHIFT ?? "",
    litItemCode: codes.LIT ?? "",
    itemCode: primaryCode,
    mainImage,
    name,
    productFamily,
    qrCodeImage: "",
    regularPrice: 0,
    salePrice: 0,
    seo: {
      canonical: "",
      description: "",
      lastUpdated: new Date().toISOString(),
      ogImage: mainImage || "",
      robots: "index, follow",
      title: name,
    },
    shortDescription: "",
    slug,
    status: "draft",
    technicalSpecs: product.technicalSpecs || [],
    updatedAt: serverTimestamp(),
    website: mergedWebsites,
    websites: mergedWebsites,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHEMA_TRANSFORM_WEBSITES = new Set(["Taskflow", "Shopify"]);

const WEBSITE_OPTIONS = [
  {
    id: "disruptive",
    label: "Disruptive Solutions Inc",
    value: "Disruptive Solutions Inc",
    color: "bg-blue-50 border-blue-200 text-blue-700",
    activeColor: "bg-blue-100 border-blue-500 text-blue-800",
    dot: "bg-blue-500",
    transformNote: null,
  },
  {
    id: "ecoshift",
    label: "Ecoshift Corporation",
    value: "Ecoshift Corporation",
    color: "bg-emerald-50 border-emerald-200 text-emerald-700",
    activeColor: "bg-emerald-100 border-emerald-500 text-emerald-800",
    dot: "bg-emerald-500",
    transformNote: null,
  },
  {
    id: "vah",
    label: "Value Acquisitions Holdings",
    value: "Value Acquisitions Holdings",
    color: "bg-amber-50 border-amber-200 text-amber-700",
    activeColor: "bg-amber-100 border-amber-500 text-amber-800",
    dot: "bg-amber-500",
    transformNote: null,
  },
  {
    id: "taskflow",
    label: "Taskflow",
    value: "Taskflow",
    color: "bg-violet-50 border-violet-200 text-violet-700",
    activeColor: "bg-violet-100 border-violet-500 text-violet-800",
    dot: "bg-violet-500",
    transformNote: "Schema transform",
  },
  {
    id: "shopify",
    label: "Shopify",
    value: "Shopify",
    color: "bg-green-50 border-green-200 text-green-700",
    activeColor: "bg-green-100 border-green-500 text-green-800",
    dot: "bg-green-500",
    transformNote: "Schema transform",
  },
];

const PRODUCT_CLASS_OPTIONS: {
  value: "spf" | "standard";
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  activeColor: string;
  dot: string;
}[] = [
  {
    value: "spf",
    label: "SPF",
    description: "Special product family items",
    icon: <Sparkles className="w-4 h-4" />,
    color: "bg-violet-50 border-violet-200 text-violet-700",
    activeColor: "bg-violet-100 border-violet-500 text-violet-800",
    dot: "bg-violet-500",
  },
  {
    value: "standard",
    label: "Standard",
    description: "Regular inventory items",
    icon: <Package className="w-4 h-4" />,
    color: "bg-slate-50 border-slate-200 text-slate-700",
    activeColor: "bg-slate-100 border-slate-500 text-slate-800",
    dot: "bg-slate-500",
  },
];

const TDS_BRAND_OPTIONS: {
  value: "LIT" | "ECOSHIFT";
  label: string;
  description: string;
  activeColor: string;
  dot: string;
}[] = [
  {
    value: "LIT",
    label: "LIT",
    description: "LIT brand header & footer",
    activeColor: "bg-slate-100 border-slate-500 text-slate-800",
    dot: "bg-slate-500",
  },
  {
    value: "ECOSHIFT",
    label: "Ecoshift",
    description: "Ecoshift brand header & footer",
    activeColor: "bg-emerald-100 border-emerald-500 text-emerald-800",
    dot: "bg-emerald-500",
  },
];

// ─── Custom filter ────────────────────────────────────────────────────────────

const multiValueFilter: FilterFn<Product> = (row, columnId, filterValue) => {
  const value = row.getValue(columnId);
  const filter = filterValue.toLowerCase();
  if (Array.isArray(value))
    return value.some((v: string) => v.toLowerCase().includes(filter));
  return String(value).toLowerCase().includes(filter);
};

// ─── Badge components ─────────────────────────────────────────────────────────

function ProductClassBadge({ value }: { value: "spf" | "standard" | "" }) {
  if (!value)
    return <span className="text-xs text-muted-foreground/50">—</span>;
  if (value === "spf")
    return (
      <Badge className="gap-1 bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-100 text-[10px] font-semibold">
        <Sparkles className="w-2.5 h-2.5" /> SPF
      </Badge>
    );
  return (
    <Badge variant="secondary" className="text-[10px] font-semibold">
      <Package className="w-2.5 h-2.5 mr-1" /> Standard
    </Badge>
  );
}

function ProductUsageBadge({
  value,
}: {
  value: string[] | string | undefined;
}) {
  const usages: string[] = Array.isArray(value)
    ? value.map((v) => v.toUpperCase())
    : value
      ? [String(value).toUpperCase()]
      : [];

  if (usages.length === 0)
    return <span className="text-xs text-muted-foreground/50">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {usages.map((u) => {
        if (u === "OUTDOOR")
          return (
            <Badge
              key={u}
              className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-[10px] font-semibold"
            >
              <Trees className="w-2.5 h-2.5" /> Outdoor
            </Badge>
          );
        if (u === "INDOOR")
          return (
            <Badge
              key={u}
              className="gap-1 bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-100 text-[10px] font-semibold"
            >
              <Home className="w-2.5 h-2.5" /> Indoor
            </Badge>
          );
        if (u === "SOLAR")
          return (
            <Badge
              key={u}
              className="gap-1 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-[10px] font-semibold"
            >
              <Sun className="w-2.5 h-2.5" /> Solar
            </Badge>
          );
        return (
          <Badge key={u} variant="outline" className="text-[10px]">
            {u}
          </Badge>
        );
      })}
    </div>
  );
}

function CountPill({
  count,
  variant = "default",
}: {
  count: number;
  variant?: "default" | "violet" | "amber" | "green" | "sky";
}) {
  const styles = {
    default: "text-muted-foreground bg-muted",
    violet: "text-violet-700 bg-violet-50 border border-violet-200",
    amber: "text-amber-700 bg-amber-50 border border-amber-200",
    green: "text-green-700 bg-green-50 border border-green-200",
    sky: "text-sky-700 bg-sky-50 border border-sky-200",
  };
  return (
    <span
      className={`ml-auto shrink-0 text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${styles[variant]}`}
    >
      {count.toLocaleString()}
    </span>
  );
}

// ─── TDS Preview Dialog ───────────────────────────────────────────────────────

function TdsPreviewDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
}) {
  const [downloading, setDownloading] = React.useState(false);
  if (!product) return null;

  const tdsUrl = product.tdsFileUrl;
  const filename = `${safeProductFilename(product)}_TDS.pdf`;

  const handleDownload = async () => {
    if (!tdsUrl) return;
    setDownloading(true);
    try {
      await downloadPdf(tdsUrl, filename);
      toast.success(`${filename} downloaded.`);
    } catch (err) {
      toast.error("Download failed — try the View button to open it directly.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-red-600" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm font-semibold truncate">
                {filename}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5 truncate">
                Technical Data Sheet · Auto-generated
              </DialogDescription>
            </div>
            {tdsUrl && (
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={tdsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View
                  </Button>
                </a>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {downloading ? "Downloading…" : "Download PDF"}
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden bg-muted/30">
          {tdsUrl ? (
            <iframe
              src={`${tdsUrl}#toolbar=1&navpanes=0`}
              className="w-full h-full border-0"
              title={`${getPrimaryCode(product)} TDS`}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground p-8">
              <div className="w-16 h-16 rounded-2xl bg-muted border-2 border-dashed flex items-center justify-center">
                <FileText className="w-7 h-7 text-muted-foreground/40" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold">No TDS file available</p>
                <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                  Use "Generate TDS" to create one.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Generate TDS Dialog ─────────────────────────────────────────────────

function BulkGenerateTdsDialog({
  open,
  onOpenChange,
  jobs,
  onStart,
  isRunning,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobs: TdsJob[];
  onStart: (brand: "LIT" | "ECOSHIFT") => void;
  isRunning: boolean;
}) {
  const [selectedBrand, setSelectedBrand] = React.useState<
    "LIT" | "ECOSHIFT" | null
  >(null);

  React.useEffect(() => {
    if (open) setSelectedBrand(null);
  }, [open]);

  const total = jobs.length;
  const done = jobs.filter((j) => j.status === "done").length;
  const errors = jobs.filter((j) => j.status === "error").length;
  const inProgress = jobs.filter((j) => j.status === "generating").length;
  const pending = jobs.filter((j) => j.status === "pending").length;
  const isComplete = !isRunning && done + errors === total && total > 0;
  const progressPct =
    total > 0 ? Math.round(((done + errors) / total) * 100) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && isRunning) return;
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
              <FilePlus2 className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <DialogTitle className="text-base">
                Bulk Generate TDS PDFs
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {isComplete
                  ? `Finished — ${done} generated, ${errors} failed`
                  : isRunning
                    ? `Generating… ${done + errors} of ${total} complete`
                    : `${total} product${total !== 1 ? "s" : ""} queued · Plain tabular output (no brand assets)`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!isRunning && !isComplete && (
          <div className="space-y-2.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Select Brand (for filename grouping)
            </p>
            {TDS_BRAND_OPTIONS.map((opt) => {
              const isSelected = selectedBrand === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedBrand(opt.value)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all duration-150 ${isSelected ? `${opt.activeColor} shadow-sm` : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? opt.dot : "bg-muted-foreground/30"}`}
                  />
                  <span className="flex flex-col flex-1">
                    <span className="text-sm font-semibold">{opt.label}</span>
                    <span
                      className={`text-[11px] ${isSelected ? "opacity-70" : "text-muted-foreground"}`}
                    >
                      {opt.description}
                    </span>
                  </span>
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${isSelected ? "opacity-100" : "opacity-0"}`}
                  >
                    <Check className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
            {!selectedBrand && (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                A brand must be selected before generating TDS PDFs.
              </p>
            )}
          </div>
        )}

        {(isRunning || isComplete) && (
          <div className="space-y-1.5">
            <Progress value={progressPct} className="h-2" />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>
                {done} done · {errors} failed · {pending + inProgress} remaining
              </span>
              <span>{progressPct}%</span>
            </div>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto rounded-lg border divide-y text-sm">
          {jobs.map((job) => (
            <div
              key={job.productId}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <span className="shrink-0">
                {job.status === "pending" && (
                  <CircleDashed className="w-4 h-4 text-muted-foreground/40" />
                )}
                {job.status === "generating" && (
                  <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                )}
                {job.status === "done" && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
                {job.status === "error" && (
                  <AlertCircle className="w-4 h-4 text-destructive" />
                )}
              </span>
              <span
                className={`flex-1 truncate text-xs ${job.status === "error" ? "text-destructive" : job.status === "done" ? "text-muted-foreground" : "text-foreground"}`}
              >
                {job.productName}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 max-w-35 truncate text-right">
                {job.status === "pending" && "Queued"}
                {job.status === "generating" && "Generating…"}
                {job.status === "done" && "Done"}
                {job.status === "error" && (job.error ?? "Failed")}
              </span>
            </div>
          ))}
        </div>

        {isComplete && (
          <div
            className={`rounded-lg px-4 py-3 border text-xs space-y-0.5 ${errors === 0 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}
          >
            <p className="font-semibold">
              {errors === 0
                ? "All TDS PDFs generated successfully"
                : `${done} generated, ${errors} failed`}
            </p>
            <p className="opacity-80">
              {errors === 0
                ? "tdsFileUrl saved to each product in Firestore."
                : "Failed products were skipped. Retry by selecting them again."}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {isComplete ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isRunning}
              >
                Cancel
              </Button>
              <Button
                onClick={() => selectedBrand && onStart(selectedBrand)}
                disabled={isRunning || total === 0 || !selectedBrand}
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <FilePlus2 className="h-4 w-4" /> Generate {total} TDS PDF
                    {total !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assign to Website Dialog ─────────────────────────────────────────────────

function AssignToWebsiteDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedCount: number;
  onConfirm: (websites: string[]) => Promise<void>;
}) {
  const [selectedWebsites, setSelectedWebsites] = React.useState<string[]>([]);
  const [isAssigning, setIsAssigning] = React.useState(false);

  React.useEffect(() => {
    if (open) setSelectedWebsites([]);
  }, [open]);

  const toggleWebsite = (value: string) => {
    setSelectedWebsites((prev) =>
      prev.includes(value) ? prev.filter((w) => w !== value) : [...prev, value],
    );
  };

  const handleConfirm = async () => {
    if (selectedWebsites.length === 0) return;
    setIsAssigning(true);
    try {
      await onConfirm(selectedWebsites);
      onOpenChange(false);
    } finally {
      setIsAssigning(false);
    }
  };

  const selectedTransformSites = selectedWebsites.filter((w) =>
    SCHEMA_TRANSFORM_WEBSITES.has(w),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="w-4 h-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">Assign to Website</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {selectedCount} product{selectedCount !== 1 ? "s" : ""} will be
                assigned to selected websites.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-2.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-0.5">
            Select Websites
          </p>
          {WEBSITE_OPTIONS.map((site) => {
            const isSelected = selectedWebsites.includes(site.value);
            return (
              <button
                key={site.id}
                type="button"
                onClick={() => toggleWebsite(site.value)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all duration-150 ${isSelected ? `${site.activeColor} shadow-sm` : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"}`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? site.dot : "bg-muted-foreground/30"}`}
                />
                <span
                  className={`flex-1 text-sm font-medium ${isSelected ? "" : "text-foreground"}`}
                >
                  {site.label}
                </span>
                {site.transformNote && (
                  <span
                    className={`text-[10px] font-semibold mr-1 ${site.id === "shopify" ? "text-green-600" : "text-violet-500"}`}
                  >
                    {site.transformNote}
                  </span>
                )}
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${isSelected ? "bg-current/20 opacity-100" : "opacity-0"}`}
                >
                  <Check className="w-3 h-3" />
                </span>
              </button>
            );
          })}
        </div>

        {selectedTransformSites.length > 0 && (
          <div className="space-y-2">
            {selectedTransformSites.includes("Taskflow") && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 text-xs text-violet-700 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />{" "}
                  Taskflow schema transformation
                </p>
                <p className="text-violet-600 leading-snug">
                  Products will be written with remapped item codes, names,
                  images and defaults for slug, SEO, pricing, and status.
                </p>
              </div>
            )}
            {selectedTransformSites.includes("Shopify") && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-xs text-green-700 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 shrink-0" /> Shopify
                  schema transformation
                </p>
                <p className="text-green-600 leading-snug">
                  Products tagged Shopify will have the same schema transform
                  applied.
                </p>
              </div>
            )}
          </div>
        )}

        {selectedWebsites.length > 0 && (
          <div className="bg-muted/50 rounded-lg px-4 py-3 border">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {selectedCount} product{selectedCount !== 1 ? "s" : ""}
              </span>{" "}
              will be added to{" "}
              <span className="font-semibold text-foreground">
                {selectedWebsites.length} website
                {selectedWebsites.length !== 1 ? "s" : ""}
              </span>
              . Existing assignments preserved.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isAssigning}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedWebsites.length === 0 || isAssigning}
            className="gap-2"
          >
            {isAssigning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Assigning...
              </>
            ) : (
              <>
                <Globe className="h-4 w-4" /> Assign to{" "}
                {selectedWebsites.length > 0
                  ? `${selectedWebsites.length} Website${selectedWebsites.length !== 1 ? "s" : ""}`
                  : "Website"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assign Product Class Dialog ──────────────────────────────────────────────

function AssignProductClassDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedCount: number;
  onConfirm: (productClass: "spf" | "standard") => Promise<void>;
}) {
  const [selectedClass, setSelectedClass] = React.useState<
    "spf" | "standard" | null
  >(null);
  const [isAssigning, setIsAssigning] = React.useState(false);

  React.useEffect(() => {
    if (open) setSelectedClass(null);
  }, [open]);

  const handleConfirm = async () => {
    if (!selectedClass) return;
    setIsAssigning(true);
    try {
      await onConfirm(selectedClass);
      onOpenChange(false);
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Tag className="w-4 h-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">
                Assign Product Class
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {selectedCount} product{selectedCount !== 1 ? "s" : ""} will
                have their product class updated.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-2.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-0.5">
            Select Class
          </p>
          {PRODUCT_CLASS_OPTIONS.map((option) => {
            const isSelected = selectedClass === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedClass(option.value)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all duration-150 ${isSelected ? `${option.activeColor} shadow-sm` : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"}`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? option.dot : "bg-muted-foreground/30"}`}
                />
                <span
                  className={`flex items-center gap-2 flex-1 ${isSelected ? "" : "text-foreground"}`}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  <span
                    className={`text-xs ${isSelected ? "opacity-80" : "text-muted-foreground"}`}
                  >
                    — {option.description}
                  </span>
                </span>
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${isSelected ? "opacity-100" : "opacity-0"}`}
                >
                  <Check className="w-3 h-3" />
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isAssigning}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedClass || isAssigning}
            className={`gap-2 ${selectedClass === "spf" ? "bg-violet-600 hover:bg-violet-700 text-white" : ""}`}
          >
            {isAssigning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Assigning...
              </>
            ) : (
              <>
                <Tag className="h-4 w-4" /> Set as{" "}
                {selectedClass === "spf"
                  ? "SPF"
                  : selectedClass === "standard"
                    ? "Standard"
                    : "…"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function AllProductsPage() {
  const [data, setData] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [isEditing, setIsEditing] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = React.useState(false);

  // ── RBAC ──────────────────────────────────────────────────────────────────
  const {
    submitProductDelete,
    submitProductAssignWebsite,
    submitProductSetClass,
    canVerifyProducts,
  } = useProductWorkflow();
  const pendingMap = usePendingProducts();

  const { user } = useAuth();
  const userCanWrite = rbacCanWrite(user, "products");
  const isRequestMode = userCanWrite && !canVerifyProducts();

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [rowsPerPageInput, setRowsPerPageInput] = React.useState("10");

  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<Product | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [assignWebsiteOpen, setAssignWebsiteOpen] = React.useState(false);
  const [assignProductClassOpen, setAssignProductClassOpen] =
    React.useState(false);

  const [tdsPreviewProduct, setTdsPreviewProduct] =
    React.useState<Product | null>(null);
  const [bulkTdsOpen, setBulkTdsOpen] = React.useState(false);
  const [tdsJobs, setTdsJobs] = React.useState<TdsJob[]>([]);
  const [isTdsRunning, setIsTdsRunning] = React.useState(false);
  const [isTdsDownloading, setIsTdsDownloading] = React.useState(false);
  const [sortOption, setSortOption] = React.useState<SortOption>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      )
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Search suggestions — searches across all item codes ───────────────────
  const suggestions = React.useMemo(() => {
    const q = (globalFilter ?? "").trim().toLowerCase();
    if (!q) return [];
    return data
      .filter((p) => {
        const codes = resolveItemCodes(p);
        const filledCodes = getFilledItemCodes(codes);
        const codeMatch = filledCodes.some(({ code }) =>
          code.toLowerCase().includes(q),
        );
        return (
          p.itemDescription?.toLowerCase().includes(q) ||
          p.name?.toLowerCase().includes(q) ||
          codeMatch ||
          (p.categories as string)?.toLowerCase().includes(q)
        );
      })
      .slice(0, 7);
  }, [data, globalFilter]);

  // ── Firestore listener ────────────────────────────────────────────────────
  React.useEffect(() => {
    setLoading(true);

    const mergeAndSort = (a: Product[], b: Product[]): Product[] => {
      const seen = new Set<string>();
      const merged: Product[] = [];
      for (const p of [...a, ...b]) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          merged.push(p);
        }
      }
      merged.sort((x, y) => {
        const tx = x.createdAt?.toMillis?.() ?? x.createdAt ?? 0;
        const ty = y.createdAt?.toMillis?.() ?? y.createdAt ?? 0;
        return ty - tx;
      });
      return merged;
    };

    let assignedData: Product[] = [];
    let unassignedData: Product[] = [];
    let assignedReady = false;
    let unassignedReady = false;

    const flush = () => {
      if (assignedReady && unassignedReady) {
        setData(mergeAndSort(assignedData, unassignedData));
        setLoading(false);
      }
    };

    const qAssigned = query(
      collection(db, "products"),
      where("websites", "array-contains-any", [
        "Disruptive Solutions Inc",
        "Ecoshift Corporation",
        "Value Acquisitions Holdings",
        "Taskflow",
        "Shopify",
      ]),
      orderBy("createdAt", "desc"),
    );
    const qUnassigned = query(
      collection(db, "products"),
      where("websites", "==", []),
      orderBy("createdAt", "desc"),
    );

    const unsubAssigned = onSnapshot(
      qAssigned,
      (snapshot) => {
        assignedData = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Product[];
        assignedReady = true;
        flush();
      },
      (error) => {
        console.error("Fetch error (assigned):", error);
        toast.error("Failed to load products");
        setLoading(false);
      },
    );

    const unsubUnassigned = onSnapshot(
      qUnassigned,
      (snapshot) => {
        unassignedData = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Product[];
        unassignedReady = true;
        flush();
      },
      (error) => {
        console.warn("Could not fetch unassigned products:", error);
        unassignedReady = true;
        flush();
      },
    );

    return () => {
      unsubAssigned();
      unsubUnassigned();
    };
  }, []);

  // ── Delete handlers ───────────────────────────────────────────────────────
  const handleSoftDelete = async (product: Product) => {
    const t = toast.loading("Processing…");
    try {
      const result = await submitProductDelete({
        product,
        originPage: "/products/all-products",
        source: "all-products:delete",
      });
      toast.success(result.message, {
        id: t,
        description:
          result.mode === "pending"
            ? "A PD Manager or Admin will review your request."
            : undefined,
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete product.", { id: t });
    }
  };

  const handleBulkSoftDelete = async () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    setIsDeleting(true);
    const t = toast.loading(
      `Submitting delete for ${selectedRows.length} products…`,
    );
    let direct = 0,
      pending = 0,
      errors = 0;

    await Promise.all(
      selectedRows.map(async ({ original: product }) => {
        try {
          const result = await submitProductDelete({
            product,
            originPage: "/products/all-products",
            source: "all-products:bulk-delete",
          });
          result.mode === "pending" ? pending++ : direct++;
        } catch {
          errors++;
        }
      }),
    );

    if (errors === 0) {
      const parts: string[] = [];
      if (direct > 0) parts.push(`${direct} moved to recycle bin`);
      if (pending > 0) parts.push(`${pending} pending approval`);
      toast.success(parts.join(", ") || "Done", { id: t });
    } else {
      toast.error(`${errors} error(s). ${direct + pending} succeeded.`, {
        id: t,
      });
    }
    setRowSelection({});
    setIsDeleting(false);
  };

  // ── Bulk assign website ───────────────────────────────────────────────────
  const handleBulkAssignWebsite = async (websites: string[]) => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const rows = selectedRows.map((r) => r.original);
    const count = rows.length;
    const t = toast.loading(
      `${isRequestMode ? "Submitting" : "Assigning"} ${count} product${count !== 1 ? "s" : ""} to ${websites.join(", ")}...`,
    );
    let direct = 0,
      pending = 0,
      errors = 0;

    await Promise.all(
      rows.map(async (product) => {
        try {
          const transformSites = websites.filter((w) =>
            SCHEMA_TRANSFORM_WEBSITES.has(w),
          );
          const transformedFields =
            transformSites.length > 0
              ? buildTransformedProduct(product, websites)
              : undefined;
          const result = await submitProductAssignWebsite({
            product,
            websites,
            transformedFields,
            originPage: "/products/all-products",
            source: "all-products:bulk-assign-website",
          });
          result.mode === "pending" ? pending++ : direct++;
        } catch {
          errors++;
        }
      }),
    );

    if (errors === 0) {
      const parts: string[] = [];
      if (direct > 0) parts.push(`${direct} assigned`);
      if (pending > 0) parts.push(`${pending} pending approval`);
      toast.success(parts.join(", ") || "Done", { id: t });
    } else {
      toast.error(`${errors} error(s). ${direct + pending} succeeded.`, {
        id: t,
      });
    }
    setRowSelection({});
  };

  // ── Bulk assign product class ─────────────────────────────────────────────
  const handleBulkAssignProductClass = async (
    productClass: "spf" | "standard",
  ) => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const rows = selectedRows.map((r) => r.original);
    const count = rows.length;
    const label = productClass === "spf" ? "SPF" : "Standard";
    const t = toast.loading(
      `${isRequestMode ? "Submitting" : "Setting"} ${count} product${count !== 1 ? "s" : ""} to "${label}"...`,
    );
    let direct = 0,
      pending = 0,
      errors = 0;

    await Promise.all(
      rows.map(async (product) => {
        try {
          const result = await submitProductSetClass({
            product,
            productClass,
            originPage: "/products/all-products",
            source: "all-products:bulk-set-product-class",
          });
          result.mode === "pending" ? pending++ : direct++;
        } catch {
          errors++;
        }
      }),
    );

    if (errors === 0) {
      const parts: string[] = [];
      if (direct > 0) parts.push(`${direct} set to "${label}"`);
      if (pending > 0) parts.push(`${pending} pending approval`);
      toast.success(parts.join(", ") || "Done", { id: t });
    } else {
      toast.error(`${errors} error(s). ${direct + pending} succeeded.`, {
        id: t,
      });
    }
    setRowSelection({});
  };

  // ── Bulk TDS generate — uses new itemCodes schema ─────────────────────────
  const handleOpenBulkTds = () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const jobs: TdsJob[] = selectedRows.map((row) => ({
      productId: row.original.id,
      productName:
        row.original.itemDescription || row.original.name || row.original.id,
      status: "pending",
    }));
    setTdsJobs(jobs);
    setBulkTdsOpen(true);
  };

  const handleStartBulkTds = async (brand: "LIT" | "ECOSHIFT") => {
    setIsTdsRunning(true);
    const productMap = new Map<string, Product>(
      table
        .getFilteredSelectedRowModel()
        .rows.map((r) => [r.original.id, r.original]),
    );

    for (let i = 0; i < tdsJobs.length; i++) {
      const job = tdsJobs[i];
      const product = productMap.get(job.productId);

      setTdsJobs((prev) =>
        prev.map((j) =>
          j.productId === job.productId ? { ...j, status: "generating" } : j,
        ),
      );

      try {
        if (!product) throw new Error("Product not found in selection");

        const itemDescription = product.itemDescription || product.name || "";
        const resolvedCodes = resolveItemCodes(product);

        const technicalSpecs = (product.technicalSpecs ?? [])
          .map((group) => ({
            ...group,
            specs: (group.specs ?? []).filter((s: { value: any }) => {
              const v = (s.value ?? "").toUpperCase().trim();
              return v !== "" && v !== "N/A";
            }),
          }))
          .filter((group) => (group.specs ?? []).length > 0);

        const p = product as any;

        const tdsBlob = await generateTdsPdf({
          itemDescription,
          itemCodes: resolvedCodes,
          litItemCode: resolvedCodes.LIT,
          ecoItemCode: resolvedCodes.ECOSHIFT,
          technicalSpecs,
          brand,
          // Plain tabular by default — no brand assets
          includeBrandAssets: false,
          mainImageUrl:
            product.mainImage ||
            (Array.isArray(product.rawImage)
              ? product.rawImage[0]
              : (product.rawImage as unknown as string)) ||
            undefined,
          dimensionalDrawingUrl:
            p.dimensionDrawingImage || p.dimensionalDrawingImage || undefined,
          recommendedMountingHeightUrl:
            p.mountingHeightImage ||
            p.recommendedMountingHeightImage ||
            undefined,
          driverCompatibilityUrl: p.driverCompatibilityImage || undefined,
          baseImageUrl: p.baseImage || undefined,
          illuminanceLevelUrl: p.illuminanceLevelImage || undefined,
          wiringDiagramUrl: p.wiringDiagramImage || undefined,
          installationUrl: p.installationImage || undefined,
          wiringLayoutUrl: p.wiringLayoutImage || undefined,
          terminalLayoutUrl: p.terminalLayoutImage || undefined,
          accessoriesImageUrl: p.accessoriesImage || undefined,
        });

        const primaryCode =
          getPrimaryItemCode(resolvedCodes)?.code ?? product.id;
        const filename = `${primaryCode.replace(/[/\\:*?"<>|]/g, "-")}_TDS.pdf`;
        const tdsUrl = await uploadTdsPdf(
          tdsBlob,
          filename,
          CLOUDINARY_CLOUD_NAME,
          CLOUDINARY_UPLOAD_PRESET,
        );

        if (tdsUrl.startsWith("http")) {
          await updateDoc(doc(db, "products", product.id), {
            tdsFileUrl: tdsUrl,
            updatedAt: serverTimestamp(),
          });
        }

        setTdsJobs((prev) =>
          prev.map((j) =>
            j.productId === job.productId ? { ...j, status: "done" } : j,
          ),
        );
      } catch (err: any) {
        console.error(`TDS generation failed for ${job.productId}:`, err);
        setTdsJobs((prev) =>
          prev.map((j) =>
            j.productId === job.productId
              ? {
                  ...j,
                  status: "error",
                  error: err?.message ?? "Unknown error",
                }
              : j,
          ),
        );
      }
    }

    setIsTdsRunning(false);
    await logAuditEvent({
      action: "update",
      entityType: "product",
      entityId: null,
      entityName: `${tdsJobs.length} products`,
      context: {
        page: "/products/all-products",
        source: "all-products:bulk-generate-tds",
        collection: "products",
        bulk: true,
      },
      metadata: {
        brand,
        total: tdsJobs.length,
        productIds: tdsJobs.map((j) => j.productId),
      },
    }).catch(console.warn);
  };

  // ── Bulk Download TDS ZIP — uses new itemCodes schema ─────────────────────
  const handleBulkDownloadTds = async () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const withTds = selectedRows.filter((r) => !!r.original.tdsFileUrl);

    if (withTds.length === 0) {
      toast.error("None of the selected products have a TDS file.");
      return;
    }

    setIsTdsDownloading(true);
    const noTdsCount = selectedRows.length - withTds.length;
    const loadingToast = toast.loading(
      `Preparing ${withTds.length} TDS file${withTds.length !== 1 ? "s" : ""}…`,
    );

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const litFolder = zip.folder("LIT")!;
      const ecoshiftFolder = zip.folder("ECOSHIFT")!;
      const otherFolder = zip.folder("OTHER")!;

      // Detect folder using new itemCodes schema
      const detectFolder = (product: Product) => {
        const codes = resolveItemCodes(product);
        const filled = getFilledItemCodes(codes);
        if (filled.length === 0) return litFolder;
        // Primary brand determines folder
        const primaryBrand = filled[0].brand;
        if (primaryBrand === "ECOSHIFT") return ecoshiftFolder;
        if (primaryBrand === "LIT") return litFolder;
        return otherFolder;
      };

      const usedFilenames = new Map<string, number>();
      const tdsFilename = (product: Product): string => {
        const base = `${safeProductFilename(product)}_TDS`;
        const count = usedFilenames.get(base) ?? 0;
        usedFilenames.set(base, count + 1);
        return count === 0 ? `${base}.pdf` : `${base}_(${count}).pdf`;
      };

      const fetchWithRetry = async (
        url: string,
        retries = 3,
      ): Promise<Blob> => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.blob();
          } catch (err) {
            lastError = err;
            if (attempt < retries)
              await new Promise((r) => setTimeout(r, 400 * attempt));
          }
        }
        throw lastError;
      };

      const BATCH = 8;
      const BATCH_DELAY_MS = 300;
      let succeeded = 0,
        failed = 0;
      const failedNames: string[] = [];

      for (let i = 0; i < withTds.length; i += BATCH) {
        const chunk = withTds.slice(i, i + BATCH);
        const fetched = Math.min(i + BATCH, withTds.length);
        toast.loading(
          `Fetching ${fetched} / ${withTds.length} (${succeeded} saved, ${failed} failed)…`,
          { id: loadingToast },
        );

        const results = await Promise.allSettled(
          chunk.map(async ({ original: product }) => {
            const blob = await fetchWithRetry(product.tdsFileUrl!);
            const folder = detectFolder(product);
            folder.file(tdsFilename(product), blob);
          }),
        );

        results.forEach((r, idx) => {
          if (r.status === "fulfilled") {
            succeeded++;
          } else {
            failed++;
            failedNames.push(getPrimaryCode(chunk[idx].original));
          }
        });

        if (i + BATCH < withTds.length)
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }

      toast.loading("Compressing ZIP…", { id: loadingToast });
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Generated TDS.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(
        [
          `${succeeded} TDS file${succeeded !== 1 ? "s" : ""} downloaded`,
          failed > 0 ? `${failed} failed` : null,
          noTdsCount > 0 ? `${noTdsCount} skipped (no TDS)` : null,
          "→ Organised into LIT / ECOSHIFT / OTHER folders",
        ]
          .filter(Boolean)
          .join(" · "),
        { id: loadingToast },
      );
    } catch (err) {
      console.error("TDS ZIP download failed:", err);
      toast.error("Failed to create TDS ZIP.", { id: loadingToast });
    } finally {
      setIsTdsDownloading(false);
    }
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setIsEditing(true);
  };

  // ── Columns — unified itemCodes column replaces ecoItemCode/litItemCode ───
  const columns: ColumnDef<Product>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "mainImage",
      header: () => <div className="text-xs font-medium">Image</div>,
      cell: ({ row }) => {
        const imageUrl = row.getValue("mainImage") as string;
        const label = row.original.itemDescription || row.original.name;
        return (
          <div className="w-12 h-12 bg-muted rounded-lg p-1 border overflow-hidden flex items-center justify-center shrink-0">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={label}
                className="w-full h-full object-contain"
              />
            ) : (
              <Package className="h-6 w-6 text-muted-foreground/40" />
            )}
          </div>
        );
      },
      enableHiding: false,
    },
    {
      // Unified item codes column — shows all brands with colored badges
      id: "itemCodes",
      accessorFn: (row) => {
        const codes = resolveItemCodes(row);
        return getFilledItemCodes(codes)
          .map(({ code }) => code)
          .join(" ");
      },
      header: () => (
        <div className="text-xs font-medium flex items-center gap-1.5">
          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          Item Codes
        </div>
      ),
      cell: ({ row }) => {
        const codes = resolveItemCodes(row.original);
        return (
          <div className="min-w-[120px]">
            <ItemCodesDisplay itemCodes={codes} size="sm" maxVisible={3} />
          </div>
        );
      },
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        const codes = resolveItemCodes(row.original);
        const allCodes = getFilledItemCodes(codes).map(({ code }) =>
          code.toLowerCase(),
        );
        return allCodes.some((c) =>
          c.includes(String(filterValue).toLowerCase()),
        );
      },
    },
    {
      accessorKey: "itemDescription",
      header: () => <div className="text-xs font-medium">Item Description</div>,
      cell: ({ row }) => {
        const desc = row.getValue("itemDescription") as string;
        const fallback = row.original.name;
        const family =
          row.original.productFamily || (row.original.categories as string);
        return (
          <div className="flex flex-col max-w-65">
            <span className="font-semibold text-sm line-clamp-2 leading-snug">
              {desc || fallback || "—"}
            </span>
            {family && (
              <span className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {family}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "productFamilyFilter",
      accessorFn: (row) =>
        row.productFamily || (row.categories as string) || "",
      header: () => (
        <div className="text-xs font-medium flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          Product Family
        </div>
      ),
      cell: ({ row }) => {
        const family =
          row.original.productFamily || (row.original.categories as string);
        return family ? (
          <span className="text-xs text-muted-foreground truncate max-w-40 block">
            {family}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        );
      },
      enableHiding: true,
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        const family =
          row.original.productFamily ||
          (row.original.categories as string) ||
          "";
        return family === filterValue;
      },
    },
    {
      accessorKey: "productClass",
      header: () => <div className="text-xs font-medium">Class</div>,
      cell: ({ row }) => (
        <ProductClassBadge
          value={row.getValue("productClass") as "spf" | "standard" | ""}
        />
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return (row.getValue("productClass") as string) === filterValue;
      },
    },
    {
      accessorKey: "productUsage",
      header: () => <div className="text-xs font-medium">Usage</div>,
      cell: ({ row }) => (
        <ProductUsageBadge value={row.original.productUsage} />
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        const usages: string[] = Array.isArray(row.original.productUsage)
          ? row.original.productUsage
          : row.original.productUsage
            ? [row.original.productUsage as string]
            : [];
        return usages.some(
          (u) => u.toUpperCase() === String(filterValue).toUpperCase(),
        );
      },
    },
    {
      id: "details",
      accessorFn: (row) => {
        const brand = Array.isArray(row.brands)
          ? row.brands.join(" ")
          : row.brand;
        const web = Array.isArray(row.websites)
          ? row.websites.join(" ")
          : row.website;
        return `${brand} ${web}`;
      },
      header: () => <div className="text-xs font-medium">Brand & Website</div>,
      cell: ({ row }) => {
        const brands = Array.isArray(row.original.brands)
          ? row.original.brands
          : [row.original.brand || "Generic"];
        const websites = Array.isArray(row.original.websites)
          ? row.original.websites
          : row.original.website
            ? [row.original.website as string]
            : [];
        return (
          <div className="flex flex-col gap-1 items-start">
            <Badge variant="outline" className="text-xs font-medium">
              {brands.join(", ")}
            </Badge>
            {websites.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {websites.map((w) => (
                  <Badge
                    key={w}
                    variant="secondary"
                    className={`text-xs ${w === "Shopify" ? "bg-green-100 text-green-700 border-green-200" : w === "Taskflow" ? "bg-violet-100 text-violet-700 border-violet-200" : ""}`}
                  >
                    {w === "Shopify" && (
                      <ShoppingBag className="w-2.5 h-2.5 mr-1" />
                    )}
                    {w}
                  </Badge>
                ))}
              </div>
            ) : (
              <Badge
                variant="outline"
                className="text-xs text-muted-foreground border-dashed"
              >
                No website
              </Badge>
            )}
          </div>
        );
      },
      filterFn: multiValueFilter,
    },
    {
      id: "actions",
      header: () => (
        <div className="text-xs font-medium text-right">Actions</div>
      ),
      cell: ({ row }) => {
        const product = row.original;
        const pendingStatus = pendingMap.get(product.id) ?? null;
        const isPendingDelete = pendingStatus === "delete";
        const busy = !!pendingStatus;

        return (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {product.tdsFileUrl && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:bg-red-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTdsPreviewProduct(product);
                    }}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  View TDS
                </TooltipContent>
              </Tooltip>
            )}
            <PendingRowIndicator status={pendingStatus} />
            {userCanWrite && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEdit(product)}
                    disabled={isPendingDelete}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {isPendingDelete
                    ? "Cannot edit — deletion pending"
                    : "Edit product"}
                </TooltipContent>
              </Tooltip>
            )}
            {userCanWrite && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteTarget(product)}
                    disabled={busy}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {busy
                    ? "Pending — cannot delete"
                    : isRequestMode
                      ? "Submit delete request"
                      : "Delete product"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  // ── Derived data ──────────────────────────────────────────────────────────
  const uniqueBrands = React.useMemo(() => {
    const s = new Set<string>();
    data.forEach((p) => {
      if (Array.isArray(p.brands)) p.brands.forEach((b) => s.add(b));
      else if (p.brand) s.add(p.brand as string);
    });
    return Array.from(s).sort();
  }, [data]);

  const uniqueWebsites = React.useMemo(() => {
    const s = new Set<string>();
    data.forEach((p) => {
      if (Array.isArray(p.websites)) p.websites.forEach((w) => s.add(w));
      else if (p.website) s.add(p.website as string);
    });
    return Array.from(s).sort();
  }, [data]);

  const uniqueProductFamilies = React.useMemo(() => {
    const s = new Set<string>();
    data.forEach((p) => {
      const fam = p.productFamily || (p.categories as string);
      if (fam) s.add(fam);
    });
    return Array.from(s).sort();
  }, [data]);

  const brandCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    data.forEach((p) => {
      const brands = Array.isArray(p.brands)
        ? p.brands
        : p.brand
          ? [p.brand as string]
          : [];
      brands.forEach((b) => m.set(b, (m.get(b) ?? 0) + 1));
    });
    return m;
  }, [data]);

  const websiteCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    data.forEach((p) => {
      const websites = Array.isArray(p.websites)
        ? p.websites
        : p.website
          ? [p.website as string]
          : [];
      websites.forEach((w) => m.set(w, (m.get(w) ?? 0) + 1));
    });
    return m;
  }, [data]);

  const productFamilyCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    data.forEach((p) => {
      const fam = p.productFamily || (p.categories as string);
      if (fam) m.set(fam, (m.get(fam) ?? 0) + 1);
    });
    return m;
  }, [data]);

  const productClassCounts = React.useMemo(() => {
    const m = new Map<string, number>([
      ["spf", 0],
      ["standard", 0],
      ["", 0],
    ]);
    data.forEach((p) => {
      const cls = p.productClass ?? "";
      m.set(cls, (m.get(cls) ?? 0) + 1);
    });
    return m;
  }, [data]);

  const productUsageCounts = React.useMemo(() => {
    const m = new Map<string, number>([
      ["OUTDOOR", 0],
      ["INDOOR", 0],
      ["SOLAR", 0],
      ["", 0],
    ]);
    data.forEach((p) => {
      const usages: string[] = Array.isArray(p.productUsage)
        ? p.productUsage
        : p.productUsage
          ? [p.productUsage as string]
          : [];
      if (usages.length === 0) {
        m.set("", (m.get("") ?? 0) + 1);
      } else {
        usages.forEach((u) => {
          const key = u.toUpperCase();
          m.set(key, (m.get(key) ?? 0) + 1);
        });
      }
    });
    return m;
  }, [data]);

  const noWebsiteCount = React.useMemo(
    () =>
      data.filter((p) => {
        const websites = Array.isArray(p.websites)
          ? p.websites
          : p.website
            ? [p.website as string]
            : [];
        return websites.length === 0;
      }).length,
    [data],
  );

  const sortedData = React.useMemo(() => {
    const d = [...data];
    const ts = (p: Product): number =>
      p.createdAt?.toMillis?.() ??
      (typeof p.createdAt === "number" ? p.createdAt : 0);
    const label = (p: Product) =>
      (p.itemDescription || p.name || "").toLowerCase();
    switch (sortOption) {
      case "alpha-asc":
        return d.sort((a, b) => label(a).localeCompare(label(b)));
      case "alpha-desc":
        return d.sort((a, b) => label(b).localeCompare(label(a)));
      case "recent-12h": {
        const cutoff = Date.now() - 12 * 60 * 60 * 1000;
        return d.filter((p) => ts(p) >= cutoff).sort((a, b) => ts(b) - ts(a));
      }
      case "oldest":
        return d.sort((a, b) => ts(a) - ts(b));
      case "newest":
      default:
        return d.sort((a, b) => ts(b) - ts(a));
    }
  }, [data, sortOption]);

  const table = useReactTable({
    data: sortedData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    filterFns: { multiValue: multiValueFilter },
  });

  const selectedCount = Object.keys(rowSelection).length;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;
  const isFiltered = filteredCount !== totalCount;

  const activeFamilyFilter =
    (table.getColumn("productFamilyFilter")?.getFilterValue() as string) ?? "";
  const activeUsageFilter =
    (table.getColumn("productUsage")?.getFilterValue() as string) ?? "";
  const [familySearch, setFamilySearch] = React.useState("");

  const sortLabel: Record<NonNullable<SortOption>, string> = {
    "alpha-asc": "A → Z",
    "alpha-desc": "Z → A",
    "recent-12h": "Last 12 h",
    newest: "Newest",
    oldest: "Oldest",
  };

  const renderEditMode = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => {
            setSelectedProduct(null);
            setIsEditing(false);
          }}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Products
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <p className="text-sm text-muted-foreground">
          {selectedProduct
            ? `Editing: ${selectedProduct.itemDescription || selectedProduct.name}`
            : "Adding New Product"}
        </p>
      </div>
      <AddNewProduct
        editData={selectedProduct}
        onFinished={() => {
          setSelectedProduct(null);
          setIsEditing(false);
        }}
      />
    </div>
  );

  const renderTableMode = () => (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Product Inventory
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage and update your website products —{" "}
            {loading ? (
              <span className="text-muted-foreground">Loading...</span>
            ) : (
              <>
                <span className="font-semibold text-foreground">
                  {isFiltered ? filteredCount : totalCount}
                </span>
                {isFiltered && (
                  <span className="text-muted-foreground">
                    {" "}
                    of {totalCount}
                  </span>
                )}{" "}
                product{totalCount !== 1 ? "s" : ""}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <BulkUploader onUploadComplete={() => {}} />
          {userCanWrite && (
            <Button
              onClick={() => {
                setSelectedProduct(null);
                setIsEditing(true);
              }}
              className="gap-2"
            >
              <PlusCircle className="h-4 w-4" /> Add Product
            </Button>
          )}
        </div>
      </div>

      {/* Bulk actions */}
      {selectedCount > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-destructive/20 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold text-destructive">
                {selectedCount}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold">
                {selectedCount} product{selectedCount > 1 ? "s" : ""} selected
              </p>
              <p className="text-xs text-muted-foreground">
                Ready for bulk actions
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => table.resetRowSelection()}
              className="gap-2"
            >
              <X className="h-4 w-4" /> Clear
            </Button>
            {userCanWrite && (
              <Button
                variant="outline"
                size="sm"
                className={`gap-2 ${isRequestMode ? "border-amber-300 text-amber-700 hover:bg-amber-50" : "border-primary/30 text-primary hover:bg-primary/5"}`}
                onClick={() => setAssignWebsiteOpen(true)}
              >
                <Globe className="h-4 w-4" />{" "}
                {isRequestMode ? "Request Website Assign" : "Assign to Website"}
              </Button>
            )}
            {userCanWrite && (
              <Button
                variant="outline"
                size="sm"
                className={`gap-2 ${isRequestMode ? "border-amber-300 text-amber-700 hover:bg-amber-50" : "border-violet-300 text-violet-700 hover:bg-violet-50"}`}
                onClick={() => setAssignProductClassOpen(true)}
              >
                <Tag className="h-4 w-4" />{" "}
                {isRequestMode ? "Request Class Change" : "Set Product Class"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50"
              onClick={handleOpenBulkTds}
            >
              <FilePlus2 className="h-4 w-4" /> Generate TDS
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-sky-300 text-sky-700 hover:bg-sky-50"
              disabled={isTdsDownloading}
              onClick={handleBulkDownloadTds}
            >
              {isTdsDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isTdsDownloading ? "Zipping…" : "Download TDS ZIP"}
            </Button>
            {userCanWrite && (
              <Button
                variant={isRequestMode ? "outline" : "destructive"}
                size="sm"
                disabled={isDeleting}
                className={`gap-2 ${isRequestMode ? "border-amber-300 text-amber-700 hover:bg-amber-50" : ""}`}
                onClick={() => setBulkDeleteOpen(true)}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {isRequestMode
                  ? `Request Delete (${selectedCount})`
                  : `Move ${selectedCount} to Bin`}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search — covers all item code brands */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4 z-10" />
          <Input
            placeholder="Search by name, any item code…"
            value={globalFilter ?? ""}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowSuggestions(false);
            }}
            className="pl-9"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden">
              {suggestions.map((product) => {
                const brands = Array.isArray(product.brands)
                  ? product.brands
                  : [product.brand || "Generic"];
                const codes = resolveItemCodes(product);
                return (
                  <button
                    key={product.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setShowSuggestions(false);
                      setGlobalFilter("");
                      handleEdit(product);
                    }}
                  >
                    <div className="w-9 h-9 shrink-0 bg-muted rounded-md border overflow-hidden flex items-center justify-center">
                      {product.mainImage ? (
                        <img
                          src={product.mainImage}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Package className="h-4 w-4 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">
                        {product.itemDescription || product.name}
                      </span>
                      <div className="mt-0.5">
                        <ItemCodesDisplay
                          itemCodes={codes}
                          size="sm"
                          maxVisible={2}
                        />
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="ml-auto shrink-0 text-xs"
                    >
                      {brands[0]}
                    </Badge>
                  </button>
                );
              })}
              <div className="px-3 py-1.5 border-t bg-muted/40">
                <p className="text-xs text-muted-foreground">
                  {suggestions.length} suggestion
                  {suggestions.length !== 1 ? "s" : ""} — press Enter to search
                  all
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Product Class filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              Product Class <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onClick={() =>
                table.getColumn("productClass")?.setFilterValue("")
              }
              className="flex items-center justify-between"
            >
              <span>All Classes</span>
              <CountPill count={data.length} />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                table.getColumn("productClass")?.setFilterValue("spf")
              }
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-violet-500" /> SPF Items
              </span>
              <CountPill
                count={productClassCounts.get("spf") ?? 0}
                variant="violet"
              />
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                table.getColumn("productClass")?.setFilterValue("standard")
              }
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5" /> Standard Items
              </span>
              <CountPill count={productClassCounts.get("standard") ?? 0} />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Product Usage filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className={`gap-2 ${activeUsageFilter ? "border-primary text-primary bg-primary/5" : ""}`}
            >
              {activeUsageFilter === "OUTDOOR" ? (
                <Trees className="h-4 w-4 text-emerald-600" />
              ) : activeUsageFilter === "INDOOR" ? (
                <Home className="h-4 w-4 text-sky-600" />
              ) : activeUsageFilter === "SOLAR" ? (
                <Sun className="h-4 w-4 text-amber-500" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
              {activeUsageFilter
                ? activeUsageFilter.charAt(0).toUpperCase() +
                  activeUsageFilter.slice(1).toLowerCase()
                : "Usage"}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={() =>
                table.getColumn("productUsage")?.setFilterValue("")
              }
              className="flex items-center justify-between"
            >
              <span>All Usage</span>
              <div className="flex items-center gap-1.5">
                <CountPill count={data.length} />
                {!activeUsageFilter && (
                  <Check className="h-3.5 w-3.5 text-primary" />
                )}
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {[
              {
                key: "OUTDOOR",
                icon: <Trees className="w-3.5 h-3.5 text-emerald-600" />,
                label: "Outdoor",
                variant: "green" as const,
              },
              {
                key: "INDOOR",
                icon: <Home className="w-3.5 h-3.5 text-sky-600" />,
                label: "Indoor",
                variant: "sky" as const,
              },
              {
                key: "SOLAR",
                icon: <Sun className="w-3.5 h-3.5 text-amber-500" />,
                label: "Solar",
                variant: "amber" as const,
              },
            ].map(({ key, icon, label, variant }) => (
              <DropdownMenuItem
                key={key}
                onClick={() =>
                  table
                    .getColumn("productUsage")
                    ?.setFilterValue(activeUsageFilter === key ? "" : key)
                }
                className="flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  {icon} {label}
                </span>
                <div className="flex items-center gap-1.5">
                  <CountPill
                    count={productUsageCounts.get(key) ?? 0}
                    variant={variant}
                  />
                  {activeUsageFilter === key && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Product Family filter */}
        <DropdownMenu
          onOpenChange={(open) => {
            if (!open) setFamilySearch("");
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className={`gap-2 ${activeFamilyFilter ? "border-primary text-primary bg-primary/5" : ""}`}
            >
              <Layers className="h-4 w-4" />
              {activeFamilyFilter ? (
                <span className="max-w-36 truncate">{activeFamilyFilter}</span>
              ) : (
                "Product Family"
              )}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-72 p-0 overflow-x-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                placeholder="Search families…"
                value={familySearch}
                onChange={(e) => setFamilySearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60 min-w-0"
                autoFocus
              />
              {familySearch && (
                <button
                  type="button"
                  onClick={() => setFamilySearch("")}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto overflow-x-hidden py-1">
              <DropdownMenuItem
                onClick={() =>
                  table.getColumn("productFamilyFilter")?.setFilterValue("")
                }
                className="flex items-center justify-between"
              >
                <span className="text-muted-foreground italic">
                  All Families
                </span>
                <div className="flex items-center gap-1.5">
                  <CountPill count={data.length} />
                  {!activeFamilyFilter && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {(() => {
                const filtered = uniqueProductFamilies.filter((f) =>
                  f.toLowerCase().includes(familySearch.toLowerCase()),
                );
                if (filtered.length === 0)
                  return (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                      No families match "{familySearch}"
                    </div>
                  );
                return filtered.map((family) => (
                  <DropdownMenuItem
                    key={family}
                    onClick={() =>
                      table
                        .getColumn("productFamilyFilter")
                        ?.setFilterValue(
                          activeFamilyFilter === family ? "" : family,
                        )
                    }
                    className="flex items-center gap-2 w-full overflow-hidden"
                  >
                    <span className="truncate text-sm flex-1 min-w-0">
                      {family}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <CountPill count={productFamilyCounts.get(family) ?? 0} />
                      {activeFamilyFilter === family && (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                  </DropdownMenuItem>
                ));
              })()}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Brands filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              Brands <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 max-h-60 overflow-y-auto"
          >
            <DropdownMenuItem
              onClick={() => table.getColumn("details")?.setFilterValue("")}
              className="flex items-center justify-between"
            >
              <span>All Brands</span>
              <CountPill count={data.length} />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {uniqueBrands.map((brand) => (
              <DropdownMenuItem
                key={brand}
                onClick={() =>
                  table.getColumn("details")?.setFilterValue(brand)
                }
                className="flex items-center justify-between"
              >
                <span className="truncate flex-1">{brand}</span>
                <CountPill count={brandCounts.get(brand) ?? 0} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Websites filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              Websites <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-60 max-h-60 overflow-y-auto"
          >
            <DropdownMenuItem
              onClick={() => table.getColumn("details")?.setFilterValue("")}
              className="flex items-center justify-between"
            >
              <span>All Websites</span>
              <CountPill count={data.length} />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {uniqueWebsites.map((web) => (
              <DropdownMenuItem
                key={web}
                onClick={() => table.getColumn("details")?.setFilterValue(web)}
                className="flex items-center justify-between"
              >
                <span className="flex items-center gap-2 flex-1 truncate">
                  {web === "Shopify" && (
                    <ShoppingBag className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  )}
                  {web}
                </span>
                <CountPill
                  count={websiteCounts.get(web) ?? 0}
                  variant={
                    web === "Shopify"
                      ? "green"
                      : web === "Taskflow"
                        ? "violet"
                        : "default"
                  }
                />
              </DropdownMenuItem>
            ))}
            {noWebsiteCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <div className="px-3 py-1.5 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground italic">
                    Unassigned
                  </span>
                  <CountPill count={noWebsiteCount} variant="amber" />
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort / Column toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={`ml-auto transition-colors ${sortOption ? "border-primary text-primary bg-primary/5" : ""}`}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sort
              </span>
              {sortOption && (
                <button
                  type="button"
                  onClick={() => setSortOption(null)}
                  className="text-[10px] text-primary hover:underline font-medium"
                >
                  Reset
                </button>
              )}
            </DropdownMenuLabel>
            {[
              {
                key: "alpha-asc" as const,
                icon: (
                  <ArrowUpAZ className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                ),
                label: "Alphabetically A → Z",
              },
              {
                key: "alpha-desc" as const,
                icon: (
                  <ArrowDownAZ className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                ),
                label: "Alphabetically Z → A",
              },
              {
                key: "recent-12h" as const,
                icon: (
                  <Clock className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                ),
                label: "Recently Added (12h)",
              },
              {
                key: "newest" as const,
                icon: (
                  <ArrowDown className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                ),
                label: "Newest to Oldest",
              },
              {
                key: "oldest" as const,
                icon: (
                  <ArrowUp className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                ),
                label: "Oldest to Newest",
              },
            ].map(({ key, icon, label }) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={
                  sortOption === key ||
                  (key === "newest" && sortOption === null)
                }
                onCheckedChange={() =>
                  setSortOption((s) => (s === key ? null : key))
                }
              >
                {icon}
                {label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Toggle Columns
            </DropdownMenuLabel>
            {table
              .getAllColumns()
              .filter((c) => c.getCanHide())
              .filter((c) => c.id !== "productFamilyFilter")
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Active filters */}
      {(activeFamilyFilter ||
        activeUsageFilter ||
        (sortOption && sortOption !== "newest")) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Active:</span>
          {activeFamilyFilter && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
              <Layers className="h-3 w-3" />
              {activeFamilyFilter}
              <button
                type="button"
                onClick={() =>
                  table.getColumn("productFamilyFilter")?.setFilterValue("")
                }
                className="ml-0.5 hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {activeUsageFilter && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${activeUsageFilter === "OUTDOOR" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : activeUsageFilter === "INDOOR" ? "bg-sky-50 border-sky-200 text-sky-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}
            >
              {activeUsageFilter === "OUTDOOR" ? (
                <Trees className="h-3 w-3" />
              ) : activeUsageFilter === "INDOOR" ? (
                <Home className="h-3 w-3" />
              ) : (
                <Sun className="h-3 w-3" />
              )}
              {activeUsageFilter.charAt(0).toUpperCase() +
                activeUsageFilter.slice(1).toLowerCase()}
              <button
                type="button"
                onClick={() =>
                  table.getColumn("productUsage")?.setFilterValue("")
                }
                className="ml-0.5 hover:opacity-60 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {sortOption && sortOption !== "newest" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
              <SlidersHorizontal className="h-3 w-3" />
              {sortLabel[sortOption]}
              <button
                type="button"
                onClick={() => setSortOption(null)}
                className="ml-0.5 hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-60 text-center"
                >
                  <Loader2 className="animate-spin mx-auto h-8 w-8 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="cursor-pointer"
                  onClick={() => handleEdit(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-60 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Package className="h-8 w-8" />
                    <p className="text-sm">
                      {sortOption === "recent-12h"
                        ? "No products added in the last 12 hours"
                        : "No products found"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Input
              type="number"
              min={1}
              max={500}
              className="h-9 w-20 text-sm text-center"
              value={rowsPerPageInput}
              onChange={(e) => setRowsPerPageInput(e.target.value)}
              onBlur={(e) => {
                const parsed = parseInt(e.target.value, 10);
                if (!isNaN(parsed) && parsed >= 1) {
                  table.setPageSize(Math.min(parsed, 500));
                  setRowsPerPageInput(String(Math.min(parsed, 500)));
                } else {
                  setRowsPerPageInput(
                    String(table.getState().pagination.pageSize),
                  );
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <ProtectedLayout>
      <TooltipProvider delayDuration={0}>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
              <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink href="#">Products</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>
                        {isEditing
                          ? selectedProduct
                            ? "Edit Product"
                            : "Add Product"
                          : "All Products"}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <div className="px-4">
                <NotificationsDropdown />
              </div>
            </header>
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
              {isEditing ? renderEditMode() : renderTableMode()}
            </div>
          </SidebarInset>
        </SidebarProvider>

        {/* Dialogs */}
        <TdsPreviewDialog
          open={!!tdsPreviewProduct}
          onOpenChange={(v) => !v && setTdsPreviewProduct(null)}
          product={tdsPreviewProduct}
        />
        <BulkGenerateTdsDialog
          open={bulkTdsOpen}
          onOpenChange={(v) => {
            setBulkTdsOpen(v);
            if (!v && !isTdsRunning) setTdsJobs([]);
          }}
          jobs={tdsJobs}
          onStart={handleStartBulkTds}
          isRunning={isTdsRunning}
        />
        <DeleteToRecycleBinDialog
          open={!!deleteTarget}
          onOpenChange={(v) => !v && setDeleteTarget(null)}
          itemName={deleteTarget?.itemDescription ?? deleteTarget?.name ?? ""}
          onConfirm={() => handleSoftDelete(deleteTarget!)}
          requestMode={isRequestMode}
        />
        <DeleteToRecycleBinDialog
          open={bulkDeleteOpen}
          onOpenChange={setBulkDeleteOpen}
          itemName={`${selectedCount} products`}
          confirmText={`${selectedCount} products`}
          count={selectedCount}
          onConfirm={handleBulkSoftDelete}
          requestMode={isRequestMode}
        />
        <AssignToWebsiteDialog
          open={assignWebsiteOpen}
          onOpenChange={setAssignWebsiteOpen}
          selectedCount={selectedCount}
          onConfirm={handleBulkAssignWebsite}
        />
        <AssignProductClassDialog
          open={assignProductClassOpen}
          onOpenChange={setAssignProductClassOpen}
          selectedCount={selectedCount}
          onConfirm={handleBulkAssignProductClass}
        />
      </TooltipProvider>
    </ProtectedLayout>
  );
}
