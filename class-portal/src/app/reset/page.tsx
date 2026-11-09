'use client'

import { Suspense, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { backendOrigin } from '@/lib/backend'
import {
  Banner, Icon, Skeleton, type IconName,
  CARD_STYLE, CONTROL, CONTROL_STYLE, LABEL, LABEL_STYLE, BTN_PRIMARY, PRIMARY_STYLE, BTN_SECONDARY, SECONDARY_STYLE, FOCUS,
} from '@/components/hub/ui'

interface ResetInfo {
  user: { email: string; role: string; firstName?: string | null; lastName?: string | null }
  expiresAt: string
}

const MIN_LEN = 6

/** Manila wall-clock, e.g. "Tue, Nov 10, 3:04 PM". */
function fmtExpiry(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/** The one card every state of this page sits in. */
function Shell({ icon, tone = 'brand', eyebrow, title, children }: {
  icon: IconName
  tone?: 'brand' | 'error' | 'success'
  eyebrow?: string
  title: string
  children: ReactNode
}) {
  const badge = tone === 'error'
    ? { bg: '#FEF2F2', fg: '#991B1B' }
    : tone === 'success'
    ? { bg: '#EEF5E8', fg: '#2F5A28' }
    : { bg: 'var(--pale-teal)', fg: 'var(--deep-teal)' }
  return (
    <div className="rounded-2xl px-6 py-7 sm:px-8 sm:py-8"
      style={{ ...CARD_STYLE, boxShadow: '0 1px 2px rgba(30,56,50,0.04), 0 12px 32px -18px rgba(30,56,50,0.25)' }}>
      <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: badge.bg, color: badge.fg }}>
        <Icon name={icon} size={20} />
      </span>
      {eyebrow && (
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>
          {eyebrow}
        </div>
      )}
      <h1 className="text-[22px] sm:text-2xl font-bold leading-tight tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
        {title}
      </h1>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function BackToSignIn({ primary = false }: { primary?: boolean }) {
  return (
    <Link href="/sign-in" className={`${primary ? BTN_PRIMARY : BTN_SECONDARY} w-full h-10`} style={primary ? PRIMARY_STYLE : SECONDARY_STYLE}>
      Back to sign in
    </Link>
  )
}

/** A live checklist line: icon + text, so it never rests on colour alone. */
function Rule({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5 text-[12px]" style={{ color: ok ? '#2F5A28' : 'var(--mid-gray)' }}>
      {ok
        ? <Icon name="check" size={14} />
        : <span aria-hidden className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ border: '1.5px solid var(--light-gray)' }} />}
      <span>{children}</span>
      <span className="sr-only">{ok ? '(done)' : '(not yet)'}</span>
    </li>
  )
}

function PasswordField({ id, label, value, onChange, show, onToggle }: {
  id: string; label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL} style={LABEL_STYLE}>{label}</label>
      <div className="relative">
        <input
          id={id}
          className={`${CONTROL} w-full h-10 pr-11`}
          style={CONTROL_STYLE}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          onChange={e => onChange(e.target.value)}
          minLength={MIN_LEN}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? 'Hide passwords' : 'Show passwords'}
          aria-pressed={show}
          className={`absolute right-1 top-1 w-8 h-8 rounded-md flex items-center justify-center transition-colors hover:bg-[color:var(--paper)] ${FOCUS}`}
          style={{ color: show ? 'var(--teal)' : 'var(--mid-gray)' }}
        >
          <Icon name="eye" size={16} />
        </button>
      </div>
    </div>
  )
}

/**
 * Public landing page for the email-issued password reset link. The token
 * is the only auth — no sign-in required. Flow:
 *   1. On mount: GET /api/public/class-portal/password-reset?token=... to
 *      validate the token and pull the target user's email for display.
 *   2. User picks a new password and submits.
 *   3. On success: redirect to /sign-in with a confirmation flash.
 *
 * Reached without a token (the "Forgot password?" link on /sign-in), it
 * explains how to get a link: resets are issued by an admin, not self-serve.
 */
function ResetForm() {
  const router = useRouter()
  const sp = useSearchParams()
  const token = sp.get('token') ?? ''
  const [info, setInfo] = useState<ResetInfo | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${backendOrigin()}/api/public/class-portal/password-reset?token=${encodeURIComponent(token)}`)
        const j = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) { setLoadErr(j?.error ?? `Could not validate the link (${res.status}).`); return }
        setInfo(j as ResetInfo)
      } catch (e) {
        if (!cancelled) setLoadErr((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitErr(null)
    if (pw.length < MIN_LEN) { setSubmitErr('Password must be at least 6 characters.'); return }
    if (pw !== pw2) { setSubmitErr('The two passwords do not match.'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`${backendOrigin()}/api/public/class-portal/password-reset/use`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, newPassword: pw }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setSubmitErr(j?.error ?? `Reset failed (${res.status}).`); return }
      setDone(true)
      window.setTimeout(() => router.replace('/sign-in?reset=ok'), 1800)
    } catch (e) {
      setSubmitErr((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // No token: someone clicked "Forgot password?" on the sign-in page.
  if (!token) {
    return (
      <Shell icon="shield" eyebrow="Forgot password" title="Get a reset link">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
          Password resets are sent by your school. Ask the main admin or your branch admin to email you a reset link.
        </p>
        <ol className="mt-4 space-y-2 text-sm" style={{ color: 'var(--charcoal)' }}>
          {[
            'Ask an admin to send you a reset link.',
            'Open the email and click the link. It works once and expires after 24 hours.',
            'Choose a new password, then sign in with it.',
          ].map((step, i) => (
            <li key={step} className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-px"
                style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6"><BackToSignIn /></div>
      </Shell>
    )
  }

  if (loadErr) {
    return (
      <Shell icon="alert" tone="error" title="This reset link can't be used">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--mid-gray)' }}>{loadErr}</p>
        <p className="text-sm leading-relaxed mt-2" style={{ color: 'var(--mid-gray)' }}>
          Links work once and expire after 24 hours. Ask your admin to send a new one.
        </p>
        <div className="mt-6"><BackToSignIn /></div>
      </Shell>
    )
  }

  if (!info) {
    return (
      <div className="rounded-2xl px-6 py-7 sm:px-8 sm:py-8" style={CARD_STYLE} aria-busy="true" aria-label="Checking your reset link">
        <Skeleton className="w-11 h-11 rounded-xl mb-4" />
        <Skeleton className="h-6 w-2/3 mb-3" />
        <Skeleton className="h-4 w-full mb-6" />
        <Skeleton className="h-10 w-full mb-3" />
        <Skeleton className="h-10 w-full mb-5" />
        <Skeleton className="h-10 w-full" />
        <span className="sr-only">Checking link…</span>
      </div>
    )
  }

  if (done) {
    return (
      <Shell icon="check" tone="success" title="Password updated">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--mid-gray)' }} role="status">
          Taking you to sign in…
        </p>
        <div className="mt-6"><BackToSignIn primary /></div>
      </Shell>
    )
  }

  const fullName = [info.user.firstName, info.user.lastName].filter(Boolean).join(' ')
  const longEnough = pw.length >= MIN_LEN
  const matches = pw2.length > 0 && pw === pw2
  return (
    <Shell icon="shield" eyebrow="Aura Academy" title="Set a new password">
      <div className="rounded-xl px-3.5 py-3 mt-3 mb-5 text-sm" style={{ background: 'var(--paper)', border: '1px solid var(--light-gray)' }}>
        <div className="font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{fullName || info.user.email}</div>
        {fullName && <div className="text-[12.5px] truncate" style={{ color: 'var(--mid-gray)' }}>{info.user.email}</div>}
        <div className="flex items-center gap-1.5 text-[12px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>
          <Icon name="clock" size={13} /> Link expires {fmtExpiry(info.expiresAt)}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField id="reset-pw" label="New password" value={pw} onChange={setPw} show={show} onToggle={() => setShow(v => !v)} />
        <PasswordField id="reset-pw2" label="Confirm new password" value={pw2} onChange={setPw2} show={show} onToggle={() => setShow(v => !v)} />

        <ul className="space-y-1" aria-label="Password checks">
          <Rule ok={longEnough}>At least {MIN_LEN} characters</Rule>
          <Rule ok={matches}>Both passwords match</Rule>
        </ul>

        {submitErr && <Banner tone="error">{submitErr}</Banner>}

        <button type="submit" className={`${BTN_PRIMARY} w-full h-10`} style={PRIMARY_STYLE} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </Shell>
  )
}

export default function ResetPage() {
  return (
    <div className="max-w-md mx-auto animate-fade-up">
      <Suspense fallback={
        <div className="rounded-2xl px-6 py-7" style={CARD_STYLE}>
          <p className="text-sm text-center py-6" style={{ color: 'var(--mid-gray)' }}>Loading…</p>
        </div>
      }>
        <ResetForm />
      </Suspense>
    </div>
  )
}
