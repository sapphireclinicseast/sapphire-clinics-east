'use client'

import { useEffect, useState } from 'react'
import { Bell, X, CalendarClock } from 'lucide-react'

interface Reminder {
  id: string
  branch: string
  branchLabel: string
  payee: string | null
  description: string | null
  accountTitle: string | null
  gross: number
  frequency: string
  distributeMonthly: boolean
  nextDue: string
  daysUntil: number
}

const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const freqLabel = (f: string) => ({ MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', BIANNUALLY: 'Biannually', ANNUALLY: 'Annually' }[f] || f)
const dueText = (d: number) => (d <= 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${d} days`)

function useReminders() {
  const [reminders, setReminders] = useState<Reminder[] | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/expenses/reminders')
      .then(r => (r.ok ? r.json() : { reminders: [] }))
      .then(d => { if (alive) setReminders(d.reminders || []) })
      .catch(() => { if (alive) setReminders([]) })
    return () => { alive = false }
  }, [])
  return reminders
}

function Row({ r }: { r: Reminder }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--off-white)' }}>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>
          {r.payee || r.description || r.accountTitle || 'Recurring expense'}
        </p>
        <p className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>
          {r.branchLabel} · {freqLabel(r.frequency)}{r.accountTitle ? ` · ${r.accountTitle}` : ''} · ₱{peso(r.gross)}
        </p>
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

// Persistent card for the Dashboard.
export function ReminderCard() {
  const reminders = useReminders()
  if (!reminders || reminders.length === 0) return null
  return (
    <div className="rounded-2xl border bg-white p-5 mb-6" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock size={18} style={{ color: 'var(--teal)' }} />
        <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>Recurring expense reminders</h2>
        <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{reminders.length}</span>
      </div>
      <div className="space-y-2">
        {reminders.map(r => <Row key={r.id} r={r} />)}
      </div>
    </div>
  )
}

// One-per-session popup shown on entering the hub.
export function ReminderPopup() {
  const reminders = useReminders()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (reminders && reminders.length > 0 && typeof window !== 'undefined') {
      if (!sessionStorage.getItem('recurReminderSeen')) setOpen(true)
    }
  }, [reminders])
  if (!open || !reminders || reminders.length === 0) return null
  const close = () => { try { sessionStorage.setItem('recurReminderSeen', '1') } catch { /* ignore */ } setOpen(false) }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
            <Bell size={18} style={{ color: 'var(--teal)' }} /> Recurring expenses due soon
          </h2>
          <button onClick={close}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
          {reminders.length} recurring expense{reminders.length === 1 ? '' : 's'} need payment within the next 5 days.
        </p>
        <div className="space-y-2">
          {reminders.map(r => <Row key={r.id} r={r} />)}
        </div>
        <button onClick={close} className="w-full mt-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
          Got it
        </button>
      </div>
    </div>
  )
}
