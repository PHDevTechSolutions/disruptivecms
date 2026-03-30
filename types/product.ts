// ─── Item Code Brands ─────────────────────────────────────────────────────────

export type ItemCodeBrand = "ECOSHIFT" | "LIT" | "LUMERA" | "OKO" | "ZUMTOBEL";

export interface ItemCodes {
  ECOSHIFT?: string;
  LIT?: string;
  LUMERA?: string;
  OKO?: string;
  ZUMTOBEL?: string;
}

export const ITEM_CODE_BRAND_CONFIG: Record<
  ItemCodeBrand,
  {
    label: string;
    color: string;
    badgeClass: string;
    dotClass: string;
    textClass: string;
  }
> = {
  ECOSHIFT: {
    label: "Ecoshift",
    color: "#16a34a",
    badgeClass:
      "bg-green-100 text-green-800 border-green-300 hover:bg-green-100",
    dotClass: "bg-green-500",
    textClass: "text-green-700",
  },
  LIT: {
    label: "LIT",
    color: "#ca8a04",
    badgeClass:
      "bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100",
    dotClass: "bg-yellow-500",
    textClass: "text-yellow-700",
  },
  LUMERA: {
    label: "Lumera",
    color: "#ea580c",
    badgeClass:
      "bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-100",
    dotClass: "bg-orange-500",
    textClass: "text-orange-700",
  },
  OKO: {
    label: "OKO",
    color: "#0891b2",
    badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-100",
    dotClass: "bg-cyan-500",
    textClass: "text-cyan-700",
  },
  ZUMTOBEL: {
    label: "Zumtobel",
    color: "#18181b",
    badgeClass:
      "bg-zinc-900 text-zinc-100 border-zinc-700 hover:bg-zinc-800",
    dotClass: "bg-zinc-900",
    textClass: "text-zinc-900",
  },
};

export const ALL_BRANDS = Object.keys(
  ITEM_CODE_BRAND_CONFIG,
) as ItemCodeBrand[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns filled brand entries from an itemCodes object.
 */
export function getFilledItemCodes(
  itemCodes?: ItemCodes,
): { brand: ItemCodeBrand; code: string }[] {
  if (!itemCodes) return [];
  return ALL_BRANDS.filter(
    (b) => itemCodes[b] && itemCodes[b]!.trim() !== "" && itemCodes[b]!.trim().toUpperCase() !== "N/A",
  ).map((b) => ({ brand: b, code: itemCodes[b]! }));
}

/**
 * Get the primary (first filled) item code.
 */
export function getPrimaryItemCode(
  itemCodes?: ItemCodes,
): { brand: ItemCodeBrand; code: string } | null {
  const filled = getFilledItemCodes(itemCodes);
  return filled[0] ?? null;
}

/**
 * Validate that at least one item code is provided.
 */
export function hasAtLeastOneItemCode(itemCodes?: ItemCodes): boolean {
  return getFilledItemCodes(itemCodes).length > 0;
}

/**
 * Build a display string for item codes (used in TDS filename, etc.)
 */
export function buildItemCodeDisplay(itemCodes?: ItemCodes): string {
  const filled = getFilledItemCodes(itemCodes);
  if (filled.length === 0) return "";
  return filled.map((f) => f.code).join(" / ");
}

/**
 * Legacy migration: convert old litItemCode/ecoItemCode fields to itemCodes.
 */
export function migrateToItemCodes(data: {
  litItemCode?: string;
  ecoItemCode?: string;
  itemCode?: string;
  itemCodes?: ItemCodes;
}): ItemCodes {
  if (data.itemCodes && hasAtLeastOneItemCode(data.itemCodes)) {
    return data.itemCodes;
  }
  const result: ItemCodes = {};
  if (data.litItemCode && data.litItemCode.trim() && data.litItemCode.trim().toUpperCase() !== "N/A") {
    result.LIT = data.litItemCode.trim();
  }
  if (data.ecoItemCode && data.ecoItemCode.trim() && data.ecoItemCode.trim().toUpperCase() !== "N/A") {
    result.ECOSHIFT = data.ecoItemCode.trim();
  }
  return result;
}

// ─── Product type ──────────────────────────────────────────────────────────────

export type ProductStatus = "draft" | "public";
export type ProductClass = "spf" | "standard" | "";
export type ProductUsage = "INDOOR" | "OUTDOOR" | "SOLAR";

export interface TechnicalSpec {
  specGroup: string;
  specs: { name: string; value: string }[];
}

export interface Product {
  id: string;
  // New schema
  itemCodes?: ItemCodes;
  // Legacy fields (kept for backward compat)
  litItemCode?: string;
  ecoItemCode?: string;
  itemCode?: string;
  itemDescription?: string;
  name?: string;
  shortDescription?: string;
  productClass?: ProductClass;
  productUsage?: ProductUsage[];
  productFamily?: string;
  categories?: string;
  brand?: string | string[];
  brands?: string[];
  website?: string | string[];
  websites?: string[];
  mainImage?: string;
  rawImage?: string | string[];
  galleryImages?: string[];
  qrCodeImage?: string;
  tdsFileUrl?: string;
  technicalSpecs?: TechnicalSpec[];
  status?: ProductStatus;
  slug?: string;
  regularPrice?: number;
  salePrice?: number;
  applications?: string[];
  seo?: Record<string, any>;
  // Technical drawings
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
  createdAt?: any;
  updatedAt?: any;
  importSource?: string;
}