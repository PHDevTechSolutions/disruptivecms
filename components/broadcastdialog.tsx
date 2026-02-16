"use client";

import React, { useState, useEffect, useRef } from "react";
import { Loader2, Send, MailPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

export default function BroadcastDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [includeDbUsers, setIncludeDbUsers] = useState(false);
  const [showManualRecipients, setShowManualRecipients] = useState(false);
  const [extraRecipients, setExtraRecipients] = useState<string[]>([""]);

  const [formData, setFormData] = useState({
    isEnabled: true,
    from: "",
    replyTo: "",
    to: "{applicant_email}",
    cc: "",
    subject: "",
    content: "",
  });

  // Load settings once the dialog opens
  useEffect(() => {
    if (open) {
      const fetchSettings = async () => {
        try {
          const docRef = doc(db, "settings", "emailConfig");
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) setFormData(docSnap.data() as any);
        } catch (error) {
          toast.error("Failed to load email settings.");
        } finally {
          setLoading(false);
        }
      };
      fetchSettings();
    }
  }, [open]);

  const addEmailField = () => setExtraRecipients([...extraRecipients, ""]);
  const removeEmailField = (index: number) => {
    const newEmails = extraRecipients.filter((_, i) => i !== index);
    setExtraRecipients(newEmails.length ? newEmails : [""]);
  };
  const updateEmailField = (index: number, val: string) => {
    const newEmails = [...extraRecipients];
    newEmails[index] = val;
    setExtraRecipients(newEmails);
  };

  const handleSave = async () => {
    const manualEmails = extraRecipients
      .map((e) => e.trim())
      .filter((e) => e !== "" && e.includes("@"));
    const replyToEmail = formData.replyTo.trim();

    if (
      !includeDbUsers &&
      manualEmails.length === 0 &&
      (!replyToEmail || !replyToEmail.includes("@"))
    ) {
      toast.error("No recipients found.");
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading("Sending broadcast...");

    try {
      const settingsRef = doc(db, "settings", "emailConfig");
      await setDoc(settingsRef, formData, { merge: true });

      let finalRecipientList: string[] = [];
      if (includeDbUsers) {
        const querySnapshot = await getDocs(collection(db, "users"));
        finalRecipientList = querySnapshot.docs
          .map((doc) => doc.data().email)
          .filter((e) => e?.includes("@"));
      }
      if (replyToEmail && replyToEmail.includes("@"))
        finalRecipientList.push(replyToEmail);
      finalRecipientList = Array.from(
        new Set([...finalRecipientList, ...manualEmails])
      );

      const res = await fetch("/api/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, recipients: finalRecipientList }),
      });

      if (!res.ok) throw new Error("Dispatch failed");

      toast.success(`Success! Sent to ${finalRecipientList.length} recipients.`, {
        id: toastId,
      });
      setOpen(false);
    } catch (error: any) {
      toast.error(error.message, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-none gap-2">
          <Send className="h-4 w-4" />
          Execute Broadcast
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-none">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0 bg-muted/30">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold">
                Communication Center
              </DialogTitle>
              <DialogDescription className="text-xs uppercase tracking-wider mt-1">
                Broadcast Management Protocol
              </DialogDescription>
            </div>
            <Button
              onClick={handleSave}
              disabled={isSaving || loading}
              size="lg"
              className="rounded-none h-11 px-6"
            >
              {isSaving ? (
                <Loader2 className="animate-spin h-4 w-4 mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Now
            </Button>
          </div>
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-8 space-y-8">
            {/* Identity Group */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  From Name
                </Label>
                <Input
                  value={formData.from}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, from: e.target.value }))
                  }
                  className="rounded-none h-12 text-base"
                  placeholder="Your Name"
                />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Reply To Email
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowManualRecipients(!showManualRecipients)}
                    className="h-7 text-xs rounded-none"
                  >
                    <MailPlus className="h-3.5 w-3.5 mr-1.5" />
                    {showManualRecipients ? "Hide Manual" : "Add Direct"}
                  </Button>
                </div>
                <Input
                  value={formData.replyTo}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, replyTo: e.target.value }))
                  }
                  className="rounded-none h-12 text-base"
                  placeholder="reply@example.com"
                />
              </div>
            </div>

            {/* Manual Recipients List */}
            {showManualRecipients && (
              <div className="p-6 bg-muted/50 rounded-none border space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Additional Recipients
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addEmailField}
                    className="h-8 text-xs rounded-none"
                  >
                    <MailPlus className="h-3.5 w-3.5 mr-1.5" />
                    Add Field
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {extraRecipients.map((email, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={email}
                        onChange={(e) => updateEmailField(idx, e.target.value)}
                        className="rounded-none h-10 text-sm"
                        placeholder="email@example.com"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEmailField(idx)}
                        className="h-10 w-10 rounded-none shrink-0"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Subject */}
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Subject Line
              </Label>
              <Input
                value={formData.subject}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, subject: e.target.value }))
                }
                className="rounded-none h-12 text-base font-medium"
                placeholder="Enter email subject"
              />
            </div>

            {/* Message Body */}
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Message Body
              </Label>
              <div className="border rounded-none overflow-hidden bg-background">
                <Textarea
                  ref={textareaRef}
                  className="min-h-[320px] p-6 text-base resize-none rounded-none border-0 focus-visible:ring-0 leading-relaxed"
                  value={formData.content}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, content: e.target.value }))
                  }
                  placeholder="Type your message here..."
                />
                <div className="px-6 py-3 bg-muted border-t flex justify-between items-center text-xs font-medium text-muted-foreground">
                  <span>
                    Status: {includeDbUsers ? "Broadcast Active" : "Manual Only"}
                  </span>
                  <span>{formData.content.length} characters</span>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end gap-3 shrink-0 bg-muted/30">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="rounded-none h-11 px-6"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || loading}
            className="rounded-none h-11 px-8"
          >
            {isSaving ? (
              <Loader2 className="animate-spin h-4 w-4 mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Broadcast
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}