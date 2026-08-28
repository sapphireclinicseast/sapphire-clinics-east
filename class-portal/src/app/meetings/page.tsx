'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MeetingsPanel from '@/components/MeetingsPanel'
import { getAuth, type AuthSession, type Branch } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default function MeetingsPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<AuthSession | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const a = getAuth()
    if (!a) { router.replace('/sign-in?next=/meetings'); return }
    setAuth(a)
  }, [router])

  if (!mounted || !auth) return null

  const viewerBranch = (auth.branch ?? undefined) as Branch | undefined

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <MeetingsPanel viewer={auth} viewerBranch={viewerBranch} />
    </main>
  )
}
