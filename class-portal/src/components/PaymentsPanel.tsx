'use client'

import { useEffect, useState } from 'react'
import { getPayments, getUsers, levelLabel, type PaymentRecord, type StoredUser } from '@/lib/session'

function fmt(cents: number) {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PaymentsPanel() {
  const [rows, setRows] = useState<Array<{ payment: PaymentRecord; student: StoredUser | null }>>([])
  const [filter, setFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL')

  useEffect(() => {
    const users = getUsers()
    const all = getPayments().slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    setRows(all.map(p => ({ payment: p, student: users.find(u => u.id === p.studentId) ?? null })))
  }, [])

  const filtered = filter === 'ALL' ? rows : rows.filter(r => r.payment.status === filter)
  const totals = filtered.reduce((acc, r) => acc + r.payment.tuitionAmount + r.payment.miscAmount, 0)

  return (
    <div className="card-static">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[18px] leading-tight">Payments</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
            {filtered.length} record{filtered.length === 1 ? '' : 's'} · Total {fmt(totals)}
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
              <th className="py-2 px-3">Date</th>
              <th className="py-2 px-3">Student</th>
              <th className="py-2 px-3">Level</th>
              <th className="py-2 px-3">Plan</th>
              <th className="py-2 px-3">Period</th>
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
            {filtered.map(({ payment: p, student: s }) => (
              <tr key={p.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                <td className="py-2.5 px-3 text-[12.5px]">{new Date(p.paidAt ?? p.createdAt).toLocaleDateString()}</td>
                <td className="py-2.5 px-3">
                  <div className="font-semibold text-[color:var(--narra)]">{s ? `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() : p.studentEmail}</div>
                  <div className="text-[11px] text-[color:var(--mid-gray)]">{p.studentEmail}</div>
                </td>
                <td className="py-2.5 px-3 text-[12.5px]">{s?.level ? levelLabel(s.level) : '—'}</td>
                <td className="py-2.5 px-3 text-[12.5px]">{p.plan}</td>
                <td className="py-2.5 px-3 text-[12.5px]">{p.period}</td>
                <td className="py-2.5 px-3 text-right font-mono text-[12.5px]">{fmt(p.tuitionAmount)}</td>
                <td className="py-2.5 px-3 text-right font-mono text-[12.5px]">{p.miscAmount ? fmt(p.miscAmount) : '—'}</td>
                <td className="py-2.5 px-3 text-right font-mono font-bold">{fmt(p.tuitionAmount + p.miscAmount)}</td>
                <td className="py-2.5 px-3"><span className={`badge ${p.status === 'PAID' ? 'badge-paid' : 'badge-pending'}`}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
