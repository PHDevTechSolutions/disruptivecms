"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

export default function RegisterLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    // Must be authenticated and have superadmin role
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const userRole = String(user?.role || "").toLowerCase().trim();
    if (userRole !== "superadmin") {
      router.push(`/access-denied?from=${encodeURIComponent("/admin/register")}`);
      return;
    }

    // User is superadmin - allow access
    setShouldRender(true);
  }, [user, isLoading, router]);

  // Show loading state only during initial auth check
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Render content only when authorized as superadmin
  if (shouldRender) {
    return <>{children}</>;
  }

  // Still checking or redirecting - render nothing
  return null;
}
