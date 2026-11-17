// How long Guarantee Letters sit at each OP office, from the dated stage history
// (GlStageEvent). Hannah 2026-11-17 asked "historically, how long/how many days from
// accounting to cashier?" and nothing recorded when a stage changed, so the history
// starts that day: every letter got a BASELINE event for the stage it already had,
// and every change since is logged with its date.
//
// Pure functions, no React or Prisma, so the Detailed GL page and any report can
// share them.
import type { GlLetterRow } from './gl-letters'

export interface GlStageEvent {
  glCaseId?: string | null
  walletId?: string | null
  fromStage?: string | null
  /** The stage entered; null when it was cleared. */
  stage?: string | null
  changedAt: string
  /** ROW | BULK | BASELINE */
  source: string
}

export const DAY_MS = 86_400_000

/** BASELINE marks where tracking began, not when the letter got there. */
export const isBaseline = (e: GlStageEvent) => e.source === 'BASELINE'

export interface StageEventIndex {
  byCase: Map<string, GlStageEvent[]>
  byWallet: Map<string, GlStageEvent[]>
  /** The day tracking began (earliest BASELINE event), for the screen's footnotes. */
  trackedSince: string | null
}

/** Groups the events by the record they were logged on, oldest first. */
export function indexStageEvents(events: GlStageEvent[]): StageEventIndex {
  const byCase = new Map<string, GlStageEvent[]>()
  const byWallet = new Map<string, GlStageEvent[]>()
  let trackedSince: string | null = null
  const sorted = [...events].sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime())
  for (const e of sorted) {
    if (isBaseline(e) && (!trackedSince || e.changedAt < trackedSince)) trackedSince = e.changedAt
    // A case-level event belongs to the case only. The wallet id on it is just a
    // note of what the case was tagged to; the wallet's own stage did not change.
    if (e.glCaseId) push(byCase, e.glCaseId, e)
    else if (e.walletId) push(byWallet, e.walletId, e)
  }
  return { byCase, byWallet, trackedSince }
}
function push(m: Map<string, GlStageEvent[]>, k: string, e: GlStageEvent) {
  const list = m.get(k)
  if (list) list.push(e)
  else m.set(k, [e])
}

/**
 * The history behind the stage this row shows. A row's stage is its entry's own
 * when the entry has one, otherwise its wallet's (gl-letters rowOf), so the history
 * comes from the same record — mixing the two would time one record's stage with
 * the other's dates.
 */
export function eventsForRow(r: GlLetterRow, idx: StageEventIndex): GlStageEvent[] {
  const caseOwnsStage = !!r.caseId && (r.source?.glStage != null || !r.wallet)
  if (caseOwnsStage) return idx.byCase.get(r.caseId!) ?? []
  return r.wallet ? idx.byWallet.get(r.wallet.id) ?? [] : []
}

/**
 * When the letter reached the stage it is at now, and whether that date is only a
 * floor (the BASELINE: it was already there when tracking began). Null for a paid
 * letter, a letter with no stage, or one whose history does not end at its
 * current stage.
 */
export function stageSince(r: GlLetterRow, events: GlStageEvent[]): { since: string; floor: boolean } | null {
  if (r.paid || !r.glStage || !events.length) return null
  const last = events[events.length - 1]
  if (last.stage !== r.glStage) return null
  return { since: last.changedAt, floor: isBaseline(last) }
}

/** Whole days since a moment, counted in completed days, like AR running days. */
export function daysSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS))
}

/**
 * Days from entering `from` to entering `to`, for one letter. Measured from its
 * latest entry into `from` before reaching `to`, so a letter sent back and
 * re-forwarded is timed from the re-forwarding. A start that is a BASELINE is
 * unknown (the letter was already there), so that span is not measured at all.
 */
export function spanBetween(events: GlStageEvent[], from: string, to: string): number | null {
  let start: number | null = null
  for (const e of events) {
    if (e.stage === from) start = isBaseline(e) ? null : new Date(e.changedAt).getTime()
    else if (e.stage === to && start != null) return (new Date(e.changedAt).getTime() - start) / DAY_MS
  }
  return null
}

/**
 * When the letter last entered `stage`, unless that was the BASELINE. Used for the
 * last leg, Cashier → payment, which ends at the cheque rather than at an event.
 */
export function enteredAt(events: GlStageEvent[], stage: string): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].stage === stage) return isBaseline(events[i]) ? null : events[i].changedAt
  }
  return null
}

/** Mean of the measured spans, with how many letters it covers. */
export function average(days: (number | null)[]): { avg: number; n: number } | null {
  const ok = days.filter((d): d is number => d != null && d >= 0)
  return ok.length ? { avg: ok.reduce((a, b) => a + b, 0) / ok.length, n: ok.length } : null
}
