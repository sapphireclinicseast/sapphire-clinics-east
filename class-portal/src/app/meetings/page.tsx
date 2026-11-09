'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MeetingsPanel from '@/components/MeetingsPanel'
import { PAGE } from '@/components/hub/ui'
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
    // The root layout already provides <main> and the page gutter; PAGE is
    // the same content column the other signed-in hub pages use.
    <div className={`${PAGE} animate-fade-up`}>
      <MeetingsPanel viewer={auth} viewerBranch={viewerBranch} />
    </div>
  )
}
