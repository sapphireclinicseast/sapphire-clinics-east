'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getPayments, getUsers, hydrateUsers, getFile,
  saveNotification, deleteUser,
  levelLabel,
  type PaymentRecord, type PaymentMethod, type PaymentPlan,
  type StoredUser, type EnrollmentLevel,
} from '@/lib/session'

const ALL_PLANS: PaymentPlan[] = ['ANNUAL', 'BIANNUAL', 'MONTHLY']
const ALL_LEVELS: EnrollmentLevel[] = ['NURSERY', 'KINDER', 'GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','GRADE_6','GRADE_7','GRADE_8','GRADE_9','GRADE_10','GRADE_11','GRADE_12']

function fmt(cents: number) {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function methodLabel(m: PaymentMethod | undefined): string {
  switch (m) {
    case 'PAYMONGO':        return 'PayMongo'
    case 'FRONT_DESK_CASH': return 'Front desk (cash)'
    case 'BANK_DEPOSIT':    return 'Bank deposit'
    default:                return '—'
  }
}

function planLabel(p: PaymentPlan): string {
  switch (p) {
    case 'ANNUAL':   return 'Annual'
    case 'BIANNUAL': return 'Bi-annual'
    case 'MONTHLY':  return 'Monthly'
  }
}

interface Row {
  student: StoredUser
  payment: PaymentRecord | null
  status: 'PAID' | 'PENDING'
  plan: PaymentPlan | null
  deadline: Date | null
}

/** Best-effort deadline date for a pending payment, used to sort the
 *  pending-list at the top of the page. */
function deadlineFor(payment: PaymentRecord | null): Date | null {
  if (!payment) return null
  if (payment.plan === 'ANNUAL') {
    // Annual deadline — every 5th of June.
    const y = new Date(payment.createdAt).getFullYear()
    return new Date(y, 5, 5)
  }
  if (payment.plan === 'BIANNUAL') {
    // Period text tells us which half. Default to June 5 if unclear.
    const y = new Date(payment.createdAt).getFullYear()
    if (/second|Dec/i.test(payment.period)) return new Date(y, 11, 5)
    return new Date(y, 5, 5)
  }
  if (payment.plan === 'MONTHLY') {
    // "August 2026" → August 5, 2026
    const m = /^(\w+)\s+(\d{4})$/.exec(payment.period)
    if (m) {
      const months = ['january','february','march','april','may','june','july','august','september','october','november','december']
      const mi = months.indexOf(m[1].toLowerCase())
      if (mi >= 0) return new Date(Number(m[2]), mi, 5)
    }
    return null
  }
  return null
}

interface Props {
  /** When true, the reminder button is enabled (admin / frontdesk only). */
  canSendReminders?: boolean
  /** Who is sending the reminder, for the saved NotificationRecord. */
  senderEmail?: string
  senderName?: string
  senderRole?: 'ADMIN' | 'TEACHER'
  /** When true, each row shows a Delete button (main admin only). */
  canDelete?: boolean
}

export default function PaymentsGrouped({
  canSendReminders, senderEmail = 'main@sapphireclinicseast.org', senderName = 'Main admin', senderRole = 'ADMIN',
  canDelete = false,
}: Props) {
  const [students, setStudents] = useState<StoredUser[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [search, setSearch] = useState('')
  const [busyReminder, setBusyReminder] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState<string | null>(null)
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({})

  // Disabled accounts are hidden here on top of any other filtering.
  // The Users tab still surfaces them so admin can re-enable.
  function activeStudentsOnly(us: StoredUser[]): StoredUser[] {
    return us.filter(u => u.role === 'STUDENT' && !u.disabledAt)
  }

  useEffect(() => {
    hydrateUsers().then(us => setStudents(activeStudentsOnly(us))).catch(() => setStudents(activeStudentsOnly(getUsers())))
    setPayments(getPayments())
  }, [])

  /**
   * Main-admin hard-delete of a student row. Used when the admin wants
   * to remove a test enrollment or a duplicate from the Payments view.
   * For students who are just no longer pushing through, prefer Disable
   * (preserves enrollment + payment history) — the confirm dialog
   * surfaces that.
   */
  async function handleDelete(s: StoredUser) {
    if (busyDelete) return
    const name = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email
    if (!confirm(`Delete ${name}'s account?\n\nThis hard-deletes the row and removes them from every list. If the student is just no longer pushing through, use Disable in the Users tab instead — that keeps their enrollment + payment history.\n\nProceed with delete?`)) return
    setBusyDelete(s.id)
    try {
      await deleteUser(s.id)
      setStudents(prev => prev.filter(u => u.id !== s.id))
    } catch (e) {
      alert(`Could not delete ${name}. ${(e as Error).message}`)
    } finally {
      setBusyDelete(null)
    }
  }

  /** One row per student. For each, pick the "representative" record:
   *  latest PAID if any, otherwise latest PENDING (with proof preferred). */
  const rows: Row[] = useMemo(() => {
    const byStudent: Record<string, PaymentRecord[]> = {}
    for (const p of payments) (byStudent[p.studentId] ??= []).push(p)
    const out: Row[] = students.map(s => {
      const list = (byStudent[s.id] ?? [])
      const paidList = list.filter(p => p.status === 'PAID')
      const latestPaid = paidList.length
        ? paidList.slice().sort((a, b) =>
            new Date(b.paidAt ?? b.createdAt).getTime() - new Date(a.paidAt ?? a.createdAt).getTime(),
          )[0]
        : null
      const pendingByRecency = list.filter(p => p.status === 'PENDING').slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      const latestPendingWithProof = pendingByRecency.find(p => p.proofFileId)
      const latestPending = latestPendingWithProof ?? pendingByRecency[0] ?? null
      const representative = latestPaid ?? latestPending
      return {
        student: s,
        payment: representative,
        status: latestPaid ? 'PAID' : 'PENDING',
        plan: representative?.plan ?? null,
        deadline: latestPaid ? null : deadlineFor(latestPending),
      }
    })
    return out
  }, [students, payments])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => {
      const hay = `${r.student.firstName ?? ''} ${r.student.lastName ?? ''} ${r.student.email} ${r.payment?.plan ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [rows, search])

  // Pending-list sorted by deadline (closest first; null deadlines at end).
  const pendingByDeadline = useMemo(() => {
    return filteredRows.filter(r => r.status === 'PENDING').sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return a.deadline.getTime() - b.deadline.getTime()
    })
  }, [filteredRows])

  async function sendReminder(r: Row) {
    if (!r.student.level) return
    setBusyReminder(r.student.id)
    try {
      const studentName = [r.student.firstName, r.student.lastName].filter(Boolean).join(' ') || r.student.email
      saveNotification({
        id: 'ntf_' + Math.random().toString(36).slice(2, 10),
        title: 'Payment reminder',
        body: `Hello ${studentName.split(' ')[0] || 'parent'} — this is a friendly reminder to complete your tuition payment via the /pay page in your portal. If you've already paid, please ignore this notice.`,
        authorRole: senderRole === 'TEACHER' ? 'TEACHER' : 'ADMIN',
        authorName: senderName,
        levels: [r.student.level as EnrollmentLevel],
        includeTeachers: false,
        createdAt: new Date().toISOString(),
      })
      setReminderSent(prev => ({ ...prev, [r.student.id]: true }))
      window.setTimeout(() => setReminderSent(prev => ({ ...prev, [r.student.id]: false })), 3500)
    } finally {
      setBusyReminder(null)
    }
  }
  void senderEmail

  return (
    <div className="space-y-4">
      <div className="card-static">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-[18px] leading-tight">Pending payments — by deadline</h2>
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
              Closest deadline first. {canSendReminders ? 'Click 🔔 Remind to push a notification to the student’s portal.' : ''}
            </p>
          </div>
          <input
            className="input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or plan"
            style={{ width: 280 }}
          />
        </div>
        {pendingByDeadline.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">No pending payments. 🎉</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--paper-2)' }}>
                <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                  <th className="py-2 px-3">Student</th>
                  <th className="py-2 px-3">Plan</th>
                  <th className="py-2 px-3">Period</th>
                  <th className="py-2 px-3">Deadline</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3">Method</th>
                  <th className="py-2 px-3">Proof</th>
                  {canSendReminders && <th className="py-2 px-3"></th>}
                  {canDelete && <th className="py-2 px-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {pendingByDeadline.map(r => {
                  const today = new Date()
                  const overdue = r.deadline ? r.deadline < today : false
                  return (
                    <tr key={r.student.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[color:var(--narra)]">{[r.student.firstName, r.student.lastName].filter(Boolean).join(' ') || r.student.email}</div>
                        <div className="text-[11px] text-[color:var(--mid-gray)]">{r.student.email} · {r.student.level ? levelLabel(r.student.level as EnrollmentLevel) : '—'}</div>
                      </td>
                      <td className="py-2.5 px-3 text-[12.5px]">{r.plan ? planLabel(r.plan) : '—'}</td>
                      <td className="py-2.5 px-3 text-[12.5px]">{r.payment?.period ?? '—'}</td>
                      <td className="py-2.5 px-3 text-[12.5px]" style={{ color: overdue ? '#9f1239' : undefined, fontWeight: overdue ? 600 : 400 }}>
                        {r.deadline ? r.deadline.toLocaleDateString() : '—'}
                        {overdue && <span className="ml-1 text-[10.5px] uppercase tracking-[0.08em]">overdue</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{r.payment ? fmt(r.payment.tuitionAmount + r.payment.miscAmount) : '—'}</td>
                      <td className="py-2.5 px-3 text-[12.5px]">{methodLabel(r.payment?.method)}</td>
                      <td className="py-2.5 px-3"><ProofBtn payment={r.payment} /></td>
                      {canSendReminders && (
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            className="btn-cta text-xs"
                            onClick={() => sendReminder(r)}
                            disabled={busyReminder === r.student.id || !r.student.level}
                          >
                            {reminderSent[r.student.id] ? '✓ Sent' : busyReminder === r.student.id ? 'Sending…' : '🔔 Remind'}
                          </button>
                        </td>
                      )}
                      {canDelete && (
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            className="text-[11px] px-2 py-1 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] disabled:opacity-40"
                            onClick={() => void handleDelete(r.student)}
                            disabled={busyDelete === r.student.id}
                            title="Delete this student account (main admin only)."
                          >
                            {busyDelete === r.student.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Grouped by Plan → Grade level */}
      {ALL_PLANS.map(plan => {
        const rowsForPlan = filteredRows.filter(r => r.plan === plan)
        if (rowsForPlan.length === 0) return null
        return (
          <div key={plan} className="card-static">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>Plan</div>
                <h2 className="text-[20px] leading-tight">{planLabel(plan)}</h2>
              </div>
              <div className="text-[12.5px] text-[color:var(--mid-gray)]">
                {rowsForPlan.filter(r => r.status === 'PAID').length} paid · {rowsForPlan.filter(r => r.status === 'PENDING').length} pending
              </div>
            </div>
            <div className="space-y-2.5">
              {ALL_LEVELS.map(lvl => {
                const list = rowsForPlan.filter(r => r.student.level === lvl)
                if (list.length === 0) return null
                return (
                  <details key={lvl} open className="rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
                    <summary className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer select-none rounded-xl" style={{ background: 'var(--paper-2)' }}>
                      <span className="font-semibold text-[color:var(--narra)] text-sm" style={{ fontFamily: 'var(--font-display)' }}>{levelLabel(lvl)}</span>
                      <span className="text-[11.5px] text-[color:var(--mid-gray)]">
                        {list.filter(r => r.status === 'PAID').length} paid · {list.filter(r => r.status === 'PENDING').length} pending
                      </span>
                    </summary>
                    <ul className="divide-y" style={{ borderColor: 'var(--paper-3)' }}>
                      {list.map(r => (
                        <li key={r.student.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-[color:var(--narra)] truncate">{[r.student.firstName, r.student.lastName].filter(Boolean).join(' ') || r.student.email}</div>
                            <div className="text-[11.5px] text-[color:var(--mid-gray)] truncate">
                              {r.student.email} · {r.payment ? `${methodLabel(r.payment.method)} · ${fmt(r.payment.tuitionAmount + r.payment.miscAmount)}` : 'No payment yet'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`badge ${r.status === 'PAID' ? 'badge-paid' : 'badge-pending'}`}>{r.status}</span>
                            {canSendReminders && r.status === 'PENDING' && (
                              <button
                                type="button"
                                className="btn-secondary text-xs"
                                onClick={() => sendReminder(r)}
                                disabled={busyReminder === r.student.id || !r.student.level}
                              >
                                {reminderSent[r.student.id] ? '✓ Sent' : '🔔'}
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className="text-[11px] px-2 py-0.5 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] disabled:opacity-40"
                                onClick={() => void handleDelete(r.student)}
                                disabled={busyDelete === r.student.id}
                                title="Delete this student account (main admin only)."
                              >
                                {busyDelete === r.student.id ? '…' : 'Delete'}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Students with no plan / no payment yet — surface so admin can chase them. */}
      {filteredRows.some(r => !r.plan) && (
        <div className="card-static">
          <h2 className="text-[18px] leading-tight mb-1">No payment record yet</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mb-3">Students who haven&apos;t started checkout. Send them a reminder to pay.</p>
          <ul className="divide-y rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
            {filteredRows.filter(r => !r.plan).map(r => (
              <li key={r.student.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold text-[color:var(--narra)] truncate">{[r.student.firstName, r.student.lastName].filter(Boolean).join(' ') || r.student.email}</div>
                  <div className="text-[11.5px] text-[color:var(--mid-gray)] truncate">{r.student.email} · {r.student.level ? levelLabel(r.student.level as EnrollmentLevel) : '—'}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canSendReminders && (
                    <button type="button" className="btn-cta text-xs" onClick={() => sendReminder(r)} disabled={!r.student.level}>
                      {reminderSent[r.student.id] ? '✓ Sent' : '🔔 Remind'}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="text-[11px] px-2 py-1 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] disabled:opacity-40"
                      onClick={() => void handleDelete(r.student)}
                      disabled={busyDelete === r.student.id}
                      title="Delete this student account (main admin only)."
                    >
                      {busyDelete === r.student.id ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ProofBtn({ payment }: { payment: PaymentRecord | null }) {
  async function open() {
    if (!payment?.proofFileId) return
    const blob = await getFile(payment.proofFileId)
    if (!blob) { alert('Proof file not found in this browser.'); return }
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  if (!payment?.proofFileId) {
    return <span className="text-[11.5px] text-[color:var(--mid-gray)]">—</span>
  }
  return <button type="button" className="btn-secondary text-xs" onClick={open}>View</button>
}
