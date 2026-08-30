'use client'

import { useState, type FormEvent } from 'react'

export default function ClinicAuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [f, setF] = useState({ name: '', contactPerson: '', email: '', phone: '', password: '', confirm: '' })
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null)
    if (mode === 'signup') { if (f.password.length < 8) return setErr('Password must be at least 8 characters.'); if (f.password !== f.confirm) return setErr('Passwords do not match.') }
    setBusy(true)
    try {
      const url = mode === 'signup' ? '/api/clinic/signup' : '/api/clinic/login'
      const body = mode === 'signup' ? { name: f.name, contactPerson: f.contactPerson, email: f.email, phone: f.phone, password: f.password } : { email: f.email, password: f.password }
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      window.location.href = '/clinic'
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <div className="animate-fade-up mx-auto max-w-md">
      <div className="card">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">Clinic / hospital partner</div>
        <h1 className="mt-1 text-[22px] font-semibold text-[color:var(--ink)]">{mode === 'login' ? 'Partner sign in' : 'Partner with Nickel'}</h1>
        <p className="mb-4 mt-1 text-[13px] text-[color:var(--slate)]">Arrange home therapy for your patients through Nickel — with your own therapists and your choice of payment flow.</p>
        <div className="mb-4 flex rounded-xl border border-[color:var(--line)] p-1 text-[13px]">
          <button onClick={() => setMode('login')} className={`flex-1 rounded-lg py-2 font-medium ${mode === 'login' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>Sign in</button>
          <button onClick={() => setMode('signup')} className={`flex-1 rounded-lg py-2 font-medium ${mode === 'signup' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>New partner</button>
        </div>
        {err && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && (
            <>
              <input className="input" placeholder="Clinic / hospital name" required value={f.name} onChange={(e) => set('name', e.target.value)} />
              <input className="input" placeholder="Contact person" value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
              <input className="input" placeholder="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
            </>
          )}
          <input className="input" type="email" placeholder="Email" required value={f.email} onChange={(e) => set('email', e.target.value)} />
          <input className="input" type="password" placeholder="Password" required value={f.password} onChange={(e) => set('password', e.target.value)} />
          {mode === 'signup' && <input className="input" type="password" placeholder="Confirm password" required value={f.confirm} onChange={(e) => set('confirm', e.target.value)} />}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create partner account'}</button>
        </form>
      </div>
    </div>
  )
}
