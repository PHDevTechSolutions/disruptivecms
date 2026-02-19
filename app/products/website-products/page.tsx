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
} from "lucide-react";

// Sidebar Components
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

// UI Components
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

// Firebase
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  deleteDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import { toast } from "sonner";

// Components
import AddNewProduct from "@/components/product-forms/add-new-product-form";
import BulkUploader from "@/components/product-forms/bulk-uploader";

// --- TYPES ---
export type Product = {
  id: string;
  name: string;
  itemCode: string;
  mainImage: string;
  categories: string;
  brand: string | string[];
  website: string | string[];
  brands?: string[];
  websites?: string[];
  createdAt: any;
};

// --- CUSTOM FILTER FUNCTION ---
const multiValueFilter: FilterFn<Product> = (row, columnId, filterValue) => {
  const value = row.getValue(columnId);
  const filter = filterValue.toLowerCase();

  if (Array.isArray(value)) {
    return value.some((v: string) => v.toLowerCase().includes(filter));
  }
  return String(value).toLowerCase().includes(filter);
};

export default function AllProductsPage() {
  // Data States
  const [data, setData] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(true);

  // View States
  const [isEditing, setIsEditing] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Table States
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  // Rows per page input state
  const [rowsPerPageInput, setRowsPerPageInput] = React.useState("10");

  // Search suggestions state
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Compute suggestions from current data based on globalFilter
  const suggestions = React.useMemo(() => {
    const q = (globalFilter ?? "").trim().toLowerCase();
    if (!q) return [];
    return data
      .filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.itemCode?.toLowerCase().includes(q) ||
          (p.categories as string)?.toLowerCase().includes(q),
      )
      .slice(0, 7);
  }, [data, globalFilter]);

  // --- FETCH DATA ---
  // ✅ FIX: Use array-contains-any on the `websites` array field so products
  // that belong to multiple websites (e.g. ["Ecoshift Corporation", "Taskflow"])
  // are still returned, instead of the old `in` operator which did an exact match.
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
        const productList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Product[];
        setData(productList);
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

  // --- ACTIONS ---
  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "products", id));
      toast.success("Product deleted successfully");
    } catch (error) {
      toast.error("Failed to delete product");
    }
  };

  const handleBulkDelete = async (selectedIds: string[]) => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    const deleteToast = toast.loading(
      `Deleting ${selectedIds.length} products...`,
    );

    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => {
        batch.delete(doc(db, "products", id));
      });
      await batch.commit();
      toast.success(`Deleted ${selectedIds.length} products!`, {
        id: deleteToast,
      });
      setRowSelection({});
    } catch (error) {
      console.error("Bulk delete error:", error);
      toast.error("Failed to delete products", { id: deleteToast });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setIsEditing(true);
  };

  // --- COLUMNS DEFINITION ---
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
      header: "Image",
      cell: ({ row }) => {
        const imageUrl = row.getValue("mainImage") as string;
        return (
          <div className="w-12 h-12 bg-muted rounded-lg p-1 border overflow-hidden flex items-center justify-center">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={row.original.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <Package className="h-6 w-6 text-muted-foreground/40" />
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "name",
      header: () => <div className="text-xs font-medium">Product Info</div>,
      cell: ({ row }) => (
        <div className="flex flex-col max-w-62.5">
          <span className="font-semibold text-sm line-clamp-1">
            {row.getValue("name")}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.original.categories || "No Category"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "itemCode",
      header: () => <div className="text-xs font-medium">Item Code</div>,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.getValue("itemCode") || "---"}
        </span>
      ),
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
      header: () => <div className="text-xs font-medium">Brand / Website</div>,
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
    },
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

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Product?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You are about to delete{" "}
                    <span className="font-semibold text-foreground">
                      {product.name}
                    </span>
                    . This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleDelete(product.id)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      },
    },
  ];

  // --- TABLE INSTANCE ---
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
    filterFns: {
      multiValue: multiValueFilter,
    },
  });

  // Extract Unique Brands/Websites for Filters
  const uniqueBrands = React.useMemo(() => {
    const set = new Set<string>();
    data.forEach((p) => {
      if (Array.isArray(p.brands)) p.brands.forEach((b) => set.add(b));
      else if (p.brand) set.add(p.brand as string);
    });
    return Array.from(set).sort();
  }, [data]);

  const uniqueWebsites = React.useMemo(() => {
    const set = new Set<string>();
    data.forEach((p) => {
      if (Array.isArray(p.websites)) p.websites.forEach((w) => set.add(w));
      else if (p.website) set.add(p.website as string);
    });
    return Array.from(set).sort();
  }, [data]);

  const selectedCount = Object.keys(rowSelection).length;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;
  const isFiltered = filteredCount !== totalCount;

  // --- RENDER: EDIT MODE ---
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
            ? `Editing: ${selectedProduct?.name}`
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

  // --- RENDER: TABLE MODE ---
  const renderTableMode = () => (
    <div className="w-full space-y-4">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Website Product Inventory
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage and update your website products &mdash;{" "}
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
          <Button
            onClick={() => {
              setSelectedProduct(null);
              setIsEditing(true);
            }}
            className="gap-2"
          >
            <PlusCircle className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {/* BULK ACTIONS */}
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
              <X className="h-4 w-4" />
              Clear
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isDeleting}
                  className="gap-2"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete Selected
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {selectedCount} Products?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete
                    the selected products.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      const ids = table
                        .getFilteredSelectedRowModel()
                        .rows.map((row) => row.original.id);
                      handleBulkDelete(ids);
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      {/* FILTERS TOOLBAR */}
      <div className="flex flex-wrap gap-3 items-center">
        <div ref={searchContainerRef} className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4 z-10" />
          <Input
            placeholder="Search products..."
            value={globalFilter ?? ""}
            onChange={(event) => {
              setGlobalFilter(event.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowSuggestions(false);
            }}
            className="pl-9"
          />
          {/* SUGGESTIONS DROPDOWN */}
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
                          alt={product.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Package className="h-4 w-4 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">
                        {product.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">
                          {product.itemCode || "---"}
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

        {/* Brand Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              Brands
              <ChevronDown className="h-4 w-4" />
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

        {/* Website Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              Websites
              <ChevronDown className="h-4 w-4" />
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

        {/* Column Visibility */}
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
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* TABLE */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
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

      {/* PAGINATION */}
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
              onChange={(e) => {
                setRowsPerPageInput(e.target.value);
              }}
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
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
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
    </TooltipProvider>
  );
}
