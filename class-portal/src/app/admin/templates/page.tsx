'use client'

// Standalone Templates page — the same TemplatesPanel the Admin
// Dashboard used to host as a tab, now reachable in one click from
// the sidebar. Admin + branch admin only.

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth } from '@/lib/session'
import TemplatesPanel from '@/components/TemplatesPanel'
import { PageHeader, PAGE } from '@/components/hub/ui'

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
    <div className={`${PAGE} animate-fade-up`}>
      <PageHeader
        eyebrow="Lesson / activity templates"
        title="Templates"
        description="Reusable scaffolds teachers can clone when planning new classes."
      />
      <TemplatesPanel viewer={{ role: 'ADMIN', email }} />
    </div>
  )
}
