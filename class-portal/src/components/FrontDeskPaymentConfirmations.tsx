'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getFrontDeskPaymentsServer,
  type FrontDeskPaymentRow, type PaymentPlan, type FrontDeskMethodDetail,
} from '@/lib/session'

interface FdpProps {
  /** Kept for existing callers; payments can no longer be deleted here. */
  canDelete?: boolean
}

function fmt(cents: number) {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function planLabel(p: PaymentPlan) {
  return p === 'ANNUAL' ? 'Annual' : p === 'BIANNUAL' ? 'Bi-annual' : 'Monthly'
}
const METHOD_DETAIL_LABEL: Record<FrontDeskMethodDetail, string> = {
  CASH: 'Cash', CREDIT_CARD: 'Credit Card', DEBIT_CARD: 'Debit Card', GCASH: 'GCash', PAYMAYA: 'PayMaya',
}
function methodLabel(m: FrontDeskPaymentRow['method'], detail?: FrontDeskMethodDetail | null) {
  if (m === 'BANK_DEPOSIT') return 'Bank deposit'
  if (m === 'FRONT_DESK_CASH') return `Frontdesk payment (${METHOD_DETAIL_LABEL[detail ?? 'CASH'] ?? 'Cash'})`
  if (m === 'PAYMONGO') return 'PayMongo'
  return 'Unspecified'
}
const PartialTag = () => (
  <span className="ml-1 inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: '#fef3c7', color: '#92400e' }} title="Partial payment — the rest of the period is still due">Partial</span>
)

/**
 * Tuition payments, surfaced inside /frontdesk and /admin → Payments.
 * Read-only: tuition is recorded only at the Accounting Hub POS (Hannah,
 * 2026-10-31), and the POS writes each completed sale here. Corrections are
 * made on the sale in the Accounting Hub (void, reopen or edit), which keeps
 * this list in step.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function FrontDeskPaymentConfirmations(_props: FdpProps = {}) {
  const [rows, setRows] = useState<FrontDeskPaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    try {
      setRows(await getFrontDeskPaymentsServer())
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  // Rows from before the POS became the only place to record tuition can
  // still be waiting in the POS queue.
  const pending = rows.filter(r => r.status === 'PENDING')
  const recordedAll = useMemo(() => rows
    .filter(r => r.status === 'CONVERTED')
    .sort((a, b) => new Date(b.convertedAt ?? b.createdAt).getTime() - new Date(a.convertedAt ?? a.createdAt).getTime()), [rows])
  const recorded = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recordedAll
    return recordedAll.filter(r => `${r.studentName ?? ''} ${r.studentEmail ?? ''} ${r.plan ?? ''} ${r.period ?? ''} ${r.method ?? ''} ${r.branch ?? ''}`.toLowerCase().includes(q))
  }, [recordedAll, search])

  const head = (cols: string[]) => (
    <thead style={{ background: 'var(--paper-2)', position: 'sticky', top: 0, zIndex: 1 }}>
      <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
        {cols.map(c => <th key={c} className={`py-2 px-3${c === 'Amount' ? ' text-right' : ''}`}>{c}</th>)}
      </tr>
    </thead>
  )
  const studentCell = (r: FrontDeskPaymentRow) => (
    <td className="py-2.5 px-3">
      <div className="font-semibold text-[color:var(--narra)]">{r.studentName}</div>
      <div className="text-[11px] text-[color:var(--mid-gray)]">{r.studentEmail}</div>
    </td>
  )

  return (
    <div className="space-y-4">
      <div className="card-static">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-[18px] leading-tight">Tuition payments</h2>
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1 max-w-2xl">
              Tuition is recorded at the <span className="font-semibold">Accounting Hub POS</span> (POS → Tuition) and shows here as soon as the sale is completed.
              To correct a payment, void, reopen or edit the sale in the Accounting Hub — this list follows it.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input className="input text-[13px]" placeholder="Search name, email, plan, period, method, branch" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280 }} />
            <button onClick={() => void load()} className="btn-secondary text-xs" disabled={loading}>{loading ? '…' : 'Refresh'}</button>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">Loading…</p>
        ) : recordedAll.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">No payments recorded yet.</p>
        ) : recorded.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">No payments match &ldquo;{search}&rdquo;.</p>
        ) : (
          <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)', maxHeight: 460 }}>
            <table className="w-full text-sm">
              {head(['Student', 'Plan', 'Period', 'Method', 'Branch', 'Amount', 'Recorded', 'Status'])}
              <tbody>
                {recorded.map(r => (
                  <tr key={r.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                    {studentCell(r)}
                    <td className="py-2.5 px-3 text-[12.5px]">{planLabel(r.plan)}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{r.period}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{methodLabel(r.method, r.methodDetail)}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{r.branch}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{fmt(r.tuitionCentavos + r.miscCentavos)}{r.isPartialPayment && <PartialTag />}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{r.convertedAt ? new Date(r.convertedAt).toLocaleString() : '—'}</td>
                    <td className="py-2.5 px-3"><span className="badge badge-paid">Paid</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div className="card-static">
          <h2 className="text-[18px] leading-tight">Waiting in the POS queue</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1 mb-3">
            Submitted before tuition was recorded only at the POS. The cashier completes each one from the Accounting Hub POS queue; it then moves to the list above.
          </p>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
            <table className="w-full text-sm">
              {head(['Student', 'Plan', 'Period', 'Method', 'Branch', 'Amount', 'Submitted'])}
              <tbody>
                {pending.map(r => (
                  <tr key={r.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                    {studentCell(r)}
                    <td className="py-2.5 px-3 text-[12.5px]">{planLabel(r.plan)}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{r.period}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{methodLabel(r.method, r.methodDetail)}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{r.branch}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{fmt(r.tuitionCentavos + r.miscCentavos)}{r.isPartialPayment && <PartialTag />}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
