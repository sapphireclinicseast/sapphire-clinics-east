'use client'

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
      const r = await fetch('/api/provider/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Sign-in failed')
      window.location.href = '/provider'
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign-in failed')
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade-up mx-auto max-w-sm">
      <div className="card">
        <h1 className="text-[24px] font-semibold">Therapist sign in</h1>
        <p className="mb-5 mt-1 text-[13px] text-[color:var(--slate)]">Access your Nickel provider portal.</p>
        {err && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
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
        <p className="mt-4 text-center text-[13px] text-[color:var(--slate)]">
          New here? <a href="/provider/signup" className="font-semibold text-[color:var(--steel)] hover:underline">Create an account</a>
        </p>
      </div>
    </div>
  )
}
