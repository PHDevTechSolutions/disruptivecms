"use client";

import { ReactNode } from "react";
import { RouteProtection } from "@/components/route-protection";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RouteProtection requiredRoutes={["/admin"]}>
      {children}
    </RouteProtection>
  );
}
