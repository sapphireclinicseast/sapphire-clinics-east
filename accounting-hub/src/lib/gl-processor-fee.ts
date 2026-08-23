/**
 * The fee owed to the GL processor on a Guarantee Letter.
 *
 * One definition, shared by the Detailed GL sheet and the payout endpoint. It
 * has to be shared: the sheet is what staff read the amount off, and the
 * endpoint is what actually pays it. Two copies of this arithmetic would let a
 * displayed figure and a paid figure drift apart without anything failing.
 */

const num = (v: unknown) => Number(v ?? 0) || 0

/**
 * Rate applied when a letter has none recorded. It is 25% now and was 20% on
 * older letters, so the rate is stored per letter; this is only the fallback for
 * letters nobody has set one on yet.
 */
export const DEFAULT_PROCESSOR_RATE = 25

export function processorRateOf(rate: unknown): number {
  const r = num(rate)
  return r > 0 ? r : DEFAULT_PROCESSOR_RATE
}

/** Zero when there is no SOA amount to charge against — nothing is owed yet. */
export function processorFeeOf(soaAmount: unknown, rate: unknown): number {
  const a = num(soaAmount)
  if (a <= 0) return 0
  // Round to centavos so the RFP total is a payable amount rather than a float.
  return Math.round(a * (processorRateOf(rate) / 100) * 100) / 100
}
