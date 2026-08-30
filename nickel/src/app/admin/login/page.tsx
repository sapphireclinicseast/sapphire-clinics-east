'use client'

import { useState } from 'react'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true)
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Login failed')
      window.location.href = '/admin/overview'
    } catch (e) { setErr(e instanceof Error ? e.message : 'Login failed'); setBusy(false) }
  }

  return (
    <div className="animate-fade-up mx-auto max-w-sm">
      <div className="card">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">JUO Operations</div>
        <h1 className="mt-1 text-[22px] font-semibold">Admin console</h1>
        <p className="mb-5 mt-1 text-[13px] text-[color:var(--slate)]">Sign in to review and approve professional sign-ups.</p>
        {err && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div><div className="label">Email</div><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="you@sapphireclinicseast.org" /></div>
          <div><div className="label">Password</div><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>

      <a href="/beta" className="mt-3 flex items-center justify-between rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-left transition-colors hover:border-[color:var(--steel)]">
        <span>
          <span className="flex items-center gap-2 text-[13.5px] font-semibold text-[color:var(--ink)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>
            Open the beta app preview
          </span>
          <span className="mt-0.5 block text-[12px] text-[color:var(--slate)]">See the live app in a phone frame — no sign-in needed.</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[color:var(--steel)]"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </a>
    </div>
  )
}
