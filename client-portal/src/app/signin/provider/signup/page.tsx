'use client'

// Provider self-sign-up (inside the patient app), with the required Data
// Privacy / Terms consent. Submits to our server route → staff app, which
// creates the account and returns a same-tab handoff URL.

import { useState } from 'react'
import {
  Banner, Icon, CONTROL, CONTROL_STYLE, LABEL, LABEL_STYLE, BTN_PRIMARY, PRIMARY_STYLE, FOCUS, SUBTLE_BG,
} from '@/components/hub/ui'

// Kit controls one size up, as on the Class Portal sign-in.
const INPUT = `${CONTROL} w-full !h-11 !rounded-xl`

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
      <a href="/signin/provider" className={`mb-3 inline-flex items-center gap-1 text-[13px] font-semibold rounded hover:underline ${FOCUS}`} style={{ color: 'var(--teal)', fontFamily: 'var(--font-display)' }}>
        <Icon name="arrowLeft" size={14} /> Sign in instead
      </a>
      <div
        className="rounded-[18px] px-5 py-8 sm:px-10 sm:py-10"
        style={{ background: '#fff', border: '1px solid var(--light-gray)', boxShadow: '0 2px 12px rgba(25,72,80,0.06)' }}
      >
        <div className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>
            Providers
          </div>
          <h1 className="text-[24px] sm:text-[26px] font-bold leading-tight tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--deep-teal)' }}>Create a provider account</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--mid-gray)' }}>For Aura Health therapists &amp; staff.</p>
        </div>
        {err && <div className="mb-4 animate-fade-in"><Banner tone="error">{err}</Banner></div>}

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" required value={f.firstName} onChange={(v) => set('firstName', v)} />
            <Field label="Last name" required value={f.lastName} onChange={(v) => set('lastName', v)} />
            <Field label="Email" type="email" required value={f.email} onChange={(v) => set('email', v)} />
            <Field label="Cellphone no." value={f.phone} onChange={(v) => set('phone', v)} />
            <div className="min-w-0">
              <label htmlFor="ps-department" className={LABEL} style={LABEL_STYLE}>Profession <span style={{ color: 'var(--clay)' }}>*</span></label>
              <select id="ps-department" className={INPUT} style={CONTROL_STYLE} value={f.department} onChange={(e) => set('department', e.target.value)}>
                {DEPARTMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="ps-branch" className={LABEL} style={LABEL_STYLE}>Branch <span style={{ color: 'var(--clay)' }}>*</span></label>
              <select id="ps-branch" className={INPUT} style={CONTROL_STYLE} value={f.branch} onChange={(e) => set('branch', e.target.value)}>
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
            <div className={LABEL} style={LABEL_STYLE}>Terms of Agreement &amp; Data Privacy Consent</div>
            <div tabIndex={0} aria-label="Terms of Agreement and Data Privacy Consent" className={`max-h-44 overflow-y-auto rounded-xl p-3 text-[12px] leading-relaxed ${FOCUS}`} style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
              <p className="mb-2">By creating a provider account with Aura Health Rehab / Sapphire Clinics East Incorporated (&quot;the Clinic&quot;), you agree:</p>
              <p className="mb-2"><strong>1. Collection and use of your information.</strong> You consent to the Clinic collecting and processing the personal information you provide (name, contact details, professional credentials, and login information) to create and manage your provider account, verify your identity and qualifications, coordinate patient care, and comply with legal obligations — under the Data Privacy Act of 2012 (RA 10173) and the Clinic&apos;s Privacy Policy. You may request access to, correction of, or deletion of your information, subject to applicable law and retention requirements.</p>
              <p className="mb-2"><strong>2. Access to patient information — limited to your patients.</strong> You will access, view, use, and disclose patient personal and health information only for patients assigned to you or otherwise under your direct professional care, and only for legitimate care purposes. You will not attempt to access, and will not access, the records of any patient who is not assigned to you. You will keep all patient information strictly confidential. Patient health information is sensitive personal information under the Data Privacy Act; unauthorized access, use, or disclosure may lead to account termination and civil, criminal, or administrative liability.</p>
              <p><strong>3. Account responsibility.</strong> You are responsible for keeping your login credentials confidential and for all activity under your account, and will notify the Clinic immediately of any unauthorized use. The Clinic may verify, suspend, or deactivate your account at any time.</p>
            </div>
            <label className="mt-3 flex items-start gap-2.5 text-[13px] cursor-pointer" style={{ color: 'var(--charcoal)' }}>
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[color:var(--teal)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I have read and agree to the Terms of Agreement and consent to the processing of my personal information as described above.</span>
            </label>
          </div>

          <button className={`${BTN_PRIMARY} w-full !h-11 !rounded-xl mt-2`} style={PRIMARY_STYLE} disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <label className="block min-w-0">
      <span className={LABEL} style={LABEL_STYLE}>{label} {required && <span style={{ color: 'var(--clay)' }}>*</span>}</span>
      <input type={type} className={INPUT} style={CONTROL_STYLE} value={value} placeholder={placeholder} required={required} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
