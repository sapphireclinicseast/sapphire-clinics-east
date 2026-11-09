'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import {
  labelClass, labelStyle, inputClass, inputStyle, eyeButtonClass, errorClass,
  primaryButtonClass, primaryButtonStyle, h2Style, helperClass,
} from '../sign-in-look'

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
      <div className="flex flex-col items-center text-center gap-5 py-2">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: '#FEF2F2', border: '1.5px solid #FECACA' }}
        >
          <XCircle className="w-7 h-7" style={{ color: '#B42318' }} />
        </div>
        <div>
          <h2 className="mb-1" style={h2Style}>Invalid Link</h2>
          <p className={helperClass}>This reset link is invalid or has expired.</p>
        </div>
        <Link href="/forgot-password" className={primaryButtonClass} style={primaryButtonStyle}>
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
      <div className="flex flex-col items-center text-center gap-5 py-2">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: '#EEF5E8', border: '1.5px solid #CFE0BF' }}
        >
          <CheckCircle2 className="w-7 h-7" style={{ color: '#2F5A28' }} />
        </div>
        <div>
          <h2 className="mb-1" style={h2Style}>
            Password Reset!
          </h2>
          <p className={helperClass}>
            Your password has been updated. You can now sign in.
          </p>
        </div>
        <Link href="/login" className={primaryButtonClass} style={primaryButtonStyle}>
          Sign In
        </Link>
      </div>
    )
  }

  return (
    <>
      <h2 className="mb-1" style={h2Style}>
        Set New Password
      </h2>
      <p className={`mb-6 ${helperClass}`}>
        Enter your new password below.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass} style={labelStyle}>
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
              className={inputClass}
              style={{ ...inputStyle, paddingRight: 44 }}
              placeholder="Min 6 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={eyeButtonClass}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>
            Confirm Password
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className={inputClass}
            style={inputStyle}
            placeholder="Re-enter password"
          />
        </div>

        {error && (
          <p role="alert" className={errorClass}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={primaryButtonClass} style={primaryButtonStyle}>
          {loading && <Loader2 size={16} className="animate-spin" />}
          Reset Password
        </button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
