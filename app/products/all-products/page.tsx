"use client";

// ─────────────────────────────────────────────────────────────────────────────
// app/products/all-products/page.tsx  (REFACTORED)
//
// Changes from original:
//  - Added ReadOnlyProductsView for roles with read:products only
//    (office_sales, project_sales, director)
//  - Read-only view: mobile-first, dark portal aesthetic, framer-motion
//  - Read-only view: search, filters, product list, view/download TDS,
//    bulk download TDS — NO checkboxes, NO write actions
//  - All existing write/verify logic PRESERVED exactly
//  - Render branching: canWrite → existing full UI | !canWrite → read-only view
//
// TS FIXES applied:
//  1. listItemVariants ease array cast `as const` to satisfy Framer Motion Easing type
//  2. activeFamilyFilter + activeUsageFilter moved AFTER useReactTable() declaration
// ─────────────────────────────────────────────────────────────────────────────

import { ProtectedLayout } from "@/components/layouts/protected-layout";
import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ColumnDef,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
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
  User,
  LogOut,
  ChevronRight,
  SlidersHorizontal as FilterIcon,
  Package2,
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

import {
  serverTimestamp,
} from "@/lib/firestore/client";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/logger";
import { useProductWorkflow } from "@/lib/useProductWorkflow";
import { useAuth } from "@/lib/useAuth";
import { canWrite as rbacCanWrite, hasAccess } from "@/lib/rbac";
import {
  usePendingProducts,
  PendingRowIndicator,
} from "@/components/product-forms/pending-product-badge";
import { NotificationsDropdown } from "@/components/notifications/notifications-dropdown";

import AddNewProduct from "@/components/product-forms/add-new-product-form";
import BulkUploader from "@/components/product-forms/bulk-uploader";
import { DeleteToRecycleBinDialog } from "@/components/deletedialog";
import { BulkDownloadTdsDialog } from "@/components/product-forms/bulk-download-tds-dialog";
import { generateTdsPdf, uploadTdsPdf } from "@/lib/tdsGenerator";

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
import { useProducts } from "@/hooks/useProducts";
import {
  fetchProductById,
  searchProducts,
  updateProduct,
  type ProductListItem,
} from "@/lib/firestore/products";

const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "dvmpn8mjh";
const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "taskflow_preset";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Product = {
  id: string;
  itemDescription: string;
  itemCodes?: ItemCodes;
  ecoItemCode: string;
  litItemCode: string;
  productClass: ProductClassValue | "";
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

type ProductClassValue = "spf" | "standard" | "non-standard" | "usl";

// ─── Helpers (PRESERVED) ──────────────────────────────────────────────────────

function resolveItemCodes(
  product: Pick<Product, "itemCodes" | "litItemCode" | "ecoItemCode" | "itemCode">,
): ItemCodes {
  if (product.itemCodes && hasAtLeastOneItemCode(product.itemCodes)) {
    return product.itemCodes;
  }
  return migrateToItemCodes({
    litItemCode: product.litItemCode,
    ecoItemCode: product.ecoItemCode,
    itemCode: product.itemCode,
  });
}

function getPrimaryCode(product: Product): string {
  const codes = resolveItemCodes(product);
  const primary = getPrimaryItemCode(codes);
  if (primary) return primary.code;
  return (
    product.litItemCode || product.ecoItemCode || product.itemCode || product.id
  );
}

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

// ─── Constants (PRESERVED) ────────────────────────────────────────────────────

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
  value: ProductClassValue;
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
  {
    value: "non-standard",
    label: "Non-Standard",
    description: "Custom and special-order items",
    icon: <CircleDashed className="w-4 h-4" />,
    color: "bg-amber-50 border-amber-200 text-amber-700",
    activeColor: "bg-amber-100 border-amber-500 text-amber-800",
    dot: "bg-amber-500",
  },
  {
    value: "usl",
    label: "USL",
    description: "USL-classified catalog items",
    icon: <Package2 className="w-4 h-4" />,
    color: "bg-sky-50 border-sky-200 text-sky-700",
    activeColor: "bg-sky-100 border-sky-500 text-sky-800",
    dot: "bg-sky-500",
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

// ─── Custom filter (PRESERVED) ────────────────────────────────────────────────

const multiValueFilter: FilterFn<Product> = (row, columnId, filterValue) => {
  const value = row.getValue(columnId);
  const filter = filterValue.toLowerCase();
  if (Array.isArray(value))
    return value.some((v: string) => v.toLowerCase().includes(filter));
  return String(value).toLowerCase().includes(filter);
};

// ─── Badge components (PRESERVED) ────────────────────────────────────────────

function ProductClassBadge({ value }: { value: ProductClassValue | "" }) {
  if (!value)
    return <span className="text-xs text-muted-foreground/50">—</span>;
  if (value === "spf")
    return (
      <Badge className="gap-1 bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-100 text-[10px] font-semibold">
        <Sparkles className="w-2.5 h-2.5" /> SPF
      </Badge>
    );
  if (value === "non-standard")
    return (
      <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-[10px] font-semibold">
        <CircleDashed className="w-2.5 h-2.5" /> Non-Standard
      </Badge>
    );
  if (value === "usl")
    return (
      <Badge className="gap-1 bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-100 text-[10px] font-semibold">
        <Package2 className="w-2.5 h-2.5" /> USL
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

// ─── TDS Preview Dialog (PRESERVED) ──────────────────────────────────────────

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

// ─── Bulk Generate TDS Dialog (PRESERVED) ────────────────────────────────────

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
                    : `${total} product${total !== 1 ? "s" : ""} queued · Plain tabular output`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!isRunning && !isComplete && (
          <div className="space-y-2.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Select Brand
            </p>
            {TDS_BRAND_OPTIONS.map((opt) => {
              const isSelected = selectedBrand === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedBrand(opt.value)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all ${isSelected ? `${opt.activeColor} shadow-sm` : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? opt.dot : "bg-muted-foreground/30"}`} />
                  <span className="flex flex-col flex-1">
                    <span className="text-sm font-semibold">{opt.label}</span>
                    <span className={`text-[11px] ${isSelected ? "opacity-70" : "text-muted-foreground"}`}>
                      {opt.description}
                    </span>
                  </span>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${isSelected ? "opacity-100" : "opacity-0"}`}>
                    <Check className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
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
            <div key={job.productId} className="flex items-center gap-3 px-3 py-2.5">
              <span className="shrink-0">
                {job.status === "pending" && <CircleDashed className="w-4 h-4 text-muted-foreground/40" />}
                {job.status === "generating" && <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />}
                {job.status === "done" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                {job.status === "error" && <AlertCircle className="w-4 h-4 text-destructive" />}
              </span>
              <span className={`flex-1 truncate text-xs ${job.status === "error" ? "text-destructive" : job.status === "done" ? "text-muted-foreground" : "text-foreground"}`}>
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
          <div className={`rounded-lg px-4 py-3 border text-xs space-y-0.5 ${errors === 0 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
            <p className="font-semibold">
              {errors === 0 ? "All TDS PDFs generated successfully" : `${done} generated, ${errors} failed`}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {isComplete ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRunning}>Cancel</Button>
              <Button
                onClick={() => selectedBrand && onStart(selectedBrand)}
                disabled={isRunning || total === 0 || !selectedBrand}
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              >
                {isRunning ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                ) : (
                  <><FilePlus2 className="h-4 w-4" /> Generate {total} TDS</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assign to Website Dialog (PRESERVED) ────────────────────────────────────

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
                {selectedCount} product{selectedCount !== 1 ? "s" : ""} will be assigned.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-2.5">
          {WEBSITE_OPTIONS.map((site) => {
            const isSelected = selectedWebsites.includes(site.value);
            return (
              <button
                key={site.id}
                type="button"
                onClick={() => toggleWebsite(site.value)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all ${isSelected ? `${site.activeColor} shadow-sm` : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"}`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? site.dot : "bg-muted-foreground/30"}`} />
                <span className={`flex-1 text-sm font-medium ${isSelected ? "" : "text-foreground"}`}>{site.label}</span>
                {site.transformNote && (
                  <span className={`text-[10px] font-semibold mr-1 ${site.id === "shopify" ? "text-green-600" : "text-violet-500"}`}>
                    {site.transformNote}
                  </span>
                )}
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${isSelected ? "opacity-100" : "opacity-0"}`}>
                  <Check className="w-3 h-3" />
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isAssigning}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={selectedWebsites.length === 0 || isAssigning} className="gap-2">
            {isAssigning ? <><Loader2 className="h-4 w-4 animate-spin" /> Assigning...</> : <><Globe className="h-4 w-4" /> Assign</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assign Product Class Dialog (PRESERVED) ─────────────────────────────────

function AssignProductClassDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedCount: number;
  onConfirm: (productClass: ProductClassValue) => Promise<void>;
}) {
  const [selectedClass, setSelectedClass] = React.useState<ProductClassValue | null>(null);
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
              <DialogTitle className="text-base">Assign Product Class</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {selectedCount} product{selectedCount !== 1 ? "s" : ""} will be updated.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-2.5">
          {PRODUCT_CLASS_OPTIONS.map((option) => {
            const isSelected = selectedClass === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedClass(option.value)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all ${isSelected ? `${option.activeColor} shadow-sm` : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"}`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? option.dot : "bg-muted-foreground/30"}`} />
                <span className="flex items-center gap-2 flex-1">
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className={`text-xs ${isSelected ? "opacity-80" : "text-muted-foreground"}`}>— {option.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isAssigning}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!selectedClass || isAssigning} className="gap-2">
            {isAssigning ? <><Loader2 className="h-4 w-4 animate-spin" /> Assigning...</> : <><Tag className="h-4 w-4" /> Set as {PRODUCT_CLASS_OPTIONS.find((o) => o.value === selectedClass)?.label ?? selectedClass}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// READ-ONLY MOBILE VIEW — portal aesthetic, framer-motion
// Used for: office_sales, project_sales, director (read:products only)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Framer motion variants ───────────────────────────────────────────────────

const listContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

// FIX 1: ease array cast `as const` so TS infers a readonly tuple (BezierDefinition)
// instead of number[], which is not assignable to Framer Motion's Easing type.
const listItemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

const pageEnterVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

// ─── Usage filter tabs ────────────────────────────────────────────────────────

const USAGE_FILTER_TABS = [
  { label: "All", value: "" },
  { label: "Indoor", value: "INDOOR" },
  { label: "Outdoor", value: "OUTDOOR" },
  { label: "Solar", value: "SOLAR" },
] as const;

type UsageFilter = "" | "INDOOR" | "OUTDOOR" | "SOLAR";

// ─── Dark TDS button (read-only cards) ───────────────────────────────────────

function ReadOnlyTdsButton({
  product,
  onPreview,
}: {
  product: Product;
  onPreview: (p: Product) => void;
}) {
  const hasTds = !!product.tdsFileUrl;
  return (
    <button
      type="button"
      onClick={() => onPreview(product)}
      disabled={!hasTds}
      className={`
        shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all active:scale-95
        ${hasTds
          ? "bg-[#d11a2a]/10 border border-[#d11a2a]/30 text-[#d11a2a] hover:bg-[#d11a2a]/20"
          : "bg-white/5 border border-white/10 text-gray-600 cursor-not-allowed"
        }
      `}
    >
      <FileText size={11} />
      {hasTds ? "View TDS" : "No TDS"}
    </button>
  );
}

// ─── Product card for read-only view ─────────────────────────────────────────

function ReadOnlyProductCard({
  product,
  onPreview,
  index,
}: {
  product: Product;
  onPreview: (p: Product) => void;
  index: number;
}) {
  const codes = resolveItemCodes(product);
  const filledCodes = getFilledItemCodes(codes);
  const primaryCode = filledCodes[0]?.code || "";
  const name = product.itemDescription || product.name || "—";
  const family = product.productFamily || (product.categories as string) || "";
  const usages: string[] = Array.isArray(product.productUsage)
    ? product.productUsage
    : [];
  const cls = product.productClass;

  const usageColors: Record<string, string> = {
    OUTDOOR: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    INDOOR: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    SOLAR: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  };

  return (
    <motion.div
      variants={listItemVariants}
      className="bg-white/5 border border-white/10 rounded-[20px] p-4 hover:bg-white/[0.08] hover:border-[#d11a2a]/20 transition-all relative overflow-hidden group"
    >
      {/* Red accent glow on hover */}
      <div className="absolute -bottom-10 -right-10 w-28 h-28 bg-[#d11a2a]/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <div className="flex items-start gap-3">
        {/* Product image */}
        <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
          {product.mainImage ? (
            <img
              src={product.mainImage}
              alt={name}
              className="w-full h-full object-contain p-1"
            />
          ) : (
            <Package2 size={20} className="text-gray-600" />
          )}
        </div>

        {/* Product info */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black uppercase text-white leading-tight line-clamp-2 mb-1">
            {name}
          </p>

          {/* Item codes */}
          {filledCodes.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {filledCodes.slice(0, 2).map(({ brand, code }) => {
                const cfg = ITEM_CODE_BRAND_CONFIG[brand];
                return (
                  <span
                    key={brand}
                    className="text-[8px] font-black font-mono px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-gray-400"
                  >
                    {code}
                  </span>
                );
              })}
              {filledCodes.length > 2 && (
                <span className="text-[8px] font-black text-gray-600">
                  +{filledCodes.length - 2}
                </span>
              )}
            </div>
          )}

          {/* Family */}
          {family && (
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider truncate">
              {family}
            </p>
          )}
        </div>

        {/* Right column: usage + class + action */}
        <div className="shrink-0 flex flex-col items-end gap-2">
          {/* Usage tags */}
          <div className="flex flex-col items-end gap-1">
            {usages.length > 0 ? (
              usages.map((u) => (
                <span
                  key={u}
                  className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${usageColors[u] ?? "bg-white/5 border-white/10 text-gray-500"}`}
                >
                  {u.charAt(0) + u.slice(1).toLowerCase()}
                </span>
              ))
            ) : (
              <span className="text-[8px] text-gray-600 uppercase font-bold">—</span>
            )}
            {cls && (
              <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${cls === "spf" ? "bg-violet-500/20 text-violet-400 border-violet-500/30" : cls === "non-standard" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : cls === "usl" ? "bg-sky-500/20 text-sky-400 border-sky-500/30" : "bg-white/5 text-gray-500 border-white/10"}`}>
                {cls === "spf" ? "SPF" : cls === "non-standard" ? "Non-Std" : cls === "usl" ? "USL" : "Std"}
              </span>
            )}
          </div>

          {/* TDS button */}
          <ReadOnlyTdsButton product={product} onPreview={onPreview} />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Dark filter panel overlay ────────────────────────────────────────────────

function ReadOnlyFilterPanel({
  open,
  onClose,
  families,
  activeFamily,
  onFamilyChange,
}: {
  open: boolean;
  onClose: () => void;
  families: string[];
  activeFamily: string;
  onFamilyChange: (f: string) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d0d] border-t border-white/10 rounded-t-[32px] p-6 pb-10 max-h-[70vh] overflow-y-auto"
          >
            {/* Handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />

            <div className="flex items-center justify-between mb-5">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#d11a2a]">
                Filter by Family
              </p>
              <button
                onClick={() => { onFamilyChange(""); onClose(); }}
                className="text-[9px] font-black uppercase text-gray-500 hover:text-white transition-colors"
              >
                Clear All
              </button>
            </div>

            <div className="space-y-2">
              {["", ...families].map((fam) => {
                const label = fam || "All Families";
                const isActive = activeFamily === fam;
                return (
                  <button
                    key={fam || "all"}
                    type="button"
                    onClick={() => { onFamilyChange(fam); onClose(); }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all text-left ${isActive ? "border-[#d11a2a]/50 bg-[#d11a2a]/10 text-white" : "border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/[0.08]"}`}
                  >
                    <span className="text-[11px] font-black uppercase truncate">
                      {label}
                    </span>
                    {isActive && (
                      <Check size={14} className="text-[#d11a2a] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── ReadOnlyAllProductsView ──────────────────────────────────────────────────

function ReadOnlyAllProductsView() {
  const { user, logout } = useAuth();

  const [search, setSearch] = React.useState("");
  const [usageTab, setUsageTab] = React.useState<UsageFilter>("");
  const [familyFilter, setFamilyFilter] = React.useState("");
  const [filterPanelOpen, setFilterPanelOpen] = React.useState(false);

  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = React.useState(1);

  const [tdsPreviewProduct, setTdsPreviewProduct] =
    React.useState<Product | null>(null);
  const [bulkDownloadTdsOpen, setBulkDownloadTdsOpen] =
    React.useState(false);

  const {
    data: readOnlyPages,
    products: readOnlyProducts,
    fetchNextPage: fetchNextReadOnlyPage,
    hasNextPage: hasNextReadOnlyPage,
    isFetchingNextPage: isFetchingNextReadOnlyPage,
    isLoading: loading,
  } = useProducts({
    pageSize: PAGE_SIZE,
    searchTerm: search.trim() || undefined,
    productUsage: usageTab || undefined,
    productFamily: familyFilter || undefined,
  });

  const uniqueFamilies = React.useMemo(() => {
    const s = new Set<string>();
    readOnlyProducts.forEach((p) => {
      const f = (p.productFamily ?? p.categories ?? "") as string;
      if (f) s.add(String(f));
    });
    return Array.from(s).sort();
  }, [readOnlyProducts]);

  const filtered = React.useMemo(
    () => readOnlyProducts as unknown as Product[],
    [readOnlyProducts],
  );

  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, usageTab, familyFilter]);

  const totalPages = hasNextReadOnlyPage
    ? Math.max(currentPage, (readOnlyPages?.pages.length ?? 0) + 1)
    : Math.max(1, readOnlyPages?.pages.length ?? 1);
  const paginated =
    (readOnlyPages?.pages[currentPage - 1]?.items as Product[] | undefined) ?? [];

  React.useEffect(() => {
    if (
      currentPage > (readOnlyPages?.pages.length ?? 0) &&
      hasNextReadOnlyPage &&
      !isFetchingNextReadOnlyPage
    ) {
      void fetchNextReadOnlyPage();
    }
  }, [
    currentPage,
    readOnlyPages?.pages.length,
    hasNextReadOnlyPage,
    isFetchingNextReadOnlyPage,
    fetchNextReadOnlyPage,
  ]);

  const pageNumbers = React.useMemo(() => {
    const nums: number[] = [];
    const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }, [currentPage, totalPages]);

  const userName = user?.name?.split(" ")[0] || "User";
  const userRole = user?.role
    ? user.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Sales";

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-30 bg-[#050505]/90 backdrop-blur-xl border-b border-white/5 px-4 py-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-500">
              Hello, {userName}
            </p>
            <p className="text-[9px] font-bold text-[#d11a2a] uppercase tracking-widest mt-0.5">
              {userRole}
            </p>
          </div>
          <button
            type="button"
            onClick={() => logout?.()}
            className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2 text-[9px] font-black uppercase tracking-wider text-gray-400 hover:text-white hover:border-white/20 active:scale-95 transition-all"
          >
            <User size={12} className="text-[#d11a2a]" />
            User
          </button>
        </div>
      </motion.header>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.35 }}
        className="px-4 pt-4 pb-2"
      >
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {USAGE_FILTER_TABS.map((tab) => {
            const isActive = usageTab === tab.value;
            return (
              <button
                key={tab.value || "all"}
                type="button"
                onClick={() => setUsageTab(tab.value as UsageFilter)}
                className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${
                  isActive
                    ? "bg-[#d11a2a] text-white shadow-lg shadow-[#d11a2a]/20"
                    : "bg-white/5 border border-white/10 text-gray-500 hover:text-white hover:bg-white/10"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.35 }}
        className="flex items-center justify-between px-4 pt-3 pb-2"
      >
        <h1 className="text-lg font-black uppercase italic tracking-tighter text-white">
          All <span className="text-[#d11a2a]">Products</span>
        </h1>
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
          <span className="text-[11px] font-black text-[#d11a2a] tabular-nums">
            {loading ? "…" : filtered.length}
          </span>
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
            Products
          </span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.35 }}
        className="flex items-center gap-2 px-4 pb-4"
      >
        <div className="flex-1 relative">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-8 pr-4 py-2.5 text-[11px] font-bold text-white placeholder:text-gray-600 outline-none focus:border-[#d11a2a]/40 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setFilterPanelOpen(true)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-2xl border text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${
            familyFilter
              ? "bg-[#d11a2a]/10 border-[#d11a2a]/40 text-[#d11a2a]"
              : "bg-white/5 border-white/10 text-gray-500 hover:text-white"
          }`}
        >
          <FilterIcon size={12} />
          {familyFilter ? "1" : "Filter"}
        </button>

        <button
          type="button"
          onClick={() => setBulkDownloadTdsOpen(true)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-[#d11a2a]/10 border border-[#d11a2a]/30 text-[#d11a2a] text-[10px] font-black uppercase tracking-wider hover:bg-[#d11a2a]/20 active:scale-95 transition-all"
        >
          <Download size={12} />
          TDS
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.3 }}
        className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 pb-2"
      >
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">
          Product Details
        </span>
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-600 text-center w-20">
          Usage/Class
        </span>
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-600 text-right w-16">
          Action
        </span>
      </motion.div>

      <div className="mx-4 h-px bg-white/5 mb-3" />

      <div className="px-4 pb-4">
        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-20 flex flex-col items-center gap-4"
          >
            <div className="w-10 h-10 border-2 border-[#d11a2a] border-t-transparent rounded-full animate-spin" />
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-600">
              Loading Products…
            </p>
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-16 text-center bg-white/5 rounded-[24px] border border-dashed border-white/10"
          >
            <Package2 size={28} className="mx-auto mb-3 text-gray-700" />
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">
              No Products Found
            </p>
            {(search || usageTab || familyFilter) && (
              <button
                type="button"
                onClick={() => { setSearch(""); setUsageTab(""); setFamilyFilter(""); }}
                className="mt-3 text-[9px] font-black uppercase text-[#d11a2a] hover:underline"
              >
                Clear Filters
              </button>
            )}
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${usageTab}-${familyFilter}-${search}-${currentPage}`}
              variants={listContainerVariants}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {paginated.map((product, idx) => (
                <ReadOnlyProductCard
                  key={product.id}
                  product={product}
                  onPreview={setTdsPreviewProduct}
                  index={idx}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {!loading && totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-end gap-1.5 px-4 pb-6"
        >
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
            className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 text-gray-500 hover:text-white disabled:opacity-30 transition-all flex items-center justify-center active:scale-95"
          >
            <ChevronRight size={14} className="rotate-180" />
          </button>

          {pageNumbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCurrentPage(n)}
              className={`w-8 h-8 rounded-xl text-[10px] font-black transition-all active:scale-95 ${
                n === currentPage
                  ? "bg-[#d11a2a] text-white shadow-lg shadow-[#d11a2a]/20"
                  : "bg-white/5 border border-white/10 text-gray-500 hover:text-white"
              }`}
            >
              {n}
            </button>
          ))}

          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 text-gray-500 hover:text-white disabled:opacity-30 transition-all flex items-center justify-center active:scale-95"
          >
            <ChevronRight size={14} />
          </button>
        </motion.div>
      )}

      <motion.nav
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="sticky bottom-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/5 px-4 py-3"
      >
        <div className="flex items-center justify-around gap-1">
          {[
            { label: "Products", icon: Package2, active: true },
          ].map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={`flex flex-col items-center gap-1 px-5 py-2 rounded-2xl transition-all flex-1 max-w-[80px] ${
                active
                  ? "bg-[#d11a2a]/10 text-[#d11a2a]"
                  : "text-gray-600 hover:text-white"
              }`}
            >
              <Icon size={18} />
              <span className="text-[8px] font-black uppercase tracking-wider">
                {label}
              </span>
            </button>
          ))}
        </div>
      </motion.nav>

      <ReadOnlyFilterPanel
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        families={uniqueFamilies}
        activeFamily={familyFilter}
        onFamilyChange={setFamilyFilter}
      />

      <TdsPreviewDialog
        open={!!tdsPreviewProduct}
        onOpenChange={(v) => !v && setTdsPreviewProduct(null)}
        product={tdsPreviewProduct}
      />

      <BulkDownloadTdsDialog
        open={bulkDownloadTdsOpen}
        onOpenChange={setBulkDownloadTdsOpen}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL WRITE/VERIFY VIEW — original logic FULLY PRESERVED
// ═══════════════════════════════════════════════════════════════════════════════

function FullAllProductsView() {
  const [isEditing, setIsEditing] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

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
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [usageFilter, setUsageFilter] = React.useState("");
  const [familyFilter, setFamilyFilter] = React.useState("");
  const [classFilter, setClassFilter] = React.useState<ProductClassValue | "">("");
  const [rowsPerPageInput, setRowsPerPageInput] = React.useState("10");

  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<Product | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [assignWebsiteOpen, setAssignWebsiteOpen] = React.useState(false);
  const [assignProductClassOpen, setAssignProductClassOpen] = React.useState(false);

  const [tdsPreviewProduct, setTdsPreviewProduct] = React.useState<Product | null>(null);
  const [bulkTdsOpen, setBulkTdsOpen] = React.useState(false);
  const [tdsJobs, setTdsJobs] = React.useState<TdsJob[]>([]);
  const [isTdsRunning, setIsTdsRunning] = React.useState(false);
  const [isTdsDownloading, setIsTdsDownloading] = React.useState(false);
  const [sortOption, setSortOption] = React.useState<SortOption>(null);
  const [bulkDownloadTdsOpen, setBulkDownloadTdsOpen] = React.useState(false);
  const {
    products,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useProducts({
    pageSize: 50,
    searchTerm: globalFilter.trim() || undefined,
    productUsage: usageFilter || undefined,
    productFamily: familyFilter || undefined,
    productClass: classFilter || undefined,
    createdAfter:
      sortOption === "recent-12h"
        ? new Date(Date.now() - 12 * 60 * 60 * 1000)
        : undefined,
  });
  const data = React.useMemo(() => products as unknown as Product[], [products]);
  const loading = isLoading;

  const [familySearch, setFamilySearch] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<ProductListItem[]>([]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    const term = globalFilter.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const rows = await searchProducts(term);
        if (!cancelled) {
          setSuggestions(rows.slice(0, 7));
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [globalFilter]);

  React.useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || loading) return;
    if (data.length < 100) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, loading, data.length, fetchNextPage]);

  // ── All handlers PRESERVED ────────────────────────────────────────────────

  const handleSoftDelete = async (product: Product) => {
    const t = toast.loading("Processing…");
    try {
      const result = await submitProductDelete({ product, originPage: "/products/all-products", source: "all-products:delete" });
      toast.success(result.message, { id: t, description: result.mode === "pending" ? "A PD Manager or Admin will review your request." : undefined });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete product.", { id: t });
    }
  };

  const handleBulkSoftDelete = async () => {
    const selectedRows = table.getSelectedRowModel().rows;
    setIsDeleting(true);
    const t = toast.loading(`Submitting delete for ${selectedRows.length} products…`);
    let direct = 0, pending = 0, errors = 0;
    await Promise.all(selectedRows.map(async ({ original: product }) => {
      try {
        const result = await submitProductDelete({ product, originPage: "/products/all-products", source: "all-products:bulk-delete" });
        result.mode === "pending" ? pending++ : direct++;
      } catch { errors++; }
    }));
    if (errors === 0) {
      const parts: string[] = [];
      if (direct > 0) parts.push(`${direct} moved to recycle bin`);
      if (pending > 0) parts.push(`${pending} pending approval`);
      toast.success(parts.join(", ") || "Done", { id: t });
    } else {
      toast.error(`${errors} error(s). ${direct + pending} succeeded.`, { id: t });
    }
    setRowSelection({});
    setIsDeleting(false);
  };

  const handleBulkAssignWebsite = async (websites: string[]) => {
    const selectedRows = table.getSelectedRowModel().rows;
    const rows = selectedRows.map((r) => r.original);
    const count = rows.length;
    const t = toast.loading(`${isRequestMode ? "Submitting" : "Assigning"} ${count} product${count !== 1 ? "s" : ""} to ${websites.join(", ")}...`);
    let direct = 0, pending = 0, errors = 0;
    await Promise.all(rows.map(async (product) => {
      try {
        const transformSites = websites.filter((w) => SCHEMA_TRANSFORM_WEBSITES.has(w));
        const sourceProduct =
          transformSites.length > 0
            ? (((await fetchProductById(product.id)) as Product | null) ?? product)
            : product;
        const transformedFields =
          transformSites.length > 0
            ? buildTransformedProduct(sourceProduct, websites)
            : undefined;
        const result = await submitProductAssignWebsite({
          product: sourceProduct,
          websites,
          transformedFields,
          originPage: "/products/all-products",
          source: "all-products:bulk-assign-website",
        });
        result.mode === "pending" ? pending++ : direct++;
      } catch { errors++; }
    }));
    if (errors === 0) {
      const parts: string[] = [];
      if (direct > 0) parts.push(`${direct} assigned`);
      if (pending > 0) parts.push(`${pending} pending approval`);
      toast.success(parts.join(", ") || "Done", { id: t });
    } else {
      toast.error(`${errors} error(s). ${direct + pending} succeeded.`, { id: t });
    }
    setRowSelection({});
  };

  const handleBulkAssignProductClass = async (productClass: ProductClassValue) => {
    const selectedRows = table.getSelectedRowModel().rows;
    const rows = selectedRows.map((r) => r.original);
    const count = rows.length;
    const label = PRODUCT_CLASS_OPTIONS.find((o) => o.value === productClass)?.label ?? productClass;
    const t = toast.loading(`${isRequestMode ? "Submitting" : "Setting"} ${count} product${count !== 1 ? "s" : ""} to "${label}"...`);
    let direct = 0, pending = 0, errors = 0;
    await Promise.all(rows.map(async (product) => {
      try {
        const result = await submitProductSetClass({ product, productClass, originPage: "/products/all-products", source: "all-products:bulk-set-product-class" });
        result.mode === "pending" ? pending++ : direct++;
      } catch { errors++; }
    }));
    if (errors === 0) {
      const parts: string[] = [];
      if (direct > 0) parts.push(`${direct} set to "${label}"`);
      if (pending > 0) parts.push(`${pending} pending approval`);
      toast.success(parts.join(", ") || "Done", { id: t });
    } else {
      toast.error(`${errors} error(s). ${direct + pending} succeeded.`, { id: t });
    }
    setRowSelection({});
  };

  const handleOpenBulkTds = () => {
    const selectedRows = table.getSelectedRowModel().rows;
    const jobs: TdsJob[] = selectedRows.map((row) => ({
      productId: row.original.id,
      productName: row.original.itemDescription || row.original.name || row.original.id,
      status: "pending",
    }));
    setTdsJobs(jobs);
    setBulkTdsOpen(true);
  };

  const handleStartBulkTds = async (brand: "LIT" | "ECOSHIFT") => {
    setIsTdsRunning(true);
    const productMap = new Map<string, Product>(
      table.getSelectedRowModel().rows.map((r) => [r.original.id, r.original]),
    );

    for (let i = 0; i < tdsJobs.length; i++) {
      const job = tdsJobs[i];
      const baseProduct = productMap.get(job.productId);

      setTdsJobs((prev) => prev.map((j) => j.productId === job.productId ? { ...j, status: "generating" } : j));

      try {
        if (!baseProduct) throw new Error("Product not found in selection");
        const fullProduct = (await fetchProductById(baseProduct.id)) as Product | null;
        const product = fullProduct ?? baseProduct;

        const itemDescription = product.itemDescription || product.name || "";
        const resolvedCodes = resolveItemCodes(product);

        const technicalSpecs = (product.technicalSpecs ?? [])
          .map((group) => ({ ...group, specs: (group.specs ?? []).filter((s: { value: any }) => { const v = (s.value ?? "").toUpperCase().trim(); return v !== "" && v !== "N/A"; }) }))
          .filter((group) => (group.specs ?? []).length > 0);

        const p = product as any;

        const tdsBlob = await generateTdsPdf({
          itemDescription,
          itemCodes: resolvedCodes,
          litItemCode: resolvedCodes.LIT,
          ecoItemCode: resolvedCodes.ECOSHIFT,
          technicalSpecs,
          brand,
          includeBrandAssets: false,
          mainImageUrl: product.mainImage || (Array.isArray(product.rawImage) ? product.rawImage[0] : (product.rawImage as unknown as string)) || undefined,
          dimensionalDrawingUrl: p.dimensionDrawingImage || p.dimensionalDrawingImage || undefined,
          recommendedMountingHeightUrl: p.mountingHeightImage || p.recommendedMountingHeightImage || undefined,
          driverCompatibilityUrl: p.driverCompatibilityImage || undefined,
          baseImageUrl: p.baseImage || undefined,
          illuminanceLevelUrl: p.illuminanceLevelImage || undefined,
          wiringDiagramUrl: p.wiringDiagramImage || undefined,
          installationUrl: p.installationImage || undefined,
          wiringLayoutUrl: p.wiringLayoutImage || undefined,
          terminalLayoutUrl: p.terminalLayoutImage || undefined,
          accessoriesImageUrl: p.accessoriesImage || undefined,
        });

        const primaryCode = getPrimaryItemCode(resolvedCodes)?.code ?? product.id;
        const filename = `${primaryCode.replace(/[/\\:*?"<>|]/g, "-")}_TDS.pdf`;
        const tdsUrl = await uploadTdsPdf(tdsBlob, filename, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET);

        if (tdsUrl.startsWith("http")) {
        await updateProduct(product.id, {
          tdsFileUrl: tdsUrl,
          updatedAt: serverTimestamp(),
        });
        }

        setTdsJobs((prev) => prev.map((j) => j.productId === job.productId ? { ...j, status: "done" } : j));
      } catch (err: any) {
        console.error(`TDS generation failed for ${job.productId}:`, err);
        setTdsJobs((prev) => prev.map((j) => j.productId === job.productId ? { ...j, status: "error", error: err?.message ?? "Unknown error" } : j));
      }
    }

    setIsTdsRunning(false);
    await logAuditEvent({
      action: "update",
      entityType: "product",
      entityId: null,
      entityName: `${tdsJobs.length} products`,
      context: { page: "/products/all-products", source: "all-products:bulk-generate-tds", collection: "products", bulk: true },
      metadata: { brand, total: tdsJobs.length, productIds: tdsJobs.map((j) => j.productId) },
    }).catch(console.warn);
  };

  const handleBulkDownloadTds = async () => {
    const selectedRows = table.getSelectedRowModel().rows;
    const withTds = selectedRows.filter((r) => !!r.original.tdsFileUrl);

    if (withTds.length === 0) { toast.error("None of the selected products have a TDS file."); return; }

    setIsTdsDownloading(true);
    const noTdsCount = selectedRows.length - withTds.length;
    const loadingToast = toast.loading(`Preparing ${withTds.length} TDS file${withTds.length !== 1 ? "s" : ""}…`);

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const litFolder = zip.folder("LIT")!;
      const ecoshiftFolder = zip.folder("ECOSHIFT")!;
      const otherFolder = zip.folder("OTHER")!;

      const detectFolder = (product: Product) => {
        const codes = resolveItemCodes(product);
        const filled = getFilledItemCodes(codes);
        if (filled.length === 0) return litFolder;
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

      const fetchWithRetry = async (url: string, retries = 3): Promise<Blob> => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.blob();
          } catch (err) {
            lastError = err;
            if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * attempt));
          }
        }
        throw lastError;
      };

      const BATCH = 8;
      let succeeded = 0, failed = 0;

      for (let i = 0; i < withTds.length; i += BATCH) {
        const chunk = withTds.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          chunk.map(async ({ original: product }) => {
            const blob = await fetchWithRetry(product.tdsFileUrl!);
            const folder = detectFolder(product);
            folder.file(tdsFilename(product), blob);
          }),
        );
        results.forEach((r) => { if (r.status === "fulfilled") succeeded++; else failed++; });
        if (i + BATCH < withTds.length) await new Promise((r) => setTimeout(r, 300));
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
        [`${succeeded} TDS file${succeeded !== 1 ? "s" : ""} downloaded`, failed > 0 ? `${failed} failed` : null, noTdsCount > 0 ? `${noTdsCount} skipped (no TDS)` : null, "→ Organised into LIT / ECOSHIFT / OTHER folders"]
          .filter(Boolean).join(" · "),
        { id: loadingToast },
      );
    } catch (err) {
      console.error("TDS ZIP download failed:", err);
      toast.error("Failed to create TDS ZIP.", { id: loadingToast });
    } finally {
      setIsTdsDownloading(false);
    }
  };

  const handleEdit = async (product: { id: string }) => {
    const full = await fetchProductById(product.id);
    if (!full) {
      toast.error("Product no longer exists.");
      return;
    }
    setSelectedProduct(full as Product);
    setIsEditing(true);
  };

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
    data.forEach((p) => { const fam = p.productFamily || (p.categories as string); if (fam) s.add(fam); });
    return Array.from(s).sort();
  }, [data]);

  const brandCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    data.forEach((p) => {
      const brands = Array.isArray(p.brands) ? p.brands : p.brand ? [p.brand as string] : [];
      brands.forEach((b) => m.set(b, (m.get(b) ?? 0) + 1));
    });
    return m;
  }, [data]);

  const websiteCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    data.forEach((p) => {
      const websites = Array.isArray(p.websites) ? p.websites : p.website ? [p.website as string] : [];
      websites.forEach((w) => m.set(w, (m.get(w) ?? 0) + 1));
    });
    return m;
  }, [data]);

  const productFamilyCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    data.forEach((p) => { const fam = p.productFamily || (p.categories as string); if (fam) m.set(fam, (m.get(fam) ?? 0) + 1); });
    return m;
  }, [data]);

  const productClassCounts = React.useMemo(() => {
    const m = new Map<string, number>([["spf", 0], ["standard", 0], ["non-standard", 0], ["usl", 0], ["", 0]]);
    data.forEach((p) => { const cls = p.productClass ?? ""; m.set(cls, (m.get(cls) ?? 0) + 1); });
    return m;
  }, [data]);

  const productUsageCounts = React.useMemo(() => {
    const m = new Map<string, number>([["OUTDOOR", 0], ["INDOOR", 0], ["SOLAR", 0], ["", 0]]);
    data.forEach((p) => {
      const usages: string[] = Array.isArray(p.productUsage) ? p.productUsage : p.productUsage ? [p.productUsage as string] : [];
      if (usages.length === 0) { m.set("", (m.get("") ?? 0) + 1); }
      else { usages.forEach((u) => { const key = u.toUpperCase(); m.set(key, (m.get(key) ?? 0) + 1); }); }
    });
    return m;
  }, [data]);

  const noWebsiteCount = React.useMemo(
    () =>
      data.reduce((count, p) => {
        const websites = Array.isArray(p.websites)
          ? p.websites
          : p.website
            ? [p.website as string]
            : [];
        return websites.length === 0 ? count + 1 : count;
      }, 0),
    [data],
  );

  const sortedData = React.useMemo(() => {
    const d = [...data];
    const ts = (p: Product): number => p.createdAt?.toMillis?.() ?? (typeof p.createdAt === "number" ? p.createdAt : 0);
    const label = (p: Product) => (p.itemDescription || p.name || "").toLowerCase();
    switch (sortOption) {
      case "alpha-asc": return d.sort((a, b) => label(a).localeCompare(label(b)));
      case "alpha-desc": return d.sort((a, b) => label(b).localeCompare(label(a)));
      case "recent-12h": return d.sort((a, b) => ts(b) - ts(a));
      case "oldest": return d.sort((a, b) => ts(a) - ts(b));
      default: return d.sort((a, b) => ts(b) - ts(a));
    }
  }, [data, sortOption]);

  const sortLabel: Record<NonNullable<SortOption>, string> = {
    "alpha-asc": "A → Z",
    "alpha-desc": "Z → A",
    "recent-12h": "Last 12 h",
    newest: "Newest",
    oldest: "Oldest",
  };

  // ── Columns ───────────────────────────────────────────────────────────────

  const columns: ColumnDef<Product>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
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
            {imageUrl ? <img src={imageUrl} alt={label} className="w-full h-full object-contain" /> : <Package className="h-6 w-6 text-muted-foreground/40" />}
          </div>
        );
      },
      enableHiding: false,
    },
    {
      id: "itemCodes",
      accessorFn: (row) => { const codes = resolveItemCodes(row); return getFilledItemCodes(codes).map(({ code }) => code).join(" "); },
      header: () => <div className="text-xs font-medium flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 text-muted-foreground" />Item Codes</div>,
      cell: ({ row }) => { const codes = resolveItemCodes(row.original); return <div className="min-w-30"><ItemCodesDisplay itemCodes={codes} size="sm" maxVisible={3} /></div>; },
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        const codes = resolveItemCodes(row.original);
        const allCodes = getFilledItemCodes(codes).map(({ code }) => code.toLowerCase());
        return allCodes.some((c) => c.includes(String(filterValue).toLowerCase()));
      },
    },
    {
      accessorKey: "itemDescription",
      header: () => <div className="text-xs font-medium">Item Description</div>,
      cell: ({ row }) => {
        const desc = row.getValue("itemDescription") as string;
        const fallback = row.original.name;
        const family = row.original.productFamily || (row.original.categories as string);
        return (
          <div className="flex flex-col max-w-65">
            <span className="font-semibold text-sm line-clamp-2 leading-snug">{desc || fallback || "—"}</span>
            {family && <span className="text-[11px] text-muted-foreground mt-0.5 truncate">{family}</span>}
          </div>
        );
      },
    },
    {
      id: "productFamilyFilter",
      accessorFn: (row) => row.productFamily || (row.categories as string) || "",
      header: () => <div className="text-xs font-medium flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-muted-foreground" />Product Family</div>,
      cell: ({ row }) => {
        const family = row.original.productFamily || (row.original.categories as string);
        return family ? <span className="text-xs text-muted-foreground truncate max-w-40 block">{family}</span> : <span className="text-xs text-muted-foreground/40">—</span>;
      },
      enableHiding: true,
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        const family = row.original.productFamily || (row.original.categories as string) || "";
        return family === filterValue;
      },
    },
    {
      accessorKey: "productClass",
      header: () => <div className="text-xs font-medium">Class</div>,
      cell: ({ row }) => <ProductClassBadge value={row.getValue("productClass") as ProductClassValue | ""} />,
      filterFn: (row, _, filterValue) => { if (!filterValue) return true; return (row.getValue("productClass") as string) === filterValue; },
    },
    {
      accessorKey: "productUsage",
      header: () => <div className="text-xs font-medium">Usage</div>,
      cell: ({ row }) => <ProductUsageBadge value={row.original.productUsage} />,
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        const usages: string[] = Array.isArray(row.original.productUsage) ? row.original.productUsage : row.original.productUsage ? [row.original.productUsage as string] : [];
        return usages.some((u) => u.toUpperCase() === String(filterValue).toUpperCase());
      },
    },
    {
      id: "details",
      accessorFn: (row) => { const brand = Array.isArray(row.brands) ? row.brands.join(" ") : row.brand; const web = Array.isArray(row.websites) ? row.websites.join(" ") : row.website; return `${brand} ${web}`; },
      header: () => <div className="text-xs font-medium">Brand & Website</div>,
      cell: ({ row }) => {
        const brands = Array.isArray(row.original.brands) ? row.original.brands : [row.original.brand || "Generic"];
        const websites = Array.isArray(row.original.websites) ? row.original.websites : row.original.website ? [row.original.website as string] : [];
        return (
          <div className="flex flex-col gap-1 items-start">
            <Badge variant="outline" className="text-xs font-medium">{brands.join(", ")}</Badge>
            {websites.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {websites.map((w) => <Badge key={w} variant="secondary" className={`text-xs ${w === "Shopify" ? "bg-green-100 text-green-700 border-green-200" : w === "Taskflow" ? "bg-violet-100 text-violet-700 border-violet-200" : ""}`}>{w === "Shopify" && <ShoppingBag className="w-2.5 h-2.5 mr-1" />}{w}</Badge>)}
              </div>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground border-dashed">No website</Badge>
            )}
          </div>
        );
      },
      filterFn: multiValueFilter,
    },
    {
      id: "actions",
      header: () => <div className="text-xs font-medium text-right">Actions</div>,
      cell: ({ row }) => {
        const product = row.original;
        const pendingStatus = pendingMap.get(product.id) ?? null;
        const isPendingDelete = pendingStatus === "delete";
        const busy = !!pendingStatus;

        return (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {product.tdsFileUrl && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); setTdsPreviewProduct(product); }}>
                    <FileText className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">View TDS</TooltipContent>
              </Tooltip>
            )}
            <PendingRowIndicator status={pendingStatus} />
            {userCanWrite && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(product)} disabled={isPendingDelete}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{isPendingDelete ? "Cannot edit — deletion pending" : "Edit product"}</TooltipContent>
              </Tooltip>
            )}
            {userCanWrite && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(product)} disabled={busy}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{busy ? "Pending — cannot delete" : isRequestMode ? "Submit delete request" : "Delete product"}</TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  // ── useReactTable — declared BEFORE any derived references to `table` ─────
  const table = useReactTable({
    data: sortedData,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: { sorting, columnVisibility, rowSelection },
    filterFns: { multiValue: multiValueFilter },
  });

  const activeFamilyFilter = familyFilter;
  const activeUsageFilter = usageFilter;
  const activeClassFilter = classFilter;

  const selectedCount = Object.keys(rowSelection).length;
  const totalCount = data.length;
  const isFiltered =
    Boolean(globalFilter.trim()) ||
    Boolean(activeFamilyFilter) ||
    Boolean(activeUsageFilter) ||
    Boolean(activeClassFilter) ||
    sortOption === "recent-12h";

  const renderEditMode = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => { setSelectedProduct(null); setIsEditing(false); }} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Products
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <p className="text-sm text-muted-foreground">
          {selectedProduct ? `Editing: ${selectedProduct.itemDescription || selectedProduct.name}` : "Adding New Product"}
        </p>
      </div>
      <AddNewProduct editData={selectedProduct} onFinished={() => { setSelectedProduct(null); setIsEditing(false); }} />
    </div>
  );

  const renderTableMode = () => (
    <div className="w-full space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Product Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Manage and update your website products —{" "}
            {loading ? <span className="text-muted-foreground">Loading...</span> : (
              <><span className="font-semibold text-foreground">{totalCount}</span> product{totalCount !== 1 ? "s" : ""}</>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setBulkDownloadTdsOpen(true)} className="gap-2 border-sky-300 text-sky-700 hover:bg-sky-50">
            <Download className="h-4 w-4" /> Bulk Download TDS
          </Button>
          <BulkUploader onUploadComplete={() => {}} />
          {userCanWrite && (
            <Button onClick={() => { setSelectedProduct(null); setIsEditing(true); }} className="gap-2">
              <PlusCircle className="h-4 w-4" /> Add Product
            </Button>
          )}
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-destructive/20 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold text-destructive">{selectedCount}</span>
            </div>
            <div>
              <p className="text-sm font-semibold">{selectedCount} product{selectedCount > 1 ? "s" : ""} selected</p>
              <p className="text-xs text-muted-foreground">Ready for bulk actions</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Button variant="ghost" size="sm" onClick={() => table.resetRowSelection()} className="gap-2"><X className="h-4 w-4" /> Clear</Button>
            {userCanWrite && (
              <Button variant="outline" size="sm" className={`gap-2 ${isRequestMode ? "border-amber-300 text-amber-700 hover:bg-amber-50" : "border-primary/30 text-primary hover:bg-primary/5"}`} onClick={() => setAssignWebsiteOpen(true)}>
                <Globe className="h-4 w-4" /> {isRequestMode ? "Request Website Assign" : "Assign to Website"}
              </Button>
            )}
            {userCanWrite && (
              <Button variant="outline" size="sm" className={`gap-2 ${isRequestMode ? "border-amber-300 text-amber-700 hover:bg-amber-50" : "border-violet-300 text-violet-700 hover:bg-violet-50"}`} onClick={() => setAssignProductClassOpen(true)}>
                <Tag className="h-4 w-4" /> {isRequestMode ? "Request Class Change" : "Set Product Class"}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={handleOpenBulkTds}>
              <FilePlus2 className="h-4 w-4" /> Generate TDS
            </Button>
            <Button variant="outline" size="sm" className="gap-2 border-sky-300 text-sky-700 hover:bg-sky-50" disabled={isTdsDownloading} onClick={handleBulkDownloadTds}>
              {isTdsDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isTdsDownloading ? "Zipping…" : "Download TDS ZIP"}
            </Button>
            {userCanWrite && (
              <Button variant={isRequestMode ? "outline" : "destructive"} size="sm" disabled={isDeleting} className={`gap-2 ${isRequestMode ? "border-amber-300 text-amber-700 hover:bg-amber-50" : ""}`} onClick={() => setBulkDeleteOpen(true)}>
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isRequestMode ? `Request Delete (${selectedCount})` : `Move ${selectedCount} to Bin`}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 items-center">
        <div ref={searchContainerRef} className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4 z-10" />
          <Input
            placeholder="Search by name, any item code…"
            value={globalFilter ?? ""}
            onChange={(e) => { setGlobalFilter(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => { if (e.key === "Escape") setShowSuggestions(false); }}
            className="pl-9"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden">
              {suggestions.map((product) => {
                const brands = Array.isArray(product.brands) ? product.brands : [product.brand || "Generic"];
                const codes = resolveItemCodes(product);
                return (
                  <button key={product.id} type="button" className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors"
                    onMouseDown={(e) => { e.preventDefault(); setShowSuggestions(false); setGlobalFilter(""); handleEdit(product); }}
                  >
                    <div className="w-9 h-9 shrink-0 bg-muted rounded-md border overflow-hidden flex items-center justify-center">
                      {product.mainImage ? <img src={product.mainImage} alt="" className="w-full h-full object-contain" /> : <Package className="h-4 w-4 text-muted-foreground/40" />}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">{product.itemDescription || product.name}</span>
                      <div className="mt-0.5"><ItemCodesDisplay itemCodes={codes} size="sm" maxVisible={2} /></div>
                    </div>
                    <Badge variant="outline" className="ml-auto shrink-0 text-xs">{brands[0]}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Product Class filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className={`gap-2 ${activeClassFilter ? "border-primary text-primary bg-primary/5" : ""}`}>
              {activeClassFilter ? activeClassFilter.toUpperCase() : "Product Class"} <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setClassFilter("")} className="flex items-center justify-between">
              <span>All Classes</span><div className="flex items-center gap-1.5"><CountPill count={data.length} />{!activeClassFilter && <Check className="h-3.5 w-3.5 text-primary" />}</div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setClassFilter(activeClassFilter === "spf" ? "" : "spf")} className="flex items-center justify-between">
              <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-violet-500" /> SPF Items</span><div className="flex items-center gap-1.5"><CountPill count={productClassCounts.get("spf") ?? 0} variant="violet" />{activeClassFilter === "spf" && <Check className="h-3.5 w-3.5 text-primary" />}</div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setClassFilter(activeClassFilter === "standard" ? "" : "standard")} className="flex items-center justify-between">
              <span className="flex items-center gap-2"><Package className="w-3.5 h-3.5" /> Standard Items</span><div className="flex items-center gap-1.5"><CountPill count={productClassCounts.get("standard") ?? 0} />{activeClassFilter === "standard" && <Check className="h-3.5 w-3.5 text-primary" />}</div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setClassFilter(activeClassFilter === "non-standard" ? "" : "non-standard")} className="flex items-center justify-between">
              <span className="flex items-center gap-2"><CircleDashed className="w-3.5 h-3.5 text-amber-500" /> Non-Standard Items</span><div className="flex items-center gap-1.5"><CountPill count={productClassCounts.get("non-standard") ?? 0} variant="amber" />{activeClassFilter === "non-standard" && <Check className="h-3.5 w-3.5 text-primary" />}</div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setClassFilter(activeClassFilter === "usl" ? "" : "usl")} className="flex items-center justify-between">
              <span className="flex items-center gap-2"><Package2 className="w-3.5 h-3.5 text-sky-500" /> USL Items</span><div className="flex items-center gap-1.5"><CountPill count={productClassCounts.get("usl") ?? 0} variant="sky" />{activeClassFilter === "usl" && <Check className="h-3.5 w-3.5 text-primary" />}</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Product Usage filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className={`gap-2 ${activeUsageFilter ? "border-primary text-primary bg-primary/5" : ""}`}>
              {activeUsageFilter === "OUTDOOR" ? <Trees className="h-4 w-4 text-emerald-600" /> : activeUsageFilter === "INDOOR" ? <Home className="h-4 w-4 text-sky-600" /> : activeUsageFilter === "SOLAR" ? <Sun className="h-4 w-4 text-amber-500" /> : <Sun className="h-4 w-4" />}
              {activeUsageFilter ? activeUsageFilter.charAt(0).toUpperCase() + activeUsageFilter.slice(1).toLowerCase() : "Usage"}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setUsageFilter("")} className="flex items-center justify-between">
              <span>All Usage</span><div className="flex items-center gap-1.5"><CountPill count={data.length} />{!activeUsageFilter && <Check className="h-3.5 w-3.5 text-primary" />}</div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {[{ key: "OUTDOOR", icon: <Trees className="w-3.5 h-3.5 text-emerald-600" />, label: "Outdoor", variant: "green" as const },
              { key: "INDOOR", icon: <Home className="w-3.5 h-3.5 text-sky-600" />, label: "Indoor", variant: "sky" as const },
              { key: "SOLAR", icon: <Sun className="w-3.5 h-3.5 text-amber-500" />, label: "Solar", variant: "amber" as const }]
              .map(({ key, icon, label, variant }) => (
                <DropdownMenuItem key={key} onClick={() => setUsageFilter(activeUsageFilter === key ? "" : key)} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">{icon} {label}</span>
                  <div className="flex items-center gap-1.5"><CountPill count={productUsageCounts.get(key) ?? 0} variant={variant} />{activeUsageFilter === key && <Check className="h-3.5 w-3.5 text-primary" />}</div>
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Product Family filter */}
        <DropdownMenu onOpenChange={(open) => { if (!open) setFamilySearch(""); }}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className={`gap-2 ${activeFamilyFilter ? "border-primary text-primary bg-primary/5" : ""}`}>
              <Layers className="h-4 w-4" />
              {activeFamilyFilter ? <span className="max-w-36 truncate">{activeFamilyFilter}</span> : "Product Family"}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 p-0 overflow-x-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input placeholder="Search families…" value={familySearch} onChange={(e) => setFamilySearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60 min-w-0" autoFocus />
              {familySearch && <button type="button" onClick={() => setFamilySearch("")} className="text-muted-foreground hover:text-foreground transition-colors shrink-0"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="max-h-64 overflow-y-auto overflow-x-hidden py-1">
              <DropdownMenuItem onClick={() => setFamilyFilter("")} className="flex items-center justify-between">
                <span className="text-muted-foreground italic">All Families</span>
                <div className="flex items-center gap-1.5"><CountPill count={data.length} />{!activeFamilyFilter && <Check className="h-3.5 w-3.5 text-primary" />}</div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {(() => {
                const filtered = uniqueProductFamilies.filter((f) => f.toLowerCase().includes(familySearch.toLowerCase()));
                if (filtered.length === 0) return <div className="px-3 py-4 text-center text-xs text-muted-foreground">No families match "{familySearch}"</div>;
                return filtered.map((family) => (
                  <DropdownMenuItem key={family} onClick={() => setFamilyFilter(activeFamilyFilter === family ? "" : family)} className="flex items-center gap-2 w-full overflow-hidden">
                    <span className="truncate text-sm flex-1 min-w-0">{family}</span>
                    <div className="flex items-center gap-1.5 shrink-0"><CountPill count={productFamilyCounts.get(family) ?? 0} />{activeFamilyFilter === family && <Check className="h-3.5 w-3.5 text-primary" />}</div>
                  </DropdownMenuItem>
                ));
              })()}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort / Column toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className={`ml-auto transition-colors ${sortOption ? "border-primary text-primary bg-primary/5" : ""}`}>
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sort</span>
              {sortOption && <button type="button" onClick={() => setSortOption(null)} className="text-[10px] text-primary hover:underline font-medium">Reset</button>}
            </DropdownMenuLabel>
            {[
              { key: "alpha-asc" as const, icon: <ArrowUpAZ className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />, label: "Alphabetically A → Z" },
              { key: "alpha-desc" as const, icon: <ArrowDownAZ className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />, label: "Alphabetically Z → A" },
              { key: "recent-12h" as const, icon: <Clock className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />, label: "Recently Added (12h)" },
              { key: "newest" as const, icon: <ArrowDown className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />, label: "Newest to Oldest" },
              { key: "oldest" as const, icon: <ArrowUp className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />, label: "Oldest to Newest" },
            ].map(({ key, icon, label }) => (
              <DropdownMenuCheckboxItem key={key} checked={sortOption === key || (key === "newest" && sortOption === null)} onCheckedChange={() => setSortOption((s) => (s === key ? null : key))}>
                {icon}{label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Toggle Columns</DropdownMenuLabel>
            {table.getAllColumns().filter((c) => c.getCanHide()).filter((c) => c.id !== "productFamilyFilter").map((column) => (
              <DropdownMenuCheckboxItem key={column.id} className="capitalize" checked={column.getIsVisible()} onCheckedChange={(value) => column.toggleVisibility(!!value)}>
                {column.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Active filters display */}
      {(activeFamilyFilter || activeUsageFilter || activeClassFilter || (sortOption && sortOption !== "newest")) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Active:</span>
          {activeFamilyFilter && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
              <Layers className="h-3 w-3" />{activeFamilyFilter}
              <button type="button" onClick={() => setFamilyFilter("")} className="ml-0.5 hover:text-destructive transition-colors"><X className="h-3 w-3" /></button>
            </span>
          )}
          {activeUsageFilter && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${activeUsageFilter === "OUTDOOR" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : activeUsageFilter === "INDOOR" ? "bg-sky-50 border-sky-200 text-sky-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
              {activeUsageFilter === "OUTDOOR" ? <Trees className="h-3 w-3" /> : activeUsageFilter === "INDOOR" ? <Home className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
              {activeUsageFilter.charAt(0).toUpperCase() + activeUsageFilter.slice(1).toLowerCase()}
              <button type="button" onClick={() => setUsageFilter("")} className="ml-0.5 hover:opacity-60 transition-opacity"><X className="h-3 w-3" /></button>
            </span>
          )}
          {activeClassFilter && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
              <Tag className="h-3 w-3" />
              {activeClassFilter}
              <button type="button" onClick={() => setClassFilter("")} className="ml-0.5 hover:text-destructive transition-colors"><X className="h-3 w-3" /></button>
            </span>
          )}
          {sortOption && sortOption !== "newest" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
              <SlidersHorizontal className="h-3 w-3" />{sortLabel[sortOption]}
              <button type="button" onClick={() => setSortOption(null)} className="ml-0.5 hover:text-destructive transition-colors"><X className="h-3 w-3" /></button>
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
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={columns.length} className="h-60 text-center"><Loader2 className="animate-spin mx-auto h-8 w-8 text-muted-foreground" /></TableCell></TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"} className="cursor-pointer" onClick={() => handleEdit(row.original)}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-60 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Package className="h-8 w-8" />
                    <p className="text-sm">{sortOption === "recent-12h" ? "No products added in the last 12 hours" : "No products found"}</p>
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
          {table.getSelectedRowModel().rows.length} of {data.length} row(s) selected
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Input
              type="number" min={1} max={500}
              className="h-9 w-20 text-sm text-center"
              value={rowsPerPageInput}
              onChange={(e) => setRowsPerPageInput(e.target.value)}
              onBlur={(e) => { const parsed = parseInt(e.target.value, 10); if (!isNaN(parsed) && parsed >= 1) { table.setPageSize(Math.min(parsed, 500)); setRowsPerPageInput(String(Math.min(parsed, 500))); } else { setRowsPerPageInput(String(table.getState().pagination.pageSize)); } }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
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
                        {isEditing ? (selectedProduct ? "Edit Product" : "Add Product") : "All Products"}
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
        <TdsPreviewDialog open={!!tdsPreviewProduct} onOpenChange={(v) => !v && setTdsPreviewProduct(null)} product={tdsPreviewProduct} />
        <BulkGenerateTdsDialog open={bulkTdsOpen} onOpenChange={(v) => { setBulkTdsOpen(v); if (!v && !isTdsRunning) setTdsJobs([]); }} jobs={tdsJobs} onStart={handleStartBulkTds} isRunning={isTdsRunning} />
        <DeleteToRecycleBinDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)} itemName={deleteTarget?.itemDescription ?? deleteTarget?.name ?? ""} onConfirm={() => handleSoftDelete(deleteTarget!)} requestMode={isRequestMode} />
        <DeleteToRecycleBinDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen} itemName={`${selectedCount} products`} confirmText={`${selectedCount} products`} count={selectedCount} onConfirm={handleBulkSoftDelete} requestMode={isRequestMode} />
        <AssignToWebsiteDialog open={assignWebsiteOpen} onOpenChange={setAssignWebsiteOpen} selectedCount={selectedCount} onConfirm={handleBulkAssignWebsite} />
        <AssignProductClassDialog open={assignProductClassOpen} onOpenChange={setAssignProductClassOpen} selectedCount={selectedCount} onConfirm={handleBulkAssignProductClass} />
        <BulkDownloadTdsDialog open={bulkDownloadTdsOpen} onOpenChange={setBulkDownloadTdsOpen} />
      </TooltipProvider>
    </ProtectedLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE ENTRY — conditionally renders read-only or full view
// ═══════════════════════════════════════════════════════════════════════════════

export default function AllProductsPage() {
  const { user, isLoading } = useAuth();

  const canWriteProducts = hasAccess(user, "write", "products");
  const canReadProducts = hasAccess(user, "read", "products");

  if (isLoading) {
    return (
      <div className="h-screen bg-[#050505] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-[#d11a2a] border-t-transparent rounded-full animate-spin" />
        <p className="text-[9px] font-black uppercase tracking-[0.4em] text-gray-600">
          Loading…
        </p>
      </div>
    );
  }

  if (canReadProducts && !canWriteProducts) {
    return (
      <ProtectedLayout>
        <ReadOnlyAllProductsView />
      </ProtectedLayout>
    );
  }

  return <FullAllProductsView />;
}
