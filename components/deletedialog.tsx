"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Trash2, AlertTriangle, Clock, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface DeleteToRecycleBinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The display name of the item(s) to delete */
  itemName: string;
  /** The exact string the user must type to confirm (single-item only) */
  confirmText?: string;
  /** Called when the user has confirmed and wants to proceed */
  onConfirm: () => Promise<void> | void;
  /** Optional: show how many items are being deleted */
  count?: number;
  /**
   * requestMode — true when the current user is restricted (e.g. pd_engineer)
   * and cannot delete directly. The dialog becomes a "Submit Delete Request"
   * flow instead of "Move to Recycle Bin".
   *
   * The actual routing (pending vs direct) is handled by the caller via
   * useProductWorkflow → submitProductDelete. This prop only controls the
   * copy / iconography so the UI matches the user's permission level.
   */
  requestMode?: boolean;
}

const LONG_PRESS_MS = 2000;

export function DeleteToRecycleBinDialog({
  open,
  onOpenChange,
  itemName,
  confirmText,
  onConfirm,
  count = 1,
  requestMode = false,
}: DeleteToRecycleBinDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pressProgress, setPressProgress] = useState(0);
  const [isPressing, setIsPressing] = useState(false);

  const pressStart = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  // Always keep a fresh ref to onConfirm so the rAF closure never goes stale
  const onConfirmRef = useRef(onConfirm);
  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  const required = confirmText ?? itemName;
  const isMatch = inputValue === required;
  const isBulk = count > 1;

  // Reset everything when dialog closes
  useEffect(() => {
    if (!open) {
      setInputValue("");
      setIsLoading(false);
      setPressProgress(0);
      setIsPressing(false);
      firedRef.current = false;
      pressStart.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }
  }, [open]);

  // ── Execute the actual confirm action ────────────────────────────────────
  const executeConfirm = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await onConfirmRef.current();
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, onOpenChange]);

  const executeConfirmRef = useRef(executeConfirm);
  useEffect(() => {
    executeConfirmRef.current = executeConfirm;
  }, [executeConfirm]);

  // ── rAF-based long-press logic (bulk only) ───────────────────────────────
  const tick = useCallback(() => {
    if (!pressStart.current) return;
    const elapsed = Date.now() - pressStart.current;
    const progress = Math.min((elapsed / LONG_PRESS_MS) * 100, 100);
    setPressProgress(progress);
    if (progress >= 100 && !firedRef.current) {
      firedRef.current = true;
      executeConfirmRef.current();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startPress = useCallback(() => {
    if (isLoading || firedRef.current) return;
    pressStart.current = Date.now();
    firedRef.current = false;
    setPressProgress(0);
    setIsPressing(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [isLoading, tick]);

  const cancelPress = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pressStart.current = null;
    setIsPressing(false);
    if (!firedRef.current) setPressProgress(0);
  }, []);

  // ── Single confirm (type-to-confirm) ────────────────────────────────────
  const handleConfirmSingle = useCallback(() => {
    if (!isMatch) return;
    executeConfirm();
  }, [isMatch, executeConfirm]);

  // ── Derived copy based on requestMode ────────────────────────────────────
  const dialogTitle = requestMode
    ? isBulk
      ? `Submit Delete Request for ${count} Products`
      : "Submit Delete Request"
    : isBulk
      ? `Move ${count} Products to Recycle Bin`
      : "Move to Recycle Bin";

  const dialogDescription = requestMode
    ? "Your delete request will be sent to a PD Manager or Admin for approval."
    : "This item will be moved to the recycle bin where it can be restored or permanently deleted.";

  const confirmButtonLabel = requestMode
    ? isBulk
      ? "Submit Delete Request"
      : "Submit Request"
    : isBulk
      ? "Move to Recycle Bin"
      : "Move to Recycle Bin";

  const noteText = requestMode
    ? "This request will be reviewed before any product is deleted. You can track its status on the Requests page."
    : "Items in the recycle bin can be restored or permanently deleted from the Recycle Bin page.";

  const NoteIcon = requestMode ? Clock : Trash2;
  const noteColor = requestMode
    ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400"
    : "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div
              className={cn(
                "h-10 w-10 rounded-none flex items-center justify-center shrink-0",
                requestMode
                  ? "bg-amber-100 dark:bg-amber-950/40"
                  : "bg-destructive/10",
              )}
            >
              {requestMode ? (
                <Clock className="h-5 w-5 text-amber-600" />
              ) : (
                <Trash2 className="h-5 w-5 text-destructive" />
              )}
            </div>
            <div>
              <DialogTitle className="text-base font-bold uppercase tracking-tight">
                {dialogTitle}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {dialogDescription}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Single: show item name */}
          {!isBulk && (
            <div className="rounded-none bg-muted/50 border px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">
                Item
              </p>
              <p className="text-sm font-medium truncate">{itemName}</p>
            </div>
          )}

          {/* Bulk: long-press instruction */}
          {isBulk ? (
            <div className="rounded-none bg-muted/50 border px-3 py-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {count} products
                </span>{" "}
                {requestMode
                  ? "will be submitted for delete approval."
                  : "will be moved to the recycle bin."}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Hold the button below for 2 seconds to confirm.
              </p>
            </div>
          ) : (
            /* Single: typed confirmation */
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Type{" "}
                <span className="font-bold text-foreground font-mono">
                  {required}
                </span>{" "}
                to confirm
              </Label>
              <Input
                autoFocus
                placeholder={required}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isMatch) handleConfirmSingle();
                }}
                className={cn(
                  "rounded-none font-mono text-sm transition-colors",
                  inputValue.length > 0 &&
                    (isMatch
                      ? "border-emerald-500 focus-visible:ring-emerald-500/20"
                      : "border-destructive/50 focus-visible:ring-destructive/20"),
                )}
              />
              {inputValue.length > 0 && !isMatch && (
                <p className="text-[10px] text-destructive">
                  Name doesn&apos;t match. Please type exactly as shown.
                </p>
              )}
              {isMatch && (
                <p className="text-[10px] text-emerald-600 font-medium">
                  {requestMode
                    ? "✓ Confirmed — ready to submit delete request."
                    : "✓ Confirmed — ready to move to recycle bin."}
                </p>
              )}
            </div>
          )}

          {/* Info note */}
          <div
            className={cn(
              "flex items-start gap-2 rounded-none border px-3 py-2.5",
              noteColor,
            )}
          >
            <NoteIcon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
            <p className="text-[10px] leading-relaxed">{noteText}</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-none"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>

          {isBulk ? (
            /* ── Long-press confirm button ── */
            <div className="relative overflow-hidden rounded-none">
              <div
                className="absolute inset-0 bg-white/20 pointer-events-none origin-left"
                style={{
                  transform: `scaleX(${pressProgress / 100})`,
                  transition: "none",
                }}
              />
              <Button
                variant={requestMode ? "default" : "destructive"}
                size="sm"
                disabled={isLoading}
                className={cn(
                  "rounded-none relative select-none min-w-[200px]",
                  requestMode && "bg-amber-600 hover:bg-amber-700 text-white",
                )}
                onMouseDown={startPress}
                onMouseUp={cancelPress}
                onMouseLeave={cancelPress}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startPress();
                }}
                onTouchEnd={cancelPress}
                onTouchCancel={cancelPress}
              >
                {isLoading ? (
                  <span className="animate-pulse">
                    {requestMode ? "Submitting..." : "Moving to bin..."}
                  </span>
                ) : isPressing ? (
                  `Hold… ${Math.round(pressProgress)}%`
                ) : (
                  <>
                    {requestMode ? (
                      <Send className="mr-2 h-3.5 w-3.5" />
                    ) : (
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                    )}
                    {confirmButtonLabel}
                  </>
                )}
              </Button>
            </div>
          ) : (
            /* ── Single typed confirm ── */
            <Button
              variant={requestMode ? "default" : "destructive"}
              size="sm"
              disabled={!isMatch || isLoading}
              className={cn(
                "rounded-none",
                requestMode && "bg-amber-600 hover:bg-amber-700 text-white",
              )}
              onClick={handleConfirmSingle}
            >
              {isLoading ? (
                <span className="animate-pulse">
                  {requestMode ? "Submitting..." : "Moving to bin..."}
                </span>
              ) : (
                <>
                  {requestMode ? (
                    <Send className="mr-1.5 h-3 w-3" />
                  ) : (
                    <Trash2 className="mr-1.5 h-3 w-3" />
                  )}
                  {confirmButtonLabel}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
