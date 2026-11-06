'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileWarning, X } from 'lucide-react'
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
            <FileWarning size={18} style={{ color: 'var(--teal)' }} /> HMO MOA renewals
          </h2>
          <button onClick={close} aria-label="Close"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
          {alerts.length} MOA{alerts.length === 1 ? '' : 's'} expired or expiring within {MOA_ALERT_DAYS} days. This shows every day until the new validity date is saved.
        </p>
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.walletId} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--off-white)' }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{a.hmoName}</p>
                <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                  Valid until {a.validUntil} ·{' '}
                  <span style={{ color: a.daysLeft < 0 ? '#b91c1c' : '#92400e', fontWeight: 600 }}>{moaStatusText(a.daysLeft)}</span>
                </p>
              </div>
              <a href={`/accounts-receivable?sub=directory&hmo=${encodeURIComponent(a.walletId)}`} onClick={close}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
                Renew
              </a>
            </div>
          ))}
        </div>
        <button onClick={close} className="w-full mt-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>
          Remind me tomorrow
        </button>
      </div>
    </div>
  )
}
