// Figures for the Budget page, kept apart from the view so they can be checked on
// their own. Every formula here is the one the page has always used: a cell's
// budget is parseFloat of what was typed (0 when blank), totals add the lines
// month by month, net income = revenue − cost of sales − operating expenses, and
// capital expenditure stays outside the income-statement totals.

export type LineType = 'REVENUE' | 'COGS' | 'EXPENSE' | 'CAPEX'
export interface Line { key: string; label: string; type: LineType }
export interface Acct { accountNumber: string; accountTitle: string }
export interface MonthData { cogs?: number; revenueByAccount?: Record<string, number>; expenseByAccount?: Record<string, number> }
export interface ReportData { accounts?: Record<string, Record<string, Acct[]>>; monthly?: Record<number, MonthData> }
export type Inputs = Record<string, string>

export const MS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** Income-statement lines from the chart of accounts, plus COGS and the capex classifications. */
export function buildLines(report: ReportData | null, capexLabels: Record<string, string>) {
  const revAccts = Object.values(report?.accounts?.REVENUE || {}).flat()
  const expAccts = Object.values(report?.accounts?.EXPENSE || {}).flat()
  const revLines: Line[] = revAccts.map(a => { const key = `${a.accountNumber} ${a.accountTitle}`; return { key, label: key, type: 'REVENUE' as LineType } })
  const expLines: Line[] = expAccts.map(a => { const key = `${a.accountNumber} ${a.accountTitle}`; return { key, label: key, type: 'EXPENSE' as LineType } })
  const cogsLine: Line = { key: 'COGS — Cost of Sales', label: 'Cost of Sales (COGS)', type: 'COGS' }
  // Capital expenditure: budgeted per asset classification, so Budget vs Actual can be
  // compared against what Asset Management actually recorded as purchased.
  const capexLines: Line[] = Object.entries(capexLabels)
    .map(([code, label]) => ({ key: `${code} ${label}`, label: `${code} ${label}`, type: 'CAPEX' as LineType }))
  return { revLines, cogsLine, expLines, capexLines }
}

/** The text boxes start from the saved figures: "month:accountKey" → the amount as typed. */
export function seedInputs(budgetsByMonth: Record<number, Record<string, number>>): Inputs {
  const seed: Inputs = {}
  for (const [m, map] of Object.entries(budgetsByMonth)) for (const [k, v] of Object.entries(map)) seed[`${m}:${k}`] = String(v)
  return seed
}

export const budgetOf = (inputs: Inputs, m: number, key: string) => parseFloat(inputs[`${m}:${key}`] || '0') || 0
export const yearTotal = (inputs: Inputs, key: string) => MS.reduce((s, m) => s + budgetOf(inputs, m, key), 0)
export const monthSum = (inputs: Inputs, lines: Line[], m: number) => lines.reduce((s, l) => s + budgetOf(inputs, m, l.key), 0)

/** A totals row: one figure per month and the year (the sum of the months). */
export function totalRow(inputs: Inputs, lines: Line[]): { months: number[]; year: number } {
  const months = MS.map(m => monthSum(inputs, lines, m))
  return { months, year: MS.reduce((s, m) => s + monthSum(inputs, lines, m), 0) }
}
export function netIncomeRow(inputs: Inputs, revLines: Line[], cogsLine: Line, expLines: Line[]): { months: number[]; year: number } {
  const val = (m: number) => monthSum(inputs, revLines, m) - monthSum(inputs, [cogsLine], m) - monthSum(inputs, expLines, m)
  return { months: MS.map(val), year: MS.reduce((s, m) => s + val(m), 0) }
}

/** What Save sends for one month: every line, with its current amount. */
export const monthEntries = (inputs: Inputs, allLines: Line[], m: number) =>
  allLines.map(l => ({ accountKey: l.key, accountType: l.type, amount: budgetOf(inputs, m, l.key) }))

/** True when what is typed differs from what was last loaded (compared as amounts). */
export function isDirty(inputs: Inputs, seed: Inputs): boolean {
  const keys = new Set([...Object.keys(inputs), ...Object.keys(seed)])
  for (const k of keys) if ((parseFloat(inputs[k] || '0') || 0) !== (parseFloat(seed[k] || '0') || 0)) return true
  return false
}

/* ── Budget vs Actual ─────────────────────────────────────────────────── */

export interface VsRow { l: Line; actual: number; budget: number; variance: number; favorable: boolean }

/** months = the locked month picked, or all twelve for the Full Year view. */
export function vsRows(
  lines: { revLines: Line[]; cogsLine: Line; expLines: Line[]; capexLines: Line[] },
  report: ReportData | null,
  months: number[],
  budgetsByMonth: Record<number, Record<string, number>>,
  capexActual: Record<number, Record<string, number>>,
) {
  const row = (l: Line): VsRow => {
    let actual = 0, budget = 0
    for (const mm of months) {
      const m = report?.monthly?.[mm] || {}
      actual += l.type === 'REVENUE' ? ((m.revenueByAccount || {})[l.key] || 0)
        : l.type === 'COGS' ? (m.cogs || 0)
        : l.type === 'CAPEX' ? ((capexActual[mm] || {})[l.key.split(' ')[0]] || 0)
        : ((m.expenseByAccount || {})[l.key] || 0)
      budget += (budgetsByMonth[mm] || {})[l.key] || 0
    }
    const variance = actual - budget
    const favorable = l.type === 'REVENUE' ? actual >= budget : actual <= budget
    return { l, actual, budget, variance, favorable }
  }
  return { rev: lines.revLines.map(row), cogs: row(lines.cogsLine), exp: lines.expLines.map(row), capex: lines.capexLines.map(row) }
}

const sumRows = (rs: VsRow[]) => rs.reduce((a, r) => ({ b: a.b + r.budget, a: a.a + r.actual }), { b: 0, a: 0 })

/** Section totals for Budget vs Actual: revenue, cost & expenses, net income (capex apart). */
export function vsTotals(vs: ReturnType<typeof vsRows>) {
  const tr = sumRows(vs.rev)
  const tce = sumRows([vs.cogs, ...vs.exp])
  const capex = sumRows(vs.capex)
  return { tr, tce, netB: tr.b - tce.b, netA: tr.a - tce.a, capex }
}
