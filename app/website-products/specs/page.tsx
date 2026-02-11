'use client'

import { AppSidebar } from '@/components/app-sidebar'

export default function SpecsPage() {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 p-8">
        <h1 className="text-3xl font-bold">Specs</h1>
      </main>
    </div>
  )
}
