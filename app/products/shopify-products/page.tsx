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
  Clock,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { toast } from "sonner";

import ShopifyAddNewProduct from "@/components/product-forms/shopify-add-new-product-form";
import BulkUploader from "@/components/product-forms/bulk-uploader";
import { DeleteToRecycleBinDialog } from "@/components/deletedialog";
import { NotificationsDropdown } from "@/components/notifications/notifications-dropdown";

// ─── Approval workflow ────────────────────────────────────────────────────────
import { useProductWorkflow } from "@/lib/useProductWorkflow";
import {
  usePendingProducts,
  PendingRowIndicator,
} from "@/components/product-forms/pending-product-badge";

// ─── Inline pending badge ─────────────────────────────────────────────────────
function PendingActionBadge({
  status,
}: {
  status: "update" | "delete" | null;
}) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border
      ${
        status === "delete"
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-amber-50 text-amber-700 border-amber-200"
      }`}
    >
      <Clock className="w-2.5 h-2.5" />
      {status === "delete" ? "Pending Deletion" : "Pending Update"}
    </span>
  );
}

// Shopify product filter
function isShopifyProduct(p: any) {
  const sites: string[] = Array.isArray(p.websites)
    ? p.websites
    : Array.isArray(p.website)
      ? p.website
      : [p.website || ""];
  return sites.some(
    (s) =>
      s?.toLowerCase().includes("shopify") ||
      s?.toLowerCase().includes("shopify"),
  );
}

export default function ShopifyProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [rowsPerPageInput, setRowsPerPageInput] = useState("10");

  const [isEditing, setIsEditing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // ── Approval workflow hooks ────────────────────────────────────────────────
  const { submitProductDelete } = useProductWorkflow();
  const pendingMap = usePendingProducts();

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setProducts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load products");
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!isShopifyProduct(p)) return false;
      const matchesBrand =
        brandFilter === "all" ||
        (Array.isArray(p.brands)
          ? p.brands.includes(brandFilter)
          : p.brand === brandFilter);
      const matchesSearch =
        p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.itemCode?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesBrand && matchesSearch;
    });
  }, [products, brandFilter, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, brandFilter]);

  const shopifyTotal = useMemo(
    () => products.filter(isShopifyProduct).length,
    [products],
  );
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

  // ── Approval-aware delete handlers ────────────────────────────────────────
  const handleSoftDelete = async (product: any) => {
    const t = toast.loading("Processing…");
    try {
      const result = await submitProductDelete({
        product,
        originPage: "/products/shopify-products",
        source: "shopify-products:delete",
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
    const targets = paginatedProducts.filter((p) => selectedIds.has(p.id));
    const t = toast.loading(
      `Submitting delete for ${targets.length} products…`,
    );
    let direct = 0,
      pending = 0,
      errors = 0;

    await Promise.all(
      targets.map(async (product) => {
        try {
          const result = await submitProductDelete({
            product,
            originPage: "/products/shopify-products",
            source: "shopify-products:bulk-delete",
          });
          result.mode === "pending" ? pending++ : direct++;
        } catch {
          errors++;
        }
      }),
    );

    if (errors === 0) {
      const parts = [];
      if (direct > 0) parts.push(`${direct} moved to recycle bin`);
      if (pending > 0) parts.push(`${pending} pending approval`);
      toast.success(parts.join(", "), { id: t });
    } else {
      toast.error(`${errors} error(s). ${direct + pending} succeeded.`, {
        id: t,
      });
    }
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedProducts.length)
      setSelectedIds(new Set());
    else setSelectedIds(new Set(paginatedProducts.map((p) => p.id)));
  };

  const getPaginationPages = () => {
    const pages: number[] = [];
    for (
      let i = Math.max(1, currentPage - 2);
      i <= Math.min(totalPages, currentPage + 2);
      i++
    )
      pages.push(i);
    return pages;
  };

  // ── Edit mode ─────────────────────────────────────────────────────────────
  const renderEditMode = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={handleBackToList} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Shopify Products
        </Button>
      </div>
      <ShopifyAddNewProduct
        editData={selectedProduct}
        onFinished={handleBackToList}
      />
    </div>
  );

  // ── Table mode ────────────────────────────────────────────────────────────
  const renderTableMode = () => (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            {uniqueBrands.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => {
              setSearchQuery("");
              setBrandFilter("all");
            }}
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.size}
            </Button>
          )}
          <Button onClick={handleAddNewClick} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing{" "}
        <span className="font-semibold text-foreground">
          {filteredProducts.length}
        </span>
        {isFiltered && <span> of {shopifyTotal}</span>} Shopify products
      </p>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    selectedIds.size === paginatedProducts.length &&
                    paginatedProducts.length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-14">Image</TableHead>
              <TableHead>Product</TableHead>
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
                    <Package className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No products found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedProducts.map((product) => {
                const pendingStatus = pendingMap.get(product.id) ?? null;
                const isPendingDelete = pendingStatus === "delete";
                const busy = !!pendingStatus;

                return (
                  <TableRow
                    key={product.id}
                    data-state={selectedIds.has(product.id) && "selected"}
                    className={`cursor-pointer hover:bg-muted/40 ${isPendingDelete ? "opacity-60" : ""}`}
                    onClick={() => !busy && handleEditClick(product)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(product.id)}
                        onCheckedChange={() => toggleSelect(product.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="w-10 h-10 bg-muted rounded border overflow-hidden flex items-center justify-center">
                        {product.mainImage ? (
                          <img
                            src={product.mainImage}
                            alt=""
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Package className="h-5 w-5 text-muted-foreground opacity-40" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-sm truncate max-w-[220px]">
                          {product.name || "—"}
                        </span>
                        {pendingStatus && (
                          <PendingActionBadge status={pendingStatus} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-muted-foreground">
                        {product.itemCode || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="w-fit text-xs">
                          {Array.isArray(product.brands)
                            ? product.brands.join(", ")
                            : product.brand || "Generic"}
                        </Badge>
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
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <PendingRowIndicator status={pendingStatus} />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditClick(product)}
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
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(product)}
                              disabled={busy}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            {busy
                              ? "Action pending — cannot delete"
                              : "Delete product"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
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
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            {getPaginationPages().map((p) => (
              <Button
                key={p}
                variant={currentPage === p ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(p)}
                className="w-9"
              >
                {p}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="gap-1"
            >
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
            <div className="flex items-center gap-2 px-4 flex-1">
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
                        : "Shopify Products"}
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
