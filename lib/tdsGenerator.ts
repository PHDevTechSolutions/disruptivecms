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
  mainImageUrl?: string;
  dimensionalDrawingUrl?: string;
  illuminanceLevelUrl?: string;
}

/** Input for a blank template TDS (saved against a productFamily) */
export interface TdsTemplateSpecGroup {
  name: string;
  items: { label: string }[];
}

export interface GenerateTdsTemplateInput {
  specGroups: TdsTemplateSpecGroup[];
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

/** Fetch any URL and return a base64 data-URI, or null on failure. */
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

// ─── Core PDF renderer ────────────────────────────────────────────────────────

/**
 * Shared PDF builder used by both filled and template generation.
 *
 * @param displayName  Top-right heading (itemDescription or placeholder)
 * @param litItemCode  Item code value row (empty for templates)
 * @param tableRows    Pre-built jspdf-autotable body rows
 * @param mainImageUrl Optional product image URL
 * @param dimensionalDrawingUrl Optional drawing image URL
 * @param illuminanceLevelUrl   Optional illuminance image URL
 */
async function buildTdsPdf(
  displayName: string,
  litItemCode: string,
  tableRows: unknown[],
  mainImageUrl?: string,
  dimensionalDrawingUrl?: string,
  illuminanceLevelUrl?: string,
): Promise<Blob> {
  const pdf = new jsPDF("p", "pt", "a4");
  const PW = pdf.internal.pageSize.getWidth(); // 595.28 pt
  const PH = pdf.internal.pageSize.getHeight(); // 841.89 pt
  const HEADER_H = 100;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  let y = HEADER_H + 20;

  // ── Header image ────────────────────────────────────────────────────────
  const headerB64 = await urlToBase64(`${origin}/templates/lit-header.png`);
  if (headerB64) {
    pdf.addImage(headerB64, imgFormat(headerB64), 0, 0, PW, HEADER_H);
  }

  // ── Product image box ────────────────────────────────────────────────────
  const BOX_W = 150;
  const BOX_H = 120;
  const PAD = 10;
  const imageX = PW / 2 - BOX_W - 60;
  const imageY = y;

  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(1.5);
  pdf.rect(imageX, imageY, BOX_W, BOX_H);

  if (mainImageUrl) {
    const b64 = await urlToBase64(mainImageUrl);
    if (b64) {
      const { w, h } = await getImageDimensions(b64);
      const ratio = Math.min((BOX_W - PAD * 2) / w, (BOX_H - PAD * 2) / h);
      const fw = w * ratio;
      const fh = h * ratio;
      pdf.addImage(
        b64,
        imgFormat(b64),
        imageX + (BOX_W - fw) / 2,
        imageY + (BOX_H - fh) / 2,
        fw,
        fh,
      );
    }
  }

  // ── Item description (right column) ─────────────────────────────────────
  const TEXT_X = imageX + BOX_W + 60;
  const TEXT_MAX_W = BOX_W + 40;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(caps(displayName), TEXT_X, imageY + BOX_H / 2, {
    maxWidth: TEXT_MAX_W,
  });

  y += 140;

  // ── Auto-scale font size so table fits before drawings + footer ──────────
  const FOOTER_H_APPROX = 80;
  const DRAWING_BLOCK_H = 140;
  const SAFE = 20;
  const maxTableH = PH - FOOTER_H_APPROX - DRAWING_BLOCK_H - SAFE - y;

  let fontSize = 11;
  const TABLE_W = 540; // Maximize width (leave ~25pt margins on each side)
  const MARGIN_LR = 10; // Left/right margins
  const tableX = MARGIN_LR;
  
  while (fontSize > 5) {
    const tmp = new jsPDF("p", "pt", "a4");
    autoTable(tmp, {
      startY: y,
      theme: "grid",
      styles: { fontSize },
      body: tableRows as any[],
      margin: { left: tableX, right: MARGIN_LR },
      tableWidth: TABLE_W,
    });
    const endY = (tmp as any).lastAutoTable.finalY as number;
    if (endY - y <= maxTableH) break;
    fontSize -= 0.5;
  }

  // ── Spec table ───────────────────────────────────────────────────────────
  autoTable(pdf, {
    startY: y,
    theme: "grid",
    pageBreak: "avoid",
    tableWidth: TABLE_W,
    margin: { left: tableX, right: MARGIN_LR },
    styles: { fontSize, cellPadding: 3, overflow: "linebreak" },
    body: tableRows as any[],
    columnStyles: {
      0: { cellWidth: 270 },
      1: { cellWidth: 270 },
    },
  });

  // ── Drawings section ─────────────────────────────────────────────────────
  const tableEndY = (pdf as any).lastAutoTable.finalY as number;
  const drawY = tableEndY + 35;
  const DW = 120;
  const GAP = 80;
  const totalDW = DW * 2 + GAP;
  const drawStartX = (PW - totalDW) / 2;

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.text("DIMENSIONAL DRAWING", drawStartX + DW / 2, drawY - 10, {
    align: "center",
  });
  pdf.text("ILLUMINANCE LEVEL", drawStartX + DW + GAP + DW / 2, drawY - 10, {
    align: "center",
  });

  if (dimensionalDrawingUrl) {
    const b64 = await urlToBase64(dimensionalDrawingUrl);
    if (b64) {
      pdf.addImage(b64, imgFormat(b64), drawStartX, drawY, DW, 80);
    }
  }
  if (illuminanceLevelUrl) {
    const b64 = await urlToBase64(illuminanceLevelUrl);
    if (b64) {
      pdf.addImage(b64, imgFormat(b64), drawStartX + DW + GAP, drawY, DW, 80);
    }
  }

  // ── Footer image ─────────────────────────────────────────────────────────
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
 * Generate a **filled** product TDS PDF.
 * Spec entries with empty values OR "N/A" (case-insensitive) are excluded.
 * All text is normalised to ALL CAPS.
 */
export async function generateTdsPdf(input: GenerateTdsInput): Promise<Blob> {
  const rows: unknown[] = [];

  rows.push(["BRAND :", { content: "LIT", styles: { fontStyle: "bold" } }]);
  rows.push(["ITEM CODE :", caps(input.litItemCode)]);

  (input.technicalSpecs ?? []).forEach((group) => {
    // Exclude specs with empty values or "N/A"
    const validSpecs = (group.specs ?? []).filter(
      (s) => !isExcludedSpecValue(s.value),
    );
    if (!validSpecs.length) return;

    rows.push([
      {
        content: caps(group.specGroup),
        colSpan: 2,
        styles: { fillColor: [210, 215, 220], fontStyle: "bold" },
      },
    ]);
    validSpecs.forEach((spec) => {
      rows.push([caps(spec.name) + " :", caps(spec.value)]);
    });
  });

  return buildTdsPdf(
    input.itemDescription,
    input.litItemCode,
    rows,
    input.mainImageUrl,
    input.dimensionalDrawingUrl,
    input.illuminanceLevelUrl,
  );
}

/**
 * Generate a **blank template** TDS PDF for a productFamily.
 * Contains all spec label rows with empty value cells.
 * Saved as `tdsTemplate` on the productFamily Firestore document.
 */
export async function generateTdsTemplatePdf(
  input: GenerateTdsTemplateInput,
): Promise<Blob> {
  const rows: unknown[] = [];

  rows.push(["BRAND :", { content: "LIT", styles: { fontStyle: "bold" } }]);
  rows.push(["ITEM CODE :", ""]);

  (input.specGroups ?? []).forEach((group) => {
    if (!group.items?.length) return;
    rows.push([
      {
        content: caps(group.name),
        colSpan: 2,
        styles: { fillColor: [210, 215, 220], fontStyle: "bold" },
      },
    ]);
    group.items.forEach((item) => {
      rows.push([caps(item.label) + " :", ""]);
    });
  });

  return buildTdsPdf("PRODUCT DESCRIPTION", "", rows);
}

/**
 * Upload a PDF `Blob` to Cloudinary's raw endpoint.
 * Returns the `secure_url` of the uploaded file.
 *
 * @param blob         PDF blob (from `generateTdsPdf` / `generateTdsTemplatePdf`)
 * @param filename     Desired filename, e.g. `"MY PRODUCT_TDS.pdf"`
 * @param cloudName    Cloudinary cloud name (defaults to project default)
 * @param uploadPreset Cloudinary unsigned upload preset
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
