"use client";

import * as React from "react";
import Link from "next/link"; // MUST use this
import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

export function NavMain({ items }: { items: any[] }) {
  const pathname = usePathname();

  // This state ensures only one section is open at a time
  const [openSection, setOpenSection] = React.useState<string | null>(null);

  // Automatically open the section containing the current page on first load
  React.useEffect(() => {
    const activeItem = items.find((item) =>
      item.items?.some((sub: any) => sub.url === pathname),
    );
    if (activeItem) setOpenSection(activeItem.title);
  }, [pathname, items]);

  return (
    <SidebarGroup>
      <SidebarGroupLabel>CMS</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isOpen = openSection === item.title;

          return (
            <Collapsible
              key={item.title}
              asChild
              open={isOpen} // Controlled state
              onOpenChange={() => setOpenSection(isOpen ? null : item.title)}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title}>
                    {item.icon}
                    <span>{item.title}</span>
                    <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem: any) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === subItem.url}
                        >
                          {/* CHANGE: Use Link, NOT <a> */}
                          <Link href={subItem.url}>
                            <span>{subItem.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
