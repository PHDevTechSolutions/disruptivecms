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
  Settings2,
  Plus,
  X,
  Save,
  Layers,
  Eye,
  EyeOff,
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
  value: string;
}

export default function SpecsMaintenancePage() {
  // --- STATE ---
  const [specGroups, setSpecGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Form States
  const [editId, setEditId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [items, setItems] = useState<SpecItem[]>([{ label: "", value: "" }]);

  // --- 1. DATA FETCHING ---
  useEffect(() => {
    const q = query(collection(db, "specs"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setSpecGroups(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- 2. LOGIC ---
  const addField = () => setItems([...items, { label: "", value: "" }]);

  const removeField = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateField = (index: number, field: keyof SpecItem, value: string) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const resetForm = () => {
    setEditId(null);
    setGroupName("");
    setItems([{ label: "", value: "" }]);
  };

  const handleEditClick = (group: any) => {
    setEditId(group.id);
    setGroupName(group.name);
    setItems(group.items || [{ label: "", value: "" }]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return toast.error("Group name is required");
    
    const validItems = items.filter(i => i.label.trim() !== "");
    if (validItems.length === 0) return toast.error("Add at least one specification");

    setIsSubmitLoading(true);
    const loadingToast = toast.loading(editId ? "Updating Spec Group..." : "Creating Spec Group...");

    try {
      const payload = {
        name: groupName.toUpperCase(),
        items: validItems.map(i => ({
          label: i.label.toUpperCase(),
          value: i.value
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
            {/* --- HEADER --- */}
            <div className="flex items-center gap-4">
              <div className="bg-primary p-3 rounded-xl shadow-sm text-primary-foreground">
                <Settings2 size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-black uppercase italic tracking-tighter">
                  Specs <span className="text-primary">Maintenance</span>
                </h1>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                  Technical Parameter Grouping
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* --- FORM COLUMN --- */}
              <div className="lg:col-span-5">
                <Card className="sticky top-6 border-muted shadow-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-black uppercase tracking-widest text-primary">
                        {editId ? "✏️ Edit Group" : "🏗️ New Spec Group"}
                      </CardTitle>
                      {editId && (
                        <Button onClick={resetForm} variant="ghost" size="sm" className="h-6 text-[9px] font-black uppercase">
                          Cancel
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">
                          Group Name
                        </label>
                        <Input
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                          placeholder="e.g., POWER REQUIREMENTS"
                          className="font-black italic uppercase h-12 border-2"
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">
                            Specifications
                          </label>
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            onClick={addField}
                            className="h-7 text-[9px] font-bold uppercase gap-1"
                          >
                            <Plus size={12} /> Add Row
                          </Button>
                        </div>
                        
                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                          {items.map((item, index) => (
                            <div key={index} className="flex gap-2 items-start group">
                              <div className="grid grid-cols-2 gap-2 flex-1">
                                <Input
                                  placeholder="Label (e.g. Input)"
                                  value={item.label}
                                  onChange={(e) => updateField(index, "label", e.target.value)}
                                  className="text-[11px] font-bold uppercase h-9"
                                />
                                <Input
                                  placeholder="Value (e.g. 220V)"
                                  value={item.value}
                                  onChange={(e) => updateField(index, "value", e.target.value)}
                                  className="text-[11px] h-9"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeField(index)}
                                className="h-9 w-9 text-muted-foreground hover:text-destructive transition-colors"
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
                        className="w-full font-black uppercase text-[10px] h-12 shadow-lg"
                      >
                        {isSubmitLoading ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <><Save size={16} className="mr-2" /> {editId ? "Update Group" : "Save Group"}</>
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
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {specGroups.length === 0 && (
                      <div className="text-center py-20 border-2 border-dashed border-muted rounded-2xl">
                        <p className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">
                          No Specifications Defined
                        </p>
                      </div>
                    )}
                    {specGroups.map((group) => (
                      <Card
                        key={group.id}
                        className={cn(
                          "transition-all duration-300 hover:shadow-md border-muted",
                          !group.isActive && "opacity-60 bg-muted/30"
                        )}
                      >
                        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                          <div className="flex items-center gap-3">
                            <Layers size={16} className="text-primary" />
                            <h3 className="font-black text-sm uppercase italic tracking-tight">
                              {group.name}
                            </h3>
                            <Badge variant={group.isActive ? "default" : "secondary"} className="text-[8px] font-black uppercase px-2 py-0">
                              {group.isActive ? "Active" : "Disabled"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              onClick={() => handleEditClick(group)}
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                            >
                              <Pencil size={14} />
                            </Button>
                            <Button
                              onClick={() => toggleStatus(group.id, group.isActive)}
                              variant="ghost"
                              size="icon"
                              className={cn("h-8 w-8", group.isActive ? "text-blue-500" : "text-muted-foreground")}
                            >
                              {group.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Spec Group?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete the "{group.name}" group and all its parameters.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => handleDelete(group.id)}
                                    className="bg-destructive text-destructive-foreground"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                            {group.items?.map((item: SpecItem, idx: number) => (
                              <div key={idx} className="flex justify-between items-center text-[10px] border-b border-muted last:border-0 pb-1 last:pb-0">
                                <span className="font-black text-muted-foreground uppercase">{item.label}</span>
                                <span className="font-bold text-foreground">{item.value}</span>
                              </div>
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