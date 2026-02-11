"use client"

import * as React from "react"
import {
  Package,
  Globe,
  Lightbulb,
  Settings,
  ChevronRight,
} from "lucide-react"
import { NavMain } from "@/components/nav-main"

export function AppSidebar({ ...props }: React.ComponentProps<"div">) {
  const [expandedSections, setExpandedSections] = React.useState<
    Record<string, boolean>
  >({
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
      collapsible: true,
      section: "website-products",
      submenu: [
        { title: "All Products", url: "#" },
        { title: "Orders", url: "#" },
        { title: "Product Families", url: "#" },
        { title: "Specifications", url: "#" },
        { title: "Applications", url: "#" },
      ],
    },
    {
      title: "Solutions",
      icon: Lightbulb,
      collapsible: true,
      section: "solutions",
      submenu: [
        { title: "Solutions Collection", url: "#" },
        { title: "Series", url: "#" },
        { title: "Managers", url: "#" },
      ],
    },
    {
      title: "Managers",
      icon: Settings,
      collapsible: true,
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
    <div
      className="flex h-screen flex-col border-r border-gray-200 w-64 bg-white dark:bg-slate-950 dark:border-slate-800"
      {...props}
    >
      {/* Logo Section */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4 dark:border-slate-800">
        <Package className="h-6 w-6 text-blue-600" />
        <span className="font-bold text-lg">Taskflow</span>
      </div>

      {/* Navigation Section */}
      <nav className="flex-1 overflow-y-auto px-4 py-4">
        {/* Taskflow Products - Static Link */}
        <div className="mb-6">
          <a
            href="#"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800"
          >
            <Package className="h-4 w-4" />
            Taskflow Products
          </a>
        </div>

        {/* Expandable Sections */}
        <div className="space-y-1">
          {navigationData.map((item) => {
            const isExpanded =
              expandedSections[item.section]
            const Icon = item.icon

            return (
              <div key={item.section}>
                <button
                  onClick={() => toggleSection(item.section)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {item.title}
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 transition-transform duration-200 ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                </button>

                {/* Submenu Items */}
                {isExpanded && (
                  <div className="ml-4 space-y-1 border-l border-gray-200 pl-3 dark:border-slate-700">
                    {item.submenu.map((subitem) => (
                      <a
                        key={subitem.title}
                        href={subitem.url}
                        className="block rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-gray-200 transition-colors"
                      >
                        {subitem.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
