"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useAuth";
import { usePathname, useRouter } from "next/navigation";
import { canAccessRoute } from "@/lib/roleAccess";
import { Loader2 } from "lucide-react";

interface ProtectedLayoutProps {
  children: React.ReactNode;
  requiredRole?: string | string[];
}

/**
 * Wrapper component for protected routes
 * Ensures user is authenticated and has access to the current route
 * Redirects to login if not authenticated, or to access-denied if lacking permissions
 */
export function ProtectedLayout({
  children,
  requiredRole,
}: ProtectedLayoutProps) {
  const { isLoading, user } = useRequireAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    // Skip check if still loading
    if (isLoading) {
      return;
    }

    // If no user after loading is complete, allow redirect to handle it
    if (!user) {
      return;
    }

    // If specific roles are required, check if user has one of them
    if (requiredRole) {
      const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
      if (!requiredRoles.includes(user.role || "")) {
        router.push(`/access-denied?from=${encodeURIComponent(pathname)}`);
        return;
      }
    }

    // Check if user can access the current route based on their role
    if (!canAccessRoute(user.role || "", pathname)) {
      router.push(`/access-denied?from=${encodeURIComponent(pathname)}`);
      return;
    }

    // User is authenticated and has access, allow render
    setShouldRender(true);
  }, [isLoading, user, pathname, router, requiredRole]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is authenticated and has access, render content
  if (user && shouldRender) {
    return <>{children}</>;
  }

  // Still checking access or redirecting
  if (user && !shouldRender) {
    return null;
  }

  // No user, will be handled by useRequireAuth redirect
  return null;
}
