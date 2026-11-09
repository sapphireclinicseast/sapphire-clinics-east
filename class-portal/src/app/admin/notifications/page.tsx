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
import { PAGE } from '@/components/hub/ui'

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
    <div className={`${PAGE} animate-fade-up`}>
      <NotificationPanel
        header={{
          eyebrow: 'Aura Academy · Announcements composer',
          title: 'Notifications',
          description: 'Post an announcement to students and/or teachers. They\u2019ll see it in their bell icon and (optionally) by email.',
        }}
        viewer={{ role: 'ADMIN', email, name: isMainAdmin ? 'Main admin' : 'Branch admin' }}
      />
    </div>
  )
}
