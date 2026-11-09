'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import {
  loginPatient,
  registerPatient,
  setPatientPassword,
  getMe,
  updatePatientProfile,
  listMyDocuments,
  documentFileUrl,
  uploadPatientDocument,
  InvalidTokenError,
  type MeResult,
  type PatientSessionRecord,
  type SessionStats,
  type PatientDocuments,
} from '@/lib/api'
import { branchLabel } from '@/lib/branch-label'
import { getSession, setSession, clearSession, recoverSession } from '@/lib/session'
import { Hero3D } from '@/components/landing/Hero3D'
import RewardsPanel from '@/components/RewardsPanel'
import { DirectorySection } from '@/components/Directory'
import PortalConcerns from '@/components/PortalConcerns'
import PortalMessages from '@/components/PortalMessages'
import HomeProgressSection from '@/components/HomeProgress'
import CertificatesSection from '@/components/Certificates'
import PortalShell, { type ShellNavItem } from '@/components/PortalShell'
import {
  PAGE, PageHeader, DashCard, KpiCard, StatusPill, Tag, Banner, EmptyState, Skeleton, RowsSkeleton,
  PillTabs, Dialog, Avatar, GroupLabel, Icon, displayName, type Tone,
  CONTROL, CONTROL_STYLE, LABEL, LABEL_STYLE, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, BTN_DANGER_GHOST,
  PRIMARY_STYLE, SECONDARY_STYLE, TH, TH_STYLE, TD, TR, TR_STYLE, CARD_STYLE, DANGER, FOCUS,
} from '@/components/hub/ui'

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
    let cancelled = false
    const s = getSession()
    if (s) {
      setSessionState({ firstName: s.firstName, token: s.token })
      setReady(true)
      return
    }
    // No local session — try to recover from the durable HttpOnly cookie before
    // falling back to the sign-in screen (iOS Safari evicts localStorage after
    // ~7 days, but the server-set cookie persists).
    recoverSession()
      .then((r) => { if (!cancelled && r) setSessionState({ firstName: r.firstName, token: r.token }) })
      .finally(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
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
              put even when the New-patient form grows the right column.
              On mobile this whole column drops BELOW the right column (order-2)
              so the flow reads Homecare → Get started → hero → complaint. */}
          <div className="space-y-6 order-2 lg:order-1">
            <Hero3D />
            <ComplaintCard />
          </div>
          {/* Right column — the (larger) Get started / sign-in + register form,
              with the Homecare PT promo filling the space beneath it. On mobile
              this column comes first (order-1) and the Homecare promo is pulled
              ABOVE the Get-started card. flex+order lets us flip that pair on
              mobile while keeping Get-started-then-Homecare on desktop. */}
          <div className="flex flex-col gap-6 order-1 lg:order-2">
            <div className="order-2 lg:order-1">
              <AuthCard expired={expired} onAuthed={handleAuthed} />
            </div>
            <div className="order-1 lg:order-2">
              <HomecareBanner />
            </div>
          </div>
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
                <option value="SANDBOX_EAST">{branchLabel('SANDBOX_EAST')}</option>
                <option value="SANDBOX_GREENHILLS">{branchLabel('SANDBOX_GREENHILLS')}</option>
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
// Signed-in portal — app shell (sidebar) with Profile / Sessions / … sections
// ─────────────────────────────────────────────────────────────────────────────

const SURVEY_BASE = 'https://survey.sapphireclinicseast.org'

// Survey types that assess a CLINICIAN (therapy experience) vs the FRONT DESK,
// per the "Customer Survey" assignment logic in the Operations Hub.
const CLINICIAN_SURVEYS = new Set(['HR10', 'HR11', 'HR16'])
const FRONTDESK_SURVEYS = new Set(['HR12'])

type Section = 'profile' | 'sessions' | 'homeprogress' | 'certificates' | 'feedback' | 'rewards' | 'directory'

// Sidebar nav, in order. Consecutive items sharing a group sit under one heading.
const SECTIONS: ShellNavItem<Section>[] = [
  { key: 'profile', label: 'Profile', icon: 'user', group: 'Overview' },
  { key: 'sessions', label: 'Sessions', icon: 'clock', group: 'My care' },
  { key: 'homeprogress', label: 'Home Progress', icon: 'home', group: 'My care' },
  { key: 'certificates', label: 'Certificates', icon: 'award', group: 'My care' },
  { key: 'feedback', label: 'Feedback', icon: 'heart', group: 'Clinic' },
  { key: 'rewards', label: 'Reward Points', icon: 'star', group: 'Clinic' },
  { key: 'directory', label: 'Directory', icon: 'phone', group: 'Clinic' },
]

function nameInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase()
}

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
      .then((d) => {
        if (cancelled) return
        setData(d)
        // Sliding renewal: persist the freshly re-issued token (and identity) so
        // the local cache stays in lockstep with the refreshed cookie.
        if (d.patientId && d.token) {
          setSession({ patientId: d.patientId, firstName: d.firstName ?? firstName, token: d.token })
        }
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof InvalidTokenError) { onSignOut(); return }
        setErr((e as Error).message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, firstName, onSignOut])

  const current = SECTIONS.find((s) => s.key === section)
  const shownName = displayName(data?.profile.fullName || firstName) || 'Patient'
  const username = data?.profile.username

  return (
    <>
      <PortalShell
        items={SECTIONS}
        active={section}
        onSelect={setSection}
        userName={shownName}
        userSub={username ? `@${username}` : 'Patient'}
        avatarText={nameInitials(shownName) || '?'}
        onSignOut={onSignOut}
      />
      <PortalConcerns token={token} />
      {/* Stacked above Concerns, which sits above the chatbot bubble. */}
      <PortalMessages token={token} />

      <section className={`${PAGE} animate-fade-up stagger-2`}>
        <PageHeader
          eyebrow={current?.label}
          title={`Welcome back, ${displayName(firstName)}`}
          description="Your profile, sessions, and feedback in one place."
          actions={
            <Link href="/book" className={BTN_PRIMARY} style={PRIMARY_STYLE}>
              <Icon name="calendar" size={15} /> Book a session
            </Link>
          }
        />

        {loading && (
          <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
            <RowsSkeleton rows={4} label="Loading your details…" />
          </div>
        )}
        {err && <Banner tone="error">{err}</Banner>}

        {data && (
          <div className="min-w-0" aria-label={current?.label} role="region">
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
            {section === 'homeprogress' && <HomeProgressSection token={token} />}
            {section === 'certificates' && <CertificatesSection token={token} />}
            {section === 'feedback' && <FeedbackSection surveys={data.surveys} />}
            {section === 'rewards' && (
              <div className="space-y-3">
                <GroupLabel hint="Look up your VIP or Prepaid card to see your points and balance.">Reward Points</GroupLabel>
                <RewardsPanel />
              </div>
            )}
            {section === 'directory' && <DirectorySection />}
          </div>
        )}
      </section>
    </>
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
    <div className="space-y-5">
      <ProfileHeaderCard
        token={token}
        photo={p.profilePhoto}
        fullName={p.fullName}
        username={p.username}
        onUpdated={onUpdated}
      />

      {/* Demographics (read-only — edited by the front desk in the CRM) */}
      <DashCard
        title="Patient Profile"
        description="Your demographics as recorded in our Patient CRM."
        icon={<Icon name="file" size={16} />}
        footer="To update your Patient Profile, please inform the front desk so they can edit your details in the Operations Hub."
      >
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
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
      </DashCard>

      <MyDocumentsCard profile={p} token={token} onUploaded={onUpdated} />

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

  const initials = nameInitials(fullName) || '🙂'

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
    <div className="rounded-xl px-4 sm:px-5 py-4 min-w-0" style={CARD_STYLE}>
      <div className="flex items-center gap-4 min-w-0">
        <div
          className="w-[72px] h-[72px] shrink-0 rounded-full overflow-hidden flex items-center justify-center"
          style={{ background: 'var(--pale-teal)', border: '1px solid var(--light-gray)' }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[22px] font-bold" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>Patient</p>
          <div className="text-lg sm:text-xl font-bold leading-tight truncate" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{displayName(fullName)}</div>
          <div className="text-sm truncate" style={{ color: 'var(--mid-gray)' }}>{username ? `@${username}` : 'No username set'}</div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={BTN_SM} style={SECONDARY_STYLE}>
              <Icon name="image" size={13} /> {busy ? 'Saving…' : photo ? 'Change photo' : 'Upload photo'}
            </button>
            {photo && !busy && (
              <button type="button" onClick={removePhoto} className={BTN_DANGER_GHOST} style={{ color: DANGER }}>Remove</button>
            )}
          </div>
        </div>
      </div>
      {err && <div className="mt-3"><Banner tone="error">{err}</Banner></div>}
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
    <DashCard
      title="Account & security"
      description="Change your login username and password."
      icon={<Icon name="shield" size={16} />}
    >
      <form onSubmit={saveUsername}>
        <label className={LABEL} style={LABEL_STYLE} htmlFor="acct-username">Username</label>
        <div className="flex gap-2">
          <input
            id="acct-username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            className={`${CONTROL} flex-1 min-w-0`}
            style={CONTROL_STYLE}
            placeholder="your username"
          />
          <button type="submit" disabled={uBusy} className={BTN_SECONDARY} style={SECONDARY_STYLE}>{uBusy ? 'Saving…' : 'Save'}</button>
        </div>
        {uMsg && <SettingMsg m={uMsg} />}
      </form>

      <form onSubmit={savePassword} className="mt-5 pt-5 space-y-3.5" style={{ borderTop: '1px solid var(--light-gray)' }}>
        <h3 className="text-[13px] font-bold tracking-normal" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Change password</h3>
        <KitField label="Current password">
          <input required type="password" value={cur} onChange={(e) => setCur(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE} placeholder="••••••••" />
        </KitField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <KitField label="New password">
            <input required type="password" value={nw} onChange={(e) => setNw(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE} placeholder="At least 8 characters" />
          </KitField>
          <KitField label="Confirm new password">
            <input required type="password" value={conf} onChange={(e) => setConf(e.target.value)} className={`${CONTROL} w-full`} style={CONTROL_STYLE} placeholder="Re-enter password" />
          </KitField>
        </div>
        <button type="submit" disabled={pBusy} className={BTN_PRIMARY} style={PRIMARY_STYLE}>{pBusy ? 'Saving…' : 'Change password'}</button>
        {pMsg && <SettingMsg m={pMsg} />}
      </form>
    </DashCard>
  )
}

/** Signed-in form field: kit label over a kit control. (The public forms keep
 *  their own Field below.) */
function KitField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={LABEL} style={LABEL_STYLE}>{label}</span>
      {children}
    </label>
  )
}

function SettingMsg({ m }: { m: { ok: boolean; text: string } }) {
  return (
    <div className="mt-2.5">
      <Banner tone={m.ok ? 'success' : 'error'}>{m.text}</Banner>
    </div>
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

// Patient-facing copies of the docs they uploaded at sign-up (or that the front
// desk attached in the CRM). Links open the file served from the Operations Hub.
function MyDocumentsCard({ profile, token, onUploaded }: {
  profile: MeResult['profile']
  token: string
  onUploaded: (patch: Partial<MeResult['profile']>) => void
}) {
  const items: { label: string; url: string | null; docType: 'referral' | 'pwd-id'; field: 'referralUrl' | 'pwdIdUrl' }[] = [
    { label: "Doctor's Referral", url: profile.referralUrl ?? null, docType: 'referral', field: 'referralUrl' },
    { label: 'PWD ID / Senior ID', url: profile.pwdIdUrl ?? null, docType: 'pwd-id', field: 'pwdIdUrl' },
  ]
  const [busy, setBusy] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  function pick(docType: 'referral' | 'pwd-id', field: 'referralUrl' | 'pwdIdUrl') {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,application/pdf'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      if (file.size > 20 * 1024 * 1024) { setErr(`"${file.name}" is too large. Please keep it under 20 MB.`); return }
      setErr(null); setPct(0); setBusy(docType)
      try {
        const res = await uploadPatientDocument(token, docType, file, setPct)
        onUploaded({ [field]: res.url } as Partial<MeResult['profile']>)
      } catch (e) {
        setErr((e as Error).message || 'Upload failed.')
      } finally {
        setBusy(null)
      }
    }
    input.click()
  }

  return (
    <DashCard
      title="My Documents"
      icon={<Icon name="upload" size={16} />}
      flush
      footer="Upload a clear photo or PDF of your Doctor's Referral or PWD / Senior ID (max 20 MB). It's saved to your patient record so the clinic can see it — no need to visit the front desk."
    >
      <ul>
        {items.map((it, i) => (
          <li
            key={it.label}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 sm:px-5 py-3"
            style={i ? TR_STYLE : undefined}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Icon name="file" size={16} style={{ color: 'var(--teal)' }} />
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{it.label}</span>
              {it.url
                ? <StatusPill tone="success">On file</StatusPill>
                : <StatusPill tone="neutral">Not uploaded</StatusPill>}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {it.url && (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={BTN_SM}
                  style={{ color: 'var(--teal)' }}
                >
                  View <Icon name="external" size={12} />
                </a>
              )}
              {busy === it.docType ? (
                <span className="text-[13px] tabular-nums" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>{pct}%…</span>
              ) : (
                <button
                  onClick={() => pick(it.docType, it.field)}
                  disabled={!!busy}
                  className={BTN_SM}
                  style={SECONDARY_STYLE}
                >
                  <Icon name="upload" size={12} /> {it.url ? 'Replace' : 'Upload'}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {err && <div className="px-4 sm:px-5 pb-4"><Banner tone="error">{err}</Banner></div>}
    </DashCard>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className={LABEL} style={LABEL_STYLE}>{label}</dt>
      <dd className="text-sm leading-snug [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)' }}>{value || '—'}</dd>
    </div>
  )
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
    <div className="space-y-5">
      {/* Attendance summary */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard label="Total Sessions" value={stats.total} icon={<Icon name="calendar" size={16} />} />
          <KpiCard label="Confirmed" value={stats.confirmed} sub={`${stats.confirmedPct}% of sessions`} accent="var(--sage)" icon={<Icon name="check" size={16} />} />
          <KpiCard label="Cancelled / Resched." value={stats.cancelledRescheduled} sub={`${stats.cancelledRescheduledPct}% of sessions`} accent={DANGER} icon={<Icon name="refresh" size={16} />} />
        </div>
      )}

      <DashCard
        title="Session History"
        description={sessions.length ? 'Tap a session to view the therapist’s notes.' : undefined}
        icon={<Icon name="clock" size={16} />}
        flush
        footer={SESSIONS_DISCLAIMER}
      >
        {sessions.length === 0 ? (
          <EmptyState icon="calendar" title="No sessions recorded yet." />
        ) : (
          <>
            {/* Frozen bar: department tabs stay put on scroll + one Documents button.
                top-14 clears the phone top bar; on desktop there's no header. */}
            <div
              className="sticky top-14 md:top-0 z-20 px-4 sm:px-5 py-3 flex items-center justify-between gap-3 flex-wrap"
              style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(4px)', borderBottom: '1px solid var(--light-gray)' }}
            >
              <PillTabs
                label="Departments"
                size="sm"
                tabs={departments.map((d) => ({ id: d, label: shortDept(d), title: d }))}
                value={active ?? ''}
                onChange={(d) => setDept(d)}
              />
              <button
                onClick={() => setDocsOpen(true)}
                title="Initial Evaluation, Progress Reports and other documents"
                className={`${BTN_SECONDARY} shrink-0`}
                style={SECONDARY_STYLE}
              >
                <FolderIcon /> Documents
              </button>
            </div>

            <div className="py-2">
              {[...byProvider.entries()].map(([provider, rows]) => (
                <div key={provider} className="pt-3 pb-1">
                  <div className="px-4 sm:px-5 pb-2 flex items-center gap-2">
                    <Avatar text={nameInitials(provider) || '?'} size={26} />
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{provider}</span>
                    <span className="text-xs tabular-nums" style={{ color: 'var(--mid-gray)' }}>· {rows.length}</span>
                  </div>
                  {/* relative: keeps the header's sr-only label inside the scroller,
                      so it can't widen the page on phones. */}
                  <div className="overflow-x-auto" style={{ position: 'relative' }}>
                    {/* Fixed layout so each provider's table lines up with the next. */}
                    <table className="w-full text-sm min-w-[440px]" style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '30%' }} /><col /><col style={{ width: '28%' }} /><col style={{ width: 48 }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className={`${TH} pl-4 sm:pl-5`} style={TH_STYLE}>Date</th>
                          <th className={TH} style={TH_STYLE}>Type of Service</th>
                          <th className={TH} style={TH_STYLE}>Status</th>
                          <th className={TH} style={TH_STYLE}><span className="sr-only">Open</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((s) => (
                          <tr
                            key={`${s.source}-${s.id}`}
                            onClick={() => setSelected(s)}
                            className={`${TR} cursor-pointer`}
                            style={TR_STYLE}
                          >
                            <td className={`${TD} pl-4 sm:pl-5 whitespace-nowrap font-medium`} style={{ color: 'var(--charcoal)' }}>{fmtDate(s.date)}</td>
                            <td className={TD} style={{ color: 'var(--mid-gray)' }}>
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                {s.isTeletherapy ? 'Teletherapy' : 'In-clinic'}
                                {s.branch && <Tag tone="brand">{s.branch}</Tag>}
                              </span>
                            </td>
                            <td className={TD}><StatusBadge status={s.status} /></td>
                            <td className={`${TD} pr-4 sm:pr-5 text-right`} style={{ color: 'var(--teal)' }}>
                              <Icon name="chevronRight" size={14} className="inline-block" />
                            </td>
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
      </DashCard>

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

function ModalHeading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`text-[11px] font-bold uppercase tracking-widest ${className}`} style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
      {children}
    </h3>
  )
}

// Per-session detail — read-only. Shows ONLY the therapist's session notes and
// any attachments they included with those notes for THIS session.
function SessionDetailModal({ session, token, onClose }: { session: PatientSessionRecord; token: string; onClose: () => void }) {
  const deptCode = session.departmentCode || shortDept(session.department)
  if (typeof document === 'undefined') return null

  return createPortal(
    <Dialog
      labelId="session-detail-title"
      onClose={onClose}
      eyebrow={deptCode || 'Session'}
      title={fmtDate(session.date)}
      description={
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {session.clinician}{session.isTeletherapy ? ' · Teletherapy' : ' · In-clinic'}{session.branch ? ` · ${session.branch}` : ''} · <StatusBadge status={session.status} />
        </span>
      }
    >
      <ModalHeading>Therapist&apos;s Session Notes</ModalHeading>
      {(() => {
        const raw = (session.notes ?? '').trim()
        // Backfilled sessions carry an import marker, not real notes.
        if (/^\[backfill:/i.test(raw)) {
          return <p className="mt-2 text-sm italic" style={{ color: 'var(--mid-gray)' }}>Backfilled session history — session notes were not created in the system for this session.</p>
        }
        return raw ? (
          <p className="mt-2 text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--charcoal)' }}>{raw}</p>
        ) : (
          <p className="mt-2 text-sm italic" style={{ color: 'var(--mid-gray)' }}>No notes were recorded for this session.</p>
        )
      })()}

      {/* Attachments the therapist included with this session's note (if any) */}
      <ModalHeading className="mt-5">Attachments</ModalHeading>
      <DocumentsPanel token={token} scheduleId={session.id} emptyText="No attachments for this session." />

      <p className="mt-4 pt-3 text-[11px]" style={{ color: 'var(--mid-gray)', borderTop: '1px solid var(--light-gray)' }}>
        Read-only. Notes and attachments are added by your therapist.
      </p>
    </Dialog>,
    document.body,
  )
}

// Department-level Documents (the single "Documents" button at the top of Sessions):
// Initial Evaluation, Progress Reports and other files for the active department.
function DocumentsModal({ token, department, deptLabel, onClose }: { token: string; department?: string; deptLabel: string; onClose: () => void }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <Dialog
      labelId="documents-title"
      onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><FolderIcon /> Documents</span>}
      description={deptLabel}
    >
      <DocumentsPanel token={token} department={department} emptyText="No documents uploaded yet." />
    </Dialog>,
    document.body,
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

  if (err) return <div className="mt-2"><Banner tone="error">{err}</Banner></div>
  if (!docs) return <div className="mt-2 space-y-2" role="status" aria-label="Loading"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
  if (docs.total === 0) return <p className="mt-2 text-[13px] italic" style={{ color: 'var(--mid-gray)' }}>{emptyText ?? 'No documents.'}</p>

  return (
    <div className="mt-2 space-y-4">
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
      <p className="text-[10.5px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--teal)', fontFamily: 'var(--font-display)' }}>{title}</p>
      <div className="space-y-1.5">
        {rows.map((d) => (
          <a
            key={d.id}
            href={documentFileUrl(d.id, token)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[#F8FAF2]"
            style={CARD_STYLE}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Icon name="file" size={16} style={{ color: 'var(--teal)' }} />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--charcoal)' }}>{d.fileName}</span>
                <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>{fmtDate(d.createdAt.slice(0, 10))}</span>
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold shrink-0" style={{ color: 'var(--teal)' }}>
              View <Icon name="external" size={12} />
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

function FolderIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>)
}

// Session status → kit StatusPill (dot + label, never colour alone).
function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase()
  const tone: Tone =
    s === 'CONFIRMED' || s === 'COMPLETED' || s === 'PAID'
      ? 'success'
      : s === 'PENDING'
        ? 'warn'
        : s === 'RESCHEDULED'
          ? 'info'
          : s === 'CANCELLED' || s === 'NO_SHOW' || s === 'REJECTED'
            ? 'error'
            : 'neutral'
  return <StatusPill tone={tone}>{fmtStatus(status)}</StatusPill>
}

// ── Feedback ─────────────────────────────────────────────────────────────────

function FeedbackSection({ surveys }: { surveys: MeResult['surveys'] }) {
  const clinicianSurveys = surveys.filter((s) => CLINICIAN_SURVEYS.has(s.surveyType))
  const frontdeskSurveys = surveys.filter((s) => FRONTDESK_SURVEYS.has(s.surveyType))

  return (
    <DashCard
      title="Feedback"
      description="Scan a QR code with your phone to share feedback. Your responses are confidential."
      icon={<Icon name="edit" size={16} />}
      footer={clinicianSurveys.length === 0 && frontdeskSurveys.length === 0 ? (
        <>
          Clinician and front-desk feedback QR codes appear here only when you&apos;re randomly
          selected to assess a staff member.
        </>
      ) : undefined}
    >
      <div className="grid gap-4 sm:grid-cols-2">
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
    </DashCard>
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
      className={`flex flex-col items-center text-center rounded-xl p-5 transition-colors hover:bg-[#F8FAF2] group ${FOCUS}`}
      style={CARD_STYLE}
    >
      <div className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{title}</div>
      <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--mid-gray)' }}>{subtitle}</p>
      <div className="mt-4 rounded-lg bg-white p-3" style={{ border: '1px solid var(--light-gray)' }}>
        {qrSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrSrc} alt={`QR code — ${title}`} width={132} height={132} className="w-[132px] h-[132px]" />
        ) : (
          <QRCodeSVG value={url} size={132} level="M" bgColor="#ffffff" fgColor="#13262B" />
        )}
      </div>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--teal)', fontFamily: 'var(--font-display)' }}>
        Or tap to open <Icon name="external" size={12} />
      </span>
    </a>
  )
}

// ── Shared bits used by the signed-in sections ───────────────────────────────

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

// Promo card under the Get-started panel: announces Homecare PT and routes to
// the /homecare booking flow. The whole card is the link; "Schedule Now" is the
// visual affordance.
function HomecareBanner() {
  return (
    <a
      href="https://nickelcare.com"
      aria-label="Schedule Homecare Physical Therapy on Nickel"
      className="group relative block overflow-hidden rounded-[18px] p-6 text-white shadow-[0_10px_30px_rgba(27,63,56,0.25)] transition-transform duration-200 hover:-translate-y-0.5"
      style={{ background: 'linear-gradient(135deg, var(--deep-teal), var(--teal))' }}
    >
      <span className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-20" style={{ background: 'var(--gold)' }} />
      <span className="pointer-events-none absolute -bottom-12 right-8 h-24 w-24 rounded-full bg-white opacity-10" />
      <div className="relative flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
            <path d="M12 21v-5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2" />
            <path d="M9.2 12.3c.9-.9 2.2-.2 2.8.4.6-.6 1.9-1.3 2.8-.4.7.8.5 1.8-.2 2.5L12 17.2l-2.6-2.4c-.7-.7-.9-1.7-.2-2.5Z" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--gold)' }}>New · Aura at Home</div>
          <h3 className="mt-1 text-[20px] font-bold leading-tight text-white">Physiotherapy at your doorstep</h3>
          <p className="mt-1.5 text-[13px] leading-snug text-white/80">
            A licensed physical therapist comes to your home. Pick your city, choose a time — we&apos;ll be there.
          </p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold transition-transform duration-200 group-hover:gap-3" style={{ color: 'var(--deep-teal)' }}>
            Schedule Now
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </a>
  )
}

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

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
