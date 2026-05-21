'use client'

import { useEffect, useMemo, useState } from 'react'
import { getPayments, getUsers, getFile, levelLabel, type PaymentRecord, type PaymentMethod, type StoredUser } from '@/lib/session'

function fmt(cents: number) {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function methodLabel(m: PaymentMethod | undefined): string {
  switch (m) {
    case 'PAYMONGO':        return 'PayMongo'
    case 'FRONT_DESK_CASH': return 'Front desk (cash)'
    case 'BANK_DEPOSIT':    return 'Bank deposit'
    default:                return '—'
  }
}

/**
 * One row per enrolled student. Abandoned PENDING checkout attempts are
 * intentionally NOT shown as separate rows — admins only care whether
 * a student has actually paid. For students with at least one PAID
 * record, the latest PAID payment's details are shown. For students
 * who have never completed a payment, a single PENDING row is shown
 * (preferring a bank-deposit attempt with a proof file attached, so the
 * admin can verify the transfer slip before marking the row PAID).
 */
type RollupRow = {
  student: StoredUser
  /** Representative payment record for the row (latest PAID if any,
   *  otherwise latest PENDING with a proof file, otherwise latest PENDING). */
  payment: PaymentRecord | null
  status: 'PAID' | 'PENDING'
}

export default function PaymentsPanel() {
  const [rows, setRows] = useState<RollupRow[]>([])
  const [filter, setFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL')

  useEffect(() => {
    const students = getUsers().filter(u => u.role === 'STUDENT')
    const payments = getPayments()
    const byStudent: Record<string, PaymentRecord[]> = {}
    for (const p of payments) (byStudent[p.studentId] ??= []).push(p)
    const out: RollupRow[] = students.map(s => {
      const list = byStudent[s.id] ?? []
      const paidList = list.filter(p => p.status === 'PAID')
      const latestPaid = paidList.length
        ? paidList.slice().sort((a, b) =>
            new Date(b.paidAt ?? b.createdAt).getTime() - new Date(a.paidAt ?? a.createdAt).getTime(),
          )[0]
        : null
      // For pending-only students prefer a record that has a proof file
      // (bank deposit) so admins can verify it; otherwise the latest pending.
      const pendingByRecency = list
        .filter(p => p.status === 'PENDING')
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      const latestPendingWithProof = pendingByRecency.find(p => p.proofFileId)
      const latestPending = latestPendingWithProof ?? pendingByRecency[0] ?? null
      const representative = latestPaid ?? latestPending
      return {
        student: s,
        payment: representative,
        status: latestPaid ? 'PAID' : 'PENDING',
      }
    })
    // Order: PAID by paidAt desc, then PENDING by student name asc.
    out.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'PAID' ? -1 : 1
      if (a.status === 'PAID' && b.status === 'PAID') {
        return new Date(b.payment!.paidAt ?? b.payment!.createdAt).getTime() -
               new Date(a.payment!.paidAt ?? a.payment!.createdAt).getTime()
      }
      const an = `${a.student.firstName ?? ''} ${a.student.lastName ?? ''}`.trim().toLowerCase()
      const bn = `${b.student.firstName ?? ''} ${b.student.lastName ?? ''}`.trim().toLowerCase()
      return an.localeCompare(bn)
    })
    setRows(out)
  }, [])

  const filtered = useMemo(
    () => filter === 'ALL' ? rows : rows.filter(r => r.status === filter),
    [rows, filter],
  )
  const totalCollected = rows.reduce(
    (acc, r) => acc + (r.status === 'PAID' && r.payment ? r.payment.tuitionAmount + r.payment.miscAmount : 0),
    0,
  )
  const pendingCount = rows.filter(r => r.status === 'PENDING').length
  const paidCount = rows.filter(r => r.status === 'PAID').length

  return (
    <div className="card-static">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[18px] leading-tight">Payments</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
            {paidCount} paid · {pendingCount} pending · Collected {fmt(totalCollected)}
          </p>
        </div>
        <div className="flex gap-2 p-1 bg-[color:var(--pale-teal)] rounded-xl" style={{ fontFamily: 'var(--font-display)' }}>
          {(['ALL', 'PAID', 'PENDING'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)]'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-auto rounded-xl border" style={{ maxHeight: 480, borderColor: 'var(--paper-3)' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--paper)' }}>
            <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
              <th className="py-2 px-3">Student</th>
              <th className="py-2 px-3">Level</th>
              <th className="py-2 px-3">Plan</th>
              <th className="py-2 px-3">Period</th>
              <th className="py-2 px-3">Date</th>
              <th className="py-2 px-3 text-right">Tuition</th>
              <th className="py-2 px-3 text-right">Misc</th>
              <th className="py-2 px-3 text-right">Total</th>
              <th className="py-2 px-3">Method</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Proof</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="py-6 px-3 text-center text-[color:var(--mid-gray)]">No payment records.</td></tr>
            )}
            {filtered.map(({ student: s, payment: p, status }) => (
              <tr key={s.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                <td className="py-2.5 px-3">
                  <div className="font-semibold text-[color:var(--narra)]">{`${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.email}</div>
                  <div className="text-[11px] text-[color:var(--mid-gray)]">{s.email}</div>
                </td>
                <td className="py-2.5 px-3 text-[12.5px]">{s.level ? levelLabel(s.level) : '—'}</td>
                <td className="py-2.5 px-3 text-[12.5px]">{p?.plan ?? '—'}</td>
                <td className="py-2.5 px-3 text-[12.5px]">{p?.period ?? '—'}</td>
                <td className="py-2.5 px-3 text-[12.5px]">{p ? new Date(p.paidAt ?? p.createdAt).toLocaleDateString() : '—'}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-[12.5px]">{p ? fmt(p.tuitionAmount) : '—'}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-[12.5px]">{p?.miscAmount ? fmt(p.miscAmount) : '—'}</td>
                <td className="py-2.5 px-3 text-right tabular-nums font-bold">{p ? fmt(p.tuitionAmount + p.miscAmount) : '—'}</td>
                <td className="py-2.5 px-3 text-[12.5px]">{methodLabel(p?.method)}</td>
                <td className="py-2.5 px-3"><span className={`badge ${status === 'PAID' ? 'badge-paid' : 'badge-pending'}`}>{status}</span></td>
                <td className="py-2.5 px-3"><AdminProofCell payment={p} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Bank-deposit proof file cell. Shows a View button that opens the
 *  stored blob in a new tab. Returns "—" when the representative row
 *  for the student has no proof attached. */
function AdminProofCell({ payment }: { payment: PaymentRecord | null }) {
  async function open() {
    if (!payment?.proofFileId) return
    const blob = await getFile(payment.proofFileId)
    if (!blob) { alert('Proof file not found in this browser.'); return }
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  if (!payment?.proofFileId) {
    return <span className="text-[11.5px] text-[color:var(--mid-gray)]">—</span>
  }
  return (
    <button type="button" className="btn-secondary text-xs" onClick={open} title={payment.proofFileName ?? 'Proof of payment'}>
      View proof
    </button>
  )
}
