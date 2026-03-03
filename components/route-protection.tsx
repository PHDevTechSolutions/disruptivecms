"use client";

import { ReactNode, useEffect } from "react";
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

  // Get the current path from the request
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

  // Check if user has access to any of the required routes
  const hasAccess = user ? requiredRoutes.some(route => canAccessRoute(user.role || "", route)) : false;

  // Handle redirects in useEffect to avoid setState during render
  useEffect(() => {
    if (isLoading) return;

    // Allow public access to auth routes without authentication
    if (currentPath.startsWith("/auth")) {
      return;
    }

    if (!user) {
      router.push("/auth/login");
      return;
    }

    if (!hasAccess) {
      router.push(`/access-denied?from=${encodeURIComponent(currentPath)}`);
    }
  }, [user, hasAccess, isLoading, router, currentPath]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user || !hasAccess) {
    return null;
  }

  return <>{children}</>;
}
