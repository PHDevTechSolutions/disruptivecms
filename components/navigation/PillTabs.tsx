"use client";

import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { canAccessRoute } from "@/lib/roleAccess";

// ─── Pill tab item config ─────────────────────────────────────────────────────

export interface PillTab {
  id: string;
  label: string;
  requiredRoute?: string; // Optional: route to check access for
  requiredRole?: string; // Optional: specific role requirement
}

interface PillTabsProps {
  tabs: PillTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

// ─── Role to accessible tabs mapping ──────────────────────────────────────────
// Used to filter tabs based on user role

const roleTabAccessMap: Record<string, string[]> = {
  superadmin: ["*"], // superadmin sees all tabs
  admin: ["*"],
  director: ["*"],
  pd_manager: [
    "all-products",
    "taskflow",
    "shopify",
    "requests",
    "applications",
    "brands",
    "families",
    "orders",
    "reviews",
    "solutions",
    "series",
    "specs",
  ],
  pd_engineer: [
    "all-products",
    "taskflow",
    "shopify",
    "requests",
    "applications",
  ],
  pd: ["all-products", "taskflow", "shopify", "requests", "applications"],
  project_sales: ["all-products"],
  hr: ["applications", "careers"],
  seo: ["blogs", "companies", "catalogs", "faq-manager", "popup", "projects"],
  marketing: [
    "blogs",
    "companies",
    "catalogs",
    "faq-manager",
    "popup",
    "projects",
  ],
  csr: [
    "customer-inquiries",
    "messenger",
    "quotations",
  ],
  ecomm: [
    "all-products",
    "taskflow",
    "shopify",
    "customer-inquiries",
    "messenger",
  ],
  warehouse: [],
  staff: [],
  inventory: [],
};

export function PillTabs({ tabs, activeTab, onTabChange }: PillTabsProps) {
  const [filteredTabs, setFilteredTabs] = useState<PillTab[]>(tabs);
  const [userRole, setUserRole] = useState<string>("");

  // ─── Fetch user role and filter tabs ──────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "adminaccount", user.uid));

          if (userDoc.exists()) {
            const data = userDoc.data();
            const role = String(data.role || "").toLowerCase().trim();
            setUserRole(role);

            // Filter tabs based on role
            const allowedTabIds = roleTabAccessMap[role] ?? [];
            const isWildcard = allowedTabIds.includes("*");

            const filtered = tabs.filter((tab) => {
              // Wildcard roles see all tabs
              if (isWildcard) return true;

              // Check if tab is in allowed list
              if (!allowedTabIds.includes(tab.id)) return false;

              // If tab has a specific role requirement, check it
              if (tab.requiredRole && tab.requiredRole !== role) {
                return false;
              }

              // If tab has a route requirement, verify access
              if (tab.requiredRoute) {
                return canAccessRoute(role, tab.requiredRoute);
              }

              return true;
            });

            setFilteredTabs(filtered);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          setFilteredTabs(tabs);
        }
      } else {
        setFilteredTabs(tabs);
      }
    });

    return () => unsubscribe();
  }, [tabs]);

  // Ensure active tab is valid, otherwise select first available
  useEffect(() => {
    if (!filteredTabs.some((t) => t.id === activeTab) && filteredTabs.length > 0) {
      onTabChange(filteredTabs[0].id);
    }
  }, [filteredTabs, activeTab, onTabChange]);

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 px-4 sm:px-6 lg:px-8">
      {filteredTabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <motion.button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative px-4 py-2 rounded-full whitespace-nowrap transition-colors duration-200 ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-foreground/60 hover:text-foreground hover:bg-muted/50"
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="text-sm font-medium">{tab.label}</span>

            {/* Active underline */}
            {isActive && (
              <motion.div
                layoutId="pill-active"
                className="absolute inset-0 bg-primary rounded-full -z-10"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
