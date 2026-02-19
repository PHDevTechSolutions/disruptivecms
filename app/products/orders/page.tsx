"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  deleteDoc,
  where,
  limit,
} from "firebase/firestore";
import {
  Mail,
  Phone,
  MapPin,
  Package,
  Clock,
  User,
  Trash2,
  CheckCircle2,
  Search,
  RotateCcw,
  MessageSquare,
  ChevronRight,
  Check,
  ListFilter,
  Calendar,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SidebarInset,
  SidebarTrigger,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { toast } from "sonner";

const STATUS_MAP = {
  pending: { label: "Pending", variant: "secondary" as const },
  reviewed: { label: "Reviewed", variant: "default" as const },
  finished: { label: "Finished", variant: "outline" as const },
};

export default function InquiriesPanel() {
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [viewLimit, setViewLimit] = useState(20);

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "inquiries"),
      where("type", "==", "product"),
      orderBy("createdAt", "desc"),
      limit(viewLimit),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInquiries(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [viewLimit]);

  // ── Status logic (unchanged from original) ────────────────────────────────
  const updateStatus = async (id: string, nextStatus: string) => {
    try {
      await updateDoc(doc(db, "inquiries", id), { status: nextStatus });
      if (selectedInquiry?.id === id) {
        setSelectedInquiry({ ...selectedInquiry, status: nextStatus });
      }
      toast.success(`Status updated to ${nextStatus}`);
    } catch (error) {
      toast.error("Failed to update status.");
    }
  };

  const handleNextStage = (inq: any) => {
    if (inq.status === "pending") {
      updateStatus(inq.id, "reviewed");
    } else if (inq.status === "reviewed") {
      if (
        confirm(
          "Move this order to Finished? This action will mark it as complete.",
        )
      ) {
        updateStatus(inq.id, "finished");
      }
    }
  };

  const handleUndo = (id: string) => {
    if (confirm("Revert this order back to Reviewed status?")) {
      updateStatus(id, "reviewed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      await deleteDoc(doc(db, "inquiries", id));
      setSelectedInquiry(null);
      toast.success("Inquiry deleted.");
    } catch {
      toast.error("Failed to delete.");
    }
  };

  const filteredInquiries = inquiries.filter((inq) => {
    const fullName =
      `${inq.customerDetails?.firstName} ${inq.customerDetails?.lastName}`.toLowerCase();
    const matchesSearch = fullName.includes(searchTerm.toLowerCase());
    const matchesDate = dateFilter
      ? inq.createdAt?.toDate().toISOString().split("T")[0] === dateFilter
      : true;
    return matchesSearch && matchesDate;
  });

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
                  <BreadcrumbPage>Inquiries & Orders</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-4 p-4 md:p-8">
            {/* ── PAGE TITLE + ACTIONS ── */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Inquiries & Orders
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage and process product quote requests.
                </p>
              </div>
            </div>

            {/* ── FILTERS ── */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="col-span-2 relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customer name..."
                  className="pl-8 rounded-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Input
                type="date"
                className="rounded-none"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
              <Select
                value={String(viewLimit)}
                onValueChange={(v) => setViewLimit(Number(v))}
              >
                <SelectTrigger className="rounded-none">
                  <ListFilter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Limit" />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  {[20, 50, 100, 200, 1000].map((v) => (
                    <SelectItem key={v} value={String(v)} className="text-xs">
                      Show {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── INQUIRY CARDS ── */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {loading ? (
                <div className="col-span-3 flex justify-center py-20">
                  <Clock className="animate-spin text-primary" size={32} />
                </div>
              ) : filteredInquiries.length === 0 ? (
                <div className="col-span-3 flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                    No Inquiries Found
                  </p>
                </div>
              ) : (
                filteredInquiries.map((inq) => {
                  const statusConfig =
                    STATUS_MAP[inq.status as keyof typeof STATUS_MAP] ??
                    STATUS_MAP.pending;
                  return (
                    <Card
                      key={inq.id}
                      className="rounded-none shadow-none hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedInquiry(inq)}
                    >
                      <CardHeader className="flex flex-row items-start justify-between space-y-0 p-4">
                        <div className="space-y-1">
                          <CardTitle className="text-sm font-medium">
                            {inq.customerDetails?.firstName}{" "}
                            {inq.customerDetails?.lastName}
                          </CardTitle>
                          <CardDescription className="text-xs flex items-center gap-1">
                            <Package size={10} />
                            {inq.items?.length || 0} item
                            {inq.items?.length !== 1 ? "s" : ""}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={statusConfig.variant}
                          className="rounded-none text-[10px]"
                        >
                          {statusConfig.label.toUpperCase()}
                        </Badge>
                      </CardHeader>

                      <CardContent className="p-4 pt-0 space-y-3">
                        {/* Contact snippet */}
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                            <Mail size={10} />
                            {inq.customerDetails?.email || "—"}
                          </p>
                          {inq.customerDetails?.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Phone size={10} />
                              {inq.customerDetails.phone}
                            </p>
                          )}
                        </div>

                        {/* Note snippet */}
                        {inq.customerDetails?.orderNotes && (
                          <p className="text-sm text-muted-foreground line-clamp-2 italic">
                            "{inq.customerDetails.orderNotes}"
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {inq.createdAt
                              ? inq.createdAt
                                  .toDate()
                                  .toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })
                              : "N/A"}
                          </span>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
                            View Record
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            {/* ── DETAIL DIALOG ── */}
            <Dialog
              open={!!selectedInquiry}
              onOpenChange={(open) => !open && setSelectedInquiry(null)}
            >
              <DialogContent className="rounded-none max-w-2xl max-h-[90vh] overflow-y-auto">
                {selectedInquiry && (
                  <>
                    <DialogHeader>
                      <div className="flex items-center gap-3 mb-1">
                        <Badge
                          variant={
                            STATUS_MAP[
                              selectedInquiry.status as keyof typeof STATUS_MAP
                            ]?.variant ?? "secondary"
                          }
                          className="rounded-none text-[10px]"
                        >
                          {selectedInquiry.status?.toUpperCase()}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock size={10} />
                          {selectedInquiry.createdAt
                            ?.toDate()
                            .toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                        </span>
                      </div>
                      <DialogTitle className="text-xl">
                        {selectedInquiry.customerDetails?.firstName}{" "}
                        {selectedInquiry.customerDetails?.lastName}
                      </DialogTitle>
                      <DialogDescription className="text-xs">
                        {selectedInquiry.customerDetails?.email}
                        {selectedInquiry.customerDetails?.phone &&
                          ` • ${selectedInquiry.customerDetails.phone}`}
                      </DialogDescription>
                    </DialogHeader>

                    <Separator className="my-2" />

                    {/* Contact + Address */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                          <Mail size={11} /> Contact
                        </p>
                        <p className="text-sm font-medium">
                          {selectedInquiry.customerDetails?.email}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {selectedInquiry.customerDetails?.phone ||
                            "No phone provided"}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                          <MapPin size={11} /> Address
                        </p>
                        <p className="text-sm font-medium leading-relaxed">
                          {selectedInquiry.customerDetails?.streetAddress}
                        </p>
                        {selectedInquiry.customerDetails?.apartment && (
                          <p className="text-sm text-muted-foreground">
                            {selectedInquiry.customerDetails.apartment}
                          </p>
                        )}
                      </div>
                    </div>

                    <Separator className="my-2" />

                    {/* Customer Notes */}
                    <div className="py-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5 mb-2">
                        <MessageSquare size={11} /> Customer Notes
                      </p>
                      <p className="text-sm leading-relaxed italic text-foreground">
                        "
                        {selectedInquiry.customerDetails?.orderNotes ||
                          "No specific instructions provided."}
                        "
                      </p>
                    </div>

                    <Separator className="my-2" />

                    {/* Items */}
                    <div className="space-y-3 py-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                        <Package size={11} /> Item Summary (
                        {selectedInquiry.items?.length || 0})
                      </p>
                      <div className="grid gap-2">
                        {selectedInquiry.items?.map((item: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-3 border rounded-none bg-muted/30"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-background border rounded-none flex items-center justify-center">
                                <img
                                  src={item.image}
                                  className="w-8 h-8 object-contain"
                                  alt=""
                                />
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase">
                                  {item.name}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  SKU: {item.sku}
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant="secondary"
                              className="rounded-none text-[10px]"
                            >
                              QTY {item.quantity}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between sm:items-center pt-2">
                      {/* Left: Undo + Delete */}
                      <div className="flex gap-2">
                        {selectedInquiry.status === "finished" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-none"
                            onClick={() => handleUndo(selectedInquiry.id)}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" /> Undo
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          className="rounded-none"
                          onClick={() => handleDelete(selectedInquiry.id)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" /> Delete
                        </Button>
                      </div>

                      {/* Right: Stage action */}
                      {selectedInquiry.status !== "finished" ? (
                        <Button
                          className="rounded-none"
                          onClick={() => handleNextStage(selectedInquiry)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {selectedInquiry.status === "reviewed"
                            ? "Confirm Finish"
                            : "Mark Reviewed"}
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Check className="h-4 w-4 text-primary" />
                          Completed
                        </div>
                      )}
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
