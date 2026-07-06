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
