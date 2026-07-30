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
}

/** One underlying line, returned when a drill-down is requested. */
export interface V2CollectedLine {
  month: number          // 1..12, or 0 for opening balances
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

/* ── Engine ────────────────────────────────────────────────────── */

export async function computeLedgerStatements(
  year: number,
  branch: string,
  collect?: { account: string; month?: number },
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
    select: { id: true, accountNumber: true, accountTitle: true, accountType: true, subType: true, normalBalance: true, isBankAccount: true },
  })
  const byNumber = new Map<string, AcctInfo>()
  const byId = new Map<string, AcctInfo>()
  const bankFlagged = new Set<string>()
  for (const a of dbAccounts) {
    const info: AcctInfo = {
      id: a.id, number: a.accountNumber, title: a.accountTitle,
      type: a.accountType as AcctInfo['type'], subType: a.subType || '',
      normalBalance: a.normalBalance as AcctInfo['normalBalance'], virtual: false,
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
  const defaultCash = (): AcctInfo =>
    (bankFlagged.size ? byNumber.get(Array.from(bankFlagged)[0]) : undefined)
    || findByTitle(/cash on hand|petty cash|^cash$/i, 'ASSET')
    || findByTitle(/cash|bank/i, 'ASSET')
    || virt('1000', 'Cash (derived)', 'ASSET', 'CURRENT_ASSETS', 'DEBIT')
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
    // "8120 Marketing and Advertising Expense" → account by number, else virtual
    const m = key.match(/^(\d{4,6})\s+(.+)$/)
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
    if (collect && collect.account === acct.number && (!collect.month || collect.month === month) && (debit || credit)) {
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
      if (acct.normalBalance === 'DEBIT') openDr += amt
      else openCr += amt
      if (collect && collect.account === acct.number && !collect.month) {
        collected.push({
          month: 0, source: 'opening', label: `Opening balance (${year})`,
          debit: acct.normalBalance === 'DEBIT' ? amt : 0,
          credit: acct.normalBalance === 'CREDIT' ? amt : 0,
        })
      }
    }
    const openDiff = round2(openDr - openCr)
    if (Math.abs(openDiff) >= 0.01) {
      // Same device as the audited books' own "Opening Balance Equity" line.
      const plug = virt(OPENING_PLUG, 'Opening Balance Equity (plug)', 'EQUITY', 'OWNERS_EQUITY', 'CREDIT')
      opening.set(plug.number, (opening.get(plug.number) || 0) + openDiff)
      validation.openingPlug = openDiff
    }
  } else {
    validation.notes.push('Opening balances are not branch-split, so this branch view shows period movements only (openings excluded). Use All Branches for the full position.')
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
    postBalanced(`journal:${je.referenceType || 'manual'}`, monthOf(je.entryDate), je.description || `Journal entry ${je.id.slice(-6)}`, je.lines.map(l => ({
      acct: l.account ? (byNumber.get(l.account.accountNumber) || virt(l.account.accountNumber, 'Unknown account', 'EXPENSE', 'UNCLASSIFIED', 'DEBIT')) : virt('9998', 'Unmapped journal line', 'EXPENSE', 'UNCLASSIFIED', 'DEBIT'),
      debit: Number(l.debit), credit: Number(l.credit),
    })))
  }
  validation.fromLedger = Array.from(glRefTypes).sort()
  const hasRef = (type: string, id: string) => glRefIds.get(type)?.has(id) || false

  /* ── 3. Orders (synthesized when no POS_ORDER journal entry exists) ── */
  const orders = await prisma.order.findMany({
    where: {
      status: 'COMPLETED',
      transactionDate: { gte: start, lt: end },
      ...(branch !== 'ALL' ? { branch: orderBranch } : {}),
    },
    select: {
      id: true, orderNumber: true, patientName: true, transactionDate: true,
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
      const cashA = p.paymentMode?.account ? (byNumber.get(p.paymentMode.account.accountNumber) || defaultCash()) : defaultCash()
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
    select: { id: true, amount: true, discount: true, paymentDate: true, cashAccount: { select: { accountNumber: true } }, discountAccount: { select: { accountNumber: true } }, wallet: { select: { patientName: true } } },
  })
  let synthesizedAr = 0
  for (const p of arPayments) {
    if (hasRef('AR_PAYMENT', p.id)) continue
    synthesizedAr++
    const cashA = p.cashAccount ? (byNumber.get(p.cashAccount.accountNumber) || defaultCash()) : defaultCash()
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
  const pcCash = findByTitle(/petty cash/i, 'ASSET') || defaultCash()
  const pcEntries = await prisma.pettyCashEntry.findMany({
    where: {
      date: { gte: start, lt: end },
      ...(branch !== 'ALL' ? { branch: orderBranch } : { branch: { not: 'CEO' } }),
    },
    select: { accountTitle: true, date: true, vatable: true, grossAmount: true, validity: true, pcfStatus: true, recordType: true, skipReports: true, pcvNumber: true, description: true },
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
      { acct: pcCash, credit: gross },
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
        { acct: pcCash, credit: gross },
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
        { acct: pcCash, credit: ag },
      ])
    }
  }

  /* ── 6. Depreciation schedule (synthesized unless DEPRECIATION JEs exist) ── */
  const assets = await prisma.asset.findMany({
    where: { ...(branch !== 'ALL' ? { branch: orderBranch as never } : {}) },
    select: { id: true, name: true, dateBought: true, depreciationEndDate: true, monthlyDepreciation: true, classification: true, totalAmount: true, fromPettyCash: true, sourceAccountId: true },
  })
  const depAcct = byNumber.get('8070') || virt('8070', 'Depreciation Expense', 'EXPENSE', 'NON_OPERATING_EXPENSES', 'DEBIT')
  const accumDep = byNumber.get('2010') || findByTitle(/accumulated dep/i) || virt('2010', 'Accumulated Depreciation', 'ASSET', 'PPE', 'CREDIT')
  const hasDepJEs = (glRefIds.get('DEPRECIATION')?.size || 0) > 0
  if (!hasDepJEs) {
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
    const creditA = a.fromPettyCash ? pcCash
      : a.sourceAccountId ? (byId.get(a.sourceAccountId) || defaultCash())
      : defaultCash()
    postBalanced('asset-purchases', monthOf(a.dateBought), `Asset purchase — ${a.name}`, [
      { acct: ppe, debit: amt },
      { acct: creditA, credit: amt },
    ])
  }
  if (synthesizedAssets) validation.synthesized.push(`asset-purchases (${synthesizedAssets})`)

  /* ── 8. Income tax provision (Phase-1 chain, balanced against ITP / DTA) ── */
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
    return 'nonop'
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
  const cashRows = rows.filter(r => isCashAccount(isRow(r)))
  const cashNumbers = new Set(cashRows.map(r => r.number))
  const beginningCash = round2(cashRows.reduce((s, r) => s + r.opening, 0))
  const endingCash = round2(cashRows.reduce((s, r) => s + r.closing, 0))
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
  for (const r of investingRows) {
    const effect = delta(r) // cash effect (purchase = negative)
    if (Math.abs(effect) < 0.005) continue
    investing.push({ label: `${r.number} ${r.title}`, amount: round2(effect), monthly: effMonthly(r) })
    invTotal += effect
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

  const netOperating = round2(netIncome + depreciation + taxProvision + wcTotal)
  const netInvesting = round2(invTotal)
  const netFinancing = round2(finTotal)
  const netChange = round2(netOperating + netInvesting + netFinancing)
  const actualChange = round2(endingCash - beginningCash)
  validation.cfTies = Math.abs(netChange - actualChange) < 0.02

  // Per-month chain for the monthly/quarterly cash-flow view — same buckets,
  // month by month. Cash delta per month comes straight from the cash accounts.
  const revM = sumMonthlyOf(revRows), discM = sumMonthlyOf(discRows), cogsM = sumMonthlyOf(cogsRows)
  const opexM = sumMonthlyOf(opexRows), depM = sumMonthlyOf(depRows), intM = sumMonthlyOf(intRows), nonopM = sumMonthlyOf(nonopRows)
  const ebtM = Array.from({ length: 12 }, (_, i) =>
    round2(revM[i] - discM[i] - cogsM[i] - opexM[i] - depM[i] - intM[i] - nonopM[i]))
  const cfMonthly = {
    netIncome: ebtM.map(e => round2(e * (1 - INCOME_TAX_RATE))),
    depreciation: depM,
    taxProvision: ebtM.map(e => round2(e * INCOME_TAX_RATE)),
    cashDelta: sumMonthlyOf(cashRows),
  }

  const isSections = [
    { key: 'REVENUE', label: 'Gross Revenue', rows: revRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: grossRevenue },
    { key: 'DISCOUNTS', label: 'Discounts and Refunds', rows: discRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: totalDiscounts },
    { key: 'COGS', label: 'Cost of Sales', rows: cogsRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: totalCOGS },
    { key: 'OPEX', label: 'Operating Expenses', rows: opexRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: totalOpex },
    { key: 'DEPRECIATION', label: 'Depreciation', rows: depRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: depreciation },
    { key: 'INTEREST', label: 'Interest', rows: intRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: interest },
    { key: 'NON_OPERATING', label: 'Non-Operating Expenses', rows: nonopRows.filter(r => Math.abs(r.closing - r.opening) >= 0.005), total: nonOperating },
  ].filter(s => s.rows.length > 0)

  // Sort drill-down lines chronologically for display; cap the payload for
  // very wide selections (a whole-year revenue account can have thousands of
  // entries) — the statement totals are unaffected, only the list is cut.
  collected.sort((a, b) => a.month - b.month)
  const COLLECT_CAP = 2000
  const collectedTruncated = collected.length > COLLECT_CAP
  const collectedTotals = {
    debit: round2(collected.reduce((s, l) => s + l.debit, 0)),
    credit: round2(collected.reduce((s, l) => s + l.credit, 0)),
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
