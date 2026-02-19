"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  Mail,
  Phone,
  FileText,
  Trash2,
  Search,
  User,
  CheckCircle,
  Clock,
  MapPin,
  Building2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from "lucide-react";

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

type FilterType = "all" | "unread" | "read";
type SortType = "newest" | "oldest";

const ITEMS_PER_PAGE = 12;

export default function Quotation() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState<SortType>("newest");
  const [currentPage, setCurrentPage] = useState(1);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "inquiries"),
      where("type", "==", "quotation"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setQuotes(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (error) => {
        console.error(error);
        toast.error("Failed to load quotations.");
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  // Reset page on filter/search change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [searchTerm, filterStatus, sortBy]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleViewDetails = async (quote: any) => {
    setSelectedQuote(quote);
    if (quote.status === "unread") {
      try {
        await updateDoc(doc(db, "inquiries", quote.id), { status: "read" });
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleToggleRead = async (quote: any) => {
    const newStatus = quote.status === "read" ? "unread" : "read";
    try {
      await updateDoc(doc(db, "inquiries", quote.id), { status: newStatus });
      toast.success(`Marked as ${newStatus}`);
      if (selectedQuote?.id === quote.id)
        setSelectedQuote({ ...selectedQuote, status: newStatus });
    } catch {
      toast.error("Failed to update status.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "inquiries", id));
      toast.success("Quote deleted.");
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    } catch {
      toast.error("Failed to delete.");
    }
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => batch.delete(doc(db, "inquiries", id)));
      await batch.commit();
      toast.success(`${selectedIds.length} quote(s) deleted.`);
      setSelectedIds([]);
    } catch {
      toast.error("Failed to delete selected quotes.");
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
      return timestamp.toDate().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  // ── Filter + sort + paginate ──────────────────────────────────────────────
  const processed = quotes
    .filter((q) => {
      const searchMatch =
        `${q.firstName} ${q.lastName} ${q.email ?? ""} ${q.company ?? ""}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
      const statusMatch =
        filterStatus === "all" ? true : q.status === filterStatus;
      return searchMatch && statusMatch;
    })
    .sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      const diff =
        a.createdAt.toDate().getTime() - b.createdAt.toDate().getTime();
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
                  <BreadcrumbPage>Project Quotations</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-4 p-4 md:p-8">
            {/* ── PAGE TITLE + BULK ACTIONS ── */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Project Quotations
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage incoming custom service requests • {processed.length}{" "}
                  total
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
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-none">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-sm font-bold uppercase">
                            Delete Selected Quotes
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-xs">
                            Are you sure you want to delete{" "}
                            <span className="font-semibold">
                              {selectedIds.length}
                            </span>{" "}
                            selected quote(s)? This action cannot be undone.
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

            {/* ── FILTERS ── */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="col-span-2 relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
                  className="pl-8 rounded-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <Select
                value={filterStatus}
                onValueChange={(v) => setFilterStatus(v as FilterType)}
              >
                <SelectTrigger className="rounded-none">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="all" className="text-xs">
                    All
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
                value={sortBy}
                onValueChange={(v) => setSortBy(v as SortType)}
              >
                <SelectTrigger className="rounded-none">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="newest" className="text-xs">
                    Newest First
                  </SelectItem>
                  <SelectItem value="oldest" className="text-xs">
                    Oldest First
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── CARDS ── */}
            {loading ? (
              <div className="flex justify-center py-20">
                <Clock className="animate-spin text-primary" size={32} />
              </div>
            ) : paginated.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                <User className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  No quotations found
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your filters or search term.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {paginated.map((quote) => (
                  <Card
                    key={quote.id}
                    className="rounded-none shadow-none hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => handleViewDetails(quote)}
                  >
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 p-4">
                      {/* Checkbox + title */}
                      <div
                        className="flex items-center gap-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedIds.includes(quote.id)}
                          onCheckedChange={() => toggleSelect(quote.id)}
                        />
                        <div className="space-y-1">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            {quote.status === "unread" && (
                              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                            )}
                            {quote.firstName} {quote.lastName}
                          </CardTitle>
                          <CardDescription className="text-xs flex items-center gap-1">
                            <Building2 size={10} />
                            {quote.company || "Individual"}
                          </CardDescription>
                        </div>
                      </div>

                      <Badge
                        variant={
                          quote.status === "unread" ? "default" : "secondary"
                        }
                        className="rounded-none text-[10px]"
                      >
                        {quote.status === "unread" ? "UNREAD" : "READ"}
                      </Badge>
                    </CardHeader>

                    <CardContent className="p-4 pt-0 space-y-3">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                          <Mail size={10} /> {quote.email}
                        </p>
                        {quote.contactNumber && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Phone size={10} /> {quote.contactNumber}
                          </p>
                        )}
                      </div>

                      {quote.message && (
                        <p className="text-sm text-muted-foreground line-clamp-2 italic">
                          "{quote.message}"
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(quote.createdAt)}
                        </span>

                        {/* Card actions */}
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
                                  Delete Quote
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-xs">
                                  Delete quote from{" "}
                                  <span className="font-semibold">
                                    {quote.firstName} {quote.lastName}
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
                                  onClick={() => handleDelete(quote.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
                            View Record
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* ── PAGINATION ── */}
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

            {/* ── DETAIL DIALOG ── */}
            <Dialog
              open={!!selectedQuote}
              onOpenChange={(open) => !open && setSelectedQuote(null)}
            >
              <DialogContent className="rounded-none max-w-lg">
                {selectedQuote && (
                  <>
                    <DialogHeader>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={
                            selectedQuote.status === "unread"
                              ? "default"
                              : "secondary"
                          }
                          className="rounded-none text-[10px]"
                        >
                          {selectedQuote.status?.toUpperCase()}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock size={10} />
                          {formatDate(selectedQuote.createdAt)}
                        </span>
                      </div>
                      <DialogTitle className="text-xl">
                        {selectedQuote.firstName} {selectedQuote.lastName}
                      </DialogTitle>
                      {selectedQuote.company && (
                        <DialogDescription className="text-xs flex items-center gap-1">
                          <Building2 size={10} /> {selectedQuote.company}
                        </DialogDescription>
                      )}
                    </DialogHeader>

                    <Separator className="my-2" />

                    {/* Contact + Address */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-2">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                          <Mail size={11} /> Contact
                        </p>
                        <p className="text-sm font-medium">
                          {selectedQuote.email}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {selectedQuote.contactNumber || "No phone provided"}
                        </p>
                      </div>
                      {selectedQuote.streetAddress && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                            <MapPin size={11} /> Address
                          </p>
                          <p className="text-sm font-medium leading-relaxed">
                            {selectedQuote.streetAddress}
                          </p>
                        </div>
                      )}
                    </div>

                    <Separator className="my-2" />

                    {/* Message */}
                    <div className="py-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5 mb-2">
                        <MessageSquare size={11} /> Client Message
                      </p>
                      <p className="text-sm leading-relaxed italic text-foreground">
                        "{selectedQuote.message || "No message provided."}"
                      </p>
                    </div>

                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between sm:items-center pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-none"
                        onClick={() => handleToggleRead(selectedQuote)}
                      >
                        <CheckCircle className="mr-1 h-3 w-3" />
                        {selectedQuote.status === "unread"
                          ? "Mark Read"
                          : "Mark Unread"}
                      </Button>

                      {selectedQuote.attachmentUrl ? (
                        <Button size="sm" className="rounded-none" asChild>
                          <a
                            href={selectedQuote.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <FileText className="mr-1 h-3 w-3" /> Download Brief
                          </a>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="rounded-none"
                          variant="secondary"
                          disabled
                        >
                          <FileText className="mr-1 h-3 w-3" /> No Attachment
                        </Button>
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
