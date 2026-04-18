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
        if (r.status === 'paid') {
          router.push('/bookings')
          return
        }
        // Redirect to PayMongo hosted checkout
        window.location.replace(r.checkoutUrl)
      } catch (e) {
        setErr((e as Error).message)
      }
    })()
  }, [router, params])

  return (
    <div className="max-w-md mx-auto text-center py-10">
      {err ? (
        <>
          <h1 className="text-lg font-semibold text-rose-700 mb-2">Unable to open payment</h1>
          <p className="text-sm text-slate-600 mb-4">{err}</p>
          <a href="/bookings" className="text-sm underline">Back to my bookings</a>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold mb-2">Redirecting to PayMongo…</h1>
          <p className="text-sm text-slate-600">If you&apos;re not redirected, check your popup blocker.</p>
        </>
      )}
    </div>
  )
}
