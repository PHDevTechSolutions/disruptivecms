"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
} from "@/lib/firestore/client";
import {
  Download,
  ChevronDown,
  ChevronRight,
  X,
  FolderOpen,
  Folder,
  Package,
  Loader2,
  FileText,
  Files,
  CheckCircle2,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { generateTdsPdf } from "@/lib/tdsGenerator";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductFamily {
  id: string;
  title: string;
}

interface ProductItem {
  id: string;
  itemDescription: string;
  name?: string;
  litItemCode?: string;
  ecoItemCode?: string;
  itemCode?: string;
  productFamily?: string;
  tdsFileUrl?: string;
  technicalSpecs?: any[];
  mainImage?: string;
  dimensionalDrawingImage?: string;
  recommendedMountingHeightImage?: string;
  driverCompatibilityImage?: string;
  baseImage?: string;
  illuminanceLevelImage?: string;
  wiringDiagramImage?: string;
  installationImage?: string;
  wiringLayoutImage?: string;
  terminalLayoutImage?: string;
  accessoriesImage?: string;
  typeOfPlugImage?: string;
}

interface FolderState {
  [familyId: string]: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBlankCode(v?: string): boolean {
  return !v || v.trim().toUpperCase() === "N/A" || v.trim() === "";
}

function resolvePrimaryCode(product: ProductItem): string {
  return (
    (!isBlankCode(product.litItemCode) ? product.litItemCode : null) ??
    (!isBlankCode(product.ecoItemCode) ? product.ecoItemCode : null) ??
    (!isBlankCode(product.itemCode) ? product.itemCode : null) ??
    product.id
  );
}

function resolveDisplayName(product: ProductItem): string {
  return product.itemDescription || product.name || resolvePrimaryCode(product);
}

// ─── FamilyFolder component ───────────────────────────────────────────────────

function FamilyFolder({
  familyName,
  products,
  isOpen,
  onToggle,
  onRemoveProduct,
  onRemoveFamily,
}: {
  familyName: string;
  products: ProductItem[];
  isOpen: boolean;
  onToggle: () => void;
  onRemoveProduct: (id: string) => void;
  onRemoveFamily: () => void;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          {isOpen ? (
            <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-amber-500 shrink-0" />
          )}
          <span className="text-xs font-semibold uppercase truncate text-left">
            {familyName}
          </span>
          <Badge
            variant="secondary"
            className="text-[9px] font-bold px-1.5 h-4 shrink-0"
          >
            {products.length}
          </Badge>
        </button>
        <button
          type="button"
          onClick={onRemoveFamily}
          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isOpen && (
        <div className="divide-y">
          {products.map((product) => {
            const code = resolvePrimaryCode(product);
            const name = resolveDisplayName(product);
            return (
              <div
                key={product.id}
                className="flex items-center gap-2 px-4 py-2 hover:bg-muted/20 transition-colors"
              >
                <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {code}
                  </p>
                </div>
                {product.tdsFileUrl && (
                  <FileText className="h-3 w-3 text-emerald-500 shrink-0" />
                )}
                <button
                  type="button"
                  onClick={() => onRemoveProduct(product.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BulkDownloadTdsDialog({ open, onOpenChange }: Props) {
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [allProducts, setAllProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [selectedFamilyIds, setSelectedFamilyIds] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const [familyComboOpen, setFamilyComboOpen] = useState(false);
  const [productComboOpen, setProductComboOpen] = useState(false);

  const [folderStates, setFolderStates] = useState<FolderState>({});

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    total: number;
    done: number;
    failed: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const q = query(collection(db, "productfamilies"), orderBy("title"));
    const unsub = onSnapshot(q, (snap) => {
      setFamilies(
        snap.docs.map((d) => ({
          id: d.id,
          title: d.data().title || d.data().name || "Unnamed",
        })),
      );
    });
    return unsub;
  }, [open]);

  useEffect(() => {
    if (!open || selectedFamilyIds.length === 0) {
      setAllProducts([]);
      setLoadingProducts(false);
      return;
    }
    setLoadingProducts(true);
    const familyTitles = selectedFamilyIds
      .map((id) => families.find((f) => f.id === id)?.title)
      .filter(Boolean) as string[];

    if (familyTitles.length === 0) {
      setAllProducts([]);
      setLoadingProducts(false);
      return;
    }

    const q = query(
      collection(db, "products"),
      where("productFamily", "in", familyTitles),
    );
    const unsub = onSnapshot(q, (snap) => {
      setAllProducts(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProductItem),
      );
      setLoadingProducts(false);
    });
    return unsub;
  }, [open, selectedFamilyIds, families]);

  useEffect(() => {
    if (!open) {
      setSelectedFamilyIds([]);
      setSelectedProductIds([]);
      setFolderStates({});
      setDownloadProgress(null);
      setIsDownloading(false);
    }
  }, [open]);

  const familyNameById = useMemo(() => {
    const m = new Map<string, string>();
    families.forEach((f) => m.set(f.id, f.title));
    return m;
  }, [families]);

  const previewGroups = useMemo(() => {
    const groups = new Map<string, ProductItem[]>();
    const productsToShow =
      selectedProductIds.length > 0
        ? allProducts.filter((p) => selectedProductIds.includes(p.id))
        : allProducts;

    productsToShow.forEach((product) => {
      const family = product.productFamily || "Uncategorised";
      if (!groups.has(family)) groups.set(family, []);
      groups.get(family)!.push(product);
    });
    return groups;
  }, [allProducts, selectedProductIds]);

  const totalProductCount = useMemo(() => {
    let count = 0;
    previewGroups.forEach((products) => (count += products.length));
    return count;
  }, [previewGroups]);

  const toggleFamily = (id: string) => {
    setSelectedFamilyIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
    if (selectedFamilyIds.includes(id)) {
      const familyTitle = familyNameById.get(id);
      setSelectedProductIds((prev) => {
        const removedIds = allProducts
          .filter((p) => p.productFamily === familyTitle)
          .map((p) => p.id);
        return prev.filter((pid) => !removedIds.includes(pid));
      });
    }
  };

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const toggleFolder = (family: string) => {
    setFolderStates((prev) => ({ ...prev, [family]: !prev[family] }));
  };

  const removeProductFromPreview = (productId: string) => {
    if (selectedProductIds.length > 0) {
      setSelectedProductIds((prev) => prev.filter((id) => id !== productId));
    } else {
      const otherIds = allProducts
        .map((p) => p.id)
        .filter((id) => id !== productId);
      setSelectedProductIds(otherIds);
    }
  };

  const removeFamilyFromPreview = (familyTitle: string) => {
    const family = families.find((f) => f.title === familyTitle);
    if (family) toggleFamily(family.id);
  };

  const handleDownload = async () => {
    if (totalProductCount === 0) return;
    const productsToDownload: ProductItem[] = [];
    previewGroups.forEach((products) => productsToDownload.push(...products));

    setIsDownloading(true);
    setDownloadProgress({
      total: productsToDownload.length,
      done: 0,
      failed: 0,
    });

    const loadingToast = toast.loading(
      `Preparing ${productsToDownload.length} TDS files…`,
    );

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const familyFolders = new Map<string, any>();

      const getFamilyFolder = (product: ProductItem) => {
        const familyName = (product.productFamily || "Uncategorised")
          .replace(/[/\\:*?"<>|]/g, "-")
          .trim();
        if (!familyFolders.has(familyName)) {
          familyFolders.set(familyName, zip.folder(familyName)!);
        }
        return familyFolders.get(familyName)!;
      };

      const usedFilenames = new Map<string, number>();
      const safeFilename = (product: ProductItem): string => {
        const raw = resolvePrimaryCode(product);
        const sanitized = raw.replace(/[/\\:*?"<>|]/g, "-").trim();
        const base = `${sanitized}_TDS`;
        const count = usedFilenames.get(base) ?? 0;
        usedFilenames.set(base, count + 1);
        return count === 0 ? `${base}.pdf` : `${base}_(${count}).pdf`;
      };

      const generateMissing = async (product: ProductItem): Promise<string> => {
        const technicalSpecs = (product.technicalSpecs ?? [])
          .map((group: any) => ({
            ...group,
            specs: (group.specs ?? []).filter((s: any) => {
              const v = String(s.value ?? "")
                .toUpperCase()
                .trim();
              return v !== "" && v !== "N/A";
            }),
          }))
          .filter((g: any) => g.specs.length > 0);

        if (technicalSpecs.length === 0) throw new Error("No valid specs");

        const blob = await generateTdsPdf({
          itemDescription: resolveDisplayName(product),
          litItemCode: product.litItemCode,
          ecoItemCode: product.ecoItemCode,
          technicalSpecs,
          brand: !isBlankCode(product.litItemCode) ? "LIT" : "ECOSHIFT",
          includeBrandAssets: false,
          mainImageUrl: product.mainImage || undefined,
          dimensionalDrawingUrl: product.dimensionalDrawingImage || undefined,
          recommendedMountingHeightUrl:
            product.recommendedMountingHeightImage || undefined,
          driverCompatibilityUrl: product.driverCompatibilityImage || undefined,
          baseImageUrl: product.baseImage || undefined,
          illuminanceLevelUrl: product.illuminanceLevelImage || undefined,
          wiringDiagramUrl: product.wiringDiagramImage || undefined,
          installationUrl: product.installationImage || undefined,
          wiringLayoutUrl: product.wiringLayoutImage || undefined,
          terminalLayoutUrl: product.terminalLayoutImage || undefined,
          accessoriesImageUrl: product.accessoriesImage || undefined,
          typeOfPlugUrl: product.typeOfPlugImage || undefined,
        });
        return URL.createObjectURL(blob);
      };

      const BATCH = 6;
      let done = 0;
      let failed = 0;

      for (let i = 0; i < productsToDownload.length; i += BATCH) {
        const chunk = productsToDownload.slice(i, i + BATCH);
        await Promise.allSettled(
          chunk.map(async (product) => {
            try {
              let pdfUrl = product.tdsFileUrl;
              let blobUrl: string | null = null;
              if (!pdfUrl) {
                blobUrl = await generateMissing(product);
                pdfUrl = blobUrl;
              }
              const res = await fetch(pdfUrl!);
              const blob = await res.blob();
              const folder = getFamilyFolder(product);
              folder.file(safeFilename(product), blob);
              if (blobUrl) URL.revokeObjectURL(blobUrl);
              done++;
            } catch (err) {
              failed++;
            }
            setDownloadProgress((prev) =>
              prev ? { ...prev, done, failed } : null,
            );
          }),
        );
        toast.loading(
          `Processing ${Math.min(i + BATCH, productsToDownload.length)} / ${productsToDownload.length}…`,
          { id: loadingToast },
        );
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "TDS_Bulk_Download.zip";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${done} TDS files downloaded`, { id: loadingToast });
    } catch (err) {
      toast.error("Failed to create ZIP", { id: loadingToast });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl h-[82vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
              <Download className="h-4 w-4 text-sky-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold leading-tight">
                Bulk Download TDS PDFs
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select product families and/or products.
              </p>
            </div>
            {totalProductCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-auto text-[10px] font-bold uppercase px-2.5 h-6 shrink-0"
              >
                {totalProductCount} products selected
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* LEFT COLUMN */}
          <div className="w-96 shrink-0 border-r flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/30 shrink-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Selection Controls
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Product Families Combobox */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Product Families *
                </label>
                <Popover
                  open={familyComboOpen}
                  onOpenChange={setFamilyComboOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between h-10 text-xs font-medium"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Folder className="h-3.5 w-3.5 opacity-60 shrink-0" />
                        {selectedFamilyIds.length > 0
                          ? `${selectedFamilyIds.length} families selected`
                          : "Select families…"}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput
                        placeholder="Search families…"
                        className="h-9 text-xs"
                      />
                      {/* FIX: added onWheel and specific max-h classes to ensure scrolling works in modal */}
                      <CommandList
                        className="max-h-62.5 overflow-y-auto overflow-x-hidden"
                        onWheel={(e) => e.stopPropagation()}
                      >
                        <CommandEmpty>No families found.</CommandEmpty>
                        <CommandGroup>
                          {families.map((f) => (
                            <CommandItem
                              key={f.id}
                              onSelect={() => {
                                toggleFamily(f.id);
                                setFamilyComboOpen(false);
                              }}
                              className="text-xs font-medium cursor-pointer"
                            >
                              <div
                                className={cn(
                                  "mr-2 h-3.5 w-3.5 border rounded flex items-center justify-center shrink-0",
                                  selectedFamilyIds.includes(f.id)
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-foreground/20",
                                )}
                              >
                                {selectedFamilyIds.includes(f.id) && (
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                )}
                              </div>
                              {f.title}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {selectedFamilyIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedFamilyIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary"
                      >
                        {familyNameById.get(id) || id}
                        <button
                          type="button"
                          onClick={() => toggleFamily(id)}
                          className="hover:text-destructive"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Specific Products Combobox */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Specific Products (optional)
                </label>
                {selectedFamilyIds.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                    Select a family first
                  </div>
                ) : loadingProducts ? (
                  <div className="flex items-center gap-2 px-3 py-2 border rounded-lg text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : (
                  <>
                    <Popover
                      open={productComboOpen}
                      onOpenChange={setProductComboOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-between h-10 text-xs font-medium"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <Package className="h-3.5 w-3.5 opacity-60 shrink-0" />
                            {selectedProductIds.length > 0
                              ? `${selectedProductIds.length} selected`
                              : `All ${allProducts.length} included`}
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[--radix-popover-trigger-width] p-0"
                        align="start"
                      >
                        <Command>
                          <CommandInput
                            placeholder="Search products…"
                            className="h-9 text-xs"
                          />
                          {/* FIX: added onWheel and specific max-h classes to ensure scrolling works in modal */}
                          <CommandList
                            className="max-h-75 overflow-y-auto overflow-x-hidden"
                            onWheel={(e) => e.stopPropagation()}
                          >
                            <CommandEmpty>No products found.</CommandEmpty>
                            <CommandGroup>
                              {allProducts.map((p) => (
                                <CommandItem
                                  key={p.id}
                                  value={`${resolveDisplayName(p)} ${resolvePrimaryCode(p)}`}
                                  onSelect={() => toggleProduct(p.id)}
                                  className="text-xs cursor-pointer"
                                >
                                  <div
                                    className={cn(
                                      "mr-2 h-3.5 w-3.5 border rounded flex items-center justify-center shrink-0",
                                      selectedProductIds.includes(p.id)
                                        ? "bg-primary border-primary text-primary-foreground"
                                        : "border-foreground/20",
                                    )}
                                  >
                                    {selectedProductIds.includes(p.id) && (
                                      <CheckCircle2 className="h-2.5 w-2.5" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="truncate font-medium">
                                      {resolveDisplayName(p)}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground font-mono">
                                      {resolvePrimaryCode(p)}
                                    </p>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {selectedProductIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedProductIds([])}
                        className="text-[10px] text-muted-foreground hover:text-destructive font-semibold"
                      >
                        Clear selection
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: PREVIEW */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/30 shrink-0 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Files className="h-3 w-3" /> Selection Preview
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {totalProductCount === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center">
                  <Folder className="h-10 w-10 opacity-20 mb-2" />
                  <p className="text-sm font-medium">No products selected</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {Array.from(previewGroups.entries()).map(
                    ([familyName, products]) => (
                      <FamilyFolder
                        key={familyName}
                        familyName={familyName}
                        products={products}
                        isOpen={folderStates[familyName] !== false}
                        onToggle={() => toggleFolder(familyName)}
                        onRemoveProduct={removeProductFromPreview}
                        onRemoveFamily={() =>
                          removeFamilyFromPreview(familyName)
                        }
                      />
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t px-6 py-3 flex justify-between items-center shrink-0 bg-muted/20">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isDownloading}
            className="text-xs h-9"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDownload}
            disabled={totalProductCount === 0 || isDownloading}
            className="h-9 text-xs font-semibold gap-2 px-5 bg-sky-600 hover:bg-sky-700 text-white"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {isDownloading
              ? "Downloading…"
              : `Download ${totalProductCount} TDS ZIP`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
