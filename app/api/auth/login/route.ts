/**
 * Role-Based Access Control Configuration
 * Defines which pages/routes each role has access to
 */

export type UserRole =
  | "superadmin"
  | "admin"
  | "director"
  | "pd_manager"
  | "pd_engineer"
  | "pd" // legacy alias
  | "project_sales"
  | "warehouse"
  | "staff"
  | "inventory"
  | "hr"
  | "seo"
  | "csr"
  | "ecomm"
  | "marketing";

export type RoleAccessConfig = {
  [key in UserRole]: string[];
};

/* ==============================
   PUBLIC ROUTES
   ============================== */

export const PUBLIC_ROUTES = [
  // Auth pages are accessible to everyone (logged-in users may be redirected away by layout)
  "/auth",
  "/access-denied",
];

/* ==============================
   SUPERADMIN-ONLY ROUTES
   Routes that wildcard (*) roles like admin cannot access.
   Only the superadmin role is exempt from this restriction.
   ============================== */

export const SUPERADMIN_ONLY_ROUTES = ["/admin/register"];

/* ==============================
   ROLE ACCESS CONFIG
   ============================== */

export const roleAccessConfig: RoleAccessConfig = {
  superadmin: ["*"],
  admin: ["*"],
  director: ["*"],

  // PD roles — both access the products module
  pd_manager: ["/products/all-products"],
  pd_engineer: ["/products/all-products"],
  pd: ["/products/all-products"], // legacy

  project_sales: ["/products/all-products"],

  // /jobs and all nested routes like /jobs/applications
  hr: ["/jobs/applications"],

  // /content and all nested routes
  seo: ["/content"],
  marketing: ["/content"],

  // /inquiries and all nested routes
  csr: ["/inquiries"],

  warehouse: ["/access-denied"],
  staff: ["/access-denied"],
  inventory: ["/access-denied"],
  ecomm: ["/access-denied"],
};

/* ==============================
   HELPERS
   ============================== */

/**
 * Normalize role safely
 */
function normalizeRole(role?: string | null): UserRole | null {
  if (!role) return null;

  const normalized = role.toLowerCase().trim() as UserRole;

  return normalized in roleAccessConfig ? normalized : null;
}

/**
 * Check if a path is public
 */
export function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => path === route || path.startsWith(route + "/"),
  );
}

/**
 * Check if a path is restricted to superadmin only
 */
export function isSuperadminOnlyRoute(path: string): boolean {
  const normalizedPath = path.replace(/\/$/, "");
  return SUPERADMIN_ONLY_ROUTES.some((route) => {
    const normalizedRoute = route.replace(/\/$/, "");
    return (
      normalizedPath === normalizedRoute ||
      normalizedPath.startsWith(normalizedRoute + "/")
    );
  });
}

/**
 * Check if a role can access a specific route
 *
 * EDGE CASES HANDLED:
 * - Trailing slashes: /jobs/ → /jobs (normalized)
 * - Query params: Safe (pathname doesn't include ?query)
 * - Hash/anchors: Safe (pathname doesn't include #anchor)
 * - Nested routes: /jobs/applications → matches /jobs rule
 * - Unknown roles: Returns false (safe fallback)
 *
 * ROLE ACCESS TEST CASES:
 * - superadmin: Can access all routes (*) including SUPERADMIN_ONLY_ROUTES
 * - admin / director: Can access all routes (*) EXCEPT SUPERADMIN_ONLY_ROUTES
 * - pd_manager / pd_engineer / pd: Can access only /products/all-products
 * - project_sales: Can access only /products/all-products
 * - seo: Can access only /content
 * - hr: Can access /jobs and nested routes (/jobs/applications, etc.)
 * - marketing: Can access all /content/* routes
 * - warehouse/staff/inventory/csr/ecomm: No routes (except public) → redirect to /access-denied
 */
export function canAccessRoute(
  role: string | null | undefined,
  path: string,
): boolean {
  if (isPublicRoute(path)) {
    return true;
  }

  if (!role) return false;

  const normalizedRole = role.toLowerCase().trim();

  // Superadmin-only routes: only superadmin may pass
  if (isSuperadminOnlyRoute(path)) {
    return normalizedRole === "superadmin";
  }

  const allowedRoutes = roleAccessConfig[normalizedRole as UserRole];
  if (!allowedRoutes) return false;

  if (allowedRoutes.includes("*")) {
    return true;
  }

  // Normalize path (remove trailing slash)
  const normalizedPath = path.replace(/\/$/, "");

  return allowedRoutes.some((route) => {
    const normalizedRoute = route.replace(/\/$/, "");

    // Support simple wildcard suffix: /content/* matches /content and any nested route
    if (normalizedRoute.endsWith("/*")) {
      const prefix = normalizedRoute.slice(0, -2);
      return (
        normalizedPath === prefix || normalizedPath.startsWith(prefix + "/")
      );
    }

    return (
      normalizedPath === normalizedRoute ||
      normalizedPath.startsWith(normalizedRoute + "/")
    );
  });
}

/**
 * Get primary route for role
 */
export function getPrimaryRouteForRole(role: string): string {
  const normalizedRole = normalizeRole(role);

  if (!normalizedRole) return "/access-denied";

  const primaryRoutes: Record<UserRole, string> = {
    superadmin: "/products/all-products",
    admin: "/products/all-products",
    director: "/products/all-products",
    pd_manager: "/products/all-products",
    pd_engineer: "/products/all-products",
    pd: "/products/all-products",
    project_sales: "/products/all-products",
    hr: "/jobs/applications",
    seo: "/content/blogs",
    marketing: "/content/projects",
    csr: "/inquiries/customer-inquiries",
    warehouse: "/access-denied",
    staff: "/access-denied",
    inventory: "/access-denied",
    ecomm: "/access-denied",
  };

  return primaryRoutes[normalizedRole];
}

/**
 * Get all accessible routes for a role
 */
export function getAccessibleRoutes(role: string): string[] {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return [];
  return roleAccessConfig[normalizedRole];
}
