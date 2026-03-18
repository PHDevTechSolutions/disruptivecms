"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Loader2, Eye, EyeOff } from "lucide-react";

// Firebase Imports
import { auth, db } from "@/lib/firebase";
import { getDoc, doc } from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { toast } from "sonner";
import { getPrimaryRouteForRole } from "@/lib/roleAccess";
import { getScopeAccessForRole, getAccessLevelForRole } from "@/lib/rbac";
import { useAuth } from "@/lib/useAuth";
import { useSearchParams } from "next/navigation";

const LOGIN_MARKER_KEY = "disruptive_last_login_at";

/**
 * All roles that are permitted to log in to the CMS.
 * Keep in sync with lib/roleAccess.ts → UserRole.
 */
const VALID_ROLES = new Set([
  "superadmin",
  "admin",
  "director",
  "pd_manager",
  "pd_engineer",
  "pd", // legacy
  "project_sales",
  "warehouse",
  "staff",
  "inventory",
  "hr",
  "seo",
  "csr",
  "ecomm",
  "marketing",
]);

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const { user: authedUser, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // No automatic redirects from /auth/login.
  // Redirect happens only after a successful login submit.

  /* =========================
      SHARED CMS AUTH CHECK
     ========================= */
  const authorizeCMSUser = async (user: any, loginToast: any) => {
    const userDoc = await getDoc(doc(db, "adminaccount", user.uid));

    if (!userDoc.exists()) {
      throw new Error("user_not_registered");
    }

    const userData = userDoc.data();
    const role = String(userData.role || "")
      .toLowerCase()
      .trim();
    const status = String(userData.status || "")
      .toLowerCase()
      .trim();

    if (status !== "active") {
      throw new Error("account_disabled");
    }

    if (!VALID_ROLES.has(role)) {
      throw new Error("unauthorized_role");
    }

    // ── RBAC: resolve scopeAccess ──────────────────────────────────────────
    // Prefer the value stored in Firestore (set at account creation / edit).
    // Fall back to computing from role for accounts created before this field.
    const scopeAccess: string[] =
      Array.isArray(userData.scopeAccess) && userData.scopeAccess.length > 0
        ? userData.scopeAccess
        : getScopeAccessForRole(role);

    // Derive legacy accessLevel (with RBAC-aware logic)
    const accessLevel = userData.accessLevel || getAccessLevelForRole(role);

    // Create session via API (scopeAccess is now forwarded)
    const sessionData = {
      uid: user.uid,
      name: userData.fullName || userData.name || "Internal Staff",
      email: user.email,
      role,
      accessLevel,
      scopeAccess,
    };

    const sessionResponse = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionData),
    });

    if (!sessionResponse.ok) {
      throw new Error("Failed to create session");
    }

    // Also store in localStorage for client-side access
    const loginAt = Date.now();
    localStorage.setItem(LOGIN_MARKER_KEY, String(loginAt));
    localStorage.setItem("disruptive_admin_user", JSON.stringify(sessionData));

    toast.success(`Access Authorized: ${role.toUpperCase()}`, {
      id: loginToast,
    });

    // Role-based routing using centralized configuration
    const redirectPath = getPrimaryRouteForRole(role);
    router.replace(redirectPath);
  };

  /* =========================
      ERROR HANDLER HELPER
     ========================= */
  const handleAuthError = async (error: any, loginToast: string | number) => {
    await signOut(auth);
    // Best-effort: clear any server session cookie (HTTP-only) via API
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    localStorage.removeItem("disruptive_admin_user");

    if (error?.code === "auth/popup-closed-by-user") {
      toast.dismiss(loginToast);
      return;
    }

    const messages: Record<string, string> = {
      user_not_registered:
        "This account is not registered. Please sign up first.",
      unauthorized_role: "Access denied: Invalid role.",
      account_disabled: "Account is disabled.",
      "auth/invalid-credential": "Invalid email or password.",
    };

    toast.error(
      messages[error.message] ||
        messages[error.code] ||
        "Authentication failed.",
      {
        id: loginToast,
      },
    );
  };

  /* =========================
      HANDLERS
     ========================= */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Please fill in all fields");

    setIsLoading(true);
    const loginToast = toast.loading("Checking Internal Access...");

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await authorizeCMSUser(cred.user, loginToast);
    } catch (error: any) {
      handleAuthError(error, loginToast);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const loginToast = toast.loading("Waiting for Google authentication...");

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      await authorizeCMSUser(result.user, loginToast);
    } catch (error: any) {
      handleAuthError(error, loginToast);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center pb-4">
            <Image
              src="/logo-full.png"
              alt="Company Logo"
              width={180}
              height={60}
              priority
              className="object-contain"
            />
          </div>
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            Login with your Company Email or Google account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <FieldGroup>
              <Field>
                <Button
                  variant="outline"
                  type="button"
                  className="w-full"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    className="w-4 h-4 mr-2"
                  >
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.827 16.08 0 12.48 0 5.868 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  Login with Google
                </Button>
              </Field>

              <FieldSeparator />

              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <FieldDescription>
                  Contact your administrator if you forgot your credentials.
                </FieldDescription>
              </Field>

              <Field>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying…
                    </>
                  ) : (
                    "Login"
                  )}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
