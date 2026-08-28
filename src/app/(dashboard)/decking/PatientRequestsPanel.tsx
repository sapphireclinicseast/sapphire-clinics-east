'use client'

// Front-desk panel for patient-portal bookings.
//
// Post-2026-05-18 self-service flow: PENDING (= awaiting payment) and the
// legacy APPROVED stage are no longer surfaced here. Only confirmed (PAID)
// bookings show up, each with two follow-up actions:
//   - Add to Staff Deck  → materializes a DeckingSlot for the booking's
//                           recurring weekly cell.  Staff + time can be
//                           overridden in the confirmation modal before saving.
//   - Recorded DP in Accounting Hub → ledger marker so the row stops
//                           nagging once the front-desk has logged the
//                           downpayment in accounting-hub.
//
// Rows where BOTH actions are complete are collapsed into a "Done" section
// so the active list stays short.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { localTodayStr } from '@/lib/utils'

interface BookingRow {
  id: string
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'
  branch: string
  department: string
  date: string | null
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
  createdAt: string
  patient: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null }
  staff: { id: string; firstName: string; lastName: string; department: string; branch: string } | null
  payment: { status: string; amount: number | string; paidAt: string | null } | null
}

interface StaffOption { id: string; firstName: string; lastName: string; branch: string; department: string }

interface DeckModal {
  booking: BookingRow
  staffId: string
  date: string
  startTime: string
  endTime: string
  staffList: StaffOption[]
  loadingStaff: boolean
}

interface Props {
  branch: 'SBEA' | 'SBGH' | 'ALL'
  /** Which service board this panel sits beside. Filters the requests to the
   *  ones that board can act on; omitted means show everything (legacy). */
  service?: 'onsite' | 'teletherapy' | 'homecare'
  /** Rendered in the narrow 1/3 column — tightens padding and drops the
   *  wide-only chrome. */
  compact?: boolean
}

const BRANCH_LABEL: Record<string, string> = { SBEA: 'East Branch', SBGH: 'Greenhills Branch' }
const BRANCH_SHORT: Record<string, string> = { SBEA: 'East', SBGH: 'GH' }

// localStorage key for seen booking IDs (per-day, auto-expires)
function seenKey() {
  return `SCEI_DECK_SEEN_${localTodayStr()}`
}
function getSeenBookings(): Set<string> {
  try {
    const raw = localStorage.getItem(seenKey())
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch { return new Set() }
}
function markBookingSeen(id: string) {
  try {
    const key = seenKey()
    const raw = localStorage.getItem(key)
    const seen: string[] = raw ? JSON.parse(raw) : []
    if (!seen.includes(id)) localStorage.setItem(key, JSON.stringify([...seen, id]))
  } catch {}
}

function staffFullName(s: { firstName: string; lastName: string }) {
  return `${s.firstName} ${s.lastName}`.trim()
}

// Format "2026-07-16T00:00:00.000Z" → "Jul 16, 2026 (Thu)"
function niceDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function PatientRequestsPanel({ branch, service, compact }: Props) {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set())
  const initialLoadDone = useRef(false)

  // "Add to Staff Deck" modal state
  const [deckModal, setDeckModal] = useState<DeckModal | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const r = await fetch(`/api/decking/bookings?branch=${branch}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load')
      const rows = data.bookings as BookingRow[]
      setBookings(rows)

      if (!initialLoadDone.current) {
        initialLoadDone.current = true
        const currentSeen = getSeenBookings()
        setSeenIds(currentSeen)
        setTimeout(() => {
          rows.forEach((b) => markBookingSeen(b.id))
          setSeenIds(getSeenBookings())
        }, 4000)
      } else {
        setSeenIds(getSeenBookings())
      }
    } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }, [branch])

  useEffect(() => { load() }, [load])

  // Client-portal requests belong to the board that can act on them:
  //   on-site      → in-clinic bookings, which pay a downpayment
  //   teletherapy  → remote bookings; both full payments and downpayments show,
  //                  since a tele request can arrive either way
  //   homecare     → no booking model exists yet (the homecare flow only has
  //                  city/open-day config), so this is empty by construction
  //                  rather than by filtering. Called out in the UI instead of
  //                  showing a silently blank panel.
  const scoped = useMemo(() => {
    if (!service) return bookings
    if (service === 'teletherapy') return bookings.filter(b => b.isTeletherapy)
    if (service === 'onsite')      return bookings.filter(b => !b.isTeletherapy)
    return []
  }, [bookings, service])

  const active = useMemo(
    () => scoped.filter((b) =>
      (b.status === 'PENDING' || b.status === 'PAID' || b.status === 'COMPLETED') &&
      !(b.addedToDeck && b.accountingRecorded)   // hide once both actions are done
    ),
    [scoped],
  )
  const done = useMemo(
    () => scoped.filter((b) =>
      (b.status === 'PAID' || b.status === 'COMPLETED') &&
      b.addedToDeck && b.accountingRecorded
    ),
    [scoped],
  )
  const pendingCount = useMemo(() => active.filter((b) => b.status === 'PENDING').length, [active])
  const paidCount    = useMemo(() => active.filter((b) => b.status === 'PAID').length, [active])

  function doMarkSeen(id: string) {
    markBookingSeen(id)
    setSeenIds(getSeenBookings())
  }

  async function confirmPayment(b: BookingRow) {
    setBusy(b.id)
    doMarkSeen(b.id)
    try {
      const r = await fetch(`/api/decking/bookings/${b.id}/confirm-payment`, { method: 'POST' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Confirm payment failed')
      await load()
    } catch (e) { alert('Error: ' + (e as Error).message) } finally { setBusy(null) }
  }

  // Open the "Add to Staff Deck" modal, pre-filling from the booking.
  // For teletherapy bookings, date and staff are null — front desk fills them.
  async function openDeckModal(b: BookingRow) {
    const dateStr = b.date ? b.date.slice(0, 10) : localTodayStr()
    setDeckModal({
      booking: b,
      staffId: b.staff?.id ?? '',
      date: dateStr,
      startTime: b.startTime || '',
      endTime: b.endTime || '',
      staffList: [],
      loadingStaff: true,
    })
    try {
      const r = await fetch('/api/staff')
      const data = await r.json()
      const list: StaffOption[] = (data as StaffOption[]).filter(
        (s) => !branch || branch === 'ALL' || s.branch === branch
      )
      setDeckModal((prev) => prev ? { ...prev, staffList: list, loadingStaff: false } : null)
    } catch {
      setDeckModal((prev) => prev ? { ...prev, loadingStaff: false } : null)
    }
  }

  async function confirmAddToDeck() {
    if (!deckModal) return
    const { booking: b, staffId, date, startTime, endTime } = deckModal
    setBusy(b.id)
    doMarkSeen(b.id)
    setDeckModal(null)
    try {
      const r = await fetch(`/api/decking/bookings/${b.id}/add-to-deck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, date, startTime, endTime }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Add to deck failed')
      await load()
    } catch (e) { alert('Error: ' + (e as Error).message) } finally { setBusy(null) }
  }

  async function markRecorded(b: BookingRow) {
    setBusy(b.id)
    doMarkSeen(b.id)
    try {
      const r = await fetch(`/api/decking/bookings/${b.id}/recorded-in-accounting`, { method: 'POST' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Recording failed')
      if (data.orderNumber) {
        alert(`POS Order #${data.orderNumber} created in Accounting Hub.`)
      }
      await load()
    } catch (e) { alert('Error: ' + (e as Error).message) } finally { setBusy(null) }
  }

  async function del(b: BookingRow) {
    const who = `${b.patient.firstName ?? ''} ${b.patient.lastName ?? ''}`.trim() || 'this request'
    if (!confirm(`Delete ${who}'s booking (${b.date} ${b.startTime})? This cannot be undone.`)) return
    setBusy(b.id)
    doMarkSeen(b.id)
    try {
      const r = await fetch(`/api/decking/bookings/${b.id}`, { method: 'DELETE' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Delete failed')
      await load()
    } catch (e) { alert('Error: ' + (e as Error).message) } finally { setBusy(null) }
  }

  function renderRow(b: BookingRow, isDoneRow = false) {
    const who = `${b.patient.firstName ?? ''} ${b.patient.lastName ?? ''}`.trim()
    const staffName = b.staff ? staffFullName(b.staff) : 'TBD'
    const amount = b.payment?.amount ? `₱${Number(b.payment.amount).toLocaleString()}` : null
    // Teletherapy PENDING = waiting for front-desk to confirm payment received
    const isTelePending = b.isTeletherapy && b.status === 'PENDING'
    const isNew = !seenIds.has(b.id)
    return (
      <div
        key={b.id}
        className="bg-white border rounded-lg px-3 py-2 text-sm transition-colors"
        style={
          isDoneRow
            ? { opacity: 0.7 }
            : isNew
            ? { borderColor: 'var(--teal)', boxShadow: '0 0 0 1px var(--teal)', background: '#f0fdfa' }
            : {}
        }
        onClick={() => doMarkSeen(b.id)}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1">
            <div className="font-medium truncate flex items-center gap-1.5 flex-wrap">
              {isNew && !isDoneRow && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: 'var(--teal)', color: '#fff', letterSpacing: '0.04em' }}
                >
                  NEW
                </span>
              )}
              {who || <span className="text-rose-600">⚠ No name</span>}
              <span className="text-gray-500 font-normal"> · {b.department.replace(/_/g, ' ')}</span>
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ background: '#e5f6f8', color: 'var(--teal)' }}
              >
                {BRANCH_SHORT[b.branch] ?? b.branch}
              </span>
              {b.isTeletherapy && (
                <span className="text-xs bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">tele</span>
              )}
              {b.status === 'PENDING' && !isTelePending && (
                <span className="text-xs text-amber-800 bg-amber-100 px-2 py-0.5 rounded" title="Patient has not completed payment yet.">
                  ⏳ Awaiting Payment
                </span>
              )}
              {isTelePending && (
                <span className="text-xs text-violet-800 bg-violet-100 px-2 py-0.5 rounded" title="Verify in Accounting Hub that payment was received, then click Confirm.">
                  ⏳ Awaiting Confirmation
                </span>
              )}
              {b.status === 'PAID' && (
                <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  💰 Paid Downpayment{amount ? ` · ${amount}` : ''}
                </span>
              )}
              {b.status === 'COMPLETED' && (
                <span className="text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  ✓ Completed
                </span>
              )}
            </div>
            <div className="text-xs text-gray-600 mt-0.5 flex flex-wrap gap-x-3">
              {/* Plain sans, matching the email/phone spans beside it. This line
                  was monospace, which made the dates and times read as a
                  different typeface from the rest of the card. */}
              <span>
                {b.date ? niceDate(b.date) : 'Date TBD'} · {b.startTime || 'TBD'}–{b.endTime || 'TBD'} · with {staffName}
              </span>
              {b.patient.email && <span>✉ {b.patient.email}</span>}
              {b.patient.phone && <span>☎ {b.patient.phone}</span>}
            </div>
            {b.notes && <div className="text-xs text-gray-500 mt-0.5 italic">&ldquo;{b.notes}&rdquo;</div>}
          </div>
          {!isDoneRow && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Teletherapy PENDING: front desk confirms payment received */}
              {isTelePending ? (
                <button
                  className="px-3 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 text-xs font-medium disabled:opacity-50"
                  disabled={busy === b.id}
                  onClick={(e) => { e.stopPropagation(); confirmPayment(b) }}
                  title="Verify payment in Accounting Hub first, then click to confirm"
                >
                  Confirm Payment Received
                </button>
              ) : (
                <>
                  <button
                    className={`px-3 py-1 rounded text-xs font-medium disabled:opacity-50 ${
                      b.addedToDeck
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                    disabled={busy === b.id || b.addedToDeck || b.status === 'PENDING'}
                    onClick={(e) => { e.stopPropagation(); openDeckModal(b) }}
                    title={
                      b.status === 'PENDING'
                        ? 'Patient has not paid yet — wait for payment confirmation.'
                        : b.addedToDeck
                        ? 'Already added to this therapist\'s deck'
                        : 'Add patient to the Decking grid'
                    }
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
                    onClick={(e) => { e.stopPropagation(); markRecorded(b) }}
                    title={
                      b.status === 'PENDING'
                        ? 'Patient has not paid yet.'
                        : b.accountingRecorded
                        ? 'Already marked as recorded in accounting-hub'
                        : 'Mark that the downpayment was logged in accounting-hub'
                    }
                  >
                    {b.accountingRecorded ? '✓ Recorded in Accounting Hub' : 'Recorded DP in Accounting Hub'}
                  </button>
                </>
              )}
              <button
                className="px-3 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-medium disabled:opacity-50"
                disabled={busy === b.id}
                onClick={(e) => { e.stopPropagation(); del(b) }}
              >
                Delete
              </button>
            </div>
          )}
          {isDoneRow && (
            <span className="text-xs text-slate-400 flex-shrink-0 self-center">✓ Done</span>
          )}
        </div>
      </div>
    )
  }

  const branchHeader = branch === 'ALL' ? 'All Branches' : (BRANCH_LABEL[branch] ?? branch)

  return (
    <>
      {/* ── Add-to-Staff-Deck modal ─────────────────────────────────────────── */}
      {deckModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 16,
          }}
          onClick={() => setDeckModal(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 14, padding: '24px 24px 20px',
              width: '100%', maxWidth: 440, boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: 4 }}>
              Add to Staff Deck
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 18, lineHeight: 1.5 }}>
              Confirm details below — change the assigned therapist or time if needed.
            </p>

            {/* Patient summary */}
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: '0.82rem' }}>
              <strong>{`${deckModal.booking.patient.firstName} ${deckModal.booking.patient.lastName}`.trim()}</strong>
              {' · '}{deckModal.booking.department.replace(/_/g, ' ')}
              {deckModal.booking.payment?.amount ? ` · ₱${Number(deckModal.booking.payment.amount).toLocaleString()} paid` : ''}
            </div>

            {/* Staff picker */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                Assign to Therapist
              </label>
              {deckModal.loadingStaff ? (
                <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Loading staff…</div>
              ) : (
                <select
                  value={deckModal.staffId}
                  onChange={(e) => setDeckModal((m) => m ? { ...m, staffId: e.target.value } : null)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #d1d5db', fontSize: '0.85rem', background: '#fff' }}
                >
                  {deckModal.staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.department.replace(/_/g, ' ')})
                    </option>
                  ))}
                  {/* Fallback if current staff not in list (only when a staff was preset) */}
                  {deckModal.booking.staff && !deckModal.staffList.find((s) => s.id === deckModal.staffId) && (
                    <option value={deckModal.booking.staff.id}>
                      {staffFullName(deckModal.booking.staff)} (original)
                    </option>
                  )}
                  {/* Placeholder for teletherapy bookings with no pre-assigned therapist */}
                  {!deckModal.booking.staff && !deckModal.staffId && (
                    <option value="" disabled>— select therapist —</option>
                  )}
                </select>
              )}
            </div>

            {/* Date */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                Date
              </label>
              <input
                type="date"
                value={deckModal.date}
                onChange={(e) => setDeckModal((m) => m ? { ...m, date: e.target.value } : null)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #d1d5db', fontSize: '0.85rem' }}
              />
            </div>

            {/* Time */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                  Start Time
                </label>
                <input
                  type="time"
                  value={deckModal.startTime}
                  onChange={(e) => setDeckModal((m) => m ? { ...m, startTime: e.target.value } : null)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #d1d5db', fontSize: '0.85rem' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                  End Time
                </label>
                <input
                  type="time"
                  value={deckModal.endTime}
                  onChange={(e) => setDeckModal((m) => m ? { ...m, endTime: e.target.value } : null)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #d1d5db', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeckModal(null)}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmAddToDeck}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Confirm — Add to Deck
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Panel ───────────────────────────────────────────────────────────── */}
      <div className={`bg-slate-50 border rounded-xl ${compact ? 'p-3' : 'p-4 mb-4'}`}>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-between text-left"
        >
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                {service === 'onsite'      ? 'On-site Downpayments'
                 : service === 'teletherapy' ? 'Teletherapy Payments'
                 : service === 'homecare'    ? 'Homecare Payments'
                 : 'Patient Appointment Requests'}
              </h2>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#e5f6f8', color: 'var(--teal)' }}
              >
                {branchHeader}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {pendingCount > 0
                ? `${pendingCount} pending · ${paidCount} paid`
                : `${paidCount} paid downpayment${paidCount === 1 ? '' : 's'}`}
              {done.length > 0 && ` · ${done.length} completed`}
            </p>
          </div>
          <span className="text-slate-400 text-xs">{expanded ? '▾' : '▸'}</span>
        </button>

        {expanded && (
          <div className="mt-3 space-y-4">
            {err && <div className="text-rose-600 text-sm">{err}</div>}
            {loading && <div className="text-slate-500 text-sm">Loading…</div>}
            {!loading && (
              <>
                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1">Bookings</div>
                  <div className="space-y-2">
                    {active.length === 0 && (
                      <div className="text-sm text-gray-500 italic px-2 py-1">
                        {/* Homecare has no booking model yet — only city and open-day
                            config — so this panel cannot fill up no matter how many
                            requests come in. Say that, rather than leaving a blank
                            box that reads as "nothing today". */}
                        {service === 'homecare'
                          ? 'Homecare bookings are not wired into this panel yet — the homecare flow currently stores city and open-day settings only.'
                          : done.length > 0 ? 'All bookings processed.' : 'No patient bookings yet.'}
                      </div>
                    )}
                    {active.map((b) => renderRow(b))}
                  </div>
                </div>

                {/* Collapsed "Done" section */}
                {done.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowDone((s) => !s)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1"
                    >
                      {showDone ? '▾' : '▸'} Processed ({done.length})
                    </button>
                    {showDone && (
                      <div className="space-y-2 mt-2">
                        {done.map((b) => renderRow(b, true))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
