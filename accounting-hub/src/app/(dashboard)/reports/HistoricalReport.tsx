'use client'

// Renders the manual FY2024/FY2025 statements (see src/lib/reports/historical-fs.ts).
// Layout mirrors the source workbook: line items with optional monthly columns,
// section headers, "Total for …" subtotal rules and a double-ruled grand total.
import { Archive } from 'lucide-react'
import type { HistoricalReportPayload } from '@/lib/reports/historical-fs'
import type { HistRow } from '@/lib/reports/historical-fs-data'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const fmt = (n: number) => {
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `(${s})` : s
}

function Amount({ value, bold }: { value: number | null; bold?: boolean }) {
  if (value === null) return <td />
  return (
    <td
      className="px-2 py-1 text-right whitespace-nowrap tabular-nums"
      style={{ color: value < 0 ? '#b91c1c' : '#111827', fontWeight: bold ? 600 : 400 }}
    >
      {fmt(value)}
    </td>
  )
}

function StatementTable({
  rows,
  monthly,
  totalHeader,
}: {
  rows: HistRow[]
  monthly: boolean
  totalHeader: string
}) {
  const showMonths = monthly && rows.some((r) => r.monthly)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[0.78rem]" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
            <th className="px-3 py-1.5 text-left font-semibold" style={{ color: '#374151' }}>
              Line Item
            </th>
            {showMonths &&
              MONTHS.map((m) => (
                <th key={m} className="px-2 py-1.5 text-right font-semibold" style={{ color: '#374151' }}>
                  {m}
                </th>
              ))}
            <th className="px-2 py-1.5 text-right font-semibold" style={{ color: '#374151' }}>
              {totalHeader}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            if (r.kind === 'header') {
              return (
                <tr key={i}>
                  <td
                    colSpan={showMonths ? 14 : 2}
                    className="px-3 pt-3 pb-1 font-semibold uppercase"
                    style={{ color: '#111827', fontSize: '0.72rem', letterSpacing: '0.03em' }}
                  >
                    {r.label}
                  </td>
                </tr>
              )
            }
            const isSubtotal = r.kind === 'subtotal'
            const isGrand = r.kind === 'grand'
            return (
              <tr
                key={i}
                className="hover:bg-gray-50"
                style={{
                  borderTop: isSubtotal || isGrand ? '1px solid #d1d5db' : undefined,
                  // Thin separator on plain line items so the eye can track a
                  // label to its amount across the full row width.
                  borderBottom: isGrand ? '3px double #111827' : isSubtotal ? undefined : '1px solid #f3f4f6',
                  background: isGrand ? '#f9fafb' : undefined,
                }}
              >
                <td
                  className="px-3 py-1"
                  style={{
                    paddingLeft: r.kind === 'line' ? '1.6rem' : undefined,
                    fontWeight: isSubtotal || isGrand ? 600 : 400,
                    color: '#111827',
                  }}
                >
                  {r.label}
                </td>
                {showMonths &&
                  (r.monthly
                    ? r.monthly.map((v, j) => <Amount key={j} value={v} bold={isSubtotal || isGrand} />)
                    : MONTHS.map((_, j) => <td key={j} />))}
                <Amount value={r.total} bold={isSubtotal || isGrand} />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function HistoricalReport({
  hist,
  tab,
  monthly,
  revenueOnly,
}: {
  hist: HistoricalReportPayload
  tab: 'balance-sheet' | 'income-statement' | 'cash-flow'
  monthly: boolean
  revenueOnly?: boolean
}) {
  const banner = (
    <div
      className="flex items-start gap-2 mx-4 mt-3 mb-1 px-3 py-2 rounded-lg text-xs"
      style={{ background: '#fefce8', border: '1px solid #fde68a', color: '#854d0e' }}
    >
      <Archive size={14} className="mt-0.5 shrink-0" />
      <span>{hist.source}</span>
    </div>
  )

  if (hist.emptyReason) {
    return (
      <div>
        {banner}
        <p className="px-6 py-10 text-sm text-center" style={{ color: 'var(--mid-gray)' }}>
          {hist.emptyReason}
        </p>
      </div>
    )
  }

  let body: React.ReactNode = null
  if (tab === 'income-statement' && hist.incomeStatement) {
    // Med-rep sees revenue only: cut the statement off after Net Sales.
    let rows = hist.incomeStatement.rows
    if (revenueOnly) {
      const cut = rows.findIndex((r) => /net sales/i.test(r.label))
      if (cut >= 0) rows = rows.slice(0, cut + 1)
    }
    body = (
      <>
        <p className="px-4 pt-2 text-sm font-semibold" style={{ color: '#111827' }}>
          {hist.incomeStatement.title}
        </p>
        <StatementTable rows={rows} monthly={monthly} totalHeader="FY Total" />
      </>
    )
  } else if (tab === 'balance-sheet') {
    body = hist.balanceSheet ? (
      <>
        <p className="px-4 pt-2 text-sm font-semibold" style={{ color: '#111827' }}>
          {hist.balanceSheet.title}
          <span className="font-normal" style={{ color: '#6b7280' }}> · {hist.balanceSheet.asOf}</span>
        </p>
        {hist.balanceSheet.note && (
          <p className="px-4 pt-1 text-xs" style={{ color: '#6b7280' }}>{hist.balanceSheet.note}</p>
        )}
        <StatementTable rows={hist.balanceSheet.rows} monthly={false} totalHeader="Amount (₱)" />
      </>
    ) : (
      <p className="px-6 py-10 text-sm text-center" style={{ color: 'var(--mid-gray)' }}>
        No {hist.year} balance sheet exists for this selection.
      </p>
    )
  } else if (tab === 'cash-flow') {
    body = hist.cashFlow ? (
      <>
        <p className="px-4 pt-2 text-sm font-semibold" style={{ color: '#111827' }}>
          {hist.cashFlow.title}
          <span className="font-normal" style={{ color: '#6b7280' }}> · {hist.cashFlow.period}</span>
        </p>
        <StatementTable rows={hist.cashFlow.rows} monthly={monthly} totalHeader="FY Total" />
      </>
    ) : (
      <p className="px-6 py-10 text-sm text-center" style={{ color: 'var(--mid-gray)' }}>
        No {hist.year} cash-flow statement exists in the source books for this selection.
      </p>
    )
  }

  return (
    <div className="pb-2">
      {banner}
      {body}
      {(hist.notes.length > 0 || (tab === 'income-statement' && hist.isNotes.length > 0)) && (
        <ul className="px-6 pt-3 space-y-0.5">
          {[...hist.notes, ...(tab === 'income-statement' ? hist.isNotes : [])].map((n, i) => (
            <li key={i} className="text-xs" style={{ color: '#6b7280' }}>
              • {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
