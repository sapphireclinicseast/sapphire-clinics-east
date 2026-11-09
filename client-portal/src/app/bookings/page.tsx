'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession, clearSession } from '@/lib/session'
import { InvalidTokenError, cancelBooking, listMyBookings, type Booking } from '@/lib/api'
import { branchLabel } from '@/lib/branch-label'
import {
  PAGE, PageHeader, GroupLabel, Banner, StatusPill, Tag, EmptyState, RowsSkeleton, Icon, DANGER,
  BTN_PRIMARY, BTN_SECONDARY, BTN_SM, BTN_DANGER_GHOST, PRIMARY_STYLE, SECONDARY_STYLE, CARD_STYLE, type Tone,
} from '@/components/hub/ui'

export default function MyBookingsPageWrapper() {
  return (
    <Suspense fallback={<div className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</div>}>
      <MyBookingsPage />
    </Suspense>
  )
}

// Booking status → kit StatusPill (dot + label, never colour alone).
const STATUS_PILL: Record<string, { tone: Tone; label: string }> = {
  PENDING: { tone: 'warn', label: 'Pending' },
  APPROVED: { tone: 'info', label: 'Approved' },
  PAID: { tone: 'success', label: 'Paid' },
  REJECTED: { tone: 'error', label: 'Rejected' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
  COMPLETED: { tone: 'neutral', label: 'Completed' },
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
    <div className={`${PAGE} animate-fade-up`}>
      <PageHeader
        eyebrow="My bookings"
        title={firstName ? <>Hi, {firstName}.</> : 'My bookings'}
        description="Manage your appointments and payments."
        actions={
          <>
            <a href="/book" className={BTN_PRIMARY} style={PRIMARY_STYLE}><Icon name="plus" size={14} /> Book appointment</a>
            <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={signOut}>Sign out</button>
          </>
        }
      />

      {just && (
        <div className="animate-slide-down">
          <Banner tone="success">
            <div className="font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Request submitted</div>
            <div className="text-xs mt-0.5">We&apos;ll email you once the front desk approves it, along with the payment link.</div>
          </Banner>
        </div>
      )}

      {err && <Banner tone="error">{err}</Banner>}
      {loading && (
        <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
          <RowsSkeleton rows={3} label="Loading your bookings" />
        </div>
      )}

      {!loading && bookings.length === 0 && (
        <div className="rounded-xl pb-8 text-center" style={CARD_STYLE}>
          <EmptyState icon="calendar" title="No bookings yet" hint="Your upcoming appointments will show up here." />
          <a href="/book" className={BTN_PRIMARY} style={PRIMARY_STYLE}>Book your first appointment</a>
        </div>
      )}

      {grouped.upcoming.length > 0 && (
        <section className="space-y-2.5">
          <GroupLabel hint={`${grouped.upcoming.length}`}>Upcoming</GroupLabel>
          <div className="space-y-3">
            {grouped.upcoming.map((b, i) => <BookingCard key={b.id} b={b} i={i} onChange={(nb) => setBookings(prev => prev.map(x => x.id === nb.id ? { ...x, status: nb.status } : x))} />)}
          </div>
        </section>
      )}

      {grouped.past.length > 0 && (
        <section className="space-y-2.5">
          <GroupLabel hint={`${grouped.past.length}`}>Past</GroupLabel>
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
  const branchName = branchLabel(b.branch)
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
  const pill = STATUS_PILL[b.status] ?? { tone: 'neutral' as Tone, label: b.status }
  return (
    <div className={`rounded-xl p-4 sm:p-5 min-w-0 animate-fade-up stagger-${Math.min(i+1,7)}`} style={CARD_STYLE}>
      <div className="flex items-start justify-between gap-x-4 gap-y-3 flex-wrap">
        <div className="flex-1 min-w-0 sm:min-w-[220px]">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
            {b.isTeletherapy && <Tag tone="brand">Teletherapy</Tag>}
          </div>
          <div className="mt-2 text-[15px] font-bold leading-snug" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {b.department.replace(/_/g, ' ')} · {branchName}
          </div>
          <div className="text-sm mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap" style={{ color: 'var(--mid-gray)' }}>
            <span className="inline-flex items-center gap-1.5"><Icon name="calendar" size={14} />{dateNice}</span>
            <span className="inline-flex items-center gap-1.5 tabular-nums"><Icon name="clock" size={14} />{b.startTime}–{b.endTime}</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="users" size={14} />with <strong style={{ color: 'var(--charcoal)' }}>{b.therapistInitials}</strong></span>
          </div>
          {b.downpayment != null && (
            <div className="text-xs mt-2" style={{ color: 'var(--mid-gray)' }}>
              Downpayment: <span className="font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>₱{b.downpayment.toLocaleString()}</span>
            </div>
          )}
          {b.rejectionReason && (
            <div className="text-xs mt-2 px-2.5 py-1.5 rounded-lg inline-block" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}>
              Reason: {b.rejectionReason}
            </div>
          )}
          {b.status === 'PAID' && b.isTeletherapy && b.meetLink && (
            <div className="mt-2.5">
              <a
                href={b.meetLink}
                target="_blank"
                rel="noreferrer"
                className={BTN_SM}
                style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}
              >
                <Icon name="external" size={12} /> Join teletherapy room
              </a>
            </div>
          )}
        </div>
        <div className="shrink-0 flex flex-col gap-1.5 items-end">
          {b.status === 'APPROVED' && b.payment?.checkoutUrl && (
            <a href={`/pay/${b.id}`} className={BTN_PRIMARY} style={PRIMARY_STYLE}><Icon name="wallet" size={14} /> Pay Now</a>
          )}
          {b.status === 'APPROVED' && b.payment?.amount && (
            <div className="text-[11px] tabular-nums" style={{ color: 'var(--mid-gray)' }}>₱{Number(b.payment.amount).toLocaleString()} due</div>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className={BTN_DANGER_GHOST}
              style={{ color: DANGER }}
            >
              {busy ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
