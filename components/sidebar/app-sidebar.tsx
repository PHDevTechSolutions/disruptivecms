"use client";

import * as React from "react";
import Image from "next/image"; // Using Next.js Image component for optimization

import { NavMain } from "@/components/sidebar/nav-main";
import { NavUser } from "@/components/sidebar/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar, // Import the hook
} from "@/components/ui/sidebar";

import {
  TerminalSquareIcon,
  BotIcon,
  Settings,
  Settings2Icon,
  BriefcaseBusiness,
} from "lucide-react";

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
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
    {
      title: "Inquiries",
      url: "#",
      icon: <BotIcon />,
      items: [
        { title: "Customer Inquiries", url: "#" },
        { title: "Messenger", url: "#" },
        { title: "Quotations", url: "#" },
      ],
    },
    {
      title: "Jobs",
      url: "#",
      icon: <BriefcaseBusiness />,
      items: [
        { title: "Applications", url: "#" },
        { title: "Careers Posting", url: "#" },
        { title: "Email", url: "#" },
      ],
    },
    {
      title: "Contents",
      url: "#",
      icon: <Settings2Icon />,
      items: [
        { title: "Blogs", url: "/content/blogs" },
        { title: "Catalogs", url: "#" },
        { title: "FAQs Manager", url: "#" },
        { title: "Home Popups", url: "#" },
        { title: "Projects", url: "#" },
        { title: "Partners", url: "#" },
      ],
    },
    {
      title: "Settings",
      url: "#",
      icon: <Settings />,
      items: [
        { title: "All Users", url: "#" },
        { title: "Change Password", url: "#" },
      ],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

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
                width={44} // Maxed out (Sidebar is usually 48px)
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
        <NavMain items={data.navMain} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
