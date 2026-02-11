"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
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
  Pencil,
  Trash2,
  Loader2,
  Save,
  UploadCloud,
  Link2,
  PlusCircle,
  Check,
  Globe,
  RotateCcw,
  Settings2,
  X,
  RefreshCw,
} from "lucide-react";
import { uploadToCloudinary } from "@/lib/cloudinary";

// Shadcn UI Imports
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const WEBSITE_OPTIONS = [
  "Disruptive Solutions Inc",
  "Ecoshift Corporation",
  "Value Acquisitions Holdings",
];

export default function BrandsManager() {
  const [brands, setBrands] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [availablePages, setAvailablePages] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [dialogConfig, setDialogConfig] = useState<{
    show: boolean;
    type: "category" | "page";
  }>({ show: false, type: "category" });
  const [newVal1, setNewVal1] = useState("");
  const [newVal2, setNewVal2] = useState("");

  // Form States
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [href, setHref] = useState("");
  const [selectedWebsites, setSelectedWebsites] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePrev, setImagePrev] = useState<string | null>(null);

  useEffect(() => {
    const unsubBrands = onSnapshot(
      query(collection(db, "brand_name"), orderBy("createdAt", "desc")),
      (snap) => {
        setBrands(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
    );
    const unsubCats = onSnapshot(
      query(collection(db, "brand_categories"), orderBy("name", "asc")),
      (snap) => {
        setCategories(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
    );
    const unsubPages = onSnapshot(
      query(collection(db, "website_pages"), orderBy("name", "asc")),
      (snap) => {
        setAvailablePages(
          snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
      },
    );
    return () => {
      unsubBrands();
      unsubCats();
      unsubPages();
    };
  }, []);

  // Dropzone Setup
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setImageFile(file);
      setImagePrev(URL.createObjectURL(file));
      toast.info("Image attached");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
    noClick: !!imagePrev, // Disable click-to-open if image exists so we can use custom buttons
  });

  const removeImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImageFile(null);
    setImagePrev(null);
    toast.error("Image removed");
  };

  const toggleWebsite = (site: string) => {
    setSelectedWebsites((prev) =>
      prev.includes(site) ? prev.filter((s) => s !== site) : [...prev, site],
    );
  };

  const handleQuickAdd = async () => {
    if (!newVal1) return;
    const colName =
      dialogConfig.type === "category" ? "brand_categories" : "website_pages";
    const data =
      dialogConfig.type === "category"
        ? { name: newVal1 }
        : { name: newVal1, url: newVal2 };

    try {
      await addDoc(collection(db, colName), data);
      toast.success(`${dialogConfig.type} added`);
      setNewVal1("");
      setNewVal2("");
      setDialogConfig({ ...dialogConfig, show: false });
    } catch (e) {
      toast.error("Action failed");
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setCategory("");
    setHref("");
    setSelectedWebsites([]);
    setImageFile(null);
    setImagePrev(null);
  };

  const handleSubmit = async () => {
    if (!title || !category || !href || selectedWebsites.length === 0) {
      return toast.error("Required fields missing");
    }
    if (!imagePrev) return toast.error("Brand logo is required");

    setIsSyncing(true);
    try {
      let finalImageUrl = imagePrev;
      if (imageFile) finalImageUrl = await uploadToCloudinary(imageFile);

      const brandDoc = {
        title: title.toUpperCase(),
        description: description || "",
        category,
        href,
        websites: selectedWebsites,
        image: finalImageUrl,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "brand_name", editingId), brandDoc);
        toast.success("Brand Updated");
      } else {
        await addDoc(collection(db, "brand_name"), {
          ...brandDoc,
          createdAt: serverTimestamp(),
        });
        toast.success("Brand Forged");
      }
      resetForm();
    } catch (err) {
      toast.error("Sync failed");
    } finally {
      setIsSyncing(false);
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
                  <BreadcrumbPage>Brands Forge</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 leading-none">
                Brands <span className="text-primary">Forge</span>
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Manage identity assets & routing
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* EDITOR PANEL */}
              <div className="lg:col-span-4 space-y-6">
                <Card className="rounded-none shadow-none border-foreground/10">
                  <CardHeader className="border-b py-4 flex flex-row items-center justify-between bg-muted/30">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                      <Settings2 className="h-3 w-3" /> Identity Config
                    </CardTitle>
                    {editingId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetForm}
                        className="h-7 rounded-none text-[9px] uppercase font-bold text-muted-foreground"
                      >
                        Cancel
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="pt-5 space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Brand Name
                      </label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="BRAND NAME"
                        className="rounded-none h-10 text-xs font-bold uppercase"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60 flex items-center justify-between">
                          Category
                          <button
                            onClick={() =>
                              setDialogConfig({ show: true, type: "category" })
                            }
                            className="text-primary"
                          >
                            <PlusCircle size={12} />
                          </button>
                        </label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full flex h-10 border border-input bg-background px-3 py-2 text-[10px] font-bold uppercase focus:outline-none"
                        >
                          <option value="">Select</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.name}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60 flex items-center justify-between">
                          Redirect
                          <button
                            onClick={() =>
                              setDialogConfig({ show: true, type: "page" })
                            }
                            className="text-primary"
                          >
                            <PlusCircle size={12} />
                          </button>
                        </label>
                        <select
                          value={href}
                          onChange={(e) => setHref(e.target.value)}
                          className="w-full flex h-10 border border-input bg-background px-3 py-2 text-[10px] font-bold uppercase focus:outline-none"
                        >
                          <option value="">Select</option>
                          {availablePages.map((p) => (
                            <option key={p.id} value={p.url}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Visual Asset (Logo)
                      </label>
                      <div
                        {...getRootProps()}
                        className={cn(
                          "relative aspect-[21/9] rounded-none border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition-all group",
                          isDragActive
                            ? "border-primary bg-primary/5"
                            : "border-foreground/10 bg-muted/20",
                          !imagePrev &&
                            "hover:border-primary/50 cursor-pointer",
                        )}
                      >
                        <input {...getInputProps()} />

                        {imagePrev ? (
                          <>
                            <img
                              src={imagePrev}
                              className="w-full h-full object-contain p-4 transition-opacity group-hover:opacity-40"
                              alt="Preview"
                            />
                            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <label className="bg-black text-white p-2 rounded-none cursor-pointer hover:bg-primary transition-colors">
                                <RefreshCw size={14} />
                                <input {...getInputProps()} />
                              </label>
                              <Button
                                variant="destructive"
                                size="icon"
                                className="h-8 w-8 rounded-none"
                                onClick={removeImage}
                              >
                                <X size={14} />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="text-center text-muted-foreground/40">
                            <UploadCloud size={20} className="mx-auto mb-1" />
                            <span className="text-[7px] font-black uppercase block">
                              Drop Logo Asset
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-2">
                        <Globe size={10} /> Platform Assignment
                      </label>
                      <div className="grid grid-cols-1 gap-1">
                        {WEBSITE_OPTIONS.map((site) => (
                          <Button
                            key={site}
                            variant={
                              selectedWebsites.includes(site)
                                ? "default"
                                : "outline"
                            }
                            className="rounded-none h-8 text-[9px] uppercase font-bold px-2 justify-start transition-none"
                            onClick={() => toggleWebsite(site)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-3 w-3 shrink-0",
                                selectedWebsites.includes(site)
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <span className="truncate">{site}</span>
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Brand Story
                      </label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="min-h-[60px] rounded-none text-xs bg-background resize-none"
                        placeholder="Description..."
                      />
                    </div>

                    <Button
                      onClick={handleSubmit}
                      disabled={isSyncing}
                      className="w-full rounded-none uppercase font-black text-[11px] h-12 tracking-widest shadow-xl"
                    >
                      {isSyncing ? (
                        <Loader2 className="animate-spin h-4 w-4" />
                      ) : editingId ? (
                        "Update Brand"
                      ) : (
                        "Forge Brand"
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* UPDATED LIST VIEW GRID */}
              <div className="lg:col-span-8">
                {loading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-6">
                    {brands.map((brand) => (
                      <Card
                        key={brand.id}
                        className="rounded-none shadow-none group relative overflow-hidden border-foreground/10 hover:border-primary/50 flex flex-col h-full transition-all"
                      >
                        {/* SQUARE IMAGE AREA */}
                        <div className="aspect-square relative bg-[#f9f9f9] border-b flex items-center justify-center overflow-hidden">
                          <img
                            src={brand.image}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                            alt={brand.title}
                          />
                          
                          {/* FLOATING ACTION BUTTONS */}
                          <div className="absolute top-3 right-3 flex gap-1 translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-8 w-8 rounded-none border shadow-sm bg-white/90 hover:bg-white"
                              onClick={() => {
                                setEditingId(brand.id);
                                setTitle(brand.title);
                                setDescription(brand.description);
                                setCategory(brand.category);
                                setHref(brand.href);
                                setSelectedWebsites(brand.websites || []);
                                setImagePrev(brand.image);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                            >
                              <Pencil size={14} />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="destructive"
                                  className="h-8 w-8 rounded-none border border-red-100 bg-red-50/90 hover:bg-red-100 shadow-sm"
                                >
                                  <Trash2 size={14} className="text-red-500" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-none">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-sm font-black uppercase italic tracking-tighter">
                                    Delete Brand Asset
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-[11px] font-bold uppercase">
                                    Permanently remove "{brand.title}"?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-none text-[10px] font-black uppercase">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-none bg-destructive text-[10px] font-black uppercase"
                                    onClick={() =>
                                      deleteDoc(doc(db, "brand_name", brand.id))
                                    }
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>

                        {/* CONTENT SECTION */}
                        <div className="p-4 flex flex-col flex-1 justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="text-[12px] font-black uppercase italic tracking-tight truncate leading-none">
                                {brand.title}
                              </h3>
                              <Badge className="rounded-none bg-black text-white text-[8px] px-1.5 py-0.5 font-bold uppercase shrink-0 tracking-widest">
                                Live
                              </Badge>
                            </div>
                            
                            {brand.description && (
                              <p className="text-[10px] font-medium text-muted-foreground uppercase leading-relaxed line-clamp-2">
                                {brand.description}
                              </p>
                            )}
                          </div>

                          {/* FOOTER METADATA */}
                          <div className="pt-3 border-t border-muted/50 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[9px] font-black text-primary uppercase tracking-widest opacity-80">
                              / {brand.href}
                            </div>
                            
                            <div className="flex gap-1">
                              {brand.websites?.map((w: string) => (
                                <div 
                                  key={w} 
                                  className="w-1.5 h-1.5 bg-foreground/20 rounded-full" 
                                  title={w} 
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
          {/* DIALOGS REMAIN SAME */}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}