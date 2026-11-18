// Uncharged cancellations (Hannah, 2026-11-18: "build the flag for uncharged
// cancellations").
//
// Every booking a patient didn't attend — cancelled, rescheduled or no-show on
// the Operations Hub schedule — is checked against the fee rule, and the ones a
// fee is owed on but nobody charged are flagged for front desk: in POS →
// Uncharged Cancellations, and on New Payment for that patient.
//
// The schedule is the source, not the cancellation log: most absences were
// never logged (the outcome prompt can be skipped), which is how ~9 in 10 GL
// absences went uncharged in 2026.
//
// THE FEE RULE (same as the Operations Hub's Patient Relationship tab, plus
// Hannah's reschedule rule):
//   - No-show: a fee is owed every time.
//   - Cancelled or rescheduled ("there are no reschedules. reschedules should
//     be charged as cancellations"): two free in any 180 days; the 3rd onward
//     in a rolling 180-day window is charged.
//   - A cancellation logged as a guarantee-letter session (log paymentType GL):
//     charged from the first, and it doesn't use a free slot (the Operations
//     Hub's rule since 2026-11-18). Unlogged ones keep the allowance — nothing
//     is read backwards as GL.
//   - Not counted at all: a cancellation waived when it was logged, including
//     therapist-initiated ones (log countsToward = false), and a booking that
//     was really moved within the day (the patient's sessions charged that day
//     cover it).
//
// HOW FAR BACK (Hannah, 2026-11-18, when the flag went live):
//   - From FLAG_CUTOVER on, every patient's uncharged fee is flagged.
//   - Before it, back to the start of 2026 ("since we started"), only fees a
//     guarantee letter can still take ("as long as GL wallet can still be
//     charged with it") — cash and HMO families aren't chased for the past.
//   - Before it, a day on which the same therapist had 3+ bookings called off
//     is read as the clinic calling off ("yes, for past ones"), unless the log
//     says the patient did. From the cutover it is not automatic ("for
//     current it is not automatic"): the Operations Hub's who-called-it-off
//     question decides.
//
// WHAT COUNTS AS CHARGED, strongest first:
//   1. a fee record for that booking (ParkedGlCharge: CHARGED / PARKED /
//      WAIVED — written by this flag, the parked-fee flow and the 11/18
//      retroactive billing);
//   2. the payment the till linked to its cancellation log (paidOrderId);
//   3. otherwise the patient's cancellation-fee orders, oldest booking paired
//      with the oldest fee dated on or after it.
import { prisma as defaultPrisma } from '@/lib/prisma'

type Db = typeof defaultPrisma

export const FREE_CANCELLATIONS = 2
export const WINDOW_DAYS = 180
/** The day the flag went live — see HOW FAR BACK above. */
export const FLAG_CUTOVER = '2026-11-18'
/** "Since we started": the hub's first year. */
export const FLAG_START = '2026-01-01'
/** Before the cutover: this many bookings called off for one therapist in a day = the clinic's doing. */
const THERAPIST_OUT_THRESHOLD = 3

const HUB = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'

/** Fee lines on POS orders: the four fee families in POS → Services. */
const FEE_PREFIXES = ['CANCELLATION', 'LATE CANCELLATION', 'NO SHOW FEE', 'RETAINER']
export const isFeeLineName = (n: string) => {
  const u = n.trim().toUpperCase()
  return FEE_PREFIXES.some(p => u.startsWith(p))
}

/** Departments that have fee services; other bookings (MD, etc.) carry no fee. */
const FEE_DEPTS = new Set(['OT', 'PT', 'SLP', 'SPED', 'PSYCHOLOGY'])

const BRANCH_FROM_HUB: Record<string, string> = {
  SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VER: 'VERDANA_STORE',
  SANDBOX_EAST: 'SANDBOX_EAST', SANDBOX_GREENHILLS: 'SANDBOX_GREENHILLS',
}

interface HubAbsence {
  scheduleId: string; patientId: string; patientName: string; date: string; startTime: string
  status: 'CANCELLED' | 'RESCHEDULED' | 'NO_SHOW'; sessionType: string; branch: string | null
  therapist: string; department: string | null; confirmedSameDay: number
  log: {
    id: string; type: string; isValid: boolean; sourceStatus: string | null; countsToward: boolean
    excludeReason: string | null; initiatedBy: string | null; paymentType: string | null
    paidOrderId: string | null; paidOrderNumber: number | null
  } | null
}

export type AbsenceState = 'UNCHARGED' | 'PAID' | 'PARKED' | 'WAIVED'

export interface FlaggedAbsence {
  scheduleId: string
  patientId: string
  patientName: string
  branch: string
  date: string
  startTime: string
  status: HubAbsence['status']
  /** "cancelled booking on Apr 21, 2026 (OT, therapist)" — goes on the order note. */
  detail: string
  department: string
  therapist: string
  logged: boolean
  /** Why a fee is owed: "3rd cancellation in 180 days", "no-show", "guarantee-letter session". */
  why: string
  feeServiceId: string | null
  feeName: string
  amount: number
  state: AbsenceState
  /** The order that paid it, the parked/waived record, when known. */
  orderNumber: number | null
  note: string | null
  /** The patient's letter around that date, when the booking was GL-funded. */
  gl: { walletId: string; letter: string; balance: number; canCharge: boolean } | null
}

const longDate = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
const ymdManila = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000)
const addDays = (ymd: string, n: number) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

export const ABSENCE_LABEL: Record<string, string> = {
  CANCELLED: 'cancelled booking',
  RESCHEDULED: 'rescheduled booking (charged as a cancellation)',
  NO_SHOW: 'no-show',
}

/** The fee service for a missed booking: by what happened, how it was logged, and the department. */
function feeNameFor(a: HubAbsence, dept: string): string {
  let base = 'CANCELLATION (VALID)'
  if (a.status === 'NO_SHOW') base = 'NO SHOW FEE'
  else if (a.log && /\(VALID\)|\(INVALID\)/i.test(a.log.type)) {
    const v = a.log.isValid ? 'VALID' : 'INVALID'
    base = /^late/i.test(a.log.type) ? `LATE CANCELLATION (${v})` : /^retainer/i.test(a.log.type) ? `RETAINER (${v})` : `CANCELLATION (${v})`
  }
  // PT fees are split pedia/adult; the schedule doesn't say which, so pedia (the clinic's PT default).
  return dept === 'PT' ? `${base} - PT PEDIA` : base
}

async function fetchAbsences(fromYmd: string, patientId?: string): Promise<HubAbsence[]> {
  const key = process.env.EXTERNAL_API_KEY ?? ''
  if (!key) throw new Error('The Operations Hub link is not configured on this server.')
  const qs = new URLSearchParams({ from: fromYmd })
  if (patientId) qs.set('patientId', patientId)
  const res = await fetch(`${HUB}/api/internal/absences?${qs}`, {
    headers: { 'x-api-key': key }, cache: 'no-store', signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`The Operations Hub answered ${res.status}`)
  return ((await res.json()).absences ?? []) as HubAbsence[]
}

export interface UnchargedOptions {
  /** Show bookings on or after this day (default: FLAG_START). */
  since?: string
  patientId?: string
  /** Branch filter on the booking's branch (SANDBOX_EAST / SANDBOX_GREENHILLS). */
  branch?: string
}

/**
 * Every fee-bearing absence since `since`, with whether it was charged. The
 * flag is the UNCHARGED ones; the rest are returned so the tab can show what
 * was settled and how.
 */
export async function loadFeeBearingAbsences(db: Db, opts: UnchargedOptions = {}): Promise<FlaggedAbsence[]> {
  const since = opts.since && /^\d{4}-\d{2}-\d{2}$/.test(opts.since) ? opts.since : FLAG_START
  // The allowance looks back 180 days from each booking, so read that much earlier.
  const lookFrom = addDays(since, -WINDOW_DAYS)
  const absences = await fetchAbsences(lookFrom, opts.patientId)
  if (!absences.length) return []
  const patientIds = [...new Set(absences.map(a => a.patientId))]

  const [orders, feeServices, records, wallets] = await Promise.all([
    db.order.findMany({
      where: { patientId: { in: patientIds }, status: { not: 'VOIDED' }, transactionDate: { gte: new Date(`${lookFrom}T00:00:00+08:00`) } },
      select: {
        id: true, orderNumber: true, patientId: true, transactionDate: true, orderType: true,
        items: { select: { name: true, quantity: true } },
        payments: { select: { method: true, walletId: true } },
      },
    }),
    db.service.findMany({
      where: { isActive: true, OR: FEE_PREFIXES.map(p => ({ name: { startsWith: p, mode: 'insensitive' as const } })) },
      select: { id: true, name: true, department: true, price: true, branch: true },
    }),
    db.parkedGlCharge.findMany({
      where: { scheduleId: { in: absences.map(a => a.scheduleId) } },
      select: { scheduleId: true, status: true, orderId: true, waiveReason: true, reason: true },
    }),
    db.digitalWallet.findMany({
      where: { patientId: { in: patientIds }, walletType: 'GL' },
      select: { id: true, patientId: true, patientName: true, balance: true, isActive: true, usedUpAt: true },
    }),
  ])

  const svc = new Map<string, { id: string; price: number }>()
  for (const s of feeServices) {
    const k = `${s.name.trim().toUpperCase()}|${s.department.trim().toUpperCase()}`
    if (!svc.has(k) || s.branch === 'ALL') svc.set(k, { id: s.id, price: Number(s.price) })
  }
  const walletById = new Map(wallets.map(w => [w.id, w]))
  const openLetters = new Map<string, number[]>() // patient → balances of letters that can still be charged
  for (const w of wallets) if (w.isActive && !w.usedUpAt) {
    if (!openLetters.has(w.patientId)) openLetters.set(w.patientId, [])
    openLetters.get(w.patientId)!.push(Number(w.balance))
  }
  const recordBySchedule = new Map(records.map(r => [r.scheduleId!, r]))
  const recordOrderIds = new Set(records.map(r => r.orderId).filter(Boolean) as string[])
  const linkedOrderIds = new Set(absences.map(a => a.log?.paidOrderId).filter(Boolean) as string[])
  const orderNumberById = new Map(orders.map(o => [o.id, o.orderNumber]))

  // Per patient: sessions charged per day, fee orders, GL sessions (for the letter in use).
  const sessionsByDay = new Map<string, number>()
  const feeOrders = new Map<string, { id: string; orderNumber: number; day: string }[]>()
  const glSessions = new Map<string, { day: string; walletId: string }[]>()
  for (const o of orders) {
    const pid = o.patientId!
    const day = ymdManila(o.transactionDate)
    const feeUnits = o.items.filter(i => isFeeLineName(i.name)).reduce((s, i) => s + Math.max(1, Math.round(Number(i.quantity) || 1)), 0)
    const session = o.orderType === 'SERVICE' && o.items.some(i => !isFeeLineName(i.name))
    if (session) {
      const n = o.items.filter(i => !isFeeLineName(i.name)).reduce((s, i) => s + (Number(i.quantity) || 1), 0)
      sessionsByDay.set(`${pid}|${day}`, (sessionsByDay.get(`${pid}|${day}`) ?? 0) + Math.max(1, n))
      for (const p of o.payments) if (p.method === 'GL' && p.walletId) {
        if (!glSessions.has(pid)) glSessions.set(pid, [])
        glSessions.get(pid)!.push({ day, walletId: p.walletId })
      }
    }
    // One entry per fee line unit: an order carrying two fees settles two bookings.
    if (feeUnits && !recordOrderIds.has(o.id) && !linkedOrderIds.has(o.id)) {
      if (!feeOrders.has(pid)) feeOrders.set(pid, [])
      for (let i = 0; i < feeUnits; i++) feeOrders.get(pid)!.push({ id: o.id, orderNumber: o.orderNumber, day })
    }
  }
  for (const list of feeOrders.values()) list.sort((a, b) => a.day.localeCompare(b.day))

  // A cancelled booking on a day the patient was still charged for more sessions
  // than they attended was moved within the day, not missed.
  const byPatientDay = new Map<string, HubAbsence[]>()
  for (const a of absences) {
    const k = `${a.patientId}|${a.date}`
    if (!byPatientDay.has(k)) byPatientDay.set(k, [])
    byPatientDay.get(k)!.push(a)
  }
  const movedWithinDay = new Set<string>()
  for (const [k, list] of byPatientDay) {
    const spare = Math.max(0, (sessionsByDay.get(k) ?? 0) - list[0].confirmedSameDay)
    list.slice().sort((x, y) => x.startTime.localeCompare(y.startTime)).slice(0, spare).forEach(a => movedWithinDay.add(a.scheduleId))
  }

  // Before the cutover, a therapist with several bookings called off in one
  // day was out — the clinic's cancellation, not the patient's.
  const perTherapistDay = new Map<string, number>()
  for (const a of absences) {
    const k = `${a.therapist.toUpperCase()}|${a.date}`
    perTherapistDay.set(k, (perTherapistDay.get(k) ?? 0) + 1)
  }
  const therapistOut = (a: HubAbsence) => a.date < FLAG_CUTOVER && a.log?.initiatedBy !== 'PATIENT'
    && (perTherapistDay.get(`${a.therapist.toUpperCase()}|${a.date}`) ?? 0) >= THERAPIST_OUT_THRESHOLD

  const out: FlaggedAbsence[] = []
  const byPatient = new Map<string, HubAbsence[]>()
  for (const a of absences) {
    if (!byPatient.has(a.patientId)) byPatient.set(a.patientId, [])
    byPatient.get(a.patientId)!.push(a)
  }

  for (const [pid, list] of byPatient) {
    list.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    const counted: string[] = []
    const feeBearing: { a: HubAbsence; why: string }[] = []
    for (const a of list) {
      if (movedWithinDay.has(a.scheduleId)) continue
      if (a.log && a.log.countsToward === false) continue // waived when logged / therapist-initiated
      if (therapistOut(a)) continue
      if (a.status === 'NO_SHOW') { feeBearing.push({ a, why: 'no-show' }); continue }
      if (a.log?.paymentType === 'GL') { feeBearing.push({ a, why: 'guarantee-letter session — no free cancellations' }); continue }
      const inWindow = counted.filter(d => daysBetween(d, a.date) <= WINDOW_DAYS).length
      if (inWindow >= FREE_CANCELLATIONS) feeBearing.push({ a, why: `${ordinal(inWindow + 1)} cancellation in ${WINDOW_DAYS} days` })
      counted.push(a.date)
    }

    const pool = [...(feeOrders.get(pid) ?? [])]
    for (const { a, why } of feeBearing) {
      const dept = (a.department ?? '').toUpperCase()
      if (!FEE_DEPTS.has(dept)) continue
      // Paired even when before `since`, so an old fee isn't spent on a newer booking.
      let state: AbsenceState = 'UNCHARGED'
      let orderNumber: number | null = null
      let note: string | null = null
      const rec = recordBySchedule.get(a.scheduleId)
      if (rec) {
        state = rec.status === 'WAIVED' ? 'WAIVED' : rec.status === 'CHARGED' ? 'PAID' : 'PARKED'
        orderNumber = rec.orderId ? orderNumberById.get(rec.orderId) ?? null : null
        note = rec.status === 'WAIVED' ? rec.waiveReason : rec.status === 'CHARGED' ? null : rec.reason
      } else if (a.log?.paidOrderId) {
        state = 'PAID'; orderNumber = a.log.paidOrderNumber ?? orderNumberById.get(a.log.paidOrderId) ?? null
        note = 'linked at the till'
      } else {
        const i = pool.findIndex(f => f.day >= a.date)
        if (i >= 0) { state = 'PAID'; orderNumber = pool[i].orderNumber; note = 'matched by date'; pool.splice(i, 1) }
      }
      if (a.date < since) continue

      const feeName = feeNameFor(a, dept)
      const s = svc.get(`${feeName}|${dept}`) ?? null
      // The letter in use: the GL session nearest the booking, within 30 days
      // (or any, when the booking was logged as GL-funded).
      const gls = glSessions.get(pid) ?? []
      const near = gls.length
        ? gls.reduce((best, g) => Math.abs(daysBetween(g.day, a.date)) < Math.abs(daysBetween(best.day, a.date)) ? g : best)
        : null
      const isGl = a.log?.paymentType === 'GL' || (near && Math.abs(daysBetween(near.day, a.date)) <= 30)
      const w = isGl && near ? walletById.get(near.walletId) : undefined
      const amount = s?.price ?? 0
      // Before the cutover only what a guarantee letter can still take is chased.
      if (a.date < FLAG_CUTOVER && state === 'UNCHARGED'
        && !(isGl && (openLetters.get(pid) ?? []).some(b => b + 0.005 >= amount))) continue
      if (a.date < FLAG_CUTOVER && !isGl && state !== 'UNCHARGED') continue
      out.push({
        scheduleId: a.scheduleId,
        patientId: pid,
        patientName: a.patientName,
        branch: BRANCH_FROM_HUB[(a.branch ?? '').toUpperCase()] ?? (a.branch ?? ''),
        date: a.date,
        startTime: a.startTime,
        status: a.status,
        detail: `${ABSENCE_LABEL[a.status] ?? a.status.toLowerCase()} on ${longDate(a.date)} (${dept}, ${a.therapist || 'therapist not named'})`,
        department: dept,
        therapist: a.therapist,
        logged: !!a.log,
        why,
        feeServiceId: s?.id ?? null,
        feeName,
        amount,
        state,
        orderNumber,
        note,
        gl: w ? {
          walletId: w.id, letter: w.patientName, balance: Number(w.balance),
          canCharge: w.isActive && !w.usedUpAt && Number(w.balance) + 0.005 >= amount,
        } : null,
      })
    }
  }
  const scoped = opts.branch ? out.filter(r => r.branch === opts.branch) : out
  return scoped.sort((x, y) => x.patientName.localeCompare(y.patientName) || x.date.localeCompare(y.date))
}
