"use client";

import React, { useState, useEffect } from "react";
import {
  Plus,
  X,
  Loader2,
  ImagePlus,
  AlignLeft,
  Layout,
  FileText,
  Settings2,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link2,
  Undo,
  Redo,
  Palette,
  Type,
  Save,
} from "lucide-react";

import { uploadToCloudinary } from "@/lib/cloudinary";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Section = {
  id: string;
  type: "paragraph" | "image-detail";
  title?: string;
  description?: string;
  imageUrl?: string;
  imageFile?: File | null;
};

export type SeoData = {
  title: string;
  slug: string;
  description: string;
};

export type BlogPayload = {
  title: string;
  category: string;
  status: string;
  website: string;
  coverImage: string | null;
  sections: Omit<Section, "imageFile">[];
  slug: string;
  seo: SeoData;
};

interface BlogCreatorProps {
  onClose: () => void;
  onSubmit: (payload: BlogPayload, editingId: string | null) => Promise<void>;
  initialData?: {
    id: string;
    title: string;
    coverImage?: string;
    sections?: Section[];
    seo?: SeoData;
    slug?: string;
    status?: string;
    website?: string;
    category?: string;
  } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  "Industry News",
  "Engineering",
  "Tech Updates",
  "Case Study",
];
const STATUS_OPTIONS = ["Published", "Draft"];
const WEBSITE_OPTIONS = [
  { label: "Disruptive Solutions Inc", value: "disruptivesolutionsinc" },
  { label: "Ecoshift Corporation", value: "ecoshiftcorporation" },
  { label: "VAH", value: "VAH" },
];

const COLORS = [
  "#000000",
  "#d11a2a",
  "#1877F2",
  "#10B981",
  "rgba(210, 140, 42, 1)",
  "#8B5CF6",
  "#EC4899",
  "#6B7280",
  "#FFFFFF",
];

const FONTS = [
  { name: "Default", value: "" },
  { name: "Arial", value: "Arial, sans-serif" },
  { name: "Georgia", value: "Georgia, serif" },
  { name: "Times New Roman", value: "Times New Roman, serif" },
  { name: "Courier New", value: "Courier New, monospace" },
  { name: "Verdana", value: "Verdana, sans-serif" },
  { name: "Comic Sans", value: "Comic Sans MS, cursive" },
  { name: "Impact", value: "Impact, fantasy" },
];

// ─── RichTextEditor ──────────────────────────────────────────────────────────

const RichTextEditor = ({
  content,
  onChange,
  placeholder,
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) => {
  const [mounted, setMounted] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily.configure({ types: ["textStyle"] }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-[#d11a2a] underline hover:text-black transition-colors",
        },
      }),
      Placeholder.configure({ placeholder: placeholder || "Start writing..." }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "focus:outline-none min-h-[150px] text-[11px] leading-relaxed text-foreground",
      },
    },
  });

  const setLink = () => {
    const url = window.prompt("Enter URL:");
    if (url && editor) editor.chain().focus().setLink({ href: url }).run();
  };

  if (!mounted || !editor) {
    return (
      <div className="border border-foreground/10 overflow-hidden bg-white p-4 min-h-[150px] flex items-center justify-center">
        <Loader2 className="animate-spin opacity-20" size={20} />
      </div>
    );
  }

  // Toolbar button helper
  const ToolBtn = ({
    active,
    onClick,
    disabled,
    children,
  }: {
    active?: boolean;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-7 w-7 p-0 rounded-none ${active ? "bg-white text-[#d11a2a]" : "text-foreground/40 hover:text-foreground"}`}
    >
      {children}
    </Button>
  );

  return (
    <div className="border border-foreground/10 overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-foreground/10 bg-gray-50/50">
        <ToolBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={12} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={12} />
        </ToolBtn>

        <div className="w-px h-4 bg-foreground/10 mx-1" />

        <ToolBtn
          active={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          <Heading1 size={12} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 size={12} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          <Heading3 size={12} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("paragraph")}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          <span className="text-[9px] font-black">P</span>
        </ToolBtn>

        <div className="w-px h-4 bg-foreground/10 mx-1" />

        <ToolBtn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={12} />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={12} />
        </ToolBtn>

        <div className="w-px h-4 bg-foreground/10 mx-1" />

        {/* Font picker */}
        <div className="relative">
          <ToolBtn
            onClick={() => {
              setShowFontPicker(!showFontPicker);
              setShowColorPicker(false);
            }}
          >
            <Type size={12} />
          </ToolBtn>
          {showFontPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-foreground/10 shadow-xl z-50 w-44 max-h-52 overflow-y-auto">
              {FONTS.map((font) => (
                <button
                  key={font.value}
                  type="button"
                  onClick={() => {
                    font.value
                      ? editor.chain().focus().setFontFamily(font.value).run()
                      : editor.chain().focus().unsetFontFamily().run();
                    setShowFontPicker(false);
                  }}
                  className="w-full px-4 py-2 text-left text-[11px] hover:bg-gray-50 transition-colors"
                  style={{ fontFamily: font.value || "inherit" }}
                >
                  {font.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Color picker */}
        <div className="relative">
          <ToolBtn
            onClick={() => {
              setShowColorPicker(!showColorPicker);
              setShowFontPicker(false);
            }}
          >
            <Palette size={12} />
          </ToolBtn>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-foreground/10 shadow-xl p-2 z-50">
              <div className="grid grid-cols-3 gap-1.5">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setColor(color).run();
                      setShowColorPicker(false);
                    }}
                    className="w-7 h-7 border border-foreground/10 hover:border-[#d11a2a] transition-all hover:scale-110"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setShowColorPicker(false);
                }}
                className="w-full mt-2 text-[9px] font-bold uppercase tracking-wider text-foreground/30 hover:text-foreground transition-colors border-t border-foreground/5 pt-2"
              >
                Reset Color
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-foreground/10 mx-1" />

        <ToolBtn active={editor.isActive("link")} onClick={setLink}>
          <Link2 size={12} />
        </ToolBtn>
        {editor.isActive("link") && (
          <ToolBtn onClick={() => editor.chain().focus().unsetLink().run()}>
            <span className="text-[9px] font-black">×link</span>
          </ToolBtn>
        )}

        <div className="w-px h-4 bg-foreground/10 mx-1" />

        <ToolBtn
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo size={12} />
        </ToolBtn>
        <ToolBtn
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo size={12} />
        </ToolBtn>
      </div>

      {/* ProseMirror styles */}
      <style jsx global>{`
        .ProseMirror {
          outline: none;
        }
        .ProseMirror h1 {
          font-size: 2em;
          font-weight: 800;
          margin: 0.67em 0;
          line-height: 1.2;
        }
        .ProseMirror h2 {
          font-size: 1.5em;
          font-weight: 700;
          margin: 0.83em 0;
          line-height: 1.3;
        }
        .ProseMirror h3 {
          font-size: 1.25em;
          font-weight: 700;
          margin: 1em 0;
          line-height: 1.4;
        }
        .ProseMirror p {
          margin: 1em 0;
        }
        .ProseMirror strong {
          font-weight: 700;
        }
        .ProseMirror em {
          font-style: italic;
        }
        .ProseMirror ul {
          list-style-type: disc;
          padding-left: 1.5em;
          margin: 1em 0;
        }
        .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 1.5em;
          margin: 1em 0;
        }
        .ProseMirror li {
          margin: 0.25em 0;
        }
        .ProseMirror a {
          color: #d11a2a;
          text-decoration: underline;
          cursor: pointer;
        }
        .ProseMirror a:hover {
          color: #000;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #d1d5db;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>

      <div className="p-3 prose-sm max-w-none font-sans">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

// ─── BlogCreator ──────────────────────────────────────────────────────────────

export default function BlogCreator({
  onClose,
  onSubmit,
  initialData = null,
}: BlogCreatorProps) {
  const editingId = initialData?.id ?? null;

  // Reverse-map stored website value → display label for the select
  const resolveWebsiteLabel = (stored?: string) => {
    const match = WEBSITE_OPTIONS.find((o) => o.value === stored);
    return match?.value ?? "disruptivesolutionsinc";
  };

  // ── Form state ──────────────────────────────────────────────────────────────
  const [mainTitle, setMainTitle] = useState(initialData?.title ?? "");
  const [category, setCategory] = useState(
    initialData?.category ?? "Industry News",
  );
  const [status, setStatus] = useState(initialData?.status ?? "Published");
  const [website, setWebsite] = useState(
    resolveWebsiteLabel(initialData?.website),
  );
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [mainImagePrev, setMainImagePrev] = useState<string | null>(
    initialData?.coverImage ?? null,
  );
  const [sections, setSections] = useState<Section[]>(
    initialData?.sections ?? [],
  );
  const [seoData, setSeoData] = useState<SeoData>(
    initialData?.seo ?? { title: "", slug: "", description: "" },
  );
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">(
    "desktop",
  );
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // ── Section helpers ─────────────────────────────────────────────────────────
  function addParagraph() {
    setSections((prev) => [
      ...prev,
      { id: Date.now().toString(), type: "paragraph", description: "" },
    ]);
  }

  function addImageDetail() {
    setSections((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: "image-detail",
        title: "",
        description: "",
        imageUrl: "",
      },
    ]);
  }

  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  function updateSection(id: string, data: Partial<Section>) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...data } : s)),
    );
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!mainTitle || (!mainImagePrev && !mainImage)) {
      toast.error("Headline and cover image are required.");
      return;
    }

    setIsSubmitLoading(true);
    try {
      let coverUrl = mainImagePrev;
      if (mainImage) coverUrl = await uploadToCloudinary(mainImage);

      const updatedSections = await Promise.all(
        sections.map(async (sec) => {
          if (sec.type === "image-detail" && sec.imageFile) {
            const url = await uploadToCloudinary(sec.imageFile);
            const { imageFile, ...rest } = sec;
            return { ...rest, imageUrl: url };
          }
          const { imageFile, ...rest } = sec;
          return rest;
        }),
      );

      const autoSlug = mainTitle
        .toLowerCase()
        .replace(/[^\w ]+/g, "")
        .replace(/ +/g, "-");

      const payload: BlogPayload = {
        title: mainTitle,
        category,
        status,
        website,
        coverImage: coverUrl,
        sections: updatedSections,
        slug: seoData.slug || autoSlug,
        seo: {
          title: seoData.title || mainTitle,
          slug: seoData.slug || autoSlug,
          description: seoData.description || "",
        },
      };

      await onSubmit(payload, editingId);
      toast.success("Publication Synced");
      onClose();
    } catch {
      toast.error("Sync Failed");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      {/* ══════════════════════════════════════════════════════════════════════
          LEFT — Content editor
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {/* Header */}
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
                {editingId ? "Editing" : "Drafting"} Phase
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={onClose}
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
                <>
                  <Save size={14} className="mr-2" /> Publish Story
                </>
              )}
            </Button>
          </div>
        </header>

        {/* Scrollable editor body */}
        <ScrollArea className="flex-1 bg-[#fafafa]">
          <div className="max-w-3xl mx-auto py-16 px-6 space-y-12 bg-white min-h-screen shadow-sm border-x border-foreground/5">
            {/* ── Headline ── */}
            <textarea
              value={mainTitle}
              onChange={(e) => setMainTitle(e.target.value)}
              placeholder="ENTER YOUR HEADLINE..."
              className="w-full text-5xl font-black uppercase outline-none border-none placeholder:opacity-5 resize-none leading-[0.9] tracking-tighter"
              rows={2}
            />

            {/* ── Meta row: category / status / website / cover ── */}
            <div className="flex flex-wrap gap-8 items-end border-y border-foreground/5 py-6">
              {/* Category */}
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase tracking-widest opacity-40 block">
                  Category
                </label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 w-44 rounded-none border-none border-b border-foreground/20 shadow-none text-[10px] font-bold uppercase focus:ring-0 px-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {CATEGORY_OPTIONS.map((o) => (
                      <SelectItem
                        key={o}
                        value={o}
                        className="text-[10px] font-bold uppercase"
                      >
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Visibility */}
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase tracking-widest opacity-40 block">
                  Visibility
                </label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 w-36 rounded-none border-none border-b border-foreground/20 shadow-none text-[10px] font-bold uppercase focus:ring-0 px-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem
                        key={o}
                        value={o}
                        className="text-[10px] font-bold uppercase"
                      >
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Target Website */}
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase tracking-widest opacity-40 block">
                  Target Website
                </label>
                <Select value={website} onValueChange={setWebsite}>
                  <SelectTrigger className="h-8 w-52 rounded-none border-none border-b border-foreground/20 shadow-none text-[10px] font-bold uppercase focus:ring-0 px-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {WEBSITE_OPTIONS.map((o) => (
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
              </div>

              {/* Cover image upload */}
              <label className="ml-auto flex items-center gap-2 cursor-pointer bg-black text-white px-5 py-2 text-[9px] font-bold uppercase tracking-widest hover:bg-[#d11a2a] transition-all h-8">
                <ImagePlus size={14} />
                {mainImagePrev ? "Replace Cover" : "Upload Cover"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setMainImage(f);
                      setMainImagePrev(URL.createObjectURL(f));
                    }
                  }}
                />
              </label>
            </div>

            {/* ── Cover preview ── */}
            {mainImagePrev && (
              <div className="relative aspect-[21/9] overflow-hidden shadow-sm group">
                <img
                  src={mainImagePrev}
                  className="w-full h-full object-cover"
                  alt="Cover preview"
                />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-all" />
              </div>
            )}

            <Separator className="opacity-5" />

            {/* ── Content blocks ── */}
            <div className="space-y-12">
              {sections.map((section, idx) => (
                <div
                  key={section.id}
                  className="relative group animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  {/* Block number */}
                  <div className="absolute -left-12 top-0 text-[10px] font-black opacity-10 select-none">
                    0{idx + 1}
                  </div>

                  {/* Remove button */}
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
                      content={section.description ?? ""}
                      onChange={(html) =>
                        updateSection(section.id, { description: html })
                      }
                      placeholder="Continue the story..."
                    />
                  ) : (
                    <div className="border border-foreground/10 p-5 space-y-4 bg-white shadow-sm">
                      <Input
                        className="h-8 border-none text-[10px] font-bold uppercase px-0 shadow-none focus-visible:ring-0 border-b rounded-none mb-4 placeholder:opacity-30"
                        placeholder="SECTION SUB-HEADER"
                        value={section.title ?? ""}
                        onChange={(e) =>
                          updateSection(section.id, { title: e.target.value })
                        }
                      />
                      <div className="grid grid-cols-2 gap-6">
                        {/* Image upload */}
                        <div className="aspect-square bg-gray-50 border border-dashed border-foreground/10 flex items-center justify-center relative overflow-hidden hover:border-[#d11a2a] transition-all group/img">
                          {section.imageUrl || section.imageFile ? (
                            <img
                              src={
                                section.imageFile
                                  ? URL.createObjectURL(section.imageFile)
                                  : section.imageUrl
                              }
                              className="w-full h-full object-cover"
                              alt="Section"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-foreground/20 group-hover/img:text-[#d11a2a] transition-colors">
                              <ImagePlus size={24} />
                              <span className="text-[9px] font-bold uppercase tracking-widest">
                                Insert Image
                              </span>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={(e) =>
                              updateSection(section.id, {
                                imageFile: e.target.files?.[0],
                              })
                            }
                          />
                        </div>
                        <RichTextEditor
                          content={section.description ?? ""}
                          onChange={(html) =>
                            updateSection(section.id, { description: html })
                          }
                          placeholder="Write a caption or side-story..."
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Block controls ── */}
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
                <span className="text-[9px] opacity-40">
                  Add a new paragraph
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
                  Visual Section
                </span>
                <span className="text-[9px] opacity-40">
                  Image + description
                </span>
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT — SEO sidebar
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="w-[340px] bg-white border-l shrink-0 flex flex-col shadow-2xl">
        <header className="h-16 border-b flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            <Settings2 size={14} className="text-[#d11a2a]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
              SEO Meta
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-none"
          >
            <X size={16} />
          </Button>
        </header>

        <ScrollArea className="flex-1">
          <div className="p-8 space-y-10">
            {/* SEO Title */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                Browser Title
              </label>
              <Input
                value={seoData.title}
                onChange={(e) =>
                  setSeoData({ ...seoData, title: e.target.value })
                }
                placeholder={mainTitle || "Enter title…"}
                className="rounded-none h-11 text-xs border-foreground/10 focus-visible:ring-1 focus-visible:ring-[#d11a2a]"
              />
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 flex items-center gap-2">
                URL Slug
                <span className="text-[8px] bg-amber-50 text-amber-600 font-bold px-1.5 py-0.5">
                  No slashes
                </span>
              </label>
              <Input
                value={seoData.slug}
                onChange={(e) =>
                  setSeoData({
                    ...seoData,
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/\//g, "")
                      .replace(/\s+/g, "-"),
                  })
                }
                placeholder={
                  mainTitle
                    .toLowerCase()
                    .replace(/[^\w ]+/g, "")
                    .replace(/ +/g, "-") || "story-url"
                }
                className="rounded-none h-11 text-[11px] font-mono border-foreground/10 focus-visible:ring-1 focus-visible:ring-[#d11a2a]"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                Meta Description
              </label>
              <Textarea
                value={seoData.description}
                onChange={(e) =>
                  setSeoData({ ...seoData, description: e.target.value })
                }
                placeholder="Brief summary for search results…"
                className="min-h-[120px] rounded-none text-xs border-foreground/10 resize-none leading-relaxed focus-visible:ring-1 focus-visible:ring-[#d11a2a]"
              />
            </div>

            {/* SERP Preview */}
            <div className="space-y-4 pt-6 border-t border-foreground/5">
              <div className="flex items-center justify-between">
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

              <div className="bg-[#fcfcfc] p-5 border border-foreground/5 shadow-inner space-y-2">
                {/* Site + URL row */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                    <img
                      src="/images/icon.png"
                      alt="icon"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-[10px] text-[#202124] truncate font-medium">
                      {WEBSITE_OPTIONS.find((o) => o.value === website)
                        ?.label ?? "—"}
                    </p>
                    <p className="text-[9px] text-gray-400 truncate font-mono">
                      {website}.com › blog › {seoData.slug || "…"}
                    </p>
                  </div>
                </div>

                {/* Title + image */}
                <div
                  className={`${previewMode === "mobile" ? "flex flex-col-reverse gap-2" : "flex gap-3"}`}
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[#1a0dab] text-[15px] leading-tight font-medium hover:underline cursor-pointer line-clamp-2">
                      {seoData.title || mainTitle || "Untitled Story"}
                    </h4>
                    <p className="text-[11px] text-[#4d5156] line-clamp-2 leading-relaxed mt-1">
                      {seoData.description ||
                        "Provide a meta description to see how this appears in search results."}
                    </p>
                  </div>

                  {mainImagePrev && (
                    <div
                      className={`bg-gray-50 overflow-hidden border border-foreground/5 shrink-0 ${previewMode === "mobile" ? "w-full h-28" : "w-20 h-20"}`}
                    >
                      <img
                        src={mainImagePrev}
                        className="w-full h-full object-cover"
                        alt="SERP thumbnail"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
