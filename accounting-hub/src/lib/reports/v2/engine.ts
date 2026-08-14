/**
 * Reports v2 — ledger-derived financial statements.
 *
 * One balanced double-entry dataset per (year, branch):
 *
 *   opening balances (with an explicit Opening Balance Equity plug)
 *   + every real JournalEntry in the period
 *   + SYNTHESIZED balanced entries for the modules that do not post to the GL
 *     (orders, AR collections, petty cash, depreciation schedule, asset
 *     purchases — all of which are gated behind ENABLE_GL_POSTING=false today)
 *
 * All three statements read from this single dataset, so:
 *   - Assets = Liabilities + Equity holds BY CONSTRUCTION (every entry balances;
 *     anything that cannot balance goes to a VISIBLE plug account, never dropped)
 *   - the Cash Flow ties exactly (cash delta == − sum of non-cash deltas)
 *   - each account appears in the section its CoA type/subType dictates, and
 *     accounts with unknown subTypes surface in an explicit "Unclassified"
 *     bucket instead of silently vanishing.
 *
 * Synthesis is deduplicated per reference id, so turning ENABLE_GL_POSTING on
 * later will not double-count: a source with a real JE is never synthesized.
 */
import { prisma } from '@/lib/prisma'
import { INCOME_TAX_RATE } from '@/lib/reports/income-statement-totals'
import { productSubtypeLabel } from '@/lib/sku-taxonomy'

/* ── Types ─────────────────────────────────────────────────────── */

interface AcctInfo {
  id: string | null
  number: string
  title: string
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
  subType: string
  normalBalance: 'DEBIT' | 'CREDIT'
  virtual: boolean
  /** Owning branch of a bank account; null = shared/company-wide. */
  branch?: string | null
  /** Account currency; anything but PHP is converted at the bank-rec rate. */
  currency?: string
}

interface Movement { debit: number; credit: number }

export interface V2AccountRow {
  number: string
  title: string
  type: string
  subType: string
  opening: number   // signed in the account's normal direction
  debit: number
  credit: number
  closing: number   // signed in the account's normal direction
  /** Jan..Dec period movement, signed in the account's normal direction */
  monthly: number[]
  virtual: boolean
  /** Bank-flagged in the CoA or cash-titled — grouped as Cash and Cash Equivalents on the BS. */
  cash: boolean
}

/** One underlying line, returned when a drill-down is requested. */
export interface V2CollectedLine {
  month: number          // 1..12, or 0 for opening balances and prior-year history
  /** "YYYY-MM" for a prior-year history line; absent for lines inside `year`. */
  period?: string
  source: string         // engine source key (journal:<refType> or a synthesis key)
  label: string          // human context: JE description, order #, PCV, asset name…
  debit: number
  credit: number
}

export interface V2Statements {
  year: number
  branch: string
  engine: 'ledger-v2'
  validation: {
    openingPlug: number
    imbalancePlugs: { source: string; amount: number }[]
    unclassified: { number: string; title: string; type: string; subType: string; closing: number }[]
    synthesized: string[]
    fromLedger: string[]
    notes: string[]
    aEqualsLE: boolean
    aLEDiff: number
    cfTies: boolean
    /** Ledger cash vs imported bank statements — the honesty check. The ledger
        only knows recorded transactions; the statements know the truth. */
    cashRecon?: {
      rows: { number: string; title: string; ledgerClosing: number; statementBalance: number | null; statementAsOf: string | null }[]
      ledgerCash: number
      statementCash: number
      pendingOut: number
      pendingIn: number
      pendingCount: number
    }
  }
  /** Present only when a drill-down was requested (account [+ month]). */
  collected?: V2CollectedLine[]
  /** True when the drill-down list was cut at the cap (totals stay complete). */
  collectedTruncated?: boolean
  /** Full debit/credit sums over ALL matching lines (exact even when truncated). */
  collectedTotals?: { debit: number; credit: number }
  incomeStatement: {
    sections: { key: string; label: string; rows: V2AccountRow[]; total: number }[]
    /** 7080 Sales of Product Income sub-classification (Department · Category) */
    productSubtypes: { label: string; monthly: number[]; total: number }[]
    netSales: number
    totalCOGS: number
    grossProfit: number
    totalOpex: number
    ebitda: number
    depreciation: number
    interest: number
    nonOperating: number
    ebt: number
    taxProvision: number
    netIncome: number
  }
  balanceSheet: {
    sections: { key: string; label: string; rows: V2AccountRow[]; total: number }[]
    totalAssets: number
    totalLiabilities: number
    totalEquity: number
    incomeTaxPayable: number
    deferredTaxAsset: number
    netIncome: number
  }
  cashFlow: {
    netIncome: number
    depreciation: number
    taxProvision: number
    workingCapital: { label: string; amount: number; monthly?: number[] }[]
    netOperating: number
    investing: { label: string; amount: number; monthly?: number[] }[]
    netInvesting: number
    financing: { label: string; amount: number; monthly?: number[] }[]
    netFinancing: number
    netChange: number
    beginningCash: number
    endingCash: number
    cashAccounts: { key: string; amount: number }[]
    /** Per-month chain for the monthly/quarterly view */
    monthly: { netIncome: number[]; depreciation: number[]; taxProvision: number[]; cashDelta: number[] }
  }
}

/* ── Constants / helpers ───────────────────────────────────────── */

const BRANCH_MAP: Record<string, string> = {
  SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS',
  SANDBOX_EAST: 'SANDBOX_EAST', SANDBOX_GREENHILLS: 'SANDBOX_GREENHILLS',
  VERDANA_STORE: 'VERDANA_STORE', AHI: 'AURA_INSTITUTE', AURA_INSTITUTE: 'AURA_INSTITUTE',
}

const OPENING_PLUG = '3999'
const IMBALANCE_PLUG = '9990'
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * The Accounting Hub only started posting live, in the moment, per-order
 * journal entries on 2026-01-02 (the earliest real POS_ORDER-referenced JE in
 * the system; zero exist anywhere in 2025). Every 2025 order was bulk
 * backfilled into the Order table in one batch (2026-07), and that period's
 * revenue is already fully reflected in the historical QuickBooks import
 * (QB_IMPORT_JE) — confirmed: 2025 Order-table earned revenue (₱25.02M) sits
 * within ~5% of QB_IMPORT_JE's own 2025 revenue-account total (₱23.86M).
 *
 * `hasRef('POS_ORDER', order.id)` cannot see any of that: the QB import was
 * never linked to individual Order ids, so the dedup check always misses and
 * every 2025 order gets synthesized on TOP of revenue QuickBooks already
 * recorded — company-wide, for the whole year. That doubled the Income
 * Statement's 2025 gross revenue (₱57.86M synthesized vs ₱23.86M real) and
 * inflated every bank account's cash movement by the corresponding phantom
 * payment lines. Orders (and their COGS/free-sample legs) dated before this
 * cutoff are therefore never synthesized, full stop — that period's GL is
 * QuickBooks', not the Hub's, regardless of what hasRef() does or doesn't
 * find.
 */
const LIVE_GL_POSTING_START = new Date(Date.UTC(2026, 0, 1))

// Sections an account lands in, by CoA classification.
const BS_SECTION: [key: string, label: string, match: (a: AcctInfo) => boolean][] = [
  ['CURRENT_ASSETS', 'Current Assets', a => a.type === 'ASSET' && (a.subType === 'CURRENT_ASSETS' || a.subType === 'INVENTORY' || a.subType.startsWith('INV_'))],
  ['NON_CURRENT_ASSETS', 'Non-Current Assets', a => a.type === 'ASSET' && ['PPE', 'INTANGIBLE_ASSETS', 'OTHER_NON_CURRENT_ASSETS'].includes(a.subType)],
  ['UNCLASSIFIED_ASSETS', 'Assets — Unclassified sub-type', a => a.type === 'ASSET'],
  ['CURRENT_LIABILITIES', 'Current Liabilities', a => a.type === 'LIABILITY' && a.subType === 'CURRENT_LIABILITIES'],
  ['NON_CURRENT_LIABILITIES', 'Non-Current Liabilities', a => a.type === 'LIABILITY' && a.subType === 'NON_CURRENT_LIABILITIES'],
  ['UNCLASSIFIED_LIABILITIES', 'Liabilities — Unclassified sub-type', a => a.type === 'LIABILITY'],
  ['EQUITY', 'Equity', a => a.type === 'EQUITY'],
]

function isCashAccount(a: AcctInfo): boolean {
  if (a.type !== 'ASSET') return false
  const t = a.title.toLowerCase()
  if (/receivable|input vat|withholding|prepaid|deposit|inventory|advances|due from/.test(t)) return false
  return /cash|bank|gcash|paymaya|maya|fund/.test(t)
}

/**
 * Bank lines a report is allowed to believe. A line the user excluded ("disable"
 * in Bank Rec) or archived is one they have said is not a real movement — most
 * often a mangled import row — so its printed running balance is not evidence of
 * anything either. Without this the row keeps driving the true-up and the cash
 * reconciliation panel after being switched off, and only a hard delete makes it
 * disappear from the reports.
 */
const LIVE_STMT = { status: { in: ['PENDING', 'POSTED'] } }

/* ── Engine ────────────────────────────────────────────────────── */

export async function computeLedgerStatements(
  year: number,
  branch: string,
  collect?: { account: string; month?: number; cumulative?: boolean },
): Promise<V2Statements> {
  const start = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year + 1, 0, 1))
  const collected: V2CollectedLine[] = []
  const monthOf = (d: Date | string) => {
    const dt = new Date(d)
    if (dt < start) return 1
    if (dt >= end) return 12 // e.g. payroll finalized in Jan–Feb belonging to Dec cutoffs
    return dt.getUTCMonth() + 1
  }
  const orderBranch = BRANCH_MAP[branch] || branch
  const branchValues = branch === 'ALL' ? null : Array.from(new Set([branch, orderBranch]))

  const validation: V2Statements['validation'] = {
    openingPlug: 0, imbalancePlugs: [], unclassified: [], synthesized: [], fromLedger: [],
    notes: [], aEqualsLE: false, aLEDiff: 0, cfTies: false,
  }

  /* ── Account registry ── */
  const dbAccounts = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, accountNumber: true, accountTitle: true, accountType: true, subType: true, normalBalance: true, isBankAccount: true, branch: true, currency: true },
  })
  const byNumber = new Map<string, AcctInfo>()
  const byId = new Map<string, AcctInfo>()
  const bankFlagged = new Set<string>()
  for (const a of dbAccounts) {
    const info: AcctInfo = {
      id: a.id, number: a.accountNumber, title: a.accountTitle,
      type: a.accountType as AcctInfo['type'], subType: a.subType || '',
      normalBalance: a.normalBalance as AcctInfo['normalBalance'], virtual: false,
      branch: a.branch || null, currency: a.currency || 'PHP',
    }
    byNumber.set(info.number, info)
    byId.set(a.id, info)
    if (a.isBankAccount) bankFlagged.add(a.accountNumber)
  }
  const virt = (number: string, title: string, type: AcctInfo['type'], subType: string, normalBalance: AcctInfo['normalBalance']): AcctInfo => {
    const existing = byNumber.get(number)
    if (existing) return existing
    const info: AcctInfo = { id: null, number, title, type, subType, normalBalance, virtual: true }
    byNumber.set(number, info)
    return info
  }
  const findByTitle = (re: RegExp, type?: AcctInfo['type']): AcctInfo | undefined => {
    for (const a of byNumber.values()) if ((!type || a.type === type) && re.test(a.title)) return a
    return undefined
  }
  // Branch → the prefix its own accounts are titled with ("AHEA BDO Checking
  // Account"). Used to pick a fallback funding account that belongs to the
  // branch actually spending the money.
  const BRANCH_PREFIX: Record<string, string> = {
    SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VER',
  }
  /**
   * Bank accounts a fallback is allowed to credit, cheapest number first.
   *
   * Petty cash is excluded deliberately. The old fallback took
   * `Array.from(bankFlagged)[0]` — whichever account the Set happened to hold
   * first — and for years that was 004680350310 VER BDO Petty Cash, a ~P10k
   * float with no imported statement. Millions in asset purchases were credited
   * there, which no bank true-up could ever correct because there is nothing to
   * true it to.
   */
  const fallbackCashAccounts = (): AcctInfo[] =>
    Array.from(bankFlagged)
      .map(n => byNumber.get(n))
      .filter((a): a is AcctInfo => !!a && !/petty cash/i.test(a.title))
      .sort((x, y) => x.number.localeCompare(y.number))
  const defaultCash = (forBranch?: string): AcctInfo => {
    const cands = fallbackCashAccounts()
    const p = forBranch ? BRANCH_PREFIX[forBranch] : undefined
    return (p ? cands.find(a => a.title.startsWith(p)) : undefined)
      || cands.find(a => /main corporate/i.test(a.title))
      || cands[0]
      || findByTitle(/cash on hand|^cash$/i, 'ASSET')
      || findByTitle(/cash|bank/i, 'ASSET')
      || virt('1000', 'Cash (derived)', 'ASSET', 'CURRENT_ASSETS', 'DEBIT')
  }
  const arAccount = (): AcctInfo =>
    byNumber.get('1010') || findByTitle(/receivable/i, 'ASSET') || virt('1010', 'Accounts Receivable', 'ASSET', 'CURRENT_ASSETS', 'DEBIT')
  const unearnedAccount = (): AcctInfo =>
    byNumber.get('4050') || findByTitle(/unearned/i, 'LIABILITY') || virt('4050', 'Unearned Revenue', 'LIABILITY', 'CURRENT_LIABILITIES', 'CREDIT')
  const inputVat = (): AcctInfo =>
    byNumber.get('1040') || findByTitle(/input vat/i, 'ASSET') || virt('1040', 'Input VAT', 'ASSET', 'CURRENT_ASSETS', 'DEBIT')
  const inventoryAcct = (subType?: string | null): AcctInfo => {
    if (subType) for (const a of byNumber.values()) if (a.type === 'ASSET' && a.subType === subType) return a
    for (const a of byNumber.values()) if (a.type === 'ASSET' && (a.subType === 'INVENTORY' || a.subType.startsWith('INV_'))) return a
    return virt('1200', 'Inventory (derived)', 'ASSET', 'INVENTORY', 'DEBIT')
  }
  const parseAccountKey = (key: string): AcctInfo => {
    // "8120 Marketing and Advertising Expense" → account by number, else virtual.
    // Bank accounts are numbered by their actual account number, which runs to
    // twelve digits — capping the match at six sent every petty cash line coded to
    // a bank account into the unmapped bucket, and counted the cash as an expense.
    const m = key.match(/^(\d{4,})\s+(.+)$/)
    if (m && byNumber.get(m[1])) return byNumber.get(m[1])!
    if (m) return virt(m[1], m[2], m[1].startsWith('7') ? 'REVENUE' : 'EXPENSE', 'UNCLASSIFIED', m[1].startsWith('7') ? 'CREDIT' : 'DEBIT')
    return virt('9998', `Unmapped: ${key}`, 'EXPENSE', 'UNCLASSIFIED', 'DEBIT')
  }

  /* ── Movement ledger (per month, 1..12) ── */
  const mov = new Map<string, Movement>()
  const movMonthly = new Map<string, { debit: number[]; credit: number[] }>()
  const opening = new Map<string, number>() // signed in normal direction
  const add = (acct: AcctInfo, month: number, debit: number, credit: number, source: string, label: string) => {
    if (!mov.has(acct.number)) mov.set(acct.number, { debit: 0, credit: 0 })
    const m = mov.get(acct.number)!
    m.debit += debit
    m.credit += credit
    if (!movMonthly.has(acct.number)) movMonthly.set(acct.number, { debit: Array(13).fill(0), credit: Array(13).fill(0) })
    const mm = movMonthly.get(acct.number)!
    mm.debit[month] += debit
    mm.credit[month] += credit
    if (collect && collect.account === acct.number && (!collect.month || collect.month === month || (collect.cumulative && month <= collect.month)) && (debit || credit)) {
      collected.push({ month, source, label, debit: round2(debit), credit: round2(credit) })
    }
  }
  // A source posts lines through a collector that guarantees balance:
  const postBalanced = (source: string, month: number, label: string, lines: { acct: AcctInfo; debit?: number; credit?: number }[]) => {
    let dr = 0, cr = 0
    for (const l of lines) {
      const d = round2(l.debit || 0), c = round2(l.credit || 0)
      if (!d && !c) continue
      add(l.acct, month, d, c, source, label)
      dr += d; cr += c
    }
    const diff = round2(dr - cr)
    if (Math.abs(diff) >= 0.01) {
      const plug = virt(IMBALANCE_PLUG, 'Derivation Imbalance (see validation)', 'EQUITY', 'OWNERS_EQUITY', 'CREDIT')
      add(plug, month, diff < 0 ? -diff : 0, diff > 0 ? diff : 0, source, `${label} — did not balance`)
      const existing = validation.imbalancePlugs.find(p => p.source === source)
      if (existing) existing.amount = round2(existing.amount + diff)
      else validation.imbalancePlugs.push({ source, amount: diff })
    }
  }

  /* ── 0. Prior-year history for a drill-down ──
     "Opening balance (2026)" on its own is a dead end: it says what the account
     started at, never how it got there. When one account is drilled with no
     month filter, every entry that predates the period is listed first, oldest
     first, so the balance can be read all the way back to 2024 instead of
     stopping at a figure someone typed in.

     History lines are deliberately EXCLUDED from the drill-down totals — those
     state this period's movement, and adding earlier years would double-count
     the opening balance they already produced. */
  if (collect && !collect.month) {
    const drilled = byNumber.get(collect.account)
    if (drilled?.id) {
      const hist = await prisma.journalEntryLine.findMany({
        where: {
          accountId: drilled.id,
          journalEntry: {
            entryDate: { lt: start },
            referenceType: { notIn: ['CLOSING_ENTRY', 'CLOSING_ENTRY_REVERSAL'] },
            ...(branchValues ? { branch: { in: branchValues as never[] } } : {}),
          },
        },
        select: {
          debit: true, credit: true,
          journalEntry: { select: { entryDate: true, description: true, referenceType: true } },
        },
        orderBy: { journalEntry: { entryDate: 'asc' } },
        take: 3000,
      })
      for (const l of hist) {
        const je = l.journalEntry
        collected.push({
          month: 0,
          period: je.entryDate.toISOString().slice(0, 7),
          source: `history:${je.referenceType || 'JOURNAL'}`,
          label: je.description || '(no description)',
          debit: round2(Number(l.debit) || 0),
          credit: round2(Number(l.credit) || 0),
        })
      }
    }
  }

  /* ── 0b. Drill-down for the corrections line ──
     "Asset purchase corrections / reversals" spans several accounts, so it
     cannot drill by account number. The special key ASSET_CORRECTIONS lists
     the underlying reversal entries themselves — what was reversed, when, and
     for how much — instead of one account's ledger. */
  if (collect && collect.account === 'ASSET_CORRECTIONS') {
    const revLines = await prisma.journalEntryLine.findMany({
      where: {
        credit: { gt: 0 },
        account: { accountType: 'ASSET', subType: { in: ['PPE', 'INTANGIBLE_ASSETS', 'OTHER_NON_CURRENT_ASSETS'] } },
        journalEntry: {
          referenceType: 'ASSET_PURCHASE_REVERSAL',
          entryDate: { gte: start, lt: end },
          ...(branchValues ? { branch: { in: branchValues as never[] } } : {}),
        },
      },
      select: {
        credit: true,
        account: { select: { accountNumber: true, accountTitle: true } },
        journalEntry: { select: { entryDate: true, description: true } },
      },
      orderBy: { journalEntry: { entryDate: 'asc' } },
    })
    for (const l of revLines) {
      const m = l.journalEntry.entryDate.getUTCMonth() + 1
      if (collect.month && !(collect.month === m || (collect.cumulative && m <= collect.month))) continue
      collected.push({
        month: m, source: 'asset-reversal',
        label: `${l.account?.accountNumber} ${l.account?.accountTitle} — ${l.journalEntry.description || ''}`,
        debit: 0, credit: round2(Number(l.credit)),
      })
    }
  }

  /* ── 1. Opening balances ── */
  if (branch === 'ALL') {
    const openingRows = await prisma.beginningBalance.findMany({
      where: { periodYear: year },
      select: { amount: true, account: { select: { accountNumber: true } } },
    })
    let openDr = 0, openCr = 0
    for (const r of openingRows) {
      if (!r.account) continue
      const acct = byNumber.get(r.account.accountNumber)
      if (!acct) continue
      const amt = Number(r.amount)
      if (!amt) continue
      opening.set(acct.number, (opening.get(acct.number) || 0) + amt)
      // `amt` is signed in the account's OWN normal-balance direction — a
      // negative entered opening (e.g. 6030 Retained Earnings starting the
      // year in an accumulated deficit) is on the account's CONTRA side, not
      // a negative amount of its normal side. Splitting purely on
      // normalBalance without checking the sign produced literal negative
      // debit/credit figures in the drill-down (a -P2.89M "credit" line for
      // 6030's 2026 opening) that didn't read as anything a real ledger line
      // could be, even though the actual opening/closing math downstream
      // (which uses the signed `amt` directly) was always correct.
      const onNormalSide = amt >= 0
      const isDebitNormal = acct.normalBalance === 'DEBIT'
      const dr = (isDebitNormal === onNormalSide) ? Math.abs(amt) : 0
      const cr = (isDebitNormal !== onNormalSide) ? Math.abs(amt) : 0
      openDr += dr; openCr += cr
      if (collect && collect.account === acct.number && (!collect.month || collect.cumulative)) {
        collected.push({
          month: 0, source: 'opening', label: `Opening balance (${year})`,
          debit: dr, credit: cr,
        })
      }
      // Drilling the 3999 plug itself answers "what causes this": the plug is
      // the amount by which the entered openings fail to balance, so its
      // breakdown IS the openings — every one, on its normal side. The drill's
      // net (debits − credits) then equals the plug figure exactly.
      if (collect && collect.account === OPENING_PLUG && (!collect.month || collect.cumulative)) {
        collected.push({
          month: 0, source: 'opening-plug', label: `${acct.number} ${acct.title} — entered opening`,
          debit: dr, credit: cr,
        })
      }
    }
    const openDiff = round2(openDr - openCr)
    if (Math.abs(openDiff) >= 0.01) {
      // Same device as the audited books' own "Opening Balance Equity" line.
      const plug = virt(OPENING_PLUG, 'Opening Balance Equity (plug)', 'EQUITY', 'OWNERS_EQUITY', 'CREDIT')
      opening.set(plug.number, (opening.get(plug.number) || 0) + openDiff)
      validation.openingPlug = openDiff
      if (collect && collect.account === OPENING_PLUG && (!collect.month || collect.cumulative)) {
        collected.push({
          month: 0, source: 'opening-plug',
          label: `Opening Balance Equity plug — entered opening debits ${openDr.toLocaleString('en-PH', { minimumFractionDigits: 2 })} vs credits ${openCr.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
          debit: openDiff < 0 ? -openDiff : 0,
          credit: openDiff > 0 ? openDiff : 0,
        })
      }
    }
  } else {
    /* Company-wide opening balances cannot be split by branch, but the branch's
       own journal history can be carried forward: prior-year entries tagged to
       this branch become opening balances, so share capital raised in 2024 still
       stands in a 2026 branch view instead of the sheet starting from zero.
       Prior-year revenue and expense collapse into one retained-earnings line —
       their detail belongs to their own year, but their net is this branch's
       accumulated result and the sheet cannot balance without it. */
    const priorLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          entryDate: { lt: start },
          referenceType: { notIn: ['CLOSING_ENTRY', 'CLOSING_ENTRY_REVERSAL'] },
          branch: { in: branchValues! as never[] },
        },
      },
      select: { debit: true, credit: true, account: { select: { accountNumber: true } } },
    })
    let priorPL = 0, carried = 0
    for (const l of priorLines) {
      if (!l.account) continue
      const acct = byNumber.get(l.account.accountNumber)
      if (!acct) continue
      const d = Number(l.debit) || 0, c = Number(l.credit) || 0
      if (acct.type === 'REVENUE' || acct.type === 'EXPENSE') {
        priorPL += c - d // credit-positive: net income of prior years
      } else {
        const move = acct.normalBalance === 'DEBIT' ? d - c : c - d
        if (move) { opening.set(acct.number, (opening.get(acct.number) || 0) + move); carried++ }
      }
    }
    if (Math.abs(priorPL) >= 0.01) {
      const re = virt('3995', 'Retained Earnings — prior years (this branch)', 'EQUITY', 'OWNERS_EQUITY', 'CREDIT')
      opening.set(re.number, (opening.get(re.number) || 0) + round2(priorPL))
    }
    validation.notes.push(
      'Branch view: company-wide opening balances cannot be split by branch, so openings here are rebuilt from this ' +
      'branch\'s own prior-year entries (capital, buybacks, and a single retained-earnings line for prior-year results). ' +
      'Amounts that exist only as unsplit openings — e.g. 5030 Bonds Payable — appear in the All Branches view.',
    )
  }

  /* ── 2. Real journal entries (with the payroll cutoff window rule) ── */
  const jeWhere = {
    OR: [
      { entryDate: { gte: start, lt: end } },
      // payroll finalized in Jan–Feb of next year but belonging to this year's cutoffs
      {
        entryDate: { gte: end, lt: new Date(Date.UTC(year + 1, 2, 1)) },
        referenceType: { in: ['PAYROLL_CONSULTANT', 'PAYROLL_EMPLOYEE'] },
        referenceId: { startsWith: `${year}-` },
      },
    ],
    referenceType: { notIn: ['CLOSING_ENTRY', 'CLOSING_ENTRY_REVERSAL'] },
    ...(branchValues ? { branch: { in: branchValues } } : {}),
  }
  const journalEntries = await prisma.journalEntry.findMany({
    where: jeWhere,
    select: {
      id: true, referenceType: true, referenceId: true, entryDate: true, description: true,
      lines: { select: { debit: true, credit: true, account: { select: { accountNumber: true } } } },
    },
  })
  const glRefIds = new Map<string, Set<string>>() // referenceType → refIds
  const glRefTypes = new Set<string>()
  for (const je of journalEntries) {
    // exclude prior-year payroll JEs dated inside this year (mirror of the window above)
    if (
      (je.referenceType === 'PAYROLL_CONSULTANT' || je.referenceType === 'PAYROLL_EMPLOYEE') &&
      je.referenceId?.startsWith(`${year - 1}-`) && je.entryDate < new Date(Date.UTC(year, 2, 1))
    ) continue
    glRefTypes.add(je.referenceType || 'MANUAL')
    if (je.referenceId) {
      if (!glRefIds.has(je.referenceType || '')) glRefIds.set(je.referenceType || '', new Set())
      glRefIds.get(je.referenceType || '')!.add(je.referenceId)
    }
    // A payroll journal belongs to its CUTOFF month, not the day it was
    // finalized: the 2026-06-2 cutoff posted on July 3 is June's salary, and
    // dating it by entry would starve June and fatten July on the statement.
    // referenceId carries the cutoff as "YYYY-MM-N|BRANCH".
    let jeMonth = monthOf(je.entryDate)
    if (je.referenceType === 'PAYROLL_CONSULTANT' || je.referenceType === 'PAYROLL_EMPLOYEE') {
      const cm = parseInt(je.referenceId?.split('-')[1] ?? '', 10)
      if (je.referenceId?.startsWith(`${year}-`) && cm >= 1 && cm <= 12) jeMonth = cm
    }
    postBalanced(`journal:${je.referenceType || 'manual'}`, jeMonth, je.description || `Journal entry ${je.id.slice(-6)}`, je.lines.map(l => ({
      acct: l.account ? (byNumber.get(l.account.accountNumber) || virt(l.account.accountNumber, 'Unknown account', 'EXPENSE', 'UNCLASSIFIED', 'DEBIT')) : virt('9998', 'Unmapped journal line', 'EXPENSE', 'UNCLASSIFIED', 'DEBIT'),
      debit: Number(l.debit), credit: Number(l.credit),
    })))
  }
  validation.fromLedger = Array.from(glRefTypes).sort()
  const hasRef = (type: string, id: string) => glRefIds.get(type)?.has(id) || false

  /* ── 2b. Company-wide loan payments split by the loan's branch allocation ──
     A loan or advance payment JE posted with branch='ALL' (multi-branch or unallocated)
     is invisible to a branch view under the filter above. When the loan carries
     branchAllocations, this branch's share of the interest (and fee) expense is
     included here, balanced against the paying bank — so the interest lands on
     the branch income statements the loan actually funds. Loans dedicated to a
     single branch post their payment JE directly on that branch and flow through
     the normal journal fold instead. The ALL view is untouched (no double count). */
  if (branchValues) {
    const allocJes = await prisma.journalEntry.findMany({
      where: { entryDate: { gte: start, lt: end }, branch: 'ALL', referenceType: { in: ['LOAN_PAYMENT', 'ADVANCE_PAYMENT'] } },
      select: {
        referenceId: true, entryDate: true, description: true,
        lines: { select: { debit: true, credit: true, account: { select: { accountNumber: true, accountType: true } } } },
      },
    })
    const allocLoanIds = Array.from(new Set(allocJes.map(j => j.referenceId).filter((x): x is string => !!x)))
    if (allocLoanIds.length) {
      // Advances allocate to branches exactly as loans do, so both are resolved here.
      const [allocLoans, allocAdvances] = await Promise.all([
        prisma.loan.findMany({ where: { id: { in: allocLoanIds } }, select: { id: true, branchAllocations: true } }),
        prisma.advance.findMany({ where: { id: { in: allocLoanIds } }, select: { id: true, branchAllocations: true } }),
      ])
      const shareByLoan = new Map<string, number>()
      for (const l of [...allocLoans, ...allocAdvances]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allocs = Array.isArray(l.branchAllocations) ? (l.branchAllocations as any[]) : []
        const total = allocs.reduce((s, a) => s + (Number(a?.amount) || 0), 0)
        const mine = allocs.filter(a => a?.branch === orderBranch || a?.branch === branch).reduce((s, a) => s + (Number(a?.amount) || 0), 0)
        if (total > 0 && mine > 0) shareByLoan.set(l.id, mine / total)
      }
      for (const je of allocJes) {
        const share = shareByLoan.get(je.referenceId || '') || 0
        if (!share) continue
        const expLines = je.lines.filter(l => Number(l.debit) > 0 && l.account?.accountType === 'EXPENSE')
        if (!expLines.length) continue
        const bankLine = je.lines.find(l => Number(l.credit) > 0 && l.account)
        const bankAcct = bankLine?.account ? (byNumber.get(bankLine.account.accountNumber) || defaultCash()) : defaultCash()
        const items = expLines.map(l => ({
          acct: l.account ? (byNumber.get(l.account.accountNumber) || virt(l.account.accountNumber, 'Unknown account', 'EXPENSE', 'UNCLASSIFIED', 'DEBIT')) : virt('9998', 'Unmapped journal line', 'EXPENSE', 'UNCLASSIFIED', 'DEBIT'),
          debit: round2(Number(l.debit) * share),
        })).filter(i => i.debit > 0)
        const totalShare = round2(items.reduce((s, i) => s + i.debit, 0))
        if (!totalShare) continue
        postBalanced('journal:LOAN_PAYMENT', monthOf(je.entryDate), `${je.description || 'Loan payment'} (${Math.round(share * 100)}% branch share)`, [
          ...items, { acct: bankAcct, credit: totalShare },
        ])
      }
    }
  }

  /* ── 3. Orders (synthesized when no POS_ORDER journal entry exists) ── */
  const orders = await prisma.order.findMany({
    where: {
      status: 'COMPLETED',
      transactionDate: { gte: start, lt: end },
      ...(branch !== 'ALL' ? { branch: orderBranch } : {}),
    },
    select: {
      id: true, orderNumber: true, patientName: true, transactionDate: true, branch: true,
      netAmount: true, revenueType: true, discountAmount: true, discountLabel: true, discountType: true,
      items: {
        select: {
          name: true, lineTotal: true, cogsCost: true, quantity: true, isFreeSample: true,
          service: { select: { revenueAccount: { select: { accountNumber: true } } } },
          inventoryItem: { select: { accountSubType: true, skuDepartment: true, skuCategory: true, revenueAccount: { select: { accountNumber: true } }, expenseAccount: { select: { accountNumber: true } } } },
        },
      },
      payments: {
        select: {
          method: true, amount: true, walletId: true,
          paymentMode: { select: { account: { select: { accountNumber: true } }, deductions: { select: { rate: true, valueType: true, account: { select: { accountNumber: true } } } } } },
        },
      },
    },
  })
  let synthesizedOrders = 0
  // Name → revenue-account fallback for order items with no service/inventory
  // relation (free-text POS lines). Mirrors the v1 report's resolveItemAccount:
  // services take precedence over inventory on a name collision.
  const nameRev = new Map<string, string>()
  const nameSku = new Map<string, { dept: string; cat: string }>()
  const [svcCatalog, invCatalog] = await Promise.all([
    prisma.service.findMany({ where: { revenueAccountId: { not: null } }, select: { name: true, revenueAccount: { select: { accountNumber: true } } } }),
    prisma.inventoryItem.findMany({ where: { revenueAccountId: { not: null } }, select: { name: true, skuDepartment: true, skuCategory: true, revenueAccount: { select: { accountNumber: true } } } }),
  ])
  for (const inv of invCatalog) {
    const k = inv.name.trim().toUpperCase()
    if (inv.revenueAccount) nameRev.set(k, inv.revenueAccount.accountNumber)
    nameSku.set(k, { dept: inv.skuDepartment, cat: inv.skuCategory })
  }
  for (const s of svcCatalog) if (s.revenueAccount) nameRev.set(s.name.trim().toUpperCase(), s.revenueAccount.accountNumber)
  // Product-income sub-classification (Department · Category) for the 7080
  // breakdown — display analytics over ALL completed orders' product items,
  // posted and synthesized alike.
  const productSubtypes = new Map<string, number[]>()
  const discountAcct = (label: string | null, discountType?: string | null): AcctInfo => {
    const l = (label || '').toLowerCase()
    const pick = (n: string, fallbackTitle: string) => byNumber.get(n) || virt(n, fallbackTitle, 'REVENUE', 'OPERATING_REVENUE', 'DEBIT')
    if (discountType === 'PWD_SC' || /pwd|senior/.test(l)) return pick('7130', 'PWD or Senior Citizen Discount')
    if (/vip/.test(l)) return pick('7170', 'VIP Card Discount')
    if (/interbranch/.test(l)) return pick('7190', 'Employee Interbranch Discount')
    if (/employee/.test(l)) return pick('7180', 'Employee Discount')
    return pick('7210', 'Other Discounts')
  }
  for (const o of orders) {
    if (o.revenueType !== 'UNEARNED') {
      const mIdx = monthOf(o.transactionDate) - 1
      for (const it of o.items) {
        if (it.isFreeSample) continue
        const sku = it.inventoryItem
          ? { dept: it.inventoryItem.skuDepartment, cat: it.inventoryItem.skuCategory }
          : (!it.service ? nameSku.get((it.name || '').trim().toUpperCase()) : undefined)
        if (!sku) continue
        const lbl = productSubtypeLabel(sku.dept, sku.cat)
        if (!productSubtypes.has(lbl)) productSubtypes.set(lbl, Array(12).fill(0))
        productSubtypes.get(lbl)![mIdx] += Number(it.lineTotal)
      }
    }
    if (hasRef('POS_ORDER', o.id)) continue
    if (o.transactionDate < LIVE_GL_POSTING_START) continue // already in the QB import — see LIVE_GL_POSTING_START
    synthesizedOrders++
    const oMonth = monthOf(o.transactionDate)
    const oLabel = `Order #${o.orderNumber}${o.patientName ? ` — ${o.patientName}` : ''}`
    const lines: { acct: AcctInfo; debit?: number; credit?: number }[] = []
    let paid = 0
    for (const p of o.payments) {
      const amt = Number(p.amount)
      if (!amt) continue
      paid += amt
      if (p.walletId && ['VIP_CARD', 'PREPAID_CARD', 'REWARD_POINTS'].includes(p.method as string)) {
        lines.push({ acct: unearnedAccount(), debit: amt }) // wallet draw-down consumes the liability
        continue
      }
      if (p.method === 'HMO' || p.method === 'GL') {
        lines.push({ acct: arAccount(), debit: amt })
        continue
      }
      let net = amt
      for (const d of p.paymentMode?.deductions || []) {
        const dAmt = d.valueType === 'PERCENT' || Number(d.rate) < 1 ? amt * Number(d.rate) / (d.valueType === 'PERCENT' ? 100 : 1) : Number(d.rate)
        if (!dAmt || !d.account) continue
        lines.push({ acct: byNumber.get(d.account.accountNumber) || parseAccountKey(`${d.account.accountNumber} deduction`), debit: dAmt })
        net -= dAmt
      }
      // No branch on the payment mode's own account -> land on THIS order's
      // branch's default cash, never the bare company-wide fallback. Without
      // the branch argument every unmapped payment mode across every branch
      // fell onto SCEI Main Corporate Account regardless of which branch's
      // register actually took the payment.
      const cashA = p.paymentMode?.account ? (byNumber.get(p.paymentMode.account.accountNumber) || defaultCash(o.branch)) : defaultCash(o.branch)
      lines.push({ acct: cashA, debit: net })
    }
    const unpaid = round2(Number(o.netAmount) - paid)
    if (unpaid > 0.005) lines.push({ acct: arAccount(), debit: unpaid })

    if (o.revenueType === 'UNEARNED') {
      lines.push({ acct: unearnedAccount(), credit: Number(o.netAmount) })
    } else {
      for (const it of o.items) {
        if (it.isFreeSample) continue
        const revNum = it.service?.revenueAccount?.accountNumber || it.inventoryItem?.revenueAccount?.accountNumber
          || nameRev.get((it.name || '').trim().toUpperCase())
        const rev = revNum ? (byNumber.get(revNum) || virt(revNum, 'Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT'))
          : (byNumber.get('7000') || virt('7000', 'Gross Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT'))
        lines.push({ acct: rev, credit: Number(it.lineTotal) })
      }
      if (Number(o.discountAmount) > 0.005) lines.push({ acct: discountAcct(o.discountLabel, o.discountType), debit: Number(o.discountAmount) })
    }
    postBalanced('orders', oMonth, oLabel, lines)

    // COGS / free samples at FIFO cost against inventory
    for (const it of o.items) {
      const cogs = Number(it.cogsCost || 0)
      if (cogs <= 0.005) continue
      if (it.isFreeSample && hasRef('FREE_SAMPLE', o.id)) continue
      const expNum = it.isFreeSample ? '8120' : (it.inventoryItem?.expenseAccount?.accountNumber || '8320')
      const exp = byNumber.get(expNum) || virt(expNum, it.isFreeSample ? 'Marketing and Advertising Expense' : 'Cost of Sales', 'EXPENSE', it.isFreeSample ? 'INDIRECT_EXPENSES' : 'DIRECT_EXPENSES', 'DEBIT')
      postBalanced('cogs', oMonth, `${oLabel} — cost of goods`, [
        { acct: exp, debit: cogs },
        { acct: inventoryAcct(it.inventoryItem?.accountSubType), credit: cogs },
      ])
    }
  }
  if (synthesizedOrders) validation.synthesized.push(`orders (${synthesizedOrders})`)

  /* ── 4. AR collections (synthesized when no AR_PAYMENT JE) ── */
  const arPayments = await prisma.aRPayment.findMany({
    where: {
      paymentDate: { gte: start, lt: end },
      ...(branch !== 'ALL' ? { branch: { in: [branch, orderBranch] } } : {}),
    },
    select: { id: true, amount: true, discount: true, paymentDate: true, branch: true, cashAccount: { select: { accountNumber: true } }, discountAccount: { select: { accountNumber: true } }, wallet: { select: { patientName: true } } },
  })
  let synthesizedAr = 0
  for (const p of arPayments) {
    if (hasRef('AR_PAYMENT', p.id)) continue
    synthesizedAr++
    // Same fix as the orders section above: an unmapped cash account must land
    // on THIS payment's own branch, not the bare company-wide fallback.
    const pBranch = BRANCH_MAP[p.branch || ''] || p.branch || undefined
    const cashA = p.cashAccount ? (byNumber.get(p.cashAccount.accountNumber) || defaultCash(pBranch)) : defaultCash(pBranch)
    const lines: { acct: AcctInfo; debit?: number; credit?: number }[] = [
      { acct: cashA, debit: Number(p.amount) },
      { acct: arAccount(), credit: Number(p.amount) + Number(p.discount || 0) },
    ]
    if (Number(p.discount || 0) > 0.005) {
      const dA = p.discountAccount ? byNumber.get(p.discountAccount.accountNumber) : undefined
      lines.push({ acct: dA || discountAcct('other'), debit: Number(p.discount) })
    }
    postBalanced('ar-collections', monthOf(p.paymentDate), `HMO/GL collection${p.wallet?.patientName ? ` — ${p.wallet.patientName}` : ''}`, lines)
  }
  if (synthesizedAr) validation.synthesized.push(`ar-collections (${synthesizedAr})`)

  /* ── 5. Petty cash (never posts to the GL) — same rules as the v1 report ── */
  /**
   * The account a branch's petty cash vouchers are spent out of — its real BDO
   * Petty Cash bank account, never a separate "on hand" float.
   *
   * The 11300-11314 "Petty Cash on Hand" accounts have been retired. They only
   * ever received (11300 reached +P2.34M) or only ever paid out, because the
   * replenishment landed in the bank account while the spending was booked to
   * the float, and the two halves never met. Worse, a float carries no bank
   * statement, so no true-up could ever correct it. One account per branch
   * holds the whole petty cash pool and the bank statement keeps it honest.
   *
   * Still resolved per branch: an unqualified /petty cash/ search returns the
   * FIRST matching account for every branch, which is how East's and Verdana's
   * spending once landed on Greenhills' 013820011174 and sank it to -P12.98M.
   * A branch with no petty cash account of its own falls back to its default
   * bank rather than borrowing another branch's.
   */
  const pcCashFor = (b: string): AcctInfo => {
    const p = BRANCH_PREFIX[b]
    if (p) {
      const own = new RegExp(`^${p}\\b.*petty cash`, 'i')
      // Lowest account number wins, deliberately. A branch can hold more than
      // one petty cash account — Verdana has both 004680350310 and the empty
      // 013820019086 "(New)" — and `byNumber` iterates in whatever order the
      // database returned the rows, so an unordered scan would pick a different
      // account run to run and silently split the branch's petty cash in two.
      // Lowest number is the incumbent: the account carrying the history and
      // the imported statements a newer, still-empty one does not have yet.
      const owns = [...byNumber.values()]
        .filter(a => a.type === 'ASSET' && own.test(a.title))
        .sort((x, y) => x.number.localeCompare(y.number))
      if (owns.length) return owns[0]
    }
    return defaultCash(b)
  }
  /**
   * Where the money actually left from.
   *
   * Only PETTY_CASH vouchers are spent out of a branch's float. ONE_TIME rows
   * are RFPs and imported QuickBooks expenses settled from a bank account — or
   * offset against an advance / due-from-employee, which `paymentBankAccount`
   * names explicitly. Crediting those to the float is what drove 11300/11310/
   * 11312 to -P8.09M across 2026 against roughly P160k of genuine vouchers and
   * P247k of replenishment: the float is not a bank account, so no statement
   * can ever true it back, and that fiction flowed straight into Ending Cash.
   */
  const settlementFor = (e: { recordType: string | null; paymentBankAccount: string | null; branch: string | null }): AcctInfo => {
    if (e.recordType === 'PETTY_CASH') return pcCashFor(e.branch || branch)
    // Resolve by number only. parseAccountKey would invent a virtual EXPENSE
    // account for anything unrecognized, which would book the payment a second
    // time as cost instead of relieving cash.
    const num = (e.paymentBankAccount || '').trim().match(/^(\d{4,})\s/)?.[1]
    if (num && byNumber.get(num)) return byNumber.get(num)!
    return defaultCash(e.branch || branch)
  }
  const pcEntries = await prisma.pettyCashEntry.findMany({
    where: {
      date: { gte: start, lt: end },
      ...(branch !== 'ALL' ? { branch: orderBranch } : { branch: { not: 'CEO' } }),
    },
    // branch comes along so an All-Branches run can draw each voucher on its
    // own float rather than lumping every branch onto one.
    select: { accountTitle: true, date: true, vatable: true, grossAmount: true, validity: true, pcfStatus: true, recordType: true, skipReports: true, pcvNumber: true, description: true, branch: true, paymentBankAccount: true },
  })
  let pcCount = 0
  for (const e of pcEntries) {
    if (!e.accountTitle || !e.date) continue
    if (e.pcfStatus === 'Cancelled' || e.validity === 'Cancelled' || e.vatable === 'Cancelled') continue
    if (e.recordType === 'RECURRING' || e.skipReports) continue
    const gross = Number(e.grossAmount)
    if (!gross) continue
    const net = e.vatable === 'VAT' ? gross / 1.12 : gross
    const vat = gross - net
    pcCount++
    postBalanced('petty-cash', monthOf(e.date), `PCV ${e.pcvNumber}${e.description ? ` — ${e.description}` : ''}`, [
      { acct: parseAccountKey(e.accountTitle), debit: net },
      ...(vat > 0.005 ? [{ acct: inputVat(), debit: vat }] : []),
      { acct: settlementFor(e), credit: gross },
    ])
  }
  if (pcCount) validation.synthesized.push(`petty-cash (${pcCount})`)

  // Distributed recurring (prepaid amortization) — payment builds the prepaid
  // asset; each covered month expenses net/n against it.
  const pcSettings = await prisma.pettyCashSettings.findMany({ select: { branch: true, prepaidAccount: true } })
  const prepaidByBranch: Record<string, string | null> = {}
  for (const s of pcSettings) prepaidByBranch[s.branch] = s.prepaidAccount
  const distEntries = await prisma.pettyCashEntry.findMany({
    where: {
      recordType: 'RECURRING', distributeMonthly: true,
      distributeStart: { not: null }, distributeEnd: { not: null },
      ...(branch !== 'ALL' ? { branch: orderBranch } : { branch: { not: 'CEO' } }),
    },
    select: { accountTitle: true, date: true, vatable: true, grossAmount: true, validity: true, pcfStatus: true, distributeStart: true, distributeEnd: true, branch: true, pcvNumber: true, description: true },
  })
  for (const e of distEntries) {
    if (!e.accountTitle || !e.distributeStart || !e.distributeEnd) continue
    if (e.pcfStatus === 'Cancelled' || e.validity === 'Cancelled' || e.vatable === 'Cancelled') continue
    const gross = Number(e.grossAmount)
    if (!gross) continue
    const net = e.vatable === 'VAT' ? gross / 1.12 : gross
    const vat = gross - net
    const sd = new Date(e.distributeStart), ed = new Date(e.distributeEnd)
    const sIdx = sd.getUTCFullYear() * 12 + sd.getUTCMonth()
    const eIdx = ed.getUTCFullYear() * 12 + ed.getUTCMonth()
    const count = eIdx - sIdx + 1
    if (count <= 0) continue
    const prepaidKey = prepaidByBranch[e.branch]
    const prepaid = prepaidKey ? parseAccountKey(prepaidKey) : inputVat()
    const prepaidLabel = `PCV ${e.pcvNumber}${e.description ? ` — ${e.description}` : ''}`
    if (e.date && new Date(e.date).getUTCFullYear() === year) {
      postBalanced('prepaid-recurring', monthOf(e.date), `${prepaidLabel} (prepaid payment)`, [
        { acct: prepaid, debit: net },
        ...(vat > 0.005 ? [{ acct: inputVat(), debit: vat }] : []),
        { acct: pcCashFor(e.branch || branch), credit: gross },
      ])
    }
    for (let idx = sIdx; idx <= eIdx; idx++) {
      if (Math.floor(idx / 12) !== year) continue
      postBalanced('prepaid-recurring', (idx % 12) + 1, `${prepaidLabel} (monthly amortization)`, [
        { acct: parseAccountKey(e.accountTitle), debit: net / count },
        { acct: prepaid, credit: net / count },
      ])
    }
  }

  // CEO petty cash allocated across branches
  const ceoEntries = await prisma.pettyCashEntry.findMany({
    where: { branch: 'CEO', date: { gte: start, lt: end } },
    select: { accountTitle: true, date: true, vatable: true, branchAllocations: true, validity: true, pcfStatus: true, pcvNumber: true, description: true },
  })
  for (const e of ceoEntries) {
    if (!e.accountTitle || !e.date) continue
    if (e.pcfStatus === 'Cancelled' || e.validity === 'Cancelled' || e.vatable === 'Cancelled') continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allocs = Array.isArray(e.branchAllocations) ? (e.branchAllocations as any[]) : []
    for (const a of allocs) {
      const ab = a?.branch as string | undefined
      const ag = Number(a?.amount) || 0
      if (!ab || !ag) continue
      if (branch !== 'ALL' && ab !== orderBranch) continue
      const netA = e.vatable === 'VAT' ? ag / 1.12 : ag
      const vatA = ag - netA
      postBalanced('petty-cash-ceo', monthOf(e.date), `PCV ${e.pcvNumber} (CEO allocation)${e.description ? ` — ${e.description}` : ''}`, [
        { acct: parseAccountKey(e.accountTitle), debit: netA },
        ...(vatA > 0.005 ? [{ acct: inputVat(), debit: vatA }] : []),
        { acct: pcCashFor(ab), credit: ag },
      ])
    }
  }

  /* ── 6. Depreciation schedule (synthesized per branch/month, unless a real
     depreciation-account posting already covers that exact branch+month) ── */
  const assets = await prisma.asset.findMany({
    where: { ...(branch !== 'ALL' ? { branch: orderBranch as never } : {}) },
    select: { id: true, name: true, dateBought: true, depreciationEndDate: true, monthlyDepreciation: true, classification: true, totalAmount: true, fromPettyCash: true, sourceAccountId: true, branch: true },
  })
  const depAcct = byNumber.get('8070') || virt('8070', 'Depreciation Expense', 'EXPENSE', 'NON_OPERATING_EXPENSES', 'DEBIT')
  const accumDep = byNumber.get('2010') || findByTitle(/accumulated dep/i) || virt('2010', 'Accumulated Depreciation', 'ASSET', 'PPE', 'CREDIT')
  /*
   * A single global "any real JE with referenceType DEPRECIATION" check
   * can't see it: QuickBooks' imported depreciation catch-up rows carry
   * referenceType QB_IMPORT_JE, never DEPRECIATION, so that check always
   * missed them and synthesis piled a second depreciation charge on top of
   * real ones already posted to 8070 — same shape as the orders/revenue
   * double-count. Coverage also turned out inconsistent per branch (East:
   * real entries for every month of 2025; Greenhills: only from May; every
   * other branch: none at all), so a blanket date cutoff like the orders fix
   * would have deleted real depreciation outright wherever it doesn't exist.
   * The fix has to match the data's own granularity: skip synthesis only for
   * the exact (branch, month) pairs a real 8070 posting already covers.
   */
  const realDepLines = await prisma.journalEntryLine.findMany({
    where: { account: { accountNumber: '8070' }, journalEntry: { entryDate: { gte: start, lt: end } } },
    select: { journalEntry: { select: { entryDate: true, branch: true } } },
  })
  const realDepCovered = new Set<string>()
  for (const l of realDepLines) {
    const m = l.journalEntry.entryDate.getUTCMonth() + 1
    realDepCovered.add(`${l.journalEntry.branch}|${m}`)
  }
  {
    // Accrue only months that have actually elapsed: for the current year stop
    // at this month (matching Asset Management's depreciation-to-date), for
    // past years take all 12, for future years none.
    const nowDate = new Date()
    const depMonthCap = year < nowDate.getUTCFullYear() ? 12
      : year > nowDate.getUTCFullYear() ? 0
      : nowDate.getUTCMonth() + 1
    // One entry per asset per month, so drilling into 8070 / 2010 shows
    // exactly which assets make up the depreciation figure.
    let depTotal = 0
    for (let m = 0; m < depMonthCap; m++) {
      const monthStart = new Date(Date.UTC(year, m, 1))
      const monthEnd = new Date(Date.UTC(year, m + 1, 1))
      for (const a of assets) {
        const md = Number(a.monthlyDepreciation)
        if (!md) continue
        if (realDepCovered.has(`${a.branch}|${m + 1}`)) continue
        if (new Date(a.dateBought) < monthEnd && new Date(a.depreciationEndDate) > monthStart) {
          depTotal += md
          postBalanced('depreciation-schedule', m + 1, `Depreciation — ${a.name}`, [
            { acct: depAcct, debit: md },
            { acct: accumDep, credit: md },
          ])
        }
      }
    }
    if (depTotal > 0.005) validation.synthesized.push('depreciation-schedule')
  }

  /* ── 7. Asset purchases this year (synthesized unless ASSET_PURCHASE JE) ── */
  let synthesizedAssets = 0
  for (const a of assets) {
    const d = new Date(a.dateBought)
    if (d < start || d >= end) continue
    if (hasRef('ASSET_PURCHASE', a.id)) continue
    const amt = Number(a.totalAmount)
    if (!amt) continue
    synthesizedAssets++
    const ppe = byNumber.get(a.classification) || virt(a.classification || '1500', `PPE (${a.classification})`, 'ASSET', 'PPE', 'DEBIT')
    const creditA = a.fromPettyCash ? pcCashFor(a.branch)
      : a.sourceAccountId ? (byId.get(a.sourceAccountId) || defaultCash(a.branch))
      : defaultCash(a.branch)
    postBalanced('asset-purchases', monthOf(a.dateBought), `Asset purchase — ${a.name}`, [
      { acct: ppe, debit: amt },
      { acct: creditA, credit: amt },
    ])
  }
  if (synthesizedAssets) validation.synthesized.push(`asset-purchases (${synthesizedAssets})`)

  /* ── 8. Bank-statement true-up: cash on the sheet = cash at the bank ──
     The ledger only subtracts what has been categorized, so while Bank Rec has
     a backlog, ledger cash floats above reality. Each bank account with an
     imported statement is trued MONTH BY MONTH to the bank's own running
     balance at that month end; the difference sits on ONE visible equity line,
     "Cash Pending Reconciliation", which shrinks toward zero as pending lines
     get categorized — at which point the true-up posts nothing at all.
     Only the change in that gap is posted each month, so the cash flow reads as
     "movement in the uncategorized backlog" rather than a whole year's gap
     landing in whichever month happened to hold the last statement line.
     Months with no statement hold the previous month's true-up steady, so real
     ledger movement after the statements run out flows through untouched.
     A statement is whole-account, so a branch may only be trued to the accounts
     the Chart of Accounts says are ITS OWN (Account.branch). Every other cash
     account is held at zero in that view — a branch does not hold a balance in
     another branch's bank account. Without this a branch view had no statement
     to lean on and no opening balance either, and read raw tagged movement:
     Greenhills showed -P12.0M on its own checking account. */
  {
    try {
      // Every statement line IN THIS PERIOD that carries a running balance, so
      // each month can be trued to the bank's own closing balance for THAT
      // month rather than the whole year's difference landing in one column.
      // Scoped to the period on purpose: a balance from an earlier year says
      // nothing about this year's month ends, and monthOf would clamp it to
      // January, freezing cash at a stale figure for the whole year.
      /* A foreign-currency account's statement balance is in ITS currency —
         the CNY account's ¥23,643.59 was being summed into peso cash as
         ₱23,643.59. Policy (user, 2026-08-10): value it at the bank-rec
         conversion rate — the ExchangeRate rows the forex matches recorded —
         using the latest rate on or before the statement date. An account
         whose currency has no recorded rate at all is left raw and flagged in
         the notes rather than silently guessed at. */
      const fxAccts = [...byId.values()].filter(a => a.currency && a.currency !== 'PHP')
      const fxRates = new Map<string, { date: Date; rate: number }[]>()
      if (fxAccts.length) {
        const rateRows = await prisma.exchangeRate.findMany({
          where: { currency: { in: [...new Set(fxAccts.map(a => a.currency!))] } },
          orderBy: { date: 'asc' },
          select: { currency: true, date: true, phpPerUnit: true },
        })
        for (const r of rateRows) {
          if (!fxRates.has(r.currency)) fxRates.set(r.currency, [])
          fxRates.get(r.currency)!.push({ date: r.date, rate: Number(r.phpPerUnit) })
        }
        const missing = fxAccts.filter(a => !fxRates.has(a.currency!))
        if (missing.length) validation.notes.push(
          `No bank-rec exchange rate recorded for ${missing.map(a => `${a.currency} (${a.title})`).join(', ')} — ` +
          `their statement balances are shown at face value until a currency exchange is matched in Bank Reconciliation.`,
        )
      }
      const toPhp = (acctId: string, bal: number, asOf: Date): number => {
        const acct = byId.get(acctId)
        if (!acct?.currency || acct.currency === 'PHP') return bal
        const rows = fxRates.get(acct.currency)
        if (!rows?.length) return bal
        let rate = rows[0].rate                       // before the first known rate, use it
        for (const r of rows) { if (r.date <= asOf) rate = r.rate; else break }
        return bal * rate
      }
      const stmtLines = await prisma.bankTransaction.findMany({
        where: { date: { gte: start, lt: end }, statementBalance: { not: null }, ...LIVE_STMT },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        select: { bankAccountId: true, date: true, statementBalance: true },
      })
      // last statement balance seen in each month, per account
      const byAcctMonth = new Map<string, Map<number, number>>()
      const firstMonth = new Map<string, number>()
      for (const t of stmtLines) {
        const m = t.date.getUTCMonth() + 1
        if (!byAcctMonth.has(t.bankAccountId)) byAcctMonth.set(t.bankAccountId, new Map())
        byAcctMonth.get(t.bankAccountId)!.set(m, toPhp(t.bankAccountId, Number(t.statementBalance), t.date))
        if (!firstMonth.has(t.bankAccountId)) firstMonth.set(t.bankAccountId, m)
      }
      const pendReconcile = virt('3990', 'Cash Pending Reconciliation (uncategorized bank items)', 'EQUITY', 'OWNERS_EQUITY', 'CREDIT')
      /* Whose cash is this? All Branches owns everything; a branch owns only the
         accounts tagged to it. An untagged (shared/corporate) account belongs to
         no branch, so it shows in the All Branches view alone. */
      const ownsBank = (a: AcctInfo): boolean =>
        branch === 'ALL' ? true : !!a.branch && branchValues!.includes(a.branch)

      /* The period OPENING has to be trued too, not just the month ends.
         Every BeginningBalance row is dated 2026-01-01 while the statements run
         from 2024, so the sheet opened the year on a ledger figure the bank had
         already disagreed with. Truing month ends but not the opening left
         Beginning Cash and Ending Cash resting on two different sources, which
         is exactly what stopped the cash flow tying to the bank. The offset
         goes to the same visible 3990 line, so assets = liabilities + equity
         still holds at the opening. */
      // Only the LAST line before the period matters, so let Postgres pick it
      // rather than shipping every historical statement line to the app just to
      // overwrite it: the years before 2026 hold tens of thousands of rows.
      const priorLines = await prisma.$queryRaw<{ bankAccountId: string; statementBalance: unknown; date: Date }[]>`
        SELECT DISTINCT ON ("bankAccountId") "bankAccountId", "statementBalance", date
        FROM "BankTransaction"
        WHERE date < ${start} AND "statementBalance" IS NOT NULL AND status IN ('PENDING','POSTED')
        ORDER BY "bankAccountId", date DESC, id DESC`
      const bankOpening = new Map<string, number>()
      for (const t of priorLines) bankOpening.set(t.bankAccountId, toPhp(t.bankAccountId, Number(t.statementBalance), t.date))
      let openingTrued = 0
      for (const n of bankFlagged) {
        const acct = byNumber.get(n)
        if (!acct?.id) continue
        // Not this branch's account -> it opens at zero here, not at the bank's
        // balance, which belongs to whichever branch does own it.
        const bankOpen = ownsBank(acct) ? bankOpening.get(acct.id) : 0
        if (bankOpen === undefined) continue
        const delta = round2(bankOpen - (opening.get(n) || 0))
        if (Math.abs(delta) < 0.01) continue
        // Drilling 3990 should show its opening component too, not just the
        // monthly true-ups: which account opened away from the bank, and by
        // how much.
        if (collect && collect.account === pendReconcile.number && (!collect.month || collect.cumulative)) {
          collected.push({
            month: 0, source: 'bank-opening-trueup',
            label: `${acct.number} ${acct.title} — books opened at ${(opening.get(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}, bank read ${bankOpen.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
            debit: delta < 0 ? -delta : 0,
            credit: delta > 0 ? delta : 0,
          })
        }
        opening.set(n, bankOpen)                                             // cash: debit-normal
        opening.set(pendReconcile.number, round2((opening.get(pendReconcile.number) || 0) + delta)) // equity: credit-normal
        openingTrued++
      }
      if (openingTrued) validation.synthesized.push(`bank-opening-trueup (${openingTrued})`)

      let trueups = 0
      for (const n of bankFlagged) {
        const acct = byNumber.get(n)
        if (!acct?.id) continue
        const owned = ownsBank(acct)
        const months = owned ? byAcctMonth.get(acct.id) : undefined
        if (owned && !months) continue
        const mm = movMonthly.get(n)
        const firstM = owned ? (firstMonth.get(acct.id) ?? 1) : 1
        // Walk the year: at each month end the sheet should read what the bank
        // read. Only the CHANGE in the required adjustment is posted, so each
        // month carries its own correction and none carries the whole year's.
        let ledger = opening.get(n) || 0
        let carried = 0          // adjustment already posted in earlier months
        // A foreign account starts and stays at zero; an owned one waits for its
        // first statement line before there is anything to true to.
        let lastKnown: number | null = owned ? null : 0
        for (let m = 1; m <= 12; m++) {
          ledger += (mm?.debit[m] || 0) - (mm?.credit[m] || 0)   // cash is debit-normal
          const stmt = months?.get(m)
          if (stmt !== undefined) lastKnown = stmt
          // Before the account's first statement line there is nothing to true
          // to. After the last one the account is HELD at the bank's last known
          // balance rather than left to drift on ledger movement alone: the
          // months after the final statement are exactly the ones whose entries
          // Bank Rec has not confirmed, and letting them move cash is what put
          // P977k on 004680350310 against a bank that reads 0.00. The drift is
          // not discarded — it lands on the visible 3990 line and comes back the
          // moment the next statement is imported.
          if (m < firstM || lastKnown === null) continue
          const want = round2(lastKnown - (ledger + carried))
          if (Math.abs(want) < 0.01) continue
          postBalanced('bank-trueup', m, owned
            ? `True-up to bank statement — ${acct.title}`
            : `Not this branch's account — ${acct.title}`, [
            want < 0 ? { acct, credit: -want } : { acct, debit: want },
            want < 0 ? { acct: pendReconcile, debit: -want } : { acct: pendReconcile, credit: want },
          ])
          carried = round2(carried + want)
          trueups++
        }
      }

      /* A physical cash float cannot hold less than nothing.
         Petty cash floats have no statement to true to, so nothing catches them
         when vouchers are recorded but the replenishment that funded them is
         not: across 2026 that put 11300/11301/11309/11310/11312/11314 at
         -P592k, which is not negative cash — it is spending whose funding is
         missing from the ledger. Each un-banked cash account is therefore held
         at its floor of zero and the shortfall goes to the same visible 3990
         line, so Cash stays truthful and the size of the gap stays legible.
         It disappears by itself once the replenishments are recorded. */
      let floored = 0
      for (const acct of byNumber.values()) {
        if (acct.virtual || !acct.id) continue
        if (!(bankFlagged.has(acct.number) || isCashAccount(acct))) continue
        if (!ownsBank(acct)) continue                 // zeroed above, not ours to floor
        if (byAcctMonth.has(acct.id)) continue        // has statements — trued above
        const mm = movMonthly.get(acct.number)
        let raw = opening.get(acct.number) || 0
        let carried = 0
        for (let m = 1; m <= 12; m++) {
          raw += (mm?.debit[m] || 0) - (mm?.credit[m] || 0)
          const want = round2(Math.max(0, -raw))      // lift just to zero, never above
          const delta = round2(want - carried)
          if (Math.abs(delta) < 0.01) continue
          postBalanced('float-floor', m, `Unfunded petty cash float — ${acct.title}`, [
            delta < 0 ? { acct, credit: -delta } : { acct, debit: delta },
            delta < 0 ? { acct: pendReconcile, debit: -delta } : { acct: pendReconcile, credit: delta },
          ])
          carried = want
          floored++
        }
      }
      if (floored) validation.synthesized.push(`unfunded-float-floor (${floored})`)

      if (trueups) {
        validation.synthesized.push(`bank-statement-trueup (${trueups})`)
        validation.notes.push(
          `Cash is trued to the imported bank statements month by month: each bank account is stated at the bank's own ` +
          `closing balance for every month that has statement lines, so no single month absorbs the whole year's ` +
          `difference. The offset sits on the visible equity line "3990 Cash Pending Reconciliation" and shrinks as ` +
          `pending Bank Reconciliation lines are categorized. Months before an account's first statement line, and ` +
          `after its last, are left untrued.`,
        )
      }
    } catch { /* statements are optional */ }
  }

  /* ── 9. Income tax provision (Phase-1 chain, balanced against ITP / DTA) ── */
  // computed after the trial balance below — placeholder filled later.

  /* ── Build account rows ── */
  const rows: V2AccountRow[] = []
  const numbers = new Set<string>([...mov.keys(), ...opening.keys()])
  for (const n of numbers) {
    const a = byNumber.get(n)!
    const m = mov.get(n) || { debit: 0, credit: 0 }
    const mm = movMonthly.get(n)
    const open = opening.get(n) || 0
    const closing = a.normalBalance === 'DEBIT' ? open + m.debit - m.credit : open + m.credit - m.debit
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const d = mm?.debit[i + 1] || 0, c = mm?.credit[i + 1] || 0
      return round2(a.normalBalance === 'DEBIT' ? d - c : c - d)
    })
    rows.push({
      number: n, title: a.title, type: a.type, subType: a.subType,
      opening: round2(open), debit: round2(m.debit), credit: round2(m.credit),
      closing: round2(closing), monthly, virtual: a.virtual,
      cash: bankFlagged.has(n) || isCashAccount(a),
    })
  }
  rows.sort((x, y) => x.number.localeCompare(y.number))

  /* ── Income statement chain (same shape as Phase 1, from the dataset) ── */
  const isRow = (r: V2AccountRow) => byNumber.get(r.number)!
  const revRows = rows.filter(r => r.type === 'REVENUE' && isRow(r).normalBalance === 'CREDIT')
  const discRows = rows.filter(r => r.type === 'REVENUE' && isRow(r).normalBalance === 'DEBIT')
  const expRows = rows.filter(r => r.type === 'EXPENSE')
  const bucket = (r: V2AccountRow): 'cogs' | 'opex' | 'dep' | 'int' | 'nonop' => {
    if (r.number === '8070') return 'dep'
    if (r.number === '8310') return 'int'
    const st = r.subType
    if (st === 'DIRECT_EXPENSES' || st.startsWith('COGS')) return 'cogs'
    if (st === 'INDIRECT_EXPENSES' || st === 'OPERATING_EXPENSES') return 'opex'
    if (st.includes('NON_OPERATING')) return 'nonop'
    // Unknown/blank sub-type (incl. virtual accounts synthesized from free-text
    // titles): treat as OPERATING so an unclassified expense never silently
    // slips below EBITDA. It still surfaces in validation.unclassified.
    return 'opex'
  }
  const sum = (rs: V2AccountRow[]) => round2(rs.reduce((s, r) => s + r.closing - r.opening, 0)) // period movement only for IS
  const grossRevenue = sum(revRows)
  const totalDiscounts = sum(discRows)
  const netSales = round2(grossRevenue - totalDiscounts)
  const cogsRows = expRows.filter(r => bucket(r) === 'cogs')
  const opexRows = expRows.filter(r => bucket(r) === 'opex')
  const depRows = expRows.filter(r => bucket(r) === 'dep')
  const intRows = expRows.filter(r => bucket(r) === 'int')
  const nonopRows = expRows.filter(r => bucket(r) === 'nonop')
  const totalCOGS = sum(cogsRows)
  const grossProfit = round2(netSales - totalCOGS)
  const totalOpex = sum(opexRows)
  const ebitda = round2(grossProfit - totalOpex)
  const depreciation = sum(depRows)
  const interest = sum(intRows)
  const nonOperating = sum(nonopRows)
  const ebt = round2(ebitda - depreciation - interest - nonOperating)
  const taxProvision = round2(ebt * INCOME_TAX_RATE)
  const netIncome = round2(ebt - taxProvision)

  const incomeTaxPayable = taxProvision > 0 ? taxProvision : 0
  const deferredTaxAsset = taxProvision < 0 ? -taxProvision : 0

  /* ── Balance sheet ── */
  const bsRows = rows.filter(r => r.type === 'ASSET' || r.type === 'LIABILITY' || r.type === 'EQUITY')
  // Statement-signed value: contra accounts (credit-normal assets like
  // Accumulated Depreciation, debit-normal equity like Treasury Shares) show
  // and sum as negatives on their own side of the sheet.
  const bsFactor = (r: V2AccountRow) => {
    const nb = isRow(r).normalBalance
    return r.type === 'ASSET' ? (nb === 'DEBIT' ? 1 : -1) : (nb === 'CREDIT' ? 1 : -1)
  }
  const bsVal = (r: V2AccountRow) => r.closing * bsFactor(r)
  const claimed = new Set<string>()
  const bsSections = BS_SECTION.map(([key, label, match]) => {
    const secRows = bsRows.filter(r => !claimed.has(r.number) && match(isRow(r)))
    for (const r of secRows) claimed.add(r.number)
    return {
      key, label,
      // NOTE: on balance-sheet rows, `monthly` carries statement-signed
      // MONTH-END BALANCES (opening + cumulative movement), unlike income-
      // statement rows where it carries period movements.
      rows: secRows.filter(r => Math.abs(r.closing) >= 0.005 || Math.abs(r.opening) >= 0.005).map(r => {
        const f = bsFactor(r)
        let run = r.opening
        const monthlyBal = (r.monthly || Array(12).fill(0)).map(mv => { run += mv; return round2(run * f) })
        return { ...r, closing: round2(bsVal(r)), monthly: monthlyBal }
      }),
      total: round2(secRows.reduce((s, r) => s + bsVal(r), 0)),
    }
  }).filter(s => s.rows.length > 0 || Math.abs(s.total) >= 0.005)

  for (const r of bsRows) {
    if ((r.subType === '' || r.subType === 'UNCLASSIFIED') && Math.abs(r.closing) >= 0.005) {
      validation.unclassified.push({ number: r.number, title: r.title, type: r.type, subType: r.subType || '(none)', closing: r.closing })
    }
  }

  const sumType = (t: string) => round2(bsRows.filter(r => r.type === t).reduce((s, r) => s + bsVal(r), 0))
  const totalAssets = round2(sumType('ASSET') + deferredTaxAsset)
  const totalLiabilities = round2(sumType('LIABILITY') + incomeTaxPayable)
  // Equity = equity accounts + current-year net income (revenue/expense not yet closed)
  const totalEquity = round2(sumType('EQUITY') + netIncome)
  const aLEDiff = round2(totalAssets - (totalLiabilities + totalEquity))
  validation.aEqualsLE = Math.abs(aLEDiff) < 0.01
  validation.aLEDiff = aLEDiff

  /* ── Cash flow (indirect, ties by construction) ── */
  const cashRows = rows.filter(r => r.cash)
  const cashNumbers = new Set(cashRows.map(r => r.number))
  const ledgerBeginningCash = round2(cashRows.reduce((s, r) => s + r.opening, 0))
  const ledgerEndingCash = round2(cashRows.reduce((s, r) => s + r.closing, 0))

  /* ── Cash comes from the balance sheet, which §8 has already trued ──
     The cash flow and the balance sheet must be the same statement seen two
     ways: Ending Cash IS the balance sheet's cash line, or one of them is
     lying. This used to run a SECOND, independent bank anchor here, and the two
     mechanisms disagreed — §8 lets real ledger movement through after an
     account's last statement line while the anchor held that balance flat — so
     the sheet said one thing and the cash flow another.
     There is now one source: §8 trues each bank account to the bank month by
     month (and now at the opening too), and both statements read those rows. */
  const beginningCash = ledgerBeginningCash
  const endingCash = ledgerEndingCash

  /* ── Cash honesty check: ledger cash vs imported bank statements ──
     The ledger can only see recorded transactions. Bank Rec imports carry the
     bank's own running balance, so comparing the two per account shows exactly
     how far the books have drifted from the bank — and the pending
     (uncategorized) imports are the drift's cause, quantified. */
  // All-Branches only: a branch view excludes opening balances, so comparing its
  // ledger cash against full bank statements would manufacture a false gap.
  try {
    if (branch !== 'ALL') throw new Error('skip')
    const bankTx = await prisma.bankTransaction.groupBy({
      by: ['bankAccountId'],
      where: { date: { lt: end }, status: 'PENDING' },
      _sum: { spent: true, received: true },
      _count: { _all: true },
    })
    const pendingOut = round2(bankTx.reduce((s, t) => s + Number(t._sum.spent || 0), 0))
    const pendingIn = round2(bankTx.reduce((s, t) => s + Number(t._sum.received || 0), 0))
    const pendingCount = bankTx.reduce((s, t) => s + t._count._all, 0)
    // Latest statement balance per bank account, as of the report period's end.
    const latest = await prisma.bankTransaction.findMany({
      where: { date: { lt: end }, statementBalance: { not: null }, ...LIVE_STMT },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      select: { bankAccountId: true, date: true, statementBalance: true },
    })
    // Same currency policy as the true-up: a foreign account's statement
    // balance is valued at the bank-rec exchange rate in force on that date.
    const fxAccts2 = [...byId.values()].filter(a => a.currency && a.currency !== 'PHP')
    const fxRates2 = new Map<string, { date: Date; rate: number }[]>()
    if (fxAccts2.length) {
      const rateRows = await prisma.exchangeRate.findMany({
        where: { currency: { in: [...new Set(fxAccts2.map(a => a.currency!))] } },
        orderBy: { date: 'asc' },
        select: { currency: true, date: true, phpPerUnit: true },
      })
      for (const r of rateRows) {
        if (!fxRates2.has(r.currency)) fxRates2.set(r.currency, [])
        fxRates2.get(r.currency)!.push({ date: r.date, rate: Number(r.phpPerUnit) })
      }
    }
    const toPhp2 = (acctId: string, bal: number, asOf: Date): number => {
      const acct = byId.get(acctId)
      if (!acct?.currency || acct.currency === 'PHP') return bal
      const rows = fxRates2.get(acct.currency)
      if (!rows?.length) return bal
      let rate = rows[0].rate
      for (const r of rows) { if (r.date <= asOf) rate = r.rate; else break }
      return bal * rate
    }
    const latestByAcct = new Map<string, { bal: number; asOf: string }>()
    for (const t of latest) {
      if (!latestByAcct.has(t.bankAccountId)) {
        latestByAcct.set(t.bankAccountId, { bal: toPhp2(t.bankAccountId, Number(t.statementBalance), t.date), asOf: t.date.toISOString().slice(0, 10) })
      }
    }
    if (latestByAcct.size || pendingCount) {
      const reconRows = cashRows
        .filter(r => !r.virtual)
        .map(r => {
          const acctId = byNumber.get(r.number)?.id
          const stmt = acctId ? latestByAcct.get(acctId) : undefined
          return {
            number: r.number, title: r.title, ledgerClosing: round2(r.closing),
            statementBalance: stmt ? round2(stmt.bal) : null,
            statementAsOf: stmt ? stmt.asOf : null,
          }
        })
        .filter(r => r.statementBalance !== null || Math.abs(r.ledgerClosing) >= 0.005)
      const statementCash = round2(reconRows.reduce((s, r) => s + (r.statementBalance ?? 0), 0))
      validation.cashRecon = {
        rows: reconRows, ledgerCash: endingCash, statementCash,
        pendingOut, pendingIn, pendingCount,
      }
    }
  } catch { /* bank-rec tables may not exist in older deploys — the recon is optional */ }

  /* ── Module coverage: say plainly what the ledger cannot know ── */
  try {
    const firstPayroll = await prisma.payrollEntry.findFirst({
      where: { status: { not: 'DRAFT' } }, orderBy: { cutoffPeriod: 'asc' }, select: { cutoffPeriod: true },
    })
    if (firstPayroll) {
      const [py, pm] = firstPayroll.cutoffPeriod.split('-').map(Number)
      if (py > year || (py === year && pm > 1)) {
        // Imported QB payroll JEs can cover the months before the first cutoff —
        // if they exist in this period, the gap is filled, and saying otherwise
        // would send someone hunting for a problem that has been fixed.
        const qbImported = await prisma.journalEntry.count({
          where: { referenceType: 'QB_PAYROLL_IMPORT', entryDate: { gte: start, lt: end } },
        })
        if (qbImported > 0) {
          validation.notes.push(
            `Payroll cutoffs in the Hub start at ${firstPayroll.cutoffPeriod}; the months before that are covered by ` +
            `${qbImported} journal entries imported from the QuickBooks transaction history.`,
          )
        } else {
          validation.notes.push(
            `Payroll in the Hub starts with the ${firstPayroll.cutoffPeriod} cutoff — salaries and professional fees ` +
            `before that were never recorded here, so they are absent from these statements (and cash was never reduced by them).`,
          )
        }
      }
    } else if (year <= new Date().getFullYear()) {
      validation.notes.push('No payroll cutoffs exist in the Hub for this period — salaries and professional fees are absent from these statements.')
    }
  } catch { /* optional */ }
  // Debit-signed period change: the cash effect of ANY non-cash account is
  // exactly −(its debit-signed change), from double entry — contra-safe.
  const drDelta = (r: V2AccountRow) =>
    round2(isRow(r).normalBalance === 'DEBIT' ? r.closing - r.opening : -(r.closing - r.opening))
  const delta = (r: V2AccountRow) => -drDelta(r)
  // Per-month cash effect of a non-cash account (same sign convention).
  const effMonthly = (r: V2AccountRow) => {
    const nb = isRow(r).normalBalance
    return (r.monthly || Array(12).fill(0)).map(mv => round2(-(nb === 'DEBIT' ? mv : -mv)))
  }
  const sumMonthlyOf = (rs: V2AccountRow[]) =>
    Array.from({ length: 12 }, (_, i) => round2(rs.reduce((s, r) => s + (r.monthly?.[i] || 0), 0)))

  const wcRows = bsRows.filter(r => !cashNumbers.has(r.number) && (
    (r.type === 'ASSET' && (r.subType === 'CURRENT_ASSETS' || r.subType === 'INVENTORY' || r.subType.startsWith('INV_'))) ||
    (r.type === 'LIABILITY' && r.subType === 'CURRENT_LIABILITIES')
  ))
  const FINANCING_LIAB = /advance.*(stock|share)holder|(stock|share)holder.*advance|bonds?\s*payable|corporate\s*bond|(short|long)[-\s]*term\s*loan|loan.*payable/i
  const workingCapital: { label: string; amount: number; monthly?: number[] }[] = []
  let wcTotal = 0
  for (const r of wcRows) {
    if (FINANCING_LIAB.test(r.title)) continue
    const effect = delta(r) // cash effect
    if (Math.abs(effect) < 0.005) continue
    workingCapital.push({ label: `${r.number} ${r.title}`, amount: round2(effect), monthly: effMonthly(r) })
    wcTotal += effect
  }
  const investingRows = bsRows.filter(r => r.type === 'ASSET' && ['PPE', 'INTANGIBLE_ASSETS', 'OTHER_NON_CURRENT_ASSETS'].includes(r.subType) && r.number !== accumDep.number)
  const investing: { label: string; amount: number; monthly?: number[] }[] = []
  let invTotal = 0
  /* ── Corrections are not disposals ──
     Editing or deleting an asset (or removing a duplicate) posts an
     ASSET_PURCHASE_REVERSAL that credits the asset-cost account. In a month
     where corrections exceed new purchases the account's net cash effect goes
     positive, which reads as "proceeds from selling assets" — but no asset was
     sold; a recorded purchase was un-recorded. Pull those reversals out of each
     account's line and show them once, by name, so purchases stay gross and a
     reader never mistakes a data cleanup for disposal proceeds. */
  const invRevM = new Map<string, number[]>() // account number -> monthly reversal cash effect (+)
  try {
    const invIds = new Map(investingRows.map(r => [byNumber.get(r.number)?.id, r.number]).filter(([id]) => id) as [string, string][])
    if (invIds.size) {
      const revLines = await prisma.journalEntryLine.findMany({
        where: {
          accountId: { in: [...invIds.keys()] },
          journalEntry: {
            referenceType: 'ASSET_PURCHASE_REVERSAL',
            entryDate: { gte: start, lt: end },
            ...(branchValues ? { branch: { in: branchValues as never[] } } : {}),
          },
        },
        select: { accountId: true, debit: true, credit: true, journalEntry: { select: { entryDate: true } } },
      })
      for (const l of revLines) {
        const n = invIds.get(l.accountId)
        if (!n) continue
        const m = l.journalEntry.entryDate.getUTCMonth()
        if (!invRevM.has(n)) invRevM.set(n, Array(12).fill(0))
        // a reversal CREDIT shrinks the asset -> positive cash effect on this line
        invRevM.get(n)![m] = round2(invRevM.get(n)![m] + Number(l.credit) - Number(l.debit))
      }
    }
  } catch { /* corrections line is presentational — never block the statement */ }
  const corrMonthly = Array(12).fill(0)
  for (const arr of invRevM.values()) for (let i = 0; i < 12; i++) corrMonthly[i] = round2(corrMonthly[i] + arr[i])
  const corrTotal = round2(corrMonthly.reduce((a, b) => a + b, 0))
  for (const r of investingRows) {
    const rev = invRevM.get(r.number)
    const revTot = rev ? round2(rev.reduce((a, b) => a + b, 0)) : 0
    const effect = round2(delta(r) - revTot) // gross purchases, corrections excluded
    const monthly = effMonthly(r).map((v, i) => round2(v - (rev?.[i] || 0)))
    if (Math.abs(effect) < 0.005 && Math.abs(revTot) < 0.005) continue
    if (Math.abs(effect) >= 0.005) investing.push({ label: `${r.number} ${r.title}`, amount: effect, monthly })
    invTotal += effect
  }
  if (Math.abs(corrTotal) >= 0.005) {
    investing.push({ label: 'Asset purchase corrections / reversals (edits, deletions, duplicates)', amount: corrTotal, monthly: corrMonthly.map(round2) })
    invTotal += corrTotal
  }
  const financing: { label: string; amount: number; monthly?: number[] }[] = []
  let finTotal = 0
  for (const r of bsRows) {
    const isFinancing = r.type === 'EQUITY'
      || (r.type === 'LIABILITY' && (FINANCING_LIAB.test(r.title) || r.subType === 'NON_CURRENT_LIABILITIES'))
    if (!isFinancing) continue
    const effect = delta(r) // cash effect
    if (Math.abs(effect) < 0.005) continue
    financing.push({ label: `${r.number} ${r.title}`, amount: round2(effect), monthly: effMonthly(r) })
    finTotal += effect
  }
  // Non-current, non-investing, non-financing asset deltas (e.g. accumulated dep
  // sits inside `depreciation` add-back; anything else lands in working capital
  // catch-all so the statement still ties):
  const covered = new Set([...cashNumbers, ...wcRows.map(r => r.number), ...investingRows.map(r => r.number)])
  for (const r of bsRows) {
    if (covered.has(r.number)) continue
    if (r.type === 'EQUITY' || (r.type === 'LIABILITY' && (FINANCING_LIAB.test(r.title) || r.subType === 'NON_CURRENT_LIABILITIES' || r.subType === 'CURRENT_LIABILITIES'))) continue
    if (r.number === accumDep.number) continue // depreciation add-back
    const effect = delta(r) // cash effect
    if (Math.abs(effect) < 0.005) continue
    workingCapital.push({ label: `${r.number} ${r.title} (other)`, amount: round2(effect), monthly: effMonthly(r) })
    wcTotal += effect
  }

  // Per-month chain for the monthly/quarterly cash-flow view — same buckets,
  // month by month. Cash delta per month is the balance sheet's own cash
  // movement, so every column of the cash flow ends where the sheet does.
  const revM = sumMonthlyOf(revRows), discM = sumMonthlyOf(discRows), cogsM = sumMonthlyOf(cogsRows)
  const opexM = sumMonthlyOf(opexRows), depM = sumMonthlyOf(depRows), intM = sumMonthlyOf(intRows), nonopM = sumMonthlyOf(nonopRows)
  const ebtM = Array.from({ length: 12 }, (_, i) =>
    round2(revM[i] - discM[i] - cogsM[i] - opexM[i] - depM[i] - intM[i] - nonopM[i]))
  const cashM = sumMonthlyOf(cashRows)
  const cfMonthly = {
    netIncome: ebtM.map(e => round2(e * (1 - INCOME_TAX_RATE))),
    depreciation: depM,
    taxProvision: ebtM.map(e => round2(e * INCOME_TAX_RATE)),
    cashDelta: cashM,
  }

  /* The balance sheet's cash movement is the truth this statement has to
     explain. Where the activity sections cannot yet account for all of it the
     remainder is named on its own line rather than quietly breaking the tie —
     it is the uncategorized Bank Rec backlog, and it shrinks as lines are
     categorized. Without this the sections silently disagreed with cash. */
  const monthlyOf = (ls: { monthly?: number[] }[]) =>
    Array.from({ length: 12 }, (_, i) => ls.reduce((t, l) => t + (l.monthly?.[i] || 0), 0))
  const impliedTotal = round2(netIncome + depreciation + taxProvision + wcTotal + invTotal + finTotal)
  const residual = round2(round2(endingCash - beginningCash) - impliedTotal)
  if (Math.abs(residual) >= 0.005) {
    const impliedM = Array.from({ length: 12 }, (_, i) => round2(
      (cfMonthly.netIncome[i] || 0) + (cfMonthly.depreciation[i] || 0) + (cfMonthly.taxProvision[i] || 0)
      + monthlyOf(workingCapital)[i] + monthlyOf(investing)[i] + monthlyOf(financing)[i]))
    workingCapital.push({
      label: 'Uncategorized bank movement (pending Bank Reconciliation)',
      amount: residual,
      monthly: cashM.map((c, i) => round2(c - impliedM[i])),
    })
    wcTotal += residual
    validation.notes.push(
      `Beginning and Ending Cash are the balance sheet's own cash line, trued to the imported bank statements. ` +
      `${residual.toLocaleString('en-PH', { minimumFractionDigits: 2 })} of the movement is not yet explained by any ` +
      `activity section and sits on the "Uncategorized bank movement" line; it shrinks as pending Bank Reconciliation ` +
      `lines are categorized.`,
    )
  }

  const netOperating = round2(netIncome + depreciation + taxProvision + wcTotal)
  const netInvesting = round2(invTotal)
  const netFinancing = round2(finTotal)
  const netChange = round2(netOperating + netInvesting + netFinancing)
  const actualChange = round2(endingCash - beginningCash)
  validation.cfTies = Math.abs(netChange - actualChange) < 0.02

  const isSections = [
    { key: 'REVENUE', label: 'Gross Revenue', rows: revRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: grossRevenue },
    { key: 'DISCOUNTS', label: 'Discounts and Refunds', rows: discRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: totalDiscounts },
    { key: 'COGS', label: 'Cost of Sales', rows: cogsRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: totalCOGS },
    { key: 'OPEX', label: 'Operating Expenses', rows: opexRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: totalOpex },
    { key: 'DEPRECIATION', label: 'Depreciation', rows: depRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: depreciation },
    { key: 'INTEREST', label: 'Interest', rows: intRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: interest },
    { key: 'NON_OPERATING', label: 'Non-Operating Expenses', rows: nonopRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: nonOperating },
  ].filter(s => s.rows.length > 0)

  /* ── Per-person detail for the two payroll expense accounts ──────────
     A payroll journal posts one line for an entire cutoff, which tells you
     nothing about who was paid what. When the drill-down is on the salary or
     consultant-fee account, that single line is replaced by one row per person.

     Salary is shown as taxable pay — net pay plus the statutory deductions and
     withholding — because that is what the journal debits. Staff are paid part
     of their package as a non-taxable allowance, which is deliberately outside
     declared salary, so including gross here would overstate it and stop the
     detail from adding up to the line above it. */
  if (collect) {
    const mapping = await prisma.payrollCOAMapping.findFirst({
      select: { salaryExpenseAccountId: true, professionalFeesAccountId: true },
    })
    const salaryNo = mapping?.salaryExpenseAccountId
      ? byId.get(mapping.salaryExpenseAccountId)?.number : undefined
    const consultantNo = mapping?.professionalFeesAccountId
      ? byId.get(mapping.professionalFeesAccountId)?.number : undefined
    const isSalary = !!salaryNo && salaryNo === collect.account
    const isConsultant = !!consultantNo && consultantNo === collect.account
    // A cutoff belongs to the month in its period ("2026-05-2" → May), which is
    // where the journal put it only when it was finalized in the same month.
    const monthOfCutoff = (c: string) => parseInt(c.split('-')[1] ?? '0', 10)
    const keep = (l: V2CollectedLine) =>
      !(l.source === 'journal:PAYROLL_EMPLOYEE' || l.source === 'journal:PAYROLL_CONSULTANT')

    if (isSalary) {
      const slips = await prisma.employeePayslip.findMany({
        where: {
          cutoffPeriod: { startsWith: `${year}-` },
          ...(branchValues ? { branch: { in: branchValues } } : {}),
        },
        select: {
          cutoffPeriod: true, branch: true, netPay: true, sssDeduction: true,
          philhealthDeduction: true, pagibigDeduction: true, taxDeduction: true,
          employee: { select: { firstName: true, lastName: true } },
        },
      })
      const perPerson: V2CollectedLine[] = []
      for (const s of slips) {
        const month = monthOfCutoff(s.cutoffPeriod)
        if (month < 1 || month > 12) continue
        if (collect.month && collect.month !== month) continue
        const taxable = round2(
          Number(s.netPay) + Number(s.sssDeduction) + Number(s.philhealthDeduction) +
          Number(s.pagibigDeduction) + Number(s.taxDeduction))
        if (!taxable) continue
        const who = [s.employee?.lastName, s.employee?.firstName].filter(Boolean).join(', ') || 'Unnamed employee'
        perPerson.push({
          month, source: 'Employee payroll',
          label: `${who} — ${s.cutoffPeriod} — ${s.branch} (taxable pay)`,
          debit: taxable, credit: 0,
        })
      }
      if (perPerson.length) collected.splice(0, collected.length, ...collected.filter(keep), ...perPerson)
    }

    if (isConsultant) {
      const entries = await prisma.payrollEntry.findMany({
        where: {
          cutoffPeriod: { startsWith: `${year}-` },
          ...(branchValues ? { branch: { in: branchValues } } : {}),
        },
        select: { cutoffPeriod: true, branch: true, grossPay: true, consultantId: true },
      })
      // PayrollEntry holds only the consultant id, so the names come separately.
      const consultants = await prisma.consultant.findMany({
        where: { id: { in: Array.from(new Set(entries.map(e => e.consultantId))) } },
        select: { id: true, name: true },
      })
      const nameById = new Map(consultants.map(c => [c.id, c.name]))
      const perPerson: V2CollectedLine[] = []
      for (const e of entries) {
        const month = monthOfCutoff(e.cutoffPeriod)
        if (month < 1 || month > 12) continue
        if (collect.month && collect.month !== month) continue
        const amt = round2(Number(e.grossPay))
        if (!amt) continue
        const who = nameById.get(e.consultantId) || 'Unnamed consultant'
        perPerson.push({
          month, source: 'Consultant payroll',
          label: `${who} — ${e.cutoffPeriod} — ${e.branch}`,
          debit: amt, credit: 0,
        })
      }
      if (perPerson.length) collected.splice(0, collected.length, ...collected.filter(keep), ...perPerson)
    }
  }

  // Sort drill-down lines chronologically for display; cap the payload for
  // very wide selections (a whole-year revenue account can have thousands of
  // entries) — the statement totals are unaffected, only the list is cut.
  collected.sort((a, b) => a.month - b.month)
  const COLLECT_CAP = 2000
  const collectedTruncated = collected.length > COLLECT_CAP
  // Prior-year history is shown but not totalled: the totals describe THIS
  // period, and the earlier years are already embodied in the opening balance.
  const periodLines = collected.filter(l => !l.source.startsWith('history:'))
  const collectedTotals = {
    debit: round2(periodLines.reduce((s, l) => s + l.debit, 0)),
    credit: round2(periodLines.reduce((s, l) => s + l.credit, 0)),
  }

  return {
    year, branch, engine: 'ledger-v2',
    validation,
    ...(collect ? { collected: collected.slice(0, COLLECT_CAP), collectedTruncated, collectedTotals } : {}),
    incomeStatement: {
      sections: isSections,
      productSubtypes: Array.from(productSubtypes.entries())
        .map(([label, monthly]) => ({ label, monthly: monthly.map(round2), total: round2(monthly.reduce((s, v) => s + v, 0)) }))
        .filter(s => Math.abs(s.total) >= 0.005)
        .sort((a, b) => b.total - a.total),
      netSales, totalCOGS, grossProfit, totalOpex, ebitda,
      depreciation, interest, nonOperating, ebt, taxProvision, netIncome,
    },
    balanceSheet: {
      sections: bsSections,
      totalAssets, totalLiabilities, totalEquity,
      incomeTaxPayable, deferredTaxAsset, netIncome,
    },
    cashFlow: {
      netIncome, depreciation, taxProvision,
      workingCapital, netOperating,
      investing, netInvesting,
      financing, netFinancing,
      netChange, beginningCash, endingCash,
      cashAccounts: cashRows.filter(r => Math.abs(r.closing) >= 0.005).map(r => ({ key: `${r.number} ${r.title}`, amount: r.closing })),
      monthly: cfMonthly,
    },
  }
}
