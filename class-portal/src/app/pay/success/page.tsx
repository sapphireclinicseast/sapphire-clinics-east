'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getPayments, savePayment, getAuth, getUsers } from '@/lib/session'

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

  useEffect(() => {
    if (!paymentId) { setStatus('NOT_FOUND'); return }
    const pmt = getPayments().find(p => p.id === paymentId)
    if (!pmt) { setStatus('NOT_FOUND'); return }
    // We trust the PayMongo redirect — a real prod setup would verify the
    // session via the secret-key API or a webhook. For MVP, the redirect
    // landing here means PayMongo accepted the payment.
    savePayment({ ...pmt, status: 'PAID', paidAt: new Date().toISOString(), paymongoCheckoutId: pmt.paymongoCheckoutId ?? sessionId })
    setStatus('PAID')

    // Pull student name for the message.
    const auth = getAuth()
    if (auth?.userId) {
      const u = getUsers().find(x => x.id === auth.userId)
      if (u) setStudentName([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email)
    }
  }, [paymentId, sessionId])

  return (
    <div className="max-w-xl mx-auto animate-fade-up">
      <div className="card-static text-center">
        {status === 'CHECKING' && (
          <>
            <div className="inline-flex w-14 h-14 rounded-full bg-[color:var(--sun-tint)] items-center justify-center mb-4 text-[color:var(--clay)] text-2xl animate-pulse-ring">…</div>
            <h1 className="text-[24px] leading-tight mb-2">Confirming payment…</h1>
          </>
        )}
        {status === 'PAID' && (
          <>
            <div className="inline-flex w-14 h-14 rounded-full bg-[color:var(--sage-tint)] items-center justify-center mb-4 text-[color:var(--moss)] text-2xl">✓</div>
            <h1 className="text-[26px] leading-tight mb-2">Payment received</h1>
            <p className="text-sm text-[color:var(--mid-gray)] mb-7">
              Thank you{studentName ? `, ${studentName}'s family` : ''}. The proof of enrollment is now on the student profile.
            </p>
            <button className="btn-primary" onClick={() => router.push('/profile')}>Go to my profile →</button>
          </>
        )}
        {status === 'NOT_FOUND' && (
          <>
            <div className="inline-flex w-14 h-14 rounded-full bg-[color:var(--clay-tint)] items-center justify-center mb-4 text-[color:var(--clay)] text-2xl">!</div>
            <h1 className="text-[24px] leading-tight mb-2">Couldn&apos;t match this payment</h1>
            <p className="text-sm text-[color:var(--mid-gray)] mb-7">
              We didn&apos;t find a matching pending payment on this browser. If you completed the PayMongo checkout, your receipt was emailed to you. Please contact admin to record the payment.
            </p>
            <button className="btn-primary" onClick={() => router.push('/profile')}>Go to my profile →</button>
          </>
        )}
      </div>
    </div>
  )
}
