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
  DialogFooter,
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

// ─── Types ────────────────────────────────────────────────────────────────────

type SpecGroupDoc = {
  id: string;
  name: string;
  items?: { label: string }[];
  isActive?: boolean;
};

type SpecItemRef = { id: string; name: string };
type FamilySpec = { specGroupId: string; specItems: SpecItemRef[] };

/** A brand-new spec group that hasn't been saved to Firestore yet. */
type PendingGroup = {
  tempId: string;
  name: string;
  items: { label: string }[];
};

export interface CreatedFamily {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called after both the spec groups and the product family are persisted. */
  onCreated: (family: CreatedFamily) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mirrors the same helper used in ProductFamiliesPage. */
function buildItemId(groupId: string, label: string): string {
  return `${groupId}:${label.toUpperCase().trim()}`;
}

function makeTempId(): string {
  return `pending:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateProductFamilyDialog({ open, onOpenChange, onCreated }: Props) {
  // ── Family basic fields ──────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // ── Existing spec groups (from Firestore) ────────────────────────────────
  const [existingGroups, setExistingGroups] = useState<SpecGroupDoc[]>([]);
  const [groupComboOpen, setGroupComboOpen] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // ── Item selections — key = groupId OR tempId, value = array of item IDs ─
  const [itemSelections, setItemSelections] = useState<Record<string, string[]>>({});
  const [itemSearch, setItemSearch] = useState<Record<string, string>>({});

  // ── Pending new spec groups (not yet in Firestore) ───────────────────────
  const [pendingGroups, setPendingGroups] = useState<PendingGroup[]>([]);

  // ── Inline new-group form ────────────────────────────────────────────────
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupLabels, setNewGroupLabels] = useState<string[]>([""]);

  const [isSaving, setIsSaving] = useState(false);

  // ── Firestore listener for existing groups ───────────────────────────────
  useEffect(() => {
    if (!open) return;
    const q = query(collection(db, "specs"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setExistingGroups(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return unsub;
  }, [open]);

  // ── Reset all state when the dialog closes ───────────────────────────────
  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setSelectedGroupIds([]);
      setItemSelections({});
      setItemSearch({});
      setPendingGroups([]);
      setNewGroupOpen(false);
      setNewGroupName("");
      setNewGroupLabels([""]);
    }
  }, [open]);

  // ── Derived: lookup map ───────────────────────────────────────────────────
  const groupById = useMemo(() => {
    const m = new Map<string, SpecGroupDoc>();
    for (const g of existingGroups) m.set(g.id, g);
    return m;
  }, [existingGroups]);

  /**
   * All groups currently "active" in the form — existing selected ones plus
   * any pending (locally-created) ones.
   */
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

  // ── Existing-group selection ──────────────────────────────────────────────
  const toggleExistingGroup = (id: string) => {
    setSelectedGroupIds((prev) => {
      if (prev.includes(id)) {
        // Remove and clear its selections
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

  // ── Item toggle helpers ───────────────────────────────────────────────────
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

  // ── Inline new-group form helpers ─────────────────────────────────────────
  const addLabel = () => setNewGroupLabels((p) => [...p, ""]);

  const removeLabel = (i: number) =>
    setNewGroupLabels((p) => p.length === 1 ? p : p.filter((_, idx) => idx !== i));

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
      { tempId, name: groupName, items: validLabels.map((label) => ({ label })) },
    ]);

    // Reset the inline form
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

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!title.trim()) return "Product family title is required";
    if (allGroups.length === 0) return "Select or create at least one spec group";
    for (const g of allGroups) {
      if ((itemSelections[g.id] ?? []).length === 0)
        return `Select at least one spec item for "${g.name}"`;
    }
    return null;
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const err = validate();
    if (err) return toast.error(err);

    setIsSaving(true);
    try {
      // 1. Persist pending spec groups → collect real Firestore IDs
      const tempToRealId: Record<string, string> = {};
      for (const pg of pendingGroups) {
        const ref = await addDoc(collection(db, "specs"), {
          name: pg.name,
          items: pg.items,          // [{ label: string }] — same schema as specsMaintenancePage
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tempToRealId[pg.tempId] = ref.id;
      }

      // 2. Build the `specs` array for the product family
      //    (same schema as ProductFamiliesPage: specGroupId + specItems[{id, name}])
      const specs: FamilySpec[] = allGroups
        .map((g) => {
          const realGroupId = tempToRealId[g.id] ?? g.id;
          const chosenIds = new Set(itemSelections[g.id] ?? []);

          const specItems: SpecItemRef[] = g.labels
            .map((label) => ({
              id: buildItemId(realGroupId, label),
              name: label,
              // Keep the original temp-based ID for matching against chosenIds
              _tempId: buildItemId(g.id, label),
            }))
            .filter((it) => chosenIds.has(it._tempId) || chosenIds.has(it.id))
            .map(({ _tempId: _ignored, ...rest }) => rest);

          return { specGroupId: realGroupId, specItems };
        })
        .filter((g) => g.specItems.length > 0);

      // 3. Persist the product family
      const familyRef = await addDoc(collection(db, "productfamilies"), {
        title: title.trim().toUpperCase(),
        description: description.trim() || null,
        specs,                      // same schema as ProductFamiliesPage
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const createdName = title.trim().toUpperCase();
      toast.success(`Product family "${createdName}" created`);
      onCreated({ id: familyRef.id, name: createdName });
      onOpenChange(false);
    } catch (e) {
      console.error("[CreateProductFamilyDialog]", e);
      toast.error("Failed to create product family");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalSelectedItems = allGroups.reduce(
    (sum, g) => sum + (itemSelections[g.id] ?? []).length,
    0,
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col rounded-none p-0 gap-0">
        {/* ── Header ── */}
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-primary" />
            Create New Product Family
          </DialogTitle>
          <p className="text-[10px] text-muted-foreground uppercase font-bold pt-0.5">
            This family and any new spec groups will be saved to Firestore immediately.
          </p>
        </DialogHeader>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase opacity-60">
              Family Title <span className="text-destructive">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="E.G. RECESSED LIGHTS"
              className={cn(
                "rounded-none h-10 text-xs uppercase font-bold",
                !title.trim() && "border-destructive/40",
              )}
            />
            {!title.trim() && (
              <p className="text-[10px] text-destructive font-bold uppercase">Title is required</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase opacity-60">
              Description <span className="opacity-50">(optional)</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of this product family…"
              className="rounded-none text-xs resize-none min-h-[70px]"
            />
          </div>

          <Separator />

          {/* ── Spec Group Section ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase opacity-60">
                  Spec Groups <span className="text-destructive">*</span>
                </p>
                <p className="text-[9px] text-muted-foreground uppercase font-bold mt-0.5">
                  Select existing groups or create new ones below
                </p>
              </div>
              {allGroups.length > 0 && (
                <Badge
                  variant="secondary"
                  className="rounded-none text-[8px] font-black uppercase px-2 h-5"
                >
                  {allGroups.length} group{allGroups.length !== 1 ? "s" : ""} · {totalSelectedItems} items
                </Badge>
              )}
            </div>

            {/* ── Existing groups combobox ── */}
            <Popover open={groupComboOpen} onOpenChange={setGroupComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between rounded-none h-10 text-[10px] font-bold uppercase"
                >
                  <span className="flex items-center gap-2">
                    <Layers className="h-3 w-3 opacity-60" />
                    {selectedGroupIds.length > 0
                      ? `${selectedGroupIds.length} existing group${selectedGroupIds.length !== 1 ? "s" : ""} selected`
                      : "Select from existing spec groups…"}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0 rounded-none"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Search spec groups…" className="h-9 text-xs" />
                  <CommandList>
                    <CommandEmpty>No spec groups found.</CommandEmpty>
                    <CommandGroup>
                      {existingGroups.map((g) => {
                        const selected = selectedGroupIds.includes(g.id);
                        return (
                          <CommandItem
                            key={g.id}
                            onSelect={() => toggleExistingGroup(g.id)}
                            className="text-[10px] uppercase font-bold"
                          >
                            <Check
                              className={cn("mr-2 h-3 w-3", selected ? "opacity-100" : "opacity-0")}
                            />
                            {g.name}
                            {g.isActive === false && (
                              <span className="ml-auto text-[8px] text-muted-foreground uppercase opacity-60">
                                Disabled
                              </span>
                            )}
                            <span className="ml-auto text-[8px] text-muted-foreground">
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

            {/* ── Per-group item selector ── */}
            {allGroups.length > 0 && (
              <div className="space-y-2">
                {allGroups.map((g) => {
                  const search = (itemSearch[g.id] ?? "").toUpperCase();
                  const filtered = search
                    ? g.labels.filter((l) => l.includes(search))
                    : g.labels;
                  const selectedSet = new Set(itemSelections[g.id] ?? []);

                  return (
                    <div key={g.id} className="border border-foreground/10 rounded-none">
                      {/* Group header */}
                      <div className="flex items-center justify-between gap-2 p-2.5 border-b bg-muted/20">
                        <div className="min-w-0 flex items-center gap-2">
                          {g.isPending && (
                            <Badge
                              variant="outline"
                              className="rounded-none text-[7px] font-black uppercase px-1.5 h-4 border-amber-400 text-amber-600 bg-amber-50 shrink-0"
                            >
                              NEW
                            </Badge>
                          )}
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase truncate leading-tight">
                              {g.name}
                            </p>
                            <p className="text-[9px] text-muted-foreground uppercase">
                              {selectedSet.size} selected · {g.labels.length} available
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-none h-7 text-[9px] uppercase font-bold"
                            onClick={() => setAllItems(g.id, g.labels, true)}
                            disabled={g.labels.length === 0}
                          >
                            All
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-none h-7 text-[9px] uppercase font-bold"
                            onClick={() => setAllItems(g.id, g.labels, false)}
                          >
                            Clear
                          </Button>
                          {g.isPending && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => removePendingGroup(g.id)}
                            >
                              <X size={12} />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Item list */}
                      <div className="p-2.5 space-y-2">
                        <Input
                          value={itemSearch[g.id] ?? ""}
                          onChange={(e) =>
                            setItemSearch((p) => ({ ...p, [g.id]: e.target.value }))
                          }
                          placeholder="Filter items…"
                          className="rounded-none h-8 text-xs"
                        />

                        {g.labels.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground uppercase font-bold border border-dashed border-foreground/10 p-2 text-center">
                            No items defined for this group
                          </p>
                        ) : filtered.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground uppercase font-bold border border-dashed border-foreground/10 p-2 text-center">
                            No items match "{itemSearch[g.id]}"
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-1 max-h-[160px] overflow-y-auto pr-0.5">
                            {filtered.map((label) => {
                              const itemId = buildItemId(g.id, label);
                              const checked = selectedSet.has(itemId);
                              return (
                                <button
                                  type="button"
                                  key={itemId}
                                  onClick={() => toggleItem(g.id, itemId)}
                                  className={cn(
                                    "flex items-center gap-2 border border-foreground/10 bg-background hover:bg-accent/40 transition-colors px-2 py-1.5 rounded-none text-left",
                                    checked && "border-primary/40 bg-primary/5",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-3.5 w-3.5 border border-foreground/20 flex items-center justify-center shrink-0",
                                      checked
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-background",
                                    )}
                                  >
                                    {checked && <Check size={9} />}
                                  </span>
                                  <span className="text-[9px] font-black uppercase text-muted-foreground truncate">
                                    {label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {(itemSelections[g.id] ?? []).length === 0 && (
                          <p className="text-[10px] text-destructive uppercase font-bold">
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

            {/* ── Inline new spec group creator ── */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setNewGroupOpen((v) => !v)}
                className="w-full flex items-center justify-between p-3 border border-dashed border-primary/30 hover:border-primary/60 bg-primary/5 hover:bg-primary/10 transition-colors rounded-none"
              >
                <span className="flex items-center gap-2 text-[10px] font-black uppercase text-primary">
                  <Plus size={12} />
                  Create a New Spec Group
                </span>
                {newGroupOpen ? (
                  <ChevronUp size={12} className="text-primary" />
                ) : (
                  <ChevronDown size={12} className="text-primary" />
                )}
              </button>

              {newGroupOpen && (
                <div className="border border-foreground/10 p-4 space-y-4 bg-muted/10 rounded-none">
                  {/* Group name */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase opacity-60">
                      Group Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="E.G. DIMENSIONS"
                      className="rounded-none h-9 text-xs uppercase font-bold"
                    />
                  </div>

                  {/* Label rows */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black uppercase opacity-60">
                        Spec Labels <span className="text-destructive">*</span>
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addLabel}
                        className="h-6 rounded-none text-[9px] uppercase font-bold gap-1"
                      >
                        <Plus size={10} /> Add Label
                      </Button>
                    </div>
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                      {newGroupLabels.map((label, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <Input
                            value={label}
                            onChange={(e) => updateLabel(i, e.target.value)}
                            placeholder={`Label ${i + 1} (e.g. WATTAGE)`}
                            className="rounded-none h-8 text-xs uppercase font-bold flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeLabel(i)}
                            disabled={newGroupLabels.length === 1}
                            className="h-8 w-8 rounded-none text-muted-foreground hover:text-destructive shrink-0"
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
                    className="w-full rounded-none h-9 text-[10px] uppercase font-bold tracking-widest gap-1.5"
                  >
                    <Plus size={12} /> Stage This Group
                  </Button>
                </div>
              )}
            </div>

            {/* Pending groups notice */}
            {pendingGroups.length > 0 && (
              <div className="flex items-start gap-2 border border-amber-200 bg-amber-50 p-3 rounded-none">
                <span className="text-amber-500 text-sm shrink-0">⚠</span>
                <p className="text-[9px] text-amber-700 uppercase font-bold leading-relaxed">
                  {pendingGroups.length} new spec group{pendingGroups.length !== 1 ? "s" : ""} (
                  {pendingGroups.map((g) => g.name).join(", ")}) will be saved to Firestore
                  when you click "Create Product Family".
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <DialogFooter className="p-5 border-t shrink-0 flex flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-none text-xs uppercase font-bold h-10"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-none text-xs uppercase font-bold h-10 flex-1 tracking-widest gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <FolderPlus size={14} />
                Create Product Family
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}