// Where a Guarantee Letter sits in the Office of the President's payment
// process — the Detailed GL first column (Hannah, 2026-11-03). PAID is the last
// step (11/04): pick it by hand, and any letter with a recorded payment shows it.
export const GL_STAGES = ['STAR OFFICE', 'BILLING', 'ACCOUNTING', 'CASHIER', 'PAID'] as const
export type GlStage = typeof GL_STAGES[number]
