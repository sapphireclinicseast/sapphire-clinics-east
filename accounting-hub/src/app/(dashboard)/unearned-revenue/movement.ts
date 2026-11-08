// Figures for the Unearned Revenue (4050) page, kept apart from the view so the
// arithmetic can be checked on its own. Every total is summed exactly the way the
// page has always summed it: lines bucket into calendar months by the first seven
// characters of their date, months add up in date order, and
// balance = opening + received (credits) − released (debits).

export interface Line {
  date: string
  debit: number
  credit: number
  description: string
  refType: string
  jeDescription?: string
  branch?: string
}

export interface MonthRow { key: string; cr: number; dr: number; net: number; balance: number }
export interface YearRow { year: string; months: MonthRow[]; cr: number; dr: number; net: number; balance: number }

export const peso = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** ₱1,234.00 / -₱1,234.00 */
export const pesoSigned = (v: number) => `${v < 0 ? '-' : ''}₱${peso(Math.abs(v))}`
/** ₱1.2M / ₱450K / ₱980 — chart axis and tooltips only, where full figures do not fit. */
export function pesoCompact(v: number): string {
  const a = Math.abs(v)
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`
    : a >= 1_000 ? `${Math.round(a / 1_000)}K`
    : `${Math.round(a)}`
  return `${v < 0 ? '-' : ''}₱${s}`
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** '2026-10' → 'Oct 2026' */
export const monthLabel = (k: string) => `${MONTHS[parseInt(k.slice(5, 7), 10) - 1]} ${k.slice(0, 4)}`
/** '2026-10-04…' → 'Oct 4, 2026' (read straight from the string — no time-zone shift). */
export const dayLabel = (d: string) => {
  const s = String(d).slice(0, 10)
  return `${MONTHS[parseInt(s.slice(5, 7), 10) - 1]} ${parseInt(s.slice(8, 10), 10)}, ${s.slice(0, 4)}`
}

/** Month buckets across the whole range (multi-year), oldest first. */
export function monthlyMovement(lines: Line[]): [string, { dr: number; cr: number }][] {
  const m = new Map<string, { dr: number; cr: number }>()
  for (const l of lines) {
    const k = String(l.date).slice(0, 7)
    const b = m.get(k) || { dr: 0, cr: 0 }
    b.dr += l.debit; b.cr += l.credit
    m.set(k, b)
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
}

/**
 * Range totals plus a month-end balance per month. The running sums add the months
 * in the same order as the totals, so the last month's balance IS the closing figure.
 */
export function summarize(opening: number, monthly: [string, { dr: number; cr: number }][]) {
  let runCr = 0, runDr = 0
  const rows: MonthRow[] = monthly.map(([key, m]) => {
    runCr += m.cr; runDr += m.dr
    return { key, cr: m.cr, dr: m.dr, net: m.cr - m.dr, balance: opening + runCr - runDr }
  })
  const totalCr = monthly.reduce((s, [, m]) => s + m.cr, 0)
  const totalDr = monthly.reduce((s, [, m]) => s + m.dr, 0)
  return { rows, totalCr, totalDr, closing: opening + totalCr - totalDr }
}

/** Months grouped under their calendar year, with year totals and the year-end balance. */
export function groupByYear(rows: MonthRow[]): YearRow[] {
  const out: YearRow[] = []
  for (const r of rows) {
    const year = r.key.slice(0, 4)
    let g = out[out.length - 1]
    if (!g || g.year !== year) { g = { year, months: [], cr: 0, dr: 0, net: 0, balance: 0 }; out.push(g) }
    g.months.push(r)
    g.cr += r.cr; g.dr += r.dr; g.net = g.cr - g.dr; g.balance = r.balance
  }
  return out
}

/* ── labels ─────────────────────────────────────────────────────────────── */

export const BRANCHES: [string, string][] = [
  ['ALL', 'All branches'], ['SANDBOX_EAST', 'Aura Health East'], ['SANDBOX_GREENHILLS', 'Aura Health Greenhills'],
  ['VERDANA_STORE', 'Verdana'], ['AURA_INSTITUTE', 'Aura Health Institute'],
]
const BRANCH_SHORT: Record<string, string> = {
  SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana', VERDANA: 'Verdana',
  AURA_INSTITUTE: 'Institute', ALL: 'Company-wide',
}
export const branchShort = (b?: string) => (b && BRANCH_SHORT[b]) || b || '—'

// Plain names for JournalEntry.referenceType, with a one-line note for the tooltip.
const SOURCES: Record<string, [string, string]> = {
  POS_ORDER:           ['POS cashiering', 'Posted by POS cashiering: deposits and advance payments in, sessions drawn out'],
  POS_ORDER_REVERSAL:  ['POS reversal', 'Backs out an earlier POS posting when an order is voided or edited'],
  QB_IMPORT_JE:        ['QuickBooks history', 'Imported from QuickBooks (history before the hub)'],
  QB_LIAB_IMPORT:      ['QuickBooks import', 'Opening liability imported from QuickBooks'],
  MANUAL:              ['Manual journal', 'Entered by hand in Journal Entries'],
  ADJUSTMENT:          ['Manual adjustment', 'Entered by hand as an adjustment'],
  REFUND_PAYMENT:      ['Refund', 'Money paid back to a patient'],
  REFUND:              ['Refund', 'Money paid back to a patient'],
  AR_PAYMENT:          ['AR collection', 'Posted from an Accounts Receivable payment'],
  AR_PAYMENT_REVERSAL: ['AR collection reversal', 'Backs out an earlier Accounts Receivable payment'],
  BANK_REC:            ['Bank reconciliation', 'Posted from Bank Reconciliation'],
  PAYMONGO_SALE:       ['PayMongo sale', 'Online payment through PayMongo'],
  PRIOR_PERIOD_BRIDGE: ['Prior-period bridge', 'Audited opening adjustment for a closed year'],
}
export const sourceLabel = (t: string) =>
  SOURCES[t]?.[0] || (t ? t.toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : 'Unknown')
export const sourceHint = (t: string) => SOURCES[t]?.[1] || t
