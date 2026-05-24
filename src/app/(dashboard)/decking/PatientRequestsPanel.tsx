'use client'

// Front-desk panel for patient-portal bookings.
//
// Post-2026-05-18 self-service flow: PENDING (= awaiting payment) and the
// legacy APPROVED stage are no longer surfaced here. Only confirmed (PAID)
// bookings show up, each with two follow-up actions:
//   - Add to Staff Deck  → materializes a DeckingSlot for the booking's
//                           recurring weekly cell.
//   - Recorded DP in Accounting Hub → ledger marker so the row stops
//                           nagging once the front-desk has logged the
//                           downpayment in accounting-hub.

import { useCallback, useEffect, useMemo, useState } from 'react'

interface BookingRow {
  id: string
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'
  branch: string
  department: string
  date: string
  startTime: string
  endTime: string
  isTeletherapy: boolean
  meetLink: string | null
  notes: string | null
  rejectionReason: string | null
  downpayment: string | number | null
  addedToDeck: boolean
  accountingRecorded: boolean
  paidAt: string | null
  patient: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null }
  staff: { id: string; firstName: string; lastName: string; department: string; branch: string }
  payment: { status: string; amount: number | string; paidAt: string | null } | null
}

interface Props {
  branch: 'SBEA' | 'SBGH'
}

export default function PatientRequestsPanel({ branch }: Props) {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const r = await fetch(`/api/decking/bookings?branch=${branch}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load')
      setBookings(data.bookings as BookingRow[])
    } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }, [branch])

  useEffect(() => { load() }, [load])

  // Show paid bookings first, then any COMPLETED archive.
  // 2026-05-24: render PENDING (awaiting payment) + PAID + COMPLETED so the
  // front desk can spot abandoned payment flows. Dead-end states
  // (REJECTED, CANCELLED) stay hidden.
  const active = useMemo(
    () => bookings.filter((b) => b.status === 'PENDING' || b.status === 'PAID' || b.status === 'COMPLETED'),
    [bookings],
  )
  const pendingCount = useMemo(() => active.filter((b) => b.status === 'PENDING').length, [active])
  const paidCount    = useMemo(() => active.filter((b) => b.status === 'PAID').length, [active])

  async function addToDeck(b: BookingRow) {
    const who = `${b.patient.firstName} ${b.patient.lastName}`.trim()
    const dateNice = new Date(b.date).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
    if (!confirm(`Add ${who} to ${b.staff.firstName?.[0]}${b.staff.lastName?.[0]}'s deck on ${dateNice} ${b.startTime}?`)) return
    setBusy(b.id)
    try {
      const r = await fetch(`/api/decking/bookings/${b.id}/add-to-deck`, { method: 'POST' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Add to deck failed')
      await load()
    } catch (e) { alert('Error: ' + (e as Error).message) } finally { setBusy(null) }
  }

  async function markRecorded(b: BookingRow) {
    setBusy(b.id)
    try {
      const r = await fetch(`/api/decking/bookings/${b.id}/recorded-in-accounting`, { method: 'POST' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Recording failed')
      await load()
    } catch (e) { alert('Error: ' + (e as Error).message) } finally { setBusy(null) }
  }

  async function del(b: BookingRow) {
    const who = `${b.patient.firstName ?? ''} ${b.patient.lastName ?? ''}`.trim() || 'this request'
    if (!confirm(`Delete ${who}'s booking (${b.date} ${b.startTime})? This cannot be undone.`)) return
    setBusy(b.id)
    try {
      const r = await fetch(`/api/decking/bookings/${b.id}`, { method: 'DELETE' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Delete failed')
      await load()
    } catch (e) { alert('Error: ' + (e as Error).message) } finally { setBusy(null) }
  }

  const rows = (
    <div className="space-y-2">
      {active.length === 0 && (
        <div className="text-sm text-gray-500 italic px-2 py-1">No patient bookings yet.</div>
      )}
      {active.map((b) => {
        const who = `${b.patient.firstName ?? ''} ${b.patient.lastName ?? ''}`.trim()
        const initials = `${b.staff.firstName?.[0] ?? '?'}${b.staff.lastName?.[0] ?? '?'}`.toUpperCase()
        const amount = b.payment?.amount ? `₱${Number(b.payment.amount).toLocaleString()}` : null
        return (
          <div key={b.id} className="bg-white border rounded-lg px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <div className="font-medium truncate">
                  {who || <span className="text-rose-600">⚠ No name</span>}
                  <span className="text-gray-500 font-normal"> · {b.department.replace(/_/g, ' ')}</span>
                  {b.isTeletherapy && (
                    <span className="ml-2 text-xs bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">tele</span>
                  )}
                  {/* Status badge — colour-coded so a pending row is visible at a glance */}
                  {b.status === 'PENDING' && (
                    <span className="ml-2 text-xs text-amber-800 bg-amber-100 px-2 py-0.5 rounded" title="Patient submitted the form but hasn't completed payment yet.">
                      ⏳ Awaiting Payment
                    </span>
                  )}
                  {b.status === 'PAID' && (
                    <span className="ml-2 text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      💰 Paid Downpayment{amount ? ` · ${amount}` : ''}
                    </span>
                  )}
                  {b.status === 'COMPLETED' && (
                    <span className="ml-2 text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      ✓ Completed
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-600 mt-0.5 flex flex-wrap gap-x-3">
                  <span className="font-mono">{b.date} · {b.startTime}–{b.endTime} · with {initials}</span>
                  {b.patient.email && <span>✉ {b.patient.email}</span>}
                  {b.patient.phone && <span>☎ {b.patient.phone}</span>}
                </div>
                {b.notes && <div className="text-xs text-gray-500 mt-0.5 italic">&ldquo;{b.notes}&rdquo;</div>}
              </div>
              <div className="shrink-0 flex items-center gap-2 flex-wrap">
                <button
                  className={`px-3 py-1 rounded text-xs font-medium disabled:opacity-50 ${
                    b.addedToDeck
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                  disabled={busy === b.id || b.addedToDeck || b.status === 'PENDING'}
                  onClick={() => addToDeck(b)}
                  title={b.status === 'PENDING' ? 'Patient has not paid yet — wait for payment confirmation.' : (b.addedToDeck ? 'Already added to this therapist\'s deck' : 'Materialize as a recurring slot in the Decking grid')}
                >
                  {b.addedToDeck ? '✓ Added to Staff Deck' : 'Add to Staff Deck'}
                </button>
                <button
                  className={`px-3 py-1 rounded text-xs font-medium disabled:opacity-50 ${
                    b.accountingRecorded
                      ? 'bg-sky-50 text-sky-700 border border-sky-200 cursor-default'
                      : 'bg-sky-600 text-white hover:bg-sky-700'
                  }`}
                  disabled={busy === b.id || b.accountingRecorded || b.status === 'PENDING'}
                  onClick={() => markRecorded(b)}
                  title={b.status === 'PENDING' ? 'Patient has not paid yet — wait for payment confirmation.' : (b.accountingRecorded ? 'Already recorded in accounting-hub' : 'Mark that the DP was logged in accounting-hub')}
                >
                  {b.accountingRecorded ? '✓ Recorded in Accounting Hub' : 'Recorded DP in Accounting Hub'}
                </button>
                <button
                  className="px-3 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-medium disabled:opacity-50"
                  disabled={busy === b.id}
                  onClick={() => del(b)}
                  title="Permanently delete this booking (use only for clearly bad rows)"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="bg-slate-50 border rounded-xl p-4 mb-4">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Patient Appointment Requests
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {pendingCount > 0
              ? `${pendingCount} pending · ${paidCount} paid`
              : `${paidCount} paid downpayment${paidCount === 1 ? '' : 's'}`}
          </p>
        </div>
        <span className="text-slate-400 text-xs">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {err && <div className="text-rose-600 text-sm">{err}</div>}
          {loading && <div className="text-slate-500 text-sm">Loading…</div>}
          {!loading && (
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1">Bookings</div>
              {rows}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
