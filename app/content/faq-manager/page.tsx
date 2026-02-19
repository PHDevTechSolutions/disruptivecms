"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  deleteDoc,
  doc,
  updateDoc,
  orderBy,
} from "firebase/firestore";
import {
  Trash2,
  Plus,
  RotateCcw,
  X,
  Check,
  MessageSquare,
  FolderPlus,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  icon: string;
}

const ICON_OPTIONS = ["🚀", "📩", "🛠️", "💡", "❓"];

export default function FAQEditor() {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [icon, setIcon] = useState("🚀");

  // Inline edit states
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    question: "",
    answer: "",
    icon: "",
  });

  useEffect(() => {
    const q = query(
      collection(db, "faq_settings"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFaqs(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as FAQItem[],
      );
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question) return toast.error("Question is required.");
    if (!answer) return toast.error("Answer is required.");

    setIsSubmitLoading(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "faq_settings", editingId), {
          question,
          answer,
          icon,
        });
        toast.success("FAQ updated successfully");
      } else {
        await addDoc(collection(db, "faq_settings"), {
          question,
          answer,
          icon,
          createdAt: new Date(),
        });
        toast.success("FAQ entry added");
      }
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save FAQ entry.");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setQuestion("");
    setAnswer("");
    setIcon("🚀");
  };

  const handleEditClick = (faq: FAQItem) => {
    setEditingId(faq.id);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setIcon(faq.icon);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startInlineEdit = (faq: FAQItem) => {
    setInlineEditId(faq.id);
    setEditForm({ question: faq.question, answer: faq.answer, icon: faq.icon });
  };

  const handleInlineUpdate = async (id: string) => {
    await updateDoc(doc(db, "faq_settings", id), {
      question: editForm.question,
      answer: editForm.answer,
      icon: editForm.icon,
    });
    setInlineEditId(null);
    toast.success("FAQ updated");
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
                  <BreadcrumbPage>FAQ Manager</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                FAQ Manager
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage automated responses for your chat widget.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* ── FORM ── */}
              <div className="lg:col-span-4 sticky top-6 z-10">
                <Card className="rounded-none shadow-none border-foreground/10">
                  <CardHeader className="border-b py-4 flex flex-row items-center justify-between space-y-0 sticky top-0 bg-background z-10">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest">
                      {editingId ? "Update Entry" : "Add New Entry"}
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
                    {/* Icon */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Icon
                      </label>
                      <Select value={icon} onValueChange={setIcon}>
                        <SelectTrigger className="rounded-none h-10 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-none">
                          {ICON_OPTIONS.map((ic) => (
                            <SelectItem key={ic} value={ic} className="text-sm">
                              {ic}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Question */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Question
                      </label>
                      <Input
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="E.G. How can I contact support?"
                        className="rounded-none h-10 text-xs"
                      />
                    </div>

                    {/* Answer */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase opacity-60">
                        Bot Response
                      </label>
                      <Textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Enter the automated response..."
                        className="rounded-none min-h-[80px] text-xs resize-none"
                      />
                    </div>

                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitLoading}
                      className="w-full rounded-none uppercase font-bold text-[10px] h-11 tracking-widest"
                    >
                      {isSubmitLoading ? (
                        <Loader2 className="animate-spin h-4 w-4" />
                      ) : editingId ? (
                        "Push Update"
                      ) : (
                        <>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add Entry
                        </>
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
                ) : faqs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mb-4 shadow-sm">
                      <FolderPlus className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                      No FAQs
                    </h3>
                    <p className="text-[11px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
                      No entries yet. Add a new FAQ using the panel on the left
                      to begin.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 mb-3">
                      Active Entries ({faqs.length})
                    </p>
                    {faqs.map((faq) => (
                      <Card
                        key={faq.id}
                        className="rounded-none shadow-none border-foreground/10 group"
                      >
                        <CardContent className="p-4">
                          {inlineEditId === faq.id ? (
                            /* ── INLINE EDIT ROW ── */
                            <div className="grid grid-cols-12 gap-3 items-center">
                              <div className="col-span-1">
                                <Select
                                  value={editForm.icon}
                                  onValueChange={(v) =>
                                    setEditForm({ ...editForm, icon: v })
                                  }
                                >
                                  <SelectTrigger className="rounded-none h-9 text-sm px-2">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-none">
                                    {ICON_OPTIONS.map((ic) => (
                                      <SelectItem
                                        key={ic}
                                        value={ic}
                                        className="text-sm"
                                      >
                                        {ic}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="col-span-4">
                                <Input
                                  value={editForm.question}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      question: e.target.value,
                                    })
                                  }
                                  className="rounded-none h-9 text-xs font-bold"
                                />
                              </div>
                              <div className="col-span-5">
                                <Input
                                  value={editForm.answer}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      answer: e.target.value,
                                    })
                                  }
                                  className="rounded-none h-9 text-xs"
                                />
                              </div>
                              <div className="col-span-2 flex gap-1.5 justify-end">
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="h-8 w-8 rounded-none bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700"
                                  onClick={() => handleInlineUpdate(faq.id)}
                                >
                                  <Check size={13} />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 rounded-none"
                                  onClick={() => setInlineEditId(null)}
                                >
                                  <X size={13} />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            /* ── DISPLAY ROW ── */
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4 min-w-0">
                                <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-muted rounded-none border text-xl">
                                  {faq.icon}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-[11px] font-black uppercase truncate text-foreground">
                                    {faq.question}
                                  </h4>
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1 italic uppercase">
                                    {faq.answer}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="h-7 w-7 rounded-none shadow-sm"
                                  onClick={() => startInlineEdit(faq)}
                                >
                                  <MessageSquare size={12} />
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
                                        Delete "{faq.question}"? This cannot be
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
                                          deleteDoc(
                                            doc(db, "faq_settings", faq.id),
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
                          )}
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
