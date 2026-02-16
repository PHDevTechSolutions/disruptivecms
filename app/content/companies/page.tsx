"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
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
  Building2,
  RotateCcw,
  FolderPlus,
  Image as ImageIcon,
} from "lucide-react";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { useDropzone } from "react-dropzone";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

type Company = {
  id: string;
  companyName: string;
  description: string;
  mainImage?: string;
  services: string[];
  keyFeatures: string[];
  partnersImage: string[];
  website: string;
  createdAt?: any;
};

const WEBSITE_OPTIONS = [
  "Disruptive Solutions Inc",
  "Ecoshift Corporation",
  "Value Acquisitions Holdings",
];

export default function CompanyManager() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Form States
  const [editId, setEditId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("Disruptive Solutions Inc");
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [mainImagePrev, setMainImagePrev] = useState<string | null>(null);

  // Arrays
  const [services, setServices] = useState<string[]>([""]);
  const [keyFeatures, setKeyFeatures] = useState<string[]>([""]);

  // Partner Images State
  const [partnersImage, setPartnersImage] = useState<(File | null)[]>([]);
  const [partnersImagePrev, setPartnersImagePrev] = useState<string[]>([]);

  // --- Real-time Data Sync ---
  useEffect(() => {
    const q = query(collection(db, "company"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCompanies(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Company),
      );
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Main Image Dropzone
  const mainImageDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      setMainImage(file);
      setMainImagePrev(URL.createObjectURL(file));
    },
  });

  // Partner Images Dropzone
  const partnerImagesDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: true,
    onDrop: (acceptedFiles) => {
      const newFiles = Array.from(acceptedFiles);
      const newPreviews = newFiles.map((file) => URL.createObjectURL(file));

      setPartnersImage((prev) => [...prev, ...newFiles]);
      setPartnersImagePrev((prev) => [...prev, ...newPreviews]);
    },
  });

  // --- Service & Feature Handlers ---
  const addService = () => setServices([...services, ""]);
  const removeService = (index: number) =>
    setServices(services.filter((_, i) => i !== index));
  const updateService = (index: number, value: string) => {
    const newServices = [...services];
    newServices[index] = value;
    setServices(newServices);
  };

  const addKeyFeature = () => setKeyFeatures([...keyFeatures, ""]);
  const removeKeyFeature = (index: number) =>
    setKeyFeatures(keyFeatures.filter((_, i) => i !== index));
  const updateKeyFeature = (index: number, value: string) => {
    const newFeatures = [...keyFeatures];
    newFeatures[index] = value;
    setKeyFeatures(newFeatures);
  };

  const removePartnerImage = (index: number) => {
    setPartnersImage(partnersImage.filter((_, i) => i !== index));
    setPartnersImagePrev(partnersImagePrev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const filteredServices = services.filter((s) => s.trim() !== "");
    const filteredFeatures = keyFeatures.filter((f) => f.trim() !== "");

    if (!companyName || !description) {
      return toast.error("Company Name and Description are required");
    }

    if (filteredServices.length === 0) {
      return toast.error("At least one service is required");
    }

    setIsSubmitLoading(true);
    try {
      let finalMainImage = mainImagePrev;
      if (mainImage) {
        finalMainImage = await uploadToCloudinary(mainImage);
      }

      // Handle Partner Images Upload
      const finalPartnerImages: string[] = [];

      for (let i = 0; i < partnersImagePrev.length; i++) {
        const file = partnersImage[i];
        const preview = partnersImagePrev[i];

        if (file) {
          const uploadedUrl = await uploadToCloudinary(file);
          finalPartnerImages.push(uploadedUrl);
        } else {
          finalPartnerImages.push(preview);
        }
      }

      const companyData = {
        companyName,
        description,
        website,
        mainImage: finalMainImage,
        services: filteredServices,
        keyFeatures: filteredFeatures,
        partnersImage: finalPartnerImages,
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await updateDoc(doc(db, "company", editId), companyData);
        toast.success("Updated Successfully");
      } else {
        await addDoc(collection(db, "company"), {
          ...companyData,
          createdAt: serverTimestamp(),
        });
        toast.success("Company Created");
      }

      resetForm();
    } catch (err) {
      console.error(err);
      toast.error("Error saving company");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const resetForm = () => {
    setEditId(null);
    setCompanyName("");
    setDescription("");
    setWebsite("Disruptive Solutions Inc");
    setMainImage(null);
    setMainImagePrev(null);
    setServices([""]);
    setKeyFeatures([""]);
    setPartnersImage([]);
    setPartnersImagePrev([]);
  };

  const handleEditClick = (company: Company) => {
    setEditId(company.id);
    setCompanyName(company.companyName);
    setDescription(company.description);
    setWebsite(company.website || "Disruptive Solutions Inc");
    setMainImagePrev(company.mainImage || null);
    setServices(
      company.services && company.services.length > 0 ? company.services : [""],
    );
    setKeyFeatures(
      company.keyFeatures && company.keyFeatures.length > 0
        ? company.keyFeatures
        : [""],
    );

    const existingImages = company.partnersImage || [];
    setPartnersImagePrev(existingImages);
    setPartnersImage(new Array(existingImages.length).fill(null));

    setMainImage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
                  <BreadcrumbPage>Company Manager</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Company Manager
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage company profiles and information.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* ── FORM ── */}
              <div className="lg:col-span-4 sticky top-6 z-10">
                <Card className="rounded-none shadow-none border-foreground/10 max-h-[calc(100vh-6rem)] overflow-y-auto">
                  <CardHeader className="border-b py-4 flex flex-row items-center justify-between space-y-0 sticky top-0 bg-background z-10">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest">
                      {editId ? "Update Company" : "Add New Company"}
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
                    {/* Company Name */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Company Name
                      </label>
                      <Input
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="E.G. ACME CORPORATION"
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
                        placeholder="Enter company description..."
                        className="rounded-none min-h-[80px] text-xs resize-none"
                      />
                    </div>

                    {/* Website Selector */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Website
                      </label>
                      <Select value={website} onValueChange={setWebsite}>
                        <SelectTrigger className="rounded-none h-10 text-xs">
                          <SelectValue placeholder="Select website" />
                        </SelectTrigger>
                        <SelectContent className="rounded-none">
                          {WEBSITE_OPTIONS.map((site) => (
                            <SelectItem
                              key={site}
                              value={site}
                              className="text-xs"
                            >
                              {site}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Main Image */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Main Logo / Image
                      </label>
                      <div
                        {...mainImageDropzone.getRootProps()}
                        className={cn(
                          "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors min-h-[120px]",
                          mainImageDropzone.isDragActive &&
                            "border-primary bg-primary/5",
                        )}
                      >
                        <input {...mainImageDropzone.getInputProps()} />
                        {mainImagePrev ? (
                          <div className="relative w-full aspect-video border bg-muted overflow-hidden">
                            <img
                              src={mainImagePrev}
                              className="h-full w-full object-cover"
                              alt="Main preview"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6 rounded-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMainImagePrev(null);
                                setMainImage(null);
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
                              Drop Logo Here
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Services */}
                    <div className="space-y-1.5 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Services
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addService}
                          className="h-6 rounded-none text-[9px] uppercase font-bold"
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {services.map((service, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <Input
                              value={service}
                              onChange={(e) =>
                                updateService(idx, e.target.value)
                              }
                              placeholder={`Service ${idx + 1}`}
                              className="rounded-none h-8 text-xs flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeService(idx)}
                              className="h-8 w-8 rounded-none"
                            >
                              <X size={12} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Key Features */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Key Features
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addKeyFeature}
                          className="h-6 rounded-none text-[9px] uppercase font-bold"
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {keyFeatures.map((feature, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <Input
                              value={feature}
                              onChange={(e) =>
                                updateKeyFeature(idx, e.target.value)
                              }
                              placeholder={`Feature ${idx + 1}`}
                              className="rounded-none h-8 text-xs flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeKeyFeature(idx)}
                              className="h-8 w-8 rounded-none"
                            >
                              <X size={12} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Partner Images */}
                    <div className="space-y-1.5 pt-4 border-t">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Partner Logos / Images
                      </label>
                      <div
                        {...partnerImagesDropzone.getRootProps()}
                        className={cn(
                          "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors min-h-[100px]",
                          partnerImagesDropzone.isDragActive &&
                            "border-primary bg-primary/5",
                        )}
                      >
                        <input {...partnerImagesDropzone.getInputProps()} />
                        <div className="flex flex-col items-center gap-2">
                          <ImageIcon
                            size={20}
                            className="text-muted-foreground opacity-40"
                          />
                          <p className="text-[10px] font-bold uppercase tracking-tight">
                            Drop Multiple Images
                          </p>
                          <p className="text-[9px] text-muted-foreground">
                            {partnersImagePrev.length} image
                            {partnersImagePrev.length !== 1 ? "s" : ""} added
                          </p>
                        </div>
                      </div>

                      {/* Image Grid Preview */}
                      {partnersImagePrev.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          {partnersImagePrev.map((preview, idx) => (
                            <div
                              key={idx}
                              className="group relative aspect-square rounded-none overflow-hidden bg-muted border"
                            >
                              <img
                                src={preview}
                                alt={`Partner ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => removePartnerImage(idx)}
                                  className="h-6 w-6 rounded-none"
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
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
                        "Save Company"
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
                ) : companies.length === 0 ? (
                  /* ── EMPTY STATE ── */
                  <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mb-4 shadow-sm">
                      <FolderPlus className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                      No Companies
                    </h3>
                    <p className="text-[11px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
                      Your database is currently empty. Define a new company
                      using the panel on the left to begin.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {companies.map((company) => (
                      <Card
                        key={company.id}
                        className="rounded-none shadow-none group relative overflow-hidden border-foreground/10"
                      >
                        <div className="aspect-[4/3] relative bg-muted border-b overflow-hidden">
                          <img
                            src={company.mainImage || "/placeholder.png"}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            alt={company.companyName}
                          />
                          <div className="absolute top-2 right-2 flex gap-1">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-7 w-7 rounded-none shadow-sm"
                              onClick={() => handleEditClick(company)}
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
                                    Delete "{company.companyName}"? This cannot
                                    be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-none text-xs">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-none bg-destructive text-xs"
                                    onClick={() =>
                                      deleteDoc(doc(db, "company", company.id))
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
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-[11px] font-black uppercase truncate">
                              {company.companyName}
                            </h3>
                            <Badge
                              variant="outline"
                              className="rounded-none text-[7px] px-1 h-4 uppercase shrink-0"
                            >
                              {company.website.split(" ")[0]}
                            </Badge>
                          </div>

                          {company.description && (
                            <p className="text-[9px] text-muted-foreground uppercase line-clamp-2 italic">
                              {company.description}
                            </p>
                          )}

                          <div className="flex gap-1 flex-wrap pt-1">
                            {(company.services || [])
                              .slice(0, 2)
                              .map((service, idx) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="rounded-none text-[7px] px-1.5 h-4 uppercase"
                                >
                                  {service}
                                </Badge>
                              ))}
                            {(company.services || []).length > 2 && (
                              <Badge
                                variant="secondary"
                                className="rounded-none text-[7px] px-1.5 h-4 uppercase"
                              >
                                +{(company.services || []).length - 2}
                              </Badge>
                            )}
                          </div>

                          {company.partnersImage &&
                            company.partnersImage.length > 0 && (
                              <div className="text-[9px] text-muted-foreground uppercase pt-1">
                                {company.partnersImage.length} Partner Image
                                {company.partnersImage.length !== 1 ? "s" : ""}
                              </div>
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
