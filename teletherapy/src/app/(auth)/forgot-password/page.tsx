'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowLeft, CheckCircle2, Loader2, Video } from 'lucide-react'

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

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4 overflow-hidden" style={{
      background: [
        'radial-gradient(1200px 380px at 50% 35%, rgba(244, 236, 221, 0.22), transparent 60%)',
        'radial-gradient(820px 380px at 8% 0%, rgba(212, 145, 132, 0.55), transparent 60%)',
        'radial-gradient(1100px 440px at 100% 110%, rgba(123, 152, 138, 0.55), transparent 65%)',
        'linear-gradient(135deg, #cf9d88 0%, #c69849 38%, #8aa99d 72%, #4a8073 100%)',
      ].join(', '),
    }}>
      <div className="absolute top-[-260px] right-[-180px] w-[560px] h-[560px] rounded-full pointer-events-none"
           style={{ border: '1px solid rgba(244, 236, 221, 0.28)' }} />
      <div className="absolute top-[-200px] right-[-300px] w-[760px] h-[760px] rounded-full pointer-events-none"
           style={{ border: '1px solid rgba(244, 236, 221, 0.18)' }} />

      <div className="w-full max-w-[400px] animate-gate">
        <div className="flex justify-center mb-6">
          <div className="w-[60px] h-[60px] rounded-full flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, var(--narra), var(--moss))', boxShadow: '0 4px 20px rgba(15, 49, 56, 0.40)' }}>
            <Video className="w-7 h-7 text-white" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-10 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-green-500" />
              </div>
              <h2 className="text-lg font-bold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Check Your Email
              </h2>
              <p className="text-[13px] text-[var(--mid-gray)] mb-6">
                If an account exists with <strong>{email}</strong>, we sent a password reset link.
              </p>
              <Link href="/login" className="btn-primary w-full py-3 rounded-xl text-[15px]">
                <ArrowLeft size={16} />
                Back to Login
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h2 className="text-lg font-bold text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
                  Forgot Password
                </h2>
                <p className="text-[13px] text-[var(--mid-gray)] mt-1">
                  Enter your email and we&apos;ll send a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="input"
                    placeholder="your@email.com"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 text-[13px] px-4 py-3 rounded-xl border border-red-100">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className="btn-primary w-full py-3 rounded-xl text-[15px]">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                  Send Reset Link
                </button>
              </form>

              <div className="mt-5 text-center">
                <Link href="/login" className="text-[13px] text-[var(--teal)] hover:underline font-medium">
                  Back to Login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
