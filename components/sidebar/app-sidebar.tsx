"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import Image from "next/image";

import { NavMain } from "@/components/sidebar/nav-main";
import { NavUser } from "@/components/sidebar/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

import {
  TerminalSquareIcon,
  BotIcon,
  Settings,
  Settings2Icon,
  BriefcaseBusiness,
  LockIcon,
} from "lucide-react";

import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "@/lib/firestore/client";
import { onAuthStateChanged } from "firebase/auth";
import { canAccessRoute } from "@/lib/roleAccess";

// ─── All navigation items ─────────────────────────────────────────────────────

const allNavItems = {
  products: {
    title: "Products",
    url: "#",
    icon: <TerminalSquareIcon />,
    isActive: true,
    items: [
      { title: "All Products", url: "/products/all-products" },
      { title: "Taskflow Products", url: "/products/taskflow-products" },
      { title: "Shopify Products", url: "/products/shopify-products" },
      { title: "Requests", url: "/products/requests" },
      { title: "Applications", url: "/products/applications" },
      { title: "Brands", url: "/products/brands" },
      { title: "Product Families", url: "/products/product-families" },
      { title: "Orders", url: "/products/orders" },
      { title: "Reviews", url: "/products/reviews" },
      { title: "Solutions", url: "/products/solutions" },
      { title: "Series", url: "/products/series" },
      { title: "Specifications", url: "/products/specs" },
    ],
  },
  inquiries: {
    title: "Inquiries",
    url: "#",
    icon: <BotIcon />,
    items: [
      { title: "Customer Inquiries", url: "/inquiries/customer-inquiries" },
      { title: "Messenger", url: "/inquiries/messenger" },
      { title: "Quotations", url: "/inquiries/quotations" },
    ],
  },
  jobs: {
    title: "Jobs",
    url: "#",
    icon: <BriefcaseBusiness />,
    items: [
      { title: "Applications", url: "/jobs/applications" },
      { title: "Careers Posting", url: "/jobs/careers" },
    ],
  },
  contents: {
    title: "Contents",
    url: "#",
    icon: <Settings2Icon />,
    items: [
      { title: "Blogs", url: "/content/blogs" },
      { title: "Companies", url: "/content/companies" },
      { title: "Catalogs", url: "/content/catalogs" },
      { title: "FAQs Manager", url: "/content/faq-manager" },
      { title: "Home Popups", url: "/content/popup" },
      { title: "Projects", url: "/content/projects" },
    ],
  },
  settings: {
    title: "Settings",
    url: "#",
    icon: <Settings />,
    items: [
      { title: "All Users", url: "/admin/register" },
      { title: "Change Password", url: "#" },
    ],
  },
  "recycle-bin": {
    title: "Admin",
    url: "/admin",
    icon: <LockIcon />,
    items: [
      { title: "Register User", url: "/admin/register" },
      { title: "Audit Logs", url: "/admin/audit-logs" },
      { title: "Deleted Products", url: "/admin/deleted-products" },
      { title: "Requests", url: "/admin/requests" },
    ],
  },
};

// ─── Role → visible sections ──────────────────────────────────────────────────

const roleNavMap: Record<string, string[]> = {
  superadmin: [
    "products",
    "inquiries",
    "jobs",
    "contents",
    "settings",
    "recycle-bin",
  ],
  admin: [
    "products",
    "inquiries",
    "jobs",
    "contents",
    "settings",
    "recycle-bin",
  ],
  director: [
    "products",
    "inquiries",
    "jobs",
    "contents",
    "settings",
    "recycle-bin",
  ],
  warehouse: ["products"],
  hr: ["jobs"],
  seo: ["contents"],
  marketing: ["contents"],
  csr: ["inquiries"],
  ecomm: ["products", "inquiries"],
  pd_manager: ["products", "recycle-bin"],
  pd_engineer: ["products"],
  pd: ["products"],
  project_sales: ["products"],
};

// ─── Wildcard roles (see all items in their allowed sections) ─────────────────

const WILDCARD_ROLES = new Set(["superadmin", "admin", "director"]);

interface UserData {
  name: string;
  email: string;
  avatar: string;
  role: string;
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const [userData, setUserData] = useState<UserData>({
    name: "Loading...",
    email: "",
    avatar: "",
    role: "",
  });

  const [navItems, setNavItems] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "adminaccount", user.uid));

          if (userDoc.exists()) {
            const data = userDoc.data();
            const userRole = String(data.role || "")
              .toLowerCase()
              .trim();

            setUserData({
              name: data.fullName || user.displayName || "User",
              email: user.email || "",
              avatar: user.photoURL || "",
              role: userRole,
            });

            buildNavItems(userRole);
          } else {
            setUserData({
              name: user.displayName || "User",
              email: user.email || "",
              avatar: user.photoURL || "",
              role: "staff",
            });
            setNavItems([]);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          setUserData({
            name: user.displayName || "User",
            email: user.email || "",
            avatar: user.photoURL || "",
            role: "staff",
          });
          setNavItems([]);
        }
      } else {
        setUserData({ name: "Guest", email: "", avatar: "", role: "" });
        setNavItems([]);
      }
    });

    return () => unsubscribe();
  }, []);

  function buildNavItems(userRole: string) {
    const allowedKeys = roleNavMap[userRole] ?? [];
    const isWildcard = WILDCARD_ROLES.has(userRole);

    const filtered = allowedKeys
      .map((key) => {
        const section = allNavItems[key as keyof typeof allNavItems];
        if (!section) return null;

        // Filter individual sub-items by route access
        const filteredItems = section.items.filter((item: any) => {
          // Placeholder links: show only for wildcard roles
          if (item.url === "#") return isWildcard;
          // Use canAccessRoute for concrete paths
          return canAccessRoute(userRole, item.url);
        });

        // Drop the entire section if no items remain
        if (filteredItems.length === 0) return null;

        // For the Admin section, hide "Register User" from non-superadmins
        if (section.title === "Admin") {
          const adminFiltered = filteredItems.filter((item: any) => {
            if (item.title === "Register User")
              return userRole === "superadmin";
            return true;
          });
          if (adminFiltered.length === 0) return null;
          return { ...section, items: adminFiltered };
        }

        return { ...section, items: filteredItems };
      })
      .filter(Boolean);

    setNavItems(filtered);
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex h-16 items-center justify-center">
          {isCollapsed ? (
            <div className="flex items-center justify-center w-full">
              <Image
                src="/logo-small.png"
                alt="JarIS CMS Icon"
                width={44}
                height={44}
                className="object-contain"
                priority
              />
            </div>
          ) : (
            <div className="flex w-full items-center px-4">
              <Image
                src="/logo-full.png"
                alt="JarIS CMS Logo"
                width={160}
                height={40}
                className="object-contain"
                priority
              />
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
