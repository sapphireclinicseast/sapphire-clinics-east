'use client'

// Standalone Templates page — the same TemplatesPanel the Admin
// Dashboard used to host as a tab, now reachable in one click from
// the sidebar. Admin + branch admin only.

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth } from '@/lib/session'
import TemplatesPanel from '@/components/TemplatesPanel'

export default function TemplatesStandalonePage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    const auth = getAuth()
    if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'BRANCH_ADMIN')) {
      router.replace('/sign-in')
      return
    }
    setEmail(auth.email)
    setReady(true)
  }, [router])

  if (!ready) return null

  return (
    <div className="max-w-5xl mx-auto animate-fade-up space-y-6">
      <div className="card-static">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Lesson / activity templates</div>
        <h1 className="text-2xl font-bold text-[color:var(--deep-teal)]" style={{ fontFamily: 'var(--font-display)' }}>Templates</h1>
        <p className="text-sm text-[color:var(--mid-gray)]">Reusable scaffolds teachers can clone when planning new classes.</p>
      </div>
      <TemplatesPanel viewer={{ role: 'ADMIN', email }} />
    </div>
  )
}
