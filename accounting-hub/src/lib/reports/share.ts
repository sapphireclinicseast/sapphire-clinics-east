// Reports → Share: view-only public links to one filtered statement.
// Shared by the hub's share dialog, the management API, the public API and the
// public page — no server-only imports here.
import type { V2Statements } from './v2/engine'

/** Roles that may publish a statement outside the hub (a link needs no login to open). */
export const SHARE_ROLES = ['ADMIN', 'ACCOUNTANT']

/** Income-statement branch choices (the tickboxes) and their public names. */
export const SHARE_BRANCHES: Record<string, string> = {
  ALL: 'All Branches',
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
  VERDANA_STORE: 'Verdana Store',
  AURA_INSTITUTE: 'Aura Health Institute',
}

export const SHARE_VIEWS = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Whole Year' } as const
export type ShareView = keyof typeof SHARE_VIEWS

/** Expiry choices in days; 0 = never expires. */
export const SHARE_EXPIRY_DAYS = [7, 30, 90, 0] as const

/** "SBEA+SBGH" → ['SBEA', 'SBGH']; null when any part is unknown or repeated. */
export function parseShareBranch(branch: string): string[] | null {
  const parts = branch.split('+')
  if (parts.some(p => !(p in SHARE_BRANCHES))) return null
  if (new Set(parts).size !== parts.length) return null
  if (parts.includes('ALL') && parts.length > 1) return null
  return parts
}

export const shareBranchLabel = (branch: string) =>
  branch.split('+').map(p => SHARE_BRANCHES[p] || p).join(' + ')

export const shareViewLabel = (view: string) => SHARE_VIEWS[view as ShareView] || view

export type ShareStatus = 'active' | 'expired' | 'revoked'
export function shareStatus(l: { revokedAt: Date | string | null; expiresAt: Date | string | null }, now = new Date()): ShareStatus {
  if (l.revokedAt) return 'revoked'
  if (l.expiresAt && new Date(l.expiresAt) <= now) return 'expired'
  return 'active'
}

export const sharePath = (token: string) => `/shared/report/${token}`

/** A shared income statement carries nothing else: the balance sheet, cash
 *  flow and the engine's health checks (bank reconciliation figures) stay in
 *  the hub. Builds a new object — the input is never mutated. */
export function incomeStatementOnly(s: V2Statements): V2Statements {
  return {
    year: s.year, branch: s.branch, engine: s.engine,
    validation: {
      openingPlug: 0, imbalancePlugs: [], unclassified: [], synthesized: [], fromLedger: [], notes: [],
      aEqualsLE: true, aLEDiff: 0, cfTies: true,
    },
    incomeStatement: s.incomeStatement,
    balanceSheet: { sections: [], totalAssets: 0, totalLiabilities: 0, totalEquity: 0, incomeTaxPayable: 0, deferredTaxAsset: 0, netIncome: 0 },
    cashFlow: {
      netIncome: 0, depreciation: 0, taxProvision: 0, workingCapital: [], netOperating: 0, investing: [], netInvesting: 0,
      financing: [], netFinancing: 0, netChange: 0, beginningCash: 0, endingCash: 0, cashAccounts: [],
      monthly: { netIncome: [], depreciation: [], taxProvision: [], cashDelta: [] },
    },
  }
}
