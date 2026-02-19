"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  RotateCcw,
  FolderPlus,
  FileText,
  ImagePlus,
  UploadCloud,
  CheckCircle2,
  FileUp,
} from "lucide-react";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { useDropzone } from "react-dropzone";

type Catalog = {
  id: string;
  title: string;
  description: string;
  category: string;
  image?: string;
  pdfUrl?: string;
  createdAt?: any;
};

const CATEGORY_OPTIONS = ["Architecture", "Industrial", "Technology", "Custom"];

export default function CatalogManager() {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Form States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Architecture");

  // File States
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePrev, setImagePrev] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [existingPdfUrl, setExistingPdfUrl] = useState<string | null>(null);

  // Dropzones
  const imageDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file) {
        setImageFile(file);
        setImagePrev(URL.createObjectURL(file));
      }
    },
  });

  const pdfDropzone = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    onDrop: (acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length > 0) {
        toast.error("Invalid format. Please select a PDF file.");
        return;
      }
      const file = acceptedFiles[0];
      if (file) setPdfFile(file);
    },
  });

  // Real-time Data Sync
  useEffect(() => {
    const q = query(collection(db, "catalogs"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCatalogs(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Catalog),
      );
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title) return toast.error("Title is required.");
    if (!existingPdfUrl && !pdfFile)
      return toast.error("Technical PDF is required.");

    setIsSubmitLoading(true);
    try {
      let finalImageUrl = imagePrev;
      if (imageFile) {
        finalImageUrl = await uploadToCloudinary(imageFile);
      }

      let finalPdfUrl = existingPdfUrl;
      if (pdfFile) {
        finalPdfUrl = await uploadToCloudinary(pdfFile);
      }

      const catalogData = {
        title,
        description,
        category,
        image: finalImageUrl,
        pdfUrl: finalPdfUrl,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "catalogs", editingId), catalogData);
        toast.success("Catalog updated successfully");
      } else {
        await addDoc(collection(db, "catalogs"), {
          ...catalogData,
          createdAt: serverTimestamp(),
        });
        toast.success("Catalog created");
      }

      resetForm();
    } catch (err) {
      console.error(err);
      toast.error("Critical Error: Failed to sync assets to cloud.");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setCategory("Architecture");
    setImageFile(null);
    setImagePrev(null);
    setPdfFile(null);
    setExistingPdfUrl(null);
  };

  const handleEditClick = (catalog: Catalog) => {
    setEditingId(catalog.id);
    setTitle(catalog.title);
    setDescription(catalog.description);
    setCategory(catalog.category || "Architecture");
    setImagePrev(catalog.image || null);
    setExistingPdfUrl(catalog.pdfUrl || null);
    setImageFile(null);
    setPdfFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hasPdf = !!(pdfFile || existingPdfUrl);

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
                  <BreadcrumbPage>Catalog Manager</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Catalog Manager
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage product catalogs and technical document archives.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* ── FORM ── */}
              <div className="lg:col-span-4 sticky top-6 z-10">
                <Card className="rounded-none shadow-none border-foreground/10 max-h-[calc(100vh-6rem)] overflow-y-auto">
                  <CardHeader className="border-b py-4 flex flex-row items-center justify-between space-y-0 sticky top-0 bg-background z-10">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest">
                      {editingId ? "Update Catalog" : "Add New Catalog"}
                    </CardTitle>
                    {editingId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetForm}
                        className="h-7 rounded-none text-[9px] uppercase font-bold text-muted-foreground"
                      >
                        <RotateCcw className="mr-1 h-3 w-3" /> Cancel Edit
                      </Button>
                    )}
                  </CardHeader>

                  <CardContent className="pt-5 space-y-5">
                    {/* Title */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Catalog Headline
                      </label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="E.G. INDUSTRIAL SERIES 2026"
                        className="rounded-none h-10 text-xs"
                      />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Description
                      </label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Brief technical overview..."
                        className="rounded-none min-h-[80px] text-xs resize-none"
                      />
                    </div>

                    {/* Category */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Industry Category
                      </label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="rounded-none h-10 text-xs">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent className="rounded-none">
                          {CATEGORY_OPTIONS.map((cat) => (
                            <SelectItem
                              key={cat}
                              value={cat}
                              className="text-xs"
                            >
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Cover Image Upload */}
                    <div className="space-y-1.5 pt-4 border-t">
                      <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                        <ImagePlus size={11} /> Cover Art (JPG/PNG)
                      </label>
                      <div
                        {...imageDropzone.getRootProps()}
                        className={cn(
                          "flex flex-col items-center justify-center border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors min-h-[120px] overflow-hidden",
                          imageDropzone.isDragActive &&
                            "border-primary bg-primary/5",
                        )}
                      >
                        <input {...imageDropzone.getInputProps()} />
                        {imagePrev ? (
                          <div className="relative w-full aspect-video bg-muted overflow-hidden">
                            <img
                              src={imagePrev}
                              className="h-full w-full object-cover"
                              alt="Cover preview"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6 rounded-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                setImagePrev(null);
                                setImageFile(null);
                              }}
                            >
                              <X size={12} />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 p-6">
                            <UploadCloud
                              size={20}
                              className="text-muted-foreground opacity-40"
                            />
                            <p className="text-[10px] font-bold uppercase tracking-tight">
                              {imageDropzone.isDragActive
                                ? "Drop Image Here"
                                : "Drop or Click to Upload"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* PDF Upload */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                        <FileUp size={11} /> Technical Document (PDF ONLY)
                      </label>
                      <div
                        {...pdfDropzone.getRootProps()}
                        className={cn(
                          "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer transition-colors min-h-[100px]",
                          hasPdf
                            ? "border-primary bg-primary/5"
                            : pdfDropzone.isDragActive
                              ? "border-primary bg-primary/5"
                              : "hover:bg-accent",
                        )}
                      >
                        <input {...pdfDropzone.getInputProps()} />
                        {hasPdf ? (
                          <div className="relative">
                            <FileText className="text-primary" size={32} />
                            <div className="absolute -right-2 -bottom-2 bg-green-500 text-white rounded-full p-0.5 border-2 border-white">
                              <CheckCircle2 size={10} />
                            </div>
                          </div>
                        ) : (
                          <FileUp
                            size={32}
                            className="text-muted-foreground opacity-30"
                          />
                        )}
                        <div className="text-center mt-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest">
                            {pdfDropzone.isDragActive
                              ? "Drop PDF Here"
                              : hasPdf
                                ? "Technical PDF Loaded"
                                : "Drop or Click to Upload PDF"}
                          </p>
                          {pdfFile && (
                            <p className="text-[9px] text-primary mt-1 uppercase italic line-clamp-1">
                              {pdfFile.name}
                            </p>
                          )}
                          {!hasPdf && (
                            <p className="text-[8px] text-muted-foreground mt-1 uppercase">
                              Max size: 10MB
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitLoading}
                      className="w-full rounded-none uppercase font-bold text-[10px] h-11 tracking-widest"
                    >
                      {isSubmitLoading ? (
                        <Loader2 className="animate-spin h-4 w-4" />
                      ) : editingId ? (
                        "Push Update"
                      ) : (
                        "Save Catalog"
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* ── LIST VIEW ── */}
              <div className="lg:col-span-8">
                {loading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : catalogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mb-4 shadow-sm">
                      <FolderPlus className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                      No Catalogs
                    </h3>
                    <p className="text-[11px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
                      Your archive is empty. Add a new catalog using the panel
                      on the left to begin.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {catalogs.map((item) => (
                      <Card
                        key={item.id}
                        className="rounded-none shadow-none group relative overflow-hidden border-foreground/10"
                      >
                        {/* Cover Image */}
                        <div className="aspect-[4/3] relative bg-muted border-b overflow-hidden">
                          <img
                            src={item.image || "/placeholder.png"}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            alt={item.title}
                          />

                          {/* PDF indicator overlay on hover */}
                          {item.pdfUrl && (
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                              <div className="flex flex-col items-center gap-2 text-white">
                                <FileText size={32} />
                                <span className="text-[9px] font-black uppercase tracking-widest">
                                  PDF Synced
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="absolute top-2 right-2 flex gap-1">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-7 w-7 rounded-none shadow-sm"
                              onClick={() => handleEditClick(item)}
                            >
                              <Pencil size={12} />
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="destructive"
                                  className="h-7 w-7 rounded-none shadow-sm"
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-none">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-sm font-bold uppercase">
                                    Confirm Removal
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-xs">
                                    Delete "{item.title}"? This cannot be
                                    undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-none text-xs">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-none bg-destructive text-xs"
                                    onClick={() =>
                                      deleteDoc(doc(db, "catalogs", item.id))
                                    }
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>

                        {/* Card Body */}
                        <div className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-[11px] font-black uppercase truncate">
                              {item.title}
                            </h3>
                            {item.pdfUrl && (
                              <Badge
                                variant="outline"
                                className="rounded-none text-[7px] px-1 h-4 uppercase shrink-0"
                              >
                                PDF
                              </Badge>
                            )}
                          </div>

                          {item.description && (
                            <p className="text-[9px] text-muted-foreground uppercase line-clamp-2 italic">
                              {item.description}
                            </p>
                          )}

                          <div className="flex gap-1 flex-wrap pt-1">
                            <Badge
                              variant="secondary"
                              className="rounded-none text-[7px] px-1.5 h-4 uppercase"
                            >
                              {item.category}
                            </Badge>
                          </div>
                        </div>
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
