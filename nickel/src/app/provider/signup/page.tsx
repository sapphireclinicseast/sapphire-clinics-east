'use client'

import { useState } from 'react'

const TERMS_VERSION = '2026-08-28'
const PROFESSIONS: [string, string][] = [
  ['PT', 'Physical Therapy'], ['OT', 'Occupational Therapy'], ['SLP', 'Speech-Language Pathology'],
  ['SPED', 'Special Education'], ['PSYCHOLOGY', 'Psychology'], ['MD', 'Medical Doctor'], ['ORTHOSIS', 'Orthosis / Prosthesis'],
]

export default function ProviderSignup() {
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', profession: 'PT', password: '', confirm: '' })
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (f.password.length < 8) return setErr('Password must be at least 8 characters.')
    if (f.password !== f.confirm) return setErr('Passwords do not match.')
    if (!agree) return setErr('Please read and accept the Terms of Agreement.')
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
    <div className="animate-fade-up mx-auto max-w-lg">
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
            <div className="label">Terms of Agreement &amp; Data Privacy Consent</div>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] p-3 text-[12px] leading-relaxed">
              <p className="mb-2">Nickel is operated by <strong>Sapphire Clinics East Inc. (SCEI)</strong>, in coordination with <strong>Jara Universal OPC</strong> (application development). This agreement is governed by the <strong>Data Privacy Act of 2012 (RA 10173)</strong>, <strong>DOH Administrative Order No. 2020-0030 (Data Privacy Guidelines on the Processing of Health Information)</strong>, and the <strong>Health Privacy Code (Joint DOH–DOST–PhilHealth A.O. No. 2016-0002)</strong>. By creating a provider account you agree:</p>
              <p className="mb-2"><strong>1. Your information.</strong> You consent to SCEI collecting and processing the personal and professional information you provide (name, contact details, PRC/PTR, e-signature, and payout details) to operate your account, verify your credentials, coordinate bookings, and meet legal obligations. Processing follows the principles of <strong>transparency, legitimate purpose, and proportionality</strong>. You may exercise your rights as a data subject — including to be informed, to access, to correct, to object, and to erasure/blocking — subject to applicable law and retention requirements.</p>
              <p className="mb-2"><strong>2. Health information is sensitive personal information.</strong> Client health information is <strong>sensitive personal information</strong> and forms part of the privileged communication between you and your client. In line with DOH A.O. 2020-0030 and the Health Privacy Code, you will access, use, and disclose client personal and health information <strong>only for clients booked with you, only with their consent, and only for legitimate care purposes</strong>. You will <strong>not access the records of any client not booked with you</strong>, and you will <strong>not disclose client information to any third party</strong> without the client&apos;s consent or a lawful basis (e.g., a court order or as required by law).</p>
              <p className="mb-2"><strong>3. Confidentiality, security &amp; breach reporting.</strong> You will keep all client information strictly confidential as a non-disclosure obligation and apply reasonable organizational, physical, and technical safeguards to protect it. You will promptly report any suspected personal data breach or security incident to SCEI so it can be addressed in accordance with the DPA and the reporting requirements of the <strong>National Privacy Commission (NPC)</strong>. Unauthorized acquisition, access, use, or disclosure of health information may result in account termination and civil, criminal, or administrative liability.</p>
              <p className="mb-2"><strong>4. Payment arrangement.</strong> You set your own homecare session rate and indicate whether it is transportation-inclusive (shown to clients). Client payments are collected online by SCEI through its Verdana payment account. SCEI remits your earnings to the bank and/or GCash details you provide, less any applicable platform or processing fees. You are responsible for your own taxes and for keeping your payout details accurate.</p>
              <p><strong>5. Account responsibility.</strong> You are responsible for your login credentials and all activity under your account, and will notify SCEI of any unauthorized use. SCEI may verify, suspend, or deactivate your account at any time.</p>
            </div>
            <label className="mt-2 flex items-start gap-2.5 text-[13px]">
              <input type="checkbox" className="mt-0.5 h-4 w-4" style={{ accentColor: 'var(--steel)' }} checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I have read and agree to the Terms of Agreement and consent to the processing of my information as described above.</span>
            </label>
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
