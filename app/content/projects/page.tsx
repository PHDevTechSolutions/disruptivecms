"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
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
  Image as ImageIcon,
  Zap,
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

type Project = {
  id: string;
  title: string;
  description: string;
  category: string;
  website: string;
  imageUrl?: string;
  logoUrl?: string;
  createdAt?: any;
};

const CATEGORY_OPTIONS = [
  "Industrial",
  "Commercial",
  "Architecture",
  "Technology",
];

const WEBSITE_OPTIONS = [
  "Disruptive Solutions Inc",
  "Ecoshift Corporation",
  "Value Acquisitions Holdings",
];

export default function ProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Form States
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Industrial");
  const [website, setWebsite] = useState("Disruptive Solutions Inc");

  // Image States
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePrev, setImagePrev] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPrev, setLogoPrev] = useState<string | null>(null);

  // --- Real-time Data Sync ---
  useEffect(() => {
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProjects(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Project),
      );
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Background Image Dropzone
  const backgroundDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      setImageFile(file);
      setImagePrev(URL.createObjectURL(file));
    },
  });

  // Logo Dropzone
  const logoDropzone = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      setLogoFile(file);
      setLogoPrev(URL.createObjectURL(file));
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title) {
      return toast.error("Project name is required");
    }
    if (!imagePrev && !imageFile) {
      return toast.error("Background image is required");
    }

    setIsSubmitLoading(true);
    try {
      let finalImageUrl = imagePrev;
      if (imageFile) {
        finalImageUrl = await uploadToCloudinary(imageFile);
      }

      let finalLogoUrl = logoPrev;
      if (logoFile) {
        finalLogoUrl = await uploadToCloudinary(logoFile);
      }

      const projectData = {
        title,
        description,
        category,
        website,
        imageUrl: finalImageUrl,
        logoUrl: finalLogoUrl,
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await updateDoc(doc(db, "projects", editId), projectData);
        toast.success("Project updated successfully");
      } else {
        await addDoc(collection(db, "projects"), {
          ...projectData,
          createdAt: serverTimestamp(),
        });
        toast.success("Project created");
      }

      resetForm();
    } catch (err) {
      console.error(err);
      toast.error("Error saving project");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const resetForm = () => {
    setEditId(null);
    setTitle("");
    setDescription("");
    setCategory("Industrial");
    setWebsite("Disruptive Solutions Inc");
    setImageFile(null);
    setImagePrev(null);
    setLogoFile(null);
    setLogoPrev(null);
  };

  const handleEditClick = (project: Project) => {
    setEditId(project.id);
    setTitle(project.title);
    setDescription(project.description);
    setCategory(project.category || "Industrial");
    setWebsite(project.website || "Disruptive Solutions Inc");
    setImagePrev(project.imageUrl || null);
    setLogoPrev(project.logoUrl || null);
    setImageFile(null);
    setLogoFile(null);
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
                  <BreadcrumbPage>Project Manager</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Project Manager
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage showcase projects and portfolio entries.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* ── FORM ── */}
              <div className="lg:col-span-4 sticky top-6 z-10">
                <Card className="rounded-none shadow-none border-foreground/10 max-h-[calc(100vh-6rem)] overflow-y-auto">
                  <CardHeader className="border-b py-4 flex flex-row items-center justify-between space-y-0 sticky top-0 bg-background z-10">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest">
                      {editId ? "Update Project" : "Add New Project"}
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
                    {/* Project Name */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Project Name
                      </label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="E.G. NEXT-GEN LOGISTICS HUB"
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
                        placeholder="Brief details about the project..."
                        className="rounded-none min-h-[80px] text-xs resize-none"
                      />
                    </div>

                    {/* Category Selector */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Category
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

                    {/* Background Cover Image */}
                    <div className="space-y-1.5 pt-4 border-t">
                      <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                        <ImageIcon size={11} /> Background Cover
                      </label>
                      <div
                        {...backgroundDropzone.getRootProps()}
                        className={cn(
                          "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors min-h-[120px]",
                          backgroundDropzone.isDragActive &&
                            "border-primary bg-primary/5",
                        )}
                      >
                        <input {...backgroundDropzone.getInputProps()} />
                        {imagePrev ? (
                          <div className="relative w-full aspect-video border bg-muted overflow-hidden">
                            <img
                              src={imagePrev}
                              className="h-full w-full object-cover"
                              alt="Background preview"
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
                          <div className="flex flex-col items-center gap-2">
                            <ImageIcon
                              size={20}
                              className="text-muted-foreground opacity-40"
                            />
                            <p className="text-[10px] font-bold uppercase tracking-tight">
                              Drop Background Here
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Client Logo (Hover State) */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                        <Zap size={11} /> Client Logo{" "}
                        <span className="font-normal normal-case opacity-50">
                          (optional · hover state)
                        </span>
                      </label>
                      <div
                        {...logoDropzone.getRootProps()}
                        className={cn(
                          "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors min-h-[100px]",
                          logoDropzone.isDragActive &&
                            "border-primary bg-primary/5",
                        )}
                      >
                        <input {...logoDropzone.getInputProps()} />
                        {logoPrev ? (
                          <div className="relative w-full flex items-center justify-center bg-muted border p-4 overflow-hidden">
                            <img
                              src={logoPrev}
                              className="h-20 w-auto object-contain"
                              alt="Logo preview"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6 rounded-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLogoPrev(null);
                                setLogoFile(null);
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
                              Drop PNG Logo
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
                        "Save Project"
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
                ) : projects.length === 0 ? (
                  /* ── EMPTY STATE ── */
                  <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mb-4 shadow-sm">
                      <FolderPlus className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                      No Projects
                    </h3>
                    <p className="text-[11px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
                      Your portfolio is currently empty. Add a new project using
                      the panel on the left to begin.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {projects.map((project) => (
                      <Card
                        key={project.id}
                        className="rounded-none shadow-none group relative overflow-hidden border-foreground/10"
                      >
                        <div className="aspect-[4/3] relative bg-muted border-b overflow-hidden">
                          <img
                            src={project.imageUrl || "/placeholder.png"}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            alt={project.title}
                          />
                          {/* Logo overlay on hover */}
                          {project.logoUrl && (
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                              <img
                                src={project.logoUrl}
                                className="w-24 h-24 object-contain"
                                alt={`${project.title} logo`}
                              />
                            </div>
                          )}
                          <div className="absolute top-2 right-2 flex gap-1">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-7 w-7 rounded-none shadow-sm"
                              onClick={() => handleEditClick(project)}
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
                                    Delete "{project.title}"? This cannot be
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
                                      deleteDoc(doc(db, "projects", project.id))
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
                              {project.title}
                            </h3>
                            <Badge
                              variant="outline"
                              className="rounded-none text-[7px] px-1 h-4 uppercase shrink-0"
                            >
                              {project.website?.split(" ")[0] ?? "—"}
                            </Badge>
                          </div>

                          {project.description && (
                            <p className="text-[9px] text-muted-foreground uppercase line-clamp-2 italic">
                              {project.description}
                            </p>
                          )}

                          <div className="flex gap-1 flex-wrap pt-1">
                            <Badge
                              variant="secondary"
                              className="rounded-none text-[7px] px-1.5 h-4 uppercase"
                            >
                              {project.category}
                            </Badge>
                            {project.logoUrl && (
                              <Badge
                                variant="secondary"
                                className="rounded-none text-[7px] px-1.5 h-4 uppercase"
                              >
                                Logo Active
                              </Badge>
                            )}
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
