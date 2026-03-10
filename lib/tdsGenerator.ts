/**
 * lib/tdsGenerator.ts
 *
 * No-UI, reusable TDS PDF generator.
 * - generateTdsPdf()         → filled product TDS (spec values from technicalSpecs)
 * - generateTdsTemplatePdf() → blank template with placeholders (for productFamily saves)
 * - uploadTdsPdf()           → uploads a PDF Blob to Cloudinary raw endpoint
 *
 * Always uses the LIT brand.
 * Header  : /public/templates/lit-header.png
 * Footer  : /public/templates/lit-footer.png
 * All text is normalised to ALL CAPS.
 * A4 portrait. Output filename: {itemDescription}_TDS.pdf
 *
 * Layout strategy (single-page guarantee):
 *   1. Reserve MIN_DRAWING_IMG_H × rows as a hard floor for images so specs
 *      are given a realistic budget without hogging all the space.
 *   2. Run the font-shrink loop against that budget (min readable: 6.5 pt).
 *   3. After the table renders, measure the ACTUAL tableEndY and divide the
 *      remaining vertical space across all drawing rows — clamped to
 *      [MIN_DRAWING_IMG_H, DRAWING_IMG_H].  Images always fill available
 *      room without ever spilling onto a second page.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  litItemCode: string;
  technicalSpecs: TdsTechnicalSpec[];
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
  typeOfPlugUrl?: string; // ← NEW
}

/** Input for a blank template TDS (saved against a productFamily) */
export interface TdsTemplateSpecGroup {
  name: string;
  items: { label: string }[];
}

export interface GenerateTdsTemplateInput {
  specGroups: TdsTemplateSpecGroup[];
}

// ─── Drawing slot definition ──────────────────────────────────────────────────

interface DrawingSlot {
  label: string;
  url: string;
}

// ─── Internal utilities ───────────────────────────────────────────────────────

function caps(s?: string | null): string {
  return (s ?? "").toUpperCase().trim();
}

function isExcludedSpecValue(value?: string | null): boolean {
  const trimmed = (value ?? "").trim();
  return !trimmed || trimmed.toUpperCase() === "N/A";
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

/** Maximum (ideal) image height per drawing slot when space is plentiful */
const DRAWING_IMG_H = 165;

/**
 * Absolute minimum image height — still legible at this size.
 * Used as a hard floor when the spec table is very tall.
 */
const MIN_DRAWING_IMG_H = 60;

const DRAWING_LABEL_H = 16;
const DRAWING_ROW_GAP = 8;
const DRAWING_SECTION_TOP_GAP = 10;
const DRAWING_IMG_PAD = 3;

/** Space reserved at the bottom of the page for the footer image */
const FOOTER_RESERVE_H = 72;

/**
 * Readable minimum font size. Going below this makes spec text hard to read,
 * so we clamp here and let image height absorb any remaining overflow instead.
 */
const MIN_FONT_SIZE = 6.5;
const MAX_FONT_SIZE = 8.5;
const FONT_SHRINK_STEP = 0.25;

/**
 * Height occupied by the drawings section for a given slot count + image height.
 */
function drawingSectionHeight(slotCount: number, imgH: number): number {
  if (slotCount === 0) return 0;
  const rows = Math.ceil(slotCount / DRAWINGS_PER_ROW);
  return (
    DRAWING_SECTION_TOP_GAP + rows * (DRAWING_LABEL_H + imgH + DRAWING_ROW_GAP)
  );
}

/**
 * Returns the drawing section height to RESERVE as a table budget, using
 * a tiered target image height so the table shrinks proportionally with the
 * number of drawing rows rather than always using the hard minimum.
 *
 *   1 row  (1-3 slots)  → 120 pt images  — comfortable
 *   2 rows (4-6 slots)  →  90 pt images  — compact but readable
 *   3 rows (7-9 slots)  →  72 pt images  — tight but still clear
 *   4 rows (10-11 slots)→  62 pt images  — dense layout, min viable
 */
function budgetDrawingHeight(slotCount: number): number {
  if (slotCount === 0) return 0;
  const rows = Math.ceil(slotCount / DRAWINGS_PER_ROW);
  const imgH = rows === 1 ? 120 : rows === 2 ? 90 : rows === 3 ? 72 : 62;
  return drawingSectionHeight(slotCount, imgH);
}

/**
 * Cell padding that compresses aggressively as font shrinks, giving back
 * as much vertical space as possible without becoming cramped.
 */
function cellPaddingForFontSize(fontSize: number): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
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
  litItemCode: string,
  tableRows: unknown[],
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
  const TOP_BLOCK_Y = HEADER_H + 24;
  const TABLE_Y = TOP_BLOCK_Y + BOX_H + 20;

  const activeSlots = drawingSlots.filter((s) => !!s.url.trim());
  const numDrawingRows = Math.ceil(activeSlots.length / DRAWINGS_PER_ROW);

  // ── Spec table budget ───────────────────────────────────────────────────
  // Reserve a tiered drawing budget (more rows = more reserved space, so
  // the table shrinks proportionally rather than always using the hard min).
  const availableH = PH - TABLE_Y - FOOTER_RESERVE_H;
  const tieredDrawH = budgetDrawingHeight(activeSlots.length);
  const maxTableH = Math.max(availableH - tieredDrawH, 60);

  // ── Font-shrink loop ────────────────────────────────────────────────────
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

  // Header
  const headerB64 = await urlToBase64(`${origin}/templates/lit-header.png`);
  if (headerB64) {
    pdf.addImage(headerB64, imgFormat(headerB64), 0, 0, PW, HEADER_H);
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

    // Compute remaining space between table bottom and footer, then divide
    // evenly across drawing rows to get the adaptive image height.
    const remainingH =
      PH - FOOTER_RESERVE_H - tableEndY - DRAWING_SECTION_TOP_GAP;
    const perRowBudget = numDrawingRows > 0 ? remainingH / numDrawingRows : 0;
    const rawImgH = perRowBudget - DRAWING_LABEL_H - DRAWING_ROW_GAP;

    // Clamp: never smaller than MIN (still legible), never larger than the ideal max
    const effectiveImgH = Math.max(
      MIN_DRAWING_IMG_H,
      Math.min(DRAWING_IMG_H, rawImgH),
    );

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
      const count = rowSlots.length;
      const groupW = count * perColW;
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

  // Footer
  const footerB64 = await urlToBase64(`${origin}/templates/lit-footer.png`);
  if (footerB64) {
    const { w: fw, h: fh } = await getImageDimensions(footerB64);
    const ratio = PW / fw;
    const finalH = fh * ratio;
    pdf.addImage(footerB64, imgFormat(footerB64), 0, PH - finalH, PW, finalH);
  }

  return pdf.output("blob");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the ordered list of drawing slots from a GenerateTdsInput.
 * Only slots with a non-empty URL survive.
 */
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
    { label: "Type of Plug", url: input.typeOfPlugUrl ?? "" }, // ← NEW
  ].filter((s) => !!s.url.trim());
}

/**
 * Generate a filled product TDS PDF.
 */
export async function generateTdsPdf(input: GenerateTdsInput): Promise<Blob> {
  const rows: unknown[] = [];

  rows.push(["BRAND :", { content: "LIT", styles: { fontStyle: "bold" } }]);
  rows.push(["ITEM CODE :", caps(input.litItemCode)]);

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

  return buildTdsPdf(
    input.itemDescription,
    input.litItemCode,
    rows,
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
  const rows: unknown[] = [];

  rows.push(["BRAND :", { content: "LIT", styles: { fontStyle: "bold" } }]);
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

  return buildTdsPdf('"PRODUCT NAME"', "", rows, undefined, []);
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
