'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock, Mail, Calculator } from 'lucide-react'

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
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, var(--deep-teal) 0%, var(--teal) 50%, var(--bright-teal) 100%)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8 shadow-2xl"
        style={{ background: 'white' }}
      >
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--pale-teal)' }}
          >
            <Calculator size={32} style={{ color: 'var(--teal)' }} />
          </div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
          >
            SAPPHIRE
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Accounting Hub
          </p>
        </div>

        {/* Login Form */}
        {forgotMode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            {forgotMessage && (
              <div className="p-3 rounded-lg text-sm" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                {forgotMessage}
              </div>
            )}
            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-50 text-red-600">
                {error}
              </div>
            )}

            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none transition-colors"
                style={{ borderColor: 'var(--light-gray)', fontFamily: 'var(--font-body)' }}
              />
            </div>

            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-10 py-3 rounded-xl border text-sm outline-none transition-colors"
                style={{ borderColor: 'var(--light-gray)', fontFamily: 'var(--font-body)' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--mid-gray)' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-50"
              style={{ background: 'var(--teal)', fontFamily: 'var(--font-display)' }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => { setForgotMode('forgot'); setError(''); setForgotMessage('') }}
              className="w-full text-sm py-2 transition-colors"
              style={{ color: 'var(--teal)' }}
            >
              Forgot password?
            </button>
          </form>
        )}

        {/* Forgot Password Form */}
        {forgotMode === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-4">
            <p className="text-sm text-center" style={{ color: 'var(--mid-gray)' }}>
              Enter your email to receive a reset code.
            </p>
            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>
            )}

            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--light-gray)' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: 'var(--teal)' }}
            >
              {loading ? 'Sending...' : 'Send Reset Code'}
            </button>

            <button
              type="button"
              onClick={() => { setForgotMode('login'); setError('') }}
              className="w-full text-sm py-2"
              style={{ color: 'var(--teal)' }}
            >
              Back to login
            </button>
          </form>
        )}

        {/* Reset Password Form */}
        {forgotMode === 'reset' && (
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-sm text-center" style={{ color: 'var(--mid-gray)' }}>
              Enter the code sent to your email and your new password.
            </p>
            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>
            )}

            <input
              type="text"
              placeholder="6-digit code"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none text-center tracking-widest"
              style={{ borderColor: 'var(--light-gray)' }}
              maxLength={6}
            />

            <input
              type="password"
              placeholder="New password (min 8 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--light-gray)' }}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: 'var(--teal)' }}
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>

            <button
              type="button"
              onClick={() => { setForgotMode('login'); setError('') }}
              className="w-full text-sm py-2"
              style={{ color: 'var(--teal)' }}
            >
              Back to login
            </button>
          </form>
        )}

        <p className="text-center text-xs mt-6" style={{ color: 'var(--mid-gray)' }}>
          Internal access only — SCEI Accounting Staff
        </p>
      </div>
    </div>
  )
}
