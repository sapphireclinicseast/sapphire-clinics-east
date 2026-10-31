'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getAuth, getUsers } from '@/lib/session'

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
              Thank you{studentName ? `, ${studentName}'s family` : ''}. PayMongo received your payment and emailed your receipt. It shows on the student profile as paid once our front desk records it — usually within the next business day.
            </p>
            <button className="btn-primary" onClick={() => router.push('/profile')}>Go to my profile →</button>
          </>
        )}
        {status === 'NOT_FOUND' && (
          <>
            <div className="inline-flex w-14 h-14 rounded-full bg-[color:var(--clay-tint)] items-center justify-center mb-4 text-[color:var(--clay)] text-2xl">!</div>
            <h1 className="text-[24px] leading-tight mb-2">No payment details</h1>
            <p className="text-sm text-[color:var(--mid-gray)] mb-7">
              This page opened without PayMongo&apos;s payment details. If you completed the checkout, your receipt was emailed to you — please send it to the front desk so they can record the payment.
            </p>
            <button className="btn-primary" onClick={() => router.push('/profile')}>Go to my profile →</button>
          </>
        )}
      </div>
    </div>
  )
}
