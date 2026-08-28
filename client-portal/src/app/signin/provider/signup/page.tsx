'use client'

// Provider self-sign-up (inside the patient app), with the required Data
// Privacy / Terms consent. Submits to our server route → staff app, which
// creates the account and returns a same-tab handoff URL.

import { useState } from 'react'

const TERMS_VERSION = '2026-08-28'

const DEPARTMENTS: [string, string][] = [
  ['PT', 'Physical Therapy'], ['OT', 'Occupational Therapy'], ['SLP', 'Speech-Language Pathology'],
  ['SPED', 'Special Education'], ['PSYCHOLOGY', 'Psychology'], ['MD', 'Medical Doctor'],
  ['ORTHOSIS', 'Orthosis / Prosthesis'], ['FRONT_DESK', 'Front Desk'], ['ADMINISTRATION', 'Administration'],
]

export default function ProviderSignup() {
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', department: 'PT', branch: 'SBEA', jobTitle: '', password: '', confirm: '' })
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
      const r = await fetch('/api/provider-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone,
          department: f.department, branch: f.branch, jobTitle: f.jobTitle,
          password: f.password, termsVersion: TERMS_VERSION,
        }),
      })
      const d = await r.json()
      if (!r.ok || !d.redirectUrl) throw new Error(d.error ?? 'Could not create your account.')
      window.location.href = d.redirectUrl
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create your account.')
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade-up mx-auto max-w-lg">
      <a href="/signin/provider" className="mb-3 inline-block text-[12px] text-[color:var(--moss)] hover:underline">← Sign in instead</a>
      <div className="card-static">
        <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)]">Create a provider account</h1>
        <p className="mb-5 mt-1 text-sm text-[color:var(--mid-gray)]">For Aura Health therapists &amp; staff.</p>
        {err && <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div>}

        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" required value={f.firstName} onChange={(v) => set('firstName', v)} />
            <Field label="Last name" required value={f.lastName} onChange={(v) => set('lastName', v)} />
            <Field label="Email" type="email" required value={f.email} onChange={(v) => set('email', v)} />
            <Field label="Cellphone no." value={f.phone} onChange={(v) => set('phone', v)} />
            <div>
              <div className="label">Profession <span className="text-[color:var(--clay)]">*</span></div>
              <select className="select" value={f.department} onChange={(e) => set('department', e.target.value)}>
                {DEPARTMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <div className="label">Branch <span className="text-[color:var(--clay)]">*</span></div>
              <select className="select" value={f.branch} onChange={(e) => set('branch', e.target.value)}>
                <option value="SBEA">Aura Health East (AHEA)</option>
                <option value="SBGH">Aura Health Greenhills (AHGH)</option>
              </select>
            </div>
            <Field label="Job title (optional)" value={f.jobTitle} onChange={(v) => set('jobTitle', v)} />
            <div className="hidden sm:block" />
            <Field label="Password" type="password" required value={f.password} onChange={(v) => set('password', v)} placeholder="min 8 characters" />
            <Field label="Confirm password" type="password" required value={f.confirm} onChange={(v) => set('confirm', v)} />
          </div>

          {/* Terms of Agreement & Data Privacy consent */}
          <div className="mt-2">
            <div className="label">Terms of Agreement &amp; Data Privacy Consent</div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-[color:var(--paper-3)] bg-[color:var(--paper-2)]/50 p-3 text-[12px] leading-relaxed text-[color:var(--narra)]">
              <p className="mb-2">By creating a provider account with Aura Health Rehab / Sapphire Clinics East Incorporated (&quot;the Clinic&quot;), you agree:</p>
              <p className="mb-2"><strong>1. Collection and use of your information.</strong> You consent to the Clinic collecting and processing the personal information you provide (name, contact details, professional credentials, and login information) to create and manage your provider account, verify your identity and qualifications, coordinate patient care, and comply with legal obligations — under the Data Privacy Act of 2012 (RA 10173) and the Clinic&apos;s Privacy Policy. You may request access to, correction of, or deletion of your information, subject to applicable law and retention requirements.</p>
              <p className="mb-2"><strong>2. Access to patient information — limited to your patients.</strong> You will access, view, use, and disclose patient personal and health information only for patients assigned to you or otherwise under your direct professional care, and only for legitimate care purposes. You will not attempt to access, and will not access, the records of any patient who is not assigned to you. You will keep all patient information strictly confidential. Patient health information is sensitive personal information under the Data Privacy Act; unauthorized access, use, or disclosure may lead to account termination and civil, criminal, or administrative liability.</p>
              <p><strong>3. Account responsibility.</strong> You are responsible for keeping your login credentials confidential and for all activity under your account, and will notify the Clinic immediately of any unauthorized use. The Clinic may verify, suspend, or deactivate your account at any time.</p>
            </div>
            <label className="mt-2 flex items-start gap-2.5 text-[13px] text-[color:var(--narra)]">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[color:var(--moss)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I have read and agree to the Terms of Agreement and consent to the processing of my personal information as described above.</span>
            </label>
          </div>

          <button className="btn-primary mt-2 w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <div className="label">{label} {required && <span className="text-[color:var(--clay)]">*</span>}</div>
      <input type={type} className="input" value={value} placeholder={placeholder} required={required} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
