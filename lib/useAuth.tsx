"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export interface User {
  uid: string;
  email: string;
  name: string;
  role: string;
  accessLevel: string;
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

  // Check session only on mount
  useEffect(() => {
    checkSession();
  }, []);

  // Refresh session every 24 hours to keep it alive
  useEffect(() => {
    if (!user) return;

    const refreshInterval = setInterval(async () => {
      try {
        const response = await fetch("/api/auth/refresh", { method: "POST" });
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          // Session expired - only logout if explicitly requested
          console.warn("[Auth] Session refresh failed");
        }
      } catch (error) {
        console.error("[Auth] Error refreshing session:", error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours

    return () => clearInterval(refreshInterval);
  }, [user]);

  async function checkSession() {
    try {
      const response = await fetch("/api/auth/user");

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        // Also update localStorage for backward compatibility
        localStorage.setItem(
          "disruptive_admin_user",
          JSON.stringify(data.user)
        );
      } else {
        // 401 Unauthorized - clear session
        if (response.status === 401) {
          setUser(null);
          localStorage.removeItem("disruptive_admin_user");
        } else {
          // Other errors (500, network, etc.) - keep existing user to prevent logout
          console.warn(`[Auth] Session check failed with status ${response.status}`);
          // Try to restore from localStorage as fallback
          const cached = localStorage.getItem("disruptive_admin_user");
          if (cached) {
            try {
              setUser(JSON.parse(cached));
            } catch (e) {
              console.error("[Auth] Failed to parse cached user:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("[Auth] Error checking session:", error);
      // Network error or other issue - restore from cache to maintain persistence
      const cached = localStorage.getItem("disruptive_admin_user");
      if (cached) {
        try {
          setUser(JSON.parse(cached));
        } catch (e) {
          console.error("[Auth] Failed to parse cached user:", e);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    try {
      // Sign out from Firebase
      await signOut(auth);

      // Clear server-side session
      await fetch("/api/auth/logout", { method: "POST" });

      // Clear client-side state
      setUser(null);
      localStorage.removeItem("disruptive_admin_user");

      // Redirect to login
      router.push("/auth/login");
    } catch (error) {
      console.error("[Auth] Error during logout:", error);
    }
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

/**
 * Hook to access auth context
 * Usage: const { user, isLoggedIn, logout } = useAuth()
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

/**
 * Hook to require authentication
 * Redirects to login if not logged in
 */
export function useRequireAuth() {
  const { user, isLoading, isLoggedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push("/auth/login");
    }
  }, [isLoading, isLoggedIn, router]);

  return { user, isLoading };
}
