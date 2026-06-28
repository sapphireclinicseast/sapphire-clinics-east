'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import SurveyPrompt from '../SurveyPrompt'
import WaitlistReminder from '../WaitlistReminder'
import type { Session } from 'next-auth'

export default function DashboardShell({
  user,
  children,
}: {
  user: Session['user']
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const role = (user as { role?: string })?.role ?? 'MARKETING_ADMIN'

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--off-white)' }}>
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 md:hidden"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — off-canvas on mobile, always visible on md+ */}
      <div
        className={`fixed inset-y-0 left-0 z-30 md:static md:z-auto transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} role={role} />
      </div>

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <TopBar user={user} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>

      {/* Global survey prompt — shows on ALL pages for front desk users */}
      <SurveyPrompt role={role} />

      {/* Waitlist check reminder — fires at 11 AM and 4 PM for front desk */}
      <WaitlistReminder role={role} />
    </div>
  )
}
