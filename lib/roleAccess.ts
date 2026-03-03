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
 * Maps each role to the routes they have access to
 */
export const roleAccessConfig: RoleAccessConfig = {
  admin: [
    "/dashboard",
    "/products/all-products",
    "/content/blogs",
    "/jobs/careers",
    "/settings",
    "/admin",
    "/inquiries",
  ],
  warehouse: [
    "/dashboard",
    "/products/all-products",
  ],
  staff: [
    "/dashboard",
    "/products/all-products",
  ],
  inventory: [
    "/dashboard",
    "/products/all-products",
  ],
  hr: [
    "/dashboard",
    "/jobs/careers",
  ],
  seo: [
    "/dashboard",
    "/content/blogs",
  ],
  csr: [
    "/dashboard",
    "/inquiries",
  ],
  ecomm: [
    "/dashboard",
    "/products/all-products",
  ],
  pd: [
    "/products/all-products",
  ],
};

/**
 * Check if a user with a specific role can access a given route
 * @param role - The user's role
 * @param path - The path to check access for
 * @returns true if the user can access the path, false otherwise
 */
export function canAccessRoute(role: string, path: string): boolean {
  const allowedRoutes = roleAccessConfig[role];
  
  if (!allowedRoutes) {
    return false;
  }

  // Check for exact match or parent route match
  // e.g., /products/all-products matches routes that start with /products/all-products
  return allowedRoutes.some(route => 
    path === route || path.startsWith(route + "/")
  );
}

/**
 * Get the primary/home route for a given role
 * This is the route the user is redirected to after login
 * @param role - The user's role
 * @returns The primary route for this role
 */
export function getPrimaryRouteForRole(role: string): string {
  const primaryRoutes: Record<string, string> = {
    admin: "/products/all-products",
    warehouse: "/products/all-products",
    staff: "/products/all-products",
    inventory: "/products/all-products",
    hr: "/jobs/careers",
    seo: "/content/blogs",
    csr: "/inquiries/customer-inquiries",
    ecomm: "/products/all-products",
    pd: "/products/all-products",
  };

  return primaryRoutes[role] || "/products/all-products";
}

/**
 * Get all accessible routes for a given role
 * @param role - The user's role
 * @returns Array of routes the user can access
 */
export function getAccessibleRoutes(role: string): string[] {
  return roleAccessConfig[role] || [];
}
