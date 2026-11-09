'use client'

// Branded provider login (inside the patient app). Credentials go to our own
// server route, which verifies them against the staff app and returns a
// same-tab handoff URL — so the provider lands in the staff portal logged in.

import { useState } from 'react'
import {
  Banner, Icon, CONTROL, CONTROL_STYLE, LABEL, LABEL_STYLE, BTN_PRIMARY, PRIMARY_STYLE, FOCUS,
} from '@/components/hub/ui'

// Kit controls one size up, as on the Class Portal sign-in.
const INPUT = `${CONTROL} w-full !h-11 !rounded-xl`

export default function ProviderLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch('/api/provider-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const d = await r.json()
      if (!r.ok || !d.redirectUrl) throw new Error(d.error ?? 'Sign-in failed')
      window.location.href = d.redirectUrl // same-tab handoff into the staff portal
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign-in failed')
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade-up mx-auto max-w-md">
      <a href="/signin" className={`mb-3 inline-flex items-center gap-1 text-[13px] font-semibold rounded hover:underline ${FOCUS}`} style={{ color: 'var(--teal)', fontFamily: 'var(--font-display)' }}>
        <Icon name="arrowLeft" size={14} /> Back
      </a>
      <div
        className="rounded-[18px] px-5 py-8 sm:px-10 sm:py-10"
        style={{ background: '#fff', border: '1px solid var(--light-gray)', boxShadow: '0 2px 12px rgba(25,72,80,0.06)' }}
      >
        <div className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>
            Providers
          </div>
          <h1 className="text-[24px] sm:text-[26px] font-bold leading-tight tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--deep-teal)' }}>Provider sign in</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--mid-gray)' }}>For Aura Health therapists &amp; staff.</p>
        </div>
        {err && <div className="mb-4 animate-fade-in"><Banner tone="error">{err}</Banner></div>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="provider-email" className={LABEL} style={LABEL_STYLE}>Email</label>
            <input id="provider-email" className={INPUT} style={CONTROL_STYLE} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="provider-password" className={LABEL} style={LABEL_STYLE}>Password</label>
            <input id="provider-password" className={INPUT} style={CONTROL_STYLE} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
          </div>
          <button className={`${BTN_PRIMARY} w-full !h-11 !rounded-xl mt-1`} style={PRIMARY_STYLE} disabled={busy}>
            {busy ? 'Signing in…' : <>Sign in <Icon name="chevronRight" size={16} /></>}
          </button>
        </form>
        <p className="mt-7 pt-5 text-center text-[13px]" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
          New provider? <a href="/signin/provider/signup" className={`font-semibold rounded hover:underline ${FOCUS}`} style={{ color: 'var(--teal)' }}>Create an account</a>
        </p>
      </div>
    </div>
  )
}
