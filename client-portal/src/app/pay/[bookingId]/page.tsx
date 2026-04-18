'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getPaymentUrl } from '@/lib/api'

export default function PayPage() {
  const router = useRouter()
  const params = useParams<{ bookingId: string }>()
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s) { router.push('/'); return }
    if (!params?.bookingId) { router.push('/bookings'); return }

    (async () => {
      try {
        const r = await getPaymentUrl(params.bookingId, s.token)
        if (r.status === 'paid') { router.push('/bookings'); return }
        window.location.replace(r.checkoutUrl)
      } catch (e) { setErr((e as Error).message) }
    })()
  }, [router, params])

  return (
    <div className="max-w-md mx-auto text-center py-16 animate-fade-up">
      {err ? (
        <div className="card-static">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-[22px] text-rose-700">Unable to open payment</h1>
          <p className="text-sm text-[color:var(--mid-gray)] mt-1 mb-5">{err}</p>
          <a href="/bookings" className="btn-secondary">← Back to my bookings</a>
        </div>
      ) : (
        <div className="card-static">
          <div className="relative inline-flex w-16 h-16 rounded-full bg-gradient-to-br from-[color:var(--gold)] to-[color:var(--gold-light)] items-center justify-center text-white text-2xl mb-4 animate-pulse-ring">
            ₱
          </div>
          <h1 className="text-[22px] text-[color:var(--deep-teal)]">Redirecting to PayMongo…</h1>
          <p className="text-sm text-[color:var(--mid-gray)] mt-1">If you&apos;re not redirected, check your popup blocker and tap the button below.</p>
          <div className="mt-5">
            <a href="/bookings" className="btn-secondary">← Back to my bookings</a>
          </div>
        </div>
      )}
    </div>
  )
}
