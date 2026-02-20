"use client";

import * as React from "react";
import { useState, useEffect } from "react";
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
  Loader2,
  Plus,
  X,
  Save,
  Layers,
  Eye,
  EyeOff,
  ClipboardList,
  Check,
  Tag,
} from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";

// Shared spec item shape — same everywhere, same as Firestore
interface SpecItem {
  label: string;
}

// A standalone (ungrouped) spec item from the `specItems` collection
interface StandaloneSpecItem {
  id: string;
  label: string;
}

export default function SpecsMaintenancePage() {
  // ── Spec Groups ──
  const [specGroups, setSpecGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Group form state
  const [editId, setEditId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [items, setItems] = useState<SpecItem[]>([{ label: "" }]);
  const [openCombo, setOpenCombo] = useState(false);

  // ── Standalone Spec Items pool ──
  const [standaloneItems, setStandaloneItems] = useState<StandaloneSpecItem[]>(
    [],
  );
  const [newStandaloneLabel, setNewStandaloneLabel] = useState("");
  const [isStandaloneLoading, setIsStandaloneLoading] = useState(false);

  // ── Listeners ──
  useEffect(() => {
    const q = query(collection(db, "specs"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setSpecGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "specItems"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setStandaloneItems(
        snap.docs.map((d) => ({ id: d.id, label: d.data().label as string })),
      );
    });
    return () => unsub();
  }, []);

  // ── Group form helpers ──
  const addField = () => setItems([...items, { label: "" }]);

  const removeField = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateField = (index: number, value: string) => {
    const updated = [...items];
    updated[index].label = value;
    setItems(updated);
  };

  /**
   * Pick a standalone item from the combobox → push it into items[] as a
   * normal SpecItem. No schema difference — it becomes just { label } like
   * everything else when saved.
   */
  const attachStandaloneItem = (standalone: StandaloneSpecItem) => {
    const alreadyIn = items.some(
      (i) => i.label.toUpperCase() === standalone.label.toUpperCase(),
    );
    if (alreadyIn) {
      toast.info(`"${standalone.label}" is already in the list`);
      return;
    }
    // If the last field is blank, replace it; otherwise append
    const lastIsBlank = items[items.length - 1]?.label.trim() === "";
    setItems(
      lastIsBlank
        ? [...items.slice(0, -1), { label: standalone.label }]
        : [...items, { label: standalone.label }],
    );
    setOpenCombo(false);
    toast.success(`"${standalone.label}" added to group`);
  };

  const resetForm = () => {
    setEditId(null);
    setGroupName("");
    setItems([{ label: "" }]);
  };

  const handleEditClick = (group: any) => {
    setEditId(group.id);
    setGroupName(group.name);
    setItems(group.items?.length ? group.items : [{ label: "" }]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return toast.error("Group name is required");

    const validItems = items.filter((i) => i.label.trim() !== "");
    if (validItems.length === 0)
      return toast.error("Add at least one specification");

    setIsSubmitLoading(true);
    const loadingToast = toast.loading(
      editId ? "Updating Spec Group..." : "Creating Spec Group...",
    );

    try {
      // ✅ Exact same payload shape as before — zero schema change
      const payload = {
        name: groupName.toUpperCase(),
        items: validItems.map((i) => ({ label: i.label.toUpperCase() })),
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await updateDoc(doc(db, "specs", editId), payload);
        toast.success("Spec Group Updated", { id: loadingToast });
      } else {
        await addDoc(collection(db, "specs"), {
          ...payload,
          isActive: true,
          createdAt: serverTimestamp(),
        });
        toast.success("Spec Group Created", { id: loadingToast });
      }
      resetForm();
    } catch {
      toast.error("Process failed", { id: loadingToast });
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const toggleStatus = async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, "specs", id), { isActive: !current });
      toast.success(current ? "Group Deactivated" : "Group Activated");
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "specs", id));
      toast.success("Specification Group Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ── Standalone item handlers ──
  const handleAddStandalone = async () => {
    if (!newStandaloneLabel.trim()) return toast.error("Label is required");
    setIsStandaloneLoading(true);
    try {
      await addDoc(collection(db, "specItems"), {
        label: newStandaloneLabel.toUpperCase().trim(),
        createdAt: serverTimestamp(),
      });
      toast.success("Standalone Spec Item Added");
      setNewStandaloneLabel("");
    } catch {
      toast.error("Failed to add item");
    } finally {
      setIsStandaloneLoading(false);
    }
  };

  const handleDeleteStandalone = async (id: string) => {
    try {
      await deleteDoc(doc(db, "specItems", id));
      toast.success("Spec Item Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  // Labels currently in the form — used to show "Added" state in combobox
  const currentLabels = items.map((i) => i.label.toUpperCase());

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
                  <BreadcrumbLink href="#">Configuration</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Specs Maintenance</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-8 p-6 max-w-7xl mx-auto w-full">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Specs Maintenance
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage specification groups and standalone spec items.
              </p>
            </div>

            {/* ── STANDALONE SPEC ITEMS PANEL ── */}
            <Card className="rounded-none shadow-none border-foreground/10">
              <CardHeader className="pb-4 border-b">
                <div className="flex items-center gap-2">
                  <Tag size={14} className="text-primary" />
                  <CardTitle className="text-xs font-black uppercase tracking-widest">
                    Standalone Spec Items
                  </CardTitle>
                  <Badge
                    variant="secondary"
                    className="text-[8px] font-black uppercase px-2 py-0 rounded-none h-4"
                  >
                    {standaloneItems.length}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold pt-1">
                  Ungrouped spec labels. Pick them via the combobox inside the
                  group form — they become regular spec items, no difference.
                </p>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                {/* Add new standalone item */}
                <div className="flex gap-2">
                  <Input
                    value={newStandaloneLabel}
                    onChange={(e) => setNewStandaloneLabel(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleAddStandalone()
                    }
                    placeholder="E.G. TENSILE STRENGTH"
                    className="font-bold uppercase h-9 text-[11px] rounded-none border-2 flex-1"
                  />
                  <Button
                    type="button"
                    onClick={handleAddStandalone}
                    disabled={isStandaloneLoading}
                    size="sm"
                    className="h-9 rounded-none font-black uppercase text-[9px] tracking-widest gap-1"
                  >
                    {isStandaloneLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <>
                        <Plus size={12} /> Add
                      </>
                    )}
                  </Button>
                </div>

                {standaloneItems.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground uppercase font-bold text-center py-4 border border-dashed border-foreground/10">
                    No standalone items yet
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {standaloneItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-1 bg-muted/40 border border-foreground/10 pl-2.5 pr-1 py-1 group"
                      >
                        <span className="text-[9px] font-black uppercase text-muted-foreground">
                          {item.label}
                        </span>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 rounded-none text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={10} />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-none border-2">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-xs font-black uppercase">
                                Delete Spec Item
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-xs">
                                Remove "{item.label}" from the standalone pool?
                                It will remain inside any groups it was already
                                added to.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-none text-[10px] font-bold uppercase">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteStandalone(item.id)}
                                className="bg-destructive text-destructive-foreground rounded-none text-[10px] font-bold uppercase"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── MAIN GRID ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* FORM COLUMN */}
              <div className="lg:col-span-5">
                <Card className="sticky top-6 border-foreground/10 shadow-none rounded-none">
                  <CardHeader className="pb-4 border-b">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-black uppercase tracking-widest">
                        {editId ? "Update Group" : "Create Spec Group"}
                      </CardTitle>
                      {editId && (
                        <Button
                          onClick={resetForm}
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[9px] font-black uppercase text-muted-foreground"
                        >
                          Cancel Edit
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                      {/* Group Name */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">
                          Group Name
                        </label>
                        <Input
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                          placeholder="E.G., DIMENSIONS"
                          className="font-bold uppercase h-11 border-2 rounded-none"
                        />
                      </div>

                      {/* Combobox — pick from standalone pool, merges into items[] */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">
                          Add from Standalone Items
                        </label>
                        <Popover open={openCombo} onOpenChange={setOpenCombo}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-between rounded-none h-10 text-[10px] font-bold uppercase border-2"
                            >
                              Select a standalone item...
                              <Tag className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none"
                            align="start"
                          >
                            <Command>
                              <CommandInput
                                placeholder="Search spec items..."
                                className="h-9 text-xs"
                              />
                              <CommandList>
                                <CommandEmpty>No items found.</CommandEmpty>
                                <CommandGroup>
                                  {standaloneItems.map((item) => {
                                    const alreadyIn = currentLabels.includes(
                                      item.label.toUpperCase(),
                                    );
                                    return (
                                      <CommandItem
                                        key={item.id}
                                        value={item.label}
                                        onSelect={() =>
                                          attachStandaloneItem(item)
                                        }
                                        className="text-[10px] uppercase font-bold"
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-3 w-3",
                                            alreadyIn
                                              ? "opacity-100 text-primary"
                                              : "opacity-0",
                                          )}
                                        />
                                        {item.label}
                                        {alreadyIn && (
                                          <span className="ml-auto text-[8px] text-muted-foreground uppercase">
                                            Added
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
                      </div>

                      {/* Spec Labels — manual + combobox-added are unified here */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">
                            Individual Labels
                          </label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addField}
                            className="h-7 text-[9px] font-black uppercase gap-1 rounded-none border-foreground/20"
                          >
                            <Plus size={12} /> Add Field
                          </Button>
                        </div>

                        <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
                          {items.map((item, index) => (
                            <div
                              key={index}
                              className="flex gap-2 items-center group"
                            >
                              <Input
                                placeholder="Label (e.g. Weight)"
                                value={item.label}
                                onChange={(e) =>
                                  updateField(index, e.target.value)
                                }
                                className="text-[11px] font-bold uppercase h-9 flex-1 rounded-none"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeField(index)}
                                className="h-9 w-9 text-muted-foreground hover:text-destructive rounded-none"
                              >
                                <X size={14} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Button
                        type="submit"
                        disabled={isSubmitLoading}
                        className="w-full font-black uppercase text-[10px] h-12 rounded-none tracking-widest"
                      >
                        {isSubmitLoading ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <>
                            <Save size={14} className="mr-2" />
                            {editId ? "Push Update" : "Finalize Group"}
                          </>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>

              {/* LIST COLUMN */}
              <div className="lg:col-span-7">
                {loading ? (
                  <div className="h-64 flex items-center justify-center">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : specGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mb-4 shadow-sm border">
                      <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                      No Specifications Found
                    </h3>
                    <p className="text-[11px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
                      You haven't defined any specification groups yet. Create
                      one to start attaching specs to your products.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {specGroups.map((group) => (
                      <Card
                        key={group.id}
                        className={cn(
                          "rounded-none shadow-none transition-all duration-300 border-foreground/10",
                          !group.isActive && "opacity-60 bg-muted/30",
                        )}
                      >
                        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/5 border border-primary/10">
                              <Layers size={14} className="text-primary" />
                            </div>
                            <h3 className="font-black text-sm uppercase tracking-tight">
                              {group.name}
                            </h3>
                            <Badge
                              variant={group.isActive ? "default" : "secondary"}
                              className="text-[8px] font-black uppercase px-2 py-0 rounded-none h-4"
                            >
                              {group.isActive ? "Active" : "Disabled"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              onClick={() => handleEditClick(group)}
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary rounded-none"
                            >
                              <Pencil size={14} />
                            </Button>
                            <Button
                              onClick={() =>
                                toggleStatus(group.id, group.isActive)
                              }
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-8 w-8 rounded-none",
                                group.isActive
                                  ? "text-blue-500"
                                  : "text-muted-foreground",
                              )}
                            >
                              {group.isActive ? (
                                <Eye size={14} />
                              ) : (
                                <EyeOff size={14} />
                              )}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-none"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-none border-2">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-xs font-black uppercase">
                                    Confirm Deletion
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-xs">
                                    Permanently remove the group "{group.name}"?
                                    This action cannot be reversed.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-none text-[10px] font-bold uppercase">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(group.id)}
                                    className="bg-destructive text-destructive-foreground rounded-none text-[10px] font-bold uppercase"
                                  >
                                    Delete Group
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                          {/* All items render identically — no visual difference */}
                          <div className="border border-foreground/5 bg-muted/20 p-3 flex flex-wrap gap-2">
                            {group.items?.map((item: SpecItem, idx: number) => (
                              <span
                                key={idx}
                                className="bg-background border border-foreground/10 px-2 py-1 rounded-none text-[9px] font-black uppercase text-muted-foreground"
                              >
                                {item.label}
                              </span>
                            ))}
                          </div>
                        </CardContent>
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
