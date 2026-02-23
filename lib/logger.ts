import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export const logPageView = async (pageName: string) => {
  try {
    await addDoc(collection(db, "cmsactivity_logs"), {
      page: pageName,
      timestamp: serverTimestamp(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    });
  } catch (error) {
    console.error("Error logging page view:", error);
  }
};

// ─── Audit logging ──────────────────────────────────────────────────────────────

export type AuditAction = "create" | "update" | "delete" | "restore";

export interface AuditActor {
  uid?: string;
  name?: string;
  email?: string;
  role?: string;
  accessLevel?: string;
}

export interface AuditEventContext {
  page?: string;
  source?: string;
  collection?: string;
  bulk?: boolean;
  [key: string]: unknown;
}

export interface AuditEventInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  metadata?: Record<string, unknown>;
  context?: AuditEventContext;
}

export const getCurrentAdminUser = (): AuditActor | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("disruptive_admin_user");
    if (!raw) return null;
    return JSON.parse(raw) as AuditActor;
  } catch (error) {
    console.warn("Failed to read disruptive_admin_user from localStorage", error);
    return null;
  }
};

export const logAuditEvent = async (input: AuditEventInput) => {
  try {
    const actor = getCurrentAdminUser();

    await addDoc(collection(db, "cms_audit_logs"), {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityName: input.entityName ?? null,
      metadata: input.metadata ?? null,
      context: input.context ?? null,
      actor: actor
        ? {
            uid: actor.uid ?? null,
            name: actor.name ?? null,
            email: actor.email ?? null,
            role: actor.role ?? null,
            accessLevel: actor.accessLevel ?? null,
          }
        : null,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error writing audit log:", error);
  }
};
