"use client";

import React from "react";
import { DockNav } from "@/components/navigation/DockNav";
import { PillTabs, PillTab } from "@/components/navigation/PillTabs";

interface MainLayoutProps {
  children: React.ReactNode;
  tabs?: PillTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

export function MainLayout({
  children,
  tabs,
  activeTab = "",
  onTabChange = () => {},
}: MainLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Main content area - scrollable */}
      <div className="flex-1 overflow-y-auto pb-20 sm:pb-24">
        {/* Pill tabs if provided */}
        {tabs && tabs.length > 0 && (
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
            <PillTabs
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={onTabChange}
            />
          </div>
        )}

        {/* Page content */}
        <div className="w-full">
          {children}
        </div>
      </div>

      {/* Fixed bottom dock navigation */}
      <DockNav />
    </div>
  );
}
