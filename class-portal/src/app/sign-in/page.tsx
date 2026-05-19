'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, type AuthRole } from '@/lib/session'

const ROLES: { value: AuthRole; title: string; sub: string }[] = [
  { value: 'TEACHER', title: 'As Teacher', sub: 'School staff sign-in' },
  { value: 'STUDENT', title: 'As Student', sub: 'Parent / Guardian sign-in' },
  { value: 'ADMIN',   title: 'As Admin',   sub: 'SCEI administrators' },
]

export default function SignInPage() {
  const router = useRouter()
  const [role, setRole] = useState<AuthRole | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!role) return
    setBusy(true); setErr(null)
    const f = new FormData(e.currentTarget)
    const email = String(f.get('email') ?? '').trim()
    const password = String(f.get('password') ?? '')
    try {
      const session = signIn(role, email, password)
      router.push(session.role === 'ADMIN' ? '/admin' : '/profile')
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto animate-fade-up">
      <div className="card-static">
        <h1 className="text-[26px] leading-tight text-[color:var(--deep-teal)] mb-1">Sign in</h1>
        <p className="text-sm text-[color:var(--mid-gray)] mb-6">Choose your role to continue.</p>

        <div className="grid grid-cols-3 gap-2.5 mb-6">
          {ROLES.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => { setRole(r.value); setErr(null) }}
              className={`level-tile ${role === r.value ? 'level-tile-active' : ''}`}
            >
              <span className="level-tile-title">{r.title}</span>
              <span className="level-tile-sub">{r.sub}</span>
            </button>
          ))}
        </div>

        {err && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 animate-fade-in">
            {err}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="label">Email</span>
            <input required name="email" type="email" className="input" placeholder="you@example.com" disabled={!role} />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input required name="password" type="password" className="input" autoComplete="current-password" disabled={!role} />
          </label>
          <button type="submit" disabled={!role || busy} className="btn-primary w-full mt-2">
            {busy ? 'Signing in…' : role ? `Sign in ${ROLES.find(r => r.value === role)!.title.toLowerCase()}` : 'Choose a role above'}
          </button>
        </form>

        <p className="text-[11.5px] text-[color:var(--mid-gray)] text-center mt-5" style={{ fontFamily: 'var(--font-display)' }}>
          Don&apos;t have an account yet?{' '}
          <a href="/" className="text-[color:var(--teal)] font-semibold hover:underline">Enroll a new student →</a>
        </p>
      </div>
    </div>
  )
}
