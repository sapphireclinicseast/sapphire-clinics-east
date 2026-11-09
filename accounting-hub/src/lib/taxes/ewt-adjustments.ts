// Overdeclared EWT (Hannah, 2026-11-09: "in case i overdeclared the tax for a
// person, allow me to make adjustments and manually input the additional in a
// month, and allow me to set which month it will offset from").
//
// One EwtAdjustment = two EWT items for the payee:
//   OVER   — +amount in overMonth (so that month's EWT shows what was filed)
//   OFFSET — −amount in offsetMonth (taken back from that month's remittance)
// Item ids are "adj:<id>:over" / "adj:<id>:offset" so the EWT tab and the
// tax RFP route can tick, remit and un-remit each half on its own.

export type AdjLeg = 'over' | 'offset'

export interface EwtAdjustmentRow {
  id: string
  payrollBranch: string
  payeeName: string
  overMonth: string
  offsetMonth: string
  amount: number | string | { toString(): string }
  note: string | null
  overRemitted: boolean
  offsetRemitted: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const ymLabel = (ym: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  return m ? `${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}` : ym
}
export const isYm = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)

export const adjItemId = (id: string, leg: AdjLeg) => `adj:${id}:${leg}`
export function parseAdjItemId(itemId: string): { id: string; leg: AdjLeg } | null {
  const m = /^adj:(.+):(over|offset)$/.exec(String(itemId))
  return m ? { id: m[1], leg: m[2] as AdjLeg } : null
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** The two EWT items of an adjustment, in the shape /api/taxes/ewt-items returns. */
export function adjustmentItems(a: EwtAdjustmentRow) {
  const amt = r2(Number(a.amount))
  const adj = { id: a.id, overMonth: a.overMonth, offsetMonth: a.offsetMonth, amount: amt, note: a.note, overRemitted: a.overRemitted, offsetRemitted: a.offsetRemitted }
  return [
    {
      id: adjItemId(a.id, 'over'), source: 'ADJUSTMENT' as const, name: a.payeeName,
      ref: `Overdeclared · offset from ${ymLabel(a.offsetMonth)}`,
      ym: a.overMonth, periodLabel: ymLabel(a.overMonth),
      base: 0, rate: null, ewt: amt, remitted: a.overRemitted, leg: 'over' as AdjLeg, adj,
    },
    {
      id: adjItemId(a.id, 'offset'), source: 'ADJUSTMENT' as const, name: a.payeeName,
      ref: `Offset of ${ymLabel(a.overMonth)} overdeclaration`,
      ym: a.offsetMonth, periodLabel: ymLabel(a.offsetMonth),
      base: 0, rate: null, ewt: -amt, remitted: a.offsetRemitted, leg: 'offset' as AdjLeg, adj,
    },
  ]
}

/** Net effect of adjustments on one month's EWT (over legs add, offset legs subtract). */
export function adjustmentNetForMonths(rows: Pick<EwtAdjustmentRow, 'overMonth' | 'offsetMonth' | 'amount'>[], inMonth: (ym: string) => boolean): number {
  let n = 0
  for (const a of rows) {
    const amt = Number(a.amount)
    if (inMonth(a.overMonth)) n += amt
    if (inMonth(a.offsetMonth)) n -= amt
  }
  return r2(n)
}
