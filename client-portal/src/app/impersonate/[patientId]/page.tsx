'use client'

// Admin-only "view as patient" landing. Opened in a new tab from Admin → Users.
// Exchanges the patientId (via the admin-cookie-gated proxy) for a short-lived
// patient session token, stores it, and drops into the patient's own portal.
// If the caller isn't an admin, the proxy 401s and we show an error.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { setSession } from '@/lib/session'

export default function ImpersonatePage() {
  const { patientId } = useParams<{ patientId: string }>()
  const router = useRouter()
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
        return d as { patientId: string; firstName: string; token: string }
      })
      .then((d) => {
        if (cancelled) return
        setSession({ patientId: d.patientId, firstName: d.firstName, token: d.token })
        router.replace('/')
      })
      .catch((e) => { if (!cancelled) setErr((e as Error).message) })
    return () => { cancelled = true }
  }, [patientId, router])

  return (
    <div className="max-w-md mx-auto mt-24 text-center">
      {err ? (
        <div className="card-static">
          <h1 className="text-[20px] text-[color:var(--deep-teal)]">Couldn&apos;t open portal</h1>
          <p className="text-sm text-[color:var(--mid-gray)] mt-2">{err}</p>
          <p className="text-[12px] text-[color:var(--mid-gray)] mt-3">
            Make sure you&apos;re signed in to the admin console first, then try again.
          </p>
        </div>
      ) : (
        <p className="text-sm text-[color:var(--mid-gray)]">Opening the patient&apos;s portal…</p>
      )}
    </div>
  )
}
