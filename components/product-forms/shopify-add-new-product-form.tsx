"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
} from "@/lib/firestore/client";
import {
  ImagePlus,
  X,
  Loader2,
  AlignLeft,
  Tag,
  LayoutGrid,
  Zap,
  Plus,
  Images,
  Eye,
  EyeOff,
  ChevronsUpDown,
  Check,
  Sun,
  Info,
  Clock,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/logger";
import { uploadToCloudinary } from "@/lib/cloudinary";
import {
  CreateProductFamilyDialog,
  type CreatedFamily,
} from "./CreateProductFamilyDialog";

// ── RBAC & approval workflow ──────────────────────────────────────────────────
import { useProductWorkflow } from "@/lib/useProductWorkflow";
import { useAuth } from "@/lib/useAuth";
import { hasAccess } from "@/lib/rbac";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MasterItem {
  id: string;
  name: string;
  websites: string[];
  productUsage?: string[];
  isTemp?: boolean;
}

interface SpecItem {
  id: string;
  label: string;
  specGroup: string;
  specGroupId: string;
}

interface PendingItem {
  type: "brand" | "category" | "application";
  name: string;
  collection: string;
  field: string;
}

interface SpecValue {
  specGroup: string;
  specs: { name: string; value: string }[];
}

const DEFAULT_WEBSITE = "Shopify";
const SELECTED_WEBS = [DEFAULT_WEBSITE];

const PRODUCT_USAGE_OPTIONS = ["INDOOR", "OUTDOOR", "SOLAR"] as const;
type ProductUsage = (typeof PRODUCT_USAGE_OPTIONS)[number];

const USAGE_COLORS: Record<ProductUsage, { pill: string; active: string }> = {
  INDOOR: {
    pill: "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400",
    active: "border-blue-500 bg-blue-500 text-white",
  },
  OUTDOOR: {
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400",
    active: "border-emerald-500 bg-emerald-500 text-white",
  },
  SOLAR: {
    pill: "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400",
    active: "border-amber-400 bg-amber-400 text-white",
  },
};

const STATUS_OPTIONS = [
  {
    value: "public" as const,
    label: "Public",
    desc: "Visible on website immediately",
    icon: <Eye className="w-4 h-4" />,
    color: "text-emerald-600",
    activeBg: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    value: "draft" as const,
    label: "Draft",
    desc: "Hidden, review before publishing",
    icon: <EyeOff className="w-4 h-4" />,
    color: "text-amber-600",
    activeBg: "border-amber-500 bg-amber-50 dark:bg-amber-950/30",
  },
];

// ─── Approval banner ──────────────────────────────────────────────────────────

function ApprovalRequiredBanner({ productName }: { productName?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:bg-amber-950/20 dark:border-amber-900">
      <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
          Approval Required
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {productName
            ? `Changes to "${productName}" will`
            : "Your changes will"}{" "}
          be submitted for review. A PD Manager or Admin must approve before
          changes go live.
        </p>
      </div>
    </div>
  );
}

// ─── Gallery preview ──────────────────────────────────────────────────────────

function GalleryPreviewItem({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="aspect-square relative border rounded-md overflow-hidden shadow-sm group">
      <img src={src} className="object-cover w-full h-full" alt="gallery" />
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── QR code dropzone ─────────────────────────────────────────────────────────

function QrDropzone({
  file,
  preview,
  existingUrl,
  onDrop,
  onRemove,
}: {
  file: File | null;
  preview: string;
  existingUrl: string;
  onDrop: (files: File[]) => void;
  onRemove: () => void;
}) {
  const { getRootProps, getInputProps } = useDropzone({ onDrop, maxFiles: 1 });
  return (
    <div
      {...getRootProps()}
      className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-40 flex flex-col items-center justify-center"
    >
      <input {...getInputProps()} />
      {preview || existingUrl ? (
        <div className="relative w-full h-full group">
          <img
            src={preview || existingUrl}
            className="w-full h-full object-contain rounded"
            alt="QR"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg z-10"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <Zap className="h-8 w-8 mb-2 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">QR Code</p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ShopifyAddNewProduct({
  editData,
  onFinished,
}: {
  editData?: any;
  onFinished?: () => void;
}) {
  // ── Auth & RBAC ──────────────────────────────────────────────────────────
  const { user } = useAuth();
  const { submitProductUpdate } = useProductWorkflow();

  // canDirectWrite = true  → verify:products | verify:* | superadmin
  // canDirectWrite = false → write:products only → must go through approval
  const canDirectWrite = hasAccess(user, "verify", "products");
  const isEditMode = !!editData?.id;

  const [isPublishing, setIsPublishing] = useState(false);
  const [createFamilyOpen, setCreateFamilyOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);

  // Form state
  const [productName, setProductName] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [regPrice, setRegPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [status, setStatus] = useState<"draft" | "public" | "">(
    editData?.status || "",
  );
  const [productUsage, setProductUsage] = useState<string[]>(
    editData?.productUsage || [],
  );

  // Master data
  const [availableSpecs, setAvailableSpecs] = useState<SpecItem[]>([]);
  const [specsLoading, setSpecsLoading] = useState(false);
  const [availableCats, setAvailableCats] = useState<MasterItem[]>([]);
  const [availableBrands, setAvailableBrands] = useState<MasterItem[]>([]);
  const [availableApps, setAvailableApps] = useState<MasterItem[]>([]);
  const pendingItemsRef = useRef<PendingItem[]>([]);

  // Selections
  const [selectedCatId, setSelectedCatId] = useState("");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [specValues, setSpecValues] = useState<Record<string, string>>({});

  // Images
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [qrImage, setQrImage] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState("");
  const [existingMainImage, setExistingMainImage] = useState("");
  const [existingGalleryImages, setExistingGalleryImages] = useState<string[]>(
    [],
  );
  const [existingQrImage, setExistingQrImage] = useState("");

  const filteredCats = useMemo(() => {
    if (productUsage.length === 0) return availableCats;
    return availableCats.filter((cat) => {
      if (cat.isTemp) return true;
      const u: string[] = cat.productUsage ?? [];
      return u.length === 0 || productUsage.some((x) => u.includes(x));
    });
  }, [availableCats, productUsage]);

  // ── Master data listeners ────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      onSnapshot(
        query(
          collection(db, "brands"),
          where("websites", "array-contains", DEFAULT_WEBSITE),
          orderBy("name"),
        ),
        (s) =>
          setAvailableBrands(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as MasterItem),
          ),
      ),
      onSnapshot(
        query(
          collection(db, "applications"),
          where("websites", "array-contains", DEFAULT_WEBSITE),
          orderBy("name"),
        ),
        (s) =>
          setAvailableApps(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as MasterItem),
          ),
      ),
      onSnapshot(
        query(collection(db, "productfamilies"), orderBy("title")),
        (s) =>
          setAvailableCats(
            s.docs.map((d) => ({
              id: d.id,
              name: d.data().title || d.data().name || "",
              websites: d.data().websites || [],
              productUsage: d.data().productUsage || [],
            })),
          ),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // ── Spec listener ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedCatId) {
      setAvailableSpecs([]);
      return;
    }
    setSpecsLoading(true);
    const unsub = onSnapshot(
      collection(db, "productfamilies", selectedCatId, "specs"),
      (snap) => {
        const specs: SpecItem[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          (data.items || []).forEach((item: any) => {
            specs.push({
              id: `${d.id}-${item.label}`,
              label: item.label || item.name || "",
              specGroup: data.name || d.id,
              specGroupId: d.id,
            });
          });
        });
        setAvailableSpecs(specs);
        setSpecsLoading(false);
      },
    );
    return () => {
      unsub();
      setSpecsLoading(false);
    };
  }, [selectedCatId]);

  // ── Load edit data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!editData) return;
    setProductName(editData.name || "");
    setShortDesc(editData.shortDescription || "");
    setItemCode(editData.itemCode || "");
    setRegPrice(editData.regularPrice?.toString() || "");
    setSalePrice(editData.salePrice?.toString() || "");
    setStatus(editData.status || "");
    setSelectedBrands(editData.brand ? [editData.brand] : []);
    setSelectedApps(editData.applications || []);
    setProductUsage(editData.productUsage || []);
    setExistingMainImage(editData.mainImage || "");
    setExistingGalleryImages(editData.galleryImages || []);
    setExistingQrImage(editData.qrCodeImage || "");
    setMainImage(null);
    setQrImage(null);
    setQrPreview("");
    setGalleryImages([]);
  }, [editData]);

  useEffect(() => {
    if (!editData?.technicalSpecs || availableSpecs.length === 0) return;
    const values: Record<string, string> = {};
    editData.technicalSpecs.forEach((group: SpecValue) => {
      group.specs.forEach((spec) => {
        let si = availableSpecs.find(
          (s) => s.label === spec.name && s.specGroup === group.specGroup,
        );
        if (!si) si = availableSpecs.find((s) => s.label === spec.name);
        if (si) values[`${si.specGroupId}-${si.label}`] = spec.value;
      });
    });
    setSpecValues(values);
  }, [editData, availableSpecs]);

  useEffect(() => {
    if (!editData || !availableCats.length || selectedCatId) return;
    const m = editData.productFamily
      ? availableCats.find((c) => c.name === editData.productFamily)
      : editData.category
        ? availableCats.find((c) => c.id === editData.category)
        : null;
    if (m) setSelectedCatId(m.id);
  }, [editData, availableCats]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAddItem = (
    type: PendingItem["type"],
    name: string,
    collectionName: string,
    field: string,
  ) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const list = type === "brand" ? availableBrands : availableApps;
    if (list.some((i) => i.name.toLowerCase() === cleanName.toLowerCase())) {
      toast.error(`"${cleanName}" already exists.`);
      return;
    }
    pendingItemsRef.current.push({
      type,
      name: cleanName,
      collection: collectionName,
      field,
    });
    const newItem: MasterItem = {
      id: `temp-${cleanName}`,
      name: cleanName,
      websites: SELECTED_WEBS,
      isTemp: true,
    };
    if (type === "brand") {
      setAvailableBrands((p) => [...p, newItem]);
      setSelectedBrands((p) => [...p, `temp-${cleanName}`]);
    } else {
      setAvailableApps((p) => [...p, newItem]);
      setSelectedApps((p) => [...p, `temp-${cleanName}`]);
    }
  };

  const handlePublish = async () => {
    if (!productName) return toast.error("Please enter a product name!");
    if (!status) return toast.error("Please select a product status.");

    setIsPublishing(true);
    const publishToast = toast.loading(
      isEditMode && !canDirectWrite
        ? "Submitting update request…"
        : "Validating...",
    );

    try {
      // Duplicate check
      if (!editData || editData.name !== productName) {
        const dup = await getDocs(
          query(collection(db, "products"), where("name", "==", productName)),
        );
        if (
          dup.docs.some((d) => {
            if (d.id === editData?.id) return false;
            return (d.data().websites || d.data().website || []).some(
              (w: string) => SELECTED_WEBS.includes(w),
            );
          })
        ) {
          toast.dismiss(publishToast);
          toast.error("This product name already exists on Shopify.");
          setIsPublishing(false);
          return;
        }
      }

      // Persist pending tags
      const pendingIdMap: Record<string, string> = {};
      for (const item of pendingItemsRef.current) {
        const p: any = {
          websites: SELECTED_WEBS,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        p[item.field] = item.name;
        if (item.type === "application") {
          p.isActive = true;
          p.imageUrl = "";
          p.description = "";
        }
        const ref = await addDoc(collection(db, item.collection), p);
        pendingIdMap[`temp-${item.name}`] = ref.id;
      }
      pendingItemsRef.current = [];

      // Upload images
      toast.loading("Uploading images...", { id: publishToast });
      const mainUrl = mainImage
        ? await uploadToCloudinary(mainImage)
        : existingMainImage;
      const qrUrl = qrImage
        ? await uploadToCloudinary(qrImage)
        : existingQrImage;
      const uploadedGallery = await Promise.all(
        galleryImages.map(uploadToCloudinary),
      );

      // Build specs
      const specsGrouped: Record<string, { name: string; value: string }[]> =
        {};
      Object.entries(specValues).forEach(([key, value]) => {
        if (!value.trim()) return;
        const si = availableSpecs.find(
          (s) =>
            `${s.specGroupId}-${s.label}` === key ||
            `${s.specGroup}-${s.label}` === key,
        );
        if (si) {
          if (!specsGrouped[si.specGroup]) specsGrouped[si.specGroup] = [];
          specsGrouped[si.specGroup].push({ name: si.label, value });
        }
      });
      const technicalSpecs = Object.entries(specsGrouped).map(
        ([specGroup, specs]) => ({ specGroup, specs }),
      );

      const resolveAppIds = (ids: string[]) =>
        ids.map((id) => pendingIdMap[id] || id);
      const productFamilyTitle = selectedCatId
        ? availableCats.find((c) => c.id === selectedCatId)?.name || ""
        : "";
      const clean = (v: any, fallback: any = "") =>
        v === undefined || v === null ? fallback : v;

      const payload = {
        name: clean(productName),
        shortDescription: clean(shortDesc),
        itemCode: clean(itemCode),
        regularPrice: Number(regPrice) || 0,
        salePrice: Number(salePrice) || 0,
        technicalSpecs,
        mainImage: clean(mainUrl),
        qrCodeImage: clean(qrUrl),
        galleryImages: [...existingGalleryImages, ...uploadedGallery].filter(
          Boolean,
        ),
        websites: SELECTED_WEBS,
        productFamily: clean(productFamilyTitle),
        brand: selectedBrands[0]
          ? clean(availableBrands.find((b) => b.id === selectedBrands[0])?.name)
          : "",
        applications: resolveAppIds(selectedApps),
        productUsage,
        status,
        updatedAt: serverTimestamp(),
      };

      if (editData?.id) {
        // ── RBAC-gated edit path ─────────────────────────────────────────────
        // submitProductUpdate checks canVerify() internally:
        //   canVerify() = true  → updateDoc directly + auto-approved audit
        //   canVerify() = false → creates pending request, NO direct write
        const result = await submitProductUpdate({
          productId: editData.id,
          before: editData,
          after: payload,
          productName: productName || editData.name || editData.id,
          source: "shopify-add-new-product-form",
          page: "/products/shopify-products",
        });

        toast.success(
          result.mode === "pending"
            ? "Update submitted for approval"
            : "Product Saved Successfully!",
          {
            id: publishToast,
            description:
              result.mode === "pending"
                ? "A PD Manager or Admin will review your changes before they go live."
                : undefined,
          },
        );
        if (onFinished) onFinished();
      } else {
        // ── New product — always direct ──────────────────────────────────────
        const docRef = await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await logAuditEvent({
          action: "create",
          entityType: "product",
          entityId: docRef.id,
          entityName: productName,
          context: {
            page: "/products/shopify-products",
            source: "shopify-add-new-product-form",
            collection: "products",
          },
        });
        toast.success("Product Saved Successfully!", { id: publishToast });
        if (onFinished) onFinished();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error saving product", { id: publishToast });
    } finally {
      setIsPublishing(false);
    }
  };

  const onDropMain = useCallback((files: File[]) => {
    if (files[0]) setMainImage(files[0]);
  }, []);
  const { getRootProps: getMainRoot, getInputProps: getMainInput } =
    useDropzone({ onDrop: onDropMain, maxFiles: 1 });
  const onDropGallery = useCallback(
    (files: File[]) => setGalleryImages((p) => [...p, ...files]),
    [],
  );
  const { getRootProps: getGalleryRoot, getInputProps: getGalleryInput } =
    useDropzone({ onDrop: onDropGallery });
  const onDropQr = useCallback((files: File[]) => {
    if (files[0]) {
      setQrImage(files[0]);
      setQrPreview(URL.createObjectURL(files[0]));
    }
  }, []);

  const groupedSpecs = availableSpecs.reduce(
    (acc, s) => {
      if (!acc[s.specGroup]) acc[s.specGroup] = [];
      acc[s.specGroup].push(s);
      return acc;
    },
    {} as Record<string, SpecItem[]>,
  );

  const toggleUsage = (u: string) =>
    setProductUsage((p) =>
      p.includes(u) ? p.filter((v) => v !== u) : [...p, u],
    );

  const submitLabel = isEditMode
    ? canDirectWrite
      ? "Update Product"
      : "Submit for Approval"
    : "Publish Product";

  return (
    <>
      <CreateProductFamilyDialog
        open={createFamilyOpen}
        onOpenChange={setCreateFamilyOpen}
        onCreated={(family: CreatedFamily) => {
          setAvailableCats((p) =>
            p.some((c) => c.id === family.id)
              ? p
              : [
                  {
                    id: family.id,
                    name: family.name,
                    websites: [],
                    productUsage: family.productUsage ?? [],
                  },
                  ...p,
                ],
          );
          setSelectedCatId(family.id);
          setCatOpen(false);
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 min-h-screen">
        <div className="md:col-span-2 space-y-6">
          {/* Approval banner for non-privileged users editing */}
          {isEditMode && !canDirectWrite && (
            <ApprovalRequiredBanner
              productName={productName || editData?.name}
            />
          )}

          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Eye className="h-4 w-4" />
                Product Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {STATUS_OPTIONS.map((opt) => {
                  const active = status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all ${active ? `${opt.activeBg} ${opt.color} border-current font-semibold` : "border-border hover:border-muted-foreground/30 hover:bg-muted/40 text-muted-foreground"}`}
                    >
                      <span
                        className={active ? opt.color : "text-muted-foreground"}
                      >
                        {opt.icon}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs opacity-70">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Product info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <AlignLeft className="h-4 w-4" />
                Product Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Product Name *</Label>
                <Input
                  placeholder="Enter product name"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Short Description</Label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Brief description"
                  value={shortDesc}
                  onChange={(e) => setShortDesc(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Item Code / SKU</Label>
                <Input
                  placeholder="e.g. SHOP-001"
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Regular Price</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={regPrice}
                    onChange={(e) => setRegPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sale Price</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Product usage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Sun className="h-4 w-4" />
                Product Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_USAGE_OPTIONS.map((u) => {
                  const c = USAGE_COLORS[u];
                  const active = productUsage.includes(u);
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => toggleUsage(u)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${active ? c.active : c.pill}`}
                    >
                      {u}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Product family */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <LayoutGrid className="h-4 w-4" />
                Product Family
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Popover open={catOpen} onOpenChange={setCatOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={catOpen}
                    className="w-full justify-between"
                  >
                    {selectedCatId
                      ? availableCats.find((c) => c.id === selectedCatId)
                          ?.name || "Select family…"
                      : "Select family…"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search families..." />
                    <CommandList>
                      <CommandEmpty>No families found.</CommandEmpty>
                      <CommandGroup>
                        {filteredCats.map((cat) => (
                          <CommandItem
                            key={cat.id}
                            value={cat.name}
                            onSelect={() => {
                              setSelectedCatId(cat.id);
                              setCatOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCatId === cat.id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            {cat.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>

          {/* Technical specs */}
          {selectedCatId && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Info className="h-4 w-4" />
                  Technical Specifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                {specsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : Object.keys(groupedSpecs).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No specifications for this family.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(groupedSpecs).map(([groupName, items]) => (
                      <div key={groupName}>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                          {groupName}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {items.map((spec) => {
                            const key = `${spec.specGroupId}-${spec.label}`;
                            return (
                              <div key={key} className="space-y-1">
                                <Label className="text-xs">{spec.label}</Label>
                                <Input
                                  placeholder={`Enter ${spec.label}...`}
                                  value={specValues[key] || ""}
                                  onChange={(e) =>
                                    setSpecValues((p) => ({
                                      ...p,
                                      [key]: e.target.value,
                                    }))
                                  }
                                  className="h-8 text-xs"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <ImagePlus className="h-4 w-4" />
                Product Images
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Main image */}
              <div>
                <Label className="text-xs mb-2 block">Main Image</Label>
                <div
                  {...getMainRoot()}
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-accent/50 transition-all"
                >
                  <input {...getMainInput()} />
                  {mainImage ? (
                    <div className="relative">
                      <img
                        src={URL.createObjectURL(mainImage)}
                        alt="Main"
                        className="w-full h-32 object-contain rounded"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMainImage(null);
                        }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : existingMainImage ? (
                    <div className="relative">
                      <img
                        src={existingMainImage}
                        alt="Existing"
                        className="w-full h-32 object-contain rounded"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExistingMainImage("");
                        }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <ImagePlus className="h-8 w-8 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        Drop main image here
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* QR */}
              <div>
                <Label className="text-xs mb-2 block">QR Code</Label>
                <QrDropzone
                  file={qrImage}
                  preview={qrPreview}
                  existingUrl={existingQrImage}
                  onDrop={onDropQr}
                  onRemove={() => {
                    setQrImage(null);
                    setQrPreview("");
                    setExistingQrImage("");
                  }}
                />
              </div>

              {/* Gallery */}
              <div>
                <Label className="text-xs mb-2 flex items-center gap-1">
                  <Images className="h-3 w-3" /> Gallery
                </Label>
                <div
                  {...getGalleryRoot()}
                  className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:bg-accent/50 transition-all"
                >
                  <input {...getGalleryInput()} />
                  <p className="text-xs text-muted-foreground">
                    Drop gallery images here
                  </p>
                </div>
                {(existingGalleryImages.length > 0 ||
                  galleryImages.length > 0) && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {existingGalleryImages.map((url, i) => (
                      <div
                        key={i}
                        className="aspect-square relative border rounded-md overflow-hidden group"
                      >
                        <img
                          src={url}
                          className="object-cover w-full h-full"
                          alt={`g${i}`}
                        />
                        <button
                          onClick={() =>
                            setExistingGalleryImages((p) =>
                              p.filter((_, idx) => idx !== i),
                            )
                          }
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {galleryImages.map((file, i) => (
                      <GalleryPreviewItem
                        key={i}
                        file={file}
                        onRemove={() =>
                          setGalleryImages((p) =>
                            p.filter((_, idx) => idx !== i),
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="space-y-3">
            <Button
              className={`w-full ${isEditMode && !canDirectWrite ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
              onClick={handlePublish}
              disabled={isPublishing}
            >
              {isPublishing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditMode && !canDirectWrite
                    ? "Submitting Request…"
                    : "Publishing..."}
                </>
              ) : (
                <>
                  {isEditMode && !canDirectWrite && (
                    <Clock className="mr-2 h-4 w-4" />
                  )}
                  {submitLabel}
                </>
              )}
            </Button>
            {isEditMode && !canDirectWrite && (
              <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
                Your changes will be reviewed by a PD Manager or Admin before
                they go live.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
