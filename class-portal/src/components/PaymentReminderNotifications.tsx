'use client'

import { useEffect, useMemo, useState } from 'react'
import { listPaymentReminderLog, type PaymentReminderLogRow } from '@/lib/session'
import {
  DashCard, RowsSkeleton, EmptyState, StatusPill, Tag, Icon,
  CONTROL, CONTROL_STYLE, TH, TH_STYLE, TD, TR, TR_STYLE, SUBTLE_BG, FOCUS, type Tone,
} from '@/components/hub/ui'

/** "Notifications" card for the class-portal Payments tab. Reads the
 *  automated payment-reminder log (populated by the daily cron) and
 *  lists who has been emailed and why. Replaces the manual "🔔 Remind"
 *  button on individual rows — the front desk no longer has to send
 *  reminders themselves.
 *
 *  Groups by period (e.g. "August 2026" for MONTHLY) so the front desk
 *  can see at-a-glance which students have already been contacted
 *  about a given billing period. */
export default function PaymentReminderNotifications() {
  const [rows, setRows] = useState<PaymentReminderLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sinceDays, setSinceDays] = useState(30)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void listPaymentReminderLog({ sinceDays, limit: 500 }).then(list => {
      if (cancelled) return
      setRows(list)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [sinceDays])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => {
      const hay = `${r.studentName} ${r.studentEmail} ${r.period} ${r.plan} ${r.branch ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [rows, search])

  // Group by period (e.g. "August 2026" for MONTHLY, "First half SY
  // 2026–2027" for BIANNUAL). Preserves the API's sent-desc order
  // within each group so the newest reminder for each period floats.
  const groups = useMemo(() => {
    const m = new Map<string, PaymentReminderLogRow[]>()
    for (const r of filtered) {
      if (!m.has(r.period)) m.set(r.period, [])
      m.get(r.period)!.push(r)
    }
    // Sort periods by the most recent sentAt in each — freshest first.
    return Array.from(m.entries()).sort((a, b) => {
      const at = Math.max(...a[1].map(r => new Date(r.sentAt).getTime()))
      const bt = Math.max(...b[1].map(r => new Date(r.sentAt).getTime()))
      return bt - at
    })
  }, [filtered])

  function reasonLabel(reason: PaymentReminderLogRow['reason']): string {
    return reason === 'WINDOW_OPEN' ? '5-day heads-up'
      : reason === 'DUE_SOON'     ? 'Due tomorrow'
      : reason === 'PAST_DUE'     ? 'Past due'
      : 'Manual reminder'
  }
  // Tone for the reason pill. The words carry the meaning; the colour
  // only ranks urgency (past due > due tomorrow > heads-up / manual).
  function reasonTone(r: PaymentReminderLogRow['reason']): Tone {
    return r === 'PAST_DUE' ? 'error'
      : r === 'DUE_SOON' ? 'warn'
      : r === 'MANUAL'   ? 'neutral'
      : 'info'
  }

  return (
    <DashCard
      flush
      title="Automated payment reminders"
      icon={<Icon name="clock" size={15} />}
      description={<>Students who&rsquo;ve been emailed by the daily reminder cron — 5&nbsp;days before the due date, the day before, and the day after if still unpaid. No manual action required.</>}
      action={!loading && rows.length > 0 ? <StatusPill tone="info">{filtered.length} email{filtered.length === 1 ? '' : 's'}</StatusPill> : undefined}
    >
      <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <label className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>Window</span>
          <select className={CONTROL} style={{ ...CONTROL_STYLE, maxWidth: 160 }} value={sinceDays} onChange={e => setSinceDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 12 months</option>
          </select>
        </label>
        <label className="relative flex-1 min-w-0 sm:max-w-[320px]">
          <span className="sr-only">Search reminders</span>
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
          <input
            className={`${CONTROL} w-full pl-8`}
            style={CONTROL_STYLE}
            placeholder="Search name / email / period"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <RowsSkeleton rows={4} label="Loading reminders" />
      ) : rows.length === 0 ? (
        <EmptyState icon="clock" title="No reminders sent yet." hint="The cron fires daily around 9 AM Manila — reminders will appear here once it emails eligible students." />
      ) : filtered.length === 0 ? (
        <EmptyState icon="search" title={`No reminders match “${search}”.`} hint="Try a name, email or period." />
      ) : (
        <div className="p-4 sm:p-5 space-y-3">
          {groups.map(([period, list]) => (
            <details key={period} open className="group rounded-xl overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
              <summary className={`flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden ${FOCUS}`} style={{ background: SUBTLE_BG }}>
                <span className="flex items-center gap-2 min-w-0">
                  <Icon name="chevronRight" size={14} className="transition-transform group-open:rotate-90" style={{ color: 'var(--mid-gray)' }} />
                  <span className="font-semibold text-sm truncate" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{period}</span>
                </span>
                <span className="text-[11.5px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                  {list.length} email{list.length === 1 ? '' : 's'} sent
                </span>
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th className={TH} style={{ ...TH_STYLE, background: '#fff' }}>Student</th>
                      <th className={TH} style={{ ...TH_STYLE, background: '#fff' }}>Branch</th>
                      <th className={TH} style={{ ...TH_STYLE, background: '#fff' }}>Plan</th>
                      <th className={TH} style={{ ...TH_STYLE, background: '#fff' }}>Reminder</th>
                      <th className={TH} style={{ ...TH_STYLE, background: '#fff' }}>Sent at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(r => (
                      <tr key={r.id} className={TR} style={TR_STYLE}>
                        <td className={TD}>
                          <div className="font-semibold" style={{ color: 'var(--charcoal)' }}>{r.studentName}</div>
                          <div className="text-[11px] break-all" style={{ color: 'var(--mid-gray)' }}>{r.studentEmail}</div>
                        </td>
                        <td className={TD}>
                          {r.branch ? (
                            <Tag tone={r.branch === 'EAST' ? 'brand' : 'info'}>{r.branch === 'EAST' ? 'East' : 'Greenhills'}</Tag>
                          ) : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                        </td>
                        <td className={`${TD} text-[12.5px]`}>
                          {r.plan === 'MONTHLY' ? 'Monthly' : r.plan === 'BIANNUAL' ? 'Bi-annual' : 'Annual'}
                        </td>
                        <td className={TD}>
                          <StatusPill tone={reasonTone(r.reason)}>{reasonLabel(r.reason)}</StatusPill>
                        </td>
                        <td className={`${TD} text-[12.5px] whitespace-nowrap`} style={{ color: 'var(--mid-gray)' }}>
                          {new Date(r.sentAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </DashCard>
  )
}
