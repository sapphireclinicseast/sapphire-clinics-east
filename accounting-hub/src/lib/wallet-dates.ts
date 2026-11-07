import { todayManila } from '@/lib/tuition'

// SCEI's records begin in 2024, so an earlier Date Obtained is a typo: 0025 for
// 2025, 2016 for 2026. Those made GL AR Days read 17,283 days. Next year is the
// latest allowed, since a downpayment or package can be dated ahead.
export const EARLIEST_OBTAINED = '2024-01-01'

export const latestObtained = (today = todayManila()) => `${Number(today.slice(0, 4)) + 1}-12-31`

/** Why a Date Obtained can't be saved, or null when it can (blank is allowed). */
export function obtainedDateError(value: unknown, today = todayManila()): string | null {
  if (value == null || value === '') return null
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/.exec(value) : null
  const ymd = m ? `${m[1]}-${m[2]}-${m[3]}` : ''
  const time = m ? Date.parse(`${ymd}T00:00:00Z`) : NaN
  // A real calendar day: Feb 30 and month 13 don't survive the round trip.
  const real = !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === ymd
  const latest = latestObtained(today)
  if (!real || ymd < EARLIEST_OBTAINED || ymd > latest) {
    return `Date Obtained${ymd ? ` ${ymd}` : ''} has an impossible year. Use a date from ${EARLIEST_OBTAINED.slice(0, 4)} to ${latest.slice(0, 4)}.`
  }
  return null
}
