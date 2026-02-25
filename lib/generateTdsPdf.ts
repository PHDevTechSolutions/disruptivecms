import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpecGroup {
  specGroup: string;
  specs: { name: string; value: string }[];
}

interface TdsProductData {
  itemDescription: string;
  litItemCode?: string;
  ecoItemCode?: string;
  brand: string;
  technicalSpecs?: SpecGroup[];
  dynamicSpecs?: { title: string; value: string }[];
}

interface TdsOptions {
  mainImageUrl?: string;
  dimensionDrawingUrl?: string;
  mountingHeightUrl?: string;
  cloudinaryUploadFn: (file: File) => Promise<string>;
}

interface CompressedImage {
  data: string; // base64 data URI
  format: "JPEG" | "PNG";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const A4_W = 210; // mm
const A4_H = 297; // mm
const MARGIN = 16; // mm  ← increased from 12 for more breathing room
const CONTENT_W = A4_W - MARGIN * 2;

const BRAND_THEMES: Record<
  string,
  {
    footerBg: [number, number, number];
    footerText: [number, number, number];
    brandLogoKey: "LIT" | "ZUMTOBEL";
    headerGradientEnd: [number, number, number];
  }
> = {
  LIT: {
    footerBg: [197, 162, 80],
    footerText: [255, 255, 255],
    brandLogoKey: "LIT",
    headerGradientEnd: [197, 162, 80],
  },
  ZUMTOBEL: {
    footerBg: [20, 20, 20],
    footerText: [255, 255, 255],
    brandLogoKey: "ZUMTOBEL",
    headerGradientEnd: [40, 40, 40],
  },
};

const DEFAULT_THEME = BRAND_THEMES["LIT"];

// ─── Image helpers ────────────────────────────────────────────────────────────

/**
 * Fetches a URL, resizes it to fit within `maxPx` on the longest side,
 * and re-encodes as JPEG (for photos) or PNG (for logos with transparency).
 *
 * Pass `keepTransparency = true` for logos so alpha channel is preserved.
 */
async function fetchAndCompress(
  url: string,
  maxPx: number,
  quality: number,
  keepTransparency = false,
): Promise<CompressedImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      return null;
    }

    const { width: srcW, height: srcH } = bitmap;
    const scale = Math.min(1, maxPx / Math.max(srcW, srcH, 1));
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));

    const canvas = new OffscreenCanvas(outW, outH);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

    if (!keepTransparency) {
      // White background so transparent PNGs don't become black JPEGs
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.drawImage(bitmap, 0, 0, outW, outH);
    bitmap.close();

    if (keepTransparency) {
      const pngBlob = await canvas.convertToBlob({ type: "image/png" });
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(pngBlob);
      });
      return { data: base64, format: "PNG" };
    } else {
      const jpegBlob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality,
      });
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(jpegBlob);
      });
      return { data: base64, format: "JPEG" };
    }
  } catch {
    return null;
  }
}

/**
 * Load a logo from /templates, preserving its transparency (PNG output).
 */
function loadLogo(filename: string): Promise<CompressedImage | null> {
  return fetchAndCompress(
    `/templates/${filename}`,
    400,
    0.8,
    true /* keepTransparency */,
  );
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateTdsPdf(
  product: TdsProductData,
  options: TdsOptions,
): Promise<string> {
  const {
    mainImageUrl,
    dimensionDrawingUrl,
    mountingHeightUrl,
    cloudinaryUploadFn,
  } = options;

  const brandKey = product.brand?.toUpperCase();
  const theme = BRAND_THEMES[brandKey] ?? DEFAULT_THEME;
  const isBrandKnown = !!BRAND_THEMES[brandKey];

  // ── 1. Fetch + compress all images in parallel ───────────────────────────
  const [
    disruptiveLogo,
    brandLogo,
    mainImgData,
    dimDrawingData,
    mountingHtData,
  ] = await Promise.all([
    loadLogo("DISRUPTIVE.PNG"),
    loadLogo(isBrandKnown ? `${theme.brandLogoKey}.PNG` : "DISRUPTIVE.PNG"),
    mainImageUrl
      ? fetchAndCompress(mainImageUrl, 600, 0.75, false)
      : Promise.resolve(null),
    dimensionDrawingUrl
      ? fetchAndCompress(dimensionDrawingUrl, 700, 0.75, false)
      : Promise.resolve(null),
    mountingHeightUrl
      ? fetchAndCompress(mountingHeightUrl, 700, 0.75, false)
      : Promise.resolve(null),
  ]);

  // ── 2. Create PDF ─────────────────────────────────────────────────────────
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  let cursorY = 0;

  // ── 3. Header ─────────────────────────────────────────────────────────────
  const HEADER_H = 30; // slightly taller for more logo padding
  const gradSteps = 12;

  for (let i = 0; i < gradSteps; i++) {
    const ratio = i / gradSteps;
    const r = Math.round(197 + (theme.headerGradientEnd[0] - 197) * ratio);
    const g = Math.round(162 + (theme.headerGradientEnd[1] - 162) * ratio);
    const b = Math.round(80 + (theme.headerGradientEnd[2] - 80) * ratio);
    doc.setFillColor(r, g, b);
    doc.rect((A4_W / gradSteps) * i, 0, A4_W / gradSteps + 1, HEADER_H, "F");
  }

  // Disruptive logo — left side, with MARGIN padding
  if (disruptiveLogo) {
    const logoH = 14;
    const logoW = 55;
    doc.addImage(
      disruptiveLogo.data,
      disruptiveLogo.format,
      MARGIN, // ← respects left margin
      (HEADER_H - logoH) / 2,
      logoW,
      logoH,
      undefined,
      "FAST",
    );
  }

  // Brand logo — right side, with MARGIN padding
  if (brandLogo) {
    const bLogoW = 28;
    const bLogoH = 18;
    doc.addImage(
      brandLogo.data,
      brandLogo.format,
      A4_W - MARGIN - bLogoW, // ← respects right margin
      (HEADER_H - bLogoH) / 2,
      bLogoW,
      bLogoH,
      undefined,
      "FAST",
    );
  }

  cursorY = HEADER_H + 8; // more gap below header

  // ── 4. Product image + Item Description ───────────────────────────────────
  const IMG_BOX_W = 65;
  const IMG_BOX_H = 55;
  const IMG_BOX_X = MARGIN;

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.rect(IMG_BOX_X, cursorY, IMG_BOX_W, IMG_BOX_H);

  if (mainImgData) {
    doc.addImage(
      mainImgData.data,
      mainImgData.format,
      IMG_BOX_X + 3,
      cursorY + 3,
      IMG_BOX_W - 6,
      IMG_BOX_H - 6,
      undefined,
      "FAST",
    );
  }

  const DESC_X = IMG_BOX_X + IMG_BOX_W + 8;
  const DESC_W = CONTENT_W - IMG_BOX_W - 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(30, 30, 30);
  doc.text(
    doc.splitTextToSize(product.itemDescription || "", DESC_W),
    DESC_X,
    cursorY + 14,
  );

  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.6);
  doc.line(
    DESC_X,
    cursorY + IMG_BOX_H - 4,
    DESC_X + DESC_W,
    cursorY + IMG_BOX_H - 4,
  );

  cursorY += IMG_BOX_H + 8;

  // ── 5. Spec table ─────────────────────────────────────────────────────────
  type TableRow = [string, string, string];
  const rows: TableRow[] = [];

  rows.push(["Brand", ":", product.brand || ""]);
  rows.push([
    "Item Code",
    ":",
    product.litItemCode || product.ecoItemCode || "",
  ]);

  product.technicalSpecs?.forEach((group) => {
    rows.push([`__GROUP__${group.specGroup}`, "", ""]);
    group.specs.forEach((s) => rows.push([s.name, ":", s.value]));
  });

  if (product.dynamicSpecs && product.dynamicSpecs.length > 0) {
    const grouped: Record<string, string[]> = {};
    product.dynamicSpecs.forEach((ds) => {
      (grouped[ds.title] ??= []).push(ds.value);
    });
    Object.entries(grouped).forEach(([title, values]) => {
      rows.push([`__GROUP__${title}`, "", ""]);
      values.forEach((v) => rows.push([title, ":", v]));
    });
  }

  autoTable(doc, {
    startY: cursorY,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    theme: "plain",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      lineColor: [210, 210, 210],
      lineWidth: 0.3,
      font: "helvetica",
      textColor: [30, 30, 30],
      valign: "middle",
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { cellWidth: 6 },
      2: { cellWidth: CONTENT_W - 55 - 6 },
    },
    body: rows,
    didParseCell(data) {
      const raw = String(data.cell.raw);
      if (raw.startsWith("__GROUP__")) {
        data.cell.text = [raw.replace("__GROUP__", "")];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 9;
        data.cell.styles.fillColor = [230, 230, 230];
        data.cell.styles.textColor = [20, 20, 20];
      }
    },
    willDrawCell(data) {
      if (
        String(data.cell.raw).startsWith("__GROUP__") &&
        data.column.index > 0
      ) {
        data.cell.text = [];
      }
    },
  });

  cursorY = ((doc as any).lastAutoTable?.finalY ?? cursorY + 20) + 10;

  // ── 6. Technical drawings ─────────────────────────────────────────────────
  const DRAW_LABEL_H = 7;
  const DRAW_GAP = 8;
  const DRAW_BOX_W = (CONTENT_W - DRAW_GAP) / 2;
  const DRAW_BOX_H = 55;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text("Dimensional Drawing", MARGIN, cursorY);
  doc.text(
    "Recommended Mounting Height",
    MARGIN + DRAW_BOX_W + DRAW_GAP,
    cursorY,
  );
  cursorY += DRAW_LABEL_H;

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN, cursorY, DRAW_BOX_W, DRAW_BOX_H);
  doc.rect(MARGIN + DRAW_BOX_W + DRAW_GAP, cursorY, DRAW_BOX_W, DRAW_BOX_H);

  const IMG_PAD = 4; // inner padding inside drawing boxes
  if (dimDrawingData) {
    doc.addImage(
      dimDrawingData.data,
      dimDrawingData.format,
      MARGIN + IMG_PAD,
      cursorY + IMG_PAD,
      DRAW_BOX_W - IMG_PAD * 2,
      DRAW_BOX_H - IMG_PAD * 2,
      undefined,
      "FAST",
    );
  }
  if (mountingHtData) {
    doc.addImage(
      mountingHtData.data,
      mountingHtData.format,
      MARGIN + DRAW_BOX_W + DRAW_GAP + IMG_PAD,
      cursorY + IMG_PAD,
      DRAW_BOX_W - IMG_PAD * 2,
      DRAW_BOX_H - IMG_PAD * 2,
      undefined,
      "FAST",
    );
  }

  // ── 7. Footer ─────────────────────────────────────────────────────────────
  const FOOTER_H = 12;
  const FOOTER_Y = A4_H - FOOTER_H;

  doc.setFillColor(...theme.footerBg);
  doc.rect(0, FOOTER_Y, A4_W, FOOTER_H, "F");

  // Dot + URL centered
  const dotR = 2.2;
  const textStr = "disruptivesolutionsinc.com";
  doc.setFontSize(8.5);
  const textW = doc.getTextWidth(textStr);
  const totalW = dotR * 2 + 3 + textW; // dot diameter + gap + text
  const startX = (A4_W - totalW) / 2;

  doc.setFillColor(...theme.footerText);
  doc.circle(startX + dotR, FOOTER_Y + FOOTER_H / 2, dotR, "F");

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...theme.footerText);
  doc.text(textStr, startX + dotR * 2 + 3, FOOTER_Y + FOOTER_H / 2 + 1.2);

  // ── 8. Emit PDF blob + upload ─────────────────────────────────────────────
  const pdfBlob: Blob = doc.output("blob");

  if (process.env.NODE_ENV === "development") {
    console.log(
      `[TDS PDF] compressed size: ${(pdfBlob.size / 1024).toFixed(1)} KB`,
    );
  }

  const safeName = (product.itemDescription || "product")
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "_");

  const pdfFile = new File([pdfBlob], `${safeName}_TDS.pdf`, {
    type: "application/pdf",
  });

  return cloudinaryUploadFn(pdfFile);
}
