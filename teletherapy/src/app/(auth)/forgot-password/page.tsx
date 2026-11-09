'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2 } from 'lucide-react'
import {
  C, labelClass, labelStyle, inputClass, inputStyle, errorClass,
  primaryButtonClass, primaryButtonStyle, linkClass, h2Style, helperClass,
} from '../sign-in-look'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        setSent(true)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return sent ? (
    <div className="flex flex-col items-center text-center gap-5 py-2">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: '#EEF5E8', border: '1.5px solid #CFE0BF' }}
      >
        <CheckCircle2 className="w-7 h-7" style={{ color: '#2F5A28' }} />
      </div>
      <div>
        <h2 className="mb-1" style={h2Style}>
          Check Your Email
        </h2>
        <p className={helperClass}>
          If an account exists with <span style={{ color: C.narra, fontWeight: 600 }}>{email}</span>, we sent a password reset link.
        </p>
      </div>
      <Link href="/login" className={primaryButtonClass} style={primaryButtonStyle}>
        Back to Sign In
      </Link>
    </div>
  ) : (
    <>
      <h2 className="mb-1" style={h2Style}>
        Forgot Password
      </h2>
      <p className={`mb-6 ${helperClass}`}>
        Enter your email and we&apos;ll send a reset link.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass} style={labelStyle}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className={inputClass}
            style={inputStyle}
            placeholder="your@email.com"
          />
        </div>

        {error && (
          <p role="alert" className={errorClass}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={primaryButtonClass} style={primaryButtonStyle}>
          {loading && <Loader2 size={16} className="animate-spin" />}
          Send Reset Link
        </button>
      </form>

      <div className="mt-4 text-center">
        <Link href="/login" className={linkClass}>
          Back to Sign In
        </Link>
      </div>
    </>
  )
}
