"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TerminalSquareIcon,
  BotIcon,
  Settings2Icon,
  BriefcaseBusiness,
  LockIcon,
  Home,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { canAccessRoute } from "@/lib/roleAccess";
import { motion } from "motion/react";

// ─── Navigation item config ───────────────────────────────────────────────────

interface DockItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  url: string;
}

const DOCK_ITEMS: DockItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <Home className="w-6 h-6" />,
    url: "/dashboard",
  },
  {
    id: "products",
    label: "Products",
    icon: <TerminalSquareIcon className="w-6 h-6" />,
    url: "/products/all-products",
  },
  {
    id: "inquiries",
    label: "Inquiries",
    icon: <BotIcon className="w-6 h-6" />,
    url: "/inquiries/customer-inquiries",
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: <BriefcaseBusiness className="w-6 h-6" />,
    url: "/jobs/applications",
  },
  {
    id: "content",
    label: "Content",
    icon: <Settings2Icon className="w-6 h-6" />,
    url: "/content/blogs",
  },
  {
    id: "admin",
    label: "Admin",
    icon: <LockIcon className="w-6 h-6" />,
    url: "/admin/register",
  },
];

// ─── Role to accessible dock items ─────────────────────────────────────────────

const roleDockMap: Record<string, string[]> = {
  superadmin: ["dashboard", "products", "inquiries", "jobs", "content", "admin"],
  admin: ["dashboard", "products", "inquiries", "jobs", "content", "admin"],
  director: ["dashboard", "products", "inquiries", "jobs", "content", "admin"],
  pd_manager: ["dashboard", "products", "admin"],
  pd_engineer: ["dashboard", "products"],
  pd: ["dashboard", "products"],
  project_sales: ["dashboard", "products"],
  warehouse: ["dashboard"],
  hr: ["dashboard", "jobs"],
  seo: ["dashboard", "content"],
  marketing: ["dashboard", "content"],
  csr: ["dashboard", "inquiries"],
  ecomm: ["dashboard", "products", "inquiries"],
  staff: ["dashboard"],
  inventory: ["dashboard"],
};

const WILDCARD_ROLES = new Set(["superadmin", "admin", "director"]);

export function DockNav() {
  const pathname = usePathname();
  const [visibleItems, setVisibleItems] = useState<DockItem[]>([]);
  const [userRole, setUserRole] = useState<string>("");

  // ─── Fetch user role and filter dock items ────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "adminaccount", user.uid));

          if (userDoc.exists()) {
            const data = userDoc.data();
            const role = String(data.role || "").toLowerCase().trim();
            setUserRole(role);

            // Filter dock items based on role
            const allowedIds = roleDockMap[role] ?? [];
            const filtered = DOCK_ITEMS.filter((item) => {
              // Check if item is in allowed list
              if (!allowedIds.includes(item.id)) return false;

              // For admin-only routes, verify access
              if (item.id === "admin") {
                return role === "superadmin" || role === "admin" || role === "director";
              }

              // Verify route access using existing RBAC
              return canAccessRoute(role, item.url);
            });

            setVisibleItems(filtered);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          setVisibleItems([]);
        }
      } else {
        setVisibleItems([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // ─── Determine if item is active ──────────────────────────────────────────

  const isItemActive = (item: DockItem) => {
    // Match exact path or parent path
    return (
      pathname === item.url || pathname.startsWith(item.url + "/")
    );
  };

  return (
    <motion.nav
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed bottom-0 left-0 right-0 z-40 pb-safe-area"
    >
      {/* Glass background */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md border-t border-border" />

      {/* Dock container */}
      <div className="relative mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center gap-2 flex-wrap sm:gap-4">
          {visibleItems.map((item) => {
            const isActive = isItemActive(item);

            return (
              <motion.div
                key={item.id}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <Link href={item.url}>
                  <motion.button
                    className={`relative flex items-center justify-center rounded-2xl p-3 sm:p-4 transition-all duration-200 ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "text-foreground/60 hover:text-foreground hover:bg-muted"
                    }`}
                    title={item.label}
                  >
                    {item.icon}

                    {/* Active indicator */}
                    {isActive && (
                      <motion.div
                        layoutId="dock-active-bg"
                        className="absolute inset-0 bg-primary rounded-2xl -z-10"
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                  </motion.button>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}
