"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

const LOGIN_MARKER_KEY = "disruptive_last_login_at";

export interface User {
  uid: string;
  email: string;
  name: string;
  role: string;
  accessLevel: string;
  scopeAccess: string[];
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  /**
   * Called by the login form immediately after the session cookie is set.
   * Pushes the resolved user into context so RouteProtection never sees
   * the stale null state during navigation.
   */
  login: (userData: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isLoggedIn: false,
  login: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // ── verifySession ──────────────────────────────────────────────────────────
  // IMPORTANT: setIsLoading(false) is called explicitly in every branch so it
  // is NEVER called when a retry is scheduled.  Using finally{} was the original
  // bug — finally runs even after an early return, so isLoading became false
  // while user was still null, causing RouteProtection to redirect back to login.
  const verifySession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/user", { cache: "no-store" });

      if (response.ok) {
        const data = await response.json();

        // Back-fill scopeAccess for cookies created before this field existed
        if (!Array.isArray(data.user?.scopeAccess)) {
          const { getScopeAccessForRole } = await import("@/lib/rbac");
          data.user.scopeAccess = getScopeAccessForRole(data.user.role ?? "");
        }

        setUser(data.user);
        localStorage.setItem(
          "disruptive_admin_user",
          JSON.stringify(data.user),
        );
        setIsLoading(false);
        return;
      }

      if (response.status === 401) {
        // If a login just completed (marker set within 15 s), the cookie may
        // not be readable yet on this request.  Schedule ONE retry.
        const raw =
          typeof window !== "undefined"
            ? window.localStorage.getItem(LOGIN_MARKER_KEY)
            : null;
        const lastLoginAt = raw ? Number(raw) : NaN;

        if (Number.isFinite(lastLoginAt) && Date.now() - lastLoginAt < 15_000) {
          // Do NOT call setIsLoading(false) here — keep the spinner up until
          // the retry resolves so RouteProtection won't fire a redirect.
          setTimeout(() => verifySession(), 400);
          return;
        }

        // No recent login — treat as genuinely unauthenticated
        setUser(null);
        localStorage.removeItem("disruptive_admin_user");
        setIsLoading(false);
        return;
      }

      // Any other HTTP status (500 etc.) — fail open so the user isn't stuck
      setUser(null);
      setIsLoading(false);
    } catch {
      console.warn("[Auth] Session check failed — network error.");
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  // ── login ──────────────────────────────────────────────────────────────────
  // The login form calls this BEFORE router.replace() so that the user state
  // is already set when RouteProtection evaluates on the destination page.
  const handleLogin = useCallback((userData: User) => {
    setUser(userData);
    setIsLoading(false);
    localStorage.setItem("disruptive_admin_user", JSON.stringify(userData));
  }, []);

  // ── logout ─────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }

    setUser(null);
    localStorage.removeItem("disruptive_admin_user");
    localStorage.removeItem(LOGIN_MARKER_KEY);

    router.replace("/auth/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: !!user,
        login: handleLogin,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}

export function useRequireAuth() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/auth/login");
    }
  }, [isLoading, user, router]);

  return { user, isLoading };
}

export function useRequireRole(requiredRoles: string | string[]) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const rolesArray = Array.isArray(requiredRoles)
    ? requiredRoles
    : [requiredRoles];
  const hasRequiredRole = user && rolesArray.includes(user.role.toLowerCase());

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }
    if (!hasRequiredRole) {
      router.push(
        `/access-denied?from=${encodeURIComponent(window.location.pathname)}`,
      );
    }
  }, [isLoading, user, hasRequiredRole, router]);

  return { user, isLoading, hasRequiredRole };
}
