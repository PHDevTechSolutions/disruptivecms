"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  MessageSquare,
  AlertCircle,
  Package,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PendingRequest } from "@/lib/requestService";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type RemarksAction = "approve" | "reject";

export interface RemarksTarget {
  request: PendingRequest;
  action: RemarksAction;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDisplayName(req: PendingRequest): string {
  const meta = req.meta ?? {};
  if (meta.productName) return String(meta.productName);
  const d = req.payload?.after ?? req.payload?.productSnapshot ?? req.payload;
  return d?.itemDescription || d?.name || d?.itemCode || req.resourceId || "—";
}

function getItemCode(req: PendingRequest): string | null {
  const meta = req.meta ?? {};
  return (meta.litItemCode as string) || (meta.ecoItemCode as string) || null;
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface RemarksConfirmDialogProps {
  target: RemarksTarget | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called with the trimmed remarks string when user confirms */
  onConfirm: (
    action: RemarksAction,
    requestId: string,
    remarks: string,
  ) => Promise<void>;
}

export function RemarksConfirmDialog({
  target,
  open,
  onOpenChange,
  onConfirm,
}: RemarksConfirmDialogProps) {
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  // Reset state whenever dialog opens for a new target
  useEffect(() => {
    if (open) {
      setRemarks("");
      setError(false);
    }
  }, [open, target?.request.id]);

  if (!target) return null;

  const { request, action } = target;
  const isApprove = action === "approve";
  const displayName = getDisplayName(request);
  const itemCode = getItemCode(request);
  const remarksOk = remarks.trim().length > 0;

  const handleConfirm = async () => {
    if (!remarksOk) {
      setError(true);
      return;
    }
    setLoading(true);
    try {
      await onConfirm(action, request.id, remarks.trim());
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !loading) {
          setRemarks("");
          setError(false);
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg rounded-none">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div
              className={cn(
                "w-9 h-9 rounded-none flex items-center justify-center shrink-0",
                isApprove ? "bg-emerald-100" : "bg-rose-100",
              )}
            >
              {isApprove ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600" />
              )}
            </div>
            <div>
              <DialogTitle className="text-sm font-bold uppercase tracking-tight">
                {isApprove ? "Approve Request" : "Reject Request"}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {isApprove
                  ? "The request will be executed immediately after approval."
                  : "The request will be discarded and no changes will be applied."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Request identity */}
        <div className="flex items-center gap-3 bg-muted/40 border px-3 py-2.5 rounded-none">
          <div className="h-8 w-8 shrink-0 bg-background border flex items-center justify-center rounded-none">
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">
              {displayName}
            </p>
            {itemCode && (
              <p className="text-[11px] text-muted-foreground font-mono">
                {itemCode}
              </p>
            )}
          </div>
          <span
            className={cn(
              "ml-auto shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border",
              request.type === "create" &&
                "bg-sky-50 text-sky-700 border-sky-200",
              request.type === "update" &&
                "bg-violet-50 text-violet-700 border-violet-200",
              request.type === "delete" &&
                "bg-rose-50 text-rose-700 border-rose-200",
            )}
          >
            {request.type}
          </span>
        </div>

        {/* Remarks */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3" />
            Remarks
            <span className="text-destructive">*</span>
          </label>
          <Textarea
            autoFocus
            value={remarks}
            onChange={(e) => {
              setRemarks(e.target.value);
              if (e.target.value.trim()) setError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleConfirm();
              }
            }}
            placeholder={
              isApprove
                ? "Explain why you are approving this request…"
                : "Explain why you are rejecting this request…"
            }
            className={cn(
              "rounded-none resize-none min-h-[80px] text-sm",
              error && "border-destructive focus-visible:ring-destructive/30",
            )}
            disabled={loading}
          />
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Remarks are required before proceeding.
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Tip: Press Ctrl+Enter / ⌘+Enter to confirm.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-none"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className={cn(
              "rounded-none gap-1.5",
              isApprove
                ? remarksOk
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-emerald-200 text-emerald-400 cursor-not-allowed"
                : remarksOk
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "bg-rose-200 text-rose-400 cursor-not-allowed",
            )}
            onClick={handleConfirm}
            disabled={loading || !remarksOk}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isApprove ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <XCircle className="w-3.5 h-3.5" />
            )}
            {loading
              ? isApprove
                ? "Approving…"
                : "Rejecting…"
              : isApprove
                ? "Approve & Execute"
                : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
