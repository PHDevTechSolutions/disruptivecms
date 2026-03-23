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

export const PUBLIC_ROUTES = ["/auth", "/access-denied"];

/* ==============================
   SUPERADMIN-ONLY ROUTES
   ============================== */

export const SUPERADMIN_ONLY_ROUTES = ["/admin/register"];

export const VERIFY_ONLY_ROUTES = ["/admin/requests"];

/* ==============================
   ROLE ACCESS CONFIG
   ============================== */

export const roleAccessConfig: RoleAccessConfig = {
  superadmin: ["*"],
  admin: ["*"],
  director: ["*"],

  pd_manager: [
    "/products/all-products",
    "/products/requests",
    "/admin/deleted-products",
    "/admin/audit-logs", // ← added
  ],
  pd_engineer: ["/products/all-products", "/products/requests"],
  pd: ["/products/all-products", "/products/requests"],

  project_sales: ["/products/all-products"],

  hr: ["/jobs/applications"],

  seo: ["/content"],
  marketing: ["/content"],

  csr: ["/inquiries"],

  warehouse: ["/access-denied"],
  staff: ["/access-denied"],
  inventory: ["/access-denied"],
  ecomm: ["/access-denied"],
};

/* ==============================
   HELPERS
   ============================== */

function normalizeRole(role?: string | null): UserRole | null {
  if (!role) return null;
  const normalized = role.toLowerCase().trim() as UserRole;
  return normalized in roleAccessConfig ? normalized : null;
}

export function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => path === route || path.startsWith(route + "/"),
  );
}

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

export function canAccessRoute(
  role: string | null | undefined,
  path: string,
): boolean {
  if (isPublicRoute(path)) return true;
  if (!role) return false;

  const normalizedRole = role.toLowerCase().trim();

  if (isSuperadminOnlyRoute(path)) {
    return normalizedRole === "superadmin";
  }

  const allowedRoutes = roleAccessConfig[normalizedRole as UserRole];
  if (!allowedRoutes) return false;

  if (allowedRoutes.includes("*")) return true;

  const normalizedPath = path.replace(/\/$/, "");

  return allowedRoutes.some((route) => {
    const normalizedRoute = route.replace(/\/$/, "");

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

export function getAccessibleRoutes(role: string): string[] {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return [];
  return roleAccessConfig[normalizedRole];
}
