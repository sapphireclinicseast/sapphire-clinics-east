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
 * How a consultant's day is shaped, beyond "one patient per whole hour".
 *
 * Two ways of saying it, because the clinic is told it two ways. Front desk
 * are told a COUNT — "Dr Lim sees 5 on a Wednesday" — and the window is
 * divided backwards into that many. A doctor is told a LENGTH — "two hours
 * each, and an hour for lunch" — and the window is walked forwards in steps of
 * that length, stepping over the break.
 *
 * Dr Colet is the second kind: 9:30 to 4:30, two hours a patient, lunch from
 * 11:30. As a count that is unsayable — four patients across seven hours makes
 * 1h45 each and lands her consults at 11:15 and 2:45, which is not her day and
 * leaves the break in the wrong place.
 */
export interface DayShape {
  /** Patients a day; the window is split into this many equal slots. */
  slotsPerDay?: number | null
  /** Minutes per patient. Takes precedence over slotsPerDay when both are set. */
  slotMinutes?: number | null
  /** "12:30" — when the break starts. Ignored unless breakMinutes is set too. */
  breakStart?: string | null
  /** How long the break runs. */
  breakMinutes?: number | null
}

/**
 * Slots of a fixed LENGTH from the start of the day, stepping over the break.
 *
 * A slot never straddles the break: reaching it, the day resumes at the far
 * side. A slot that would run past the end of the window is not offered —
 * half an appointment is not an appointment.
 */
export function fixedLengthSlots(
  startTime: string, endTime: string, minutes: number,
  breakStart?: string | null, breakMinutes?: number | null,
): DaySlot[] {
  const from = toMinutes(startTime)
  const to = toMinutes(endTime)
  if (!startTime || !endTime || to <= from || minutes < 1) return []

  const bFrom = breakStart && breakMinutes && breakMinutes > 0 ? toMinutes(breakStart) : null
  const bTo = bFrom !== null ? bFrom + (breakMinutes as number) : null

  const out: DaySlot[] = []
  let at = from
  // Bounded by the window, not by trust in the arithmetic: a zero-length step
  // would otherwise spin here for ever.
  for (let guard = 0; at + minutes <= to && guard < 200; guard++) {
    if (bFrom !== null && bTo !== null && at + minutes > bFrom && at < bTo) {
      at = bTo                       // the break — resume on the far side
      continue
    }
    out.push({ startTime: fromMinutes(at), endTime: fromMinutes(at + minutes) })
    at += minutes
  }
  return out
}

/**
 * The rows for one working day. Nothing set keeps the hourly board, which is
 * what almost the whole roster is.
 */
export function daySlots(
  startTime: string, endTime: string, shape?: number | null | DayShape,
): DaySlot[] {
  const s: DayShape = typeof shape === 'number' || shape == null ? { slotsPerDay: shape } : shape
  if (s.slotMinutes && s.slotMinutes > 0) {
    return fixedLengthSlots(startTime, endTime, s.slotMinutes, s.breakStart, s.breakMinutes)
  }
  if (s.slotsPerDay && s.slotsPerDay > 0) {
    // A break with a patient COUNT: the break comes out of the window first,
    // and the count is shared across what is left.
    if (s.breakStart && s.breakMinutes && s.breakMinutes > 0) {
      const bFrom = toMinutes(s.breakStart)
      const bTo = bFrom + s.breakMinutes
      const before = splitSpanWithin(startTime, fromMinutes(bFrom), endTime, s.slotsPerDay)
      if (before) return before

      // The patients are shared BY AVAILABLE TIME, not half and half.
      //
      // Half and half is what makes the day look wrong. A doctor giving
      // 9 to 7 with an hour from noon has three hours before the break and
      // six after; splitting eight patients four-four produced consults of
      // 45 minutes in the morning and 90 in the afternoon — the same patient,
      // twice the appointment, depending which side of lunch they landed.
      // Sharing by minutes gives three before and five after, at 60 and 72,
      // which is as even as whole consults allow.
      const beforeMins = Math.max(0, bFrom - toMinutes(startTime))
      const afterMins = Math.max(0, toMinutes(endTime) - bTo)
      const total = beforeMins + afterMins
      if (total <= 0) return splitSpan(startTime, endTime, s.slotsPerDay)

      // At least one each side while there is room for one, so a short
      // morning does not vanish entirely into the afternoon.
      let nBefore = Math.round((beforeMins / total) * s.slotsPerDay)
      nBefore = Math.min(s.slotsPerDay, Math.max(0, nBefore))
      if (nBefore === 0 && beforeMins > 0 && s.slotsPerDay > 1) nBefore = 1
      if (nBefore === s.slotsPerDay && afterMins > 0 && s.slotsPerDay > 1) nBefore = s.slotsPerDay - 1

      return [
        ...(nBefore > 0 ? splitSpan(startTime, fromMinutes(bFrom), nBefore) : []),
        ...(s.slotsPerDay - nBefore > 0 ? splitSpan(fromMinutes(bTo), endTime, s.slotsPerDay - nBefore) : []),
      ]
    }
    return splitSpan(startTime, endTime, s.slotsPerDay)
  }
  return hourlySlots(startTime, endTime)
}

/** Null unless the whole count fits before the break — then the day is simple. */
function splitSpanWithin(
  startTime: string, breakAt: string, endTime: string, count: number,
): DaySlot[] | null {
  if (toMinutes(breakAt) >= toMinutes(endTime)) return splitSpan(startTime, endTime, count)
  return null
}

/** Just the start times — the key every slot row is addressed by. */
export function dayStarts(
  startTime: string, endTime: string, shape?: number | null | DayShape,
): string[] {
  return daySlots(startTime, endTime, shape).map(s => s.startTime)
}

/** Minutes per slot, for the "54 min each" read-out. 0 when nothing is set. */
export function slotMinutes(
  startTime: string, endTime: string, shape?: number | null | DayShape,
): number {
  const [first] = daySlots(startTime, endTime, shape)
  return first ? toMinutes(first.endTime) - toMinutes(first.startTime) : 0
}

/** True when a day's rows do not all sit on the hour. */
export function isCustomLength(shape?: number | null | DayShape): boolean {
  if (typeof shape === 'number' || shape == null) return !!shape && shape > 0
  return !!(
    (shape.slotMinutes && shape.slotMinutes > 0)
    || (shape.slotsPerDay && shape.slotsPerDay > 0)
    || (shape.breakMinutes && shape.breakMinutes > 0)
  )
}
