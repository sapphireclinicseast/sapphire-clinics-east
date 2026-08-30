// Expand a provider's weekly availability windows into concrete upcoming
// 1-hour visit slots (Asia/Manila), minus anything already booked.

const DAY_MS = 86_400_000
export function ymdToDate(ymd: string): Date { return new Date(`${ymd}T00:00:00.000Z`) }
export function manilaTodayYmd(): string { return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) }
function toMin(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
function toHHMM(x: number): string { return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` }

export interface Weekly { dayOfWeek: number; startTime: string; endTime: string }
export interface Slot { date: string; startTime: string; endTime: string }

// booked = Set of "YYYY-MM-DD|HH:MM" the provider already has.
// stepMin = cadence between bookable visits: 60 (back-to-back) or 120 when the
// provider leaves a 1-hour travel gap between visits.
export function upcomingSlots(weekly: Weekly[], booked: Set<string>, horizonDays = 14, stepMin = 60): Slot[] {
  const step = stepMin >= 120 ? 120 : 60
  const out: Slot[] = []
  const start = ymdToDate(manilaTodayYmd()).getTime()
  for (let d = 0; d < horizonDays; d++) {
    const dateObj = new Date(start + d * DAY_MS)
    const dow = dateObj.getUTCDay()
    const ymd = dateObj.toISOString().slice(0, 10)
    for (const w of weekly) {
      if (w.dayOfWeek !== dow) continue
      const s = toMin(w.startTime), e = toMin(w.endTime)
      for (let m = s; m + 60 <= e; m += step) {
        const st = toHHMM(m)
        if (booked.has(`${ymd}|${st}`)) continue
        out.push({ date: ymd, startTime: st, endTime: toHHMM(m + 60) })
      }
    }
  }
  out.sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)))
  return out
}

// Is a concrete (date, time) a valid, currently-open slot for these weekly rules?
export function isValidSlot(weekly: Weekly[], booked: Set<string>, date: string, time: string, stepMin = 60): boolean {
  return upcomingSlots(weekly, booked, 14, stepMin).some((s) => s.date === date && s.startTime === time)
}
