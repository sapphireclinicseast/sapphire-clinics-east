'use client'

import { useEffect, useMemo, useState } from 'react'
import { listPaymentReminderLog, type PaymentReminderLogRow } from '@/lib/session'

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
      : 'Past due'
  }
  function reasonBadgeClass(r: PaymentReminderLogRow['reason']): string {
    return r === 'PAST_DUE' ? 'badge-due' : r === 'DUE_SOON' ? 'badge-pending' : 'badge-approved'
  }

  return (
    <div className="card-static">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>Notifications</div>
          <h2 className="text-[18px] leading-tight">Automated payment reminders</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
            Students who&rsquo;ve been emailed by the daily reminder cron — 5&nbsp;days before the due date, the day before, and the day after if still unpaid. No manual action required.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11.5px] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>Window</label>
          <select className="input text-[13px]" value={sinceDays} onChange={e => setSinceDays(Number(e.target.value))} style={{ maxWidth: 140 }}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 12 months</option>
          </select>
          <input
            className="input text-[13px]"
            placeholder="Search name / email / period"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 260 }}
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">
          No reminders sent yet. The cron fires daily around 9 AM Manila — reminders will appear here once it emails eligible students.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">No reminders match &ldquo;{search}&rdquo;.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([period, list]) => (
            <details key={period} open className="rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
              <summary className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer select-none rounded-xl" style={{ background: 'var(--paper-2)' }}>
                <span className="font-semibold text-[color:var(--narra)] text-sm" style={{ fontFamily: 'var(--font-display)' }}>{period}</span>
                <span className="text-[11.5px] text-[color:var(--mid-gray)]">
                  {list.length} email{list.length === 1 ? '' : 's'} sent
                </span>
              </summary>
              <div className="overflow-x-auto rounded-b-xl">
                <table className="w-full text-sm">
                  <thead style={{ background: '#fff' }}>
                    <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                      <th className="py-2 px-3">Student</th>
                      <th className="py-2 px-3">Branch</th>
                      <th className="py-2 px-3">Plan</th>
                      <th className="py-2 px-3">Reminder</th>
                      <th className="py-2 px-3">Sent at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(r => (
                      <tr key={r.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-[color:var(--narra)]">{r.studentName}</div>
                          <div className="text-[11px] text-[color:var(--mid-gray)]">{r.studentEmail}</div>
                        </td>
                        <td className="py-2 px-3 text-[12.5px]">
                          {r.branch ? (
                            <span
                              className="badge"
                              style={{
                                background: r.branch === 'EAST' ? '#dbeafe' : '#fef3c7',
                                color:      r.branch === 'EAST' ? '#1e40af' : '#92400e',
                              }}
                            >
                              {r.branch === 'EAST' ? 'East' : 'Greenhills'}
                            </span>
                          ) : <span className="text-[color:var(--mid-gray)]">—</span>}
                        </td>
                        <td className="py-2 px-3 text-[12.5px]">
                          {r.plan === 'MONTHLY' ? 'Monthly' : r.plan === 'BIANNUAL' ? 'Bi-annual' : 'Annual'}
                        </td>
                        <td className="py-2 px-3 text-[12.5px]">
                          <span className={`badge ${reasonBadgeClass(r.reason)}`}>{reasonLabel(r.reason)}</span>
                        </td>
                        <td className="py-2 px-3 text-[12.5px] text-[color:var(--mid-gray)]">
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
    </div>
  )
}
