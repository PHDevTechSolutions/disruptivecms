'use client'

import { AppSidebar } from '@/components/app-sidebar'

export default function TaskflowProductsPage() {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 p-8">
        <h1 className="text-3xl font-bold">Taskflow Products</h1>
      </main>
    </div>
  )
}
