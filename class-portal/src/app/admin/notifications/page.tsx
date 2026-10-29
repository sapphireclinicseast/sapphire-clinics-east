'use client'

// Standalone Notifications composer page — hosts NotificationPanel
// outside the Admin Dashboard tab shell. Admin + branch admin only.
// This is the sender side (compose + fan out an announcement); the
// personal bell inbox lives in BellIcon in the sidebar for everyone.

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth } from '@/lib/session'
import NotificationPanel from '@/components/NotificationPanel'

export default function NotificationsStandalonePage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [isMainAdmin, setIsMainAdmin] = useState(false)

  useEffect(() => {
    const auth = getAuth()
    if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'BRANCH_ADMIN')) {
      router.replace('/sign-in')
      return
    }
    setEmail(auth.email)
    setIsMainAdmin(auth.role === 'ADMIN')
    setReady(true)
  }, [router])

  if (!ready) return null

  return (
    <div className="max-w-5xl mx-auto animate-fade-up space-y-6">
      <div className="card-static">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Announcements composer</div>
        <h1 className="text-2xl font-bold text-[color:var(--deep-teal)]" style={{ fontFamily: 'var(--font-display)' }}>Notifications</h1>
        <p className="text-sm text-[color:var(--mid-gray)]">Post an announcement to students and/or teachers. They&apos;ll see it in their bell icon and (optionally) by email.</p>
      </div>
      <NotificationPanel viewer={{ role: 'ADMIN', email, name: isMainAdmin ? 'Main admin' : 'Branch admin' }} />
    </div>
  )
}
