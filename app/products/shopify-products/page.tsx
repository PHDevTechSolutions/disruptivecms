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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { toast } from "sonner";

import ShopifyAddNewProduct from "@/components/product-forms/shopify-add-new-product-form";
import BulkUploader from "@/components/product-forms/bulk-uploader";
import { DeleteToRecycleBinDialog } from "@/components/deletedialog";

// ── Checks both `website` (old) and `websites` (new array field) ──────────
function isShopifyProduct(p: any): boolean {
  const webs: string[] = [
    ...(Array.isArray(p.websites) ? p.websites : p.websites ? [p.websites] : []),
    ...(Array.isArray(p.website)  ? p.website  : p.website  ? [p.website]  : []),
  ];
  return webs.some((w) => w?.toLowerCase().includes("shopify"));
}

export default function ShopifyProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [rowsPerPageInput, setRowsPerPageInput] = useState("10");

  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Fetch error:", error);
      toast.error("Failed to load products");
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => {
        if (!isShopifyProduct(p)) return false;
        return (
          p.name?.toLowerCase().includes(q) ||
          p.itemCode?.toLowerCase().includes(q) ||
          p.categories?.toLowerCase().includes(q) ||
          p.productFamily?.toLowerCase().includes(q)
        );
      })
      .slice(0, 7);
  }, [products, searchQuery]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!isShopifyProduct(p)) return false;
      const matchesBrand =
        brandFilter === "all" ||
        (Array.isArray(p.brands) ? p.brands.includes(brandFilter) : p.brand === brandFilter);
      const matchesSearch =
        p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.itemCode?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesBrand && matchesSearch;
    });
  }, [products, brandFilter, searchQuery]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, brandFilter]);

  const shopifyTotal = useMemo(() => products.filter(isShopifyProduct).length, [products]);
  const isFiltered = filteredProducts.length !== shopifyTotal;
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const uniqueBrands = useMemo(() => {
    const s = new Set<string>();
    products.filter(isShopifyProduct).forEach((p) => {
      if (Array.isArray(p.brands)) p.brands.forEach((b: string) => s.add(b));
      else if (p.brand) s.add(p.brand);
    });
    return Array.from(s).sort();
  }, [products]);

  const handleSoftDelete = async (product: any) => {
    const batch = writeBatch(db);
    const { id, ...rest } = product;
    batch.set(doc(db, "recycle_bin", id), {
      ...rest,
      originalCollection: "products",
      originPage: "/admin/products/shopify",
      deletedAt: serverTimestamp(),
    });
    batch.delete(doc(db, "products", id));
    await batch.commit();
    toast.success(`"${product.name}" moved to recycle bin.`);
  };

  const handleBulkSoftDelete = async () => {
    const targets = paginatedProducts.filter((p) => selectedIds.has(p.id));
    const batch = writeBatch(db);
    targets.forEach((product) => {
      const { id, ...rest } = product;
      batch.set(doc(db, "recycle_bin", id), {
        ...rest,
        originalCollection: "products",
        originPage: "/admin/products/shopify",
        deletedAt: serverTimestamp(),
      });
      batch.delete(doc(db, "products", id));
    });
    await batch.commit();
    toast.success(`${targets.length} product(s) moved to recycle bin.`);
    setSelectedIds(new Set());
  };

  const handleEditClick = (product: any) => { setSelectedProduct(product); setIsEditing(true); };
  const handleAddNewClick = () => { setSelectedProduct(null); setIsEditing(true); };
  const handleBackToList = () => { setSelectedProduct(null); setIsEditing(false); };

  const toggleSelectProduct = (productId: string) => {
    const next = new Set(selectedIds);
    if (next.has(productId)) next.delete(productId); else next.add(productId);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedProducts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginatedProducts.map((p) => p.id)));
  };

  const getPaginationPages = () => {
    const max = 5;
    if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: number[] = [];
    let start = Math.max(1, currentPage - Math.floor(max / 2));
    let end = Math.min(totalPages, start + max - 1);
    if (end - start < max - 1) start = Math.max(1, end - max + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  const renderEditMode = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={handleBackToList} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Shopify Products
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <p className="text-sm text-muted-foreground">
          {selectedProduct ? `Editing: ${selectedProduct?.name}` : "Adding New Product"}
        </p>
      </div>
      <ShopifyAddNewProduct editData={selectedProduct} onFinished={handleBackToList} />
    </div>
  );

  const renderTableMode = () => (
    <div className="w-full space-y-4">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6" />
            Shopify Inventory
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage products for Shopify website &mdash;{" "}
            {loading ? (
              <span className="text-muted-foreground">Loading...</span>
            ) : (
              <>
                <span className="font-semibold text-foreground">
                  {isFiltered ? filteredProducts.length : shopifyTotal}
                </span>
                {isFiltered && <span className="text-muted-foreground"> of {shopifyTotal}</span>}{" "}
                product{shopifyTotal !== 1 ? "s" : ""}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <BulkUploader onUploadComplete={() => toast.success("Bulk upload completed!")} />
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
              <span className="text-sm font-semibold text-destructive">{selectedIds.size}</span>
            </div>
            <div>
              <p className="text-sm font-semibold">
                {selectedIds.size} product{selectedIds.size > 1 ? "s" : ""} selected
              </p>
              <p className="text-xs text-muted-foreground">Ready for bulk actions</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="gap-2">
              <X className="h-4 w-4" /> Clear
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Move {selectedIds.size} to Bin
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
            onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => { if (e.key === "Escape") setShowSuggestions(false); }}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden">
              {suggestions.map((product) => {
                const brands = Array.isArray(product.brands) ? product.brands : [product.brand || "Generic"];
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
                      {product.mainImage
                        ? <img src={product.mainImage} alt={product.name} className="w-full h-full object-contain" />
                        : <Package className="h-4 w-4 text-muted-foreground/40" />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{product.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">{product.itemCode || "---"}</span>
                        {(product.productFamily || product.categories) && (
                          <span className="text-xs text-muted-foreground truncate">
                            · {product.productFamily || product.categories}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-auto shrink-0 text-xs">{brands[0]}</Badge>
                  </button>
                );
              })}
              <div className="px-3 py-1.5 border-t bg-muted/40">
                <p className="text-xs text-muted-foreground">
                  {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""} — press Enter to search all
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
              <SelectItem key={brand} value={brand}>{brand}</SelectItem>
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
                  checked={selectedIds.size === paginatedProducts.length && paginatedProducts.length > 0}
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
                    <p className="text-sm">No Shopify products found</p>
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
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(product.id)}
                      onCheckedChange={() => toggleSelectProduct(product.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="w-12 h-12 bg-background rounded-lg p-1 border overflow-hidden">
                      <img
                        src={product.mainImage || "/placeholder.svg"}
                        alt={product.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col max-w-62.5">
                      <span className="font-semibold text-sm line-clamp-1">{product.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {product.productFamily || product.categories || "No Category"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground font-mono">{product.itemCode || "---"}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="w-fit text-xs">
                        {Array.isArray(product.brands) ? product.brands.join(", ") : product.brand || "Generic"}
                      </Badge>
                      {/* Shows whichever field is present: websites (new) or website (old) */}
                      <Badge variant="secondary" className="w-fit text-xs">
                        {Array.isArray(product.websites)
                          ? product.websites.join(", ")
                          : Array.isArray(product.website)
                            ? product.website.join(", ")
                            : product.websites || product.website || "N/A"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditClick(product)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(product)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
            <span className="text-sm text-muted-foreground">Rows per page:</span>
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
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            {getPaginationPages().map((p) => (
              <Button key={p} variant={currentPage === p ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(p)} className="w-9">
                {p}
              </Button>
            ))}
            <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)} className="gap-1">
              Next <ChevronRight className="h-4 w-4" />
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
                      {isEditing ? (selectedProduct ? "Edit Product" : "Add Product") : "Shopify Products"}
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

      <DeleteToRecycleBinDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        itemName={deleteTarget?.name ?? ""}
        onConfirm={() => handleSoftDelete(deleteTarget)}
      />

      <DeleteToRecycleBinDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        itemName={`${selectedIds.size} products`}
        confirmText={`${selectedIds.size} products`}
        count={selectedIds.size}
        onConfirm={handleBulkSoftDelete}
      />
    </TooltipProvider>
  );
}