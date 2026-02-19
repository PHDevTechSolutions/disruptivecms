"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
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
  /** The exact string the user must type to confirm */
  confirmText?: string;
  /** Called when the user has confirmed and wants to proceed */
  onConfirm: () => Promise<void> | void;
  /** Optional: show how many items are being deleted */
  count?: number;
}


export function DeleteToRecycleBinDialog({
  open,
  onOpenChange,
  itemName,
  confirmText,
  onConfirm,
  count = 1,
}: DeleteToRecycleBinDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // The text the user must match exactly (case-sensitive)
  const required = confirmText ?? itemName;
  const isMatch = inputValue === required;

  // Reset input whenever dialog opens/closes
  useEffect(() => {
    if (!open) {
      setInputValue("");
      setIsLoading(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!isMatch) return;
    setIsLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  const isBulk = count > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none max-w-md">
        {/* Warning icon header */}
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-none bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold uppercase tracking-tight">
                Move to Recycle Bin
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {isBulk
                  ? `You are about to move ${count} items to the recycle bin.`
                  : "This item will be moved to the recycle bin."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Item name display */}
          {!isBulk && (
            <div className="rounded-none bg-muted/50 border px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">
                Item
              </p>
              <p className="text-sm font-medium truncate">{itemName}</p>
            </div>
          )}

          {/* Confirmation input */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Type{" "}
              <span className="font-bold text-foreground font-mono">
                {isBulk ? `${count} items` : required}
              </span>{" "}
              to confirm
            </Label>
            <Input
              autoFocus
              placeholder={isBulk ? `${count} items` : required}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isMatch) handleConfirm();
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
                Name doesn't match. Please type exactly as shown.
              </p>
            )}
            {isMatch && (
              <p className="text-[10px] text-emerald-600 font-medium">
                ✓ Confirmed — ready to move to recycle bin.
              </p>
            )}
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2 rounded-none bg-amber-50 border border-amber-200 px-3 py-2.5 dark:bg-amber-950/20 dark:border-amber-900">
            <Trash2 className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
              Items in the recycle bin can be restored or permanently deleted
              from the Recycle Bin page.
            </p>
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
          <Button
            variant="destructive"
            size="sm"
            className="rounded-none"
            onClick={handleConfirm}
            disabled={!isMatch || isLoading}
          >
            {isLoading ? (
              <>
                <span className="animate-pulse">Moving...</span>
              </>
            ) : (
              <>
                <Trash2 className="mr-1.5 h-3 w-3" />
                Move to Recycle Bin
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}