'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import {
  labelClass, labelStyle, inputClass, inputStyle, eyeButtonClass,
  errorClass, primaryButtonClass, primaryButtonStyle,
} from '../sign-in-look'

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

      <div>
        <label className={labelClass} style={labelStyle}>
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={inputClass}
            style={{ ...inputStyle, paddingRight: 44 }}
            placeholder="Enter your password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className={eyeButtonClass}
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <div className="flex justify-end mt-1.5">
          <Link href="/forgot-password" className="text-[12.5px] font-medium text-[#4A8073] transition-opacity hover:opacity-80">
            Forgot password?
          </Link>
        </div>
      </div>

      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className={`${primaryButtonClass} mt-2`}
        style={primaryButtonStyle}
      >
        {loading ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          'Sign In'
        )}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
