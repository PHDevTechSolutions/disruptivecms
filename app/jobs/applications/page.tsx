"use client";

import * as React from "react";
import { useEffect, useState } from "react";
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
} from "firebase/firestore";
import {
  Mail,
  Phone,
  Calendar,
  Briefcase,
  Trash2,
  Search,
  User,
  CheckCircle,
  Download,
} from "lucide-react";

// Sidebar Components
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import BroadcastDialog from "@/components/broadcastdialog";

interface JobApplication {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  resumeUrl: string;
  website: string;
  status: string;
  internalStatus: string;
  appliedAt: any;
}

export default function ApplicationInquiries() {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedWebsite, setSelectedWebsite] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const itemsPerPage = 10;

  useEffect(() => {
    const q = query(
      collection(db, "inquiries"),
      where("type", "==", "job"),
      orderBy("appliedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const appList = snapshot.docs.map(
          (doc) => ({
            id: doc.id,
            ...doc.data(),
          } as JobApplication)
        );
        setApplications(appList);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching applications:", error);
        toast.error("Failed to load applications");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return "---";
    const date = timestamp.toDate();
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  };

  const markAsRead = async (id: string, currentStatus: string) => {
    if (currentStatus === "unread") {
      try {
        await updateDoc(doc(db, "inquiries", id), { status: "read" });
        toast.success("Marked as read");
      } catch (error) {
        console.error("Error marking as read:", error);
        toast.error("Failed to update status");
      }
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this application?")) {
      try {
        await deleteDoc(doc(db, "inquiries", id));
        if (selectedApp?.id === id) setSelectedApp(null);
        toast.success("Application deleted");
      } catch (error) {
        console.error("Error deleting:", error);
        toast.error("Failed to delete application");
      }
    }
  };

  const toggleInternalStatus = async (
    e: React.MouseEvent,
    id: string,
    currentStatus: string
  ) => {
    e.stopPropagation();
    const nextStatus = currentStatus === "reviewed" ? "pending" : "reviewed";
    try {
      await updateDoc(doc(db, "inquiries", id), {
        internalStatus: nextStatus,
      });
      toast.success(`Status updated to ${nextStatus}`);
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  const handleDownloadCV = (app: JobApplication) => {
    if (!app.resumeUrl) {
      toast.error("No CV available");
      return;
    }

    const cleanResumeUrl = app.resumeUrl
      .replace("/f_auto,q_auto/", "/")
      .replace("/upload/", "/upload/fl_attachment/");

    const link = document.createElement("a");
    link.href = cleanResumeUrl;
    link.download = `${app.fullName.replace(/\s+/g, "_")}_CV.pdf`;
    link.target = "_self";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredApps = applications.filter((app) => {
    const matchesSearch =
      app.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.jobTitle?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesWebsite =
      selectedWebsite === "all" || app.website === selectedWebsite;
    const matchesStatus =
      selectedStatus === "all" || app.status === selectedStatus;

    return matchesSearch && matchesWebsite && matchesStatus;
  });

  // Get unique websites from applications
  const websites = [
    ...Array.from(new Set(applications.map((app) => app.website).filter(Boolean))),
  ];

  // Pagination
  const totalPages = Math.ceil(filteredApps.length / itemsPerPage);
  const paginatedApps = filteredApps.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedWebsite, selectedStatus]);

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
                  <BreadcrumbPage>Job Applications</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-4 p-4 md:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Job Applications
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage resumes and candidate applications.
                </p>
              </div>
              
              {/* BroadcastDialog moved here */}
              <BroadcastDialog />
            </div>

            {/* Filters */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="col-span-2 relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search candidates..."
                  className="pl-8 rounded-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="rounded-none">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedWebsite} onValueChange={setSelectedWebsite}>
                <SelectTrigger className="rounded-none">
                  <SelectValue placeholder="All Websites" />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="all">All Websites</SelectItem>
                  {websites.map((website) => (
                    <SelectItem key={website} value={website}>
                      {website}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Results Count */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium">
                {filteredApps.length} result{filteredApps.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Applications Grid */}
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="text-sm text-muted-foreground">
                  Loading applications...
                </div>
              </div>
            ) : paginatedApps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-none">
                <User className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-sm font-semibold mb-1">No applications found</h3>
                <p className="text-xs text-muted-foreground">
                  Try adjusting your filters
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {paginatedApps.map((app) => (
                  <Card
                    key={app.id}
                    className={`rounded-none shadow-none hover:bg-accent/50 cursor-pointer transition-colors ${
                      app.status === "unread" ? "border-l-4 border-l-primary" : ""
                    }`}
                    onClick={() => {
                      setSelectedApp(app);
                      markAsRead(app.id, app.status);
                    }}
                  >
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 p-4">
                      <div className="flex items-start gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-none bg-muted flex items-center justify-center shrink-0">
                            <User className="h-5 w-5 text-muted-foreground" />
                          </div>
                          {app.status === "unread" && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full border-2 border-background" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold leading-none">
                            {app.fullName}
                          </h3>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Briefcase className="h-3 w-3" />
                            {app.jobTitle}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant={
                          app.internalStatus === "reviewed"
                            ? "default"
                            : "secondary"
                        }
                        className="rounded-none text-[10px]"
                      >
                        {app.internalStatus === "reviewed" ? "REVIEWED" : "PENDING"}
                      </Badge>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-none"
                            onClick={(e) =>
                              toggleInternalStatus(e, app.id, app.internalStatus)
                            }
                          >
                            <CheckCircle
                              className={`h-4 w-4 ${
                                app.internalStatus === "reviewed"
                                  ? "text-green-600"
                                  : "text-muted-foreground"
                              }`}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-none text-destructive"
                            onClick={(e) => handleDelete(e, app.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span className="text-[10px]">
                            {formatDateTime(app.appliedAt)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-4 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-none"
                >
                  Previous
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="rounded-none w-9 h-9 p-0"
                    >
                      {page}
                    </Button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="rounded-none"
                >
                  Next
                </Button>
              </div>
            )}

            {/* Page Info */}
            {filteredApps.length > 0 && (
              <div className="text-center text-xs text-muted-foreground">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                {Math.min(currentPage * itemsPerPage, filteredApps.length)} of{" "}
                {filteredApps.length} applications
              </div>
            )}

            {/* Application Detail Dialog */}
            <Dialog
              open={!!selectedApp}
              onOpenChange={(open) => !open && setSelectedApp(null)}
            >
              <DialogContent className="rounded-none max-w-3xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
                {selectedApp && (
                  <>
                    <DialogHeader className="px-8 pt-8 pb-4 border-b shrink-0">
                      <div className="flex items-center gap-6">
                        <div className="w-20 h-20 rounded-none bg-muted flex items-center justify-center shrink-0">
                          <User className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <DialogTitle className="text-2xl font-bold">
                            {selectedApp.fullName}
                          </DialogTitle>
                          <DialogDescription className="text-sm uppercase tracking-wider mt-1">
                            {selectedApp.jobTitle}
                          </DialogDescription>
                        </div>
                      </div>
                    </DialogHeader>

                    <ScrollArea className="flex-1 min-h-0">
                      <div className="p-8 space-y-8">
                        {/* Email */}
                        <div className="flex items-start gap-5">
                          <div className="w-14 h-14 rounded-none bg-muted flex items-center justify-center shrink-0">
                            <Mail className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                              Email Address
                            </p>
                            <p className="text-base font-medium break-all">
                              {selectedApp.email}
                            </p>
                          </div>
                        </div>

                        {/* Phone and Applied On in a row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="flex items-start gap-5">
                            <div className="w-14 h-14 rounded-none bg-muted flex items-center justify-center shrink-0">
                              <Phone className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                Phone Number
                              </p>
                              <p className="text-base font-medium">
                                {selectedApp.phone}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-5">
                            <div className="w-14 h-14 rounded-none bg-muted flex items-center justify-center shrink-0">
                              <Calendar className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                Applied On
                              </p>
                              <p className="text-base font-medium">
                                {formatDateTime(selectedApp.appliedAt)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Status */}
                        <div className="flex items-start gap-5">
                          <div className="w-14 h-14 rounded-none bg-muted flex items-center justify-center shrink-0">
                            <Briefcase className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                              Status
                            </p>
                            <Badge
                              variant={
                                selectedApp.internalStatus === "reviewed"
                                  ? "default"
                                  : "secondary"
                              }
                              className="rounded-none text-xs px-4 py-2"
                            >
                              {selectedApp.internalStatus === "reviewed"
                                ? "REVIEWED"
                                : "PENDING"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </ScrollArea>

                    <div className="border-t px-8 py-4 flex flex-col sm:flex-row gap-3 sm:justify-start shrink-0 bg-muted/30">
                      <Button
                        variant="outline"
                        className="rounded-none w-full sm:flex-1 h-12 text-sm"
                        onClick={(e) => {
                          e.preventDefault();
                          toggleInternalStatus(
                            e as any,
                            selectedApp.id,
                            selectedApp.internalStatus
                          );
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Mark as Reviewed
                      </Button>

                      <Button
                        variant="default"
                        className="rounded-none w-full sm:flex-1 h-12 text-sm"
                        onClick={(e) => {
                          e.preventDefault();
                          handleDownloadCV(selectedApp);
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download CV
                      </Button>

                      <Button
                        variant="destructive"
                        className="rounded-none h-12 px-6"
                        onClick={(e) => {
                          e.preventDefault();
                          if (
                            confirm(
                              "Are you sure you want to delete this application?"
                            )
                          ) {
                            handleDelete(e as any, selectedApp.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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