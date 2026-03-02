"use client";

import { ReactNode } from "react";
import { RouteProtection } from "@/components/route-protection";

export default function JobsLayout({ children }: { children: ReactNode }) {
  return (
    <RouteProtection requiredRoutes={["/jobs"]}>
      {children}
    </RouteProtection>
  );
}
