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

/**
 * Departments with their own set prices, outside the tier rule (Hannah 2026-11-18:
 * "do not affect the merchandise with the rule because we have a set pricing for
 * this already. they dont have the tier pricing"): MER merchandise and EDU books.
 * They get no tiers, no "vs Standard" warning, and Apply / tier clicks skip them.
 */
export const SET_PRICE_DEPARTMENTS = ['MER', 'EDU']
export const hasSetPrice = (department: string | null | undefined): boolean =>
  SET_PRICE_DEPARTMENTS.includes((department || '').trim().toUpperCase())

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

/**
 * What a product is priced at: one of the three tiers, or 'custom' — a price
 * typed in the item form that matches none of them (Hannah 11/18). Stored on
 * InventoryItem.priceTier with NULL meaning Standard.
 */
export type PriceChoice = TierKey | 'custom'

const CHOICES: PriceChoice[] = ['lowest', 'standard', 'highest', 'custom']

/** Read a stored priceTier; anything unknown or NULL is Standard. */
export const readPriceChoice = (v: unknown): PriceChoice =>
  CHOICES.includes(v as PriceChoice) ? (v as PriceChoice) : 'standard'

/** The value to store for a choice (Standard is the default, kept as NULL). */
export const storePriceChoice = (c: PriceChoice): string | null => (c === 'standard' ? null : c)

/** Which tier a typed price lands on, else 'custom' (also when there is no COGS to price from). */
export function choiceForPrice(price: number | null | undefined, tiers: Tiers | null): PriceChoice {
  if (price == null || !tiers) return 'custom'
  const p = Math.round(Number(price) * 100)
  for (const t of PRICE_TIERS) if (Math.round(tiers[t.key] * 100) === p) return t.key
  return 'custom'
}
