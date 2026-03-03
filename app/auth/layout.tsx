import { ReactNode } from "react";

/**
 * Auth Layout
 * This layout wraps all authentication pages (/auth/*)
 * No route protection is applied here - these pages are publicly accessible
 */
export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
