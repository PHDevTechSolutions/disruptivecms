"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  Mail,
  Phone,
  Trash2,
  Search,
  Clock,
  MessageSquare,
  User,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Separator } from "@/components/ui/separator";
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

type FilterStatus = "all" | "unread" | "read";
type SortType = "newest" | "oldest";

interface Inquiry {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  message: string;
  submittedAt: any;
  status?: string;
  website?: string;
}

const ITEMS_PER_PAGE = 12;

export default function CustomerInquiries() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<SortType>("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedWebsite, setSelectedWebsite] = useState<string>("all");
  const [availableWebsites, setAvailableWebsites] = useState<any[]>([]);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const COLLECTION_NAME = "inquiries";

  useEffect(() => {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy("submittedAt", "desc"),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setInquiries(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Inquiry[],
        );
        setLoading(false);
      },
      (error) => {
        console.error(error);
        toast.error("Failed to load inquiries.");
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "websites"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAvailableWebsites(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
      );
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [searchTerm, filterStatus, sortBy, selectedWebsite]);

  const handleViewInquiry = async (item: Inquiry) => {
    setSelectedInquiry(item);
    if (item.status !== "read") {
      try {
        await updateDoc(doc(db, COLLECTION_NAME, item.id), { status: "read" });
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleToggleRead = async (item: Inquiry) => {
    const newStatus = item.status === "read" ? "unread" : "read";
    try {
      await updateDoc(doc(db, COLLECTION_NAME, item.id), { status: newStatus });
      toast.success(`Marked as ${newStatus}`);
      if (selectedInquiry?.id === item.id)
        setSelectedInquiry({ ...selectedInquiry, status: newStatus });
    } catch {
      toast.error("Failed to update status.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, id));
      toast.success("Inquiry deleted.");
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      if (selectedInquiry?.id === id) setSelectedInquiry(null);
    } catch {
      toast.error("Failed to delete.");
    }
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => batch.delete(doc(db, COLLECTION_NAME, id)));
      await batch.commit();
      toast.success(`${selectedIds.length} inquiry(s) deleted.`);
      setSelectedIds([]);
    } catch {
      toast.error("Failed to delete selected inquiries.");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );

  const toggleSelectAll = () => {
    if (selectedIds.length === paginated.length) setSelectedIds([]);
    else setSelectedIds(paginated.map((q) => q.id));
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A";
    try {
      return timestamp.toDate().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "N/A";
    }
  };

  const processed = inquiries
    .filter((item) => {
      const matchesSearch =
        item.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.email?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesWebsite =
        selectedWebsite === "all" || item.website === selectedWebsite;
      const matchesStatus =
        filterStatus === "all" || item.status === filterStatus;
      return matchesSearch && matchesWebsite && matchesStatus;
    })
    .sort((a, b) => {
      if (!a.submittedAt || !b.submittedAt) return 0;
      const diff =
        a.submittedAt.toDate().getTime() - b.submittedAt.toDate().getTime();
      return sortBy === "newest" ? -diff : diff;
    });

  const totalPages = Math.ceil(processed.length / ITEMS_PER_PAGE);
  const paginated = processed.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

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
                  <BreadcrumbPage>Customer Inquiries</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-4 p-4 md:p-8">
            {/* PAGE TITLE + BULK ACTIONS */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Customer Inquiries
                </h1>
                <p className="text-sm text-muted-foreground">
                  General messages and project leads • {processed.length} total
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedIds.length > 0 && (
                  <div className="flex items-center gap-2 border-r pr-2 mr-2">
                    <span className="text-xs text-muted-foreground">
                      {selectedIds.length} selected
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="rounded-none"
                          disabled={isDeleting}
                        >
                          <Trash2 className="mr-1 h-3 w-3" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-none">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-sm font-bold uppercase">
                            Delete Selected Inquiries
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-xs">
                            Are you sure you want to delete{" "}
                            <span className="font-semibold">
                              {selectedIds.length}
                            </span>{" "}
                            selected inquiry(s)? This action cannot be undone.
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
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-none"
                  onClick={toggleSelectAll}
                >
                  {selectedIds.length === paginated.length &&
                  paginated.length > 0
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>
            </div>

            {/* FILTERS */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="col-span-2 relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  className="pl-8 rounded-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select
                value={filterStatus}
                onValueChange={(v) => setFilterStatus(v as FilterStatus)}
              >
                <SelectTrigger className="rounded-none">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="all" className="text-xs">
                    All Status
                  </SelectItem>
                  <SelectItem value="unread" className="text-xs">
                    Unread
                  </SelectItem>
                  <SelectItem value="read" className="text-xs">
                    Read
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={selectedWebsite}
                onValueChange={setSelectedWebsite}
              >
                <SelectTrigger className="rounded-none">
                  <SelectValue placeholder="Website" />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="all" className="text-xs">
                    All Websites
                  </SelectItem>
                  {availableWebsites.map((website) => (
                    <SelectItem
                      key={website.id}
                      value={website.name || website.id}
                      className="text-xs"
                    >
                      {website.name || website.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* CARDS */}
            {loading ? (
              <div className="flex justify-center py-20">
                <Clock className="animate-spin text-primary" size={32} />
              </div>
            ) : paginated.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                <User className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  No inquiries found
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your filters or search term.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {paginated.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                    >
                      <Card
                        className="rounded-none shadow-none hover:bg-accent/50 cursor-pointer transition-colors"
                        onClick={() => handleViewInquiry(item)}
                      >
                        <CardHeader className="flex flex-row items-start justify-between space-y-0 p-4">
                          <div
                            className="flex items-center gap-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={selectedIds.includes(item.id)}
                              onCheckedChange={() => toggleSelect(item.id)}
                            />
                            <div className="space-y-1">
                              <CardTitle className="text-sm font-medium flex items-center gap-2">
                                {item.status !== "read" && (
                                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                                )}
                                {item.fullName}
                              </CardTitle>
                              <CardDescription className="text-xs flex items-center gap-1">
                                <Mail size={10} /> {item.email}
                              </CardDescription>
                            </div>
                          </div>
                          <Badge
                            variant={
                              item.status !== "read" ? "default" : "secondary"
                            }
                            className="rounded-none text-[10px]"
                          >
                            {item.status !== "read" ? "UNREAD" : "READ"}
                          </Badge>
                        </CardHeader>

                        <CardContent className="p-4 pt-0 space-y-3">
                          {item.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Phone size={10} /> {item.phone}
                            </p>
                          )}
                          {item.message && (
                            <p className="text-sm text-muted-foreground line-clamp-2 italic">
                              "{item.message}"
                            </p>
                          )}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-muted-foreground">
                              {formatDate(item.submittedAt)}
                            </span>
                            <div
                              className="flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-none text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 size={13} />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-none">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="text-sm font-bold uppercase">
                                      Delete Inquiry
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="text-xs">
                                      Delete inquiry from{" "}
                                      <span className="font-semibold">
                                        {item.fullName}
                                      </span>
                                      ? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-none text-xs">
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      className="rounded-none bg-destructive text-xs"
                                      onClick={() => handleDelete(item.id)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
                                View
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(currentPage * ITEMS_PER_PAGE, processed.length)} of{" "}
                  {processed.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-none"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page = i + 1;
                    if (totalPages > 5) {
                      if (currentPage <= 3) page = i + 1;
                      else if (currentPage >= totalPages - 2)
                        page = totalPages - 4 + i;
                      else page = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="icon"
                        className="h-8 w-8 rounded-none text-xs"
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Button>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-none"
                    disabled={currentPage === totalPages}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}

            {/* DETAIL DIALOG */}
            <Dialog
              open={!!selectedInquiry}
              onOpenChange={(open) => !open && setSelectedInquiry(null)}
            >
              <DialogContent className="rounded-none max-w-lg">
                {selectedInquiry && (
                  <>
                    <DialogHeader>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={
                            selectedInquiry.status !== "read"
                              ? "default"
                              : "secondary"
                          }
                          className="rounded-none text-[10px]"
                        >
                          {selectedInquiry.status !== "read"
                            ? "UNREAD"
                            : "READ"}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock size={10} />{" "}
                          {formatDate(selectedInquiry.submittedAt)}
                        </span>
                      </div>
                      <DialogTitle className="text-xl">
                        {selectedInquiry.fullName}
                      </DialogTitle>
                      <DialogDescription className="text-xs flex items-center gap-1">
                        <Mail size={10} /> {selectedInquiry.email}
                      </DialogDescription>
                    </DialogHeader>

                    <Separator className="my-2" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-2">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                          <Mail size={11} /> Email
                        </p>
                        <p className="text-sm font-medium break-words">
                          {selectedInquiry.email}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                          <Phone size={11} /> Phone
                        </p>
                        <p className="text-sm font-medium">
                          {selectedInquiry.phone || "Not provided"}
                        </p>
                      </div>
                    </div>

                    <Separator className="my-2" />

                    <div className="py-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5 mb-2">
                        <MessageSquare size={11} /> Message
                      </p>
                      <p className="text-sm leading-relaxed italic text-foreground">
                        "{selectedInquiry.message || "No message provided."}"
                      </p>
                    </div>

                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between sm:items-center pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-none"
                        onClick={() => handleToggleRead(selectedInquiry)}
                      >
                        <CheckCircle className="mr-1 h-3 w-3" />
                        {selectedInquiry.status !== "read"
                          ? "Mark as Read"
                          : "Mark as Unread"}
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="rounded-none"
                          >
                            <Trash2 className="mr-1 h-3 w-3" /> Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-none">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-sm font-bold uppercase">
                              Delete Inquiry
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-xs">
                              Delete inquiry from{" "}
                              <span className="font-semibold">
                                {selectedInquiry.fullName}
                              </span>
                              ? This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-none text-xs">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="rounded-none bg-destructive text-xs"
                              onClick={() => handleDelete(selectedInquiry.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
