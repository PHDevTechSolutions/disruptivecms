"use client";

import React, { useState, useEffect } from "react";
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
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { toast } from "sonner";

import BlogCreator, { BlogPayload } from "./BlogCreator";

const ITEMS_PER_PAGE = 5;

const WEBSITE_FILTER_OPTIONS = [
  { label: "All Websites", value: "all" },
  { label: "Disruptive Solutions Inc", value: "disruptivesolutionsinc" },
  { label: "Ecoshift Corporation", value: "ecoshiftcorporation" },
  { label: "VAH", value: "VAH" },
];

export default function BlogManager() {
  const [blogs, setBlogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [editingBlog, setEditingBlog] = useState<any | null>(null);
  const [websiteFilter, setWebsiteFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const q = query(collection(db, "blogs"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setBlogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [websiteFilter]);

  const filteredBlogs =
    websiteFilter === "all"
      ? blogs
      : blogs.filter((b) => b.website === websiteFilter);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredBlogs.length / ITEMS_PER_PAGE),
  );
  const paginatedBlogs = filteredBlogs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const handleCreateNew = () => {
    setEditingBlog(null);
    setIsCreatorOpen(true);
  };

  const handleEdit = (blog: any) => {
    setEditingBlog(blog);
    setIsCreatorOpen(true);
  };

  const handleClose = () => {
    setIsCreatorOpen(false);
    setEditingBlog(null);
  };

  const handleSubmit = async (
    payload: BlogPayload,
    editingId: string | null,
  ) => {
    const base = { ...payload, updatedAt: serverTimestamp() };
    if (editingId) {
      await updateDoc(doc(db, "blogs", editingId), base);
    } else {
      await addDoc(collection(db, "blogs"), {
        ...base,
        createdAt: serverTimestamp(),
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this story permanently?")) return;
    try {
      await deleteDoc(doc(db, "blogs", id));
      toast.success("Story deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  // --- RENDER: EDIT MODE ---
  const renderEditMode = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={handleClose} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Publications
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <p className="text-sm text-muted-foreground">
          {editingBlog
            ? `Editing: ${editingBlog?.title}`
            : "Creating New Publication"}
        </p>
      </div>
      <BlogCreator
        initialData={editingBlog}
        onClose={handleClose}
        onSubmit={handleSubmit}
      />
    </div>
  );

  // --- RENDER: TABLE MODE ---
  const renderTableMode = () => (
    <>
      {/* Filter bar */}
      <div className="bg-white border border-foreground/10 px-6 py-4 flex items-center gap-4">
        <Filter size={14} className="opacity-30 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 shrink-0">
          Filter by Website
        </span>
        <Select value={websiteFilter} onValueChange={setWebsiteFilter}>
          <SelectTrigger className="h-8 w-56 rounded-none border-foreground/10 text-[10px] font-bold uppercase focus:ring-1 focus:ring-[#d11a2a]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            {WEBSITE_FILTER_OPTIONS.map((o) => (
              <SelectItem
                key={o.value}
                value={o.value}
                className="text-[10px] font-bold uppercase"
              >
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {websiteFilter !== "all" && (
          <span className="text-[10px] font-bold opacity-40">
            {filteredBlogs.length}{" "}
            {filteredBlogs.length === 1 ? "blog" : "blogs"}
          </span>
        )}
        <Button
          onClick={handleCreateNew}
          className="ml-auto h-8 rounded-none bg-black hover:bg-[#d11a2a] text-[10px] font-bold uppercase tracking-widest px-6 transition-all"
        >
          <Plus className="mr-2 h-3.5 w-3.5" /> New Story
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white border border-foreground/10 border-t-0 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <Loader2 className="animate-spin h-8 w-8 mb-2" />
            <span className="text-[10px] font-bold uppercase">
              Loading Archive
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[720px]">
              <thead className="border-b border-foreground/5">
                <tr className="text-[9px] font-bold uppercase tracking-widest opacity-30">
                  <th className="px-6 py-4">Preview</th>
                  <th className="px-6 py-4">Story Details</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {paginatedBlogs.map((blog) => (
                  <tr
                    key={blog.id}
                    className="hover:bg-gray-50/50 transition-colors group"
                  >
                    <td className="px-6 py-5">
                      <div className="w-20 h-14 overflow-hidden border border-foreground/5">
                        <img
                          src={blog.coverImage || "/placeholder.png"}
                          className="w-full h-full object-cover"
                          alt={blog.title}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <h4 className="font-bold text-[11px] uppercase tracking-wide line-clamp-1 max-w-[280px] mb-1">
                        {blog.title}
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-[#d11a2a] uppercase tracking-widest">
                          {blog.category}
                        </span>
                        <span className="text-[8px] opacity-30 font-bold uppercase">
                          | {blog.website || "N/A"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <Badge
                        className={`rounded-none text-[8px] h-5 px-2 font-bold uppercase tracking-widest ${
                          blog.status === "Published"
                            ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-50"
                            : "bg-amber-50 text-amber-600 hover:bg-amber-50"
                        }`}
                      >
                        {blog.status || "Published"}
                      </Badge>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(blog)}
                          className="h-8 w-8 rounded-none opacity-0 group-hover:opacity-100 transition-all hover:bg-black hover:text-white"
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(blog.id)}
                          className="h-8 w-8 rounded-none opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedBlogs.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center py-20 text-[10px] font-bold uppercase opacity-20"
                    >
                      No publications found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-foreground/5">
          <span className="text-[9px] font-bold uppercase opacity-30 tracking-widest">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 rounded-none disabled:opacity-20"
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="h-8 w-8 rounded-none disabled:opacity-20"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-white">
          {/* Top header */}
          <header className="flex h-16 shrink-0 items-center border-b bg-white px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-3 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Editorial</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {isCreatorOpen
                      ? editingBlog
                        ? "Edit Publication"
                        : "New Publication"
                      : "Publications"}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="p-6 md:p-10">
            {isCreatorOpen ? renderEditMode() : renderTableMode()}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
