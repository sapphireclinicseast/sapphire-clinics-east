// Where a Guarantee Letter sits in the Office of the President's payment
// process — the Detailed GL first column (Hannah, 2026-11-03).
export const GL_STAGES = ['STAR OFFICE', 'BILLING', 'ACCOUNTING', 'CASHIER'] as const
export type GlStage = typeof GL_STAGES[number]
