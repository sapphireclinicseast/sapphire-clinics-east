/**
 * Price tiers for products we sell, from the product's current COGS.
 *
 * Hannah's rule (2026-11-13): "COGS + N×" means cost PLUS N times cost, and every
 * tier is rounded UP to the next ₱10, so no tier ever sits below its formula.
 *
 *   Lowest    COGS + 2× COGS  = COGS × 3
 *   Standard  COGS + 6× COGS  = COGS × 7   ← the price POS charges
 *   Highest   COGS + 8× COGS  = COGS × 9
 *
 * Worked: COGS ₱100 → ₱300 / ₱700 / ₱900. COGS ₱123.45 → ₱370.35 → ₱380,
 * ₱864.15 → ₱870, ₱1,111.05 → ₱1,120.
 */

export const PRICE_TIERS = [
  { key: 'lowest', label: 'Lowest', multiple: 3, rule: 'COGS + 2× COGS' },
  { key: 'standard', label: 'Standard', multiple: 7, rule: 'COGS + 6× COGS' },
  { key: 'highest', label: 'Highest', multiple: 9, rule: 'COGS + 8× COGS' },
] as const

export type TierKey = (typeof PRICE_TIERS)[number]['key']
export type Tiers = Record<TierKey, number>

/**
 * Round a peso amount UP to the next ₱10. Works in whole centavos so float noise
 * can't push an exact ₱700.00 to ₱710 (e.g. 0.1 × 7 = 0.7000000000000001).
 */
export function roundUpTo10(amount: number): number {
  const cents = Math.round(amount * 100)
  return Math.ceil(cents / 1000) * 10
}

/** The three tiers for a COGS, or null when there is no cost to price from. */
export function priceTiers(cogs: number | null | undefined): Tiers | null {
  const c = Number(cogs)
  if (!Number.isFinite(c) || c <= 0) return null
  return {
    lowest: roundUpTo10(c * 3),
    standard: roundUpTo10(c * 7),
    highest: roundUpTo10(c * 9),
  }
}
