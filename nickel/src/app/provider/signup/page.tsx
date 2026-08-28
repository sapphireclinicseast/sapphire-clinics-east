'use client'

import { useState } from 'react'
import { ProviderTermsBody, ACKNOWLEDGMENTS, TERMS_VERSION } from '@/lib/provider-terms'

const PROFESSIONS: [string, string][] = [
  ['PT', 'Physical Therapy'], ['OT', 'Occupational Therapy'], ['SLP', 'Speech-Language Pathology'],
  ['SPED', 'Special Education'], ['PSYCHOLOGY', 'Psychology'], ['MD', 'Medical Doctor'], ['ORTHOSIS', 'Orthosis / Prosthesis'],
]

export default function ProviderSignup() {
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', profession: 'PT', password: '', confirm: '' })
  const [acks, setAcks] = useState<boolean[]>(() => ACKNOWLEDGMENTS.map(() => false))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))
  const toggleAck = (i: number, v: boolean) => setAcks((s) => s.map((x, j) => (j === i ? v : x)))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (f.password.length < 8) return setErr('Password must be at least 8 characters.')
    if (f.password !== f.confirm) return setErr('Passwords do not match.')
    if (!acks.every(Boolean)) return setErr('Please read the Terms of Service and tick all five acknowledgments to continue.')
    setBusy(true)
    try {
      const r = await fetch('/api/provider/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone, profession: f.profession, password: f.password, termsVersion: TERMS_VERSION }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not create your account.')
      window.location.href = '/provider'
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create your account.')
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade-up mx-auto max-w-xl">
      <div className="card">
        <h1 className="text-[24px] font-semibold">Join Nickel as a therapist</h1>
        <p className="mb-5 mt-1 text-[13px] text-[color:var(--slate)]">Set your own rate and schedule, and reach clients near you.</p>
        {err && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" required value={f.firstName} onChange={(v) => set('firstName', v)} />
            <Field label="Last name" required value={f.lastName} onChange={(v) => set('lastName', v)} />
            <Field label="Email" type="email" required value={f.email} onChange={(v) => set('email', v)} />
            <Field label="Cellphone no." value={f.phone} onChange={(v) => set('phone', v)} />
            <div className="sm:col-span-2">
              <div className="label">Profession *</div>
              <select className="select" value={f.profession} onChange={(e) => set('profession', e.target.value)}>
                {PROFESSIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <Field label="Password" type="password" required value={f.password} onChange={(v) => set('password', v)} placeholder="min 8 characters" />
            <Field label="Confirm password" type="password" required value={f.confirm} onChange={(v) => set('confirm', v)} />
          </div>

          <div className="mt-2">
            <div className="flex items-center justify-between">
              <div className="label">Provider Terms of Service &amp; Data Privacy Consent</div>
              <a href="/provider/terms" target="_blank" rel="noopener noreferrer" className="text-[11.5px] font-medium text-[color:var(--steel)] hover:underline">Open in new tab ↗</a>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] p-3.5">
              <ProviderTermsBody />
            </div>
            <p className="mt-2 text-[12px] font-medium text-[color:var(--ink)]">Please tick all five acknowledgments to continue:</p>
            <div className="mt-1 space-y-2">
              {ACKNOWLEDGMENTS.map((a, i) => (
                <label key={i} className="flex items-start gap-2.5 text-[12.5px]">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" style={{ accentColor: 'var(--steel)' }} checked={acks[i]} onChange={(e) => toggleAck(i, e.target.checked)} />
                  <span><span className="font-semibold">({'abcde'[i]})</span> {a}</span>
                </label>
              ))}
            </div>
          </div>

          <button className="btn-primary mt-2 w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        </form>
        <p className="mt-4 text-center text-[13px] text-[color:var(--slate)]">
          Already have an account? <a href="/provider/login" className="font-semibold text-[color:var(--steel)] hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <div className="label">{label} {required && '*'}</div>
      <input type={type} className="input" value={value} placeholder={placeholder} required={required} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
