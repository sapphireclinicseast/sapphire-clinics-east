'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getFrontDeskPaymentsServer, confirmFrontDeskPayment, deleteFrontDeskPayment,
  recordPaymentOnBehalfOf, hydrateUsers, getAuth,
  changeFrontDeskPaymentMethod, patchFrontDeskPayment,
  type FrontDeskPaymentRow, type PaymentPlan, type StoredUser, type Branch,
  type FrontDeskPaymentPatch, type FrontDeskMethodDetail,
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
// Instrument detail label. Used as a sub-line on rows where the method
// is FRONT_DESK_CASH ("Frontdesk payment"). null → CASH for display
// (legacy rows recorded before methodDetail existed).
const METHOD_DETAIL_OPTIONS: Array<{ value: FrontDeskMethodDetail; label: string }> = [
  { value: 'CASH',        label: 'Cash' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'DEBIT_CARD',  label: 'Debit Card' },
  { value: 'GCASH',       label: 'GCash' },
  { value: 'PAYMAYA',     label: 'PayMaya' },
]
function methodDetailLabel(d: FrontDeskMethodDetail | null | undefined) {
  return METHOD_DETAIL_OPTIONS.find(o => o.value === d)?.label ?? 'Cash'
}
function methodLabel(m: FrontDeskPaymentRow['method'], detail?: FrontDeskMethodDetail | null) {
  if (m === 'BANK_DEPOSIT') return 'Bank deposit'
  if (m === 'FRONT_DESK_CASH') return `Frontdesk payment (${methodDetailLabel(detail ?? null)})`
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
  // Per-row reconciliation editor — opens with the row pre-filled so
  // staff can correct amount / date / notes / plan / period / method
  // to match what the accounting-hub Order actually shows.
  const [editingRow, setEditingRow] = useState<FrontDeskPaymentRow | null>(null)
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

  // Inline edit for the recorded method + instrument. The dropdown is
  // a flat 7-option list (5 Frontdesk-payment instruments + Bank
  // deposit + PayMongo); each option encodes both the top-level method
  // and, for Frontdesk payment, the instrument detail. We
  // optimistically swap the row in-place; on failure we revert and
  // surface the error so the staff knows to retry.
  async function handleChangeMethod(
    row: FrontDeskPaymentRow,
    next: NonNullable<FrontDeskPaymentRow['method']>,
    nextDetail: FrontDeskMethodDetail | null,
  ) {
    if (busy) return
    if (next === row.method && nextDetail === (row.methodDetail ?? null)) return
    const prevMethod = row.method
    const prevDetail = row.methodDetail
    setErr(null); setBusy(row.classPortalPaymentId)
    setRows(rs => rs.map(r => r.classPortalPaymentId === row.classPortalPaymentId
      ? { ...r, method: next, methodDetail: nextDetail }
      : r))
    const res = await patchFrontDeskPayment(row.classPortalPaymentId, {
      method: next,
      methodDetail: nextDetail,
    })
    if (!res.ok) {
      setRows(rs => rs.map(r => r.classPortalPaymentId === row.classPortalPaymentId
        ? { ...r, method: prevMethod, methodDetail: prevDetail }
        : r))
      setErr(`Could not change ${row.studentName}'s method. ${res.error}`)
    }
    setBusy(null)
  }

  // Composite values used by the inline <select>. Encoded as
  // "METHOD|DETAIL" for FRONT_DESK_CASH variants, plain method
  // string for the other two. Keeps the handler logic flat.
  const INLINE_METHOD_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'FRONT_DESK_CASH|CASH',        label: 'Frontdesk: Cash' },
    { value: 'FRONT_DESK_CASH|CREDIT_CARD', label: 'Frontdesk: Credit Card' },
    { value: 'FRONT_DESK_CASH|DEBIT_CARD',  label: 'Frontdesk: Debit Card' },
    { value: 'FRONT_DESK_CASH|GCASH',       label: 'Frontdesk: GCash' },
    { value: 'FRONT_DESK_CASH|PAYMAYA',     label: 'Frontdesk: PayMaya' },
    { value: 'BANK_DEPOSIT',                label: 'Bank deposit' },
    { value: 'PAYMONGO',                    label: 'PayMongo' },
  ]
  function rowToInlineValue(r: FrontDeskPaymentRow): string {
    if (r.method === 'FRONT_DESK_CASH') return `FRONT_DESK_CASH|${r.methodDetail ?? 'CASH'}`
    if (r.method === 'BANK_DEPOSIT' || r.method === 'PAYMONGO') return r.method
    return ''
  }
  function inlineValueToParts(v: string): { method: NonNullable<FrontDeskPaymentRow['method']>; detail: FrontDeskMethodDetail | null } | null {
    if (v.startsWith('FRONT_DESK_CASH|')) {
      const detail = v.split('|')[1] as FrontDeskMethodDetail
      return { method: 'FRONT_DESK_CASH', detail }
    }
    if (v === 'BANK_DEPOSIT' || v === 'PAYMONGO') return { method: v, detail: null }
    return null
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
  const confirmedAll = rows
    .filter(r => r.status === 'CONVERTED')
    .sort((a, b) => new Date(b.convertedAt ?? b.createdAt).getTime() - new Date(a.convertedAt ?? a.createdAt).getTime())
  const [confirmedSearch, setConfirmedSearch] = useState('')
  const confirmed = useMemo(() => {
    const q = confirmedSearch.trim().toLowerCase()
    if (!q) return confirmedAll
    return confirmedAll.filter(r => {
      const hay = `${r.studentName ?? ''} ${r.studentEmail ?? ''} ${r.plan ?? ''} ${r.period ?? ''} ${r.method ?? ''} ${r.branch ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [confirmedAll, confirmedSearch])

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
                    <td className="py-2.5 px-3 text-[12.5px]">
                      <select
                        className="select text-[12.5px] py-1 w-full"
                        style={{ minWidth: 180 }}
                        value={rowToInlineValue(r)}
                        onChange={e => {
                          const parts = inlineValueToParts(e.target.value)
                          if (parts) void handleChangeMethod(r, parts.method, parts.detail)
                        }}
                        disabled={busy === r.classPortalPaymentId}
                        title="Change the recorded payment method. Frontdesk-payment rows also pick the instrument here."
                      >
                        {!r.method && <option value="">— Unspecified —</option>}
                        {INLINE_METHOD_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
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
                        <button
                          type="button"
                          className="text-[11px] px-2 py-1 rounded border hover:bg-[color:var(--paper-2)] disabled:opacity-40"
                          style={{ borderColor: 'var(--paper-3)' }}
                          onClick={() => setEditingRow(r)}
                          disabled={busy === r.classPortalPaymentId}
                          title="Edit amount, date, notes or other fields to match the accounting hub."
                        >
                          Edit
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
          <div className="flex items-center gap-3">
            <input
              className="input text-[13px]"
              placeholder="Search name, email, plan, period, method, branch"
              value={confirmedSearch}
              onChange={e => setConfirmedSearch(e.target.value)}
              style={{ width: 280 }}
            />
            <div className="text-[12.5px] text-[color:var(--mid-gray)] font-semibold whitespace-nowrap">
              {confirmed.length}{confirmedSearch ? ` / ${confirmedAll.length}` : ''} total
            </div>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">Loading…</p>
        ) : confirmedAll.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">No confirmed payments yet.</p>
        ) : confirmed.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">No confirmed payments match &ldquo;{confirmedSearch}&rdquo;.</p>
        ) : (
          // Bounded internal-scroll shell so a long confirmed list doesn't
          // push the "Paying students" panel below the fold. Table body
          // scrolls; the header stays put via sticky positioning.
          <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)', maxHeight: 420 }}>
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--paper-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                  <th className="py-2 px-3">Student</th>
                  <th className="py-2 px-3">Plan</th>
                  <th className="py-2 px-3">Period</th>
                  <th className="py-2 px-3">Method</th>
                  <th className="py-2 px-3">Branch</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3">Confirmed at</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Action</th>
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
                    <td className="py-2.5 px-3 text-[12.5px]">
                      <select
                        className="select text-[12.5px] py-1 w-full"
                        style={{ minWidth: 180 }}
                        value={rowToInlineValue(r)}
                        onChange={e => {
                          const parts = inlineValueToParts(e.target.value)
                          if (parts) void handleChangeMethod(r, parts.method, parts.detail)
                        }}
                        disabled={busy === r.classPortalPaymentId}
                        title="Change the recorded payment method. Frontdesk-payment rows also pick the instrument here."
                      >
                        {!r.method && <option value="">— Unspecified —</option>}
                        {INLINE_METHOD_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-3 text-[12.5px]">{r.branch}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{fmt(r.tuitionCentavos + r.miscCentavos)}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{r.convertedAt ? new Date(r.convertedAt).toLocaleString() : '—'}</td>
                    <td className="py-2.5 px-3"><span className="badge badge-paid">Paid</span></td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex gap-1.5 items-center justify-end">
                        <button
                          type="button"
                          className="text-[11px] px-2 py-1 rounded border hover:bg-[color:var(--paper-2)] disabled:opacity-40"
                          style={{ borderColor: 'var(--paper-3)' }}
                          onClick={() => setEditingRow(r)}
                          disabled={busy === r.classPortalPaymentId}
                          title="Edit amount, date, notes or other fields to match the accounting hub."
                        >
                          Edit
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            className="text-[11px] px-2 py-1 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] disabled:opacity-40"
                            onClick={() => void handleDelete(r)}
                            disabled={busy === r.classPortalPaymentId}
                            title="Delete this confirmed payment (main admin only). Does NOT void the accounting-hub Order."
                          >
                            {busy === r.classPortalPaymentId ? 'Deleting…' : 'Delete'}
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

      {editingRow && (
        <EditPaymentModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSaved={async () => {
            setEditingRow(null)
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
  const [methodDetail, setMethodDetail] = useState<FrontDeskMethodDetail>('CASH')
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
      const result = await recordPaymentOnBehalfOf({
        studentId: selected.id,
        studentEmail: selected.email,
        studentName,
        branch: selectedBranch,
        plan,
        method,
        methodDetail: method === 'FRONT_DESK_CASH' ? methodDetail : undefined,
        tuitionCentavos: Math.round(peso * 100),
        miscCentavos: 0,
        period: period.trim(),
        reference: reference.trim() || undefined,
      })
      if (!result.ok) {
        // Surface the real reason so an expired token doesn't look like a
        // generic server error. On auth-expired the token has already
        // been cleared client-side, so bounce to /sign-in after a beat.
        setErr(result.message)
        if (result.reason === 'auth-expired' && typeof window !== 'undefined') {
          setTimeout(() => { window.location.href = '/sign-in' }, 1500)
        }
        return
      }
      await onRecorded()
      const verifyHint =
        method === 'PAYMONGO'                       ? 'PayMongo receipt is verified' :
        method === 'BANK_DEPOSIT'                   ? 'deposit slip is reconciled' :
        methodDetail === 'CASH'                     ? 'cash is in hand' :
        methodDetail === 'CREDIT_CARD'              ? 'credit-card transaction posts' :
        methodDetail === 'DEBIT_CARD'               ? 'debit-card transaction posts' :
        methodDetail === 'GCASH'                    ? 'GCash payment shows up in the merchant account' :
        methodDetail === 'PAYMAYA'                  ? 'PayMaya payment shows up in the merchant account' :
                                                      'payment is verified'
      alert(
        `Recorded ${studentName}'s payment in the Pending queue. ` +
        `Click "Confirm payment" once the ${verifyHint} ` +
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
            <option value="FRONT_DESK_CASH">Frontdesk payment</option>
            <option value="BANK_DEPOSIT">Bank deposit</option>
            <option value="PAYMONGO">PayMongo</option>
          </select>
        </label>

        {method === 'FRONT_DESK_CASH' && (
          <label className="block mb-3">
            <span className="label">Frontdesk payment type</span>
            <select
              className="select"
              value={methodDetail}
              onChange={e => setMethodDetail(e.target.value as FrontDeskMethodDetail)}
              disabled={busy}
            >
              {METHOD_DETAIL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        )}

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

/* ─────────── Edit-payment (reconcile-with-accounting-hub) modal ─────────── */

// Convert an ISO timestamp to the YYYY-MM-DDTHH:mm shape <input type="datetime-local">
// expects. We keep the local time as-is so the staff sees the same wall
// clock they're used to in the table.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
// And back: the input gives us a value in the user's local tz; we send
// it as an ISO string for Prisma to store as a proper Date.
function localInputToIso(s: string): string | null {
  if (!s) return null
  const d = new Date(s)
  if (!Number.isFinite(d.getTime())) return null
  return d.toISOString()
}

function EditPaymentModal({ row, onClose, onSaved }: {
  row: FrontDeskPaymentRow
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [plan, setPlan] = useState<PaymentPlan>(row.plan)
  const [period, setPeriod] = useState(row.period)
  const [method, setMethod] = useState<NonNullable<FrontDeskPaymentRow['method']>>(row.method ?? 'FRONT_DESK_CASH')
  const [methodDetail, setMethodDetail] = useState<FrontDeskMethodDetail>((row.methodDetail ?? 'CASH'))
  // Show the combined total in PHP; on save we split back into tuition
  // (the full amount) + misc (0). Keeping it one input matches what the
  // staff usually wants to reconcile.
  const totalPhp = (row.tuitionCentavos + row.miscCentavos) / 100
  const [amount, setAmount] = useState<string>(totalPhp.toString())
  const [createdAt, setCreatedAt] = useState<string>(isoToLocalInput(row.createdAt))
  const [convertedAt, setConvertedAt] = useState<string>(isoToLocalInput(row.convertedAt))
  const [notes, setNotes] = useState<string>(row.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isConfirmed = row.status === 'CONVERTED'

  async function handleSubmit() {
    setErr(null)
    const peso = Number(String(amount).replace(/,/g, ''))
    if (!Number.isFinite(peso) || peso < 0) { setErr('Enter the amount paid (in PHP).'); return }
    if (!period.trim()) { setErr('Period covered is required.'); return }
    const tuitionCentavos = Math.round(peso * 100)

    // Build a patch with only fields that actually changed — the
    // server returns 400 if nothing changed, and sending unchanged
    // values churns audit logs.
    const patch: FrontDeskPaymentPatch = {}
    if (plan !== row.plan) patch.plan = plan
    if (period.trim() !== row.period) patch.period = period.trim()
    if (method !== (row.method ?? 'FRONT_DESK_CASH')) patch.method = method
    // For Frontdesk payment, also patch the instrument when it changed
    // (or when switching INTO Frontdesk payment, send the picked value).
    if (method === 'FRONT_DESK_CASH') {
      const currentDetail = row.method === 'FRONT_DESK_CASH' ? (row.methodDetail ?? 'CASH') : null
      if (methodDetail !== currentDetail) patch.methodDetail = methodDetail
    } else if (row.methodDetail !== null && method !== row.method) {
      // Switching away from Frontdesk payment — clear the dangling detail.
      patch.methodDetail = null
    }
    if (tuitionCentavos !== row.tuitionCentavos) patch.tuitionCentavos = tuitionCentavos
    // Always set miscCentavos to 0 when amount changed — the editor's
    // single "Amount" field carries the full total.
    if (tuitionCentavos !== row.tuitionCentavos && row.miscCentavos !== 0) patch.miscCentavos = 0
    const newCreatedIso = localInputToIso(createdAt)
    if (newCreatedIso && newCreatedIso !== row.createdAt) patch.createdAt = newCreatedIso
    const newConvertedIso = localInputToIso(convertedAt)
    if (newConvertedIso !== row.convertedAt) {
      // Setting convertedAt to a value when the row was PENDING flips
      // it to CONVERTED on the server (it's stamped when status is
      // CONVERTED). We don't change status here; that's still the
      // explicit "Confirm payment" button's job.
      patch.convertedAt = newConvertedIso
    }
    const trimmedNotes = notes.trim()
    if (trimmedNotes !== (row.notes ?? '')) patch.notes = trimmedNotes || null

    if (Object.keys(patch).length === 0) {
      setErr('No changes to save.')
      return
    }
    setBusy(true)
    const res = await patchFrontDeskPayment(row.classPortalPaymentId, patch)
    if (!res.ok) {
      setErr(res.error || 'Could not save changes. Please retry.')
      setBusy(false)
      return
    }
    setBusy(false)
    await onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 flex items-start justify-center" onClick={() => !busy && onClose()}>
      <div className="card-static w-full max-w-md mt-10 sm:mt-16" onClick={(e) => e.stopPropagation()}>
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
          Edit payment · reconcile with accounting hub
        </div>
        <h3 className="text-[18px] leading-tight mb-1">{row.studentName}</h3>
        <p className="text-[11.5px] text-[color:var(--mid-gray)] mb-4">
          {row.studentEmail} · {row.branch} · {isConfirmed ? 'Confirmed' : 'Pending'} ·{' '}
          <span className="font-mono text-[10.5px]">{row.classPortalPaymentId}</span>
        </p>

        {err && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-[12.5px] text-rose-800">{err}</div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="label">Amount paid (PHP)</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className="input"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block">
            <span className="label">Method</span>
            <select className="select" value={method} onChange={e => setMethod(e.target.value as NonNullable<FrontDeskPaymentRow['method']>)} disabled={busy}>
              <option value="FRONT_DESK_CASH">Frontdesk payment</option>
              <option value="BANK_DEPOSIT">Bank deposit</option>
              <option value="PAYMONGO">PayMongo</option>
            </select>
          </label>
        </div>

        {method === 'FRONT_DESK_CASH' && (
          <div className="mb-3">
            <label className="block">
              <span className="label">Frontdesk payment type</span>
              <select className="select" value={methodDetail} onChange={e => setMethodDetail(e.target.value as FrontDeskMethodDetail)} disabled={busy}>
                {METHOD_DETAIL_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="label">Plan</span>
            <select className="select" value={plan} onChange={e => setPlan(e.target.value as PaymentPlan)} disabled={busy}>
              <option value="ANNUAL">Annual</option>
              <option value="BIANNUAL">Bi-annual</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </label>
          <label className="block">
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
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="label">Submitted at</span>
            <input
              type="datetime-local"
              className="input"
              value={createdAt}
              onChange={e => setCreatedAt(e.target.value)}
              disabled={busy}
              title="When the payment was first logged."
            />
          </label>
          <label className="block">
            <span className="label">Confirmed at</span>
            <input
              type="datetime-local"
              className="input"
              value={convertedAt}
              onChange={e => setConvertedAt(e.target.value)}
              disabled={busy}
              title="When the cash/deposit was verified by staff. Leave empty if still pending."
            />
          </label>
        </div>

        <label className="block mb-4">
          <span className="label">Remarks / accounting-hub reference (optional)</span>
          <textarea
            className="input"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. OR #12345 · matches accounting hub Order ABC-987 · amount adjusted from ₱5,000 → ₱4,800"
            disabled={busy}
          />
        </label>

        <div className="flex gap-2 justify-end">
          <button className="btn-secondary text-xs" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary text-xs" onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
