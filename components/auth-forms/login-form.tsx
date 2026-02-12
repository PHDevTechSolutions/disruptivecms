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
import { Loader2, Eye, EyeOff } from "lucide-react"; // Added Eye icons

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

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false); // Visibility state

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

    const validRoles = [
      "admin",
      "warehouse",
      "staff",
      "inventory",
      "hr",
      "seo",
      "csr",
      "ecomm",
    ];
    if (!validRoles.includes(role)) {
      throw new Error("unauthorized_role");
    }

    // Set Session Tracking
    document.cookie =
      "admin_session=true; path=/; max-age=3600; SameSite=Strict";
    localStorage.setItem(
      "disruptive_admin_user",
      JSON.stringify({
        uid: user.uid,
        name: userData.fullName || userData.name || "Internal Staff",
        email: user.email,
        role,
        accessLevel:
          userData.accessLevel || (role === "admin" ? "full" : "staff"),
      }),
    );

    toast.success(`Access Authorized: ${role.toUpperCase()}`, {
      id: loginToast,
    });

    // Role-based routing
    const roleRoutes: Record<string, string> = {
      warehouse: "/products/website-products",
      admin: "/products/website-products",
      seo: "/content/blogs",
      hr: "/jobs/careers",
    };

    const redirectPath = roleRoutes[role] || "/products/all-products";
    router.push(redirectPath);
  };

  /* =========================
      ERROR HANDLER HELPER
     ========================= */
  const handleAuthError = async (error: any, loginToast: string | number) => {
    await signOut(auth);
    document.cookie =
      "admin_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
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
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  Login with Google
                </Button>
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                Or continue with
              </FieldSeparator>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <a
                    href="#"
                    className="ml-auto text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
              <Field>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    "Login"
                  )}
                </Button>
                <FieldDescription className="text-center">
                  Don&apos;t have an account?{" "}
                  <a
                    href="/auth/register"
                    className="underline underline-offset-4"
                  >
                    Sign up
                  </a>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our{" "}
        <a href="#" className="underline underline-offset-4">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="#" className="underline underline-offset-4">
          Privacy Policy
        </a>
        .
      </FieldDescription>
    </div>
  );
}
