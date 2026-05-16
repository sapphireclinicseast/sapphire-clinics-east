'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession, clearSession } from '@/lib/session'
import { InvalidTokenError, cancelBooking, listMyBookings, type Booking } from '@/lib/api'

export default function MyBookingsPageWrapper() {
  return (
    <Suspense fallback={<div className="text-sm text-[color:var(--mid-gray)]">Loading…</div>}>
      <MyBookingsPage />
    </Suspense>
  )
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'badge badge-pending',
  APPROVED: 'badge badge-approved',
  PAID: 'badge badge-paid',
  REJECTED: 'badge badge-rejected',
  CANCELLED: 'badge badge-cancelled',
  COMPLETED: 'badge badge-cancelled',
}

function MyBookingsPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [firstName, setFirstName] = useState<string>('')
  const just = sp.get('new') === '1'

  useEffect(() => {
    const s = getSession()
    if (!s) { router.push('/'); return }
    setFirstName(s.firstName)
    ;(async () => {
      try {
        const r = await listMyBookings(s.token)
        setBookings(r.bookings)
      } catch (e) {
        if (e instanceof InvalidTokenError) {
          clearSession()
          router.push('/?expired=1')
          return
        }
        setErr((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  function signOut() { clearSession(); router.push('/') }

  const grouped = bookings.reduce<{ upcoming: Booking[]; past: Booking[] }>(
    (acc, b) => {
      const d = new Date(b.date)
      const today = new Date(); today.setHours(0,0,0,0)
      ;(d >= today ? acc.upcoming : acc.past).push(b)
      return acc
    },
    { upcoming: [], past: [] },
  )

  return (
    <div className="animate-fade-up">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-[30px] text-[color:var(--deep-teal)] leading-tight">
            {firstName ? <>Hi, <span className="italic">{firstName}</span>.</> : 'My bookings'}
          </h1>
          <p className="text-sm text-[color:var(--mid-gray)] mt-1">Manage your appointments and payments.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/book" className="btn-primary">+ Book appointment</a>
          <button className="btn-secondary !py-2 !px-3 !text-[12.5px]" onClick={signOut}>Sign out</button>
        </div>
      </div>

      {just && (
        <div className="mb-5 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-white border border-emerald-200 text-sm text-emerald-900 flex items-start gap-3 animate-slide-down">
          <span className="text-lg leading-none">✓</span>
          <div>
            <div className="font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Request submitted</div>
            <div className="text-xs text-emerald-800/80 mt-0.5">We&apos;ll email you once the front desk approves it, along with the payment link.</div>
          </div>
        </div>
      )}

      {err && <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}
      {loading && <div className="text-sm text-[color:var(--mid-gray)]">Loading your bookings…</div>}

      {!loading && bookings.length === 0 && (
        <div className="card-static text-center py-12">
          <div className="text-5xl mb-3">📭</div>
          <h2 className="text-[22px] text-[color:var(--deep-teal)]">No bookings yet</h2>
          <p className="text-sm text-[color:var(--mid-gray)] mt-1 mb-5">Your upcoming appointments will show up here.</p>
          <a href="/book" className="btn-cta">Book your first appointment</a>
        </div>
      )}

      {grouped.upcoming.length > 0 && (
        <section className="mb-8">
          <h3 className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--mid-gray)] font-semibold mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            Upcoming
          </h3>
          <div className="space-y-3">
            {grouped.upcoming.map((b, i) => <BookingCard key={b.id} b={b} i={i} onChange={(nb) => setBookings(prev => prev.map(x => x.id === nb.id ? { ...x, status: nb.status } : x))} />)}
          </div>
        </section>
      )}

      {grouped.past.length > 0 && (
        <section>
          <h3 className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--mid-gray)] font-semibold mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            Past
          </h3>
          <div className="space-y-3 opacity-80">
            {grouped.past.map((b, i) => <BookingCard key={b.id} b={b} i={i} onChange={(nb) => setBookings(prev => prev.map(x => x.id === nb.id ? { ...x, status: nb.status } : x))} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function BookingCard({ b, i, onChange }: { b: Booking; i: number; onChange: (nb: { id: string; status: Booking['status'] }) => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const branchName = b.branch === 'SBEA' ? 'Sandbox East' : 'Sandbox Greenhills'
  const dateNice = new Date(`${b.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const canCancel = b.status === 'PENDING' || b.status === 'APPROVED'

  async function handleCancel() {
    if (!canCancel) return
    const label = b.status === 'PENDING' ? 'this pending request' : 'this approved booking'
    if (!confirm(`Cancel ${label} for ${b.department.replace(/_/g, ' ')} on ${dateNice} ${b.startTime}?`)) return
    const s = getSession()
    if (!s) { clearSession(); router.push('/?expired=1'); return }
    setBusy(true)
    try {
      const r = await cancelBooking(b.id, s.token)
      onChange(r.booking)
    } catch (e) {
      if (e instanceof InvalidTokenError) {
        clearSession()
        router.push('/?expired=1')
        return
      }
      alert('Could not cancel: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={`card animate-fade-up stagger-${Math.min(i+1,7)}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={STATUS_BADGE[b.status] ?? 'badge'}>{b.status}</span>
            {b.isTeletherapy && <span className="badge badge-teletherapy">Teletherapy</span>}
          </div>
          <div className="mt-2 text-[18px] text-[color:var(--deep-teal)] font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
            {b.department.replace(/_/g, ' ')} · {branchName}
          </div>
          <div className="text-sm text-[color:var(--mid-gray)] mt-0.5 flex items-center gap-2 flex-wrap">
            <span>🗓 {dateNice}</span>
            <span className="w-1 h-1 rounded-full bg-[color:var(--mid-gray)]"></span>
            <span>🕒 {b.startTime}–{b.endTime}</span>
            <span className="w-1 h-1 rounded-full bg-[color:var(--mid-gray)]"></span>
            <span>with <strong className="text-[color:var(--charcoal)]">{b.therapistInitials}</strong></span>
          </div>
          {b.downpayment != null && (
            <div className="text-xs text-[color:var(--mid-gray)] mt-2">
              Downpayment: <span className="text-[color:var(--charcoal)] font-semibold">₱{b.downpayment.toLocaleString()}</span>
            </div>
          )}
          {b.rejectionReason && (
            <div className="text-xs text-rose-700 mt-2 px-2 py-1 rounded bg-rose-50 inline-block">
              Reason: {b.rejectionReason}
            </div>
          )}
          {b.status === 'PAID' && b.isTeletherapy && b.meetLink && (
            <a
              href={b.meetLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs mt-2 px-3 py-1.5 rounded-lg bg-[color:var(--pale-teal)] text-[color:var(--deep-teal)] hover:bg-[color:var(--bright-teal)] hover:text-white transition-colors font-semibold"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              🎥 Join teletherapy room
            </a>
          )}
        </div>
        <div className="shrink-0 flex flex-col gap-1.5 items-end">
          {b.status === 'APPROVED' && b.payment?.checkoutUrl && (
            <a href={`/pay/${b.id}`} className="btn-cta !py-2 !px-4">Pay Now</a>
          )}
          {b.status === 'APPROVED' && b.payment?.amount && (
            <div className="text-[11px] text-[color:var(--mid-gray)]">₱{Number(b.payment.amount).toLocaleString()} due</div>
          )}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={busy}
              className="text-[12px] text-rose-700 hover:text-rose-800 hover:underline disabled:opacity-40"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {busy ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
