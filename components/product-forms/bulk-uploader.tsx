"use client";

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
  getDoc,
} from "firebase/firestore";
import ExcelJS from "exceljs";
import { fillTdsPdf } from "@/lib/fillTdsPdf";

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
  Layers,
  RefreshCw,
  XCircle,
  FileText,
  Tag,
  Package,
  Eye,
  EyeOff,
  ShoppingBag,
  ImageOff,
  Info,
} from "lucide-react";

// ─── Env ──────────────────────────────────────────────────────────────────────

const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "dvmpn8mjh";
const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "taskflow_preset";
const OWN_CLOUDINARY_BASE = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/`;

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportSource = "excel" | "shopify";
type ShopifyMode = "draft" | "public";

// ── JARIS Excel product (new template) ──
interface ParsedProduct {
  // Required — at least one code + itemDescription
  itemDescription: string;
  ecoItemCode: string;
  litItemCode: string;
  // Optional classification
  productFamily: string;
  productClass: string; // "spf" | "standard" | ""
  productUsage: string[]; // ["INDOOR","OUTDOOR","SOLAR"]
  // Image URL columns (raw strings from sheet — uploaded to Cloudinary on import)
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
  terminalLayoutUrl: string;
  accessoriesImageUrl: string;
  // Spec values grouped by spec-group name (Row 2 of template)
  specs: Record<string, { label: string; value: string }[]>;
}

// ── Shopify types ──
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

// ── Shared ──
interface ImportStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}
type PreviewTab = "files" | "categories" | "products";

// ─── JARIS Excel column constants ────────────────────────────────────────────
// Row 1 = individual column headers (spec labels OR image field names)
// Row 2 = MERGED spec-group names spanning their spec columns
// Row 3+ = product data
//
// Fixed identity columns (0-indexed, always present):
//   0  Product Usage
//   1  Product Family
//   2  Product Class
//   3  ECOSHIFT Item Code      ← REQUIRED
//   4  LIT Item Code           ← REQUIRED
//   5  Item Description        ← REQUIRED
//   6  Raw Image URL
//   7  Main Image URL
//   8  Gallery Images URL      (comma-separated)
//
// Columns 9+ are classified DYNAMICALLY per template:
//   • If Row 2 has a group name over the column  → SPEC column
//     (the spec label comes from Row 1, the group name from the Row 2 merged cell)
//   • If Row 2 is empty but Row 1 matches a known image field name → IMAGE URL column
//
// This means a "REGULAR BULB" template where specs start at col 9 works just as
// well as a template that has 10 image-URL columns before the spec block.

const FIXED_IDENTITY_COLS = 9; // cols 0-8 are always identity

// Maps normalised Row-1 header text → ParsedProduct image URL field name.
// These columns only exist in templates that include them; REGULAR_BULB etc. skip them.
const IMG_HEADER_TO_FIELD: Record<string, keyof ParsedProduct> = {
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
};

// Normalise a raw product-class string into our union
function normaliseProductClass(raw: string): "spf" | "standard" | "" {
  const s = raw.toLowerCase().trim();
  if (s === "spf" || s.includes("spf")) return "spf";
  if (s === "standard" || s.includes("standard")) return "standard";
  return "";
}

// Split a product-usage cell ("INDOOR, OUTDOOR") into an array
function parseProductUsage(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|/]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => ["INDOOR", "OUTDOOR", "SOLAR"].includes(s));
}

// Split a gallery cell — URLs separated by commas/newlines
function parseGalleryUrls(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Excel cell helper ────────────────────────────────────────────────────────

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

// Build a map of colIndex → group name from Row 2.
// Propagates the last-seen group name rightward to fill merged-cell gaps
// (ExcelJS only gives the value to the top-left cell of a merge range).
function buildGroupMap(groupRow: (string | null)[]): Record<number, string> {
  const map: Record<number, string> = {};
  let current = "";
  for (let i = FIXED_IDENTITY_COLS; i < groupRow.length; i++) {
    const cell = groupRow[i];
    if (cell && cell.trim()) current = cell.trim();
    if (current) map[i] = current;
  }
  return map;
}

// ─── Parse workbook (JARIS template) ─────────────────────────────────────────

async function parseWorkbook(
  file: File,
): Promise<{
  sheetName: string;
  products: ParsedProduct[];
  warnings: string[];
}> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // Prefer first non "all products" sheet
  const candidates = wb.worksheets.filter(
    (s) => !/^all\s*products$/i.test(s.name.trim()),
  );
  let ws = candidates[0] ?? wb.worksheets[0];
  if (!ws) throw new Error(`No usable worksheet found in ${file.name}.`);

  // Materialise all rows
  const allRows: (string | null)[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: (string | null)[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells[Number(cell.col) - 1] =
        cell.value != null ? cellStr(cell.value) : null;
    });
    allRows.push(cells);
  });

  if (allRows.length < 2)
    throw new Error("Sheet must have at least a header row.");

  const headerRow = allRows[0]; // Row 1 — column labels
  const groupRow = allRows[1]; // Row 2 — spec group names
  const dataRows = allRows.slice(2); // Row 3+ — actual products

  // Build group map from Row 2 (merged cells propagated rightward)
  const groupMap: Record<number, string> = buildGroupMap(groupRow as string[]);

  // Classify each column >= FIXED_IDENTITY_COLS dynamically:
  //   • Row 2 has a group name over this column → SPEC column (label from Row 1)
  //   • Row 2 is empty but Row 1 matches a known image field → IMAGE URL column
  const specLabelMap: Record<number, string> = {}; // col → spec label
  const imgColMap: Record<number, keyof ParsedProduct> = {}; // col → product field

  headerRow.forEach((h, i) => {
    if (i < FIXED_IDENTITY_COLS || !h) return;
    const clean = h.replace(/[\r\n\t]+/g, " ").trim();
    const upper = clean.toUpperCase();
    if (groupMap[i]) {
      specLabelMap[i] = clean;
    } else {
      const field = IMG_HEADER_TO_FIELD[upper];
      if (field) imgColMap[i] = field;
    }
  });

  const products: ParsedProduct[] = [];
  const warnings: string[] = [];

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx];
    if (!row || row.every((c) => c == null || c === "")) continue;

    const g = (col: number) => row[col]?.trim() ?? "";

    const itemDescription = g(5);
    const ecoItemCode = g(3);
    const litItemCode = g(4);

    // Validation: must have all three required fields
    if (!itemDescription) {
      warnings.push(`Row ${rowIdx + 3}: skipped — missing Item Description`);
      continue;
    }
    if (!ecoItemCode) {
      warnings.push(
        `Row ${rowIdx + 3} ("${itemDescription}"): skipped — missing ECO Item Code`,
      );
      continue;
    }
    if (!litItemCode) {
      warnings.push(
        `Row ${rowIdx + 3} ("${itemDescription}"): skipped — missing LIT Item Code`,
      );
      continue;
    }

    // ── Spec columns → grouped by Row-2 group name ─────────────────────────
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

    // ── Image URL columns → resolved dynamically from Row-1 headers ─────────
    // Templates that don't include these columns will simply get empty strings.
    const imgVals: Partial<Record<keyof ParsedProduct, string>> = {};
    for (const [colStr, field] of Object.entries(imgColMap)) {
      imgVals[field] = row[Number(colStr)]?.trim() ?? "";
    }

    products.push({
      itemDescription,
      ecoItemCode,
      litItemCode,
      productFamily: g(1).toUpperCase() || "UNCATEGORISED",
      productClass: normaliseProductClass(g(2)),
      productUsage: parseProductUsage(g(0)),
      mainImageUrl: g(7),
      rawImageUrl: g(6),
      galleryImageUrls: parseGalleryUrls(g(8)),
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
      specs: specsByGroup,
    });
  }

  return { sheetName: ws.name, products, warnings };
}

// ─── Cloudinary helpers ───────────────────────────────────────────────────────

async function uploadUrlToCloudinary(url: string): Promise<string> {
  if (!url) return "";
  if (url.startsWith(OWN_CLOUDINARY_BASE)) return url; // already there
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

async function uploadPdfToCloudinary(file: File): Promise<string> {
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

// ─── Shopify helpers ──────────────────────────────────────────────────────────

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
      label: mf.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
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

// ─── Shared Firestore helpers ─────────────────────────────────────────────────

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

async function upsertProductFamily(
  title: string,
  specGroupIds: string[],
): Promise<string> {
  const existingId = await findDoc("productfamilies", "title", title);
  if (existingId) {
    const snap = await getDocs(
      query(collection(db, "productfamilies"), where("title", "==", title)),
    );
    const existing = snap.docs[0];
    const existingSpecs: string[] = existing.data().specifications ?? [];
    const merged = Array.from(new Set([...existingSpecs, ...specGroupIds]));
    await updateDoc(doc(db, "productfamilies", existingId), {
      specifications: merged,
      updatedAt: serverTimestamp(),
    });
    return existingId;
  }
  const ref = await addDoc(collection(db, "productfamilies"), {
    title,
    description: "",
    imageUrl: "",
    isActive: true,
    specifications: specGroupIds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

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
  for (const [groupName, entries] of grouped.entries()) {
    const id = await upsertSpecGroup(
      groupName,
      entries.map((e) => e.name),
    );
    specGroupIds.push(id);
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
    technicalSpecs.push({ specGroup: UNGROUPED, specs: ungrouped });
  }
  return { technicalSpecs, specGroupIds };
}

async function normalizeShopifyProduct(
  product: ShopifyProduct,
  log: (msg: string) => void,
) {
  const pv = product.variants[0];
  const ecoItemCode = pv?.sku?.trim() || String(product.id);
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
  const galleryImages = uploaded.slice(2);

  log(`  → Extracting specs...`);
  const rawSpecs = extractRawSpecs(product);
  log(`  → Resolving ${rawSpecs.length} spec(s)...`);
  const { technicalSpecs, specGroupIds } = await resolveShopifySpecs(rawSpecs);

  log(`  → Upserting product family "${productFamily}"...`);
  await upsertProductFamily(productFamily, specGroupIds);

  return {
    productClass: "" as const,
    itemDescription,
    shortDescription,
    slug,
    ecoItemCode,
    litItemCode: "",
    regularPrice,
    salePrice,
    technicalSpecs,
    mainImage,
    rawImage,
    qrCodeImage: "",
    galleryImages,
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

// ─── Duplicate check for JARIS Excel ─────────────────────────────────────────

async function checkJarisDuplicate(
  ecoItemCode: string,
  litItemCode: string,
): Promise<{ isDuplicate: boolean; reason: string }> {
  if (ecoItemCode) {
    const snap = await getDocs(
      query(
        collection(db, "products"),
        where("ecoItemCode", "==", ecoItemCode),
      ),
    );
    if (!snap.empty)
      return { isDuplicate: true, reason: `ecoItemCode "${ecoItemCode}"` };
  }
  if (litItemCode) {
    const snap = await getDocs(
      query(
        collection(db, "products"),
        where("litItemCode", "==", litItemCode),
      ),
    );
    if (!snap.empty)
      return { isDuplicate: true, reason: `litItemCode "${litItemCode}"` };
  }
  return { isDuplicate: false, reason: "" };
}

// Cache: productFamily title → { tdsTemplate, id }
const familyTdsCache = new Map<
  string,
  { templateUrl: string; familyId: string }
>();

async function getFamilyTdsTemplate(
  familyTitle: string,
): Promise<{ templateUrl: string; familyId: string }> {
  if (familyTdsCache.has(familyTitle)) return familyTdsCache.get(familyTitle)!;
  const snap = await getDocs(
    query(collection(db, "productfamilies"), where("title", "==", familyTitle)),
  );
  const result = snap.empty
    ? { templateUrl: "", familyId: "" }
    : {
        templateUrl: snap.docs[0].data().tdsTemplate ?? "",
        familyId: snap.docs[0].id,
      };
  familyTdsCache.set(familyTitle, result);
  return result;
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
        className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
          active
            ? "bg-white/20 text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
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
      <div className="grid grid-cols-[1fr_120px_90px_32px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/60 px-3 py-2 border-b shrink-0">
        <span>Item Description</span>
        <span>Family</span>
        <span>ECO / LIT Code</span>
        <span className="text-center">Img</span>
      </div>
      <div className="flex-1 overflow-y-auto divide-y">
        {uploadedFiles.map((file, fileIdx) =>
          file.products.map((p, prodIdx) => (
            <div
              key={`${fileIdx}-${prodIdx}`}
              className="grid grid-cols-[1fr_120px_90px_32px] items-center px-3 py-2 text-xs hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0 pr-2">
                <p className="font-medium truncate">{p.itemDescription}</p>
                <p className="text-muted-foreground font-mono text-[10px]">
                  {p.ecoItemCode || p.litItemCode}
                </p>
              </div>
              <span className="text-muted-foreground text-[10px] truncate pr-2">
                {p.productFamily}
              </span>
              <div className="pr-2">
                {p.ecoItemCode && (
                  <p className="font-mono text-muted-foreground text-[10px] truncate">
                    ECO: {p.ecoItemCode}
                  </p>
                )}
                {p.litItemCode && (
                  <p className="font-mono text-muted-foreground text-[10px] truncate">
                    LIT: {p.litItemCode}
                  </p>
                )}
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
  const [fetching, setFetching] = useState(false);
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

  const [importSource, setImportSource] = useState<ImportSource>("excel");

  const [uploadedFiles, setUploadedFiles] = useState<
    {
      name: string;
      sheetName: string;
      products: ParsedProduct[];
      warnings: string[];
    }[]
  >([]);

  const [shopifyMode, setShopifyMode] = useState<ShopifyMode>("draft");
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);

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

  // ── Excel dropzone ───────────────────────────────────────────────────────────

  const handleFileDrop = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      addLog("info", `📂 Parsing ${files.length} file(s)...`);
      const parsed: typeof uploadedFiles = [];
      for (const file of files) {
        try {
          const { sheetName, products, warnings } = await parseWorkbook(file);
          parsed.push({ name: file.name, sheetName, products, warnings });
          addLog("info", `  ✅ ${file.name}: ${products.length} products`);
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
    multiple: true,
    disabled: importSource !== "excel" || step !== "idle" || importing,
  });

  // ── Shopify fetch ────────────────────────────────────────────────────────────

  const handleShopifyFetch = async () => {
    setFetching(true);
    addLog("info", `🔍 Fetching Shopify products (mode: ${shopifyMode})...`);
    try {
      const res = await fetch(`/api/shopify/products?mode=${shopifyMode}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const fetched: ShopifyProduct[] = data.products ?? [];
      if (fetched.length === 0) {
        addLog(
          "warn",
          `⚠️  No ${shopifyMode === "draft" ? "draft/archived" : "active"} products found in Shopify.`,
        );
        toast.warning("No matching products found.");
        setFetching(false);
        return;
      }
      setShopifyProducts(fetched);
      setActiveTab("categories");
      setStep("preview");
      const familyCount = new Set(
        fetched.map((p) =>
          (p.product_type?.trim() || "UNCATEGORISED").toUpperCase(),
        ),
      ).size;
      addLog(
        "info",
        `✅ Fetched ${fetched.length} product(s) across ${familyCount} categories.`,
      );
    } catch (err: any) {
      addLog("err", `❌ Fetch failed: ${err.message}`);
      toast.error(`Shopify fetch failed: ${err.message}`);
    } finally {
      setFetching(false);
    }
  };

  // ── Cancel ───────────────────────────────────────────────────────────────────

  const handleCancel = () => {
    cancelledRef.current = true;
    addLog(
      "warn",
      "⚠️  Cancellation requested — stopping after current item...",
    );
  };

  // ── Run JARIS Excel import ────────────────────────────────────────────────────

  const runExcelImport = async () => {
    const allProducts = uploadedFiles.flatMap((f) => f.products);
    if (!allProducts.length) return;

    // Clear per-run family cache
    familyTdsCache.clear();

    cancelledRef.current = false;
    setImporting(true);
    setStep("importing");
    setProgress(0);
    setStats({ total: allProducts.length, success: 0, failed: 0, skipped: 0 });
    addLog(
      "info",
      `🚀 Starting JARIS import of ${allProducts.length} products from ${uploadedFiles.length} file(s)...`,
    );

    // ── Phase 1: Upsert spec groups ──────────────────────────────────────────
    const allSpecGroups: Record<string, Set<string>> = {};
    const familyToGroups: Record<string, Set<string>> = {};

    for (const p of allProducts) {
      if (!familyToGroups[p.productFamily])
        familyToGroups[p.productFamily] = new Set();
      for (const [groupName, specEntries] of Object.entries(p.specs)) {
        if (!allSpecGroups[groupName]) allSpecGroups[groupName] = new Set();
        specEntries.forEach((e) => allSpecGroups[groupName].add(e.label));
        familyToGroups[p.productFamily].add(groupName);
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

    // ── Phase 2: Upsert product families ────────────────────────────────────
    addLog(
      "info",
      `📦 Upserting ${Object.keys(familyToGroups).length} product famil(ies)...`,
    );
    for (const [familyTitle, groupNames] of Object.entries(familyToGroups)) {
      const specIds = Array.from(groupNames)
        .map((g) => specGroupIds[g])
        .filter(Boolean);
      try {
        const id = await upsertProductFamily(familyTitle, specIds);
        addLog("info", `  ✓ Product family "${familyTitle}" → ${id}`);
      } catch (err: any) {
        addLog("err", `  ✗ Product family "${familyTitle}": ${err.message}`);
      }
    }

    // ── Phase 3: Import products ─────────────────────────────────────────────
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
      const displayCode = `${p.ecoItemCode} / ${p.litItemCode}`;
      setCurrentItem(`${displayCode} — ${p.itemDescription}`);

      try {
        // Duplicate check
        const { isDuplicate, reason } = await checkJarisDuplicate(
          p.ecoItemCode,
          p.litItemCode,
        );
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

        // ── Upload images from URL columns ───────────────────────────────────
        addLog("info", `  → Uploading images for "${p.itemDescription}"...`);

        const [
          mainImage,
          rawImage,
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
            ...p.galleryImageUrls,
          ],
          (m) => addLog("info", m),
        );

        // ── Build technicalSpecs array (same shape as AddNewProduct) ─────────
        const technicalSpecs: TechnicalSpec[] = Object.entries(p.specs).map(
          ([specGroup, entries]) => ({
            specGroup,
            specs: entries.map((e) => ({ name: e.label, value: e.value })),
          }),
        );

        // ── Build slug ───────────────────────────────────────────────────────
        const slug = p.ecoItemCode.toLowerCase().replace(/[^a-z0-9]+/g, "-");

        // ── Save product document ────────────────────────────────────────────
        const docRef = await addDoc(collection(db, "products"), {
          productClass: p.productClass,
          itemDescription: p.itemDescription,
          shortDescription: "",
          slug,
          ecoItemCode: p.ecoItemCode,
          litItemCode: p.litItemCode,
          regularPrice: 0,
          salePrice: 0,
          technicalSpecs,
          mainImage: mainImage || "",
          rawImage: rawImage || "",
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
          productFamily: p.productFamily,
          productUsage: p.productUsage,
          brand: "",
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

        // ── TDS generation ───────────────────────────────────────────────────
        try {
          const { templateUrl } = await getFamilyTdsTemplate(p.productFamily);
          if (templateUrl) {
            addLog(
              "info",
              `  → Generating TDS PDF for "${p.itemDescription}"...`,
            );
            const tdsUrl = await fillTdsPdf({
              templateUrl,
              itemDescription: p.itemDescription,
              litItemCode: p.litItemCode,
              ecoItemCode: p.ecoItemCode,
              brand: "",
              technicalSpecs,
              mainImageUrl: mainImage || undefined,
              dimensionDrawingUrl: dimensionalDrawingImage || undefined,
              mountingHeightUrl: recommendedMountingHeightImage || undefined,
              driverCompatibilityUrl: driverCompatibilityImage || undefined,
              baseImageUrl: baseImage || undefined,
              illuminanceLevelUrl: illuminanceLevelImage || undefined,
              wiringDiagramUrl: wiringDiagramImage || undefined,
              installationUrl: installationImage || undefined,
              wiringLayoutUrl: wiringLayoutImage || undefined,
              terminalLayoutUrl: terminalLayoutImage || undefined,
              accessoriesUrl: accessoriesImage || undefined,
              cloudinaryUploadFn: uploadPdfToCloudinary,
            });
            if (tdsUrl.startsWith("http")) {
              await updateDoc(doc(db, "products", docRef.id), {
                tdsFileUrl: tdsUrl,
                updatedAt: serverTimestamp(),
              });
              addLog("ok", `  ✅ TDS PDF generated for "${p.itemDescription}"`);
            }
          }
        } catch (tdsErr: any) {
          addLog(
            "warn",
            `  ⚠️  TDS generation failed for "${p.itemDescription}": ${tdsErr.message}`,
          );
        }

        await logAuditEvent({
          action: "create",
          entityType: "product",
          entityId: docRef.id,
          entityName: p.itemDescription,
          context: {
            page: "/products/all-products",
            source: "bulk-uploader:jaris",
            collection: "products",
          },
          metadata: {
            ecoItemCode: p.ecoItemCode || null,
            litItemCode: p.litItemCode || null,
            productFamily: p.productFamily,
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

  // ── Run Shopify import ───────────────────────────────────────────────────────

  const runShopifyImport = async () => {
    if (!shopifyProducts.length) return;

    cancelledRef.current = false;
    setImporting(true);
    setStep("importing");
    setProgress(0);
    setStats({
      total: shopifyProducts.length,
      success: 0,
      failed: 0,
      skipped: 0,
    });
    addLog(
      "info",
      `🚀 Starting import of ${shopifyProducts.length} Shopify products (saved as Draft)...`,
    );

    for (let i = 0; i < shopifyProducts.length; i++) {
      if (cancelledRef.current) {
        const remaining = shopifyProducts.length - i;
        addLog(
          "warn",
          `🛑 Import cancelled. ${i} processed, ${remaining} remaining.`,
        );
        setStats((prev) => ({ ...prev, skipped: prev.skipped + remaining }));
        break;
      }

      const p = shopifyProducts[i];
      setCurrentItem(p.title);

      try {
        const sku = p.variants[0]?.sku?.trim() || String(p.id);
        const dupSnap = await getDocs(
          query(collection(db, "products"), where("ecoItemCode", "==", sku)),
        );
        if (!dupSnap.empty) {
          addLog("skip", `⏭  SKIPPED (duplicate SKU "${sku}"): ${p.title}`);
          setStats((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
          setProgress(((i + 1) / shopifyProducts.length) * 100);
          await new Promise((r) => setTimeout(r, 20));
          continue;
        }

        const normalized = await normalizeShopifyProduct(p, (msg) =>
          addLog("info", msg),
        );

        const docRef = await addDoc(collection(db, "products"), {
          ...normalized,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await logAuditEvent({
          action: "create",
          entityType: "product",
          entityId: docRef.id,
          entityName: normalized.itemDescription,
          context: {
            page: "/products/all-products",
            source: "bulk-uploader:shopify",
            collection: "products",
          },
          metadata: {
            ecoItemCode: normalized.ecoItemCode,
            shopifyProductId: normalized.shopifyProductId,
          },
        });

        addLog("ok", `✅ ${p.title} (SKU: ${normalized.ecoItemCode})`);
        setStats((prev) => ({ ...prev, success: prev.success + 1 }));
      } catch (err: any) {
        addLog("err", `❌ FAILED "${p.title}": ${err.message}`);
        setStats((prev) => ({ ...prev, failed: prev.failed + 1 }));
      }

      setProgress(((i + 1) / shopifyProducts.length) * 100);
      await new Promise((r) => setTimeout(r, 80));
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

  // ── Reset ────────────────────────────────────────────────────────────────────

  const reset = () => {
    setStep("idle");
    setLogs([]);
    setUploadedFiles([]);
    setShopifyProducts([]);
    setStats({ total: 0, success: 0, failed: 0, skipped: 0 });
    setProgress(0);
    setCurrentItem("");
    setShopifyMode("draft");
    cancelledRef.current = false;
    familyTdsCache.clear();
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

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
  }));
  const shopifyCategorySummary = shopifyProducts.reduce<Record<string, number>>(
    (acc, p) => {
      const fam = (p.product_type?.trim() || "UNCATEGORISED").toUpperCase();
      acc[fam] = (acc[fam] || 0) + 1;
      return acc;
    },
    {},
  );

  const previewProductCount =
    importSource === "shopify"
      ? shopifyProducts.length
      : excelAllProducts.length;
  const previewCategoryCount =
    importSource === "shopify"
      ? Object.keys(shopifyCategorySummary).length
      : Object.keys(excelFamilySummary).length;

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
        {/* ── Header ── */}
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
                </code>{" "}
                template or Shopify. All products are saved as{" "}
                <strong>Draft</strong> — TDS PDFs auto-generated per family
                template.
              </DialogDescription>
            </div>
          </div>

          {/* Step pills */}
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

        {/* ── Body ── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* ════════════ IDLE ════════════ */}
          {step === "idle" && (
            <div className="h-full overflow-y-auto">
              <div className="p-6 space-y-5">
                {/* Step 1: Source selector */}
                <div className="rounded-xl border bg-card overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">
                      1
                    </div>
                    <p className="text-sm font-semibold">
                      Select Import Source
                    </p>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          value: "excel" as const,
                          label: "JARIS Excel Template",
                          desc: "Upload .xlsx using the standard CMS template",
                          icon: <FileSpreadsheet className="w-4 h-4" />,
                          color: "text-blue-600",
                          activeBg:
                            "border-blue-500 bg-blue-50 dark:bg-blue-950/20",
                        },
                        {
                          value: "shopify" as const,
                          label: "Shopify Store",
                          desc: "Fetch products directly from your Shopify Admin API",
                          icon: <ShoppingBag className="w-4 h-4" />,
                          color: "text-emerald-600",
                          activeBg:
                            "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20",
                        },
                      ].map((opt) => {
                        const active = importSource === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setImportSource(opt.value);
                              setActiveTab(
                                opt.value === "shopify"
                                  ? "categories"
                                  : "files",
                              );
                            }}
                            className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all ${
                              active
                                ? `${opt.activeBg} ${opt.color} font-semibold`
                                : "border-border hover:border-muted-foreground/30 hover:bg-muted/40 text-muted-foreground"
                            }`}
                          >
                            <span
                              className={
                                active ? opt.color : "text-muted-foreground"
                              }
                            >
                              {opt.icon}
                            </span>
                            <div>
                              <p className="text-xs font-semibold">
                                {opt.label}
                              </p>
                              <p className="text-[10px] font-normal opacity-70 mt-0.5">
                                {opt.desc}
                              </p>
                            </div>
                            {active && (
                              <CheckCircle
                                className={`w-4 h-4 ml-auto shrink-0 ${opt.color}`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* ════ EXCEL CONFIG ════ */}
                {importSource === "excel" && (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">
                          2
                        </div>
                        <p className="text-sm font-semibold">
                          Upload JARIS CMS Template
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400">
                        <EyeOff className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Products saved as <strong>Draft</strong>, no website
                          assigned. TDS PDFs auto-generated where a family
                          template exists.
                        </span>
                      </div>

                      <div
                        {...getRootProps()}
                        className={`border-2 border-dashed rounded-2xl p-10 text-center flex flex-col items-center justify-center gap-3 transition-all duration-200 ${
                          isDragActive
                            ? "border-primary bg-primary/8 scale-[1.01] cursor-copy"
                            : "border-border hover:border-primary/40 hover:bg-primary/3 cursor-pointer"
                        }`}
                      >
                        <input {...getInputProps()} />
                        <div
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                            isDragActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isDragActive ? (
                            <FileUp className="w-7 h-7 animate-bounce" />
                          ) : (
                            <Upload className="w-7 h-7" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {isDragActive
                              ? "Release to parse"
                              : "Drop JARIS template files here"}
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
                    </div>

                    {/* Column reference cards */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border p-3 space-y-1.5 bg-card">
                        <p className="font-semibold flex items-center gap-1.5 text-primary">
                          <Layers className="w-3.5 h-3.5" /> Template Columns
                          (Row 1)
                        </p>
                        {[
                          "A — Product Usage (INDOOR/OUTDOOR/SOLAR)",
                          "B — Product Family",
                          "C — Product Class (spf/standard)",
                          "D — ECO Item Code ✱ (required)",
                          "E — LIT Item Code ✱ (required)",
                          "F — Item Description ✱ (required)",
                          "G — Raw Image URL",
                          "H — Main Image URL",
                          "I — Gallery URLs (comma-sep)",
                          "J–S — Technical Drawing URLs",
                          "T+ — Spec values (grouped by Row 2)",
                        ].map((c) => (
                          <div key={c} className="flex items-start gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0 mt-1" />
                            <code className="font-mono leading-tight">{c}</code>
                          </div>
                        ))}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          ✱ All three are required — rows missing any will be
                          skipped with a warning
                        </p>
                      </div>
                      <div className="rounded-lg border p-3 space-y-1.5 bg-card">
                        <p className="font-semibold flex items-center gap-1.5 text-emerald-600">
                          <FileText className="w-3.5 h-3.5" /> What happens on
                          import
                        </p>
                        {[
                          "Images uploaded to Cloudinary automatically",
                          "Spec groups upserted from Row 2 headers",
                          "Product families created/updated",
                          "TDS PDF generated if family has template",
                          "Duplicate check: ecoItemCode AND litItemCode",
                          "Missing fields gracefully ignored",
                        ].map((c) => (
                          <div key={c} className="flex items-start gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1" />
                            <span className="text-muted-foreground">{c}</span>
                          </div>
                        ))}
                        <div className="mt-2 p-2 rounded bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                          <p className="text-[10px] text-blue-700 dark:text-blue-400 flex items-start gap-1">
                            <Info className="w-3 h-3 shrink-0 mt-0.5" />
                            Row 2 defines spec group names (e.g. LAMP DETAILS,
                            ELECTRICAL SPECIFICATION, FIXTURE DETAILS)
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ════ SHOPIFY CONFIG ════ */}
                {importSource === "shopify" && (
                  <>
                    <div className="rounded-xl border bg-card overflow-hidden">
                      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">
                          2
                        </div>
                        <p className="text-sm font-semibold">
                          Select Shopify Fetch Mode
                        </p>
                      </div>
                      <div className="p-4">
                        <p className="text-xs text-muted-foreground mb-3">
                          Choose which Shopify products to fetch based on their
                          publish status.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            {
                              value: "draft" as const,
                              label: "Draft / Archived",
                              desc: "Fetch products with draft or archived status",
                              icon: <EyeOff className="w-4 h-4" />,
                              color: "text-amber-600",
                              activeBg:
                                "border-amber-500 bg-amber-50 dark:bg-amber-950/20",
                            },
                            {
                              value: "public" as const,
                              label: "Active / Published",
                              desc: "Fetch products with active (published) status",
                              icon: <Eye className="w-4 h-4" />,
                              color: "text-emerald-600",
                              activeBg:
                                "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20",
                            },
                          ].map((opt) => {
                            const active = shopifyMode === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setShopifyMode(opt.value)}
                                className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all ${
                                  active
                                    ? `${opt.activeBg} ${opt.color} font-semibold`
                                    : "border-border hover:border-muted-foreground/30 hover:bg-muted/40 text-muted-foreground"
                                }`}
                              >
                                <span
                                  className={
                                    active ? opt.color : "text-muted-foreground"
                                  }
                                >
                                  {opt.icon}
                                </span>
                                <div>
                                  <p className="text-xs font-semibold">
                                    {opt.label}
                                  </p>
                                  <p className="text-[10px] font-normal opacity-70 mt-0.5">
                                    {opt.desc}
                                  </p>
                                </div>
                                {active && (
                                  <CheckCircle
                                    className={`w-4 h-4 ml-auto shrink-0 ${opt.color}`}
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400">
                          <EyeOff className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Regardless of Shopify status, all products will be
                            saved as <strong>Draft</strong> in your system.
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-card overflow-hidden">
                      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">
                          3
                        </div>
                        <p className="text-sm font-semibold">Fetch Products</p>
                      </div>
                      <div className="p-4 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Fetches all matching products from your Shopify store
                          including images and metafields.
                        </p>
                        <Button
                          onClick={handleShopifyFetch}
                          disabled={fetching}
                          className="gap-2 w-full"
                        >
                          {fetching ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Fetching from Shopify...
                            </>
                          ) : (
                            <>
                              <ShoppingBag className="w-4 h-4" />
                              Fetch{" "}
                              {shopifyMode === "draft"
                                ? "Draft / Archived"
                                : "Active"}{" "}
                              Products
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {/* Console (idle / fetch logs) */}
                {logs.length > 0 && (
                  <div className="rounded-xl overflow-hidden border border-slate-800">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 tracking-widest bg-slate-900 px-4 py-2">
                      <Terminal className="w-3 h-3" /> Console
                    </div>
                    <div className="bg-slate-950 px-4 py-3 font-mono text-[11px] space-y-1 max-h-32 overflow-y-auto">
                      {logs.map((log, i) => (
                        <div
                          key={i}
                          className={`flex gap-2.5 ${logColor(log.type)}`}
                        >
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

          {/* ════════════ PREVIEW ════════════ */}
          {step === "preview" && (
            <div className="h-full flex flex-col">
              {/* Summary bar */}
              <div className="px-6 py-3 border-b shrink-0 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      <span className="text-primary font-bold">
                        {previewProductCount}
                      </span>{" "}
                      product{previewProductCount !== 1 ? "s" : ""} ready across{" "}
                      {previewCategoryCount} famil
                      {previewCategoryCount !== 1 ? "ies" : "y"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Duplicates skipped · Saved as <strong>Draft</strong> · TDS
                      auto-generated per family
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    className="gap-1.5 text-xs h-7 shrink-0 ml-4"
                  >
                    <RefreshCw className="w-3 h-3" /> Change
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
                    Source:
                  </span>
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    {importSource === "shopify" ? (
                      <ShoppingBag className="w-2.5 h-2.5" />
                    ) : (
                      <FileSpreadsheet className="w-2.5 h-2.5" />
                    )}
                    {importSource === "shopify" ? "Shopify" : "JARIS Excel"}
                  </Badge>
                  {importSource === "shopify" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] gap-1 ml-1 border-slate-300 text-slate-500"
                    >
                      {shopifyMode === "draft" ? "Draft/Archived" : "Active"}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 ml-1 border-amber-400 text-amber-600"
                  >
                    <EyeOff className="w-2.5 h-2.5" />
                    Saving as Draft
                  </Badge>
                  {totalWarnings > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] gap-1 ml-1 border-orange-400 text-orange-600"
                    >
                      <AlertCircle className="w-2.5 h-2.5" />
                      {totalWarnings} row{totalWarnings !== 1 ? "s" : ""}{" "}
                      skipped
                    </Badge>
                  )}
                </div>
              </div>

              {/* Tab bar */}
              <div className="px-6 py-2.5 border-b shrink-0 flex items-center gap-1 bg-background">
                {importSource === "excel" && (
                  <TabBtn
                    active={activeTab === "files"}
                    onClick={() => setActiveTab("files")}
                    icon={<FileText className="w-3 h-3" />}
                    label="Files"
                    count={uploadedFiles.length}
                  />
                )}
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

              {/* Panel */}
              <div className="flex-1 min-h-0 p-5">
                {importSource === "excel" && activeTab === "files" && (
                  <FilesPanel fileSummary={fileSummary} />
                )}
                {importSource === "excel" && activeTab === "categories" && (
                  <ExcelCategoriesPanel
                    categorySummary={excelFamilySummary}
                    allProducts={excelAllProducts}
                  />
                )}
                {importSource === "excel" && activeTab === "products" && (
                  <ExcelProductsPanel uploadedFiles={uploadedFiles} />
                )}
                {importSource === "shopify" && activeTab === "categories" && (
                  <ShopifyCategoriesPanel products={shopifyProducts} />
                )}
                {importSource === "shopify" && activeTab === "products" && (
                  <ShopifyProductsPanel products={shopifyProducts} />
                )}
              </div>
            </div>
          )}

          {/* ════════════ IMPORTING / DONE / CANCELLED ════════════ */}
          {(step === "importing" ||
            step === "done" ||
            step === "cancelled") && (
            <div className="h-full flex flex-col p-6 gap-4">
              {/* Progress */}
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

              {/* Stat cards */}
              <div className="grid grid-cols-4 gap-2.5 shrink-0">
                {[
                  {
                    label: "Total",
                    val: stats.total,
                    cls: "text-blue-600",
                    bg: "bg-blue-50 border-blue-100",
                  },
                  {
                    label: "Success",
                    val: stats.success,
                    cls: "text-emerald-600",
                    bg: "bg-emerald-50 border-emerald-100",
                  },
                  {
                    label: "Failed",
                    val: stats.failed,
                    cls: "text-red-600",
                    bg: "bg-red-50 border-red-100",
                  },
                  {
                    label: "Skipped",
                    val: stats.skipped,
                    cls: "text-amber-600",
                    bg: "bg-amber-50 border-amber-100",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className={`${s.bg} border rounded-xl p-3 text-center`}
                  >
                    <p className={`text-2xl font-black tabular-nums ${s.cls}`}>
                      {s.val}
                    </p>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-0.5">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>

              {/* Console */}
              <div className="flex-1 min-h-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-widest shrink-0">
                  <Terminal className="w-3 h-3" /> Import Console
                </div>
                <div className="flex-1 min-h-0 bg-slate-950 rounded-xl p-4 font-mono text-[11px] overflow-y-auto space-y-1 border border-slate-800 shadow-inner">
                  {logs.map((log, i) => (
                    <div
                      key={i}
                      className={`flex gap-2.5 ${logColor(log.type)}`}
                    >
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

        {/* ── Footer ── */}
        <div className="border-t px-6 py-3 flex justify-between items-center shrink-0 bg-muted/20">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            className="text-xs h-8"
          >
            Close
          </Button>
          <div className="flex gap-2">
            {step === "preview" && (
              <Button
                size="sm"
                onClick={
                  importSource === "shopify" ? runShopifyImport : runExcelImport
                }
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
              <Button
                size="sm"
                variant="outline"
                onClick={reset}
                className="gap-2 h-8 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Import Another
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
