'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'

// ── SCEI staff sign-in look ──────────────────────────────────────────────────
// Shared by every staff-facing hub (Operations, HR, Accounting, Staff Portal):
// Aura gradient backdrop, white card with the three colour brand marks, hub
// name, uppercase labels, narra primary button. Hex values on purpose — each
// app's CSS variables differ, the sign-in screens must not.
const C = {
  narra: '#244952', moss: '#4A8073', ink: '#1A1A1A', muted: '#667085',
  line: '#D9E1CC', focusRing: 'rgba(74,128,115,0.18)',
  errBg: '#FEF2F2', errLine: '#FECACA', errText: '#B42318',
  infoBg: '#F6F8EE',
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
const errorStyle: React.CSSProperties = { background: C.errBg, border: `1px solid ${C.errLine}`, color: C.errText }
const infoStyle: React.CSSProperties = { background: C.infoBg, border: `1px solid ${C.line}`, color: C.narra }
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  background: C.narra,
  opacity: disabled ? 0.55 : 1,
  color: '#fff',
  fontFamily: 'var(--font-display)',
  cursor: disabled ? 'not-allowed' : 'pointer',
})
const primaryBtnClass = 'w-full h-11 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90'
const linkBtnClass = 'w-full text-sm text-center transition-opacity hover:opacity-80'
const h2Style: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700, color: C.ink }
const logoStyle: React.CSSProperties = { height: 50, width: 'auto', objectFit: 'contain' }

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot password state
  const [forgotMode, setForgotMode] = useState<'login' | 'forgot' | 'reset'>('login')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [forgotMessage, setForgotMessage] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    const data = await res.json()
    setLoading(false)

    if (res.ok) {
      setForgotMessage(data.message)
      setForgotMode('reset')
    } else {
      setError(data.error || 'Something went wrong')
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: resetCode, newPassword }),
    })

    const data = await res.json()
    setLoading(false)

    if (res.ok) {
      setForgotMessage('Password reset successful! You can now log in.')
      setForgotMode('login')
      setResetCode('')
      setNewPassword('')
    } else {
      setError(data.error || 'Something went wrong')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        // Staff sign-in backdrop — light paper-green top-left → sage → moss bottom-right
        background: [
          'radial-gradient(1000px 520px at 12% 0%, rgba(255, 255, 255, 0.55), transparent 60%)',
          'radial-gradient(1200px 380px at 50% 35%, rgba(237, 243, 217, 0.30), transparent 60%)',
          'radial-gradient(1100px 520px at 100% 110%, rgba(36, 73, 82, 0.40), transparent 65%)',
          'linear-gradient(135deg, #E6EFD0 0%, #C5D8AC 32%, #8DB09B 68%, #4A8073 100%)',
        ].join(', '),
      }}
    >
      {/* Sand-outlined orbital rings — echoing the Aura creative */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: -260, right: -180, width: 560, height: 560,
          border: '1px solid rgba(255, 255, 255, 0.40)',
          borderRadius: '50%',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: -200, right: -300, width: 760, height: 760,
          border: '1px solid rgba(255, 255, 255, 0.26)',
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/login-scei.png" alt="Sapphire Clinics East Inc." style={logoStyle} />
              <span aria-hidden style={{ width: 1, height: 36, background: C.line }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/login-aura.png" alt="Aura Health Rehab" style={logoStyle} />
              <span aria-hidden style={{ width: 1, height: 36, background: C.line }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/login-verdana.png" alt="Verdana Rehab Solutions" style={logoStyle} />
            </div>
            <h1 className="mt-5" style={{ fontFamily: 'var(--font-display)', fontSize: '1.375rem', fontWeight: 700, color: C.narra, letterSpacing: '-0.01em' }}>
              Accounting Hub
            </h1>
            <p className="mt-0.5 text-[13px]" style={{ color: C.muted }}>Sapphire Clinics East, Inc.</p>
          </div>

          {/* ── Sign in ────────────────────────────────────────────────── */}
          {forgotMode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              {forgotMessage && (
                <div role="status" className="text-sm rounded-lg px-4 py-2.5" style={infoStyle}>
                  {forgotMessage}
                </div>
              )}

              <div>
                <label htmlFor="login-email" style={labelStyle}>Email</label>
                <input
                  id="login-email"
                  type="email"
                  placeholder="you@sapphireclinicseast.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={inputClass}
                  style={inputStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </div>

              <div>
                <label htmlFor="login-password" style={labelStyle}>Password</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={inputClass}
                    style={{ ...inputStyle, paddingRight: 44 }}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                    style={{ color: C.muted }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <div className="flex justify-end mt-1.5">
                  <button
                    type="button"
                    onClick={() => { setForgotMode('forgot'); setError(''); setForgotMessage('') }}
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
                className={`${primaryBtnClass} mt-2`}
                style={primaryBtn(loading)}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {/* ── Forgot password — enter email ──────────────────────────── */}
          {forgotMode === 'forgot' && (
            <>
              <h2 className="mb-1" style={h2Style}>
                Reset Password
              </h2>
              <p className="mb-6 text-sm leading-relaxed" style={{ color: C.muted }}>
                Enter your email to receive a reset code.
              </p>

              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label htmlFor="forgot-email" style={labelStyle}>Email</label>
                  <input
                    id="forgot-email"
                    type="email"
                    placeholder="you@sapphireclinicseast.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={inputClass}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm rounded-lg px-4 py-2.5" style={errorStyle}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={primaryBtnClass}
                  style={primaryBtn(loading)}
                >
                  {loading ? 'Sending...' : 'Send Reset Code'}
                </button>

                <button
                  type="button"
                  onClick={() => { setForgotMode('login'); setError('') }}
                  className={linkBtnClass}
                  style={{ color: C.moss }}
                >
                  Back to Sign In
                </button>
              </form>
            </>
          )}

          {/* ── Reset password — enter code + new password ─────────────── */}
          {forgotMode === 'reset' && (
            <>
              <h2 className="mb-1" style={h2Style}>
                Enter Reset Code
              </h2>
              <p className="mb-6 text-sm leading-relaxed" style={{ color: C.muted }}>
                Enter the code sent to your email and your new password.
              </p>

              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label htmlFor="reset-code" style={labelStyle}>6-Digit Code</label>
                  <input
                    id="reset-code"
                    type="text"
                    placeholder="000000"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    required
                    className={inputClass}
                    style={{ ...inputStyle, letterSpacing: '0.25em', fontSize: '1.1rem', textAlign: 'center' }}
                    maxLength={6}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                <div>
                  <label htmlFor="reset-password" style={labelStyle}>New Password</label>
                  <input
                    id="reset-password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className={inputClass}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm rounded-lg px-4 py-2.5" style={errorStyle}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={primaryBtnClass}
                  style={primaryBtn(loading)}
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>

                <button
                  type="button"
                  onClick={() => { setForgotMode('login'); setError('') }}
                  className={linkBtnClass}
                  style={{ color: C.moss }}
                >
                  Back to Sign In
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: 'rgba(23, 50, 58, 0.85)', fontWeight: 500 }}>
          Internal access only · Sapphire Clinics East staff
        </p>
      </div>
    </div>
  )
}
