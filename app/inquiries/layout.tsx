"use client";

import { ReactNode } from "react";
import { RouteProtection } from "@/components/route-protection";

export default function InquiriesLayout({ children }: { children: ReactNode }) {
  return (
    <RouteProtection requiredRoutes={["/inquiries"]}>
      {children}
    </RouteProtection>
  );
}
