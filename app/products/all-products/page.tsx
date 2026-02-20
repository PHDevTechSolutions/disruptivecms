"use client";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
} from "firebase/firestore";
import { toast } from "sonner";

import AddNewProduct from "@/components/product-forms/add-new-product-form";
import BulkUploader from "@/components/product-forms/bulk-uploader";
import { DeleteToRecycleBinDialog } from "@/components/deletedialog";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Product = {
  id: string;
  itemDescription: string;
  ecoItemCode: string;
  litItemCode: string;
  productClass: "spf" | "standard" | "";
  name: string;
  itemCode: string;
  mainImage: string;
  rawImage: string[];
  categories: string;
  brand: string | string[];
  website: string | string[];
  brands?: string[];
  websites?: string[];
  createdAt: any;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const WEBSITE_OPTIONS = [
  {
    id: "disruptive",
    label: "Disruptive Solutions Inc",
    value: "Disruptive Solutions Inc",
    color: "bg-blue-50 border-blue-200 text-blue-700",
    activeColor: "bg-blue-100 border-blue-500 text-blue-800",
    dot: "bg-blue-500",
  },
  {
    id: "ecoshift",
    label: "Ecoshift Corporation",
    value: "Ecoshift Corporation",
    color: "bg-emerald-50 border-emerald-200 text-emerald-700",
    activeColor: "bg-emerald-100 border-emerald-500 text-emerald-800",
    dot: "bg-emerald-500",
  },
  {
    id: "vah",
    label: "Value Acquisitions Holdings",
    value: "Value Acquisitions Holdings",
    color: "bg-amber-50 border-amber-200 text-amber-700",
    activeColor: "bg-amber-100 border-amber-500 text-amber-800",
    dot: "bg-amber-500",
  },
  {
    id: "taskflow",
    label: "Taskflow",
    value: "Taskflow",
    color: "bg-violet-50 border-violet-200 text-violet-700",
    activeColor: "bg-violet-100 border-violet-500 text-violet-800",
    dot: "bg-violet-500",
  },
];

// ─── Custom filter (handles arrays) ──────────────────────────────────────────

const multiValueFilter: FilterFn<Product> = (row, columnId, filterValue) => {
  const value = row.getValue(columnId);
  const filter = filterValue.toLowerCase();
  if (Array.isArray(value))
    return value.some((v: string) => v.toLowerCase().includes(filter));
  return String(value).toLowerCase().includes(filter);
};

// ─── Product-class badge helper ───────────────────────────────────────────────

function ProductClassBadge({ value }: { value: "spf" | "standard" | "" }) {
  if (!value)
    return <span className="text-xs text-muted-foreground/50">—</span>;
  if (value === "spf")
    return (
      <Badge className="gap-1 bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-100 text-[10px] font-semibold">
        <Sparkles className="w-2.5 h-2.5" />
        SPF
      </Badge>
    );
  return (
    <Badge variant="secondary" className="text-[10px] font-semibold">
      <Package className="w-2.5 h-2.5 mr-1" />
      Standard
    </Badge>
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

  // Reset selections when dialog opens
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
                assigned to the selected websites.
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
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all duration-150
                  ${
                    isSelected
                      ? `${site.activeColor} shadow-sm`
                      : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"
                  }`}
              >
                {/* Colored dot */}
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? site.dot : "bg-muted-foreground/30"}`}
                />

                {/* Label */}
                <span
                  className={`flex-1 text-sm font-medium ${isSelected ? "" : "text-foreground"}`}
                >
                  {site.label}
                </span>

                {/* Check indicator */}
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                    ${isSelected ? "bg-current/20 opacity-100" : "opacity-0"}`}
                >
                  <Check className="w-3 h-3" />
                </span>
              </button>
            );
          })}
        </div>

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
              . Existing website assignments will be preserved.
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
                <Loader2 className="h-4 w-4 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <Globe className="h-4 w-4" />
                Assign to{" "}
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

// ─── Page component ───────────────────────────────────────────────────────────

export default function AllProductsPage() {
  const [data, setData] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [isEditing, setIsEditing] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = React.useState(false);

  // TanStack table state
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [rowsPerPageInput, setRowsPerPageInput] = React.useState("10");

  // Search suggestions
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = React.useState<Product | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);

  // ── NEW: Assign to website dialog state ──────────────────────────────────
  const [assignWebsiteOpen, setAssignWebsiteOpen] = React.useState(false);

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

  const suggestions = React.useMemo(() => {
    const q = (globalFilter ?? "").trim().toLowerCase();
    if (!q) return [];
    return data
      .filter(
        (p) =>
          p.itemDescription?.toLowerCase().includes(q) ||
          p.name?.toLowerCase().includes(q) ||
          p.ecoItemCode?.toLowerCase().includes(q) ||
          p.litItemCode?.toLowerCase().includes(q) ||
          p.itemCode?.toLowerCase().includes(q) ||
          (p.categories as string)?.toLowerCase().includes(q),
      )
      .slice(0, 7);
  }, [data, globalFilter]);

  // ── Firestore listener ────────────────────────────────────────────────────
  React.useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "products"),
      where("websites", "array-contains-any", [
        "Disruptive Solutions Inc",
        "Ecoshift Corporation",
        "Value Acquisitions Holdings",
        "Taskflow",
      ]),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setData(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Product[],
        );
        setLoading(false);
      },
      (error) => {
        console.error("Fetch error:", error);
        toast.error("Failed to load products");
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  // ── Soft-delete helpers ───────────────────────────────────────────────────
  const handleSoftDelete = async (product: Product) => {
    const batch = writeBatch(db);
    const { id, ...rest } = product;
    batch.set(doc(db, "recycle_bin", id), {
      ...rest,
      originalCollection: "products",
      originPage: "/admin/products/all",
      deletedAt: serverTimestamp(),
    });
    batch.delete(doc(db, "products", id));
    await batch.commit();
    toast.success(
      `"${product.itemDescription || product.name}" moved to recycle bin.`,
    );
  };

  const handleBulkSoftDelete = async () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    setIsDeleting(true);
    const loadingToast = toast.loading(
      `Moving ${selectedRows.length} products to recycle bin...`,
    );
    try {
      const batch = writeBatch(db);
      selectedRows.forEach(({ original: product }) => {
        const { id, ...rest } = product;
        batch.set(doc(db, "recycle_bin", id), {
          ...rest,
          originalCollection: "products",
          originPage: "/admin/products/all",
          deletedAt: serverTimestamp(),
        });
        batch.delete(doc(db, "products", id));
      });
      await batch.commit();
      toast.success(`${selectedRows.length} products moved to recycle bin.`, {
        id: loadingToast,
      });
      setRowSelection({});
    } catch (error) {
      console.error("Bulk soft-delete error:", error);
      toast.error("Failed to move products to recycle bin.", {
        id: loadingToast,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // ── NEW: Bulk assign to website handler ───────────────────────────────────
  const handleBulkAssignWebsite = async (websites: string[]) => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const count = selectedRows.length;
    const loadingToast = toast.loading(
      `Assigning ${count} product${count !== 1 ? "s" : ""} to ${websites.length} website${websites.length !== 1 ? "s" : ""}...`,
    );
    try {
      const batch = writeBatch(db);
      selectedRows.forEach(({ original: product }) => {
        batch.update(doc(db, "products", product.id), {
          websites: arrayUnion(...websites),
          website: arrayUnion(...websites),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      toast.success(
        `${count} product${count !== 1 ? "s" : ""} assigned to ${websites.join(", ")}.`,
        { id: loadingToast },
      );
      setRowSelection({});
    } catch (error) {
      console.error("Bulk assign error:", error);
      toast.error("Failed to assign products to websites.", {
        id: loadingToast,
      });
    }
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setIsEditing(true);
  };

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns: ColumnDef<Product>[] = [
    // 0 — Select
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

    // 1 — Image
    {
      accessorKey: "mainImage",
      header: () => <div className="text-xs font-medium">Main Image</div>,
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
      accessorKey: "rawImage",
      header: () => <div className="text-xs font-medium">Raw Image</div>,
      cell: ({ row }) => {
        const imageUrl = row.getValue("rawImage") as string;
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

    // 2 — Ecoshift Item Code
    {
      accessorKey: "ecoItemCode",
      header: () => <div className="text-xs font-medium">Eco Item Code</div>,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">
          {row.getValue("ecoItemCode") || "—"}
        </span>
      ),
    },

    // 3 — LIT Item Code
    {
      accessorKey: "litItemCode",
      header: () => <div className="text-xs font-medium">LIT Item Code</div>,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">
          {row.getValue("litItemCode") || "—"}
        </span>
      ),
    },

    // 4 — Item Description
    {
      accessorKey: "itemDescription",
      header: () => <div className="text-xs font-medium">Item Description</div>,
      cell: ({ row }) => {
        const desc = row.getValue("itemDescription") as string;
        const fallback = row.original.name;
        return (
          <div className="flex flex-col max-w-[260px]">
            <span className="font-semibold text-sm line-clamp-2 leading-snug">
              {desc || fallback || "—"}
            </span>
            {row.original.categories && (
              <span className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {row.original.categories}
              </span>
            )}
          </div>
        );
      },
    },

    // 5 — Product Class
    {
      accessorKey: "productClass",
      header: () => <div className="text-xs font-medium">Product Class</div>,
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

    // 6 — Brand / Website
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
          : [row.original.website || "N/A"];
        return (
          <div className="flex flex-col gap-1 items-start">
            <Badge variant="outline" className="text-xs font-medium">
              {brands.join(", ")}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {websites.join(", ")}
            </Badge>
          </div>
        );
      },
      filterFn: multiValueFilter,
    },

    // 7 — Actions
    {
      id: "actions",
      header: () => (
        <div className="text-xs font-medium text-right">Actions</div>
      ),
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div
            className="flex justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleEdit(product)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => setDeleteTarget(product)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data,
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

  // ── Derived filter values ─────────────────────────────────────────────────
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

  const selectedCount = Object.keys(rowSelection).length;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;
  const isFiltered = filteredCount !== totalCount;

  // ── Edit view ─────────────────────────────────────────────────────────────
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
          <ArrowLeft className="h-4 w-4" />
          Back to Products
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

  // ── Table view ────────────────────────────────────────────────────────────
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

          {/* ── NEW: Assign to Website button ── */}
          <Button
            variant="outline"
            onClick={() => setAssignWebsiteOpen(true)}
            disabled={selectedCount === 0}
            className="gap-2"
            title={
              selectedCount === 0
                ? "Select products first to assign them to a website"
                : `Assign ${selectedCount} selected product${selectedCount !== 1 ? "s" : ""} to a website`
            }
          >
            <Globe className="h-4 w-4" />
            Assign to Website
            {selectedCount > 0 && (
              <Badge className="ml-1 h-5 min-w-5 px-1.5 text-[10px] font-bold">
                {selectedCount}
              </Badge>
            )}
          </Button>

          <Button
            onClick={() => {
              setSelectedProduct(null);
              setIsEditing(true);
            }}
            className="gap-2"
          >
            <PlusCircle className="h-4 w-4" /> Add Product
          </Button>
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
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => table.resetRowSelection()}
              className="gap-2"
            >
              <X className="h-4 w-4" /> Clear
            </Button>
            {/* ── NEW: Assign to Website in bulk bar ── */}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
              onClick={() => setAssignWebsiteOpen(true)}
            >
              <Globe className="h-4 w-4" />
              Assign to Website
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isDeleting}
              className="gap-2"
              onClick={() => setBulkDeleteOpen(true)}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Move {selectedCount} to Bin
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4 z-10" />
          <Input
            placeholder="Search products..."
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
                          alt={product.itemDescription || product.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Package className="h-4 w-4 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">
                        {product.itemDescription || product.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">
                          {product.ecoItemCode ||
                            product.litItemCode ||
                            product.itemCode ||
                            "—"}
                        </span>
                        {product.categories && (
                          <span className="text-xs text-muted-foreground truncate">
                            · {product.categories}
                          </span>
                        )}
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
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={() =>
                table.getColumn("productClass")?.setFilterValue("")
              }
            >
              All Classes
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                table.getColumn("productClass")?.setFilterValue("spf")
              }
            >
              <Sparkles className="w-3.5 h-3.5 mr-2 text-violet-500" /> SPF
              Items
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                table.getColumn("productClass")?.setFilterValue("standard")
              }
            >
              <Package className="w-3.5 h-3.5 mr-2" /> Standard Items
            </DropdownMenuItem>
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
            className="w-48 max-h-60 overflow-y-auto"
          >
            <DropdownMenuItem
              onClick={() => table.getColumn("details")?.setFilterValue("")}
            >
              All Brands
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {uniqueBrands.map((brand) => (
              <DropdownMenuItem
                key={brand}
                onClick={() =>
                  table.getColumn("details")?.setFilterValue(brand)
                }
              >
                {brand}
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
            className="w-48 max-h-60 overflow-y-auto"
          >
            <DropdownMenuItem
              onClick={() => table.getColumn("details")?.setFilterValue("")}
            >
              All Websites
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {uniqueWebsites.map((web) => (
              <DropdownMenuItem
                key={web}
                onClick={() => table.getColumn("details")?.setFilterValue(web)}
              >
                {web}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Column visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="ml-auto">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((c) => c.getCanHide())
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
                    <p className="text-sm">No products found</p>
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
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
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
            {isEditing ? renderEditMode() : renderTableMode()}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* Single delete */}
      <DeleteToRecycleBinDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        itemName={deleteTarget?.itemDescription ?? deleteTarget?.name ?? ""}
        onConfirm={() => handleSoftDelete(deleteTarget!)}
      />

      {/* Bulk delete */}
      <DeleteToRecycleBinDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        itemName={`${selectedCount} products`}
        confirmText={`${selectedCount} products`}
        count={selectedCount}
        onConfirm={handleBulkSoftDelete}
      />

      {/* ── NEW: Assign to Website dialog ── */}
      <AssignToWebsiteDialog
        open={assignWebsiteOpen}
        onOpenChange={setAssignWebsiteOpen}
        selectedCount={selectedCount}
        onConfirm={handleBulkAssignWebsite}
      />
    </TooltipProvider>
  );
}
