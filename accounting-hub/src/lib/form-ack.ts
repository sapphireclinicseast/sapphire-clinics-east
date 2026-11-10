// Signed acknowledgment of items a med rep hands out during coverage (the
// paper/PDF "For brochures, referral pads, giveaways and documents received
// during coverage" form). Shared by the signing page, the API and the PDF.
// Client-safe: no server imports here.

export interface AckBranch {
  /** URL slug: /acknowledge/<slug>. Keep stable — links and QR codes are printed. */
  slug: string
  /** Accounting Hub branch enum (FormReceipt / FormDistribution .branch). */
  branch: string
  name: string
  shortName: string
}

export const ACK_BRANCHES: AckBranch[] = [
  { slug: 'east', branch: 'SANDBOX_EAST', name: 'Aura Health Rehab — East', shortName: 'East Branch' },
  { slug: 'greenhills', branch: 'SANDBOX_GREENHILLS', name: 'Aura Health Rehab — Greenhills', shortName: 'Greenhills Branch' },
  { slug: 'verdana', branch: 'VERDANA_STORE', name: 'Verdana Rehab Solutions', shortName: 'Verdana Store' },
  { slug: 'institute', branch: 'AURA_INSTITUTE', name: 'Aura Health Institute', shortName: 'Aura Health Institute' },
]

/** Resolve a URL slug or a branch enum to its config. */
export function resolveAckBranch(v: string | null | undefined): AckBranch | null {
  if (!v) return null
  const key = String(v).trim().toLowerCase()
  return ACK_BRANCHES.find((b) => b.slug === key) ?? ACK_BRANCHES.find((b) => b.branch.toLowerCase() === key) ?? null
}

export function ackPath(branchEnum: string): string | null {
  const b = resolveAckBranch(branchEnum)
  return b ? `/acknowledge/${b.slug}` : null
}

// Items, in the order they sit on the paper form (left column, then right).
export const ACK_ITEMS = [
  { key: 'BROCHURE', label: 'Brochure' },
  { key: 'REFERRAL_PAD', label: 'Referral Pad' },
  { key: 'GIVEAWAY', label: 'Giveaway' },
  { key: 'DOCUMENTS', label: 'Documents / Letter' },
  { key: 'PROPOSAL', label: 'Proposal' },
] as const
export type AckItemKey = (typeof ACK_ITEMS)[number]['key']
export const ACK_ITEM_LABELS: Record<string, string> = Object.fromEntries(ACK_ITEMS.map((i) => [i.key, i.label]))

export const DEFAULT_DELIVERED_BY_TITLE = 'Business Development Officer'

// Who may open the signing link and submit (same as Partner Distribution writers).
export const ACK_WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'MEDREP', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
// Who may see signed acknowledgments and their PDFs (= who can open Inventory).
export const ACK_VIEW_ROLES = [...ACK_WRITE_ROLES, 'VIEWER']
// Who may delete a signed delivery (a signed record is evidence, so not the med rep / front desk).
export const ACK_DELETE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export interface AckPadRange { formType: string; fromControl: string; toControl: string; quantity: number }

/** Everything the PDF needs (also what the API stores). */
export interface AckPdfData {
  id: string
  branchName: string
  signedAt: Date
  institution: string
  recipientName: string
  recipientDesignation: string
  receivedBy: string
  receivedByDesignation: string
  items: string[]
  pads: AckPadRange[]
  remarks: string
  deliveredByName: string
  deliveredByTitle: string
  signaturePng: string // data:image/png;base64,…
}
