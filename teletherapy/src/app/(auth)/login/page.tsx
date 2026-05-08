'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { LogIn, Eye, EyeOff, Video, ShieldCheck } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
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
      router.push(callbackUrl)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{
      background: 'linear-gradient(135deg, #0F2520 0%, #1B3F38 40%, #26554B 70%, #1B3F38 100%)',
    }}>
      {/* Decorative blobs */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-[0.04] bg-white pointer-events-none" />
      <div className="absolute bottom-[-30%] left-[-15%] w-[600px] h-[600px] rounded-full opacity-[0.03] bg-white pointer-events-none" />

      {/* Login card — templates.sapphireclinicseast.org gate pattern */}
      <div className="w-full max-w-[400px] animate-gate">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-[60px] h-[60px] rounded-full flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, var(--teal), var(--bright-teal))', boxShadow: '0 4px 20px rgba(46, 94, 90, 0.4)' }}>
            <Video className="w-7 h-7 text-white" />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-10 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-[22px] font-bold text-[var(--charcoal)] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              SCEI Staff Portal
            </h1>
            <p className="text-[13px] text-[var(--mid-gray)] mt-1">
              Sapphire Clinics East, Inc.
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

            <div>
              <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="input pr-10"
                  placeholder="Enter your password"
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

            {error && (
              <div className={`bg-red-50 text-red-600 text-[13px] px-4 py-3 rounded-xl border border-red-100 flex items-center gap-2 ${error ? 'animate-shake' : ''}`}>
                <ShieldCheck size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <div className="text-right">
              <Link href="/forgot-password" className="text-[12px] text-[var(--teal)] hover:underline font-medium">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-[15px] rounded-xl mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={18} />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer text */}
        <p className="text-center text-white/40 text-[12px] mt-6">
          Contact your administrator if you need an account.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
