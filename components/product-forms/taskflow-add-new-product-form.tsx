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
  ChevronsUpDown,
  Check,
  Sun,
  Info,
} from "lucide-react";

// UI Components
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
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/logger";
import {
  CreateProductFamilyDialog,
  type CreatedFamily,
} from "./CreateProductFamilyDialog";

// --- TYPES ---
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

const DEFAULT_WEBSITE = "Taskflow";
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

export default function TaskflowAddNewProduct({
  editData,
  onFinished,
}: {
  editData?: any;
  onFinished?: () => void;
}) {
  const CLOUDINARY_UPLOAD_PRESET = "taskflow_preset";
  const CLOUDINARY_CLOUD_NAME = "dvmpn8mjh";

  const [isPublishing, setIsPublishing] = useState(false);
  const [createFamilyOpen, setCreateFamilyOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);

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

  // PRODUCT USAGE
  const [productUsage, setProductUsage] = useState<string[]>(
    editData?.productUsage || [],
  );

  // MASTER DATA STATE
  const [availableSpecs, setAvailableSpecs] = useState<SpecItem[]>([]);
  const [specsLoading, setSpecsLoading] = useState(false);
  const [availableCats, setAvailableCats] = useState<MasterItem[]>([]);
  const [availableBrands, setAvailableBrands] = useState<MasterItem[]>([]);
  const [availableApps, setAvailableApps] = useState<MasterItem[]>([]);

  const pendingItemsRef = useRef<PendingItem[]>([]);

  // SELECTIONS
  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);

  const [specValues, setSpecValues] = useState<Record<string, string>>({});

  // IMAGES
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [qrImage, setQrImage] = useState<File | null>(null);
  const [existingMainImage, setExistingMainImage] = useState("");
  const [existingGalleryImages, setExistingGalleryImages] = useState<string[]>(
    [],
  );
  const [existingQrImage, setExistingQrImage] = useState("");

  // --- FILTER FAMILIES BY USAGE ---
  const filteredCats = useMemo(() => {
    if (productUsage.length === 0) return availableCats;
    return availableCats.filter((cat) => {
      if (cat.isTemp) return true;
      const catUsage: string[] = cat.productUsage ?? [];
      if (catUsage.length === 0) return true;
      return productUsage.some((u) => catUsage.includes(u));
    });
  }, [availableCats, productUsage]);

  // --- 1. FETCH MASTER DATA ---
  useEffect(() => {
    const unsubCats = onSnapshot(
      query(collection(db, "productfamilies"), orderBy("title")),
      (snap) => {
        const dbItems = snap.docs.map((d) => ({
          id: d.id,
          name: d.data().title || d.data().name || "Unnamed",
          websites: d.data().websites || [],
          productUsage: d.data().productUsage || [],
        }));
        const pending = pendingItemsRef.current
          .filter((p) => p.type === "category")
          .map((p) => ({
            id: `temp-${p.name}`,
            name: p.name,
            websites: SELECTED_WEBS,
            productUsage: [],
            isTemp: true,
          }));
        setAvailableCats([...dbItems, ...pending]);
      },
    );

    const unsubBrands = onSnapshot(
      query(
        collection(db, "brand_name"),
        where("websites", "array-contains-any", SELECTED_WEBS),
        orderBy("title"),
      ),
      (snap) => {
        setAvailableBrands(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().title || d.data().name || "Unnamed",
            websites: d.data().websites || [],
          })),
        );
      },
    );

    const unsubApps = onSnapshot(
      query(
        collection(db, "applications"),
        where("websites", "array-contains-any", SELECTED_WEBS),
        orderBy("title"),
      ),
      (snap) => {
        setAvailableApps(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().title || d.data().name || "Unnamed",
            websites: d.data().websites || [],
          })),
        );
      },
    );

    return () => {
      unsubCats();
      unsubBrands();
      unsubApps();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- FETCH SPECS BASED ON SELECTED CATEGORY ---
  useEffect(() => {
    if (!selectedCatId) {
      setAvailableSpecs([]);
      setSpecsLoading(false);
      return;
    }

    let cancelled = false;
    let unsubSpecs: (() => void) | null = null;
    setSpecsLoading(true);

    (async () => {
      try {
        const catDoc = await getDoc(doc(db, "productfamilies", selectedCatId));
        if (cancelled) return;

        const catData = catDoc.exists() ? (catDoc.data() as any) : null;

        const specIds = new Set<string>();
        const familySpecs: {
          specGroupId: string;
          specItems?: { id: string; name: string }[];
        }[] = Array.isArray(catData?.specs) ? catData.specs : [];

        if (familySpecs.length > 0) {
          familySpecs.forEach((g) => {
            if (g.specGroupId) specIds.add(g.specGroupId);
          });
        } else if (Array.isArray(catData?.specifications)) {
          catData.specifications.forEach((id: string) => specIds.add(id));
        }

        if (specIds.size === 0) {
          if (!cancelled) {
            setAvailableSpecs([]);
            setSpecsLoading(false);
          }
          return;
        }

        const allowedLabelsByGroup = new Map<string, Set<string>>();
        familySpecs.forEach((g) => {
          if (!g.specGroupId || !Array.isArray(g.specItems)) return;
          const set = new Set<string>();
          g.specItems.forEach((it) => {
            if (it?.name) set.add(String(it.name).toUpperCase().trim());
          });
          if (set.size > 0) allowedLabelsByGroup.set(g.specGroupId, set);
        });

        unsubSpecs = onSnapshot(collection(db, "specs"), (specsSnap) => {
          const items: SpecItem[] = [];
          specsSnap.docs
            .filter((d) => specIds.has(d.id))
            .forEach((d) => {
              const data = d.data();
              const specGroupId = d.id;
              const groupName = (data.name as string) || "Unnamed Group";
              const allowedForGroup = allowedLabelsByGroup.get(specGroupId);
              (data.items || []).forEach((item: any) => {
                const rawLabel = item.label;
                if (!rawLabel) return;
                const labelUpper = String(rawLabel).toUpperCase().trim();
                if (allowedForGroup && !allowedForGroup.has(labelUpper)) return;
                items.push({
                  id: `${specGroupId}-${labelUpper}`,
                  label: labelUpper,
                  specGroup: groupName,
                  specGroupId,
                });
              });
            });
          if (!cancelled) {
            setAvailableSpecs(items);
            setSpecsLoading(false);
          }
        });
      } catch (error) {
        console.error("[taskflow] Error fetching specs:", error);
        if (!cancelled) {
          setAvailableSpecs([]);
          setSpecsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubSpecs?.();
      setSpecsLoading(false);
    };
  }, [selectedCatId]);

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
    setProductUsage(editData.productUsage || []);
    setExistingMainImage(editData.mainImage || "");
    setExistingGalleryImages(editData.galleryImages || []);
    setExistingQrImage(editData.qrCodeImage || "");
  }, [editData]);

  useEffect(() => {
    if (!editData || !editData.technicalSpecs || availableSpecs.length === 0)
      return;

    const values: Record<string, string> = {};
    editData.technicalSpecs.forEach((group: SpecValue) => {
      group.specs.forEach((spec: { name: string; value: string }) => {
        const specLabel = String(spec.name).toUpperCase().trim();
        let specItem = availableSpecs.find(
          (s) => s.label === specLabel && s.specGroup === group.specGroup,
        );
        if (!specItem)
          specItem = availableSpecs.find((s) => s.label === specLabel);
        if (specItem)
          values[`${specItem.specGroupId}-${specItem.label}`] = spec.value;
      });
    });
    setSpecValues(values);
  }, [editData, availableSpecs]);

  // --- 3. LOAD PRODUCT FAMILY AFTER CATEGORIES ARE FETCHED ---
  useEffect(() => {
    if (editData && availableCats.length > 0 && !selectedCatId) {
      const match = editData.productFamily
        ? availableCats.find((c) => c.name === editData.productFamily)
        : editData.category
          ? availableCats.find((c) => c.id === editData.category)
          : null;
      if (match) setSelectedCatId(match.id);
    }
  }, [editData, availableCats]);

  // --- 4. HANDLERS ---
  const uploadToCloudinary = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData },
    );
    const data = await res.json();
    return data.secure_url;
  };

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
          toast.error("This product name already exists on Taskflow.");
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
              value,
            });
          }
        }
      });
      const technicalSpecs = Object.entries(specsGrouped).map(
        ([specGroup, specs]) => ({ specGroup, specs }),
      );

      const resolveAppIds = (appIds: string[]) =>
        appIds.map((id) => pendingIdMap[id] || id);
      const productFamilyTitle = selectedCatId
        ? availableCats.find((c) => c.id === selectedCatId)?.name || ""
        : "";

      const payload = {
        name: productName,
        shortDescription: shortDesc,
        itemCode: itemCode,
        regularPrice: Number(regPrice) || 0,
        salePrice: Number(salePrice) || 0,
        technicalSpecs,
        mainImage: mainUrl,
        qrCodeImage: qrUrl,
        galleryImages: [...existingGalleryImages, ...uploadedGallery],
        websites: SELECTED_WEBS,
        productFamily: productFamilyTitle,
        brand: selectedBrands[0]
          ? availableBrands.find((b) => b.id === selectedBrands[0])?.name || ""
          : "",
        applications: resolveAppIds(selectedApps),
        productUsage,
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
            page: "/products/taskflow-products",
            source: "taskflow-add-new-product-form",
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
            page: "/products/taskflow-products",
            source: "taskflow-add-new-product-form",
            collection: "products",
          },
        });
      }

      toast.success("Product Saved Successfully!", { id: publishToast });
      if (onFinished) onFinished();
    } catch (err) {
      console.error(err);
      toast.error("Error saving product", { id: publishToast });
    } finally {
      setIsPublishing(false);
    }
  };

  const onDropMain = useCallback((files: File[]) => {
    if (files[0]) setMainImage(files[0]);
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

  const groupedSpecs = availableSpecs.reduce(
    (acc, spec) => {
      if (!acc[spec.specGroup]) acc[spec.specGroup] = [];
      acc[spec.specGroup].push(spec);
      return acc;
    },
    {} as Record<string, SpecItem[]>,
  );

  const selectedCatName =
    availableCats.find((c) => c.id === selectedCatId)?.name ?? "";

  const toggleUsage = (u: string) =>
    setProductUsage((p) =>
      p.includes(u) ? p.filter((v) => v !== u) : [...p, u],
    );

  return (
    <>
      <CreateProductFamilyDialog
        open={createFamilyOpen}
        onOpenChange={setCreateFamilyOpen}
        onCreated={(family: CreatedFamily) => {
          setAvailableCats((prev) =>
            prev.some((c) => c.id === family.id)
              ? prev
              : [
                  {
                    id: family.id,
                    name: family.name,
                    websites: [],
                    productUsage: family.productUsage ?? [],
                  },
                  ...prev,
                ],
          );
          setSelectedCatId(family.id);
          setCatOpen(false);
        }}
      />

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
                    className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-40 flex flex-col items-center justify-center"
                  >
                    <input {...getMainInputProps()} />
                    {mainImage || existingMainImage ? (
                      <div className="relative w-full h-full group">
                        <img
                          src={
                            mainImage
                              ? URL.createObjectURL(mainImage)
                              : existingMainImage
                          }
                          className="w-full h-full object-contain rounded"
                          alt="Main product"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMainImage(null);
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
                    existingUrl={existingQrImage}
                    onRemove={() => {
                      setQrImage(null);
                      setExistingQrImage("");
                    }}
                    onDrop={(files) => {
                      if (files[0]) setQrImage(files[0]);
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
                    className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-40 flex flex-col items-center justify-center"
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

              {(existingGalleryImages.length > 0 ||
                galleryImages.length > 0) && (
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
                    {galleryImages.map((img, i) => (
                      <div
                        key={`new-${i}`}
                        className="aspect-square relative border rounded-md overflow-hidden shadow-sm group"
                      >
                        <img
                          src={URL.createObjectURL(img) || "/placeholder.svg"}
                          className="object-cover w-full h-full"
                          alt={`New gallery ${i + 1}`}
                        />
                        <button
                          onClick={() =>
                            setGalleryImages((prev) =>
                              prev.filter((_, idx) => idx !== i),
                            )
                          }
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
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

              {/* SPECS SECTION */}
              {selectedCatId && (
                <div className="pt-6 border-t">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">
                      Technical Specifications
                    </Label>
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
                      {Object.entries(groupedSpecs).map(
                        ([groupName, specs]) => {
                          const seenIds = new Set<string>();
                          const uniqueSpecs = specs.filter((spec) => {
                            if (seenIds.has(spec.id)) return false;
                            seenIds.add(spec.id);
                            return true;
                          });
                          if (uniqueSpecs.length === 0) return null;
                          return (
                            <div key={groupName} className="space-y-3">
                              <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
                                <Zap className="h-3 w-3" />
                                {groupName}
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-5">
                                {uniqueSpecs.map((spec) => {
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
                        },
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SIDEBAR */}
        <div className="space-y-6">
          {/* USAGE & PRODUCT FAMILY CARD */}
          <Card className="border-primary/20 bg-primary/2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <LayoutGrid className="h-4 w-4 text-primary" />
                Usage &amp; Product Family
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Product Usage pills */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Sun className="h-3 w-3" />
                    Product Usage
                  </Label>
                  {productUsage.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setProductUsage([])}
                      className="text-[10px] text-muted-foreground hover:text-destructive transition-colors font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {PRODUCT_USAGE_OPTIONS.map((u) => {
                    const active = productUsage.includes(u);
                    const colors = USAGE_COLORS[u];
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => toggleUsage(u)}
                        className={cn(
                          "inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-[11px] font-semibold transition-all",
                          active ? colors.active : colors.pill,
                        )}
                      >
                        {active && <Check className="h-3 w-3" />}
                        {u}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Product Family combobox */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Tag className="h-3 w-3 text-primary" />
                  <Label className="text-xs font-medium">Product Family</Label>
                </div>

                <div
                  className={cn(
                    "flex items-start gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-all",
                    productUsage.length > 0
                      ? "bg-primary/5 border border-primary/20 text-primary"
                      : "bg-muted/50 border border-border text-muted-foreground",
                  )}
                >
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    {productUsage.length > 0 ? (
                      <>
                        Showing families tagged{" "}
                        <strong>{productUsage.join(", ")}</strong>. Select usage
                        above to filter.
                      </>
                    ) : (
                      "Select a product usage above to filter families by type. This is optional."
                    )}
                  </span>
                </div>

                <Popover open={catOpen} onOpenChange={setCatOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between h-9 text-xs font-medium"
                    >
                      <span className="truncate text-left">
                        {selectedCatName || "Select product family..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput
                        placeholder="Search families..."
                        className="h-9 text-xs"
                      />
                      <CommandList>
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              setCatOpen(false);
                              setCreateFamilyOpen(true);
                            }}
                            className="text-xs font-bold text-primary gap-2 aria-selected:bg-primary/10"
                          >
                            <div className="flex h-5 w-5 items-center justify-center rounded-sm border border-primary/40 bg-primary/10 shrink-0">
                              <Plus className="h-3 w-3 text-primary" />
                            </div>
                            Create new product family...
                          </CommandItem>
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandEmpty>No family found.</CommandEmpty>
                        <CommandGroup
                          heading={
                            productUsage.length > 0
                              ? `Filtered by ${productUsage.join(", ")}`
                              : "Existing families"
                          }
                        >
                          {selectedCatId && (
                            <CommandItem
                              onSelect={() => {
                                setSelectedCatId("");
                                setCatOpen(false);
                              }}
                              className="text-xs text-muted-foreground italic"
                            >
                              <X className="mr-2 h-3 w-3" />
                              Clear selection
                            </CommandItem>
                          )}
                          {filteredCats.map((cat) => (
                            <CommandItem
                              key={cat.id}
                              value={cat.name}
                              onSelect={() => {
                                setSelectedCatId(cat.id);
                                setCatOpen(false);
                              }}
                              className={cn(
                                "text-xs",
                                cat.isTemp && "italic text-muted-foreground",
                              )}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-3 w-3",
                                  selectedCatId === cat.id
                                    ? "opacity-100 text-primary"
                                    : "opacity-0",
                                )}
                              />
                              <span className="flex-1 truncate">
                                {cat.name}
                              </span>
                              {cat.productUsage &&
                                cat.productUsage.length > 0 && (
                                  <span className="ml-2 flex gap-1 shrink-0">
                                    {(cat.productUsage as string[]).map((u) => (
                                      <span
                                        key={u}
                                        className={cn(
                                          "text-[7px] font-bold uppercase px-1 py-0.5 rounded-sm border",
                                          u === "INDOOR" &&
                                            "border-blue-200 bg-blue-50 text-blue-600",
                                          u === "OUTDOOR" &&
                                            "border-emerald-200 bg-emerald-50 text-emerald-600",
                                          u === "SOLAR" &&
                                            "border-amber-200 bg-amber-50 text-amber-600",
                                        )}
                                      >
                                        {u}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              {cat.isTemp && (
                                <span className="ml-1 text-[10px] opacity-60">
                                  *new
                                </span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          {/* CLASSIFICATION — Brand & Applications (comboboxes) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-center">
                Classification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Brand (combobox) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Factory className="h-3 w-3" />
                  <Label className="text-xs font-medium">Brand</Label>
                </div>
                <Popover open={brandOpen} onOpenChange={setBrandOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between h-9 text-xs font-medium"
                    >
                      <span className="truncate text-left">
                        {selectedBrands.length
                          ? `${selectedBrands.length} selected`
                          : "Select brand..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput
                        placeholder="Search brands..."
                        className="h-9 text-xs"
                      />
                      <CommandList>
                        <CommandEmpty>No brand found.</CommandEmpty>
                        <CommandGroup>
                          {selectedBrands.length > 0 && (
                            <CommandItem
                              onSelect={() => setSelectedBrands([])}
                              className="text-xs text-muted-foreground italic"
                            >
                              <X className="mr-2 h-3 w-3" />
                              Clear selection
                            </CommandItem>
                          )}
                          {availableBrands.map((brand) => {
                            const active = selectedBrands.includes(brand.id);
                            return (
                              <CommandItem
                                key={brand.id}
                                value={brand.name}
                                onSelect={() =>
                                  setSelectedBrands((prev) =>
                                    prev.includes(brand.id)
                                      ? prev.filter((i) => i !== brand.id)
                                      : [...prev, brand.id],
                                  )
                                }
                                className="text-xs"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-3 w-3",
                                    active
                                      ? "opacity-100 text-primary"
                                      : "opacity-0",
                                  )}
                                />
                                {brand.name}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Applications (combobox) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <LayoutGrid className="h-3 w-3" />
                  <Label className="text-xs font-medium">Applications</Label>
                </div>
                <Popover open={appsOpen} onOpenChange={setAppsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between h-9 text-xs font-medium"
                    >
                      <span className="truncate text-left">
                        {selectedApps.length
                          ? `${selectedApps.length} selected`
                          : "Select applications..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput
                        placeholder="Search applications..."
                        className="h-9 text-xs"
                      />
                      <CommandList>
                        <CommandEmpty>No application found.</CommandEmpty>
                        <CommandGroup>
                          {selectedApps.length > 0 && (
                            <CommandItem
                              onSelect={() => setSelectedApps([])}
                              className="text-xs text-muted-foreground italic"
                            >
                              <X className="mr-2 h-3 w-3" />
                              Clear all
                            </CommandItem>
                          )}
                          {availableApps.map((app) => {
                            const active = selectedApps.includes(app.id);
                            return (
                              <CommandItem
                                key={app.id}
                                value={app.name}
                                onSelect={() =>
                                  setSelectedApps((prev) =>
                                    prev.includes(app.id)
                                      ? prev.filter((a) => a !== app.id)
                                      : [...prev, app.id],
                                  )
                                }
                                className="text-xs"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-3 w-3",
                                    active
                                      ? "opacity-100 text-primary"
                                      : "opacity-0",
                                  )}
                                />
                                {app.name}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          {/* PRICING */}
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
    </>
  );
}

// --- SUBCOMPONENTS ---

function QrDropzone({
  file,
  existingUrl,
  onDrop,
  onRemove,
}: {
  file: File | null;
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
      {file || existingUrl ? (
        <div className="relative w-full h-full group">
          <img
            src={file ? URL.createObjectURL(file) : existingUrl}
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
