'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getPaymentUrl } from '@/lib/api'
import { CARD_STYLE, DANGER, BTN_SECONDARY, SECONDARY_STYLE, Icon } from '@/components/hub/ui'

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
    <div className="max-w-md mx-auto text-center py-10 sm:py-16 animate-fade-up">
      {err ? (
        <div role="alert" className="rounded-xl px-6 py-8" style={{ background: '#fff', border: '1px solid #FECACA' }}>
          <span className="mx-auto mb-3 w-11 h-11 rounded-full flex items-center justify-center" style={{ background: '#FEF2F2', color: DANGER }}>
            <Icon name="alert" size={20} />
          </span>
          <h1 className="text-[18px] font-bold tracking-normal" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Unable to open payment</h1>
          <p className="text-sm mt-1 mb-5 break-words" style={{ color: 'var(--mid-gray)' }}>{err}</p>
          <a href="/bookings" className={BTN_SECONDARY} style={SECONDARY_STYLE}>← Back to my bookings</a>
        </div>
      ) : (
        <div role="status" className="rounded-xl px-6 py-8" style={CARD_STYLE}>
          <span className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold animate-pulse-ring"
            style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
            ₱
          </span>
          <h1 className="text-[18px] font-bold tracking-normal" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Redirecting to PayMongo…</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>If you&apos;re not redirected, check your popup blocker and tap the button below.</p>
          <div className="mt-5">
            <a href="/bookings" className={BTN_SECONDARY} style={SECONDARY_STYLE}>← Back to my bookings</a>
          </div>
        </div>
      )}
    </div>
  )
}
