"use client";

import { ReactNode } from "react";
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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  // Check if user has access to any of the required routes
  const hasAccess = requiredRoutes.some(route => canAccessRoute(user.role || "", route));

  if (!hasAccess) {
    router.push(`/access-denied?from=${encodeURIComponent(currentPath)}`);
    return null;
  }

  return <>{children}</>;
}
