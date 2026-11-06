// Reports on exact dates, from the day detail the ledger engine returns with its
// `daily` option. Dates are "YYYY-MM-DD" and a range stays inside one calendar year,
// because the engine computes one year at a time.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parts = (date: string) => ({ y: +date.slice(0, 4), m: +date.slice(5, 7), d: +date.slice(8, 10) })
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

export type DailyRow = { dated?: Record<string, number>; undated?: number[] }

/**
 * A row's movement between two dates. Dated amounts count on their own day; an
 * undated one (payroll, depreciation, a monthly schedule) is spread evenly across
 * its month, so whole months come to exactly the month's figure.
 */
export function amountInDates(row: DailyRow, from: string, to: string): number {
  const a = parts(from), b = parts(to)
  const fromDay = from.slice(5), toDay = to.slice(5)
  let sum = 0
  for (const [day, v] of Object.entries(row.dated || {})) {
    if (day >= fromDay && day <= toDay) sum += v
  }
  for (let m = a.m; m <= b.m; m++) {
    const v = row.undated?.[m - 1]
    if (!v) continue
    const dim = daysInMonth(a.y, m)
    const lo = m === a.m ? a.d : 1
    const hi = m === b.m ? b.d : dim
    sum += (v * (hi - lo + 1)) / dim
  }
  return sum
}

/** The same month and day in another year; Feb 29 becomes Feb 28 where it doesn't exist. */
export function sameDateIn(date: string, year: number): string {
  if (!date) return ''
  const { m, d } = parts(date)
  const day = Math.min(d, daysInMonth(year, m))
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** "Nov 6, 2026", "Nov 1–6, 2026" or "Jan 15–Mar 20, 2026". */
export function datesLabel(from: string, to: string): string {
  const a = parts(from), b = parts(to)
  const start = `${MONTHS[a.m - 1]} ${a.d}`
  if (from === to) return `${start}, ${a.y}`
  return a.m === b.m ? `${start}–${b.d}, ${a.y}` : `${start}–${MONTHS[b.m - 1]} ${b.d}, ${a.y}`
}

/** True when the range starts or ends partway through a month. */
export function cutsMonth(from: string, to: string): boolean {
  const b = parts(to)
  return parts(from).d !== 1 || b.d !== daysInMonth(b.y, b.m)
}
