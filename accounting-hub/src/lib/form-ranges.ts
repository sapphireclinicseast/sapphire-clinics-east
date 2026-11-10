// Control-number range helpers for pre-numbered forms (pads). Shared by the
// Partner Distribution API and the signed-acknowledgment API so both draw
// down on-hand and flag "Not on hand" the same way.

// Numeric value of a control number (ignores prefix / zero-padding).
export function controlToInt(s: string): number | null {
  const digits = String(s ?? '').replace(/[^0-9]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}

// pcs in an inclusive control-number range, or null if invalid.
export function rangeQuantity(fromControl: string, toControl: string): number | null {
  const a = controlToInt(fromControl)
  const b = controlToInt(toControl)
  if (a == null || b == null) return null
  const qty = b - a + 1
  return qty >= 1 ? qty : null
}

// Merge intervals and test whether [a,b] is fully covered by their union.
export function coveredByUnion(intervals: Array<[number, number]>, a: number, b: number): boolean {
  if (a > b) return false
  const sorted = [...intervals].sort((x, y) => x[0] - y[0])
  let cursor = a
  for (const [lo, hi] of sorted) {
    if (lo > cursor) break // gap before the next interval → not covered
    if (hi >= cursor) cursor = Math.max(cursor, hi + 1)
    if (cursor > b) return true
  }
  return cursor > b
}

// Numeric intervals from rows that carry fromControl / toControl.
export function toIntervals(rows: Array<{ fromControl: string; toControl: string }>): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const r of rows) {
    const lo = controlToInt(r.fromControl), hi = controlToInt(r.toControl)
    if (lo != null && hi != null) out.push([lo, hi])
  }
  return out
}

// True when [a,b] shares at least one number with any interval.
export function overlapsAny(intervals: Array<[number, number]>, a: number, b: number): boolean {
  return intervals.some(([lo, hi]) => lo <= b && hi >= a)
}
