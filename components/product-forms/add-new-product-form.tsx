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
  getDocs,
  getDoc,
  orderBy,
} from "firebase/firestore";
import {
  ImagePlus,
  X,
  Loader2,
  AlignLeft,
  Globe,
  Tag,
  Factory,
  LayoutGrid,
  Zap,
  Plus,
  Images,
  Link as LinkIcon,
  Search,
  Eye,
  EyeOff,
  Package,
  Sparkles,
  Check,
  ChevronsUpDown,
  FileImage,
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

// ─── Types ────────────────────────────────────────────────────────────────────

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
  type: "brand" | "category" | "application" | "spec";
  name: string;
  collection: string;
  field: string;
}

interface SpecValue {
  specGroup: string;
  specs: { name: string; value: string }[];
}

type ProductClass = "spf" | "standard" | "";

const PRODUCT_CLASS_OPTIONS: {
  value: ProductClass;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "spf",
    label: "SPF Items",
    icon: <Sparkles className="w-4 h-4" />,
  },
  {
    value: "standard",
    label: "Standard Items",
    icon: <Package className="w-4 h-4" />,
  },
];

const WEBSITE_OPTIONS = [
  "Ecoshift Corporation",
  "Disruptive Solutions Inc",
  "Value Acquisitions Holdings",
];

const WEBSITE_PRODUCT_PATH: Record<string, string> = {
  "Ecoshift Corporation": "/products",
  "Disruptive Solutions Inc.": "/products",
  "Value Acquisitions Holdings": "/solutions",
};

const WEBSITE_DOMAINS: Record<string, string> = {
  "Ecoshift Corporation": "https://ecoshift-website.vercel.app",
  "Disruptive Solutions Inc.": "https://disruptive-solutions-inc.vercel.app",
  "Value Acquisitions Holdings": "https://vah.com.ph",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddNewProduct({
  editData,
  onFinished,
}: {
  editData?: any;
  onFinished?: () => void;
}) {
  const CLOUDINARY_UPLOAD_PRESET = "taskflow_preset";
  const CLOUDINARY_CLOUD_NAME = "dvmpn8mjh";

  const [isPublishing, setIsPublishing] = useState(false);

  // Form
  const [productClass, setProductClass] = useState<ProductClass>(
    editData?.productClass || "",
  );
  const [itemDescription, setItemDescription] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [ecoItemCode, setEcoItemCode] = useState("");
  const [litItemCode, setLitItemCode] = useState("");
  const [regPrice, setRegPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [status, setStatus] = useState<"draft" | "public">(
    editData?.status || "draft",
  );

  // Master data
  const [availableSpecs, setAvailableSpecs] = useState<SpecItem[]>([]);
  const [specsLoading, setSpecsLoading] = useState(false);
  const [availableCats, setAvailableCats] = useState<MasterItem[]>([]);
  const [availableBrands, setAvailableBrands] = useState<MasterItem[]>([]);
  const [availableApps, setAvailableApps] = useState<MasterItem[]>([]);
  const [catOpen, setCatOpen] = useState(false);

  const pendingItemsRef = useRef<PendingItem[]>([]);

  // Selections
  const [selectedWebs, setSelectedWebs] = useState<string[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [specValues, setSpecValues] = useState<Record<string, string>>({});

  // Images
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [rawImage, setRawImage] = useState<File | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [qrImage, setQrImage] = useState<File | null>(null);
  const [existingMainImage, setExistingMainImage] = useState("");
  const [existingRawImage, setExistingRawImage] = useState("");
  const [existingGalleryImages, setExistingGalleryImages] = useState<string[]>(
    [],
  );
  const [existingQrImage, setExistingQrImage] = useState("");

  // SEO
  const [seoData, setSeoData] = useState({
    title: editData?.seo?.title || "",
    description: editData?.seo?.description || "",
    slug: editData?.slug || "",
    canonical: editData?.seo?.canonical || "",
    ogImage: editData?.seo?.ogImage || "",
    robots: editData?.seo?.robots || "index, follow",
  });
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">(
    "desktop",
  );

  // ── Auto-canonical ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!seoData.slug || selectedWebs.length === 0) return;
    const website = selectedWebs[0];
    const domain = WEBSITE_DOMAINS[website];
    const path = WEBSITE_PRODUCT_PATH[website] ?? "/products";
    if (!domain) return;
    const next = `${domain}${path}/${seoData.slug}`;
    setSeoData((prev) =>
      prev.canonical === next ? prev : { ...prev, canonical: next },
    );
  }, [selectedWebs, seoData.slug]);

  // ── Fetch ALL master data — no website gate ───────────────────────────────
  useEffect(() => {
    const unsubCats = onSnapshot(
      query(collection(db, "productfamilies"), orderBy("title")),
      (snap) => {
        const db_items = snap.docs.map((d) => ({
          id: d.id,
          name: d.data().title || d.data().name || "Unnamed",
          websites: d.data().websites || [],
        }));
        const pending = pendingItemsRef.current
          .filter((p) => p.type === "category")
          .map((p) => ({
            id: `temp-${p.name}`,
            name: p.name,
            websites: [],
            isTemp: true,
          }));
        setAvailableCats([...db_items, ...pending]);
      },
    );

    const unsubBrands = onSnapshot(
      query(collection(db, "brand_name"), orderBy("title")),
      (snap) => {
        const db_items = snap.docs.map((d) => ({
          id: d.id,
          name: d.data().title || d.data().name || "Unnamed",
          websites: d.data().websites || [],
        }));
        const pending = pendingItemsRef.current
          .filter((p) => p.type === "brand")
          .map((p) => ({
            id: `temp-${p.name}`,
            name: p.name,
            websites: [],
            isTemp: true,
          }));
        setAvailableBrands([...db_items, ...pending]);
      },
    );

    const unsubApps = onSnapshot(
      query(collection(db, "applications"), orderBy("title")),
      (snap) => {
        const db_items = snap.docs.map((d) => ({
          id: d.id,
          name: d.data().title || d.data().name || "Unnamed",
          websites: d.data().websites || [],
        }));
        const pending = pendingItemsRef.current
          .filter((p) => p.type === "application")
          .map((p) => ({
            id: `temp-${p.name}`,
            name: p.name,
            websites: [],
            isTemp: true,
          }));
        setAvailableApps([...db_items, ...pending]);
      },
    );

    return () => {
      unsubCats();
      unsubBrands();
      unsubApps();
    };
  }, []);

  // ── Fetch specs when category selected ───────────────────────────────────
  useEffect(() => {
    if (!selectedCatId) {
      setAvailableSpecs([]);
      setSpecsLoading(false);
      return;
    }

    setSpecsLoading(true);
    let unsubSpecs: (() => void) | null = null;

    const run = async () => {
      try {
        const catDoc = await getDoc(doc(db, "productfamilies", selectedCatId));
        const specIds = new Set<string>(
          catDoc.exists() ? catDoc.data().specifications || [] : [],
        );

        if (specIds.size === 0) {
          setAvailableSpecs([]);
          setSpecsLoading(false);
          return;
        }

        unsubSpecs = onSnapshot(collection(db, "specs"), (specsSnap) => {
          const items: SpecItem[] = [];
          specsSnap.docs
            .filter((d) => specIds.has(d.id))
            .forEach((d) => {
              const data = d.data();
              (data.items || []).forEach((item: any) => {
                if (item.label) {
                  items.push({
                    id: `${d.id}-${item.label}`,
                    label: item.label,
                    specGroup: data.name || "Unnamed Group",
                    specGroupId: d.id,
                  });
                }
              });
            });
          setAvailableSpecs(items);
          setSpecsLoading(false);
        });
      } catch (e) {
        console.error(e);
        setAvailableSpecs([]);
        setSpecsLoading(false);
      }
    };

    run();
    return () => {
      unsubSpecs?.();
      setSpecsLoading(false);
    };
  }, [selectedCatId]);

  // ── Load edit data ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editData) return;
    setProductClass(editData.productClass || "");
    setItemDescription(editData.itemDescription || "");
    setShortDesc(editData.shortDescription || "");
    setEcoItemCode(editData.ecoItemCode || "");
    setLitItemCode(editData.litItemCode || "");
    setRegPrice(editData.regularPrice?.toString() || "");
    setSalePrice(editData.salePrice?.toString() || "");
    setStatus(editData.status || "draft");
    setSelectedWebs(
      Array.isArray(editData.website)
        ? editData.website
        : editData.website
          ? [editData.website]
          : [],
    );
    setSelectedBrands(editData.brand ? [editData.brand] : []);
    setSelectedApps(editData.applications || []);
    setExistingMainImage(editData.mainImage || "");
    setExistingRawImage(editData.rawImage || "");
    setExistingGalleryImages(editData.galleryImages || []);
    setExistingQrImage(editData.qrCodeImage || "");
  }, [editData]);

  useEffect(() => {
    if (!editData || !editData.technicalSpecs || availableSpecs.length === 0)
      return;
    const values: Record<string, string> = {};
    editData.technicalSpecs.forEach((group: SpecValue) => {
      group.specs.forEach((spec: { name: string; value: string }) => {
        const item = availableSpecs.find(
          (s) => s.label === spec.name && s.specGroup === group.specGroup,
        );
        if (item) values[`${item.specGroupId}-${item.label}`] = spec.value;
      });
    });
    setSpecValues(values);
  }, [editData, availableSpecs]);

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

  // ── Handlers ──────────────────────────────────────────────────────────────
  const uploadToCloudinary = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: fd },
    );
    return (await res.json()).secure_url as string;
  };

  const handleAddItem = (
    type: PendingItem["type"],
    name: string,
    collectionName: string,
    dbField: string,
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
      field: dbField,
    });
    const newItem: MasterItem = {
      id: `temp-${cleanName}`,
      name: cleanName,
      websites: [],
      isTemp: true,
    };
    if (type === "brand") {
      setAvailableBrands((p) => [...p, newItem]);
      setSelectedBrands((p) => [...p, `temp-${cleanName}`]);
    } else if (type === "application") {
      setAvailableApps((p) => [...p, newItem]);
      setSelectedApps((p) => [...p, `temp-${cleanName}`]);
    }
  };

  const handlePublish = async () => {
    if (!itemDescription)
      return toast.error("Please enter an item description!");
    setIsPublishing(true);
    const tid = toast.loading("Validating...");

    try {
      if (!editData || editData.itemDescription !== itemDescription) {
        const dupSnap = await getDocs(
          query(
            collection(db, "products"),
            where("itemDescription", "==", itemDescription),
          ),
        );
        const dup = dupSnap.docs.some((d) => {
          if (d.id === editData?.id) return false;
          return (d.data().website || []).some((w: string) =>
            selectedWebs.includes(w),
          );
        });
        if (dup) {
          toast.dismiss(tid);
          toast.error(
            "This item description already exists on a selected website.",
          );
          setIsPublishing(false);
          return;
        }
      }

      const pendingIdMap: Record<string, string> = {};
      if (pendingItemsRef.current.length > 0) {
        toast.loading("Saving new tags...", { id: tid });
        for (const item of pendingItemsRef.current) {
          const p: any = {
            websites: selectedWebs,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          p[item.field] = item.name;
          if (item.type === "application") {
            p.isActive = true;
            p.imageUrl = "";
            p.description = "";
          }
          if (item.type === "category") {
            p.isActive = true;
            p.imageUrl = "";
            p.description = "";
            p.specifications = [];
          }
          const ref = await addDoc(collection(db, item.collection), p);
          pendingIdMap[`temp-${item.name}`] = ref.id;
        }
        pendingItemsRef.current = [];
      }

      toast.loading("Uploading images...", { id: tid });
      const mainUrl = mainImage
        ? await uploadToCloudinary(mainImage)
        : existingMainImage;
      const rawUrl = rawImage
        ? await uploadToCloudinary(rawImage)
        : existingRawImage;
      const qrUrl = qrImage
        ? await uploadToCloudinary(qrImage)
        : existingQrImage;
      const gallery = await Promise.all(galleryImages.map(uploadToCloudinary));

      const specsGrouped: Record<string, { name: string; value: string }[]> =
        {};
      Object.entries(specValues).forEach(([key, value]) => {
        if (!value.trim()) return;
        const s = availableSpecs.find(
          (sp) =>
            `${sp.specGroupId}-${sp.label}` === key ||
            `${sp.specGroup}-${sp.label}` === key,
        );
        if (s) {
          if (!specsGrouped[s.specGroup]) specsGrouped[s.specGroup] = [];
          specsGrouped[s.specGroup].push({ name: s.label, value });
        }
      });
      const technicalSpecs = Object.entries(specsGrouped).map(
        ([specGroup, specs]) => ({ specGroup, specs }),
      );

      const resolvedCatId = pendingIdMap[selectedCatId] || selectedCatId;
      const productFamilyTitle = resolvedCatId
        ? availableCats.find((c) => c.id === selectedCatId)?.name || ""
        : "";
      const resolveApps = (ids: string[]) =>
        ids.map((id) => pendingIdMap[id] || id);

      const payload = {
        productClass,
        itemDescription,
        shortDescription: shortDesc,
        slug: seoData.slug,
        ecoItemCode,
        litItemCode,
        regularPrice: Number(regPrice) || 0,
        salePrice: Number(salePrice) || 0,
        technicalSpecs,
        mainImage: mainUrl,
        rawImage: rawUrl,
        qrCodeImage: qrUrl,
        galleryImages: [...existingGalleryImages, ...gallery],
        website: selectedWebs,
        websites: selectedWebs,
        productFamily: productFamilyTitle,
        brand: selectedBrands[0]
          ? availableBrands.find((b) => b.id === selectedBrands[0])?.name || ""
          : "",
        applications: resolveApps(selectedApps),
        status,
        seo: {
          itemDescription: seoData.description || itemDescription,
          description: seoData.description,
          canonical: seoData.canonical,
          ogImage: seoData.ogImage || mainUrl,
          robots: seoData.robots,
          lastUpdated: new Date().toISOString(),
        },
        updatedAt: serverTimestamp(),
      };

      if (editData?.id) {
        await updateDoc(doc(db, "products", editData.id), payload);
      } else {
        await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      toast.success("Product Saved!", { id: tid });
      if (onFinished) onFinished();
    } catch (err) {
      console.error(err);
      toast.error("Error saving product", { id: tid });
    } finally {
      setIsPublishing(false);
    }
  };

  // ── Dropzones ─────────────────────────────────────────────────────────────
  const onDropMain = useCallback((f: File[]) => {
    if (f[0]) setMainImage(f[0]);
  }, []);
  const onDropRaw = useCallback((f: File[]) => {
    if (f[0]) setRawImage(f[0]);
  }, []);
  const onDropGallery = useCallback(
    (f: File[]) => setGalleryImages((p) => [...p, ...f]),
    [],
  );

  const { getRootProps: mainRoot, getInputProps: mainInput } = useDropzone({
    onDrop: onDropMain,
    maxFiles: 1,
  });
  const { getRootProps: rawRoot, getInputProps: rawInput } = useDropzone({
    onDrop: onDropRaw,
    maxFiles: 1,
  });
  const { getRootProps: galleryRoot, getInputProps: galleryInput } =
    useDropzone({ onDrop: onDropGallery });

  const toggleWebsite = (web: string) =>
    setSelectedWebs((p) =>
      p.includes(web) ? p.filter((w) => w !== web) : [...p, web],
    );

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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 min-h-screen">
      {/* ═══════════════════════ MAIN COLUMN ═══════════════════════ */}
      <div className="md:col-span-2 space-y-6">
        {/* Product Class */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4" />
              Product Class
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {PRODUCT_CLASS_OPTIONS.map((opt) => {
                const active = productClass === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setProductClass(active ? "" : opt.value)}
                    className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all
                      ${
                        active
                          ? "border-primary bg-primary/5 text-primary font-semibold"
                          : "border-border hover:border-muted-foreground/30 hover:bg-muted/40 text-muted-foreground"
                      }`}
                  >
                    <span
                      className={
                        active ? "text-primary" : "text-muted-foreground"
                      }
                    >
                      {opt.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{opt.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Media Assets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Images className="h-4 w-4" />
              Media Assets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Main Image */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Main Image
                </Label>
                <div
                  {...mainRoot()}
                  className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-[140px] flex flex-col items-center justify-center"
                >
                  <input {...mainInput()} />
                  {mainImage || existingMainImage ? (
                    <div className="relative w-full h-full group">
                      <img
                        src={
                          mainImage
                            ? URL.createObjectURL(mainImage)
                            : existingMainImage
                        }
                        className="w-full h-full object-contain rounded"
                        alt="Main"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMainImage(null);
                          setExistingMainImage("");
                        }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <ImagePlus className="h-7 w-7 text-muted-foreground" />
                      <p className="text-[10px] font-medium text-muted-foreground">
                        Main
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Raw Image */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Raw Image
                </Label>
                <div
                  {...rawRoot()}
                  className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-[140px] flex flex-col items-center justify-center"
                >
                  <input {...rawInput()} />
                  {rawImage || existingRawImage ? (
                    <div className="relative w-full h-full group">
                      <img
                        src={
                          rawImage
                            ? URL.createObjectURL(rawImage)
                            : existingRawImage
                        }
                        className="w-full h-full object-contain rounded"
                        alt="Raw"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRawImage(null);
                          setExistingRawImage("");
                        }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <FileImage className="h-7 w-7 text-muted-foreground" />
                      <p className="text-[10px] font-medium text-muted-foreground">
                        Raw
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

              {/* Gallery Add */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Add Gallery
                </Label>
                <div
                  {...galleryRoot()}
                  className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-[140px] flex flex-col items-center justify-center"
                >
                  <input {...galleryInput()} />
                  <div className="flex flex-col items-center gap-1">
                    <Images className="h-7 w-7 text-muted-foreground" />
                    <p className="text-[10px] font-medium text-muted-foreground">
                      Gallery
                    </p>
                    <p className="text-[9px] text-muted-foreground/60">
                      Multi-select
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
                      className="aspect-square relative border rounded-md overflow-hidden group"
                    >
                      <img
                        src={img}
                        className="object-cover w-full h-full"
                        alt={`Gallery ${i + 1}`}
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
                  {galleryImages.map((img, i) => (
                    <div
                      key={`new-${i}`}
                      className="aspect-square relative border rounded-md overflow-hidden group"
                    >
                      <img
                        src={URL.createObjectURL(img)}
                        className="object-cover w-full h-full"
                        alt={`New ${i + 1}`}
                      />
                      <button
                        onClick={() =>
                          setGalleryImages((p) =>
                            p.filter((_, idx) => idx !== i),
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

        {/* General Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <AlignLeft className="h-4 w-4" />
              General Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Item Description</Label>
              <Input
                className="h-12 text-base font-semibold"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder="Enter item description"
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

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Eco Item Code</Label>
                <Input
                  className="h-10 font-mono"
                  value={ecoItemCode}
                  onChange={(e) => setEcoItemCode(e.target.value)}
                  placeholder="ECO-000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Lit Item Code</Label>
                <Input
                  className="h-10 font-mono"
                  value={litItemCode}
                  onChange={(e) => setLitItemCode(e.target.value)}
                  placeholder="LIT-000"
                />
              </div>
            </div>

            {/* Technical Specs — single column */}
            {selectedCatId && (
              <div className="pt-4 border-t">
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
                      No specs for this product family
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedSpecs).map(([groupName, specs]) => {
                      const visible = editData
                        ? specs.filter((s) => {
                            const k = `${s.specGroupId}-${s.label}`;
                            return specValues[k] && specValues[k].trim() !== "";
                          })
                        : specs;
                      if (visible.length === 0) return null;
                      return (
                        <div key={groupName} className="space-y-3">
                          <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
                            <Zap className="h-3 w-3" />
                            {groupName}
                          </h4>
                          {/* ── Single column — no grid ── */}
                          <div className="space-y-3 pl-5">
                            {visible.map((spec) => {
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
                                      setSpecValues((p) => ({
                                        ...p,
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

        {/* Product Status */}
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
      </div>

      {/* ═══════════════════════ SIDEBAR ═══════════════════════════ */}
      <div className="space-y-6">
        {/* Targeted Websites — optional */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Globe className="h-4 w-4" />
              Targeted Websites
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                Optional
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {WEBSITE_OPTIONS.map((web) => (
              <div
                key={web}
                onClick={() => toggleWebsite(web)}
                className={`flex items-center gap-2.5 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                  selectedWebs.includes(web)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/20"
                }`}
              >
                <Checkbox
                  checked={selectedWebs.includes(web)}
                  onCheckedChange={() => toggleWebsite(web)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  className={`text-sm font-medium ${selectedWebs.includes(web) ? "text-primary" : "text-muted-foreground"}`}
                >
                  {web}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Classification */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-center">
              Classification
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-8">
            {/* PRODUCT FAMILY — single select */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <Tag className="h-3 w-3" />
                <Label className="text-xs font-medium">Product Family</Label>
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
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput
                      placeholder="Search families..."
                      className="h-9 text-xs"
                    />
                    <CommandList>
                      <CommandEmpty>No family found.</CommandEmpty>
                      <CommandGroup>
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

                        {availableCats.map((cat) => (
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
                            {cat.name}
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

            {/* BRAND — multi select (same structure) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <Factory className="h-3 w-3" />
                <Label className="text-xs font-medium">Brand</Label>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between h-9 text-xs font-medium"
                  >
                    <span className="truncate text-left">
                      {selectedBrands.length
                        ? `${selectedBrands.length} selected`
                        : "Select brands..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>

                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
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
                        {availableBrands.map((brand) => (
                          <CommandItem
                            key={brand.id}
                            value={brand.name}
                            onSelect={() =>
                              setSelectedBrands((p) =>
                                p.includes(brand.id)
                                  ? p.filter((i) => i !== brand.id)
                                  : [...p, brand.id],
                              )
                            }
                            className="text-xs"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-3 w-3",
                                selectedBrands.includes(brand.id)
                                  ? "opacity-100 text-primary"
                                  : "opacity-0",
                              )}
                            />
                            {brand.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* APPLICATIONS — multi select (same structure) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <LayoutGrid className="h-3 w-3" />
                <Label className="text-xs font-medium">Applications</Label>
              </div>

              <Popover>
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
                  className="w-[var(--radix-popover-trigger-width)] p-0"
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
                        {availableApps.map((app) => (
                          <CommandItem
                            key={app.id}
                            value={app.name}
                            onSelect={() =>
                              setSelectedApps((p) =>
                                p.includes(app.id)
                                  ? p.filter((a) => a !== app.id)
                                  : [...p, app.id],
                              )
                            }
                            className="text-xs"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-3 w-3",
                                selectedApps.includes(app.id)
                                  ? "opacity-100 text-primary"
                                  : "opacity-0",
                              )}
                            />
                            {app.name}
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

        {/* Pricing */}
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

        {/* SEO */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Search className="h-4 w-4" />
              SEO Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-4 border-b pb-6">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">SEO Title</Label>
                <Input
                  className="h-10"
                  placeholder="Item description for Google"
                  value={seoData.title}
                  onChange={(e) =>
                    setSeoData((p) => ({ ...p, title: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex justify-between">
                  URL Slug
                  <span className="text-[10px] text-destructive font-normal">
                    No forward slash (/)
                  </span>
                </Label>
                <Input
                  className="h-10 font-mono text-sm"
                  placeholder="product-name-slug"
                  value={seoData.slug}
                  onChange={(e) => {
                    const s = e.target.value
                      .toLowerCase()
                      .replace(/\//g, "")
                      .replace(/\s+/g, "-");
                    setSeoData((p) => ({ ...p, slug: s }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Meta Description</Label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
                  placeholder="Brief summary for search results..."
                  value={seoData.description}
                  onChange={(e) =>
                    setSeoData((p) => ({ ...p, description: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="pt-2">
              <div className="flex items-center gap-6 mb-4">
                <span className="text-xs font-medium text-muted-foreground">
                  Google Preview:
                </span>
                <div className="flex gap-4">
                  {(["mobile", "desktop"] as const).map((mode) => (
                    <label
                      key={mode}
                      className="flex items-center gap-2 cursor-pointer text-xs font-medium"
                    >
                      <input
                        type="radio"
                        name="view"
                        checked={previewMode === mode}
                        onChange={() => setPreviewMode(mode)}
                        className="text-primary"
                      />
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              {seoData.canonical && (
                <div className="mb-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <p className="text-[10px] font-semibold text-primary mb-1">
                    Canonical URL
                  </p>
                  <p className="text-xs text-primary/80 font-mono break-all">
                    {seoData.canonical}
                  </p>
                </div>
              )}

              <div
                className={`p-4 bg-card border rounded-lg shadow-sm transition-all duration-300 ${previewMode === "mobile" ? "max-w-[360px]" : "max-w-[600px]"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                    <LinkIcon className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <p className="text-[12px] text-foreground/70 font-medium truncate">
                    {selectedWebs.length > 0
                      ? `${WEBSITE_DOMAINS[selectedWebs[0]]?.replace("https://", "")} › ${WEBSITE_PRODUCT_PATH[selectedWebs[0]]?.replace("/", "") || "products"} › ${seoData.slug || "..."}`
                      : "No website selected"}
                  </p>
                </div>
                <div
                  className={`mt-2 ${previewMode === "mobile" ? "flex flex-col-reverse gap-2" : "flex gap-4"}`}
                >
                  <div className="flex-1">
                    <a
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      className="text-lg text-primary hover:underline leading-tight mb-1 line-clamp-2 font-medium block"
                    >
                      {seoData.title || "Enter an SEO Title..."}
                    </a>
                    <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                      {seoData.description ||
                        "Enter a meta description to see how it looks here."}
                    </p>
                  </div>
                  <div className="w-[104px] h-[104px] flex-shrink-0 bg-muted/50 rounded-md overflow-hidden border relative group">
                    {mainImage || existingMainImage ? (
                      <img
                        src={
                          mainImage
                            ? URL.createObjectURL(mainImage)
                            : existingMainImage
                        }
                        className="w-full h-full object-contain p-1"
                        alt="SEO Preview"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center opacity-20">
                        <Images className="h-6 w-6" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-foreground/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-[8px] text-background font-semibold">
                        PREVIEW ONLY
                      </span>
                    </div>
                  </div>
                </div>
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
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SidebarList({
  label,
  icon,
  items,
  selected,
  onToggle,
  onAdd,
}: {
  label: string;
  icon: React.ReactNode;
  items: MasterItem[];
  selected: string[];
  onToggle: (id: string) => void;
  onAdd: (name: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <Label className="text-xs font-medium">{label}</Label>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto pr-2 min-h-[50px]">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            No items found.
          </p>
        ) : (
          items.map((item) => {
            const isSelected = selected.includes(item.id);
            return (
              <div
                key={item.id}
                onClick={() => onToggle(item.id)}
                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors
                  ${isSelected ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50"}
                  ${item.isTemp ? "bg-primary/5 border border-primary/30" : ""}`}
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
      <div className="pt-2 border-t">
        <AddCustomItem placeholder={`Add ${label}...`} onAdd={onAdd} />
      </div>
    </div>
  );
}

function AddCustomItem({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (v: string) => void;
}) {
  const [val, setVal] = useState("");
  const go = () => {
    if (val.trim()) {
      onAdd(val.trim());
      setVal("");
    }
  };
  return (
    <div className="flex items-center gap-1">
      <Input
        placeholder={placeholder}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            go();
          }
        }}
        className="h-8 text-xs"
      />
      <Button
        disabled={!val.trim()}
        size="icon"
        variant="ghost"
        onClick={go}
        className="h-8 w-8 hover:bg-primary/10"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

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
      className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-[140px] flex flex-col items-center justify-center"
    >
      <input {...getInputProps()} />
      {file || existingUrl ? (
        <div className="relative w-full h-full">
          <img
            src={file ? URL.createObjectURL(file) : existingUrl}
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
        <div className="flex flex-col items-center gap-1">
          <Zap className="h-7 w-7 text-muted-foreground" />
          <p className="text-[10px] font-medium text-muted-foreground">
            QR Code
          </p>
        </div>
      )}
    </div>
  );
}
