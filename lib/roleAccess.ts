/**
 * Role-Based Access Control Configuration
 * Defines which pages/routes each role has access to
 */

export type UserRole =
  | "admin"
  | "warehouse"
  | "staff"
  | "inventory"
  | "hr"
  | "seo"
  | "csr"
  | "ecomm"
  | "pd";

export type RoleAccessConfig = {
  [key in UserRole]: string[];
};

/* ==============================
   PUBLIC ROUTES
   ============================== */

export const PUBLIC_ROUTES = [
  "/auth/login",
  "/auth/register",
  "/access-denied",
];

/* ==============================
   ROLE ACCESS CONFIG
   ============================== */

export const roleAccessConfig: RoleAccessConfig = {
  admin: ["*"],
  pd: ["/products/all-products"],
  seo: ["/content/blogs"],
  hr: ["/jobs"],
  warehouse: [],
  staff: [],
  inventory: [],
  csr: [],
  ecomm: [],
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
 * Check if a role can access a specific route
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

  const allowedRoutes = roleAccessConfig[normalizedRole as UserRole];
  if (!allowedRoutes) return false;

  if (allowedRoutes.includes("*")) {
    return true;
  }

  // Normalize path (remove trailing slash)
  const normalizedPath = path.replace(/\/$/, "");

  return allowedRoutes.some((route) => {
    const normalizedRoute = route.replace(/\/$/, "");

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
    admin: "/products/all-products",
    pd: "/products/all-products",
    seo: "/content/blogs",
    hr: "/jobs",
    warehouse: "/access-denied",
    staff: "/access-denied",
    inventory: "/access-denied",
    csr: "/access-denied",
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
