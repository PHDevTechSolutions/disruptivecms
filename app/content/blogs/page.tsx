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
  ImagePlus,
  X,
  AlignLeft,
  Layout,
  Save,
  FileText,
  Settings2,
  Bold,
  Italic,
  List,
  Undo,
  Redo,
  Heading2,
  ExternalLink,
  Search,
} from "lucide-react";

import { uploadToCloudinary } from "@/lib/cloudinary";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Link as TiptapLink } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";

// Shadcn UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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

// --- Types ---
type Section = {
  id: string;
  type: "paragraph" | "image-detail";
  title?: string;
  description?: string;
  imageUrl?: string;
  imageFile?: File | null;
};

const BRAND_OPTIONS = ["LIT", "JISO", "DISRUPTIVE", "VALUE ACQUISITIONS"];

// --- Tiptap Editor Component ---
const RichTextEditor = ({
  content,
  onChange,
  placeholder,
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) => {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-[#d11a2a] underline" },
      }),
      Placeholder.configure({ placeholder: placeholder || "Start writing..." }),
    ],
    content: content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "focus:outline-none min-h-[120px] text-[11px] leading-relaxed",
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="border border-foreground/10 rounded-none overflow-hidden bg-white">
      <div className="flex flex-wrap gap-1 p-1.5 border-b border-foreground/10 bg-gray-50/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`h-7 w-7 p-0 ${editor.isActive("bold") ? "bg-white text-[#d11a2a]" : ""}`}
        >
          <Bold size={12} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          className={`h-7 w-7 p-0 ${editor.isActive("heading") ? "bg-white text-[#d11a2a]" : ""}`}
        >
          <Heading2 size={12} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`h-7 w-7 p-0 ${editor.isActive("bulletList") ? "bg-white text-[#d11a2a]" : ""}`}
        >
          <List size={12} />
        </Button>
      </div>
      <div className="p-3 prose-sm max-w-none font-sans">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default function BlogManager() {
  const [blogs, setBlogs] = useState<any[]>([]);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form States
  const [mainTitle, setMainTitle] = useState("");
  const [category, setCategory] = useState("Industry News");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [mainImagePrev, setMainImagePrev] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [seoData, setSeoData] = useState({
    title: "",
    slug: "",
    description: "",
  });
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">(
    "desktop",
  );

  useEffect(() => {
    const q = query(collection(db, "blogs"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      setBlogs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setMainTitle("");
    setMainImagePrev(null);
    setMainImage(null);
    setSections([]);
    setSeoData({ title: "", slug: "", description: "" });
    setSelectedBrands([]);
    setCategory("Industry News");
  };

  const handleEdit = (blog: any) => {
    setEditingId(blog.id);
    setMainTitle(blog.title);
    setMainImagePrev(blog.coverImage);
    setSections(blog.sections || []);
    setSeoData(blog.seo || { title: "", slug: "", description: "" });
    setSelectedBrands(blog.brands || []);
    setCategory(blog.category || "Industry News");
    setIsSheetOpen(true);
  };

  const handleSubmit = async () => {
    if (!mainTitle || selectedBrands.length === 0)
      return toast.error("Provide a title and at least one brand.");
    setIsSubmitLoading(true);
    try {
      let coverUrl = mainImagePrev;
      if (mainImage) coverUrl = await uploadToCloudinary(mainImage);

      const updatedSections = await Promise.all(
        sections.map(async (sec) => {
          if (sec.type === "image-detail" && sec.imageFile) {
            const url = await uploadToCloudinary(sec.imageFile);
            return { ...sec, imageUrl: url, imageFile: null };
          }
          return sec;
        }),
      );

      const payload = {
        title: mainTitle.toUpperCase(),
        category,
        coverImage: coverUrl,
        sections: updatedSections,
        brands: selectedBrands,
        updatedAt: serverTimestamp(),
        seo: {
          ...seoData,
          slug:
            seoData.slug || mainTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        },
      };

      if (editingId) await updateDoc(doc(db, "blogs", editingId), payload);
      else
        await addDoc(collection(db, "blogs"), {
          ...payload,
          createdAt: serverTimestamp(),
        });

      toast.success("Publication Synced");
      setIsSheetOpen(false);
      resetForm();
    } catch (e) {
      toast.error("Sync Failed");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-[#f9f9f9]">
          <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-6">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#">Editorial</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Publications</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <Button
              onClick={() => {
                resetForm();
                setIsSheetOpen(true);
              }}
              className="h-9 rounded-none bg-black hover:bg-[#d11a2a] text-[10px] font-bold uppercase tracking-widest px-6 transition-all"
            >
              <Plus className="mr-2 h-4 w-4" /> Create Story
            </Button>
          </header>

          <main className="p-6 md:p-10">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-20">
                <Loader2 className="animate-spin h-8 w-8 mb-2" />
                <span className="text-[10px] font-bold uppercase">
                  Loading Archive
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {blogs.map((blog) => (
                  <div
                    key={blog.id}
                    className="group relative bg-white border border-foreground/10 flex flex-col transition-all hover:shadow-xl"
                  >
                    {/* Image Container with Actions */}
                    <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 border-b">
                      <img
                        src={blog.coverImage || "/placeholder.png"}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        alt=""
                      />
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="secondary"
                          size="icon"
                          onClick={() => handleEdit(blog)}
                          className="h-8 w-8 rounded-none bg-white/90 backdrop-blur shadow-sm"
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          variant="secondary"
                          size="icon"
                          onClick={() =>
                            confirm("Delete publication?") &&
                            deleteDoc(doc(db, "blogs", blog.id))
                          }
                          className="h-8 w-8 rounded-none bg-white/90 backdrop-blur shadow-sm hover:text-red-600"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <h3 className="font-bold text-[11px] leading-tight uppercase tracking-wide line-clamp-2">
                          {blog.title}
                        </h3>
                        <Badge className="rounded-none bg-black text-[8px] h-4 px-1.5 flex-shrink-0">
                          LIVE
                        </Badge>
                      </div>
                      <p className="text-[9px] text-muted-foreground uppercase font-medium leading-relaxed mb-4 italic line-clamp-2">
                        {blog.seo?.description || "No description provided."}
                      </p>

                      <div className="mt-auto pt-4 border-t border-foreground/5 flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {blog.brands?.slice(0, 2).map((brand: string) => (
                            <span
                              key={brand}
                              className="text-[8px] font-bold text-[#d11a2a] uppercase tracking-tighter flex items-center gap-1"
                            >
                              <ExternalLink size={8} /> {brand.split(" ")[0]}
                            </span>
                          ))}
                        </div>
                        <span className="text-[8px] font-bold opacity-30 uppercase tracking-widest">
                          {blog.category?.split(" ")[0]}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>

          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetContent
              side="right"
              className="p-0 sm:max-w-full w-screen h-screen border-none flex flex-col rounded-none overflow-hidden"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Editor</SheetTitle>
              </SheetHeader>

              <div className="flex h-full w-full">
                {/* Primary Content Editor */}
                <div className="flex-1 flex flex-col bg-white overflow-hidden">
                  <header className="h-16 border-b flex items-center justify-between px-8 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 flex items-center justify-center bg-red-50 text-[#d11a2a]">
                        <FileText size={16} />
                      </div>
                      <div>
                        <h2 className="font-bold uppercase tracking-tight text-[11px]">
                          Publication Builder
                        </h2>
                        <p className="text-[9px] opacity-50 uppercase font-bold tracking-widest">
                          Drafting Phase
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => setIsSheetOpen(false)}
                        className="text-[10px] font-bold uppercase h-9 rounded-none px-6"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSubmit}
                        disabled={isSubmitLoading}
                        className="bg-black text-white hover:bg-[#d11a2a] rounded-none px-8 h-9 text-[10px] font-bold uppercase tracking-widest transition-all"
                      >
                        {isSubmitLoading ? (
                          <Loader2 className="animate-spin h-4 w-4" />
                        ) : (
                          "Sync Content"
                        )}
                      </Button>
                    </div>
                  </header>

                  <ScrollArea className="flex-1 bg-[#fafafa]">
                    <div className="max-w-3xl mx-auto py-16 px-6 space-y-12 bg-white min-h-screen shadow-sm border-x border-foreground/5">
                      {/* Top Meta Section */}
                      <div className="grid grid-cols-2 gap-10">
                        <div className="space-y-4">
                          <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                            Brand Assignment
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {BRAND_OPTIONS.map((brand) => (
                              <button
                                key={brand}
                                onClick={() =>
                                  setSelectedBrands((prev) =>
                                    prev.includes(brand)
                                      ? prev.filter((b) => b !== brand)
                                      : [...prev, brand],
                                  )
                                }
                                className={`px-3 py-1.5 text-[9px] font-bold border transition-all uppercase ${
                                  selectedBrands.includes(brand)
                                    ? "bg-black text-white border-black"
                                    : "bg-transparent text-foreground/40 border-foreground/10 hover:border-black"
                                }`}
                              >
                                {brand}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                            Category
                          </label>
                          <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full h-9 border-b border-foreground/10 bg-transparent font-bold text-[10px] uppercase outline-none focus:border-[#d11a2a] transition-all"
                          >
                            <option>Industry News</option>
                            <option>Product Innovations</option>
                            <option>Press Release</option>
                            <option>Case Study</option>
                          </select>
                        </div>
                      </div>

                      <Separator className="opacity-5" />

                      {/* Title & Cover */}
                      <div className="space-y-8">
                        <textarea
                          value={mainTitle}
                          onChange={(e) => setMainTitle(e.target.value)}
                          placeholder="ENTER HEADLINE..."
                          className="w-full text-5xl font-black uppercase outline-none border-none placeholder:opacity-5 resize-none leading-[0.9] tracking-tighter"
                          rows={2}
                        />

                        <div className="space-y-2">
                          <div className="relative group aspect-[21/9] border-2 border-dashed border-foreground/10 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-all overflow-hidden">
                            {mainImagePrev ? (
                              <img
                                src={mainImagePrev}
                                className="w-full h-full object-cover"
                                alt=""
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-2">
                                <ImagePlus className="opacity-10" size={40} />
                                <span className="text-[9px] font-bold uppercase opacity-30">
                                  Upload Cover Image
                                </span>
                              </div>
                            )}
                            <input
                              type="file"
                              className="absolute inset-0 opacity-0 cursor-pointer"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) {
                                  setMainImage(f);
                                  setMainImagePrev(URL.createObjectURL(f));
                                }
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Content Blocks */}
                      <div className="space-y-12">
                        {sections.map((section, idx) => (
                          <div
                            key={section.id}
                            className="relative group animate-in fade-in slide-in-from-bottom-2 duration-300"
                          >
                            <div className="absolute -left-12 top-0 text-[10px] font-black opacity-10">
                              0{idx + 1}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeSection(section.id)}
                              className="absolute -right-10 top-0 h-8 w-8 rounded-none opacity-0 group-hover:opacity-100 hover:text-red-600 transition-all"
                            >
                              <X size={14} />
                            </Button>

                            {section.type === "paragraph" ? (
                              <RichTextEditor
                                content={section.description || ""}
                                onChange={(html) =>
                                  updateSection(section.id, {
                                    description: html,
                                  })
                                }
                              />
                            ) : (
                              <div className="border border-foreground/10 p-5 space-y-4 bg-white shadow-sm">
                                <Input
                                  className="h-8 border-none text-[10px] font-bold uppercase px-0 shadow-none focus-visible:ring-0 border-b rounded-none mb-4"
                                  placeholder="SUB-HEADING / CAPTION"
                                  value={section.title}
                                  onChange={(e) =>
                                    updateSection(section.id, {
                                      title: e.target.value,
                                    })
                                  }
                                />
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="aspect-square bg-gray-50 border border-dashed border-foreground/10 flex items-center justify-center relative overflow-hidden group/img">
                                    {section.imageUrl || section.imageFile ? (
                                      <img
                                        src={
                                          section.imageFile
                                            ? URL.createObjectURL(
                                                section.imageFile,
                                              )
                                            : section.imageUrl
                                        }
                                        className="w-full h-full object-cover"
                                        alt=""
                                      />
                                    ) : (
                                      <ImagePlus
                                        className="opacity-10"
                                        size={24}
                                      />
                                    )}
                                    <input
                                      type="file"
                                      className="absolute inset-0 opacity-0 cursor-pointer"
                                      onChange={(e) =>
                                        updateSection(section.id, {
                                          imageFile: e.target.files?.[0],
                                        })
                                      }
                                    />
                                  </div>
                                  <RichTextEditor
                                    content={section.description || ""}
                                    onChange={(html) =>
                                      updateSection(section.id, {
                                        description: html,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Block Controls */}
                      <div className="flex gap-4 border-t pt-12">
                        <Button
                          variant="outline"
                          onClick={addParagraph}
                          className="flex-1 h-24 rounded-none border-dashed border-foreground/20 hover:border-[#d11a2a] hover:bg-red-50/30 flex flex-col gap-2 transition-all group"
                        >
                          <AlignLeft
                            size={20}
                            className="opacity-20 group-hover:opacity-100 group-hover:text-[#d11a2a] transition-all"
                          />
                          <span className="text-[10px] font-bold uppercase tracking-widest">
                            Text Block
                          </span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={addImageDetail}
                          className="flex-1 h-24 rounded-none border-dashed border-foreground/20 hover:border-[#d11a2a] hover:bg-red-50/30 flex flex-col gap-2 transition-all group"
                        >
                          <Layout
                            size={20}
                            className="opacity-20 group-hover:opacity-100 group-hover:text-[#d11a2a] transition-all"
                          />
                          <span className="text-[10px] font-bold uppercase tracking-widest">
                            Media Block
                          </span>
                        </Button>
                      </div>
                    </div>
                  </ScrollArea>
                </div>

                {/* SEO SIDEBAR (Mirrors your image_9aff57.png) */}
                <div className="w-[340px] bg-white border-l shrink-0 flex flex-col z-10 shadow-2xl">
                  <header className="h-16 border-b flex items-center justify-between px-6 shrink-0">
                    <div className="flex items-center gap-2">
                      <Settings2 size={14} className="text-[#d11a2a]" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                        SEO META
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsSheetOpen(false)}
                      className="h-8 w-8 rounded-none"
                    >
                      <X size={16} />
                    </Button>
                  </header>

                  <ScrollArea className="flex-1">
                    <div className="p-8 space-y-10">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                          Browser Title
                        </label>
                        <Input
                          value={seoData.title}
                          onChange={(e) =>
                            setSeoData({ ...seoData, title: e.target.value })
                          }
                          className="rounded-none h-11 text-xs border-foreground/10 focus-visible:ring-1 focus-visible:ring-[#d11a2a]"
                          placeholder="Enter title..."
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                          URL Slug
                        </label>
                        <div className="relative">
                          <Input
                            value={seoData.slug}
                            onChange={(e) =>
                              setSeoData({
                                ...seoData,
                                slug: e.target.value
                                  .toLowerCase()
                                  .replace(/ /g, "-"),
                              })
                            }
                            className="rounded-none h-11 text-[11px] font-mono border-foreground/10 pl-3"
                            placeholder="story-url"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                          Description
                        </label>
                        <Textarea
                          value={seoData.description}
                          onChange={(e) =>
                            setSeoData({
                              ...seoData,
                              description: e.target.value,
                            })
                          }
                          className="min-h-[140px] rounded-none text-xs border-foreground/10 resize-none leading-relaxed"
                          placeholder="Briefly describe the publication for search engines..."
                        />
                      </div>

                      <div className="space-y-4 pt-6 border-t border-foreground/5">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                            SERP Preview
                          </span>
                          <Tabs
                            value={previewMode}
                            onValueChange={(v: any) => setPreviewMode(v)}
                          >
                            <TabsList className="h-7 p-0.5 bg-gray-100 rounded-none border border-foreground/5">
                              <TabsTrigger
                                value="mobile"
                                className="text-[9px] uppercase font-bold rounded-none px-3 h-full"
                              >
                                Mobile
                              </TabsTrigger>
                              <TabsTrigger
                                value="desktop"
                                className="text-[9px] uppercase font-bold rounded-none px-3 h-full"
                              >
                                Desktop
                              </TabsTrigger>
                            </TabsList>
                          </Tabs>
                        </div>

                        <div className="bg-[#fcfcfc] p-5 border border-foreground/5 space-y-1.5 shadow-inner">
                          <p className="text-[10px] text-gray-400 truncate tracking-tight">
                            google.com/blog/{seoData.slug || "..."}
                          </p>
                          <h4 className="text-[#1a0dab] text-base leading-tight font-medium hover:underline cursor-pointer">
                            {seoData.title || mainTitle || "Untitled Story"}
                          </h4>
                          <p className="text-[11px] text-[#4d5156] line-clamp-3 leading-relaxed">
                            {seoData.description ||
                              "Provide a meta description to see how this appears in search results."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );

  function addParagraph() {
    setSections([
      ...sections,
      { id: Math.random().toString(), type: "paragraph", description: "" },
    ]);
  }
  function addImageDetail() {
    setSections([
      ...sections,
      {
        id: Math.random().toString(),
        type: "image-detail",
        title: "",
        description: "",
      },
    ]);
  }
  function removeSection(id: string) {
    setSections(sections.filter((s) => s.id !== id));
  }
  function updateSection(id: string, data: Partial<Section>) {
    setSections(sections.map((s) => (s.id === id ? { ...s, ...data } : s)));
  }
}
