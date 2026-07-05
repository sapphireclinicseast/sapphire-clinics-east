// Shared asset-classification helpers, used by Asset Management and by the
// "add to Asset Management" prompt on petty-cash / one-time-expense entries.
// A petty-cash/expense entry's accountTitle is stored as "<number> <title>"
// (e.g. "2050 Furniture and Fixtures"); when that number is a PPE classification
// the entry represents an asset purchase.

export const ASSET_CLASSIFICATION_CODES = ['2020', '2030', '2040', '2050', '2060', '2070', '2080', '2090', '2100']

export const ASSET_CLASSIFICATION_LABELS: Record<string, string> = {
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

/** Returns the classification code ("2050") if the account title is a PPE account, else null. */
export function assetClassFromAccountTitle(accountTitle?: string | null): string | null {
  if (!accountTitle) return null
  const code = accountTitle.trim().split(/\s+/)[0]
  return ASSET_CLASSIFICATION_CODES.includes(code) ? code : null
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
