"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  RotateCcw,
  Loader2,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Upload,
  Eye,
  EyeOff,
  MousePointer2,
  ImageIcon,
  Megaphone,
  Link as LinkIcon,
  Globe,
  Pencil,
  Trash2,
  PlusCircle,
} from "lucide-react";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const WEBSITE_OPTIONS = [
  "Ecoshift Corporation",
  "Disruptive Solutions Inc",
  "Value Acquisitions Holdings",
];

type Alignment = "left" | "center" | "right";

type PopupDoc = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  alignment: Alignment;
  isActive: boolean;
  link: string;
  websites: string[];
  createdAt?: any;
  updatedAt?: any;
};

// ── COMPONENT ────────────────────────────────────────────────────────────────

export default function HomePopupManager() {
  const [popups, setPopups] = useState<PopupDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [link, setLink] = useState("/products");
  const [alignment, setAlignment] = useState<Alignment>("center");
  const [isActive, setIsActive] = useState(false);
  const [selectedWebs, setSelectedWebs] = useState<string[]>([]);

  // Image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePrev, setImagePrev] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // ── Real-time sync ───────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "home_popups"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setPopups(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PopupDoc));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Dropzone ─────────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    setImageFile(file);
    setImagePrev(URL.createObjectURL(file));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop,
  });

  // ── Toggle website selection ─────────────────────────────────────────────
  const toggleWeb = (web: string) =>
    setSelectedWebs((prev) =>
      prev.includes(web) ? prev.filter((w) => w !== web) : [...prev, web],
    );

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return toast.error("Headline is required.");
    if (selectedWebs.length === 0)
      return toast.error("Select at least one website.");

    setIsSubmitLoading(true);
    try {
      let finalImageUrl = existingImageUrl || "";
      if (imageFile) {
        setUploading(true);
        finalImageUrl = (await uploadToCloudinary(imageFile)) ?? "";
        setUploading(false);
      }

      const data = {
        title,
        subtitle,
        imageUrl: finalImageUrl,
        alignment,
        isActive,
        link,
        websites: selectedWebs,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "home_popups", editingId), data);
        toast.success("Popup updated successfully.");
      } else {
        await addDoc(collection(db, "home_popups"), {
          ...data,
          createdAt: serverTimestamp(),
        });
        toast.success("Popup created successfully.");
      }

      resetForm();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save popup.");
    } finally {
      setIsSubmitLoading(false);
      setUploading(false);
    }
  };

  // ── Reset ────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setSubtitle("");
    setLink("/products");
    setAlignment("center");
    setIsActive(false);
    setSelectedWebs([]);
    setImageFile(null);
    setImagePrev(null);
    setExistingImageUrl(null);
  };

  // ── Edit ─────────────────────────────────────────────────────────────────
  const handleEdit = (popup: PopupDoc) => {
    setEditingId(popup.id);
    setTitle(popup.title);
    setSubtitle(popup.subtitle);
    setLink(popup.link || "/products");
    setAlignment(popup.alignment || "center");
    setIsActive(popup.isActive ?? false);
    setSelectedWebs(popup.websites || []);
    setExistingImageUrl(popup.imageUrl || null);
    setImagePrev(popup.imageUrl || null);
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Preview data (live) ───────────────────────────────────────────────────
  const previewImageSrc = imagePrev || existingImageUrl || null;

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* ── HEADER ── */}
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
                  <BreadcrumbPage>Home Popup Manager</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
            {/* Page title */}
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Home Popup Manager
              </h1>
              <p className="text-sm text-muted-foreground">
                Configure and publish promotional popups across your websites.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* ── FORM PANEL ── */}
              <div className="lg:col-span-4 sticky top-6 z-10">
                <Card className="rounded-none shadow-none border-foreground/10 max-h-[calc(100vh-6rem)] overflow-y-auto">
                  <CardHeader className="border-b py-4 flex flex-row items-center justify-between space-y-0 sticky top-0 bg-background z-10">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest">
                      {editingId ? "Edit Popup" : "New Popup"}
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
                    {/* ── WEBSITES ── */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                        <Globe size={11} /> Target Websites
                      </label>
                      <div className="space-y-2">
                        {WEBSITE_OPTIONS.map((web) => (
                          <div
                            key={web}
                            onClick={() => toggleWeb(web)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 border rounded-none cursor-pointer transition-colors",
                              selectedWebs.includes(web)
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-muted/50",
                            )}
                          >
                            <Checkbox
                              checked={selectedWebs.includes(web)}
                              onCheckedChange={() => toggleWeb(web)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span
                              className={cn(
                                "text-xs font-medium",
                                selectedWebs.includes(web)
                                  ? "text-primary"
                                  : "text-foreground",
                              )}
                            >
                              {web}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* ── VISIBILITY TOGGLE ── */}
                    <div className="flex items-center justify-between py-1">
                      <div>
                        <Label className="text-xs font-bold uppercase">
                          Active
                        </Label>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Show popup on homepage
                        </p>
                      </div>
                      <Switch
                        checked={isActive}
                        onCheckedChange={setIsActive}
                      />
                    </div>

                    <Separator />

                    {/* ── HEADLINE ── */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Headline
                      </label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="E.G. NEW ARRIVAL"
                        className="rounded-none h-10 text-xs uppercase"
                      />
                    </div>

                    {/* ── SUBTITLE ── */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Sub-description
                      </label>
                      <Input
                        value={subtitle}
                        onChange={(e) => setSubtitle(e.target.value)}
                        placeholder="SHORT PROMO TEXT..."
                        className="rounded-none h-10 text-xs"
                      />
                    </div>

                    {/* ── LINK ── */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                        <LinkIcon size={10} /> CTA Link
                      </label>
                      <Input
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="/products"
                        className="rounded-none h-10 text-xs font-mono"
                      />
                    </div>

                    {/* ── ALIGNMENT ── */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Content Alignment
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["left", "center", "right"] as Alignment[]).map(
                          (pos) => (
                            <button
                              key={pos}
                              type="button"
                              onClick={() => setAlignment(pos)}
                              className={cn(
                                "h-10 flex items-center justify-center border rounded-none transition-all text-xs font-medium uppercase",
                                alignment === pos
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border hover:bg-muted/50 text-muted-foreground",
                              )}
                            >
                              {pos === "left" && <AlignLeft size={15} />}
                              {pos === "center" && <AlignCenter size={15} />}
                              {pos === "right" && <AlignRight size={15} />}
                            </button>
                          ),
                        )}
                      </div>
                    </div>

                    {/* ── IMAGE UPLOAD ── */}
                    <div className="space-y-1.5 pt-2 border-t">
                      <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                        <ImageIcon size={11} /> Popup Image
                      </label>
                      <div
                        {...getRootProps()}
                        className={cn(
                          "flex flex-col items-center justify-center border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors min-h-[130px] overflow-hidden",
                          isDragActive && "border-primary bg-primary/5",
                        )}
                      >
                        <input {...getInputProps()} />
                        {imagePrev ? (
                          <div className="relative w-full aspect-video bg-muted overflow-hidden">
                            <img
                              src={imagePrev}
                              className="h-full w-full object-cover"
                              alt="Popup preview"
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
                                setExistingImageUrl(null);
                              }}
                            >
                              <X size={12} />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 p-6">
                            <Upload
                              size={20}
                              className="text-muted-foreground opacity-40"
                            />
                            <p className="text-[10px] font-bold uppercase tracking-tight">
                              {isDragActive
                                ? "Drop Image Here"
                                : "Drop or Click to Upload"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── LIVE PREVIEW ── */}
                    <div className="space-y-2 pt-2 border-t">
                      <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                        <Eye size={11} /> Live Preview
                      </label>

                      <div className="aspect-[4/5] bg-[#111] rounded-lg overflow-hidden relative flex items-center justify-center border border-border">
                        {/* Simulated background content */}
                        <div className="absolute inset-0 opacity-20 pointer-events-none p-4">
                          <div className="grid grid-cols-2 gap-2">
                            {[...Array(4)].map((_, i) => (
                              <div
                                key={i}
                                className="h-16 bg-gray-700 rounded-md"
                              />
                            ))}
                          </div>
                        </div>

                        <AnimatePresence mode="wait">
                          {isActive ? (
                            <motion.div
                              key="preview-on"
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              transition={{ duration: 0.2 }}
                              className="relative z-10 w-full max-w-[180px] bg-white rounded-2xl overflow-hidden shadow-2xl"
                            >
                              {/* Image area */}
                              <div className="aspect-square bg-gray-100 relative overflow-hidden">
                                {previewImageSrc ? (
                                  <img
                                    src={previewImageSrc}
                                    className="w-full h-full object-cover"
                                    alt="Popup preview"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl font-black italic">
                                    IMG
                                  </div>
                                )}
                                <div className="absolute top-2 right-2 w-5 h-5 bg-black/20 backdrop-blur-sm rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                                  ✕
                                </div>
                              </div>

                              {/* Content */}
                              <div
                                className={cn(
                                  "p-4",
                                  alignment === "left"
                                    ? "text-left"
                                    : alignment === "right"
                                      ? "text-right"
                                      : "text-center",
                                )}
                              >
                                <h4 className="font-black uppercase text-[10px] leading-tight tracking-tight mb-1">
                                  {title || "Headline Here"}
                                </h4>
                                <p className="text-[7px] font-bold text-gray-400 uppercase tracking-widest mb-3 leading-tight">
                                  {subtitle || "Sub-description goes here"}
                                </p>
                                <button className="w-full py-2 bg-black text-white rounded-lg text-[7px] font-black uppercase tracking-widest flex items-center justify-center gap-1">
                                  View <MousePointer2 size={7} />
                                </button>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="preview-off"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="relative z-10 px-5 py-3 border border-gray-700 rounded-full"
                            >
                              <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest whitespace-nowrap">
                                Popup Disabled
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* ── SUBMIT ── */}
                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitLoading || uploading}
                      className="w-full rounded-none uppercase font-bold text-[10px] h-11 tracking-widest"
                    >
                      {isSubmitLoading || uploading ? (
                        <Loader2 className="animate-spin h-4 w-4" />
                      ) : editingId ? (
                        "Push Update"
                      ) : (
                        "Publish Popup"
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
                ) : popups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mb-4 shadow-sm">
                      <Megaphone className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                      No Popups Yet
                    </h3>
                    <p className="text-[11px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
                      No popups configured. Use the form on the left to create
                      your first promotional popup.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {popups.map((popup) => (
                      <Card
                        key={popup.id}
                        className="rounded-none shadow-none group relative overflow-hidden border-foreground/10"
                      >
                        {/* Image */}
                        <div className="aspect-[4/3] relative bg-muted border-b overflow-hidden">
                          {popup.imageUrl ? (
                            <img
                              src={popup.imageUrl}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              alt={popup.title}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="h-10 w-10 text-muted-foreground/20" />
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="absolute top-2 right-2 flex gap-1">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-7 w-7 rounded-none shadow-sm"
                              onClick={() => handleEdit(popup)}
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
                                    Delete Popup
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-xs">
                                    Delete "{popup.title}"? This action cannot
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
                                      deleteDoc(
                                        doc(db, "home_popups", popup.id),
                                      )
                                    }
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>

                          {/* Status badge overlay */}
                          <div className="absolute bottom-2 left-2">
                            <Badge
                              variant={popup.isActive ? "default" : "secondary"}
                              className="rounded-none text-[7px] px-1.5 h-5 uppercase gap-1"
                            >
                              {popup.isActive ? (
                                <>
                                  <Eye size={8} /> Live
                                </>
                              ) : (
                                <>
                                  <EyeOff size={8} /> Draft
                                </>
                              )}
                            </Badge>
                          </div>
                        </div>

                        {/* Card body */}
                        <div className="p-3 space-y-2">
                          <h3 className="text-[11px] font-black uppercase truncate">
                            {popup.title || "Untitled Popup"}
                          </h3>

                          {popup.subtitle && (
                            <p className="text-[9px] text-muted-foreground uppercase line-clamp-1 italic">
                              {popup.subtitle}
                            </p>
                          )}

                          {/* Website tags */}
                          <div className="flex gap-1 flex-wrap pt-1">
                            {(popup.websites || []).map((web) => (
                              <Badge
                                key={web}
                                variant="outline"
                                className="rounded-none text-[7px] px-1.5 h-4 uppercase"
                              >
                                {web.split(" ")[0]}
                              </Badge>
                            ))}
                          </div>

                          {/* Alignment indicator */}
                          <div className="flex items-center gap-1.5 pt-1">
                            <span className="text-muted-foreground">
                              {popup.alignment === "left" && (
                                <AlignLeft size={10} />
                              )}
                              {popup.alignment === "center" && (
                                <AlignCenter size={10} />
                              )}
                              {popup.alignment === "right" && (
                                <AlignRight size={10} />
                              )}
                            </span>
                            <span className="text-[8px] text-muted-foreground uppercase font-medium">
                              {popup.alignment || "center"} aligned
                            </span>
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
