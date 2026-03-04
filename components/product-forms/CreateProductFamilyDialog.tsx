"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import {
  Check,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Layers,
  Loader2,
  Plus,
  X,
  Tag,
  Sun,
  Zap,
  AlignLeft,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRODUCT_USAGE_OPTIONS = ["INDOOR", "OUTDOOR", "SOLAR"] as const;
type ProductUsage = (typeof PRODUCT_USAGE_OPTIONS)[number];

// ─── Types ────────────────────────────────────────────────────────────────────

type SpecGroupDoc = {
  id: string;
  name: string;
  items?: { label: string }[];
  isActive?: boolean;
};

type SpecItemRef = { id: string; name: string };
type FamilySpec = { specGroupId: string; specItems: SpecItemRef[] };

type PendingGroup = {
  tempId: string;
  name: string;
  items: { label: string }[];
};

export interface CreatedFamily {
  id: string;
  name: string;
  productUsage: ProductUsage[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (family: CreatedFamily) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildItemId(groupId: string, label: string): string {
  return `${groupId}:${label.toUpperCase().trim()}`;
}

function makeTempId(): string {
  return `pending:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
}

const USAGE_COLORS: Record<ProductUsage, { pill: string; active: string }> = {
  INDOOR: {
    pill: "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400",
    active: "border-blue-500 bg-blue-500 text-white",
  },
  OUTDOOR: {
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400",
    active: "border-emerald-500 bg-emerald-500 text-white",
  },
  SOLAR: {
    pill: "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400",
    active: "border-amber-400 bg-amber-400 text-white",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateProductFamilyDialog({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [productUsage, setProductUsage] = useState<ProductUsage[]>([]);

  const [existingGroups, setExistingGroups] = useState<SpecGroupDoc[]>([]);
  const [groupComboOpen, setGroupComboOpen] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const [itemSelections, setItemSelections] = useState<
    Record<string, string[]>
  >({});
  const [itemSearch, setItemSearch] = useState<Record<string, string>>({});

  const [pendingGroups, setPendingGroups] = useState<PendingGroup[]>([]);

  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupLabels, setNewGroupLabels] = useState<string[]>([""]);

  const [isSaving, setIsSaving] = useState(false);

  // ── Firestore listener ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const q = query(collection(db, "specs"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setExistingGroups(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      );
    });
    return unsub;
  }, [open]);

  // ── Reset on close ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setProductUsage([]);
      setSelectedGroupIds([]);
      setItemSelections({});
      setItemSearch({});
      setPendingGroups([]);
      setNewGroupOpen(false);
      setNewGroupName("");
      setNewGroupLabels([""]);
    }
  }, [open]);

  const groupById = useMemo(() => {
    const m = new Map<string, SpecGroupDoc>();
    for (const g of existingGroups) m.set(g.id, g);
    return m;
  }, [existingGroups]);

  const allGroups = useMemo(() => {
    const existing = selectedGroupIds.map((id) => {
      const g = groupById.get(id);
      return {
        id,
        name: g?.name ?? id,
        labels: Array.from(
          new Set(
            (g?.items ?? [])
              .map((i) => i.label)
              .filter(Boolean)
              .map((l) => l.toUpperCase().trim()),
          ),
        ),
        isPending: false as const,
      };
    });
    const pending = pendingGroups.map((pg) => ({
      id: pg.tempId,
      name: pg.name,
      labels: Array.from(
        new Set(
          pg.items
            .map((i) => i.label)
            .filter(Boolean)
            .map((l) => l.toUpperCase().trim()),
        ),
      ),
      isPending: true as const,
    }));
    return [...existing, ...pending];
  }, [selectedGroupIds, pendingGroups, groupById]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const toggleExistingGroup = (id: string) => {
    setSelectedGroupIds((prev) => {
      if (prev.includes(id)) {
        setItemSelections((s) => {
          const copy = { ...s };
          delete copy[id];
          return copy;
        });
        return prev.filter((v) => v !== id);
      }
      return [...prev, id];
    });
    setGroupComboOpen(false);
  };

  const toggleItem = (groupId: string, itemId: string) => {
    setItemSelections((prev) => {
      const cur = new Set(prev[groupId] ?? []);
      cur.has(itemId) ? cur.delete(itemId) : cur.add(itemId);
      return { ...prev, [groupId]: Array.from(cur) };
    });
  };

  const setAllItems = (groupId: string, labels: string[], on: boolean) => {
    setItemSelections((prev) => ({
      ...prev,
      [groupId]: on ? labels.map((l) => buildItemId(groupId, l)) : [],
    }));
  };

  const addLabel = () => setNewGroupLabels((p) => [...p, ""]);
  const removeLabel = (i: number) =>
    setNewGroupLabels((p) =>
      p.length === 1 ? p : p.filter((_, idx) => idx !== i),
    );
  const updateLabel = (i: number, val: string) =>
    setNewGroupLabels((p) => {
      const c = [...p];
      c[i] = val;
      return c;
    });

  const handleAddPendingGroup = () => {
    if (!newGroupName.trim()) return toast.error("Group name is required");
    const validLabels = newGroupLabels
      .map((l) => l.trim().toUpperCase())
      .filter(Boolean);
    if (validLabels.length === 0) return toast.error("Add at least one label");
    const tempId = makeTempId();
    const groupName = newGroupName.trim().toUpperCase();
    setPendingGroups((p) => [
      ...p,
      {
        tempId,
        name: groupName,
        items: validLabels.map((label) => ({ label })),
      },
    ]);
    setNewGroupName("");
    setNewGroupLabels([""]);
    setNewGroupOpen(false);
    toast.success(`"${groupName}" staged — will save when family is created`);
  };

  const removePendingGroup = (tempId: string) => {
    setPendingGroups((p) => p.filter((g) => g.tempId !== tempId));
    setItemSelections((s) => {
      const copy = { ...s };
      delete copy[tempId];
      return copy;
    });
  };

  const validate = (): string | null => {
    if (!title.trim()) return "Product family title is required";
    if (allGroups.length === 0)
      return "Select or create at least one spec group";
    for (const g of allGroups) {
      if ((itemSelections[g.id] ?? []).length === 0)
        return `Select at least one spec item for "${g.name}"`;
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) return toast.error(err);
    setIsSaving(true);
    try {
      const tempToRealId: Record<string, string> = {};
      for (const pg of pendingGroups) {
        const ref = await addDoc(collection(db, "specs"), {
          name: pg.name,
          items: pg.items,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tempToRealId[pg.tempId] = ref.id;
      }

      const specs: FamilySpec[] = allGroups
        .map((g) => {
          const realGroupId = tempToRealId[g.id] ?? g.id;
          const chosenIds = new Set(itemSelections[g.id] ?? []);
          const specItems: SpecItemRef[] = g.labels
            .map((label) => ({
              id: buildItemId(realGroupId, label),
              name: label,
              _tempId: buildItemId(g.id, label),
            }))
            .filter((it) => chosenIds.has(it._tempId) || chosenIds.has(it.id))
            .map(({ _tempId: _ignored, ...rest }) => rest);
          return { specGroupId: realGroupId, specItems };
        })
        .filter((g) => g.specItems.length > 0);

      const familyRef = await addDoc(collection(db, "productfamilies"), {
        title: title.trim().toUpperCase(),
        description: description.trim() || null,
        specs,
        productUsage,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const createdName = title.trim().toUpperCase();
      toast.success(`Product family "${createdName}" created`);
      onCreated({ id: familyRef.id, name: createdName, productUsage });
      onOpenChange(false);
    } catch (e) {
      console.error("[CreateProductFamilyDialog]", e);
      toast.error("Failed to create product family");
    } finally {
      setIsSaving(false);
    }
  };

  const totalSelectedItems = allGroups.reduce(
    (sum, g) => sum + (itemSelections[g.id] ?? []).length,
    0,
  );

  const toggleUsage = (u: ProductUsage) =>
    setProductUsage((p) =>
      p.includes(u) ? p.filter((v) => v !== u) : [...p, u],
    );

  const hasValidationError = allGroups.some(
    (g) => (itemSelections[g.id] ?? []).length === 0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Matches BulkUploader: sm:max-w-190 h-[88vh] */}
      <DialogContent className="sm:max-w-304 h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FolderPlus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold leading-tight">
                Create New Product Family
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                This family and any new spec groups will be saved to Firestore
                immediately.
              </p>
            </div>
            {allGroups.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-auto text-[10px] font-bold uppercase px-2.5 h-6 shrink-0"
              >
                {allGroups.length} group{allGroups.length !== 1 ? "s" : ""} ·{" "}
                {totalSelectedItems} items
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* ── Two-panel body ── */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* ══════════════ LEFT PANEL — Family Details ══════════════ */}
          <div className="w-85 shrink-0 border-r flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="px-5 py-3 border-b bg-muted/30 shrink-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <AlignLeft className="h-3 w-3" />
                Family Details
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Tag className="h-3 w-3" />
                  Family Title{" "}
                  <span className="text-destructive ml-0.5">*</span>
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="E.G. RECESSED LIGHTS"
                  className={cn(
                    "h-10 text-sm font-semibold uppercase",
                    !title.trim() &&
                      "border-destructive/40 focus-visible:ring-destructive/30",
                  )}
                />
                {!title.trim() && (
                  <p className="text-[10px] text-destructive font-semibold">
                    Title is required
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Description{" "}
                  <span className="font-normal opacity-60">(optional)</span>
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief overview of this product family…"
                  className="text-sm resize-none min-h-22.5"
                />
              </div>

              {/* Product Usage */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Sun className="h-3 w-3" />
                    Product Usage{" "}
                    <span className="font-normal opacity-60">(optional)</span>
                  </label>
                  {productUsage.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setProductUsage([])}
                      className="text-[10px] text-muted-foreground hover:text-destructive transition-colors font-semibold"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {PRODUCT_USAGE_OPTIONS.map((u) => {
                    const active = productUsage.includes(u);
                    const colors = USAGE_COLORS[u];
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => toggleUsage(u)}
                        className={cn(
                          "inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-[11px] font-bold transition-all",
                          active ? colors.active : colors.pill,
                        )}
                      >
                        {active && <Check className="h-3 w-3" />}
                        {u}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Tagging usage enables filtering in the product form.
                </p>
              </div>

              <Separator />

              {/* Live spec summary */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Spec Summary
                </label>
                <div className="min-h-22.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {allGroups.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      No spec groups added yet. Use the right panel to select or
                      create groups.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {allGroups.map((g) => {
                        const count = (itemSelections[g.id] ?? []).length;
                        return (
                          <div
                            key={g.id}
                            className="flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              {g.isPending && (
                                <Badge
                                  variant="outline"
                                  className="text-[8px] font-bold uppercase px-1 h-3.5 border-amber-400 text-amber-600 bg-amber-50 shrink-0"
                                >
                                  NEW
                                </Badge>
                              )}
                              <span className="text-xs font-semibold truncate">
                                {g.name}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "text-[10px] font-bold shrink-0",
                                count === 0
                                  ? "text-destructive"
                                  : "text-emerald-600",
                              )}
                            >
                              {count === 0
                                ? "none selected"
                                : `${count} item${count !== 1 ? "s" : ""}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Inline validation hint */}
              {hasValidationError && allGroups.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-[10px] text-destructive font-semibold">
                    Each spec group needs at least one selected item before
                    saving.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ══════════════ RIGHT PANEL — Spec Groups & Items ══════════════ */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="px-5 py-3 border-b bg-muted/30 shrink-0 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Zap className="h-3 w-3" />
                Spec Groups &amp; Items
              </p>
              <p className="text-[10px] text-muted-foreground">
                Select existing groups or create new ones below
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Existing groups combobox */}
              <Popover open={groupComboOpen} onOpenChange={setGroupComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between h-10 text-xs font-semibold"
                  >
                    <span className="flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 opacity-60" />
                      {selectedGroupIds.length > 0
                        ? `${selectedGroupIds.length} existing group${selectedGroupIds.length !== 1 ? "s" : ""} selected`
                        : "Select from existing spec groups…"}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput
                      placeholder="Search spec groups…"
                      className="h-9 text-xs"
                    />
                    <CommandList>
                      <CommandEmpty>No spec groups found.</CommandEmpty>
                      <CommandGroup>
                        {existingGroups.map((g) => {
                          const selected = selectedGroupIds.includes(g.id);
                          return (
                            <CommandItem
                              key={g.id}
                              onSelect={() => toggleExistingGroup(g.id)}
                              className="text-xs font-semibold"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-3.5 w-3.5",
                                  selected
                                    ? "opacity-100 text-primary"
                                    : "opacity-0",
                                )}
                              />
                              {g.name}
                              {g.isActive === false && (
                                <span className="ml-2 text-[9px] text-muted-foreground opacity-60">
                                  Disabled
                                </span>
                              )}
                              <span className="ml-auto text-[9px] text-muted-foreground">
                                {g.items?.length ?? 0} items
                              </span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Per-group item selectors */}
              {allGroups.length > 0 && (
                <div className="space-y-3">
                  {allGroups.map((g) => {
                    const search = (itemSearch[g.id] ?? "").toUpperCase();
                    const filtered = search
                      ? g.labels.filter((l) => l.includes(search))
                      : g.labels;
                    const selectedSet = new Set(itemSelections[g.id] ?? []);
                    return (
                      <div
                        key={g.id}
                        className="border rounded-lg overflow-hidden"
                      >
                        {/* Group header row */}
                        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b bg-muted/20">
                          <div className="min-w-0 flex items-center gap-2">
                            {g.isPending && (
                              <Badge
                                variant="outline"
                                className="text-[8px] font-bold uppercase px-1.5 h-4 border-amber-400 text-amber-600 bg-amber-50 shrink-0"
                              >
                                NEW
                              </Badge>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold uppercase truncate leading-tight">
                                {g.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {selectedSet.size} selected · {g.labels.length}{" "}
                                available
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] font-semibold px-2.5"
                              onClick={() => setAllItems(g.id, g.labels, true)}
                              disabled={g.labels.length === 0}
                            >
                              All
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] font-semibold px-2.5"
                              onClick={() => setAllItems(g.id, g.labels, false)}
                            >
                              Clear
                            </Button>
                            {g.isPending && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => removePendingGroup(g.id)}
                              >
                                <X size={12} />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Items grid */}
                        <div className="p-3 space-y-2.5">
                          <Input
                            value={itemSearch[g.id] ?? ""}
                            onChange={(e) =>
                              setItemSearch((p) => ({
                                ...p,
                                [g.id]: e.target.value,
                              }))
                            }
                            placeholder="Filter items…"
                            className="h-8 text-xs"
                          />
                          {g.labels.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground italic text-center border border-dashed rounded-lg p-3">
                              No items defined for this group
                            </p>
                          ) : filtered.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground italic text-center border border-dashed rounded-lg p-3">
                              No items match "{itemSearch[g.id]}"
                            </p>
                          ) : (
                            <div className="grid grid-cols-3 gap-1.5 max-h-50 overflow-y-auto pr-0.5">
                              {filtered.map((label) => {
                                const itemId = buildItemId(g.id, label);
                                const checked = selectedSet.has(itemId);
                                return (
                                  <button
                                    type="button"
                                    key={itemId}
                                    onClick={() => toggleItem(g.id, itemId)}
                                    className={cn(
                                      "flex items-center gap-2 border rounded-md bg-background hover:bg-accent/40 transition-colors px-2 py-1.5 text-left",
                                      checked &&
                                        "border-primary/40 bg-primary/5",
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "h-3.5 w-3.5 border rounded-sm flex items-center justify-center shrink-0",
                                        checked
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-background border-foreground/20",
                                      )}
                                    >
                                      {checked && <Check size={9} />}
                                    </span>
                                    <span className="text-[10px] font-semibold uppercase text-muted-foreground truncate">
                                      {label}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {(itemSelections[g.id] ?? []).length === 0 && (
                            <p className="text-[10px] text-destructive font-semibold">
                              Select at least one item for this group
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <Separator />

              {/* Inline new spec group creator */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setNewGroupOpen((v) => !v)}
                  className="w-full flex items-center justify-between p-3 border border-dashed border-primary/30 hover:border-primary/60 bg-primary/5 hover:bg-primary/10 transition-colors rounded-lg"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <Plus size={13} />
                    Create a New Spec Group
                  </span>
                  {newGroupOpen ? (
                    <ChevronUp size={13} className="text-primary" />
                  ) : (
                    <ChevronDown size={13} className="text-primary" />
                  )}
                </button>

                {newGroupOpen && (
                  <div className="border rounded-lg p-4 space-y-4 bg-muted/10">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">
                        Group Name <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="E.G. DIMENSIONS"
                        className="h-9 text-xs uppercase font-semibold"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Spec Labels{" "}
                          <span className="text-destructive">*</span>
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addLabel}
                          className="h-6 text-[10px] font-semibold gap-1"
                        >
                          <Plus size={10} /> Add Label
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-0.5">
                        {newGroupLabels.map((label, i) => (
                          <div key={i} className="flex gap-1.5 items-center">
                            <Input
                              value={label}
                              onChange={(e) => updateLabel(i, e.target.value)}
                              placeholder={`Label ${i + 1}`}
                              className="h-8 text-xs uppercase font-semibold flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeLabel(i)}
                              disabled={newGroupLabels.length === 1}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <X size={12} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={handleAddPendingGroup}
                      className="w-full h-9 text-xs font-semibold gap-1.5"
                    >
                      <Plus size={13} /> Stage This Group
                    </Button>
                  </div>
                )}
              </div>

              {/* Pending groups notice */}
              {pendingGroups.length > 0 && (
                <div className="flex items-start gap-2 border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 rounded-lg">
                  <span className="text-amber-500 text-sm shrink-0">⚠</span>
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold leading-relaxed">
                    {pendingGroups.length} new spec group
                    {pendingGroups.length !== 1 ? "s" : ""} (
                    {pendingGroups.map((g) => g.name).join(", ")}) will be saved
                    to Firestore when you click "Create Product Family".
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="border-t px-6 py-3 flex justify-between items-center shrink-0 bg-muted/20">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-9"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="h-9 text-xs font-semibold gap-2 px-5"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <FolderPlus size={14} /> Create Product Family
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
