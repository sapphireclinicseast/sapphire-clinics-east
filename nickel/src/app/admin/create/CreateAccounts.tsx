'use client'

import { useState } from 'react'

type Role = 'PT' | 'DOCTOR'
const PROFESSIONS = ['PT', 'OT', 'SLP', 'SPED', 'PSYCHOLOGY']

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[12px] font-medium text-[color:var(--slate)]">{label}</span>{children}</label>
}

export default function CreateAccounts() {
  const [role, setRole] = useState<Role>('PT')
  const [f, setF] = useState<Record<string, string>>({ profession: 'PT', specialization: 'Rehabilitation Medicine (Physiatry)' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }))

  function genPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let p = ''
    for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)]
    set('password', p)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const url = role === 'PT' ? '/api/admin/create-provider' : '/api/admin/create-doctor'
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed to create account')
      setMsg({ ok: true, text: `${role === 'PT' ? 'Therapist' : 'Rehab doctor'} account created for ${f.email}. Password: ${f.password} — share these credentials with them; they can change the password after signing in.` })
      setF({ profession: 'PT', specialization: 'Rehabilitation Medicine (Physiatry)' })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally { setBusy(false) }
  }

  return (
    <div className="card max-w-2xl">
      <div className="mb-3 flex gap-1 rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] p-1">
        {(['PT', 'DOCTOR'] as Role[]).map((r) => (
          <button key={r} onClick={() => { setRole(r); setMsg(null) }}
            className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${role === r ? 'bg-white text-[color:var(--ink)] shadow-sm' : 'text-[color:var(--slate)]'}`}>
            {r === 'PT' ? 'Therapist (PT)' : 'Rehab doctor'}
          </button>
        ))}
      </div>

      <p className="mb-4 text-[12.5px] text-[color:var(--slate)]">
        Create an <b>already-verified</b> {role === 'PT' ? 'therapist' : 'rehab doctor'} account. They can sign in immediately and complete the rest of their profile (rate, schedule, payout details) from their own portal.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name"><input className="input" required value={f.firstName ?? ''} onChange={(e) => set('firstName', e.target.value)} /></Field>
          <Field label="Last name"><input className="input" required value={f.lastName ?? ''} onChange={(e) => set('lastName', e.target.value)} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email"><input className="input" type="email" required value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Cellphone no."><input className="input" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        </div>

        {role === 'PT' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Profession">
              <select className="select" value={f.profession ?? 'PT'} onChange={(e) => set('profession', e.target.value)}>{PROFESSIONS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            </Field>
            <Field label="Date of birth"><input className="input" type="date" value={f.dob ?? ''} onChange={(e) => set('dob', e.target.value)} /></Field>
            <Field label="PRC licence no."><input className="input" value={f.prcNumber ?? ''} onChange={(e) => set('prcNumber', e.target.value)} /></Field>
            <Field label="Post-nominals (e.g. PTRP, DPT)"><input className="input" value={f.postNominals ?? ''} onChange={(e) => set('postNominals', e.target.value)} /></Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Specialization"><input className="input" value={f.specialization ?? ''} onChange={(e) => set('specialization', e.target.value)} /></Field>
            <Field label="Consult fee (₱)"><input className="input" type="number" min="0" value={f.consultFee ?? ''} onChange={(e) => set('consultFee', e.target.value)} /></Field>
            <Field label="PRC licence no."><input className="input" value={f.prcNumber ?? ''} onChange={(e) => set('prcNumber', e.target.value)} /></Field>
            <Field label="Post-nominals (e.g. MD, FPARM)"><input className="input" value={f.postNominals ?? ''} onChange={(e) => set('postNominals', e.target.value)} /></Field>
          </div>
        )}

        <Field label="Temporary password (min 8 characters)">
          <div className="flex gap-2">
            <input className="input flex-1" required minLength={8} value={f.password ?? ''} onChange={(e) => set('password', e.target.value)} />
            <button type="button" onClick={genPassword} className="whitespace-nowrap rounded-lg border border-[color:var(--line-2)] px-3 text-[12.5px] font-medium text-[color:var(--steel)] hover:bg-[color:var(--mist)]">Generate</button>
          </div>
        </Field>

        {msg && <div className={`rounded-lg px-3 py-2 text-[13px] ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : `Create verified ${role === 'PT' ? 'therapist' : 'rehab doctor'} account`}</button>
      </form>
    </div>
  )
}
