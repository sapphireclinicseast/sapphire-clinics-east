'use client'

import { useEffect, useState } from 'react'
import { Landmark } from 'lucide-react'
import { HrNoticeModal, HrNoticeRow, hrNoticeBtn } from '@/components/ui/hr-look'
import { computeTaxDue, type TaxDueInfo } from '@/lib/taxes'

const TAX_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const WINDOW_DAYS = 5
const dueText = (d: number) => (d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${d} days`)

function Row({ r }: { r: TaxDueInfo }) {
  return <HrNoticeRow title={r.name} detail={r.forms} pill={dueText(r.daysUntil)} pillTone={r.daysUntil <= 0 ? 'red' : 'amber'} meta={r.nextDue} />
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
    <HrNoticeModal icon={<Landmark size={18} />} title="BIR tax deadlines" onClose={close}
      tone={due.some(d => d.daysUntil <= 0) ? 'red' : 'amber'}
      subtitle={`${due.length} tax filing${due.length === 1 ? '' : 's'} due within the next ${WINDOW_DAYS} days.`}
      footer={<>
        <a href="/taxes" onClick={close} className={`${hrNoticeBtn.primary} flex-1`} style={{ background: 'var(--teal)' }}>Go to Taxes</a>
        <button onClick={close} className={hrNoticeBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Got it</button>
      </>}>
      {due.map(r => <Row key={r.key} r={r} />)}
    </HrNoticeModal>
  )
}
