'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import SurveyPrompt from '../SurveyPrompt'
import WaitlistReminder from '../WaitlistReminder'
import type { Session } from 'next-auth'
import { canUseInquiries } from '@/lib/inquiry-access'

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
        {/* The enquiry dock is fixed to the bottom-right CORNER OF THE
            VIEWPORT, so it sits on top of whatever the page puts there — and
            what pages put there is the pagination. Page 3 of the waitlist was
            under the bubble and unclickable.

            Reserved as scroll room rather than by moving the dock or shifting
            the pagination left: the dock belongs in the corner, and every
            paginated table in the Hub has its controls bottom-right, so
            nudging them one by one would be a fix per table and a new bug on
            the next one. With this, the last row can always be scrolled clear
            of the bubble.
 
            Only when the dock is actually rendered — it ships for the roles
            that may read enquiries, and the rest should not pay for a gap
            nothing occupies. */}
        <main className={`flex-1 overflow-y-auto p-4 md:p-6 ${canUseInquiries(role) ? 'pb-28 md:pb-32' : ''}`}>
          {children}
        </main>
      </div>

      {/* Global survey prompt — shows on ALL pages for front desk users */}
      <SurveyPrompt role={role} />

      {/* Waitlist check reminder — fires at 11 AM and 4 PM for front desk */}
      <WaitlistReminder role={role} />
    </div>
  )
}
