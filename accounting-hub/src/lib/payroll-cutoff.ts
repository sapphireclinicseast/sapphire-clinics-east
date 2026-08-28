/**
 * The payroll cutoff window — when a cutoff period actually starts and ends.
 *
 * "2026-08-1" is NOT August 1st-15th. The first cutoff of a month starts on the
 * 26th of the PREVIOUS month and ends on the 10th; the second runs the 11th to
 * the 25th. Anything that reads work by date for a cutoff has to use these
 * bounds or it collects the wrong fortnight, which is exactly what the
 * mentorship bridge was doing before this module existed.
 *
 * NOTE ON SETTINGS: the payroll screen lets an admin change these day numbers,
 * but it stores them in the browser's localStorage, so the server cannot read
 * them — every server-side caller necessarily uses the defaults below. They are
 * the same numbers the payroll screen defaults to, so the two agree today. If
 * the cutoff days are ever actually changed in that screen, these constants have
 * to be changed with them, and the honest fix at that point is to persist the
 * settings server-side rather than to keep two copies in step by hand.
 */

export interface CutoffSettings {
  /** Day the 1st cutoff starts (26 = the 26th). */
  c1StartDay: number
  /** Whether that start day falls in the previous month. */
  c1StartPrevMonth: boolean
  /** Day the 1st cutoff ends. */
  c1EndDay: number
  /** Day the 2nd cutoff starts. */
  c2StartDay: number
  /** End the 2nd cutoff on the last day of the month, whatever it is. */
  c2EndLastDay: boolean
  /** Day the 2nd cutoff ends, when not running to the last day. */
  c2EndDay: number
}

export const DEFAULT_CUTOFF_SETTINGS: CutoffSettings = {
  c1StartDay: 26, c1StartPrevMonth: true, c1EndDay: 10,
  c2StartDay: 11, c2EndLastDay: false, c2EndDay: 25,
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
/** Day 0 of the next month is the last day of this one. */
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/**
 * Resolve a cutoff period ("YYYY-MM-1" | "YYYY-MM-2") to inclusive calendar
 * bounds as YYYY-MM-DD. Returns null if the period is malformed.
 */
export function cutoffRange(
  cutoffPeriod: string,
  settings: CutoffSettings = DEFAULT_CUTOFF_SETTINGS,
): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})-([12])$/.exec(cutoffPeriod)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  const half = Number(m[3])

  if (half === 1) {
    // The 1st cutoff reaches back into the previous month, and in January that
    // is the previous December — the year has to step back with the month.
    const startMonth = settings.c1StartPrevMonth ? (month === 1 ? 12 : month - 1) : month
    const startYear = settings.c1StartPrevMonth && month === 1 ? year - 1 : year
    return {
      from: ymd(startYear, startMonth, settings.c1StartDay),
      to: ymd(year, month, settings.c1EndDay),
    }
  }

  const endDay = settings.c2EndLastDay ? lastDayOf(year, month) : settings.c2EndDay
  return {
    from: ymd(year, month, settings.c2StartDay),
    to: ymd(year, month, endDay),
  }
}
