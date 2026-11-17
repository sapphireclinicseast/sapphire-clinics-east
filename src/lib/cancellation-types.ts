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

// ── Who called it off ────────────────────────────────────────────────────────
//
// A cancellation the clinic caused is not the patient's cancellation. Counting
// it against their free allowance, or toward slot removal, punishes a patient
// for the clinic's own change of plan — and the clinic separately wants to
// know how often it is the one calling off, which no free-text waiver reason
// could ever be totalled.
//
// No-shows carry no initiator. A no-show is patient-initiated by definition:
// nobody rang, nobody came.

export const INITIATORS = ['PATIENT', 'THERAPIST'] as const
export type Initiator = (typeof INITIATORS)[number]

export function isInitiator(v: unknown): v is Initiator {
  return typeof v === 'string' && (INITIATORS as readonly string[]).includes(v)
}

export const INITIATOR_LABEL: Record<string, string> = {
  PATIENT: 'Patient-initiated',
  THERAPIST: 'Therapist-initiated',
}

/**
 * The waiver reason written for a therapist-initiated cancellation.
 *
 * Reusing the existing waiver machinery rather than adding a second way to not
 * count something: every count, report and fee rule in the Hub already honours
 * countsToward, so attribution and exemption cannot drift apart later.
 */
export const THERAPIST_EXCLUDE_REASON = 'Therapist-initiated — not the patient’s cancellation'

/**
 * The stored `type` for a log that is not a patient-initiated cancellation.
 *
 * The six fee types describe how much notice a PATIENT gave, which is not a
 * question that has an answer when the clinic called it off, or when a session
 * was moved rather than dropped. A fee type here would read as a fee owed.
 */
export const NON_FEE_TYPE: Record<string, string> = {
  THERAPIST_CANCELLED: 'Cancelled by therapist',
  RESCHEDULED: 'Rescheduled',
}

// ── What paid for the session ────────────────────────────────────────────────

export const COVERAGE = ['CASH', 'HMO', 'GL'] as const
export type Coverage = (typeof COVERAGE)[number]

export function isCoverage(v: unknown): v is Coverage {
  return typeof v === 'string' && (COVERAGE as readonly string[]).includes(v)
}

export const COVERAGE_LABEL: Record<string, string> = {
  CASH: 'Cash',
  HMO: 'HMO',
  GL: 'Guarantee letter',
}

/**
 * Whether this session's funding carries the two free cancellations.
 *
 * A guarantee letter buys named sessions. A patient who calls one off has
 * spent one of them, so there is nothing to be free with — the clinic charges
 * from the first cancellation, not the third.
 *
 * Unknown coverage (rows logged before the question existed) keeps the
 * allowance. Those were charged under it, and quietly re-reading a year of
 * history as fee-bearing would invent debts nobody agreed.
 */
export function hasFreeAllowance(coverage: string | null | undefined): boolean {
  return coverage !== 'GL'
}
