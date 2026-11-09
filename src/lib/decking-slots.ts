// What rows a consultant's working day is divided into.
//
// Almost everyone is one patient per whole hour, which is what the board drew
// for its entire life and what `slotsPerDay = null` still means. But some MD and
// Psychology consults do not take an hour, and front desk are told a COUNT —
// "Dr Lim sees 5 on a Wednesday" — never a slot length. So the count is what is
// stored and the length is worked out backwards from the working window.
//
// Every consumer goes through here. The grid, the "x of y booked" counter, the
// capacity totals and the open-slot maths each used to call generateHourlySlots
// separately, and a consultant whose day is not hourly has to look the same to
// all four or the board disagrees with its own header.

export const toMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

export const fromMinutes = (n: number): string =>
  `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`

export interface DaySlot { startTime: string; endTime: string }

/**
 * Divide a window into `count` equal slots.
 *
 * The last slot is carried out to `endTime` rather than to its computed edge,
 * so 13:00–17:30 split five ways ends at 17:30 and not at 17:29 — minutes lost
 * to rounding would otherwise leave a sliver of unbookable time at the end of
 * every day.
 */
export function splitSpan(startTime: string, endTime: string, count: number): DaySlot[] {
  const from = toMinutes(startTime)
  const to = toMinutes(endTime)
  if (!startTime || !endTime || to <= from || count < 1) return []
  const each = Math.floor((to - from) / count)
  if (each < 1) return []
  return Array.from({ length: count }, (_, i) => ({
    startTime: fromMinutes(from + i * each),
    endTime: i === count - 1 ? endTime : fromMinutes(from + (i + 1) * each),
  }))
}

/** One row per whole hour from the start hour up to the end hour. */
export function hourlySlots(startTime: string, endTime: string): DaySlot[] {
  if (!startTime || !endTime) return []
  const sh = Number(startTime.slice(0, 2))
  const eh = Number(endTime.slice(0, 2))
  const out: DaySlot[] = []
  for (let h = sh; h < eh; h++) {
    out.push({ startTime: `${String(h).padStart(2, '0')}:00`, endTime: `${String(h + 1).padStart(2, '0')}:00` })
  }
  return out
}

/**
 * The rows for one working day. `slotsPerDay` null/0 keeps the hourly board.
 */
export function daySlots(
  startTime: string, endTime: string, slotsPerDay?: number | null,
): DaySlot[] {
  return slotsPerDay && slotsPerDay > 0
    ? splitSpan(startTime, endTime, slotsPerDay)
    : hourlySlots(startTime, endTime)
}

/** Just the start times — the key every slot row is addressed by. */
export function dayStarts(
  startTime: string, endTime: string, slotsPerDay?: number | null,
): string[] {
  return daySlots(startTime, endTime, slotsPerDay).map(s => s.startTime)
}

/** Minutes per slot, for the "54 min each" read-out. 0 when nothing is set. */
export function slotMinutes(
  startTime: string, endTime: string, slotsPerDay?: number | null,
): number {
  const [first] = daySlots(startTime, endTime, slotsPerDay)
  return first ? toMinutes(first.endTime) - toMinutes(first.startTime) : 0
}

/** True when a day's rows do not all sit on the hour. */
export function isCustomLength(slotsPerDay?: number | null): boolean {
  return !!slotsPerDay && slotsPerDay > 0
}
