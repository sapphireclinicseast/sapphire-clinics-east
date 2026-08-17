'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import {
  loginPatient,
  registerPatient,
  setPatientPassword,
  getMe,
  updatePatientProfile,
  listMyDocuments,
  documentFileUrl,
  InvalidTokenError,
  type MeResult,
  type PatientSessionRecord,
  type SessionStats,
  type PatientDocuments,
} from '@/lib/api'
import { getSession, setSession, clearSession } from '@/lib/session'
import Chatbot from '@/components/Chatbot'
import { Hero3D } from '@/components/landing/Hero3D'
import RewardsPanel from '@/components/RewardsPanel'
import { DirectorySection } from '@/components/Directory'
import PortalConcerns from '@/components/PortalConcerns'

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

      {/* Wait for the session check before rendering, so signed-in patients
          never flash the marketing hero. */}
      {!ready ? null : session ? (
        <PortalDashboard
          token={session.token}
          firstName={session.firstName}
          onSignOut={handleSignOut}
        />
      ) : (
        <section
          id="get-started"
          className="max-w-5xl mx-auto animate-fade-up grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start scroll-mt-24"
        >
          {/* Left column — brand hero + feedback. items-start keeps this
              column anchored to the top so the alpaca and complaint card stay
              put even when the New-patient form grows the right column. */}
          <div className="space-y-6">
            <Hero3D />
            <ComplaintCard />
          </div>
          {/* Right column — the (larger) Get started / sign-in + register form. */}
          <AuthCard expired={expired} onAuthed={handleAuthed} />
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
      const res = await loginPatient(String(f.get('username')), String(f.get('password')))
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
        String(f.get('firstName')),
        String(f.get('lastName')),
        String(f.get('username')),
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
      const referralFile = await fileToDataUrl(f.get('referralFile') as File | null)
      const pwdIdFile = await fileToDataUrl(f.get('pwdIdFile') as File | null)
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
        referralFile,
        pwdIdFile,
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
              Do you already have a portal account (a username &amp; password)?
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
            <Field label="Username">
              <input required name="username" autoCapitalize="none" autoCorrect="off" className="input" placeholder="your username" />
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
              You&apos;re already in our records — verify with your email, first name and last name, then choose a username &amp; password.
            </p>
            <Field label="Email">
              <input required name="email" type="email" className="input" placeholder="you@example.com" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <input required name="firstName" className="input" placeholder="Juan" />
              </Field>
              <Field label="Last name">
                <input required name="lastName" className="input" placeholder="Dela Cruz" />
              </Field>
            </div>
            <Field label="Choose a username">
              <input required name="username" autoCapitalize="none" autoCorrect="off" className="input" placeholder="e.g. juan.delacruz" />
            </Field>
            <p className="text-[11px] text-[color:var(--mid-gray)] -mt-2" style={{ fontFamily: 'var(--font-display)' }}>
              Your username is how you&apos;ll sign in — pick your own, even if you share an email with a family member.
            </p>
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
            <Field label="PWD / Senior ID">
              <input name="pwdSeniorId" className="input" placeholder="ID number" />
              <span className="block text-[11px] text-[color:var(--clay)] mt-1" style={{ fontFamily: 'var(--font-display)' }}>
                Required to receive the 20% PWD / Senior Citizen discount.
              </span>
            </Field>
          </div>

          <SectionLabel>Documents (optional)</SectionLabel>
          <p className="text-[11.5px] text-[color:var(--mid-gray)] -mt-1" style={{ fontFamily: 'var(--font-display)' }}>
            You may upload these now or bring them to the clinic. JPG, PNG, or PDF (max 12 MB).
          </p>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Doctor's Referral">
              <input name="referralFile" type="file" accept="image/*,application/pdf" className="input-file" />
            </Field>
            <Field label="PWD ID / Senior ID">
              <input name="pwdIdFile" type="file" accept="image/*,application/pdf" className="input-file" />
              <span className="block text-[11px] text-[color:var(--clay)] mt-1" style={{ fontFamily: 'var(--font-display)' }}>
                Required to receive the 20% PWD / Senior Citizen discount.
              </span>
            </Field>
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
// Signed-in portal — sidebar with Profile / Sessions / Feedback sections
// ─────────────────────────────────────────────────────────────────────────────

const SURVEY_BASE = 'https://survey.sapphireclinicseast.org'

// Survey types that assess a CLINICIAN (therapy experience) vs the FRONT DESK,
// per the "Customer Survey" assignment logic in the Operations Hub.
const CLINICIAN_SURVEYS = new Set(['HR10', 'HR11', 'HR16'])
const FRONTDESK_SURVEYS = new Set(['HR12'])

type Section = 'profile' | 'sessions' | 'feedback' | 'rewards' | 'directory'

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'rewards', label: 'Reward Points' },
  { key: 'directory', label: 'Directory' },
]

function PortalDashboard({
  token,
  firstName,
  onSignOut,
}: {
  token: string
  firstName: string
  onSignOut: () => void
}) {
  const [data, setData] = useState<MeResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<Section>('profile')

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
      <PortalConcerns token={token} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[26px] leading-tight text-[color:var(--deep-teal)]">Welcome back, {firstName}</h2>
          <p className="text-sm text-[color:var(--mid-gray)] mt-1">Your profile, sessions, and feedback in one place.</p>
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
        <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] items-start">
          <SidebarNav section={section} onChange={setSection} />
          <div className="min-w-0">
            {section === 'profile' && (
              <ProfileSection
                data={data}
                token={token}
                onUpdated={(patch) =>
                  setData((d) => (d ? { ...d, profile: { ...d.profile, ...patch } } : d))
                }
              />
            )}
            {section === 'sessions' && <SessionsSection sessions={data.sessions} stats={data.stats} token={token} />}
            {section === 'feedback' && <FeedbackSection surveys={data.surveys} />}
            {section === 'rewards' && (
              <div>
                <div className="card-static mb-5">
                  <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">Reward Points</h3>
                  <p className="text-sm text-[color:var(--mid-gray)] mt-1">
                    Look up your VIP or Prepaid card to see your points and balance.
                  </p>
                </div>
                <RewardsPanel />
              </div>
            )}
            {section === 'directory' && <DirectorySection />}
          </div>
        </div>
      )}
    </section>
  )
}

function SidebarNav({ section, onChange }: { section: Section; onChange: (s: Section) => void }) {
  return (
    <nav className="card-static !p-2 lg:sticky lg:top-6">
      <div
        className="px-2 pt-1.5 pb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Sections
      </div>
      <div className="flex flex-wrap lg:flex-col gap-1">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            className={`lg:w-full text-left px-3 py-2.5 rounded-lg text-[13px] lg:text-sm font-semibold whitespace-nowrap transition-colors ${
              section === s.key
                ? 'bg-[color:var(--pale-teal)] text-[color:var(--deep-teal)]'
                : 'text-[color:var(--mid-gray)] hover:text-[color:var(--teal)] hover:bg-[color:var(--pale-teal)]/50'
            }`}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

// ── Profile ──────────────────────────────────────────────────────────────────

function ProfileSection({
  data,
  token,
  onUpdated,
}: {
  data: MeResult
  token: string
  onUpdated: (patch: Partial<MeResult['profile']>) => void
}) {
  const p = data.profile
  return (
    <div className="space-y-6">
      <ProfileHeaderCard
        token={token}
        photo={p.profilePhoto}
        fullName={p.fullName}
        username={p.username}
        onUpdated={onUpdated}
      />

      {/* Demographics (read-only — edited by the front desk in the CRM) */}
      <div className="card-static">
        <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">Patient Profile</h3>
        <p className="text-sm text-[color:var(--mid-gray)] mt-1">Your demographics as recorded in our Patient CRM.</p>
        <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Detail label="Full Name" value={p.fullName} />
          <Detail label="Date of Birth" value={p.dob ? `${fmtDate(p.dob)}${p.age != null ? ` (${p.age} yrs)` : ''}` : null} />
          <Detail label="Cellphone No." value={p.phone} />
          <Detail label="Email" value={p.email} />
          <Detail label="Address" value={p.address} />
          <Detail label="Diagnosis" value={p.diagnosis} />
          <Detail label="Civil Status" value={p.civilStatus} />
          <Detail label="PWD / Senior ID No." value={p.pwdSeniorId} />
          <Detail label="Branch" value={p.branch} />
        </dl>
        <p className="mt-5 text-[12px] text-[color:var(--mid-gray)] leading-relaxed border-t border-[color:var(--light-gray)] pt-3">
          To update your Patient Profile, please inform the front desk so they can edit your details in the Operations Hub.
        </p>
      </div>

      <MyDocumentsCard profile={p} />

      <AccountSettings token={token} currentUsername={p.username} onUpdated={onUpdated} />
    </div>
  )
}

function ProfileHeaderCard({
  token,
  photo,
  fullName,
  username,
  onUpdated,
}: {
  token: string
  photo: string | null
  fullName: string
  username: string | null
  onUpdated: (patch: Partial<MeResult['profile']>) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const initials =
    fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '🙂'

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file.'); return }
    setBusy(true); setErr(null)
    try {
      const dataUrl = await resizeToDataUrl(file, 256)
      const res = await updatePatientProfile(token, { photo: dataUrl })
      onUpdated({ profilePhoto: res.profilePhoto })
    } catch (e) {
      if (e instanceof InvalidTokenError) return
      setErr((e as Error).message || 'Could not upload photo.')
    } finally { setBusy(false) }
  }

  async function removePhoto() {
    setBusy(true); setErr(null)
    try {
      const res = await updatePatientProfile(token, { photo: '' })
      onUpdated({ profilePhoto: res.profilePhoto })
    } catch (e) {
      if (!(e instanceof InvalidTokenError)) setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div className="card-static">
      <div className="flex items-center gap-5">
        <div className="w-20 h-20 shrink-0 rounded-full overflow-hidden bg-[color:var(--pale-teal)] flex items-center justify-center border border-[color:var(--light-gray)]">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[22px] font-semibold text-[color:var(--teal)]" style={{ fontFamily: 'var(--font-display)' }}>{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[18px] font-semibold text-[color:var(--deep-teal)] truncate">{fullName}</div>
          <div className="text-sm text-[color:var(--mid-gray)] truncate">{username ? `@${username}` : 'No username set'}</div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-secondary text-sm py-1.5">
              {busy ? 'Saving…' : photo ? 'Change photo' : 'Upload photo'}
            </button>
            {photo && !busy && (
              <button type="button" onClick={removePhoto} className="text-sm text-[color:var(--mid-gray)] hover:text-rose-600 px-2">Remove</button>
            )}
          </div>
        </div>
      </div>
      {err && <p className="text-[12px] text-rose-600 mt-3">{err}</p>}
    </div>
  )
}

function AccountSettings({
  token,
  currentUsername,
  onUpdated,
}: {
  token: string
  currentUsername: string | null
  onUpdated: (patch: Partial<MeResult['profile']>) => void
}) {
  const [username, setUsername] = useState(currentUsername ?? '')
  const [uBusy, setUBusy] = useState(false)
  const [uMsg, setUMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [conf, setConf] = useState('')
  const [pBusy, setPBusy] = useState(false)
  const [pMsg, setPMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function saveUsername(e: React.FormEvent) {
    e.preventDefault()
    setUBusy(true); setUMsg(null)
    try {
      const res = await updatePatientProfile(token, { username })
      onUpdated({ username: res.username })
      if (res.username) setUsername(res.username)
      setUMsg({ ok: true, text: 'Username updated.' })
    } catch (e) {
      setUMsg({ ok: false, text: (e as Error).message })
    } finally { setUBusy(false) }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (nw.length < 8) { setPMsg({ ok: false, text: 'New password must be at least 8 characters.' }); return }
    if (nw !== conf) { setPMsg({ ok: false, text: 'New passwords do not match.' }); return }
    setPBusy(true); setPMsg(null)
    try {
      await updatePatientProfile(token, { currentPassword: cur, newPassword: nw })
      setPMsg({ ok: true, text: 'Password changed.' })
      setCur(''); setNw(''); setConf('')
    } catch (e) {
      setPMsg({ ok: false, text: (e as Error).message })
    } finally { setPBusy(false) }
  }

  return (
    <div className="card-static">
      <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">Account &amp; security</h3>
      <p className="text-sm text-[color:var(--mid-gray)] mt-1">Change your login username and password.</p>

      <form onSubmit={saveUsername} className="mt-5">
        <span className="label">Username</span>
        <div className="flex gap-2">
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            className="input flex-1"
            placeholder="your username"
          />
          <button type="submit" disabled={uBusy} className="btn-secondary">{uBusy ? 'Saving…' : 'Save'}</button>
        </div>
        {uMsg && <SettingMsg m={uMsg} />}
      </form>

      <form onSubmit={savePassword} className="mt-6 border-t border-[color:var(--light-gray)] pt-5 space-y-3.5">
        <div className="text-[13px] font-semibold text-[color:var(--deep-teal)]">Change password</div>
        <Field label="Current password">
          <input required type="password" value={cur} onChange={(e) => setCur(e.target.value)} className="input" placeholder="••••••••" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="New password">
            <input required type="password" value={nw} onChange={(e) => setNw(e.target.value)} className="input" placeholder="At least 8 characters" />
          </Field>
          <Field label="Confirm new password">
            <input required type="password" value={conf} onChange={(e) => setConf(e.target.value)} className="input" placeholder="Re-enter password" />
          </Field>
        </div>
        <button type="submit" disabled={pBusy} className="btn-primary">{pBusy ? 'Saving…' : 'Change password'}</button>
        {pMsg && <SettingMsg m={pMsg} />}
      </form>
    </div>
  )
}

function SettingMsg({ m }: { m: { ok: boolean; text: string } }) {
  return (
    <p className={`text-[12px] mt-2 ${m.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{m.text}</p>
  )
}

// Read an image file, cover-crop to a square, and return a compact JPEG data URL.
function resizeToDataUrl(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Image processing not supported on this device.')); return }
      const scale = Math.max(size / img.width, size / img.height)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')) }
    img.src = url
  })
}

// ── Sessions ─────────────────────────────────────────────────────────────────

const SESSIONS_DISCLAIMER =
  'We began using this system in late March–April 2026, so sessions before then are not reflected here.'

function SessionsSection({ sessions, stats, token }: { sessions: MeResult['sessions']; stats?: SessionStats; token: string }) {
  // Distinct departments present in this patient's history → subtabs.
  const departments = useMemo(() => {
    const seen = new Set<string>()
    const order: string[] = []
    for (const s of sessions) {
      const d = s.department || 'Other'
      if (!seen.has(d)) { seen.add(d); order.push(d) }
    }
    return order
  }, [sessions])

  const [dept, setDept] = useState<string | null>(departments[0] ?? null)
  const [selected, setSelected] = useState<PatientSessionRecord | null>(null)
  const [docsOpen, setDocsOpen] = useState(false)
  useEffect(() => {
    if (departments.length && (dept == null || !departments.includes(dept))) {
      setDept(departments[0])
    }
  }, [departments, dept])

  const active = dept && departments.includes(dept) ? dept : departments[0]
  const deptSessions = sessions.filter((s) => (s.department || 'Other') === active)

  const byProvider = new Map<string, MeResult['sessions']>()
  for (const s of deptSessions) {
    const arr = byProvider.get(s.clinician) ?? []
    arr.push(s)
    byProvider.set(s.clinician, arr)
  }

  return (
    <div className="card-static">
      <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">Session History</h3>

      {/* Attendance summary */}
      {stats && (
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <StatTile label="Total Sessions" value={stats.total} tone="teal" />
          <StatTile label="Confirmed" value={stats.confirmed} pct={stats.confirmedPct} tone="green" />
          <StatTile label="Cancelled / Resched." value={stats.cancelledRescheduled} pct={stats.cancelledRescheduledPct} tone="rose" />
        </div>
      )}

      {sessions.length === 0 ? (
        <p className="mt-4 text-sm text-[color:var(--mid-gray)]">No sessions recorded yet.</p>
      ) : (
        <>
          {/* Frozen bar: department tabs stay put on scroll + one Documents card */}
          <div className="sticky top-[60px] z-20 -mx-7 mt-4 px-7 py-3 bg-white/95 backdrop-blur-sm border-b border-[color:var(--light-gray)]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-wrap gap-2">
                {departments.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDept(d)}
                    className={`px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                      active === d
                        ? 'bg-[color:var(--teal)] text-white'
                        : 'bg-[color:var(--pale-teal)] text-[color:var(--deep-teal)] hover:opacity-80'
                    }`}
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {shortDept(d)}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setDocsOpen(true)}
                title="Initial Evaluation, Progress Reports and other documents"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[color:var(--paper-3)] bg-[color:var(--paper-2)] text-sm font-semibold text-[color:var(--deep-teal)] hover:border-[color:var(--sage)] transition-colors shrink-0"
              >
                <FolderIcon /> Documents
              </button>
            </div>
          </div>

          <p className="mt-3 text-[12px] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            Tap a session to view the therapist&apos;s notes.
          </p>

          <div className="mt-3 space-y-6">
            {[...byProvider.entries()].map(([provider, rows]) => (
              <div key={provider}>
                <div className="text-sm font-semibold text-[color:var(--teal)]">{provider}</div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
                        <th className="pb-2 pr-4 font-semibold">Date</th>
                        <th className="pb-2 pr-4 font-semibold">Type of Service</th>
                        <th className="pb-2 pr-4 font-semibold">Status</th>
                        <th className="pb-2 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => (
                        <tr
                          key={`${s.source}-${s.id}`}
                          onClick={() => setSelected(s)}
                          className="border-t border-[color:var(--light-gray)] cursor-pointer hover:bg-[color:var(--pale-teal)]/40 transition-colors"
                        >
                          <td className="py-2.5 pr-4 whitespace-nowrap text-[color:var(--deep-teal)]">{fmtDate(s.date)}</td>
                          <td className="py-2.5 pr-4 text-[color:var(--mid-gray)]">{s.isTeletherapy ? 'Teletherapy' : 'In-clinic'}</td>
                          <td className="py-2.5 pr-4"><StatusBadge status={s.status} /></td>
                          <td className="py-2.5 text-right text-[color:var(--teal)]">›</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Disclaimer>{SESSIONS_DISCLAIMER}</Disclaimer>

      {docsOpen && (
        <DocumentsModal
          token={token}
          department={deptSessions.find((s) => s.departmentCode)?.departmentCode}
          deptLabel={active ?? 'Documents'}
          onClose={() => setDocsOpen(false)}
        />
      )}
      {selected && <SessionDetailModal session={selected} token={token} onClose={() => setSelected(null)} />}
    </div>
  )
}

function StatTile({ label, value, pct, tone }: { label: string; value: number; pct?: number; tone: 'teal' | 'green' | 'rose' }) {
  const color = tone === 'green' ? '#166534' : tone === 'rose' ? '#b91c1c' : 'var(--deep-teal)'
  const bg = tone === 'green' ? '#F0FDF4' : tone === 'rose' ? '#FEF2F2' : 'var(--pale-teal)'
  return (
    <div className="rounded-xl px-3 py-3 text-center" style={{ background: bg }}>
      <div className="text-[22px] font-semibold tabular-nums leading-none" style={{ color }}>{value}</div>
      {pct != null && <div className="text-[12px] font-semibold mt-0.5" style={{ color }}>{pct}%</div>}
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] mt-1 leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{label}</div>
    </div>
  )
}

// Per-session detail — read-only. Shows ONLY the therapist's session notes and
// any attachments they included with those notes for THIS session.
function SessionDetailModal({ session, token, onClose }: { session: PatientSessionRecord; token: string; onClose: () => void }) {
  const deptCode = session.departmentCode || shortDept(session.department)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-[0_24px_60px_rgba(27,63,56,0.3)] flex flex-col overflow-hidden animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-[color:var(--light-gray)] px-4 pt-4 pb-3 z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-block text-[11px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded bg-[color:var(--pale-teal)] text-[color:var(--deep-teal)]">
              {deptCode || 'Session'}
            </span>
            <div className="text-sm text-[color:var(--deep-teal)] font-semibold mt-1.5">{fmtDate(session.date)}</div>
            <div className="text-[12px] text-[color:var(--mid-gray)]">
              {session.clinician}{session.isTeletherapy ? ' · Teletherapy' : ' · In-clinic'} · <StatusInline status={session.status} />
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-[color:var(--mid-gray)] hover:text-[color:var(--deep-teal)] shrink-0">×</button>
        </div>

        <div className="overflow-y-auto px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
            Therapist&apos;s Session Notes
          </div>
          {session.notes && session.notes.trim() ? (
            <p className="mt-2 text-sm text-[color:var(--deep-teal)] whitespace-pre-wrap leading-relaxed">{session.notes}</p>
          ) : (
            <p className="mt-2 text-sm text-[color:var(--mid-gray)] italic">No notes were recorded for this session.</p>
          )}

          {/* Attachments the therapist included with this session's note (if any) */}
          <div className="mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
            Attachments
          </div>
          <DocumentsPanel token={token} scheduleId={session.id} emptyText="No attachments for this session." />

          <p className="mt-4 text-[11px] text-[color:var(--mid-gray)] border-t border-[color:var(--light-gray)] pt-3" style={{ fontFamily: 'var(--font-display)' }}>
            Read-only. Notes and attachments are added by your therapist.
          </p>
        </div>
      </div>
    </div>
  )
}

// Department-level Documents (the single "Documents" card at the top of Sessions):
// Initial Evaluation, Progress Reports and other files for the active department.
function DocumentsModal({ token, department, deptLabel, onClose }: { token: string; department?: string; deptLabel: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-[0_24px_60px_rgba(27,63,56,0.3)] flex flex-col overflow-hidden animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-[color:var(--light-gray)] px-4 pt-4 pb-3 z-10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[18px] font-semibold text-[color:var(--deep-teal)] inline-flex items-center gap-2"><FolderIcon /> Documents</div>
            <div className="text-[12px] text-[color:var(--mid-gray)] mt-0.5 truncate">{deptLabel}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-[color:var(--mid-gray)] hover:text-[color:var(--deep-teal)] shrink-0">×</button>
        </div>
        <div className="overflow-y-auto px-4 py-4">
          <DocumentsPanel token={token} department={department} emptyText="No documents uploaded yet." />
        </div>
      </div>
    </div>
  )
}

function DocumentsPanel({ token, department, scheduleId, emptyText }: { token: string; department?: string; scheduleId?: string; emptyText?: string }) {
  const [docs, setDocs] = useState<PatientDocuments | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listMyDocuments(token, { department, scheduleId })
      .then((d) => { if (!cancelled) setDocs(d) })
      .catch((e) => { if (!cancelled) setErr((e as Error).message) })
    return () => { cancelled = true }
  }, [token, department, scheduleId])

  if (err) return <div className="mt-2 text-[12.5px] text-rose-700">{err}</div>
  if (!docs) return <div className="mt-2 text-[13px] text-[color:var(--mid-gray)]">Loading…</div>
  if (docs.total === 0) return <div className="mt-2 text-[13px] text-[color:var(--mid-gray)] italic">{emptyText ?? 'No documents.'}</div>

  return (
    <div className="mt-2 space-y-3">
      <DocGroup title="Initial Evaluation" rows={docs.initialEvaluations} token={token} />
      <DocGroup title="Progress Reports" rows={docs.progressReports} token={token} />
      <DocGroup title="Other Documents" rows={docs.otherDocuments} token={token} />
    </div>
  )
}

function DocGroup({ title, rows, token }: { title: string; rows: PatientDocuments['initialEvaluations']; token: string }) {
  if (rows.length === 0) return null
  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[color:var(--teal)] mb-1">{title}</div>
      <div className="space-y-1.5">
        {rows.map((d) => (
          <a
            key={d.id}
            href={documentFileUrl(d.id, token)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[color:var(--paper-3)] bg-white hover:border-[color:var(--sage)] transition-colors"
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-[color:var(--deep-teal)] truncate">{d.fileName}</span>
              <span className="block text-[11px] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>{fmtDate(d.createdAt.slice(0, 10))}</span>
            </span>
            <span className="text-[color:var(--teal)] text-[12px] font-semibold shrink-0">View ↗</span>
          </a>
        ))}
      </div>
    </div>
  )
}

function StatusInline({ status }: { status: string }) {
  return <span className="font-semibold text-[color:var(--deep-teal)]">{fmtStatus(status)}</span>
}

function FolderIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>)
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase()
  const tone =
    s === 'COMPLETED' || s === 'PAID'
      ? 'bg-emerald-50 text-emerald-700'
      : s === 'CANCELLED' || s === 'NO_SHOW' || s === 'REJECTED'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-[color:var(--pale-teal)] text-[color:var(--teal)]'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${tone}`} style={{ fontFamily: 'var(--font-display)' }}>
      {fmtStatus(status)}
    </span>
  )
}

// ── Feedback ─────────────────────────────────────────────────────────────────

function FeedbackSection({ surveys }: { surveys: MeResult['surveys'] }) {
  const clinicianSurveys = surveys.filter((s) => CLINICIAN_SURVEYS.has(s.surveyType))
  const frontdeskSurveys = surveys.filter((s) => FRONTDESK_SURVEYS.has(s.surveyType))

  return (
    <div className="card-static">
      <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">Feedback</h3>
      <p className="text-sm text-[color:var(--mid-gray)] mt-1">
        Scan a QR code with your phone to share feedback. Your responses are confidential.
      </p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {/* Complaint — always available */}
        <QrCard
          title="Raise a complaint"
          subtitle="A concern you'd like us to look into."
          url={COMPLAINT_FORM_URL}
          qrSrc="/complaint-qr.svg"
        />

        {/* Clinician feedback — only when randomly selected to assess your provider */}
        {clinicianSurveys.map((s) => (
          <QrCard
            key={s.id}
            title="Rate your clinician"
            subtitle="You were randomly selected to assess your provider."
            url={`${SURVEY_BASE}?id=${encodeURIComponent(s.id)}`}
          />
        ))}

        {/* Front desk feedback — only when randomly selected to assess the front desk */}
        {frontdeskSurveys.map((s) => (
          <QrCard
            key={s.id}
            title="Rate our front desk"
            subtitle="You were randomly selected to assess our front desk."
            url={`${SURVEY_BASE}?id=${encodeURIComponent(s.id)}`}
          />
        ))}
      </div>

      {clinicianSurveys.length === 0 && frontdeskSurveys.length === 0 && (
        <Disclaimer>
          Clinician and front-desk feedback QR codes appear here only when you&apos;re randomly
          selected to assess a staff member.
        </Disclaimer>
      )}
    </div>
  )
}

function QrCard({
  title,
  subtitle,
  url,
  qrSrc,
}: {
  title: string
  subtitle: string
  url: string
  qrSrc?: string
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center text-center rounded-2xl border border-[color:var(--light-gray)] hover:border-[color:var(--teal)] p-5 transition-colors group"
    >
      <div className="text-sm font-semibold text-[color:var(--deep-teal)]">{title}</div>
      <p className="text-[12px] text-[color:var(--mid-gray)] mt-1 leading-snug">{subtitle}</p>
      <div className="mt-4 rounded-xl bg-white p-3 border border-[color:var(--light-gray)] shadow-sm">
        {qrSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrSrc} alt={`QR code — ${title}`} width={132} height={132} className="w-[132px] h-[132px]" />
        ) : (
          <QRCodeSVG value={url} size={132} level="M" bgColor="#ffffff" fgColor="#13262B" />
        )}
      </div>
      <span className="mt-3 text-[12px] font-semibold text-[color:var(--teal)] group-hover:translate-x-0.5 transition-transform" style={{ fontFamily: 'var(--font-display)' }}>
        Or tap to open →
      </span>
    </a>
  )
}

// ── Shared bits used by the signed-in sections ───────────────────────────────

function Disclaimer({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 text-[12px] text-[color:var(--mid-gray)] leading-relaxed border-t border-[color:var(--light-gray)] pt-3">
      {children}
    </p>
  )
}

function shortDept(label: string): string {
  const m = /\(([^)]+)\)/.exec(label)
  return m ? m[1] : label
}

function fmtStatus(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
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

// Patient-facing copies of the docs they uploaded at sign-up (or that the front
// desk attached in the CRM). Links open the file served from the Operations Hub.
function MyDocumentsCard({ profile }: { profile: MeResult['profile'] }) {
  const items = [
    { label: "Doctor's Referral", url: profile.referralUrl ?? null },
    { label: 'PWD ID / Senior ID', url: profile.pwdIdUrl ?? null },
  ]
  return (
    <div className="card-static">
      <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">My Documents</h3>
      <div className="mt-4 space-y-2.5">
        {items.map((it) => (
          <div key={it.label} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[color:var(--light-gray)]">
            <span className="text-sm font-semibold text-[color:var(--deep-teal)]">{it.label}</span>
            {it.url ? (
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-[color:var(--teal)] hover:underline inline-flex items-center gap-1"
              >
                View <span aria-hidden>→</span>
              </a>
            ) : (
              <span className="text-[13px] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
                Not uploaded
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-[color:var(--mid-gray)] leading-relaxed border-t border-[color:var(--light-gray)] pt-3">
        Uploaded these at sign-up? They&apos;ll show here. To add or replace a document, please ask the front desk.
      </p>
    </div>
  )
}

// Read an optional file input into a base64 data URL for the register payload.
async function fileToDataUrl(file: File | null): Promise<{ name: string; dataUrl: string } | undefined> {
  if (!file || file.size === 0) return undefined
  if (file.size > 12 * 1024 * 1024) {
    throw new Error(`"${file.name}" is too large. Please keep files under 12 MB.`)
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.readAsDataURL(file)
  })
  return { name: file.name, dataUrl }
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
