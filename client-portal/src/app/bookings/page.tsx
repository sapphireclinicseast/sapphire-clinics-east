'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession, clearSession } from '@/lib/session'
import { listMyBookings, type Booking } from '@/lib/api'

export default function MyBookingsPageWrapper() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <MyBookingsPage />
    </Suspense>
  )
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-sky-100 text-sky-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
  CANCELLED: 'bg-slate-200 text-slate-700',
  COMPLETED: 'bg-slate-100 text-slate-600',
}

function MyBookingsPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const just = sp.get('new') === '1'

  useEffect(() => {
    const s = getSession()
    if (!s) { router.push('/'); return }
    (async () => {
      try {
        const r = await listMyBookings(s.token)
        setBookings(r.bookings)
      } catch (e) {
        setErr((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  function signOut() { clearSession(); router.push('/') }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">My bookings</h1>
        <button className="text-xs text-slate-500 underline" onClick={signOut}>Sign out</button>
      </div>

      {just && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          Your appointment request has been submitted. We&apos;ll email you once the front desk approves it.
        </div>
      )}

      <div className="mb-4">
        <a href="/book" className="inline-block bg-[color:var(--scei-teal)] text-white rounded-lg px-4 py-2 text-sm font-medium">
          + Book another appointment
        </a>
      </div>

      {err && <div className="text-sm text-rose-600 mb-2">{err}</div>}
      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      <div className="space-y-2">
        {!loading && bookings.length === 0 && (
          <div className="text-sm text-slate-500 italic">No bookings yet.</div>
        )}
        {bookings.map((b) => (
          <div key={b.id} className="bg-white border rounded-lg p-3 text-sm flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_COLOR[b.status] ?? ''}`}>
                  {b.status}
                </span>
                {b.isTeletherapy && <span className="text-xs text-sky-700 bg-sky-50 border border-sky-100 px-1.5 py-0.5 rounded">tele</span>}
              </div>
              <div className="mt-1 font-medium">{b.department} · {b.branch}</div>
              <div className="text-xs text-slate-600">
                {b.date} · {b.startTime} – {b.endTime} · with {b.therapistInitials}
              </div>
              {b.downpayment != null && (
                <div className="text-xs text-slate-500 mt-0.5">Downpayment: ₱{b.downpayment.toLocaleString()}</div>
              )}
              {b.rejectionReason && (
                <div className="text-xs text-rose-600 mt-1">Reason: {b.rejectionReason}</div>
              )}
              {b.status === 'PAID' && b.isTeletherapy && b.meetLink && (
                <div className="text-xs mt-1">
                  Teletherapy link:&nbsp;
                  <a className="text-sky-700 underline break-all" href={b.meetLink} target="_blank" rel="noreferrer">{b.meetLink}</a>
                </div>
              )}
            </div>
            <div className="shrink-0">
              {b.status === 'APPROVED' && b.payment?.checkoutUrl && (
                <a
                  href={`/pay/${b.id}`}
                  className="inline-block bg-[color:var(--scei-orange)] text-white rounded-lg px-3 py-1.5 text-xs font-medium"
                >Pay Now</a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
