"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import {
  Pencil,
  Trash2,
  Loader2,
  Save,
  X,
  Upload,
  File as FileIcon,
  RotateCcw,
  Plus,
  Layers,
} from "lucide-react";
import { uploadToCloudinary } from "@/lib/cloudinary";

// Shadcn UI Imports
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Product = {
  name: string;
  pdfUrl: string;
  fileName: string;
};

type Series = {
  id: string;
  name: string;
  products?: Product[];
  createdAt?: any;
};

export default function SeriesManager() {
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Form States
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const q = query(collection(db, "series"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSeriesList(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Series),
      );
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const parsePdfFileName = (fileName: string): string => {
    let name = fileName.replace(/\.pdf$/i, "");
    name = name.replace(/\s*TDS\s*/gi, "").trim();
    name = name.replace(/\(r\)/gi, "®");
    return name;
  };

  const handleFiles = async (files: File[]) => {
    const pdfFiles = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.name.endsWith(".pdf"),
    );
    if (pdfFiles.length === 0)
      return toast.error("Please upload PDF files only.");

    setUploadingFiles(true);
    try {
      const newProducts: Product[] = [];
      for (const file of pdfFiles) {
        const pdfUrl = await uploadToCloudinary(file);
        const productName = parsePdfFileName(file.name);
        newProducts.push({ name: productName, pdfUrl, fileName: file.name });
      }
      setProducts([...products, ...newProducts]);
      toast.success(`${pdfFiles.length} PDF(s) processed`);
    } catch (error) {
      toast.error("Error uploading PDF files.");
    } finally {
      setUploadingFiles(false);
    }
  };

  const resetForm = () => {
    setEditId(null);
    setName("");
    setProducts([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Series name is required");

    setIsSubmitLoading(true);
    try {
      const payload = {
        name: name.trim().toUpperCase(),
        products: products.length > 0 ? products : [],
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await updateDoc(doc(db, "series", editId), payload);
        toast.success("Series Updated");
      } else {
        await addDoc(collection(db, "series"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast.success("Series Created");
      }
      resetForm();
    } catch (error) {
      toast.error("Process failed");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admin">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Series</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900">
                Series <span className="text-primary">Maintenance</span>
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Manage product series and TDS documentation.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* EDITOR PANEL (LEFT) */}
              <div className="lg:col-span-4 space-y-6">
                <Card className="rounded-none shadow-none border-foreground/10">
                  <CardHeader className="border-b py-4 flex flex-row items-center justify-between space-y-0 bg-muted/30">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                      <Layers className="h-3 w-3" /> Series Editor
                    </CardTitle>
                    {editId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetForm}
                        className="h-7 rounded-none text-[9px] uppercase font-bold text-muted-foreground"
                      >
                        <RotateCcw className="mr-1 h-3 w-3" /> Reset
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="pt-5 space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Series Name
                      </label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="E.G. BUILDCHEM CI SERIES"
                        className="rounded-none h-10 text-xs font-bold uppercase"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Technical Data Sheets (PDF)
                      </label>
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDragging(false);
                          if (e.dataTransfer.files)
                            handleFiles(Array.from(e.dataTransfer.files));
                        }}
                        className={cn(
                          "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent min-h-[140px] transition-all",
                          isDragging
                            ? "border-primary bg-primary/5"
                            : "border-foreground/10",
                        )}
                        onClick={() =>
                          document.getElementById("file-upload")?.click()
                        }
                      >
                        <input
                          id="file-upload"
                          type="file"
                          accept=".pdf"
                          multiple
                          className="hidden"
                          onChange={(e) =>
                            e.target.files &&
                            handleFiles(Array.from(e.target.files))
                          }
                        />
                        <Upload
                          size={24}
                          className="text-muted-foreground opacity-30 mb-2"
                        />
                        <p className="text-[9px] font-black uppercase text-muted-foreground">
                          Drop TDS PDFs Here
                        </p>
                      </div>
                    </div>

                    {/* PRODUCT LIST */}
                    {products.length > 0 && (
                      <div className="space-y-2 border-t pt-4">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Linked Products ({products.length})
                        </label>
                        <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
                          {products.map((product, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2 bg-muted/50 border group"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <FileIcon
                                  size={12}
                                  className="text-primary shrink-0"
                                />
                                <div className="truncate">
                                  <p className="text-[9px] font-black uppercase truncate">
                                    {product.name}
                                  </p>
                                  <p className="text-[7px] text-muted-foreground truncate">
                                    {product.fileName}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-none text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() =>
                                  setProducts(
                                    products.filter((_, i) => i !== idx),
                                  )
                                }
                              >
                                <X size={12} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {uploadingFiles && (
                      <div className="flex items-center gap-2 justify-center py-2 bg-primary/5 border border-primary/20">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        <span className="text-[9px] font-black uppercase text-primary">
                          Uploading to Cloudinary...
                        </span>
                      </div>
                    )}

                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitLoading || uploadingFiles}
                      className="w-full rounded-none uppercase font-black text-[11px] h-12 tracking-widest shadow-xl"
                    >
                      {isSubmitLoading ? (
                        <Loader2 className="animate-spin h-4 w-4" />
                      ) : editId ? (
                        "Update Series"
                      ) : (
                        "Save Series"
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* GRID VIEW (RIGHT) */}
              <div className="lg:col-span-8">
                {loading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {seriesList.map((series) => (
                      <Card
                        key={series.id}
                        className="rounded-none shadow-none group relative overflow-hidden border-foreground/10 hover:border-primary/50 transition-colors"
                      >
                        <CardHeader className="p-4 space-y-2">
                          <div className="flex items-start justify-between">
                            <h3 className="text-[12px] font-black uppercase italic leading-tight pr-8">
                              {series.name}
                            </h3>
                            <div className="absolute top-3 right-3 flex gap-1 translate-y-[-5px] opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-7 w-7 rounded-none border shadow-md"
                                onClick={() => {
                                  setEditId(series.id);
                                  setName(series.name);
                                  setProducts(series.products || []);
                                  window.scrollTo({
                                    top: 0,
                                    behavior: "smooth",
                                  });
                                }}
                              >
                                <Pencil size={12} />
                              </Button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="destructive"
                                    className="h-7 w-7 rounded-none shadow-md"
                                  >
                                    <Trash2 size={12} />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-none">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="text-sm font-black uppercase italic">
                                      Delete Series
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="text-[11px] font-bold uppercase text-muted-foreground">
                                      Destroying "{series.name}" will remove all
                                      linked PDF data. Proceed?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-none text-[10px] font-black uppercase">
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      className="rounded-none bg-destructive text-[10px] font-black uppercase"
                                      onClick={() =>
                                        deleteDoc(doc(db, "series", series.id))
                                      }
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                          <Separator className="bg-foreground/5" />
                          <div className="pt-2 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[8px] font-black text-muted-foreground uppercase tracking-tighter">
                                Documentation
                              </span>
                              <Badge
                                variant="secondary"
                                className="rounded-none text-[8px] h-4 font-black bg-primary/10 text-primary border-none"
                              >
                                {series.products?.length || 0} PRODUCTS
                              </Badge>
                            </div>
                            {series.products && series.products.length > 0 && (
                              <div className="space-y-1 pt-1">
                                {series.products.slice(0, 3).map((p, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-1.5 text-[8px] font-bold text-foreground/70 uppercase"
                                  >
                                    <div className="h-1 w-1 bg-primary rounded-full shrink-0" />
                                    <span className="truncate">{p.name}</span>
                                  </div>
                                ))}
                                {series.products.length > 3 && (
                                  <p className="text-[7px] italic font-bold text-muted-foreground">
                                    +{series.products.length - 3} more items
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
