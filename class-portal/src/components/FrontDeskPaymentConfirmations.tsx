'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getFrontDeskPaymentsServer, confirmFrontDeskPayment, deleteFrontDeskPayment,
  recordPaymentOnBehalfOf, hydrateUsers, getAuth,
  type FrontDeskPaymentRow, type PaymentPlan, type StoredUser, type Branch,
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
  // Record-on-behalf-of state. `users` is the in-branch student roster
  // for the picker; hydrated lazily on first modal-open so the page
  // doesn't pay the fetch unless staff actually clicks "+ Record".
  const [recordOpen, setRecordOpen] = useState(false)
  const [users, setUsers] = useState<StoredUser[]>([])
  const viewerBranch: Branch | undefined = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    return getAuth()?.branch
  }, [])

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
    // Show a different confirm message for CONVERTED rows so the admin
    // understands the accounting-hub Order isn't auto-voided.
    const msg = row.status === 'CONVERTED'
      ? `Delete ${row.studentName}'s CONFIRMED payment?\n\n⚠️ This payment has already been converted to an Order in the accounting hub. Deleting here will NOT void that Order — if the deletion is to reverse the payment, also void the Order in the accounting hub.\n\nProceed?`
      : `Delete this PENDING payment row for ${row.studentName}?\n\nUse this for test rows or duplicates. The accounting hub will no longer see it in the cashier queue.`
    if (!confirm(msg)) return
    setErr(null); setBusy(row.classPortalPaymentId)
    const ok = await deleteFrontDeskPayment(row.classPortalPaymentId)
    if (!ok) {
      setErr(`Could not delete ${row.studentName}'s row. Please retry.`)
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                // Lazy-hydrate the user roster the first time the staff
                // opens the modal. Subsequent opens skip the fetch.
                if (users.length === 0) void hydrateUsers().then(setUsers)
                setRecordOpen(true)
              }}
              className="btn-cta text-xs"
              disabled={loading}
              title="Record a tuition payment for a student who didn't submit one on their portal."
            >
              + Record payment
            </button>
            <button onClick={() => void load()} className="btn-secondary text-xs" disabled={loading}>
              {loading ? '…' : 'Refresh'}
            </button>
          </div>
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
                  {canDelete && <th className="py-2 px-3 text-right">Action</th>}
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
                    {canDelete && (
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          className="text-[11px] px-2 py-1 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] disabled:opacity-40"
                          onClick={() => void handleDelete(r)}
                          disabled={busy === r.classPortalPaymentId}
                          title="Delete this confirmed payment (main admin only). Does NOT void the accounting-hub Order."
                        >
                          {busy === r.classPortalPaymentId ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recordOpen && (
        <RecordPaymentModal
          users={users}
          viewerBranch={viewerBranch}
          onClose={() => setRecordOpen(false)}
          onRecorded={async () => {
            // Re-hydrate the queue so the freshly-recorded PENDING row
            // shows up in the table. Closing the modal first feels
            // snappier than waiting on the network round-trip.
            setRecordOpen(false)
            await load()
          }}
        />
      )}
    </div>
  )
}

/* ─────────── Record-payment-on-behalf modal ─────────── */

function RecordPaymentModal({
  users, viewerBranch, onClose, onRecorded,
}: {
  users: StoredUser[]
  viewerBranch: Branch | undefined
  onClose: () => void
  onRecorded: () => void | Promise<void>
}) {
  // Per-row state. Defaults pick the most common shape: monthly cash.
  const [studentId, setStudentId] = useState('')
  const [method, setMethod] = useState<'FRONT_DESK_CASH' | 'BANK_DEPOSIT' | 'PAYMONGO'>('FRONT_DESK_CASH')
  const [plan, setPlan] = useState<PaymentPlan>('MONTHLY')
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Filter the picker to in-branch active students. When the staff
  // account is "global" (no branch on the token) we fall through to
  // all students — matches the legacy global-frontdesk behaviour.
  const eligible = useMemo(() => {
    return users
      .filter(u => u.role === 'STUDENT' && !u.disabledAt)
      .filter(u => !viewerBranch || !u.branch || u.branch === viewerBranch)
      .sort((a, b) => {
        const an = [a.lastName, a.firstName].filter(Boolean).join(', ') || a.email
        const bn = [b.lastName, b.firstName].filter(Boolean).join(', ') || b.email
        return an.localeCompare(bn)
      })
  }, [users, viewerBranch])

  const selected = eligible.find(u => u.id === studentId) ?? null
  const selectedBranch = (selected?.branch ?? viewerBranch ?? null) as 'EAST' | 'GREENHILLS' | null

  async function handleSubmit() {
    setErr(null)
    if (!selected) { setErr('Pick a student.'); return }
    if (!selectedBranch) { setErr('Student has no branch on file — set the branch on their profile first.'); return }
    const peso = Number(amount.replace(/,/g, ''))
    if (!Number.isFinite(peso) || peso <= 0) { setErr('Enter the amount paid (in PHP).'); return }
    if (!period.trim()) { setErr('Period covered is required (e.g. "AY 2026–2027" or "Aug 2026").'); return }

    setBusy(true)
    try {
      const studentName = [selected.firstName, selected.lastName].filter(Boolean).join(' ') || selected.email
      const id = await recordPaymentOnBehalfOf({
        studentId: selected.id,
        studentEmail: selected.email,
        studentName,
        branch: selectedBranch,
        plan,
        method,
        tuitionCentavos: Math.round(peso * 100),
        miscCentavos: 0,
        period: period.trim(),
        reference: reference.trim() || undefined,
      })
      if (!id) {
        setErr('Could not record the payment. Retry?')
        return
      }
      await onRecorded()
      alert(
        `Recorded ${studentName}'s payment in the Pending queue. ` +
        `Click "Confirm payment" once the ${method === 'PAYMONGO' ? 'PayMongo receipt is verified' : method === 'BANK_DEPOSIT' ? 'deposit slip is reconciled' : 'cash is in hand'} ` +
        `— the row will move to Confirmed Payments and the student's portal will flip to PAID.`
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 flex items-start justify-center"
      onClick={() => !busy && onClose()}
    >
      <div className="card-static w-full max-w-md mt-6 sm:mt-12" onClick={e => e.stopPropagation()}>
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
          Record payment on behalf of student
        </div>
        <h3 className="text-[18px] leading-tight mb-2">Front-desk override</h3>
        <p className="text-[12px] text-[color:var(--mid-gray)] mb-4">
          Use this when the parent never opened <span className="font-semibold">/pay</span> on their portal — staff is logging
          the payment themselves. A pending row is created in the queue below; click <span className="font-semibold">Confirm payment</span> on
          it once the cash / deposit / PayMongo receipt is in hand.
        </p>

        {err && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-[12.5px] text-rose-800">{err}</div>
        )}

        <label className="block mb-3">
          <span className="label">Student</span>
          <select
            className="select"
            value={studentId}
            onChange={e => setStudentId(e.target.value)}
            disabled={busy}
          >
            <option value="">— Pick a student —</option>
            {eligible.map(u => {
              const name = [u.lastName, u.firstName].filter(Boolean).join(', ') || u.email
              return (
                <option key={u.id} value={u.id}>
                  {name}{u.branch ? ` · ${u.branch}` : ''}{u.level ? ` · ${u.level}` : ''}
                </option>
              )
            })}
          </select>
          {eligible.length === 0 && (
            <span className="text-[11px] text-[color:var(--mid-gray)] mt-1 block italic">
              No active students loaded yet. Try closing + re-opening this modal.
            </span>
          )}
        </label>

        <label className="block mb-3">
          <span className="label">Payment method</span>
          <select
            className="select"
            value={method}
            onChange={e => setMethod(e.target.value as 'FRONT_DESK_CASH' | 'BANK_DEPOSIT' | 'PAYMONGO')}
            disabled={busy}
          >
            <option value="FRONT_DESK_CASH">Cash at front desk</option>
            <option value="BANK_DEPOSIT">Bank deposit</option>
            <option value="PAYMONGO">PayMongo</option>
          </select>
        </label>

        <label className="block mb-3">
          <span className="label">Plan</span>
          <select
            className="select"
            value={plan}
            onChange={e => setPlan(e.target.value as PaymentPlan)}
            disabled={busy}
          >
            <option value="MONTHLY">Monthly</option>
            <option value="BIANNUAL">Bi-annual</option>
            <option value="ANNUAL">Annual</option>
          </select>
        </label>

        <label className="block mb-3">
          <span className="label">Amount paid (PHP)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="input"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="e.g. 5000"
            disabled={busy}
          />
        </label>

        <label className="block mb-3">
          <span className="label">Period covered</span>
          <input
            type="text"
            className="input"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            placeholder='e.g. "AY 2026–2027" or "Aug 2026"'
            disabled={busy}
          />
        </label>

        <label className="block mb-4">
          <span className="label">
            {method === 'PAYMONGO' ? 'PayMongo reference / receipt no. (optional)'
              : method === 'BANK_DEPOSIT' ? 'Deposit slip reference (optional)'
              : 'Receipt no. (optional)'}
          </span>
          <input
            type="text"
            className="input"
            value={reference}
            onChange={e => setReference(e.target.value)}
            placeholder={method === 'PAYMONGO' ? 'Paste from the PayMongo email' : ''}
            disabled={busy}
          />
        </label>

        <div className="flex gap-2 justify-end">
          <button className="btn-secondary text-xs" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary text-xs" onClick={() => void handleSubmit()} disabled={busy || !studentId}>
            {busy ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
