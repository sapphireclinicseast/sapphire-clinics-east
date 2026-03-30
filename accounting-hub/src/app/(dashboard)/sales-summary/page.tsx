'use client'

import { useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  Receipt, Download, Printer, Loader2, Filter, FileText,
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

/* ─────────────────────────────────────────────
   PAGE
───────────────────────────────────────────── */
export default function SalesSummaryPage() {
  const { data: session } = useSession()

  const [branch, setBranch] = useState('ALL')
  const [dateFrom, setDateFrom] = useState(firstOfMonth())
  const [dateTo, setDateTo] = useState(today())
  const [invoicedOnly, setInvoicedOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<SalesSummaryRow[]>([])
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
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (branch !== 'ALL') params.set('branch', branch)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (invoicedOnly) params.set('invoicedOnly', 'true')

      const res = await fetch(`/api/reports/sales-summary?${params}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load data'); return }
      setRows(data.rows || [])
      setFetched(true)
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [branch, dateFrom, dateTo, invoicedOnly])

  /* ── CSV Export ── */
  const exportCsv = () => {
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
    a.download = `sales-summary-${dateFrom}-to-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ── Print / PDF ── */
  const printReport = () => window.print()

  /* ── Totals ── */
  const totalGross = rows.reduce((s, r) => s + r.grossAmount, 0)
  const totalNet = rows.reduce((s, r) => s + r.netAmount, 0)

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

        {fetched && rows.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border"
              style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
            >
              <Download size={15} /> Export CSV
            </button>
            <button
              onClick={printReport}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'var(--teal)' }}
            >
              <Printer size={15} /> Print / PDF
            </button>
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="rounded-2xl border p-4 mb-6 print:hidden" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} style={{ color: 'var(--mid-gray)' }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={invoicedOnly}
                onChange={e => setInvoicedOnly(e.target.checked)}
                className="w-4 h-4 rounded accent-teal-600"
              />
              <span className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>With Invoice Only</span>
            </label>
          </div>
        </div>
        <div className="mt-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--teal)' }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            {loading ? 'Loading...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700">{error}</div>
      )}

      {/* ── Print Header (print only) ── */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold text-center">SAPPHIRE CLINICS EAST</h1>
        <h2 className="text-lg font-semibold text-center mt-1">Sales Summary Report</h2>
        <p className="text-sm text-center text-gray-500 mt-1">
          {dateFrom} to {dateTo}{branch !== 'ALL' ? ` · ${BRANCHES.find(b => b.value === branch)?.label}` : ''}{invoicedOnly ? ' · With Official Invoice Only' : ''}
        </p>
      </div>

      {/* ── Table ── */}
      {fetched && (
        <>
          {rows.length === 0 ? (
            <div className="text-center py-16 text-sm" style={{ color: 'var(--mid-gray)' }}>
              No transactions found for the selected filters.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
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
                      <tr
                        key={i}
                        style={{ borderBottom: '1px solid var(--light-gray)' }}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{row.date}</td>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--charcoal)' }}>#{row.orderNumber}</td>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{row.patientName}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>{row.serviceAvailed}</td>
                        <td className="px-4 py-3 text-center" style={{ color: 'var(--charcoal)' }}>{row.quantity}</td>
                        <td className="px-4 py-3">
                          {row.salesInvoiceNumber ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
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
                        TOTAL ({rows.length} line{rows.length !== 1 ? 's' : ''})
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

              {/* Summary Cards */}
              <div className="mt-4 grid grid-cols-3 gap-4 print:hidden">
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>Total Transactions</p>
                  <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>{rows.length}</p>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>Total Gross Amount</p>
                  <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(totalGross)}</p>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>Total Net Amount</p>
                  <p className="text-2xl font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(totalNet)}</p>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {!fetched && !loading && (
        <div className="text-center py-20" style={{ color: 'var(--mid-gray)' }}>
          <Receipt size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Set your filters and click <strong>Generate Report</strong> to view the sales summary.</p>
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:block, .print\\:block * { visibility: visible; }
          table, table * { visibility: visible; }
          table { position: absolute; top: 120px; left: 0; right: 0; width: 100%; }
          thead th { background: #f8f8f8 !important; }
          @page { size: landscape; margin: 15mm; }
        }
      `}</style>
    </div>
  )
}
