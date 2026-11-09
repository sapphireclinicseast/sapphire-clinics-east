// Is an intern rotating with us on a given date?
//
// Interns come on placement for a fixed stretch — a month, in practice — and HR
// records it as whole MONTHS, not dates: the staff profile shows "Start Month"
// and "End Month" (<input type="month">) where a regular employee shows Date
// Hired and Contract Expiration. Those two inputs write the same
// Staff.dateHired / Staff.contractExpiry columns, which is why the comparison
// here is month-granular at both ends: the stored day-of-month is an artifact
// of how a "YYYY-MM" value gets parsed into a timestamp and means nothing.
//
// So a rotation of "2026-11" runs from 1 November to 30 November inclusive. An
// intern is on placement for every day in that span and nobody outside it.
//
// This was written twice before — once in the Clinic Schedule intern picker and
// once, missing, in Decking, where a finished intern kept their hours and their
// tab in the Google Sheet forever. One definition now, because "are they still
// with us" has to mean the same thing on every board.

/** Local YYYY-MM-DD. Not toISOString(), which is UTC and rolls over early. */
export function localTodayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Last calendar day of a "YYYY-MM" — 28, 29, 30 or 31. */
function lastDayOf(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return String(new Date(y, m, 0).getDate()).padStart(2, '0')
}

const monthOf = (v: Date | string): string =>
  (typeof v === 'string' ? v : v.toISOString()).split('T')[0].slice(0, 7)

/**
 * Does the placement described by these two HR months cover `forDate`
 * (YYYY-MM-DD, defaulting to today)?
 *
 * A missing end is open-ended rather than expired: an intern whose End Month
 * nobody filled in keeps working. Dropping them off the board on the strength
 * of a blank field would quietly delete real hours, which is worse than
 * carrying someone a few days too long.
 */
export function internWindowCovers(
  dateHired: Date | string | null | undefined,
  contractExpiry: Date | string | null | undefined,
  forDate?: string,
): boolean {
  const d = forDate || localTodayStr()
  if (dateHired) {
    const start = monthOf(dateHired)
    if (d < `${start}-01`) return false
  }
  if (contractExpiry) {
    const end = monthOf(contractExpiry)
    if (d > `${end}-${lastDayOf(end)}`) return false
  }
  return true
}

/** The rotation as front desk should read it: "Nov 2026", or "Nov – Dec 2026". */
export function internWindowLabel(
  dateHired: Date | string | null | undefined,
  contractExpiry: Date | string | null | undefined,
): string {
  const fmt = (ym: string) => {
    const [y, m] = ym.split('-').map(Number)
    return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`
  }
  const a = dateHired ? monthOf(dateHired) : ''
  const b = contractExpiry ? monthOf(contractExpiry) : ''
  if (a && b) return a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`
  if (a) return `from ${fmt(a)}`
  if (b) return `until ${fmt(b)}`
  return ''
}
