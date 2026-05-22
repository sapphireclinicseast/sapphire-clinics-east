'use client'

import { useEffect, useState } from 'react'
import {
  getFrontDeskPaymentsServer, confirmFrontDeskPayment,
  type FrontDeskPaymentRow, type PaymentPlan,
} from '@/lib/session'

function fmt(cents: number) {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function planLabel(p: PaymentPlan) {
  return p === 'ANNUAL' ? 'Annual' : p === 'BIANNUAL' ? 'Bi-annual' : 'Monthly'
}
function methodLabel(m: FrontDeskPaymentRow['method']) {
  if (m === 'BANK_DEPOSIT') return 'Bank deposit'
  if (m === 'FRONT_DESK_CASH') return 'Cash at front desk'
  return 'Unspecified'
}

/**
 * Tuition-payment confirmation queue, surfaced inside /frontdesk → Payments.
 * Pulls every pending bank-deposit / cash payment from the server so the
 * confirming staffer can mark them PAID with a single click. PayMongo
 * payments never appear here — those flip to PAID automatically as soon
 * as the PayMongo success redirect lands on the student's device.
 */
export default function FrontDeskPaymentConfirmations() {
  const [rows, setRows] = useState<FrontDeskPaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const list = await getFrontDeskPaymentsServer()
      setRows(list)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  async function handleConfirm(row: FrontDeskPaymentRow) {
    if (busy) return
    setErr(null); setBusy(row.classPortalPaymentId)
    const ok = await confirmFrontDeskPayment(row.classPortalPaymentId)
    if (!ok) {
      setErr(`Could not confirm ${row.studentName}'s payment. Please retry.`)
      setBusy(null)
      return
    }
    // Optimistically flip in-place so the row jumps to history immediately.
    setRows(prev => prev.map(r =>
      r.classPortalPaymentId === row.classPortalPaymentId
        ? { ...r, status: 'CONVERTED', convertedAt: new Date().toISOString() }
        : r,
    ))
    setBusy(null)
  }

  const pending = rows.filter(r => r.status === 'PENDING')
  const history = rows.filter(r => r.status !== 'PENDING')

  return (
    <div className="card-static">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[18px] leading-tight">Tuition confirmations</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
            Cash + bank-deposit payments waiting for front-desk confirmation. PayMongo payments are auto-confirmed when the parent completes checkout and don&apos;t appear here.
          </p>
        </div>
        <button onClick={() => void load()} className="btn-secondary text-xs" disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {err && <div className="mb-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}

      {loading ? (
        <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">Loading…</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">No tuition payments waiting for confirmation. 🎉</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--paper-2)' }}>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                <th className="py-2 px-3">Student</th>
                <th className="py-2 px-3">Plan</th>
                <th className="py-2 px-3">Period</th>
                <th className="py-2 px-3">Method</th>
                <th className="py-2 px-3">Branch</th>
                <th className="py-2 px-3 text-right">Amount</th>
                <th className="py-2 px-3">Submitted</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pending.map(r => (
                <tr key={r.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-[color:var(--narra)]">{r.studentName}</div>
                    <div className="text-[11px] text-[color:var(--mid-gray)]">{r.studentEmail}</div>
                  </td>
                  <td className="py-2.5 px-3 text-[12.5px]">{planLabel(r.plan)}</td>
                  <td className="py-2.5 px-3 text-[12.5px]">{r.period}</td>
                  <td className="py-2.5 px-3 text-[12.5px]">{methodLabel(r.method)}</td>
                  <td className="py-2.5 px-3 text-[12.5px]">{r.branch}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{fmt(r.tuitionCentavos + r.miscCentavos)}</td>
                  <td className="py-2.5 px-3 text-[12.5px]">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      className="btn-primary text-xs"
                      onClick={() => void handleConfirm(r)}
                      disabled={busy === r.classPortalPaymentId}
                    >
                      {busy === r.classPortalPaymentId ? 'Confirming…' : 'Confirm payment'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-5">
          <button
            type="button"
            className="text-xs text-[color:var(--mid-gray)] hover:text-[color:var(--narra)]"
            onClick={() => setShowHistory(v => !v)}
          >
            {showHistory ? 'Hide history' : `Show ${history.length} confirmed / voided payment${history.length === 1 ? '' : 's'}`}
          </button>
          {showHistory && (
            <div className="mt-3 overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--paper-2)' }}>
                  <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                    <th className="py-2 px-3">Student</th>
                    <th className="py-2 px-3">Plan</th>
                    <th className="py-2 px-3">Period</th>
                    <th className="py-2 px-3">Method</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-3">Confirmed at</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(r => (
                    <tr key={r.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[color:var(--narra)]">{r.studentName}</div>
                        <div className="text-[11px] text-[color:var(--mid-gray)]">{r.studentEmail}</div>
                      </td>
                      <td className="py-2.5 px-3 text-[12.5px]">{planLabel(r.plan)}</td>
                      <td className="py-2.5 px-3 text-[12.5px]">{r.period}</td>
                      <td className="py-2.5 px-3 text-[12.5px]">{methodLabel(r.method)}</td>
                      <td className="py-2.5 px-3"><span className={`badge ${r.status === 'CONVERTED' ? 'badge-paid' : 'badge-pending'}`}>{r.status === 'CONVERTED' ? 'Paid' : r.status}</span></td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{fmt(r.tuitionCentavos + r.miscCentavos)}</td>
                      <td className="py-2.5 px-3 text-[12.5px]">{r.convertedAt ? new Date(r.convertedAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
