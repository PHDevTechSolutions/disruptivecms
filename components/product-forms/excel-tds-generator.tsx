"use client";

import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Loader2, Upload, CheckCircle, AlertCircle, Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  parseExcelFile,
  type ExcelProductData,
  type ExcelParseResult,
} from "@/lib/excel-to-tds-parser";
import { generateTdsPdf } from "@/lib/generateTdsPdf";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsingState {
  isLoading: boolean;
  isDragActive: boolean;
  parseResult: ExcelParseResult | null;
  isGenerating: boolean;
  generatedPdfs: { name: string; url: string }[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExcelTdsGenerator() {
  const [state, setState] = useState<ParsingState>({
    isLoading: false,
    isDragActive: false,
    parseResult: null,
    isGenerating: false,
    generatedPdfs: [],
  });

  /**
   * Normalize and validate technical specs
   * Removes empty values and ensures proper structure matching productFamilies format
   */
  const normalizeSpecs = useCallback(
    (technicalSpecs: any[]): any[] => {
      return technicalSpecs
        .map((group: any) => ({
          specGroup: group.specGroup || "OTHER",
          specs: (group.specs || []).filter((spec: any) => {
            const value = spec.value ? String(spec.value).trim() : "";
            return value.length > 0;
          }),
        }))
        .filter((group: any) => group.specs.length > 0);
    },
    [],
  );

  /**
   * Get existing product codes from Firestore
   */
  const getExistingProductCodes = useCallback(async (): Promise<Set<string>> => {
    try {
      const snap = await getDocs(collection(db, "productFamilies"));
      const codes = new Set<string>();
      snap.forEach((doc) => {
        const code = doc.data().litItemCode;
        if (code) codes.add(code);
      });
      return codes;
    } catch (err) {
      console.warn("[excel-tds-generator] Could not fetch existing codes:", err);
      return new Set();
    }
  }, []);

  /**
   * Handle file drop/select
   */
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];

      // Validate file type
      if (
        !file.name.endsWith(".xlsx") &&
        !file.name.endsWith(".xls") &&
        !file.type.includes("spreadsheet")
      ) {
        toast.error("Please upload an Excel file (.xlsx or .xls)");
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        const result = await parseExcelFile(file);

        if (!result.isValid || result.products.length === 0) {
          toast.error(
            result.errors.length > 0
              ? result.errors[0]
              : "No valid products found in the file",
          );
          setState((prev) => ({
            ...prev,
            isLoading: false,
            parseResult: null,
          }));
          return;
        }

        // Check for duplicates
        const existingCodes = await getExistingProductCodes();
        const duplicates = result.products.filter((p) =>
          existingCodes.has(p.itemCode),
        );

        if (duplicates.length > 0) {
          toast.warning(
            `${duplicates.length} product(s) already exist and will be skipped`,
          );
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          parseResult: result,
        }));

        toast.success(
          `Parsed ${result.products.length} product(s) from ${file.name}`,
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        toast.error(`Parse error: ${errMsg}`);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          parseResult: null,
        }));
      }
    },
    [getExistingProductCodes],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
  });

  /**
   * Save generated products to Firestore database
   */
  const handleSaveToDatabase = useCallback(async () => {
    if (!state.parseResult) return;

    setState((prev) => ({ ...prev, isGenerating: true }));

    try {
      const existingCodes = await getExistingProductCodes();
      let successCount = 0;

      for (const product of state.parseResult.products) {
        try {
          // Skip duplicates
          if (existingCodes.has(product.itemCode)) {
            console.log(
              `[excel-tds-generator] Skipping duplicate save: ${product.itemCode}`,
            );
            continue;
          }

          // Normalize specs before saving (remove empty values, ensure proper format)
          const normalizedTechSpecs = normalizeSpecs(product.technicalSpecs);

          // Create product document in Firestore
          const docRef = await addDoc(collection(db, "products"), {
            itemDescription: product.productName,
            litItemCode: product.itemCode,
            brand: product.brand,
            technicalSpecs: normalizedTechSpecs,
            productFamily: product.sheetTitle,
            shortDescription: "",
            slug: product.itemCode.toLowerCase().replace(/[^a-z0-9]/g, "-"),
            regularPrice: 0,
            salePrice: 0,
            website: [],
            websites: [],
            applications: [],
            productUsage: [],
            status: "draft",
            mainImage: "",
            rawImage: "",
            qrCodeImage: "",
            dimensionDrawingImage: "",
            mountingHeightImage: "",
            galleryImages: [],
            createdAt: serverTimestamp(),
            source: "excel-import",
          });

          console.log(
            `[excel-tds-generator] Saved product: ${product.itemCode}`,
          );
          successCount++;
        } catch (err) {
          console.warn(
            `[excel-tds-generator] Database save failed for ${product.itemCode}:`,
            err,
          );
        }
      }

      if (successCount > 0) {
        toast.success(`Saved ${successCount} product(s) to database`);
      } else {
        toast.info("No new products were saved (all may be duplicates)");
      }

      setState((prev) => ({ ...prev, isGenerating: false }));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Database save error: ${errMsg}`);
      setState((prev) => ({ ...prev, isGenerating: false }));
    }
  }, [state.parseResult, getExistingProductCodes, normalizeSpecs]);

  /**
   * Generate PDFs from parsed products
   */
  const handleGeneratePdfs = useCallback(async () => {
    if (!state.parseResult) return;

    setState((prev) => ({ ...prev, isGenerating: true }));

    try {
      const existingCodes = await getExistingProductCodes();
      const pdfs: { name: string; url: string }[] = [];
      let successCount = 0;

      for (const product of state.parseResult.products) {
        try {
          // Skip duplicates
          if (existingCodes.has(product.itemCode)) {
            console.log(
              `[excel-tds-generator] Skipping duplicate: ${product.itemCode}`,
            );
            continue;
          }

          // Normalize specs before generating PDF (remove empty values)
          const normalizedTechSpecs = normalizeSpecs(product.technicalSpecs);

          // Generate PDF with a local blob uploader
          // This approach uses the PDF blob directly without uploading to Cloudinary
          const pdfUrl = await generateTdsPdf(
            {
              itemDescription: product.productName,
              litItemCode: product.itemCode,
              brand: product.brand,
              technicalSpecs: normalizedTechSpecs,
            },
            {
              cloudinaryUploadFn: async (pdfFile: File) => {
                // Create a local object URL from the PDF file
                const blob = new Blob([pdfFile], { type: "application/pdf" });
                return URL.createObjectURL(blob);
              },
            },
          );

          const url = pdfUrl;

          pdfs.push({
            name: `${product.itemCode || product.productName}.pdf`,
            url,
          });

          successCount++;
        } catch (err) {
          console.warn(
            `[excel-tds-generator] PDF generation failed for ${product.itemCode}:`,
            err,
          );
        }
      }

      if (successCount === 0) {
        toast.error("No PDFs were generated. Check console for details.");
        setState((prev) => ({ ...prev, isGenerating: false }));
        return;
      }

      setState((prev) => ({
        ...prev,
        isGenerating: false,
        generatedPdfs: pdfs,
      }));

      toast.success(`Generated ${successCount} PDF(s)`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`PDF generation error: ${errMsg}`);
      setState((prev) => ({ ...prev, isGenerating: false }));
    }
  }, [state.parseResult, getExistingProductCodes, normalizeSpecs]);

  /**
   * Download single PDF
   */
  const handleDownloadPdf = useCallback((pdf: { name: string; url: string }) => {
    const link = document.createElement("a");
    link.href = pdf.url;
    link.download = pdf.name;
    link.click();
  }, []);

  /**
   * Download all PDFs as individual files
   */
  const handleDownloadAll = useCallback(() => {
    state.generatedPdfs.forEach((pdf, idx) => {
      // Stagger downloads slightly to avoid browser blocking
      setTimeout(() => {
        handleDownloadPdf(pdf);
      }, idx * 200);
    });
    toast.success(`Starting download of ${state.generatedPdfs.length} file(s)`);
  }, [state.generatedPdfs, handleDownloadPdf]);

  /**
   * Reset state
   */
  const handleReset = useCallback(() => {
    setState({
      isLoading: false,
      isDragActive: false,
      parseResult: null,
      isGenerating: false,
      generatedPdfs: [],
    });
  }, []);

  return (
    <>
      {/* Main Upload Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-bold uppercase">
            EXCEL TO TDS GENERATOR
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!state.parseResult ? (
            <>
              {/* Upload Zone */}
              <div
                {...getRootProps()}
                className={cn(
                  "relative rounded-none border-2 border-dashed px-6 py-12 text-center transition-colors",
                  isDragActive
                    ? "border-foreground bg-muted/50"
                    : "border-foreground/10 bg-muted/30 hover:bg-muted/50",
                )}
              >
                <input {...getInputProps()} />

                {state.isLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">
                      PARSING EXCEL FILE...
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-bold uppercase">
                        Drag Excel file here or click to select
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        .xlsx or .xls format
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Info Text */}
              <div className="space-y-2 rounded-none border border-foreground/10 bg-muted/30 px-4 py-3 text-xs">
                <p className="font-bold uppercase">SUPPORTED FORMAT:</p>
                <ul className="ml-4 space-y-1 list-disc text-muted-foreground">
                  <li>Sheet titles become Product Families</li>
                  <li>Column A: Product Name</li>
                  <li>Column B: Item Code</li>
                  <li>Columns C-Y: Technical Specifications</li>
                </ul>
              </div>
            </>
          ) : (
            <>
              {/* Parse Result Summary */}
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold uppercase">
                      {state.parseResult.products.length} PRODUCTS PARSED
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ready to generate TDS PDFs
                    </p>
                  </div>
                </div>

                {state.parseResult.errors.length > 0 && (
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold uppercase text-amber-900">
                        {state.parseResult.errors.length} ERRORS
                      </p>
                      <div className="mt-1 space-y-0.5">
                        {state.parseResult.errors.map((err, i) => (
                          <p key={i} className="text-xs text-amber-700">
                            {err}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {state.parseResult.skippedSheets.length > 0 && (
                  <div className="text-xs">
                    <p className="font-bold uppercase text-muted-foreground">
                      SKIPPED SHEETS:
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {state.parseResult.skippedSheets.map((sheet) => (
                        <Badge
                          key={sheet}
                          variant="outline"
                          className="text-[10px]"
                        >
                          {sheet}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Product Preview */}
              {!state.generatedPdfs.length && (
                <>
                  <PreviewTable products={state.parseResult.products} />
                  <div className="rounded-none border border-foreground/10 bg-blue-50/50 dark:bg-blue-950/30 px-4 py-3 text-xs space-y-1">
                    <p className="font-bold uppercase text-blue-900 dark:text-blue-200">
                      💾 DATABASE IMPORT AVAILABLE
                    </p>
                    <p className="text-blue-800 dark:text-blue-300">
                      After generating PDFs, you can save these products directly to your database.
                    </p>
                  </div>
                </>
              )}

              {/* Generated PDFs */}
              {state.generatedPdfs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase text-green-700">
                    ✓ {state.generatedPdfs.length} PDF(S) GENERATED
                  </p>
                  <div className="space-y-1">
                    {state.generatedPdfs.map((pdf) => (
                      <div
                        key={pdf.name}
                        className="flex items-center justify-between gap-2 rounded-none border border-foreground/10 bg-muted/30 px-3 py-2"
                      >
                        <span className="text-xs font-medium truncate">
                          {pdf.name}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 rounded-none"
                          onClick={() => handleDownloadPdf(pdf)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 border-t border-foreground/10 pt-4">
            {!state.parseResult ? (
              <Button disabled size="sm" className="text-xs">
                SELECT FILE TO PROCEED
              </Button>
            ) : state.generatedPdfs.length === 0 ? (
              <>
                <Button
                  size="sm"
                  onClick={handleGeneratePdfs}
                  disabled={state.isGenerating}
                  className="text-xs"
                >
                  {state.isGenerating && (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  )}
                  GENERATE PDFS
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReset}
                  className="text-xs"
                >
                  RESET
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={handleDownloadAll}
                  className="text-xs"
                >
                  <Download className="mr-2 h-3 w-3" />
                  DOWNLOAD ALL
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveToDatabase}
                  disabled={state.isGenerating}
                  className="text-xs"
                  variant="outline"
                >
                  {state.isGenerating && (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  )}
                  SAVE TO DATABASE
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReset}
                  className="text-xs"
                >
                  START OVER
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview Modal */}
      {state.parseResult && state.generatedPdfs.length === 0 && (
        <PreviewModal
          products={state.parseResult.products.slice(0, 5)}
          totalCount={state.parseResult.products.length}
        />
      )}
    </>
  );
}

// ─── Preview Components ────────────────────────────────────────────────────────

interface PreviewTableProps {
  products: ExcelProductData[];
}

function PreviewTable({ products }: PreviewTableProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase text-muted-foreground">
        PREVIEW (FIRST 5 PRODUCTS):
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-foreground/10">
              <th className="px-2 py-2 text-left font-bold uppercase">
                Sheet
              </th>
              <th className="px-2 py-2 text-left font-bold uppercase">
                Product Name
              </th>
              <th className="px-2 py-2 text-left font-bold uppercase">
                Item Code
              </th>
              <th className="px-2 py-2 text-left font-bold uppercase">
                Specs
              </th>
            </tr>
          </thead>
          <tbody>
            {products.slice(0, 5).map((product, i) => (
              <tr key={i} className="border-b border-foreground/10">
                <td className="px-2 py-2 text-muted-foreground">
                  {product.sheetTitle}
                </td>
                <td className="px-2 py-2 font-medium">
                  {product.productName}
                </td>
                <td className="px-2 py-2 font-mono">
                  {product.itemCode}
                </td>
                <td className="px-2 py-2 text-muted-foreground">
                  {product.technicalSpecs.length} group(s)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PreviewModalProps {
  products: ExcelProductData[];
  totalCount: number;
}

function PreviewModal({ products, totalCount }: PreviewModalProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase">
            Product Preview
          </DialogTitle>
          <DialogDescription>
            Showing {products.length} of {totalCount} products
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[400px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/50">
              <tr className="border-b border-foreground/10">
                <th className="px-3 py-2 text-left font-bold uppercase">
                  Sheet
                </th>
                <th className="px-3 py-2 text-left font-bold uppercase">
                  Product
                </th>
                <th className="px-3 py-2 text-left font-bold uppercase">
                  Code
                </th>
                <th className="px-3 py-2 text-left font-bold uppercase">
                  Specs
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, i) => (
                <tr key={i} className="border-b border-foreground/10">
                  <td className="px-3 py-2 text-muted-foreground">
                    {product.sheetTitle}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {product.productName}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {product.itemCode}
                  </td>
                  <td className="px-3 py-2">
                    {product.technicalSpecs.reduce(
                      (acc, spec) => acc + spec.specs.length,
                      0,
                    )}{" "}
                    items
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
