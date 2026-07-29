'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { useSession } from 'next-auth/react'
import { userBranchScope } from '@/lib/branch-scope'
import {
  FileText, Download, Printer, Loader2, ChevronDown,
  Calendar, Building2, LayoutList, BarChart3, X,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { computeIncomeStatementTotals, INCOME_TAX_RATE } from '@/lib/reports/income-statement-totals'
import { computeCashFlowTotals } from '@/lib/reports/cash-flow-totals'
import HistoricalReport from './HistoricalReport'
import LedgerStatements from './LedgerStatements'
import { RETAINED_EARNINGS_BF_2026 } from '@/lib/reports/historical-fs'
import type { HistoricalReportPayload } from '@/lib/reports/historical-fs'

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
  receivableByAccount?: Record<string, number>
  productRevenueBySubtype: Record<string, number>
  revenueByBranch: Record<string, number>
  cogsByDept: Record<string, number>
  cogsByAccount: Record<string, number>
  cashReceived: number
  paymentsByMethod: Record<string, number>
  deductionsByMethod: Record<string, number>
  deductionsByType: Record<string, number>  // "Merchant Discount Rate" → amount, "Creditable Withholding Tax" → amount
  deductionsByAccount: Record<string, number>  // COA account key → amount (for balance sheet assets like CWT)
  cashByAccount: Record<string, number>  // COA account key (bank account) → net cash received
  expenseByAccount: Record<string, number>  // COA account key → amount (indirect expenses from journal entries)
}

interface AccountEntry {
  accountNumber: string
  accountTitle: string
  subSubType: string | null
  normalBalance: string
  currency: string
}

interface ReportData {
  // Present (alone) for manual/historical years (<= 2025) — every other field
  // is absent in that case and the page renders <HistoricalReport> instead.
  historical?: HistoricalReportPayload
  year: number
  branch: string
  cutoffDate?: string | null   // opening-balance date; transactions before it are excluded
  accounts: Record<string, Record<string, AccountEntry[]>>
  monthly: Record<number, MonthData>
  productIncomeAcctKey?: string | null
  inventory: { total: number; byDepartment: Record<string, number> }
  wallets: { total: number; byType: Record<string, number> }
  accountsReceivable?: {
    total: number
    byType: Record<string, number>
    paymentsReceived: number
    discounts: number
    byCashAccount: { accountNumber: string; accountTitle: string; amount: number }[]
  }
  inventorySourceAccounts?: { accountNumber: string; accountTitle: string; accountType: string; amount: number }[]
  unclassifiedAP?: number
  journalBalances?: { accountNumber: string; accountTitle: string; accountType: string; balance: number; entries: { date: string; description: string; referenceType: string; amount: number }[] }[]
  journalRevenueKeys?: string[]
  depreciation?: {
    byMonth: Record<number, number>
    accumulated: number
    assetsByClassification: Record<string, number>
  }
  // Tier 2.1: Opening balances per account for the fiscal year.
  beginningBalances?: { accountNumber: string; accountTitle: string; accountType: string; amount: number }[]
  // Tier 2.2: Cash on the BS = balance, not just receipts. The reports API now
  // computes cash outflows from inventory cash purchases, asset cash purchases,
  // and journal-entry credits to cash accounts.
  cashAdjustments?: {
    openingByAccount: Record<string, number>            // accountKey → opening cash balance
    inventoryCashOutflowsByAccount: Record<string, number>
    assetCashOutflows: number                           // total — applied against the default cash account
    journalCashFlowByAccount: Record<string, number>    // accountKey → net JE-derived cash delta (debit − credit)
    defaultCashAccountKey: string | null
  }
  // Tier 2.3: Unearned-revenue liability accrued by HMO/GL UNEARNED orders this year.
  // Mirrors the AR booked on the asset side so A = L + E for those orders.
  unearnedRevenueFromAR?: number
}

type ReportTab = 'balance-sheet' | 'income-statement' | 'cash-flow'
type ViewMode = 'annual' | 'monthly'
type OnDrillDown = (label: string, category: string, month: number, accountKey?: string, opts?: { subtype?: string; portion?: string }) => void

interface DrillDownState {
  label: string
  category: string
  month: number
  accountKey?: string  // e.g. "7020 Occupational Therapy Services Revenue"
  subtype?: string     // product sub-classification, e.g. "Occupational Therapy · Toys"
  portion?: string     // 'CASH' | 'RECEIVABLE' for the Cash/Receivables split
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
  { value: 'SBEA', label: 'East Branch' },
  { value: 'SBGH', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
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
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
  VERDANA_STORE: 'Verdana Store',
  SANDBOX_EAST: 'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
}
// Short branch codes for the drill-down subtitle / exports (current AHEA/AHGH naming).
const BRANCH_CODE: Record<string, string> = {
  SBEA: 'AHEA', SBGH: 'AHGH', VERD: 'VER', VERDANA_STORE: 'VER',
  SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH',
}
const branchCode = (b: string) => b === 'ALL' ? 'All Branches' : (BRANCH_CODE[b] || b)

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
   SHARED ROW COMPONENTS  (QuickBooks-style clean design)
   ═══════════════════════════════════════════════════════════════ */

const pctOf = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : 0
const ROW_FONT = '0.7rem'
const ROW_FONT_MONO = ROW_FONT
const GRID_MONTHLY = '210px repeat(12, minmax(96px,1fr)) 116px'
const GRID_MONTHLY_MINW = '1470px'

function SectionHeader({ label, collapsed, onToggle }: { label: string; collapsed?: boolean; onToggle?: () => void }) {
  return (
    <div
      className="flex items-center gap-1 select-none"
      style={{
        padding: '5px 12px',
        background: '#f0f2f4',
        borderTop: '1px solid #d1d5db',
        borderBottom: '1px solid #d1d5db',
        cursor: onToggle ? 'pointer' : 'default',
      }}
      onClick={onToggle}
    >
      {onToggle !== undefined && (
        <ChevronDown
          size={11}
          style={{
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.12s',
            color: '#6b7280',
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ fontSize: ROW_FONT, fontWeight: 700, color: '#111827', letterSpacing: '0.01em' }}>
        {label}
      </span>
    </div>
  )
}

function SubSectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '4px 12px 4px 24px',
        background: '#f8f9fa',
        borderBottom: '1px solid #e5e7eb',
        fontSize: ROW_FONT,
        fontWeight: 600,
        color: '#374151',
      }}
    >
      {label}
    </div>
  )
}

/* ── Annual row (label + amount) ──────────────────────────────── */

function AnnualRow({
  label, amount, indent = 0, bold = false, isTotal = false, isGrandTotal = false, negative = false, muted = false, onDrillDown,
  expandable = false, expanded = false, onToggleExpand, pctOfParent,
}: {
  label: string; amount: number; indent?: number; bold?: boolean
  isTotal?: boolean; isGrandTotal?: boolean; negative?: boolean; muted?: boolean; onDrillDown?: () => void
  expandable?: boolean; expanded?: boolean; onToggleExpand?: () => void; pctOfParent?: number | null
}) {
  const isNeg = negative && amount < 0
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 160px',
        alignItems: 'center',
        padding: '3px 12px',
        paddingLeft: `${0.75 + indent * 1.2}rem`,
        fontSize: muted ? 'calc(0.95 * 1em)' : ROW_FONT,
        fontWeight: isGrandTotal || isTotal || bold ? 600 : 400,
        fontStyle: muted ? 'italic' : undefined,
        borderTop: isGrandTotal ? '2px solid #111827' : isTotal ? '1px solid #d1d5db' : undefined,
        // Thin separator on plain line items so the eye can track a label to
        // its amount across the full row width.
        borderBottom: isGrandTotal ? '3px double #111827' : isTotal ? '1px solid #d1d5db' : '1px solid #f3f4f6',
        background: isGrandTotal ? '#f0f9f8' : undefined,
        color: muted ? '#6b7280' : '#111827',
      }}
      className="hover:bg-gray-50"
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: expandable ? 'pointer' : undefined }}
        onClick={expandable ? onToggleExpand : undefined}>
        {expandable && <ChevronDown size={12} style={{ flexShrink: 0, color: '#6b7280', transition: 'transform 0.15s', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }} />}
        {label}
      </span>
      <span
        style={{
          textAlign: 'right',
          fontFamily: 'inherit',
          fontSize: ROW_FONT_MONO,
          color: isNeg ? '#dc2626' : muted ? '#6b7280' : (onDrillDown && amount !== 0 ? '#0d9488' : amount === 0 && !isTotal && !isGrandTotal ? '#c4c9d0' : '#111827'),
          cursor: onDrillDown ? 'pointer' : undefined,
          textDecoration: 'none',
        }}
        onClick={onDrillDown}
        onMouseEnter={e => { if (onDrillDown) (e.target as HTMLElement).style.textDecoration = 'underline' }}
        onMouseLeave={e => { if (onDrillDown) (e.target as HTMLElement).style.textDecoration = 'none' }}
      >
        {negative ? fmtSigned(amount) : fmt(amount)}
        {pctOfParent != null && <span style={{ color: '#9ca3af', marginLeft: 5, fontStyle: 'italic' }}>({pctOfParent}%)</span>}
      </span>
    </div>
  )
}

/* ── Monthly row (label + 12 months + total) ──────────────────── */

function MonthlyRow({
  label, values, total, indent = 0, bold = false, isTotal = false, isGrandTotal = false, negative = false, muted = false, onClickCell,
  expandable = false, expanded = false, onToggleExpand, pctOfParent,
}: {
  label: string; values: number[]; total: number; indent?: number; bold?: boolean
  isTotal?: boolean; isGrandTotal?: boolean; negative?: boolean; muted?: boolean
  onClickCell?: (month: number | null) => void
  expandable?: boolean; expanded?: boolean; onToggleExpand?: () => void; pctOfParent?: number | null
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: GRID_MONTHLY,
        alignItems: 'center',
        padding: '3px 12px',
        paddingLeft: `${0.5 + indent * 0.85}rem`,
        fontSize: ROW_FONT,
        fontWeight: isGrandTotal || isTotal || bold ? 600 : 400,
        fontStyle: muted ? 'italic' : undefined,
        borderTop: isGrandTotal ? '2px solid #111827' : isTotal ? '1px solid #d1d5db' : undefined,
        borderBottom: isGrandTotal ? '3px double #111827' : isTotal ? '1px solid #d1d5db' : undefined,
        background: isGrandTotal ? '#f0f9f8' : undefined,
        color: muted ? '#6b7280' : '#111827',
        minWidth: GRID_MONTHLY_MINW,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', paddingRight: '6px', cursor: expandable ? 'pointer' : undefined }}
        onClick={expandable ? onToggleExpand : undefined}>
        {expandable && <ChevronDown size={12} style={{ flexShrink: 0, color: '#6b7280', transition: 'transform 0.15s', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {pctOfParent != null && <span style={{ color: '#9ca3af', marginLeft: 2, flexShrink: 0 }}>({pctOfParent}%)</span>}
      </span>
      {values.map((v, i) => {
        const isNeg = negative && v < 0
        return (
          <span
            key={i}
            style={{
              textAlign: 'right',
              fontFamily: 'inherit',
              fontSize: ROW_FONT_MONO,
              paddingRight: '4px',
              color: isNeg ? '#dc2626' : (onClickCell && v !== 0 ? '#0d9488' : v === 0 && !isTotal && !isGrandTotal ? '#c4c9d0' : '#111827'),
              cursor: onClickCell ? 'pointer' : undefined,
            }}
            onClick={() => onClickCell?.(i + 1)}
          >
            {negative ? fmtSigned(v) : fmt(v)}
          </span>
        )
      })}
      <span
        style={{
          textAlign: 'right',
          fontFamily: 'inherit',
          fontSize: ROW_FONT_MONO,
          fontWeight: 600,
          color: (negative && total < 0) ? '#dc2626' : (onClickCell && total !== 0 ? '#0d9488' : '#111827'),
          cursor: onClickCell ? 'pointer' : undefined,
        }}
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
      style={{
        display: 'grid',
        gridTemplateColumns: GRID_MONTHLY,
        padding: '6px 12px',
        background: '#1f2937',
        color: '#e5e7eb',
        fontSize: '0.62rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        minWidth: GRID_MONTHLY_MINW,
      }}
    >
      <span>Line Item</span>
      {MONTHS.map((m) => (
        <span key={m} style={{ textAlign: 'right', paddingRight: '4px' }}>{m}</span>
      ))}
      <span style={{ textAlign: 'right' }}>Total</span>
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
    if (target.subtype) params.set('subtype', target.subtype)
    if (target.portion) params.set('portion', target.portion)
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

  const handleDownloadCsv = () => {
    if (items.length === 0) return
    const safeLabel = target.label.replace(/[/\\?%*:|"<>]/g, '-')
    const filename = `${safeLabel} — ${monthLabel} — ${branchCode(branch)}`
    const rows = [
      ['Date', 'Type of Transaction', 'Branch', 'Amount'],
      ...items.map(item => [item.date, item.type, branchCode(item.branch), item.amount.toFixed(2)]),
      ['', '', 'TOTAL', total.toFixed(2)],
    ]
    const csv = rows.map(row =>
      row.map(cell => {
        const s = String(cell)
        return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s
      }).join(',')
    ).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
              {monthLabel} &bull; {branchCode(branch)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!loading && items.length > 0 && (
              <button
                onClick={handleDownloadCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-80 transition-opacity"
                style={{ background: 'var(--teal)', color: 'white' }}
                title="Download as Excel/CSV"
              >
                <Download size={13} />
                Download Excel
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>
          </div>
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
  const { accounts, inventory, wallets, monthly, inventorySourceAccounts = [], unclassifiedAP = 0, accountsReceivable, journalBalances = [], depreciation } = data

  // Build journal balance lookup: accountKey → balance
  const journalBalanceMap: Record<string, number> = {}
  for (const jb of journalBalances) {
    journalBalanceMap[`${jb.accountNumber} ${jb.accountTitle}`] = jb.balance
  }

  // Calculate totals from available data
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
  // Any other equity subtypes (e.g. Share Capital, Treasury Shares, Preferred
  // Capital) so Equity-module journal balances render as their own lines.
  const allEquityAccounts = Object.values(accounts.EQUITY || {}).flat()
  const otherEquityAccounts = allEquityAccounts.filter(a =>
    !ownersEquityAccounts.find(o => o.accountNumber === a.accountNumber) &&
    !retainedEarningsAccounts.find(r => r.accountNumber === a.accountNumber))

  // Sum deduction-sourced current asset amounts (CWT, etc.)
  const deductionAssetTotal = currentAssetAccounts.reduce((s, a) => {
    const key = `${a.accountNumber} ${a.accountTitle}`
    return s + (deductionAccountTotals[key] || 0)
  }, 0)

  // Accounts Receivable from HMO/GL wallets
  const arTotal = accountsReceivable?.total || 0

  /* ── Cash balance per bank account (Tier 2.2) ─────────────────
     Cash is a BALANCE, not a flow. We compute:
       opening balance + POS receipts + AR collections + JE-driven deltas
       − inventory paid in cash − asset cash purchases */
  const cashAdj = data.cashAdjustments || {
    openingByAccount: {}, inventoryCashOutflowsByAccount: {},
    assetCashOutflows: 0, journalCashFlowByAccount: {}, defaultCashAccountKey: null,
  }
  const cashByAccountBalance: Record<string, number> = {}
  // a) opening cash
  for (const [k, v] of Object.entries(cashAdj.openingByAccount)) cashByAccountBalance[k] = (cashByAccountBalance[k] || 0) + v
  // b) POS cash receipts (already routed by paymentMode COA)
  for (let m = 1; m <= 12; m++) {
    for (const [k, v] of Object.entries(monthly[m].cashByAccount || {})) {
      cashByAccountBalance[k] = (cashByAccountBalance[k] || 0) + v
    }
  }
  // c) AR cash collections (already routed by AR payment cashAccount)
  if (accountsReceivable?.byCashAccount) {
    for (const ca of accountsReceivable.byCashAccount) {
      const k = `${ca.accountNumber} ${ca.accountTitle}`
      cashByAccountBalance[k] = (cashByAccountBalance[k] || 0) + ca.amount
    }
  }
  // d) JE-driven cash flows (e.g. SalaryPayment credits cash, BenefitPayment, TaxPayment)
  for (const [k, v] of Object.entries(cashAdj.journalCashFlowByAccount)) {
    cashByAccountBalance[k] = (cashByAccountBalance[k] || 0) + v
  }
  // e) Inventory paid in cash (sourceAccount.accountType=ASSET) — outflow per cash account
  for (const [k, v] of Object.entries(cashAdj.inventoryCashOutflowsByAccount)) {
    cashByAccountBalance[k] = (cashByAccountBalance[k] || 0) - v
  }
  // f) Asset cash purchases — applied against the default cash account (no per-asset
  //    payment account exists yet; user can later add Asset.sourceAccountId to refine).
  if (cashAdj.assetCashOutflows > 0 && cashAdj.defaultCashAccountKey) {
    cashByAccountBalance[cashAdj.defaultCashAccountKey] =
      (cashByAccountBalance[cashAdj.defaultCashAccountKey] || 0) - cashAdj.assetCashOutflows
  }
  const totalCash = Object.values(cashByAccountBalance).reduce((s, v) => s + v, 0)

  // Net income for retained earnings — MUST match Income Statement logic.
  // Use the shared helper so BS equity and IS net income can never drift apart.
  const { netIncome, taxProvision } = computeIncomeStatementTotals(data)

  // The 20% income-tax provision inside Net Income is an accrual with no cash
  // movement, so it needs a balancing line to keep A = L + E: a positive
  // provision is Income Tax Payable (current liability); a provision on a loss
  // is a Deferred Tax Asset — the same treatment as the audited FY2024 BS.
  const incomeTaxPayable = taxProvision > 0 ? taxProvision : 0
  const deferredTaxAsset = taxProvision < 0 ? -taxProvision : 0

  // Computed totals
  const totalCurrentAssets = totalCash + invTotal + deductionAssetTotal + arTotal + deferredTaxAsset
  const totalGrossAssets = Object.values(depreciation?.assetsByClassification || {}).reduce((s, v) => s + v, 0)
  const accumulatedDep = depreciation?.accumulated || 0
  const totalNonCurrentAssets = totalGrossAssets - accumulatedDep
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets

  // Source account balances — only LIABILITY accounts are payables (ASSET accounts are cash purchases, not payables)
  const liabilitySourceAccounts = inventorySourceAccounts.filter(a => a.accountType === 'LIABILITY')
  const sourceAccountTotal = liabilitySourceAccounts.reduce((s, a) => s + a.amount, 0) + unclassifiedAP

  // Payroll payable balances from journal entries (4040, 4060, 4070, etc.)
  // 4050 Unearned Revenue is intentionally excluded: its liability is tracked directly via
  // wallets.total (DigitalWallet balances) rather than cumulative JE credits, so including
  // its JE balance here would double-count it in Total Current Liabilities.
  const payrollPayableAccounts = journalBalances.filter(jb => jb.accountType === 'LIABILITY' && jb.balance > 0)
  const payrollPayableTotal = payrollPayableAccounts
    .filter(a => a.accountNumber !== '4050')
    .reduce((s, a) => s + a.balance, 0)

  // Tier 2.3: Unearned Revenue accrued by HMO/GL UNEARNED orders this year.
  // Mirrors the AR booked on the asset side so A = L + E even when business uses
  // revenueType=UNEARNED for receivables (which would otherwise leave AR un-offset).
  const unearnedRevFromAR = data.unearnedRevenueFromAR || 0

  const totalCurrentLiabilities = wallets.total + sourceAccountTotal + payrollPayableTotal + unearnedRevFromAR + incomeTaxPayable
  const totalNonCurrentLiabilities = 0
  const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities

  // Opening balances for Cash, Owner's Equity, and Retained Earnings come from
  // the BeginningBalance table (one row per account per fiscal year). They are
  // required to make the BS reflect cumulative state, not just current-year flows.
  const openingByAcctNum: Record<string, number> = {}
  for (const ob of (data.beginningBalances || [])) {
    openingByAcctNum[ob.accountNumber] = ob.amount
  }
  const sumOpeningForAccts = (accts: AccountEntry[]) =>
    accts.reduce((s, a) => s + (openingByAcctNum[a.accountNumber] || 0), 0)

  const openingOwnersEquity = sumOpeningForAccts(ownersEquityAccounts)
  const openingRetainedEarnings = sumOpeningForAccts(retainedEarningsAccounts)

  // Chain the manual years into the derived years: when no retained-earnings
  // opening balance has been entered, carry forward the Dec-2025 audited
  // consolidated RE (All-Branches view only — no per-branch 2025 BS exists).
  const reBroughtForward = openingRetainedEarnings !== 0
    ? openingRetainedEarnings
    : (data.year >= 2026 && data.branch === 'ALL' ? RETAINED_EARNINGS_BF_2026 : 0)
  const usesAuditedReBf = openingRetainedEarnings === 0 && reBroughtForward !== 0

  // Journal-entry EQUITY balances (share capital issuance, treasury buyback,
  // dividends) from the Equity module. Each equity JE posts a matching bank leg
  // that already flows into Cash above, so including the equity leg here keeps
  // A = L + E balanced for every equity transaction. Without this, raising
  // capital would increase assets (cash) but not equity.
  const equityJournalTotal = journalBalances
    .filter(jb => jb.accountType === 'EQUITY')
    .reduce((s, jb) => s + jb.balance, 0)

  const totalEquity = openingOwnersEquity + reBroughtForward + equityJournalTotal + netIncome
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
        <AnnualRow label="Cash and Cash Equivalents" amount={totalCash} indent={2} bold
          onDrillDown={() => onDrillDown('Cash and Cash Equivalents', 'CASH_BALANCE', 0)} />
        {/* Cash by bank account — opening + receipts + JE − cash purchases */}
        {Object.entries(cashByAccountBalance).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
          <AnnualRow key={k} label={k} amount={v} indent={3} negative />
        ))}
        {arTotal > 0 && (
          <AnnualRow label="1010 — Accounts Receivable" amount={arTotal} indent={2}
            onDrillDown={() => onDrillDown('Accounts Receivable', 'AR_PAYMENTS', 0)} />
        )}
        {accountsReceivable && Object.entries(accountsReceivable.byType).map(([type, bal]) => (
          bal > 0 ? <AnnualRow key={type} label={`    ${type === 'HMO' ? 'HMO Receivables' : type === 'GL' ? 'Guarantee Letter Receivables' : type}`} amount={bal} indent={3}
            onDrillDown={() => onDrillDown(type === 'HMO' ? 'HMO Receivables' : type === 'GL' ? 'Guarantee Letter Receivables' : type, 'AR_BALANCE', 0, type)} /> : null
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
        {deferredTaxAsset > 0 && (
          <AnnualRow label="Deferred Tax Asset (20% provision on current-year loss)" amount={deferredTaxAsset} indent={2} />
        )}
        <AnnualRow label="Total Current Assets" amount={totalCurrentAssets} indent={1} isTotal bold />

        <SubSectionHeader label="Non-Current Assets" />
        {ppeAccounts.map((a) => {
          const grossVal = depreciation?.assetsByClassification?.[a.accountNumber] || 0
          return grossVal > 0 ? (
            <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={grossVal} indent={2} />
          ) : null
        })}
        {accumulatedDep > 0 && (
          <AnnualRow label="2010 — Accumulated Depreciation" amount={-accumulatedDep} indent={2}
            onDrillDown={() => onDrillDown('2010 Accumulated Depreciation', 'ACCUMULATED_DEPRECIATION', 0)} />
        )}
        {totalGrossAssets === 0 && accumulatedDep === 0 && ppeAccounts.length === 0 && intangibleAccounts.length === 0 && otherNCAAccounts.length === 0 && (
          <AnnualRow label="(No non-current asset accounts set up)" amount={0} indent={2} />
        )}
        {/* Intangibles + other non-current assets — carried at cost, no depreciation. */}
        {intangibleAccounts.map((a) => {
          const val = depreciation?.assetsByClassification?.[a.accountNumber] || 0
          return val > 0 ? <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={val} indent={2} /> : null
        })}
        {otherNCAAccounts.map((a) => {
          const val = depreciation?.assetsByClassification?.[a.accountNumber] || 0
          return val > 0 ? <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={val} indent={2} /> : null
        })}
        <AnnualRow label="Total Non-Current Assets" amount={totalNonCurrentAssets} indent={1} isTotal bold />

        <AnnualRow label="TOTAL ASSETS" amount={totalAssets} isGrandTotal />

        <div className="h-4" />

        {/* LIABILITIES */}
        <SectionHeader label="Liabilities" />
        <SubSectionHeader label="Current Liabilities" />
        {/* Payroll payable accounts from journal entries (4040, 4060, 4070, etc.)
            4050 is intentionally excluded here — it is handled below by the dedicated
            Unearned Revenue (wallets) section so it never renders twice. */}
        {payrollPayableAccounts.filter(a => a.accountNumber !== '4050').map((a) => {
          const acctKey = `${a.accountNumber} ${a.accountTitle}`
          const drillCategory = a.accountNumber === '4060' ? 'SALARY_PAYABLE_DETAIL'
            : a.accountNumber === '4070' ? 'TAX_PAYABLE_DETAIL'
            : 'JOURNAL_ACCOUNT'
          return (
            <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={a.balance} indent={2}
              onDrillDown={() => onDrillDown(a.accountTitle, drillCategory, 0, acctKey)} />
          )
        })}
        {/* Other COA liability accounts not covered by journal entries */}
        {currentLiabAccounts.filter(a => !payrollPayableAccounts.find(p => p.accountNumber === a.accountNumber)).map((a) => {
          const acctKey = `${a.accountNumber} ${a.accountTitle}`
          const jBal = journalBalanceMap[acctKey] || 0
          return jBal !== 0 ? (
            <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={jBal} indent={2}
              onDrillDown={() => onDrillDown(a.accountTitle, 'JOURNAL_ACCOUNT', 0, acctKey)} />
          ) : null
        })}
        {/* Unearned revenue from wallets — lodged under 4050 */}
        {wallets.total > 0 && (
          <>
            <AnnualRow label="4050 — Unearned Revenue" amount={wallets.total} indent={2} bold
              onDrillDown={() => onDrillDown('Unearned Revenue', 'WALLET_BALANCE', 0)} />
            {Object.entries(wallets.byType).map(([type, bal]) => (
              <AnnualRow key={type} label={`Unearned Revenue — ${WALLET_LABELS[type] || type}`} amount={bal} indent={3} />
            ))}
          </>
        )}
        {/* Tier 2.3: Mirror liability for HMO/GL orders booked as UNEARNED revenue. */}
        {unearnedRevFromAR > 0 && (
          <AnnualRow label="4055 — Unearned Revenue (HMO/GL receivables)" amount={unearnedRevFromAR} indent={2}
            onDrillDown={() => onDrillDown('Unearned Revenue from HMO/GL', 'UNEARNED_AR', 0)} />
        )}
        {/* Inventory source accounts (only liability/payable accounts) */}
        {liabilitySourceAccounts.length > 0 && liabilitySourceAccounts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={a.amount} indent={2} />
        ))}
        {unclassifiedAP > 0 && (
          <AnnualRow label="Unclassified Accounts Payable" amount={unclassifiedAP} indent={2} />
        )}
        {incomeTaxPayable > 0 && (
          <AnnualRow label="Income Tax Payable (20% provision, accrued)" amount={incomeTaxPayable} indent={2} />
        )}
        {wallets.total === 0 && currentLiabAccounts.length === 0 && sourceAccountTotal === 0 && payrollPayableTotal === 0 && (
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

        {/* EQUITY — each account = opening balance + Equity-module journal movements */}
        <SectionHeader label="Equity" />
        {ownersEquityAccounts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`}
            amount={(openingByAcctNum[a.accountNumber] || 0) + (journalBalanceMap[`${a.accountNumber} ${a.accountTitle}`] || 0)} indent={1} />
        ))}
        {otherEquityAccounts.map((a) => {
          const amt = (openingByAcctNum[a.accountNumber] || 0) + (journalBalanceMap[`${a.accountNumber} ${a.accountTitle}`] || 0)
          return amt !== 0 ? (
            <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle}`} amount={amt} indent={1} />
          ) : null
        })}
        {retainedEarningsAccounts.map((a) => (
          <AnnualRow key={a.accountNumber} label={`${a.accountNumber} — ${a.accountTitle} (Opening)`}
            amount={(openingByAcctNum[a.accountNumber] || 0) + (journalBalanceMap[`${a.accountNumber} ${a.accountTitle}`] || 0)} indent={1} />
        ))}
        {usesAuditedReBf && (
          <AnnualRow label="Retained Earnings b/f (per Dec-2025 audited consolidated BS)" amount={reBroughtForward} indent={1} />
        )}
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
          {data.cutoffDate && (
            <p className="mt-2 text-xs italic" style={{ color: 'var(--mid-gray)' }}>
              Opening-balance cutoff: transactions before {data.cutoffDate} are excluded (already embedded in the bank opening balances).
            </p>
          )}
          {!isBalanced && data.year >= 2026 && (
            <p className="mt-2 text-xs italic" style={{ color: 'var(--mid-gray)' }}>
              To fully chain this sheet off the audited FY2025 statements, enter the Dec-31-2025 balance-sheet
              amounts as {data.year} opening balances (bank accounts: Bank Reconciliation › Opening balance) — the remaining difference is the
              opening position not yet entered.
            </p>
          )}
        </div>
      </div>
    )
  }
}

/* ═══════════════════════════════════════════════════════════════
   INCOME STATEMENT
   ═══════════════════════════════════════════════════════════════ */

function IncomeStatement({ data, viewMode, onDrillDown, revenueOnly = false }: { data: ReportData; viewMode: ViewMode; onDrillDown: OnDrillDown; revenueOnly?: boolean }) {
  const { monthly, accounts } = data
  const [col, setCol] = useState<Record<string, boolean>>({})
  const tog = (k: string) => setCol(p => ({ ...p, [k]: !p[k] }))
  // Per-revenue-account breakdown expand (Cash/Receivables + product sub-types). Collapsed by default.
  const [expRev, setExpRev] = useState<Record<string, boolean>>({})
  const togRev = (k: string) => setExpRev(p => ({ ...p, [k]: !p[k] }))

  // COA-driven: Revenue accounts — gather from ALL revenue subTypes, not just OPERATING/NON_OPERATING
  const allRevenueSubTypes = accounts.REVENUE ? Object.values(accounts.REVENUE).flat() : []
  const grossRevenueAccts = allRevenueSubTypes.filter(a => a.normalBalance !== 'DEBIT')
  const discountAccts = allRevenueSubTypes.filter(a => a.normalBalance === 'DEBIT')

  // Expense buckets come from the shared totals helper (below) so the rows the
  // page lists and the totals it prints can never use different groupings.

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

  // Product-income (7080) sub-classification by product subtype (Department · Category).
  const productIncomeAcctKey = data.productIncomeAcctKey || null
  const productSubtypeAnnual: [string, number][] = (() => {
    const agg: Record<string, number> = {}
    for (let m = 1; m <= 12; m++) {
      for (const [k, v] of Object.entries(monthly[m]?.productRevenueBySubtype || {})) agg[k] = (agg[k] || 0) + v
    }
    return Object.entries(agg).filter(([, v]) => Math.abs(v) > 0.005).sort((a, b) => b[1] - a[1])
  })()
  const subtypeMonthly = (label: string) =>
    getMonthlyArray(monthly, (m) => (m.productRevenueBySubtype || {})[label] || 0)

  // Helper: get amount for a COA expense account from expenseByAccount (journal entries)
  const expenseAmount = (acctNum: string, acctTitle: string) => {
    const key = `${acctNum} ${acctTitle}`
    return sumMonths(monthly, (m) => (m.expenseByAccount || {})[key] || 0)
  }

  // Income Statement totals — computed once via the shared helper so the BS and IS
  // can never produce different Net Income figures.
  const totals = computeIncomeStatementTotals(data)
  const {
    effectiveGrossRevenue, totalDiscounts, netSales, totalCOGS,
    directJournalExpenses: totalDirectExpJournal,
    grossProfit, totalOpex, ebitda, totalDepreciation,
    totalInterest, totalNonOperating, ebt, taxProvision, netIncome,
    costOfSalesAccts: directExpenseAccts,
    operatingExpenseAccts: indirectExpenseAccts,
    interestAccts, nonOperatingAccts: nonOpExpenseAccts,
    grossRevenueForMonth, discountsForMonth, netSalesForMonth,
    directExpForMonth, indirectExpForMonth,
    interestForMonth, nonOperatingForMonth, journalDepForMonth,
  } = totals
  const depByMonth = data.depreciation?.byMonth || {}
  // Full per-month depreciation (asset schedule + direct 8070 postings) and the
  // per-month P&L chain below EBITDA, mirroring the annual totals
  const depForMonthIdx = (i: number) => (depByMonth[i + 1] || 0) + journalDepForMonth(monthly[i + 1])
  const ebtForMonthIdx = (i: number) => {
    const m = monthly[i + 1]
    return netSalesForMonth(m) - m.cogs - directExpForMonth(m) - indirectExpForMonth(m)
      - depForMonthIdx(i) - interestForMonth(m) - nonOperatingForMonth(m)
  }

  if (viewMode === 'annual') {
    const cogsByAcctAnnual: Record<string, number> = {}
    for (let m = 1; m <= 12; m++) {
      for (const [key, val] of Object.entries(monthly[m]?.cogsByAccount || {})) {
        cogsByAcctAnnual[key] = (cogsByAcctAnnual[key] || 0) + val
      }
    }
    return (
      <div>
        {/* 7000 GROSS REVENUE */}
        <SectionHeader label="7000 Gross Revenue" collapsed={!!col['gr']} onToggle={() => tog('gr')} />
        {!col['gr'] && (
          <>
            {grossRevenueAccts.map((a) => {
              const acctKey = `${a.accountNumber} ${a.accountTitle}`
              const isProductIncome = productIncomeAcctKey === acctKey && productSubtypeAnnual.length > 0
              const total = acctAmount(a.accountNumber, a.accountTitle)
              const rcv = sumMonths(monthly, (m) => (m.receivableByAccount || {})[acctKey] || 0)
              return (
                <Fragment key={a.accountNumber}>
                  <AnnualRow label={acctKey} amount={total} indent={1}
                    onDrillDown={() => onDrillDown(a.accountTitle, 'REVENUE', 0, acctKey)}
                    expandable={rcv > 0 || isProductIncome} expanded={!!expRev[a.accountNumber]} onToggleExpand={() => togRev(a.accountNumber)} />
                  {expRev[a.accountNumber] && rcv > 0 && (<>
                    <AnnualRow key={`${a.accountNumber}-cash`} label="Cash Sales" amount={total - rcv} indent={2} muted pctOfParent={pctOf(total - rcv, total)}
                      onDrillDown={() => onDrillDown('Cash Sales', 'REVENUE', 0, acctKey, { portion: 'CASH' })} />
                    <AnnualRow key={`${a.accountNumber}-rcv`} label="Receivables Sales (HMO/GL)" amount={rcv} indent={2} muted pctOfParent={pctOf(rcv, total)}
                      onDrillDown={() => onDrillDown('Receivables Sales (HMO/GL)', 'REVENUE', 0, acctKey, { portion: 'RECEIVABLE' })} />
                  </>)}
                  {expRev[a.accountNumber] && isProductIncome && productSubtypeAnnual.map(([label, amt]) => (
                    <AnnualRow key={`${a.accountNumber}-${label}`} label={label} amount={amt} indent={2} muted pctOfParent={pctOf(amt, total)}
                      onDrillDown={() => onDrillDown(label, 'REVENUE', 0, acctKey, { subtype: label })} />
                  ))}
                </Fragment>
              )
            })}
            {unmatchedRevenueKeys.map((key) => {
              const amt = sumMonths(monthly, (m) => (m.revenueByAccount || {})[key] || 0)
              return amt > 0 ? (
                <AnnualRow key={key} label={key} amount={amt} indent={1}
                  onDrillDown={() => onDrillDown(key, 'REVENUE', 0, key)} />
              ) : null
            })}
          </>
        )}
        <AnnualRow label="Total for 7000 Gross Revenue" amount={effectiveGrossRevenue} indent={0} isTotal bold
          onDrillDown={() => onDrillDown('Total Gross Revenue', 'REVENUE', 0)} />

        {/* 7002 DISCOUNTS AND REFUNDS */}
        <SectionHeader label="7002 Discounts and Refunds" collapsed={!!col['disc']} onToggle={() => tog('disc')} />
        {!col['disc'] && discountAccts.map((a) => {
          const amt = acctAmount(a.accountNumber, a.accountTitle)
          const acctKey = `${a.accountNumber} ${a.accountTitle}`
          const isDeductionSourced = Object.keys(deductionAccountTotals).includes(acctKey)
          return (
            <AnnualRow key={a.accountNumber} label={`${a.accountNumber} ${a.accountTitle}`} amount={-amt} indent={1} negative
              onDrillDown={amt > 0 ? () => onDrillDown(a.accountTitle, isDeductionSourced ? 'DEDUCTION' : 'REVENUE', 0, isDeductionSourced ? a.accountTitle : acctKey) : undefined} />
          )
        })}
        <AnnualRow label="Total for 7002 Discounts and Refunds" amount={-totalDiscounts} indent={0} isTotal bold negative />

        <AnnualRow label="Total for Net Sales" amount={netSales} isGrandTotal onDrillDown={() => onDrillDown('Net Sales', 'REVENUE', 0)} />

        {/* COST OF SALES */}
        <SectionHeader label="Cost of Sales" collapsed={!!col['cos']} onToggle={() => tog('cos')} />
        {!col['cos'] && (
          <>
            {Object.keys(cogsByAcctAnnual).sort().map(key => (
              <AnnualRow key={key} label={key} amount={cogsByAcctAnnual[key]} indent={1}
                onDrillDown={() => onDrillDown(key, 'COGS', 0)} />
            ))}
            {directExpenseAccts.map((a) => {
              const amt = expenseAmount(a.accountNumber, a.accountTitle)
              const acctKey = `${a.accountNumber} ${a.accountTitle}`
              return (
                <AnnualRow key={a.accountNumber} label={acctKey} amount={amt} indent={1}
                  onDrillDown={() => onDrillDown(acctKey, 'PAYROLL_EXPENSE_DETAIL', 0, acctKey)} />
              )
            })}
            {Object.keys(cogsByAcctAnnual).length === 0 && totalDirectExpJournal === 0 && sumMonths(monthly, m => m.cogs) === 0 && (
              <AnnualRow label="(No cost of sales recorded)" amount={0} indent={1} />
            )}
          </>
        )}
        <AnnualRow label="Total for Cost of Sales" amount={totalCOGS} indent={0} isTotal bold
          onDrillDown={() => onDrillDown('Cost of Sales', 'COGS', 0)} />

        <AnnualRow label="Gross Profit" amount={grossProfit} isGrandTotal />

        {/* EXPENSES (Indirect) */}
        <SectionHeader label="Expenses" collapsed={!!col['exp']} onToggle={() => tog('exp')} />
        {!col['exp'] && (
          <>
            {indirectExpenseAccts.map((a) => {
              const amt = expenseAmount(a.accountNumber, a.accountTitle)
              const acctKey = `${a.accountNumber} ${a.accountTitle}`
              const lc = a.accountTitle.toLowerCase()
              const drillCat = (lc.includes('professional fee') || lc.includes('consultant'))
                ? 'PAYROLL_EXPENSE_DETAIL'
                : (lc.includes('salari') || lc.includes('wages') || lc.includes('salary'))
                ? 'EMPLOYEE_PAYROLL_EXPENSE_DETAIL'
                : 'JOURNAL_ACCOUNT'
              return (
                <AnnualRow key={a.accountNumber} label={acctKey} amount={amt} indent={1}
                  onDrillDown={() => onDrillDown(acctKey, drillCat, 0, acctKey)} />
              )
            })}
            {indirectExpenseAccts.length === 0 && (
              <AnnualRow label="(No expense accounts set up)" amount={0} indent={1} />
            )}
          </>
        )}
        <AnnualRow label="Total for Expenses" amount={totalOpex} indent={0} isTotal bold />

        <AnnualRow label="EBITDA" amount={ebitda} isGrandTotal />

        {/* DEPRECIATION */}
        {totalDepreciation !== 0 && (
          <>
            <SectionHeader label="Depreciation" />
            <AnnualRow label="8070 Depreciation Expense" amount={totalDepreciation} indent={1}
              onDrillDown={() => onDrillDown('8070 Depreciation Expense', 'DEPRECIATION_EXPENSE', 0)} />
          </>
        )}

        {/* INTEREST */}
        {totalInterest !== 0 && (
          <>
            <SectionHeader label="Interest" />
            {interestAccts.map((a) => {
              const acctKey = `${a.accountNumber} ${a.accountTitle}`
              return (
                <AnnualRow key={a.accountNumber} label={acctKey} amount={expenseAmount(a.accountNumber, a.accountTitle)} indent={1}
                  onDrillDown={() => onDrillDown(acctKey, 'JOURNAL_ACCOUNT', 0, acctKey)} />
              )
            })}
          </>
        )}

        {/* NON-OPERATING EXPENSES */}
        {totalNonOperating !== 0 && (
          <>
            <SectionHeader label="Non-Operating Expenses" collapsed={!!col['nonop']} onToggle={() => tog('nonop')} />
            {!col['nonop'] && nonOpExpenseAccts.map((a) => {
              const acctKey = `${a.accountNumber} ${a.accountTitle}`
              const amt = expenseAmount(a.accountNumber, a.accountTitle)
              return amt !== 0 ? (
                <AnnualRow key={a.accountNumber} label={acctKey} amount={amt} indent={1}
                  onDrillDown={() => onDrillDown(acctKey, 'JOURNAL_ACCOUNT', 0, acctKey)} />
              ) : null
            })}
          </>
        )}

        <AnnualRow label="EBT" amount={ebt} isGrandTotal />
        <AnnualRow label="Provision for Income Tax (20%)" amount={taxProvision} indent={1} negative={taxProvision > 0} />
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
      <SectionHeader label="7000 Gross Revenue" collapsed={!!col['gr']} onToggle={() => tog('gr')} />
      {!col['gr'] && (
        <>
          {grossRevenueAccts.map((a) => {
            const acctKey = `${a.accountNumber} ${a.accountTitle}`
            const isProductIncome = productIncomeAcctKey === acctKey && productSubtypeAnnual.length > 0
            const rcvArr = getMonthlyArray(monthly, (m) => (m.receivableByAccount || {})[acctKey] || 0)
            const totArr = acctMonthly(a.accountNumber, a.accountTitle)
            const rcvTotal = rcvArr.reduce((s, v) => s + v, 0)
            const acctTotal = acctAmount(a.accountNumber, a.accountTitle)
            return (
              <Fragment key={a.accountNumber}>
                <MonthlyRow label={acctKey}
                  values={totArr}
                  total={acctTotal} indent={1}
                  onClickCell={(m) => onDrillDown(a.accountTitle, 'REVENUE', m ?? 0, acctKey)}
                  expandable={rcvTotal > 0 || isProductIncome} expanded={!!expRev[a.accountNumber]} onToggleExpand={() => togRev(a.accountNumber)} />
                {expRev[a.accountNumber] && rcvTotal > 0 && (<>
                  <MonthlyRow key={`${a.accountNumber}-cash`} label="Cash Sales" values={totArr.map((v, i) => v - (rcvArr[i] || 0))} total={acctTotal - rcvTotal} indent={2} muted pctOfParent={pctOf(acctTotal - rcvTotal, acctTotal)}
                    onClickCell={(m) => onDrillDown('Cash Sales', 'REVENUE', m ?? 0, acctKey, { portion: 'CASH' })} />
                  <MonthlyRow key={`${a.accountNumber}-rcv`} label="Receivables Sales (HMO/GL)" values={rcvArr} total={rcvTotal} indent={2} muted pctOfParent={pctOf(rcvTotal, acctTotal)}
                    onClickCell={(m) => onDrillDown('Receivables Sales (HMO/GL)', 'REVENUE', m ?? 0, acctKey, { portion: 'RECEIVABLE' })} />
                </>)}
                {expRev[a.accountNumber] && isProductIncome && productSubtypeAnnual.map(([label, amt]) => (
                  <MonthlyRow key={`${a.accountNumber}-${label}`} label={label}
                    values={subtypeMonthly(label)} total={amt} indent={2} muted pctOfParent={pctOf(amt, acctTotal)}
                    onClickCell={(m) => onDrillDown(label, 'REVENUE', m ?? 0, acctKey, { subtype: label })} />
                ))}
              </Fragment>
            )
          })}
          {unmatchedRevenueKeys.map((key) => {
            const total = sumMonths(monthly, (m) => (m.revenueByAccount || {})[key] || 0)
            return total > 0 ? (
              <MonthlyRow key={key} label={key}
                values={getMonthlyArray(monthly, (m) => (m.revenueByAccount || {})[key] || 0)}
                total={total} indent={1}
                onClickCell={(m) => onDrillDown(key, 'REVENUE', m ?? 0, key)} />
            ) : null
          })}
        </>
      )}
      <MonthlyRow label="Total for 7000 Gross Revenue"
        values={getMonthlyArray(monthly, (m) => grossRevenueForMonth(m))}
        total={effectiveGrossRevenue} bold isTotal
        onClickCell={(m) => onDrillDown('Total Gross Revenue', 'REVENUE', m ?? 0)} />

      {/* Med-rep view stops at Total Gross Revenue — everything below is hidden for them */}
      {!revenueOnly && (<>
      {/* 7002 DISCOUNTS AND REFUNDS */}
      <SectionHeader label="7002 Discounts and Refunds" collapsed={!!col['disc']} onToggle={() => tog('disc')} />
      {!col['disc'] && discountAccts.map((a) => {
        const acctKey = `${a.accountNumber} ${a.accountTitle}`
        const isDeductionSourced = Object.keys(deductionAccountTotals).includes(acctKey)
        return (
          <MonthlyRow key={a.accountNumber} label={`${a.accountNumber} ${a.accountTitle}`}
            values={acctMonthly(a.accountNumber, a.accountTitle).map(v => -v)}
            total={-acctAmount(a.accountNumber, a.accountTitle)} indent={1} negative
            onClickCell={(m) => onDrillDown(a.accountTitle, isDeductionSourced ? 'DEDUCTION' : 'REVENUE', m ?? 0, isDeductionSourced ? a.accountTitle : acctKey)} />
        )
      })}
      <MonthlyRow label="Total for 7002 Discounts and Refunds"
        values={getMonthlyArray(monthly, (m) => -discountsForMonth(m))}
        total={-totalDiscounts} bold isTotal negative />

      <MonthlyRow label="Total for Net Sales"
        values={getMonthlyArray(monthly, (m) => netSalesForMonth(m))}
        total={netSales} isGrandTotal />

      {/* COST OF SALES */}
      {(() => {
        const cogsByAcct: Record<string, number> = {}
        for (let m = 1; m <= 12; m++) {
          for (const [key, val] of Object.entries(monthly[m]?.cogsByAccount || {})) {
            cogsByAcct[key] = (cogsByAcct[key] || 0) + val
          }
        }
        const acctKeys = Object.keys(cogsByAcct).sort()
        return (
          <>
            <SectionHeader label="Cost of Sales" collapsed={!!col['cos']} onToggle={() => tog('cos')} />
            {!col['cos'] && (
              <>
                {acctKeys.map(key => (
                  <MonthlyRow key={key} label={key}
                    values={getMonthlyArray(monthly, (m) => (m.cogsByAccount || {})[key] || 0)}
                    total={cogsByAcct[key]} indent={1}
                    onClickCell={(m) => onDrillDown(key, 'COGS', m ?? 0)} />
                ))}
                {directExpenseAccts.map((a) => {
                  const acctKey = `${a.accountNumber} ${a.accountTitle}`
                  const amt = expenseAmount(a.accountNumber, a.accountTitle)
                  return (
                    <MonthlyRow key={a.accountNumber} label={acctKey}
                      values={getMonthlyArray(monthly, (m) => (m.expenseByAccount || {})[acctKey] || 0)}
                      total={amt} indent={1}
                      onClickCell={(m) => onDrillDown(acctKey, 'PAYROLL_EXPENSE_DETAIL', m ?? 0, acctKey)} />
                  )
                })}
              </>
            )}
          </>
        )
      })()}
      <MonthlyRow label="Total for Cost of Sales"
        values={getMonthlyArray(monthly, (m) => m.cogs + directExpForMonth(m))} total={totalCOGS} bold isTotal
        onClickCell={(m) => onDrillDown('Cost of Sales', 'COGS', m ?? 0)} />

      <MonthlyRow label="Gross Profit"
        values={getMonthlyArray(monthly, (m) => netSalesForMonth(m) - m.cogs - directExpForMonth(m))}
        total={grossProfit} isGrandTotal />

      {/* EXPENSES */}
      <SectionHeader label="Expenses" collapsed={!!col['exp']} onToggle={() => tog('exp')} />
      {!col['exp'] && indirectExpenseAccts.map((a) => {
        const acctKey = `${a.accountNumber} ${a.accountTitle}`
        const amt = expenseAmount(a.accountNumber, a.accountTitle)
        const lc = a.accountTitle.toLowerCase()
        const drillCat = (lc.includes('professional fee') || lc.includes('consultant'))
          ? 'PAYROLL_EXPENSE_DETAIL'
          : (lc.includes('salari') || lc.includes('wages') || lc.includes('salary'))
          ? 'EMPLOYEE_PAYROLL_EXPENSE_DETAIL'
          : 'JOURNAL_ACCOUNT'
        return (
          <MonthlyRow key={a.accountNumber} label={acctKey}
            values={getMonthlyArray(monthly, (m) => (m.expenseByAccount || {})[acctKey] || 0)}
            total={amt} indent={1}
            onClickCell={(m) => onDrillDown(acctKey, drillCat, m ?? 0, acctKey)} />
        )
      })}
      <MonthlyRow label="Total for Expenses"
        values={getMonthlyArray(monthly, (m) => indirectExpForMonth(m))}
        total={totalOpex} bold isTotal />

      <MonthlyRow label="EBITDA"
        values={getMonthlyArray(monthly, (m) => netSalesForMonth(m) - m.cogs - directExpForMonth(m) - indirectExpForMonth(m))}
        total={ebitda} isGrandTotal />

      {/* DEPRECIATION */}
      {totalDepreciation !== 0 && (
        <>
          <SectionHeader label="Depreciation" />
          <MonthlyRow label="8070 Depreciation Expense"
            values={Array.from({ length: 12 }, (_, i) => depForMonthIdx(i))}
            total={totalDepreciation} indent={1}
            onClickCell={(m) => onDrillDown('8070 Depreciation Expense', 'DEPRECIATION_EXPENSE', m ?? 0)} />
        </>
      )}

      {/* INTEREST */}
      {totalInterest !== 0 && (
        <>
          <SectionHeader label="Interest" />
          {interestAccts.map((a) => {
            const acctKey = `${a.accountNumber} ${a.accountTitle}`
            return (
              <MonthlyRow key={a.accountNumber} label={acctKey}
                values={getMonthlyArray(monthly, (m) => (m.expenseByAccount || {})[acctKey] || 0)}
                total={expenseAmount(a.accountNumber, a.accountTitle)} indent={1}
                onClickCell={(m) => onDrillDown(acctKey, 'JOURNAL_ACCOUNT', m ?? 0, acctKey)} />
            )
          })}
        </>
      )}

      {/* NON-OPERATING */}
      {totalNonOperating !== 0 && (
        <>
          <SectionHeader label="Non-Operating Expenses" collapsed={!!col['nonop']} onToggle={() => tog('nonop')} />
          {!col['nonop'] && nonOpExpenseAccts.map((a) => {
            const acctKey = `${a.accountNumber} ${a.accountTitle}`
            const amt = expenseAmount(a.accountNumber, a.accountTitle)
            return amt !== 0 ? (
              <MonthlyRow key={a.accountNumber} label={acctKey}
                values={getMonthlyArray(monthly, (m) => (m.expenseByAccount || {})[acctKey] || 0)}
                total={amt} indent={1}
                onClickCell={(m) => onDrillDown(acctKey, 'JOURNAL_ACCOUNT', m ?? 0, acctKey)} />
            ) : null
          })}
        </>
      )}

      <MonthlyRow label="EBT"
        values={Array.from({ length: 12 }, (_, i) => ebtForMonthIdx(i))}
        total={ebt} isGrandTotal />
      <MonthlyRow label="Provision for Income Tax (20%)"
        values={Array.from({ length: 12 }, (_, i) => ebtForMonthIdx(i) * INCOME_TAX_RATE)}
        total={taxProvision} indent={1} />
      <MonthlyRow label="NET INCOME"
        values={Array.from({ length: 12 }, (_, i) => ebtForMonthIdx(i) * (1 - INCOME_TAX_RATE))}
        total={netIncome} isGrandTotal />
      </>)}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   CASH FLOW STATEMENT
   ═══════════════════════════════════════════════════════════════ */

function CashFlowStatement({ data, viewMode, onDrillDown }: { data: ReportData; viewMode: ViewMode; onDrillDown: OnDrillDown }) {
  // Indirect method — reuses the SAME Net Income (Income Statement) and the SAME
  // Balance-Sheet working-capital / PPE / equity figures, so all three statements
  // tie out. Ending Cash equals the Balance-Sheet cash balance.
  const cf = computeCashFlowTotals(data as unknown as Parameters<typeof computeCashFlowTotals>[0])
  const netOperating = cf.netCashFromOperations + cf.unreconciled // fold the derivation residual into ops

  const body = (
    <div>
      {/* OPERATING ACTIVITIES — indirect method */}
      <SectionHeader label="Cash Flows from Operating Activities" />
      <AnnualRow label="Net Income" amount={cf.netIncome} indent={1} bold />

      <SubSectionHeader label="Adjustments for non-cash items" />
      <AnnualRow label="Add: Depreciation" amount={cf.depreciation} indent={2}
        onDrillDown={() => onDrillDown('8070 Depreciation Expense', 'DEPRECIATION_EXPENSE', 0)} />
      {cf.taxProvision !== 0 && (
        <AnnualRow label="Add: Provision for Income Tax (accrued, non-cash)" amount={cf.taxProvision} indent={2} />
      )}

      <SubSectionHeader label="Changes in Working Capital" />
      <AnnualRow label="(Increase) / decrease in Accounts Receivable" amount={cf.arChange} indent={2} />
      <AnnualRow label="(Increase) / decrease in Inventory" amount={cf.inventoryChange} indent={2} />
      <AnnualRow label="(Increase) / decrease in Other Current Assets (CWT, Input VAT, prepaid)" amount={cf.otherCurrentAssetChange} indent={2} />
      <AnnualRow label="Increase / (decrease) in Payables" amount={cf.payablesChange} indent={2} />
      <AnnualRow label="Increase / (decrease) in Unearned Revenue" amount={cf.unearnedChange} indent={2} />
      {Math.abs(cf.unreconciled) >= 0.01 && (
        <AnnualRow label="Other operating adjustments (net)" amount={cf.unreconciled} indent={2} />
      )}
      <AnnualRow label="Net Cash from Operating Activities" amount={netOperating} indent={0} isTotal bold />

      <div className="h-3" />

      {/* INVESTING ACTIVITIES */}
      <SectionHeader label="Cash Flows from Investing Activities" />
      {cf.ppePurchases > 0 ? (
        <AnnualRow label="Purchase of Property, Plant & Equipment" amount={-cf.ppePurchases} indent={1} />
      ) : (
        <AnnualRow label="(No investing activities recorded)" amount={0} indent={1} />
      )}
      <AnnualRow label="Net Cash from Investing Activities" amount={cf.netCashFromInvesting} indent={0} isTotal bold />

      <div className="h-3" />

      {/* FINANCING ACTIVITIES */}
      <SectionHeader label="Cash Flows from Financing Activities" />
      {cf.equityFinancing === 0 && cf.financingLiabChange === 0 && (
        <AnnualRow label="(No financing activities recorded)" amount={0} indent={1} />
      )}
      {cf.equityFinancing !== 0 && (
        <AnnualRow label="Share issuance, buyback & dividends (net)" amount={cf.equityFinancing} indent={1} />
      )}
      {cf.financingLiabChange !== 0 && (
        <AnnualRow label="Shareholder advances, bonds & loans (net)" amount={cf.financingLiabChange} indent={1} />
      )}
      <AnnualRow label="Net Cash from Financing Activities" amount={cf.netCashFromFinancing} indent={0} isTotal bold />

      <div className="h-3" />

      <AnnualRow label="NET CHANGE IN CASH" amount={cf.actualNetChange} isGrandTotal />
      <div className="h-2" />
      <AnnualRow label="Beginning Cash Balance" amount={cf.beginningCash} indent={0} />
      <AnnualRow label="ENDING CASH BALANCE" amount={cf.endingCash} isGrandTotal
        onDrillDown={() => onDrillDown('Ending Cash Balance', 'CASH_BALANCE', 0)} />

      <div className="px-4 pt-3 text-xs italic" style={{ color: 'var(--mid-gray)' }}>
        Indirect method: starts from Net Income (Income Statement), adds back non-cash depreciation, then
        reflects the period changes in Balance-Sheet working capital, investing (PPE) and financing (equity)
        accounts. Ending Cash ties to the Balance-Sheet cash balance.
      </div>
    </div>
  )

  if (viewMode === 'monthly') {
    return (
      <div>
        <p className="text-sm italic px-4 py-3" style={{ color: 'var(--mid-gray)' }}>
          Note: The indirect-method Cash Flow Statement is a period statement. Monthly view shows the same annual figures.
        </p>
        {body}
      </div>
    )
  }
  return body
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function ReportsPage() {
  const { data: session } = useSession()
  const scope = userBranchScope((session?.user as { branch?: string })?.branch)
  const [activeTab, setActiveTab] = useState<ReportTab>('income-statement')
  const [year, setYear] = useState(new Date().getFullYear())
  const [viewMode, setViewMode] = useState<ViewMode>('annual')
  const [branch, setBranch] = useState(scope.short || 'ALL')
  useEffect(() => { if (scope.short && branch !== scope.short) setBranch(scope.short) }, [scope.short]) // eslint-disable-line react-hooks/exhaustive-deps
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ReportData | null>(null)
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null)
  // 'standard' = current derivation engine; 'ledger' = v2 beta (one balanced
  // dataset, statements interconnected). Only applies to derived years (2026+).
  const [engine, setEngine] = useState<'standard' | 'ledger'>('standard')

  const handleDrillDown: OnDrillDown = (label, category, month, accountKey, opts) => {
    setDrillDown({ label, category, month, accountKey, subtype: opts?.subtype, portion: opts?.portion })
  }

  // Med-rep: read-only, Income Statement / monthly / gross-revenue only, no drill-down. Branch
  // filter still applies. These "effective" values override the (hidden) tab/view controls.
  const role = (session?.user as { role?: string })?.role || ''
  const isMedrep = role === 'MEDREP'
  const effTab: ReportTab = isMedrep ? 'income-statement' : activeTab
  const effView: ViewMode = isMedrep ? 'monthly' : viewMode
  const effDrill: OnDrillDown = isMedrep ? () => {} : handleDrillDown

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

  const downloadRowsAsCSV = (rows: string[][]) => {
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeTab}-${year}-${branch}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadCSV = () => {
    if (!data) return
    if (data.historical) {
      const h = data.historical
      const stmt = activeTab === 'income-statement' ? h.incomeStatement
        : activeTab === 'balance-sheet' ? h.balanceSheet
        : h.cashFlow
      if (!stmt) return
      const withMonths = activeTab !== 'balance-sheet' && viewMode === 'monthly'
      const rows: string[][] = []
      const title = 'title' in stmt ? stmt.title : ''
      rows.push([`${title} — ${year}`, ...(withMonths ? FULL_MONTHS : []), activeTab === 'balance-sheet' ? 'Amount (PHP)' : 'FY Total'])
      for (const r of stmt.rows) {
        if (r.kind === 'header') {
          rows.push([r.label, ...(withMonths ? Array(12).fill('') : []), r.total !== null ? r.total.toFixed(2) : ''])
        } else {
          const label = r.kind === 'line' ? `  ${r.label}` : r.label
          const months = withMonths ? (r.monthly ?? Array(12).fill(0)).map((v: number) => v.toFixed(2)) : []
          rows.push([label, ...months, r.total !== null ? r.total.toFixed(2) : ''])
        }
      }
      downloadRowsAsCSV(rows)
      return
    }
    const t = computeIncomeStatementTotals(data)
    const { monthly, accounts } = data
    const allRevSubs = accounts.REVENUE ? Object.values(accounts.REVENUE).flat() : []
    const grossRevAccts = allRevSubs.filter(a => a.normalBalance !== 'DEBIT')
    const discAccts = allRevSubs.filter(a => a.normalBalance === 'DEBIT')
    const dirExpAccts = accounts.EXPENSE?.DIRECT_EXPENSES || []
    const indirExpAccts = accounts.EXPENSE?.INDIRECT_EXPENSES || []

    const acctAmt = (n: string, t: string) => sumMonths(monthly, m => (m.revenueByAccount || {})[`${n} ${t}`] || 0)
    const expAmt = (n: string, t: string) => sumMonths(monthly, m => (m.expenseByAccount || {})[`${n} ${t}`] || 0)

    const totalGross = grossRevAccts.reduce((s, a) => s + acctAmt(a.accountNumber, a.accountTitle), 0)
    const totalDisc = discAccts.reduce((s, a) => s + acctAmt(a.accountNumber, a.accountTitle), 0)
    const ns = totalGross - totalDisc
    const totalDirExp = dirExpAccts.reduce((s, a) => s + expAmt(a.accountNumber, a.accountTitle), 0)
    const tCOGS = sumMonths(monthly, m => m.cogs) + totalDirExp
    const gp = ns - tCOGS
    const tOpex = indirExpAccts.reduce((s, a) => s + expAmt(a.accountNumber, a.accountTitle), 0)
    const ebda = gp - tOpex
    const branchLbl = branch === 'ALL' ? 'All Branches' : BRANCHES.find(b => b.value === branch)?.label || branch

    const rows: string[][] = []

    // Per-month helpers for CSV
    const mGross = (m: MonthData) => {
      const r = grossRevAccts.reduce((s, a) => s + ((m.revenueByAccount || {})[`${a.accountNumber} ${a.accountTitle}`] || 0), 0)
      const u = Object.keys(m.revenueByAccount || {}).filter(k =>
        !grossRevAccts.some(a => `${a.accountNumber} ${a.accountTitle}` === k) &&
        !discAccts.some(a => `${a.accountNumber} ${a.accountTitle}` === k)
      ).reduce((s, k) => s + ((m.revenueByAccount || {})[k] || 0), 0)
      return (r + u) > 0 ? (r + u) : (m.serviceRevenue + m.productRevenue)
    }
    const mDisc = (m: MonthData) => discAccts.reduce((s, a) => s + ((m.revenueByAccount || {})[`${a.accountNumber} ${a.accountTitle}`] || 0), 0)
    const mDirExp = (m: MonthData) => dirExpAccts.reduce((s, a) => s + ((m.expenseByAccount || {})[`${a.accountNumber} ${a.accountTitle}`] || 0), 0)
    const mIndirExp = (m: MonthData) => indirExpAccts.reduce((s, a) => s + ((m.expenseByAccount || {})[`${a.accountNumber} ${a.accountTitle}`] || 0), 0)

    if (activeTab === 'income-statement') {
      if (viewMode === 'annual') {
        rows.push([`Income Statement — ${year} — ${branchLbl}`, 'Amount (PHP)'])
        rows.push(['7000 GROSS REVENUE', ''])
        grossRevAccts.forEach(a => {
          const amt = acctAmt(a.accountNumber, a.accountTitle)
          rows.push([`  ${a.accountNumber} ${a.accountTitle}`, amt.toFixed(2)])
        })
        rows.push(['Total for 7000 Gross Revenue', totalGross.toFixed(2)])
        rows.push(['7002 DISCOUNTS AND REFUNDS', ''])
        discAccts.forEach(a => {
          const amt = acctAmt(a.accountNumber, a.accountTitle)
          rows.push([`  ${a.accountNumber} ${a.accountTitle}`, (-amt).toFixed(2)])
        })
        rows.push(['Total for 7002 Discounts and Refunds', (-totalDisc).toFixed(2)])
        rows.push(['TOTAL FOR NET SALES', ns.toFixed(2)])
        rows.push(['COST OF SALES', ''])
        // COGS by account
        const cogsByAcctCSV: Record<string, number> = {}
        for (let m = 1; m <= 12; m++) {
          for (const [key, val] of Object.entries(monthly[m]?.cogsByAccount || {})) {
            cogsByAcctCSV[key] = (cogsByAcctCSV[key] || 0) + val
          }
        }
        Object.keys(cogsByAcctCSV).sort().forEach(key => rows.push([`  ${key}`, cogsByAcctCSV[key].toFixed(2)]))
        dirExpAccts.forEach(a => {
          const amt = expAmt(a.accountNumber, a.accountTitle)
          if (amt) rows.push([`  ${a.accountNumber} ${a.accountTitle}`, amt.toFixed(2)])
        })
        rows.push(['Total for Cost of Sales', tCOGS.toFixed(2)])
        rows.push(['GROSS PROFIT', gp.toFixed(2)])
        rows.push(['EXPENSES', ''])
        indirExpAccts.forEach(a => {
          const amt = expAmt(a.accountNumber, a.accountTitle)
          rows.push([`  ${a.accountNumber} ${a.accountTitle}`, amt.toFixed(2)])
        })
        rows.push(['Total for Expenses', tOpex.toFixed(2)])
        rows.push(['EBITDA', ebda.toFixed(2)])
        rows.push(['Depreciation', t.totalDepreciation.toFixed(2)])
        rows.push(['Interest', t.totalInterest.toFixed(2)])
        if (t.totalNonOperating !== 0) rows.push(['Non-Operating Expenses', t.totalNonOperating.toFixed(2)])
        rows.push(['EBT', t.ebt.toFixed(2)])
        rows.push(['Provision for Income Tax (20%)', t.taxProvision.toFixed(2)])
        rows.push(['NET INCOME', t.netIncome.toFixed(2)])
      } else {
        const mv = (getter: (m: MonthData) => number) =>
          Array.from({ length: 12 }, (_, i) => getter(monthly[i + 1]).toFixed(2))
        const mAcctRev = (n: string, t: string) =>
          Array.from({ length: 12 }, (_, i) => ((monthly[i + 1].revenueByAccount || {})[`${n} ${t}`] || 0).toFixed(2))
        const mAcctExp = (n: string, t: string) =>
          Array.from({ length: 12 }, (_, i) => ((monthly[i + 1].expenseByAccount || {})[`${n} ${t}`] || 0).toFixed(2))

        rows.push([`Income Statement — ${year} — ${branchLbl}`, ...FULL_MONTHS, 'Total'])
        // Gross Revenue section
        rows.push(['7000 GROSS REVENUE', ...Array(12).fill(''), ''])
        grossRevAccts.forEach(a => {
          const mVals = mAcctRev(a.accountNumber, a.accountTitle)
          const tot = mVals.reduce((s, v) => s + parseFloat(v), 0)
          rows.push([`  ${a.accountNumber} ${a.accountTitle}`, ...mVals, tot.toFixed(2)])
        })
        rows.push(['Total for 7000 Gross Revenue', ...mv(mGross), totalGross.toFixed(2)])
        // Discounts section
        rows.push(['7002 DISCOUNTS AND REFUNDS', ...Array(12).fill(''), ''])
        discAccts.forEach(a => {
          const mVals = mAcctRev(a.accountNumber, a.accountTitle).map(v => (-parseFloat(v)).toFixed(2))
          const tot = mVals.reduce((s, v) => s + parseFloat(v), 0)
          rows.push([`  ${a.accountNumber} ${a.accountTitle}`, ...mVals, tot.toFixed(2)])
        })
        rows.push(['Total for 7002 Discounts and Refunds', ...mv(m => -mDisc(m)), (-totalDisc).toFixed(2)])
        rows.push(['TOTAL FOR NET SALES', ...mv(m => mGross(m) - mDisc(m)), ns.toFixed(2)])
        // Cost of Sales section
        rows.push(['COST OF SALES', ...Array(12).fill(''), ''])
        const cogsByAcctCSV: Record<string, number> = {}
        for (let m = 1; m <= 12; m++) {
          for (const [key, val] of Object.entries(monthly[m]?.cogsByAccount || {})) {
            cogsByAcctCSV[key] = (cogsByAcctCSV[key] || 0) + val
          }
        }
        Object.keys(cogsByAcctCSV).sort().forEach(key => {
          const mVals = Array.from({ length: 12 }, (_, i) => ((monthly[i + 1].cogsByAccount || {})[key] || 0).toFixed(2))
          rows.push([`  ${key}`, ...mVals, cogsByAcctCSV[key].toFixed(2)])
        })
        dirExpAccts.forEach(a => {
          const mVals = mAcctExp(a.accountNumber, a.accountTitle)
          const tot = mVals.reduce((s, v) => s + parseFloat(v), 0)
          if (tot > 0) rows.push([`  ${a.accountNumber} ${a.accountTitle}`, ...mVals, tot.toFixed(2)])
        })
        rows.push(['Total for Cost of Sales', ...mv(m => m.cogs + mDirExp(m)), tCOGS.toFixed(2)])
        rows.push(['GROSS PROFIT', ...mv(m => mGross(m) - mDisc(m) - m.cogs - mDirExp(m)), gp.toFixed(2)])
        // Expenses section
        rows.push(['EXPENSES', ...Array(12).fill(''), ''])
        indirExpAccts.forEach(a => {
          const mVals = mAcctExp(a.accountNumber, a.accountTitle)
          const tot = mVals.reduce((s, v) => s + parseFloat(v), 0)
          rows.push([`  ${a.accountNumber} ${a.accountTitle}`, ...mVals, tot.toFixed(2)])
        })
        rows.push(['Total for Expenses', ...mv(mIndirExp), tOpex.toFixed(2)])
        rows.push(['EBITDA', ...mv(m => mGross(m) - mDisc(m) - m.cogs - mDirExp(m) - mIndirExp(m)), ebda.toFixed(2)])
        rows.push(['EBT', ...Array(12).fill(''), t.ebt.toFixed(2)])
        rows.push(['Provision for Income Tax (20%)', ...Array(12).fill(''), t.taxProvision.toFixed(2)])
        rows.push(['NET INCOME', ...Array(12).fill(''), t.netIncome.toFixed(2)])
      }
    } else {
      rows.push([`${reportTitle} — ${year} — ${branchLbl}`])
      rows.push(['Note: For Balance Sheet and Cash Flow, use Print (PDF) for a formatted version.'])
    }

    downloadRowsAsCSV(rows)
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
        <div className="flex gap-2" style={{ display: isMedrep ? 'none' : undefined }}>
          <button
            onClick={handleDownloadCSV}
            disabled={!data}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
            style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}
          >
            <Download size={16} />
            CSV
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}
          >
            <Printer size={16} />
            PDF
          </button>
        </div>
      </div>

      {/* ── Tab Navigation ─────────────────────────────────────── */}
      {!isMedrep && (
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
      )}

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
        {!isMedrep && (
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
        )}

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
              {(scope.short ? BRANCHES.filter(b => b.value === scope.short) : BRANCHES).map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
          </div>
        </div>

        {/* Engine (derived years only) */}
        {!isMedrep && year >= 2026 && (
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
            {([['standard', 'Standard'], ['ledger', 'Ledger (beta)']] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setEngine(mode)}
                title={mode === 'ledger' ? 'Derive all three statements from one balanced double-entry dataset (A = L + E guaranteed)' : 'Current derivation engine'}
                className="px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  background: engine === mode ? 'var(--teal)' : 'white',
                  color: engine === mode ? 'white' : 'var(--charcoal)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
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
        {/* Report header */}
        <div className="px-5 py-4" style={{ borderBottom: '2px solid #e5e7eb' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#111827', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            Sapphire Clinics East Incorporated
          </p>
          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginTop: '2px' }}>
            {reportTitle}
          </p>
          <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '1px' }}>
            {reportSubtitle}{branch !== 'ALL' ? ` · ${branchLabel}` : ''}
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
        {!loading && data?.historical && (
          <HistoricalReport
            hist={data.historical}
            tab={effTab}
            monthly={effView === 'monthly'}
            revenueOnly={isMedrep}
          />
        )}
        {!loading && !data?.historical && engine === 'ledger' && year >= 2026 && !isMedrep && (
          <LedgerStatements year={year} branch={branch} tab={effTab} monthly={effView === 'monthly'} />
        )}
        {!loading && data && !data.historical && (engine === 'standard' || year < 2026 || isMedrep) && (
          <div className="py-2">
            {effTab === 'balance-sheet' && (
              <BalanceSheet data={data} viewMode={effView} onDrillDown={effDrill} />
            )}
            {effTab === 'income-statement' && (
              <IncomeStatement data={data} viewMode={effView} onDrillDown={effDrill} revenueOnly={isMedrep} />
            )}
            {effTab === 'cash-flow' && (
              <CashFlowStatement data={data} viewMode={effView} onDrillDown={effDrill} />
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
          @page { margin: 0.75in; size: ${effView === 'monthly' ? 'landscape' : 'portrait'}; }
        }
      `}</style>
    </div>
  )
}
