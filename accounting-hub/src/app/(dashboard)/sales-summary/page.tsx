'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { userBranchScope, canViewAllBranchesSI } from '@/lib/branch-scope'
import {
  Receipt, Download, Printer, Loader2, Filter, FileText,
  CheckCircle2, XCircle, X, Search,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { downloadXlsx } from '@/lib/export'
import { parseMonitoringRemark } from '@/lib/si-monitoring'
import { applySortFilter, SortFilterHead, type SortCol } from '@/components/SortFilterHead'

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface SalesSummaryRow {
  date: string
  orderId?: string
  orderNumber: number
  patientName: string
  serviceAvailed: string
  quantity: number
  salesInvoiceNumber: string
  grossAmount: number
  netAmount: number
  branch: string
  issuedOfficialInvoice: boolean
  itemIssuedOfficialInvoice?: boolean
  // Pre-hub invoice surfaced from the manual SI monitoring workbook (a
  // SalesInvoiceFlag, not an Order) — rendered without an order number.
  migrated?: boolean
  // HMO / AR collection that was issued a Sales Invoice on payment (no POS order).
  ar?: boolean
}

const BRANCHES = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function today() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// A real .xlsx rather than CSV (Hannah, 2026-10-21): no encoding pitfalls, and
// gross/net land as true numbers Excel can sum. Exports what is on screen —
// the column filters apply.
function downloadExcel(rows: SalesSummaryRow[], filename: string) {
  downloadXlsx(filename.replace(/\.csv$/i, ''), [{
    name: 'Sales Summary',
    headers: ['Date', 'Order #', 'Patient Name', 'Service Availed', 'Qty', 'Sales Invoice No.', 'Gross Amount', 'Net Amount'],
    rows: rows.map(r => [
      r.date,
      r.migrated || r.ar ? '' : r.orderNumber,
      r.patientName,
      r.serviceAvailed,
      r.quantity,
      r.salesInvoiceNumber || '',
      Math.round(r.grossAmount * 100) / 100,
      Math.round(r.netAmount * 100) / 100,
    ]),
  }])
}

/* ─────────────────────────────────────────────
   SUB-COMPONENT: Report Table
───────────────────────────────────────────── */
const REPORT_COLS: SortCol[] = [
  { key: 'date', label: 'Date' },
  { key: 'orderNumber', label: 'Order #' },
  { key: 'patientName', label: 'Patient Name' },
  { key: 'serviceAvailed', label: 'Service Availed' },
  { key: 'quantity', label: 'Qty' },
  { key: 'salesInvoiceNumber', label: 'Sales Invoice No.' },
  { key: 'grossAmount', label: 'Gross Amount' },
  { key: 'netAmount', label: 'Net Amount' },
]
const siDigitsOf = (s: string) => parseInt(String(s).replace(/\D/g, '') || '0', 10)
// Sort accessor — numbers for numeric/date columns so they order correctly.
const reportSortVal = (r: SalesSummaryRow, k: string): string | number => {
  switch (k) {
    case 'date': return new Date(r.date).getTime() || 0
    case 'orderNumber': return r.orderNumber
    case 'quantity': return r.quantity
    case 'salesInvoiceNumber': return siDigitsOf(r.salesInvoiceNumber || '')
    case 'grossAmount': return r.grossAmount
    case 'netAmount': return r.netAmount
    default: return String((r as unknown as Record<string, unknown>)[k] ?? '').toLowerCase()
  }
}
// Filter accessor — the displayed text a user types against.
const reportFilterVal = (r: SalesSummaryRow, k: string): string => {
  switch (k) {
    case 'orderNumber': return r.migrated || r.ar ? '—' : `#${r.orderNumber}`
    case 'grossAmount': return formatCurrency(r.grossAmount)
    case 'netAmount': return formatCurrency(r.netAmount)
    case 'quantity': return String(r.quantity)
    default: return String((r as unknown as Record<string, unknown>)[k] ?? '')
  }
}
const escHtml = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

function ReportTable({
  rows,
  title,
  subtitle,
  printId,
  csvFilename,
  accentClass,
  badgeClass,
  onConvert,
}: {
  rows: SalesSummaryRow[]
  title: string
  subtitle: string
  printId: string
  csvFilename: string
  accentClass: string
  badgeClass: string
  // Report 2 only: open the "Convert to have Sales Invoice" dialog for this row's order.
  onConvert?: (row: SalesSummaryRow) => void
}) {
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const displayRows = applySortFilter(rows, reportSortVal, sortKey, sortDir, filters, reportFilterVal)
  const totalGross = displayRows.reduce((s, r) => s + r.grossAmount, 0)
  const totalNet = displayRows.reduce((s, r) => s + r.netAmount, 0)
  const filtering = Object.values(filters).some(Boolean)

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=1100,height=800')
    if (!w) return
    const head = REPORT_COLS.map((c, i) => `<th class="${i === 4 ? 'center' : i >= 6 ? 'right' : ''}">${c.label}</th>`).join('')
    const body = displayRows.map(r => `<tr>
      <td>${escHtml(r.date)}</td>
      <td class="mono">${r.migrated || r.ar ? '—' : `#${r.orderNumber}`}</td>
      <td>${escHtml(r.patientName)}</td>
      <td>${escHtml(r.serviceAvailed)}</td>
      <td class="center">${r.quantity}</td>
      <td>${r.salesInvoiceNumber ? `<span class="badge">${escHtml(r.salesInvoiceNumber)}</span>` : '—'}</td>
      <td class="right">${formatCurrency(r.grossAmount)}</td>
      <td class="right">${formatCurrency(r.netAmount)}</td>
    </tr>`).join('')
    w.document.write(`
      <html><head><title>${escHtml(title)}</title>
      <style>
        body { font-family: sans-serif; font-size: 12px; padding: 20px; }
        h2 { font-size: 18px; margin-bottom: 4px; }
        p { color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
        td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
        tfoot td { font-weight: bold; background: #f9fafb; border-top: 2px solid #e5e7eb; }
        .right { text-align: right; }
        .center { text-align: center; }
        .mono { font-family: monospace; font-size: 11px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; background: #d1fae5; color: #065f46; }
        @page { size: landscape; margin: 15mm; }
      </style></head><body>
      <h2>${escHtml(title)}</h2>
      <p>${escHtml(subtitle)}</p>
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="6">SUBTOTAL (${displayRows.length} line${displayRows.length !== 1 ? 's' : ''})</td><td class="right">${formatCurrency(totalGross)}</td><td class="right">${formatCurrency(totalNet)}</td></tr></tfoot>
      </table>
      </body></html>
    `)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <div className="mb-10">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${accentClass}`}>{title}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
            {filtering ? `${displayRows.length} of ${rows.length}` : rows.length} line{(filtering ? displayRows.length : rows.length) !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={() => downloadExcel(displayRows, csvFilename)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
          >
            <Download size={13} /> Export Excel
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ background: 'var(--teal)' }}
          >
            <Printer size={13} /> Print / PDF
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border px-6 py-8 text-center text-sm" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          No transactions found for this category.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
            <div id={printId}>
              <table className="w-full text-sm">
                <SortFilterHead
                  cols={REPORT_COLS}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  filters={filters}
                  onToggleSort={toggleSort}
                  onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
                />
                <tbody>
                  {displayRows.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>No rows match the current filters.</td></tr>
                  )}
                  {displayRows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--light-gray)', background: row.migrated ? '#fffbeb' : row.ar ? '#eff6ff' : undefined }} className="hover:bg-gray-50"
                      title={row.migrated ? 'Migrated from the manual SI monitoring workbook (pre-hub invoice — no POS order)' : row.ar ? 'HMO / AR collection issued a Sales Invoice on payment (Accounts Receivable → Record Payment — no POS order)' : undefined}>
                      <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{row.date}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{row.migrated || row.ar ? '—' : `#${row.orderNumber}`}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{row.patientName}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>
                        <span className="flex items-center gap-1">
                          {row.serviceAvailed}
                          {row.itemIssuedOfficialInvoice && (
                            <span title="Service/Product has Official Sales Invoice" className="flex-shrink-0">
                              <FileText size={13} className="text-emerald-600" />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center" style={{ color: 'var(--charcoal)' }}>{row.quantity}</td>
                      <td className="px-4 py-3">
                        {row.salesInvoiceNumber ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badgeClass}`}>
                            {row.salesInvoiceNumber}
                          </span>
                        ) : onConvert && row.orderId && !row.migrated ? (
                          <button
                            onClick={() => onConvert(row)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap print:hidden"
                            style={{ borderColor: '#fbbf24', color: '#92400e', background: '#fffbeb' }}
                            title={`Issue a Sales Invoice to order #${row.orderNumber}`}
                          >
                            Convert to have SI
                          </button>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>
                        {formatCurrency(row.grossAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--deep-teal)' }}>
                        {formatCurrency(row.netAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--off-white)', borderTop: '2px solid var(--light-gray)' }}>
                    <td colSpan={6} className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--charcoal)' }}>
                      SUBTOTAL ({displayRows.length} line{displayRows.length !== 1 ? 's' : ''})
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: 'var(--charcoal)' }}>
                      {formatCurrency(totalGross)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: 'var(--deep-teal)' }}>
                      {formatCurrency(totalNet)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Summary cards */}
          <div className="mt-3 grid grid-cols-3 gap-3 print:hidden">
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>Lines</p>
              <p className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>{displayRows.length}</p>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>Gross Amount</p>
              <p className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(totalGross)}</p>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>Net Amount</p>
              <p className="text-xl font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(totalNet)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   PAGE
───────────────────────────────────────────── */
export default function SalesSummaryPage() {
  const { data: session } = useSession()
  const scope = userBranchScope((session?.user as { branch?: string })?.branch)

  const [branch, setBranch] = useState(scope.enum || 'ALL')
  useEffect(() => { if (scope.enum && branch !== scope.enum) setBranch(scope.enum) }, [scope.enum]) // eslint-disable-line react-hooks/exhaustive-deps
  const [dateFrom, setDateFrom] = useState(firstOfMonth())
  const [dateTo, setDateTo] = useState(today())
  const [showWithInvoice, setShowWithInvoice] = useState(true)
  const [showWithoutInvoice, setShowWithoutInvoice] = useState(true)
  const [loading, setLoading] = useState(false)
  const [allRows, setAllRows] = useState<SalesSummaryRow[]>([])
  const [fetched, setFetched] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'summary' | 'with-si' | 'target'>('summary')
  const role = (session?.user as { role?: string })?.role || ''
  // "Convert to have Sales Invoice" — same roles that may resolve SI flags; viewers only look.
  const canConvert = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK'].includes(role)
  const [convertRow, setConvertRow] = useState<SalesSummaryRow | null>(null)

  const fetchData = useCallback(async () => {
    if (!showWithInvoice && !showWithoutInvoice) {
      setError('Please select at least one report type.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (branch !== 'ALL') params.set('branch', branch)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      // always fetch all; we split client-side

      const res = await fetch(`/api/reports/sales-summary?${params}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load data'); return }
      setAllRows(data.rows || [])
      setFetched(true)
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [branch, dateFrom, dateTo, showWithInvoice, showWithoutInvoice])

  // Permission guard — AFTER all hooks so hook order never changes between renders (fixes React #310).
  const allowed = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
  if (!session?.user || !allowed.includes((session.user as { role?: string }).role || '')) {
    return (
      <div className="p-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
        You do not have permission to view this page.
      </div>
    )
  }

  /* ── Split rows ── */
  const invoicedRows = allRows.filter(r => r.issuedOfficialInvoice)
  const nonInvoicedRows = allRows.filter(r => !r.issuedOfficialInvoice)

  const dateLabel = `${dateFrom} to ${dateTo}`
  const branchLabel = branch !== 'ALL' ? ` · ${BRANCHES.find(b => b.value === branch)?.label || branch}` : ''

  const combinedGross = [
    ...(showWithInvoice ? invoicedRows : []),
    ...(showWithoutInvoice ? nonInvoicedRows : []),
  ].reduce((s, r) => s + r.grossAmount, 0)

  const combinedNet = [
    ...(showWithInvoice ? invoicedRows : []),
    ...(showWithoutInvoice ? nonInvoicedRows : []),
  ].reduce((s, r) => s + r.netAmount, 0)

  const hasData = fetched && (
    (showWithInvoice && invoicedRows.length > 0) ||
    (showWithoutInvoice && nonInvoicedRows.length > 0)
  )
  const showBoth = showWithInvoice && showWithoutInvoice

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--teal)' }}>
            <Receipt size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Sales Summary
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              Transaction-level sales report with invoice tracking
            </p>
          </div>
        </div>
      </div>

      {/* ── Subtabs ── */}
      <div className="flex items-center gap-1 border-b mb-6 print:hidden" style={{ borderColor: 'var(--light-gray)' }}>
        {([['summary', 'Summary'], ['with-si', 'With SI'], ['target', 'Sales Target']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={{ borderColor: view === v ? 'var(--teal)' : 'transparent', color: view === v ? 'var(--teal)' : 'var(--mid-gray)' }}>{label}</button>
        ))}
      </div>

      {view === 'with-si' && <WithSiTab branch={branch !== 'ALL' ? branch : (scope.enum || 'SANDBOX_EAST')} scopeEnum={scope.enum} canViewAll={canViewAllBranchesSI(role)} />}
      {view === 'target' && <SalesTargetTab branch={branch !== 'ALL' ? branch : (scope.enum || 'SANDBOX_EAST')} scopeEnum={scope.enum} canEditTarget={['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER'].includes(role)} />}

      {view === 'summary' && (<>
      {/* ── Filters ── */}
      <div className="rounded-2xl border p-4 mb-6 print:hidden" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} style={{ color: 'var(--mid-gray)' }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch</label>
            <select
              value={branch}
              onChange={e => setBranch(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white"
              style={{ borderColor: 'var(--light-gray)' }}
            >
              {(scope.enum ? BRANCHES.filter(b => b.value === scope.enum) : BRANCHES).map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white"
              style={{ borderColor: 'var(--light-gray)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white"
              style={{ borderColor: 'var(--light-gray)' }}
            />
          </div>
        </div>

        {/* Report type selection */}
        <div className="mb-3">
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--mid-gray)' }}>Include Reports</label>
          <div className="flex flex-wrap gap-3">
            <label
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-colors select-none ${showWithInvoice ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white'}`}
            >
              <input
                type="checkbox"
                checked={showWithInvoice}
                onChange={e => setShowWithInvoice(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <CheckCircle2 size={16} className={showWithInvoice ? 'text-emerald-600' : 'text-gray-300'} />
              <span className={`text-sm font-semibold ${showWithInvoice ? 'text-emerald-800' : 'text-gray-400'}`}>
                With Official Sales Invoice
              </span>
            </label>
            <label
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-colors select-none ${showWithoutInvoice ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'}`}
            >
              <input
                type="checkbox"
                checked={showWithoutInvoice}
                onChange={e => setShowWithoutInvoice(e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              <XCircle size={16} className={showWithoutInvoice ? 'text-amber-500' : 'text-gray-300'} />
              <span className={`text-sm font-semibold ${showWithoutInvoice ? 'text-amber-800' : 'text-gray-400'}`}>
                Without Sales Invoice
              </span>
            </label>
          </div>
          {!showWithInvoice && !showWithoutInvoice && (
            <p className="mt-2 text-xs text-red-500">Please select at least one report type.</p>
          )}
        </div>

        <button
          onClick={fetchData}
          disabled={loading || (!showWithInvoice && !showWithoutInvoice)}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--teal)' }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          {loading ? 'Loading...' : 'Generate Report'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700">{error}</div>
      )}

      {/* ── Results ── */}
      {fetched && (
        <>
          {/* Grand total bar when both reports showing */}
          {showBoth && (
            <div className="flex items-center justify-between rounded-2xl px-5 py-3 mb-5 print:hidden"
              style={{ background: 'var(--charcoal)' }}>
              <span className="text-sm font-semibold text-white">
                Combined Total — {dateLabel}{branchLabel}
              </span>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-white/50">Gross</p>
                  <p className="text-base font-bold text-white">{formatCurrency(combinedGross)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-white/50">Net</p>
                  <p className="text-base font-bold" style={{ color: 'var(--teal)' }}>{formatCurrency(combinedNet)}</p>
                </div>
              </div>
            </div>
          )}

          {!hasData && (
            <div className="text-center py-16 text-sm" style={{ color: 'var(--mid-gray)' }}>
              No transactions found for the selected filters.
            </div>
          )}

          {/* Report 1: With Invoice */}
          {showWithInvoice && (
            <ReportTable
              rows={invoicedRows}
              title="Report 1 — With Official Sales Invoice"
              subtitle={`${dateLabel}${branchLabel}`}
              printId="print-invoiced"
              csvFilename={`sales-with-invoice-${dateFrom}-to-${dateTo}.csv`}
              accentClass="text-emerald-700"
              badgeClass="bg-emerald-50 text-emerald-700"
            />
          )}

          {/* Report 2: Without Invoice */}
          {showWithoutInvoice && (
            <ReportTable
              rows={nonInvoicedRows}
              title="Report 2 — Without Sales Invoice"
              subtitle={`${dateLabel}${branchLabel}`}
              printId="print-non-invoiced"
              csvFilename={`sales-without-invoice-${dateFrom}-to-${dateTo}.csv`}
              accentClass="text-amber-700"
              badgeClass="bg-amber-50 text-amber-700"
              onConvert={canConvert ? setConvertRow : undefined}
            />
          )}
        </>
      )}

      {!fetched && !loading && (
        <div className="text-center py-20" style={{ color: 'var(--mid-gray)' }}>
          <Receipt size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Set your filters, choose report types, and click <strong>Generate Report</strong>.</p>
        </div>
      )}
      </>)}

      {convertRow && (
        <ConvertSiModal
          row={convertRow}
          onClose={() => setConvertRow(null)}
          onSaved={() => { setConvertRow(null); fetchData() }}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   "Convert to have Sales Invoice" — declare an uninvoiced sale on a chosen
   date. Suggests the next number in the branch's SI series (orders + AR
   collections, outlier-proof), overridable when reusing a cancelled number.
   The order's session date and GL are untouched; With SI and the sales
   target attribute the sale to the declared date.
───────────────────────────────────────────── */
function ConvertSiModal({ row, onClose, onSaved }: { row: SalesSummaryRow; onClose: () => void; onSaved: () => void }) {
  const [declaredDate, setDeclaredDate] = useState(today())
  const [siNumber, setSiNumber] = useState('')
  const [suggested, setSuggested] = useState<string | null>(null)
  const [currentMax, setCurrentMax] = useState<string | null>(null)
  const [loadingNext, setLoadingNext] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/reports/with-si/next-number?branch=${encodeURIComponent(row.branch)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.next) { setSiNumber(d.next); setSuggested(d.next); setCurrentMax(d.max || null) }
      })
      .catch(() => {})
      .finally(() => setLoadingNext(false))
  }, [row.branch])

  const save = async () => {
    if (!siNumber.trim()) { setErr('Enter the Sales Invoice number'); return }
    if (!declaredDate) { setErr('Pick the declaration date'); return }
    setBusy(true); setErr('')
    try {
      const r = await fetch(`/api/pos/orders/${row.orderId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'declareSI', salesInvoiceNumber: siNumber.trim(), declaredDate }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Failed to convert'); setBusy(false); return }
      onSaved()
    } catch { setErr('Network error'); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Convert to have Sales Invoice</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
          Order <strong>#{row.orderNumber}</strong> · {row.patientName} · session {row.date}. The Sales Invoice covers the <strong>whole order</strong> (every item line). The session date and the books stay as recorded — the sale is declared in the SI series on the date below.
        </p>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Date of declaration</label>
        <input type="date" value={declaredDate} onChange={e => setDeclaredDate(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Sales Invoice number</label>
        <input value={siNumber} onChange={e => setSiNumber(e.target.value)} placeholder={loadingNext ? 'Finding next number…' : 'e.g. 0042'}
          className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-1" style={{ borderColor: 'var(--light-gray)' }} />
        <p className="text-[11px] mb-4" style={{ color: 'var(--mid-gray)' }}>
          {loadingNext ? 'Looking up the series…'
            : suggested ? <>Auto-filled with the next number in the series{currentMax ? <> (highest in use: <span className="font-mono">{currentMax}</span>)</> : null}. Override it to reuse a cancelled SI number.</>
            : 'Could not look up the series — type the SI number.'}
        </p>

        {err && <p className="text-xs mb-3" style={{ color: '#dc2626' }}>{err}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
          <button onClick={save} disabled={busy || loadingNext} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>
            {busy && <Loader2 size={15} className="animate-spin" />} Declare with SI
          </button>
        </div>
      </div>
    </div>
  )
}

const WITHSI_BRANCHES = [
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface SiRow { id: string; orderNumber: number; siNumber: string; date: string; declaredDate: string | null; src: 'ORDER' | 'AR'; patientName: string; vat: number; nonVat: number; amount: number; orderType: string }
interface FlagInfo { siNumber: string; status: string; remarks: string | null; orderId: string | null; declaredDate?: string | null }
interface Flag { siNumber: string; count?: number; flag: { status: string; remarks: string | null } | null }
interface CrossUse { branch: string; customer: string; amount: number; date: string }
interface CrossRow { siNumber: string; usedBy: CrossUse[]; flag?: { status: string; remarks: string | null } | null }
const BRANCH_SHORT: Record<string, string> = { SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana', AURA_INSTITUTE: 'Aura' }
const usedByLabel = (uses: CrossUse[]) => [...new Set(uses.map(u => BRANCH_SHORT[u.branch] || u.branch))].join(' & ')
interface OrderHit { id: string; orderNumber: number; date: string; patientName: string; services: string; amount: number; payment: string }
const siDigits = (s: string) => parseInt(String(s).replace(/\D/g, '') || '0', 10)

type LeftItem = {
  kind: string; si: string; siN: number; order: SiRow | null; amount: number; remarks: string
  // Parsed from a migrated monitoring flag's remark (see lib/si-monitoring).
  mDate?: string | null; mCustomer?: string | null
  // Declared (SI-book) date stored on the flag row itself (migrated / cancelled / remarks rows).
  mDeclared?: string | null
}
const LEFT_COLS: SortCol[] = [
  { key: 'si', label: 'SI No.' },
  { key: 'date', label: 'Actual Date' },
  { key: 'declared', label: 'Declared Date' },
  { key: 'patient', label: 'Patient / Customer' },
  { key: 'amount', label: 'Amount' },
]
const leftSortVal = (it: LeftItem, k: string): string | number => {
  switch (k) {
    case 'si': return it.siN
    case 'date': return it.order?.date ? (new Date(it.order.date).getTime() || 0) : it.mDate ? (new Date(it.mDate).getTime() || 0) : 0
    case 'declared': { const d = it.order?.declaredDate || it.mDeclared; return d ? (new Date(d).getTime() || 0) : 0 }
    case 'patient': return (it.order?.patientName || it.mCustomer || it.remarks || '').toLowerCase()
    case 'amount': return it.amount
    default: return ''
  }
}
const leftFilterVal = (it: LeftItem, k: string): string => {
  switch (k) {
    case 'si': return it.si
    case 'date': return it.order?.date || it.mDate || ''
    case 'declared': return it.order?.declaredDate || it.mDeclared || ''
    case 'patient': return it.order?.patientName || it.mCustomer || it.remarks || ''
    case 'amount': return it.amount ? peso(it.amount) : ''
    default: return ''
  }
}

/**
 * The manually settable declared (SI-book) date — editable on every row:
 *  • POS orders         → PUT /api/pos/orders/[id] { action: 'setSiDeclaredDate' }
 *  • AR collections     → PATCH /api/reports/with-si { kind: 'AR', id }
 *  • migrated / flagged → PATCH /api/reports/with-si { kind: 'FLAG', branch, siNumber }
 * Clearing the date falls the SI back to its actual date for With-SI attribution.
 */
function DeclaredDateCell({ item, branch, onSaved, readOnly }: { item: LeftItem; branch: string; onSaved: () => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const order = item.order
  const current = order ? order.declaredDate : (item.mDeclared ?? null)
  if (readOnly) {
    return <td className="px-3 py-2 text-xs" style={{ color: current ? 'var(--charcoal)' : 'var(--mid-gray)' }}>{current || '—'}</td>
  }
  const save = async (v: string) => {
    setBusy(true)
    try {
      const r = order && order.src === 'ORDER'
        ? await fetch(`/api/pos/orders/${order.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setSiDeclaredDate', declaredDate: v || null }) })
        : order
          ? await fetch('/api/reports/with-si', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'AR', id: order.id, declaredDate: v || null }) })
          : await fetch('/api/reports/with-si', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'FLAG', branch, siNumber: item.si, declaredDate: v || null }) })
      if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Failed to save the declared date'); return }
      setEditing(false)
      onSaved()
    } finally { setBusy(false) }
  }
  if (editing) {
    return (
      <td className="px-3 py-1.5">
        <input
          type="date" autoFocus value={val} disabled={busy}
          onChange={e => setVal(e.target.value)}
          onBlur={() => save(val)}
          onKeyDown={e => { if (e.key === 'Enter') save(val); if (e.key === 'Escape') setEditing(false) }}
          className="px-1.5 py-1 rounded-lg border text-xs"
          style={{ borderColor: 'var(--teal)' }}
        />
      </td>
    )
  }
  return (
    <td className="px-3 py-2 text-xs">
      <button
        onClick={() => { setVal(current || ''); setEditing(true) }}
        className="underline decoration-dotted underline-offset-2"
        style={{ color: current ? 'var(--charcoal)' : 'var(--mid-gray)' }}
        title="Click to set the declared (SI book) date — clear it to fall back to the actual date">
        {current || 'set'}
      </button>
    </td>
  )
}

function WithSiTab({ branch: initialBranch, scopeEnum, canViewAll }: { branch: string; scopeEnum: string | null; canViewAll: boolean }) {
  const [branch, setBranch] = useState(initialBranch)
  // A branch-locked user (front desk) with the cross-branch view capability may
  // READ other branches here, but may only flag/resolve SIs in their own branch.
  const readOnly = !!scopeEnum && branch !== scopeEnum
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [data, setData] = useState<{ rows: SiRow[]; totals: { vat: number; nonVat: number; count: number }; gaps: Flag[]; gapsTruncated?: number; crossBranch?: CrossRow[]; crossDuplicates?: CrossRow[]; outliers?: SiRow[]; duplicates: Flag[]; flags: FlagInfo[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState('si')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [flagQ, setFlagQ] = useState('')
  // "Generate Excel": the whole book or a date range by actual or declared date,
  // fetched fresh (not the on-screen range) so "All" really is everything.
  const [xlOpen, setXlOpen] = useState(false)
  const [xlScope, setXlScope] = useState<'all' | 'actual' | 'declared'>('all')
  const [xlFrom, setXlFrom] = useState(''); const [xlTo, setXlTo] = useState('')
  const [xlBusy, setXlBusy] = useState(false)
  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch(`/api/reports/with-si?branch=${branch}${from ? `&dateFrom=${from}` : ''}${to ? `&dateTo=${to}` : ''}`); setData(r.ok ? await r.json() : null) }
    catch { setData(null) } finally { setLoading(false) }
  }, [branch, from, to])
  useEffect(() => { load() }, [load])

  const saveFlag = async (siNumber: string, status: string, remarks: string) => {
    await fetch('/api/reports/with-si', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, siNumber, status, remarks }) })
    await load()
  }
  const tagOrder = async (siNumber: string, orderId: string) => {
    const r = await fetch('/api/reports/with-si', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, siNumber, status: 'TAGGED', orderId }) })
    if (!r.ok) { alert((await r.json()).error || 'Failed to tag'); return }
    await load()
  }
  const clearFlag = async (siNumber: string) => { await fetch(`/api/reports/with-si?branch=${branch}&siNumber=${siNumber}`, { method: 'DELETE' }); await load() }

  const flagBySi = new Map((data?.flags || []).map(f => [f.siNumber, f]))
  const tagged = (si: string) => flagBySi.get(si)?.status === 'TAGGED'

  // LEFT — valid SIs (orders) plus items resolved from the right (tagged / cancelled / remarks).
  // Migrated monitoring flags carry date/customer/amount inside their remark — parse it so
  // the columns show real values, and honor the page's date range for dated flags (an
  // undated flag stays visible: hiding it would silently drop a real invoice).
  const leftItems: LeftItem[] = data ? [
    ...data.rows.map(r => ({ kind: tagged(r.siNumber) ? 'tagged' : 'si', si: r.siNumber, siN: siDigits(r.siNumber), order: r as SiRow | null, amount: r.amount, remarks: '' })),
    ...data.flags.filter(f => f.status === 'CANCELLED' || f.status === 'REMARKS').flatMap(f => {
      const info = parseMonitoringRemark(f.remarks)
      const bookDate = f.declaredDate || info?.date
      if (bookDate) {
        if (from && bookDate < from) return []
        if (to && bookDate > to) return []
      }
      return [{
        kind: f.status.toLowerCase(), si: f.siNumber, siN: siDigits(f.siNumber),
        order: null as SiRow | null,
        amount: f.status === 'REMARKS' ? (info?.amount || 0) : 0,
        remarks: f.remarks || '',
        mDate: info?.date ?? null, mCustomer: info?.customer ?? null, mDeclared: f.declaredDate ?? null,
      }]
    }),
  ] : []
  // The undated migrated workbook SIs the Sales Target card discloses: REMARKS
  // rows carrying an amount but no workbook date and no declared date. They
  // can't be placed in any period, so every period sum excludes them — until
  // someone sets a Declared Date on the row, which files it into that month.
  const isUndatedMigrated = (it: LeftItem) => it.kind === 'remarks' && !it.order && !it.mDate && !it.mDeclared && it.amount > 0
  const undated = leftItems.filter(isUndatedMigrated)
  const undatedTotal = undated.reduce((s, it) => s + it.amount, 0)
  const [undatedOnly, setUndatedOnly] = useState(false)
  const displayLeft = applySortFilter(undatedOnly ? undated : leftItems, leftSortVal, sortKey, sortDir, filters, leftFilterVal)
  const leftTotal = displayLeft.reduce((s, it) => s + it.amount, 0)
  const leftFiltering = Object.values(filters).some(Boolean) || undatedOnly

  // RIGHT — still-unresolved flags (missing / duplicate numbers) needing action.
  const rightItems = data ? [
    ...data.gaps.filter(g => !g.flag).map(g => ({ type: 'gap' as const, siNumber: g.siNumber, count: 0 })),
    ...data.duplicates.filter(d => !d.flag).map(d => ({ type: 'dup' as const, siNumber: d.siNumber, count: d.count || 0 })),
  ].sort((a, b) => siDigits(a.siNumber) - siDigits(b.siNumber)) : []
  // Search within the flagged list: by SI number (raw or digits-only) or by kind ("missing"/"duplicate").
  const flagQNorm = flagQ.trim().toLowerCase()
  const flagQDigits = flagQNorm.replace(/\D/g, '')
  const displayRight = flagQNorm ? rightItems.filter(it =>
    it.siNumber.toLowerCase().includes(flagQNorm)
    || (it.type === 'gap' ? 'missing' : 'duplicate').startsWith(flagQNorm)
    || (flagQDigits !== '' && String(siDigits(it.siNumber)).includes(flagQDigits))
  ) : rightItems
  const rightTotal = data ? displayRight.reduce((s, it) => it.type === 'dup'
    ? s + data.rows.filter(r => r.siNumber === it.siNumber).reduce((x, r) => x + r.amount, 0) : s, 0) : 0
  // Cross-branch rows: numbers ANOTHER branch used (not missing — info), and
  // numbers used by BOTH this branch and another (a real duplicate to resolve).
  const crossDups = (data?.crossDuplicates || []).filter(c => !c.flag)
  const crossUsed = (data?.crossBranch || []).filter(c => !c.flag)
  const matchesFlagQ = (c: CrossRow) => !flagQNorm
    || c.siNumber.toLowerCase().includes(flagQNorm)
    || usedByLabel(c.usedBy).toLowerCase().includes(flagQNorm)
    || (flagQDigits !== '' && String(siDigits(c.siNumber)).includes(flagQDigits))
  const crossDupsShown = crossDups.filter(matchesFlagQ)
  const crossUsedShown = crossUsed.filter(matchesFlagQ)
  const hasAnyRight = rightItems.length > 0 || crossDups.length > 0 || crossUsed.length > 0
  // SI numbers of THIS branch that also exist in another branch — used to
  // highlight those rows in the left "Sales Invoices" table (keyed by digits so
  // "0512" and "512" match). usedBy lets the row name the other branch.
  const crossDupByDigits = new Map((data?.crossDuplicates || []).map(c => [siDigits(c.siNumber), c.usedBy]))

  const generateExcel = async () => {
    if (xlScope !== 'all' && !xlFrom && !xlTo) { alert('Pick a From and/or To date, or choose "Everything".'); return }
    setXlBusy(true)
    try {
      const r = await fetch(`/api/reports/with-si?branch=${branch}`)
      if (!r.ok) { alert('Could not load the SI book'); return }
      const d: NonNullable<typeof data> = await r.json()
      const flagBy = new Map(d.flags.map(f => [f.siNumber, f]))
      // MM/DD/YYYY (en-PH) → YYYY-MM-DD so dates compare as strings.
      const iso = (ph: string | null | undefined) => { const m = String(ph || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : (ph || '') }
      const inRange = (ymd: string) => (!xlFrom || ymd >= xlFrom) && (!xlTo || ymd <= xlTo)
      type XRow = { si: string; actual: string; declared: string; who: string; orderNo: string; type: string; vat: number; nonVat: number; amount: number; remarks: string }
      const rows: XRow[] = [
        ...d.rows.map(o => ({
          si: o.siNumber, actual: iso(o.date), declared: o.declaredDate || '', who: o.patientName,
          orderNo: o.src === 'AR' ? String(o.orderNumber) : `#${o.orderNumber}`,
          type: flagBy.get(o.siNumber)?.status === 'TAGGED' ? 'Order (tagged)' : o.src === 'AR' ? 'AR / HMO collection' : 'Order',
          vat: o.vat, nonVat: o.nonVat, amount: o.amount, remarks: '',
        })),
        ...d.flags.filter(f => f.status === 'CANCELLED' || f.status === 'REMARKS').map(f => {
          const info = parseMonitoringRemark(f.remarks)
          const amt = f.status === 'REMARKS' ? (info?.netAmount ?? info?.amount ?? 0) : 0
          return { si: f.siNumber, actual: info?.date || '', declared: f.declaredDate || '', who: info?.customer || '', orderNo: '',
            type: f.status === 'CANCELLED' ? 'Cancelled SI' : 'Migrated (remarks)', vat: 0, nonVat: amt, amount: amt, remarks: f.remarks || '' }
        }),
      ]
      const keep = xlScope === 'all' ? rows
        : xlScope === 'actual' ? rows.filter(x => x.actual && inRange(x.actual))
        // SI-book date: declared when set, actual otherwise — the same rule the tab uses.
        : rows.filter(x => { const dt = x.declared || x.actual; return dt && inRange(dt) })
      keep.sort((a, b) => siDigits(a.si) - siDigits(b.si))
      const flagged = [
        ...d.gaps.filter(g => !g.flag).map(g => ({ si: g.siNumber, issue: 'Missing', count: '' as number | string, amount: '' as number | string })),
        ...d.duplicates.filter(x => !x.flag).map(x => ({ si: x.siNumber, issue: 'Duplicate', count: x.count || 0, amount: d.rows.filter(r => r.siNumber === x.siNumber).reduce((t, r) => t + r.amount, 0) as number | string })),
        ...(d.crossDuplicates || []).filter(c => !c.flag).map(c => ({ si: c.siNumber, issue: `Shared with ${usedByLabel(c.usedBy)}`, count: '' as number | string, amount: c.usedBy.reduce((s, u) => s + u.amount, 0) as number | string })),
        ...(d.crossBranch || []).filter(c => !c.flag).map(c => ({ si: c.siNumber, issue: `Used by ${usedByLabel(c.usedBy)}`, count: '' as number | string, amount: c.usedBy.reduce((s, u) => s + u.amount, 0) as number | string })),
      ].sort((a, b) => siDigits(a.si) - siDigits(b.si))
      const outliers = (d.outliers || []).map(o => [o.siNumber, iso(o.date), o.patientName, o.src === 'AR' ? String(o.orderNumber) : `#${o.orderNumber}`, o.amount])
      const label = xlScope === 'all' ? 'all' : `${xlScope}-${xlFrom || 'start'}_to_${xlTo || 'today'}`
      const sheets = [
        { name: 'Sales Invoices', headers: ['SI No.', 'Actual Date', 'Declared Date', 'Patient / Customer', 'Order #', 'Type', 'VAT (Products)', 'Non-VAT (Services)', 'Amount', 'Remarks'],
          rows: keep.map(x => [x.si, x.actual, x.declared, x.who, x.orderNo, x.type, x.vat, x.nonVat, x.amount, x.remarks]) },
        { name: 'Flagged Sales Invoices', headers: ['SI No.', 'Issue', 'Count', 'Amount'], rows: flagged.map(f => [f.si, f.issue, f.count, f.amount]) },
      ]
      if (outliers.length) sheets.push({ name: 'Outside SI sequence', headers: ['SI field', 'Date', 'Patient / Customer', 'Order #', 'Amount'], rows: outliers })
      downloadXlsx(`with-si_${branch}_${label}`, sheets)
      setXlOpen(false)
    } finally { setXlBusy(false) }
  }

  const resolvedBg = '#fffbeb', resolvedBorder = '#fde68a'
  const badge = (kind: string) => kind === 'tagged' ? { t: 'Tagged → order', bg: '#e0e7ff', c: '#3730a3' }
    : kind === 'cancelled' ? { t: 'Cancelled SI', bg: '#fee2e2', c: '#b91c1c' }
    : { t: 'Remarks', bg: '#dbeafe', c: '#1e40af' }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(!scopeEnum || canViewAll) && (
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
            {WITHSI_BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
          </div>
        )}
        {readOnly && (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: '#e0e7ff', color: '#3730a3' }}>
            Viewing {BRANCH_SHORT[branch] || branch} · read-only — you can flag SIs only in {BRANCH_SHORT[scopeEnum || ''] || scopeEnum}
          </span>
        )}
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="ml-1 px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></label>
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>To <input type="date" value={to} onChange={e => setTo(e.target.value)} className="ml-1 px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></label>
        <div className="relative ml-auto">
          <button onClick={() => { setXlFrom(from); setXlTo(to); setXlOpen(o => !o) }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
            <Download size={14} /> Generate Excel
          </button>
          {xlOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-2xl border bg-white shadow-xl p-4 z-30 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Download the SI book as Excel</p>
              <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Two sheets: <strong>Sales Invoices</strong> and <strong>Flagged Sales Invoices</strong> (plus any entries outside the SI sequence).</p>
              <div className="space-y-1.5 text-xs">
                {([['all', 'Everything (no date filter)'], ['actual', 'Filter by actual date'], ['declared', 'Filter by declared (SI-book) date']] as const).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer"><input type="radio" name="xl-scope" checked={xlScope === v} onChange={() => setXlScope(v)} /> {l}</label>
                ))}
              </div>
              {xlScope !== 'all' && (
                <div className="flex items-center gap-2 text-xs">
                  <label style={{ color: 'var(--mid-gray)' }}>From <input type="date" value={xlFrom} onChange={e => setXlFrom(e.target.value)} className="ml-1 px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} /></label>
                  <label style={{ color: 'var(--mid-gray)' }}>To <input type="date" value={xlTo} onChange={e => setXlTo(e.target.value)} className="ml-1 px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} /></label>
                </div>
              )}
              {xlScope === 'declared' && <p className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>Rows without a declared date are placed by their actual date, the same way the book attributes them.</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setXlOpen(false)} className="px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
                <button onClick={generateExcel} disabled={xlBusy} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{xlBusy ? 'Preparing…' : 'Download .xlsx'}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? <div className="py-10 text-center"><Loader2 size={18} className="inline animate-spin" style={{ color: 'var(--teal)' }} /></div> : data && (<>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}><p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>VAT (Products)</p><p className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(data.totals.vat)}</p></div>
          <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}><p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Non-VAT (Services)</p><p className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(data.totals.nonVat)}</p></div>
          <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--deep-teal)', background: 'var(--pale-teal)' }}><p className="text-[11px]" style={{ color: 'var(--deep-teal)' }}>{data.totals.count} SI order(s)</p><p className="text-lg font-bold" style={{ color: 'var(--deep-teal)' }}>₱{peso(data.totals.vat + data.totals.nonVat)}</p></div>
        </div>

        {(data.outliers?.length || 0) > 0 && (
          <div className="rounded-xl border px-4 py-3 text-xs" style={{ borderColor: '#fde68a', background: '#fffbeb', color: '#92400e' }}>
            <strong>{data.outliers!.length} entr{data.outliers!.length === 1 ? 'y' : 'ies'} outside the SI sequence</strong> — the number in the SI field
            looks like a different series (e.g. a bank reference), so it is excluded from the VAT totals and the missing-number scan.
            Fix the record so it joins the sequence:{' '}
            {data.outliers!.map(o => `${o.siNumber} (${o.orderNumber} · ${o.patientName} · ₱${peso(o.amount)})`).join('; ')}
          </div>
        )}
        {(data.gapsTruncated || 0) > 0 && (
          <div className="rounded-xl border px-4 py-3 text-xs" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>
            The missing-number list was cut off at 2,000 — {data.gapsTruncated!.toLocaleString()} more numbers are absent from the sequence.
            That span is too wide to be booklet gaps; check the SI numbers at the edges of the range.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* LEFT — Sales Invoices */}
          <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Sales Invoices <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>· {leftFiltering ? `${displayLeft.length} of ${leftItems.length}` : leftItems.length}</span></p>
              <div className="flex items-center gap-2">
                {undated.length > 0 && (
                  <button onClick={() => setUndatedOnly(v => !v)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                    style={undatedOnly
                      ? { background: '#b45309', borderColor: '#b45309', color: '#fff' }
                      : { background: '#fffbeb', borderColor: '#fcd34d', color: '#92400e' }}
                    title="Migrated workbook SIs with no date — excluded from every period total until a Declared Date is set. Click to show only these.">
                    ⚠ {undated.length} undated · ₱{peso(undatedTotal)}{undatedOnly ? ' — showing only these' : ''}
                  </button>
                )}
                <p className="text-sm font-bold" style={{ color: 'var(--deep-teal)' }}>₱{peso(leftTotal)}</p>
              </div>
            </div>
            <div className="overflow-auto" style={{ maxHeight: '68vh' }}>
              <table className="w-full text-sm">
                <SortFilterHead
                  cols={LEFT_COLS}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  filters={filters}
                  onToggleSort={toggleSort}
                  onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
                />
                <tbody>
                  {displayLeft.map(it => {
                    const isResolved = it.kind !== 'si'
                    const b = isResolved ? badge(it.kind) : null
                    // This SI number is also used in another branch — flag it.
                    const shared = crossDupByDigits.get(siDigits(it.si))
                    return (
                      <tr key={`${it.kind}-${it.si}-${it.order?.id || ''}`} className="border-t" style={{ borderColor: 'var(--light-gray)', background: shared ? '#fef2f2' : isResolved ? resolvedBg : undefined }}>
                        <td className="px-3 py-2 font-mono" style={{ color: shared ? '#b91c1c' : 'var(--charcoal)', fontWeight: shared ? 800 : 600 }}>
                          {it.si}
                          {shared && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold align-middle" style={{ background: '#fee2e2', color: '#b91c1c' }}>also in {usedByLabel(shared)}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
                          {it.order?.date || it.mDate || (isUndatedMigrated(it)
                            ? <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }} title="No workbook date — set a Declared Date to file this SI into a month">No date</span>
                            : '—')}
                        </td>
                        <DeclaredDateCell item={it} branch={branch} onSaved={load} readOnly={readOnly} />
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--charcoal)' }} title={it.remarks || undefined}>
                          {it.order ? it.order.patientName : <span style={{ color: it.mCustomer ? 'var(--charcoal)' : 'var(--mid-gray)' }}>{it.mCustomer || it.remarks || '—'}</span>}
                          {b && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: b.bg, color: b.c }}>{b.t}</span>}
                          {isResolved && !readOnly && <button onClick={() => clearFlag(it.si)} className="ml-1.5 underline text-[10px]" style={{ color: 'var(--mid-gray)' }}>undo</button>}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: it.amount ? 'var(--charcoal)' : 'var(--light-gray)' }}>{it.amount ? `₱${peso(it.amount)}` : '—'}</td>
                      </tr>
                    )
                  })}
                  {displayLeft.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>{leftItems.length === 0 ? 'No orders with a Sales Invoice in this branch/range.' : 'No rows match the current filters.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT — Flagged Sales Invoices */}
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: resolvedBorder, background: resolvedBg }}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: resolvedBorder }}>
              <div>
                <p className="text-sm font-bold" style={{ color: '#92400e' }}>Flagged Sales Invoices <span className="font-normal">· {flagQNorm ? `${displayRight.length} of ${rightItems.length}` : rightItems.length} need action</span></p>
                {(crossUsed.length > 0 || crossDups.length > 0) && (
                  <p className="text-[11px]" style={{ color: '#92400e' }}>
                    {crossUsed.length > 0 && <>{crossUsed.length} used by another branch</>}
                    {crossUsed.length > 0 && crossDups.length > 0 && ' · '}
                    {crossDups.length > 0 && <>{crossDups.length} shared with another branch</>}
                  </p>
                )}
              </div>
              {rightTotal > 0 && <p className="text-sm font-bold" style={{ color: '#92400e' }}>₱{peso(rightTotal)}</p>}
            </div>
            {hasAnyRight && (
              <div className="px-3 pt-3">
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border bg-white" style={{ borderColor: resolvedBorder }}>
                  <Search size={12} style={{ color: '#92400e' }} />
                  <input value={flagQ} onChange={e => setFlagQ(e.target.value)} placeholder="Search SI number, branch, or “missing” / “duplicate”…" className="flex-1 text-xs outline-none bg-transparent" />
                  {flagQ && <button onClick={() => setFlagQ('')} aria-label="Clear search"><X size={12} style={{ color: '#92400e' }} /></button>}
                </div>
              </div>
            )}
            <div className="overflow-auto p-3 space-y-1.5" style={{ maxHeight: '68vh' }}>
              {!hasAnyRight ? (
                <p className="text-xs text-center py-8" style={{ color: '#92400e' }}>No unresolved flags — every Sales Invoice number is accounted for. 🎉</p>
              ) : (<>
                {/* Cross-branch DUPLICATES — the same SI number in two branches. A real issue. */}
                {crossDupsShown.map(c => (
                  <div key={`xdup${c.siNumber}`} className="rounded-lg border p-2 text-xs" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-[13px]" style={{ color: '#b91c1c' }}>Shared #{c.siNumber}</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#fee2e2', color: '#b91c1c' }}>also used by {usedByLabel(c.usedBy)}</span>
                    </div>
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                      This branch issued #{c.siNumber} too — same official number on two sales. In {usedByLabel(c.usedBy)}: {c.usedBy.map(u => `${u.customer} · ₱${peso(u.amount)}${u.date ? ` · ${u.date}` : ''}`).join('; ')}. Decide which branch owns it.
                    </p>
                  </div>
                ))}
                {/* Actionable flags — true missing numbers & within-branch duplicates. */}
                {displayRight.map(it => (
                  <FlagRow key={`${it.type}${it.siNumber}`} branch={branch} readOnly={readOnly}
                    label={it.type === 'gap' ? `Missing #${it.siNumber}` : `Duplicate #${it.siNumber} (×${it.count})`}
                    siNumber={it.siNumber} onSave={saveFlag} onTag={tagOrder} />
                ))}
                {/* Used by another branch — the shared-booklet number was issued elsewhere, not missing. */}
                {crossUsedShown.map(c => (
                  <div key={`xused${c.siNumber}`} className="rounded-lg border p-2 text-xs" style={{ borderColor: '#bfdbfe', background: '#eff6ff' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-[13px]" style={{ color: '#1e40af' }}>#{c.siNumber}</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#dbeafe', color: '#1e40af' }}>Used by {usedByLabel(c.usedBy)}</span>
                      <span style={{ color: 'var(--mid-gray)' }}>{c.usedBy.map(u => `${u.customer} · ₱${peso(u.amount)}${u.date ? ` · ${u.date}` : ''}`).join('; ')}</span>
                    </div>
                  </div>
                ))}
                {flagQNorm && displayRight.length === 0 && crossDupsShown.length === 0 && crossUsedShown.length === 0 && (
                  <p className="text-xs text-center py-8" style={{ color: '#92400e' }}>No flags match “{flagQ.trim()}”.</p>
                )}
              </>)}
            </div>
          </div>
        </div>
      </>)}
    </div>
  )
}

function FlagRow({ branch, label, siNumber, onSave, onTag, readOnly }: { branch: string; label: string; siNumber: string; onSave: (si: string, status: string, remarks: string) => void; onTag: (si: string, orderId: string) => void; readOnly?: boolean }) {
  const [status, setStatus] = useState('CANCELLED')
  const [remarks, setRemarks] = useState('')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<OrderHit[]>([])
  const [picked, setPicked] = useState<OrderHit | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (status !== 'TAGGED' || !q.trim()) { setHits([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try { const r = await fetch(`/api/reports/order-search?branch=${branch}&q=${encodeURIComponent(q)}`); const d = r.ok ? await r.json() : { orders: [] }; setHits(d.orders || []) }
      catch { setHits([]) } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, status, branch])

  const save = () => {
    if (status === 'TAGGED') { if (!picked) { alert('Search and choose the order this SI belongs to.'); return } onTag(siNumber, picked.id) }
    else onSave(siNumber, status, remarks)
  }
  // Read-only (front desk viewing another branch): show the flag, hide the actions.
  if (readOnly) {
    return (
      <div className="rounded-lg border bg-white p-2 text-xs" style={{ borderColor: 'var(--light-gray)' }}>
        <span className="font-semibold" style={{ color: '#92400e' }}>{label}</span>
      </div>
    )
  }
  return (
    <div className="rounded-lg border bg-white p-2" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="font-semibold" style={{ color: '#92400e', minWidth: 130 }}>{label}</span>
        <select value={status} onChange={e => setStatus(e.target.value)} className="px-2 py-1 rounded border" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="CANCELLED">Declare Cancelled SI</option>
          <option value="REMARKS">Remarks</option>
          <option value="TAGGED">Tag to Order</option>
        </select>
        {status === 'REMARKS' && <input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Reason…" className="px-2 py-1 rounded border flex-1 min-w-[120px]" style={{ borderColor: 'var(--light-gray)' }} />}
        <button onClick={save} className="ml-auto px-2 py-1 rounded text-white font-semibold flex items-center gap-1" style={{ background: 'var(--teal)' }}><CheckCircle2 size={12} /> Save</button>
      </div>

      {status === 'TAGGED' && (
        <div className="mt-2">
          {picked ? (
            <div className="flex items-center gap-2 p-1.5 rounded text-xs" style={{ background: '#e0e7ff', color: '#3730a3' }}>
              <span className="flex-1">#{picked.orderNumber} · {picked.date} · {picked.patientName} · ₱{peso(picked.amount)}{picked.services ? ` · ${picked.services}` : ''}</span>
              <button onClick={() => setPicked(null)}><X size={13} /></button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-1 px-2 py-1 rounded border" style={{ borderColor: 'var(--light-gray)' }}>
                <Search size={12} style={{ color: 'var(--mid-gray)' }} />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search patient / date (YYYY-MM-DD) / service / amount / payment…" className="flex-1 text-xs outline-none" />
                {searching && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--mid-gray)' }} />}
              </div>
              {hits.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl max-h-52 overflow-auto" style={{ borderColor: 'var(--light-gray)' }}>
                  {hits.map(h => (
                    <button key={h.id} onClick={() => { setPicked(h); setHits([]); setQ('') }} className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--pale-teal)] border-b last:border-b-0" style={{ borderColor: 'var(--light-gray)' }}>
                      <div className="text-xs font-medium" style={{ color: 'var(--charcoal)' }}>#{h.orderNumber} · {h.date} · {h.patientName}</div>
                      <div className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>{[h.services, `₱${peso(h.amount)}`, h.payment].filter(Boolean).join(' · ')}</div>
                    </button>
                  ))}
                </div>
              )}
              {q.trim() && !searching && hits.length === 0 && <p className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>No unlabelled orders match.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SalesTargetTab({ branch: initialBranch, scopeEnum, canEditTarget }: { branch: string; scopeEnum: string | null; canEditTarget: boolean }) {
  const now = new Date()
  const [branch, setBranch] = useState(initialBranch)
  const [mode, setMode] = useState<'month' | 'quarter' | 'annual'>('month')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [d, setD] = useState<{ salesWithSI: number; target: number; difference: number; months?: { month: number; salesWithSI: number; target: number }[]; migrated?: { count: number; amount: number }; migratedUndated?: { count: number; amount: number } } | null>(null)
  const [targetInput, setTargetInput] = useState('')
  const [busy, setBusy] = useState(false)
  // A saved target shows as a read-only figure with an Edit button; the input
  // only appears for a month with no target yet, or while revising.
  const [editingTarget, setEditingTarget] = useState(false)
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const periodLabel = mode === 'month' ? `${MONTHS[month - 1]} ${year}` : mode === 'quarter' ? `Q${quarter} ${year}` : `${year}`

  const load = useCallback(async () => {
    const period = mode === 'month' ? `month=${month}` : mode === 'quarter' ? `mode=quarter&quarter=${quarter}` : 'mode=annual'
    const r = await fetch(`/api/reports/sales-target?branch=${branch}&${period}&year=${year}`)
    if (r.ok) { const j = await r.json(); setD(j); if (mode === 'month') setTargetInput(j.target ? String(j.target) : '') }
    setEditingTarget(false)
  }, [branch, mode, month, quarter, year])
  useEffect(() => { load() }, [load])

  // Excel of the view: the target-vs-sales breakdown, plus (Month view) a
  // second sheet with that month's Sales Invoices — same attribution as the
  // embedded table.
  const exportExcel = async () => {
    if (!d) return
    const r2 = (v: number) => Math.round(v * 100) / 100
    const branchLabel = WITHSI_BRANCHES.find(b => b.value === branch)?.label || branch
    const sheets: { name: string; headers: string[]; rows: (string | number)[][] }[] = [{
      name: 'Sales Target',
      headers: ['Month', 'Sales with SI', 'Target', 'Difference (Target − Sales)'],
      rows: [
        [`Branch: ${branchLabel}`, '', '', ''],
        [`Period: ${periodLabel}`, '', '', ''],
        [],
        ...(d.months || []).map(m => [MONTHS[m.month - 1], r2(m.salesWithSI), r2(m.target), r2(m.target - m.salesWithSI)] as (string | number)[]),
        ['TOTAL', r2(d.salesWithSI), r2(d.target), r2(d.difference)],
        ...(d.migrated?.count ? [[`Includes ${d.migrated.count} migrated workbook SI(s)`, r2(d.migrated.amount), '', ''] as (string | number)[]] : []),
        ...(d.migratedUndated?.count ? [[`Excluded — ${d.migratedUndated.count} undated migrated SI(s), no date to place them`, r2(d.migratedUndated.amount), '', ''] as (string | number)[]] : []),
      ],
    }]
    if (mode === 'month') {
      const { from, to } = monthBounds(year, month)
      try {
        const r = await fetch(`/api/reports/with-si?branch=${branch}&dateFrom=${from}&dateTo=${to}`)
        const items = buildMonthSiItems(r.ok ? await r.json() : null, from, to)
        sheets.push({
          name: 'Sales Invoices',
          headers: ['SI No.', 'Actual Date', 'Declared Date', 'Patient / Customer', 'Status', 'Amount'],
          rows: items.map(it => [
            it.si,
            it.order?.date || it.mDate || '',
            it.order?.declaredDate || it.mDeclared || '',
            it.order ? (it.order.patientName || '') : (it.mCustomer || it.remarks || ''),
            it.kind === 'si' ? '' : it.kind === 'tagged' ? 'Tagged → order' : it.kind === 'cancelled' ? 'Cancelled SI' : 'Remarks',
            r2(it.amount),
          ]),
        })
      } catch { /* ship the summary sheet alone */ }
    }
    downloadXlsx(`Sales Target - ${branchLabel} - ${periodLabel}`, sheets)
  }

  const save = async () => {
    // Accept what people actually type — "494,785.00", "₱494,785", "494785" —
    // instead of Number(), which turns a comma-formatted amount into NaN and
    // used to save 0.00 silently.
    const cleaned = targetInput.replace(/[^0-9.-]/g, '')
    const amt = cleaned === '' ? 0 : Number(cleaned)
    if (targetInput.trim() !== '' && !Number.isFinite(amt)) { alert(`"${targetInput}" is not an amount. Type numbers only, e.g. 494785 or 494,785.00.`); return }
    setBusy(true)
    try {
      const r = await fetch('/api/reports/sales-target', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, month, year, target: amt }) })
      if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Failed to save the target'); return }
      await load()
    }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {!scopeEnum && (
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
            {WITHSI_BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
          </div>
        )}
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
          {([['month', 'Month'], ['quarter', 'Quarter'], ['annual', 'Annual']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setMode(v)} className="px-4 py-2 text-xs font-semibold" style={mode === v ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{label}</button>
          ))}
        </div>
        {mode === 'month' && (
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
        )}
        {mode === 'quarter' && (
          <select value={quarter} onChange={e => setQuarter(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>{[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q} ({MONTHS[(q - 1) * 3].slice(0, 3)}–{MONTHS[q * 3 - 1].slice(0, 3)})</option>)}</select>
        )}
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>{[0, 1, 2, 3, 4].map(i => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}</select>
        <button onClick={exportExcel} disabled={!d}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border disabled:opacity-50"
          style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
          <Download size={14} /> Download Excel
        </button>
      </div>

      {d && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Sales with SI — {periodLabel}</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(d.salesWithSI)}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>
              Totaled from orders with a Sales Invoice
              {(d.migrated?.count || 0) > 0 && <> + {d.migrated!.count} migrated workbook SI{d.migrated!.count !== 1 ? 's' : ''} (₱{peso(d.migrated!.amount)})</>}
            </p>
            {(d.migratedUndated?.count || 0) > 0 && (
              <p className="text-[11px] mt-1" style={{ color: '#b45309' }}>
                {d.migratedUndated!.count} undated migrated SI{d.migratedUndated!.count !== 1 ? 's' : ''} (₱{peso(d.migratedUndated!.amount)}) can’t be placed in a period and {d.migratedUndated!.count !== 1 ? 'are' : 'is'} excluded
              </p>
            )}
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Target sales with SI</p>
            {mode === 'month' && canEditTarget ? (
              d.target > 0 && !editingTarget ? (
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(d.target)}</p>
                  <button onClick={() => { setTargetInput(String(d.target)); setEditingTarget(true) }}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    Edit
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input value={targetInput} onChange={e => setTargetInput(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-32 px-2 py-1.5 rounded-lg border text-lg font-bold font-mono" style={{ borderColor: 'var(--light-gray)' }} />
                  <button onClick={save} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? '…' : 'Save'}</button>
                  {d.target > 0 && (
                    <button onClick={() => setEditingTarget(false)} disabled={busy}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                      Cancel
                    </button>
                  )}
                </div>
              )
            ) : <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(d.target)}</p>}
            <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>
              {mode !== 'month' ? 'Sum of the monthly targets — encode targets in Month view'
                : !canEditTarget ? 'Set by Admin/Accountant/Bookkeeper'
                  : d.target > 0 && !editingTarget ? 'Saved target — Edit to revise'
                    : 'Encode the monthly target'}
            </p>
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--deep-teal)', background: 'var(--pale-teal)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--deep-teal)' }}>Difference (Target − Sales)</p>
            <p className="text-2xl font-bold" style={{ color: d.difference > 0 ? '#b45309' : '#166534' }}>₱{peso(d.difference)}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--deep-teal)' }}>{d.difference > 0 ? 'Below target' : 'Target met'} — updates as SI orders are added/edited</p>
          </div>
        </div>
      )}

      {/* Month view: the invoices behind the figure above — the With SI
          Sales Invoices table scoped to the chosen month. */}
      {mode === 'month' && <MonthSalesInvoices branch={branch} year={year} month={month} monthLabel={periodLabel} onChanged={load} />}

      {/* Quarter / Annual: read-only per-month breakdown so the totals above are
          auditable against the Month view (targets stay encoded per month). */}
      {mode !== 'month' && d?.months && (
        <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Monthly breakdown — {periodLabel}</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--off-white)' }}>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Month</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Sales with SI</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Target</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Difference (Target − Sales)</th>
              </tr>
            </thead>
            <tbody>
              {d.months.map(m => (
                <tr key={m.month} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{MONTHS[m.month - 1]}</td>
                  <td className="px-4 py-2 text-right" style={{ color: 'var(--charcoal)' }}>₱{peso(m.salesWithSI)}</td>
                  <td className="px-4 py-2 text-right" style={{ color: 'var(--charcoal)' }}>₱{peso(m.target)}</td>
                  <td className="px-4 py-2 text-right font-semibold" style={{ color: m.target - m.salesWithSI > 0 ? '#b45309' : '#166534' }}>₱{peso(m.target - m.salesWithSI)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--off-white)', borderTop: '2px solid var(--light-gray)' }}>
                <td className="px-4 py-2.5 font-bold" style={{ color: 'var(--charcoal)' }}>TOTAL</td>
                <td className="px-4 py-2.5 text-right font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(d.salesWithSI)}</td>
                <td className="px-4 py-2.5 text-right font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(d.target)}</td>
                <td className="px-4 py-2.5 text-right font-bold" style={{ color: d.difference > 0 ? '#b45309' : '#166534' }}>₱{peso(d.difference)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

/** The month bounds and the With SI left-table items for one month — shared by
 *  the embedded MonthSalesInvoices table and the Sales Target Excel export. */
function monthBounds(year: number, month: number) {
  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  }
}
function buildMonthSiItems(data: { rows: SiRow[]; flags: FlagInfo[] } | null, from: string, to: string): LeftItem[] {
  if (!data) return []
  const flagBySi = new Map((data.flags || []).map(f => [f.siNumber, f]))
  const taggedSi = (si: string) => flagBySi.get(si)?.status === 'TAGGED'
  return [
    ...data.rows.map(r => ({ kind: taggedSi(r.siNumber) ? 'tagged' : 'si', si: r.siNumber, siN: siDigits(r.siNumber), order: r as SiRow | null, amount: r.amount, remarks: '' })),
    ...data.flags.filter(f => f.status === 'CANCELLED' || f.status === 'REMARKS').flatMap(f => {
      const info = parseMonitoringRemark(f.remarks)
      // Only flags whose BOOK date (declared date wins over the workbook date)
      // falls in this month; an undated flag can't be placed in any month.
      const bookDate = f.declaredDate || info?.date
      if (!bookDate || bookDate < from || bookDate > to) return []
      return [{
        kind: f.status.toLowerCase(), si: f.siNumber, siN: siDigits(f.siNumber),
        order: null as SiRow | null,
        amount: f.status === 'REMARKS' ? (info?.amount || 0) : 0,
        remarks: f.remarks || '',
        mDate: info?.date ?? null, mCustomer: info?.customer ?? null, mDeclared: f.declaredDate ?? null,
      }]
    }),
  ]
}

/* ── The chosen month's Sales Invoices — the With SI left table scoped to one
   month, embedded under the Sales Target cards so the figure above can be
   opened up invoice by invoice. Same columns, sorting, filters and the
   editable Declared Date (saving one re-attributes the SI to its declared
   book month and refreshes the target figures). Note: AR/HMO collection SIs
   appear here exactly as in With SI, but the Sales-with-SI card counts orders
   + migrated workbook SIs only — the footer flags the difference. */
function MonthSalesInvoices({ branch, year, month, monthLabel, onChanged }: {
  branch: string; year: number; month: number; monthLabel: string; onChanged: () => void
}) {
  const { from, to } = monthBounds(year, month)
  const [data, setData] = useState<{ rows: SiRow[]; flags: FlagInfo[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('si')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir(dd => (dd === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch(`/api/reports/with-si?branch=${branch}&dateFrom=${from}&dateTo=${to}`); setData(r.ok ? await r.json() : null) }
    catch { setData(null) } finally { setLoading(false) }
  }, [branch, from, to])
  useEffect(() => { load() }, [load])

  const leftItems: LeftItem[] = buildMonthSiItems(data, from, to)
  const display = applySortFilter(leftItems, leftSortVal, sortKey, sortDir, filters, leftFilterVal)
  const total = display.reduce((s, it) => s + it.amount, 0)
  const filtering = Object.values(filters).some(Boolean)
  const resolvedBg = '#fffbeb'
  const chip = (kind: string) => kind === 'tagged' ? { t: 'Tagged → order', bg: '#e0e7ff', c: '#3730a3' }
    : kind === 'cancelled' ? { t: 'Cancelled SI', bg: '#fee2e2', c: '#b91c1c' }
    : { t: 'Remarks', bg: '#fef3c7', c: '#92400e' }

  return (
    <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>
          Sales Invoices — {monthLabel}{' '}
          <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>
            · {filtering ? `${display.length} of ${leftItems.length}` : leftItems.length}
          </span>
        </p>
        <p className="text-sm font-bold" style={{ color: 'var(--deep-teal)' }}>₱{peso(total)}</p>
      </div>
      <div className="overflow-auto" style={{ maxHeight: '60vh' }}>
        <table className="w-full text-sm">
          <SortFilterHead
            cols={LEFT_COLS}
            sortKey={sortKey}
            sortDir={sortDir}
            filters={filters}
            onToggleSort={toggleSort}
            onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
          />
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</td></tr>}
            {!loading && display.map(it => {
              const isResolved = it.kind !== 'si'
              const b = isResolved ? chip(it.kind) : null
              return (
                <tr key={`${it.kind}-${it.si}-${it.order?.id || ''}`} className="border-t" style={{ borderColor: 'var(--light-gray)', background: isResolved ? resolvedBg : undefined }}>
                  <td className="px-3 py-2 font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{it.si}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{it.order?.date || it.mDate || '—'}</td>
                  <DeclaredDateCell item={it} branch={branch} onSaved={() => { load(); onChanged() }} />
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--charcoal)' }} title={it.remarks || undefined}>
                    {it.order ? it.order.patientName : <span style={{ color: it.mCustomer ? 'var(--charcoal)' : 'var(--mid-gray)' }}>{it.mCustomer || it.remarks || '—'}</span>}
                    {b && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: b.bg, color: b.c }}>{b.t}</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: it.amount ? 'var(--charcoal)' : 'var(--light-gray)' }}>{it.amount ? `₱${peso(it.amount)}` : '—'}</td>
                </tr>
              )
            })}
            {!loading && display.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: 'var(--mid-gray)' }}>{leftItems.length === 0 ? 'No Sales Invoices in this month.' : 'No rows match the current filters.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-[11px] border-t" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
        Dated by declared date when one is set, otherwise the actual date — the same rule as the Sales-with-SI figure above.
        AR/HMO collection SIs are listed here (as in With SI) but are not part of that figure, so the two totals can differ.
        Editing a Declared Date moves the SI between book months and refreshes the figures.
      </p>
    </div>
  )
}
