// Where a Guarantee Letter sits in the Office of the President's payment
// process — the Detailed GL first column (Hannah, 2026-11-03). PAID is the last
// step (11/04): pick it by hand, and any letter with a recorded payment shows it.
export const GL_STAGES = ['STAR OFFICE', 'BILLING', 'ACCOUNTING', 'CASHIER', 'PAID'] as const
export type GlStage = typeof GL_STAGES[number]

// Which office issued the letter — the Detailed GL "Agency" column (Hannah,
// 2026-11-15: "dropdown options are STAR and ODESFA"). STAR is the Office of the
// President's medical assistance (GL Nos. PHD-/SJC-…, paid in DTS …-STAR-nnn
// batches); it was typed as "OP" until 11/15, when every OP letter became STAR.
// LGU (added the same day, "yes make it LGU") is a local government's letter,
// e.g. the Municipality of Cainta's.
//
// The list is open (Hannah, 11/15: "allow this to be edited too if we wanna add
// a different agency later on"): these three are always offered, and any other
// agency typed on a letter or wallet joins every dropdown from then on — the
// list is the defaults plus whatever the data already uses (/api/accounts-
// receivable/gl-agencies), so there is nothing separate to keep in sync.
export const GL_AGENCIES = ['STAR', 'ODESFA', 'LGU'] as const
export type GlAgency = string
export const AGENCY_ERROR = 'Agency must be 2–40 characters: letters, numbers, spaces and & . - / ( )'

/** How an agency name is stored: trimmed, single-spaced, upper case. */
export function normalizeAgency(v: unknown): string {
  return String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

/** Blank clears; anything else must read as an agency name (see AGENCY_ERROR). */
export function parseAgency(v: unknown): { ok: true; value: GlAgency | null } | { ok: false } {
  const s = normalizeAgency(v)
  if (!s) return { ok: true, value: null }
  return /^[A-Z0-9][A-Z0-9 &.\-/()']{1,39}$/.test(s) ? { ok: true, value: s } : { ok: false }
}

/** The dropdown list: STAR, ODESFA, LGU first, then every other agency in use, A–Z. */
export function agencyOptions(used: Iterable<string | null | undefined>): string[] {
  const extra = new Set<string>()
  for (const u of used) {
    const s = normalizeAgency(u)
    if (s && !(GL_AGENCIES as readonly string[]).includes(s)) extra.add(s)
  }
  return [...GL_AGENCIES, ...[...extra].sort()]
}

// Where the patient is actually treated (Hannah 11/17: some East GL patients are
// seen at Greenhills). Blank = at the letter's own branch.
export const GL_TREATED_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS'] as const
export const TREATED_ERROR = 'Treated at must be East, Greenhills or blank'

/** Blank clears (treated at the letter's own branch); otherwise East or Greenhills. */
export function parseTreatedBranch(v: unknown): { ok: true; value: string | null } | { ok: false } {
  const s = String(v ?? '').trim()
  if (!s) return { ok: true, value: null }
  return (GL_TREATED_BRANCHES as readonly string[]).includes(s) ? { ok: true, value: s } : { ok: false }
}

/** Sort key for the Agency column: the dropdown's order, letters with no agency last. */
export function agencySortKey(agency: string | null | undefined): string {
  const s = normalizeAgency(agency)
  if (!s) return '2'
  const i = (GL_AGENCIES as readonly string[]).indexOf(s)
  return i >= 0 ? `0${i}` : `1${s}`
}
