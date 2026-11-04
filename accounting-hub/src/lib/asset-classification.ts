// Shared asset-classification helpers, used by Asset Management and by the
// "add to Asset Management" prompt on petty-cash / one-time-expense entries.
// A petty-cash/expense entry's accountTitle is stored as "<number> <title>"
// (e.g. "2050 Furniture and Fixtures"); when that number is a PPE classification
// the entry represents an asset purchase.

// Depreciating PPE classifications.
export const PPE_CLASSIFICATION_LABELS: Record<string, string> = {
  '2020': 'Buildings',
  '2030': 'Clinic Appliances',
  '2040': 'Educational Toys, Books, and Others',
  '2050': 'Furniture and Fixtures',
  '2060': 'Office Equipment and Electronic Devices',
  '2070': 'PPE and Lease Improvements',
  '2080': 'Therapy Equipment',
  '2090': 'Treatment and Assessment Tools',
  '2100': 'Vehicles',
}

// Non-depreciating non-current assets (intangibles + other non-current assets).
// These are carried at cost on the Balance Sheet with NO depreciation.
export const NON_DEPRECIATING_CLASSIFICATION_LABELS: Record<string, string> = {
  '3010': 'Goodwill',
  '3020': 'Trademark',
  '3110': 'Security Deposit',
  '3120': 'SEC Registration',
  '3130': 'Construction Bond',
}

export const ASSET_CLASSIFICATION_LABELS: Record<string, string> = {
  ...PPE_CLASSIFICATION_LABELS,
  ...NON_DEPRECIATING_CLASSIFICATION_LABELS,
}

export const ASSET_CLASSIFICATION_CODES = Object.keys(ASSET_CLASSIFICATION_LABELS)

/** True if the classification depreciates (PPE); false for intangibles / other non-current assets. */
export function isDepreciatingClassification(code: string): boolean {
  return code in PPE_CLASSIFICATION_LABELS
}

/**
 * Depreciation is off: a depreciating class with a cost but ₱0 a month. These are
 * listed for custody and audits only, not yet in the books (AHEA-2024-0248 on,
 * Hannah 2026-11-04), so no save may turn depreciation on or post a purchase by
 * itself. Someone turns it on in Edit Asset once the booking is decided.
 */
export function isDepreciationOff(a: { classification: string; totalAmount: unknown; monthlyDepreciation: unknown }): boolean {
  return isDepreciatingClassification(a.classification) && Number(a.totalAmount) > 0 && Number(a.monthlyDepreciation) === 0
}

/**
 * What an Edit Asset save stores as the monthly depreciation. It stays as stored
 * unless the cost, life or class changed: the form always offers cost ÷ life, and
 * a record can rightly hold less when part of it is not in the books yet.
 */
export function monthlyDepreciationOnSave(
  prior: { classification: string; totalAmount: unknown; yearsDepreciation: unknown; monthlyDepreciation: unknown } | null,
  next: { classification: string; totalAmount: unknown; yearsDepreciation: unknown; monthlyDepreciation: unknown },
  depreciationOff?: unknown,
): number {
  if (!prior) return Number(next.monthlyDepreciation)
  if (isDepreciationOff(prior)) return depreciationOff === false ? Number(next.monthlyDepreciation) : 0
  const sameBasis = prior.classification === next.classification
    && Number(prior.yearsDepreciation) === Number(next.yearsDepreciation)
    && Math.round(Number(prior.totalAmount) * 100) === Math.round(Number(next.totalAmount) * 100)
  return sameBasis ? Number(prior.monthlyDepreciation) : Number(next.monthlyDepreciation)
}

/** Returns the classification code ("2050") if the account title is a PPE account, else null. */
export function assetClassFromAccountTitle(accountTitle?: string | null): string | null {
  if (!accountTitle) return null
  const code = accountTitle.trim().split(/\s+/)[0]
  return ASSET_CLASSIFICATION_CODES.includes(code) ? code : null
}

// ── Inventory classifications ─────────────────────────────────
// Petty-cash/expense entries whose account is an Inventory Asset account are
// inventory purchases → prompt to record in Inventory & Procurement.
export const INVENTORY_CLASSIFICATION_LABELS: Record<string, string> = {
  '1050': 'Inventory Asset',
  '1051': 'Inventory Asset CNY',
}

/** Returns the inventory account code ("1050") if the account title is an Inventory account, else null. */
export function inventoryClassFromAccountTitle(accountTitle?: string | null): string | null {
  if (!accountTitle) return null
  const code = accountTitle.trim().split(/\s+/)[0]
  return code in INVENTORY_CLASSIFICATION_LABELS ? code : null
}

// Map a petty-cash/expense department code to an Asset Management department name.
export const ENTRY_DEPT_TO_ASSET: Record<string, string> = {
  ADMIN: 'Admin',
  PT: 'Physical Therapy',
  OT: 'Occupational Therapy',
  SLP: 'Speech-Language Pathology',
  ST: 'Speech-Language Pathology',
  SPED: 'Special Education',
  PSYCH: 'Psychology',
  PSY: 'Psychology',
  MD: 'Medical Doctor',
  ORTHOSIS: 'Orthosis & Prosthesis',
}

/** Asset names are stored in capitals so the register reads consistently
 *  (Hannah, 2026-11-01: a mix of "BROOM SET" and "Broom set" looked awkward). */
export const assetName = (s: string) => s.trim().toUpperCase()

