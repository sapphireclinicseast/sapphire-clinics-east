// Where a Guarantee Letter sits in the Office of the President's payment
// process — the Detailed GL first column (Hannah, 2026-11-03). PAID is the last
// step (11/04): pick it by hand, and any letter with a recorded payment shows it.
export const GL_STAGES = ['STAR OFFICE', 'BILLING', 'ACCOUNTING', 'CASHIER', 'PAID'] as const
export type GlStage = typeof GL_STAGES[number]

// Which office issued the letter — the Detailed GL "Agency" column (Hannah,
// 2026-11-15: "dropdown options are STAR and ODESFA"). STAR is the Office of the
// President's medical assistance (GL Nos. PHD-/SJC-…, paid in DTS …-STAR-nnn
// batches); it was typed as "OP" until 11/15, when every OP letter became STAR.
export const GL_AGENCIES = ['STAR', 'ODESFA'] as const
export type GlAgency = typeof GL_AGENCIES[number]
export const AGENCY_ERROR = `Agency must be one of: ${GL_AGENCIES.join(', ')}`

/** Blank clears; anything else must be one of GL_AGENCIES. */
export function parseAgency(v: unknown): { ok: true; value: GlAgency | null } | { ok: false } {
  const s = String(v ?? '').trim().toUpperCase()
  if (!s) return { ok: true, value: null }
  return (GL_AGENCIES as readonly string[]).includes(s) ? { ok: true, value: s as GlAgency } : { ok: false }
}
