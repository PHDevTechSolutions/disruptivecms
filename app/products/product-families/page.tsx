"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import {
  Pencil,
  Trash2,
  Image as ImageIcon,
  Loader2,
  Check,
  Globe,
  X,
  RotateCcw,
  Layers,
  FolderPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { ExcelTdsGenerator } from "@/components/product-forms/excel-tds-generator";

const WEBSITE_OPTIONS = [
  "Disruptive Solutions Inc",
  "Ecoshift Corporation",
  "Value Acquisitions Holdings",
  "Taskflow",
  "Shopify"
];

export default function CategoryMaintenance() {
  const CLOUDINARY_UPLOAD_PRESET = "taskflow_preset";
  const CLOUDINARY_CLOUD_NAME = "dvmpn8mjh";

  const [categories, setCategories] = useState<any[]>([]);
  const [specifications, setSpecifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  const [openSpecs, setOpenSpecs] = useState(false);

  // Form States
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedWebsites, setSelectedWebsites] = useState<string[]>([]);
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

const handleBulkUpdateWebsites = async () => {
  if (selectedWebsites.length === 0)
    return toast.error("Select at least one website first.");

  setIsBulkUpdating(true);
  try {
    const batch = categories.map((cat) =>
      updateDoc(doc(db, "productfamilies", cat.id), {
        websites: selectedWebsites,
        updatedAt: serverTimestamp(),
      }),
    );
    await Promise.all(batch);
    toast.success(`Updated ${categories.length} categories to: ${selectedWebsites.join(", ")}`);
  } catch (err) {
    toast.error("Bulk update failed");
  } finally {
    setIsBulkUpdating(false);
  }
};
  useEffect(() => {
    const q = query(
      collection(db, "productfamilies"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCategories(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      );
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "specs"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      setSpecifications(
        snapshot.docs.map((doc) => ({ id: doc.id, name: doc.data().name })),
      );
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    },
  });

  const resetForm = () => {
    setEditId(null);
    setTitle("");
    setDescription("");
    setSelectedWebsites([]);
    setSelectedSpecs([]);
    setImageFile(null);
    setPreviewUrl("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || selectedWebsites.length === 0)
      return toast.error("Required fields missing");

    setIsSubmitLoading(true);
    try {
      let finalImageUrl = previewUrl;
      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: "POST", body: formData },
        );
        const data = await res.json();
        finalImageUrl = data.secure_url;
      }

      const payload = {
        title: title.toUpperCase(),
        description,
        websites: selectedWebsites,
        specifications: selectedSpecs,
        imageUrl: finalImageUrl,
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await updateDoc(doc(db, "productfamilies", editId), payload);
        toast.success("Updated Successfully");
      } else {
        await addDoc(collection(db, "productfamilies"), {
          ...payload,
          isActive: true,
          createdAt: serverTimestamp(),
        });
        toast.success("Category Created");
      }
      resetForm();
    } catch (error) {
      toast.error("Error processing request");
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
                  <BreadcrumbPage>Maintenance</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Product Families
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage product families and specifications.
              </p>
            </div>

            {/* ── EXCEL TO TDS GENERATOR ── */}
            <div className="border-t pt-6">
              <ExcelTdsGenerator />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* ── FORM ── */}
              <div className="lg:col-span-4 sticky top-6 z-10">
                <Card className="rounded-none shadow-none border-foreground/10 max-h-[calc(100vh-6rem)] overflow-y-auto">
                  <CardHeader className="border-b py-4 flex flex-row items-center justify-between space-y-0 sticky top-0 bg-background z-10">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest">
                      {editId ? "Update Category" : "Add New Category"}
                    </CardTitle>
                    {editId && (
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
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Category Title
                      </label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="E.G. RECESSED LIGHTS"
                        className="rounded-none h-10 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Description
                      </label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Enter overview..."
                        className="rounded-none min-h-[80px] text-xs resize-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Websites
                      </label>
                      <div className="grid grid-cols-2 gap-1">
                        {WEBSITE_OPTIONS.map((site) => (
                          <Button
                            key={site}
                            type="button"
                            variant={
                              selectedWebsites.includes(site)
                                ? "default"
                                : "outline"
                            }
                            className="rounded-none h-8 text-[9px] uppercase font-bold px-2"
                            onClick={() =>
                              setSelectedWebsites((prev) =>
                                prev.includes(site)
                                  ? prev.filter((s) => s !== site)
                                  : [...prev, site],
                              )
                            }
                          >
                            {site.split(" ")[0]}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Specifications
                      </label>
                      <Popover open={openSpecs} onOpenChange={setOpenSpecs}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between rounded-none h-10 text-[10px] font-bold uppercase"
                          >
                            {selectedSpecs.length > 0
                              ? `${selectedSpecs.length} Spec${selectedSpecs.length > 1 ? "s" : ""} Attached`
                              : "Select Specifications..."}
                            <Layers className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none"
                          align="start"
                        >
                          <Command>
                            <CommandInput
                              placeholder="Search spec name..."
                              className="h-9 text-xs"
                            />
                            <CommandList>
                              <CommandEmpty>
                                No specifications found.
                              </CommandEmpty>
                              <CommandGroup>
                                {specifications.map((spec) => (
                                  <CommandItem
                                    key={spec.id}
                                    onSelect={() =>
                                      setSelectedSpecs((prev) =>
                                        prev.includes(spec.id)
                                          ? prev.filter((id) => id !== spec.id)
                                          : [...prev, spec.id],
                                      )
                                    }
                                    className="text-[10px] uppercase font-bold"
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-3 w-3",
                                        selectedSpecs.includes(spec.id)
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {spec.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Category Cover
                      </label>
                      <div
                        {...getRootProps()}
                        className={cn(
                          "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors min-h-[120px]",
                          isDragActive && "border-primary bg-primary/5",
                        )}
                      >
                        <input {...getInputProps()} />
                        {previewUrl ? (
                          <div className="relative w-full aspect-video border bg-muted overflow-hidden">
                            <img
                              src={previewUrl}
                              className="h-full w-full object-cover"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6 rounded-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewUrl("");
                                setImageFile(null);
                              }}
                            >
                              <X size={12} />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <ImageIcon
                              size={20}
                              className="text-muted-foreground opacity-40"
                            />
                            <p className="text-[10px] font-bold uppercase tracking-tight">
                              Drop Image Here
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitLoading}
                      className="w-full rounded-none uppercase font-bold text-[10px] h-11 tracking-widest"
                    >
                      {isSubmitLoading ? (
                        <Loader2 className="animate-spin h-4 w-4" />
                      ) : editId ? (
                        "Push Update"
                      ) : (
                        "Save Category"
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
                ) : categories.length === 0 ? (
                  /* ── EMPTY STATE ── */
                  <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mb-4 shadow-sm">
                      <FolderPlus className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                      No Product Families
                    </h3>
                    <p className="text-[11px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
                      Your database is currently empty. Define a new category
                      using the panel on the left to begin.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {categories.map((cat) => (
                      <Card
                        key={cat.id}
                        className="rounded-none shadow-none group relative overflow-hidden border-foreground/10"
                      >
                        <div className="aspect-[4/3] relative bg-muted border-b overflow-hidden">
                          <img
                            src={cat.imageUrl || "/placeholder.png"}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute top-2 right-2 flex gap-1">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-7 w-7 rounded-none shadow-sm"
                              onClick={() => {
                                setEditId(cat.id);
                                setTitle(cat.title);
                                setDescription(cat.description || "");
                                setSelectedWebsites(cat.websites || []);
                                setSelectedSpecs(cat.specifications || []);
                                setPreviewUrl(cat.imageUrl);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
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
                                    Delete "{cat.title}"? This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-none text-xs">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-none bg-destructive text-xs"
                                    onClick={() =>
                                      deleteDoc(
                                        doc(db, "productfamilies", cat.id),
                                      )
                                    }
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-[11px] font-black uppercase truncate">
                              {cat.title}
                            </h3>
                            <Badge
                              variant={cat.isActive ? "default" : "outline"}
                              className="rounded-none text-[7px] px-1 h-4 uppercase"
                            >
                              {cat.isActive ? "Live" : "Hidden"}
                            </Badge>
                          </div>
                          {cat.description && (
                            <p className="text-[9px] text-muted-foreground uppercase line-clamp-1 italic">
                              {cat.description}
                            </p>
                          )}
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
