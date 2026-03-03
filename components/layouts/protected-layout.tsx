"use client";

import { useEffect } from "react";
import { useRequireAuth } from "@/lib/useAuth";
import { usePathname, useRouter } from "next/navigation";
import { canAccessRoute, getPrimaryRouteForRole, isPublicRoute } from "@/lib/roleAccess";
import { Loader2 } from "lucide-react";

interface ProtectedLayoutProps {
  children: React.ReactNode;
  requiredRole?: string | string[];
}

export function ProtectedLayout({
  children,
  requiredRole,
}: ProtectedLayoutProps) {
  const { isLoading, user } = useRequireAuth();
  const pathname = usePathname();
  const router = useRouter();

  const publicRoute = isPublicRoute(pathname);
  const isAuthRoute = pathname === "/auth" || pathname.startsWith("/auth/");

  const requiredRoles = requiredRole
    ? Array.isArray(requiredRole)
      ? requiredRole
      : [requiredRole]
    : null;

  const isAdmin = String(user?.role || "").toLowerCase().trim() === "admin";

  // Admin must never be blocked by requiredRole gates
  const normalizedUserRole = String(user?.role || "").toLowerCase().trim();
  const normalizedRequiredRoles = requiredRoles?.map((r) => String(r).toLowerCase().trim()) ?? null;
  const hasRoleAccess =
    isAdmin ||
    !normalizedRequiredRoles ||
    normalizedRequiredRoles.includes(normalizedUserRole);

  const hasRouteAccess = canAccessRoute(user?.role || "", pathname);

  /* ==============================
     REDIRECT LOGIC (Hydration Safe)
     ============================== */
  useEffect(() => {
    // If user is logged in AND accessing /auth page → redirect to primary route
    // (auth routes are "public", but logged-in users should not stay there)
    if (!isLoading && user && isAuthRoute) {
      router.push(getPrimaryRouteForRole(user.role));
      return;
    }

    // Other public pages always allowed (ex: /access-denied)
    if (publicRoute) return;

    // Wait until auth state fully resolves
    if (isLoading) return;

    // If no authenticated user → redirect to login
    if (!user) {
      router.push("/auth/login");
      return;
    }

    // If user exists but no access → redirect to access denied
    if (!hasRoleAccess || !hasRouteAccess) {
      // Ensure admin never lands on /access-denied via redirects
      if (isAdmin) {
        router.push(getPrimaryRouteForRole(user.role));
        return;
      }
      router.push(`/access-denied?from=${encodeURIComponent(pathname)}`);
    }
  }, [
    isLoading,
    user,
    pathname,
    router,
    publicRoute,
    isAuthRoute,
    hasRoleAccess,
    hasRouteAccess,
    isAdmin,
  ]);

  /* ==============================
     RENDER LOGIC
     ============================== */

  // Public pages always render
  if (publicRoute) {
    return <>{children}</>;
  }

  // While loading auth → show spinner
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If not authenticated → do not render (redirect already triggered)
  if (!user) {
    return null;
  }

  // If authenticated and authorized → render page
  if (hasRoleAccess && hasRouteAccess) {
    return <>{children}</>;
  }

  // Otherwise → do not render (redirect already triggered)
  return null;
}
