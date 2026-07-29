// Historical (manual) financial statements for FY2024–FY2025.
//
// The books for those years live in the audited management-accounts workbook,
// not as tagged transactions in the Hub, so /api/reports short-circuits to
// these figures for any year <= LAST_MANUAL_YEAR. Transaction tagging (and the
// derived reports engine) starts with FY2026.
import {
  HIST_IS,
  HIST_BS,
  HIST_CF,
  HistRow,
  HistBalanceSheet,
  HistCashFlow,
} from './historical-fs-data'

export const LAST_MANUAL_YEAR = 2025

export interface HistoricalReportPayload {
  year: number
  branch: string
  source: string
  /** Notes shown under every tab (projected months, branch coverage…) */
  notes: string[]
  /** Notes shown under the Income Statement tab only */
  isNotes: string[]
  incomeStatement: { title: string; rows: HistRow[] } | null
  balanceSheet: (Pick<HistBalanceSheet, 'title' | 'asOf' | 'note'> & { rows: HistRow[] }) | null
  cashFlow: (Pick<HistCashFlow, 'title' | 'period'> & { rows: HistRow[] }) | null
  /** Set when the selected branch simply has no statements for this year. */
  emptyReason: string | null
}

const BRANCH_TITLES: Record<string, string> = {
  SBEA: 'Aura East',
  SBGH: 'Aura Greenhills',
  ALL: 'All Branches',
}

// Normalize whatever branch value the client sends to the keys used in the data.
function normalizeBranch(branch: string): 'SBEA' | 'SBGH' | 'ALL' | 'OTHER' {
  switch (branch) {
    case 'ALL':
      return 'ALL'
    case 'SBEA':
    case 'SANDBOX_EAST':
      return 'SBEA'
    case 'SBGH':
    case 'SANDBOX_GREENHILLS':
      return 'SBGH'
    default:
      return 'OTHER' // Verdana Store / Aura Institute — no pre-2026 operations
  }
}

/**
 * Returns the manual statements for a historical year, or null when the year
 * should be served by the derived (transaction-tagged) engine.
 */
export function getHistoricalReport(year: number, branch: string): HistoricalReportPayload | null {
  if (year > LAST_MANUAL_YEAR) return null

  const br = normalizeBranch(branch)
  const payload: HistoricalReportPayload = {
    year,
    branch,
    source:
      'Manual figures from the SCEI FY2024–FY2025 financial statements package (internal & audited management accounts). 2026 onward is derived from transactions recorded in the Hub.',
    notes: [],
    isNotes: [],
    incomeStatement: null,
    balanceSheet: null,
    cashFlow: null,
    emptyReason: null,
  }

  if (year < 2024) {
    payload.emptyReason = `No financial statements exist for ${year} — Aura East opened in June 2024.`
    return payload
  }

  if (br === 'OTHER') {
    payload.emptyReason = `This branch had no operations in ${year}. Verdana Store and Aura Health Institute begin in the 2026 books.`
    return payload
  }

  // ── Income statement ──────────────────────────────────────────────
  const isForYear = HIST_IS[year]
  if (isForYear) {
    // 2024: East was the only operating branch, so "All Branches" = East.
    const isRows = isForYear[br] || (br === 'ALL' ? isForYear.SBEA : undefined)
    if (isRows) {
      const title = year === 2024 && br === 'ALL' ? BRANCH_TITLES.SBEA : BRANCH_TITLES[br]
      payload.incomeStatement = { title: `Income Statement — ${title}`, rows: isRows }
      if (year === 2024 && br === 'ALL') {
        payload.notes.push('Aura East was the only operating branch in 2024.')
      }
      if (year === 2025) {
        payload.notes.push('November and December 2025 figures are projected/estimated per the source books, not booked actuals.')
        if (br === 'ALL') {
          payload.isNotes.push('Income statement shown is East + Greenhills combined. Greenhills opened October 2025.')
        }
        if (br === 'SBGH') {
          payload.notes.push('Greenhills was constructed July–October 2025 and opened October 2025.')
        }
        if (br === 'ALL' || br === 'SBGH') {
          payload.isNotes.push('FY totals are full-year actuals per the books and may exceed the sum of the monthly columns where amounts were recorded for the year but not allocated to a month.')
        }
      }
    } else if (year === 2024 && br === 'SBGH') {
      payload.emptyReason = 'Greenhills had no operations in 2024 — it opened in October 2025.'
    } else {
      payload.emptyReason = `No ${year} income statement exists for this branch.`
    }
  }

  // ── Balance sheet ─────────────────────────────────────────────────
  const bsForYear = HIST_BS[year]
  if (bsForYear) {
    const bsVisible = bsForYear.scope === 'ALL' ? br === 'ALL' : br === 'ALL' || br === bsForYear.scope
    if (bsVisible) {
      payload.balanceSheet = {
        title: bsForYear.title,
        asOf: bsForYear.asOf,
        note: bsForYear.note,
        rows: bsForYear.rows,
      }
    } else if (year === 2025) {
      payload.notes.push('A per-branch balance sheet does not exist for 2025 — only the SCEI consolidated position. Select "All Branches" to view it.')
    }
  }

  // ── Cash flow ─────────────────────────────────────────────────────
  const cfForYear = HIST_CF[year]
  if (cfForYear && (br === 'ALL' || br === cfForYear.scope)) {
    payload.cashFlow = { title: cfForYear.title, period: cfForYear.period, rows: cfForYear.rows }
  }
  if (year === 2024) {
    payload.notes.push('The source books pair the Dec-2024 balance sheet with a forward 2025 cash-flow schedule — a stand-alone FY2024 cash flow does not exist.')
  }

  return payload
}
