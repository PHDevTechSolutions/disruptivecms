"use client";

/**
 * app/products/product-families/page.tsx  (REFACTORED)
 *
 * Changes from original:
 *  - Added Application Assignment: users can assign product families to applications
 *  - Multiple application selections allowed (multi-select like spec group/item selection)
 *  - Updates products schema (applications field) when assignment changes
 *  - All existing spec group, spec item, product usage, image, and TDS logic preserved
 */

import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import {
  Check,
  ChevronDown,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  X,
  Globe,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

import { generateTdsTemplatePdf, uploadTdsPdf } from "@/lib/tdsGenerator";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRODUCT_USAGE_OPTIONS = ["INDOOR", "OUTDOOR", "SOLAR"] as const;
type ProductUsage = (typeof PRODUCT_USAGE_OPTIONS)[number];

// ─── Types ────────────────────────────────────────────────────────────────────

type SpecItemRef = { id: string; name: string };
type ProductFamilySpecs = { specGroupId: string; specItems: SpecItemRef[] };

type SpecGroupDoc = {
  id: string;
  name: string;
  items?: { label: string }[];
  isActive?: boolean;
};

type ApplicationDoc = {
  id: string;
  title?: string;
  name?: string;
  imageUrl?: string;
  websites?: string[];
};

type ProductFamilyDoc = {
  id: string;
  title?: string;
  description?: string;
  image?: string;
  imageUrl?: string;
  specs?: ProductFamilySpecs[];
  specifications?: string[];
  productUsage?: ProductUsage[];
  // NEW: assigned applications
  applications?: string[];
  isActive?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function buildSpecItemId(specGroupId: string, label: string) {
  return `${specGroupId}:${label.toUpperCase().trim()}`;
}

// ─── Usage pill button (unchanged from original) ──────────────────────────────

function UsagePill({
  label,
  active,
  onClick,
}: {
  label: ProductUsage;
  active: boolean;
  onClick: () => void;
}) {
  const colors: Record<ProductUsage, string> = {
    INDOOR:
      "border-blue-300 bg-blue-50 text-blue-700 data-[active=true]:bg-blue-600 data-[active=true]:text-white data-[active=true]:border-blue-600",
    OUTDOOR:
      "border-emerald-300 bg-emerald-50 text-emerald-700 data-[active=true]:bg-emerald-600 data-[active=true]:text-white data-[active=true]:border-emerald-600",
    SOLAR:
      "border-amber-300 bg-amber-50 text-amber-700 data-[active=true]:bg-amber-500 data-[active=true]:text-white data-[active=true]:border-amber-500",
  };
  return (
    <button
      type="button"
      data-active={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 border rounded-none px-2.5 py-1 text-[9px] font-black uppercase transition-colors",
        colors[label],
      )}
    >
      {active && <Check size={9} />}
      {label}
    </button>
  );
}

// ─── Application selector (NEW) ───────────────────────────────────────────────

function ApplicationSelector({
  applications,
  selectedApplicationIds,
  onToggle,
  open,
  onOpenChange,
}: {
  applications: ApplicationDoc[];
  selectedApplicationIds: string[];
  onToggle: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between rounded-none h-10 text-[10px] font-bold uppercase"
        >
          {selectedApplicationIds.length > 0
            ? `${selectedApplicationIds.length} APPLICATION${selectedApplicationIds.length !== 1 ? "S" : ""} SELECTED`
            : "SELECT APPLICATIONS…"}
          <Briefcase className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0 rounded-none"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="Search applications…"
            className="h-9 text-xs"
          />
          <CommandList>
            <CommandEmpty>No applications found.</CommandEmpty>
            <CommandGroup>
              {applications.map((app) => {
                const name = (app.title ?? app.name ?? "").toUpperCase();
                const isSelected = selectedApplicationIds.includes(app.id);
                return (
                  <CommandItem
                    key={app.id}
                    onSelect={() => onToggle(app.id)}
                    className="text-[10px] uppercase font-bold"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3 w-3",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductFamiliesPage() {
  const CLOUDINARY_UPLOAD_PRESET = "taskflow_preset";
  const CLOUDINARY_CLOUD_NAME = "dvmpn8mjh";

  const [families, setFamilies] = useState<ProductFamilyDoc[]>([]);
  const [specGroups, setSpecGroups] = useState<SpecGroupDoc[]>([]);
  const [applications, setApplications] = useState<ApplicationDoc[]>([]);
  const [loadingFamilies, setLoadingFamilies] = useState(true);

  // List search/filter/selection
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Form state
  const [editId, setEditId] = useState<string | null>(null);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [productUsage, setProductUsage] = useState<ProductUsage[]>([]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const [openSpecGroups, setOpenSpecGroups] = useState(false);
  const [selectedSpecGroupIds, setSelectedSpecGroupIds] = useState<string[]>(
    [],
  );
  const [specItemSelections, setSpecItemSelections] = useState<
    Record<string, string[]>
  >({});
  const [specItemSearch, setSpecItemSearch] = useState<Record<string, string>>(
    {},
  );

  // NEW: Application assignment state
  const [openApplications, setOpenApplications] = useState(false);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<
    string[]
  >([]);

  // Firestore listeners
  useEffect(() => {
    const q = query(
      collection(db, "productfamilies"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setFamilies(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setLoadingFamilies(false);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, "specs"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setSpecGroups(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
  }, []);

  // NEW: Listen to applications collection
  useEffect(() => {
    const q = query(collection(db, "applications"), orderBy("title", "asc"));
    return onSnapshot(q, (snap) => {
      setApplications(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      );
    });
  }, []);

  // Image dropzone (unchanged)
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (files) => {
      const f = files[0];
      if (!f) return;
      setImageFile(f);
      setPreviewUrl(URL.createObjectURL(f));
    },
  });

  const specGroupById = useMemo(() => {
    const m = new Map<string, SpecGroupDoc>();
    for (const g of specGroups) m.set(g.id, g);
    return m;
  }, [specGroups]);

  const applicationById = useMemo(() => {
    const m = new Map<string, ApplicationDoc>();
    for (const a of applications) m.set(a.id, a);
    return m;
  }, [applications]);

  const selectedSpecsForSave: ProductFamilySpecs[] = useMemo(() => {
    return selectedSpecGroupIds
      .map((specGroupId) => {
        const group = specGroupById.get(specGroupId);
        const labels = (group?.items ?? [])
          .map((i) => i.label)
          .filter(Boolean)
          .map((l) => l.toUpperCase().trim());
        const chosenItemIds = new Set(specItemSelections[specGroupId] ?? []);
        const chosenItems: SpecItemRef[] = labels
          .map((label) => ({
            id: buildSpecItemId(specGroupId, label),
            name: label,
          }))
          .filter((item) => chosenItemIds.has(item.id));
        return { specGroupId, specItems: chosenItems };
      })
      .filter((g) => g.specItems.length > 0);
  }, [selectedSpecGroupIds, specItemSelections, specGroupById]);

  const resetForm = useCallback(() => {
    setEditId(null);
    setTitle("");
    setDescription("");
    setProductUsage([]);
    setImageFile(null);
    setPreviewUrl("");
    setSelectedSpecGroupIds([]);
    setSpecItemSelections({});
    setSpecItemSearch({});
    setSelectedApplicationIds([]);
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredFamilies = useMemo(() => {
    return families.filter((f) => {
      const name = (f.title ?? "").toLowerCase();
      if (searchTerm && !name.includes(searchTerm.toLowerCase())) return false;
      if (filterStatus === "active" && !f.isActive) return false;
      if (filterStatus === "inactive" && f.isActive) return false;
      return true;
    });
  }, [families, searchTerm, filterStatus]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          deleteDoc(doc(db, "productfamilies", id)),
        ),
      );
      toast.success(`Deleted ${selectedIds.size} product families`);
      setSelectedIds(new Set());
    } catch {
      toast.error("Error deleting product families");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleToggleSpecGroup = (specGroupId: string) => {
    setSelectedSpecGroupIds((prev) => {
      if (prev.includes(specGroupId)) {
        const next = prev.filter((id) => id !== specGroupId);
        setSpecItemSelections((sel) => {
          const copy = { ...sel };
          delete copy[specGroupId];
          return copy;
        });
        return next;
      }
      return [...prev, specGroupId];
    });
  };

  // NEW: Toggle application assignment
  const handleToggleApplication = (applicationId: string) => {
    setSelectedApplicationIds((prev) =>
      prev.includes(applicationId)
        ? prev.filter((id) => id !== applicationId)
        : [...prev, applicationId],
    );
  };

  const toggleSpecItem = (specGroupId: string, itemId: string) => {
    setSpecItemSelections((prev) => {
      const cur = new Set(prev[specGroupId] ?? []);
      if (cur.has(itemId)) cur.delete(itemId);
      else cur.add(itemId);
      return { ...prev, [specGroupId]: Array.from(cur) };
    });
  };

  const setAllItemsInGroup = (specGroupId: string, on: boolean) => {
    const group = specGroupById.get(specGroupId);
    const labels = (group?.items ?? [])
      .map((i) => i.label)
      .filter(Boolean)
      .map((l) => l.toUpperCase().trim());
    const ids = labels.map((label) => buildSpecItemId(specGroupId, label));
    setSpecItemSelections((prev) => ({
      ...prev,
      [specGroupId]: on ? ids : [],
    }));
  };

  const validate = (): { ok: boolean; message?: string } => {
    if (!title.trim()) return { ok: false, message: "Title is required" };
    if (selectedSpecGroupIds.length === 0)
      return { ok: false, message: "Select at least one spec group" };
    for (const gid of selectedSpecGroupIds) {
      const chosen = specItemSelections[gid] ?? [];
      if (chosen.length === 0) {
        const name = specGroupById.get(gid)?.name ?? "Spec Group";
        return {
          ok: false,
          message: `Select at least one spec item for "${name}"`,
        };
      }
    }
    return { ok: true };
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const v = validate();
    if (!v.ok) return toast.error(v.message);

    setIsSubmitLoading(true);
    try {
      // Upload image
      let finalImageUrl = previewUrl;
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: "POST", body: fd },
        );
        const json = await res.json();
        finalImageUrl = json?.secure_url ?? "";
      }

      const normalisedTitle = title.trim().toUpperCase();

      const payload: any = {
        title: normalisedTitle,
        specs: selectedSpecsForSave,
        productUsage,
        // NEW: save applications assignment
        applications: selectedApplicationIds,
        updatedAt: serverTimestamp(),
      };
      const desc = description.trim();
      if (desc) payload.description = desc.toUpperCase();
      if (finalImageUrl) payload.image = finalImageUrl;

      // Save / update productFamily document
      let familyDocId: string = editId ?? "";
      if (editId) {
        await updateDoc(doc(db, "productfamilies", editId), payload);
      } else {
        const ref = await addDoc(collection(db, "productfamilies"), {
          ...payload,
          isActive: true,
          createdAt: serverTimestamp(),
        });
        familyDocId = ref.id;
      }

      // NEW: Update products that belong to this family to reflect application changes
      if (selectedApplicationIds.length > 0 && normalisedTitle) {
        try {
          const productsSnap = await getDocs(
            query(
              collection(db, "products"),
              where("productFamily", "==", normalisedTitle),
            ),
          );
          if (!productsSnap.empty) {
            const batch = writeBatch(db);
            productsSnap.docs.forEach((productDoc) => {
              batch.update(productDoc.ref, {
                applications: selectedApplicationIds,
                updatedAt: serverTimestamp(),
              });
            });
            await batch.commit();
          }
        } catch (err) {
          console.warn("Failed to propagate applications to products:", err);
          // Non-fatal — family was still saved
        }
      }

      // Generate & save TDS template PDF (unchanged from original)
      try {
        const specGroupsForTemplate = selectedSpecGroupIds
          .map((gid) => {
            const group = specGroupById.get(gid);
            const selectedItemIds = new Set(specItemSelections[gid] ?? []);
            const items = (group?.items ?? [])
              .map((i) => ({
                label: (i.label ?? "").toUpperCase().trim(),
              }))
              .filter((i) => {
                if (!i.label) return false;
                const id = buildSpecItemId(gid, i.label);
                return selectedItemIds.has(id);
              });
            return {
              name: (group?.name ?? "").toUpperCase().trim(),
              items,
            };
          })
          .filter((g) => g.items.length > 0);

        if (specGroupsForTemplate.length > 0) {
          toast.loading("Generating TDS template…", { id: "tds-template" });
          // Plain tabular template (no brand assets by default)
          const blob = await generateTdsTemplatePdf({
            specGroups: specGroupsForTemplate,
            includeBrandAssets: false,
          });
          const tplUrl = await uploadTdsPdf(
            blob,
            `${normalisedTitle}_TEMPLATE.pdf`,
            CLOUDINARY_CLOUD_NAME,
            CLOUDINARY_UPLOAD_PRESET,
          );
          await updateDoc(doc(db, "productfamilies", familyDocId), {
            tdsTemplate: tplUrl,
            updatedAt: serverTimestamp(),
          });
          toast.dismiss("tds-template");
        }
      } catch (tplErr: any) {
        toast.dismiss("tds-template");
        console.warn("TDS template generation failed:", tplErr);
      }

      toast.success(
        editId ? "Product family updated" : "Product family created",
      );
      resetForm();
    } catch {
      toast.error("Error processing request");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const selectedSummary = useMemo(() => {
    return selectedSpecsForSave
      .map((g) => {
        const group = specGroupById.get(g.specGroupId);
        return {
          specGroupId: g.specGroupId,
          groupName: group?.name ?? g.specGroupId,
          specItems: g.specItems,
        };
      })
      .filter((g) => g.specItems.length > 0);
  }, [selectedSpecsForSave, specGroupById]);

  const canPickSpecs = title.trim().length > 0;

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
                Create and manage product families, specs, and application
                assignments. A blank TDS template PDF is auto-generated on each
                save.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* ══ FORM COLUMN ══ */}
              <div className="lg:col-span-4 sticky top-6 z-10">
                <Card className="rounded-none shadow-none border-foreground/10 max-h-[calc(100vh-6rem)] overflow-y-auto">
                  <CardHeader className="border-b">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-xs font-black uppercase tracking-widest">
                        {editId ? "Edit Product Family" : "Add Product Family"}
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
                    </div>
                  </CardHeader>

                  <CardContent className="pt-5 space-y-5">
                    <form onSubmit={handleSubmit} className="space-y-5">
                      {/* Title */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Title <span className="text-destructive">*</span>
                        </label>
                        <Input
                          value={title}
                          onChange={(e) =>
                            setTitle(e.target.value.toUpperCase())
                          }
                          placeholder="E.G. RECESSED LIGHTS"
                          className={cn(
                            "rounded-none h-10 text-xs uppercase",
                            !title.trim() && "border-destructive/40",
                          )}
                        />
                        {!title.trim() && (
                          <p className="text-[10px] text-destructive font-bold uppercase">
                            Title is required
                          </p>
                        )}
                      </div>

                      {/* Description */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Description{" "}
                          <span className="opacity-60">(optional)</span>
                        </label>
                        <Textarea
                          value={description}
                          onChange={(e) =>
                            setDescription(e.target.value.toUpperCase())
                          }
                          placeholder="ENTER OVERVIEW…"
                          className="rounded-none min-h-20 text-xs resize-none uppercase"
                        />
                      </div>

                      {/* Product Usage */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Product Usage{" "}
                          <span className="opacity-60">(optional)</span>
                        </label>
                        <div className="flex gap-1.5 flex-wrap">
                          {PRODUCT_USAGE_OPTIONS.map((u) => (
                            <UsagePill
                              key={u}
                              label={u}
                              active={productUsage.includes(u)}
                              onClick={() =>
                                setProductUsage((p) =>
                                  p.includes(u)
                                    ? p.filter((v) => v !== u)
                                    : [...p, u],
                                )
                              }
                            />
                          ))}
                        </div>
                        {productUsage.length === 0 && (
                          <p className="text-[9px] text-muted-foreground uppercase font-bold">
                            Tagging usage helps filter families in the product
                            form
                          </p>
                        )}
                      </div>

                      {/* Image */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Image <span className="opacity-60">(optional)</span>
                        </label>
                        <div
                          {...getRootProps()}
                          className={cn(
                            "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer hover:bg-accent transition-colors min-h-30",
                            isDragActive && "border-primary bg-primary/5",
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
                                onClick={(evt) => {
                                  evt.stopPropagation();
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

                      {/* ── NEW: Application Assignment ── */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                          <Briefcase size={10} />
                          Applications{" "}
                          <span className="opacity-60">(optional)</span>
                        </label>
                        <ApplicationSelector
                          applications={applications}
                          selectedApplicationIds={selectedApplicationIds}
                          onToggle={handleToggleApplication}
                          open={openApplications}
                          onOpenChange={setOpenApplications}
                        />
                        {selectedApplicationIds.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {selectedApplicationIds.map((appId) => {
                              const app = applicationById.get(appId);
                              const name = app?.title ?? app?.name ?? appId;
                              return (
                                <Badge
                                  key={appId}
                                  variant="outline"
                                  className="rounded-none text-[8px] font-black uppercase px-2 h-5 gap-1"
                                >
                                  {name.toUpperCase()}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleApplication(appId)
                                    }
                                    className="hover:text-destructive"
                                  >
                                    <X size={8} />
                                  </button>
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                        {selectedApplicationIds.length > 0 && (
                          <p className="text-[9px] text-muted-foreground uppercase font-bold">
                            Products in this family will be tagged with the
                            selected applications
                          </p>
                        )}
                      </div>

                      {/* Spec groups selection (unchanged) */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Spec Groups{" "}
                          <span className="text-destructive">*</span>
                        </label>
                        <Popover
                          open={openSpecGroups}
                          onOpenChange={setOpenSpecGroups}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={!canPickSpecs}
                              className="w-full justify-between rounded-none h-10 text-[10px] font-bold uppercase"
                            >
                              {selectedSpecGroupIds.length > 0
                                ? `${selectedSpecGroupIds.length} GROUP${selectedSpecGroupIds.length !== 1 ? "S" : ""} SELECTED`
                                : canPickSpecs
                                  ? "SELECT SPEC GROUPS…"
                                  : "ENTER A TITLE FIRST"}
                              <Layers className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-(--radix-popover-trigger-width) p-0 rounded-none"
                            align="start"
                          >
                            <Command>
                              <CommandInput
                                placeholder="Search spec groups…"
                                className="h-9 text-xs"
                              />
                              <CommandList>
                                <CommandEmpty>
                                  No spec groups found.
                                </CommandEmpty>
                                <CommandGroup>
                                  {specGroups.map((g) => {
                                    const active =
                                      selectedSpecGroupIds.includes(g.id);
                                    return (
                                      <CommandItem
                                        key={g.id}
                                        onSelect={() =>
                                          handleToggleSpecGroup(g.id)
                                        }
                                        className="text-[10px] uppercase font-bold"
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-3 w-3",
                                            active
                                              ? "opacity-100"
                                              : "opacity-0",
                                          )}
                                        />
                                        {(g.name ?? "").toUpperCase()}
                                        {g.isActive === false && (
                                          <span className="ml-auto text-[8px] text-muted-foreground uppercase">
                                            Disabled
                                          </span>
                                        )}
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {!canPickSpecs && (
                          <p className="text-[10px] text-muted-foreground font-bold uppercase">
                            Spec selection unlocks after title is set
                          </p>
                        )}
                      </div>

                      {/* Spec items per group (unchanged) */}
                      {selectedSpecGroupIds.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold uppercase opacity-60">
                              Spec Items{" "}
                              <span className="text-destructive">*</span>
                            </label>
                            <Badge
                              variant="outline"
                              className="rounded-none text-[8px] font-black uppercase px-2 h-5"
                            >
                              {selectedSummary.reduce(
                                (sum, g) => sum + g.specItems.length,
                                0,
                              )}{" "}
                              selected
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            {selectedSpecGroupIds.map((gid) => {
                              const group = specGroupById.get(gid);
                              const groupName = (
                                group?.name ?? gid
                              ).toUpperCase();
                              const labels = Array.from(
                                new Set(
                                  (group?.items ?? [])
                                    .map((i) => i.label)
                                    .filter(Boolean)
                                    .map((l) => l.toUpperCase().trim()),
                                ),
                              );
                              const search = (
                                specItemSearch[gid] ?? ""
                              ).toUpperCase();
                              const filtered = search
                                ? labels.filter((l) => l.includes(search))
                                : labels;
                              const selectedSet = new Set(
                                specItemSelections[gid] ?? [],
                              );

                              return (
                                <div
                                  key={gid}
                                  className="border border-foreground/10 rounded-none"
                                >
                                  <div className="flex items-center justify-between gap-2 p-2.5 border-b bg-muted/20">
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-black uppercase truncate leading-tight">
                                        {groupName}
                                      </p>
                                      <p className="text-[9px] text-muted-foreground uppercase">
                                        {selectedSet.size} SELECTED ·{" "}
                                        {labels.length} AVAILABLE
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="rounded-none h-7 text-[9px] uppercase font-bold"
                                        onClick={() =>
                                          setAllItemsInGroup(gid, true)
                                        }
                                        disabled={labels.length === 0}
                                      >
                                        Select all
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="rounded-none h-7 text-[9px] uppercase font-bold"
                                        onClick={() =>
                                          setAllItemsInGroup(gid, false)
                                        }
                                      >
                                        Clear
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="p-2.5 space-y-2">
                                    <Input
                                      value={specItemSearch[gid] ?? ""}
                                      onChange={(evt) =>
                                        setSpecItemSearch((prev) => ({
                                          ...prev,
                                          [gid]: evt.target.value.toUpperCase(),
                                        }))
                                      }
                                      placeholder="FILTER ITEMS…"
                                      className="rounded-none h-9 text-xs uppercase"
                                    />
                                    {filtered.length === 0 ? (
                                      <p className="text-[10px] text-muted-foreground uppercase font-bold border border-dashed border-foreground/10 p-3 bg-muted/30 text-center">
                                        No items found
                                      </p>
                                    ) : (
                                      <div className="grid grid-cols-1 gap-1.5 max-h-55 overflow-y-auto pr-1">
                                        {filtered.map((label) => {
                                          const itemId = buildSpecItemId(
                                            gid,
                                            label,
                                          );
                                          const checked =
                                            selectedSet.has(itemId);
                                          return (
                                            <button
                                              type="button"
                                              key={itemId}
                                              onClick={() =>
                                                toggleSpecItem(gid, itemId)
                                              }
                                              className={cn(
                                                "flex items-center gap-2 border border-foreground/10 bg-background hover:bg-accent/40 transition-colors px-2.5 py-2 rounded-none text-left",
                                                checked &&
                                                  "border-primary/40 bg-primary/5",
                                              )}
                                            >
                                              <span
                                                className={cn(
                                                  "h-4 w-4 border border-foreground/20 flex items-center justify-center",
                                                  checked
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "bg-background",
                                                )}
                                              >
                                                {checked && <Check size={12} />}
                                              </span>
                                              <span className="text-[10px] font-black uppercase text-muted-foreground">
                                                {label}
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                    {(specItemSelections[gid] ?? []).length ===
                                      0 && (
                                      <p className="text-[10px] text-destructive uppercase font-bold">
                                        Select at least one item for this group
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Summary */}
                      {selectedSummary.length > 0 && (
                        <div className="space-y-2 border border-foreground/10 p-3 bg-muted/20 rounded-none">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                              Selection Summary
                            </p>
                            <Badge
                              variant="secondary"
                              className="rounded-none text-[8px] font-black uppercase px-2 h-5"
                            >
                              {selectedSummary.length} GROUP
                              {selectedSummary.length !== 1 ? "S" : ""}
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            {selectedSummary.map((g) => {
                              const seen = new Set<string>();
                              const uniqueItems = g.specItems.filter((it) => {
                                if (seen.has(it.id)) return false;
                                seen.add(it.id);
                                return true;
                              });
                              return (
                                <div
                                  key={g.specGroupId}
                                  className="border border-foreground/10 bg-background p-2 rounded-none"
                                >
                                  <p className="text-[10px] font-black uppercase mb-1">
                                    {(g.groupName ?? "").toUpperCase()}
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {uniqueItems.map((it) => (
                                      <Badge
                                        key={it.id}
                                        variant="outline"
                                        className="rounded-none text-[8px] font-black uppercase px-2 h-5"
                                      >
                                        {it.name}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <Button
                        type="submit"
                        disabled={isSubmitLoading}
                        className="w-full rounded-none uppercase font-bold text-[10px] h-11 tracking-widest"
                      >
                        {isSubmitLoading ? (
                          <Loader2 className="animate-spin h-4 w-4" />
                        ) : editId ? (
                          "Push Update"
                        ) : (
                          "Create Product Family"
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>

              {/* ══ LIST VIEW ══ */}
              <div className="lg:col-span-8">
                {!loadingFamilies && families.length > 0 && (
                  <div className="space-y-3 mb-6">
                    <Input
                      placeholder="Search product families..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="rounded-none text-sm h-10"
                    />
                    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                      <div className="flex gap-1 flex-wrap">
                        {(["all", "active", "inactive"] as const).map((s) => (
                          <Button
                            key={s}
                            variant={filterStatus === s ? "default" : "outline"}
                            size="sm"
                            className="rounded-none text-xs h-8 capitalize"
                            onClick={() => setFilterStatus(s)}
                          >
                            {s === "all"
                              ? "All"
                              : s.charAt(0).toUpperCase() + s.slice(1)}
                          </Button>
                        ))}
                      </div>
                      <div className="flex gap-1 ml-auto">
                        {selectedIds.size > 0 && (
                          <>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="rounded-none text-xs h-8"
                                  disabled={isBulkDeleting}
                                >
                                  {isBulkDeleting ? (
                                    <>
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      Deleting...
                                    </>
                                  ) : (
                                    <>
                                      <Trash2 className="h-3 w-3 mr-1" />
                                      Delete {selectedIds.size}
                                    </>
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-none">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-sm font-bold uppercase">
                                    Confirm Deletion
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-xs">
                                    Delete {selectedIds.size} product families?
                                    This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-none text-xs">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-none bg-destructive text-xs"
                                    onClick={handleBulkDelete}
                                  >
                                    Delete All
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-none text-xs h-8"
                              onClick={() => setSelectedIds(new Set())}
                            >
                              Deselect All
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Showing {filteredFamilies.length} of {families.length}{" "}
                      product families
                    </div>
                  </div>
                )}

                {loadingFamilies ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : filteredFamilies.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-100 border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mb-4 shadow-sm">
                      <FolderPlus className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                      {families.length === 0
                        ? "No Product Families"
                        : "No Results"}
                    </h3>
                    <p className="text-[11px] text-muted-foreground uppercase max-w-60 leading-relaxed">
                      {families.length === 0
                        ? "Your database is currently empty. Create a new product family using the panel on the left."
                        : "No product families match your search or filter criteria."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredFamilies.map((f) => {
                      const img = f.image || f.imageUrl || "/placeholder.png";
                      const groupCount = Array.isArray(f.specs)
                        ? f.specs.length
                        : Array.isArray(f.specifications)
                          ? f.specifications.length
                          : 0;
                      const itemCount = Array.isArray(f.specs)
                        ? f.specs.reduce(
                            (sum, g) => sum + (g.specItems?.length ?? 0),
                            0,
                          )
                        : 0;
                      const appCount = Array.isArray(f.applications)
                        ? f.applications.length
                        : 0;

                      return (
                        <Card
                          key={f.id}
                          className={cn(
                            "rounded-none shadow-none group relative overflow-hidden border-foreground/10 transition-all",
                            selectedIds.has(f.id) &&
                              "ring-2 ring-primary border-primary/50",
                          )}
                        >
                          <div className="aspect-4/3 relative bg-muted border-b overflow-hidden">
                            <img
                              src={img}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              alt={f.title ?? "Product family"}
                            />
                            <div
                              className="absolute top-2 left-2 bg-background/80 rounded-none border border-foreground/10 p-1 cursor-pointer hover:bg-background transition-colors"
                              onClick={() => toggleSelect(f.id)}
                            >
                              <input
                                type="checkbox"
                                checked={selectedIds.has(f.id)}
                                onChange={() => {}}
                                className="h-4 w-4 cursor-pointer"
                              />
                            </div>
                            <div className="absolute top-2 right-2 flex gap-1">
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-7 w-7 rounded-none shadow-sm"
                                onClick={() => {
                                  setEditId(f.id);
                                  setTitle(f.title ?? "");
                                  setDescription(f.description ?? "");
                                  setProductUsage(
                                    (f.productUsage as ProductUsage[]) ?? [],
                                  );
                                  setPreviewUrl(f.image ?? f.imageUrl ?? "");
                                  setImageFile(null);
                                  // Restore application assignments
                                  setSelectedApplicationIds(
                                    f.applications ?? [],
                                  );
                                  if (
                                    Array.isArray(f.specs) &&
                                    f.specs.length > 0
                                  ) {
                                    const gids = f.specs.map(
                                      (s) => s.specGroupId,
                                    );
                                    setSelectedSpecGroupIds(gids);
                                    const nextSel: Record<string, string[]> =
                                      {};
                                    for (const s of f.specs) {
                                      nextSel[s.specGroupId] = (
                                        s.specItems ?? []
                                      ).map((it) => it.id);
                                    }
                                    setSpecItemSelections(nextSel);
                                  } else if (
                                    Array.isArray(f.specifications) &&
                                    f.specifications.length > 0
                                  ) {
                                    setSelectedSpecGroupIds(f.specifications);
                                    setSpecItemSelections({});
                                  } else {
                                    setSelectedSpecGroupIds([]);
                                    setSpecItemSelections({});
                                  }
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
                                      Delete "{f.title}"? This cannot be undone.
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
                                          doc(db, "productfamilies", f.id),
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
                                {f.title || "UNTITLED"}
                              </h3>
                              <Badge
                                variant={f.isActive ? "default" : "outline"}
                                className="rounded-none text-[7px] px-1 h-4 uppercase"
                              >
                                {f.isActive ? "Live" : "Hidden"}
                              </Badge>
                            </div>
                            {f.description && (
                              <p className="text-[9px] text-muted-foreground uppercase line-clamp-1 italic">
                                {f.description}
                              </p>
                            )}
                            {/* Usage tags */}
                            {f.productUsage && f.productUsage.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {f.productUsage.map((u) => (
                                  <span
                                    key={u}
                                    className={cn(
                                      "text-[7px] font-black uppercase px-1.5 py-0.5 rounded-none border",
                                      u === "INDOOR" &&
                                        "border-blue-300 bg-blue-50 text-blue-600",
                                      u === "OUTDOOR" &&
                                        "border-emerald-300 bg-emerald-50 text-emerald-600",
                                      u === "SOLAR" &&
                                        "border-amber-300 bg-amber-50 text-amber-600",
                                    )}
                                  >
                                    {u}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* NEW: Applications display */}
                            {appCount > 0 && (
                              <p className="text-[8px] text-muted-foreground/60 uppercase font-bold flex items-center gap-1">
                                <Briefcase size={8} />
                                {appCount} APPLICATION
                                {appCount !== 1 ? "S" : ""}
                              </p>
                            )}
                            {groupCount > 0 && (
                              <p className="text-[8px] text-muted-foreground/60 uppercase font-bold">
                                {groupCount} SPEC GROUP
                                {groupCount !== 1 ? "S" : ""}
                                {itemCount > 0
                                  ? ` · ${itemCount} ITEM${itemCount !== 1 ? "S" : ""}`
                                  : ""}
                              </p>
                            )}
                          </div>
                        </Card>
                      );
                    })}
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
