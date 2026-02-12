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
} from "lucide-react";

import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// Define all navigation items
const allNavItems = {
  products: {
    title: "Products",
    url: "#",
    icon: <TerminalSquareIcon />,
    isActive: true,
    items: [
      { title: "Website Products", url: "/products/website-products" },
      { title: "Taskflow Products", url: "/products/taskflow-products" },
      { title: "Applications", url: "/products/applications" },
      { title: "Brands", url: "/products/brands" },
      { title: "Product Families", url: "/products/product-families" },
      { title: "Orders", url: "#" },
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
      { title: "Customer Inquiries", url: "#" },
      { title: "Messenger", url: "#" },
      { title: "Quotations", url: "#" },
    ],
  },
  jobs: {
    title: "Jobs",
    url: "#",
    icon: <BriefcaseBusiness />,
    items: [
      { title: "Applications", url: "#" },
      { title: "Careers Posting", url: "/jobs/careers" },
      { title: "Email", url: "#" },
    ],
  },
  contents: {
    title: "Contents",
    url: "#",
    icon: <Settings2Icon />,
    items: [
      { title: "Blogs", url: "/content/blog" },
      { title: "Catalogs", url: "#" },
      { title: "FAQs Manager", url: "#" },
      { title: "Home Popups", url: "#" },
      { title: "Projects", url: "#" },
      { title: "Partners", url: "#" },
    ],
  },
  settings: {
    title: "Settings",
    url: "#",
    icon: <Settings />,
    items: [
      { title: "All Users", url: "#" },
      { title: "Change Password", url: "#" },
    ],
  },
};

// Role-based navigation mapping
const roleNavMap: Record<string, string[]> = {
  admin: ["products", "inquiries", "jobs", "contents", "settings"],
  warehouse: ["products"],
  hr: ["jobs"],
  seo: ["contents"],
  csr: ["inquiries"],
  ecomm: ["products", "inquiries"],
};

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
          // Fetch user data from Firestore
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

            // Set navigation items based on role
            const allowedNavKeys = roleNavMap[userRole] || [];
            const filteredNav = allowedNavKeys
              .map((key) => allNavItems[key as keyof typeof allNavItems])
              .filter(Boolean);
            setNavItems(filteredNav);
          } else {
            // Fallback if no Firestore document
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
          // Fallback on error
          setUserData({
            name: user.displayName || "User",
            email: user.email || "",
            avatar: user.photoURL || "",
            role: "staff",
          });
          setNavItems([]);
        }
      } else {
        // Reset if no user
        setUserData({
          name: "Guest",
          email: "",
          avatar: "",
          role: "",
        });
        setNavItems([]);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex h-16 items-center justify-center">
          {isCollapsed ? (
            /* Collapsed State: Using almost the full 48px width */
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
            /* Expanded State: Left-aligned for a cleaner look */
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
