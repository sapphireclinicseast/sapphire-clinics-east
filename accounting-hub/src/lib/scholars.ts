// Month-schedule helpers for scholarship awards. A "monthKey" is "YYYY-MM".

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function isMonthKey(mk: unknown): mk is string {
  return typeof mk === 'string' && /^\d{4}-\d{2}$/.test(mk)
}

export function monthKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Add `delta` months to a "YYYY-MM" key.
export function addMonths(mk: string, delta: number): string {
  const [y, m] = mk.split('-').map(Number)
  const idx = y * 12 + (m - 1) + delta
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

// The list of month keys a scholar is scheduled to be paid (start .. start+n-1).
export function scheduleMonths(startMonth?: string | null, n?: number | null): string[] {
  if (!isMonthKey(startMonth) || !n || n < 1) return []
  const out: string[] = []
  for (let i = 0; i < Math.min(n, 600); i++) out.push(addMonths(startMonth, i))
  return out
}

export function endMonth(startMonth?: string | null, n?: number | null): string | null {
  if (!isMonthKey(startMonth) || !n || n < 1) return null
  return addMonths(startMonth, n - 1)
}

// "2025-08" -> "Aug 2025"
export function mkLabel(mk?: string | null): string {
  if (!isMonthKey(mk)) return ''
  const [y, m] = mk.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

// The UTC date a monthKey's release falls on, given a day-of-month (clamped).
export function releaseDate(mk: string, day?: number | null): Date {
  const [y, m] = mk.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const d = Math.min(Math.max(day || 1, 1), lastDay)
  return new Date(Date.UTC(y, m - 1, d))
}
