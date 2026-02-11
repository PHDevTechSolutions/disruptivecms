"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
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
  Briefcase,
  Globe,
  Check,
  UploadCloud,
  Eye,
} from "lucide-react";

// Sidebar & Layout Components
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

// UI Components
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
import { cn } from "@/lib/utils";

const WEBSITE_OPTIONS = [
  "Disruptive Solutions Inc.",
  "Ecoshift Corporation",
  "Value Acquisitions Holdings",
];

export default function ApplicationsPage() {
  const CLOUDINARY_UPLOAD_PRESET = "taskflow_preset";
  const CLOUDINARY_CLOUD_NAME = "dvmpn8mjh";

  // --- STATE ---
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Form States
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedWebsites, setSelectedWebsites] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  // --- 1. DATA FETCHING ---
  useEffect(() => {
    const q = query(
      collection(db, "applications"),
      orderBy("createdAt", "asc"),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setApplications(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- 2. DROPZONE LOGIC ---
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        if (previewUrl && previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(previewUrl);
        }
        setImageFile(file);
        setPreviewUrl(URL.createObjectURL(file));
      }
    },
    [previewUrl],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpeg", ".jpg", ".png", ".webp"] },
    multiple: false,
  });

  // --- 3. HELPERS ---

  // FIX: Added the missing toggleWebsite function logic
  const toggleWebsite = (website: string) => {
    setSelectedWebsites((prev) =>
      prev.includes(website)
        ? prev.filter((w) => w !== website)
        : [...prev, website],
    );
  };

  const uploadToCloudinary = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData },
    );
    const data = await res.json();
    return data.secure_url;
  };

  const resetForm = () => {
    setEditId(null);
    setTitle("");
    setDescription("");
    setSelectedWebsites([]);
    setImageFile(null);
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
  };

  const handleEditClick = (app: any) => {
    setEditId(app.id);
    setTitle(app.title);
    setDescription(app.description);
    setSelectedWebsites(app.websites || []);
    setPreviewUrl(app.imageUrl);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return toast.error("Please enter a title");
    if (selectedWebsites.length === 0)
      return toast.error("Select at least one website");

    setIsSubmitLoading(true);
    const loadingToast = toast.loading(editId ? "Updating..." : "Creating...");

    try {
      let finalImageUrl = previewUrl;
      if (imageFile) {
        finalImageUrl = await uploadToCloudinary(imageFile);
      }

      const applicationData = {
        title: title.toUpperCase(),
        description,
        websites: selectedWebsites,
        imageUrl: finalImageUrl,
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await updateDoc(doc(db, "applications", editId), applicationData);
        toast.success("Updated!", { id: loadingToast });
      } else {
        await addDoc(collection(db, "applications"), {
          ...applicationData,
          isActive: true,
          createdAt: serverTimestamp(),
        });
        toast.success("Created!", { id: loadingToast });
      }
      resetForm();
    } catch (error) {
      toast.error("Process failed", { id: loadingToast });
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const toggleVisibility = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "applications", id), {
        isActive: !currentStatus,
      });
      toast.success(!currentStatus ? "Visible" : "Hidden");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    const deleteToast = toast.loading("Deleting...");
    try {
      await deleteDoc(doc(db, "applications", id));
      toast.success("Deleted", { id: deleteToast });
    } catch (error) {
      toast.error("Failed to delete", { id: deleteToast });
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
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">Build Application</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Sector Maintenance</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-8 p-6 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Applications
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage and maintain application sectors for product categorization.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* --- FORM COLUMN --- */}
              <div className="lg:col-span-4">
                <Card className="sticky top-6 border-muted">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-black uppercase tracking-widest text-primary">
                        {editId ? "✏️ Edit Sector" : "🏗️ New Sector"}
                      </CardTitle>
                      {editId && (
                        <Button
                          onClick={resetForm}
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[9px] font-black uppercase"
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">
                          Sector Title
                        </label>
                        <Input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g. INDUSTRIAL"
                          className="font-bold h-11"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">
                          Description
                        </label>
                        <Textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Details..."
                          className="min-h-[80px] text-xs"
                        />
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1 flex items-center gap-2">
                          <Globe size={12} /> Assign to Website
                        </label>
                        <div className="space-y-2">
                          {WEBSITE_OPTIONS.map((site) => {
                            const active = selectedWebsites.includes(site);
                            return (
                              <div
                                key={site}
                                onClick={() => toggleWebsite(site)}
                                className={cn(
                                  "flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all",
                                  active
                                    ? "border-primary bg-primary/5"
                                    : "border-muted bg-transparent hover:border-muted-foreground/30",
                                )}
                              >
                                <span
                                  className={cn(
                                    "text-[9px] font-black uppercase italic",
                                    active
                                      ? "text-primary"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {site}
                                </span>
                                {active && (
                                  <Check
                                    size={14}
                                    className="text-primary"
                                    strokeWidth={4}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">
                          Sector Image
                        </label>
                        <div
                          {...getRootProps()}
                          className={cn(
                            "relative w-full h-40 bg-muted/20 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer flex flex-col items-center justify-center overflow-hidden",
                            isDragActive
                              ? "border-primary bg-primary/10 scale-[0.99]"
                              : "border-input hover:border-muted-foreground/50",
                          )}
                        >
                          <input {...getInputProps()} />
                          {previewUrl ? (
                            <div className="relative w-full h-full group">
                              <img
                                src={previewUrl}
                                className="w-full h-full object-cover"
                                alt="Preview"
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <p className="text-[8px] font-black uppercase text-white bg-primary px-3 py-1.5 rounded-full">
                                  Replace Image
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <UploadCloud
                                size={24}
                                className={cn(
                                  isDragActive && "text-primary animate-bounce",
                                )}
                              />
                              <div className="text-center">
                                <p className="text-[9px] font-black uppercase">
                                  Drag & Drop Image
                                </p>
                                <p className="text-[7px] font-bold opacity-60 uppercase">
                                  or click to browse
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <Button
                        type="submit"
                        disabled={isSubmitLoading}
                        className="w-full font-black uppercase text-[10px] h-12 shadow-md"
                      >
                        {isSubmitLoading ? (
                          <Loader2 className="animate-spin" />
                        ) : editId ? (
                          "Update Sector"
                        ) : (
                          "Save Sector"
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>

              {/* --- LIST COLUMN --- */}
              <div className="lg:col-span-8">
                {loading ? (
                  <div className="h-64 flex items-center justify-center">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {applications.length === 0 && (
                      <div className="text-center py-20 border-2 border-dashed border-muted rounded-2xl">
                        <p className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">
                          No Sectors Found
                        </p>
                      </div>
                    )}
                    {applications.map((app) => (
                      <Card
                        key={app.id}
                        className={cn(
                          "transition-all duration-300 hover:shadow-md",
                          app.isActive === false && "opacity-60 grayscale",
                        )}
                      >
                        <div className="flex flex-col md:flex-row items-center p-4 gap-6">
                          <div className="w-full md:w-32 h-24 bg-muted rounded-lg overflow-hidden shrink-0">
                            <img
                              src={
                                app.imageUrl ||
                                "https://via.placeholder.com/400x300"
                              }
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          </div>
                          <div className="flex-1 space-y-2 text-center md:text-left">
                            <div className="flex items-center justify-center md:justify-start gap-2">
                              <h3 className="font-black text-xs uppercase tracking-tight">
                                {app.title}
                              </h3>
                              <Badge
                                variant={
                                  app.isActive !== false
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-[7px] font-black uppercase px-1.5"
                              >
                                {app.isActive !== false ? "Active" : "Hidden"}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap justify-center md:justify-start gap-1">
                              {app.websites?.map((site: string) => (
                                <Badge
                                  key={site}
                                  variant="outline"
                                  className="text-[7px] font-bold uppercase py-0 text-muted-foreground border-muted-foreground/20"
                                >
                                  {site}
                                </Badge>
                              ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase line-clamp-1 italic">
                              {app.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => handleEditClick(app)}
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 border-muted hover:bg-muted"
                            >
                              <Pencil size={14} />
                            </Button>
                            <Button
                              onClick={() =>
                                toggleVisibility(app.id, app.isActive)
                              }
                              variant="outline"
                              size="icon"
                              className={cn(
                                "h-9 w-9 border-muted",
                                app.isActive !== false
                                  ? "text-blue-500"
                                  : "text-muted-foreground",
                              )}
                            >
                              <Eye size={14} />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 border-muted text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="font-black uppercase italic tracking-tighter">
                                    Delete Sector?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-xs uppercase font-bold tracking-widest">
                                    This action is permanent.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="text-[10px] font-black uppercase">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(app.id)}
                                    className="bg-destructive text-[10px] font-black uppercase"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
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
