'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

interface DashboardShellProps {
  user: {
    id: string
    name?: string | null
    email?: string | null
    role?: string
    branch?: string | null
  }
  children: React.ReactNode
}

export default function DashboardShell({ user, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        userRole={user.role}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar user={user} onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
