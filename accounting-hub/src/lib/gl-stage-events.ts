// Rows for GlStageEvent, the dated history of Guarantee Letter stages (Hannah
// 2026-11-17: "track stage dates"). Shared by the single-row and bulk gl-case
// routes so both log a change the same way. Only real changes are logged: saving
// the stage a letter already has adds nothing.

export interface StageChange {
  glCaseId?: string | null
  walletId?: string | null
  fromStage: string | null | undefined
  stage: string | null | undefined
}

export function stageEventRows(changes: StageChange[], changedById: string, source: 'ROW' | 'BULK') {
  return changes
    .filter(c => (c.fromStage ?? null) !== (c.stage ?? null))
    .map(c => ({
      glCaseId: c.glCaseId ?? null,
      walletId: c.walletId ?? null,
      fromStage: c.fromStage ?? null,
      stage: c.stage ?? null,
      changedById,
      source,
    }))
}
