"use client";

import * as React from "react";
import { useEffect, useState, useMemo } from "react";
import {
  Pencil,
  Trash2,
  Loader2,
  Search,
  ArrowLeft,
  PlusCircle,
  Package,
  ChevronLeft,
  ChevronRight,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "firebase/firestore";
import { toast } from "sonner";

// Components
import TaskflowAddNewProduct from "@/components/product-forms/taskflow-add-new-product-form";
import BulkUploader from "@/components/product-forms/bulk-uploader";

export default function TaskflowProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [rowsPerPageInput, setRowsPerPageInput] = useState("10");

  // Search suggestions state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
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

  // Compute suggestions from taskflow products based on searchQuery
  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => {
        const matchesTaskflow = Array.isArray(p.website)
          ? p.website.some((w: string) => w?.toLowerCase().includes("taskflow"))
          : p.website?.toLowerCase().includes("taskflow");
        if (!matchesTaskflow) return false;
        return (
          p.name?.toLowerCase().includes(q) ||
          p.itemCode?.toLowerCase().includes(q) ||
          p.categories?.toLowerCase().includes(q)
        );
      })
      .slice(0, 7);
  }, [products, searchQuery]);

  // View States
  const [isEditing, setIsEditing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Selection States
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // --- 1. FETCH DATA ---
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const productList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setProducts(productList);
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

  // --- 2. FILTER LOGIC - Always filters for taskflow ---
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesBrand =
        brandFilter === "all" ||
        (Array.isArray(p.brands)
          ? p.brands.includes(brandFilter)
          : p.brand === brandFilter);

      const matchesTaskflow = Array.isArray(p.website)
        ? p.website.some((w: string) => w?.toLowerCase().includes("taskflow"))
        : p.website?.toLowerCase().includes("taskflow");

      const matchesSearch =
        p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.itemCode?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesBrand && matchesTaskflow && matchesSearch;
    });
  }, [products, brandFilter, searchQuery]);

  // --- 3. PAGINATION LOGIC ---
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, brandFilter]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const uniqueBrands = useMemo(() => {
    const brandsSet = new Set<string>();
    products.forEach((p: any) => {
      if (Array.isArray(p.brands))
        p.brands.forEach((b: string) => brandsSet.add(b));
      else if (p.brand) brandsSet.add(p.brand);
    });
    return Array.from(brandsSet).sort();
  }, [products]);

  // Taskflow-only total (unfiltered by search/brand)
  const taskflowTotal = useMemo(() => {
    return products.filter((p) => {
      return Array.isArray(p.website)
        ? p.website.some((w: string) => w?.toLowerCase().includes("taskflow"))
        : p.website?.toLowerCase().includes("taskflow");
    }).length;
  }, [products]);

  const isFiltered = filteredProducts.length !== taskflowTotal;

  // --- 4. ACTIONS ---
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, "products", id));
      toast.success("Product deleted successfully");
    } catch (error) {
      toast.error("Failed to delete product");
    }
  };

  const handleEditClick = (product: any) => {
    setSelectedProduct(product);
    setIsEditing(true);
  };

  const handleAddNewClick = () => {
    setSelectedProduct(null);
    setIsEditing(true);
  };

  const handleBackToList = () => {
    setSelectedProduct(null);
    setIsEditing(false);
  };

  // --- SELECTION HANDLERS ---
  const toggleSelectProduct = (productId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(productId)) newSelected.delete(productId);
    else newSelected.add(productId);
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedProducts.length)
      setSelectedIds(new Set());
    else setSelectedIds(new Set(paginatedProducts.map((p) => p.id)));
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const deletePromises = Array.from(selectedIds).map((id) =>
        deleteDoc(doc(db, "products", id)),
      );
      await Promise.all(deletePromises);
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
      toast.success(`Deleted ${selectedIds.size} product(s)`);
    } catch (error) {
      console.error("Bulk delete error:", error);
      toast.error("Failed to delete products");
    } finally {
      setIsDeleting(false);
    }
  };

  const getPaginationPages = () => {
    const maxButtons = 5;
    if (totalPages <= maxButtons)
      return Array.from({ length: totalPages }, (_, i) => i + 1);

    const pages: number[] = [];
    const leftSide = Math.floor(maxButtons / 2);

    let startPage = Math.max(1, currentPage - leftSide);
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage < maxButtons - 1)
      startPage = Math.max(1, endPage - maxButtons + 1);

    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return pages;
  };

  // --- RENDER: EDIT MODE ---
  const renderEditMode = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={handleBackToList} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Taskflow Products
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <p className="text-sm text-muted-foreground">
          {selectedProduct
            ? `Editing: ${selectedProduct?.name}`
            : "Adding New Product"}
        </p>
      </div>
      <TaskflowAddNewProduct
        editData={selectedProduct}
        onFinished={handleBackToList}
      />
    </div>
  );

  // --- RENDER: TABLE MODE ---
  const renderTableMode = () => (
    <div className="w-full space-y-4">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6" />
            Taskflow Inventory
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage products for Taskflow website &mdash;{" "}
            {loading ? (
              <span className="text-muted-foreground">Loading...</span>
            ) : (
              <>
                <span className="font-semibold text-foreground">
                  {isFiltered ? filteredProducts.length : taskflowTotal}
                </span>
                {isFiltered && (
                  <span className="text-muted-foreground">
                    {" "}
                    of {taskflowTotal}
                  </span>
                )}{" "}
                product{taskflowTotal !== 1 ? "s" : ""}
              </>
            )}
          </p>
        </div>

        <div className="flex gap-3">
          <BulkUploader
            onUploadComplete={() => toast.success("Bulk upload completed!")}
          />
          <Button onClick={handleAddNewClick} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {/* BULK ACTIONS BANNER */}
      {selectedIds.size > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-destructive/20 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold text-destructive">
                {selectedIds.size}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold">
                {selectedIds.size} product{selectedIds.size > 1 ? "s" : ""}{" "}
                selected
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
              onClick={() => setSelectedIds(new Set())}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Clear
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete {selectedIds.size}
            </Button>
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div className="flex flex-wrap gap-3 items-center">
        <div ref={searchContainerRef} className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4 z-10" />
          <Input
            placeholder="Search name or item code..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowSuggestions(false);
            }}
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
                      setSearchQuery("");
                      handleEditClick(product);
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
                        {(product.productFamily || product.categories) && (
                          <span className="text-xs text-muted-foreground truncate">
                            · {product.productFamily || product.categories}
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

        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-45">
            <SelectValue placeholder="Select brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            {uniqueBrands.map((brand) => (
              <SelectItem key={brand} value={brand}>
                {brand}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* TABLE */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={
                    selectedIds.size === paginatedProducts.length &&
                    paginatedProducts.length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-20">Image</TableHead>
              <TableHead>Product Info</TableHead>
              <TableHead>Item Code</TableHead>
              <TableHead>Brand / Website</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-60 text-center">
                  <Loader2 className="animate-spin mx-auto h-8 w-8 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : paginatedProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-60 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Package className="h-8 w-8" />
                    <p className="text-sm">No taskflow products found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedProducts.map((product) => (
                <TableRow
                  key={product.id}
                  data-state={selectedIds.has(product.id) && "selected"}
                  className="cursor-pointer"
                  onClick={() => handleEditClick(product)}
                >
                  {/* CHECKBOX */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(product.id)}
                      onCheckedChange={() => toggleSelectProduct(product.id)}
                    />
                  </TableCell>

                  {/* IMAGE */}
                  <TableCell>
                    <div className="w-12 h-12 bg-background rounded-lg p-1 border overflow-hidden">
                      <img
                        src={product.mainImage || "/placeholder.svg"}
                        alt={product.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </TableCell>

                  {/* PRODUCT INFO */}
                  <TableCell>
                    <div className="flex flex-col max-w-62.5">
                      <span className="font-semibold text-sm line-clamp-1">
                        {product.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {product.productFamily ||
                          product.categories ||
                          "No Category"}
                      </span>
                    </div>
                  </TableCell>

                  {/* ITEM CODE */}
                  <TableCell>
                    <span className="text-xs text-muted-foreground font-mono">
                      {product.itemCode || "---"}
                    </span>
                  </TableCell>

                  {/* BRAND / WEBSITE */}
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="w-fit text-xs">
                        {Array.isArray(product.brands)
                          ? product.brands.join(", ")
                          : product.brand || "Generic"}
                      </Badge>
                      <Badge variant="secondary" className="w-fit text-xs">
                        {Array.isArray(product.website)
                          ? product.website.join(", ")
                          : product.website || "N/A"}
                      </Badge>
                    </div>
                  </TableCell>

                  {/* ACTIONS */}
                  <TableCell className="text-right">
                    <div
                      className="flex justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(product);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={(e) => e.stopPropagation()}
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
                            <AlertDialogAction
                              onClick={(e) => handleDelete(e, product.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* PAGINATION */}
      {!loading && totalPages > 0 && (
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Rows per page:
            </span>
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
                  const clamped = Math.min(parsed, 500);
                  setItemsPerPage(clamped);
                  setRowsPerPageInput(String(clamped));
                  setCurrentPage(1);
                } else {
                  setRowsPerPageInput(String(itemsPerPage));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => prev - 1)}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>

            {getPaginationPages().map((pageNum) => (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(pageNum)}
                className="w-9"
              >
                {pageNum}
              </Button>
            ))}

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((prev) => prev + 1)}
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
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
                        : "Taskflow Products"}
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

      {/* BULK DELETE CONFIRMATION */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Products?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete{" "}
              <span className="font-semibold text-foreground">
                {selectedIds.size}
              </span>{" "}
              product
              {selectedIds.size > 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isDeleting}>
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
