import ExcelJS from "exceljs";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TechnicalSpec {
  specGroup: string;
  specs: { name: string; value: string }[];
}

export interface ExcelProductData {
  sheetTitle: string;
  productName: string;
  itemCode: string;
  brand: string;
  technicalSpecs: TechnicalSpec[];
}

export interface ExcelParseResult {
  isValid: boolean;
  products: ExcelProductData[];
  errors: string[];
  skippedSheets: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXCLUDED_SHEET_NAMES = [
  /^table\s+of\s+content$/i,
  /^existing$/i,
  /^new_2026$/i,
  /^dimensional\s+drawing$/i,
  /^illuminance\s+level$/i,
];

const EXCLUDED_CELL_TEXT = /back\s+to\s+table\s+of\s+content/i;

const MAX_COLUMNS = 25; // A-Y (0-24)

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract string value from cell, handling various cell value types
 */
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

/**
 * Check if a sheet name should be skipped
 */
function shouldSkipSheet(name: string): boolean {
  return EXCLUDED_SHEET_NAMES.some((pattern) => pattern.test(name.trim()));
}

/**
 * Check if cell content should be filtered out
 */
function shouldSkipCellContent(value: string): boolean {
  if (!value) return true;
  return EXCLUDED_CELL_TEXT.test(value);
}

/**
 * Build a map of column indices to their grouping/header names
 */
function buildGroupMap(headerRow: (string | null)[]): Record<number, string> {
  const map: Record<number, string> = {};
  let currentGroup = "";

  for (let i = 0; i < Math.min(headerRow.length, MAX_COLUMNS); i++) {
    const cell = headerRow[i];
    if (cell && cell.trim()) {
      currentGroup = cell.trim();
    }
    if (currentGroup) {
      map[i] = currentGroup;
    }
  }

  return map;
}

/**
 * Extract all rows from worksheet as string arrays
 */
async function extractWorksheetRows(
  ws: ExcelJS.Worksheet,
): Promise<(string | null)[][]> {
  const allRows: (string | null)[][] = [];

  return new Promise((resolve) => {
    ws.eachRow({ includeEmpty: true }, (row) => {
      const cells: (string | null)[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const colIndex = Number(cell.col) - 1;
        if (colIndex < MAX_COLUMNS) {
          cells[colIndex] = cellStr(cell.value);
        }
      });
      allRows.push(cells);
    });

    resolve(allRows);
  });
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

/**
 * Parse an Excel file and extract product data for TDS generation
 * Expects: Row 0 = headers, Row 1+ = data
 */
export async function parseExcelFile(
  file: File,
): Promise<ExcelParseResult> {
  const errors: string[] = [];
  const skippedSheets: string[] = [];
  const products: ExcelProductData[] = [];

  try {
    // Load workbook
    const buffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    // Process each worksheet
    for (const ws of wb.worksheets) {
      // Skip excluded sheets
      if (shouldSkipSheet(ws.name)) {
        skippedSheets.push(ws.name);
        continue;
      }

      try {
        const rows = await extractWorksheetRows(ws);

        if (rows.length < 2) {
          errors.push(`Sheet "${ws.name}" has fewer than 2 rows`);
          skippedSheets.push(ws.name);
          continue;
        }

        const headerRow = rows[0];
        const dataRows = rows.slice(1);

        // Build column name map (header row)
        const headerMap: Record<number, string> = {};
        for (let i = 0; i < Math.min(headerRow.length, MAX_COLUMNS); i++) {
          if (headerRow[i]) {
            headerMap[i] = headerRow[i]!;
          }
        }

        // Parse data rows
        for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
          const row = dataRows[rowIdx];

          // Skip empty rows
          if (!row || row.every((c) => !c || c === "")) {
            continue;
          }

          // Extract standard columns
          const productName = row[0] ? cellStr(row[0]) : "";
          const itemCode = row[1] ? cellStr(row[1]) : "";

          if (!productName || !itemCode) {
            continue;
          }

          // Skip rows with excluded text
          if (
            shouldSkipCellContent(productName) ||
            shouldSkipCellContent(itemCode)
          ) {
            continue;
          }

          // Build technical specs from remaining columns
          // Format: { specGroup: string, specs: { name: string, value: string }[] }
          const specsByGroup: Record<string, { name: string; value: string }[]> =
            {};

          for (let colIdx = 2; colIdx < Math.min(row.length, MAX_COLUMNS); colIdx++) {
            const value = row[colIdx];
            if (!value || shouldSkipCellContent(value)) {
              continue;
            }

            const headerName = headerMap[colIdx];
            if (!headerName) {
              continue;
            }

            // Use the header name as both the spec name and determine group from it
            // E.g., "Color" becomes specGroup: "Appearance", name: "Color"
            // or use the header itself as the group if we can't determine category
            const specName = headerName.trim();
            // For now, group by the header name itself as the category
            // In production, you'd cross-reference against availableSpecs to get the proper specGroup
            const specGroup = specName.toUpperCase();

            if (!specsByGroup[specGroup]) {
              specsByGroup[specGroup] = [];
            }

            // Only add if we haven't already added this spec (avoid duplicates)
            const exists = specsByGroup[specGroup].some(
              (s) => s.name === specName,
            );
            if (!exists) {
              specsByGroup[specGroup].push({
                name: specName,
                value: value,
              });
            }
          }

          // Convert specs object to array in the same format as productFamilies
          const technicalSpecs: TechnicalSpec[] = Object.entries(specsByGroup).map(
            ([specGroup, specs]) => ({
              specGroup,
              specs,
            }),
          );

          products.push({
            sheetTitle: ws.name,
            productName,
            itemCode,
            brand: "LIT",
            technicalSpecs,
          });
        }
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : String(err);
        errors.push(`Sheet "${ws.name}" parse error: ${errMsg}`);
        skippedSheets.push(ws.name);
      }
    }

    return {
      isValid: products.length > 0,
      products,
      errors,
      skippedSheets,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      isValid: false,
      products: [],
      errors: [`File parse error: ${errMsg}`],
      skippedSheets: [],
    };
  }
}

/**
 * Check if product already exists in Firebase by itemCode
 */
export async function checkProductExists(
  itemCode: string,
  existingCodes: Set<string>,
): Promise<boolean> {
  return existingCodes.has(itemCode);
}
