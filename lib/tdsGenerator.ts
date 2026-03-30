/**
 * lib/tdsGenerator.ts  (REFACTORED)
 *
 * Changes from original:
 *  - Supports new `itemCodes` schema ({ ECOSHIFT?, LIT?, LUMERA?, OKO?, ZUMTOBEL? })
 *  - Legacy litItemCode / ecoItemCode still accepted as fallback
 *  - Default output is plain tabular (no header image, no footer image, no background)
 *  - Brand images are now OPTIONAL — set `includeBrandAssets: true` to add header/footer
 *  - All existing logic/layout constants preserved
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ItemCodes, ItemCodeBrand } from "../types/product";
import { getFilledItemCodes, getPrimaryItemCode } from "../types/product";

// ─── Brand type ───────────────────────────────────────────────────────────────

export type TdsBrand = "LIT" | "ECOSHIFT" | "LUMERA" | "OKO" | "ZUMTOBEL";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TdsSpecEntry {
  name: string;
  value?: string;
}

export interface TdsTechnicalSpec {
  specGroup: string;
  specs: TdsSpecEntry[];
}

/** Input for a filled product TDS */
export interface GenerateTdsInput {
  itemDescription: string;
  /**
   * New schema: preferred source of item codes.
   * If provided, takes priority over legacy fields.
   */
  itemCodes?: ItemCodes;
  /** Legacy fallback — used when itemCodes is absent */
  litItemCode?: string;
  ecoItemCode?: string;
  technicalSpecs: TdsTechnicalSpec[];
  /**
   * Brand determines which header/footer images are used (only when includeBrandAssets=true).
   * Defaults to "LIT".
   */
  brand?: TdsBrand;
  /**
   * Whether to include brand header/footer images.
   * Default: FALSE (plain tabular output).
   * Set to true only for branded export (PD role).
   */
  includeBrandAssets?: boolean;
  // ── Product image ─────────────────────────────────────────────────────────
  mainImageUrl?: string;
  rawImageUrl?: string;
  // ── Drawing / technical image slots (all optional) ────────────────────────
  dimensionalDrawingUrl?: string;
  recommendedMountingHeightUrl?: string;
  driverCompatibilityUrl?: string;
  baseImageUrl?: string;
  illuminanceLevelUrl?: string;
  wiringDiagramUrl?: string;
  installationUrl?: string;
  wiringLayoutUrl?: string;
  terminalLayoutUrl?: string;
  accessoriesImageUrl?: string;
  typeOfPlugUrl?: string;
}

/** Input for a blank template TDS (saved against a productFamily) */
export interface TdsTemplateSpecGroup {
  name: string;
  items: { label: string }[];
}

export interface GenerateTdsTemplateInput {
  specGroups: TdsTemplateSpecGroup[];
  brand?: TdsBrand;
  includeBrandAssets?: boolean;
}

// ─── Drawing slot definition ──────────────────────────────────────────────────

interface DrawingSlot {
  label: string;
  url: string;
}

// ─── Brand asset resolver ─────────────────────────────────────────────────────

function brandAssets(brand: TdsBrand): { header: string; footer: string } {
  switch (brand) {
    case "ECOSHIFT":
      return {
        header: "/templates/ecoshift-header.png",
        footer: "/templates/ecoshift-footer.png",
      };
    case "LUMERA":
      return {
        header: "/templates/lumera-header.png",
        footer: "/templates/lumera-footer.png",
      };
    case "OKO":
      return {
        header: "/templates/oko-header.png",
        footer: "/templates/oko-footer.png",
      };
    case "ZUMTOBEL":
      return {
        header: "/templates/zumtobel-header.png",
        footer: "/templates/zumtobel-footer.png",
      };
    case "LIT":
    default:
      return {
        header: "/templates/lit-header.png",
        footer: "/templates/lit-footer.png",
      };
  }
}

// ─── Internal utilities ───────────────────────────────────────────────────────

function sanitize(s?: string | null): string {
  return (s ?? "")
    .replace(/⌀/g, "\u00D8")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x00-\xFF]/g, "");
}

function caps(s?: string | null): string {
  return sanitize(s).toUpperCase().trim();
}

function isExcludedSpecValue(value?: string | null): boolean {
  const trimmed = (value ?? "").trim();
  return !trimmed || trimmed.toUpperCase() === "N/A";
}

function isBlankCode(v?: string | null): boolean {
  return !v || v.trim().toUpperCase() === "N/A" || v.trim() === "";
}

async function urlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function getImageDimensions(b64: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = () => resolve({ w: 100, h: 100 });
    img.src = b64;
  });
}

function imgFormat(b64: string): string {
  if (/^data:image\/jpe?g/i.test(b64)) return "JPEG";
  if (/^data:image\/webp/i.test(b64)) return "WEBP";
  return "PNG";
}

// ─── Page layout constants ────────────────────────────────────────────────────

const MARGIN_L = 28;
const MARGIN_R = 28;
const HEADER_H = 100;
const BOX_W = 155;
const BOX_H = 130;
const BOX_PAD = 8;
const GAP_IMG_TEXT = 24;

const DRAWINGS_PER_ROW = 3;
const DRAWING_IMG_H = 165;
const MIN_DRAWING_IMG_H = 60;
const DRAWING_LABEL_H = 16;
const DRAWING_ROW_GAP = 8;
const DRAWING_SECTION_TOP_GAP = 10;
const DRAWING_IMG_PAD = 3;
const FOOTER_RESERVE_H = 72;
const MIN_FONT_SIZE = 6.5;
const MAX_FONT_SIZE = 8.5;
const FONT_SHRINK_STEP = 0.25;

function budgetDrawingHeight(slotCount: number): number {
  if (slotCount === 0) return 0;
  const rows = Math.ceil(slotCount / DRAWINGS_PER_ROW);
  const imgH = rows === 1 ? 120 : rows === 2 ? 90 : rows === 3 ? 72 : 62;
  return (
    DRAWING_SECTION_TOP_GAP + rows * (DRAWING_LABEL_H + imgH + DRAWING_ROW_GAP)
  );
}

function cellPaddingForFontSize(fontSize: number) {
  if (fontSize >= 8.0) return { top: 3, bottom: 3, left: 5, right: 5 };
  if (fontSize >= 7.5) return { top: 2, bottom: 2, left: 5, right: 5 };
  if (fontSize >= 7.0) return { top: 2, bottom: 2, left: 4, right: 4 };
  if (fontSize >= 6.5) return { top: 1, bottom: 1, left: 4, right: 4 };
  return { top: 1, bottom: 1, left: 3, right: 3 };
}

function probeTableHeight(
  tableRows: unknown[],
  startY: number,
  tableW: number,
  fontSize: number,
  colLabel: number,
  colValue: number,
): number {
  const probe = new jsPDF({
    orientation: "p",
    unit: "pt",
    format: "a4",
    compress: false,
  });

  autoTable(probe, {
    startY,
    theme: "grid",
    pageBreak: "avoid",
    tableWidth: tableW,
    margin: { left: MARGIN_L, right: MARGIN_R },
    styles: {
      font: "helvetica",
      fontSize,
      cellPadding: cellPaddingForFontSize(fontSize),
      overflow: "linebreak",
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: colLabel },
      1: { cellWidth: colValue },
    },
    body: tableRows as any[],
  });

  if (probe.getNumberOfPages() > 1) return Infinity;
  return (probe as any).lastAutoTable.finalY - startY;
}

// ─── Core PDF renderer ────────────────────────────────────────────────────────

async function buildTdsPdf(
  displayName: string,
  resolvedItemCode: string,
  tableRows: unknown[],
  brand: TdsBrand = "LIT",
  includeBrandAssets: boolean = false,
  mainImageUrl?: string,
  drawingSlots: DrawingSlot[] = [],
): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: "p",
    unit: "pt",
    format: "a4",
    compress: true,
  });

  const PW = pdf.internal.pageSize.getWidth();
  const PH = pdf.internal.pageSize.getHeight();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const TABLE_W = PW - MARGIN_L - MARGIN_R;
  const COL_LABEL = 210;
  const COL_VALUE = TABLE_W - COL_LABEL;

  // When brand assets are included, reserve header space; otherwise start closer to top
  const effectiveHeaderH = includeBrandAssets ? HEADER_H : 20;
  const TOP_BLOCK_Y = effectiveHeaderH + 24;
  const TABLE_Y = TOP_BLOCK_Y + BOX_H + 20;
  const effectiveFooterReserve = includeBrandAssets ? FOOTER_RESERVE_H : 20;

  const activeSlots = drawingSlots.filter((s) => !!s.url.trim());

  const availableH = PH - TABLE_Y - effectiveFooterReserve;
  const tieredDrawH = budgetDrawingHeight(activeSlots.length);
  const maxTableH = Math.max(availableH - tieredDrawH, 60);

  let fontSize = MAX_FONT_SIZE;
  while (fontSize >= MIN_FONT_SIZE) {
    const measured = probeTableHeight(
      tableRows,
      TABLE_Y,
      TABLE_W,
      fontSize,
      COL_LABEL,
      COL_VALUE,
    );
    if (measured <= maxTableH) break;
    fontSize = Math.round((fontSize - FONT_SHRINK_STEP) * 100) / 100;
  }
  fontSize = Math.max(fontSize, MIN_FONT_SIZE);

  // ── Optional brand header ─────────────────────────────────────────────────
  if (includeBrandAssets) {
    const assets = brandAssets(brand);
    const headerB64 = await urlToBase64(`${origin}${assets.header}`);
    if (headerB64) {
      pdf.addImage(headerB64, imgFormat(headerB64), 0, 0, PW, HEADER_H);
    }
  }

  // Product image box
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(1.2);
  pdf.rect(MARGIN_L, TOP_BLOCK_Y, BOX_W, BOX_H);

  if (mainImageUrl) {
    const b64 = await urlToBase64(mainImageUrl);
    if (b64) {
      const { w, h } = await getImageDimensions(b64);
      const ratio = Math.min(
        (BOX_W - BOX_PAD * 2) / w,
        (BOX_H - BOX_PAD * 2) / h,
      );
      const fw = w * ratio;
      const fh = h * ratio;
      pdf.addImage(
        b64,
        imgFormat(b64),
        MARGIN_L + (BOX_W - fw) / 2,
        TOP_BLOCK_Y + (BOX_H - fh) / 2,
        fw,
        fh,
      );
    }
  }

  // Product name
  const nameColX = MARGIN_L + BOX_W + GAP_IMG_TEXT;
  const nameColW = PW - nameColX - MARGIN_R;
  const nameCenterX = nameColX + nameColW / 2;
  const nameBlockH = 40;
  const nameY = TOP_BLOCK_Y + (BOX_H - nameBlockH) / 2 + 14;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(30, 30, 30);

  const nameLines = pdf.splitTextToSize(caps(displayName), nameColW);
  pdf.text(nameLines, nameCenterX, nameY, { align: "center" });

  const lineY = nameY + nameLines.length * 22 + 6;
  pdf.setDrawColor(80, 80, 80);
  pdf.setLineWidth(1.0);
  pdf.line(nameColX, lineY, nameColX + nameColW, lineY);

  // Spec table
  autoTable(pdf, {
    startY: TABLE_Y,
    theme: "grid",
    pageBreak: "avoid",
    tableWidth: TABLE_W,
    margin: { left: MARGIN_L, right: MARGIN_R },
    styles: {
      font: "helvetica",
      fontStyle: "normal",
      fontSize,
      cellPadding: cellPaddingForFontSize(fontSize),
      overflow: "linebreak",
      lineColor: [180, 180, 180],
      lineWidth: 0.4,
      textColor: [30, 30, 30],
      valign: "middle",
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: COL_LABEL, fontStyle: "bold", fontSize },
      1: { cellWidth: COL_VALUE, fontStyle: "normal", fontSize },
    },
    didParseCell(data) {
      if (
        data.row.raw &&
        Array.isArray(data.row.raw) &&
        (data.row.raw[0] as any)?.colSpan === 2
      ) {
        const groupPad = fontSize >= 8 ? 5 : fontSize >= 7 ? 4 : 3;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = fontSize;
        data.cell.styles.fillColor = [220, 220, 220];
        data.cell.styles.textColor = [20, 20, 20];
        data.cell.styles.cellPadding = {
          top: groupPad,
          bottom: groupPad,
          left: 6,
          right: 6,
        };
      }
      if (data.column.index === 0 && data.cell.styles.fontStyle !== "bold") {
        data.cell.styles.fontStyle = "bold";
      }
    },
    body: tableRows as any[],
  });

  // Drawings section
  if (activeSlots.length > 0) {
    const tableEndY = (pdf as any).lastAutoTable.finalY as number;
    const remainingH =
      PH - effectiveFooterReserve - tableEndY - DRAWING_SECTION_TOP_GAP;
    const numDrawingRows = Math.ceil(activeSlots.length / DRAWINGS_PER_ROW);
    const perRowBudget = numDrawingRows > 0 ? remainingH / numDrawingRows : 0;
    const rawImgH = perRowBudget - DRAWING_LABEL_H - DRAWING_ROW_GAP;
    const effectiveImgH = Math.max(25, Math.min(DRAWING_IMG_H, rawImgH));

    const rowBlockH = DRAWING_LABEL_H + effectiveImgH + DRAWING_ROW_GAP;
    let curY = tableEndY + DRAWING_SECTION_TOP_GAP;

    const perColW = TABLE_W / DRAWINGS_PER_ROW;
    const slotImgW = perColW - DRAWING_IMG_PAD * 2;
    const allB64 = await Promise.all(
      activeSlots.map((slot) => urlToBase64(slot.url)),
    );

    for (
      let rowStart = 0;
      rowStart < activeSlots.length;
      rowStart += DRAWINGS_PER_ROW
    ) {
      const rowSlots = activeSlots.slice(rowStart, rowStart + DRAWINGS_PER_ROW);
      const groupW = rowSlots.length * perColW;
      const groupOffX = MARGIN_L + (TABLE_W - groupW) / 2;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.setTextColor(50, 50, 50);

      rowSlots.forEach((slot, colIdx) => {
        const slotX = groupOffX + colIdx * perColW;
        const labelCenterX = slotX + DRAWING_IMG_PAD + slotImgW / 2;
        pdf.text(
          slot.label.toUpperCase(),
          labelCenterX,
          curY + DRAWING_LABEL_H - 2,
          { align: "center", maxWidth: slotImgW },
        );
      });

      const imgRowY = curY + DRAWING_LABEL_H;

      for (let colIdx = 0; colIdx < rowSlots.length; colIdx++) {
        const b64 = allB64[rowStart + colIdx];
        if (!b64) continue;
        const { w: natW, h: natH } = await getImageDimensions(b64);
        const scale = Math.min(slotImgW / natW, effectiveImgH / natH);
        const fw = natW * scale;
        const fh = natH * scale;
        const slotOriginX = groupOffX + colIdx * perColW + DRAWING_IMG_PAD;
        const drawX = slotOriginX + (slotImgW - fw) / 2;
        const drawY = imgRowY + (effectiveImgH - fh) / 2;
        pdf.addImage(b64, imgFormat(b64), drawX, drawY, fw, fh);
      }

      curY += rowBlockH;
    }
  }

  // ── Optional brand footer ─────────────────────────────────────────────────
  if (includeBrandAssets) {
    const assets = brandAssets(brand);
    const footerB64 = await urlToBase64(`${origin}${assets.footer}`);
    if (footerB64) {
      const { w: fw, h: fh } = await getImageDimensions(footerB64);
      const ratio = PW / fw;
      const finalH = fh * ratio;
      pdf.addImage(footerB64, imgFormat(footerB64), 0, PH - finalH, PW, finalH);
    }
  }

  return pdf.output("blob");
}

// ─── Item code resolution from new schema ─────────────────────────────────────

/**
 * Resolve the best display code for the TDS from itemCodes (new schema)
 * or legacy litItemCode / ecoItemCode fields.
 */
function resolveItemCodeForTds(input: {
  itemCodes?: ItemCodes;
  litItemCode?: string;
  ecoItemCode?: string;
  fallback?: string;
}): string {
  // New schema takes priority
  if (input.itemCodes) {
    const primary = getPrimaryItemCode(input.itemCodes);
    if (primary) return primary.code;
  }
  // Legacy fallback
  if (!isBlankCode(input.litItemCode)) return input.litItemCode!;
  if (!isBlankCode(input.ecoItemCode)) return input.ecoItemCode!;
  return input.fallback ?? "";
}

/**
 * Build item code rows for the TDS table showing all brands.
 */
function buildItemCodeRows(input: {
  itemCodes?: ItemCodes;
  litItemCode?: string;
  ecoItemCode?: string;
}): unknown[] {
  const rows: unknown[] = [];

  if (input.itemCodes) {
    const filled = getFilledItemCodes(input.itemCodes);
    if (filled.length > 0) {
      filled.forEach(({ brand, code }) => {
        rows.push([`${brand} ITEM CODE :`, caps(code)]);
      });
      return rows;
    }
  }

  // Legacy fallback
  if (!isBlankCode(input.litItemCode)) {
    rows.push(["LIT ITEM CODE :", caps(input.litItemCode)]);
  }
  if (!isBlankCode(input.ecoItemCode)) {
    rows.push(["ECOSHIFT ITEM CODE :", caps(input.ecoItemCode)]);
  }
  return rows;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function buildDrawingSlots(input: GenerateTdsInput): DrawingSlot[] {
  return [
    { label: "Dimensional Drawing", url: input.dimensionalDrawingUrl ?? "" },
    {
      label: "Recommended Mounting Height",
      url: input.recommendedMountingHeightUrl ?? "",
    },
    { label: "Driver Compatibility", url: input.driverCompatibilityUrl ?? "" },
    { label: "Base", url: input.baseImageUrl ?? "" },
    { label: "Illuminance Level", url: input.illuminanceLevelUrl ?? "" },
    { label: "Wiring Diagram", url: input.wiringDiagramUrl ?? "" },
    { label: "Installation", url: input.installationUrl ?? "" },
    { label: "Wiring Layout", url: input.wiringLayoutUrl ?? "" },
    { label: "Terminal Layout", url: input.terminalLayoutUrl ?? "" },
    { label: "Accessories", url: input.accessoriesImageUrl ?? "" },
    { label: "Type of Plug", url: input.typeOfPlugUrl ?? "" },
  ].filter((s) => !!s.url.trim());
}

export function normaliseBrand(raw?: string | null): TdsBrand {
  const upper = (raw ?? "").trim().toUpperCase();
  if (upper === "ECOSHIFT") return "ECOSHIFT";
  if (upper === "LUMERA") return "LUMERA";
  if (upper === "OKO") return "OKO";
  if (upper === "ZUMTOBEL") return "ZUMTOBEL";
  return "LIT";
}

/**
 * Generate a filled product TDS PDF.
 *
 * Default output: plain tabular (no brand assets).
 * Set `includeBrandAssets: true` for branded output (PD role).
 */
export async function generateTdsPdf(input: GenerateTdsInput): Promise<Blob> {
  const brand = normaliseBrand(input.brand);
  const includeBrandAssets = input.includeBrandAssets ?? false;

  const rows: unknown[] = [];

  // Item code rows (supports new multi-brand schema)
  const itemCodeRows = buildItemCodeRows(input);
  rows.push(...itemCodeRows);

  // Brand row (only when not already shown via itemCodes)
  if (itemCodeRows.length === 0) {
    rows.push(["BRAND :", { content: brand, styles: { fontStyle: "bold" } }]);
  }

  (input.technicalSpecs ?? []).forEach((group) => {
    const validSpecs = (group.specs ?? []).filter(
      (s) => !isExcludedSpecValue(s.value),
    );
    if (!validSpecs.length) return;
    rows.push([
      {
        content: caps(group.specGroup),
        colSpan: 2,
        styles: {
          fillColor: [220, 220, 220],
          fontStyle: "bold",
          fontSize: MAX_FONT_SIZE,
        },
      },
    ]);
    validSpecs.forEach((spec) => {
      rows.push([caps(spec.name) + " :", caps(spec.value)]);
    });
  });

  const effectiveImageUrl = input.mainImageUrl?.trim()
    ? input.mainImageUrl
    : input.rawImageUrl?.trim()
      ? input.rawImageUrl
      : undefined;

  const resolvedCode = resolveItemCodeForTds(input);

  return buildTdsPdf(
    input.itemDescription,
    resolvedCode,
    rows,
    brand,
    includeBrandAssets,
    effectiveImageUrl,
    buildDrawingSlots(input),
  );
}

/**
 * Generate a blank template TDS PDF for a productFamily.
 */
export async function generateTdsTemplatePdf(
  input: GenerateTdsTemplateInput,
): Promise<Blob> {
  const brand = normaliseBrand(input.brand);
  const includeBrandAssets = input.includeBrandAssets ?? false;
  const rows: unknown[] = [];

  rows.push(["BRAND :", { content: brand, styles: { fontStyle: "bold" } }]);
  rows.push(["MODEL NO. :", ""]);

  (input.specGroups ?? []).forEach((group) => {
    if (!group.items?.length) return;
    rows.push([
      {
        content: caps(group.name),
        colSpan: 2,
        styles: {
          fillColor: [220, 220, 220],
          fontStyle: "bold",
          fontSize: MAX_FONT_SIZE,
        },
      },
    ]);
    group.items.forEach((item) => {
      rows.push([caps(item.label) + " :", ""]);
    });
  });

  return buildTdsPdf(
    '"PRODUCT NAME"',
    "",
    rows,
    brand,
    includeBrandAssets,
    undefined,
    [],
  );
}

/**
 * Upload a PDF Blob to Cloudinary's raw endpoint.
 */
export async function uploadTdsPdf(
  blob: Blob,
  filename: string,
  cloudName = "dvmpn8mjh",
  uploadPreset = "taskflow_preset",
): Promise<string> {
  const file = new File([blob], filename, { type: "application/pdf" });
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", uploadPreset);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
    { method: "POST", body: fd },
  );
  const json = await res.json();

  if (!json?.secure_url) {
    throw new Error(
      `Cloudinary PDF upload failed: ${json?.error?.message ?? "no secure_url"}`,
    );
  }
  return json.secure_url as string;
}
