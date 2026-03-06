"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { canAccessRoute } from "@/lib/roleAccess";

interface RouteProtectionProps {
  children: ReactNode;
  requiredRoutes: string[];
}

export function RouteProtection({ children, requiredRoutes }: RouteProtectionProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [shouldRender, setShouldRender] = useState(false);

  // Get the current path from the request
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

  const normalizedRole = String(user?.role || "").toLowerCase().trim();
  const isAdmin = normalizedRole === "admin" || normalizedRole === "superadmin";

  // Determine whether this protection applies to the current path (layout scope)
  const inScope = requiredRoutes.some((route) => {
    const normalizedRoute = String(route || "").replace(/\/$/, "");
    const normalizedPath = String(currentPath || "").replace(/\/$/, "");
    return (
      normalizedPath === normalizedRoute ||
      normalizedPath.startsWith(normalizedRoute + "/")
    );
  });

  // Authorize against the *current* path (not the scope prefix)
  const hasAccess =
    !inScope ? true : isAdmin ? true : !!user && canAccessRoute(user.role || "", currentPath);

  // Handle redirects and rendering logic
  useEffect(() => {
    if (isLoading) return;

    // Allow public access to auth routes without authentication
    if (currentPath.startsWith("/auth")) {
      setShouldRender(true);
      return;
    }

    if (!user) {
      router.push("/auth/login");
      return;
    }

    if (!hasAccess) {
      router.push(`/access-denied?from=${encodeURIComponent(currentPath)}`);
      return;
    }

    // User is authenticated and has access
    setShouldRender(true);
  }, [user, hasAccess, isLoading, router, currentPath]);

  // Show loading state only during initial auth check
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Render content only when authorized
  if (shouldRender) {
    return <>{children}</>;
  }

  // Still checking or redirecting - render nothing
  return null;
}
