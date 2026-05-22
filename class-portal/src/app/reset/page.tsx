'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { backendOrigin } from '@/lib/backend'

interface ResetInfo {
  user: { email: string; role: string; firstName?: string | null; lastName?: string | null }
  expiresAt: string
}

/**
 * Public landing page for the email-issued password reset link. The token
 * is the only auth — no sign-in required. Flow:
 *   1. On mount: GET /api/public/class-portal/password-reset?token=... to
 *      validate the token and pull the target user's email for display.
 *   2. User picks a new password and submits.
 *   3. On success: redirect to /sign-in with a confirmation flash.
 */
function ResetForm() {
  const router = useRouter()
  const sp = useSearchParams()
  const token = sp.get('token') ?? ''
  const [info, setInfo] = useState<ResetInfo | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) { setLoadErr('No reset token in the link.'); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${backendOrigin()}/api/public/class-portal/password-reset?token=${encodeURIComponent(token)}`)
        const j = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) { setLoadErr(j?.error ?? `Could not validate the link (${res.status}).`); return }
        setInfo(j as ResetInfo)
      } catch (e) {
        if (!cancelled) setLoadErr((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitErr(null)
    if (pw.length < 6) { setSubmitErr('Password must be at least 6 characters.'); return }
    if (pw !== pw2) { setSubmitErr('The two passwords do not match.'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`${backendOrigin()}/api/public/class-portal/password-reset/use`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, newPassword: pw }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setSubmitErr(j?.error ?? `Reset failed (${res.status}).`); return }
      setDone(true)
      window.setTimeout(() => router.replace('/sign-in?reset=ok'), 1800)
    } catch (e) {
      setSubmitErr((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadErr) {
    return (
      <div className="card-static max-w-md mx-auto">
        <h1 className="text-[22px] leading-tight mb-2 text-[color:var(--deep-teal)]">Reset link invalid</h1>
        <p className="text-sm text-[color:var(--mid-gray)] mb-4">{loadErr}</p>
        <p className="text-[12.5px] text-[color:var(--mid-gray)]">Ask your admin to issue a new reset link.</p>
      </div>
    )
  }
  if (!info) {
    return (
      <div className="card-static max-w-md mx-auto">
        <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">Checking link…</p>
      </div>
    )
  }
  if (done) {
    return (
      <div className="card-static max-w-md mx-auto">
        <h1 className="text-[22px] leading-tight mb-2 text-[color:var(--deep-teal)]">Password updated ✓</h1>
        <p className="text-sm text-[color:var(--mid-gray)]">Taking you to sign-in…</p>
      </div>
    )
  }

  const fullName = [info.user.firstName, info.user.lastName].filter(Boolean).join(' ')
  return (
    <div className="card-static max-w-md mx-auto">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Aura Academy</div>
      <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)] mb-1">Set a new password</h1>
      <p className="text-sm text-[color:var(--mid-gray)] mb-5">
        For <span className="font-semibold">{fullName ? `${fullName} (${info.user.email})` : info.user.email}</span>.
        Link expires {new Date(info.expiresAt).toLocaleString()}.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="label">New password</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <label className="block">
          <span className="label">Confirm new password</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={e => setPw2(e.target.value)}
            minLength={6}
            required
          />
        </label>
        {submitErr && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{submitErr}</div>}
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  )
}

export default function ResetPage() {
  return (
    <div className="max-w-md mx-auto animate-fade-up">
      <Suspense fallback={<div className="card-static max-w-md mx-auto"><p className="text-sm text-[color:var(--mid-gray)] text-center py-6">Loading…</p></div>}>
        <ResetForm />
      </Suspense>
    </div>
  )
}
