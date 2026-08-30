'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { TERMS_VERSION } from '@/lib/provider-terms'

export default function DoctorAuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  useEffect(() => { if (new URLSearchParams(window.location.search).get('mode') === 'signup') setMode('signup') }, [])
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', prcNumber: '', password: '', confirm: '' })
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null)
    if (mode === 'signup') {
      if (f.password.length < 8) return setErr('Password must be at least 8 characters.')
      if (f.password !== f.confirm) return setErr('Passwords do not match.')
      if (!agreed) return setErr('Please read and accept the Provider Terms of Agreement to continue.')
    }
    setBusy(true)
    try {
      const url = mode === 'signup' ? '/api/doctor/signup' : '/api/doctor/login'
      const body = mode === 'signup' ? { firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone, prcNumber: f.prcNumber, password: f.password, termsVersion: TERMS_VERSION } : { email: f.email, password: f.password }
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed')
      window.location.href = '/doctor'
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <div className="animate-fade-up mx-auto max-w-md">
      <div className="card">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">Rehab doctor</div>
        <h1 className="mt-1 text-[22px] font-semibold text-[color:var(--ink)]">{mode === 'login' ? 'Doctor sign in' : 'Join as a rehab doctor'}</h1>
        <p className="mb-4 mt-1 text-[13px] text-[color:var(--slate)]">Run rehab consults — teleconsult or in-person — and issue referrals for home PT on Nickel.</p>
        <div className="mb-4 flex rounded-xl border border-[color:var(--line)] p-1 text-[13px]">
          <button onClick={() => setMode('login')} className={`flex-1 rounded-lg py-2 font-medium ${mode === 'login' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>Sign in</button>
          <button onClick={() => setMode('signup')} className={`flex-1 rounded-lg py-2 font-medium ${mode === 'signup' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>New doctor</button>
        </div>
        {err && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="input" placeholder="First name" required value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
                <input className="input" placeholder="Last name" required value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
              </div>
              <input className="input" placeholder="Cellphone no." value={f.phone} onChange={(e) => set('phone', e.target.value)} />
              <input className="input" placeholder="PRC licence no." value={f.prcNumber} onChange={(e) => set('prcNumber', e.target.value)} />
            </>
          )}
          <input className="input" type="email" placeholder="Email" required value={f.email} onChange={(e) => set('email', e.target.value)} />
          <input className="input" type="password" placeholder="Password" required value={f.password} onChange={(e) => set('password', e.target.value)} />
          {mode === 'signup' && <input className="input" type="password" placeholder="Confirm password" required value={f.confirm} onChange={(e) => set('confirm', e.target.value)} />}
          {mode === 'signup' && (
            <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] px-3 py-3">
              <div className="text-[12.5px] text-[color:var(--slate)]">
                Please read the full <a href="/provider/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-[color:var(--steel)] hover:underline">Provider Terms of Agreement ↗</a> and <a href="/provider/terms/annexes" target="_blank" rel="noopener noreferrer" className="font-semibold text-[color:var(--steel)] hover:underline">Annexes A–D ↗</a> before you continue.
              </div>
              <label className="mt-2 flex cursor-pointer items-start gap-2 text-[12.5px] text-[color:var(--ink)]">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" style={{ accentColor: 'var(--steel)' }} checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>I have read and agree to the Provider Terms of Agreement, its Annexes, and the Data Privacy Consent.</span>
              </label>
            </div>
          )}
          <button className="btn-primary w-full" disabled={busy || (mode === 'signup' && !agreed)}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
      </div>
    </div>
  )
}
