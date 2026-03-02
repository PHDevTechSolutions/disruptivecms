"use client";

import { ReactNode } from "react";
import { RouteProtection } from "@/components/route-protection";

export default function ProductsLayout({ children }: { children: ReactNode }) {
  return (
    <RouteProtection requiredRoutes={["/products"]}>
      {children}
    </RouteProtection>
  );
}
