"use client";

import { ReactNode } from "react";
import { RouteProtection } from "@/components/route-protection";

export default function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <RouteProtection requiredRoutes={["/content"]}>
      {children}
    </RouteProtection>
  );
}
