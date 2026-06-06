'use client'

import { useEffect, useState } from 'react'
import {
  getFrontDeskPaymentsServer, confirmFrontDeskPayment, deleteFrontDeskPayment,
  type FrontDeskPaymentRow, type PaymentPlan,
} from '@/lib/session'

interface FdpProps {
  /**
   * Show a Delete button per row. Reserved for main admin viewers so
   * they can clean up test rows. The endpoint enforces ADMIN role on
   * the server side too — this prop is just the UI guard.
   */
  canDelete?: boolean
}

function fmt(cents: number) {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function planLabel(p: PaymentPlan) {
  return p === 'ANNUAL' ? 'Annual' : p === 'BIANNUAL' ? 'Bi-annual' : 'Monthly'
}
function methodLabel(m: FrontDeskPaymentRow['method']) {
  if (m === 'BANK_DEPOSIT') return 'Bank deposit'
  if (m === 'FRONT_DESK_CASH') return 'Cash at front desk'
  if (m === 'PAYMONGO') return 'PayMongo'
  return 'Unspecified'
}

/**
 * Tuition-payment confirmation queue, surfaced inside /frontdesk → Payments.
 * Pulls every pending bank-deposit / cash payment from the server so the
 * confirming staffer can mark them PAID with a single click. PayMongo
 * payments never appear here — those flip to PAID automatically as soon
 * as the PayMongo success redirect lands on the student's device.
 */
export default function FrontDeskPaymentConfirmations({ canDelete = false }: FdpProps = {}) {
  const [rows, setRows] = useState<FrontDeskPaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

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
    // Optimistically flip in-place so the row jumps to the Confirmed
    // Payments section immediately.
    setRows(prev => prev.map(r =>
      r.classPortalPaymentId === row.classPortalPaymentId
        ? { ...r, status: 'CONVERTED', convertedAt: new Date().toISOString() }
        : r,
    ))
    setBusy(null)
  }

  async function handleDelete(row: FrontDeskPaymentRow) {
    if (busy) return
    if (!confirm(`Delete this PENDING payment row for ${row.studentName}? Use this only for test rows — confirmed (converted) rows can't be deleted here.`)) return
    setErr(null); setBusy(row.classPortalPaymentId)
    const ok = await deleteFrontDeskPayment(row.classPortalPaymentId)
    if (!ok) {
      setErr(`Could not delete ${row.studentName}'s row. If it's already CONVERTED, void the order in the accounting hub first.`)
      setBusy(null)
      return
    }
    setRows(prev => prev.filter(r => r.classPortalPaymentId !== row.classPortalPaymentId))
    setBusy(null)
  }

  const pending = rows.filter(r => r.status === 'PENDING')
  // CONVERTED only — voided rows are noise here. Sort newest-first.
  const confirmed = rows
    .filter(r => r.status === 'CONVERTED')
    .sort((a, b) => new Date(b.convertedAt ?? b.createdAt).getTime() - new Date(a.convertedAt ?? a.createdAt).getTime())

  return (
    <div className="space-y-4">
      {/* ─────────────  PENDING CONFIRMATIONS  ───────────── */}
      <div className="card-static">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-[18px] leading-tight">Pending confirmations</h2>
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
              Cash + bank-deposit payments waiting for the front desk to verify and confirm. Click <span className="font-semibold">Confirm payment</span> once the cash is collected or the bank deposit is reconciled — the row immediately moves to <span className="font-semibold">Confirmed Payments</span> below and the student&apos;s portal flips to PAID on next refresh.
            </p>
            <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-1.5 italic" style={{ fontFamily: 'var(--font-display)' }}>
              PayMongo payments are auto-confirmed when the parent finishes checkout — they don&apos;t appear here.
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
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">No payments waiting for confirmation. 🎉</p>
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
                      <div className="inline-flex gap-1.5 items-center justify-end">
                        <button
                          type="button"
                          className="btn-primary text-xs"
                          onClick={() => void handleConfirm(r)}
                          disabled={busy === r.classPortalPaymentId}
                        >
                          {busy === r.classPortalPaymentId ? 'Confirming…' : 'Confirm payment'}
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            className="text-[11px] px-2 py-1 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] disabled:opacity-40"
                            onClick={() => void handleDelete(r)}
                            disabled={busy === r.classPortalPaymentId}
                            title="Delete this pending row (admin only). Use for test rows."
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─────────────  CONFIRMED PAYMENTS  ───────────── */}
      <div className="card-static">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-[18px] leading-tight">Confirmed Payments</h2>
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
              Cash + bank-deposit payments the front desk has already confirmed. Newest first.
            </p>
          </div>
          <div className="text-[12.5px] text-[color:var(--mid-gray)] font-semibold">
            {confirmed.length} total
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">Loading…</p>
        ) : confirmed.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">No confirmed payments yet.</p>
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
                  <th className="py-2 px-3">Confirmed at</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {confirmed.map(r => (
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
                    <td className="py-2.5 px-3 text-[12.5px]">{r.convertedAt ? new Date(r.convertedAt).toLocaleString() : '—'}</td>
                    <td className="py-2.5 px-3"><span className="badge badge-paid">Paid</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
