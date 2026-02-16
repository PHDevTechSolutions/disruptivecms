"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Save,
  Briefcase,
  MapPin,
  Clock,
  ListChecks,
  RotateCcw,
  FolderPlus,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toast } from "sonner";

interface JobVacancy {
  id: string;
  title: string;
  category: string;
  jobType: string;
  location: string;
  qualifications: string[];
  status: string;
  createdAt: any;
  updatedAt: any;
}

export default function CareersManager() {
  const [jobs, setJobs] = useState<JobVacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Form States
  const [editId, setEditId] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [category, setCategory] = useState("Sales");
  const [jobType, setJobType] = useState("Full Time");
  const [location, setLocation] = useState("");
  const [qualifications, setQualifications] = useState<string[]>([""]);
  const [status, setStatus] = useState("Open");

  useEffect(() => {
    const q = query(collection(db, "careers"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setJobs(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as JobVacancy,
          ),
        );
        setLoading(false);
      },
      (error) => {
        console.error("Fetch error:", error);
        toast.error("Failed to load job vacancies");
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  const addQualification = () => setQualifications([...qualifications, ""]);

  const removeQualification = (index: number) => {
    setQualifications(qualifications.filter((_, i) => i !== index));
  };

  const updateQualification = (index: number, value: string) => {
    const newQuals = [...qualifications];
    newQuals[index] = value;
    setQualifications(newQuals);
  };

  const resetForm = () => {
    setEditId(null);
    setJobTitle("");
    setCategory("Sales");
    setJobType("Full Time");
    setLocation("");
    setQualifications([""]);
    setStatus("Open");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const filteredQuals = qualifications.filter((q) => q.trim() !== "");

    if (!jobTitle || filteredQuals.length === 0 || !location) {
      return toast.error(
        "Title, Location, and at least one Qualification are required",
      );
    }

    setIsSubmitLoading(true);
    try {
      const jobData = {
        title: jobTitle,
        category,
        jobType,
        location,
        qualifications: filteredQuals,
        status,
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await updateDoc(doc(db, "careers", editId), jobData);
        toast.success("Job vacancy updated");
      } else {
        await addDoc(collection(db, "careers"), {
          ...jobData,
          createdAt: serverTimestamp(),
        });
        toast.success("Job vacancy created");
      }

      resetForm();
    } catch (err) {
      console.error(err);
      toast.error("Error saving job vacancy");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleEdit = (job: JobVacancy) => {
    setEditId(job.id);
    setJobTitle(job.title);
    setCategory(job.category);
    setJobType(job.jobType);
    setLocation(job.location);
    setQualifications(
      Array.isArray(job.qualifications)
        ? job.qualifications
        : [job.qualifications],
    );
    setStatus(job.status);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "careers", id));
      toast.success("Job vacancy deleted");
    } catch (error) {
      toast.error("Failed to delete job vacancy");
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
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admin">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Careers</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Career Opportunities
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage job vacancies and recruitment opportunities.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* ── FORM ── */}
              <div className="lg:col-span-4 sticky top-6 z-10">
                <Card className="rounded-none shadow-none border-foreground/10 max-h-[calc(100vh-6rem)] overflow-y-auto">
                  <CardHeader className="border-b py-4 flex flex-row items-center justify-between space-y-0 sticky top-0 bg-background z-10">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest">
                      {editId ? "Update Job Vacancy" : "Add New Job Vacancy"}
                    </CardTitle>
                    {editId && (
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
                    <form onSubmit={handleSubmit} className="space-y-5">
                      {/* Job Title */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase opacity-60">
                          Position Title
                        </label>
                        <Input
                          value={jobTitle}
                          onChange={(e) => setJobTitle(e.target.value)}
                          placeholder="E.G. TERRITORY SALES MANAGER"
                          className="rounded-none h-10 text-xs uppercase"
                        />
                      </div>

                      {/* Category & Job Type */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                            <Briefcase className="h-3 w-3" /> Category
                          </label>
                          <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className="rounded-none h-10 text-xs uppercase font-bold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                              <SelectItem
                                value="Sales"
                                className="text-xs uppercase"
                              >
                                Sales
                              </SelectItem>
                              <SelectItem
                                value="Engineering"
                                className="text-xs uppercase"
                              >
                                Engineering
                              </SelectItem>
                              <SelectItem
                                value="Admin & HR"
                                className="text-xs uppercase"
                              >
                                Admin & HR
                              </SelectItem>
                              <SelectItem
                                value="Logistics"
                                className="text-xs uppercase"
                              >
                                Logistics
                              </SelectItem>
                              <SelectItem
                                value="Marketing"
                                className="text-xs uppercase"
                              >
                                Marketing
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                            <Clock className="h-3 w-3" /> Job Type
                          </label>
                          <Select value={jobType} onValueChange={setJobType}>
                            <SelectTrigger className="rounded-none h-10 text-xs uppercase font-bold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                              <SelectItem
                                value="Full Time"
                                className="text-xs uppercase"
                              >
                                Full Time
                              </SelectItem>
                              <SelectItem
                                value="Part Time"
                                className="text-xs uppercase"
                              >
                                Part Time
                              </SelectItem>
                              <SelectItem
                                value="Contractual"
                                className="text-xs uppercase"
                              >
                                Contractual
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Location & Status */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                            <MapPin className="h-3 w-3" /> Location
                          </label>
                          <Input
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="E.G. CDO, MANILA"
                            className="rounded-none h-10 text-xs uppercase"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60">
                            Status
                          </label>
                          <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger className="rounded-none h-10 text-xs uppercase font-bold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                              <SelectItem
                                value="Open"
                                className="text-xs uppercase"
                              >
                                Open
                              </SelectItem>
                              <SelectItem
                                value="Closed"
                                className="text-xs uppercase"
                              >
                                Closed
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Qualifications */}
                      <div className="space-y-3 pt-3 border-t">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1.5">
                            <ListChecks className="h-3 w-3" /> Qualifications
                          </label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addQualification}
                            className="h-7 rounded-none text-[9px] uppercase font-bold"
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {qualifications.map((qual, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2"
                            >
                              <div className="h-7 w-7 rounded-none bg-muted flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-bold">
                                  {index + 1}
                                </span>
                              </div>
                              <Input
                                value={qual}
                                onChange={(e) =>
                                  updateQualification(index, e.target.value)
                                }
                                placeholder="Enter requirement..."
                                className="rounded-none h-9 text-xs flex-1"
                              />
                              {qualifications.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeQualification(index)}
                                  className="h-9 w-9 rounded-none"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}

                          {qualifications.length === 0 && (
                            <div className="text-center py-6 border-2 border-dashed rounded-none">
                              <p className="text-[10px] font-bold text-muted-foreground uppercase">
                                No qualifications defined
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Submit Button */}
                      <Button
                        type="submit"
                        disabled={isSubmitLoading}
                        className="w-full rounded-none uppercase font-bold text-[10px] h-11 tracking-widest"
                      >
                        {isSubmitLoading ? (
                          <Loader2 className="animate-spin h-4 w-4" />
                        ) : editId ? (
                          <>
                            <Save className="mr-2 h-4 w-4" /> Update Vacancy
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" /> Save Vacancy
                          </>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>

              {/* ── TABLE VIEW ── */}
              <div className="lg:col-span-8">
                {loading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : jobs.length === 0 ? (
                  /* ── EMPTY STATE ── */
                  <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-foreground/5 bg-muted/30 p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mb-4 shadow-sm">
                      <FolderPlus className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                      No Job Vacancies
                    </h3>
                    <p className="text-[11px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
                      Your careers database is currently empty. Create a new job
                      vacancy using the panel on the left to begin.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-none border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] font-bold uppercase">
                            Position / Role
                          </TableHead>
                          <TableHead className="text-[10px] font-bold uppercase">
                            Category
                          </TableHead>
                          <TableHead className="text-[10px] font-bold uppercase">
                            Location
                          </TableHead>
                          <TableHead className="text-[10px] font-bold uppercase">
                            Type
                          </TableHead>
                          <TableHead className="text-[10px] font-bold uppercase text-center">
                            Status
                          </TableHead>
                          <TableHead className="text-[10px] font-bold uppercase text-right">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jobs.map((job) => (
                          <TableRow
                            key={job.id}
                            className="cursor-pointer"
                            onClick={() => handleEdit(job)}
                          >
                            <TableCell>
                              <h4 className="font-bold text-xs uppercase">
                                {job.title}
                              </h4>
                            </TableCell>
                            <TableCell>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                                {job.category}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5 text-xs">
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                {job.location}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="text-[9px] uppercase rounded-none"
                              >
                                {job.jobType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={
                                  job.status === "Open"
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-[9px] uppercase rounded-none"
                              >
                                {job.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div
                                className="flex justify-end gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-none"
                                  onClick={() => handleEdit(job)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive rounded-none"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="rounded-none">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className="text-sm font-bold uppercase">
                                        Delete Job Vacancy?
                                      </AlertDialogTitle>
                                      <AlertDialogDescription className="text-xs">
                                        You are about to delete{" "}
                                        <span className="font-semibold">
                                          {job.title}
                                        </span>
                                        . This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="rounded-none text-xs">
                                        Cancel
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        className="rounded-none bg-destructive text-xs"
                                        onClick={() => handleDelete(job.id)}
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
