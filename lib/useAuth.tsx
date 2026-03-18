"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
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
  /** RBAC scopes — populated from Firestore at login and stored in the session cookie */
  scopeAccess: string[];
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isLoggedIn: false,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  /* =========================
     INITIAL HYDRATION
  ========================= */
  useEffect(() => {
    // Do not trust localStorage as an auth source-of-truth (prevents bounce-back after logout).
    // Persisted session is validated by /api/auth/user (HTTP-only cookie).
    verifySession();
  }, []);

  /* =========================
     SERVER VALIDATION
  ========================= */
  async function verifySession() {
    try {
      const response = await fetch("/api/auth/user", { cache: "no-store" });

      if (response.ok) {
        const data = await response.json();
        // Back-fill scopeAccess on the client in case older cookies lack it
        if (!Array.isArray(data.user?.scopeAccess)) {
          const { getScopeAccessForRole } = await import("@/lib/rbac");
          data.user.scopeAccess = getScopeAccessForRole(data.user.role ?? "");
        }
        setUser(data.user);
        localStorage.setItem(
          "disruptive_admin_user",
          JSON.stringify(data.user),
        );
      } else if (response.status === 401) {
        // Avoid redirect loops caused by in-flight session checks during login.
        // If a login just happened, don't clear state on a stale 401; re-check once shortly after.
        const lastLoginAtRaw =
          typeof window !== "undefined"
            ? window.localStorage.getItem(LOGIN_MARKER_KEY)
            : null;
        const lastLoginAt = lastLoginAtRaw ? Number(lastLoginAtRaw) : NaN;
        if (Number.isFinite(lastLoginAt) && Date.now() - lastLoginAt < 15_000) {
          setTimeout(() => verifySession(), 400);
          return;
        }

        setUser(null);
        localStorage.removeItem("disruptive_admin_user");
      }
    } catch (error) {
      console.warn("[Auth] Server check failed.");
    } finally {
      setIsLoading(false);
    }
  }

  /* =========================
     LOGOUT
  ========================= */
  async function handleLogout() {
    // Manual logout: destroy session and stay on /auth/login
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
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: !!user,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* =========================
   HOOKS
========================= */

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

/**
 * Hook to require specific roles for a page/component
 * Redirects to /access-denied if user doesn't have required role(s)
 */
export function useRequireRole(requiredRoles: string | string[]) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const rolesArray = Array.isArray(requiredRoles)
    ? requiredRoles
    : [requiredRoles];
  const hasRequiredRole = user && rolesArray.includes(user.role.toLowerCase());

  useEffect(() => {
    if (isLoading) return;

    // Not authenticated
    if (!user) {
      router.push("/auth/login");
      return;
    }

    // No required role
    if (!hasRequiredRole) {
      const pathname = window.location.pathname;
      router.push(`/access-denied?from=${encodeURIComponent(pathname)}`);
      return;
    }
  }, [isLoading, user, hasRequiredRole, router]);

  return { user, isLoading, hasRequiredRole };
}
