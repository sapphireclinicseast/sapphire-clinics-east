'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'
import { scopeFor } from '@/lib/scoped-roles'

type Mode = 'login' | 'forgot-email' | 'forgot-code' | 'reset-success'

// ── SCEI staff sign-in look ──────────────────────────────────────────────────
// Shared by every staff-facing hub (Operations, HR, Accounting, Staff Portal):
// Aura gradient backdrop, white card with the three colour brand marks, hub
// name, uppercase labels, narra primary button. Hex values on purpose — each
// app's CSS variables differ, the sign-in screens must not.
const C = {
  narra: '#244952', moss: '#4A8073', ink: '#1A1A1A', muted: '#667085',
  line: '#D9E1CC', focusRing: 'rgba(74,128,115,0.18)',
  errBg: '#FEF2F2', errLine: '#FECACA', errText: '#B42318',
}
const inputStyle: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${C.line}`,
  color: C.ink,
  fontFamily: 'var(--font-body)',
}
const inputClass = 'w-full h-11 px-3.5 rounded-lg text-sm outline-none transition-[border-color,box-shadow]'

function onFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = C.moss
  e.currentTarget.style.boxShadow = `0 0 0 3px ${C.focusRing}`
}
function onBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = C.line
  e.currentTarget.style.boxShadow = 'none'
}
const errorStyle: React.CSSProperties = { background: C.errBg, border: `1px solid ${C.errLine}`, color: C.errText }
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  background: C.narra,
  opacity: disabled ? 0.55 : 1,
  color: '#fff',
  fontFamily: 'var(--font-display)',
  cursor: disabled ? 'not-allowed' : 'pointer',
})
const h2Style: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700, color: C.ink }

export default function LoginPage() {
  const router = useRouter()

  // ── Login state ─────────────────────────────────────────────────────────────
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  // ── Forgot password state ───────────────────────────────────────────────────
  const [mode, setMode]                 = useState<Mode>('login')
  const [fpEmail, setFpEmail]           = useState('')
  const [fpCode, setFpCode]             = useState('')
  const [newPassword, setNewPassword]   = useState('')
  const [confirmPw, setConfirmPw]       = useState('')
  const [showNewPw, setShowNewPw]       = useState(false)
  const [fpLoading, setFpLoading]       = useState(false)
  const [fpError, setFpError]           = useState('')
  const [fpSuccess, setFpSuccess]       = useState('')

  // ── Login submit ─────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) {
      setError('Invalid email or password.')
      setLoading(false)
    } else {
      // Investor accounts are gated out of /dashboard entirely (see
      // (dashboard)/layout.tsx's INVESTOR_ALLOWED_PREFIXES) — pushing them
      // there first meant every investor login triggered a client-side
      // soft-navigation into a chained server redirect
      // (/dashboard -> /patients/dashboard). That chain is what actually
      // produced the blank-until-refresh bug: Next's router got stuck
      // retrying the same RSC fetch for the redirect target for several
      // seconds (sometimes 20+) before finally resolving. Reading the role
      // here and routing straight to the real destination skips the hop
      // entirely, so there's no mid-navigation redirect for the router to
      // get stuck on.
      let dest = '/dashboard'
      try {
        const sessionRes = await fetch('/api/auth/session')
        const session = await sessionRes.json()
        // Scoped roles land on their own home; /dashboard is gated away from
        // them, and bouncing through it is what produced the blank-until-refresh.
        const scope = scopeFor(session?.user?.role)
        if (scope) dest = scope.home
      } catch {
        // fall through to /dashboard — the layout gate still redirects
        // investor sessions correctly, just via the slower chained path.
      }
      router.push(dest)
    }
  }

  // ── Step 1: Send reset code ───────────────────────────────────────────────
  async function handleForgotEmail(e: React.FormEvent) {
    e.preventDefault()
    setFpLoading(true)
    setFpError('')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail }),
      })
      if (!res.ok) throw new Error('Request failed')
      setMode('forgot-code')
    } catch {
      setFpError('Something went wrong. Please try again.')
    } finally {
      setFpLoading(false)
    }
  }

  // ── Step 2: Verify code + set new password ─────────────────────────────────
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setFpError('')
    if (newPassword !== confirmPw) {
      setFpError('Passwords do not match.')
      return
    }
    setFpLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail, code: fpCode, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Reset failed')
      setMode('reset-success')
    } catch (err) {
      setFpError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setFpLoading(false)
    }
  }

  function goToLogin() {
    setMode('login')
    setFpEmail('')
    setFpCode('')
    setNewPassword('')
    setConfirmPw('')
    setFpError('')
    setFpSuccess('')
  }

  // ── Shared card label ──────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    color: C.muted,
    display: 'block',
    fontFamily: 'var(--font-display)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 6,
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        // Aura backdrop — coral top-left → cream halo → soft sage bottom-right
        background: [
          'radial-gradient(1200px 380px at 50% 35%, rgba(244, 236, 221, 0.22), transparent 60%)',
          'radial-gradient(820px 380px at 8% 0%, rgba(212, 145, 132, 0.55), transparent 60%)',
          'radial-gradient(1100px 440px at 100% 110%, rgba(123, 152, 138, 0.55), transparent 65%)',
          'linear-gradient(135deg, #D49184 0%, #C9A28F 38%, #9CB1A2 72%, #7B988A 100%)',
        ].join(', '),
      }}
    >
      {/* Sand-outlined orbital rings — echoing the Aura creative */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: -260, right: -180, width: 560, height: 560,
          border: '1px solid rgba(244, 236, 221, 0.28)',
          borderRadius: '50%',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: -200, right: -300, width: 760, height: 760,
          border: '1px solid rgba(244, 236, 221, 0.18)',
          borderRadius: '50%',
        }}
      />

      {/* Main card */}
      <div className="relative z-10 w-full max-w-[420px] mx-4 my-10">
        <div
          className="rounded-2xl px-6 py-8 sm:px-9 sm:py-9 bg-white"
          style={{ boxShadow: '0 30px 70px -24px rgba(36,73,82,0.45), 0 2px 6px rgba(36,73,82,0.08)' }}
        >
          {/* Brand header — identical on every staff hub */}
          <div className="flex flex-col items-center text-center mb-7">
            <div className="flex items-center justify-center gap-4">
              <Image src="/brand/login-scei.png" alt="Sapphire Clinics East" width={58} height={50} style={{ objectFit: 'contain', height: 50, width: 'auto' }} priority />
              <span aria-hidden style={{ width: 1, height: 36, background: C.line }} />
              <Image src="/brand/login-aura.png" alt="Aura Health Rehab" width={41} height={50} style={{ objectFit: 'contain', height: 50, width: 'auto' }} priority />
              <span aria-hidden style={{ width: 1, height: 36, background: C.line }} />
              <Image src="/brand/login-verdana.png" alt="Verdana Rehab Solutions" width={48} height={50} style={{ objectFit: 'contain', height: 50, width: 'auto' }} priority />
            </div>
            <h1 className="mt-5" style={{ fontFamily: 'var(--font-display)', fontSize: '1.375rem', fontWeight: 700, color: C.narra, letterSpacing: '-0.01em' }}>
              Operations Hub
            </h1>
            <p className="mt-0.5 text-[13px]" style={{ color: C.muted }}>Sapphire Clinics East, Inc.</p>
          </div>

          {/* ── Sign in ────────────────────────────────────────────────── */}
          {mode === 'login' && (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@sapphireclinicseast.org"
                    className={inputClass}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className={inputClass}
                      style={{ ...inputStyle, paddingRight: 44 }}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                      style={{ color: C.muted }}
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <div className="flex justify-end mt-1.5">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot-email'); setFpEmail(email); setFpError('') }}
                      className="text-[12.5px] font-medium transition-opacity hover:opacity-80"
                      style={{ color: C.moss }}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                {error && (
                  <p role="alert" className="text-sm rounded-lg px-4 py-2.5" style={errorStyle}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90 mt-2"
                  style={primaryBtn(loading)}
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            </>
          )}

          {/* ── Forgot password — step 1: enter email ──────────────────── */}
          {mode === 'forgot-email' && (
            <>
              <h2 className="mb-1" style={h2Style}>
                Reset Password
              </h2>
              <p className="mb-6 text-sm leading-relaxed" style={{ color: C.muted }}>
                Enter your registered email address. We'll send you a 6-digit code.
              </p>

              <form onSubmit={handleForgotEmail} className="space-y-4">
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={fpEmail}
                    onChange={(e) => setFpEmail(e.target.value)}
                    required
                    placeholder="you@sapphireclinicseast.org"
                    className={inputClass}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                {fpError && (
                  <p role="alert" className="text-sm rounded-lg px-4 py-2.5" style={errorStyle}>
                    {fpError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={fpLoading}
                  className="w-full h-11 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90"
                  style={primaryBtn(fpLoading)}
                >
                  {fpLoading ? 'Sending…' : 'Send Reset Code'}
                </button>

                <button
                  type="button"
                  onClick={goToLogin}
                  className="w-full text-sm text-center transition-opacity hover:opacity-80"
                  style={{ color: C.moss }}
                >
                  Back to Sign In
                </button>
              </form>
            </>
          )}

          {/* ── Forgot password — step 2: enter code + new password ────── */}
          {mode === 'forgot-code' && (
            <>
              <h2 className="mb-1" style={h2Style}>
                Enter Reset Code
              </h2>
              <p className="mb-6 text-sm leading-relaxed" style={{ color: C.muted }}>
                A 6-digit code was sent to <span style={{ color: C.narra, fontWeight: 600 }}>{fpEmail}</span>. Enter it below along with your new password.
              </p>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label style={labelStyle}>6-Digit Code</label>
                  <input
                    type="text"
                    value={fpCode}
                    onChange={(e) => setFpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    placeholder="000000"
                    maxLength={6}
                    className={inputClass}
                    style={{ ...inputStyle, letterSpacing: '0.25em', fontSize: '1.1rem', textAlign: 'center' }}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                <div>
                  <label style={labelStyle}>New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      placeholder="At least 8 characters"
                      className={inputClass}
                      style={{ ...inputStyle, paddingRight: 44 }}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                      style={{ color: C.muted }}
                      tabIndex={-1}
                    >
                      {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Confirm New Password</label>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    required
                    placeholder="Re-enter new password"
                    className={inputClass}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                {fpError && (
                  <p role="alert" className="text-sm rounded-lg px-4 py-2.5" style={errorStyle}>
                    {fpError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={fpLoading || fpCode.length !== 6}
                  className="w-full h-11 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90"
                  style={primaryBtn(fpLoading || fpCode.length !== 6)}
                >
                  {fpLoading ? 'Resetting…' : 'Reset Password'}
                </button>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot-email'); setFpError('') }}
                    className="text-sm transition-opacity hover:opacity-80"
                    style={{ color: C.moss }}
                  >
                    Resend code
                  </button>
                  <button
                    type="button"
                    onClick={goToLogin}
                    className="text-sm transition-opacity hover:opacity-80"
                    style={{ color: C.moss }}
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            </>
          )}

          {/* ── Success ───────────────────────────────────────────────── */}
          {mode === 'reset-success' && (
            <div className="flex flex-col items-center text-center gap-5 py-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: '#EEF5E8', border: '1.5px solid #CFE0BF' }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2F5A28" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <h2 className="mb-1" style={h2Style}>
                  Password Reset
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
                  Your password has been updated successfully. You can now sign in with your new password.
                </p>
              </div>
              <button
                onClick={goToLogin}
                className="w-full h-11 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90"
                style={primaryBtn(false)}
              >
                Back to Sign In
              </button>
            </div>
          )}

        </div>

        <p className="text-center mt-6 text-xs" style={{ color: 'rgba(255,255,255,0.85)' }}>
          Internal access only · Sapphire Clinics East staff
        </p>
      </div>
    </div>
  )
}
