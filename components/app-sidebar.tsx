"use client"

import * as React from "react"
import { Package, Globe, Lightbulb, Settings } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar"
import { ChevronDown } from "lucide-react"

export function AppSidebar() {
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({
    "website-products": true,
    solutions: false,
    managers: false,
  })

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const navigationData = [
    {
      title: "Website Products",
      icon: Globe,
      section: "website-products",
      submenu: [
        { title: "All Products", url: "/website-products/all-products" },
        { title: "Specifications", url: "/website-products/specs" },
      ],
    },
    {
      title: "Solutions",
      icon: Lightbulb,
      section: "solutions",
      submenu: [
        { title: "Solutions Collection", url: "/solutions/solutions-collection" },
        { title: "Series", url: "/solutions/series" },
      ],
    },
    {
      title: "Managers",
      icon: Settings,
      section: "managers",
      submenu: [
        { title: "Blog Manager", url: "#" },
        { title: "Brand Manager", url: "#" },
        { title: "Careers Manager", url: "#" },
        { title: "Company Manager", url: "#" },
      ],
    },
  ]

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6" />
          <span className="font-bold text-lg">Taskflow</span>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <a href="/taskflow-products">
                  <Package className="h-4 w-4" />
                  <span>Taskflow Products</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {navigationData.map((item) => {
          const isExpanded = expandedSections[item.section]
          const Icon = item.icon

          return (
            <Collapsible
              key={item.section}
              defaultOpen={isExpanded}
              onOpenChange={(open) => toggleSection(item.section)}
              className="group/collapsible"
            >
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer">
                    <Icon className="h-4 w-4" />
                    <span>{item.title}</span>
                    <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {item.submenu.map((subitem) => (
                        <SidebarMenuItem key={subitem.title}>
                          <SidebarMenuSubButton asChild>
                            <a href={subitem.url}>{subitem.title}</a>
                          </SidebarMenuSubButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )
        })}
      </SidebarContent>
    </Sidebar>
  )
}
