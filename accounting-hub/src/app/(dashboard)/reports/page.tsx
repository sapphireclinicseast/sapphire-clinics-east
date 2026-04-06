'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  FileText, Download, Printer, Loader2, ChevronDown,
  Calendar, Building2, LayoutList, BarChart3, X,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

interface MonthData {
  serviceRevenue: number
  productRevenue: number
  unearnedRevenue: number
  cogs: number
  revenueByDept: Record<string, number>
  revenueByAccount: Record<string, number>
  revenueByBranch: Record<string, number>
  cogsByDept: Record<string, number>
  cogsByAccount: Record<string, number>
  cashReceived: number
  paymentsByMethod: Record<string, number>
  deductionsByMethod: Record<string, number>
  deductionsByType: Record<string, number>  // "Merchant Discount Rate" → amount, "Creditable Withholding Tax" → amount
  deductionsByAccount: Record<string, number>  // COA account key → amount (for balance sheet assets like CWT)
}

interface AccountEntry {
  accountNumber: string
  accountTitle: string
  subSubType: string | null
  normalBalance: string
  currency: string
}

interface ReportData {
  year: number
  branch: string
  accounts: Record<string, Record<string, AccountEntry[]>>
  monthly: Record<number, MonthData>
  inventory: { total: number; byDepartment: Record<string, number> }
  wallets: { total: number; byType: Record<string, number> }
  accountsReceivable?: {
    total: number
    byType: Record<string, number>
    paymentsReceived: number
    discounts: number
    byCashAccount: { accountNumber: string; accountTitle: string; amount: number }[]
  }
  inventorySourceAccounts?: { accountNumber: string; accountTitle: string; amount: number }[]
  unclassifiedAP?: number
}

type ReportTab = 'balance-sheet' | 'income-statement' | 'cash-flow'
type ViewMode = 'annual' | 'monthly'
type OnDrillDown = (label: string, category: string, month: number, accountKey?: string) => void

interface DrillDownState {
  label: string
  category: string
  month: number
  accountKey?: string  // e.g. "7020 Occupational Therapy Services Revenue"
}

interface DrillDownItem {
  date: string
  type: string
  branch: string
  amount: number
}

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const BRANCHES = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SBEA', label: 'Sandbox East' },
  { value: 'SBGH', label: 'Sandbox Greenhills' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
]

const TABS: { key: ReportTab; label: string; icon: typeof FileText }[] = [
  { key: 'balance-sheet', label: 'Balance Sheet', icon: FileText },
  { key: 'income-statement', label: 'Income Statement', icon: BarChart3 },
  { key: 'cash-flow', label: 'Cash Flow Statement', icon: LayoutList },
]

const DEPT_LABELS: Record<string, string> = {
  PT: 'Physical Therapy',
  OT: 'Occupational Therapy',
  ST: 'Speech Therapy',
  SLP: 'Speech-Language Pathology',
  SPED: 'Special Education',
  PSY: 'Psychology & Assessment',
  PSYCHOLOGY: 'Psychology & Assessment',
  MD: 'Medical Doctor',
  CLI: 'Clinic & Institutional',
  DIG: 'Digital & Tech',
  EDU: 'Training & Education',
  MER: 'Merchandise',
  ORTHOSIS_PROSTHESIS: 'Orthosis & Prosthesis',
  OTHER: 'Other',
}

const BRANCH_LABELS: Record<string, string> = {
  SBEA: 'Sandbox East',
  SBGH: 'Sandbox Greenhills',
  VERDANA_STORE: 'Verdana Store',
  SANDBOX_EAST: 'Sandbox East',
  SANDBOX_GREENHILLS: 'Sandbox Greenhills',
}

const SUB_TYPE_LABELS: Record<string, string> = {
  CURRENT_ASSETS: 'Current Assets',
  PPE: 'Property, Plant & Equipment',
  INTANGIBLE_ASSETS: 'Intangible Assets',
  OTHER_NON_CURRENT_ASSETS: 'Other Non-Current Assets',
  INVENTORY: 'Inventory',
  INV_PT: 'Inventory — Physical Therapy',
  INV_OT: 'Inventory — Occupational Therapy',
  INV_ST: 'Inventory — Speech Therapy',
  INV_SPED: 'Inventory — Special Education',
  INV_PSY: 'Inventory — Psychology & Assessment',
  INV_CLI: 'Inventory — Clinic & Institutional',
  INV_DIG: 'Inventory — Digital & Tech',
  INV_EDU: 'Inventory — Training & Education',
  INV_MER: 'Inventory — Merchandise',
  CURRENT_LIABILITIES: 'Current Liabilities',
  NON_CURRENT_LIABILITIES: 'Non-Current Liabilities',
  OWNERS_EQUITY: "Owner's Equity",
  RETAINED_EARNINGS: 'Retained Earnings',
  OPERATING_REVENUE: 'Operating Revenue',
  NON_OPERATING_REVENUE: 'Non-Operating Revenue',
  DIRECT_EXPENSES: 'Direct Operating Expenses',
  INDIRECT_EXPENSES: 'Indirect Operating Expenses',
  SALES: 'Sales by Department',
  REV_PT: 'Sales — Physical Therapy',
  REV_OT: 'Sales — Occupational Therapy',
  REV_ST: 'Sales — Speech Therapy',
  REV_SPED: 'Sales — Special Education',
  REV_PSY: 'Sales — Psychology & Assessment',
  REV_CLI: 'Sales — Clinic & Institutional',
  REV_DIG: 'Sales — Digital & Tech',
  REV_EDU: 'Sales — Training & Education',
  REV_MER: 'Sales — Merchandise',
  OPERATING_EXPENSES: 'Operating Expenses',
  NON_OPERATING_EXPENSES: 'Non-Operating Expenses',
  COGS: 'Cost of Goods Sold',
  COGS_PT: 'COGS — Physical Therapy',
  COGS_OT: 'COGS — Occupational Therapy',
  COGS_ST: 'COGS — Speech Therapy',
  COGS_SPED: 'COGS — Special Education',
  COGS_PSY: 'COGS — Psychology & Assessment',
  COGS_CLI: 'COGS — Clinic & Institutional',
  COGS_DIG: 'COGS — Digital & Tech',
  COGS_EDU: 'COGS — Training & Education',
  COGS_MER: 'COGS — Merchandise',
  UNCATEGORIZED: 'Uncategorized',
}

const WALLET_LABELS: Record<string, string> = {
  PACKAGE: 'Package Prepayments',
  VIP: 'VIP Card Balances',
  PREPAID_CARD: 'Prepaid Card Balances',
  DOWNPAYMENT: 'Downpayments',
  ADVANCE: 'Advance Payments',
  HMO: 'HMO Receivables',
  GL: 'Guarantee Letter Receivables',
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash',
  GCASH: 'GCash',
  PAYMAYA: 'PayMaya',
  DEBIT: 'Debit Card',
  CREDIT_CARD: 'Credit Card',
  VIP_CARD: 'VIP Card',
  PREPAID_CARD: 'Prepaid Card',
  REWARD_POINTS: 'Reward Points',
  SHOPEE: 'Shopee',
  LAZADA: 'Lazada',
  TIKTOK: 'TikTok',
  DOWNPAYMENT: 'Downpayment',
  PACKAGE: 'Package',
  HMO: 'HMO',
  GL: 'Guarantee Letter',
}

/* ═══════════════════════════════════════════════════════════════
   HELPER: sum monthly values
   ═══════════════════════════════════════════════════════════════ */

function sumMonths(data: Record<number, MonthData>, getter: (m: MonthData) => number): number {
  let total = 0
  for (let i = 1; i <= 12; i++) total += getter(data[i])
  return total
}

function getMonthlyArray(data: Record<number, MonthData>, getter: (m: MonthData) => number): number[] {
  return Array.from({ length: 12 }, (_, i) => getter(data[i + 1]))
}

function fmt(n: number): string {
  if (n === 0) return '—'
  return formatCurrency(n)
}

function fmtSigned(n: number): string {
  if (n === 0) return '—'
  const prefix = n < 0 ? '(' : ''
  const suffix = n < 0 ? ')' : ''
  return prefix + formatCurrency(Math.abs(n)) + suffix
}

/* ═══════════════════════════════════════════════════════════════
   SHARED ROW COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

const rowBase = 'grid items-center py-2 px-4 text-sm'

function SectionHeader({ label, colSpan }: { label: string; colSpan?: number }) {
  return (
    <div
      className="py-3 px-4 font-bold text-sm uppercase tracking-wide"
      style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)', borderBottom: '2px solid var(--teal)' }}
    >
      {label}
    </div>
  )
}

function SubSectionHeader({ label }: { label: string }) {
  return (
    <div
      className="py-2 px-4 pl-6 font-semibold text-sm"
      style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)', background: 'var(--pale-teal)' }}
    >
      {label}
    </div>
  )
}

/* ── Annual row (label + amount) ──────────────────────────────── */

function AnnualRow({
  label, amount, indent = 0, bold = false, isTotal = false, isGrandTotal = false, negative = false, onDrillDown,
}: {
  label: string; amount: number; indent?: number; bold?: boolean
  isTotal?: boolean; isGrandTotal?: boolean; negative?: boolean; onDrillDown?: () => void
}) {
  return (
    <div
      className={`${rowBase} grid-cols-[1fr_180px]`}
      style={{
        paddingLeft: `${1 + indent * 1.25}rem`,
        fontWeight: bold || isTotal || isGrandTotal ? 600 : 400,
        borderTop: isTotal ? '1px solid var(--light-gray)' : undefined,
        borderBottom: isGrandTotal ? '3px double var(--charcoal)' : isTotal ? '1px solid var(--light-gray)' : undefined,
        background: isGrandTotal ? 'var(--pale-teal)' : undefined,
        color: negative && amount < 0 ? '#dc2626' : 'var(--charcoal)',
        fontFamily: isGrandTotal ? 'var(--font-display)' : undefined,
      }}
    >
      <span>{label}</span>
      <span
        className={`text-right font-mono text-sm${onDrillDown ? ' cursor-pointer hover:underline' : ''}`}
        style={{ color: onDrillDown && amount !== 0 ? 'var(--teal)' : undefined }}
        onClick={onDrillDown}
      >
        {negative ? fmtSigned(amount) : fmt(amount)}
      </span>
    </div>
  )
}

/* ── Monthly row (label + 12 months + total) ──────────────────── */

function MonthlyRow({
  label, values, total, indent = 0, bold = false, isTotal = false, isGrandTotal = false, negative = false, onClickCell,
}: {
  label: string; values: number[]; total: number; indent?: number; bold?: boolean
  isTotal?: boolean; isGrandTotal?: boolean; negative?: boolean
  onClickCell?: (month: number | null) => void
}) {
  return (
    <div
      className={`${rowBase} min-w-[1400px]`}
      style={{
        display: 'grid',
        gridTemplateColumns: '280px repeat(12, 1fr) 120px',
        paddingLeft: `${0.5 + indent * 1}rem`,
        fontWeight: bold || isTotal || isGrandTotal ? 600 : 400,
        borderTop: isTotal ? '1px solid var(--light-gray)' : undefined,
        borderBottom: isGrandTotal ? '3px double var(--charcoal)' : isTotal ? '1px solid var(--light-gray)' : undefined,
        background: isGrandTotal ? 'var(--pale-teal)' : undefined,
        color: negative && total < 0 ? '#dc2626' : 'var(--charcoal)',
        fontFamily: isGrandTotal ? 'var(--font-display)' : undefined,
        fontSize: '0.8rem',
      }}
    >
      <span className="truncate pr-2">{label}</span>
      {values.map((v, i) => (
        <span
          key={i}
          className={`text-right font-mono pr-1${onClickCell && v !== 0 ? ' cursor-pointer hover:underline' : ''}`}
          style={{ color: onClickCell && v !== 0 ? 'var(--teal)' : undefined }}
          onClick={() => onClickCell?.(i + 1)}
        >
          {negative ? fmtSigned(v) : fmt(v)}
        </span>
      ))}
      <span
        className={`text-right font-mono font-semibold${onClickCell && total !== 0 ? ' cursor-pointer hover:underline' : ''}`}
        style={{ color: onClickCell && total !== 0 ? 'var(--teal)' : undefined }}
        onClick={() => onClickCell?.(null)}
      >
        {negative ? fmtSigned(total) : fmt(total)}
      </span>
    </div>
  )
}

function MonthlyHeader() {
  return (
    <div
      className="min-w-[1400px] py-2 px-4 text-xs font-semibold uppercase tracking-wider sticky top-0 z-10"
      style={{
        display: 'grid',
        gridTemplateColumns: '280px repeat(12, 1fr) 120px',
        background: 'var(--charcoal)',
        color: 'white',
        fontFamily: 'var(--font-display)',
      }}
    >
      <span>Line Item</span>
      {MONTHS.map((m) => (
        <span key={m} className="text-right pr-1">{m}</span>
      ))}
      <span className="text-right">Total</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   DRILL-DOWN PANEL
   ═══════════════════════════════════════════════════════════════ */

function DrillDownPanel({
  target, year, branch, onClose,
}: {
  target: DrillDownState
  year: number
  branch: string
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<DrillDownItem[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({
      year: String(year),
      branch,
      month: String(target.month),
      category: target.category,
    })
    if (target.accountKey) params.set('accountKey', target.accountKey)
    fetch(`/api/reports/drill-down?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items || [])
        setTotal(data.total || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [target, year, branch])

  const monthLabel = target.month > 0 ? FULL_MONTHS[target.month - 1] : String(year)

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end print:hidden"
      style={{ background: 'rgba(0,0,0,0.3)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl flex flex-col" style={{ background: 'white', boxShadow: '-4px 0 32px rgba(0,0,0,0.12)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div>
            <h3 className="font-semibold text-base" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
              {target.label}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              {monthLabel} &bull; {branch === 'ALL' ? 'All Branches' : branch}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X size={18} style={{ color: 'var(--mid-gray)' }} />
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-center py-12" style={{ color: 'var(--mid-gray)' }}>No transactions found</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--pale-teal)', borderBottom: '1px solid var(--light-gray)' }}>
                  <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--deep-teal)' }}>Date</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--deep-teal)' }}>Type of Transaction</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--deep-teal)' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--light-gray)' }}>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>{item.date}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{item.type}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {!loading && items.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '2px solid var(--teal)', background: 'var(--pale-teal)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
              Total ({items.length} transaction{items.length !== 1 ? 's' : ''})
            </span>
            <span className="font-mono font-bold text-base" style={{ color: 'var(--deep-teal)' }}>
              {formatCurrency(total)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   BALANCE SHEET
   ═══════════════════════════════════════════════════════════════ */

function BalanceSheet({ data, viewMode, onDrillDown }: { data: ReportData; viewMode: ViewMode; onDrillDown: OnDrillDown }) {
  const { accounts, inventory, wallets, monthly, inventorySourceAccounts = [], unclassifiedAP = 0, accountsReceivable } = data

  // Calculate totals from available data
  const totalCashReceived = sumMonths(monthly, (m) => m.cashReceived)
  const invByDept = inventory.byDepartment
  const invTotal = inventory.total

  // Aggregate deduction amounts by COA account across all months (for CWT etc.)
  const deductionAccountTotals: Record<string, number> = {}
  for (let m = 1; m <= 12; m++) {
    for (const [key, val] of Object.entries(monthly[m].deductionsByAccount || {})) {
      deductionAccountTotals[key] = (deductionAccountTotals[key] || 0) + val
    }
  }

  // Asset accounts from CoA
  const currentAssetAccounts = accounts.ASSET?.CURRENT_ASSETS || []
  const ppeAccounts = accounts.ASSET?.PPE || []
  const intangibleAccounts = accounts.ASSET?.INTANGIBLE_ASSETS || []
  const otherNCAAccounts = accounts.ASSET?.OTHER_NON_CURRENT_ASSETS || []

  // Inventory accounts (both old INV_* format and new INVENTORY format)
  const inventoryAccounts: { label: string; dept: string }[] = []
  const invSubTypes = Object.keys(accounts.ASSET || {}).filter((k) => k.startsWith('INV_'))
  for (const st of invSubTypes) {
    const dept = st.replace('INV_', '')
    inventoryAccounts.push({ label: SUB_TYPE_LABELS[st] || st, dept })
  }
  if (accounts.ASSET?.INVENTORY) {
    for (const acct of accounts.ASSET.INVENTORY) {
      if (acct.subSubType && !inventoryAccounts.find((a) => a.dept === acct.subSubType)) {
        inventoryAccounts.push({
          label: `Inventory — ${DEPT_LABELS[acct.subSubType!] || acct.subSubType}`,
          dept: acct.subSubType!,
        })
      }
    }
  }
  if (inventoryAccounts.length === 0) {
    for (const dept of Object.keys(invByDept)) {
      inventoryAccounts.push({
        label: `Inventory — ${DEPT_LABELS[dept] || dept}`,
        dept,
      })
    }
  }

  // Liability accounts
  const currentLiabAccounts = accounts.LIABILITY?.CURRENT_LIABILITIES || []
  const nonCurrentLiabAccounts = accounts.LIABILITY?.NON_CURRENT_LIABILITIES || []

  // Equity accounts
  const ownersEquityAccounts = accounts.EQUITY?.OWNERS_EQUITY || []
  const retainedEarningsAccounts = accounts.EQUITY?.RETAINED_EARNINGS || []

  // Sum deduction-sourced current asset amounts (CWT, etc.)
  const deductionAssetTotal = currentAssetAccounts.reduce((s, a) => {
    const key = `${a.accountNumber} ${a.accountTitle}`
    return s + (deductionAccountTotals[key] || 0)
  }, 0)

  // Accounts Receivable from HMO/GL wallets
  const arTotal = accountsReceivable?.total || 0
  // AR payments received add to cash equivalents
  const arCashReceived = accountsReceivable?.paymentsReceived || 0

  // Computed totals
  const totalCurrentAssets = totalCashReceived + arCashReceived + invTotal + deductionAssetTotal + arTotal
  const totalNonCurrentAssets = 0
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets

  // Source account balances (inventory payables) + unclassified AP + wallet liabilities
  const sourceAccountTotal = inventorySourceAccounts.reduce((s, a) => s + a.amount, 0) + unclassifiedAP
  const totalCurrentLiabilities = wallets.total + sourceAccountTotal
  const totalNonCurrentLiabilities = 0
  const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities

  // Net income for retained earnings
  const totalRevenue = sumMonths(monthly, (m) => m.serviceRevenue + m.productRevenue)
  const totalCOGS = sumMonths(monthly, (m) => m.cogs)
  const netIncome = totalRevenue - totalCOGS
  const totalEquity = netIncome
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity

  // Balance sheet equation check
  const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01

  if (viewMode === 'monthly') {
    // Monthly balance sheet doesn't apply the same way — show annual with note
    return (
      <div>
        <p className="text-sm italic px-4 py-3" style={{ color: 'var(--mid-gray)' }}>
          Note: The Balance Sheet is a point-in-time statement. Monthly view shows the same annual snapshot. Use the Income Statement for monthly breakdowns.
        </p>
        {renderAnnual()}
      </div>
    )
  }

  return renderAnnual()

  function renderAnnual() {
    return (
      <div>
        {/* ASSETS */}
        <SectionHeader label="Assets" />
        <SubSectionHeader label="Current Assets" />
        <AnnualRow label="Cash and Cash Equivalents" amount={totalCashReceived + arCashReceived} indent={2} onDrillDown={() => onDrillDown('Cash and Cash Equivalents', 'CASH_BALANCE', 0)} />
        {arTotal > 0 && (
          <AnnualRow label="1010 — Accounts Receivable" amount={arTotal} indent={2} />
        )}
        {accountsReceivable && Object.entries(accountsReceivable.byType).map(([type, bal]) => (
          bal > 0 ? <AnnualRow key={type} label={`    ${type === 'HMO' ? 'HMO Receivables' : type === 'GL' ? 'Guarantee Letter Receivables' : type}`} amount={bal} indent={3} /> : null
        ))}
        {currentAssetAccounts.filter(a => a.accountNumber !== '1010').map((a) => {
          const acctKey = `${a.accountNumber} ${a.accountTitle}`
          const computedAmt = deductionAccountTotals[acctKey] || 0
          return (
            <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={computedAmt} indent={2}
              onDrillDown={computedAmt > 0 ? () => onDrillDown(a.accountTitle, 'DEDUCTION', 0, acctKey.split(' ').slice(1).join(' ')) : undefined} />
          )
        })}

        {/* Inventory breakdown */}
        {inventoryAccounts.length > 0 && (
          <>
            <div className="py-1 px-4 pl-10 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>
              Inventory
            </div>
            {inventoryAccounts.map((inv) => (
              <AnnualRow key={inv.dept} label={inv.label} amount={invByDept[inv.dept] || 0} indent={3} />
            ))}
          </>
        )}
        <AnnualRow label="Total Inventory" amount={invTotal} indent={2} bold />
        <AnnualRow label="Total Current Assets" amount={totalCurrentAssets} indent={1} isTotal bold />

        <SubSectionHeader label="Non-Current Assets" />
        {ppeAccounts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={0} indent={2} />
        ))}
        {intangibleAccounts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={0} indent={2} />
        ))}
        {otherNCAAccounts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={0} indent={2} />
        ))}
        {ppeAccounts.length === 0 && intangibleAccounts.length === 0 && otherNCAAccounts.length === 0 && (
          <AnnualRow label="(No non-current asset accounts set up)" amount={0} indent={2} />
        )}
        <AnnualRow label="Total Non-Current Assets" amount={totalNonCurrentAssets} indent={1} isTotal bold />

        <AnnualRow label="TOTAL ASSETS" amount={totalAssets} isGrandTotal />

        <div className="h-4" />

        {/* LIABILITIES */}
        <SectionHeader label="Liabilities" />
        <SubSectionHeader label="Current Liabilities" />
        {currentLiabAccounts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={0} indent={2} />
        ))}
        {/* Unearned revenue from wallets */}
        {Object.entries(wallets.byType).map(([type, bal]) => (
          <AnnualRow key={type} label={`Unearned Revenue — ${WALLET_LABELS[type] || type}`} amount={bal} indent={2} />
        ))}
        {/* Inventory source accounts (payables) */}
        {inventorySourceAccounts.length > 0 && inventorySourceAccounts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={a.amount} indent={2} />
        ))}
        {unclassifiedAP > 0 && (
          <AnnualRow label="Unclassified Accounts Payable" amount={unclassifiedAP} indent={2} />
        )}
        {wallets.total === 0 && currentLiabAccounts.length === 0 && sourceAccountTotal === 0 && (
          <AnnualRow label="(No current liabilities recorded)" amount={0} indent={2} />
        )}
        <AnnualRow label="Total Current Liabilities" amount={totalCurrentLiabilities} indent={1} isTotal bold />

        <SubSectionHeader label="Non-Current Liabilities" />
        {nonCurrentLiabAccounts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={0} indent={2} />
        ))}
        {nonCurrentLiabAccounts.length === 0 && (
          <AnnualRow label="(No non-current liabilities recorded)" amount={0} indent={2} />
        )}
        <AnnualRow label="Total Non-Current Liabilities" amount={totalNonCurrentLiabilities} indent={1} isTotal bold />

        <AnnualRow label="TOTAL LIABILITIES" amount={totalLiabilities} isGrandTotal />

        <div className="h-4" />

        {/* EQUITY */}
        <SectionHeader label="Equity" />
        {ownersEquityAccounts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={0} indent={1} />
        ))}
        {retainedEarningsAccounts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={0} indent={1} />
        ))}
        <AnnualRow label="Net Income (Current Year)" amount={netIncome} indent={1} />
        <AnnualRow label="TOTAL EQUITY" amount={totalEquity} isGrandTotal />

        <div className="h-4" />

        <AnnualRow
          label="TOTAL LIABILITIES & EQUITY"
          amount={totalLiabilitiesAndEquity}
          isGrandTotal
        />

        {/* Balance Sheet Equation Check */}
        <div className="mt-4 px-4">
          <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between ${isBalanced ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            <span>{isBalanced ? 'Balanced' : 'Not Balanced'}: Assets = Liabilities + Equity</span>
            <span className="font-mono text-xs">
              {formatCurrency(totalAssets)} {isBalanced ? '=' : '≠'} {formatCurrency(totalLiabilitiesAndEquity)}
              {!isBalanced && ` (diff: ${formatCurrency(Math.abs(totalAssets - totalLiabilitiesAndEquity))})`}
            </span>
          </div>
        </div>
      </div>
    )
  }
}

/* ═══════════════════════════════════════════════════════════════
   INCOME STATEMENT
   ═══════════════════════════════════════════════════════════════ */

function IncomeStatement({ data, viewMode, onDrillDown }: { data: ReportData; viewMode: ViewMode; onDrillDown: OnDrillDown }) {
  const { monthly, accounts } = data

  // COA-driven: Revenue accounts — gather from ALL revenue subTypes, not just OPERATING/NON_OPERATING
  const allRevenueSubTypes = accounts.REVENUE ? Object.values(accounts.REVENUE).flat() : []
  const grossRevenueAccts = allRevenueSubTypes.filter(a => a.normalBalance !== 'DEBIT')
  const discountAccts = allRevenueSubTypes.filter(a => a.normalBalance === 'DEBIT')

  // COA-driven: Expense accounts by subType
  const directExpenseAccts = accounts.EXPENSE?.DIRECT_EXPENSES || []
  const cogsAccts = accounts.EXPENSE?.COGS || []
  const costOfSalesAccts = [...directExpenseAccts, ...cogsAccts]
  const indirectExpenseAccts = accounts.EXPENSE?.INDIRECT_EXPENSES || []
  const nonOpExpenseAccts = accounts.EXPENSE?.NON_OPERATING_EXPENSES || []

  // Collect revenue by account keys from monthly data
  const allRevenueKeys = new Set<string>()
  for (let m = 1; m <= 12; m++) {
    for (const a of Object.keys(monthly[m].revenueByAccount || {})) allRevenueKeys.add(a)
  }

  // Find revenue keys that have data but aren't in any COA account list (gross or discount)
  const knownAcctKeys = new Set([
    ...grossRevenueAccts.map(a => `${a.accountNumber} ${a.accountTitle}`),
    ...discountAccts.map(a => `${a.accountNumber} ${a.accountTitle}`),
  ])
  const unmatchedRevenueKeys = Array.from(allRevenueKeys)
    .filter(k => !knownAcctKeys.has(k))
    .sort()

  // Aggregate deduction amounts by COA account (to identify deduction-sourced accounts like MDR)
  const deductionAccountTotals: Record<string, number> = {}
  for (let m = 1; m <= 12; m++) {
    for (const [key, val] of Object.entries(monthly[m].deductionsByAccount || {})) {
      deductionAccountTotals[key] = (deductionAccountTotals[key] || 0) + val
    }
  }

  // Helper: get amount for a COA account from revenueByAccount
  const acctAmount = (acctNum: string, acctTitle: string) => {
    const key = `${acctNum} ${acctTitle}`
    return sumMonths(monthly, (m) => (m.revenueByAccount || {})[key] || 0)
  }

  // Gross Revenue = sum of all CREDIT revenue accounts + unmatched revenue keys
  const totalGrossRevenue = grossRevenueAccts.reduce((s, a) => s + acctAmount(a.accountNumber, a.accountTitle), 0)
  const unmatchedRevenueTotal = unmatchedRevenueKeys.reduce((s, key) => s + sumMonths(monthly, (m) => (m.revenueByAccount || {})[key] || 0), 0)
  // If no COA-tagged transactions yet, fall back to computed totals
  const fallbackGrossRevenue = sumMonths(monthly, (m) => m.serviceRevenue + m.productRevenue)
  const effectiveGrossRevenue = (totalGrossRevenue + unmatchedRevenueTotal) > 0 ? totalGrossRevenue + unmatchedRevenueTotal : fallbackGrossRevenue

  // Discounts = sum of DEBIT revenue accounts (shown as negative)
  const totalDiscounts = discountAccts.reduce((s, a) => s + acctAmount(a.accountNumber, a.accountTitle), 0)

  // Net Sales
  const netSales = effectiveGrossRevenue - totalDiscounts

  // Cost of Sales (currently from COGS computation)
  const totalCOGS = sumMonths(monthly, (m) => m.cogs)

  // Gross Profit
  const grossProfit = netSales - totalCOGS

  // Operating Expenses (indirect) — placeholder 0 until journal entries exist
  const totalOpex = 0

  // EBITDA
  const ebitda = grossProfit - totalOpex

  // Net Income
  const netIncome = ebitda

  if (viewMode === 'annual') {
    return (
      <div>
        {/* 7000 GROSS REVENUE */}
        <SectionHeader label="7000 Gross Revenue" />
        {grossRevenueAccts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} ${a.accountTitle}`} amount={acctAmount(a.accountNumber, a.accountTitle)} indent={1}
            onDrillDown={() => onDrillDown(a.accountTitle, 'REVENUE', 0, `${a.accountNumber} ${a.accountTitle}`)} />
        ))}
        {unmatchedRevenueKeys.map((key) => {
          const amt = sumMonths(monthly, (m) => (m.revenueByAccount || {})[key] || 0)
          return amt > 0 ? (
            <AnnualRow key={key} label={key} amount={amt} indent={1}
              onDrillDown={() => onDrillDown(key, 'REVENUE', 0, key)} />
          ) : null
        })}
        <AnnualRow label="Total for 7000 Gross Revenue" amount={effectiveGrossRevenue} indent={0} isTotal bold
          onDrillDown={() => onDrillDown('Total Gross Revenue', 'REVENUE', 0)} />

        <div className="h-3" />

        {/* 7002 DISCOUNTS AND REFUNDS */}
        <SectionHeader label="7002 Discounts and Refunds" />
        {discountAccts.map((a) => {
          const amt = acctAmount(a.accountNumber, a.accountTitle)
          const acctKey = `${a.accountNumber} ${a.accountTitle}`
          // If this is a deduction-sourced account (like MDR), drill-down as DEDUCTION; otherwise as REVENUE
          const isDeductionSourced = Object.keys(deductionAccountTotals).includes(acctKey)
          return (
            <AnnualRow key={a.accountNumber} label={`${a.accountNumber} ${a.accountTitle}`} amount={-amt} indent={1} negative
              onDrillDown={amt > 0 ? () => onDrillDown(a.accountTitle, isDeductionSourced ? 'DEDUCTION' : 'REVENUE', 0, isDeductionSourced ? a.accountTitle : acctKey) : undefined} />
          )
        })}
        <AnnualRow label="Total for 7002 Discounts and Refunds" amount={-totalDiscounts} indent={0} isTotal bold negative />

        <div className="h-3" />

        <AnnualRow label="Total for Net Sales" amount={netSales} isGrandTotal onDrillDown={() => onDrillDown('Net Sales', 'REVENUE', 0)} />

        <div className="h-3" />

        {/* COST OF SALES — broken down by expense account from inventory items */}
        <SectionHeader label="Cost of Sales" />
        {(() => {
          const cogsByAcct: Record<string, number> = {}
          for (let m = 1; m <= 12; m++) {
            for (const [key, val] of Object.entries(monthly[m]?.cogsByAccount || {})) {
              cogsByAcct[key] = (cogsByAcct[key] || 0) + val
            }
          }
          const acctKeys = Object.keys(cogsByAcct).sort()
          if (acctKeys.length > 0) {
            return acctKeys.map(key => (
              <AnnualRow key={key} label={key} amount={cogsByAcct[key]} indent={1}
                onDrillDown={() => onDrillDown(key, 'COGS', 0)} />
            ))
          }
          // Fallback: show COA accounts or computed total
          if (costOfSalesAccts.length > 0) {
            return costOfSalesAccts.map((a) => (
              <AnnualRow key={a.accountNumber} label={`${a.accountNumber} ${a.accountTitle}`} amount={0} indent={1} />
            ))
          }
          if (totalCOGS > 0) {
            return <AnnualRow label="Cost of Goods Sold (computed)" amount={totalCOGS} indent={1}
              onDrillDown={() => onDrillDown('Cost of Goods Sold', 'COGS', 0)} />
          }
          return null
        })()}
        <AnnualRow label="Total for Cost of Sales" amount={totalCOGS} indent={0} isTotal bold
          onDrillDown={() => onDrillDown('Cost of Sales', 'COGS', 0)} />

        <div className="h-3" />

        <AnnualRow label="Gross Profit" amount={grossProfit} isGrandTotal />

        <div className="h-3" />

        {/* EXPENSES (Indirect) */}
        <SectionHeader label="Expenses" />
        {indirectExpenseAccts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} ${a.accountTitle}`} amount={0} indent={1} />
        ))}
        {indirectExpenseAccts.length === 0 && (
          <AnnualRow label="(No expense accounts set up)" amount={0} indent={1} />
        )}
        <AnnualRow label="Total for Expenses" amount={totalOpex} indent={0} isTotal bold />

        <div className="h-3" />

        <AnnualRow label="EBITDA" amount={ebitda} isGrandTotal />

        <div className="h-3" />

        {/* NON-OPERATING EXPENSES (Depreciation, Interest) */}
        {nonOpExpenseAccts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} ${a.accountTitle}`} amount={0} indent={1} />
        ))}

        <div className="h-3" />

        <AnnualRow label="NET INCOME" amount={netIncome} isGrandTotal />
      </div>
    )
  }

  // Monthly helper for COA account
  const acctMonthly = (acctNum: string, acctTitle: string) =>
    getMonthlyArray(monthly, (m) => (m.revenueByAccount || {})[`${acctNum} ${acctTitle}`] || 0)

  /* ── Monthly view ──────────────────────────────────────────── */
  return (
    <div className="overflow-x-auto">
      <MonthlyHeader />

      {/* 7000 GROSS REVENUE */}
      <SectionHeader label="7000 Gross Revenue" />
      {grossRevenueAccts.map((a) => (
        <MonthlyRow key={a.accountNumber} label={`${a.accountNumber} ${a.accountTitle}`}
          values={acctMonthly(a.accountNumber, a.accountTitle)}
          total={acctAmount(a.accountNumber, a.accountTitle)} indent={1}
          onClickCell={(m) => onDrillDown(a.accountTitle, 'REVENUE', m ?? 0, `${a.accountNumber} ${a.accountTitle}`)} />
      ))}
      {unmatchedRevenueKeys.map((key) => {
        const total = sumMonths(monthly, (m) => (m.revenueByAccount || {})[key] || 0)
        return total > 0 ? (
          <MonthlyRow key={key} label={key}
            values={getMonthlyArray(monthly, (m) => (m.revenueByAccount || {})[key] || 0)}
            total={total} indent={1}
            onClickCell={(m) => onDrillDown(key, 'REVENUE', m ?? 0, key)} />
        ) : null
      })}
      <MonthlyRow label="Total for 7000 Gross Revenue"
        values={getMonthlyArray(monthly, (m) => m.serviceRevenue + m.productRevenue)}
        total={effectiveGrossRevenue} bold isTotal
        onClickCell={(m) => onDrillDown('Total Gross Revenue', 'REVENUE', m ?? 0)} />

      <div className="h-2" />

      {/* 7002 DISCOUNTS AND REFUNDS */}
      <SectionHeader label="7002 Discounts and Refunds" />
      {discountAccts.map((a) => {
        const acctKey = `${a.accountNumber} ${a.accountTitle}`
        const isDeductionSourced = Object.keys(deductionAccountTotals).includes(acctKey)
        return (
          <MonthlyRow key={a.accountNumber} label={`${a.accountNumber} ${a.accountTitle}`}
            values={acctMonthly(a.accountNumber, a.accountTitle).map(v => -v)}
            total={-acctAmount(a.accountNumber, a.accountTitle)} indent={1}
            onClickCell={(m) => onDrillDown(a.accountTitle, isDeductionSourced ? 'DEDUCTION' : 'REVENUE', m ?? 0, isDeductionSourced ? a.accountTitle : acctKey)} />
        )
      })}
      <MonthlyRow label="Total for 7002 Discounts and Refunds"
        values={getMonthlyArray(monthly, (m) => {
          // Sum all DEBIT revenue accounts monthly
          let total = 0
          for (const a of discountAccts) {
            total += (m.revenueByAccount || {})[`${a.accountNumber} ${a.accountTitle}`] || 0
          }
          return -total
        })}
        total={-totalDiscounts} bold isTotal />

      <div className="h-2" />

      <MonthlyRow label="Total for Net Sales"
        values={getMonthlyArray(monthly, (m) => m.serviceRevenue + m.productRevenue)}
        total={netSales} isGrandTotal />

      <div className="h-2" />

      {/* COST OF SALES — broken down by expense account */}
      <SectionHeader label="Cost of Sales" />
      {(() => {
        const cogsByAcct: Record<string, number> = {}
        for (let m = 1; m <= 12; m++) {
          for (const [key, val] of Object.entries(monthly[m]?.cogsByAccount || {})) {
            cogsByAcct[key] = (cogsByAcct[key] || 0) + val
          }
        }
        const acctKeys = Object.keys(cogsByAcct).sort()
        if (acctKeys.length > 0) {
          return acctKeys.map(key => (
            <MonthlyRow key={key} label={key}
              values={getMonthlyArray(monthly, (m) => (m.cogsByAccount || {})[key] || 0)}
              total={cogsByAcct[key]} indent={1}
              onClickCell={(m) => onDrillDown(key, 'COGS', m ?? 0)} />
          ))
        }
        return costOfSalesAccts.map((a) => (
          <MonthlyRow key={a.accountNumber} label={`${a.accountNumber} ${a.accountTitle}`}
            values={Array(12).fill(0)} total={0} indent={1} />
        ))
      })()}
      <MonthlyRow label="Total for Cost of Sales"
        values={getMonthlyArray(monthly, (m) => m.cogs)} total={totalCOGS} bold isTotal
        onClickCell={(m) => onDrillDown('Cost of Sales', 'COGS', m ?? 0)} />

      <div className="h-2" />

      <MonthlyRow label="Gross Profit"
        values={getMonthlyArray(monthly, (m) => m.serviceRevenue + m.productRevenue - m.cogs)}
        total={grossProfit} isGrandTotal />

      <div className="h-2" />

      {/* EXPENSES */}
      <SectionHeader label="Expenses" />
      {indirectExpenseAccts.map((a) => (
        <MonthlyRow key={a.accountNumber} label={`${a.accountNumber} ${a.accountTitle}`}
          values={Array(12).fill(0)} total={0} indent={1} />
      ))}
      <MonthlyRow label="Total for Expenses"
        values={Array(12).fill(0)} total={totalOpex} bold isTotal />

      <div className="h-2" />

      <MonthlyRow label="EBITDA"
        values={getMonthlyArray(monthly, (m) => m.serviceRevenue + m.productRevenue - m.cogs)}
        total={ebitda} isGrandTotal />

      <div className="h-2" />

      {/* NON-OPERATING */}
      {nonOpExpenseAccts.map((a) => (
        <MonthlyRow key={a.accountNumber} label={`${a.accountNumber} ${a.accountTitle}`}
          values={Array(12).fill(0)} total={0} indent={1} />
      ))}

      <div className="h-2" />

      <MonthlyRow label="NET INCOME"
        values={getMonthlyArray(monthly, (m) => m.serviceRevenue + m.productRevenue - m.cogs)}
        total={netIncome} isGrandTotal />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   CASH FLOW STATEMENT
   ═══════════════════════════════════════════════════════════════ */

function CashFlowStatement({ data, viewMode, onDrillDown }: { data: ReportData; viewMode: ViewMode; onDrillDown: OnDrillDown }) {
  const { monthly, accountsReceivable } = data

  // Collect all payment methods used
  const allMethods = new Set<string>()
  for (let m = 1; m <= 12; m++) {
    for (const method of Object.keys(monthly[m].paymentsByMethod)) allMethods.add(method)
  }
  const methods = Array.from(allMethods).sort()

  // Cash methods (actual cash inflows)
  const cashMethods = ['CASH', 'GCASH', 'PAYMAYA', 'DEBIT', 'CREDIT_CARD', 'SHOPEE', 'LAZADA', 'TIKTOK']
  // Non-cash methods excluding HMO/GL (those are AR, handled separately)
  const nonCashMethods = ['VIP_CARD', 'PREPAID_CARD', 'REWARD_POINTS', 'DOWNPAYMENT', 'PACKAGE']
  // AR methods (HMO/GL) — these are cash outflows (increase in accounts receivable)
  const arMethods = ['HMO', 'GL']

  const cashMethodsUsed = methods.filter((m) => cashMethods.includes(m))
  const nonCashMethodsUsed = methods.filter((m) => nonCashMethods.includes(m))
  const arMethodsUsed = methods.filter((m) => arMethods.includes(m))

  const totalCashFromOps = sumMonths(monthly, (m) => {
    let total = 0
    for (const method of cashMethods) total += m.paymentsByMethod[method] || 0
    return total
  })

  const totalNonCashFromOps = sumMonths(monthly, (m) => {
    let total = 0
    for (const method of nonCashMethods) total += m.paymentsByMethod[method] || 0
    return total
  })

  // AR: HMO/GL charges are cash outflows (increase in receivables)
  const totalARIncrease = sumMonths(monthly, (m) => {
    let total = 0
    for (const method of arMethods) total += m.paymentsByMethod[method] || 0
    return total
  })

  // AR payments received (from Record Payment in Accounts Receivable) are cash inflows
  const totalARPaymentsReceived = accountsReceivable?.paymentsReceived || 0

  const netCashFromOperations = totalCashFromOps + totalARPaymentsReceived - totalARIncrease
  const netCashFromInvesting = 0
  const netCashFromFinancing = 0
  const netChange = netCashFromOperations + netCashFromInvesting + netCashFromFinancing

  if (viewMode === 'annual') {
    return (
      <div>
        {/* OPERATING ACTIVITIES */}
        <SectionHeader label="Cash Flows from Operating Activities" />

        <SubSectionHeader label="Cash Receipts from Customers" />
        {cashMethodsUsed.map((method) => {
          const methodTotal = sumMonths(monthly, (m) => m.paymentsByMethod[method] || 0)
          return <AnnualRow key={method} label={PAYMENT_LABELS[method] || method} amount={methodTotal} indent={2}
            onDrillDown={() => onDrillDown(PAYMENT_LABELS[method] || method, method, 0)} />
        })}
        {cashMethodsUsed.length === 0 && (
          <AnnualRow label="(No cash receipts recorded)" amount={0} indent={2} />
        )}
        <AnnualRow label="Total Cash Receipts" amount={totalCashFromOps} indent={1} isTotal bold
          onDrillDown={() => onDrillDown('Total Cash Receipts', 'CASH_BALANCE', 0)} />

        {/* AR Payments Received (cash inflow from HMO/GL collections) */}
        {totalARPaymentsReceived > 0 && (
          <>
            <SubSectionHeader label="Collections from Accounts Receivable" />
            <AnnualRow label="AR Payments Received (HMO/GL)" amount={totalARPaymentsReceived} indent={2}
              onDrillDown={() => onDrillDown('AR Payments Received', 'AR_PAYMENTS', 0)} />
          </>
        )}

        {/* AR Increase (cash outflow — billed to HMO/GL but not yet collected) */}
        {totalARIncrease > 0 && (
          <>
            <SubSectionHeader label="Increase in Accounts Receivable" />
            {arMethodsUsed.map((method) => {
              const methodTotal = sumMonths(monthly, (m) => m.paymentsByMethod[method] || 0)
              return <AnnualRow key={method} label={PAYMENT_LABELS[method] || method} amount={-methodTotal} indent={2}
                onDrillDown={() => onDrillDown(PAYMENT_LABELS[method] || method, `AR_INCREASE_${method}`, 0)} />
            })}
            <AnnualRow label="Total Increase in AR" amount={-totalARIncrease} indent={1} isTotal />
          </>
        )}

        {nonCashMethodsUsed.length > 0 && (
          <>
            <SubSectionHeader label="Non-Cash Payments Received" />
            {nonCashMethodsUsed.map((method) => {
              const methodTotal = sumMonths(monthly, (m) => m.paymentsByMethod[method] || 0)
              return <AnnualRow key={method} label={PAYMENT_LABELS[method] || method} amount={methodTotal} indent={2} />
            })}
            <AnnualRow label="Total Non-Cash Payments" amount={totalNonCashFromOps} indent={1} isTotal />
          </>
        )}

        <div className="py-1 px-4 pl-6 text-xs italic" style={{ color: 'var(--mid-gray)' }}>
          Note: Cash payments to suppliers, employees, and other operating costs will appear here once expense transactions are recorded.
        </div>

        <AnnualRow label="Net Cash from Operating Activities" amount={netCashFromOperations} indent={0} isTotal bold />

        <div className="h-3" />

        {/* INVESTING ACTIVITIES */}
        <SectionHeader label="Cash Flows from Investing Activities" />
        <AnnualRow label="(No investing activities recorded)" amount={0} indent={1} />
        <AnnualRow label="Net Cash from Investing Activities" amount={netCashFromInvesting} indent={0} isTotal bold />

        <div className="h-3" />

        {/* FINANCING ACTIVITIES */}
        <SectionHeader label="Cash Flows from Financing Activities" />
        <AnnualRow label="(No financing activities recorded)" amount={0} indent={1} />
        <AnnualRow label="Net Cash from Financing Activities" amount={netCashFromFinancing} indent={0} isTotal bold />

        <div className="h-3" />

        <AnnualRow label="NET CHANGE IN CASH" amount={netChange} isGrandTotal />

        <div className="h-2" />
        <AnnualRow label="Beginning Cash Balance" amount={0} indent={0} />
        <AnnualRow label="ENDING CASH BALANCE" amount={netChange} isGrandTotal
          onDrillDown={() => onDrillDown('Ending Cash Balance', 'CASH_BALANCE', 0)} />
      </div>
    )
  }

  /* ── Monthly view ──────────────────────────────────────────── */
  return (
    <div className="overflow-x-auto">
      <MonthlyHeader />

      <SectionHeader label="Cash Flows from Operating Activities" />

      {cashMethodsUsed.map((method) => (
        <MonthlyRow
          key={method}
          label={PAYMENT_LABELS[method] || method}
          values={getMonthlyArray(monthly, (m) => m.paymentsByMethod[method] || 0)}
          total={sumMonths(monthly, (m) => m.paymentsByMethod[method] || 0)}
          indent={1}
          onClickCell={(m) => onDrillDown(PAYMENT_LABELS[method] || method, method, m ?? 0)}
        />
      ))}

      <MonthlyRow
        label="Total Cash Receipts"
        values={getMonthlyArray(monthly, (m) => {
          let t = 0
          for (const method of cashMethods) t += m.paymentsByMethod[method] || 0
          return t
        })}
        total={totalCashFromOps}
        bold
        isTotal
      />

      {/* AR Payments Received */}
      {totalARPaymentsReceived > 0 && (
        <>
          <div className="h-2" />
          <SubSectionHeader label="Collections from Accounts Receivable" />
          <MonthlyRow
            label="AR Payments Received (HMO/GL)"
            values={Array(12).fill(0)}
            total={totalARPaymentsReceived}
            indent={1}
          />
        </>
      )}

      {/* AR Increase (outflow) */}
      {arMethodsUsed.length > 0 && (
        <>
          <div className="h-2" />
          <SubSectionHeader label="Increase in Accounts Receivable" />
          {arMethodsUsed.map((method) => (
            <MonthlyRow
              key={method}
              label={PAYMENT_LABELS[method] || method}
              values={getMonthlyArray(monthly, (m) => -(m.paymentsByMethod[method] || 0))}
              total={-sumMonths(monthly, (m) => m.paymentsByMethod[method] || 0)}
              indent={1}
              onClickCell={(m) => onDrillDown(PAYMENT_LABELS[method] || method, `AR_INCREASE_${method}`, m ?? 0)}
            />
          ))}
        </>
      )}

      {nonCashMethodsUsed.length > 0 && (
        <>
          <div className="h-2" />
          <SubSectionHeader label="Non-Cash Payments" />
          {nonCashMethodsUsed.map((method) => (
            <MonthlyRow
              key={method}
              label={PAYMENT_LABELS[method] || method}
              values={getMonthlyArray(monthly, (m) => m.paymentsByMethod[method] || 0)}
              total={sumMonths(monthly, (m) => m.paymentsByMethod[method] || 0)}
              indent={1}
            />
          ))}
        </>
      )}

      <div className="h-2" />

      <MonthlyRow
        label="Net Cash from Operations"
        values={getMonthlyArray(monthly, (m) => {
          let t = 0
          for (const method of cashMethods) t += m.paymentsByMethod[method] || 0
          for (const method of arMethods) t -= m.paymentsByMethod[method] || 0
          return t
        })}
        total={netCashFromOperations}
        bold
        isTotal
      />

      <div className="h-2" />

      <MonthlyRow
        label="NET CHANGE IN CASH"
        values={getMonthlyArray(monthly, (m) => {
          let t = 0
          for (const method of cashMethods) t += m.paymentsByMethod[method] || 0
          for (const method of arMethods) t -= m.paymentsByMethod[method] || 0
          return t
        })}
        total={netChange}
        isGrandTotal
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function ReportsPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<ReportTab>('income-statement')
  const [year, setYear] = useState(new Date().getFullYear())
  const [viewMode, setViewMode] = useState<ViewMode>('annual')
  const [branch, setBranch] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ReportData | null>(null)
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null)

  const handleDrillDown: OnDrillDown = (label, category, month, accountKey) => {
    setDrillDown({ label, category, month, accountKey })
  }

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports?year=${year}&branch=${branch}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error('Failed to fetch report data:', err)
    } finally {
      setLoading(false)
    }
  }, [year, branch])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handlePrint = () => {
    window.print()
  }

  const reportTitle = activeTab === 'balance-sheet'
    ? 'Balance Sheet'
    : activeTab === 'income-statement'
    ? 'Income Statement'
    : 'Cash Flow Statement'

  const reportSubtitle = activeTab === 'balance-sheet'
    ? `As of December 31, ${year}`
    : `For the Year Ended December 31, ${year}`

  const branchLabel = branch === 'ALL' ? 'All Branches' : BRANCHES.find((b) => b.value === branch)?.label || branch

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
          >
            Financial Reports
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Generate and review financial statements for Sapphire Clinics East Incorporated
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>

      {/* ── Tab Navigation ─────────────────────────────────────── */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl print:hidden" style={{ background: 'var(--light-gray)' }}>
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all"
              style={{
                background: isActive ? 'white' : 'transparent',
                color: isActive ? 'var(--teal)' : 'var(--mid-gray)',
                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : undefined,
                fontFamily: 'var(--font-display)',
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5 print:hidden">
        {/* Year */}
        <div className="flex items-center gap-2">
          <Calendar size={16} style={{ color: 'var(--mid-gray)' }} />
          <div className="relative">
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)', background: 'white' }}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
          </div>
        </div>

        {/* View Mode */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
          {(['annual', 'monthly'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="px-4 py-2 text-sm font-medium capitalize transition-colors"
              style={{
                background: viewMode === mode ? 'var(--teal)' : 'white',
                color: viewMode === mode ? 'white' : 'var(--charcoal)',
              }}
            >
              {mode === 'annual' ? 'Whole Year' : 'Monthly'}
            </button>
          ))}
        </div>

        {/* Branch */}
        <div className="flex items-center gap-2">
          <Building2 size={16} style={{ color: 'var(--mid-gray)' }} />
          <div className="relative">
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)', background: 'white' }}
            >
              {BRANCHES.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
          </div>
        </div>
      </div>

      {/* ── Report Container ───────────────────────────────────── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'white',
          border: '1px solid var(--light-gray)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        {/* Report header (visible in print) */}
        <div className="text-center py-6 px-4" style={{ borderBottom: '2px solid var(--teal)' }}>
          <h2
            className="text-lg font-bold uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
          >
            Sapphire Clinics East Incorporated
          </h2>
          <h3
            className="text-base font-semibold mt-1"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}
          >
            {reportTitle}
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            {reportSubtitle}
          </p>
          {branch !== 'ALL' && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              Branch: {branchLabel}
            </p>
          )}
          <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
            (All amounts in Philippine Peso — foreign currency accounts converted at transaction-date exchange rate)
          </p>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin" size={24} style={{ color: 'var(--teal)' }} />
            <span className="ml-3 text-sm" style={{ color: 'var(--mid-gray)' }}>
              Generating report...
            </span>
          </div>
        )}

        {/* Report content */}
        {!loading && data && (
          <div className="py-2">
            {activeTab === 'balance-sheet' && (
              <BalanceSheet data={data} viewMode={viewMode} onDrillDown={handleDrillDown} />
            )}
            {activeTab === 'income-statement' && (
              <IncomeStatement data={data} viewMode={viewMode} onDrillDown={handleDrillDown} />
            )}
            {activeTab === 'cash-flow' && (
              <CashFlowStatement data={data} viewMode={viewMode} onDrillDown={handleDrillDown} />
            )}
          </div>
        )}

        {/* Footer */}
        <div
          className="text-center py-4 px-4 text-xs"
          style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}
        >
          Generated on {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} &bull; SCEI Accounting Hub
        </div>
      </div>

      {/* Drill-down panel */}
      {drillDown && (
        <DrillDownPanel
          target={drillDown}
          year={year}
          branch={branch}
          onClose={() => setDrillDown(null)}
        />
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          @page { margin: 0.75in; size: ${viewMode === 'monthly' ? 'landscape' : 'portrait'}; }
        }
      `}</style>
    </div>
  )
}
