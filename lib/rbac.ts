/**
 * lib/rbac.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central Role-Based Access Control utility.
 *
 * Responsibilities:
 *  1. Map every role → its default scopeAccess[] at account creation time.
 *  2. Provide hasAccess(user, action, resource) for runtime permission checks.
 *  3. Expose helpers used by the register page, login flow and API routes.
 *
 * Scope naming convention:
 *   read:<resource>    – view / list
 *   write:<resource>   – create / update / delete (may require approval)
 *   verify:<resource>  – approve / reject pending requests
 *
 * Wildcard shorthand:
 *   read:*  / write:*  / verify:*   – applies to all resources
 *   superadmin                       – bypasses ALL checks
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScopeAction = "read" | "write" | "verify";

export type ScopeEntry =
  | "superadmin"
  | `${ScopeAction}:*`
  | `${ScopeAction}:${string}`;

/** Minimal user shape required for hasAccess checks */
export interface RBACUser {
  role: string;
  scopeAccess?: string[];
}

// ─── Role → Default scopeAccess map ──────────────────────────────────────────

/**
 * ROLE_SCOPE_MAP
 * Defines the scopeAccess[] that is persisted to Firestore when a new account
 * is created (or when a role change is saved in the edit dialog).
 *
 * Rules:
 *  - superadmin  → ["superadmin"]          bypasses everything
 *  - admin       → full wildcard access    can approve all requests
 *  - director    → same as admin (system-wide read/write/verify)
 *  - pd_manager  → product domain admin    can approve product requests
 *  - pd_engineer → product writer          writes go through approval
 *  - pd (legacy) → alias for pd_engineer
 *  - project_sales → read products only
 *  - hr          → jobs domain
 *  - seo         → content domain (read + write)
 *  - marketing   → content domain (read + write)
 *  - csr         → inquiries domain
 *  - warehouse / staff / inventory / ecomm → read-only on their domain
 */
export const ROLE_SCOPE_MAP: Record<string, ScopeEntry[]> = {
  superadmin: ["superadmin"],

  admin: ["read:*", "write:*", "verify:*"],
  director: ["read:*", "write:*", "verify:*"],

  pd_manager: ["read:products", "write:products", "verify:products"],
  pd_engineer: ["read:products", "write:products"],
  pd: ["read:products", "write:products"], // legacy alias

  project_sales: ["read:products"],

  hr: ["read:jobs", "write:jobs"],
  seo: ["read:content", "write:content"],
  marketing: ["read:content", "write:content"],
  csr: ["read:inquiries", "write:inquiries"],

  warehouse: ["read:warehouse"],
  staff: ["read:staff"],
  inventory: ["read:inventory"],
  ecomm: ["read:ecomm"],
};

// ─── accessLevel helper ───────────────────────────────────────────────────────

/**
 * Derive the legacy `accessLevel` string from a role.
 * "full"    → admin-tier accounts (wildcard or verify:* holders)
 * "manager" → domain-level managers (verify:<resource>)
 * "staff"   → all other accounts
 */
export function getAccessLevelForRole(
  role: string,
): "full" | "manager" | "staff" {
  const r = role.toLowerCase().trim();
  if (r === "superadmin" || r === "admin" || r === "director") return "full";
  if (r === "pd_manager") return "manager";
  return "staff";
}

// ─── Scope resolver ───────────────────────────────────────────────────────────

/**
 * getScopeAccessForRole
 * Returns the default scopeAccess[] for a given role string.
 * Falls back to an empty array for unknown roles (safe default = deny).
 */
export function getScopeAccessForRole(role: string): ScopeEntry[] {
  const normalized = role.toLowerCase().trim();
  return (ROLE_SCOPE_MAP[normalized] as ScopeEntry[]) ?? [];
}

// ─── Core permission check ────────────────────────────────────────────────────

/**
 * hasAccess(user, action, resource)
 *
 * Evaluates whether `user` is allowed to perform `action` on `resource`.
 *
 * Resolution order (first match wins):
 *  1. scopeAccess includes "superadmin"          → ALLOW
 *  2. scopeAccess includes `${action}:*`          → ALLOW
 *  3. scopeAccess includes `${action}:${resource}`→ ALLOW
 *  4. Otherwise                                   → DENY
 *
 * @param user     - Object with at least { role, scopeAccess? }
 * @param action   - "read" | "write" | "verify"
 * @param resource - e.g. "products", "users", "content"
 */
export function hasAccess(
  user: RBACUser | null | undefined,
  action: ScopeAction,
  resource: string,
): boolean {
  if (!user) return false;

  // Derive effective scopeAccess:
  //   Prefer the stored scopeAccess[]; fall back to computing from role so that
  //   older accounts without the field still work correctly.
  const scopes: string[] =
    Array.isArray(user.scopeAccess) && user.scopeAccess.length > 0
      ? user.scopeAccess
      : getScopeAccessForRole(user.role);

  if (scopes.includes("superadmin")) return true;
  if (scopes.includes(`${action}:*`)) return true;
  if (scopes.includes(`${action}:${resource}`)) return true;

  return false;
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

/** Can the user read `resource`? */
export const canRead = (u: RBACUser | null | undefined, r: string) =>
  hasAccess(u, "read", r);

/** Can the user write `resource`? (write ≠ immediate execution for some roles) */
export const canWrite = (u: RBACUser | null | undefined, r: string) =>
  hasAccess(u, "write", r);

/** Can the user approve/reject requests for `resource`? */
export const canVerify = (u: RBACUser | null | undefined, r: string) =>
  hasAccess(u, "verify", r);

/** Does this user require approval before writes are executed? */
export function requiresApproval(
  user: RBACUser | null | undefined,
  resource: string,
): boolean {
  if (!user) return true;
  // If the user can verify their own resource (or has wildcard verify) they can
  // write directly.  Everyone else must go through the approval flow.
  return !hasAccess(user, "verify", resource);
}

/** Is this user a superadmin (bypasses all checks)? */
export function isSuperAdmin(user: RBACUser | null | undefined): boolean {
  if (!user) return false;
  const scopes = Array.isArray(user.scopeAccess)
    ? user.scopeAccess
    : getScopeAccessForRole(user.role);
  return (
    scopes.includes("superadmin") || user.role?.toLowerCase() === "superadmin"
  );
}

/** Can this user see the notifications / approval dropdown? */
export function canSeeNotifications(
  user: RBACUser | null | undefined,
): boolean {
  if (!user) return false;
 
  const scopes: string[] = Array.isArray(user.scopeAccess)
    ? user.scopeAccess
    : getScopeAccessForRole(user.role);
 
  // Superadmin bypasses everything
  if (scopes.includes("superadmin")) return true;
 
  // Verifiers can see (and action) all pending requests
  if (scopes.some((s) => s.startsWith("verify:"))) return true;
 
  // Writers can see (read-only) their own submitted requests
  // so they can track what's happening to them.
  if (scopes.some((s) => s.startsWith("write:"))) return true;
 
  return false;
}
