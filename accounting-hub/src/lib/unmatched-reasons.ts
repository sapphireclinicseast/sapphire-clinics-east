// Why an HMO paid us more than the sessions on a payment — the Reason column of
// AR → HMO → Unmatched Payments (Hannah 2026-11-19: "add the reason column to
// unmatched payments").
//
// Stored on ARPayment.overpaymentReasons as [{ reason, amount, note }]; the
// amounts split the payment's overpayment, and whatever they leave over reads
// "Not yet identified". A payment with nothing stored gets a suggestion: an
// excess that is 12% of the matched sessions is VAT the HMO added on top of our
// VAT-exempt sessions (held as owed to the HMO, Hannah 11/18).

export const UNMATCHED_REASONS = [
  { key: 'VAT', label: 'VAT added by the HMO', short: 'VAT', bg: '#FEF3C7', fg: '#92400E' },
  { key: 'PAID_TWICE', label: 'Paid twice (LOA already paid)', short: 'Paid twice', bg: '#FEE2E2', fg: '#991B1B' },
  { key: 'ABOVE_BILLED', label: 'Paid above what we billed', short: 'Paid above billed', bg: '#E0E7FF', fg: '#3730A3' },
  { key: 'OTHER', label: 'Other', short: 'Other', bg: '#F1F5F9', fg: '#334155' },
] as const

export type UnmatchedReasonKey = (typeof UNMATCHED_REASONS)[number]['key']
export interface UnmatchedReason { reason: UnmatchedReasonKey; amount: number; note?: string }

export const REASON_WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

export const reasonMeta = (key: string) => UNMATCHED_REASONS.find(r => r.key === key) ?? UNMATCHED_REASONS[UNMATCHED_REASONS.length - 1]

const r2 = (x: number) => Math.round(x * 100) / 100

/** Stored JSON → clean reason lines (unknown keys and non-positive amounts dropped). */
export function readReasons(raw: unknown): UnmatchedReason[] {
  if (!Array.isArray(raw)) return []
  const keys = new Set<string>(UNMATCHED_REASONS.map(r => r.key))
  return raw
    .filter((x): x is { reason: string; amount: unknown; note?: unknown } => !!x && typeof x === 'object' && keys.has((x as { reason?: string }).reason || ''))
    .map(x => ({ reason: x.reason as UnmatchedReasonKey, amount: r2(Number(x.amount) || 0), ...(typeof x.note === 'string' && x.note.trim() ? { note: x.note.trim().slice(0, 300) } : {}) }))
    .filter(x => x.amount > 0)
}

/** A suggestion for a payment with no reasons stored: 12% of the matched sessions = VAT. */
export function suggestReasons(unmatched: number, matched: number): UnmatchedReason[] {
  if (unmatched > 0 && matched > 0 && Math.abs(unmatched - matched * 0.12) <= 1) {
    return [{ reason: 'VAT', amount: r2(unmatched), note: `12% of the ${matched.toLocaleString('en-PH', { minimumFractionDigits: 2 })} matched sessions` }]
  }
  return []
}

/** One line of text for exports: "VAT ₱8,412.00; Paid twice ₱5,700.00 (note)". */
export function reasonsText(reasons: UnmatchedReason[], unmatched: number): string {
  const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const parts = reasons.map(r => `${reasonMeta(r.reason).short} ${peso(r.amount)}${r.note ? ` (${r.note})` : ''}`)
  const rest = r2(unmatched - reasons.reduce((s, r) => s + r.amount, 0))
  if (rest > 0.005) parts.push(`Not yet identified ${peso(rest)}`)
  return parts.join('; ')
}
