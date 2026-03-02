import { PDFDocument, rgb, StandardFonts, PDFPage } from "pdf-lib";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TechSpec {
  specGroup: string;
  specs: { name: string; value: string }[];
}

export interface FillTdsPdfParams {
  templateUrl: string;
  itemDescription: string;
  litItemCode: string;
  ecoItemCode: string;
  brand: string;
  technicalSpecs: TechSpec[];
  mainImageUrl?: string;
  dimensionDrawingUrl?: string;
  mountingHeightUrl?: string;
  driverCompatibilityUrl?: string;
  baseImageUrl?: string;
  illuminanceLevelUrl?: string;
  wiringDiagramUrl?: string;
  installationUrl?: string;
  wiringLayoutUrl?: string;
  terminalLayoutUrl?: string;
  accessoriesUrl?: string;
  cloudinaryUploadFn: (file: File) => Promise<string>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Build a lookup of normalized-label → value covering every spec + core fields. */
function buildValueLookup(params: FillTdsPdfParams): Record<string, string> {
  const lookup: Record<string, string> = {};

  const itemCode = params.litItemCode || params.ecoItemCode;

  // Core aliases — covers whatever naming convention the template designer used
  for (const a of ["brand", "brandname"]) lookup[a] = params.brand;
  for (const a of ["itemcode", "lititemcode", "ecoitemcode", "code"]) lookup[a] = itemCode;
  for (const a of ["itemdescription", "description", "productname", "name", "product"])
    lookup[norm(a)] = params.itemDescription;

  // All spec groups
  params.technicalSpecs.forEach((group) => {
    group.specs.forEach((spec) => {
      const v = spec.value?.trim();
      if (v) {
        lookup[norm(spec.name)] = v;
        lookup[spec.name.toLowerCase()] = v;
      }
    });
  });

  return lookup;
}

/**
 * Resolve a value for a PDF field name using progressive fuzzy matching.
 * 1. Exact normalized match
 * 2. Exact lowercased match
 * 3. Partial match (one key is substring of the other)
 */
function resolveFieldValue(
  fieldName: string,
  lookup: Record<string, string>,
): string {
  const n = norm(fieldName);
  if (lookup[n]) return lookup[n];
  const lc = fieldName.toLowerCase();
  if (lookup[lc]) return lookup[lc];
  for (const [key, val] of Object.entries(lookup)) {
    if (!val) continue;
    if (n.includes(key) || key.includes(n)) return val;
  }
  return "";
}

/** Map a button/image field name to the correct uploaded image URL. */
function resolveImageUrl(fieldName: string, params: FillTdsPdfParams): string | undefined {
  const n = norm(fieldName);
  const map: [RegExp, string | undefined][] = [
    [/dimension(al)?draw|dimdr|dimensiondrawing/, params.dimensionDrawingUrl],
    [/mountingheight|recommendedmount|mountheight/, params.mountingHeightUrl],
    [/drivercompat|drivercomp|compatdriver/, params.driverCompatibilityUrl],
    [/illuminance|luxlevel|illuminancelevel/, params.illuminanceLevelUrl],
    [/wiringdiagram|wiringschematic|electricaldiagram/, params.wiringDiagramUrl],
    [/wiringlayout|wirelayout|wiringplan/, params.wiringLayoutUrl],
    [/terminallayout|terminalblock|terminalplan/, params.terminalLayoutUrl],
    [/installation|installguide|installstep/, params.installationUrl],
    [/^base$|basetype|socketbase/, params.baseImageUrl],
    [/accessor|addon/, params.accessoriesUrl],
    [/productimage|mainimage|productphoto|^photo$|^image$|^img$|^picture$|^pic$|^button\d*$|^image\d+$|^photo\d+$/, params.mainImageUrl],
  ];
  for (const [rx, url] of map) {
    if (url && rx.test(n)) return url;
  }
  return undefined;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

async function embedImg(pdfDoc: PDFDocument, bytes: Uint8Array) {
  try { return await pdfDoc.embedJpg(bytes); } catch {}
  try { return await pdfDoc.embedPng(bytes); } catch {}
  return null;
}

async function drawImage(
  pdfDoc: PDFDocument, page: PDFPage,
  url: string, x: number, y: number, maxW: number, maxH: number,
) {
  const bytes = await fetchBytes(url);
  if (!bytes) return;
  const img = await embedImg(pdfDoc, bytes);
  if (!img) return;
  const { width: iw, height: ih } = img;
  const scale = Math.min(maxW / iw, maxH / ih, 1);
  const w = iw * scale;
  const h = ih * scale;
  page.drawImage(img, { x: x + (maxW - w) / 2, y: y + (maxH - h) / 2, width: w, height: h });
}

// ─── fillTdsPdf ───────────────────────────────────────────────────────────────

export async function fillTdsPdf(params: FillTdsPdfParams): Promise<string> {
  const {
    templateUrl, itemDescription,
    mainImageUrl, dimensionDrawingUrl, illuminanceLevelUrl,
    mountingHeightUrl, driverCompatibilityUrl, baseImageUrl,
    wiringDiagramUrl, installationUrl, wiringLayoutUrl,
    terminalLayoutUrl, accessoriesUrl, cloudinaryUploadFn,
  } = params;

  const templateRes = await fetch(templateUrl);
  if (!templateRes.ok) throw new Error(`TDS template fetch failed: ${templateRes.status}`);

  const pdfDoc = await PDFDocument.load(new Uint8Array(await templateRes.arrayBuffer()), {
    ignoreEncryption: true, updateMetadata: false,
  });

  const valueLookup = buildValueLookup(params);
  let usedAcroForm = false;

  // ── Strategy 1: Fill preset AcroForm fields (primary path) ─────────────────
  // Templates are expected to have named form fields that match spec labels.
  // After filling, flatten() bakes values into the page stream and removes all
  // visible field borders, blue highlights, and placeholder indicators.
  try {
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    if (fields.length > 0) {
      const { PDFTextField, PDFButton } = await import("pdf-lib");
      let filled = 0;

      for (const field of fields) {
        if (field instanceof PDFTextField) {
          const v = resolveFieldValue(field.getName(), valueLookup);
          if (v) {
            try { field.setText(v); filled++; } catch {}
          }
        }
        if (field instanceof PDFButton) {
          const imgUrl = resolveImageUrl(field.getName(), params);
          if (imgUrl) {
            const bytes = await fetchBytes(imgUrl);
            if (bytes) {
              const img = await embedImg(pdfDoc, bytes);
              if (img) { try { field.setImage(img); filled++; } catch {} }
            }
          }
        }
      }

      if (filled > 0) {
        // flatten() removes ALL widget annotations → no visual indicators in output
        form.flatten();
        usedAcroForm = true;
      }
    }
  } catch (e) {
    console.warn("[fillTdsPdf] AcroForm fill failed, falling back:", e);
  }

  // ── Strategy 2: Coordinate-based text (for templates without AcroForm) ──────
  // ONLY runs when AcroForm was not used, to prevent double-writing.
  if (!usedAcroForm) {
    const pages = pdfDoc.getPages();
    const page1 = pages[0];
    const page2 = pages.length > 1 ? pages[1] : null;
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // y-coordinates extracted from the base Disruptive TDS template
    const ROWS: { label: string; y: number }[] = [
      { label: "Brand", y: 523.1 }, { label: "Item Code", y: 507.1 },
      { label: "Wattage", y: 469.1 }, { label: "Lumens Output", y: 453.1 },
      { label: "Color Temperature", y: 437.1 }, { label: "CRI", y: 415.1 },
      { label: "Visual Angle", y: 399.1 }, { label: "Light Source", y: 383.1 },
      { label: "Life Hours", y: 367.1 }, { label: "Working Voltage", y: 329.1 },
      { label: "Power Factor", y: 313.1 }, { label: "Surge Protection", y: 297.1 },
      { label: "Dimension", y: 259.1 }, { label: "Materials", y: 243.1 },
      { label: "Lamp Body Color", y: 227.1 }, { label: "Working Temperature", y: 211.1 },
      { label: "Weight", y: 195.1 }, { label: "IK Rating", y: 179.1 },
      { label: "IP Rating", y: 163.1 },
    ];

    for (const { label, y } of ROWS) {
      const v = resolveFieldValue(label, valueLookup);
      if (!v) continue;
      try {
        page1.drawText(v.length > 80 ? v.slice(0, 80) + "\u2026" : v, {
          x: 202, y, size: 7, font, color: rgb(0, 0, 0), maxWidth: 380, lineHeight: 9.1,
        });
      } catch {}
    }

    if (itemDescription) {
      try {
        page1.drawText(itemDescription, {
          x: 200, y: 658, size: 9, font: boldFont,
          color: rgb(0, 0, 0), maxWidth: 355, lineHeight: 12,
        });
      } catch {}
    }

    if (mainImageUrl) await drawImage(pdfDoc, page1, mainImageUrl, 34, 530, 155, 150);

    if (page2) {
      if (dimensionDrawingUrl) await drawImage(pdfDoc, page2, dimensionDrawingUrl, 34, 100, 255, 550);
      if (illuminanceLevelUrl) await drawImage(pdfDoc, page2, illuminanceLevelUrl, 310, 100, 255, 550);
    }
  }

  // ── Extra pages: remaining technical drawings ──────────────────────────────
  // For AcroForm templates: dimDraw + illuminance may be in template slots already;
  // for non-AcroForm: they were drawn above. Either way, remaining drawings go on
  // appended pages so nothing is lost.
  const extraImages: { label: string; url?: string }[] = [
    ...(usedAcroForm
      ? [
          { label: "Dimensional Drawing", url: dimensionDrawingUrl },
          { label: "Illuminance Level", url: illuminanceLevelUrl },
        ]
      : []),
    { label: "Recommended Mounting Height", url: mountingHeightUrl },
    { label: "Driver Compatibility", url: driverCompatibilityUrl },
    { label: "Base", url: baseImageUrl },
    { label: "Wiring Diagram", url: wiringDiagramUrl },
    { label: "Installation", url: installationUrl },
    { label: "Wiring Layout", url: wiringLayoutUrl },
    { label: "Terminal Layout", url: terminalLayoutUrl },
    { label: "Accessories", url: accessoriesUrl },
  ].filter((e): e is { label: string; url: string } => Boolean(e.url));

  if (extraImages.length > 0) {
    const labelFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    for (let i = 0; i < extraImages.length; i += 2) {
      const pg = pdfDoc.addPage([595.3, 841.9]);
      pg.drawRectangle({ x: 0, y: 800, width: 595.3, height: 42, color: rgb(0.76, 0.69, 0.3) });

      const left = extraImages[i];
      const right = extraImages[i + 1];

      if (left && left.url) {
        pg.drawText(left.label, { x: 34, y: 760, size: 9, font: labelFont, color: rgb(0, 0, 0) });
        await drawImage(pdfDoc, pg, left.url, 34, 150, 255, 590);
      }

      if (right && right.url) {
        pg.drawText(right.label, { x: 310, y: 760, size: 9, font: labelFont, color: rgb(0, 0, 0) });
        await drawImage(pdfDoc, pg, right.url, 310, 150, 255, 590);
      }
    }
  }

  // ── Save & upload ──────────────────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const fileName = `${(itemDescription || "product").replace(/[^a-zA-Z0-9\-_]/g, "_")}_TDS.pdf`;
  return cloudinaryUploadFn(new File([blob], fileName, { type: "application/pdf" }));
}

// ─── generateTdsPdf ───────────────────────────────────────────────────────────

export interface FamilyMeta { templateUrl: string; }

export interface GenerateTdsProductMeta {
  itemDescription: string;
  litItemCode: string;
  ecoItemCode: string;
  brand: string;
  productFamilyName: string;
  technicalSpecs: TechSpec[];
}

export interface GenerateTdsOptions {
  mainImageUrl?: string;
  dimensionDrawingUrl?: string;
  mountingHeightUrl?: string;
  driverCompatibilityUrl?: string;
  baseImageUrl?: string;
  illuminanceLevelUrl?: string;
  wiringDiagramUrl?: string;
  installationUrl?: string;
  wiringLayoutUrl?: string;
  terminalLayoutUrl?: string;
  accessoriesUrl?: string;
  cloudinaryUploadFn: (file: File) => Promise<string>;
}

export async function generateTdsPdf(
  product: GenerateTdsProductMeta,
  options: GenerateTdsOptions,
  templateCache: Map<string, FamilyMeta>,
): Promise<string> {
  let familyMeta = templateCache.get(product.productFamilyName);
  if (!familyMeta) {
    const { getFirestore, collection, query, where, getDocs } = await import("firebase/firestore");
    const db = getFirestore();
    const snap = await getDocs(
      query(collection(db, "productfamilies"), where("title", "==", product.productFamilyName))
    );
    const templateUrl: string = snap.docs[0]?.data()?.tdsTemplate ?? "";
    if (!templateUrl) throw new Error(`No TDS template for "${product.productFamilyName}"`);
    familyMeta = { templateUrl };
    templateCache.set(product.productFamilyName, familyMeta);
  }

  return fillTdsPdf({
    templateUrl: familyMeta.templateUrl,
    itemDescription: product.itemDescription,
    litItemCode: product.litItemCode,
    ecoItemCode: product.ecoItemCode,
    brand: product.brand,
    technicalSpecs: product.technicalSpecs,
    ...options,
  });
}
