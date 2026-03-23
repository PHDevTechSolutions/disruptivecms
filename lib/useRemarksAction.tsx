"use client";
/**
 * useRemarksAction
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared hook for gating approve / reject actions behind a required-remarks
 * dialog.  Used by the requests table pages and the notifications dropdown.
 *
 * Usage:
 *   const { remarksTarget, setRemarksTarget, handleRemarksConfirm, RemarksDialog } =
 *     useRemarksAction({ reviewer });
 *
 *   // In the table row:
 *   <Button onClick={() => setRemarksTarget({ request: req, action: "approve" })} />
 *
 *   // At the bottom of the component tree:
 *   <RemarksDialog />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import {
  approveRequest,
  rejectRequest,
  PendingRequest,
} from "@/lib/requestService";
import type {
  RemarksTarget,
  RemarksAction,
} from "@/components/notifications/remarks-confirm-dialog";
import { RemarksConfirmDialog } from "@/components/notifications/remarks-confirm-dialog";

interface UseRemarksActionOptions {
  reviewer: { uid: string; name?: string };
  /** Called after the action is successfully executed */
  onComplete?: () => void;
}

export function useRemarksAction({
  reviewer,
  onComplete,
}: UseRemarksActionOptions) {
  const [remarksTarget, setRemarksTarget] = useState<RemarksTarget | null>(
    null,
  );

  const handleRemarksConfirm = useCallback(
    async (action: RemarksAction, requestId: string, remarks: string) => {
      const t = toast.loading(
        action === "approve" ? "Approving…" : "Rejecting…",
      );
      try {
        if (action === "approve") {
          await approveRequest(requestId, reviewer);
        } else {
          await rejectRequest(requestId, reviewer);
        }
        await updateDoc(doc(db, "requests", requestId), {
          reviewRemarks: remarks,
        }).catch(() => {});
        toast.success(
          action === "approve"
            ? "Request approved and executed."
            : "Request rejected.",
          { id: t },
        );
        onComplete?.();
      } catch (err: any) {
        toast.error(
          err.message ||
            `${action === "approve" ? "Approval" : "Rejection"} failed.`,
          { id: t },
        );
        throw err; // re-throw so dialog stays open on error
      }
    },
    [reviewer, onComplete],
  );

  // Pre-bound JSX element — render this once anywhere in the component tree
  const RemarksDialog = () => (
    <RemarksConfirmDialog
      target={remarksTarget}
      open={!!remarksTarget}
      onOpenChange={(v) => !v && setRemarksTarget(null)}
      onConfirm={handleRemarksConfirm}
    />
  );

  return {
    /** Set this to open the dialog. Pass `null` to close. */
    remarksTarget,
    setRemarksTarget,
    /** Call directly if you need programmatic confirmation without the dialog */
    handleRemarksConfirm,
    /** Drop `<RemarksDialog />` once into your component tree */
    RemarksDialog,
  };
}
