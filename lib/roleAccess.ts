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

export interface RoleAccessConfig {
  [key: string]: string[];
}

/**
 * Public routes accessible to everyone regardless of authentication or role
 */
export const PUBLIC_ROUTES = [
  "/auth/login",
  "/auth/register",
  "/access-denied",
];

/**
 * Maps each role to the routes they have access to
 *
 * Access Rules:
 * - Everyone:  PUBLIC_ROUTES (/auth/*, /access-denied) — no auth required
 * - admin:     all pages (wildcard "*")
 * - pd:        /products/all-products only
 * - seo:       /content/blogs only
 * - hr:        all pages under /jobs (e.g. /jobs, /jobs/create, /jobs/123)
 * - warehouse, staff, inventory, csr, ecomm: no access (redirect to /access-denied)
 */
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

/**
 * Check if a given path is a public route (no auth required)
 */
export function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => path === route || path.startsWith(route + "/"),
  );
}

/**
 * Check if a user with a specific role can access a given route
 */
export function canAccessRoute(role: string, path: string): boolean {
  // Always allow public routes regardless of role or auth state
  if (isPublicRoute(path)) {
    return true;
  }

  const allowedRoutes = roleAccessConfig[role];

  // Unknown role → deny
  if (!allowedRoutes) {
    return false;
  }

  // Admin wildcard → allow everything
  if (allowedRoutes.includes("*")) {
    return true;
  }

  // Match exact path OR any sub-path
  // e.g. "/jobs" allows /jobs, /jobs/create, /jobs/123/edit
  return allowedRoutes.some(
    (route) => path === route || path.startsWith(route + "/"),
  );
}

/**
 * Get the primary/home route for a given role
 * This is the route the user is redirected to after login
 */
export function getPrimaryRouteForRole(role: string): string {
  const primaryRoutes: Record<string, string> = {
    admin: "/products/all-products",
    pd: "/products/all-products",
    seo: "/content/blogs",
    hr: "/jobs",
    // Roles with no page access land on /access-denied
    warehouse: "/access-denied",
    staff: "/access-denied",
    inventory: "/access-denied",
    csr: "/access-denied",
    ecomm: "/access-denied",
  };

  return primaryRoutes[role] || "/access-denied";
}

/**
 * Get all accessible routes for a given role
 */
export function getAccessibleRoutes(role: string): string[] {
  return roleAccessConfig[role] || [];
}
