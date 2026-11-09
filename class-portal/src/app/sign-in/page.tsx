'use client'

// Force dynamic — see notes on /classes; static prerender of this client
// page caches the wrong layout across deploys.
export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn, type AuthRole } from '@/lib/session'
import {
  Banner, Icon, type IconName,
  CONTROL, CONTROL_STYLE, LABEL, LABEL_STYLE, BTN_PRIMARY, PRIMARY_STYLE, FOCUS,
} from '@/components/hub/ui'

const ROLES: { value: AuthRole; title: string; sub: string; icon: IconName }[] = [
  { value: 'STUDENT',      title: 'Parent / Student', sub: 'Enrolled families', icon: 'student' },
  { value: 'TEACHER',      title: 'Teacher',          sub: 'Classroom staff',   icon: 'teacher' },
  { value: 'FRONTDESK',    title: 'Front desk',       sub: 'Clinic reception',  icon: 'users' },
  { value: 'BRANCH_ADMIN', title: 'Branch admin',     sub: 'Per-branch admin',  icon: 'building' },
  { value: 'ADMIN',        title: 'Main admin',       sub: 'SCEI HQ',           icon: 'shield' },
]

const POINTS = [
  'DepEd-accredited curriculum via Light Bearer Christian Academy',
  'Clinic-integrated SPED support for every learner',
  'Parents see attendance + grades the moment they\'re posted',
]

export default function SignInPage() {
  const router = useRouter()
  const [role, setRole] = useState<AuthRole | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  // Picking a role unlocks the fields; move the cursor straight into Email
  // so the next keystroke lands where it should.
  useEffect(() => {
    if (role) emailRef.current?.focus()
  }, [role])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!role) return
    setBusy(true); setErr(null)
    const f = new FormData(e.currentTarget)
    const email = String(f.get('email') ?? '').trim()
    const password = String(f.get('password') ?? '')
    try {
      const session = await signIn(role, email, password)
      router.push(
        session.role === 'ADMIN' || session.role === 'BRANCH_ADMIN' ? '/admin'
        : session.role === 'FRONTDESK' ? '/frontdesk'
        : '/profile',
      )
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  const chosen = role ? ROLES.find(r => r.value === role)! : null

  return (
    // One centred card in the same column as the header: brand panel and
    // form side by side at equal height on desktop, form only on phones.
    <div className="animate-fade-up">
      <div
        className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] rounded-2xl overflow-hidden"
        style={{ background: '#fff', border: '1px solid var(--light-gray)', boxShadow: '0 1px 2px rgba(30,56,50,0.04), 0 12px 32px -18px rgba(30,56,50,0.25)' }}
      >

        {/* ── LEFT: brand panel (lg and up) ─────────────────────── */}
        <aside
          className="hidden lg:flex flex-col justify-between gap-10 px-10 py-10 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, var(--deep-teal) 0%, var(--moss) 65%, var(--bright-teal) 100%)',
            color: '#fff',
          }}
        >
          <div aria-hidden className="absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-25"
            style={{ background: 'radial-gradient(circle, var(--bright-teal) 0%, transparent 70%)', filter: 'blur(40px)' }} />
          <div aria-hidden className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)', filter: 'blur(60px)' }} />

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.92)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/aura-academy-mark-192.png" alt="" className="w-7 h-7 object-contain" />
              </span>
              <div className="leading-tight">
                <div className="text-[14px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Aura Academy</div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-white/75" style={{ fontFamily: 'var(--font-display)' }}>
                  Class Portal
                </div>
              </div>
            </div>

            {/* A tagline, not the page heading: the form title is the h1 so
                phones (where this panel is hidden) still have one. */}
            <p
              className="mt-10 text-[38px] xl:text-[42px] font-bold leading-[1.06] tracking-tight"
              style={{ fontFamily: 'var(--font-display)', color: '#ffffff' }}
            >
              A small class<br />with big care.
            </p>
            <p className="mt-4 text-white/90 text-[15px] leading-relaxed max-w-md">
              Sign in to manage your child&apos;s enrollment, see today&apos;s lesson, or post the day&apos;s update for your class.
            </p>

            <ul className="mt-8 space-y-3 text-[13.5px] text-white/90 max-w-md">
              {POINTS.map(line => (
                <li key={line} className="flex items-start gap-2.5">
                  <Icon name="check" size={16} className="mt-0.5 text-white/80" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* NPC registration + copyright: a quiet trust signal. */}
          <div className="relative z-10 pt-6 border-t border-white/20 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/npc-seal.png"
              alt="National Privacy Commission — Registered DPO / DPS"
              className="w-11 h-auto shrink-0"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
            />
            <p className="text-white/75 text-[11px] leading-snug">
              Registered with the National Privacy Commission. Compliant with the Data Privacy Act of 2012.<br />
              © 2026 Sapphire Clinics East, Inc.
            </p>
          </div>
        </aside>

        {/* ── RIGHT: form panel ─────────────────────────────────── */}
        {/* A div, not a second <main>: the layout already has one. */}
        <div className="flex items-center justify-center px-5 py-8 sm:px-10 sm:py-12">
          <div className="w-full max-w-[420px]">

            {/* Phones: the brand panel is hidden, so show the mark here. */}
            <div className="flex items-center gap-3 mb-7 lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/aura-academy-mark-192.png" alt="Aura Academy" className="w-10 h-10 object-contain" />
              <div className="leading-tight">
                <div className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  Aura Academy
                </div>
                <div className="text-[10px] uppercase tracking-[0.14em]" style={{ fontFamily: 'var(--font-display)', color: 'var(--mid-gray)' }}>
                  for Learning · Class Portal
                </div>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>
                Welcome back
              </div>
              <h1 className="text-[24px] sm:text-[26px] font-bold leading-tight tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                Sign in to your account
              </h1>
              <p className="text-sm mt-1.5" style={{ color: 'var(--mid-gray)' }}>
                Choose who you are, then enter your email and password.
              </p>
            </div>

            {/* Role picker. Parent / Student first and full width (most
                sign-ins), then the four staff roles two by two. */}
            <div className={LABEL} style={LABEL_STYLE} id="signin-role-label">Signing in as</div>
            <div className="grid grid-cols-2 gap-2 mb-6" role="group" aria-labelledby="signin-role-label">
              {ROLES.map((r, i) => {
                const active = role === r.value
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => { setRole(r.value); setErr(null) }}
                    aria-pressed={active}
                    className={`relative flex items-center gap-2 sm:gap-2.5 text-left rounded-xl px-2.5 sm:px-3 py-2.5 transition-[border-color,background-color,box-shadow] ${active ? '' : 'hover:bg-[#FBF9F5]'} ${FOCUS} ${i === 0 ? 'col-span-2' : ''}`}
                    style={{
                      border: `1px solid ${active ? 'var(--teal)' : 'var(--light-gray)'}`,
                      background: active ? 'var(--moss-tint)' : '#fff',
                      boxShadow: active ? '0 0 0 3px rgba(84,125,114,0.14)' : 'none',
                    }}
                  >
                    <span
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        background: active ? 'var(--deep-teal)' : 'var(--pale-teal)',
                        color: active ? '#fff' : 'var(--deep-teal)',
                      }}
                    >
                      <Icon name={r.icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold leading-tight"
                        style={{ fontFamily: 'var(--font-display)', color: active ? 'var(--deep-teal)' : 'var(--charcoal)' }}>
                        {r.title}
                      </span>
                      <span className="block text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--mid-gray)' }}>
                        {r.sub}
                      </span>
                    </span>
                    {active && <Icon name="check" size={16} style={{ color: 'var(--teal)' }} />}
                  </button>
                )
              })}
            </div>

            {err && (
              <div className="mb-4 animate-fade-in">
                <Banner tone="error">{err}</Banner>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="signin-email" className={LABEL} style={LABEL_STYLE}>Email</label>
                <input
                  ref={emailRef}
                  id="signin-email"
                  required
                  name="email"
                  type="email"
                  className={`${CONTROL} w-full h-10`}
                  style={CONTROL_STYLE}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={!role}
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="signin-password" className={LABEL} style={LABEL_STYLE}>Password</label>
                  <Link href="/reset" className={`text-[12px] font-semibold mb-1 rounded hover:underline ${FOCUS}`} style={{ color: 'var(--teal)', fontFamily: 'var(--font-display)' }}>
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="signin-password"
                    required
                    name="password"
                    type={showPw ? 'text' : 'password'}
                    className={`${CONTROL} w-full h-10 pr-11`}
                    style={CONTROL_STYLE}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={!role}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    disabled={!role}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    aria-pressed={showPw}
                    className={`absolute right-1 top-1 w-8 h-8 rounded-md flex items-center justify-center transition-colors hover:bg-[color:var(--paper)] disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS}`}
                    style={{ color: showPw ? 'var(--teal)' : 'var(--mid-gray)' }}
                  >
                    <Icon name="eye" size={16} />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={!role || busy}
                className={`${BTN_PRIMARY} w-full h-10 mt-1`}
                style={PRIMARY_STYLE}
              >
                {busy
                  ? 'Signing in…'
                  : chosen
                  ? <>Continue as {chosen.title} <Icon name="chevronRight" size={16} /></>
                  : 'Choose who you are above'}
              </button>
            </form>

            <p className="mt-7 pt-5 text-center text-[13px]" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
              New to Aura Academy?{' '}
              <Link href="/" className={`font-semibold rounded hover:underline ${FOCUS}`} style={{ color: 'var(--teal)' }}>
                Enroll a student →
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
