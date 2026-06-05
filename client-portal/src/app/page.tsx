'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  loginPatient,
  registerPatient,
  setPatientPassword,
  getMe,
  InvalidTokenError,
  type MeResult,
} from '@/lib/api'
import { getSession, setSession, clearSession } from '@/lib/session'
import Chatbot from '@/components/Chatbot'
import { Hero3D } from '@/components/landing/Hero3D'

type Tab = 'returning' | 'new'

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  )
}

function HomeInner() {
  const sp = useSearchParams()
  const [session, setSessionState] = useState<{ firstName: string; token: string } | null>(null)
  const [ready, setReady] = useState(false)
  const expired = sp.get('expired') === '1'

  useEffect(() => {
    const s = getSession()
    if (s) setSessionState({ firstName: s.firstName, token: s.token })
    setReady(true)
  }, [])

  const handleSignOut = useCallback(() => {
    clearSession()
    setSessionState(null)
  }, [])

  const handleAuthed = useCallback((firstName: string, token: string) => {
    setSessionState({ firstName, token })
  }, [])

  return (
    <div className="space-y-8 md:space-y-10">
      <Chatbot />

      <section className="animate-fade-up">
        <Hero3D signedInFirstName={session?.firstName ?? null} />
      </section>

      {ready && session ? (
        <SignedInDashboard token={session.token} onSignOut={handleSignOut} />
      ) : (
        <section
          id="get-started"
          className="max-w-5xl mx-auto animate-fade-up stagger-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start scroll-mt-24"
        >
          <AuthCard expired={expired} onAuthed={handleAuthed} />
          <ComplaintCard />
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth card — returning (login / claim account) + new patient (register)
// ─────────────────────────────────────────────────────────────────────────────

function AuthCard({
  expired,
  onAuthed,
}: {
  expired: boolean
  onAuthed: (firstName: string, token: string) => void
}) {
  const [tab, setTab] = useState<Tab>('returning')
  // null = haven't asked yet; true = has portal account; false = needs to claim
  const [hasAccount, setHasAccount] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function switchTab(next: Tab) {
    setTab(next)
    setErr(null)
    setHasAccount(null)
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const f = new FormData(e.currentTarget)
    try {
      const res = await loginPatient(String(f.get('email')), String(f.get('password')))
      setSession(res)
      onAuthed(res.firstName, res.token)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function handleClaim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const password = String(f.get('password'))
    const confirm = String(f.get('confirm'))
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setErr('Passwords do not match.'); return }
    setBusy(true); setErr(null)
    try {
      const res = await setPatientPassword(
        String(f.get('email')),
        String(f.get('lastName')),
        password,
      )
      setSession(res)
      onAuthed(res.firstName, res.token)
    } catch (e) {
      const msg = (e as Error).message
      setErr(msg)
      // No record to claim → guide them to register as a new patient.
      if (/no matching record/i.test(msg)) {
        setTab('new'); setHasAccount(null)
      }
      // Account already exists → flip to the sign-in form.
      if (/already exists/i.test(msg)) setHasAccount(true)
    } finally { setBusy(false) }
  }

  async function handleNew(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const password = String(f.get('password'))
    const confirm = String(f.get('confirm'))
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setErr('Passwords do not match.'); return }
    setBusy(true); setErr(null)
    const get = (k: string) => String(f.get(k) ?? '').trim() || undefined
    try {
      const res = await registerPatient({
        firstName: String(f.get('firstName')),
        lastName: String(f.get('lastName')),
        email: String(f.get('email')),
        password,
        phone: get('phone'),
        dob: get('dob'),
        sex: get('sex'),
        address: get('address'),
        city: get('city'),
        civilStatus: get('civilStatus'),
        religion: get('religion'),
        nationality: get('nationality'),
        diagnosis: get('diagnosis'),
        pwdSeniorId: get('pwdSeniorId'),
        branch: f.get('branch') as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS',
        patientType: f.get('patientType') as 'PEDIATRIC' | 'ADULT',
      })
      setSession(res)
      onAuthed(res.firstName, res.token)
    } catch (e) {
      const msg = (e as Error).message
      setErr(msg)
      // Email already has an account → send them to sign in.
      if (/already exists/i.test(msg)) { setTab('returning'); setHasAccount(true) }
    } finally { setBusy(false) }
  }

  return (
    <div className="card-static">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-[26px] leading-tight text-[color:var(--deep-teal)]">Get started</h2>
          <p className="text-sm text-[color:var(--mid-gray)] mt-1">Returning or new? Choose below.</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 p-1 bg-[color:var(--pale-teal)] rounded-xl" style={{ fontFamily: 'var(--font-display)' }}>
        <button
          onClick={() => switchTab('returning')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === 'returning' ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)] hover:text-[color:var(--teal)]'}`}
        >Returning patient</button>
        <button
          onClick={() => switchTab('new')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === 'new' ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)] hover:text-[color:var(--teal)]'}`}
        >New patient</button>
      </div>

      {expired && !err && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 animate-fade-in">
          Your session expired. Please sign in again to continue.
        </div>
      )}
      {err && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 animate-fade-in">
          {err}
        </div>
      )}

      {tab === 'returning' ? (
        hasAccount === null ? (
          <div className="space-y-4" key="returning-ask">
            <p className="text-sm text-[color:var(--deep-teal)]">
              Do you already have a portal account (an email &amp; password)?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setHasAccount(true); setErr(null) }}
                className="btn-primary w-full"
              >Yes, sign in</button>
              <button
                type="button"
                onClick={() => { setHasAccount(false); setErr(null) }}
                className="btn-secondary w-full"
              >No, set one up</button>
            </div>
            <p className="text-xs text-[color:var(--mid-gray)] text-center pt-1">
              Brand new here?{' '}
              <button type="button" className="text-[color:var(--teal)] font-semibold hover:underline" onClick={() => switchTab('new')}>
                Register as a new patient
              </button>
            </p>
          </div>
        ) : hasAccount ? (
          <form className="space-y-4" onSubmit={handleLogin} key="returning-login">
            <Field label="Email">
              <input required name="email" type="email" className="input" placeholder="you@example.com" />
            </Field>
            <Field label="Password">
              <input required name="password" type="password" className="input" placeholder="••••••••" />
            </Field>
            <button type="submit" disabled={busy} className="btn-primary w-full mt-2">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="text-xs text-[color:var(--mid-gray)] text-center pt-1">
              Don&apos;t have a password yet?{' '}
              <button type="button" className="text-[color:var(--teal)] font-semibold hover:underline" onClick={() => { setHasAccount(false); setErr(null) }}>
                Set up your account
              </button>
            </p>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleClaim} key="returning-claim">
            <p className="text-sm text-[color:var(--mid-gray)] -mt-1">
              You&apos;re already in our records — verify with your email and last name, then choose a password.
            </p>
            <Field label="Email">
              <input required name="email" type="email" className="input" placeholder="you@example.com" />
            </Field>
            <Field label="Last name">
              <input required name="lastName" className="input" placeholder="Dela Cruz" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="New password">
                <input required name="password" type="password" className="input" placeholder="At least 8 characters" />
              </Field>
              <Field label="Confirm password">
                <input required name="confirm" type="password" className="input" placeholder="Re-enter password" />
              </Field>
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full mt-2">
              {busy ? 'Setting up…' : 'Create account'}
            </button>
            <p className="text-xs text-[color:var(--mid-gray)] text-center pt-1">
              Already have a password?{' '}
              <button type="button" className="text-[color:var(--teal)] font-semibold hover:underline" onClick={() => { setHasAccount(true); setErr(null) }}>
                Sign in instead
              </button>
            </p>
          </form>
        )
      ) : (
        <form className="space-y-3.5" onSubmit={handleNew} key="new">
          <SectionLabel>Basic info</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><input required name="firstName" className="input" /></Field>
            <Field label="Last name"><input required name="lastName" className="input" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email"><input required name="email" type="email" className="input" placeholder="you@example.com" /></Field>
            <Field label="Cellphone no."><input name="phone" className="input" placeholder="+63 9XX XXX XXXX" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Create password"><input required name="password" type="password" className="input" placeholder="At least 8 characters" /></Field>
            <Field label="Confirm password"><input required name="confirm" type="password" className="input" placeholder="Re-enter password" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of birth"><input name="dob" type="date" className="input" /></Field>
            <Field label="Sex">
              <select name="sex" className="select" defaultValue="">
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Patient type">
              <select required name="patientType" className="select" defaultValue="ADULT">
                <option value="PEDIATRIC">Pediatric</option>
                <option value="ADULT">Adult</option>
              </select>
            </Field>
            <Field label="Branch">
              <select required name="branch" className="select" defaultValue="SANDBOX_EAST">
                <option value="SANDBOX_EAST">East Branch</option>
                <option value="SANDBOX_GREENHILLS">Greenhills Branch</option>
              </select>
            </Field>
          </div>

          <SectionLabel>Address</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Barangay / Address"><input name="address" className="input" /></Field>
            <Field label="City"><input name="city" className="input" /></Field>
          </div>

          <SectionLabel>Additional</SectionLabel>
          <Field label="Diagnosis / Condition"><input name="diagnosis" className="input" placeholder="Optional" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Civil status"><input name="civilStatus" className="input" placeholder="Single / Married / …" /></Field>
            <Field label="Religion"><input name="religion" className="input" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nationality"><input name="nationality" className="input" placeholder="e.g. Filipino" /></Field>
            <Field label="PWD / Senior ID"><input name="pwdSeniorId" className="input" placeholder="Optional — for discount" /></Field>
          </div>

          <button type="submit" disabled={busy} className="btn-primary w-full mt-2">
            {busy ? 'Creating…' : 'Create account & continue'}
          </button>
          <p className="text-[11px] text-[color:var(--mid-gray)] text-center" style={{ fontFamily: 'var(--font-display)' }}>
            Your info will be saved to Patient CRM once the clinic confirms.
          </p>
        </form>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Signed-in dashboard
// ─────────────────────────────────────────────────────────────────────────────

const SURVEY_BASE = 'https://survey.sapphireclinicseast.org'

const SURVEY_LABEL: Record<string, string> = {
  HR10: 'Client Satisfaction Survey',
  HR11: 'Therapy Experience Survey',
  HR12: 'Facility & Front Desk Survey',
  HR16: 'Teletherapy Experience Survey',
}

function SignedInDashboard({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [data, setData] = useState<MeResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getMe(token)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof InvalidTokenError) { onSignOut(); return }
        setErr((e as Error).message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, onSignOut])

  return (
    <section className="max-w-5xl mx-auto animate-fade-up stagger-2 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[26px] leading-tight text-[color:var(--deep-teal)]">Your portal</h2>
          <p className="text-sm text-[color:var(--mid-gray)] mt-1">Profile, sessions, and feedback in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/book" className="btn-primary inline-flex items-center justify-center">Book a session →</a>
          <button onClick={onSignOut} className="btn-secondary">Sign out</button>
        </div>
      </div>

      {loading && (
        <div className="card-static text-sm text-[color:var(--mid-gray)]">Loading your details…</div>
      )}
      {err && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
          <div className="space-y-6">
            <ProfileCard data={data} />
            <ServicesCard services={data.servicesAvailed} />
            <SessionsCard sessions={data.sessions} />
          </div>
          <div className="space-y-6">
            <FeedbackCard surveys={data.surveys} />
            <ComplaintCard />
          </div>
        </div>
      )}
    </section>
  )
}

function ProfileCard({ data }: { data: MeResult }) {
  const p = data.profile
  return (
    <div className="card-static">
      <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">Patient Profile</h3>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
        <Detail label="Full Name" value={p.fullName} />
        <Detail label="Date of Birth" value={p.dob} />
        <Detail label="Sex" value={p.sex} />
        <Detail label="Age" value={p.age != null ? String(p.age) : null} />
        <Detail label="Patient Type" value={p.patientType} />
        <Detail label="Diagnosis" value={p.diagnosis} />
        <Detail label="City" value={p.city} />
        <Detail label="Branch" value={p.branch} />
      </dl>
      <p className="mt-5 text-[12px] text-[color:var(--mid-gray)] leading-relaxed border-t border-[color:var(--light-gray)] pt-3">
        To update your Patient Profile, please inform the front desk to fill in the data in their Operations Hub.
      </p>
    </div>
  )
}

function ServicesCard({ services }: { services: string[] }) {
  return (
    <div className="card-static">
      <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">Services Availed</h3>
      {services.length === 0 ? (
        <p className="mt-3 text-sm text-[color:var(--mid-gray)]">No services recorded yet.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {services.map((s) => (
            <span
              key={s}
              className="inline-flex items-center px-3 py-1.5 rounded-full text-[13px] font-medium bg-[color:var(--pale-teal)] text-[color:var(--deep-teal)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SessionsCard({ sessions }: { sessions: MeResult['sessions'] }) {
  return (
    <div className="card-static">
      <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">Session History</h3>
      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-[color:var(--mid-gray)]">No sessions yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
                <th className="pb-2 pr-4 font-semibold">Date</th>
                <th className="pb-2 pr-4 font-semibold">Time</th>
                <th className="pb-2 pr-4 font-semibold">Clinician</th>
                <th className="pb-2 font-semibold">Service</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={`${s.source}-${s.id}`} className="border-t border-[color:var(--light-gray)]">
                  <td className="py-2.5 pr-4 whitespace-nowrap text-[color:var(--deep-teal)]">{fmtDate(s.date)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-[color:var(--mid-gray)]">{fmtTime(s.startTime)}–{fmtTime(s.endTime)}</td>
                  <td className="py-2.5 pr-4 text-[color:var(--deep-teal)]">{s.clinician}</td>
                  <td className="py-2.5 text-[color:var(--mid-gray)]">
                    {s.department || '—'}
                    {s.isTeletherapy && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[color:var(--pale-teal)] text-[color:var(--teal)]" style={{ fontFamily: 'var(--font-display)' }}>Tele</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FeedbackCard({ surveys }: { surveys: MeResult['surveys'] }) {
  return (
    <aside className="card-static">
      <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">Give us feedback!</h3>
      {surveys.length === 0 ? (
        <p className="mt-2 text-sm text-[color:var(--mid-gray)]">
          No surveys for you right now. When one is assigned, it&apos;ll appear here.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-sm text-[color:var(--mid-gray)]">
            You have {surveys.length === 1 ? 'a survey' : `${surveys.length} surveys`} waiting — your honest input shapes our care.
          </p>
          <div className="mt-4 space-y-2.5">
            {surveys.map((s) => (
              <a
                key={s.id}
                href={`${SURVEY_BASE}?id=${encodeURIComponent(s.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[color:var(--light-gray)] hover:border-[color:var(--teal)] hover:bg-[color:var(--pale-teal)] transition-colors group"
              >
                <span className="text-sm font-semibold text-[color:var(--deep-teal)]">
                  {SURVEY_LABEL[s.surveyType] ?? s.surveyType}
                </span>
                <span className="text-[color:var(--teal)] group-hover:translate-x-0.5 transition-transform">→</span>
              </a>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────────────────

const COMPLAINT_FORM_URL = 'https://hr.sapphireclinicseast.org/patient-complaint-form.html'

function ComplaintCard() {
  return (
    <aside className="card-static lg:sticky lg:top-6">
      <h2 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">
        Have a concern or complaint?
      </h2>
      <p className="text-sm text-[color:var(--mid-gray)] mt-1.5">
        Your feedback is confidential and helps us care better. Submit it now.
      </p>

      <a
        href={COMPLAINT_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary w-full mt-4 inline-flex items-center justify-center"
      >
        Submit now →
      </a>

      <div className="mt-5 flex flex-col items-center">
        <div className="rounded-2xl bg-white p-3 border border-[color:var(--light-gray)] shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/complaint-qr.svg"
            alt="QR code to the patient complaint form"
            width={140}
            height={140}
            className="w-[140px] h-[140px]"
          />
        </div>
        <p className="text-[11px] text-[color:var(--mid-gray)] mt-2 text-center" style={{ fontFamily: 'var(--font-display)' }}>
          Or scan to open on your phone
        </p>
      </div>
    </aside>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] pt-2" style={{ fontFamily: 'var(--font-display)' }}>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
        {label}
      </dt>
      <dd className="text-sm text-[color:var(--deep-teal)] font-medium mt-0.5">{value || '—'}</dd>
    </div>
  )
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!m) return hhmm
  let h = parseInt(m[1], 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m[2]} ${ampm}`
}
