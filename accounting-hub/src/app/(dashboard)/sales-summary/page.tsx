'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { userBranchScope } from '@/lib/branch-scope'
import {
  Receipt, Download, Printer, Loader2, Filter, FileText,
  CheckCircle2, XCircle, X, Search,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { applySortFilter, SortFilterHead, type SortCol } from '@/components/SortFilterHead'

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface SalesSummaryRow {
  date: string
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

function escapeCsv(val: string | number) {
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function downloadCsv(rows: SalesSummaryRow[], filename: string) {
  const headers = ['Date', 'Order #', 'Patient Name', 'Service Availed', 'Qty', 'Sales Invoice No.', 'Gross Amount', 'Net Amount']
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map(r => [
      escapeCsv(r.date),
      escapeCsv(r.orderNumber),
      escapeCsv(r.patientName),
      escapeCsv(r.serviceAvailed),
      escapeCsv(r.quantity),
      escapeCsv(r.salesInvoiceNumber || ''),
      escapeCsv(r.grossAmount.toFixed(2)),
      escapeCsv(r.netAmount.toFixed(2)),
    ].join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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
    case 'orderNumber': return `#${r.orderNumber}`
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
}: {
  rows: SalesSummaryRow[]
  title: string
  subtitle: string
  printId: string
  csvFilename: string
  accentClass: string
  badgeClass: string
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
      <td class="mono">#${r.orderNumber}</td>
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
            onClick={() => downloadCsv(displayRows, csvFilename)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
          >
            <Download size={13} /> Export CSV
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
                    <tr key={i} style={{ borderBottom: '1px solid var(--light-gray)' }} className="hover:bg-gray-50">
                      <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{row.date}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--charcoal)' }}>#{row.orderNumber}</td>
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

      {view === 'with-si' && <WithSiTab branch={branch !== 'ALL' ? branch : (scope.enum || 'SANDBOX_EAST')} scopeEnum={scope.enum} />}
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

interface SiRow { id: string; orderNumber: number; siNumber: string; date: string; patientName: string; vat: number; nonVat: number; amount: number; orderType: string }
interface FlagInfo { siNumber: string; status: string; remarks: string | null; orderId: string | null }
interface Flag { siNumber: string; count?: number; flag: { status: string; remarks: string | null } | null }
interface OrderHit { id: string; orderNumber: number; date: string; patientName: string; services: string; amount: number; payment: string }
const siDigits = (s: string) => parseInt(String(s).replace(/\D/g, '') || '0', 10)

type LeftItem = { kind: string; si: string; siN: number; order: SiRow | null; amount: number; remarks: string }
const LEFT_COLS: SortCol[] = [
  { key: 'si', label: 'SI No.' },
  { key: 'date', label: 'Date' },
  { key: 'patient', label: 'Patient / Customer' },
  { key: 'amount', label: 'Amount' },
]
const leftSortVal = (it: LeftItem, k: string): string | number => {
  switch (k) {
    case 'si': return it.siN
    case 'date': return it.order?.date ? (new Date(it.order.date).getTime() || 0) : 0
    case 'patient': return (it.order?.patientName || it.remarks || '').toLowerCase()
    case 'amount': return it.amount
    default: return ''
  }
}
const leftFilterVal = (it: LeftItem, k: string): string => {
  switch (k) {
    case 'si': return it.si
    case 'date': return it.order?.date || ''
    case 'patient': return it.order?.patientName || it.remarks || ''
    case 'amount': return it.amount ? peso(it.amount) : ''
    default: return ''
  }
}

function WithSiTab({ branch: initialBranch, scopeEnum }: { branch: string; scopeEnum: string | null }) {
  const [branch, setBranch] = useState(initialBranch)
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [data, setData] = useState<{ rows: SiRow[]; totals: { vat: number; nonVat: number; count: number }; gaps: Flag[]; gapsTruncated?: number; outliers?: SiRow[]; duplicates: Flag[]; flags: FlagInfo[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState('si')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState<Record<string, string>>({})
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
  const leftItems: LeftItem[] = data ? [
    ...data.rows.map(r => ({ kind: tagged(r.siNumber) ? 'tagged' : 'si', si: r.siNumber, siN: siDigits(r.siNumber), order: r as SiRow | null, amount: r.amount, remarks: '' })),
    ...data.flags.filter(f => f.status === 'CANCELLED' || f.status === 'REMARKS').map(f => ({ kind: f.status.toLowerCase(), si: f.siNumber, siN: siDigits(f.siNumber), order: null as SiRow | null, amount: 0, remarks: f.remarks || '' })),
  ] : []
  const displayLeft = applySortFilter(leftItems, leftSortVal, sortKey, sortDir, filters, leftFilterVal)
  const leftTotal = displayLeft.reduce((s, it) => s + it.amount, 0)
  const leftFiltering = Object.values(filters).some(Boolean)

  // RIGHT — still-unresolved flags (missing / duplicate numbers) needing action.
  const rightItems = data ? [
    ...data.gaps.filter(g => !g.flag).map(g => ({ type: 'gap' as const, siNumber: g.siNumber, count: 0 })),
    ...data.duplicates.filter(d => !d.flag).map(d => ({ type: 'dup' as const, siNumber: d.siNumber, count: d.count || 0 })),
  ].sort((a, b) => siDigits(a.siNumber) - siDigits(b.siNumber)) : []
  const rightTotal = data ? rightItems.reduce((s, it) => it.type === 'dup'
    ? s + data.rows.filter(r => r.siNumber === it.siNumber).reduce((x, r) => x + r.amount, 0) : s, 0) : 0

  const resolvedBg = '#fffbeb', resolvedBorder = '#fde68a'
  const badge = (kind: string) => kind === 'tagged' ? { t: 'Tagged → order', bg: '#e0e7ff', c: '#3730a3' }
    : kind === 'cancelled' ? { t: 'Cancelled SI', bg: '#fee2e2', c: '#b91c1c' }
    : { t: 'Remarks', bg: '#dbeafe', c: '#1e40af' }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {!scopeEnum && (
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
            {WITHSI_BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
          </div>
        )}
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="ml-1 px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></label>
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>To <input type="date" value={to} onChange={e => setTo(e.target.value)} className="ml-1 px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></label>
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
              <p className="text-sm font-bold" style={{ color: 'var(--deep-teal)' }}>₱{peso(leftTotal)}</p>
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
                    return (
                      <tr key={`${it.kind}-${it.si}-${it.order?.id || ''}`} className="border-t" style={{ borderColor: 'var(--light-gray)', background: isResolved ? resolvedBg : undefined }}>
                        <td className="px-3 py-2 font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{it.si}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{it.order?.date || '—'}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--charcoal)' }}>
                          {it.order ? it.order.patientName : <span style={{ color: 'var(--mid-gray)' }}>{it.remarks || '—'}</span>}
                          {b && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: b.bg, color: b.c }}>{b.t}</span>}
                          {isResolved && <button onClick={() => clearFlag(it.si)} className="ml-1.5 underline text-[10px]" style={{ color: 'var(--mid-gray)' }}>undo</button>}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: it.amount ? 'var(--charcoal)' : 'var(--light-gray)' }}>{it.amount ? `₱${peso(it.amount)}` : '—'}</td>
                      </tr>
                    )
                  })}
                  {displayLeft.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>{leftItems.length === 0 ? 'No orders with a Sales Invoice in this branch/range.' : 'No rows match the current filters.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT — Flagged Sales Invoices */}
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: resolvedBorder, background: resolvedBg }}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: resolvedBorder }}>
              <p className="text-sm font-bold" style={{ color: '#92400e' }}>Flagged Sales Invoices <span className="font-normal">· {rightItems.length}</span></p>
              {rightTotal > 0 && <p className="text-sm font-bold" style={{ color: '#92400e' }}>₱{peso(rightTotal)}</p>}
            </div>
            <div className="overflow-auto p-3 space-y-1.5" style={{ maxHeight: '68vh' }}>
              {rightItems.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: '#92400e' }}>No unresolved flags — every Sales Invoice number is accounted for. 🎉</p>
              ) : rightItems.map(it => (
                <FlagRow key={`${it.type}${it.siNumber}`} branch={branch}
                  label={it.type === 'gap' ? `Missing #${it.siNumber}` : `Duplicate #${it.siNumber} (×${it.count})`}
                  siNumber={it.siNumber} onSave={saveFlag} onTag={tagOrder} />
              ))}
            </div>
          </div>
        </div>
      </>)}
    </div>
  )
}

function FlagRow({ branch, label, siNumber, onSave, onTag }: { branch: string; label: string; siNumber: string; onSave: (si: string, status: string, remarks: string) => void; onTag: (si: string, orderId: string) => void }) {
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
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [d, setD] = useState<{ salesWithSI: number; target: number; difference: number } | null>(null)
  const [targetInput, setTargetInput] = useState('')
  const [busy, setBusy] = useState(false)
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  const load = useCallback(async () => {
    const r = await fetch(`/api/reports/sales-target?branch=${branch}&month=${month}&year=${year}`)
    if (r.ok) { const j = await r.json(); setD(j); setTargetInput(j.target ? String(j.target) : '') }
  }, [branch, month, year])
  useEffect(() => { load() }, [load])

  const save = async () => {
    setBusy(true)
    try { await fetch('/api/reports/sales-target', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, month, year, target: Number(targetInput) || 0 }) }); await load() }
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
        <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>{[0, 1, 2, 3, 4].map(i => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}</select>
      </div>

      {d && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Sales with SI</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(d.salesWithSI)}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>Totaled from orders with a Sales Invoice</p>
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Target sales with SI</p>
            {canEditTarget ? (
              <div className="flex items-center gap-2">
                <input value={targetInput} onChange={e => setTargetInput(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-32 px-2 py-1.5 rounded-lg border text-lg font-bold font-mono" style={{ borderColor: 'var(--light-gray)' }} />
                <button onClick={save} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? '…' : 'Save'}</button>
              </div>
            ) : <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(d.target)}</p>}
            <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>{canEditTarget ? 'Encode the monthly target' : 'Set by Admin/Accountant/Bookkeeper'}</p>
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--deep-teal)', background: 'var(--pale-teal)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--deep-teal)' }}>Difference (Target − Sales)</p>
            <p className="text-2xl font-bold" style={{ color: d.difference > 0 ? '#b45309' : '#166534' }}>₱{peso(d.difference)}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--deep-teal)' }}>{d.difference > 0 ? 'Below target' : 'Target met'} — updates as SI orders are added/edited</p>
          </div>
        </div>
      )}
    </div>
  )
}
