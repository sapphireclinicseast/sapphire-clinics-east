'use client'

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'

type Mode = 'login' | 'forgot-email' | 'forgot-code' | 'reset-success'

// ── Shared input style ────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(26,123,138,0.3)',
  color: '#fff',
  fontFamily: 'var(--font-body)',
}
const inputClass = 'w-full px-4 py-3 rounded-lg text-sm outline-none transition-all'

function onFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--teal)'
}
function onBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'rgba(26,123,138,0.3)'
}

export default function LoginPage() {
  const router = useRouter()

  // ── Login state ─────────────────────────────────────────────────────────────
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [introComplete, setIntroComplete] = useState(false)

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

  useEffect(() => {
    const timer = setTimeout(() => setIntroComplete(true), 2500)
    return () => clearTimeout(timer)
  }, [])

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
        if (session?.user?.role === 'INVESTOR') dest = '/patients/dashboard'
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
    color: 'rgba(255,255,255,0.5)',
    display: 'block',
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
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

      {/* Logo Intro Overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center z-20 transition-opacity duration-700"
        style={{
          opacity: introComplete ? 0 : 1,
          pointerEvents: introComplete ? 'none' : 'auto',
          background: 'var(--narra)',
        }}
      >
        <div className="flex flex-col items-center gap-6">
          <Image src="/brand/logo-white-transparent.png" alt="Sapphire Clinics East" width={180} height={180} style={{ objectFit: 'contain' }} priority />
          <div
            style={{
              fontFamily: 'var(--font-display)',
              color: '#ffffff',
              fontSize: '1.4rem',
              fontWeight: 700,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
            }}
          >
            Operations Hub
          </div>
        </div>
      </div>

      {/* Main card */}
      <div
        className="relative z-10 w-full max-w-md mx-4 transition-all duration-700"
        style={{
          opacity: introComplete ? 1 : 0,
          transform: introComplete ? 'translateY(0)' : 'translateY(20px)',
        }}
      >
        {/* Three-brand logo row */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center gap-5">
            <Image src="/brand/logo-white-transparent.png" alt="Sapphire Clinics East" width={76} height={76} style={{ objectFit: 'contain' }} priority />
            <div style={{ width: 1, height: 44, background: 'rgba(255,255,255,0.22)' }} />
            <Image src="/brand/aura-logo-cream.png" alt="Aura Health Rehab" width={76} height={76} style={{ objectFit: 'contain' }} priority />
            <div style={{ width: 1, height: 44, background: 'rgba(255,255,255,0.22)' }} />
            <div className="flex flex-col items-center gap-1">
              <Image src="/brand/verdana-logo-white.png" alt="Verdana Rehab Solutions" width={52} height={52} style={{ objectFit: 'contain' }} priority />
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.55rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>Verdana</span>
            </div>
          </div>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.2rem',
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#ffffff',
              marginTop: 16,
            }}
          >
            Operations Hub
          </p>
        </div>

        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(26,123,138,0.2)',
            backdropFilter: 'blur(12px)',
          }}
        >

          {/* ── Sign in ────────────────────────────────────────────────── */}
          {mode === 'login' && (
            <>
              <h2 className="mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                Sign in
              </h2>
              <p className="mb-6 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Internal access only — Sapphire Clinics East staff
              </p>

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
                      style={{ color: 'rgba(255,255,255,0.4)' }}
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <div className="flex justify-end mt-1.5">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot-email'); setFpEmail(email); setFpError('') }}
                      className="text-xs transition-opacity hover:opacity-80"
                      style={{ color: 'var(--teal)' }}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-sm rounded-lg px-4 py-2.5" style={{ background: 'rgba(220,38,38,0.15)', color: '#f87171' }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-lg font-semibold text-sm transition-all mt-2"
                  style={{
                    background: loading ? 'rgba(26,123,138,0.5)' : 'var(--teal)',
                    color: '#fff',
                    fontFamily: 'var(--font-display)',
                    letterSpacing: '0.05em',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            </>
          )}

          {/* ── Forgot password — step 1: enter email ──────────────────── */}
          {mode === 'forgot-email' && (
            <>
              <h2 className="mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                Reset Password
              </h2>
              <p className="mb-6 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
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
                  <p className="text-sm rounded-lg px-4 py-2.5" style={{ background: 'rgba(220,38,38,0.15)', color: '#f87171' }}>
                    {fpError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={fpLoading}
                  className="w-full py-3.5 rounded-lg font-semibold text-sm transition-all"
                  style={{
                    background: fpLoading ? 'rgba(26,123,138,0.5)' : 'var(--teal)',
                    color: '#fff',
                    fontFamily: 'var(--font-display)',
                    letterSpacing: '0.05em',
                    cursor: fpLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {fpLoading ? 'Sending…' : 'Send Reset Code'}
                </button>

                <button
                  type="button"
                  onClick={goToLogin}
                  className="w-full text-sm text-center transition-opacity hover:opacity-80"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  Back to Sign In
                </button>
              </form>
            </>
          )}

          {/* ── Forgot password — step 2: enter code + new password ────── */}
          {mode === 'forgot-code' && (
            <>
              <h2 className="mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                Enter Reset Code
              </h2>
              <p className="mb-6 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                A 6-digit code was sent to <span style={{ color: 'var(--teal)' }}>{fpEmail}</span>. Enter it below along with your new password.
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
                      style={{ color: 'rgba(255,255,255,0.4)' }}
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
                  <p className="text-sm rounded-lg px-4 py-2.5" style={{ background: 'rgba(220,38,38,0.15)', color: '#f87171' }}>
                    {fpError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={fpLoading || fpCode.length !== 6}
                  className="w-full py-3.5 rounded-lg font-semibold text-sm transition-all"
                  style={{
                    background: fpLoading || fpCode.length !== 6 ? 'rgba(26,123,138,0.5)' : 'var(--teal)',
                    color: '#fff',
                    fontFamily: 'var(--font-display)',
                    letterSpacing: '0.05em',
                    cursor: fpLoading || fpCode.length !== 6 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {fpLoading ? 'Resetting…' : 'Reset Password'}
                </button>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot-email'); setFpError('') }}
                    className="text-sm transition-opacity hover:opacity-80"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                  >
                    Resend code
                  </button>
                  <button
                    type="button"
                    onClick={goToLogin}
                    className="text-sm transition-opacity hover:opacity-80"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
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
                style={{ background: 'rgba(26,123,138,0.15)', border: '1.5px solid rgba(26,123,138,0.4)' }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <h2 className="mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                  Password Reset
                </h2>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Your password has been updated successfully. You can now sign in with your new password.
                </p>
              </div>
              <button
                onClick={goToLogin}
                className="w-full py-3.5 rounded-lg font-semibold text-sm transition-all"
                style={{
                  background: 'var(--teal)',
                  color: '#fff',
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '0.05em',
                }}
              >
                Back to Sign In
              </button>
            </div>
          )}

        </div>

        <p className="text-center mt-6 text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Sapphire Clinics East, Inc. · Internal Use Only
        </p>
      </div>
    </div>
  )
}
