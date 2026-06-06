'use client'

// Force dynamic — see notes on /classes; static prerender of this client
// page caches the wrong layout across deploys.
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, type AuthRole } from '@/lib/session'

const ROLES: { value: AuthRole; title: string; sub: string }[] = [
  { value: 'STUDENT',      title: 'Parent / Student', sub: 'Enrolled families' },
  { value: 'TEACHER',      title: 'Teacher',          sub: 'Classroom staff' },
  { value: 'FRONTDESK',    title: 'Front desk',       sub: 'Clinic reception' },
  { value: 'BRANCH_ADMIN', title: 'Branch admin',     sub: 'Per-branch admin' },
  { value: 'ADMIN',        title: 'Main admin',       sub: 'SCEI HQ' },
]

export default function SignInPage() {
  const router = useRouter()
  const [role, setRole] = useState<AuthRole | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    // Viewport-escape so the brand panel can extend to the page edges
    // even though the global <main> caps everything at max-w-5xl. Same
    // pattern used by /admission and /classes for full-bleed layouts.
    <div
      className="animate-fade-up"
      style={{
        width: '100vw',
        maxWidth: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
      }}
    >
      <div className="grid lg:grid-cols-[1.05fr_1fr] min-h-[calc(100vh-160px)]">

        {/* ── LEFT: brand panel ─────────────────────────────────── */}
        {/* Hidden on small screens — mobile users go straight to the
            form. The gradient + decorative orbs evoke the same look as
            the public /enroll page so the portal feels consistent. */}
        <aside
          className="hidden lg:flex flex-col justify-between px-12 py-14 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, var(--deep-teal) 0%, var(--moss) 65%, var(--bright-teal) 100%)',
            color: '#fff',
          }}
        >
          {/* Decorative blurred orbs in the corners — subtle, doesn't
              compete with the typography. */}
          <div
            aria-hidden
            className="absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-25"
            style={{ background: 'radial-gradient(circle, var(--bright-teal) 0%, transparent 70%)', filter: 'blur(40px)' }}
          />
          <div
            aria-hidden
            className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)', filter: 'blur(60px)' }}
          />

          <div className="relative z-10">
            {/* Small kicker badge above the headline. The big "Aura
                Academy" lockup that used to live here was redundant
                with the header lockup at the top of the page — we drop
                it and let the headline carry the brand. */}
            <div
              className="inline-block text-[10.5px] uppercase tracking-[0.16em] font-semibold px-3 py-1 rounded-full"
              style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.14)', color: '#fff' }}
            >
              Aura Academy · Class Portal
            </div>

            <h1
              className="mt-8 text-[44px] xl:text-[52px] leading-[1.05]"
              style={{
                fontFamily: 'var(--font-display)',
                // Force white explicitly — the global stylesheet sets
                // h1 to var(--deep-teal), which is exactly the panel's
                // background colour and would make the headline
                // invisible against the gradient.
                color: '#ffffff',
              }}
            >
              A small class<br/>with big care.
            </h1>
            <p className="mt-5 text-white/90 text-[15px] leading-relaxed max-w-md">
              Welcome back. Sign in to manage your child&apos;s enrollment, see today&apos;s lesson, or post the day&apos;s update for your class.
            </p>

            <ul className="mt-10 space-y-3 text-[13.5px] text-white/85 max-w-md">
              {[
                'DepEd-accredited curriculum via Light Bearer Christian Academy',
                'Clinic-integrated SPED support for every learner',
                'Parents see attendance + grades the moment they\'re posted',
              ].map((line, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="mt-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: 'rgba(255,255,255,0.18)' }}
                  >✓</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Bottom: NPC compliance badge + copyright. Trust signal. */}
          <div className="relative z-10 mt-12 pt-8 border-t border-white/20 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/npc-seal.png"
              alt="National Privacy Commission — Registered DPO / DPS"
              className="w-14 h-auto shrink-0"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
            />
            <p className="text-white/75 text-[11px] leading-snug">
              Registered with the National Privacy Commission. Compliant with the Data Privacy Act of 2012.<br/>
              © 2026 Sapphire Clinics East, Inc.
            </p>
          </div>
        </aside>

        {/* ── RIGHT: form panel ─────────────────────────────────── */}
        <main className="flex items-center justify-center px-5 py-10 sm:px-8 sm:py-14 bg-[color:var(--paper)]">
          <div className="w-full max-w-md">

            {/* Mobile-only header (the brand panel is hidden on < lg). */}
            <div className="flex items-center gap-3 mb-8 lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/aura-academy-mark-192.png" alt="Aura Academy" className="w-10 h-10 object-contain" />
              <div className="leading-tight">
                <div className="text-[15px] font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
                  Aura Academy
                </div>
                <div className="text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
                  for Learning · Class Portal
                </div>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                Welcome back
              </div>
              <h2 className="text-[28px] leading-tight text-[color:var(--deep-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
                Sign in to your account
              </h2>
              <p className="text-[13.5px] text-[color:var(--mid-gray)] mt-1.5">
                Choose your role to continue.
              </p>
            </div>

            {/* Role selector — compact pill grid. 3-up on sm+, 2-up on
                xs. Subdued until clicked; active pill switches to teal.
                Same affordance as the previous version, refined visually. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
              {ROLES.map(r => {
                const active = role === r.value
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => { setRole(r.value); setErr(null) }}
                    className="text-left rounded-xl border px-3 py-2.5 transition-all"
                    style={{
                      borderColor: active ? 'var(--moss)' : 'var(--paper-3)',
                      background: active ? 'var(--paper-2)' : 'var(--paper)',
                      boxShadow: active ? '0 1px 0 var(--moss) inset, 0 4px 12px -6px rgba(58, 110, 105, 0.35)' : 'none',
                    }}
                    aria-pressed={active}
                  >
                    <div
                      className="text-[12.5px] font-semibold leading-tight"
                      style={{
                        color: active ? 'var(--moss)' : 'var(--narra)',
                        fontFamily: 'var(--font-display)',
                      }}
                    >
                      {r.title}
                    </div>
                    <div className="text-[10.5px] text-[color:var(--mid-gray)] mt-0.5 leading-snug">
                      {r.sub}
                    </div>
                  </button>
                )
              })}
            </div>

            {err && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 animate-fade-in">
                {err}
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="label">Email</span>
                <input
                  required
                  name="email"
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={!role}
                />
              </label>
              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="label">Password</span>
                  <a href="/reset" className="text-[11px] text-[color:var(--teal)] font-semibold hover:underline" style={{ fontFamily: 'var(--font-display)' }}>
                    Forgot?
                  </a>
                </div>
                <input
                  required
                  name="password"
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={!role}
                />
              </label>
              <button
                type="submit"
                disabled={!role || busy}
                className="btn-primary w-full mt-2"
              >
                {busy
                  ? 'Signing in…'
                  : role
                  ? `Continue as ${ROLES.find(r => r.value === role)!.title}`
                  : 'Choose a role above'}
              </button>
            </form>

            <div className="mt-7 pt-5 border-t text-center" style={{ borderColor: 'var(--paper-3)' }}>
              <p className="text-[12px] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
                New to Aura Academy?{' '}
                <a href="/" className="text-[color:var(--teal)] font-semibold hover:underline">
                  Enroll a student →
                </a>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
