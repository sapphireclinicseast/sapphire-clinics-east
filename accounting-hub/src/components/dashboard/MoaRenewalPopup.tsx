'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileWarning } from 'lucide-react'
import { HrNoticeModal, HrNoticeRow, hrNoticeBtn } from '@/components/ui/hr-look'
import { MOA_ALERT_DAYS, MOA_ALERT_ROLES, moaStatusText } from '@/lib/hmo-directory'
import { todayManila } from '@/lib/tuition'

interface MoaAlert { walletId: string; hmoName: string; validUntil: string; daysLeft: number }

// Daily popup for HMO officers, the main user and accounting: from 30 days before
// an HMO's MOA expires and every day after, until a later date is saved in
// AR → HMO Directory. Closing it holds it until the next day on this browser; a
// tab left open overnight rechecks when it regains focus.
export function MoaRenewalPopup({ role, userId }: { role?: string; userId: string }) {
  const [alerts, setAlerts] = useState<MoaAlert[]>([])
  const [open, setOpen] = useState(false)
  const checkedOn = useRef('')
  const seenKey = `moaRenewalSeen:${userId}`

  const check = useCallback(() => {
    const today = todayManila()
    if (!role || !MOA_ALERT_ROLES.includes(role) || checkedOn.current === today) return
    checkedOn.current = today
    let seenOn: string | null = null
    try { seenOn = localStorage.getItem(seenKey) } catch { /* optional */ }
    if (seenOn === today) return
    fetch('/api/accounts-receivable/hmo-directory?alerts=1')
      .then(r => (r.ok ? r.json() : { alerts: [] }))
      .then(d => { setAlerts(d.alerts || []); if (d.alerts?.length) setOpen(true) })
      .catch(() => { /* the bell still shows it */ })
  }, [role, seenKey])

  useEffect(() => {
    check()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [check])

  if (!open || alerts.length === 0) return null
  const close = () => {
    try { localStorage.setItem(seenKey, todayManila()) } catch { /* optional */ }
    setOpen(false)
  }
  return (
    <HrNoticeModal icon={<FileWarning size={18} />} title="HMO MOA renewals" onClose={close}
      tone={alerts.some(a => a.daysLeft < 0) ? 'red' : 'amber'}
      subtitle={`${alerts.length} MOA${alerts.length === 1 ? '' : 's'} expired or expiring within ${MOA_ALERT_DAYS} days. This shows every day until the new validity date is saved.`}
      footer={<button onClick={close} className={`${hrNoticeBtn.ghost} flex-1`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Remind me tomorrow</button>}>
      {alerts.map(a => (
        <HrNoticeRow key={a.walletId} title={a.hmoName} pillTone={a.daysLeft < 0 ? 'red' : 'amber'}
          detail={<>Valid until <span className="font-mono">{a.validUntil}</span> · <span style={{ color: a.daysLeft < 0 ? '#b91c1c' : '#92400e', fontWeight: 600 }}>{moaStatusText(a.daysLeft)}</span></>}
          trailing={<a href={`/accounts-receivable?sub=directory&hmo=${encodeURIComponent(a.walletId)}`} onClick={close}
            className="shrink-0 inline-flex items-center h-8 px-3 rounded-lg text-xs font-semibold text-white transition-colors hover:bg-[var(--deep-teal)]" style={{ background: 'var(--teal)' }}>Renew</a>} />
      ))}
    </HrNoticeModal>
  )
}
