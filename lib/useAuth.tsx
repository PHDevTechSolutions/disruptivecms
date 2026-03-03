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

  /* =========================
     INITIAL HYDRATION
  ========================= */
  useEffect(() => {
    const cached = localStorage.getItem("disruptive_admin_user");

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.uid) {
          setUser(parsed);
          setIsLoading(false); // 🔥 Immediately stop loading
        }
      } catch (err) {
        console.error("[Auth] Invalid cache:", err);
        localStorage.removeItem("disruptive_admin_user");
      }
    }

    verifySession();
  }, []);

  /* =========================
     SERVER VALIDATION
  ========================= */
  async function verifySession() {
    try {
      const response = await fetch("/api/auth/user");

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        localStorage.setItem(
          "disruptive_admin_user",
          JSON.stringify(data.user),
        );
      } else if (response.status === 401) {
        setUser(null);
        localStorage.removeItem("disruptive_admin_user");
      }
    } catch (error) {
      console.warn("[Auth] Server check failed. Using cached session.");
    } finally {
      setIsLoading(false);
    }
  }

  /* =========================
     LOGOUT
  ========================= */
  async function handleLogout() {
    await signOut(auth);
    await fetch("/api/auth/logout", { method: "POST" });

    setUser(null);
    localStorage.removeItem("disruptive_admin_user");

    router.push("/auth/login");
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
