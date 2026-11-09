'use client'

import { useEffect, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { HrNoticeModal, HrNoticeRow, hrNoticeBtn } from '@/components/ui/hr-look'

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
    <HrNoticeModal icon={<GraduationCap size={18} />} title="Scholar remittances due soon" onClose={close}
      tone={reminders.some(r => r.daysUntil <= 0) ? 'red' : 'amber'}
      subtitle={`${reminders.length} scholar${reminders.length === 1 ? '' : 's'} need a stipend released within the next 3 days.`}
      footer={<>
        <a href="/scholars" onClick={close} className={`${hrNoticeBtn.primary} flex-1`} style={{ background: 'var(--teal)' }}>Go to Scholars</a>
        <button onClick={close} className={hrNoticeBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Got it</button>
      </>}>
      {reminders.map(r => (
        <HrNoticeRow key={r.awardId} title={r.name} detail={`${r.label}${r.school ? ` · ${r.school}` : ''} · ${peso(r.amount)}`}
          pill={dueText(r.daysUntil)} pillTone={r.daysUntil <= 0 ? 'red' : 'amber'} meta={r.nextDue} />
      ))}
    </HrNoticeModal>
  )
}
