"use client";

import * as React from "react";
import { useCallback, useState, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { db } from "@/lib/firebase";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  getDocs,
  updateDoc,
  doc,
  arrayUnion 
} from "firebase/firestore";
import { Zap, Loader2, Upload, FileSpreadsheet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { cn } from "@/lib/utils";

// --- CONFIG ---
const CLOUDINARY_UPLOAD_PRESET = "taskflow_preset";
const CLOUDINARY_CLOUD_NAME = "dvmpn8mjh";

interface SpecValue {
  name: string;
  value: string;
}

interface BulkRow {
  name: string;
  shortDescription?: string;
  itemCode?: string;
  regularPrice?: string | number;
  salePrice?: string | number;
  website?: string;
  category?: string;
  brand?: string;
  applications?: string;
  mainImage?: string;
  galleryImages?: string;
  technicalSpecs?: string;
}

const getCellValue = (cell: any): string => {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "object") {
    if ("text" in cell) return cell.text.toString();
    if ("richText" in cell && Array.isArray(cell.richText)) {
      return cell.richText.map((t: any) => t.text).join("");
    }
    return "";
  }
  return cell.toString();
};

const transformGDriveUrl = (url: string): string => {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)\//);
  return match ? `https://drive.google.com/uc?export=download&id=${match[1]}` : url;
};

export default function BulkUploaders({ 
  onUploadComplete,
  trigger
}: { 
  onUploadComplete?: () => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);

  const uploadToCloudinary = async (fileOrUrl: string | File) => {
    if (!fileOrUrl) return "";
    if (typeof fileOrUrl === "string" && fileOrUrl.includes("res.cloudinary.com")) return fileOrUrl;
    try {
      const formData = new FormData();
      formData.append("file", fileOrUrl);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
      const data = await res.json();
      return data.secure_url;
    } catch (error) {
      return typeof fileOrUrl === "string" ? fileOrUrl : "";
    }
  };

  /**
   * CASE-INSENSITIVE MASTER SYNC
   * Compares lowercased strings to prevent casing duplicates.
   */
  const syncMasterField = async (collectionName: string, fieldName: string, value: string, websites: string[]) => {
    if (!value || !websites.length) return;
    const cleanValue = value.trim();
    const lowerValue = cleanValue.toLowerCase();

    // Fetch snapshot to check case-insensitively
    const snap = await getDocs(collection(db, collectionName));
    const existingDoc = snap.docs.find(d => d.data()[fieldName]?.toLowerCase() === lowerValue);

    if (existingDoc) {
      await updateDoc(doc(db, collectionName, existingDoc.id), {
        websites: arrayUnion(...websites),
        updatedAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, collectionName), {
        [fieldName]: cleanValue,
        websites: websites,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  };

  const handleBulkUpload = async (file: File) => {
    setIsProcessing(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      let rows: BulkRow[] = [];
      if (file.name.endsWith(".csv")) {
        rows = await new Promise((resolve, reject) => {
          Papa.parse<BulkRow>(file, { header: true, skipEmptyLines: true, complete: (res) => resolve(res.data), error: reject });
        });
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const worksheet = workbook.worksheets[0];
        rows = worksheet.getSheetValues().slice(2).filter(r => r !== undefined).map((r: any) => ({
          name: getCellValue(r[1]).trim(),
          shortDescription: getCellValue(r[2]),
          itemCode: getCellValue(r[3]),
          regularPrice: r[4],
          salePrice: r[5],
          website: getCellValue(r[6]),
          category: getCellValue(r[7]),
          brand: getCellValue(r[8]),
          applications: getCellValue(r[9]),
          mainImage: getCellValue(r[10]),
          galleryImages: getCellValue(r[11]),
          technicalSpecs: getCellValue(r[12]),
        } as BulkRow));
      }

      setProgress({ current: 0, total: rows.length });
      const bulkToast = toast.loading(`Starting sync...`);

      // Pre-fetch products for collision check
      const productSnap = await getDocs(collection(db, "products"));
      const existingProducts = productSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      for (const row of rows) {
        if (signal.aborted) break;
        if (!row.name) continue;

        const rowWebsites = row.website ? row.website.split("|").map(w => w.trim()).filter(Boolean) : [];
        const rowApps = row.applications ? row.applications.split("|").map(a => a.trim()).filter(Boolean) : [];

        // 1. CASE-INSENSITIVE PRODUCT DUPLICATE CHECK
        const isDuplicate = existingProducts.some((p: any) => {
          const nameMatch = p.name?.toLowerCase() === row.name.toLowerCase();
          const webMatch = rowWebsites.some(w => p.website?.includes(w));
          return nameMatch && webMatch;
        });

        if (isDuplicate) {
          setProgress(prev => ({ ...prev, current: prev.current + 1 }));
          continue;
        }

        // 2. Sync Master Fields
        await syncMasterField("brand_name", "title", row.brand || "", rowWebsites);
        await syncMasterField("categoriesmaintenance", "name", row.category || "", rowWebsites);
        for (const app of rowApps) await syncMasterField("applications", "title", app, rowWebsites);

        // 3. Technical Specs Parsing
        const productSpecs: SpecValue[] = [];
        if (row.technicalSpecs) {
          row.technicalSpecs.split("|").forEach(part => {
            const colonIndex = part.indexOf(":");
            if (colonIndex !== -1) {
              const sName = part.substring(0, colonIndex).trim();
              const sVal = part.substring(colonIndex + 1).trim();
              if (sName && sVal) {
                productSpecs.push({ name: sName, value: sVal });
                syncMasterField("specs", "name", sName, rowWebsites);
              }
            }
          });
        }

        const mainImg = await uploadToCloudinary(transformGDriveUrl(row.mainImage || ""));
        const galImgs = row.galleryImages ? await Promise.all(row.galleryImages.split("|").map(u => uploadToCloudinary(transformGDriveUrl(u.trim())))) : [];

        await addDoc(collection(db, "products"), {
          name: row.name,
          shortDescription: row.shortDescription || "",
          itemCode: row.itemCode || "",
          regularPrice: Number(row.regularPrice) || 0,
          salePrice: Number(row.salePrice) || 0,
          website: rowWebsites,
          category: row.category || "",
          brand: row.brand || "",
          applications: rowApps,
          mainImage: mainImg,
          galleryImages: galImgs,
          technicalSpecs: productSpecs,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setProgress(prev => {
          const next = prev.current + 1;
          toast.loading(`Synced ${next}/${rows.length}`, { id: bulkToast });
          return { ...prev, current: next };
        });
      }

      toast.success("Upload Complete", { id: bulkToast });
      if (onUploadComplete) onUploadComplete();
      setOpen(false); // Close dialog on success
    } catch (err: any) {
      toast.error(err.message || "Bulk Upload Failed");
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && !isProcessing && handleBulkUpload(files[0]),
    accept: { "text/csv": [".csv"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    multiple: false,
    disabled: isProcessing
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Upload className="h-4 w-4" />
            Bulk Upload
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Bulk Product Upload
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to add multiple products at once. The system will automatically sync categories, brands, and specifications.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div {...getRootProps()} className={cn(
            "relative border-2 border-dashed rounded-lg p-12 text-center transition-all cursor-pointer",
            isDragActive ? "bg-primary/5 border-primary" : "border-border hover:border-primary/50 hover:bg-accent/50",
            isProcessing && "opacity-50 cursor-not-allowed pointer-events-none"
          )}>
            <input {...getInputProps()} />
            {isProcessing ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    Processing {progress.current} of {progress.total}
                  </p>
                  <div className="w-full max-w-xs mx-auto bg-muted rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    abortControllerRef.current?.abort(); 
                  }}
                >
                  Cancel Upload
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Zap className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <p className="text-base font-semibold text-foreground">
                    {isDragActive ? "Drop your file here" : "Drag & drop your file here"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    or click to browse
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Supports CSV and Excel (.xlsx)</span>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium text-primary">
                    Case-insensitive merge active
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Duplicate products will be skipped automatically
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Template Download Helper */}
        <div className="mt-4 p-4 bg-muted/50 rounded-lg border">
          <p className="text-xs font-medium text-foreground mb-2">Expected Columns:</p>
          <p className="text-xs text-muted-foreground font-mono">
            name, shortDescription, itemCode, regularPrice, salePrice, website, category, brand, applications, mainImage, galleryImages, technicalSpecs
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Use <code className="bg-background px-1 py-0.5 rounded">|</code> to separate multiple values in website, applications, and gallery images.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}