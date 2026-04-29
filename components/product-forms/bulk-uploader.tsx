"use client";

/**
 * components/product-forms/bulk-uploader.tsx  (REFACTORED)
 *
 * Changes from original:
 *  - Excel parsing now uses column headers (not fixed row positions) to detect fields
 *  - Supports new `itemCodes` schema ({ ECOSHIFT?, LIT?, LUMERA?, OKO?, ZUMTOBEL? })
 *  - At least one itemCode must be filled per row (rows without codes are skipped)
 *  - Legacy litItemCode / ecoItemCode columns still recognised and migrated
 *  - Duplicate check updated to use itemCodes
 *  - TDS generation uses new plain-tabular default (includeBrandAssets = false)
 *  - Excel-only bulk import flow with product class override support
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "@/lib/firestore/client";
import ExcelJS from "exceljs";

import {
  generateTdsPdf,
  uploadTdsPdf,
  normaliseBrand,
  type TdsBrand,
} from "@/lib/tdsGenerator";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/logger";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  PackagePlus,
  Terminal,
  FileUp,
  FileSpreadsheet,
  ChevronRight,
  RefreshCw,
  XCircle,
  FileText,
  Tag,
  Package,
  ImageOff,
  Info,
  Stamp,
} from "lucide-react";

import type {
  ItemCodes,
  ItemCodeBrand,
  ProductClass,
} from "@/types/product";
import {
  ALL_BRANDS,
  ITEM_CODE_BRAND_CONFIG,
  getFilledItemCodes,
  hasAtLeastOneItemCode,
  migrateToItemCodes,
} from "@/types/product";
import { ItemCodesDisplay } from "@/components/ItemCodesDisplay";

// ─── Env ──────────────────────────────────────────────────────────────────────

const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "dvmpn8mjh";
const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "taskflow_preset";
const OWN_CLOUDINARY_BASE = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/`;

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadProductClass = ProductClass;

interface ParsedProduct {
  itemDescription: string;
  // New schema
  itemCodes: ItemCodes;
  // Legacy fields kept for backward compat & duplicate checking
  ecoItemCode: string;
  litItemCode: string;
  productFamily: string;
  productClass: UploadProductClass;
  productUsage: string[];
  brand: TdsBrand;
  mainImageUrl: string;
  rawImageUrl: string;
  galleryImageUrls: string[];
  dimensionalDrawingUrl: string;
  recommendedMountingHeightUrl: string;
  driverCompatibilityUrl: string;
  baseImageUrl: string;
  illuminanceLevelUrl: string;
  wiringDiagramUrl: string;
  installationUrl: string;
  wiringLayoutUrl: string;
  typeOfPlugUrl: string;
  terminalLayoutUrl: string;
  accessoriesImageUrl: string;
  specs: Record<string, { label: string; value: string }[]>;
}

interface ShopifyImage {
  id: number;
  src: string;
  alt: string | null;
  position: number;
}
interface ShopifyVariant {
  id: number;
  sku: string;
  price: string;
  compare_at_price: string | null;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}
interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
}
interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  product_type: string;
  vendor: string;
  status: "active" | "draft" | "archived";
  tags: string;
  images: ShopifyImage[];
  variants: ShopifyVariant[];
  options: { name: string; values: string[] }[];
  metafields?: ShopifyMetafield[];
}
interface RawSpec {
  groupName: string | null;
  label: string;
  value: string;
}
interface TechnicalSpec {
  specGroup: string;
  specs: { name: string; value: string }[];
}
interface ImportStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}
type PreviewTab = "files" | "categories" | "products";

const PRODUCT_CLASS_OPTIONS: {
  value: Exclude<UploadProductClass, "">;
  label: string;
  description: string;
  activeClass: string;
}[] = [
  {
    value: "spf",
    label: "SPF",
    description: "Special product family items",
    activeClass: "border-violet-500 bg-violet-50 text-violet-700",
  },
  {
    value: "standard",
    label: "Standard",
    description: "Regular inventory items",
    activeClass: "border-slate-500 bg-slate-50 text-slate-700",
  },
  {
    value: "non-standard",
    label: "Non-Standard",
    description: "Custom and special-order items",
    activeClass: "border-amber-500 bg-amber-50 text-amber-700",
  },
  {
    value: "usl",
    label: "USL",
    description: "USL-classified catalog items",
    activeClass: "border-sky-500 bg-sky-50 text-sky-700",
  },
];

// ─── Image header map (unchanged from original) ───────────────────────────────

const IMG_HEADER_TO_FIELD: Record<string, keyof ParsedProduct> = {
  "MAIN IMAGE": "mainImageUrl",
  "RAW IMAGE": "rawImageUrl",
  "GALLERY IMAGES": "galleryImageUrls",
  "DIMENSIONAL DRAWING": "dimensionalDrawingUrl",
  "RECOMMENDED MOUNTING HEIGHT": "recommendedMountingHeightUrl",
  "DRIVER COMPATIBILITY": "driverCompatibilityUrl",
  BASE: "baseImageUrl",
  "ILLUMINANCE LEVEL": "illuminanceLevelUrl",
  "WIRING DIAGRAM": "wiringDiagramUrl",
  INSTALLATION: "installationUrl",
  "WIRING LAYOUT": "wiringLayoutUrl",
  "TERMINAL LAYOUT": "terminalLayoutUrl",
  ACCESSORIES: "accessoriesImageUrl",
  "TYPE OF PLUG": "typeOfPlugUrl",
};

// Column headers that map to itemCodes brands
const ITEM_CODE_HEADER_MAP: Record<string, ItemCodeBrand> = {
  "ECOSHIFT ITEM CODE": "ECOSHIFT",
  "ECO ITEM CODE": "ECOSHIFT",
  "ECOITEMCODE": "ECOSHIFT",
  "LIT ITEM CODE": "LIT",
  "LITITEMCODE": "LIT",
  "LIT CODE": "LIT",
  "LUMERA ITEM CODE": "LUMERA",
  "LUMERAITEMCODE": "LUMERA",
  "OKO ITEM CODE": "OKO",
  "OKOITEMCODE": "OKO",
  "ZUMTOBEL ITEM CODE": "ZUMTOBEL",
  "ZUMTOBELITEMCODE": "ZUMTOBEL",
  // Legacy column names
  "ECO CODE": "ECOSHIFT",
  "ECOSHIFT CODE": "ECOSHIFT",
  "LIT BRAND CODE": "LIT",
};

function normaliseProductClass(raw: string): UploadProductClass {
  const s = raw.toLowerCase().trim();
  if (s === "non-standard" || s === "non standard" || s.includes("non-standard") || s.includes("non standard")) return "non-standard";
  if (s === "usl" || s.includes("usl")) return "usl";
  if (s === "spf" || s.includes("spf")) return "spf";
  if (s === "standard" || s.includes("standard")) return "standard";
  return "";
}

function parseProductUsage(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|/]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => ["INDOOR", "OUTDOOR", "SOLAR"].includes(s));
}

function parseGalleryUrls(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "text" in (v as any))
    return String((v as any).text).trim();
  if (typeof v === "object" && "result" in (v as any))
    return String((v as any).result).trim();
  return String(v)
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function buildGroupMap(groupRow: (string | null)[]): Record<number, string> {
  const map: Record<number, string> = {};
  let current = "";
  for (let i = 0; i < groupRow.length; i++) {
    const cell = groupRow[i];
    if (cell && cell.trim()) current = cell.trim();
    if (current) map[i] = current;
  }
  return map;
}

// ─── UPDATED: Parse workbook — header-based field detection ──────────────────

async function parseWorkbook(file: File): Promise<{
  sheetName: string;
  products: ParsedProduct[];
  warnings: string[];
  brandCounts: Record<ItemCodeBrand, number>;
}> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const candidates = wb.worksheets.filter(
    (s) => !/^all\s*products$/i.test(s.name.trim()),
  );
  const ws = candidates[0] ?? wb.worksheets[0];
  if (!ws) throw new Error(`No usable worksheet found in ${file.name}.`);

  const allRows: (string | null)[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: (string | null)[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const hyperlink =
        typeof (cell as any).hyperlink === "string"
          ? ((cell as any).hyperlink as string).trim()
          : null;
      cells[Number(cell.col) - 1] =
        hyperlink ?? (cell.value != null ? cellStr(cell.value) : null);
    });
    allRows.push(cells);
  });

  if (allRows.length < 2)
    throw new Error("Sheet must have at least a header row.");

  const headerRow = allRows[0];
  // Row 2 is spec group row (unchanged from original)
  const groupRow = allRows[1];
  const dataRows = allRows.slice(2);

  // ── Detect column roles from header names ─────────────────────────────────
  // This replaces the fixed identity column approach with header-based detection

  let itemDescriptionCol = -1;
  let productUsageCol = -1;
  let productFamilyCol = -1;
  let productClassCol = -1;
  let brandCol = -1;

  const itemCodeCols: Record<ItemCodeBrand, number> = {
    ECOSHIFT: -1,
    LIT: -1,
    LUMERA: -1,
    OKO: -1,
    ZUMTOBEL: -1,
  };

  const imgColMap: Record<number, keyof ParsedProduct> = {};
  const imgColSet = new Set<number>();

  headerRow.forEach((h, i) => {
    if (!h) return;
    const upper = h.replace(/[\r\n\t]+/g, " ").trim().toUpperCase();

    // Item codes — new schema
    const itemCodeBrand = ITEM_CODE_HEADER_MAP[upper];
    if (itemCodeBrand) {
      itemCodeCols[itemCodeBrand] = i;
      return;
    }

    // Image fields
    const imgField = IMG_HEADER_TO_FIELD[upper];
    if (imgField) {
      imgColMap[i] = imgField;
      imgColSet.add(i);
      return;
    }

    // Core metadata columns (detected by header name)
    if (upper === "ITEM DESCRIPTION" || upper === "ITEMDESCRIPTION" || upper === "DESCRIPTION") {
      itemDescriptionCol = i;
    } else if (upper === "PRODUCT USAGE" || upper === "USAGE" || upper === "PRODUCTUSAGE") {
      productUsageCol = i;
    } else if (
      upper === "PRODUCT FAMILY" ||
      upper === "PRODUCTFAMILY" ||
      upper === "FAMILY" ||
      upper === "CATEGORY"
    ) {
      productFamilyCol = i;
    } else if (upper === "PRODUCT CLASS" || upper === "PRODUCTCLASS" || upper === "CLASS") {
      productClassCol = i;
    } else if (upper === "BRAND") {
      brandCol = i;
    }
  });

  // Spec group map from row 2
  const groupMap = buildGroupMap(groupRow as string[]);

  // Spec label map — skip identity, image, and item-code cols
  const knownNonSpecCols = new Set<number>([
    itemDescriptionCol,
    productUsageCol,
    productFamilyCol,
    productClassCol,
    brandCol,
    ...Object.values(itemCodeCols).filter((c) => c >= 0),
    ...imgColSet,
  ]);

  const specLabelMap: Record<number, string> = {};
  headerRow.forEach((h, i) => {
    if (knownNonSpecCols.has(i)) return;
    if (imgColSet.has(i)) return;
    if (!h || !groupMap[i]) return;
    specLabelMap[i] = h.replace(/[\r\n\t]+/g, " ").trim();
  });

  const galleryCol = Object.entries(imgColMap).find(
    ([, f]) => f === "galleryImageUrls",
  )?.[0];

  const products: ParsedProduct[] = [];
  const warnings: string[] = [];
  const brandCounts: Record<ItemCodeBrand, number> = {
    ECOSHIFT: 0,
    LIT: 0,
    LUMERA: 0,
    OKO: 0,
    ZUMTOBEL: 0,
  };

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx];
    if (!row || row.every((c) => c == null || c === "")) continue;

    const g = (col: number) =>
      col >= 0 ? (row[col]?.trim() ?? "") : "";

    const itemDescription =
      itemDescriptionCol >= 0 ? g(itemDescriptionCol) : "";

    // Build itemCodes from all detected columns
    const itemCodes: ItemCodes = {};
    ALL_BRANDS.forEach((brand) => {
      const col = itemCodeCols[brand];
      if (col >= 0) {
        const val = g(col);
        if (val && val.toUpperCase() !== "N/A") {
          itemCodes[brand] = val.toUpperCase();
        }
      }
    });

    if (!itemDescription) {
      warnings.push(`Row ${rowIdx + 3}: skipped — missing Item Description`);
      continue;
    }

    if (!hasAtLeastOneItemCode(itemCodes)) {
      warnings.push(
        `Row ${rowIdx + 3} ("${itemDescription}"): skipped — no item codes found`,
      );
      continue;
    }

    // Track brand counts
    getFilledItemCodes(itemCodes).forEach(({ brand }) => {
      brandCounts[brand] = (brandCounts[brand] ?? 0) + 1;
    });

    // Legacy fields for backward compat
    const ecoItemCode = itemCodes.ECOSHIFT ?? "";
    const litItemCode = itemCodes.LIT ?? "";

    // Brand for TDS
    const rowBrandRaw = brandCol >= 0 ? g(brandCol) : "";
    const brand = normaliseBrand(rowBrandRaw || (litItemCode ? "LIT" : "ECOSHIFT"));

    // Specs
    const specsByGroup: Record<string, { label: string; value: string }[]> = {};
    for (const [colStr, label] of Object.entries(specLabelMap)) {
      const col = Number(colStr);
      const val = row[col]?.trim();
      if (!val) continue;
      const group = groupMap[col];
      if (!group) continue;
      if (!specsByGroup[group]) specsByGroup[group] = [];
      specsByGroup[group].push({ label, value: val });
    }

    // Single-value image fields
    const imgVals: Partial<Record<keyof ParsedProduct, string>> = {};
    for (const [colStr, field] of Object.entries(imgColMap)) {
      if (field === "galleryImageUrls") continue;
      imgVals[field] = row[Number(colStr)]?.trim() ?? "";
    }

    products.push({
      itemDescription,
      itemCodes,
      ecoItemCode,
      litItemCode,
      productFamily:
        (productFamilyCol >= 0 ? g(productFamilyCol) : "").toUpperCase() ||
        "UNCATEGORISED",
      productClass: normaliseProductClass(
        productClassCol >= 0 ? g(productClassCol) : "",
      ),
      productUsage: parseProductUsage(
        productUsageCol >= 0 ? g(productUsageCol) : "",
      ),
      brand,
      mainImageUrl: imgVals.mainImageUrl ?? "",
      rawImageUrl: imgVals.rawImageUrl ?? "",
      galleryImageUrls:
        galleryCol !== undefined && Number(galleryCol) >= 0
          ? parseGalleryUrls(g(Number(galleryCol)))
          : [],
      dimensionalDrawingUrl: imgVals.dimensionalDrawingUrl ?? "",
      recommendedMountingHeightUrl: imgVals.recommendedMountingHeightUrl ?? "",
      driverCompatibilityUrl: imgVals.driverCompatibilityUrl ?? "",
      baseImageUrl: imgVals.baseImageUrl ?? "",
      illuminanceLevelUrl: imgVals.illuminanceLevelUrl ?? "",
      wiringDiagramUrl: imgVals.wiringDiagramUrl ?? "",
      installationUrl: imgVals.installationUrl ?? "",
      wiringLayoutUrl: imgVals.wiringLayoutUrl ?? "",
      terminalLayoutUrl: imgVals.terminalLayoutUrl ?? "",
      accessoriesImageUrl: imgVals.accessoriesImageUrl ?? "",
      typeOfPlugUrl: imgVals.typeOfPlugUrl ?? "",
      specs: specsByGroup,
    });
  }

  return { sheetName: ws.name, products, warnings, brandCounts };
}

// ─── Cloudinary helpers (unchanged from original) ─────────────────────────────

async function uploadUrlToCloudinary(url: string): Promise<string> {
  if (!url) return "";
  if (url.startsWith(OWN_CLOUDINARY_BASE)) return url;
  const driveMatch = url.match(
    /drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/,
  );
  const resolved = driveMatch
    ? `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`
    : url;
  const fd = new FormData();
  fd.append("file", resolved);
  fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: fd },
  );
  if (!res.ok)
    throw new Error(
      `Cloudinary upload failed (${res.status}) for: ${resolved}`,
    );
  return (await res.json()).secure_url as string;
}

async function safeUploadUrl(
  url: string,
  log: (m: string) => void,
): Promise<string> {
  if (!url) return "";
  try {
    return await uploadUrlToCloudinary(url);
  } catch (e: any) {
    log(`    ⚠️  Image upload skipped (${url.slice(0, 60)}…): ${e.message}`);
    return "";
  }
}

async function uploadManyUrls(
  urls: string[],
  log: (m: string) => void,
  concurrency = 3,
): Promise<string[]> {
  const out: string[] = new Array(urls.length).fill("");
  for (let i = 0; i < urls.length; i += concurrency) {
    const chunk = urls.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      chunk.map((u) => safeUploadUrl(u, log)),
    );
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") out[i + j] = r.value;
    });
  }
  return out;
}

// ─── UPDATED: Duplicate check using itemCodes ─────────────────────────────────

function isNaValue(code: string): boolean {
  return !code || code.trim().toUpperCase() === "N/A";
}

async function checkDuplicate(itemCodes: ItemCodes): Promise<{
  isDuplicate: boolean;
  reason: string;
}> {
  const filled = getFilledItemCodes(itemCodes);

  // If all codes are N/A or empty, bypass
  if (filled.length === 0) return { isDuplicate: false, reason: "" };

  for (const { brand, code } of filled) {
    // Check both new schema and legacy fields
    const fieldToCheck = brand === "ECOSHIFT" ? "ecoItemCode" : brand === "LIT" ? "litItemCode" : null;

    // Check new schema field
    const snapNew = await getDocs(
      query(
        collection(db, "products"),
        where(`itemCodes.${brand}`, "==", code),
      ),
    );
    if (!snapNew.empty)
      return { isDuplicate: true, reason: `${brand} item code "${code}"` };

    // Legacy field check
    if (fieldToCheck) {
      const snapLegacy = await getDocs(
        query(
          collection(db, "products"),
          where(fieldToCheck, "==", code),
        ),
      );
      if (!snapLegacy.empty)
        return { isDuplicate: true, reason: `${brand} item code "${code}" (legacy)` };
    }
  }

  return { isDuplicate: false, reason: "" };
}

// ─── Shopify helpers (unchanged from original) ────────────────────────────────

function toSlugShopify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parsePrice(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function extractRawSpecs(product: ShopifyProduct): RawSpec[] {
  const specs: RawSpec[] = [];
  const metafields = product.metafields ?? [];
  for (const mf of metafields) {
    if (!mf.value) continue;
    const isUngrouped =
      !mf.namespace || mf.namespace === "custom" || mf.namespace === "global";
    specs.push({
      groupName: isUngrouped ? null : mf.namespace.toUpperCase(),
      label: mf.key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      value: mf.value,
    });
  }
  const OPTION_KEYS = ["option1", "option2", "option3"] as const;
  const primaryVariant = product.variants[0];
  for (let i = 0; i < product.options.length; i++) {
    const option = product.options[i];
    if (
      option.name.toLowerCase() === "title" &&
      option.values[0] === "Default Title"
    )
      continue;
    const optionKey = OPTION_KEYS[i];
    const rawValue =
      (optionKey && primaryVariant?.[optionKey]) ?? option.values[0] ?? "";
    if (!rawValue) continue;
    const parts = option.name.split("/");
    if (parts.length >= 2) {
      specs.push({
        groupName: parts[0].trim().toUpperCase(),
        label: parts.slice(1).join("/").trim(),
        value: rawValue,
      });
    } else {
      specs.push({ groupName: null, label: option.name, value: rawValue });
    }
  }
  return specs;
}

// ─── Shared Firestore helpers (unchanged from original) ───────────────────────

async function findDoc(
  col: string,
  field: string,
  value: string,
): Promise<string | null> {
  const snap = await getDocs(
    query(collection(db, col), where(field, "==", value)),
  );
  return snap.empty ? null : snap.docs[0].id;
}

async function upsertSpecGroup(
  groupName: string,
  labels: string[],
): Promise<string> {
  const existingId = await findDoc("specs", "name", groupName);
  if (existingId) {
    const snap = await getDocs(
      query(collection(db, "specs"), where("name", "==", groupName)),
    );
    const existing = snap.docs[0];
    const items: { label: string }[] = existing.data().items ?? [];
    const set = new Set(items.map((i) => i.label));
    const merged = [
      ...items,
      ...labels.filter((l) => !set.has(l)).map((l) => ({ label: l })),
    ];
    await updateDoc(doc(db, "specs", existingId), {
      items: merged,
      updatedAt: serverTimestamp(),
    });
    return existingId;
  }
  const ref = await addDoc(collection(db, "specs"), {
    name: groupName,
    items: labels.map((l) => ({ label: l })),
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

type FamilySpecItemsByGroupId = Record<string, Set<string>>;

function buildSpecItemId(specGroupId: string, label: string) {
  return `${specGroupId}:${label.toUpperCase().trim()}`;
}

async function upsertProductFamily(
  title: string,
  specGroupIds: string[],
  specItemsByGroupId: FamilySpecItemsByGroupId = {},
): Promise<string> {
  const existingId = await findDoc("productfamilies", "title", title);
  if (existingId) {
    const snap = await getDocs(
      query(collection(db, "productfamilies"), where("title", "==", title)),
    );
    const existing = snap.docs[0];
    const data = existing.data() as any;
    const existingSpecs: string[] = data.specifications ?? [];
    const mergedGroupIds = Array.from(
      new Set<string>([...existingSpecs, ...specGroupIds]),
    );

    const existingSpecsArray: {
      specGroupId: string;
      specItems?: { id: string; name: string }[];
    }[] = Array.isArray(data.specs) ? data.specs : [];

    const specsMap = new Map<
      string,
      { specGroupId: string; specItems: { id: string; name: string }[] }
    >();
    for (const g of existingSpecsArray) {
      specsMap.set(g.specGroupId, {
        specGroupId: g.specGroupId,
        specItems: Array.isArray(g.specItems) ? g.specItems : [],
      });
    }

    for (const groupId of specGroupIds) {
      const labelsSet = specItemsByGroupId[groupId];
      if (!labelsSet || labelsSet.size === 0) continue;
      const existingGroup = specsMap.get(groupId) ?? {
        specGroupId: groupId,
        specItems: [],
      };
      const existingItemIds = new Set(
        existingGroup.specItems.map((it) => it.id),
      );
      for (const rawLabel of labelsSet) {
        const label = rawLabel.toUpperCase().trim();
        if (!label) continue;
        const id = buildSpecItemId(groupId, label);
        if (existingItemIds.has(id)) continue;
        existingGroup.specItems.push({ id, name: label });
        existingItemIds.add(id);
      }
      specsMap.set(groupId, existingGroup);
    }

    await updateDoc(doc(db, "productfamilies", existingId), {
      specifications: mergedGroupIds,
      specs: Array.from(specsMap.values()),
      updatedAt: serverTimestamp(),
    });
    return existingId;
  }

  const specsArray: {
    specGroupId: string;
    specItems: { id: string; name: string }[];
  }[] = [];
  for (const groupId of specGroupIds) {
    const labelsSet = specItemsByGroupId[groupId];
    if (!labelsSet || labelsSet.size === 0) continue;
    const items: { id: string; name: string }[] = [];
    for (const rawLabel of labelsSet) {
      const label = rawLabel.toUpperCase().trim();
      if (!label) continue;
      items.push({ id: buildSpecItemId(groupId, label), name: label });
    }
    if (items.length > 0)
      specsArray.push({ specGroupId: groupId, specItems: items });
  }

  const ref = await addDoc(collection(db, "productfamilies"), {
    title,
    description: "",
    image: "",
    imageUrl: "",
    isActive: true,
    specifications: specGroupIds,
    specs: specsArray,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// Shopify spec resolution (unchanged from original)
async function upsertStandaloneSpecItem(label: string): Promise<void> {
  const existingId = await findDoc("specItems", "label", label);
  if (existingId) return;
  await addDoc(collection(db, "specItems"), {
    label,
    createdAt: serverTimestamp(),
  });
}

async function resolveShopifySpecs(rawSpecs: RawSpec[]): Promise<{
  technicalSpecs: TechnicalSpec[];
  specGroupIds: string[];
  specGroupIdByName: Record<string, string>;
  familySpecItemsByGroupId: FamilySpecItemsByGroupId;
}> {
  const grouped = new Map<string, { name: string; value: string }[]>();
  const ungrouped: { name: string; value: string }[] = [];
  for (const spec of rawSpecs) {
    if (spec.groupName) {
      if (!grouped.has(spec.groupName)) grouped.set(spec.groupName, []);
      grouped
        .get(spec.groupName)!
        .push({ name: spec.label, value: spec.value });
    } else {
      ungrouped.push({ name: spec.label, value: spec.value });
    }
  }
  const specGroupIds: string[] = [];
  const technicalSpecs: TechnicalSpec[] = [];
  const specGroupIdByName: Record<string, string> = {};
  const familySpecItemsByGroupId: FamilySpecItemsByGroupId = {};

  for (const [groupName, entries] of grouped.entries()) {
    const id = await upsertSpecGroup(
      groupName,
      entries.map((e) => e.name),
    );
    specGroupIds.push(id);
    specGroupIdByName[groupName] = id;
    if (!familySpecItemsByGroupId[id]) familySpecItemsByGroupId[id] = new Set();
    entries.forEach((e) =>
      familySpecItemsByGroupId[id].add(e.name.toUpperCase().trim()),
    );
    technicalSpecs.push({ specGroup: groupName, specs: entries });
  }
  if (ungrouped.length > 0) {
    await Promise.all(ungrouped.map((s) => upsertStandaloneSpecItem(s.name)));
    const UNGROUPED = "UNGROUPED SPECIFICATIONS";
    const id = await upsertSpecGroup(
      UNGROUPED,
      ungrouped.map((s) => s.name),
    );
    specGroupIds.push(id);
    specGroupIdByName[UNGROUPED] = id;
    if (!familySpecItemsByGroupId[id]) familySpecItemsByGroupId[id] = new Set();
    ungrouped.forEach((s) =>
      familySpecItemsByGroupId[id].add(s.name.toUpperCase().trim()),
    );
    technicalSpecs.push({ specGroup: UNGROUPED, specs: ungrouped });
  }
  return {
    technicalSpecs,
    specGroupIds,
    specGroupIdByName,
    familySpecItemsByGroupId,
  };
}

async function normalizeShopifyProduct(
  product: ShopifyProduct,
  log: (msg: string) => void,
) {
  const pv = product.variants[0];
  const skuCode = pv?.sku?.trim() || String(product.id);
  const productFamily = (
    product.product_type?.trim() || "UNCATEGORISED"
  ).toUpperCase();
  const brand = product.vendor?.trim() || "";
  const itemDescription = product.title.trim();
  const shortDescription = stripHtml(product.body_html ?? "").slice(0, 250);
  const slug = toSlugShopify(product.handle || itemDescription);
  const rawCompare = parsePrice(pv?.compare_at_price);
  const rawPrice = parsePrice(pv?.price);
  const regularPrice = rawCompare > rawPrice ? rawCompare : rawPrice;
  const salePrice = rawCompare > rawPrice ? rawPrice : 0;

  log(`  → Uploading images for "${itemDescription}"...`);
  const sortedImages = [...product.images].sort(
    (a, b) => a.position - b.position,
  );
  const uploaded = await uploadManyUrls(
    sortedImages.map((img) => img.src),
    log,
  );
  const mainImage = uploaded[0] ?? "";
  const rawImage = uploaded[1] ?? "";

  const { autoMatchImages } = await import("@/lib/imageMapping");
  const imageFiles = uploaded.slice(2).map((url, idx) => ({
    url,
    name: product.images[idx + 2]?.alt || `image-${idx}`,
  }));
  const imageMatches = autoMatchImages(imageFiles);

  log(`  → Extracting specs...`);
  const rawSpecs = extractRawSpecs(product);
  log(`  → Resolving ${rawSpecs.length} spec(s)...`);
  const { technicalSpecs, specGroupIds, familySpecItemsByGroupId } =
    await resolveShopifySpecs(rawSpecs);

  log(`  → Upserting product family "${productFamily}"...`);
  await upsertProductFamily(
    productFamily,
    specGroupIds,
    familySpecItemsByGroupId,
  );

  // Build itemCodes for Shopify products (SKU maps to ECOSHIFT by convention)
  const itemCodes: ItemCodes = {};
  if (skuCode) itemCodes.ECOSHIFT = skuCode;

  return {
    productClass: "" as const,
    itemDescription,
    shortDescription,
    slug,
    itemCodes,
    ecoItemCode: skuCode,
    litItemCode: "",
    regularPrice,
    salePrice,
    technicalSpecs,
    mainImage,
    rawImage,
    qrCodeImage: "",
    galleryImages: uploaded.slice(2),
    dimensionalDrawingImage: imageMatches.dimensionalDrawing || "",
    recommendedMountingHeightImage: imageMatches.mountingHeight || "",
    driverCompatibilityImage: imageMatches.driverCompatibility || "",
    baseImage: imageMatches.base || "",
    illuminanceLevelImage: imageMatches.illuminanceLevel || "",
    wiringDiagramImage: imageMatches.wiringDiagram || "",
    installationImage: imageMatches.installation || "",
    wiringLayoutImage: imageMatches.wiringLayout || "",
    terminalLayoutImage: imageMatches.terminalLayout || "",
    accessoriesImage: imageMatches.accessories || "",
    website: [] as string[],
    websites: [] as string[],
    productFamily,
    brand,
    applications: [] as string[],
    status: "draft" as const,
    seo: {
      itemDescription,
      description: shortDescription,
      canonical: "",
      ogImage: mainImage,
      robots: "index, follow",
      lastUpdated: new Date().toISOString(),
    },
    importSource: "shopify-importer" as const,
    shopifyProductId: product.id,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
      <span
        className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-white/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}
      >
        {count}
      </span>
    </button>
  );
}

function FilesPanel({
  fileSummary,
}: {
  fileSummary: {
    name: string;
    sheetName: string;
    productCount: number;
    families: Set<string>;
    warnings: string[];
    brandCounts: Record<ItemCodeBrand, number>;
  }[];
}) {
  return (
    <div className="h-full overflow-y-auto space-y-2 pr-1">
      {fileSummary.map((file, idx) => (
        <div key={idx} className="rounded-lg border bg-card p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{file.name}</p>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                Sheet: <span className="text-foreground">{file.sheetName}</span>
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {file.productCount} products
            </Badge>
          </div>

          {/* Brand counts */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(ALL_BRANDS as ItemCodeBrand[])
              .filter((b) => (file.brandCounts[b] ?? 0) > 0)
              .map((brand) => {
                const config = ITEM_CODE_BRAND_CONFIG[brand];
                return (
                  <div key={brand} className="flex items-center gap-1">
                    <span
                      className={`inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-[9px] font-bold ${config.badgeClass}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`}
                      />
                      {config.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {file.brandCounts[brand]}
                    </span>
                  </div>
                );
              })}
          </div>

          <div className="flex flex-wrap gap-1 mb-2">
            {Array.from(file.families).map((f) => (
              <Badge
                key={f}
                variant="outline"
                className="text-[10px] font-normal"
              >
                {f}
              </Badge>
            ))}
          </div>
          {file.warnings.length > 0 && (
            <div className="mt-2 space-y-1">
              {file.warnings.map((w, wi) => (
                <p
                  key={wi}
                  className="text-[10px] text-amber-600 flex items-start gap-1"
                >
                  <AlertCircle className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ExcelCategoriesPanel({
  categorySummary,
  allProducts,
}: {
  categorySummary: Record<string, number>;
  allProducts: ParsedProduct[];
}) {
  return (
    <div className="h-full overflow-y-auto space-y-2 pr-1">
      {Object.entries(categorySummary).map(([family, count]) => {
        const specGroups = new Set(
          allProducts
            .filter((p) => p.productFamily === family)
            .flatMap((p) => Object.keys(p.specs)),
        );
        return (
          <div key={family} className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">{family}</span>
              <Badge variant="secondary" className="text-xs">
                {count} products
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1">
              {Array.from(specGroups).map((g) => (
                <Badge
                  key={g}
                  variant="outline"
                  className="text-[10px] font-normal"
                >
                  {g}
                </Badge>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExcelProductsPanel({
  uploadedFiles,
}: {
  uploadedFiles: { name: string; products: ParsedProduct[] }[];
}) {
  return (
    <div className="h-full flex flex-col rounded-lg border overflow-hidden">
      <div className="grid grid-cols-[1fr_100px_140px_32px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/60 px-3 py-2 border-b shrink-0">
        <span>Item Description</span>
        <span>Family</span>
        <span>Item Codes</span>
        <span className="text-center">Img</span>
      </div>
      <div className="flex-1 overflow-y-auto divide-y">
        {uploadedFiles.map((file, fileIdx) =>
          file.products.map((p, prodIdx) => (
            <div
              key={`${fileIdx}-${prodIdx}`}
              className="grid grid-cols-[1fr_100px_140px_32px] items-center px-3 py-2 text-xs hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0 pr-2">
                <p className="font-medium truncate">{p.itemDescription}</p>
              </div>
              <span className="text-muted-foreground text-[10px] truncate pr-2">
                {p.productFamily}
              </span>
              <div className="pr-2">
                <ItemCodesDisplay itemCodes={p.itemCodes} size="sm" maxVisible={2} />
              </div>
              <span className="flex justify-center">
                {p.mainImageUrl ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                )}
              </span>
            </div>
          )),
        )}
      </div>
    </div>
  );
}

function ShopifyCategoriesPanel({ products }: { products: ShopifyProduct[] }) {
  const summary = products.reduce<Record<string, number>>((acc, p) => {
    const fam = (p.product_type?.trim() || "UNCATEGORISED").toUpperCase();
    acc[fam] = (acc[fam] || 0) + 1;
    return acc;
  }, {});
  return (
    <div className="h-full overflow-y-auto space-y-2 pr-1">
      {Object.entries(summary).map(([cat, count]) => (
        <div
          key={cat}
          className="rounded-lg border bg-card p-3 flex items-center justify-between"
        >
          <div>
            <p className="text-sm font-semibold">{cat}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Product family
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {count} products
          </Badge>
        </div>
      ))}
    </div>
  );
}

function ShopifyProductsPanel({ products }: { products: ShopifyProduct[] }) {
  return (
    <div className="h-full flex flex-col rounded-lg border overflow-hidden">
      <div className="grid grid-cols-[1fr_120px_100px_32px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/60 px-3 py-2 border-b shrink-0">
        <span>Title</span>
        <span>Family</span>
        <span>SKU</span>
        <span className="text-center">Img</span>
      </div>
      <div className="flex-1 overflow-y-auto divide-y">
        {products.map((p) => {
          const sku = p.variants[0]?.sku || "—";
          const family = (p.product_type?.trim() || "—").toUpperCase();
          return (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_120px_100px_32px] items-center px-3 py-2 text-xs hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0 pr-2">
                <p className="font-medium truncate">{p.title}</p>
                <p className="text-muted-foreground font-mono text-[10px]">
                  ID: {p.id}
                </p>
              </div>
              <span className="text-muted-foreground text-[10px] truncate pr-2">
                {family}
              </span>
              <span className="font-mono text-muted-foreground text-[10px] pr-2 truncate">
                {sku}
              </span>
              <span className="flex justify-center">
                {p.images.length > 0 ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <ImageOff className="w-3.5 h-3.5 text-amber-400" />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BulkUploader({
  onUploadComplete,
}: {
  onUploadComplete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<ImportStats>({
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
  });
  const [logs, setLogs] = useState<
    { type: "ok" | "err" | "skip" | "info" | "warn"; msg: string }[]
  >([]);
  const [currentItem, setCurrentItem] = useState("");
  const [step, setStep] = useState<
    "idle" | "preview" | "importing" | "done" | "cancelled"
  >("idle");
  const [activeTab, setActiveTab] = useState<PreviewTab>("files");
  const [selectedProductClass, setSelectedProductClass] =
    useState<UploadProductClass>("");
  const [uploadedFiles, setUploadedFiles] = useState<
    {
      name: string;
      sheetName: string;
      products: ParsedProduct[];
      warnings: string[];
      brandCounts: Record<ItemCodeBrand, number>;
    }[]
  >([]);

  const cancelledRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback(
    (type: "ok" | "err" | "skip" | "info" | "warn", msg: string) => {
      setLogs((prev) => [
        ...prev,
        { type, msg: `${new Date().toLocaleTimeString()} ${msg}` },
      ]);
    },
    [],
  );

  const handleFileDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    addLog("info", `📂 Parsing ${files.length} file(s)...`);
    const parsed: typeof uploadedFiles = [];
    for (const file of files) {
      try {
        const { sheetName, products, warnings, brandCounts } =
          await parseWorkbook(file);
        parsed.push({
          name: file.name,
          sheetName,
          products,
          warnings,
          brandCounts,
        });
        const brandSummary = (ALL_BRANDS as ItemCodeBrand[])
          .filter((b) => brandCounts[b] > 0)
          .map((b) => `${ITEM_CODE_BRAND_CONFIG[b].label}: ${brandCounts[b]}`)
          .join(", ");
        addLog(
          "info",
          `  ✅ ${file.name}: ${products.length} products${brandSummary ? ` [${brandSummary}]` : ""}`,
        );
        warnings.forEach((w) => addLog("warn", `  ⚠️  ${w}`));
      } catch (err: any) {
        addLog("err", `  ❌ ${file.name}: ${err.message}`);
      }
    }
    if (!parsed.length) {
      toast.error("No files were successfully parsed");
      return;
    }
    setUploadedFiles(parsed);
    setActiveTab("files");
    setStep("preview");
    const total = parsed.reduce((s, f) => s + f.products.length, 0);
    addLog(
      "info",
      `✅ Parsed ${parsed.length} file(s) — ${total} valid products`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
    multiple: true,
    disabled: step !== "idle" || importing,
  });

  const handleCancel = () => {
    cancelledRef.current = true;
    addLog(
      "warn",
      "⚠️  Cancellation requested — stopping after current item...",
    );
  };

  // ── UPDATED: Run JARIS Excel import with new itemCodes schema ──────────────

  const runExcelImport = async () => {
    const allProducts = uploadedFiles.flatMap((f) => f.products);
    if (!allProducts.length) return;
    const classModeLabel =
      selectedProductClass === ""
        ? "from Excel column"
        : (PRODUCT_CLASS_OPTIONS.find((opt) => opt.value === selectedProductClass)
            ?.label ?? selectedProductClass);

    cancelledRef.current = false;
    setImporting(true);
    setStep("importing");
    setProgress(0);
    setStats({ total: allProducts.length, success: 0, failed: 0, skipped: 0 });
    addLog(
      "info",
      `🚀 Starting JARIS import of ${allProducts.length} products from ${uploadedFiles.length} file(s) — class: ${classModeLabel}...`,
    );

    // Phase 1: Upsert spec groups (unchanged)
    const allSpecGroups: Record<string, Set<string>> = {};
    const familyToGroups: Record<string, Set<string>> = {};
    const familySpecItems: Record<string, FamilySpecItemsByGroupId> = {};

    for (const p of allProducts) {
      const familyTitle = p.productFamily;
      if (!familyToGroups[familyTitle]) familyToGroups[familyTitle] = new Set();
      if (!familySpecItems[familyTitle]) familySpecItems[familyTitle] = {};
      for (const [groupName, specEntries] of Object.entries(p.specs)) {
        if (!allSpecGroups[groupName]) allSpecGroups[groupName] = new Set();
        specEntries.forEach((e) => allSpecGroups[groupName].add(e.label));
        familyToGroups[familyTitle].add(groupName);
        if (!familySpecItems[familyTitle][groupName])
          familySpecItems[familyTitle][groupName] = new Set();
        specEntries.forEach((e) => {
          const label = e.label.toUpperCase().trim();
          if (label) familySpecItems[familyTitle][groupName].add(label);
        });
      }
    }

    addLog(
      "info",
      `🗂️  Upserting ${Object.keys(allSpecGroups).length} spec group(s)...`,
    );
    const specGroupIds: Record<string, string> = {};
    for (const [groupName, labelsSet] of Object.entries(allSpecGroups)) {
      try {
        const id = await upsertSpecGroup(groupName, Array.from(labelsSet));
        specGroupIds[groupName] = id;
        addLog("info", `  ✓ Spec group "${groupName}" → ${id}`);
      } catch (err: any) {
        addLog("err", `  ✗ Spec group "${groupName}": ${err.message}`);
      }
    }

    // Phase 2: Upsert product families (unchanged)
    addLog(
      "info",
      `📦 Upserting ${Object.keys(familyToGroups).length} product famil(ies)...`,
    );
    for (const [familyTitle, groupNames] of Object.entries(familyToGroups)) {
      const specIds = Array.from(groupNames)
        .map((g) => specGroupIds[g])
        .filter(Boolean);
      const byGroupId: FamilySpecItemsByGroupId = {};
      const perFamily = familySpecItems[familyTitle] ?? {};
      for (const groupName of groupNames) {
        const gid = specGroupIds[groupName];
        if (!gid) continue;
        const labels = perFamily[groupName]
          ? Array.from(perFamily[groupName])
          : [];
        if (!byGroupId[gid]) byGroupId[gid] = new Set();
        labels.forEach((lbl) => byGroupId[gid].add(lbl.toUpperCase().trim()));
      }
      try {
        const id = await upsertProductFamily(familyTitle, specIds, byGroupId);
        addLog("info", `  ✓ Product family "${familyTitle}" → ${id}`);
      } catch (err: any) {
        addLog("err", `  ✗ Product family "${familyTitle}": ${err.message}`);
      }
    }

    // Phase 3: Import products
    addLog("info", `\n📝 Importing products...`);

    for (let i = 0; i < allProducts.length; i++) {
      if (cancelledRef.current) {
        const remaining = allProducts.length - i;
        addLog(
          "warn",
          `🛑 Import cancelled. ${i} processed, ${remaining} remaining skipped.`,
        );
        setStats((prev) => ({ ...prev, skipped: prev.skipped + remaining }));
        break;
      }

      const p = allProducts[i];
      const productClass = selectedProductClass || p.productClass || "";
      const displayCode = getFilledItemCodes(p.itemCodes)
        .map(({ brand, code }) => `${brand}:${code}`)
        .join(" / ") || "NO CODE";
      setCurrentItem(`${displayCode} — ${p.itemDescription}`);

      try {
        // UPDATED: Use new itemCodes-based duplicate check
        const { isDuplicate, reason } = await checkDuplicate(p.itemCodes);
        if (isDuplicate) {
          addLog(
            "skip",
            `⏭  SKIPPED (duplicate ${reason}): ${p.itemDescription}`,
          );
          setStats((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
          setProgress(((i + 1) / allProducts.length) * 100);
          await new Promise((r) => setTimeout(r, 20));
          continue;
        }

        addLog("info", `  → Uploading images for "${p.itemDescription}"...`);
        const [
          mainImage,
          rawImageUploaded,
          dimensionalDrawingImage,
          recommendedMountingHeightImage,
          driverCompatibilityImage,
          baseImage,
          illuminanceLevelImage,
          wiringDiagramImage,
          installationImage,
          wiringLayoutImage,
          terminalLayoutImage,
          accessoriesImage,
          typeOfPlugImage,
          ...galleryUploaded
        ] = await uploadManyUrls(
          [
            p.mainImageUrl,
            p.rawImageUrl,
            p.dimensionalDrawingUrl,
            p.recommendedMountingHeightUrl,
            p.driverCompatibilityUrl,
            p.baseImageUrl,
            p.illuminanceLevelUrl,
            p.wiringDiagramUrl,
            p.installationUrl,
            p.wiringLayoutUrl,
            p.terminalLayoutUrl,
            p.accessoriesImageUrl,
            p.typeOfPlugUrl,
            ...p.galleryImageUrls,
          ],
          (m) => addLog("info", m),
        );

        const rawImage = rawImageUploaded || mainImage || "";

        const technicalSpecs = Object.entries(p.specs)
          .map(([specGroup, entries]) => ({
            specGroup: specGroup.toUpperCase().trim(),
            specs: entries
              .filter((e) => {
                const v = e.value.toUpperCase().trim();
                return v !== "" && v !== "N/A";
              })
              .map((e) => ({
                name: e.label.toUpperCase().trim(),
                value: e.value.toUpperCase().trim(),
              })),
          }))
          .filter((group) => group.specs.length > 0);

        const slug = (p.ecoItemCode || p.litItemCode || p.itemDescription)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-");

        // UPDATED: Save with new itemCodes field + legacy fields for compat
        const docRef = await addDoc(collection(db, "products"), {
          productClass,
          itemDescription: p.itemDescription,
          shortDescription: "",
          slug,
          // New schema
          itemCodes: p.itemCodes,
          // Legacy fields preserved for backward compat
          ecoItemCode: p.ecoItemCode,
          litItemCode: p.litItemCode,
          regularPrice: 0,
          salePrice: 0,
          technicalSpecs,
          mainImage: mainImage || "",
          rawImage,
          qrCodeImage: "",
          galleryImages: galleryUploaded.filter(Boolean),
          dimensionalDrawingImage: dimensionalDrawingImage || "",
          recommendedMountingHeightImage: recommendedMountingHeightImage || "",
          driverCompatibilityImage: driverCompatibilityImage || "",
          baseImage: baseImage || "",
          illuminanceLevelImage: illuminanceLevelImage || "",
          wiringDiagramImage: wiringDiagramImage || "",
          installationImage: installationImage || "",
          wiringLayoutImage: wiringLayoutImage || "",
          terminalLayoutImage: terminalLayoutImage || "",
          accessoriesImage: accessoriesImage || "",
          typeOfPlugImage: typeOfPlugImage || "",
          brand: p.brand,
          productFamily: p.productFamily,
          productUsage: p.productUsage,
          applications: [],
          website: [],
          websites: [],
          status: "draft",
          seo: {
            title: p.itemDescription,
            description: "",
            canonical: "",
            ogImage: mainImage || "",
            robots: "index, follow",
            lastUpdated: new Date().toISOString(),
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          importSource: "bulk-uploader:jaris",
        });

        addLog("info", `  → Saved product doc ${docRef.id}`);

        // UPDATED: TDS generation — plain tabular (no brand assets) by default
        if (technicalSpecs.length > 0) {
          try {
            addLog(
              "info",
              `  → Generating TDS PDF for "${p.itemDescription}"...`,
            );

            const tdsBlob = await generateTdsPdf({
              itemDescription: p.itemDescription,
              itemCodes: p.itemCodes,
              litItemCode: p.litItemCode,
              technicalSpecs,
              brand: p.brand,
              // Default: plain tabular output (no brand assets)
              includeBrandAssets: false,
              mainImageUrl: mainImage || undefined,
              rawImageUrl: rawImageUploaded || undefined,
              dimensionalDrawingUrl: dimensionalDrawingImage || undefined,
              recommendedMountingHeightUrl:
                recommendedMountingHeightImage || undefined,
              driverCompatibilityUrl: driverCompatibilityImage || undefined,
              baseImageUrl: baseImage || undefined,
              illuminanceLevelUrl: illuminanceLevelImage || undefined,
              wiringDiagramUrl: wiringDiagramImage || undefined,
              installationUrl: installationImage || undefined,
              wiringLayoutUrl: wiringLayoutImage || undefined,
              typeOfPlugUrl: typeOfPlugImage || undefined,
              terminalLayoutUrl: terminalLayoutImage || undefined,
              accessoriesImageUrl: accessoriesImage || undefined,
            });

            const primaryCode = getFilledItemCodes(p.itemCodes)[0]?.code || p.itemDescription;
            const tdsFileUrl = await uploadTdsPdf(
              tdsBlob,
              `${primaryCode}_TDS.pdf`,
              CLOUDINARY_CLOUD_NAME,
              CLOUDINARY_UPLOAD_PRESET,
            );

            if (tdsFileUrl.startsWith("http")) {
              await updateDoc(doc(db, "products", docRef.id), {
                tdsFileUrl,
                updatedAt: serverTimestamp(),
              });
              addLog(
                "ok",
                `  ✅ TDS PDF generated for "${p.itemDescription}"`,
              );
            }
          } catch (tdsErr: any) {
            addLog(
              "warn",
              `  ⚠️  TDS generation failed for "${p.itemDescription}": ${tdsErr.message}`,
            );
          }
        } else {
          addLog(
            "info",
            `  ℹ️  No specs — TDS skipped for "${p.itemDescription}"`,
          );
        }

        await logAuditEvent({
          action: "create",
          entityType: "product",
          entityId: docRef.id,
          entityName: p.itemDescription,
          context: {
            page: "/products/all-products",
            source: "bulk-uploader",
            collection: "products",
          },
          metadata: {
            itemCodes: p.itemCodes,
            ecoItemCode: p.ecoItemCode || null,
            litItemCode: p.litItemCode || null,
            productFamily: p.productFamily,
            brand: p.brand,
          },
        });

        addLog("ok", `✅ ${displayCode} — ${p.itemDescription}`);
        setStats((prev) => ({ ...prev, success: prev.success + 1 }));
      } catch (err: any) {
        addLog("err", `❌ FAILED "${p.itemDescription}": ${err.message}`);
        setStats((prev) => ({ ...prev, failed: prev.failed + 1 }));
      }

      setProgress(((i + 1) / allProducts.length) * 100);
      await new Promise((r) => setTimeout(r, 40));
    }

    finishImport();
  };

  const finishImport = () => {
    setImporting(false);
    setCurrentItem("");
    if (cancelledRef.current) {
      setStep("cancelled");
      addLog("warn", "🛑 Import was cancelled by user.");
      toast.warning("Import cancelled.");
    } else {
      setStep("done");
      addLog("info", "🏁 Import complete.");
      toast.success("Import complete!");
      onUploadComplete?.();
    }
  };

  const reset = () => {
    setStep("idle");
    setLogs([]);
    setUploadedFiles([]);
    setSelectedProductClass("");
    setStats({ total: 0, success: 0, failed: 0, skipped: 0 });
    setProgress(0);
    setCurrentItem("");
    cancelledRef.current = false;
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const excelAllProducts = uploadedFiles.flatMap((f) => f.products);
  const excelFamilySummary = excelAllProducts.reduce<Record<string, number>>(
    (acc, p) => {
      acc[p.productFamily] = (acc[p.productFamily] || 0) + 1;
      return acc;
    },
    {},
  );

  const fileSummary = uploadedFiles.map((file) => ({
    name: file.name,
    sheetName: file.sheetName,
    productCount: file.products.length,
    families: new Set(file.products.map((p) => p.productFamily)),
    warnings: file.warnings,
    brandCounts: file.brandCounts,
  }));

  const previewProductCount = excelAllProducts.length;
  const previewCategoryCount = Object.keys(excelFamilySummary).length;
  const totalWarnings = uploadedFiles.reduce(
    (s, f) => s + f.warnings.length,
    0,
  );

  const logColor = (type: string) => {
    if (type === "ok") return "text-emerald-400";
    if (type === "err") return "text-red-400";
    if (type === "skip") return "text-yellow-400";
    if (type === "warn") return "text-orange-400";
    return "text-slate-400";
  };

  const STEPS = ["idle", "preview", "importing", "done"] as const;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 border-primary/20 hover:bg-primary/5 font-semibold"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Bulk Import
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-190 h-[88vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <PackagePlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold leading-tight">
                Bulk Product Importer
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Import from{" "}
                <code className="font-mono bg-muted px-1 rounded">
                  JARIS .xlsx
                </code>
                . Supports multi-brand item codes (ECOSHIFT, LIT, LUMERA, OKO, ZUMTOBEL).
                TDS generated as plain tabular output by default.
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-3 text-[11px] font-medium">
            {STEPS.map((s, idx) => {
              const displayStep = step === "cancelled" ? "importing" : step;
              const isCancelledStep = step === "cancelled" && s === "importing";
              const isPast = idx < STEPS.indexOf(displayStep);
              const isActive = displayStep === s;
              return (
                <React.Fragment key={s}>
                  <span
                    className={`px-2 py-0.5 rounded-full transition-colors ${
                      isCancelledStep
                        ? "bg-orange-500 text-white"
                        : isActive
                          ? "bg-primary text-primary-foreground"
                          : isPast
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {idx + 1}.{" "}
                    {isCancelledStep
                      ? "Cancelled"
                      : s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                  {idx < 3 && (
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* IDLE */}
          {step === "idle" && (
            <div className="h-full overflow-y-auto">
              <div className="p-6 space-y-5">
                {/* Info about new schema */}
                <div className="flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">Multi-brand item codes supported</p>
                    <p>Column headers detected automatically. Use any of:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(ALL_BRANDS as ItemCodeBrand[]).map((b) => (
                        <span
                          key={b}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${ITEM_CODE_BRAND_CONFIG[b].badgeClass}`}
                        >
                          {ITEM_CODE_BRAND_CONFIG[b].label} Item Code
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] opacity-80">At least one item code column per row is required.</p>
                  </div>
                </div>

                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-2xl p-10 text-center flex flex-col items-center justify-center gap-3 transition-all duration-200 ${isDragActive ? "border-primary bg-primary/8 scale-[1.01] cursor-copy" : "border-border hover:border-primary/40 hover:bg-primary/3 cursor-pointer"}`}
                >
                  <input {...getInputProps()} />
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${isDragActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {isDragActive ? (
                      <FileUp className="w-7 h-7 animate-bounce" />
                    ) : (
                      <Upload className="w-7 h-7" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {isDragActive ? "Release to parse" : "Drop JARIS template files here"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      or{" "}
                      <span className="text-primary underline underline-offset-2 cursor-pointer">
                        browse
                      </span>{" "}
                      — accepts multiple .xlsx files
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border bg-card overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">
                      2
                    </div>
                    <p className="text-sm font-semibold">Set Product Class (Optional Override)</p>
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="text-[11px] text-muted-foreground">
                      This applies to all imported rows. Leave as <span className="font-semibold">Use Excel Value</span> to keep each row's class from the sheet.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedProductClass("")}
                        className={`rounded-lg border-2 px-3 py-2 text-left transition-all ${selectedProductClass === "" ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground/30 text-muted-foreground"}`}
                      >
                        <p className="text-xs font-semibold">Use Excel Value</p>
                        <p className="text-[10px] opacity-75 mt-0.5">Read PRODUCT CLASS from each row</p>
                      </button>
                      {PRODUCT_CLASS_OPTIONS.map((opt) => {
                        const active = selectedProductClass === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setSelectedProductClass(opt.value)}
                            className={`rounded-lg border-2 px-3 py-2 text-left transition-all ${active ? opt.activeClass : "border-border hover:border-muted-foreground/30 text-muted-foreground"}`}
                          >
                            <p className="text-xs font-semibold">{opt.label}</p>
                            <p className="text-[10px] opacity-75 mt-0.5">{opt.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {logs.length > 0 && (
                  <div className="rounded-xl overflow-hidden border border-slate-800">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 tracking-widest bg-slate-900 px-4 py-2">
                      <Terminal className="w-3 h-3" /> Console
                    </div>
                    <div className="bg-slate-950 px-4 py-3 font-mono text-[11px] space-y-1 max-h-32 overflow-y-auto">
                      {logs.map((log, i) => (
                        <div key={i} className={`flex gap-2.5 ${logColor(log.type)}`}>
                          <span className="text-slate-600 shrink-0 select-none tabular-nums">
                            [{String(i + 1).padStart(3, "0")}]
                          </span>
                          <span className="break-all">{log.msg}</span>
                        </div>
                      ))}
                      <div ref={logsEndRef} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PREVIEW */}
          {step === "preview" && (
            <div className="h-full flex flex-col">
              <div className="px-6 py-3 border-b shrink-0 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      <span className="text-primary font-bold">{previewProductCount}</span>{" "}
                      product{previewProductCount !== 1 ? "s" : ""} ready across{" "}
                      {previewCategoryCount} famil{previewCategoryCount !== 1 ? "ies" : "y"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Duplicates skipped · Saved as Draft · TDS plain tabular · N/A values excluded
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-xs h-7 shrink-0 ml-4">
                    <RefreshCw className="w-3 h-3" /> Change
                  </Button>
                </div>
                {totalWarnings > 0 && (
                  <Badge variant="outline" className="text-[10px] gap-1 border-orange-400 text-orange-600">
                    <AlertCircle className="w-2.5 h-2.5" />
                    {totalWarnings} row{totalWarnings !== 1 ? "s" : ""} skipped
                  </Badge>
                )}
              </div>

              <div className="px-6 py-2.5 border-b shrink-0 flex items-center gap-1 bg-background">
                <TabBtn
                  active={activeTab === "files"}
                  onClick={() => setActiveTab("files")}
                  icon={<FileText className="w-3 h-3" />}
                  label="Files"
                  count={uploadedFiles.length}
                />
                <TabBtn
                  active={activeTab === "categories"}
                  onClick={() => setActiveTab("categories")}
                  icon={<Tag className="w-3 h-3" />}
                  label="Families"
                  count={previewCategoryCount}
                />
                <TabBtn
                  active={activeTab === "products"}
                  onClick={() => setActiveTab("products")}
                  icon={<Package className="w-3 h-3" />}
                  label="Products"
                  count={previewProductCount}
                />
              </div>

              <div className="flex-1 min-h-0 p-5">
                {activeTab === "files" && (
                  <FilesPanel fileSummary={fileSummary} />
                )}
                {activeTab === "categories" && (
                  <ExcelCategoriesPanel
                    categorySummary={excelFamilySummary}
                    allProducts={excelAllProducts}
                  />
                )}
                {activeTab === "products" && (
                  <ExcelProductsPanel uploadedFiles={uploadedFiles} />
                )}
              </div>
            </div>
          )}

          {/* IMPORTING / DONE / CANCELLED */}
          {(step === "importing" || step === "done" || step === "cancelled") && (
            <div className="h-full flex flex-col p-6 gap-4">
              <div className="space-y-2 shrink-0">
                <div className="flex justify-between text-sm font-semibold">
                  <span className="flex items-center gap-2 text-slate-600">
                    {importing ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : step === "cancelled" ? (
                      <XCircle className="w-4 h-4 text-orange-500" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    )}
                    {importing
                      ? `Processing: ${currentItem}`
                      : step === "cancelled"
                        ? "Import cancelled"
                        : "Import complete"}
                  </span>
                  <span className="font-mono text-primary">
                    {Math.round(progress)}%
                  </span>
                </div>
                <Progress
                  value={progress}
                  className={`h-2.5 ${step === "cancelled" ? "[&>div]:bg-orange-500" : ""}`}
                />
              </div>

              <div className="grid grid-cols-4 gap-2.5 shrink-0">
                {[
                  { label: "Total", val: stats.total, cls: "text-blue-600", bg: "bg-blue-50 border-blue-100" },
                  { label: "Success", val: stats.success, cls: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
                  { label: "Failed", val: stats.failed, cls: "text-red-600", bg: "bg-red-50 border-red-100" },
                  { label: "Skipped", val: stats.skipped, cls: "text-amber-600", bg: "bg-amber-50 border-amber-100" },
                ].map((s) => (
                  <div key={s.label} className={`${s.bg} border rounded-xl p-3 text-center`}>
                    <p className={`text-2xl font-black tabular-nums ${s.cls}`}>{s.val}</p>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="flex-1 min-h-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-widest shrink-0">
                  <Terminal className="w-3 h-3" /> Import Console
                </div>
                <div className="flex-1 min-h-0 bg-slate-950 rounded-xl p-4 font-mono text-[11px] overflow-y-auto space-y-1 border border-slate-800 shadow-inner">
                  {logs.map((log, i) => (
                    <div key={i} className={`flex gap-2.5 ${logColor(log.type)}`}>
                      <span className="text-slate-600 shrink-0 select-none tabular-nums">
                        [{String(i + 1).padStart(3, "0")}]
                      </span>
                      <span className="break-all">{log.msg}</span>
                    </div>
                  ))}
                  {importing && (
                    <span className="inline-block w-2 h-3.5 bg-primary animate-pulse ml-0.5" />
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 flex justify-between items-center shrink-0 bg-muted/20">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setOpen(false); reset(); }}
            className="text-xs h-8"
          >
            Close
          </Button>
          <div className="flex gap-2">
            {step === "preview" && (
              <Button
                size="sm"
                onClick={runExcelImport}
                disabled={importing}
                className="gap-2 h-8 text-xs font-semibold"
              >
                <Upload className="w-3.5 h-3.5" />
                Import {previewProductCount} Products
              </Button>
            )}
            {step === "importing" && importing && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleCancel}
                disabled={cancelledRef.current}
                className="gap-2 h-8 text-xs font-semibold"
              >
                <XCircle className="w-3.5 h-3.5" />
                {cancelledRef.current ? "Cancelling..." : "Cancel Import"}
              </Button>
            )}
            {(step === "done" || step === "cancelled") && (
              <Button size="sm" variant="outline" onClick={reset} className="gap-2 h-8 text-xs">
                <RefreshCw className="w-3.5 h-3.5" /> Import Another
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
