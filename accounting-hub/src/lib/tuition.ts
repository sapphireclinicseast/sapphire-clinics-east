// AR → Tuition rules, shared by the API and the screens (no server imports).
//
// A Class Hub promissory note may delay a tuition payment by at most 3 months,
// and never past the end of the semester the payment belongs to (Hannah,
// 2026-10-31). Semesters follow the Class Hub Pay page grid: Semester 1 =
// Jun–Aug, Semester 2 = Sep–Dec, Semester 3 = Jan–Apr of the school year that
// starts in June. May is between school years and belongs to no semester.
// All dates are Manila calendar days written as YYYY-MM-DD.

export const MAX_DELAY_MONTHS = 3
export const MAX_PLAN_PAYMENTS = 6
export const REMIND_DAYS = 7

export const SEMESTERS = [
  { n: 1, label: 'Semester 1', months: 'Jun–Aug' },
  { n: 2, label: 'Semester 2', months: 'Sep–Dec' },
  { n: 3, label: 'Semester 3', months: 'Jan–Apr' },
] as const

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Today in Manila. */
export function todayManila(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
}

/** A stored DateTime as its Manila calendar day. */
export function toYmd(d: Date | string): string {
  return new Date(new Date(d).getTime() + 8 * 3600_000).toISOString().slice(0, 10)
}

/** Noon in Manila, so the stored instant reads as the same day everywhere. */
export function fromYmd(s: string): Date {
  return new Date(`${s}T04:00:00.000Z`)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Same day n months later, clamped to the month's end (Nov 30 + 3 → Feb 28). */
export function addMonths(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  const ny = Math.floor(t / 12), nm = (t % 12) + 1
  return ymd(ny, nm, Math.min(d, lastDay(ny, nm)))
}

/** The school year that starts in June of `startYear` (2026 → "SY 2026–2027"). */
export const schoolYearLabel = (startYear: number) => `SY ${startYear}–${startYear + 1}`

export function currentSchoolYear(today = todayManila()): number {
  const [y, m] = today.split('-').map(Number)
  return m >= 6 ? y : y - 1
}

export function semesterRange(schoolYear: number, semester: number): { start: string; end: string } {
  if (semester === 1) return { start: ymd(schoolYear, 6, 1), end: ymd(schoolYear, 8, 31) }
  if (semester === 2) return { start: ymd(schoolYear, 9, 1), end: ymd(schoolYear, 12, 31) }
  return { start: ymd(schoolYear + 1, 1, 1), end: ymd(schoolYear + 1, 4, 30) }
}

/** Which semester a date falls in; null for May. */
export function semesterOf(date: string): { schoolYear: number; semester: 1 | 2 | 3 } | null {
  const [y, m] = date.split('-').map(Number)
  if (m >= 6 && m <= 8) return { schoolYear: y, semester: 1 }
  if (m >= 9) return { schoolYear: y, semester: 2 }
  if (m <= 4) return { schoolYear: y - 1, semester: 3 }
  return null
}

export function semesterLabel(schoolYear: number, semester: number): string {
  const s = SEMESTERS.find(x => x.n === semester)
  return `${s?.label ?? `Semester ${semester}`} (${s?.months ?? ''}) · ${schoolYearLabel(schoolYear)}`
}

/** The last date a promissory may push a payment originally due on `originalDue` to. */
export function latestAllowedDate(originalDue: string): { date: string; limitedBy: 'months' | 'semester' } | null {
  const sem = semesterOf(originalDue)
  if (!sem) return null
  const byMonths = addMonths(originalDue, MAX_DELAY_MONTHS)
  const { end } = semesterRange(sem.schoolYear, sem.semester)
  return byMonths <= end ? { date: byMonths, limitedBy: 'months' } : { date: end, limitedBy: 'semester' }
}

export interface PlanInput {
  originalDueDate: string
  amount: number
  items: { dueDate: string; amount: number }[]
}

/** Why a schedule breaks the promissory rules, or null when it follows them. */
export function planProblem(p: PlanInput): string | null {
  if (!isYmd(p.originalDueDate)) return 'Enter the original due date.'
  const sem = semesterOf(p.originalDueDate)
  if (!sem) return 'The original due date falls in May, which is between school years and in no semester.'
  if (!(p.amount > 0)) return 'Enter the amount the note covers.'
  if (!p.items.length) return 'Add at least one scheduled payment.'
  if (p.items.length > MAX_PLAN_PAYMENTS) return `A plan can have at most ${MAX_PLAN_PAYMENTS} payments.`
  const { start } = semesterRange(sem.schoolYear, sem.semester)
  const limit = latestAllowedDate(p.originalDueDate)!
  for (const [i, it] of p.items.entries()) {
    const n = `Payment ${i + 1}`
    if (!isYmd(it.dueDate)) return `${n}: enter a date.`
    if (!(it.amount > 0)) return `${n}: enter an amount.`
    if (it.dueDate < start) return `${n}: ${it.dueDate} is before the semester starts (${start}).`
    if (it.dueDate > limit.date) {
      return limit.limitedBy === 'semester'
        ? `${n}: ${it.dueDate} is past the end of the semester (${limit.date}). A promissory cannot carry a payment into the next semester.`
        : `${n}: ${it.dueDate} is more than ${MAX_DELAY_MONTHS} months after the original due date (latest ${limit.date}).`
    }
  }
  const total = Math.round(p.items.reduce((s, it) => s + it.amount, 0) * 100) / 100
  if (Math.abs(total - p.amount) > 0.005) return `The payments add up to ₱${total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}, not the ₱${p.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} the note covers.`
  return null
}

/** Request body for creating or editing a plan (item ids only on edit). */
export interface PlanBody {
  studentId?: string
  promissoryNoteId?: string
  originalDueDate?: string
  amount?: number
  notes?: string
  items?: { id?: string; dueDate: string; amount: number }[]
}

export const cleanPlanItems = (items: PlanBody['items']) =>
  (items || []).map(i => ({ id: i.id, dueDate: String(i.dueDate || ''), amount: Math.round(Number(i.amount) * 100) / 100 }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

export type ItemState = 'PAID_ON_TIME' | 'PAID_LATE' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING'

export function itemState(dueDate: string, paidOn: string | null, today = todayManila()): ItemState {
  if (paidOn) return paidOn <= dueDate ? 'PAID_ON_TIME' : 'PAID_LATE'
  const d = daysBetween(today, dueDate)
  if (d < 0) return 'OVERDUE'
  return d <= REMIND_DAYS ? 'DUE_SOON' : 'UPCOMING'
}

export const ITEM_STATE_LABEL: Record<ItemState, string> = {
  PAID_ON_TIME: 'Paid on time', PAID_LATE: 'Paid late', OVERDUE: 'Overdue', DUE_SOON: 'Due soon', UPCOMING: 'Scheduled',
}

/** Class Hub branch ↔ ledger branch. */
export const CLASS_TO_LEDGER_BRANCH: Record<string, string> = { EAST: 'SANDBOX_EAST', GREENHILLS: 'SANDBOX_GREENHILLS' }
export const LEDGER_TO_CLASS_BRANCH: Record<string, string> = { SANDBOX_EAST: 'EAST', SANDBOX_GREENHILLS: 'GREENHILLS' }

/** The Class Hub payment row opened to collect a plan item (POS queue id = `clsp_<this>`). */
export const planItemPaymentId = (itemId: string) => `tpp_${itemId}`

export const normName = (s: string | null | undefined) => (s || '').toUpperCase().replace(/[^A-Z]/g, '')
