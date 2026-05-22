'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getImpersonationMeta, type ImpersonationMeta } from '@/lib/backend'
import { endImpersonation } from '@/lib/session'

/**
 * Sticky banner shown across every class-portal page while an admin is
 * impersonating another user. Lives in the root layout so it can't be
 * hidden by a child page. Clicking "Return to admin" closes the session,
 * stamps the server audit row, and forces a full reload so the React tree
 * re-runs every effect against the admin's regular token.
 */
export default function ImpersonationBanner() {
  const router = useRouter()
  const [meta, setMeta] = useState<ImpersonationMeta | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setMeta(getImpersonationMeta())
    // Pick up storage changes from other tabs that might end the session.
    const onStorage = () => setMeta(getImpersonationMeta())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  if (!meta) return null

  async function handleReturn() {
    setBusy(true)
    try {
      await endImpersonation()
    } finally {
      // Force a hard reload so every page-mount effect re-reads the
      // admin's localStorage token rather than the stale state.
      if (typeof window !== 'undefined') {
        window.location.assign('/admin')
      } else {
        router.replace('/admin')
      }
    }
  }

  const name = [meta.targetFirstName, meta.targetLastName].filter(Boolean).join(' ').trim()
  const label = name ? `${name} (${meta.targetEmail})` : meta.targetEmail
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-2 text-[12.5px] flex-wrap"
      style={{ background: '#7c2d12', color: '#fff', fontFamily: 'var(--font-display)' }}
    >
      <div>
        <span className="font-bold uppercase tracking-[0.12em] text-[10.5px] mr-2 px-1.5 py-0.5 rounded bg-white/15">VIEWING AS</span>
        <span>{label} · {meta.targetRole.toLowerCase()}</span>
      </div>
      <button
        type="button"
        onClick={handleReturn}
        disabled={busy}
        className="px-3 py-1 rounded-md bg-white text-[color:#7c2d12] font-semibold text-[11.5px] hover:bg-white/90 disabled:opacity-60"
      >
        {busy ? 'Ending…' : 'Return to admin →'}
      </button>
    </div>
  )
}
