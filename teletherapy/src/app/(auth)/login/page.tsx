'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { LogIn, Eye, EyeOff, ShieldCheck } from 'lucide-react'

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
      // Use a full navigation when callbackUrl is on a different origin
      // (e.g. when this page is served via the marketing-site proxy at
      // sapphireclinicseast.org/stafflogin and we need to land back on
      // teletherapy.sapphireclinicseast.org). router.push only handles
      // same-origin paths reliably.
      const isAbsolute = /^https?:\/\//i.test(callbackUrl)
      const isCrossOrigin = isAbsolute && new URL(callbackUrl).origin !== window.location.origin
      if (isCrossOrigin) {
        window.location.href = callbackUrl
      } else {
        router.push(callbackUrl)
      }
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4 overflow-hidden" style={{
      background: [
        // warm cream halo through the centre
        'radial-gradient(1200px 380px at 50% 35%, rgba(244, 236, 221, 0.22), transparent 60%)',
        // coral lift in the top-left
        'radial-gradient(820px 380px at 8% 0%, rgba(212, 145, 132, 0.55), transparent 60%)',
        // sage settle in the bottom-right
        'radial-gradient(1100px 440px at 100% 110%, rgba(123, 152, 138, 0.55), transparent 65%)',
        // underlying Aura diagonal — coral → sand → sage
        'linear-gradient(135deg, #cf9d88 0%, #c69849 38%, #8aa99d 72%, #4a8073 100%)',
      ].join(', '),
    }}>
      {/* Sand-outlined orbital rings — echoing the Aura creative */}
      <div className="absolute top-[-260px] right-[-180px] w-[560px] h-[560px] rounded-full pointer-events-none"
           style={{ border: '1px solid rgba(244, 236, 221, 0.28)' }} />
      <div className="absolute top-[-200px] right-[-300px] w-[760px] h-[760px] rounded-full pointer-events-none"
           style={{ border: '1px solid rgba(244, 236, 221, 0.18)' }} />

      {/* Login card — templates.sapphireclinicseast.org gate pattern */}
      <div className="w-full max-w-[400px] animate-gate">
        {/* Card */}
        <div className="bg-white rounded-2xl p-10 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          {/* Brand family — Sapphire Clinics East · Aura Health Rehab · Verdana */}
          <div className="flex items-center justify-center gap-4 pb-6 mb-7 border-b border-[var(--light-gray)]">
            <img src="/brand/scei-mark.png" alt="Sapphire Clinics East" className="h-9 w-auto" />
            <span className="w-px h-7 bg-[var(--light-gray)]" />
            <img src="/brand/aura-mark.png" alt="Aura Health Rehab" className="h-8 w-auto" />
            <span className="w-px h-7 bg-[var(--light-gray)]" />
            <img src="/brand/verdana-mark.png" alt="Verdana Rehab Solutions" className="h-9 w-auto" />
          </div>
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
