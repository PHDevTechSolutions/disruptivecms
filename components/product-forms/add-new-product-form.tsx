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
  Ruler,
  ArrowUpDown,
  FileText,
  Cpu,
  Layers,
  Sun,
  GitBranch,
  HardHat,
  LayoutTemplate,
  Grid,
  ShoppingBag,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Plus,
  FolderPlus,
  Info,
  Pencil,
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
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/logger";

// ─── TDS lib ──────────────────────────────────────────────────────────────────
import { generateTdsPdf, uploadTdsPdf } from "@/lib/tdsGenerator";

import {
  CreateProductFamilyDialog,
  type CreatedFamily,
} from "./CreateProductFamilyDialog";

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
  type: "brand" | "category" | "application" | "spec";
  name: string;
  collection: string;
  field: string;
}

interface SpecValue {
  specGroup: string;
  specs: { name: string; value: string }[];
}

interface PendingNewSpec {
  specGroupId: string;
  specGroup: string;
  label: string;
  tempId: string;
  /** true once the item has been written to Firestore */
  saved?: boolean;
}

type TdsStatus = "idle" | "generating" | "done" | "error" | "no-specs";

type ProductClass = "spf" | "standard" | "";

// ─── Constants ────────────────────────────────────────────────────────────────

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
  "Taskflow",
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

// ─── TdsBadge ─────────────────────────────────────────────────────────────────

function TdsBadge({ tdsStatus }: { tdsStatus: TdsStatus }) {
  if (tdsStatus === "idle")
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
        <FileText className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
          TDS will be auto-generated on publish
        </span>
      </div>
    );
  if (tdsStatus === "no-specs")
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
          No specs on this family — TDS skipped
        </span>
      </div>
    );
  if (tdsStatus === "generating")
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary/5 border border-primary/20">
        <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
        <span className="text-[10px] font-semibold text-primary">
          Generating TDS PDF…
        </span>
      </div>
    );
  if (tdsStatus === "done")
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
        <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
          TDS PDF generated
        </span>
      </div>
    );
  if (tdsStatus === "error")
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-destructive/10 border border-destructive/20">
        <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
        <span className="text-[10px] font-medium text-destructive">
          TDS generation failed
        </span>
      </div>
    );
  return null;
}

// ─── QrDropzone ───────────────────────────────────────────────────────────────

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
  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    maxFiles: 1,
  });
  return (
    <div
      {...getRootProps()}
      className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-35 flex flex-col items-center justify-center"
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

// ─── Main component ───────────────────────────────────────────────────────────

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
  const [tdsHasSpecs, setTdsHasSpecs] = useState(false);
  const [tdsStatus, setTdsStatus] = useState<TdsStatus>("idle");
  const [tdsUrl, setTdsUrl] = useState<string>(editData?.tdsFileUrl || "");

  const [createFamilyOpen, setCreateFamilyOpen] = useState(false);

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

  const [availableSpecs, setAvailableSpecs] = useState<SpecItem[]>([]);
  const [specsLoading, setSpecsLoading] = useState(false);
  const [availableCats, setAvailableCats] = useState<MasterItem[]>([]);
  const [availableBrands, setAvailableBrands] = useState<MasterItem[]>([]);
  const [availableApps, setAvailableApps] = useState<MasterItem[]>([]);
  const [catOpen, setCatOpen] = useState(false);
  const pendingItemsRef = useRef<PendingItem[]>([]);

  // ── Spec editing state ─────────────────────────────────────────────────────
  const [pendingNewSpecs, setPendingNewSpecs] = useState<PendingNewSpec[]>([]);
  const [newSpecInputs, setNewSpecInputs] = useState<Record<string, string>>(
    {},
  );
  const [groupNameEdits, setGroupNameEdits] = useState<Record<string, string>>(
    {},
  );
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // Inline edit for the selected product family's title
  const [editingFamilyTitle, setEditingFamilyTitle] = useState(false);
  const [familyTitleDraft, setFamilyTitleDraft] = useState("");

  // Tracks which group names have already been synced to Firestore
  const savedGroupNamesRef = useRef<Record<string, string>>({});

  const [selectedWebs, setSelectedWebs] = useState<string[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);

  const [productUsage, setProductUsage] = useState<string[]>(
    editData?.productUsage || [],
  );
  const [usageOpen, setUsageOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [specValues, setSpecValues] = useState<Record<string, string>>({});

  // ── Image state ────────────────────────────────────────────────────────────
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [rawImage, setRawImage] = useState<File | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [qrImage, setQrImage] = useState<File | null>(null);
  const [dimensionalDrawingImage, setDimensionalDrawingImage] =
    useState<File | null>(null);
  const [recommendedMountingHeightImage, setRecommendedMountingHeightImage] =
    useState<File | null>(null);
  const [driverCompatibilityImage, setDriverCompatibilityImage] =
    useState<File | null>(null);
  const [baseImage, setBaseImage] = useState<File | null>(null);
  const [illuminanceLevelImage, setIlluminanceLevelImage] =
    useState<File | null>(null);
  const [wiringDiagramImage, setWiringDiagramImage] = useState<File | null>(
    null,
  );
  const [installationImage, setInstallationImage] = useState<File | null>(null);
  const [wiringLayoutImage, setWiringLayoutImage] = useState<File | null>(null);
  const [terminalLayoutImage, setTerminalLayoutImage] = useState<File | null>(
    null,
  );
  const [accessoriesImage, setAccessoriesImage] = useState<File | null>(null);
  const [typeOfPlugImage, setTypeOfPlugImage] = useState<File | null>(null);

  const [existingMainImage, setExistingMainImage] = useState("");
  const [existingRawImage, setExistingRawImage] = useState("");
  const [existingGalleryImages, setExistingGalleryImages] = useState<string[]>(
    [],
  );
  const [existingQrImage, setExistingQrImage] = useState("");
  // ── Drawing images — field names match bulk-uploader exactly ──────────────
  const [existingDimensionalDrawingImage, setExistingDimensionalDrawingImage] =
    useState("");
  const [
    existingRecommendedMountingHeightImage,
    setExistingRecommendedMountingHeightImage,
  ] = useState("");
  const [
    existingDriverCompatibilityImage,
    setExistingDriverCompatibilityImage,
  ] = useState("");
  const [existingBaseImage, setExistingBaseImage] = useState("");
  const [existingIlluminanceLevelImage, setExistingIlluminanceLevelImage] =
    useState("");
  const [existingWiringDiagramImage, setExistingWiringDiagramImage] =
    useState("");
  const [existingInstallationImage, setExistingInstallationImage] =
    useState("");
  const [existingWiringLayoutImage, setExistingWiringLayoutImage] =
    useState("");
  const [existingTerminalLayoutImage, setExistingTerminalLayoutImage] =
    useState("");
  const [existingAccessoriesImage, setExistingAccessoriesImage] = useState("");
  const [existingTypeOfPlugImage, setExistingTypeOfPlugImage] = useState("");

  const [mediaOpen, setMediaOpen] = useState(true);
  const [techDrawingsOpen, setTechDrawingsOpen] = useState(false);

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

  // ── Auto-open technical drawings in edit view ─────────────────────────────
  useEffect(() => {
    if (!editData) return;
    const hasTechDrawings = [
      editData.dimensionalDrawingImage,
      editData.recommendedMountingHeightImage,
      editData.driverCompatibilityImage,
      editData.baseImage,
      editData.illuminanceLevelImage,
      editData.wiringDiagramImage,
      editData.installationImage,
      editData.wiringLayoutImage,
      editData.terminalLayoutImage,
      editData.accessoriesImage,
    ].some(Boolean);
    if (hasTechDrawings) setTechDrawingsOpen(true);
  }, [editData]);

  // ── Canonical URL auto-fill ───────────────────────────────────────────────
  useEffect(() => {
    if (!seoData.slug || selectedWebs.length === 0) return;
    const domain = WEBSITE_DOMAINS[selectedWebs[0]];
    const path = WEBSITE_PRODUCT_PATH[selectedWebs[0]] ?? "/products";
    if (!domain) return;
    const next = `${domain}${path}/${seoData.slug}`;
    setSeoData((prev) =>
      prev.canonical === next ? prev : { ...prev, canonical: next },
    );
  }, [selectedWebs, seoData.slug]);

  // ── Firestore listeners for cats / brands / apps ──────────────────────────
  useEffect(() => {
    const unsubCats = onSnapshot(
      query(collection(db, "productfamilies"), orderBy("title")),
      (snap) => {
        const db_items = snap.docs.map((d) => ({
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
            websites: [],
            productUsage: [],
            isTemp: true,
          }));
        setAvailableCats([...db_items, ...pending]);
      },
    );
    const unsubBrands = onSnapshot(
      query(collection(db, "brand_name"), orderBy("title")),
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
      query(collection(db, "applications"), orderBy("title")),
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
  }, []);

  // ── Split families: matched usage first, others still accessible ─────────
  const { matchedCats, otherCats } = useMemo(() => {
    if (productUsage.length === 0)
      return { matchedCats: availableCats, otherCats: [] as MasterItem[] };
    const matched: MasterItem[] = [];
    const other: MasterItem[] = [];
    for (const cat of availableCats) {
      if (cat.isTemp) {
        matched.push(cat);
        continue;
      }
      const catUsage: string[] = cat.productUsage ?? [];
      const fits =
        catUsage.length === 0 || productUsage.some((u) => catUsage.includes(u));
      (fits ? matched : other).push(cat);
    }
    return { matchedCats: matched, otherCats: other };
  }, [availableCats, productUsage]);

  // ── Specs listener — real-time, bidirectional ─────────────────────────────
  useEffect(() => {
    if (!selectedCatId) {
      setTdsHasSpecs(false);
      setTdsStatus("idle");
      setAvailableSpecs([]);
      setSpecsLoading(false);
      setPendingNewSpecs([]);
      setGroupNameEdits({});
      setNewSpecInputs({});
      setEditingGroupId(null);
      savedGroupNamesRef.current = {};
      setEditingFamilyTitle(false);
      setFamilyTitleDraft("");
      return;
    }

    let cancelled = false;
    let unsubSpecs: (() => void) | null = null;
    setSpecsLoading(true);

    const unsubFamily = onSnapshot(
      doc(db, "productfamilies", selectedCatId),
      (familySnap) => {
        if (cancelled) return;

        const familyData = familySnap.exists()
          ? (familySnap.data() as any)
          : null;

        const specIds = new Set<string>();
        const familySpecs: {
          specGroupId: string;
          specItems?: { id: string; name: string }[];
        }[] = Array.isArray(familyData?.specs) ? familyData.specs : [];

        if (familySpecs.length > 0) {
          familySpecs.forEach((g) => {
            if (g.specGroupId) specIds.add(g.specGroupId);
          });
        } else if (Array.isArray(familyData?.specifications)) {
          familyData.specifications.forEach((id: string) => specIds.add(id));
        }

        if (specIds.size === 0) {
          if (!cancelled) {
            setAvailableSpecs([]);
            setTdsHasSpecs(false);
            setTdsStatus("no-specs");
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

        unsubSpecs?.();

        unsubSpecs = onSnapshot(collection(db, "specs"), (specsSnap) => {
          if (cancelled) return;
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

          setAvailableSpecs(items);
          setTdsHasSpecs(items.length > 0);
          setTdsStatus(items.length > 0 ? "idle" : "no-specs");
          setSpecsLoading(false);
        });
      },
      (err) => {
        console.error("[AddNewProduct] family listener error:", err);
        if (!cancelled) {
          setTdsHasSpecs(false);
          setTdsStatus("no-specs");
          setAvailableSpecs([]);
          setSpecsLoading(false);
        }
      },
    );

    return () => {
      cancelled = true;
      unsubSpecs?.();
      unsubFamily();
    };
  }, [selectedCatId]);

  // ── Edit-data hydration ───────────────────────────────────────────────────
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
    setTdsUrl(editData.tdsFileUrl || "");
    setSelectedWebs(
      Array.isArray(editData.website)
        ? editData.website
        : editData.website
          ? [editData.website]
          : [],
    );
    setSelectedBrands(editData.brand ? [editData.brand] : []);
    setSelectedApps(editData.applications || []);
    setProductUsage(editData.productUsage || []);
    setExistingMainImage(editData.mainImage || "");
    setExistingRawImage(editData.rawImage || "");
    setExistingGalleryImages(editData.galleryImages || []);
    setExistingQrImage(editData.qrCodeImage || "");
    // ── Drawing images — field names unified with bulk-uploader ─────────────
    setExistingDimensionalDrawingImage(editData.dimensionalDrawingImage || "");
    setExistingRecommendedMountingHeightImage(
      editData.recommendedMountingHeightImage || "",
    );
    setExistingDriverCompatibilityImage(
      editData.driverCompatibilityImage || "",
    );
    setExistingBaseImage(editData.baseImage || "");
    setExistingIlluminanceLevelImage(editData.illuminanceLevelImage || "");
    setExistingWiringDiagramImage(editData.wiringDiagramImage || "");
    setExistingInstallationImage(editData.installationImage || "");
    setExistingWiringLayoutImage(editData.wiringLayoutImage || "");
    setExistingTerminalLayoutImage(editData.terminalLayoutImage || "");
    setExistingAccessoriesImage(editData.accessoriesImage || "");
    setExistingTypeOfPlugImage(editData.typeOfPlugImage || "");
  }, [editData]);

  useEffect(() => {
    if (!editData || !editData.technicalSpecs || availableSpecs.length === 0)
      return;
    const values: Record<string, string> = {};
    editData.technicalSpecs.forEach((group: SpecValue) => {
      group.specs.forEach((spec: { name: string; value: string }) => {
        const specLabel = String(spec.name).toUpperCase().trim();
        let item = availableSpecs.find(
          (s) => s.label === specLabel && s.specGroup === group.specGroup,
        );
        if (!item) item = availableSpecs.find((s) => s.label === specLabel);
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

  // ── Cloudinary image helper ───────────────────────────────────────────────
  const uploadToCloudinary = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: fd },
    );
    return (await res.json()).secure_url as string;
  };

  // ── Immediate cross-save: new spec item ───────────────────────────────────
  const addNewSpecItem = useCallback(
    async (specGroupId: string, specGroup: string) => {
      const label = (newSpecInputs[specGroupId] || "").trim().toUpperCase();
      if (!label) return;

      const alreadyExists =
        availableSpecs.some(
          (s) => s.specGroupId === specGroupId && s.label === label,
        ) ||
        pendingNewSpecs.some(
          (s) => s.specGroupId === specGroupId && s.label === label,
        );
      if (alreadyExists) {
        toast.error("Spec item already exists in this group");
        return;
      }

      const tempId = `new-${specGroupId}-${label}-${Date.now()}`;

      setPendingNewSpecs((p) => [
        ...p,
        { specGroupId, specGroup, label, tempId, saved: false },
      ]);
      setNewSpecInputs((p) => ({ ...p, [specGroupId]: "" }));

      try {
        const specRef = doc(db, "specs", specGroupId);
        const specSnap = await getDoc(specRef);
        if (specSnap.exists()) {
          const existingItems: any[] = specSnap.data().items || [];
          const alreadyInFirestore = existingItems.some(
            (i) =>
              String(i.label || "")
                .toUpperCase()
                .trim() === label,
          );
          if (!alreadyInFirestore) {
            await updateDoc(specRef, {
              items: [...existingItems, { label }],
            });
          }
        }

        if (selectedCatId) {
          const famRef = doc(db, "productfamilies", selectedCatId);
          const famSnap = await getDoc(famRef);
          if (famSnap.exists()) {
            const famData = famSnap.data() as any;
            const famSpecs: any[] = Array.isArray(famData.specs)
              ? [...famData.specs]
              : [];
            const groupIdx = famSpecs.findIndex(
              (g: any) => g.specGroupId === specGroupId,
            );
            if (groupIdx >= 0) {
              const existingSpecItems: any[] =
                famSpecs[groupIdx].specItems || [];
              const itemId = `${specGroupId}-${label}`;
              const alreadyInFamily = existingSpecItems.some(
                (i) =>
                  String(i.name || "")
                    .toUpperCase()
                    .trim() === label,
              );
              if (!alreadyInFamily) {
                famSpecs[groupIdx] = {
                  ...famSpecs[groupIdx],
                  specItems: [
                    ...existingSpecItems,
                    { id: itemId, name: label },
                  ],
                };
                await updateDoc(famRef, { specs: famSpecs });
              }
            }
          }
        }

        setPendingNewSpecs((p) =>
          p.map((s) => (s.tempId === tempId ? { ...s, saved: true } : s)),
        );
      } catch (err) {
        console.error("[AddNewProduct] cross-save spec item failed:", err);
        toast.error("Failed to save new spec item — will retry on publish");
      }
    },
    [newSpecInputs, availableSpecs, pendingNewSpecs, selectedCatId],
  );

  // ── Immediate cross-save: group rename ────────────────────────────────────
  const saveGroupRename = useCallback(
    async (specGroupId: string) => {
      const newName = (groupNameEdits[specGroupId] || "").trim();
      if (!newName) return;
      if (savedGroupNamesRef.current[specGroupId] === newName) return;

      try {
        await updateDoc(doc(db, "specs", specGroupId), { name: newName });
        savedGroupNamesRef.current[specGroupId] = newName;
      } catch (err) {
        console.error("[AddNewProduct] group rename save failed:", err);
        toast.error("Failed to save group rename — will retry on publish");
      }
    },
    [groupNameEdits],
  );

  // ── Immediate cross-save: product family title rename ────────────────────
  const saveFamilyTitle = useCallback(async () => {
    const newTitle = familyTitleDraft.trim().toUpperCase();
    if (!newTitle || !selectedCatId) {
      setEditingFamilyTitle(false);
      return;
    }
    setEditingFamilyTitle(false);

    try {
      await updateDoc(doc(db, "productfamilies", selectedCatId), {
        title: newTitle,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("[AddNewProduct] family title save failed:", err);
      toast.error("Failed to rename product family");
    }
  }, [familyTitleDraft, selectedCatId]);

  const handlePublish = async () => {
    if (!itemDescription)
      return toast.error("Please enter an item description!");
    setIsPublishing(true);
    const tid = toast.loading("Validating...");
    try {
      // Duplicate check
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

      // Save pending tags
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

      // Upload images
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
      // ── Drawing images — use bulk-uploader field names in all uploads ──────
      const dimensionalDrawingUrl = dimensionalDrawingImage
        ? await uploadToCloudinary(dimensionalDrawingImage)
        : existingDimensionalDrawingImage;
      const recommendedMountingHeightUrl = recommendedMountingHeightImage
        ? await uploadToCloudinary(recommendedMountingHeightImage)
        : existingRecommendedMountingHeightImage;
      const driverCompatibilityUrl = driverCompatibilityImage
        ? await uploadToCloudinary(driverCompatibilityImage)
        : existingDriverCompatibilityImage;
      const baseUrl = baseImage
        ? await uploadToCloudinary(baseImage)
        : existingBaseImage;
      const illuminanceLevelUrl = illuminanceLevelImage
        ? await uploadToCloudinary(illuminanceLevelImage)
        : existingIlluminanceLevelImage;
      const wiringDiagramUrl = wiringDiagramImage
        ? await uploadToCloudinary(wiringDiagramImage)
        : existingWiringDiagramImage;
      const installationUrl = installationImage
        ? await uploadToCloudinary(installationImage)
        : existingInstallationImage;
      const wiringLayoutUrl = wiringLayoutImage
        ? await uploadToCloudinary(wiringLayoutImage)
        : existingWiringLayoutImage;
      const terminalLayoutUrl = terminalLayoutImage
        ? await uploadToCloudinary(terminalLayoutImage)
        : existingTerminalLayoutImage;
      const accessoriesUrl = accessoriesImage
        ? await uploadToCloudinary(accessoriesImage)
        : existingAccessoriesImage;
      const typeOfPlugUrl = typeOfPlugImage
        ? await uploadToCloudinary(typeOfPlugImage)
        : existingTypeOfPlugImage;
      const gallery = await Promise.all(galleryImages.map(uploadToCloudinary));

      // Build technicalSpecs
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
          const resolvedGroupName =
            groupNameEdits[s.specGroupId] || s.specGroup;
          if (!specsGrouped[resolvedGroupName])
            specsGrouped[resolvedGroupName] = [];
          specsGrouped[resolvedGroupName].push({
            name: s.label.toUpperCase().trim(),
            value: value.toUpperCase().trim(),
          });
          return;
        }
        const ns = pendingNewSpecs.find((sp) => sp.tempId === key);
        if (ns) {
          const resolvedGroupName =
            groupNameEdits[ns.specGroupId] || ns.specGroup;
          if (!specsGrouped[resolvedGroupName])
            specsGrouped[resolvedGroupName] = [];
          specsGrouped[resolvedGroupName].push({
            name: ns.label,
            value: value.toUpperCase().trim(),
          });
        }
      });

      pendingNewSpecs.forEach((spec) => {
        const value = specValues[spec.tempId];
        if (!value?.trim()) return;
        const resolvedGroupName =
          groupNameEdits[spec.specGroupId] || spec.specGroup;
        if (
          !specsGrouped[resolvedGroupName]?.some((s) => s.name === spec.label)
        ) {
          if (!specsGrouped[resolvedGroupName])
            specsGrouped[resolvedGroupName] = [];
          specsGrouped[resolvedGroupName].push({
            name: spec.label,
            value: value.toUpperCase().trim(),
          });
        }
      });

      const technicalSpecs = Object.entries(specsGrouped).map(
        ([specGroup, specs]) => ({
          specGroup: specGroup.toUpperCase().trim(),
          specs,
        }),
      );

      const productFamilyTitle = selectedCatId
        ? availableCats.find((c) => c.id === selectedCatId)?.name || ""
        : "";
      const brandName =
        availableBrands.find((b) => b.id === selectedBrands[0])?.name || "";
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
        // ── Drawing images — field names unified with bulk-uploader ──────────
        dimensionalDrawingImage: dimensionalDrawingUrl,
        recommendedMountingHeightImage: recommendedMountingHeightUrl,
        driverCompatibilityImage: driverCompatibilityUrl,
        baseImage: baseUrl,
        illuminanceLevelImage: illuminanceLevelUrl,
        wiringDiagramImage: wiringDiagramUrl,
        installationImage: installationUrl,
        wiringLayoutImage: wiringLayoutUrl,
        terminalLayoutImage: terminalLayoutUrl,
        accessoriesImage: accessoriesUrl,
        typeOfPlugImage: typeOfPlugUrl,
        galleryImages: [...existingGalleryImages, ...gallery],
        website: selectedWebs,
        websites: selectedWebs,
        productFamily: productFamilyTitle,
        brand: brandName,
        applications: resolveApps(selectedApps),
        productUsage,
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

      // Save product to Firestore
      let savedDocId: string = editData?.id ?? "";
      if (editData?.id) {
        await updateDoc(doc(db, "products", editData.id), payload);
        await logAuditEvent({
          action: "update",
          entityType: "product",
          entityId: editData.id,
          entityName: itemDescription || editData.itemDescription || "",
          context: {
            page: "/products/all-products",
            source: "add-new-product-form",
            collection: "products",
          },
        });
      } else {
        const docRef = await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        savedDocId = docRef.id;
        await logAuditEvent({
          action: "create",
          entityType: "product",
          entityId: docRef.id,
          entityName: itemDescription,
          context: {
            page: "/products/all-products",
            source: "add-new-product-form",
            collection: "products",
          },
        });
      }

      // ── Safety-net cross-save: any items not yet saved ────────────────────
      const unsavedSpecs = pendingNewSpecs.filter((s) => !s.saved);
      if (unsavedSpecs.length > 0 && selectedCatId) {
        toast.loading("Syncing spec updates…", { id: tid });

        const byGroup = unsavedSpecs.reduce(
          (acc, spec) => {
            if (!acc[spec.specGroupId]) acc[spec.specGroupId] = [];
            acc[spec.specGroupId].push(spec.label);
            return acc;
          },
          {} as Record<string, string[]>,
        );

        const familyRef = doc(db, "productfamilies", selectedCatId);
        const familySnap = await getDoc(familyRef);
        const familyData = familySnap.exists()
          ? (familySnap.data() as any)
          : null;
        let familySpecsArr: any[] = Array.isArray(familyData?.specs)
          ? [...familyData.specs]
          : [];

        for (const [specGroupId, labels] of Object.entries(byGroup)) {
          const specRef = doc(db, "specs", specGroupId);
          const specSnap = await getDoc(specRef);
          if (specSnap.exists()) {
            const existingItems: any[] = specSnap.data().items || [];
            const dedupedNew = labels
              .filter(
                (l) =>
                  !existingItems.some(
                    (i) =>
                      String(i.label || "")
                        .toUpperCase()
                        .trim() === l,
                  ),
              )
              .map((l) => ({ label: l }));
            if (dedupedNew.length > 0) {
              await updateDoc(specRef, {
                items: [...existingItems, ...dedupedNew],
              });
            }
          }

          const groupIdx = familySpecsArr.findIndex(
            (g: any) => g.specGroupId === specGroupId,
          );
          if (groupIdx >= 0) {
            const existingSpecItems: any[] =
              familySpecsArr[groupIdx].specItems || [];
            const newSpecItems = labels
              .filter(
                (l) =>
                  !existingSpecItems.some(
                    (i) =>
                      String(i.name || "")
                        .toUpperCase()
                        .trim() === l,
                  ),
              )
              .map((l) => ({ id: `${specGroupId}-${l}`, name: l }));
            if (newSpecItems.length > 0) {
              familySpecsArr[groupIdx] = {
                ...familySpecsArr[groupIdx],
                specItems: [...existingSpecItems, ...newSpecItems],
              };
            }
          }
        }

        if (familySnap.exists()) {
          await updateDoc(familyRef, { specs: familySpecsArr });
        }
      }

      // ── Safety-net: group renames not yet persisted ───────────────────────
      const unpersistedRenames = Object.entries(groupNameEdits).filter(
        ([specGroupId, name]) =>
          name.trim() &&
          savedGroupNamesRef.current[specGroupId] !== name.trim(),
      );
      for (const [specGroupId, newName] of unpersistedRenames) {
        await updateDoc(doc(db, "specs", specGroupId), {
          name: newName.trim(),
        });
        savedGroupNamesRef.current[specGroupId] = newName.trim();
      }

      // ── Clear pending state ───────────────────────────────────────────────
      setPendingNewSpecs([]);
      setNewSpecInputs({});
      setGroupNameEdits({});
      savedGroupNamesRef.current = {};

      // ── Generate TDS PDF ──────────────────────────────────────────────────
      if (tdsHasSpecs && technicalSpecs.length > 0) {
        try {
          toast.loading("Generating TDS PDF...", { id: tid });
          setTdsStatus("generating");

          const blob = await generateTdsPdf({
            itemDescription,
            litItemCode,
            technicalSpecs,
            mainImageUrl: mainUrl || undefined,
            rawImageUrl: rawUrl || undefined,
            dimensionalDrawingUrl: dimensionalDrawingUrl || undefined,
            recommendedMountingHeightUrl:
              recommendedMountingHeightUrl || undefined,
            driverCompatibilityUrl: driverCompatibilityUrl || undefined,
            baseImageUrl: baseUrl || undefined,
            illuminanceLevelUrl: illuminanceLevelUrl || undefined,
            wiringDiagramUrl: wiringDiagramUrl || undefined,
            installationUrl: installationUrl || undefined,
            wiringLayoutUrl: wiringLayoutUrl || undefined,
            terminalLayoutUrl: terminalLayoutUrl || undefined,
            accessoriesImageUrl: accessoriesUrl || undefined,
            typeOfPlugUrl: typeOfPlugUrl || undefined,
          });

          const filename = `${litItemCode}_TDS.pdf`;
          const generatedTdsUrl = await uploadTdsPdf(
            blob,
            filename,
            CLOUDINARY_CLOUD_NAME,
            CLOUDINARY_UPLOAD_PRESET,
          );

          if (savedDocId && generatedTdsUrl.startsWith("http")) {
            await updateDoc(doc(db, "products", savedDocId), {
              tdsFileUrl: generatedTdsUrl,
              updatedAt: serverTimestamp(),
            });
            setTdsUrl(generatedTdsUrl);
            setTdsStatus("done");
          }
        } catch (pdfErr) {
          console.error("TDS fill failed:", pdfErr);
          setTdsStatus("error");
          toast.warning("Product saved, but TDS PDF could not be generated.", {
            id: tid,
          });
        }
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

  // ── Dropzone callbacks ────────────────────────────────────────────────────
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
  const onDropDimensionalDrawing = useCallback((f: File[]) => {
    if (f[0]) setDimensionalDrawingImage(f[0]);
  }, []);
  const onDropRecommendedMountingHeight = useCallback((f: File[]) => {
    if (f[0]) setRecommendedMountingHeightImage(f[0]);
  }, []);
  const onDropDriverComp = useCallback((f: File[]) => {
    if (f[0]) setDriverCompatibilityImage(f[0]);
  }, []);
  const onDropBase = useCallback((f: File[]) => {
    if (f[0]) setBaseImage(f[0]);
  }, []);
  const onDropIllum = useCallback((f: File[]) => {
    if (f[0]) setIlluminanceLevelImage(f[0]);
  }, []);
  const onDropWiringDiag = useCallback((f: File[]) => {
    if (f[0]) setWiringDiagramImage(f[0]);
  }, []);
  const onDropInstall = useCallback((f: File[]) => {
    if (f[0]) setInstallationImage(f[0]);
  }, []);
  const onDropWiringLay = useCallback((f: File[]) => {
    if (f[0]) setWiringLayoutImage(f[0]);
  }, []);
  const onDropTermLay = useCallback((f: File[]) => {
    if (f[0]) setTerminalLayoutImage(f[0]);
  }, []);
  const onDropAccessories = useCallback((f: File[]) => {
    if (f[0]) setAccessoriesImage(f[0]);
  }, []);
  const onDropTypePlug = useCallback((f: File[]) => {
    if (f[0]) setTypeOfPlugImage(f[0]);
  }, []);

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
  const {
    getRootProps: dimensionalDrawingRoot,
    getInputProps: dimensionalDrawingInput,
  } = useDropzone({ onDrop: onDropDimensionalDrawing, maxFiles: 1 });
  const {
    getRootProps: recommendedMountingHeightRoot,
    getInputProps: recommendedMountingHeightInput,
  } = useDropzone({
    onDrop: onDropRecommendedMountingHeight,
    maxFiles: 1,
  });
  const { getRootProps: driverCompRoot, getInputProps: driverCompInput } =
    useDropzone({ onDrop: onDropDriverComp, maxFiles: 1 });
  const { getRootProps: baseRoot2, getInputProps: baseInput2 } = useDropzone({
    onDrop: onDropBase,
    maxFiles: 1,
  });
  const { getRootProps: illumRoot, getInputProps: illumInput } = useDropzone({
    onDrop: onDropIllum,
    maxFiles: 1,
  });
  const { getRootProps: wiringDiagRoot, getInputProps: wiringDiagInput } =
    useDropzone({ onDrop: onDropWiringDiag, maxFiles: 1 });
  const { getRootProps: installRoot, getInputProps: installInput } =
    useDropzone({ onDrop: onDropInstall, maxFiles: 1 });
  const { getRootProps: wiringLayRoot, getInputProps: wiringLayInput } =
    useDropzone({ onDrop: onDropWiringLay, maxFiles: 1 });
  const { getRootProps: termLayRoot, getInputProps: termLayInput } =
    useDropzone({ onDrop: onDropTermLay, maxFiles: 1 });
  const { getRootProps: accessoriesRoot2, getInputProps: accessoriesInput2 } =
    useDropzone({ onDrop: onDropAccessories, maxFiles: 1 });
  const { getRootProps: typeOfPlugRoot, getInputProps: typeOfPlugInput } =
    useDropzone({ onDrop: onDropTypePlug, maxFiles: 1 });

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

  const renderSimpleDropzone = ({
    rootProps,
    inputProps,
    file,
    existingUrl,
    onClear,
    icon,
    label,
    height = "h-[160px]",
  }: {
    rootProps: any;
    inputProps: any;
    file: File | null;
    existingUrl: string;
    onClear: () => void;
    icon: React.ReactNode;
    label: string;
    height?: string;
  }) => (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <div
        {...rootProps()}
        className={`relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all ${height} flex flex-col items-center justify-center`}
      >
        <input {...inputProps()} />
        {file || existingUrl ? (
          <div className="relative w-full h-full group">
            <img
              src={file ? URL.createObjectURL(file) : existingUrl}
              className="w-full h-full object-contain rounded"
              alt={label}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg z-10"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-muted-foreground/60">{icon}</span>
            <p className="text-[10px] font-medium text-muted-foreground">
              {label}
            </p>
            <p className="text-[9px] text-muted-foreground/50">
              Drop or click to upload
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const toggleUsage = (u: string) =>
    setProductUsage((p) =>
      p.includes(u) ? p.filter((v) => v !== u) : [...p, u],
    );

  // ─────────────────────────────────────────────────────────────────────────
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 min-h-screen">
        {/* ══════════════ MAIN COLUMN ════════════════════════════════════════ */}
        <div className="md:col-span-2 space-y-6">
          {/* ── TDS note ── */}
          {tdsHasSpecs && (
            <Card className="border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      TDS PDF will be auto-generated on publish
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Fill in the form below with product details and media. The
                      TDS PDF ({itemDescription || "PRODUCT"}_TDS.pdf) will be
                      created from the spec values entered below.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Media Assets ── */}
          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setMediaOpen((o) => !o)}
            >
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Images className="h-4 w-4" />
                Media Assets
                {tdsHasSpecs && (
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">
                    (main image + drawings used in TDS)
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {!mediaOpen &&
                    (mainImage ||
                      existingMainImage ||
                      galleryImages.length > 0 ||
                      existingGalleryImages.length > 0) && (
                      <span className="text-[10px] font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                        {[
                          mainImage || existingMainImage ? 1 : 0,
                          galleryImages.length + existingGalleryImages.length,
                        ].reduce((a, b) => a + b, 0)}{" "}
                        uploaded
                      </span>
                    )}
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${mediaOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </CardTitle>
            </CardHeader>
            {mediaOpen && (
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Main image */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Main Image
                    </Label>
                    <div
                      {...mainRoot()}
                      className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-35 flex-col items-center justify-center"
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
                  {/* Raw image */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Raw Image
                    </Label>
                    <div
                      {...rawRoot()}
                      className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-35 flex-col items-center justify-center"
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
                  {/* QR */}
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
                  {/* Gallery */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Add Gallery
                    </Label>
                    <div
                      {...galleryRoot()}
                      className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-35 flex flex-col items-center justify-center"
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

                {/* Technical drawings */}
                <div className="pt-2 border-t">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTechDrawingsOpen((o) => !o);
                    }}
                    className="w-full flex items-center justify-between py-1 group"
                  >
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                      Technical Drawings
                      {tdsHasSpecs && (
                        <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400 ml-2">
                          (dimensional drawing + illuminance used in TDS)
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const filledCount = [
                          dimensionalDrawingImage ||
                            existingDimensionalDrawingImage,
                          recommendedMountingHeightImage ||
                            existingRecommendedMountingHeightImage,
                          driverCompatibilityImage ||
                            existingDriverCompatibilityImage,
                          baseImage || existingBaseImage,
                          illuminanceLevelImage ||
                            existingIlluminanceLevelImage,
                          wiringDiagramImage || existingWiringDiagramImage,
                          installationImage || existingInstallationImage,
                          wiringLayoutImage || existingWiringLayoutImage,
                          terminalLayoutImage || existingTerminalLayoutImage,
                          accessoriesImage || existingAccessoriesImage,
                        ].filter(Boolean).length;
                        return filledCount > 0 ? (
                          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                            {filledCount} uploaded
                          </span>
                        ) : null;
                      })()}
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${techDrawingsOpen ? "rotate-180" : ""}`}
                      />
                    </div>
                  </button>
                  {techDrawingsOpen && (
                    <div className="space-y-4 mt-3">
                      <div className="grid grid-cols-2 gap-4">
                        {renderSimpleDropzone({
                          rootProps: dimensionalDrawingRoot,
                          inputProps: dimensionalDrawingInput,
                          file: dimensionalDrawingImage,
                          existingUrl: existingDimensionalDrawingImage,
                          onClear: () => {
                            setDimensionalDrawingImage(null);
                            setExistingDimensionalDrawingImage("");
                          },
                          icon: <Ruler className="h-3 w-3" />,
                          label: "Dimensional Drawing",
                        })}
                        {renderSimpleDropzone({
                          rootProps: recommendedMountingHeightRoot,
                          inputProps: recommendedMountingHeightInput,
                          file: recommendedMountingHeightImage,
                          existingUrl: existingRecommendedMountingHeightImage,
                          onClear: () => {
                            setRecommendedMountingHeightImage(null);
                            setExistingRecommendedMountingHeightImage("");
                          },
                          icon: <ArrowUpDown className="h-3 w-3" />,
                          label: "Mounting Height",
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {renderSimpleDropzone({
                          rootProps: driverCompRoot,
                          inputProps: driverCompInput,
                          file: driverCompatibilityImage,
                          existingUrl: existingDriverCompatibilityImage,
                          onClear: () => {
                            setDriverCompatibilityImage(null);
                            setExistingDriverCompatibilityImage("");
                          },
                          icon: <Cpu className="h-3 w-3" />,
                          label: "Driver Compatibility",
                        })}
                        {renderSimpleDropzone({
                          rootProps: baseRoot2,
                          inputProps: baseInput2,
                          file: baseImage,
                          existingUrl: existingBaseImage,
                          onClear: () => {
                            setBaseImage(null);
                            setExistingBaseImage("");
                          },
                          icon: <Layers className="h-3 w-3" />,
                          label: "Base",
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {renderSimpleDropzone({
                          rootProps: illumRoot,
                          inputProps: illumInput,
                          file: illuminanceLevelImage,
                          existingUrl: existingIlluminanceLevelImage,
                          onClear: () => {
                            setIlluminanceLevelImage(null);
                            setExistingIlluminanceLevelImage("");
                          },
                          icon: <Sun className="h-3 w-3" />,
                          label: "Illuminance Level",
                        })}
                        {renderSimpleDropzone({
                          rootProps: wiringDiagRoot,
                          inputProps: wiringDiagInput,
                          file: wiringDiagramImage,
                          existingUrl: existingWiringDiagramImage,
                          onClear: () => {
                            setWiringDiagramImage(null);
                            setExistingWiringDiagramImage("");
                          },
                          icon: <GitBranch className="h-3 w-3" />,
                          label: "Wiring Diagram",
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {renderSimpleDropzone({
                          rootProps: installRoot,
                          inputProps: installInput,
                          file: installationImage,
                          existingUrl: existingInstallationImage,
                          onClear: () => {
                            setInstallationImage(null);
                            setExistingInstallationImage("");
                          },
                          icon: <HardHat className="h-3 w-3" />,
                          label: "Installation",
                        })}
                        {renderSimpleDropzone({
                          rootProps: wiringLayRoot,
                          inputProps: wiringLayInput,
                          file: wiringLayoutImage,
                          existingUrl: existingWiringLayoutImage,
                          onClear: () => {
                            setWiringLayoutImage(null);
                            setExistingWiringLayoutImage("");
                          },
                          icon: <LayoutTemplate className="h-3 w-3" />,
                          label: "Wiring Layout",
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {renderSimpleDropzone({
                          rootProps: termLayRoot,
                          inputProps: termLayInput,
                          file: terminalLayoutImage,
                          existingUrl: existingTerminalLayoutImage,
                          onClear: () => {
                            setTerminalLayoutImage(null);
                            setExistingTerminalLayoutImage("");
                          },
                          icon: <Grid className="h-3 w-3" />,
                          label: "Terminal Layout",
                        })}
                        {renderSimpleDropzone({
                          rootProps: accessoriesRoot2,
                          inputProps: accessoriesInput2,
                          file: accessoriesImage,
                          existingUrl: existingAccessoriesImage,
                          onClear: () => {
                            setAccessoriesImage(null);
                            setExistingAccessoriesImage("");
                          },
                          icon: <ShoppingBag className="h-3 w-3" />,
                          label: "Accessories",
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {renderSimpleDropzone({
                          rootProps: typeOfPlugRoot,
                          inputProps: typeOfPlugInput,
                          file: typeOfPlugImage,
                          existingUrl: existingTypeOfPlugImage,
                          onClear: () => {
                            setTypeOfPlugImage(null);
                            setExistingTypeOfPlugImage("");
                          },
                          icon: <Zap className="h-3 w-3" />,
                          label: "Type of Plug",
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Gallery preview */}
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
            )}
          </Card>

          {/* ── General Information ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <AlignLeft className="h-4 w-4" />
                General Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Item Description <span className="text-destructive">*</span>
                  {tdsHasSpecs && (
                    <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400 ml-2">
                      (used in TDS)
                    </span>
                  )}
                </Label>
                <Input
                  className="h-12 text-base font-semibold"
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Enter item description"
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
                  <Label className="text-sm font-medium">
                    LIT Item Code
                    {tdsHasSpecs && (
                      <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400 ml-2">
                        (used in TDS)
                      </span>
                    )}
                  </Label>
                  <Input
                    className="h-10 font-mono"
                    value={litItemCode}
                    onChange={(e) => setLitItemCode(e.target.value)}
                    placeholder="LIT-000"
                  />
                </div>
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

              {/* ── Technical Specs ── */}
              {selectedCatId && (
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">
                      Technical Specifications
                      {tdsHasSpecs && (
                        <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400 ml-2">
                          (values mapped to TDS on publish)
                        </span>
                      )}
                    </Label>
                    {(pendingNewSpecs.length > 0 ||
                      Object.keys(groupNameEdits).length > 0) && (
                      <span className="ml-auto text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                        {pendingNewSpecs.filter((s) => !s.saved).length > 0
                          ? `${pendingNewSpecs.filter((s) => !s.saved).length} item(s) saving…`
                          : Object.keys(groupNameEdits).length > 0
                            ? "Group rename · synced"
                            : "All changes synced"}
                      </span>
                    )}
                  </div>

                  {specsLoading ? (
                    <div className="p-8 text-center bg-muted/30 rounded-lg border-2 border-dashed flex items-center justify-center gap-3">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <p className="text-xs font-medium text-muted-foreground">
                        Loading specifications…
                      </p>
                    </div>
                  ) : availableSpecs.length === 0 &&
                    pendingNewSpecs.length === 0 ? (
                    <div className="p-8 text-center bg-muted/30 rounded-lg border-2 border-dashed">
                      <p className="text-xs font-medium text-muted-foreground">
                        No specs attached to this product family
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

                          const specGroupId = specs[0].specGroupId;
                          const displayGroupName =
                            groupNameEdits[specGroupId] ?? groupName;
                          const groupPendingSpecs = pendingNewSpecs.filter(
                            (s) => s.specGroupId === specGroupId,
                          );

                          return (
                            <div key={groupName} className="space-y-3">
                              {/* Group header with inline rename */}
                              <div className="flex items-center gap-2">
                                {editingGroupId === specGroupId ? (
                                  <div className="flex items-center gap-2 flex-1">
                                    <Zap className="h-3 w-3 text-primary shrink-0" />
                                    <Input
                                      autoFocus
                                      className="h-7 text-sm font-semibold text-primary uppercase px-2 py-0"
                                      value={displayGroupName}
                                      onChange={(e) =>
                                        setGroupNameEdits((p) => ({
                                          ...p,
                                          [specGroupId]:
                                            e.target.value.toUpperCase(),
                                        }))
                                      }
                                      onBlur={() => {
                                        setEditingGroupId(null);
                                        saveGroupRename(specGroupId);
                                      }}
                                      onKeyDown={(e) => {
                                        if (
                                          e.key === "Enter" ||
                                          e.key === "Escape"
                                        ) {
                                          setEditingGroupId(null);
                                          saveGroupRename(specGroupId);
                                        }
                                      }}
                                    />
                                    {groupNameEdits[specGroupId] && (
                                      <span className="text-[9px] text-emerald-600 font-semibold shrink-0">
                                        syncing…
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    <h4 className="text-sm font-semibold text-primary flex items-center gap-2 flex-1">
                                      <Zap className="h-3 w-3" />
                                      {displayGroupName.toUpperCase()}
                                      {groupNameEdits[specGroupId] && (
                                        <span className="text-[9px] text-emerald-600 font-normal ml-1">
                                          (synced)
                                        </span>
                                      )}
                                    </h4>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditingGroupId(specGroupId)
                                      }
                                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                      title="Rename group"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  </>
                                )}
                              </div>

                              {/* Existing spec items */}
                              <div className="space-y-3 pl-5">
                                {uniqueSpecs.map((spec) => {
                                  const specKey = `${spec.specGroupId}-${spec.label}`;
                                  return (
                                    <div
                                      key={spec.id}
                                      className="space-y-1.5 p-3 rounded-lg border bg-card"
                                    >
                                      <Label className="text-xs font-medium uppercase">
                                        {spec.label}
                                      </Label>
                                      <Input
                                        placeholder={`Enter ${spec.label}…`}
                                        className="h-9 text-sm uppercase"
                                        value={specValues[specKey] || ""}
                                        onChange={(e) =>
                                          setSpecValues((p) => ({
                                            ...p,
                                            [specKey]:
                                              e.target.value.toUpperCase(),
                                          }))
                                        }
                                      />
                                    </div>
                                  );
                                })}

                                {/* Newly added spec items */}
                                {groupPendingSpecs.map((spec) => (
                                  <div
                                    key={spec.tempId}
                                    className={cn(
                                      "space-y-1.5 p-3 rounded-lg border",
                                      spec.saved
                                        ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                                        : "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20",
                                    )}
                                  >
                                    <div className="flex items-center justify-between">
                                      <Label
                                        className={cn(
                                          "text-xs font-medium uppercase flex items-center gap-1.5",
                                          spec.saved
                                            ? "text-emerald-700 dark:text-emerald-400"
                                            : "text-amber-700 dark:text-amber-400",
                                        )}
                                      >
                                        {spec.label}
                                        <span
                                          className={cn(
                                            "text-[9px] font-bold px-1.5 py-0.5 rounded-sm",
                                            spec.saved
                                              ? "bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200"
                                              : "bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200",
                                          )}
                                        >
                                          {spec.saved ? "SAVED" : "SAVING…"}
                                        </span>
                                      </Label>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPendingNewSpecs((p) =>
                                            p.filter(
                                              (s) => s.tempId !== spec.tempId,
                                            ),
                                          )
                                        }
                                        className="text-muted-foreground hover:text-destructive transition-colors"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    <Input
                                      placeholder={`Enter ${spec.label}…`}
                                      className="h-9 text-sm uppercase"
                                      value={specValues[spec.tempId] || ""}
                                      onChange={(e) =>
                                        setSpecValues((p) => ({
                                          ...p,
                                          [spec.tempId]:
                                            e.target.value.toUpperCase(),
                                        }))
                                      }
                                    />
                                  </div>
                                ))}

                                {/* Add new spec item row */}
                                <div className="flex gap-2 pt-1">
                                  <Input
                                    placeholder="Add spec item (e.g. COLOR TEMP)…"
                                    className="h-8 text-xs"
                                    value={newSpecInputs[specGroupId] || ""}
                                    onChange={(e) =>
                                      setNewSpecInputs((p) => ({
                                        ...p,
                                        [specGroupId]: e.target.value,
                                      }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        addNewSpecItem(
                                          specGroupId,
                                          displayGroupName,
                                        );
                                      }
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-2.5 shrink-0 border-dashed"
                                    onClick={() =>
                                      addNewSpecItem(
                                        specGroupId,
                                        displayGroupName,
                                      )
                                    }
                                  >
                                    <Plus className="h-3.5 w-3.5 mr-1" />
                                    Add
                                  </Button>
                                </div>
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

          {/* ── Product Status ── */}
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

          {/* TDS file card */}
          {tdsUrl && (
            <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <FileText className="h-4 w-4" />
                  Technical Data Sheet
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="shrink-0 w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-md flex items-center justify-center">
                      <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {litItemCode || editData?.litItemCode}_TDS.pdf
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Auto-generated · Stored on Cloudinary
                      </p>
                    </div>
                  </div>
                  <a
                    href={tdsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                    download={`${litItemCode || editData?.litItemCode}_TDS.pdf`}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                    >
                      View / Download PDF
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ══════════════ SIDEBAR ════════════════════════════════════════════ */}
        <div className="space-y-6">
          {/* ── Usage & Product Family card ── */}
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
                  <Label className="text-xs font-medium">
                    Product Family <span className="text-destructive">*</span>
                  </Label>
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
                        <strong>{productUsage.join(", ")}</strong>.
                      </>
                    ) : (
                      "Select a product usage above to filter families."
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
                        {selectedCatName || "Select product family…"}
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
                        placeholder="Search families…"
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
                            Create new product family…
                          </CommandItem>
                        </CommandGroup>

                        <CommandSeparator />
                        <CommandEmpty>No family found.</CommandEmpty>

                        {/* Matched families */}
                        <CommandGroup
                          heading={
                            productUsage.length > 0
                              ? `Matching ${productUsage.join(", ")}`
                              : "All families"
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
                              <X className="mr-2 h-3 w-3" /> Clear selection
                            </CommandItem>
                          )}
                          {matchedCats.map((cat) => (
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

                        {/* Other families — always selectable */}
                        {otherCats.length > 0 && (
                          <>
                            <CommandSeparator />
                            <CommandGroup heading="Other families">
                              {otherCats.map((cat) => (
                                <CommandItem
                                  key={cat.id}
                                  value={cat.name}
                                  onSelect={() => {
                                    setSelectedCatId(cat.id);
                                    setCatOpen(false);
                                  }}
                                  className="text-xs text-muted-foreground"
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
                                        {(cat.productUsage as string[]).map(
                                          (u) => (
                                            <span
                                              key={u}
                                              className={cn(
                                                "text-[7px] font-bold uppercase px-1 py-0.5 rounded-sm border opacity-50",
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
                                          ),
                                        )}
                                      </span>
                                    )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {selectedCatId && (
                  <div className="space-y-1.5">
                    {/* ── Inline family title editor ── */}
                    {editingFamilyTitle ? (
                      <div className="flex items-center gap-1.5 border border-primary/40 rounded-md px-2.5 py-1.5 bg-primary/5">
                        <Input
                          autoFocus
                          value={familyTitleDraft}
                          onChange={(e) =>
                            setFamilyTitleDraft(e.target.value.toUpperCase())
                          }
                          onBlur={saveFamilyTitle}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveFamilyTitle();
                            if (e.key === "Escape") {
                              setEditingFamilyTitle(false);
                              setFamilyTitleDraft("");
                            }
                          }}
                          className="h-6 text-[11px] font-bold uppercase border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none flex-1"
                          placeholder="FAMILY TITLE…"
                        />
                        <button
                          type="button"
                          onClick={saveFamilyTitle}
                          className="shrink-0 text-primary hover:text-primary/70 transition-colors"
                          title="Save"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFamilyTitle(false);
                            setFamilyTitleDraft("");
                          }}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-foreground/10 bg-muted/30 group">
                        <span className="text-[11px] font-bold uppercase truncate flex-1 text-foreground/80">
                          {selectedCatName}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setFamilyTitleDraft(selectedCatName);
                            setEditingFamilyTitle(true);
                          }}
                          className="shrink-0 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                          title="Rename product family"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <TdsBadge tdsStatus={tdsStatus} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

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
                      className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all ${active ? "border-primary bg-primary/5 text-primary font-semibold" : "border-border hover:border-muted-foreground/30 hover:bg-muted/40 text-muted-foreground"}`}
                    >
                      <span
                        className={
                          active ? "text-primary" : "text-muted-foreground"
                        }
                      >
                        {opt.icon}
                      </span>
                      <p className="text-sm font-semibold">{opt.label}</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Targeted Websites */}
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
                  className={`flex items-center gap-2.5 p-3 rounded-lg border-2 transition-all cursor-pointer ${selectedWebs.includes(web) ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/20"}`}
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
              <CardTitle className="text-sm font-medium">
                Classification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Brand */}
              <div className="space-y-2">
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
                          ? (availableBrands.find(
                              (b) => b.id === selectedBrands[0],
                            )?.name ?? `${selectedBrands.length} selected`)
                          : "Select brand…"}
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
                        placeholder="Search brands…"
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
                              <X className="mr-2 h-3 w-3" /> Clear selection
                            </CommandItem>
                          )}
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

              {/* Applications */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Zap className="h-3 w-3" />
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
                          : "Select applications…"}
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
                        placeholder="Search applications…"
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
                              <X className="mr-2 h-3 w-3" /> Clear all
                            </CommandItem>
                          )}
                          {availableApps.map((app) => (
                            <CommandItem
                              key={app.id}
                              value={app.name}
                              onSelect={() =>
                                setSelectedApps((p) =>
                                  p.includes(app.id)
                                    ? p.filter((i) => i !== app.id)
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
                {selectedApps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedApps.map((id) => {
                      const app = availableApps.find((a) => a.id === id);
                      if (!app) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold border border-primary/20"
                        >
                          {app.name}
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedApps((p) => p.filter((v) => v !== id))
                            }
                            className="hover:text-destructive transition-colors"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
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
                    URL Slug <span className="text-destructive">*</span>
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
                  <Label className="text-sm font-medium">
                    Meta Description
                  </Label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
                    placeholder="Brief summary for search results…"
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
                  className={`p-4 bg-card border rounded-lg shadow-sm transition-all duration-300 ${previewMode === "mobile" ? "max-w-90" : "max-w-150"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                      <LinkIcon className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="text-[12px] text-foreground/70 font-medium truncate">
                      {selectedWebs.length > 0
                        ? `${WEBSITE_DOMAINS[selectedWebs[0]]?.replace("https://", "")} › ${WEBSITE_PRODUCT_PATH[selectedWebs[0]]?.replace("/", "") || "products"} › ${seoData.slug || "…"}`
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
                        {seoData.title || "Enter an SEO Title…"}
                      </a>
                      <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                        {seoData.description ||
                          "Enter a meta description to see how it looks here."}
                      </p>
                    </div>
                    <div className="w-26 h-26 shrink-0 bg-muted/50 rounded-md overflow-hidden border">
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
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Publish */}
          <Button
            disabled={isPublishing}
            onClick={handlePublish}
            className="w-full h-14 text-base font-semibold"
          >
            {isPublishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing…
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
