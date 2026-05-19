'use client'

import { useEffect, useMemo, useState } from 'react'
import { getPayments, getUsers, levelLabel, type PaymentRecord, type StoredUser } from '@/lib/session'

function fmt(cents: number) {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * One row per enrolled student. Abandoned PENDING checkout attempts are
 * intentionally NOT shown as separate rows — admins only care whether
 * a student has actually paid. For students with at least one PAID
 * record, the latest PAID payment's details are shown. For students
 * who have never completed a payment, a single PENDING row is shown
 * regardless of how many times they started checkout.
 */
type RollupRow = {
  student: StoredUser
  /** The actual PAID record (latest by paidAt) if any, otherwise null. */
  paid: PaymentRecord | null
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
      return { student: s, paid: latestPaid, status: latestPaid ? 'PAID' : 'PENDING' }
    })
    // Order: PAID by paidAt desc, then PENDING by student name asc.
    out.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'PAID' ? -1 : 1
      if (a.status === 'PAID' && b.status === 'PAID') {
        return new Date(b.paid!.paidAt ?? b.paid!.createdAt).getTime() - new Date(a.paid!.paidAt ?? a.paid!.createdAt).getTime()
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
  const totalCollected = rows.reduce((acc, r) => acc + (r.paid ? r.paid.tuitionAmount + r.paid.miscAmount : 0), 0)
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
              <th className="py-2 px-3">Paid on</th>
              <th className="py-2 px-3 text-right">Tuition</th>
              <th className="py-2 px-3 text-right">Misc</th>
              <th className="py-2 px-3 text-right">Total</th>
              <th className="py-2 px-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="py-6 px-3 text-center text-[color:var(--mid-gray)]">No payment records.</td></tr>
            )}
            {filtered.map(({ student: s, paid: p, status }) => (
              <tr key={s.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                <td className="py-2.5 px-3">
                  <div className="font-semibold text-[color:var(--narra)]">{`${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.email}</div>
                  <div className="text-[11px] text-[color:var(--mid-gray)]">{s.email}</div>
                </td>
                <td className="py-2.5 px-3 text-[12.5px]">{s.level ? levelLabel(s.level) : '—'}</td>
                <td className="py-2.5 px-3 text-[12.5px]">{p?.plan ?? '—'}</td>
                <td className="py-2.5 px-3 text-[12.5px]">{p?.period ?? '—'}</td>
                <td className="py-2.5 px-3 text-[12.5px]">{p ? new Date(p.paidAt ?? p.createdAt).toLocaleDateString() : '—'}</td>
                <td className="py-2.5 px-3 text-right font-mono text-[12.5px]">{p ? fmt(p.tuitionAmount) : '—'}</td>
                <td className="py-2.5 px-3 text-right font-mono text-[12.5px]">{p?.miscAmount ? fmt(p.miscAmount) : '—'}</td>
                <td className="py-2.5 px-3 text-right font-mono font-bold">{p ? fmt(p.tuitionAmount + p.miscAmount) : '—'}</td>
                <td className="py-2.5 px-3"><span className={`badge ${status === 'PAID' ? 'badge-paid' : 'badge-pending'}`}>{status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
