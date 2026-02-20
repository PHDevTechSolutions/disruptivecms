/**
 * lib/shopify-importer.ts
 *
 * Shopify → internal product normalizer.
 *
 * Responsibilities:
 *  - Fetch products from the Shopify Admin REST API
 *  - Filter by draft / public mode (maps to Shopify status)
 *  - Normalize every field to exactly match the AddNewProduct form output schema
 *  - Upload all images (Shopify CDN / Cloudinary / Google Drive) to Cloudinary
 *  - Upsert spec groups in Firestore (grouped + ungrouped specs both supported)
 *  - Upsert product families in Firestore
 *  - Return a ready-to-save payload that is 100% interchangeable with manual creation
 *
 * NO UI logic lives here. Pure data / normalization.
 */

import {
  collection,
  addDoc,
  updateDoc,
  getDocs,
  doc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── Environment ──────────────────────────────────────────────────────────────

const SHOPIFY_STORE_DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ?? "";
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? "";
const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "dvmpn8mjh";
const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "taskflow_preset";

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
  console.warn(
    "[shopify-importer] SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN is missing from .env.local",
  );
}

// ─── Shopify types (REST Admin 2024-01) ───────────────────────────────────────

export interface ShopifyImage {
  id: number;
  src: string;
  alt: string | null;
  position: number;
}

export interface ShopifyVariant {
  id: number;
  sku: string;
  price: string;
  compare_at_price: string | null;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

export interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

export interface ShopifyProduct {
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
  metafields?: ShopifyMetafield[];
  options: { name: string; values: string[] }[];
}

// ─── Internal output schema (mirrors AddNewProduct payload exactly) ────────────

export interface TechnicalSpec {
  specGroup: string;
  specs: { name: string; value: string }[];
}

export interface SeoPayload {
  itemDescription: string;
  description: string;
  canonical: string;
  ogImage: string;
  robots: string;
  lastUpdated: string;
}

/**
 * The normalized product payload.
 * Shape is identical to what AddNewProduct writes to Firestore.
 * `serverTimestamp()` fields are omitted here and added at write time.
 */
export interface NormalizedProduct {
  // Identity
  productClass: "spf" | "standard" | "";
  itemDescription: string;
  shortDescription: string;
  slug: string;
  ecoItemCode: string;
  litItemCode: string;

  // Pricing
  regularPrice: number;
  salePrice: number;

  // Specs
  technicalSpecs: TechnicalSpec[];

  // Images (all Cloudinary URLs)
  mainImage: string;
  rawImage: string;
  qrCodeImage: string;
  galleryImages: string[];

  // Classification
  website: string[];
  websites: string[];
  productFamily: string;
  brand: string;
  applications: string[];

  // Visibility
  status: "draft" | "public";

  // SEO
  seo: SeoPayload;

  // Source reference
  importSource: "shopify-importer";
  shopifyProductId: number;
}

// ─── Import mode ──────────────────────────────────────────────────────────────

/**
 * draft  → only import Shopify products where status !== "active"
 * public → only import Shopify products where status === "active"
 *
 * Default is always "draft".
 */
export type ImportMode = "draft" | "public";

// ─── Spec resolution types ────────────────────────────────────────────────────

/**
 * A raw spec entry extracted from a Shopify metafield or option.
 * groupName is optional — if absent the spec is "ungrouped".
 */
export interface RawSpec {
  groupName: string | null; // null = ungrouped
  label: string;
  value: string;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Slugify a string */
function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strip HTML tags from Shopify body_html */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Best-effort parse of a price string to a number */
function parsePrice(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

// ─── Cloudinary upload ────────────────────────────────────────────────────────

/**
 * Upload any publicly accessible image URL (Shopify CDN, Cloudinary, Google Drive)
 * to Cloudinary and return the resulting secure_url.
 *
 * If the URL is already a Cloudinary URL from *this* account it is returned
 * as-is to avoid re-uploading.
 */
export async function uploadImageUrlToCloudinary(
  imageUrl: string,
): Promise<string> {
  if (!imageUrl) return "";

  // Already hosted on our Cloudinary account — skip re-upload
  const ownCloudinaryBase = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/`;
  if (imageUrl.startsWith(ownCloudinaryBase)) return imageUrl;

  // Google Drive: convert sharing link → direct download link
  const driveMatch = imageUrl.match(
    /drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/,
  );
  const resolvedUrl = driveMatch
    ? `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`
    : imageUrl;

  const formData = new FormData();
  formData.append("file", resolvedUrl);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Cloudinary upload failed for "${resolvedUrl}": ${res.status} — ${body}`,
    );
  }

  const data = await res.json();
  return data.secure_url as string;
}

/** Upload an array of image URLs concurrently (with a concurrency cap). */
async function uploadMany(urls: string[], concurrency = 4): Promise<string[]> {
  const results: string[] = new Array(urls.length).fill("");
  for (let i = 0; i < urls.length; i += concurrency) {
    const chunk = urls.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      chunk.map((u) => uploadImageUrlToCloudinary(u)),
    );
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") results[i + j] = r.value;
      else
        console.warn(
          `[shopify-importer] Image upload skipped: ${chunk[j]} — ${(r as PromiseRejectedResult).reason}`,
        );
    });
  }
  return results.filter(Boolean);
}

// ─── Firestore helpers (mirrors bulk-uploader helpers exactly) ────────────────

async function findFirestoreDoc(
  col: string,
  field: string,
  value: string,
): Promise<string | null> {
  const snap = await getDocs(
    query(collection(db, col), where(field, "==", value)),
  );
  return snap.empty ? null : snap.docs[0].id;
}

/**
 * Upsert a spec group.
 * - If the group already exists, merge in any new labels.
 * - Returns the Firestore document ID.
 */
async function upsertSpecGroup(
  groupName: string,
  labels: string[],
): Promise<string> {
  const existingId = await findFirestoreDoc("specs", "name", groupName);

  if (existingId) {
    const snap = await getDocs(
      query(collection(db, "specs"), where("name", "==", groupName)),
    );
    const existing = snap.docs[0];
    const existingItems: { label: string }[] = existing.data().items ?? [];
    const existingSet = new Set(existingItems.map((i) => i.label));
    const merged = [
      ...existingItems,
      ...labels.filter((l) => !existingSet.has(l)).map((l) => ({ label: l })),
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

/**
 * Upsert a standalone spec item (ungrouped — lives in the `specItems` collection).
 * Returns the Firestore document ID.
 */
async function upsertStandaloneSpecItem(label: string): Promise<string> {
  const existingId = await findFirestoreDoc("specItems", "label", label);
  if (existingId) return existingId;

  const ref = await addDoc(collection(db, "specItems"), {
    label,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Upsert a product family.
 * Merges spec group IDs without duplicating.
 * Returns the Firestore document ID.
 */
async function upsertProductFamily(
  title: string,
  specGroupIds: string[],
): Promise<string> {
  const existingId = await findFirestoreDoc("productfamilies", "title", title);

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

// ─── Shopify metafield fetch ───────────────────────────────────────────────────

/**
 * Fetch metafields for a single Shopify product.
 * Requires the `read_products` scope on the Admin token.
 */
async function fetchMetafields(productId: number): Promise<ShopifyMetafield[]> {
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/products/${productId}/metafields.json`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.metafields ?? [];
}

// ─── Shopify product fetch ────────────────────────────────────────────────────

/**
 * Fetch a page of Shopify products.
 * Shopify paginates via Link headers (cursor-based).
 */
async function fetchShopifyPage(
  pageInfo?: string,
): Promise<{ products: ShopifyProduct[]; nextPageInfo: string | null }> {
  const params = new URLSearchParams({
    limit: "250",
    fields: [
      "id",
      "title",
      "handle",
      "body_html",
      "product_type",
      "vendor",
      "status",
      "tags",
      "images",
      "variants",
      "options",
    ].join(","),
  });
  if (pageInfo) params.set("page_info", pageInfo);

  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/products.json?${params}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const linkHeader = res.headers.get("Link") ?? "";
  const nextMatch = linkHeader.match(
    /<[^>]+page_info=([^&>]+)[^>]*>;\s*rel="next"/,
  );
  const nextPageInfo = nextMatch ? nextMatch[1] : null;

  return { products: data.products ?? [], nextPageInfo };
}

/**
 * Fetch ALL Shopify products, walking pagination automatically.
 * Filtered by importMode before returning.
 */
export async function fetchShopifyProducts(
  mode: ImportMode = "draft",
): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  let pageInfo: string | undefined;

  do {
    const { products, nextPageInfo } = await fetchShopifyPage(pageInfo);
    all.push(...products);
    pageInfo = nextPageInfo ?? undefined;
  } while (pageInfo);

  // Draft mode  → only products that are NOT active (draft or archived)
  // Public mode → only active products
  return all.filter((p) =>
    mode === "public" ? p.status === "active" : p.status !== "active",
  );
}

// ─── Spec extraction ──────────────────────────────────────────────────────────

/**
 * Extract RawSpec[] from a Shopify product.
 *
 * Strategy (in priority order):
 *  1. Metafields — namespace is treated as groupName, key as label, value as value.
 *     Namespace "custom" is treated as ungrouped.
 *  2. Product options with multiple values → each value becomes a spec.
 *     Option name = label, individual values = spec value per variant.
 *     Groups are inferred from option name if it contains a "/" delimiter
 *     e.g. "Dimensions/Width" → group "Dimensions", label "Width".
 *  3. Variant-level options (e.g. Size, Color) → ungrouped.
 */
function extractRawSpecs(
  product: ShopifyProduct,
  metafields: ShopifyMetafield[],
): RawSpec[] {
  const specs: RawSpec[] = [];

  // 1. Metafields
  for (const mf of metafields) {
    if (!mf.value) continue;

    // namespace "custom" = Shopify's default for ungrouped custom metafields
    const isUngrouped =
      mf.namespace === "custom" || mf.namespace === "global" || !mf.namespace;

    specs.push({
      groupName: isUngrouped ? null : mf.namespace.toUpperCase(),
      label: mf.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      value: mf.value,
    });
  }

  // 2 & 3. Product options → infer specs from first variant's option values
  //   (Shopify options describe possible values; we use variant[0] as the
  //   representative product when there's only one meaningful variant)
  const primaryVariant = product.variants[0];
  const OPTION_KEYS = ["option1", "option2", "option3"] as const;

  for (let i = 0; i < product.options.length; i++) {
    const option = product.options[i];

    // Skip generic Shopify default option
    if (
      option.name.toLowerCase() === "title" &&
      option.values[0] === "Default Title"
    )
      continue;

    const optionKey = OPTION_KEYS[i];
    const rawValue =
      (optionKey && primaryVariant?.[optionKey]) ?? option.values[0] ?? "";

    if (!rawValue) continue;

    // Detect group from "/" delimiter in option name
    const parts = option.name.split("/");
    if (parts.length >= 2) {
      specs.push({
        groupName: parts[0].trim().toUpperCase(),
        label: parts.slice(1).join("/").trim(),
        value: rawValue,
      });
    } else {
      specs.push({
        groupName: null,
        label: option.name,
        value: rawValue,
      });
    }
  }

  return specs;
}

/**
 * Resolve RawSpec[] into TechnicalSpec[] (the shape AddNewProduct saves).
 *
 * Rules:
 *  - Grouped specs → upsert their spec group, add to technicalSpecs normally
 *  - Ungrouped specs → upsert as standalone specItems (specItems collection),
 *    AND include them in technicalSpecs under a synthetic group name
 *    "UNGROUPED SPECIFICATIONS" so the product record still contains the values.
 *
 * Returns the technicalSpecs array and the list of spec group IDs created/updated.
 */
async function resolveSpecs(
  rawSpecs: RawSpec[],
  productFamily: string,
): Promise<{ technicalSpecs: TechnicalSpec[]; specGroupIds: string[] }> {
  // Separate grouped vs ungrouped
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

  // Upsert grouped spec groups
  for (const [groupName, entries] of grouped.entries()) {
    const labels = entries.map((e) => e.name);
    const groupId = await upsertSpecGroup(groupName, labels);
    specGroupIds.push(groupId);
    technicalSpecs.push({
      specGroup: groupName,
      specs: entries,
    });
  }

  // Handle ungrouped specs
  if (ungrouped.length > 0) {
    // 1. Save each as a standalone specItem (the pool for SpecsMaintenance)
    await Promise.all(ungrouped.map((s) => upsertStandaloneSpecItem(s.name)));

    // 2. Also fold them into a synthetic spec group so the product record
    //    carries the values (consistent with how AddNewProduct saves data)
    const UNGROUPED_GROUP = "UNGROUPED SPECIFICATIONS";
    const ungroupedLabels = ungrouped.map((s) => s.name);
    const ungroupedGroupId = await upsertSpecGroup(
      UNGROUPED_GROUP,
      ungroupedLabels,
    );
    specGroupIds.push(ungroupedGroupId);
    technicalSpecs.push({
      specGroup: UNGROUPED_GROUP,
      specs: ungrouped,
    });
  }

  return { technicalSpecs, specGroupIds };
}

export async function normalizeShopifyProduct(
  product: ShopifyProduct,
  mode: ImportMode = "draft",
  onProgress?: (msg: string) => void,
): Promise<NormalizedProduct> {
  const log = (msg: string) => onProgress?.(msg);

  // ── 1. Basic field mapping ─────────────────────────────────────────────────
  const primaryVariant = product.variants[0];

  const itemCode = primaryVariant?.sku?.trim() || String(product.id);
  const productFamily =
    product.product_type?.trim().toUpperCase() || "UNCATEGORISED";
  const brand = product.vendor?.trim() || "";

  const regularPrice = parsePrice(
    primaryVariant?.compare_at_price ?? primaryVariant?.price,
  );
  const salePrice = parsePrice(primaryVariant?.price);
  // If there's no compare_at_price, treat both as the same
  const finalRegularPrice = regularPrice > salePrice ? regularPrice : salePrice;
  const finalSalePrice = regularPrice > salePrice ? salePrice : 0;

  const itemDescription = product.title.trim();
  const shortDescription = stripHtml(product.body_html ?? "").slice(0, 250);
  const slug = toSlug(product.handle || itemDescription);

  // ── 2. Images ──────────────────────────────────────────────────────────────
  log(`  → Uploading images for "${itemDescription}"...`);

  const sortedImages = [...product.images].sort(
    (a, b) => a.position - b.position,
  );
  const imageUrls = sortedImages.map((img) => img.src);

  const uploadedUrls = await uploadMany(imageUrls);
  const mainImage = uploadedUrls[0] ?? "";
  const rawImage = uploadedUrls[1] ?? ""; // second image treated as raw/alternate
  const galleryImages = uploadedUrls.slice(2); // rest go to gallery
  const qrCodeImage = ""; // QR not available from Shopify; remains empty

  // ── 3. Metafields + spec extraction ───────────────────────────────────────
  log(`  → Fetching metafields...`);
  const metafields = await fetchMetafields(product.id);
  const rawSpecs = extractRawSpecs(product, metafields);

  log(`  → Resolving ${rawSpecs.length} spec(s)...`);
  const { technicalSpecs, specGroupIds } = await resolveSpecs(
    rawSpecs,
    productFamily,
  );

  // ── 4. Upsert product family ───────────────────────────────────────────────
  log(`  → Upserting product family "${productFamily}"...`);
  await upsertProductFamily(productFamily, specGroupIds);

  // ── 5. SEO ────────────────────────────────────────────────────────────────
  const seo: SeoPayload = {
    itemDescription,
    description: shortDescription,
    canonical: "", // Populated at write-time when website is known
    ogImage: mainImage,
    robots: "index, follow",
    lastUpdated: new Date().toISOString(),
  };

  // ── 6. Assemble final payload ──────────────────────────────────────────────
  const normalizedStatus: "draft" | "public" =
    mode === "public" ? "public" : "draft";

  return {
    productClass: "",
    itemDescription,
    shortDescription,
    slug,
    ecoItemCode: itemCode,
    litItemCode: "",
    regularPrice: finalRegularPrice,
    salePrice: finalSalePrice,
    technicalSpecs,
    mainImage,
    rawImage,
    qrCodeImage,
    galleryImages,
    website: [],
    websites: [],
    productFamily,
    brand,
    applications: [],
    status: normalizedStatus,
    seo,
    importSource: "shopify-importer",
    shopifyProductId: product.id,
  };
}

// ─── Batch importer ───────────────────────────────────────────────────────────

export interface ImportResult {
  shopifyProductId: number;
  title: string;
  status: "success" | "skipped" | "failed";
  reason?: string;
  firestoreId?: string;
}

export interface BatchImportOptions {
  mode?: ImportMode;
  onProgress?: (
    current: number,
    total: number,
    message: string,
    result?: ImportResult,
  ) => void;
  isCancelled?: () => boolean;
}

export async function importShopifyProducts(
  options: BatchImportOptions = {},
): Promise<ImportResult[]> {
  const { mode = "draft", onProgress, isCancelled } = options;

  const results: ImportResult[] = [];
  const log = (msg: string) => onProgress?.(results.length, 0, msg);

  log(`[shopify-importer] Fetching Shopify products (mode: ${mode})...`);
  const products = await fetchShopifyProducts(mode);
  const total = products.length;
  log(`[shopify-importer] ${total} product(s) to import.`);

  for (let i = 0; i < products.length; i++) {
    if (isCancelled?.()) {
      log("[shopify-importer] Import cancelled by caller.");
      break;
    }

    const product = products[i];
    onProgress?.(i, total, `Processing: ${product.title}`);

    // Duplicate check — by SKU (ecoItemCode)
    const sku = product.variants[0]?.sku?.trim() || String(product.id);
    const dupSnap = await getDocs(
      query(collection(db, "products"), where("ecoItemCode", "==", sku)),
    );
    if (!dupSnap.empty) {
      const result: ImportResult = {
        shopifyProductId: product.id,
        title: product.title,
        status: "skipped",
        reason: `Duplicate SKU "${sku}"`,
      };
      results.push(result);
      onProgress?.(i + 1, total, `Skipped: ${product.title}`, result);
      continue;
    }

    try {
      const normalized = await normalizeShopifyProduct(product, mode, (msg) =>
        onProgress?.(i, total, msg),
      );

      const ref = await addDoc(collection(db, "products"), {
        ...normalized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const result: ImportResult = {
        shopifyProductId: product.id,
        title: product.title,
        status: "success",
        firestoreId: ref.id,
      };
      results.push(result);
      onProgress?.(i + 1, total, `✅ Saved: ${product.title}`, result);
    } catch (err: any) {
      const result: ImportResult = {
        shopifyProductId: product.id,
        title: product.title,
        status: "failed",
        reason: err?.message ?? "Unknown error",
      };
      results.push(result);
      onProgress?.(
        i + 1,
        total,
        `❌ Failed: ${product.title} — ${result.reason}`,
        result,
      );
    }

    // Small breathing room to avoid hammering Cloudinary / Firestore
    await new Promise((r) => setTimeout(r, 80));
  }

  return results;
}

export const runShopifyImport = importShopifyProducts;
