'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { CLINIC_AIDE_HOME, clinicAideMayOpen, isClinicAide } from '@/lib/clinic-aide'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { ReminderPopup } from '@/components/dashboard/RecurringReminders'
import { TaxDeadlinePopup } from '@/components/dashboard/TaxDeadlinePopup'
import { ScholarReminderPopup } from '@/components/dashboard/ScholarReminders'
import { MoaRenewalPopup } from '@/components/dashboard/MoaRenewalPopup'

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
  // A clinic aide may only open Asset Management: any other page is never
  // rendered (so its data never loads) and they are sent there instead.
  const pathname = usePathname()
  const router = useRouter()
  const aide = isClinicAide(user.role)
  const aideBlocked = aide && !clinicAideMayOpen(pathname || '')
  useEffect(() => { if (aideBlocked) router.replace(CLINIC_AIDE_HOME) }, [aideBlocked, router])
  // Desktop collapse: the accounting staff asked for a bigger work area while
  // recording, so the rail hides on a click (or ⌘/Ctrl+B) and the choice
  // sticks per device.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    try { if (localStorage.getItem('ah-sidebar-collapsed') === '1') setSidebarCollapsed(true) } catch { /* optional */ }
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(c => {
      const next = !c
      try { localStorage.setItem('ah-sidebar-collapsed', next ? '1' : '0') } catch { /* optional */ }
      return next
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'b') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      toggleSidebar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        userRole={user.role}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          user={user}
          onMenuClick={() => setSidebarOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {aideBlocked ? <p className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>Opening Asset Management…</p> : children}
        </main>
      </div>

      {!aide && (
        <>
          <ReminderPopup />
          <TaxDeadlinePopup role={user.role} />
          <ScholarReminderPopup />
          <MoaRenewalPopup role={user.role} userId={user.id} />
        </>
      )}
    </div>
  )
}
