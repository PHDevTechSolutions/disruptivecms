"use client";

import { useAuth } from "@/lib/useAuth";
import { ReactNode } from "react";

interface RoleBasedRenderProps {
  children: ReactNode;
  allowedRoles: string[];
  fallback?: ReactNode;
}

/**
 * Component that conditionally renders content based on user role
 * Useful for showing/hiding features, buttons, sections based on permissions
 */
export function RoleBasedRender({
  children,
  allowedRoles,
  fallback = null,
}: RoleBasedRenderProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return fallback;
  }

  if (!user || !allowedRoles.includes(user.role || "")) {
    return fallback;
  }

  return <>{children}</>;
}
