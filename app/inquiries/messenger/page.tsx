"use client";

import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  where,
  doc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { uploadToCloudinary } from "@/lib/cloudinary";
import {
  MoreVertical,
  Search,
  Send,
  Circle,
  MessageSquare,
  Trash2,
  ImageIcon,
  Loader2,
  ChevronLeft,
  Edit2,
  Check,
  X as XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
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
import { TooltipProvider } from "@/components/ui/tooltip";

// ── TYPES ────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  sender: "user" | "contact";
  author: string;
  text?: string;
  imageUrl?: string;
  timestamp: string;
  isAdmin: boolean;
};

type Conversation = {
  id: string;
  name: string;
  email: string;
  initials: string;
  messages: Message[];
  hasUnread: boolean;
};

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export default function Messenger() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [adminSession, setAdminSession] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showChat, setShowChat] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const session = localStorage.getItem("disruptive_admin_user");
    if (session) setAdminSession(JSON.parse(session));
  }, []);

  // ── Real-time listener ────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "chats"),
      where("website", "==", "disruptivesolutionsinc"),
      orderBy("timestamp", "asc"),
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const grouped: Record<string, Conversation> = {};

      snapshot.docs.forEach((d) => {
        const data = d.data();
        const email = data.senderEmail;

        if (!grouped[email]) {
          grouped[email] = {
            id: email,
            email,
            name: data.senderName || "Guest Client",
            initials: (data.senderName || "G").substring(0, 2).toUpperCase(),
            messages: [],
            hasUnread: false,
          };
        }

        const isAdmin = data.isAdmin || false;
        grouped[email].messages.push({
          id: d.id,
          sender: isAdmin ? "user" : "contact",
          author: data.senderName,
          text: data.message,
          imageUrl: data.imageUrl,
          timestamp:
            data.timestamp
              ?.toDate()
              .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) ||
            "...",
          isAdmin,
        });

        const last =
          grouped[email].messages[grouped[email].messages.length - 1];
        grouped[email].hasUnread = !last.isAdmin;
      });

      const list = Object.values(grouped);
      setConversations(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].id);
    });

    return () => unsub();
  }, [selectedId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId),
    [conversations, selectedId],
  );

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !selectedId || !adminSession) return;
    try {
      await addDoc(collection(db, "chats"), {
        senderEmail: selectedId,
        senderName: adminSession.displayName || "Admin",
        message: draft.trim(),
        isAdmin: true,
        timestamp: serverTimestamp(),
        website: "disruptivesolutionsinc",
      });
      setDraft("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId || !adminSession) return;
    try {
      setIsUploading(true);
      const url = await uploadToCloudinary(file);
      await addDoc(collection(db, "chats"), {
        senderEmail: selectedId,
        senderName: adminSession.displayName || "Admin",
        imageUrl: url,
        isAdmin: true,
        timestamp: serverTimestamp(),
        website: "disruptivesolutionsinc",
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await deleteDoc(doc(db, "chats", msgId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditMessage = async (msgId: string) => {
    if (!editingText.trim()) return;
    try {
      await updateDoc(doc(db, "chats", msgId), {
        message: editingText.trim(),
        edited: true,
        editedAt: serverTimestamp(),
      });
      setEditingId(null);
      setEditingText("");
    } catch (err) {
      console.error(err);
    }
  };

  const filteredConversations = conversations.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleSelectConversation = (id: string) => {
    setSelectedId(id);
    setShowChat(true);
  };

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
                  <BreadcrumbPage>Messenger</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          {/* ── PAGE CONTENT WRAPPER ── */}
          {/* Padded container so the messenger panel doesn't bleed edge-to-edge */}
          <div className="flex flex-1 overflow-hidden p-4 lg:p-6 bg-muted/30">
            {/* ── MESSENGER CONTAINER ── */}
            {/* Fixed height panel with rounded border — not full-screen */}
            <div className="flex flex-1 overflow-hidden border rounded-none shadow-sm bg-background max-h-[calc(100vh-8rem)]">
              {/* ── CONVERSATION SIDEBAR ── */}
              <div
                className={cn(
                  "w-full lg:w-72 border-r flex flex-col shrink-0",
                  "lg:flex",
                  showChat ? "hidden" : "flex",
                )}
              >
                {/* Sidebar header */}
                <div className="p-4 border-b space-y-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-base tracking-tight">
                      Messages
                    </h2>
                    <Badge
                      variant="secondary"
                      className="rounded-none text-[10px] gap-1"
                    >
                      <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500 animate-pulse" />
                      Live
                    </Badge>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search clients..."
                      className="pl-8 rounded-none h-9 text-xs"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {/* Conversation list — scrollable */}
                <div className="flex-1 overflow-y-auto">
                  {filteredConversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                      <MessageSquare className="h-8 w-8 text-muted-foreground/20 mb-2" />
                      <p className="text-xs text-muted-foreground">
                        No conversations yet.
                      </p>
                    </div>
                  ) : (
                    filteredConversations.map((conv) => {
                      const isActive = selectedId === conv.id;
                      const lastMsg = conv.messages[conv.messages.length - 1];
                      return (
                        <button
                          key={conv.id}
                          onClick={() => handleSelectConversation(conv.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 text-left border-b transition-colors",
                            isActive ? "bg-accent" : "hover:bg-muted/50",
                          )}
                        >
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="rounded-none text-xs font-bold bg-primary/10 text-primary">
                              {conv.initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {conv.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {lastMsg?.imageUrl
                                ? "📷 Sent an image"
                                : lastMsg?.text}
                            </p>
                          </div>
                          {conv.hasUnread && !isActive && (
                            <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ── CHAT WINDOW ── */}
              <div
                className={cn(
                  "flex-1 flex-col overflow-hidden",
                  "lg:flex",
                  showChat ? "flex" : "hidden lg:flex",
                )}
              >
                <AnimatePresence mode="wait">
                  {activeConversation ? (
                    <motion.div
                      key={activeConversation.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col h-full overflow-hidden"
                    >
                      {/* Chat header — fixed, does not scroll */}
                      <div className="h-16 px-4 border-b flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden rounded-none h-8 w-8"
                            onClick={() => setShowChat(false)}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="rounded-none text-xs font-bold bg-primary/10 text-primary">
                              {activeConversation.initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold leading-tight">
                              {activeConversation.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {activeConversation.email}
                            </p>
                          </div>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-none h-8 w-8"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="rounded-none"
                          >
                            <DropdownMenuItem className="text-xs">
                              View Profile
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Messages — scrollable area only */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20">
                        {activeConversation.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={cn(
                              "flex",
                              msg.sender === "user"
                                ? "justify-end"
                                : "justify-start",
                            )}
                            onMouseEnter={() =>
                              msg.isAdmin && setHoveredMsgId(msg.id)
                            }
                            onMouseLeave={() => setHoveredMsgId(null)}
                          >
                            <div
                              className={cn(
                                "flex flex-col max-w-[70%] group",
                                msg.sender === "user"
                                  ? "items-end"
                                  : "items-start",
                              )}
                            >
                              {editingId === msg.id ? (
                                /* Edit mode */
                                <div className="flex items-center gap-2 w-full">
                                  <Input
                                    value={editingText}
                                    onChange={(e) =>
                                      setEditingText(e.target.value)
                                    }
                                    className="rounded-none h-8 text-sm flex-1"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        handleEditMessage(msg.id);
                                      if (e.key === "Escape") {
                                        setEditingId(null);
                                        setEditingText("");
                                      }
                                    }}
                                  />
                                  <Button
                                    size="icon"
                                    className="h-8 w-8 rounded-none"
                                    onClick={() => handleEditMessage(msg.id)}
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 rounded-none"
                                    onClick={() => {
                                      setEditingId(null);
                                      setEditingText("");
                                    }}
                                  >
                                    <XIcon className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <div className="relative">
                                    <div
                                      className={cn(
                                        "px-3 py-2.5 text-sm shadow-sm",
                                        msg.sender === "user"
                                          ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-none"
                                          : "bg-background border rounded-2xl rounded-tl-none",
                                      )}
                                    >
                                      {msg.imageUrl && (
                                        <img
                                          src={msg.imageUrl}
                                          alt="Chat image"
                                          className="rounded mb-1.5 max-w-full cursor-zoom-in"
                                          onClick={() =>
                                            window.open(msg.imageUrl, "_blank")
                                          }
                                        />
                                      )}
                                      {msg.text && (
                                        <p className="leading-relaxed whitespace-pre-wrap">
                                          {msg.text}
                                        </p>
                                      )}
                                    </div>

                                    {/* Admin message actions */}
                                    {msg.isAdmin && (
                                      <div
                                        className={cn(
                                          "absolute -top-3 -left-16 flex gap-0.5 bg-background border rounded-none shadow-sm transition-opacity",
                                          hoveredMsgId === msg.id
                                            ? "opacity-100"
                                            : "opacity-0 group-hover:opacity-100",
                                        )}
                                      >
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 rounded-none"
                                          onClick={() => {
                                            setEditingId(msg.id);
                                            setEditingText(msg.text || "");
                                          }}
                                        >
                                          <Edit2 className="h-3 w-3" />
                                        </Button>

                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 rounded-none text-muted-foreground hover:text-destructive"
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent className="rounded-none">
                                            <AlertDialogHeader>
                                              <AlertDialogTitle className="text-sm font-bold uppercase">
                                                Delete Message
                                              </AlertDialogTitle>
                                              <AlertDialogDescription className="text-xs">
                                                This message will be permanently
                                                deleted and cannot be recovered.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel className="rounded-none text-xs">
                                                Cancel
                                              </AlertDialogCancel>
                                              <AlertDialogAction
                                                className="rounded-none bg-destructive text-xs"
                                                onClick={() =>
                                                  handleDeleteMessage(msg.id)
                                                }
                                              >
                                                Delete
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </div>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground mt-1 uppercase font-medium tracking-tight">
                                    {msg.timestamp}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        ))}

                        {isUploading && (
                          <div className="flex justify-end">
                            <span className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Sending image...
                            </span>
                          </div>
                        )}

                        <div ref={messagesEndRef} />
                      </div>

                      {/* Input area — fixed at bottom, does not scroll */}
                      <div className="p-4 border-t bg-background shrink-0">
                        <form onSubmit={handleSubmit}>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleImageUpload}
                          />
                          <div className="border rounded-none">
                            <Textarea
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder="Type a message..."
                              className="min-h-[72px] rounded-none border-0 border-b focus-visible:ring-0 resize-none text-sm"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSubmit(e as any);
                                }
                              }}
                            />
                            <div className="flex items-center justify-between px-3 py-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="rounded-none h-8 text-xs text-muted-foreground"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                              >
                                <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                                {isUploading ? "Uploading..." : "Image"}
                              </Button>
                              <Button
                                type="submit"
                                size="sm"
                                className="rounded-none h-8 text-xs"
                                disabled={!draft.trim() || isUploading}
                              >
                                <Send className="h-3.5 w-3.5 mr-1.5" />
                                Reply
                              </Button>
                            </div>
                          </div>
                        </form>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex-1 flex flex-col items-center justify-center text-center p-8"
                    >
                      <MessageSquare className="h-10 w-10 text-muted-foreground/20 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Select a client to view their conversation.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
