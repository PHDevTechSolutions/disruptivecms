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

  // Check session on mount and page visibility change
  useEffect(() => {
    checkSession();

    // Check session when page becomes visible (browser returns from background)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkSession();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Refresh session every 6 hours to keep it alive
  useEffect(() => {
    if (!user) return;

    const refreshInterval = setInterval(async () => {
      try {
        const response = await fetch("/api/auth/refresh", { method: "POST" });
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          // Session expired
          await handleLogout();
        }
      } catch (error) {
        console.error("[Auth] Error refreshing session:", error);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

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
        setUser(null);
        localStorage.removeItem("disruptive_admin_user");
      }
    } catch (error) {
      console.error("[Auth] Error checking session:", error);
      setUser(null);
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
