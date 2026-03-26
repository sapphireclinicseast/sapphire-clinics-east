'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock, Eye, EyeOff, CheckCircle2, Loader2, Video, XCircle } from 'lucide-react'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  if (!token) {
    return (
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-[var(--charcoal)] mb-2">Invalid Link</h2>
        <p className="text-[13px] text-[var(--mid-gray)] mb-6">This reset link is invalid or has expired.</p>
        <Link href="/forgot-password" className="btn-primary w-full py-3 rounded-xl text-[15px]">
          Request New Link
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      if (res.ok) {
        setDone(true)
      } else {
        const data = await res.json()
        setError(data.error ?? 'Reset failed. The link may have expired.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-500" />
        </div>
        <h2 className="text-lg font-bold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          Password Reset!
        </h2>
        <p className="text-[13px] text-[var(--mid-gray)] mb-6">
          Your password has been updated. You can now sign in.
        </p>
        <Link href="/login" className="btn-primary w-full py-3 rounded-xl text-[15px]">
          Sign In
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="text-center mb-6">
        <h2 className="text-lg font-bold text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
          Set New Password
        </h2>
        <p className="text-[13px] text-[var(--mid-gray)] mt-1">
          Enter your new password below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            New Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoFocus
              className="input pr-10"
              placeholder="Min 6 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)] hover:text-[var(--charcoal)] transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            Confirm Password
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="input"
            placeholder="Re-enter password"
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-[13px] px-4 py-3 rounded-xl border border-red-100 animate-shake">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-3 rounded-xl text-[15px]">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
          Reset Password
        </button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{
      background: 'linear-gradient(135deg, #1A120B 0%, #C06A1F 40%, #E07C24 70%, #C06A1F 100%)',
    }}>
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-[0.04] bg-white pointer-events-none" />

      <div className="w-full max-w-[400px] animate-gate">
        <div className="flex justify-center mb-6">
          <div className="w-[60px] h-[60px] rounded-full flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, var(--teal), var(--bright-teal))', boxShadow: '0 4px 20px rgba(224, 124, 36, 0.4)' }}>
            <Video className="w-7 h-7 text-white" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-10 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          <Suspense>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
