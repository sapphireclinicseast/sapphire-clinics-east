'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getAuth, getUsers } from '@/lib/session'
import {
  Icon, Skeleton, type IconName,
  BTN_PRIMARY, BTN_SECONDARY, BTN_SM, CARD_STYLE, PRIMARY_STYLE, SECONDARY_STYLE, SUBTLE_BG,
} from '@/components/hub/ui'

const CARD_SHADOW = '0 1px 2px rgba(30,56,50,0.04), 0 12px 32px -18px rgba(30,56,50,0.25)'

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const router = useRouter()
  const sp = useSearchParams()
  const paymentId = sp.get('payment_id') ?? ''
  const sessionId = sp.get('session_id') ?? ''
  const [status, setStatus] = useState<'CHECKING' | 'PAID' | 'NOT_FOUND'>('CHECKING')
  const [studentName, setStudentName] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // PayMongo landed the parent here, so the charge went through. Nothing is
    // marked paid on this device: Class Hub shows only payments the Accounting
    // Hub POS recorded (Hannah, 2026-10-31), so it reads PAID once the front
    // desk records this PayMongo payment there.
    setStatus(paymentId || sessionId ? 'PAID' : 'NOT_FOUND')
    const auth = getAuth()
    if (auth?.userId) {
      const u = getUsers().find(x => x.id === auth.userId)
      if (u) setStudentName([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email)
    }
  }, [paymentId, sessionId])

  // The id the front desk matches against in PayMongo.
  const reference = paymentId || sessionId

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(reference)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked — the reference is still selectable */ }
  }

  return (
    <div className="max-w-xl mx-auto animate-fade-up">
      <section className="rounded-2xl px-6 py-8 sm:px-8" style={{ ...CARD_STYLE, boxShadow: CARD_SHADOW }}>
        {status === 'CHECKING' && (
          <div className="text-center" role="status" aria-label="Confirming payment">
            <Skeleton className="w-14 h-14 rounded-2xl mx-auto mb-4" />
            <h1 className="text-[22px] sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Confirming payment…
            </h1>
          </div>
        )}

        {status === 'PAID' && (
          <>
            <div className="text-center">
              <Badge icon="check" bg="#EEF5E8" fg="#2F5A28" />
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
                Tuition payment
              </p>
              <h1 className="text-[22px] sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                Payment received
              </h1>
              <p className="text-sm mt-2 leading-relaxed max-w-md mx-auto" style={{ color: 'var(--mid-gray)' }}>
                Thank you{studentName ? `, ${studentName}'s family` : ''}. PayMongo received your payment and emailed your receipt.
              </p>
            </div>

            {reference && (
              <div className="mt-5 rounded-xl px-3.5 py-3 flex items-center gap-3 min-w-0" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: 'var(--mid-gray)' }}>
                    Payment reference
                  </div>
                  <div className="text-[13px] font-mono mt-0.5 break-all select-all" style={{ color: 'var(--charcoal)' }}>{reference}</div>
                </div>
                <button type="button" onClick={() => void copyReference()} className={`${BTN_SM} flex-shrink-0`}
                  style={{ ...SECONDARY_STYLE, color: copied ? '#2F5A28' : 'var(--deep-teal)' }}
                  aria-live="polite">
                  <Icon name={copied ? 'check' : 'file'} size={12} /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}

            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--mid-gray)' }}>
                What happens next
              </p>
              <ol className="space-y-2.5">
                <Step n={1} done title="Payment received" hint="PayMongo emailed your official receipt." />
                <Step n={2} title="Front desk records it" hint="Usually within the next business day." />
                <Step n={3} title="Shows as paid on your profile" hint="Once recorded, your balance updates in the Class Hub." />
              </ol>
            </div>

            <div className="flex flex-wrap justify-center gap-2 mt-7">
              <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={() => router.push('/pay')}>
                Back to payments
              </button>
              <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={() => router.push('/profile')}>
                Go to my profile <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </>
        )}

        {status === 'NOT_FOUND' && (
          <div className="text-center">
            <Badge icon="alert" bg="var(--clay-tint)" fg="#8A5A3C" />
            <h1 className="text-[22px] sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              No payment details
            </h1>
            <p className="text-sm mt-2 leading-relaxed max-w-md mx-auto" style={{ color: 'var(--mid-gray)' }}>
              This page opened without PayMongo&apos;s payment details. If you completed the checkout, your receipt was emailed to you — please send it to the front desk so they can record the payment.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-7">
              <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={() => router.push('/pay')}>
                Back to payments
              </button>
              <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={() => router.push('/profile')}>
                Go to my profile <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Badge({ icon, bg, fg }: { icon: IconName; bg: string; fg: string }) {
  return (
    <span className="inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-4" style={{ background: bg, color: fg }}>
      <Icon name={icon} size={28} />
    </span>
  )
}

/** One line of the "What happens next" list: a numbered (or ticked) dot + text. */
function Step({ n, title, hint, done = false }: { n: number; title: string; hint: string; done?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
        style={done
          ? { background: '#EEF5E8', color: '#2F5A28' }
          : { background: 'var(--pale-teal)', color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
        {done ? <Icon name="check" size={14} /> : n}
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: 'var(--charcoal)' }}>
          {title}{done && <span className="sr-only"> (done)</span>}
        </div>
        <div className="text-[12.5px] mt-0.5 leading-snug" style={{ color: 'var(--mid-gray)' }}>{hint}</div>
      </div>
    </li>
  )
}
