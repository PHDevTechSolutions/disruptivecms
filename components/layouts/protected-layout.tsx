"use client";

import { useRequireAuth } from "@/lib/useAuth";
import { Loader2 } from "lucide-react";

/**
 * Wrapper component for protected routes
 * Ensures user is authenticated before rendering children
 * Redirects to login if session is not valid
 */
export function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading } = useRequireAuth();

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

  return <>{children}</>;
}
