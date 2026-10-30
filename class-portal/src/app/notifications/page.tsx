'use client'

// Standalone Notifications page — the student-facing announcement
// board, lifted out of the Notifications tab on /profile. Reuses
// NotificationPanel with viewer.role STUDENT so the panel renders in
// read-only mode (no composer, no email controls).

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAuth, getUsers, hydrateUsers,
  type EnrollmentLevel, type StoredUser,
} from '@/lib/session'
import { getImpersonationMeta } from '@/lib/backend'
import NotificationPanel from '@/components/NotificationPanel'

export default function NotificationsPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<StoredUser | null>(null)

  useEffect(() => {
    const auth = getAuth()
    if (!auth) { router.replace('/sign-in'); return }
    const imp = getImpersonationMeta()
    const impersonatingStudent = !!imp && imp.targetRole === 'STUDENT'
    if (!impersonatingStudent && auth.role !== 'STUDENT') {
      router.replace(auth.role === 'ADMIN' || auth.role === 'BRANCH_ADMIN' ? '/admin'
        : auth.role === 'FRONTDESK' ? '/frontdesk'
        : '/profile')
      return
    }
    const uid = impersonatingStudent ? (imp!.targetUserId || auth.userId) : auth.userId
    const effectiveEmail = impersonatingStudent ? imp!.targetEmail : auth.email
    const effectiveFirst = impersonatingStudent ? (imp!.targetFirstName ?? '') : (auth.firstName ?? '')
    if (!uid) { router.replace('/sign-in'); return }
    let cancelled = false
    ;(async () => {
      // The impersonation token scopes the API list to the target row;
      // find it so NotificationPanel can filter by the student's grade.
      const users = await hydrateUsers().catch(() => getUsers())
      if (cancelled) return
      const found = users.find(x => x.id === uid)
      const synthetic: StoredUser = {
        id: uid,
        role: 'STUDENT',
        email: effectiveEmail,
        password: '',
        firstName: effectiveFirst,
        createdAt: new Date().toISOString(),
      }
      setMe(found ?? synthetic)
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [router])

  if (!ready || !me) return null

  return (
    <div className="max-w-4xl mx-auto animate-fade-up space-y-6">
      <NotificationPanel viewer={{
        role: 'STUDENT',
        level: me.level as EnrollmentLevel | undefined,
        email: me.email,
        name: [me.firstName, me.lastName].filter(Boolean).join(' ') || me.email,
        userId: me.id,
      }} />
    </div>
  )
}
