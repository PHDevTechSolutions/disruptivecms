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
import { fillTdsPdf } from "@/lib/fillTdsPdf";

// ─── Shared types ─────────────────────────────────────────────────────────────

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

type TdsStatus =
  | "idle"
  | "loading-template"
  | "generating"
  | "done"
  | "error"
  | "no-template";

type ProductClass = "spf" | "standard" | "";

interface OverlayField {
  id: string;
  name: string;
  type: "text" | "image";
  pageIndex: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  multiline: boolean;
}

interface ImgMapping {
  file: File | null;
  url: string;
  onDrop: (f: File) => void;
  onClear: () => void;
}

const PRODUCT_CLASS_OPTIONS: {
  value: ProductClass;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: "spf", label: "SPF Items", icon: <Sparkles className="w-4 h-4" /> },
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

const PRODUCT_USAGE_OPTIONS = ["INDOOR", "OUTDOOR", "SOLAR"];

// ─── TdsImageOverlay ──────────────────────────────────────────────────────────

interface TdsImageOverlayProps {
  style: React.CSSProperties;
  mapping: ImgMapping | null;
  fieldName: string;
}

function TdsImageOverlay({ style, mapping, fieldName }: TdsImageOverlayProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      if (files[0] && mapping) mapping.onDrop(files[0]);
    },
    accept: { "image/*": [] },
    maxFiles: 1,
    disabled: !mapping,
  });

  // Stable object URL that properly revokes on change
  const [previewSrc, setPreviewSrc] = useState<string>("");

  useEffect(() => {
    let objectUrl = "";
    if (mapping?.file) {
      objectUrl = URL.createObjectURL(mapping.file);
      setPreviewSrc(objectUrl);
    } else {
      setPreviewSrc(mapping?.url ?? "");
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mapping?.file, mapping?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasSrc = Boolean(previewSrc);

  return (
    <div
      {...getRootProps()}
      style={style}
      className={cn(
        "group cursor-pointer transition-all overflow-hidden",
        isDragActive
          ? "ring-2 ring-inset ring-primary bg-primary/25"
          : hasSrc
            ? "hover:ring-2 hover:ring-inset hover:ring-primary/60"
            : "bg-amber-50/50 border border-dashed border-amber-400/70 hover:bg-amber-50/80 hover:border-amber-500",
        !mapping && "opacity-40 cursor-not-allowed",
      )}
    >
      <input {...getInputProps()} />
      {hasSrc ? (
        <div className="relative w-full h-full">
          <img
            src={previewSrc}
            className="w-full h-full object-contain"
            alt={fieldName}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all flex items-center justify-center">
            <span
              className="opacity-0 group-hover:opacity-100 text-white font-bold uppercase text-center px-1 leading-tight"
              style={{ fontSize: "clamp(6px, 0.9vw, 10px)" }}
            >
              Replace
            </span>
          </div>
          {mapping && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                mapping.onClear();
              }}
              className="absolute top-0.5 right-0.5 bg-destructive text-white rounded-full p-0.5 shadow opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <X className="h-2 w-2" />
            </button>
          )}
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center opacity-50 group-hover:opacity-80 transition-opacity gap-0.5">
          <ImagePlus className="h-3 w-3" />
          <span
            className="text-center px-1 font-semibold leading-none hidden group-hover:block"
            style={{ fontSize: "clamp(5px, 0.8vw, 9px)" }}
          >
            {fieldName || "Drop image"}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── TdsBadge ─────────────────────────────────────────────────────────────────

function TdsBadge({
  tdsStatus,
  tdsTemplateUrl,
}: {
  tdsStatus: TdsStatus;
  tdsTemplateUrl: string;
}) {
  if (tdsStatus === "idle" && tdsTemplateUrl)
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
        <FileText className="h-3 w-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
          TDS template loaded
        </span>
      </div>
    );
  if (tdsStatus === "loading-template")
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted/50 border border-border">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />
        <span className="text-[10px] font-medium text-muted-foreground">
          Loading TDS template…
        </span>
      </div>
    );
  if (tdsStatus === "no-template")
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
          No TDS template on this family
        </span>
      </div>
    );
  if (tdsStatus === "generating")
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary/5 border border-primary/20">
        <Loader2 className="h-3 w-3 animate-spin text-primary flex-shrink-0" />
        <span className="text-[10px] font-semibold text-primary">
          Filling TDS PDF…
        </span>
      </div>
    );
  if (tdsStatus === "done")
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
        <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
          TDS PDF generated
        </span>
      </div>
    );
  if (tdsStatus === "error")
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-destructive/10 border border-destructive/20">
        <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
        <span className="text-[10px] font-medium text-destructive">
          TDS generation failed
        </span>
      </div>
    );
  return null;
}

// ─── TdsInteractiveFormFiller ─────────────────────────────────────────────────

interface TdsFormFillerProps {
  tdsTemplateUrl: string;
  selectedCatName: string;
  tdsStatus: TdsStatus;
  itemDescription: string;
  ecoItemCode: string;
  litItemCode: string;
  availableBrands: MasterItem[];
  selectedBrands: string[];
  availableSpecs: SpecItem[];
  specValues: Record<string, string>;
  setItemDescription: (v: string) => void;
  setEcoItemCode: (v: string) => void;
  setLitItemCode: (v: string) => void;
  setSpecValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  mainImage: File | null;
  existingMainImage: string;
  setMainImage: (f: File | null) => void;
  setExistingMainImage: (v: string) => void;
  dimensionDrawingImage: File | null;
  existingDimensionDrawingImage: string;
  setDimensionDrawingImage: (f: File | null) => void;
  setExistingDimensionDrawingImage: (v: string) => void;
  mountingHeightImage: File | null;
  existingMountingHeightImage: string;
  setMountingHeightImage: (f: File | null) => void;
  setExistingMountingHeightImage: (v: string) => void;
  driverCompatibilityImage: File | null;
  existingDriverCompatibilityImage: string;
  setDriverCompatibilityImage: (f: File | null) => void;
  setExistingDriverCompatibilityImage: (v: string) => void;
  baseImage: File | null;
  existingBaseImage: string;
  setBaseImage: (f: File | null) => void;
  setExistingBaseImage: (v: string) => void;
  illuminanceLevelImage: File | null;
  existingIlluminanceLevelImage: string;
  setIlluminanceLevelImage: (f: File | null) => void;
  setExistingIlluminanceLevelImage: (v: string) => void;
  wiringDiagramImage: File | null;
  existingWiringDiagramImage: string;
  setWiringDiagramImage: (f: File | null) => void;
  setExistingWiringDiagramImage: (v: string) => void;
  installationImage: File | null;
  existingInstallationImage: string;
  setInstallationImage: (f: File | null) => void;
  setExistingInstallationImage: (v: string) => void;
  wiringLayoutImage: File | null;
  existingWiringLayoutImage: string;
  setWiringLayoutImage: (f: File | null) => void;
  setExistingWiringLayoutImage: (v: string) => void;
  terminalLayoutImage: File | null;
  existingTerminalLayoutImage: string;
  setTerminalLayoutImage: (f: File | null) => void;
  setExistingTerminalLayoutImage: (v: string) => void;
  accessoriesImage: File | null;
  existingAccessoriesImage: string;
  setAccessoriesImage: (f: File | null) => void;
  setExistingAccessoriesImage: (v: string) => void;
}

function TdsInteractiveFormFiller(props: TdsFormFillerProps) {
  const {
    tdsTemplateUrl,
    selectedCatName,
    tdsStatus,
    itemDescription,
    ecoItemCode,
    litItemCode,
    availableBrands,
    selectedBrands,
    availableSpecs,
    specValues,
    setItemDescription,
    setEcoItemCode,
    setLitItemCode,
    setSpecValues,
    mainImage,
    existingMainImage,
    setMainImage,
    setExistingMainImage,
    dimensionDrawingImage,
    existingDimensionDrawingImage,
    setDimensionDrawingImage,
    setExistingDimensionDrawingImage,
    mountingHeightImage,
    existingMountingHeightImage,
    setMountingHeightImage,
    setExistingMountingHeightImage,
    driverCompatibilityImage,
    existingDriverCompatibilityImage,
    setDriverCompatibilityImage,
    setExistingDriverCompatibilityImage,
    baseImage,
    existingBaseImage,
    setBaseImage,
    setExistingBaseImage,
    illuminanceLevelImage,
    existingIlluminanceLevelImage,
    setIlluminanceLevelImage,
    setExistingIlluminanceLevelImage,
    wiringDiagramImage,
    existingWiringDiagramImage,
    setWiringDiagramImage,
    setExistingWiringDiagramImage,
    installationImage,
    existingInstallationImage,
    setInstallationImage,
    setExistingInstallationImage,
    wiringLayoutImage,
    existingWiringLayoutImage,
    setWiringLayoutImage,
    setExistingWiringLayoutImage,
    terminalLayoutImage,
    existingTerminalLayoutImage,
    setTerminalLayoutImage,
    setExistingTerminalLayoutImage,
    accessoriesImage,
    existingAccessoriesImage,
    setAccessoriesImage,
    setExistingAccessoriesImage,
  } = props;

  const [pageDataUrls, setPageDataUrls] = useState<string[]>([]);
  const [overlays, setOverlays] = useState<OverlayField[]>([]);
  const [pageDims, setPageDims] = useState<{ w: number; h: number }[]>([]);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState("");

  // ── Fallback stores for fields that don't map to a named parent state ───────
  const [localTextValues, setLocalTextValues] = useState<
    Record<string, string>
  >({});
  const [localImageFiles, setLocalImageFiles] = useState<
    Record<string, File | null>
  >({});

  // Re-parse only when the template URL itself changes
  useEffect(() => {
    let cancelled = false;
    setPdfLoading(true);
    setPdfError("");
    setPageDataUrls([]);
    setOverlays([]);

    (async () => {
      try {
        const resp = await fetch(tdsTemplateUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const arrayBuf = await resp.arrayBuffer();

        const {
          PDFDocument,
          PDFName,
          PDFRef,
          PDFArray,
          PDFTextField,
          PDFButton,
        } = await import("pdf-lib");

        const pdfDoc = await PDFDocument.load(new Uint8Array(arrayBuf), {
          ignoreEncryption: true,
          updateMetadata: false,
        });
        const form = pdfDoc.getForm();
        const docPages = pdfDoc.getPages();

        const refToPageIdx = new Map<number, number>();
        docPages.forEach((page, pi) => {
          try {
            const rawAnnots = page.node.get(PDFName.of("Annots"));
            if (!rawAnnots) return;
            const annotArr = pdfDoc.context.lookupMaybe(rawAnnots, PDFArray);
            annotArr?.asArray().forEach((item: any) => {
              if (item instanceof PDFRef)
                refToPageIdx.set(item.objectNumber, pi);
            });
          } catch {}
        });

        const pdfjsLib = await import("pdfjs-dist");
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.mjs",
            import.meta.url,
          ).toString();
        }
        const pdfJsDoc = await pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuf),
        }).promise;

        const RENDER_SCALE = 1.8;
        const dataUrls: string[] = [];
        const dims: { w: number; h: number }[] = [];

        for (let i = 1; i <= pdfJsDoc.numPages; i++) {
          const jsPage = await pdfJsDoc.getPage(i);
          const vp = jsPage.getViewport({ scale: RENDER_SCALE });
          const c = document.createElement("canvas");
          c.width = Math.floor(vp.width);
          c.height = Math.floor(vp.height);
          await jsPage.render({
            canvas: c,
            canvasContext: c.getContext("2d")!,
            viewport: vp,
          }).promise;
          dataUrls.push(c.toDataURL("image/jpeg", 0.93));
          dims.push({ w: c.width, h: c.height });
        }

        const fields = form.getFields();
        const result: OverlayField[] = [];

        // Log all field names so you can see exactly what the PDF contains
        console.log(
          "[TDS Fields]",
          fields.map((f) => ({ name: f.getName(), type: f.constructor.name })),
        );

        for (const field of fields) {
          const widgets = field.acroField.getWidgets();
          for (const widget of widgets) {
            const rect = widget.getRectangle();
            let pi = 0;
            try {
              const pRef = widget.P();
              if (pRef instanceof PDFRef) {
                const found = docPages.findIndex((p) => p.ref === pRef);
                pi =
                  found >= 0
                    ? found
                    : (refToPageIdx.get(pRef.objectNumber) ?? 0);
              }
            } catch {}

            const libPage = docPages[pi];
            const pdfSz = libPage.getSize();
            const canvasDim = dims[pi];
            if (!canvasDim) continue;

            const scaleX = canvasDim.w / pdfSz.width;
            const scaleY = canvasDim.h / pdfSz.height;
            const cx = rect.x * scaleX;
            const cy = (pdfSz.height - rect.y - rect.height) * scaleY;
            const cw = rect.width * scaleX;
            const ch = rect.height * scaleY;

            const isText = field instanceof PDFTextField;
            const isImg = field instanceof PDFButton;
            if (!isText && !isImg) continue;

            result.push({
              id: `${field.getName()}_p${pi}_${Math.round(cx)}`,
              name: field.getName(),
              type: isImg ? "image" : "text",
              pageIndex: pi,
              xPct: (cx / canvasDim.w) * 100,
              yPct: (cy / canvasDim.h) * 100,
              wPct: (cw / canvasDim.w) * 100,
              hPct: (ch / canvasDim.h) * 100,
              multiline: isText
                ? (
                    field as unknown as { isMultiline: () => boolean }
                  ).isMultiline()
                : false,
            });
          }
        }

        if (!cancelled) {
          setPageDataUrls(dataUrls);
          setPageDims(dims);
          setOverlays(result);
          setPdfLoading(false);
        }
      } catch (err: any) {
        console.error("[TdsInteractiveFormFiller]", err);
        if (!cancelled) {
          setPdfError(err?.message || "Failed to load PDF template");
          setPdfLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tdsTemplateUrl]);

  // ── Normalise a field name for matching ────────────────────────────────────
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-.()\[\]/\\]/g, "");

  // ── Resolve a text field value from parent state or local fallback ─────────
  const resolveText = useCallback(
    (name: string): string => {
      const n = norm(name);
      if (/itemdescription|productname|^description$|^prodname$/.test(n))
        return itemDescription;
      if (/ecoitemcode|ecocode/.test(n)) return ecoItemCode;
      if (/lititemcode|litcode/.test(n)) return litItemCode;
      if (/brand|brandname/.test(n))
        return (
          availableBrands.find((b) => b.id === selectedBrands[0])?.name ?? ""
        );

      const spec = availableSpecs.find(
        (s) => norm(s.label) === n || s.label === name,
      );
      if (spec) return specValues[`${spec.specGroupId}-${spec.label}`] ?? "";

      // Fallback to local store for unrecognized field names
      return localTextValues[name] ?? "";
    },
    [
      itemDescription,
      ecoItemCode,
      litItemCode,
      availableBrands,
      selectedBrands,
      availableSpecs,
      specValues,
      localTextValues,
    ],
  );

  // ── Apply a text value to parent state or local fallback ──────────────────
  const applyText = useCallback(
    (name: string, value: string) => {
      const n = norm(name);
      if (/itemdescription|productname|^description$|^prodname$/.test(n)) {
        setItemDescription(value);
        return;
      }
      if (/ecoitemcode|ecocode/.test(n)) {
        setEcoItemCode(value);
        return;
      }
      if (/lititemcode|litcode/.test(n)) {
        setLitItemCode(value);
        return;
      }

      const spec = availableSpecs.find(
        (s) => norm(s.label) === n || s.label === name,
      );
      if (spec) {
        setSpecValues((p) => ({
          ...p,
          [`${spec.specGroupId}-${spec.label}`]: value,
        }));
        return;
      }

      // Fallback: store locally so the field stays editable
      setLocalTextValues((p) => ({ ...p, [name]: value }));
    },
    [
      setItemDescription,
      setEcoItemCode,
      setLitItemCode,
      availableSpecs,
      setSpecValues,
    ],
  );

  // ── Resolve an image mapping — always returns a valid ImgMapping ──────────
  const resolveImage = useCallback(
    (name: string): ImgMapping => {
      const n = norm(name);

      // Named mappings — ordered specific → generic
      const namedEntries: [RegExp, ImgMapping][] = [
        // Dimensional drawing
        [
          /dimension(al)?draw|dimdr|dimensiondrawing/,
          {
            file: dimensionDrawingImage,
            url: existingDimensionDrawingImage,
            onDrop: setDimensionDrawingImage,
            onClear: () => {
              setDimensionDrawingImage(null);
              setExistingDimensionDrawingImage("");
            },
          },
        ],
        // Mounting height
        [
          /mountingheight|recommendedmount|mountheight/,
          {
            file: mountingHeightImage,
            url: existingMountingHeightImage,
            onDrop: setMountingHeightImage,
            onClear: () => {
              setMountingHeightImage(null);
              setExistingMountingHeightImage("");
            },
          },
        ],
        // Driver compatibility
        [
          /drivercompat|drivercomp|compatdriver/,
          {
            file: driverCompatibilityImage,
            url: existingDriverCompatibilityImage,
            onDrop: setDriverCompatibilityImage,
            onClear: () => {
              setDriverCompatibilityImage(null);
              setExistingDriverCompatibilityImage("");
            },
          },
        ],
        // Illuminance level
        [
          /illuminance|luxlevel|illuminancelevel/,
          {
            file: illuminanceLevelImage,
            url: existingIlluminanceLevelImage,
            onDrop: setIlluminanceLevelImage,
            onClear: () => {
              setIlluminanceLevelImage(null);
              setExistingIlluminanceLevelImage("");
            },
          },
        ],
        // Wiring diagram (before generic wiring)
        [
          /wiringdiagram|wiringschematic|electricaldiagram/,
          {
            file: wiringDiagramImage,
            url: existingWiringDiagramImage,
            onDrop: setWiringDiagramImage,
            onClear: () => {
              setWiringDiagramImage(null);
              setExistingWiringDiagramImage("");
            },
          },
        ],
        // Wiring layout
        [
          /wiringlayout|wirelayout|wiringplan/,
          {
            file: wiringLayoutImage,
            url: existingWiringLayoutImage,
            onDrop: setWiringLayoutImage,
            onClear: () => {
              setWiringLayoutImage(null);
              setExistingWiringLayoutImage("");
            },
          },
        ],
        // Terminal layout
        [
          /terminallayout|terminalblock|terminalplan/,
          {
            file: terminalLayoutImage,
            url: existingTerminalLayoutImage,
            onDrop: setTerminalLayoutImage,
            onClear: () => {
              setTerminalLayoutImage(null);
              setExistingTerminalLayoutImage("");
            },
          },
        ],
        // Installation
        [
          /installation|installguide|installstep/,
          {
            file: installationImage,
            url: existingInstallationImage,
            onDrop: setInstallationImage,
            onClear: () => {
              setInstallationImage(null);
              setExistingInstallationImage("");
            },
          },
        ],
        // Base
        [
          /^base$|basetype|socketbase/,
          {
            file: baseImage,
            url: existingBaseImage,
            onDrop: setBaseImage,
            onClear: () => {
              setBaseImage(null);
              setExistingBaseImage("");
            },
          },
        ],
        // Accessories
        [
          /accessor|addon/,
          {
            file: accessoriesImage,
            url: existingAccessoriesImage,
            onDrop: setAccessoriesImage,
            onClear: () => {
              setAccessoriesImage(null);
              setExistingAccessoriesImage("");
            },
          },
        ],
        // Main product image — broadest, must be last
        [
          /productimage|mainimage|productphoto|^photo$|^image$|^img$|^picture$|^pic$|^button\d*$|^image\d+$|^photo\d+$/,
          {
            file: mainImage,
            url: existingMainImage,
            onDrop: setMainImage,
            onClear: () => {
              setMainImage(null);
              setExistingMainImage("");
            },
          },
        ],
      ];

      for (const [rx, mapping] of namedEntries) {
        if (rx.test(n)) return mapping;
      }

      // ── Fallback: local state keyed by exact field name ──────────────────
      // This ensures every image button in the PDF is interactive, even with
      // generic names like "Button1", "Image2", etc.
      const localFile = localImageFiles[name] ?? null;
      return {
        file: localFile,
        url: "",
        onDrop: (f: File) => setLocalImageFiles((p) => ({ ...p, [name]: f })),
        onClear: () => setLocalImageFiles((p) => ({ ...p, [name]: null })),
      };
    },
    [
      mainImage,
      existingMainImage,
      setMainImage,
      setExistingMainImage,
      dimensionDrawingImage,
      existingDimensionDrawingImage,
      setDimensionDrawingImage,
      setExistingDimensionDrawingImage,
      mountingHeightImage,
      existingMountingHeightImage,
      setMountingHeightImage,
      setExistingMountingHeightImage,
      driverCompatibilityImage,
      existingDriverCompatibilityImage,
      setDriverCompatibilityImage,
      setExistingDriverCompatibilityImage,
      baseImage,
      existingBaseImage,
      setBaseImage,
      setExistingBaseImage,
      illuminanceLevelImage,
      existingIlluminanceLevelImage,
      setIlluminanceLevelImage,
      setExistingIlluminanceLevelImage,
      wiringDiagramImage,
      existingWiringDiagramImage,
      setWiringDiagramImage,
      setExistingWiringDiagramImage,
      installationImage,
      existingInstallationImage,
      setInstallationImage,
      setExistingInstallationImage,
      wiringLayoutImage,
      existingWiringLayoutImage,
      setWiringLayoutImage,
      setExistingWiringLayoutImage,
      terminalLayoutImage,
      existingTerminalLayoutImage,
      setTerminalLayoutImage,
      setExistingTerminalLayoutImage,
      accessoriesImage,
      existingAccessoriesImage,
      setAccessoriesImage,
      setExistingAccessoriesImage,
      localImageFiles,
    ],
  );

  if (pdfLoading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-20">
          <div className="relative">
            <FileText className="h-10 w-10 text-primary/20" />
            <Loader2 className="h-4 w-4 animate-spin text-primary absolute -top-1 -right-1" />
          </div>
          <p className="text-sm font-semibold text-muted-foreground">
            Preparing TDS form…
          </p>
          <p className="text-xs text-muted-foreground/60">
            Parsing fields from the {selectedCatName} template
          </p>
        </CardContent>
      </Card>
    );
  }

  if (pdfError) {
    return (
      <Card className="border-destructive/20">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-destructive font-semibold">{pdfError}</p>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Could not load the PDF template. Use the General Information section
            below to fill product data manually.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-primary/25 shadow-md">
      <CardHeader className="py-3 px-4 bg-gradient-to-r from-primary/8 to-transparent border-b border-primary/10">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-primary" />
          Technical Data Sheet
          <span className="text-[10px] font-normal text-muted-foreground ml-1">
            — fill directly on the form
          </span>
          <div className="ml-auto flex items-center gap-2.5">
            <TdsBadge tdsStatus={tdsStatus} tdsTemplateUrl={tdsTemplateUrl} />
            <span className="hidden sm:block text-[10px] font-normal text-muted-foreground">
              {selectedCatName}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex items-center gap-5 px-4 py-2 bg-muted/30 border-b text-[10px] text-muted-foreground select-none">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 rounded-sm bg-blue-100 border border-blue-400/60" />
            Text field — click to type
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 rounded-sm bg-amber-50 border border-dashed border-amber-400/70" />
            Image slot — click or drop
          </span>
          <span className="ml-auto hidden sm:block opacity-60">
            Scroll to see all pages
          </span>
        </div>
        <div className="overflow-auto bg-neutral-300 dark:bg-neutral-800 max-h-[88vh]">
          {pageDataUrls.map((dataUrl, pageIdx) => {
            const pageFields = overlays.filter((f) => f.pageIndex === pageIdx);
            const dim = pageDims[pageIdx];
            return (
              <div key={pageIdx} className="py-4 flex justify-center">
                <div
                  className="relative shadow-2xl"
                  style={{
                    width: "100%",
                    maxWidth: dim ? `${dim.w}px` : "100%",
                    aspectRatio: dim ? `${dim.w} / ${dim.h}` : "210 / 297",
                  }}
                >
                  <img
                    src={dataUrl}
                    className="absolute inset-0 w-full h-full pointer-events-none select-none block"
                    alt={`TDS page ${pageIdx + 1}`}
                    draggable={false}
                  />
                  {pageFields.map((field) => {
                    const overlayStyle: React.CSSProperties = {
                      position: "absolute",
                      left: `${field.xPct}%`,
                      top: `${field.yPct}%`,
                      width: `${field.wPct}%`,
                      height: `${field.hPct}%`,
                    };

                    if (field.type === "text") {
                      const val = resolveText(field.name);
                      return (
                        <div key={field.id} style={overlayStyle}>
                          {field.multiline ? (
                            <textarea
                              value={val}
                              onChange={(e) =>
                                applyText(field.name, e.target.value)
                              }
                              className="w-full h-full resize-none bg-blue-50/55 hover:bg-blue-50/80 border border-blue-400/50 hover:border-blue-500/70 focus:border-blue-600 focus:bg-blue-50/90 text-gray-800 dark:text-gray-900 px-[2%] py-[1%] focus:outline-none transition-colors font-medium leading-tight"
                              style={{ fontSize: "clamp(6px, 1.1vw, 11px)" }}
                            />
                          ) : (
                            <input
                              type="text"
                              value={val}
                              onChange={(e) =>
                                applyText(field.name, e.target.value)
                              }
                              className="w-full h-full bg-blue-50/55 hover:bg-blue-50/80 border border-blue-400/50 hover:border-blue-500/70 focus:border-blue-600 focus:bg-blue-50/90 text-gray-800 dark:text-gray-900 px-[3%] focus:outline-none transition-colors font-medium"
                              style={{ fontSize: "clamp(6px, 1.1vw, 11px)" }}
                            />
                          )}
                        </div>
                      );
                    }

                    // Image field — resolveImage always returns a valid mapping
                    const mapping = resolveImage(field.name);
                    return (
                      <TdsImageOverlay
                        key={field.id}
                        style={overlayStyle}
                        mapping={mapping}
                        fieldName={field.name}
                      />
                    );
                  })}
                  {pageDataUrls.length > 1 && (
                    <div className="absolute bottom-3 right-3 bg-black/50 text-white text-[9px] font-bold px-2 py-0.5 rounded-full pointer-events-none tracking-wide">
                      {pageIdx + 1} / {pageDataUrls.length}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
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
  const [tdsTemplateUrl, setTdsTemplateUrl] = useState<string>("");
  const [tdsStatus, setTdsStatus] = useState<TdsStatus>("idle");
  const [tdsUrl, setTdsUrl] = useState<string>(editData?.tdsFileUrl || "");

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

  const [mainImage, setMainImage] = useState<File | null>(null);
  const [rawImage, setRawImage] = useState<File | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [qrImage, setQrImage] = useState<File | null>(null);
  const [dimensionDrawingImage, setDimensionDrawingImage] =
    useState<File | null>(null);
  const [mountingHeightImage, setMountingHeightImage] = useState<File | null>(
    null,
  );
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

  const [existingMainImage, setExistingMainImage] = useState("");
  const [existingRawImage, setExistingRawImage] = useState("");
  const [existingGalleryImages, setExistingGalleryImages] = useState<string[]>(
    [],
  );
  const [existingQrImage, setExistingQrImage] = useState("");
  const [existingDimensionDrawingImage, setExistingDimensionDrawingImage] =
    useState("");
  const [existingMountingHeightImage, setExistingMountingHeightImage] =
    useState("");
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

  useEffect(() => {
    if (!selectedCatId) {
      setTdsTemplateUrl("");
      setTdsStatus("idle");
      setAvailableSpecs([]);
      setSpecsLoading(false);
      return;
    }
    let cancelled = false;
    let unsubSpecs: (() => void) | null = null;
    setTdsStatus("loading-template");
    setSpecsLoading(true);

    (async () => {
      try {
        const familySnap = await getDoc(
          doc(db, "productfamilies", selectedCatId),
        );
        if (cancelled) return;
        const familyData = familySnap.exists() ? familySnap.data() : null;
        const templateUrl: string = familyData?.tdsTemplate ?? "";
        if (templateUrl) {
          setTdsTemplateUrl(templateUrl);
          setTdsStatus("idle");
        } else {
          setTdsTemplateUrl("");
          setTdsStatus("no-template");
        }

        const specIds = new Set<string>(
          Array.isArray(familyData?.specifications)
            ? familyData!.specifications
            : [],
        );
        if (specIds.size === 0) {
          if (!cancelled) {
            setAvailableSpecs([]);
            setSpecsLoading(false);
          }
          return;
        }

        unsubSpecs = onSnapshot(collection(db, "specs"), (specsSnap) => {
          const items: SpecItem[] = [];
          specsSnap.docs
            .filter((d) => specIds.has(d.id))
            .forEach((d) => {
              const data = d.data();
              (data.items || []).forEach((item: any) => {
                if (item.label)
                  items.push({
                    id: `${d.id}-${item.label}`,
                    label: item.label,
                    specGroup: data.name || "Unnamed Group",
                    specGroupId: d.id,
                  });
              });
            });
          setAvailableSpecs(items);
          setSpecsLoading(false);
        });
      } catch (e) {
        console.error("[AddNewProduct]", e);
        if (!cancelled) {
          setTdsStatus("no-template");
          setAvailableSpecs([]);
          setSpecsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubSpecs?.();
    };
  }, [selectedCatId]);

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
    setExistingDimensionDrawingImage(editData.dimensionDrawingImage || "");
    setExistingMountingHeightImage(editData.mountingHeightImage || "");
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
  }, [editData]);

  useEffect(() => {
    if (!editData || !editData.technicalSpecs || availableSpecs.length === 0)
      return;
    const values: Record<string, string> = {};
    editData.technicalSpecs.forEach((group: SpecValue) => {
      group.specs.forEach((spec: { name: string; value: string }) => {
        let item = availableSpecs.find(
          (s) => s.label === spec.name && s.specGroup === group.specGroup,
        );
        if (!item) item = availableSpecs.find((s) => s.label === spec.name);
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

  const uploadPdfToCloudinary = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`,
      { method: "POST", body: fd },
    );
    const json = await res.json();
    if (!json?.secure_url)
      throw new Error(
        `Cloudinary PDF upload failed: ${json?.error?.message ?? "no secure_url"}`,
      );
    return json.secure_url as string;
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
      const dimensionDrawingUrl = dimensionDrawingImage
        ? await uploadToCloudinary(dimensionDrawingImage)
        : existingDimensionDrawingImage;
      const mountingHeightUrl = mountingHeightImage
        ? await uploadToCloudinary(mountingHeightImage)
        : existingMountingHeightImage;
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
        dimensionDrawingImage: dimensionDrawingUrl,
        mountingHeightImage: mountingHeightUrl,
        driverCompatibilityImage: driverCompatibilityUrl,
        baseImage: baseUrl,
        illuminanceLevelImage: illuminanceLevelUrl,
        wiringDiagramImage: wiringDiagramUrl,
        installationImage: installationUrl,
        wiringLayoutImage: wiringLayoutUrl,
        terminalLayoutImage: terminalLayoutUrl,
        accessoriesImage: accessoriesUrl,
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

      try {
        if (tdsTemplateUrl) {
          toast.loading("Generating TDS PDF...", { id: tid });
          setTdsStatus("generating");
          const generatedTdsUrl = await fillTdsPdf({
            templateUrl: tdsTemplateUrl,
            itemDescription,
            litItemCode,
            ecoItemCode,
            brand: brandName,
            technicalSpecs,
            mainImageUrl: mainUrl || undefined,
            cloudinaryUploadFn: uploadPdfToCloudinary,
          });
          if (savedDocId && generatedTdsUrl.startsWith("http")) {
            await updateDoc(doc(db, "products", savedDocId), {
              tdsFileUrl: generatedTdsUrl,
              updatedAt: serverTimestamp(),
            });
            setTdsUrl(generatedTdsUrl);
            setTdsStatus("done");
          }
        } else {
          setTdsStatus("no-template");
        }
      } catch (pdfErr) {
        console.error("TDS fill failed:", pdfErr);
        setTdsStatus("error");
        toast.warning("Product saved, but TDS PDF could not be generated.", {
          id: tid,
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
  const onDropDimDraw = useCallback((f: File[]) => {
    if (f[0]) setDimensionDrawingImage(f[0]);
  }, []);
  const onDropMountH = useCallback((f: File[]) => {
    if (f[0]) setMountingHeightImage(f[0]);
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
  const { getRootProps: dimensionDrawRoot, getInputProps: dimensionDrawInput } =
    useDropzone({ onDrop: onDropDimDraw, maxFiles: 1 });
  const { getRootProps: mountHRoot, getInputProps: mountHInput } = useDropzone({
    onDrop: onDropMountH,
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 min-h-screen">
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

        {/* TDS Interactive Form */}
        {tdsTemplateUrl && (
          <TdsInteractiveFormFiller
            tdsTemplateUrl={tdsTemplateUrl}
            selectedCatName={selectedCatName}
            tdsStatus={tdsStatus}
            itemDescription={itemDescription}
            ecoItemCode={ecoItemCode}
            litItemCode={litItemCode}
            availableBrands={availableBrands}
            selectedBrands={selectedBrands}
            availableSpecs={availableSpecs}
            specValues={specValues}
            setItemDescription={setItemDescription}
            setEcoItemCode={setEcoItemCode}
            setLitItemCode={setLitItemCode}
            setSpecValues={setSpecValues}
            mainImage={mainImage}
            existingMainImage={existingMainImage}
            setMainImage={setMainImage}
            setExistingMainImage={setExistingMainImage}
            dimensionDrawingImage={dimensionDrawingImage}
            existingDimensionDrawingImage={existingDimensionDrawingImage}
            setDimensionDrawingImage={setDimensionDrawingImage}
            setExistingDimensionDrawingImage={setExistingDimensionDrawingImage}
            mountingHeightImage={mountingHeightImage}
            existingMountingHeightImage={existingMountingHeightImage}
            setMountingHeightImage={setMountingHeightImage}
            setExistingMountingHeightImage={setExistingMountingHeightImage}
            driverCompatibilityImage={driverCompatibilityImage}
            existingDriverCompatibilityImage={existingDriverCompatibilityImage}
            setDriverCompatibilityImage={setDriverCompatibilityImage}
            setExistingDriverCompatibilityImage={
              setExistingDriverCompatibilityImage
            }
            baseImage={baseImage}
            existingBaseImage={existingBaseImage}
            setBaseImage={setBaseImage}
            setExistingBaseImage={setExistingBaseImage}
            illuminanceLevelImage={illuminanceLevelImage}
            existingIlluminanceLevelImage={existingIlluminanceLevelImage}
            setIlluminanceLevelImage={setIlluminanceLevelImage}
            setExistingIlluminanceLevelImage={setExistingIlluminanceLevelImage}
            wiringDiagramImage={wiringDiagramImage}
            existingWiringDiagramImage={existingWiringDiagramImage}
            setWiringDiagramImage={setWiringDiagramImage}
            setExistingWiringDiagramImage={setExistingWiringDiagramImage}
            installationImage={installationImage}
            existingInstallationImage={existingInstallationImage}
            setInstallationImage={setInstallationImage}
            setExistingInstallationImage={setExistingInstallationImage}
            wiringLayoutImage={wiringLayoutImage}
            existingWiringLayoutImage={existingWiringLayoutImage}
            setWiringLayoutImage={setWiringLayoutImage}
            setExistingWiringLayoutImage={setExistingWiringLayoutImage}
            terminalLayoutImage={terminalLayoutImage}
            existingTerminalLayoutImage={existingTerminalLayoutImage}
            setTerminalLayoutImage={setTerminalLayoutImage}
            setExistingTerminalLayoutImage={setExistingTerminalLayoutImage}
            accessoriesImage={accessoriesImage}
            existingAccessoriesImage={existingAccessoriesImage}
            setAccessoriesImage={setAccessoriesImage}
            setExistingAccessoriesImage={setExistingAccessoriesImage}
          />
        )}

        {/* Media Assets */}
        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setMediaOpen((o) => !o)}
          >
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Images className="h-4 w-4" />
              Media Assets
              {tdsTemplateUrl && (
                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                  (main photo &amp; drawings → fill in TDS form above)
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
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {tdsTemplateUrl
                      ? "Main Image (synced with TDS)"
                      : "Main Image"}
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

              {!tdsTemplateUrl && (
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
                    </p>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${techDrawingsOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {techDrawingsOpen && (
                    <div className="space-y-4 mt-3">
                      <div className="grid grid-cols-2 gap-4">
                        {renderSimpleDropzone({
                          rootProps: dimensionDrawRoot,
                          inputProps: dimensionDrawInput,
                          file: dimensionDrawingImage,
                          existingUrl: existingDimensionDrawingImage,
                          onClear: () => {
                            setDimensionDrawingImage(null);
                            setExistingDimensionDrawingImage("");
                          },
                          icon: <Ruler className="h-3 w-3" />,
                          label: "Dimension Drawing",
                        })}
                        {renderSimpleDropzone({
                          rootProps: mountHRoot,
                          inputProps: mountHInput,
                          file: mountingHeightImage,
                          existingUrl: existingMountingHeightImage,
                          onClear: () => {
                            setMountingHeightImage(null);
                            setExistingMountingHeightImage("");
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
                    </div>
                  )}
                </div>
              )}

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

        {/* General Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <AlignLeft className="h-4 w-4" />
              General Information
              {tdsTemplateUrl && (
                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                  (description &amp; specs → edit in TDS form)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {!tdsTemplateUrl && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Item Description
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
                    <Label className="text-sm font-medium">Lit Item Code</Label>
                    <Input
                      className="h-10 font-mono"
                      value={litItemCode}
                      onChange={(e) => setLitItemCode(e.target.value)}
                      placeholder="LIT-000"
                    />
                  </div>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Short Description</Label>
              <Input
                className="h-12"
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                placeholder="Brief product description"
              />
            </div>
            {selectedCatId && !tdsTemplateUrl && (
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
                  <div className="flex-shrink-0 w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-md flex items-center justify-center">
                    <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {itemDescription ||
                        editData?.itemDescription ||
                        "Product"}
                      _TDS.pdf
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Filled from family template · Stored on Cloudinary
                    </p>
                  </div>
                </div>
                <a
                  href={tdsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                  >
                    View PDF
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ═══════════════════════ SIDEBAR ═══════════════════════════ */}
      <div className="space-y-6">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-center">
              Classification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
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
              {selectedCatId && (
                <TdsBadge
                  tdsStatus={tdsStatus}
                  tdsTemplateUrl={tdsTemplateUrl}
                />
              )}
            </div>

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
                        : "Select brand..."}
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
                        {selectedBrands.length > 0 && (
                          <CommandItem
                            onSelect={() => setSelectedBrands([])}
                            className="text-xs text-muted-foreground italic"
                          >
                            <X className="mr-2 h-3 w-3" />
                            Clear selection
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
                        {selectedApps.length > 0 && (
                          <CommandItem
                            onSelect={() => setSelectedApps([])}
                            className="text-xs text-muted-foreground italic"
                          >
                            <X className="mr-2 h-3 w-3" />
                            Clear all
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

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <LayoutGrid className="h-3 w-3" />
                <Label className="text-xs font-medium">Product Usage</Label>
              </div>
              <Popover open={usageOpen} onOpenChange={setUsageOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between h-9 text-xs font-medium"
                  >
                    <span className="truncate text-left">
                      {productUsage.length
                        ? productUsage.join(", ")
                        : "Select usage..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  align="start"
                >
                  <Command>
                    <CommandList>
                      <CommandGroup>
                        {PRODUCT_USAGE_OPTIONS.map((opt) => (
                          <CommandItem
                            key={opt}
                            value={opt}
                            onSelect={() =>
                              setProductUsage((p) =>
                                p.includes(opt)
                                  ? p.filter((v) => v !== opt)
                                  : [...p, opt],
                              )
                            }
                            className="text-xs"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-3 w-3",
                                productUsage.includes(opt)
                                  ? "opacity-100 text-primary"
                                  : "opacity-0",
                              )}
                            />
                            {opt}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {productUsage.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {productUsage.map((u) => (
                    <span
                      key={u}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold border border-primary/20"
                    >
                      {u}
                      <button
                        type="button"
                        onClick={() =>
                          setProductUsage((p) => p.filter((v) => v !== u))
                        }
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
                  <div className="w-[104px] h-[104px] flex-shrink-0 bg-muted/50 rounded-md overflow-hidden border">
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
