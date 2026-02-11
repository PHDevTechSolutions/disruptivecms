'use client'

import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'

export default function AllProductsPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">All Products</h1>
          <SidebarTrigger />
        </div>
      </main>
    </SidebarProvider>
  )
}
