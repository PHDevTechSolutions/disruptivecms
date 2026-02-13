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
import { cn } from "@/lib/utils";

interface SpecItem {
  label: string;
}

export default function SpecsMaintenancePage() {
  const [specGroups, setSpecGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [items, setItems] = useState<SpecItem[]>([{ label: "" }]);

  useEffect(() => {
    const q = query(collection(db, "specs"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setSpecGroups(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const addField = () => setItems([...items, { label: "" }]);

  const removeField = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateField = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index].label = value;
    setItems(newItems);
  };

  const resetForm = () => {
    setEditId(null);
    setGroupName("");
    setItems([{ label: "" }]);
  };

  const handleEditClick = (group: any) => {
    setEditId(group.id);
    setGroupName(group.name);
    setItems(group.items || [{ label: "" }]);
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
      const payload = {
        name: groupName.toUpperCase(),
        items: validItems.map((i) => ({
          label: i.label.toUpperCase(),
        })),
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
    } catch (error) {
      toast.error("Process failed", { id: loadingToast });
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "specs", id), { isActive: !currentStatus });
      toast.success(currentStatus ? "Group Deactivated" : "Group Activated");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "specs", id));
      toast.success("Specification Group Deleted");
    } catch (error) {
      toast.error("Failed to delete");
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
                Manage and maintain product specification labels.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* --- FORM COLUMN --- */}
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

              {/* --- LIST COLUMN --- */}
              <div className="lg:col-span-7">
                {loading ? (
                  <div className="h-64 flex items-center justify-center">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : specGroups.length === 0 ? (
                  /* ── EMPTY STATE ── */
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
