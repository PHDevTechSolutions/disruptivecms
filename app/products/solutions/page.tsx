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
  X,
  RotateCcw,
  Layers,
  Globe,
  Settings2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/logger";
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

const WEBSITE_OPTIONS = [
  "Disruptive Solutions Inc",
  "Ecoshift Corporation",
  "Value Acquisitions Holdings",
];
const LABEL_OPTIONS = ["build", "protect", "finish", "repair"];

export default function SolutionsManager() {
  const CLOUDINARY_UPLOAD_PRESET = "taskflow_preset";
  const CLOUDINARY_CLOUD_NAME = "dvmpn8mjh";

  const [solutions, setSolutions] = useState<any[]>([]);
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [openSeries, setOpenSeries] = useState(false);

  // Form States
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [label, setLabel] = useState("");
  const [selectedWebsites, setSelectedWebsites] = useState<string[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  // SEO States (Manual Overrides)
  const [slug, setSlug] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");

  useEffect(() => {
    const q = query(collection(db, "solutions"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      setSolutions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, "series"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      setSeriesList(
        snapshot.docs.map((doc) => ({ id: doc.id, name: doc.data().name })),
      );
    });
  }, []);

  // Auto-generate SEO values unless editing an existing record
  useEffect(() => {
    if (!editId && title) {
      const generatedSlug = title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setSlug(generatedSlug);
      setMetaTitle(`${title.toUpperCase()} | ${label.toUpperCase()} SOLUTIONS`);
      setMetaDescription(
        description || `Professional ${label} solutions for ${title}.`,
      );
    }
  }, [title, label, description, editId]);

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
    setLabel("");
    setSelectedWebsites([]);
    setSelectedSeries([]);
    setPreviewUrl("");
    setImageFile(null);
    setSlug("");
    setMetaTitle("");
    setMetaDescription("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !label || selectedWebsites.length === 0)
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
        label,
        websites: selectedWebsites,
        series: selectedSeries,
        mainImage: finalImageUrl,
        slug: slug || title.toLowerCase().replace(/\s+/g, "-"),
        metaTitle,
        metaDescription,
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await updateDoc(doc(db, "solutions", editId), payload);
        await logAuditEvent({
          action: "update",
          entityType: "solution",
          entityId: editId,
          entityName: title,
          context: {
            page: "/products/solutions",
            source: "solutions:edit",
            collection: "solutions",
          },
        });
        toast.success("Solution & SEO Updated");
      } else {
        const docRef = await addDoc(collection(db, "solutions"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await logAuditEvent({
          action: "create",
          entityType: "solution",
          entityId: docRef.id,
          entityName: title,
          context: {
            page: "/products/solutions",
            source: "solutions:create",
            collection: "solutions",
          },
        });
        toast.success("Solution & SEO Saved");
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
                  <BreadcrumbPage>Solutions</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-black uppercase italic tracking-tighter">
                Solutions <span className="text-primary">Maintenance</span>
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Manage service categories and search visibility.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* ── FORM SECTION (sticky) ── */}
              <div className="lg:col-span-4 sticky top-6 z-10">
                <div className="space-y-6 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
                  {/* Core Content card */}
                  <Card className="rounded-none shadow-none border-foreground/10">
                    <CardHeader className="border-b py-4 flex flex-row items-center justify-between space-y-0 bg-muted/30 sticky top-0 z-10">
                      <CardTitle className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                        <Settings2 className="h-3 w-3" /> Core Content
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
                          Solution Title
                        </label>
                        <Input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="E.G. CONCRETE PROTECTION"
                          className="rounded-none h-10 text-xs font-bold uppercase"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Label
                        </label>
                        <div className="grid grid-cols-2 gap-1">
                          {LABEL_OPTIONS.map((opt) => (
                            <Button
                              key={opt}
                              type="button"
                              variant={label === opt ? "default" : "outline"}
                              className="rounded-none h-8 text-[9px] uppercase font-bold"
                              onClick={() =>
                                setLabel((prev) => (prev === opt ? "" : opt))
                              }
                            >
                              {opt}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Series selector — unchanged */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Connect Series
                        </label>
                        <Popover open={openSeries} onOpenChange={setOpenSeries}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-between rounded-none h-10 text-[10px] font-bold uppercase"
                            >
                              {selectedSeries.length > 0
                                ? `${selectedSeries.length} Series Attached`
                                : "Select Series..."}
                              <Layers className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none"
                            align="start"
                          >
                            <Command>
                              <CommandInput
                                placeholder="Search series name..."
                                className="h-9 text-xs"
                              />
                              <CommandList>
                                <CommandEmpty>No series found.</CommandEmpty>
                                <CommandGroup>
                                  {seriesList.map((ser) => (
                                    <CommandItem
                                      key={ser.id}
                                      onSelect={() =>
                                        setSelectedSeries((prev) =>
                                          prev.includes(ser.id)
                                            ? prev.filter((id) => id !== ser.id)
                                            : [...prev, ser.id],
                                        )
                                      }
                                      className="text-[10px] uppercase font-bold"
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-3 w-3",
                                          selectedSeries.includes(ser.id)
                                            ? "opacity-100"
                                            : "opacity-0",
                                        )}
                                      />
                                      {ser.name}
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
                          Website Scope
                        </label>
                        <div className="grid grid-cols-1 gap-1">
                          {WEBSITE_OPTIONS.map((site) => (
                            <Button
                              key={site}
                              type="button"
                              variant={
                                selectedWebsites.includes(site)
                                  ? "default"
                                  : "outline"
                              }
                              className="rounded-none h-8 text-[9px] uppercase font-bold px-2 justify-start"
                              onClick={() =>
                                setSelectedWebsites((prev) =>
                                  prev.includes(site)
                                    ? prev.filter((s) => s !== site)
                                    : [...prev, site],
                                )
                              }
                            >
                              <Globe className="mr-2 h-3 w-3" /> {site}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Cover Image
                        </label>
                        <div
                          {...getRootProps()}
                          className={cn(
                            "flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent min-h-[120px]",
                            isDragActive && "border-primary",
                          )}
                        >
                          <input {...getInputProps()} />
                          {previewUrl ? (
                            <div className="relative w-full aspect-video border bg-muted overflow-hidden">
                              <img
                                src={previewUrl}
                                className="h-full w-full object-cover"
                                alt="Preview"
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
                                size={24}
                                className="text-muted-foreground opacity-30"
                              />
                              <p className="text-[9px] font-black uppercase text-muted-foreground">
                                Upload Visual
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* SEO Panel */}
                  <Card className="rounded-none shadow-none border-primary/20 bg-primary/[0.02]">
                    <CardHeader className="border-b py-3 bg-primary/5">
                      <CardTitle className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 text-primary">
                        <Globe className="h-3 w-3" /> SEO & Metadata
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase">
                          URL Slug
                        </label>
                        <Input
                          value={slug}
                          onChange={(e) => setSlug(e.target.value)}
                          className="h-8 rounded-none text-xs bg-background"
                          placeholder="auto-generated-slug"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase">
                          Meta Title
                        </label>
                        <Input
                          value={metaTitle}
                          onChange={(e) => setMetaTitle(e.target.value)}
                          className="h-8 rounded-none text-xs bg-background"
                          placeholder="Search result title"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase">
                          Meta Description
                        </label>
                        <Textarea
                          value={metaDescription}
                          onChange={(e) => setMetaDescription(e.target.value)}
                          className="min-h-[60px] rounded-none text-xs bg-background resize-none"
                          placeholder="Search result snippet..."
                        />
                      </div>

                      {/* Google Preview */}
                      <div className="p-3 bg-white border rounded-sm space-y-1 shadow-sm overflow-hidden">
                        <p className="text-[10px] text-[#202124] truncate">
                          https://yourdomain.com/solutions/
                          <b>{slug || "..."}</b>
                        </p>
                        <p className="text-[14px] text-[#1a0dab] font-medium leading-tight truncate hover:underline cursor-pointer">
                          {metaTitle || "Solution Title"}
                        </p>
                        <p className="text-[12px] text-[#4d5156] line-clamp-2 leading-snug">
                          {metaDescription || "No description provided."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitLoading}
                    className="w-full rounded-none uppercase font-black text-[11px] h-12 tracking-widest shadow-xl"
                  >
                    {isSubmitLoading ? (
                      <Loader2 className="animate-spin h-4 w-4" />
                    ) : editId ? (
                      "Update Solution"
                    ) : (
                      "Save Solution"
                    )}
                  </Button>
                </div>
              </div>

              {/* ── LIST VIEW (RIGHT) ── */}
              <div className="lg:col-span-8">
                {loading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {solutions.map((sol) => (
                      <Card
                        key={sol.id}
                        className="rounded-none shadow-none group relative overflow-hidden border-foreground/10"
                      >
                        <div className="aspect-[4/3] relative bg-muted border-b overflow-hidden">
                          <img
                            src={sol.mainImage || "/placeholder.png"}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                            alt={sol.title}
                          />
                          <div className="absolute top-2 right-2 flex gap-1 translate-y-[-10px] opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-7 w-7 rounded-none border"
                              onClick={() => {
                                setEditId(sol.id);
                                setTitle(sol.title);
                                setLabel(sol.label);
                                setDescription(sol.description || "");
                                setSelectedWebsites(sol.websites || []);
                                setSelectedSeries(sol.series || []);
                                setPreviewUrl(sol.mainImage);
                                setSlug(sol.slug || "");
                                setMetaTitle(sol.metaTitle || "");
                                setMetaDescription(sol.metaDescription || "");
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
                                  className="h-7 w-7 rounded-none"
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-none">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-sm font-black uppercase italic tracking-tight">
                                    Delete Solution
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-[11px] font-bold uppercase text-muted-foreground">
                                    Permanent removal of "{sol.title}". This
                                    will break existing SEO links.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-none text-[10px] font-black uppercase">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-none bg-destructive text-[10px] font-black uppercase"
                                    onClick={() =>
                                      deleteDoc(doc(db, "solutions", sol.id)).then(
                                        () =>
                                          logAuditEvent({
                                            action: "delete",
                                            entityType: "solution",
                                            entityId: sol.id,
                                            entityName: sol.title,
                                            context: {
                                              page: "/products/solutions",
                                              source: "solutions:delete",
                                              collection: "solutions",
                                            },
                                          }),
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
                        <div className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-[12px] font-black uppercase italic leading-tight">
                              {sol.title}
                            </h3>
                            <Badge className="rounded-none text-[7px] px-1.5 h-4 uppercase font-black bg-primary">
                              {sol.label}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-2 gap-y-1 border-t pt-2 mt-2">
                            {sol.series?.length > 0 && (
                              <span className="text-[8px] font-bold text-muted-foreground uppercase">
                                {sol.series.length} Series
                              </span>
                            )}
                            {sol.websites?.map((w: string) => (
                              <span
                                key={w}
                                className="text-[8px] font-black text-primary uppercase opacity-60"
                              >
                                #{w.split(" ")[0]}
                              </span>
                            ))}
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
