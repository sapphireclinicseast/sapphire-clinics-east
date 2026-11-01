// VAT on an expense entry (PettyCashEntry: petty cash, one-time, recurring).
// vatable 'VAT' means the gross includes 12% VAT. vatPortion narrows that to
// part of the gross — an ads invoice that is partly VAT and partly non-VAT
// stays one row with one attachment (Hannah, 2026-11-01). vatPortion is the
// VAT-inclusive amount that carries VAT; null means all of the gross does
// (every entry before mixed entries existed).
//
// Every place that splits an entry into net / input VAT goes through here, so
// a mixed entry reads the same in the grid, the P&L, input VAT, EWT and RFPs.
// `vatPortion` is a required key so a query that forgets to select it fails
// the type check instead of quietly treating a mixed entry as all-VAT.

export const VAT_FACTOR = 1.12

type Amount = number | string | { toString(): string } | null | undefined
export interface VatSource {
  vatable: string | null | undefined
  grossAmount: Amount
  vatPortion: Amount
}

const n = (v: Amount) => Number(v ?? 0) || 0

/** True when only part of the gross carries VAT. */
export const isMixedVat = (e: VatSource) => e.vatable === 'VAT' && e.vatPortion != null

/** The VAT-inclusive part of the gross (0 for non-VAT, the whole gross for all-VAT). */
export function vatBase(e: VatSource): number {
  if (e.vatable !== 'VAT') return 0
  const gross = n(e.grossAmount)
  if (e.vatPortion == null) return gross
  return Math.sign(gross) * Math.min(Math.abs(n(e.vatPortion)), Math.abs(gross))
}

/**
 * Net of VAT. `amount` defaults to the entry's gross; pass a part of it (a CEO
 * branch allocation) to get that part's net at the entry's VAT mix.
 */
export function netOfVat(e: VatSource, amount?: number): number {
  const gross = n(e.grossAmount)
  const amt = amount ?? gross
  if (e.vatable !== 'VAT') return amt
  if (e.vatPortion == null) return amt / VAT_FACTOR
  const base = vatBase(e)
  const net = gross - base + base / VAT_FACTOR
  if (amount == null) return net
  return gross ? amt * (net / gross) : amt
}

/** Input VAT inside `amount` (default: the entry's gross). */
export const vatOf = (e: VatSource, amount?: number) => (amount ?? n(e.grossAmount)) - netOfVat(e, amount)
