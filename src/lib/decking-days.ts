// Days of the week for the Decking module, in calendar order: Sunday → Saturday.
//
// One definition because there were three, and they disagreed. Per Day ran
// Sunday-first while the therapist boards and the SPED class board ran
// Monday-first, and the therapist grid did not sort at all — it rendered
// DeckingTherapistConfig.workDays in whatever order the checkboxes happened to
// be saved in, which is how a consultant ended up with Friday printed before
// Thursday.
//
// Anything that displays days should order them through DAYS or sortDays(),
// never by trusting the order they arrive in.

export interface DeckDay { key: string; label: string; short: string }

export const DAYS: DeckDay[] = [
  { key: 'SUN', label: 'Sunday',    short: 'Sun' },
  { key: 'MON', label: 'Monday',    short: 'Mon' },
  { key: 'TUE', label: 'Tuesday',   short: 'Tue' },
  { key: 'WED', label: 'Wednesday', short: 'Wed' },
  { key: 'THU', label: 'Thursday',  short: 'Thu' },
  { key: 'FRI', label: 'Friday',    short: 'Fri' },
  { key: 'SAT', label: 'Saturday',  short: 'Sat' },
]

export const DAY_KEYS: string[] = DAYS.map(d => d.key)
export const DAY_LABEL: Record<string, string> = Object.fromEntries(DAYS.map(d => [d.key, d.label]))
export const DAY_SHORT: Record<string, string> = Object.fromEntries(DAYS.map(d => [d.key, d.short]))

const ORDER: Record<string, number> = Object.fromEntries(DAY_KEYS.map((k, i) => [k, i]))

/**
 * Put a stored list of day keys into calendar order.
 *
 * Unknown keys sort last rather than being dropped: a value this file does not
 * recognise is still a day someone configured, and silently losing a work day
 * from a consultant's board would be worse than showing it at the end.
 */
export function sortDays(days: readonly string[] | null | undefined): string[] {
  if (!days) return []
  return [...days].sort((a, b) => (ORDER[a] ?? 99) - (ORDER[b] ?? 99))
}
