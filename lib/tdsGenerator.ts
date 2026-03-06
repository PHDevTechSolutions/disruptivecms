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
 * N/A filtering: spec entries whose value trims to "N/A" (case-insensitive)
 * are automatically excluded from generated PDFs.
 *
 * Drawings section: renders only slots that have an actual URL, side-by-side,
 * up to 3 per row, always on the same single page.
 * - Fixed slot dimensions: 168 pt wide × 88 pt tall per thumbnail.
 * - Images are rendered object-contain (aspect-ratio preserved, centred inside
 *   their fixed slot — never stretched or cropped).
 * - Partial rows (1 or 2 images) are centred within the full table width.
 *
 * File-size optimisation (targets well below Cloudinary's 10 MB raw limit):
 * - jsPDF is initialised with { compress: true } which applies PDF-level
 *   deflate/flate compression to every content stream in the file.
 * - No image pixels are altered — all images are embedded in their original
 *   format (JPEG/PNG/WEBP) so transparency is preserved and there is no
 *   quality loss or black-background artefact.
 *
 * Supported slots (in order):
 *   dimensionalDrawingUrl · recommendedMountingHeightUrl · driverCompatibilityUrl
 *   baseImageUrl · illuminanceLevelUrl · wiringDiagramUrl
 *   installationUrl · wiringLayoutUrl · terminalLayoutUrl · accessoriesImageUrl
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TdsSpecEntry {
  /** Spec label – will be uppercased automatically */
  name: string;
  /** Spec value – will be uppercased automatically; omit/empty for templates */
  value?: string;
}

export interface TdsTechnicalSpec {
  /** Spec group / section header – uppercased automatically */
  specGroup: string;
  specs: TdsSpecEntry[];
}

/** Input for a filled product TDS */
export interface GenerateTdsInput {
  itemDescription: string;
  litItemCode: string;
  technicalSpecs: TdsTechnicalSpec[];
  // ── Product image (rawImageUrl used as fallback when mainImageUrl is absent) ─
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

/** Normalise any string to ALL CAPS, trimmed. */
function caps(s?: string | null): string {
  return (s ?? "").toUpperCase().trim();
}

/**
 * Returns true if a spec value should be excluded from the TDS.
 * Excludes: empty/nullish values AND the literal string "N/A" (case-insensitive).
 */
function isExcludedSpecValue(value?: string | null): boolean {
  const trimmed = (value ?? "").trim();
  return !trimmed || trimmed.toUpperCase() === "N/A";
}

/**
 * Fetch any URL and return a base64 data-URI in the image's original format,
 * or null on any failure.  No pixel data is altered.
 */
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

/** Resolve natural image dimensions from a base64 data-URI. */
function getImageDimensions(b64: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = () => resolve({ w: 100, h: 100 });
    img.src = b64;
  });
}

/** Detect image format from a base64 data-URI prefix. */
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

// ─── Drawing section — fixed slot dimensions ─────────────────────────────────
//
// A4 usable width : 595.28 − 28 − 28 = 539.28 pt
// Per column      : 539.28 / 3 ≈ 179.76 pt
// Horizontal pad  : 6 pt each side  →  effective image slot width ≈ 168 pt

const DRAWINGS_PER_ROW = 3;
const DRAWING_IMG_H = 88; // pt — fixed slot height for every thumbnail
const DRAWING_LABEL_H = 14; // pt — label text area above each thumbnail
const DRAWING_ROW_GAP = 10; // pt — vertical gap between rows
const DRAWING_IMG_PAD = 6; // pt — horizontal padding inside each column slot

// ─── Core PDF renderer ────────────────────────────────────────────────────────

async function buildTdsPdf(
  displayName: string,
  litItemCode: string,
  tableRows: unknown[],
  mainImageUrl?: string,
  drawingSlots: DrawingSlot[] = [],
): Promise<Blob> {
  // compress: true enables PDF-level deflate compression on all content
  // streams — no pixels are changed, file size typically drops 40–60 %.
  const pdf = new jsPDF({
    orientation: "p",
    unit: "pt",
    format: "a4",
    compress: true,
  });
  const PW = pdf.internal.pageSize.getWidth(); // 595.28 pt
  const PH = pdf.internal.pageSize.getHeight(); // 841.89 pt
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // ── Derived layout values ─────────────────────────────────────────────────
  const TABLE_W = PW - MARGIN_L - MARGIN_R;
  const COL_LABEL = 210;
  const COL_VALUE = TABLE_W - COL_LABEL;

  const TOP_BLOCK_Y = HEADER_H + 24;
  const TABLE_Y = TOP_BLOCK_Y + BOX_H + 20;

  // ── Header (raw, no recompress) ───────────────────────────────────────────
  const headerB64 = await urlToBase64(`${origin}/templates/lit-header.png`);
  if (headerB64) {
    pdf.addImage(headerB64, imgFormat(headerB64), 0, 0, PW, HEADER_H);
  }

  // ── Product image box ─────────────────────────────────────────────────────
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(1.2);
  pdf.rect(MARGIN_L, TOP_BLOCK_Y, BOX_W, BOX_H);

  if (mainImageUrl) {
    // Embed raw — no pixel alteration, format preserved (PNG transparency safe)
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

  // ── Product name ──────────────────────────────────────────────────────────
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

  // ── Spec table ────────────────────────────────────────────────────────────
  autoTable(pdf, {
    startY: TABLE_Y,
    theme: "grid",
    pageBreak: "avoid",
    tableWidth: TABLE_W,
    margin: { left: MARGIN_L, right: MARGIN_R },

    styles: {
      font: "helvetica",
      fontStyle: "normal",
      fontSize: 8.5,
      cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
      overflow: "linebreak",
      lineColor: [180, 180, 180],
      lineWidth: 0.4,
      textColor: [30, 30, 30],
      valign: "middle",
    },

    columnStyles: {
      0: { cellWidth: COL_LABEL, fontStyle: "bold", fontSize: 8.5 },
      1: { cellWidth: COL_VALUE, fontStyle: "normal", fontSize: 8.5 },
    },

    didParseCell(data) {
      if (
        data.row.raw &&
        Array.isArray(data.row.raw) &&
        (data.row.raw[0] as any)?.colSpan === 2
      ) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 8.5;
        data.cell.styles.fillColor = [220, 220, 220];
        data.cell.styles.textColor = [20, 20, 20];
        data.cell.styles.cellPadding = { top: 5, bottom: 5, left: 6, right: 6 };
      }
      if (data.column.index === 0 && data.cell.styles.fontStyle !== "bold") {
        data.cell.styles.fontStyle = "bold";
      }
    },

    body: tableRows as any[],
  });

  // ── Drawings section ──────────────────────────────────────────────────────
  // Each slot has a fixed 168 pt wide × DRAWING_IMG_H pt tall image area.
  // Images are rendered object-contain: scaled to fit the fixed slot while
  // preserving aspect ratio, centred on both axes.
  // All images fetched in their original format (no pixel alteration).
  const activeSlots = drawingSlots.filter((s) => !!s.url.trim());

  if (activeSlots.length > 0) {
    const tableEndY = (pdf as any).lastAutoTable.finalY as number;
    const rowBlockH = DRAWING_LABEL_H + DRAWING_IMG_H + DRAWING_ROW_GAP;
    let curY = tableEndY + 16;

    const perColW = TABLE_W / DRAWINGS_PER_ROW;
    const slotImgW = perColW - DRAWING_IMG_PAD * 2;

    // Fetch all drawing images in parallel — raw, no recompression
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

      // Centre partial rows within the full table width
      const groupW = count * perColW;
      const groupOffX = MARGIN_L + (TABLE_W - groupW) / 2;

      // ── Labels (centred above each slot) ───────────────────────────────────
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

      // ── Images (object-contain inside fixed slot) ──────────────────────────
      for (let colIdx = 0; colIdx < rowSlots.length; colIdx++) {
        const b64 = allB64[rowStart + colIdx];
        if (!b64) continue;

        const { w: natW, h: natH } = await getImageDimensions(b64);

        // Scale-to-fit (object-contain): largest uniform scale that fits slot
        const scale = Math.min(slotImgW / natW, DRAWING_IMG_H / natH);
        const fw = natW * scale;
        const fh = natH * scale;

        // Centre within the fixed slot on both axes
        const slotOriginX = groupOffX + colIdx * perColW + DRAWING_IMG_PAD;
        const drawX = slotOriginX + (slotImgW - fw) / 2;
        const drawY = imgRowY + (DRAWING_IMG_H - fh) / 2;

        pdf.addImage(b64, imgFormat(b64), drawX, drawY, fw, fh);
      }

      curY += rowBlockH;
    }
  }

  // ── Footer (raw, no recompress) ───────────────────────────────────────────
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
 * Builds the ordered list of drawing slots from a `GenerateTdsInput`.
 * Only slots with a non-empty URL survive — these are what the PDF renders.
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
  ].filter((s) => !!s.url.trim());
}

/**
 * Generate a **filled** product TDS PDF.
 * - Spec entries with empty or "N/A" values are excluded.
 * - All text is normalised to ALL CAPS.
 * - Images are embedded in their original format — no pixels altered, no
 *   black-background artefact on transparent PNGs.
 * - PDF-level deflate compression (compress: true) keeps file size well
 *   below Cloudinary's 10 MB raw upload limit.
 * - Drawings rendered side-by-side (up to 3 per row) in fixed 168 pt × 88 pt
 *   slots using object-contain scaling — aspect ratio always preserved.
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
          fontSize: 8.5,
        },
      },
    ]);
    validSpecs.forEach((spec) => {
      rows.push([caps(spec.name) + " :", caps(spec.value)]);
    });
  });

  // Prefer mainImageUrl; fall back to rawImageUrl when main is absent
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
 * Generate a **blank template** TDS PDF for a productFamily.
 * Contains all spec label rows with empty value cells.
 * No drawings section — no images are available at template-generation time.
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
          fontSize: 8.5,
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
 * Upload a PDF `Blob` to Cloudinary's raw endpoint.
 * Returns the `secure_url` of the uploaded file.
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
