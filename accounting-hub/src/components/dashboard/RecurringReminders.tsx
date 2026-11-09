'use client'

import { useEffect, useState } from 'react'
import { Bell, CalendarClock } from 'lucide-react'
import { HrNoticeModal, HrNoticeRow, hrNoticeBtn } from '@/components/ui/hr-look'

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
    <HrNoticeRow title={r.payee || r.description || r.accountTitle || 'Recurring expense'}
      detail={`${r.branchLabel} · ${freqLabel(r.frequency)}${r.accountTitle ? ` · ${r.accountTitle}` : ''} · ₱${peso(r.gross)}`}
      pill={dueText(r.daysUntil)} pillTone={r.daysUntil <= 0 ? 'red' : 'amber'} meta={r.nextDue} />
  )
}

// Persistent card for the Dashboard.
export function ReminderCard() {
  const reminders = useReminders()
  if (!reminders || reminders.length === 0) return null
  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: 'var(--light-gray)', borderLeft: '4px solid #d97706' }}>
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock size={16} style={{ color: '#b45309' }} />
        <h2 className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Recurring expense reminders</h2>
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
    <HrNoticeModal icon={<Bell size={18} />} title="Recurring expenses due soon" onClose={close}
      tone={reminders.some(r => r.daysUntil <= 0) ? 'red' : 'amber'}
      subtitle={`${reminders.length} recurring expense${reminders.length === 1 ? '' : 's'} need payment within the next 5 days.`}
      footer={<>
        <a href="/expenses" onClick={close} className={`${hrNoticeBtn.primary} flex-1`} style={{ background: 'var(--teal)' }}>Go to Expenses</a>
        <button onClick={close} className={hrNoticeBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Got it</button>
      </>}>
      {reminders.map(r => <Row key={r.id} r={r} />)}
    </HrNoticeModal>
  )
}
