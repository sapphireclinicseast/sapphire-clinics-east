/**
 * Price tiers for products we sell, from the product's current COGS.
 *
 * Hannah's rule (2026-11-17): the tier IS a straight multiple of COGS, and every
 * tier is rounded UP to the next ₱10, so no tier ever sits below its formula.
 *
 *   Lowest    COGS × 3
 *   Standard  COGS × 6   ← the price POS charges (the "middle")
 *   Highest   COGS × 8
 *
 * COGS = current average landed unit cost. For a bundle it is the sum of its
 * components' costs (callers pass that in as `cogs`).
 *
 * Worked: COGS ₱100 → ₱300 / ₱600 / ₱800. COGS ₱123.45 → ₱370.35 → ₱380,
 * ₱740.70 → ₱750, ₱987.60 → ₱990.
 */

export const PRICE_TIERS = [
  { key: 'lowest', label: 'Lowest', multiple: 3, rule: 'COGS × 3' },
  { key: 'standard', label: 'Standard', multiple: 6, rule: 'COGS × 6' },
  { key: 'highest', label: 'Highest', multiple: 8, rule: 'COGS × 8' },
] as const

export type TierKey = (typeof PRICE_TIERS)[number]['key']
export type Tiers = Record<TierKey, number>

/**
 * Round a peso amount UP to the next ₱10. Works in whole centavos so float noise
 * can't push an exact ₱600.00 to ₱610 (e.g. 0.1 × 6 = 0.6000000000000001).
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
    standard: roundUpTo10(c * 6),
    highest: roundUpTo10(c * 8),
  }
}

/** Map a stored websitePriceTier value to its tier key (null when custom/unset). */
export function tierKeyFromValue(v: unknown): TierKey | null {
  if (v === 'LOW' || v === 'lowest') return 'lowest'
  if (v === 'STANDARD' || v === 'standard') return 'standard'
  if (v === 'HIGH' || v === 'highest') return 'highest'
  return null
}

/** Canonical stored value ('LOW'|'STANDARD'|'HIGH') for a tier key. */
export function tierValueFromKey(k: TierKey): string {
  return k === 'lowest' ? 'LOW' : k === 'standard' ? 'STANDARD' : 'HIGH'
}

/**
 * The selling price for a given COGS and stored tier value, or null when the
 * item has no tier (manual price) or no cost. Single source of truth shared by
 * the API (server recompute) and the storefront sync.
 */
export function priceForTier(cogs: number | null | undefined, tierValue: unknown): number | null {
  const key = tierKeyFromValue(tierValue)
  if (!key) return null
  const t = priceTiers(cogs)
  return t ? t[key] : null
}
