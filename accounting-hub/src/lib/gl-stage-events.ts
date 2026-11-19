// Rows for GlStageEvent, the dated history of Guarantee Letter stages (Hannah
// 2026-11-17: "track stage dates"). Shared by the single-row and bulk gl-case
// routes so both log a change the same way. Only real changes are logged: saving
// the stage a letter already has adds nothing.
//
// The date on an event is the day the letter moved to that office (Hannah
// 2026-11-20: "make sure to take note of the date of the movement to the next
// office"). A move is dated today unless whoever records it says it happened
// earlier (bulk "Moved on", or the Detailed GL "Moved to stage on" cell), since
// the paper often reaches the hub a day or two after the letter changed office.

export interface StageChange {
  glCaseId?: string | null
  walletId?: string | null
  fromStage: string | null | undefined
  stage: string | null | undefined
  /** When the letter moved; now when left out. */
  changedAt?: Date
}

export function stageEventRows(changes: StageChange[], changedById: string, source: 'ROW' | 'BULK') {
  return changes
    .filter(c => (c.fromStage ?? null) !== (c.stage ?? null))
    .map(c => ({
      glCaseId: c.glCaseId ?? null,
      walletId: c.walletId ?? null,
      fromStage: c.fromStage ?? null,
      stage: c.stage ?? null,
      ...(c.changedAt ? { changedAt: c.changedAt } : {}),
      changedById,
      source,
    }))
}

export const MOVED_ON_YMD = /^\d{4}-\d{2}-\d{2}$/

/** Manila calendar day of a moment, YYYY-MM-DD. */
export const manilaDay = (d: Date | string | number) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

/**
 * Why a move dated `day` can't be recorded, or null when it can. A move can't be
 * in the future, can't be before the letter's previous move (its history would
 * run backwards), and — for a letter that was already at the office when stage
 * dates began — can't be after that day, because it was already there.
 */
export function movedOnProblem(
  day: string,
  opts: { prevAt?: Date | null; notAfter?: Date | null; now?: Date } = {},
): string | null {
  const now = opts.now ?? new Date()
  if (!MOVED_ON_YMD.test(day) || Number.isNaN(new Date(`${day}T00:00:00+08:00`).getTime())) return 'Pick the date the letter moved'
  if (day > manilaDay(now)) return 'That date is in the future. Record the move once it has happened.'
  if (opts.prevAt && day < manilaDay(opts.prevAt)) {
    return `It only reached its previous office on ${fmtDay(manilaDay(opts.prevAt))}, so it can't have moved on before that`
  }
  if (opts.notAfter && day > manilaDay(opts.notAfter)) {
    return `It was already at this office when stage dates began on ${fmtDay(manilaDay(opts.notAfter))}, so the date must be on or before that`
  }
  return null
}

/**
 * The moment stored for a move dated `day`: the actual time when it is today,
 * otherwise Manila midnight of that day — nudged a second past the previous move
 * when both fall on the same day, so the history keeps its order.
 */
export function movedAtFor(day: string, prevAt: Date | null | undefined, now = new Date()): Date {
  if (day === manilaDay(now)) return prevAt && prevAt >= now ? new Date(prevAt.getTime() + 1000) : now
  const at = new Date(`${day}T00:00:00+08:00`)
  return prevAt && at <= prevAt ? new Date(prevAt.getTime() + 1000) : at
}

const fmtDay = (ymd: string) =>
  new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
