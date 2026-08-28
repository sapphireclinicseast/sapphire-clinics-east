'use client'

// Branded provider login (inside the patient app). Credentials go to our own
// server route, which verifies them against the staff app and returns a
// same-tab handoff URL — so the provider lands in the staff portal logged in.

import { useState } from 'react'

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
      <a href="/signin" className="mb-3 inline-block text-[12px] text-[color:var(--moss)] hover:underline">← Back</a>
      <div className="card-static">
        <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)]">Provider sign in</h1>
        <p className="mb-5 mt-1 text-sm text-[color:var(--mid-gray)]">For Aura Health therapists &amp; staff.</p>
        {err && <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <div className="label">Email</div>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <div className="label">Password</div>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="mt-4 text-center text-[13px] text-[color:var(--mid-gray)]">
          New provider? <a href="/signin/provider/signup" className="font-semibold text-[color:var(--moss)] hover:underline">Create an account</a>
        </p>
      </div>
    </div>
  )
}
