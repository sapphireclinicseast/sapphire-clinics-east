'use client'

import { useEffect, useState } from 'react'
import { Landmark, X } from 'lucide-react'
import { computeTaxDue, type TaxDueInfo } from '@/lib/taxes'

const TAX_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const WINDOW_DAYS = 5
const dueText = (d: number) => (d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${d} days`)

function Row({ r }: { r: TaxDueInfo }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--off-white)' }}>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{r.name}</p>
        <p className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>{r.forms}</p>
      </div>
      <div className="text-right whitespace-nowrap">
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
          style={r.daysUntil <= 0 ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#fef3c7', color: '#92400e' }}>
          {dueText(r.daysUntil)}
        </span>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{r.nextDue}</p>
      </div>
    </div>
  )
}

// One-per-session popup for accountants/bookkeepers/admin when a BIR tax
// deadline is within 5 days.
export function TaxDeadlinePopup({ role }: { role?: string }) {
  const [due, setDue] = useState<TaxDueInfo[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!role || !TAX_ROLES.includes(role)) { setDue([]); return }
    const soon = computeTaxDue(new Date()).filter(d => d.daysUntil <= WINDOW_DAYS).sort((a, b) => a.daysUntil - b.daysUntil)
    setDue(soon)
  }, [role])

  useEffect(() => {
    if (due && due.length > 0 && typeof window !== 'undefined' && !sessionStorage.getItem('taxDeadlineSeen')) setOpen(true)
  }, [due])

  if (!open || !due || due.length === 0) return null
  const close = () => { try { sessionStorage.setItem('taxDeadlineSeen', '1') } catch { /* ignore */ } setOpen(false) }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
            <Landmark size={18} style={{ color: 'var(--teal)' }} /> BIR tax deadlines
          </h2>
          <button onClick={close}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
          {due.length} tax filing{due.length === 1 ? '' : 's'} due within the next {WINDOW_DAYS} days.
        </p>
        <div className="space-y-2">
          {due.map(r => <Row key={r.key} r={r} />)}
        </div>
        <button onClick={close} className="w-full mt-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
          Got it
        </button>
      </div>
    </div>
  )
}
