// The classification front desk picks when logging a cancellation.
//
// Shared so the Accounting Hub's POS prompt offers exactly the same six as the
// Patient Relationship tab. They were duplicated as a literal in the client
// before; a seventh added in one place and not the other would produce logs the
// other screen cannot describe.

export const CANCELLATION_TYPES = [
  'Cancellation >24 hrs (VALID)',
  'Cancellation >24 hrs (INVALID)',
  'Late Cancellation <24 hrs (VALID)',
  'Late Cancellation <24 hrs (INVALID)',
  'Retainer (VALID)',
  'Retainer (INVALID)',
] as const

export type CancellationType = (typeof CANCELLATION_TYPES)[number]

export function isCancellationType(v: unknown): v is CancellationType {
  return typeof v === 'string' && (CANCELLATION_TYPES as readonly string[]).includes(v)
}

/** "(VALID)" in the label is what the tab means by a valid cancellation. */
export function validityFromType(type: string): boolean {
  return /\(VALID\)/i.test(type)
}
