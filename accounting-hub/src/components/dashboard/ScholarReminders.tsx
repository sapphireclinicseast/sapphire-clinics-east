'use client'

import { useEffect, useState } from 'react'
import { GraduationCap, X } from 'lucide-react'

interface ScholarReminder {
  awardId: string
  name: string
  school: string | null
  scholarshipType: string | null
  monthKey: string
  label: string
  amount: number
  nextDue: string
  daysUntil: number
}

const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dueText = (d: number) => (d <= 0 ? 'Due now' : d === 1 ? 'Due tomorrow' : `Due in ${d} days`)

// One-per-session popup shown on entering the hub, for admin/accountant/bookkeeper.
export function ScholarReminderPopup() {
  const [reminders, setReminders] = useState<ScholarReminder[] | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    fetch('/api/scholars/reminders')
      .then(r => (r.ok ? r.json() : { reminders: [] }))
      .then(d => { if (alive) setReminders(d.reminders || []) })
      .catch(() => { if (alive) setReminders([]) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (reminders && reminders.length > 0 && typeof window !== 'undefined') {
      if (!sessionStorage.getItem('scholarReminderSeen')) setOpen(true)
    }
  }, [reminders])
  if (!open || !reminders || reminders.length === 0) return null
  const close = () => { try { sessionStorage.setItem('scholarReminderSeen', '1') } catch { /* ignore */ } setOpen(false) }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
            <GraduationCap size={18} style={{ color: 'var(--teal)' }} /> Scholar remittances due soon
          </h2>
          <button onClick={close}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
          {reminders.length} scholar{reminders.length === 1 ? '' : 's'} need a stipend released within the next 3 days.
        </p>
        <div className="space-y-2">
          {reminders.map(r => (
            <div key={r.awardId} className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--off-white)' }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{r.name}</p>
                <p className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>{r.label}{r.school ? ` · ${r.school}` : ''} · {peso(r.amount)}</p>
              </div>
              <div className="text-right whitespace-nowrap">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={r.daysUntil <= 0 ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#fef3c7', color: '#92400e' }}>{dueText(r.daysUntil)}</span>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{r.nextDue}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-5">
          <a href="/scholars" onClick={close} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white text-center" style={{ background: 'var(--teal)' }}>Go to Scholars</a>
          <button onClick={close} className="px-4 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Got it</button>
        </div>
      </div>
    </div>
  )
}
