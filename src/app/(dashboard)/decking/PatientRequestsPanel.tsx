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
import type { CSSProperties, ReactNode } from 'react'
import {
  AlertTriangle, CalendarDays, Check, ChevronDown, ChevronRight, Clock, Inbox, Loader2,
  Mail, Phone, Trash2, UserRound, Video, Wallet,
} from 'lucide-react'
import { localTodayStr } from '@/lib/utils'
import { useSearchParams } from 'next/navigation'
import { flashRow } from '@/lib/highlight-row'
import { deptColor } from '@/lib/dept-colors'
import { CARD_STYLE, Skeleton, EmptyState, DeptChip } from '../patients/dashboard/ui'
import {
  Avatar, initials, displayName, PillTabs, ErrorCard,
  CONTROL, CONTROL_STYLE, LABEL, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, SUBTLE_BG,
} from './ui'

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

// "14:30" → "2:30 PM". Display only; anything that does not parse is shown as
// typed, and an empty value reads "TBD" as it did before.
function prettyTime(t: string): string {
  if (!t) return 'TBD'
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return t
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// ── Display-only status vocabulary ──────────────────────────────────────────
// Every status is a text-labelled chip; colour only reinforces the word.
type Tone = { fg: string; bg: string; border: string }
const TONE = {
  amber:  { fg: '#B45309', bg: '#FEF6E7', border: '#F3D9A4' },
  violet: { fg: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE' },
  green:  { fg: '#166534', bg: '#F0FAF3', border: '#B9DFC4' },
  slate:  { fg: '#475569', bg: '#F3F6F5', border: '#E2E8F0' },
  sky:    { fg: '#075985', bg: '#F0F9FF', border: '#BAE6FD' },
} satisfies Record<string, Tone>

// The next step on a row is the one filled button; other actions are outlined.
const PRIMARY_STYLE: CSSProperties = { background: 'var(--teal)', color: '#fff', border: '1px solid var(--teal)' }
const SECONDARY_STYLE: CSSProperties = { ...CONTROL_STYLE, color: 'var(--charcoal)' }

function Chip({ children, tone, title }: { children: ReactNode; tone: Tone; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 leading-none whitespace-nowrap"
      style={{ color: tone.fg, background: tone.bg, border: `1px solid ${tone.border}` }}>
      {children}
    </span>
  )
}

// Which follow-up a row is waiting on. Filters the rows already loaded and
// makes no network call; a row can be waiting on both deck and accounting.
type Stage = 'all' | 'payment' | 'deck' | 'record'
function inStage(b: BookingRow, s: Stage): boolean {
  if (s === 'payment') return b.status === 'PENDING'
  if (s === 'deck')    return b.status !== 'PENDING' && !b.addedToDeck
  if (s === 'record')  return b.status !== 'PENDING' && !b.accountingRecorded
  return true
}
const STAGE_EMPTY: Record<Stage, string> = {
  all: '',
  payment: 'Nothing is waiting on payment.',
  deck: 'Every paid request is already on a staff deck.',
  record: 'Every paid request is already recorded in accounting.',
}

function RequestsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading patient requests">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-lg p-3" style={CARD_STYLE} aria-hidden>
          <div className="flex items-center gap-2.5 mb-3">
            <Skeleton className="rounded-full" style={{ width: 30, height: 30 }} />
            <div className="flex-1 min-w-0">
              <Skeleton className="h-3.5 mb-1.5" style={{ width: '60%' }} />
              <Skeleton className="h-3" style={{ width: '40%' }} />
            </div>
          </div>
          <Skeleton className="h-3 mb-2" style={{ width: '85%' }} />
          <div className="flex gap-2">
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8" style={{ width: 64 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function PatientRequestsPanel({ branch, service, compact }: Props) {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set())
  // Display-only status filter over the active list.
  const [stage, setStage] = useState<Stage>('all')
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

  // Notification deep link: /decking?highlight=<bookingId>. Waits for the list
  // to load — the row is not in the DOM when the URL is first read.
  const searchParams = useSearchParams()
  const highlightedId = useRef<string | null>(null)
  useEffect(() => {
    const id = searchParams.get('highlight')
    if (!id || highlightedId.current === id) return
    highlightedId.current = id
    return flashRow(id)
  }, [searchParams])

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
  const stageCounts  = useMemo(() => ({
    all: active.length,
    payment: active.filter((b) => inStage(b, 'payment')).length,
    deck: active.filter((b) => inStage(b, 'deck')).length,
    record: active.filter((b) => inStage(b, 'record')).length,
  }), [active])
  const visible = useMemo(() => active.filter((b) => inStage(b, stage)), [active, stage])

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
      // Same reason as the board itself: /api/staff is scoped to the caller's
      // own branch, so viewing the other branch's requests left this dropdown
      // with no clinicians to pick from and no explanation.
      const r = await fetch('/api/decking/staff')
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

  async function markRecorded(b: BookingRow, force = false) {
    setBusy(b.id)
    doMarkSeen(b.id)
    try {
      const r = await fetch(`/api/decking/bookings/${b.id}/recorded-in-accounting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(force ? { force: true } : {}),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        // Teletherapy verification: the hub found no payment for this booking, or
        // found one still sitting unconverted in the Convert-to-Order queue.
        // Bookings paid before booking-linked pay links existed can never verify
        // automatically, so allow an explicit eyes-on override.
        const verifyFailed =
          (r.status === 409 && (data.code === 'NO_PAYMENT' || data.code === 'NOT_CONVERTED')) ||
          r.status === 502 // lookup unreachable — the error text offers "mark anyway" too
        if (verifyFailed && !force && b.isTeletherapy) {
          setBusy(null)
          if (confirm(`${data.error}\n\nMark as recorded anyway? Only do this if you verified in the Accounting Hub yourself that this payment exists AND was converted to an order.`)) {
            return markRecorded(b, true)
          }
          return
        }
        throw new Error(data.error || 'Recording failed')
      }
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
    const staffName = b.staff ? displayName(staffFullName(b.staff)) : null
    const amount = b.payment?.amount ? `₱${Number(b.payment.amount).toLocaleString()}` : null
    // Teletherapy PENDING = waiting for front-desk to confirm payment received
    const isTelePending = b.isTeletherapy && b.status === 'PENDING'
    const isNew = !seenIds.has(b.id)
    const isBusy = busy === b.id
    // The step this row is waiting on gets the one filled button; anything
    // else on the row stays outlined so the next move is obvious at a glance.
    const nextStep: 'confirm' | 'deck' | 'record' | null =
      isTelePending ? 'confirm'
      : b.status === 'PENDING' ? null
      : !b.addedToDeck ? 'deck'
      : !b.accountingRecorded ? 'record'
      : null
    return (
      <div
        key={b.id}
        data-row-id={b.id}
        className="rounded-lg p-3 text-sm transition-colors min-w-0"
        style={
          isDoneRow
            ? { ...CARD_STYLE, opacity: 0.7 }
            : isNew
            ? { background: '#f0fdfa', border: '1px solid var(--teal)', boxShadow: '0 0 0 1px var(--teal)' }
            : CARD_STYLE
        }
        onClick={() => doMarkSeen(b.id)}
      >
        {/* Who + status */}
        <div className="flex items-start gap-2.5 min-w-0">
          <Avatar text={initials(b.patient.firstName, b.patient.lastName)} size={30} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              {who ? (
                <span className="font-semibold truncate" style={{ color: 'var(--charcoal)' }} title={displayName(who)}>
                  {displayName(who)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: '#B91C1C' }}>
                  <AlertTriangle size={13} aria-hidden /> No name
                </span>
              )}
              {isNew && !isDoneRow && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 leading-none"
                  style={{ background: 'var(--teal)', color: '#fff', letterSpacing: '0.04em' }}
                >
                  NEW
                </span>
              )}
              {isDoneRow && (
                <span className="ml-auto flex-shrink-0">
                  <Chip tone={TONE.green}><Check size={11} aria-hidden /> Done</Chip>
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <DeptChip code={b.department.replace(/_/g, ' ')} color={deptColor(b.department)} />
              <Chip tone={TONE.slate} title={BRANCH_LABEL[b.branch] ?? b.branch}>{BRANCH_SHORT[b.branch] ?? b.branch}</Chip>
              {b.isTeletherapy && (
                <Chip tone={TONE.sky}><Video size={11} aria-hidden /> Teletherapy</Chip>
              )}
              {b.status === 'PENDING' && !isTelePending && (
                <Chip tone={TONE.amber} title="Patient has not completed payment yet.">
                  <Clock size={11} aria-hidden /> Awaiting payment
                </Chip>
              )}
              {isTelePending && (
                <Chip tone={TONE.violet} title="Verify in Accounting Hub that payment was received, then click Confirm.">
                  <Clock size={11} aria-hidden /> Awaiting confirmation
                </Chip>
              )}
              {b.status === 'PAID' && (
                <Chip tone={TONE.green}>
                  <Wallet size={11} aria-hidden /> Paid downpayment{amount ? ` · ${amount}` : ''}
                </Chip>
              )}
              {b.status === 'COMPLETED' && (
                <Chip tone={TONE.slate}><Check size={11} aria-hidden /> Completed</Chip>
              )}
            </div>
          </div>
        </div>

        {/* When, with whom, how to reach them */}
        <div className="mt-2.5 flex flex-col gap-1 text-xs" style={{ color: 'var(--mid-gray)' }}>
          <div className="flex items-center gap-1.5 min-w-0">
            <CalendarDays size={12} className="flex-shrink-0" aria-hidden />
            <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{b.date ? niceDate(b.date) : 'Date TBD'}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums whitespace-nowrap">{prettyTime(b.startTime)}–{prettyTime(b.endTime)}</span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <UserRound size={12} className="flex-shrink-0" aria-hidden />
            {staffName
              ? <span className="truncate">with <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{staffName}</span></span>
              : <span className="italic">Clinician TBD</span>}
          </div>
          {(b.patient.email || b.patient.phone) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              {b.patient.email && (
                <span className="inline-flex items-center gap-1.5 min-w-0 break-all">
                  <Mail size={12} className="flex-shrink-0" aria-hidden />{b.patient.email}
                </span>
              )}
              {b.patient.phone && (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Phone size={12} className="flex-shrink-0" aria-hidden />{b.patient.phone}
                </span>
              )}
            </div>
          )}
        </div>
        {b.notes && (
          <p className="mt-2 text-xs italic rounded-md px-2.5 py-1.5 leading-snug" style={{ background: SUBTLE_BG, color: '#5A6470' }}>
            &ldquo;{b.notes}&rdquo;
          </p>
        )}

        {!isDoneRow && (
          <>
            <div className="mt-3 pt-2.5 flex flex-wrap items-center gap-1.5" style={{ borderTop: '1px solid #EEF2F1' }}>
              {/* Teletherapy PENDING: front desk confirms payment received */}
              {isTelePending ? (
                <button
                  type="button"
                  className={`${BTN_SM} flex-1`}
                  style={PRIMARY_STYLE}
                  disabled={busy === b.id}
                  onClick={(e) => { e.stopPropagation(); confirmPayment(b) }}
                  title="Verify payment in Accounting Hub first, then click to confirm"
                >
                  <Wallet size={13} aria-hidden /> Confirm payment received
                </button>
              ) : (
                <>
                  {b.addedToDeck ? (
                    <Chip tone={TONE.green} title="Already added to this therapist's deck">
                      <Check size={11} aria-hidden /> On staff deck
                    </Chip>
                  ) : (
                    <button
                      type="button"
                      className={`${BTN_SM} ${nextStep === 'deck' ? 'flex-1' : ''}`}
                      style={nextStep === 'deck' ? PRIMARY_STYLE : SECONDARY_STYLE}
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
                      Add to Staff Deck
                    </button>
                  )}
                  {b.accountingRecorded ? (
                    <Chip tone={TONE.green} title="Already marked as recorded in accounting-hub">
                      <Check size={11} aria-hidden /> Recorded in Accounting
                    </Chip>
                  ) : (
                    <button
                      type="button"
                      className={`${BTN_SM} ${nextStep === 'record' ? 'flex-1' : ''}`}
                      style={nextStep === 'record' ? PRIMARY_STYLE : SECONDARY_STYLE}
                      disabled={busy === b.id || b.accountingRecorded || b.status === 'PENDING'}
                      onClick={(e) => { e.stopPropagation(); markRecorded(b) }}
                      title={
                        b.status === 'PENDING'
                          ? 'Patient has not paid yet.'
                          : b.accountingRecorded
                          ? 'Already marked as recorded in accounting-hub'
                          : b.isTeletherapy
                          ? 'Checks with the Accounting Hub that this booking\'s PayMongo payment was converted to an order, then marks it recorded'
                          : 'Mark that the downpayment was logged in accounting-hub'
                      }
                    >
                      Record DP in Accounting
                    </button>
                  )}
                </>
              )}
              {isBusy && (
                <span role="status" className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--mid-gray)' }}>
                  <Loader2 size={12} className="animate-spin" aria-hidden /> Working…
                </span>
              )}
              <button
                type="button"
                className={`${BTN_SM} ml-auto`}
                style={{ background: '#fff', color: '#B91C1C', border: '1px solid #FECACA' }}
                disabled={busy === b.id}
                onClick={(e) => { e.stopPropagation(); del(b) }}
                title="Delete this request"
              >
                <Trash2 size={12} aria-hidden /> Delete
              </button>
            </div>
            {b.status === 'PENDING' && !isTelePending && (
              <p className="mt-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                Waiting for the patient to finish paying — nothing to do yet.
              </p>
            )}
          </>
        )}
      </div>
    )
  }

  const branchHeader = branch === 'ALL' ? 'All Branches' : (BRANCH_LABEL[branch] ?? branch)
  const pad = compact ? 'px-3.5' : 'px-5'

  const stageTabs = ([
    { id: 'all', label: 'All' },
    { id: 'payment', label: 'Awaiting payment' },
    { id: 'deck', label: 'To deck' },
    { id: 'record', label: 'To record' },
  ] as { id: Stage; label: string }[])
    .filter((t) => t.id === 'all' || t.id === stage || stageCounts[t.id] > 0)
    .map((t) => ({
      id: t.id,
      label: (
        <>
          {t.label}
          <span className="tabular-nums text-[10px] font-bold rounded-full px-1.5 py-px leading-none"
            style={{ background: stage === t.id ? 'var(--pale-teal)' : '#E7ECEB', color: 'inherit' }}>
            {stageCounts[t.id]}
          </span>
        </>
      ),
    }))

  return (
    <>
      {/* ── Add-to-Staff-Deck modal ─────────────────────────────────────────── */}
      {deckModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)', zIndex: 9999 }}
          onClick={() => setDeckModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="prq-deck-title"
            className="w-full max-w-[440px] rounded-xl bg-white p-5 sm:p-6 max-h-full overflow-y-auto"
            style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="prq-deck-title" className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Add to Staff Deck
            </h3>
            <p className="text-[13px] mt-1 mb-4 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
              Confirm details below — change the assigned therapist or time if needed.
            </p>

            {/* Patient summary */}
            <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 mb-4" style={{ background: SUBTLE_BG, border: '1px solid #EEF2F1' }}>
              <Avatar text={initials(deckModal.booking.patient.firstName, deckModal.booking.patient.lastName)} size={30} />
              <div className="min-w-0 text-[13px]">
                <div className="font-semibold truncate" style={{ color: 'var(--charcoal)' }}>
                  {displayName(`${deckModal.booking.patient.firstName} ${deckModal.booking.patient.lastName}`.trim())}
                </div>
                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                  <DeptChip code={deckModal.booking.department.replace(/_/g, ' ')} color={deptColor(deckModal.booking.department)} />
                  {deckModal.booking.payment?.amount ? (
                    <Chip tone={TONE.green}>₱{Number(deckModal.booking.payment.amount).toLocaleString()} paid</Chip>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Staff picker */}
            <div className="mb-3">
              <label htmlFor="prq-deck-staff" className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                Assign to Therapist
              </label>
              {deckModal.loadingStaff ? (
                <div className="flex items-center gap-1.5 text-[13px]" style={{ color: '#9ca3af' }}>
                  <Loader2 size={13} className="animate-spin" aria-hidden /> Loading staff…
                </div>
              ) : (
                <select
                  id="prq-deck-staff"
                  value={deckModal.staffId}
                  onChange={(e) => setDeckModal((m) => m ? { ...m, staffId: e.target.value } : null)}
                  className={`${CONTROL} w-full`}
                  style={CONTROL_STYLE}
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
            <div className="mb-3">
              <label htmlFor="prq-deck-date" className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                Date
              </label>
              <input
                id="prq-deck-date"
                type="date"
                value={deckModal.date}
                onChange={(e) => setDeckModal((m) => m ? { ...m, date: e.target.value } : null)}
                className={`${CONTROL} w-full`}
                style={CONTROL_STYLE}
              />
            </div>

            {/* Time */}
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              <div className="min-w-0">
                <label htmlFor="prq-deck-start" className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                  Start Time
                </label>
                <input
                  id="prq-deck-start"
                  type="time"
                  value={deckModal.startTime}
                  onChange={(e) => setDeckModal((m) => m ? { ...m, startTime: e.target.value } : null)}
                  className={`${CONTROL} w-full`}
                  style={CONTROL_STYLE}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="prq-deck-end" className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                  End Time
                </label>
                <input
                  id="prq-deck-end"
                  type="time"
                  value={deckModal.endTime}
                  onChange={(e) => setDeckModal((m) => m ? { ...m, endTime: e.target.value } : null)}
                  className={`${CONTROL} w-full`}
                  style={CONTROL_STYLE}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDeckModal(null)}
                className={BTN_SECONDARY}
                style={CONTROL_STYLE}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAddToDeck}
                className={BTN_PRIMARY}
                style={{ background: 'var(--teal)' }}
              >
                <Check size={14} aria-hidden /> Confirm — Add to Deck
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Panel ───────────────────────────────────────────────────────────── */}
      <section className={`rounded-xl min-w-0 ${compact ? '' : 'mb-4'}`} style={CARD_STYLE}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className={`w-full flex items-start justify-between gap-3 text-left ${pad} pt-3.5 pb-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2`}
        >
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[14px] font-bold leading-tight"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              <Inbox size={15} className="flex-shrink-0" style={{ color: 'var(--teal)' }} aria-hidden />
              {service === 'onsite'      ? 'On-site Downpayments'
               : service === 'teletherapy' ? 'Teletherapy Payments'
               : service === 'homecare'    ? 'Homecare Payments'
               : 'Patient Appointment Requests'}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full leading-none"
                style={{ background: '#e5f6f8', color: 'var(--teal)' }}>
                {branchHeader}
              </span>
              {pendingCount > 0 && (
                <Chip tone={TONE.amber}><span className="tabular-nums">{pendingCount}</span> pending</Chip>
              )}
              <Chip tone={TONE.green}>
                <span className="tabular-nums">{paidCount}</span> paid{pendingCount > 0 ? '' : ` downpayment${paidCount === 1 ? '' : 's'}`}
              </Chip>
              {done.length > 0 && (
                <Chip tone={TONE.slate}><span className="tabular-nums">{done.length}</span> completed</Chip>
              )}
            </div>
          </div>
          <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--mid-gray)' }} aria-hidden>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        </button>

        {expanded && (
          <div className={`${pad} pt-3 pb-3.5 flex flex-col gap-3`} style={{ borderTop: '1px solid var(--light-gray)' }}>
            {loading && bookings.length === 0 ? (
              <RequestsSkeleton />
            ) : err && bookings.length === 0 ? (
              <ErrorCard title="Couldn't load patient requests" hint={err} onRetry={load} />
            ) : (
              <>
                {/* A failed action reload while rows are already on screen. */}
                {err && (
                  <div role="alert" className="rounded-lg px-3 py-2 flex items-start gap-2 text-xs"
                    style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}>
                    <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" style={{ color: '#DC2626' }} aria-hidden />
                    <span className="min-w-0">{err}</span>
                  </div>
                )}

                {active.length > 0 && (
                  <PillTabs size="sm" label="Filter requests by status" tabs={stageTabs} value={stage}
                    onChange={(id) => setStage(id as Stage)} />
                )}

                {/* Kept on screen (dimmed, not clickable) while a reload runs,
                    instead of blanking to a loading line after every action. */}
                <div aria-busy={loading} className={`flex flex-col gap-2 ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
                  {active.length === 0 ? (
                    <div className="rounded-lg" style={{ background: SUBTLE_BG }}>
                      {/* Homecare has no booking model yet — only city and open-day
                          config — so this panel cannot fill up no matter how many
                          requests come in. Say that, rather than leaving a blank
                          box that reads as "nothing today". */}
                      {service === 'homecare' ? (
                        <EmptyState
                          title="Homecare bookings aren't in this panel yet"
                          hint="Homecare bookings are not wired into this panel yet — the homecare flow currently stores city and open-day settings only."
                        />
                      ) : done.length > 0 ? (
                        <EmptyState title="All bookings processed." hint="Nothing is waiting on the front desk." />
                      ) : (
                        <EmptyState title="No patient bookings yet." hint="Requests from the client portal will appear here." />
                      )}
                    </div>
                  ) : visible.length === 0 ? (
                    <div className="rounded-lg px-4 py-6 text-center" style={{ background: SUBTLE_BG }}>
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>{STAGE_EMPTY[stage]}</p>
                      <button type="button" onClick={() => setStage('all')} className={`${BTN_SM} mt-2`}
                        style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                        Show all requests
                      </button>
                    </div>
                  ) : (
                    visible.map((b) => renderRow(b))
                  )}
                </div>

                {/* Collapsed "Done" section */}
                {done.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowDone((s) => !s)}
                      aria-expanded={showDone}
                      className="inline-flex items-center gap-1 text-xs font-semibold rounded-md px-1 py-0.5 hover:bg-black/[0.04] focus-visible:outline-2"
                      style={{ color: 'var(--mid-gray)' }}
                    >
                      {showDone ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
                      Processed
                      <span className="tabular-nums text-[10px] font-bold rounded-full px-1.5 py-px leading-none" style={{ background: '#E7ECEB' }}>
                        {done.length}
                      </span>
                    </button>
                    {showDone && (
                      <div className="flex flex-col gap-2 mt-2">
                        {done.map((b) => renderRow(b, true))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </>
  )
}
