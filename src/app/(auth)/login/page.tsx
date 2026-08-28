'use client'

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'login' | 'forgot-email' | 'forgot-code' | 'reset-success'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [introComplete, setIntroComplete] = useState(false)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) {
      setError('Invalid email or password.')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

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

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'var(--near-black)' }}
    >
      {/* Ambient glow — warm orange */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 45%, rgba(237,104,35,0.08) 0%, rgba(46,94,90,0.06) 40%, transparent 70%)',
        }}
      />

      {/* Logo Intro Overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center z-20 transition-opacity duration-700"
        style={{
          opacity: introComplete ? 0 : 1,
          pointerEvents: introComplete ? 'none' : 'auto',
          background: 'var(--near-black)',
        }}
      >
        <div className="flex flex-col items-center gap-6">
          <Image src="/brand/logo-white-transparent.png" alt="Sapphire Clinics East" width={180} height={180} style={{ objectFit: 'contain' }} priority />
          <div
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--gold)',
              fontSize: '0.6rem',
              letterSpacing: '0.4em',
              textTransform: 'uppercase',
            }}
          >
            Marketing Hub
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
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <Image src="/brand/logo-white-transparent.png" alt="Sapphire Clinics East" width={140} height={140} style={{ objectFit: 'contain' }} className="mb-2" priority />
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'var(--gold)',
              marginTop: 4,
            }}
          >
            Marketing Hub
          </p>
        </div>

        {/* Glass card */}
        <div className="rounded-2xl overflow-hidden">
          {/* Orange accent bar */}
          <div style={{ height: '3px', background: 'linear-gradient(90deg, var(--gold), var(--gold-light))' }} />

          <div
            className="p-8"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(46,94,90,0.2)',
              borderTop: 'none',
              borderRadius: '0 0 16px 16px',
              backdropFilter: 'blur(16px)',
            }}
          >
            {/* ── Sign in ──────────────────────────────────────────── */}
            {mode === 'login' && (
              <>
                <h2 className="mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                  Sign in
                </h2>
                <p className="mb-6 text-sm" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}>
                  Internal access only — Sapphire Clinics East staff
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-white/50">Email</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@sapphireclinicseast.org"
                      error={!!error}
                      className="bg-white/[0.06] border-white/[0.12] text-white placeholder:text-white/30 focus-visible:ring-[var(--gold)] h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-white/50">Password</Label>
                    <div className="relative">
                      <Input
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                        error={!!error}
                        className="bg-white/[0.06] border-white/[0.12] text-white placeholder:text-white/30 focus-visible:ring-[var(--gold)] h-11 pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw(!showPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white/70 transition-colors"
                        tabIndex={-1}
                      >
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    <div className="flex justify-end mt-1">
                      <button
                        type="button"
                        onClick={() => { setMode('forgot-email'); setFpEmail(email); setFpError('') }}
                        className="text-xs transition-opacity hover:opacity-80"
                        style={{ color: 'var(--gold)' }}
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

                  <Button
                    type="submit"
                    loading={loading}
                    className="w-full h-11 text-sm mt-2"
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
                  >
                    Sign In
                  </Button>
                </form>
              </>
            )}

            {/* ── Forgot password — step 1 ──────────────────────── */}
            {mode === 'forgot-email' && (
              <>
                <h2 className="mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                  Reset Password
                </h2>
                <p className="mb-6 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Enter your registered email address. We&apos;ll send you a 6-digit code.
                </p>

                <form onSubmit={handleForgotEmail} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-white/50">Email</Label>
                    <Input
                      type="email"
                      value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                      required
                      placeholder="you@sapphireclinicseast.org"
                      className="bg-white/[0.06] border-white/[0.12] text-white placeholder:text-white/30 focus-visible:ring-[var(--gold)] h-11"
                    />
                  </div>

                  {fpError && (
                    <p className="text-sm rounded-lg px-4 py-2.5" style={{ background: 'rgba(220,38,38,0.15)', color: '#f87171' }}>
                      {fpError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    loading={fpLoading}
                    className="w-full h-11 text-sm"
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
                  >
                    Send Reset Code
                  </Button>

                  <button
                    type="button"
                    onClick={goToLogin}
                    className="w-full text-sm text-center transition-opacity hover:opacity-80 text-white/40"
                  >
                    Back to Sign In
                  </button>
                </form>
              </>
            )}

            {/* ── Forgot password — step 2 ──────────────────────── */}
            {mode === 'forgot-code' && (
              <>
                <h2 className="mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                  Enter Reset Code
                </h2>
                <p className="mb-6 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  A 6-digit code was sent to <span style={{ color: 'var(--gold)' }}>{fpEmail}</span>. Enter it below along with your new password.
                </p>

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-white/50">6-Digit Code</Label>
                    <Input
                      type="text"
                      value={fpCode}
                      onChange={(e) => setFpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      placeholder="000000"
                      maxLength={6}
                      className="bg-white/[0.06] border-white/[0.12] text-white placeholder:text-white/30 focus-visible:ring-[var(--gold)] h-11 text-center text-lg tracking-[0.25em]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-white/50">New Password</Label>
                    <div className="relative">
                      <Input
                        type={showNewPw ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        placeholder="At least 8 characters"
                        className="bg-white/[0.06] border-white/[0.12] text-white placeholder:text-white/30 focus-visible:ring-[var(--gold)] h-11 pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw(!showNewPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white/70 transition-colors"
                        tabIndex={-1}
                      >
                        {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-white/50">Confirm New Password</Label>
                    <Input
                      type={showNewPw ? 'text' : 'password'}
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      required
                      placeholder="Re-enter new password"
                      className="bg-white/[0.06] border-white/[0.12] text-white placeholder:text-white/30 focus-visible:ring-[var(--gold)] h-11"
                    />
                  </div>

                  {fpError && (
                    <p className="text-sm rounded-lg px-4 py-2.5" style={{ background: 'rgba(220,38,38,0.15)', color: '#f87171' }}>
                      {fpError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    loading={fpLoading}
                    disabled={fpCode.length !== 6}
                    className="w-full h-11 text-sm"
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
                  >
                    Reset Password
                  </Button>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot-email'); setFpError('') }}
                      className="text-sm transition-opacity hover:opacity-80 text-white/40"
                    >
                      Resend code
                    </button>
                    <button
                      type="button"
                      onClick={goToLogin}
                      className="text-sm transition-opacity hover:opacity-80 text-white/40"
                    >
                      Back to Sign In
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* ── Success ──────────────────────────────────────── */}
            {mode === 'reset-success' && (
              <div className="flex flex-col items-center text-center gap-5 py-4">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(237,104,35,0.15)', border: '1.5px solid rgba(237,104,35,0.4)' }}
                >
                  <CheckCircle2 size={26} style={{ color: 'var(--gold)' }} />
                </div>
                <div>
                  <h2 className="mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                    Password Reset
                  </h2>
                  <p className="text-sm text-white/45">
                    Your password has been updated successfully. You can now sign in with your new password.
                  </p>
                </div>
                <Button
                  onClick={goToLogin}
                  className="w-full h-11 text-sm"
                  style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
                >
                  Back to Sign In
                </Button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center mt-6 text-xs text-white/20">
          Sapphire Clinics East, Inc. · Internal Use Only
        </p>
      </div>
    </div>
  )
}
