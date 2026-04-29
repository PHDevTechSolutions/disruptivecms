"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { doc, getDoc } from "@/lib/firestore/client";
import { auth, db } from "@/lib/firebase";
import { useAuth, User } from "@/lib/useAuth";
import { getPrimaryRouteForRole } from "@/lib/roleAccess";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const LOGIN_MARKER_KEY = "disruptive_last_login_at";

function friendlyAuthError(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password. Please try again.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please wait a few minutes and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact your administrator.";
    case "auth/network-request-failed":
      return "Network error. Please check your connection.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    case "auth/popup-blocked":
      return "Pop-up was blocked by your browser. Please allow pop-ups and try again.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with this email using a different sign-in method.";
    default:
      return "Login failed. Please try again.";
  }
}

function GoogleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width="16"
      height="16"
      style={{ flexShrink: 0 }}
    >
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19.1 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.6 39.5 16.3 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.9 2.4-2.5 4.5-4.6 5.9l6.2 5.2C40.9 36.2 44 30.5 44 24c0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  async function finalizeLogin(
    firebaseUser: {
      uid: string;
      email: string | null;
      displayName: string | null;
    },
    onError: (msg: string) => void,
    onDone: () => void,
  ) {
    const userSnap = await getDoc(doc(db, "adminaccount", firebaseUser.uid));

    if (!userSnap.exists()) {
      onError("Account not found. Please contact your administrator.");
      onDone();
      return;
    }

    const data = userSnap.data();

    if (data.status === "inactive") {
      onError("Your account is inactive. Please contact your administrator.");
      onDone();
      return;
    }

    const role = String(data.role || "")
      .toLowerCase()
      .trim();
    const fullName = data.fullName || firebaseUser.displayName || "User";

    const sessionRes = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? "",
        name: fullName,
        role,
      }),
    });

    if (!sessionRes.ok) {
      const errData = await sessionRes.json().catch(() => ({}));
      onError(errData.error || "Session creation failed. Please try again.");
      onDone();
      return;
    }

    const sessionData = await sessionRes.json();
    const resolvedUser: User = sessionData.user;

    // Mark login time for the verifySession retry guard
    localStorage.setItem(LOGIN_MARKER_KEY, String(Date.now()));

    // ── Critical: update AuthContext BEFORE navigating ──────────────────────
    // AuthProvider is mounted at the root and does NOT re-run verifySession on
    // navigation. Without this call, RouteProtection sees user=null and
    // immediately redirects back to /auth/login.
    login(resolvedUser);

    const destination = getPrimaryRouteForRole(resolvedUser.role);
    toast.success(`Welcome back, ${fullName.split(" ")[0]}!`);
    router.replace(destination);
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      await finalizeLogin(
        credential.user,
        (msg) => setError(msg),
        () => setIsLoading(false),
      );
    } catch (err: any) {
      const msg = friendlyAuthError(err?.code ?? "");
      if (msg) setError(msg);
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(auth, provider);
      await finalizeLogin(
        credential.user,
        (msg) => setError(msg),
        () => setIsGoogleLoading(false),
      );
    } catch (err: any) {
      const msg = friendlyAuthError(err?.code ?? "");
      if (msg) setError(msg);
      setIsGoogleLoading(false);
    }
  };

  const anyLoading = isLoading || isGoogleLoading;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">JarIS CMS</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your account
          </p>
        </div>

        <div className="bg-background border rounded-none shadow-sm p-6 space-y-4">
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-none h-10 gap-2 font-medium text-sm"
            onClick={handleGoogleLogin}
            disabled={anyLoading}
          >
            {isGoogleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">
              or
            </span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-[10px] font-bold uppercase tracking-wider opacity-60"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  placeholder="name@company.com"
                  className="pl-9 rounded-none h-10 text-sm"
                  autoComplete="email"
                  disabled={anyLoading}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-[10px] font-bold uppercase tracking-wider opacity-60"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="Your password"
                  className="pl-9 pr-10 rounded-none h-10 text-sm"
                  autoComplete="current-password"
                  disabled={anyLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  disabled={anyLoading}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-none px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={anyLoading}
              className="w-full rounded-none h-10 uppercase font-bold text-[10px] tracking-widest"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          Contact your administrator if you need access.
        </p>
      </div>
    </div>
  );
}
