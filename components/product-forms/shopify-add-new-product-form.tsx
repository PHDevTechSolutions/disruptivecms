"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  onSnapshot,
  updateDoc,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
} from "firebase/firestore";
import {
  ImagePlus,
  X,
  Loader2,
  AlignLeft,
  Tag,
  Factory,
  LayoutGrid,
  Zap,
  Plus,
  Images,
  Eye,
  EyeOff,
} from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/logger";
import { uploadToCloudinary } from "@/lib/cloudinary";

// --- TYPES ---
interface MasterItem {
  id: string;
  name: string;
  websites: string[];
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

function mergeWithPending(
  prev: MasterItem[],
  snap: any,
  type: string,
  fieldKey: string,
  pendingItems: PendingItem[],
): MasterItem[] {
  const dbItems: MasterItem[] = snap.docs.map((d: any) => {
    const raw = d.data();
    return {
      id: d.id,
      name: raw[fieldKey] || raw.name || "Unnamed",
      websites: raw.websites || [],
    };
  });

  const currentPending: MasterItem[] = pendingItems
    .filter((p) => p.type === type)
    .map((p) => ({
      id: `temp-${p.name}`,
      name: p.name,
      websites: SELECTED_WEBS,
      isTemp: true,
    }));

  return [...dbItems, ...currentPending];
}

// --- GALLERY PREVIEW ITEM (stable object URL per file) ---
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
      <img src={src} className="object-cover w-full h-full" alt="New gallery" />
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function ShopifyAddNewProduct({
  editData,
  onFinished,
}: {
  editData?: any;
  onFinished?: () => void;
}) {
  const [isPublishing, setIsPublishing] = useState(false);

  // FORM STATE
  const [productName, setProductName] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [regPrice, setRegPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");

  // STATUS
  const [status, setStatus] = useState<"draft" | "public" | "">(
    editData?.status || "",
  );

  // MASTER DATA STATE
  const [availableSpecs, setAvailableSpecs] = useState<SpecItem[]>([]);
  const [specsLoading, setSpecsLoading] = useState(false);
  const [availableCats, setAvailableCats] = useState<MasterItem[]>([]);
  const [availableBrands, setAvailableBrands] = useState<MasterItem[]>([]);
  const [availableApps, setAvailableApps] = useState<MasterItem[]>([]);

  const pendingItemsRef = useRef<PendingItem[]>([]);

  // SELECTIONS
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);

  const [specValues, setSpecValues] = useState<Record<string, string>>({});

  // IMAGES — new files
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [qrImage, setQrImage] = useState<File | null>(null);

  // IMAGES — existing URLs (edit mode)
  const [existingMainImage, setExistingMainImage] = useState("");
  const [existingGalleryImages, setExistingGalleryImages] = useState<string[]>(
    [],
  );
  const [existingQrImage, setExistingQrImage] = useState("");

  // STABLE PREVIEW URLs (generated once per file, revoked on change)
  const [mainImagePreview, setMainImagePreview] = useState<string>("");
  const [qrImagePreview, setQrImagePreview] = useState<string>("");

  // --- STABLE PREVIEW URL EFFECTS ---
  useEffect(() => {
    if (!mainImage) {
      setMainImagePreview("");
      return;
    }
    const url = URL.createObjectURL(mainImage);
    setMainImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [mainImage]);

  useEffect(() => {
    if (!qrImage) {
      setQrImagePreview("");
      return;
    }
    const url = URL.createObjectURL(qrImage);
    setQrImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [qrImage]);

  // --- 1. FETCH MASTER DATA ---
  useEffect(() => {
    const qFilter = where("websites", "array-contains-any", SELECTED_WEBS);

    const unsubCats = onSnapshot(
      query(collection(db, "productfamilies"), qFilter),
      (snap) => {
        setAvailableCats((prev) =>
          mergeWithPending(
            prev,
            snap,
            "category",
            "title",
            pendingItemsRef.current,
          ),
        );
      },
    );

    const unsubBrands = onSnapshot(
      query(collection(db, "brand_name"), qFilter),
      (snap) => {
        setAvailableBrands((prev) =>
          mergeWithPending(
            prev,
            snap,
            "brand",
            "title",
            pendingItemsRef.current,
          ),
        );
      },
    );

    const unsubApps = onSnapshot(
      query(
        collection(db, "applications"),
        where("isActive", "==", true),
        orderBy("createdAt", "asc"),
      ),
      (snap) => {
        setAvailableApps((prev) =>
          mergeWithPending(
            prev,
            snap,
            "applications",
            "title",
            pendingItemsRef.current,
          ),
        );
      },
    );

    return () => {
      unsubCats();
      unsubBrands();
      unsubApps();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- FETCH SPECS BASED ON SELECTED CATEGORIES ---
  useEffect(() => {
    if (selectedCats.length === 0) {
      setAvailableSpecs([]);
      setSpecsLoading(false);
      return;
    }

    setSpecsLoading(true);
    const unsubscribers: Array<() => void> = [];

    const fetchCategorySpecs = async () => {
      try {
        const specIdsFromCategories = new Set<string>();

        for (const catId of selectedCats) {
          const catDoc = await getDoc(doc(db, "productfamilies", catId));
          if (catDoc.exists()) {
            const catData = catDoc.data();
            if (
              catData.specifications &&
              Array.isArray(catData.specifications)
            ) {
              catData.specifications.forEach((specId: string) => {
                specIdsFromCategories.add(specId);
              });
            }
          }
        }

        if (specIdsFromCategories.size === 0) {
          setAvailableSpecs([]);
          setSpecsLoading(false);
          return;
        }

        const unsubSpecs = onSnapshot(collection(db, "specs"), (specsSnap) => {
          const allSpecItems: SpecItem[] = [];

          specsSnap.docs
            .filter((doc) => specIdsFromCategories.has(doc.id))
            .forEach((doc) => {
              const data = doc.data();
              const specGroupName = data.name || "Unnamed Group";
              const specGroupId = doc.id;

              if (data.items && Array.isArray(data.items)) {
                data.items.forEach((item: any) => {
                  if (item.label) {
                    allSpecItems.push({
                      id: `${specGroupId}-${item.label}`,
                      label: item.label,
                      specGroup: specGroupName,
                      specGroupId: specGroupId,
                    });
                  }
                });
              }
            });

          setAvailableSpecs(allSpecItems);
          setSpecsLoading(false);
        });

        unsubscribers.push(unsubSpecs);
      } catch (error) {
        console.error("[shopify] Error fetching specs:", error);
        setAvailableSpecs([]);
        setSpecsLoading(false);
      }
    };

    fetchCategorySpecs();

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      setSpecsLoading(false);
    };
  }, [selectedCats]);

  // --- 2. LOAD EDIT DATA ---
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
    setExistingMainImage(editData.mainImage || "");
    setExistingGalleryImages(editData.galleryImages || []);
    setExistingQrImage(editData.qrCodeImage || "");

    // Reset any previously dropped new files when loading a different product
    setMainImage(null);
    setQrImage(null);
    setGalleryImages([]);
  }, [editData]);

  useEffect(() => {
    if (!editData || !editData.technicalSpecs || availableSpecs.length === 0)
      return;

    const values: Record<string, string> = {};

    editData.technicalSpecs.forEach((group: SpecValue) => {
      group.specs.forEach((spec: { name: string; value: string }) => {
        // Primary match: label + group name (works when name unchanged)
        let specItem = availableSpecs.find(
          (s) => s.label === spec.name && s.specGroup === group.specGroup,
        );
        // Fallback: label only — handles renamed spec groups.
        // specGroupId is stable even when the display name changes.
        if (!specItem) {
          specItem = availableSpecs.find((s) => s.label === spec.name);
        }

        if (specItem) {
          const key = `${specItem.specGroupId}-${specItem.label}`;
          values[key] = spec.value;
        }
      });
    });

    setSpecValues(values);
  }, [editData, availableSpecs]);

  // --- 3. LOAD PRODUCT FAMILY AFTER CATEGORIES ARE FETCHED ---
  useEffect(() => {
    if (editData && availableCats.length > 0) {
      if (editData.productFamily) {
        const matchingCat = availableCats.find(
          (cat) => cat.name === editData.productFamily,
        );
        if (matchingCat) setSelectedCats([matchingCat.id]);
      } else if (editData.category) {
        setSelectedCats([editData.category]);
      }
    }
  }, [editData, availableCats]);

  // --- 4. HANDLERS ---

  const handleAddItem = (
    type: PendingItem["type"],
    name: string,
    collectionName: string,
    dbField: string,
  ) => {
    if (!name.trim()) return;
    const cleanName = name.trim();

    let listToCheck: MasterItem[] = [];
    if (type === "brand") listToCheck = availableBrands;
    if (type === "category") listToCheck = availableCats;
    if (type === "application") listToCheck = availableApps;

    const exists = listToCheck.some(
      (item) => item.name.toLowerCase() === cleanName.toLowerCase(),
    );

    if (exists) {
      toast.error(`"${cleanName}" already exists in ${type}s.`);
      return;
    }

    pendingItemsRef.current.push({
      type,
      name: cleanName,
      collection: collectionName,
      field: dbField,
    });

    const newItem: MasterItem = {
      id: `temp-${cleanName}`,
      name: cleanName,
      websites: SELECTED_WEBS,
      isTemp: true,
    };

    if (type === "brand") {
      setAvailableBrands((prev) => [...prev, newItem]);
      setSelectedBrands((prev) => [...prev, `temp-${cleanName}`]);
    } else if (type === "category") {
      setAvailableCats((prev) => [...prev, newItem]);
      setSelectedCats((prev) => [...prev, `temp-${cleanName}`]);
    } else if (type === "application") {
      setAvailableApps((prev) => [...prev, newItem]);
      setSelectedApps((prev) => [...prev, `temp-${cleanName}`]);
    }
  };

  const handlePublish = async () => {
    if (!productName) return toast.error("Please enter a product name!");
    if (!status)
      return toast.error("Please select a product status (Draft or Public).");

    setIsPublishing(true);
    const publishToast = toast.loading("Validating...");

    try {
      const nameChanged = !editData || editData.name !== productName;
      if (nameChanged) {
        const dupQuery = query(
          collection(db, "products"),
          where("name", "==", productName),
        );
        const dupSnap = await getDocs(dupQuery);

        const isDuplicate = dupSnap.docs.some((docSnap) => {
          if (docSnap.id === editData?.id) return false;
          const data = docSnap.data();
          const productWebsites = data.websites || data.website || [];
          return productWebsites.some((w: string) => SELECTED_WEBS.includes(w));
        });

        if (isDuplicate) {
          toast.dismiss(publishToast);
          toast.error("This product name already exists on Shopify.");
          setIsPublishing(false);
          return;
        }
      }

      const pendingIdMap: Record<string, string> = {};

      if (pendingItemsRef.current.length > 0) {
        toast.loading("Saving new tags...", { id: publishToast });

        for (const item of pendingItemsRef.current) {
          const payload: any = {
            websites: SELECTED_WEBS,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          payload[item.field] = item.name;

          if (item.type === "application") {
            payload.isActive = true;
            payload.imageUrl = "";
            payload.description = "";
          }
          if (item.type === "category") {
            payload.isActive = true;
            payload.imageUrl = "";
            payload.description = "";
            payload.specifications = [];
          }

          const docRef = await addDoc(collection(db, item.collection), payload);
          pendingIdMap[`temp-${item.name}`] = docRef.id;
        }

        pendingItemsRef.current = [];
      }

      toast.loading("Uploading images...", { id: publishToast });

      // FIX: only upload if a new file was dropped; otherwise keep existing URL
      const mainUrl = mainImage
        ? await uploadToCloudinary(mainImage)
        : existingMainImage;

      const qrUrl = qrImage
        ? await uploadToCloudinary(qrImage)
        : existingQrImage;

      const uploadedGallery = await Promise.all(
        galleryImages.map(uploadToCloudinary),
      );

      const specsGrouped: Record<string, { name: string; value: string }[]> =
        {};

      Object.entries(specValues).forEach(([key, value]) => {
        if (value.trim() !== "") {
          const specItem = availableSpecs.find(
            (spec) =>
              `${spec.specGroupId}-${spec.label}` === key ||
              `${spec.specGroup}-${spec.label}` === key,
          );

          if (specItem) {
            if (!specsGrouped[specItem.specGroup])
              specsGrouped[specItem.specGroup] = [];
            specsGrouped[specItem.specGroup].push({
              name: specItem.label,
              value: value,
            });
          }
        }
      });

      const technicalSpecs = Object.entries(specsGrouped).map(
        ([specGroup, specs]) => ({ specGroup, specs }),
      );

      const resolveCategoryId = (catId: string) => pendingIdMap[catId] || catId;
      const resolveAppIds = (appIds: string[]) =>
        appIds.map((id) => pendingIdMap[id] || id);

      const resolvedCategoryId = selectedCats[0]
        ? resolveCategoryId(selectedCats[0])
        : "";
      const productFamilyTitle = resolvedCategoryId
        ? availableCats.find((cat) => cat.id === selectedCats[0])?.name || ""
        : "";

      // Sanitize helper — Firestore rejects undefined values
      const clean = (val: any, fallback: any = "") =>
        val === undefined || val === null ? fallback : val;

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
        status,
        updatedAt: serverTimestamp(),
      };

      if (editData?.id) {
        await updateDoc(doc(db, "products", editData.id), payload);
        await logAuditEvent({
          action: "update",
          entityType: "product",
          entityId: editData.id,
          entityName: productName || editData.name || "",
          context: {
            page: "/products/shopify-products",
            source: "shopify-add-new-product-form",
            collection: "products",
          },
        });
      } else {
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
      }

      toast.success("Product Saved Successfully!", { id: publishToast });

      if (onFinished) onFinished();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Error saving product", { id: publishToast });
    } finally {
      setIsPublishing(false);
    }
  };

  // FIX: clear existing URL when a new file is dropped
  const onDropMain = useCallback((files: File[]) => {
    if (files[0]) {
      setMainImage(files[0]);
      setExistingMainImage(""); // clear stale existing URL
    }
  }, []);

  const { getRootProps: getMainRootProps, getInputProps: getMainInputProps } =
    useDropzone({ onDrop: onDropMain, maxFiles: 1 });

  const onDropGallery = useCallback((files: File[]) => {
    setGalleryImages((prev) => [...prev, ...files]);
  }, []);

  const {
    getRootProps: getGalleryRootProps,
    getInputProps: getGalleryInputProps,
  } = useDropzone({ onDrop: onDropGallery });

  // Group specs by specGroup for organized display
  const groupedSpecs = availableSpecs.reduce(
    (acc, spec) => {
      if (!acc[spec.specGroup]) acc[spec.specGroup] = [];
      acc[spec.specGroup].push(spec);
      return acc;
    },
    {} as Record<string, SpecItem[]>,
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 min-h-screen">
      <div className="md:col-span-2 space-y-6">
        {/* STATUS CARD */}
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
                    className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all
                      ${
                        active
                          ? `${opt.activeBg} ${opt.color} border-current font-semibold`
                          : "border-border hover:border-muted-foreground/30 hover:bg-muted/40 text-muted-foreground"
                      }`}
                  >
                    <span
                      className={active ? opt.color : "text-muted-foreground"}
                    >
                      {opt.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-[11px] font-normal opacity-70">
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* MEDIA ASSETS CARD */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Images className="h-4 w-4" />
              Media Assets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Main Image */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Main Product Image
                </Label>
                <div
                  {...getMainRootProps()}
                  className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-[160px] flex flex-col items-center justify-center"
                >
                  <input {...getMainInputProps()} />
                  {/* FIX: use stable mainImagePreview instead of inline createObjectURL */}
                  {mainImagePreview || existingMainImage ? (
                    <div className="relative w-full h-full group">
                      <img
                        src={mainImagePreview || existingMainImage}
                        className="w-full h-full object-contain rounded"
                        alt="Main product"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMainImage(null);
                          setMainImagePreview("");
                          setExistingMainImage("");
                        }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg hover:bg-destructive/90 z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <ImagePlus className="h-8 w-8 mb-2 text-muted-foreground" />
                      <p className="text-xs font-medium text-muted-foreground">
                        Main Image
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* QR Code */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  QR Code
                </Label>
                <QrDropzone
                  file={qrImage}
                  preview={qrImagePreview}
                  existingUrl={existingQrImage}
                  onRemove={() => {
                    setQrImage(null);
                    setQrImagePreview("");
                    setExistingQrImage("");
                  }}
                  // FIX: clear existing URL when new file is dropped
                  onDrop={(files) => {
                    if (files[0]) {
                      setQrImage(files[0]);
                      setExistingQrImage("");
                    }
                  }}
                />
              </div>

              {/* Gallery Dropzone */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Add Gallery Images
                </Label>
                <div
                  {...getGalleryRootProps()}
                  className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-[160px] flex flex-col items-center justify-center"
                >
                  <input {...getGalleryInputProps()} />
                  <div className="flex flex-col items-center">
                    <Images className="h-8 w-8 mb-2 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">
                      Drop Gallery Here
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Multi-select supported
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {(existingGalleryImages.length > 0 || galleryImages.length > 0) && (
              <div className="pt-4 border-t">
                <Label className="text-xs font-medium text-muted-foreground mb-3 block">
                  Gallery Preview
                </Label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {existingGalleryImages.map((img, i) => (
                    <div
                      key={`exist-${i}`}
                      className="aspect-square relative border rounded-md overflow-hidden shadow-sm group"
                    >
                      <img
                        src={img || "/placeholder.svg"}
                        className="object-cover w-full h-full"
                        alt={`Gallery ${i + 1}`}
                      />
                      <button
                        onClick={() =>
                          setExistingGalleryImages((prev) =>
                            prev.filter((_, idx) => idx !== i),
                          )
                        }
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  {/* FIX: use GalleryPreviewItem component for stable object URLs */}
                  {galleryImages.map((img, i) => (
                    <GalleryPreviewItem
                      key={`new-${i}`}
                      file={img}
                      onRemove={() =>
                        setGalleryImages((prev) =>
                          prev.filter((_, idx) => idx !== i),
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GENERAL INFO & SPECS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <AlignLeft className="h-4 w-4" />
              General Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Product Name</Label>
              <Input
                className="h-12 text-base font-semibold"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Enter product name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Short Description</Label>
              <Input
                className="h-12"
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                placeholder="Brief product description"
              />
            </div>

            {/* SPECS SECTION */}
            {selectedCats.length > 0 && (
              <div className="pt-6 border-t">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">
                      Technical Specifications
                    </Label>
                  </div>
                </div>

                {specsLoading ? (
                  <div className="p-8 text-center bg-muted/30 rounded-lg border-2 border-dashed flex items-center justify-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-xs font-medium text-muted-foreground">
                      Loading specifications...
                    </p>
                  </div>
                ) : availableSpecs.length === 0 ? (
                  <div className="p-8 text-center bg-muted/30 rounded-lg border-2 border-dashed">
                    <p className="text-xs font-medium text-muted-foreground">
                      No specs available for selected product family
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedSpecs).map(([groupName, specs]) => {
                      const visibleSpecs = editData
                        ? specs.filter((spec) => {
                            const key = `${spec.specGroupId}-${spec.label}`;
                            return (
                              specValues[key] && specValues[key].trim() !== ""
                            );
                          })
                        : specs;

                      if (visibleSpecs.length === 0) return null;

                      return (
                        <div key={groupName} className="space-y-3">
                          <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
                            <Zap className="h-3 w-3" />
                            {groupName}
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-5">
                            {visibleSpecs.map((spec) => {
                              const specKey = `${spec.specGroupId}-${spec.label}`;
                              return (
                                <div
                                  key={spec.id}
                                  className="space-y-1.5 p-3 rounded-lg border bg-card"
                                >
                                  <Label className="text-xs font-medium">
                                    {spec.label}
                                  </Label>
                                  <Input
                                    placeholder={`Enter ${spec.label}...`}
                                    className="h-9 text-sm"
                                    value={specValues[specKey] || ""}
                                    onChange={(e) =>
                                      setSpecValues((prev) => ({
                                        ...prev,
                                        [specKey]: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SIDEBAR */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-center">
              Classification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <SidebarList
              label="Product Family"
              icon={<Tag className="h-3 w-3" />}
              items={availableCats}
              selected={selectedCats}
              disabled={false}
              onToggle={(id: string) =>
                setSelectedCats((prev) =>
                  prev.includes(id)
                    ? prev.filter((i) => i !== id)
                    : [...prev, id],
                )
              }
              onAdd={(name: string) =>
                handleAddItem("category", name, "productfamilies", "title")
              }
            />
            <SidebarList
              label="Brand"
              icon={<Factory className="h-3 w-3" />}
              items={availableBrands}
              selected={selectedBrands}
              disabled={false}
              onToggle={(id: string) =>
                setSelectedBrands((prev) =>
                  prev.includes(id)
                    ? prev.filter((i) => i !== id)
                    : [...prev, id],
                )
              }
              onAdd={(name: string) =>
                handleAddItem("brand", name, "brand_name", "title")
              }
            />
            <SidebarList
              label="Applications"
              icon={<LayoutGrid className="h-3 w-3" />}
              items={availableApps}
              selected={selectedApps}
              disabled={false}
              onToggle={(id: string) =>
                setSelectedApps((prev) =>
                  prev.includes(id)
                    ? prev.filter((a) => a !== id)
                    : [...prev, id],
                )
              }
              onAdd={(name: string) =>
                handleAddItem("application", name, "applications", "title")
              }
            />
          </CardContent>
        </Card>

        {/* PRICING & SKU */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Regular Price
                </Label>
                <Input
                  className="h-9 font-semibold"
                  value={regPrice}
                  onChange={(e) => setRegPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Sale Price
                </Label>
                <Input
                  className="h-9 font-semibold text-destructive"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Item Code
              </Label>
              <Input
                className="h-9 font-mono"
                value={itemCode}
                onChange={(e) => setItemCode(e.target.value)}
                placeholder="SKU-000"
              />
            </div>
          </CardContent>
        </Card>

        <Button
          disabled={isPublishing}
          onClick={handlePublish}
          className="w-full h-14 text-base font-semibold"
        >
          {isPublishing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Publishing...
            </>
          ) : editData ? (
            "Update Product"
          ) : (
            "Publish Product"
          )}
        </Button>
      </div>
    </div>
  );
}

// --- SUBCOMPONENTS ---

function SidebarList({
  label,
  icon,
  items,
  selected,
  onToggle,
  onAdd,
  disabled,
}: any) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          {icon}
          <Label className="text-xs font-medium">{label}</Label>
        </div>
      </div>

      <div className="space-y-1 max-h-48 overflow-y-auto pr-2 min-h-[50px]">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            No items found.
          </p>
        ) : (
          items.map((item: MasterItem) => {
            const isSelected = selected.includes(item.id);
            return (
              <div
                key={item.id}
                onClick={() => onToggle(item.id)}
                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-muted/50"
                } ${item.isTemp ? "bg-primary/5 border border-primary/30" : ""}`}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggle(item.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"} ${item.isTemp ? "italic" : ""}`}
                >
                  {item.name} {item.isTemp && "*"}
                </span>
              </div>
            );
          })
        )}
      </div>

      {!disabled && (
        <div className="pt-2 border-t">
          <AddCustomItem
            placeholder={`Add ${label}...`}
            onAdd={onAdd}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}

function AddCustomItem({
  placeholder,
  onAdd,
  disabled,
}: {
  placeholder: string;
  onAdd: (val: string) => void;
  disabled: boolean;
}) {
  const [val, setVal] = useState("");
  const handleAdd = () => {
    if (val.trim()) {
      onAdd(val.trim());
      setVal("");
    }
  };
  return (
    <div className="flex items-center gap-1">
      <Input
        disabled={disabled}
        placeholder={placeholder}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
        className="h-8 text-xs"
      />
      <Button
        disabled={disabled || !val.trim()}
        size="icon"
        variant="ghost"
        onClick={handleAdd}
        className="h-8 w-8 hover:bg-primary/10"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

// FIX: QrDropzone now accepts pre-computed preview URL from parent
// (parent owns the useEffect that creates/revokes the object URL)
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
      className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-[160px] flex flex-col items-center justify-center"
    >
      <input {...getInputProps()} />
      {preview || existingUrl ? (
        <div className="relative w-full h-full group">
          <img
            src={preview || existingUrl}
            className="w-full h-full object-contain rounded"
            alt="QR Code"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg hover:bg-destructive/90 z-10"
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
