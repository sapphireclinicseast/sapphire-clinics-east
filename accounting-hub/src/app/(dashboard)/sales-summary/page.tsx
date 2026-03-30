'use client'

import { useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  Receipt, Download, Printer, Loader2, Filter, FileText,
  CheckCircle2, XCircle,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

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
}

const BRANCHES = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SANDBOX_EAST', label: 'Sandbox East' },
  { value: 'SANDBOX_GREENHILLS', label: 'Sandbox Greenhills' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
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
  const totalGross = rows.reduce((s, r) => s + r.grossAmount, 0)
  const totalNet = rows.reduce((s, r) => s + r.netAmount, 0)

  const handlePrint = () => {
    const el = document.getElementById(printId)
    if (!el) return
    const w = window.open('', '_blank', 'width=1100,height=800')
    if (!w) return
    w.document.write(`
      <html><head><title>${title}</title>
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
      <h2>${title}</h2>
      <p>${subtitle}</p>
      ${el.innerHTML}
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
            {rows.length} line{rows.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={() => downloadCsv(rows, csvFilename)}
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
                <thead>
                  <tr style={{ background: 'var(--off-white)', borderBottom: '1px solid var(--light-gray)' }}>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Order #</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Patient Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Service Availed</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Sales Invoice No.</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Gross Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--light-gray)' }} className="hover:bg-gray-50">
                      <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{row.date}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--charcoal)' }}>#{row.orderNumber}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{row.patientName}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>{row.serviceAvailed}</td>
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
                      SUBTOTAL ({rows.length} line{rows.length !== 1 ? 's' : ''})
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
              <p className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>{rows.length}</p>
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

  const [branch, setBranch] = useState('ALL')
  const [dateFrom, setDateFrom] = useState(firstOfMonth())
  const [dateTo, setDateTo] = useState(today())
  const [showWithInvoice, setShowWithInvoice] = useState(true)
  const [showWithoutInvoice, setShowWithoutInvoice] = useState(true)
  const [loading, setLoading] = useState(false)
  const [allRows, setAllRows] = useState<SalesSummaryRow[]>([])
  const [fetched, setFetched] = useState(false)
  const [error, setError] = useState('')

  const allowed = ['ADMIN', 'ACCOUNTANT', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
  if (!session?.user || !allowed.includes((session.user as { role?: string }).role || '')) {
    return (
      <div className="p-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
        You do not have permission to view this page.
      </div>
    )
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
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
              {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
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
    </div>
  )
}
