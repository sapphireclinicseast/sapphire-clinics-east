'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getPayments, getUsers, hydrateUsers, hydrateFrontDeskPayments, getFile,
  deleteUser,
  levelLabel,
  currentPeriodPaymentStatusFor, inferPaymentPlanFor,
  didPayForBiannualHalf, didPayForMonth, schoolYearLabelFor, biannualHalfFor,
  unpaidBackMonthsFor,
  sendManualPaymentReminder,
  type PaymentRecord, type PaymentMethod, type PaymentPlan,
  type StoredUser, type EnrollmentLevel,
} from '@/lib/session'
import PaymentReminderNotifications from './PaymentReminderNotifications'


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

/** Current-period deadline for a student who has no PENDING record on
 *  file yet — used by the pending-list to surface DUE students whose
 *  parent never opened /pay for this month / half / year. */
function currentPeriodDeadline(plan: PaymentPlan, today: Date, currentMonthLabel: string): Date {
  void currentMonthLabel
  const y = today.getFullYear()
  if (plan === 'ANNUAL') return new Date(y, 5, 5) // Jun 5 (annual due)
  if (plan === 'BIANNUAL') {
    const m = today.getMonth()
    const d = today.getDate()
    const inSecondHalf = (m === 11 && d >= 5) || (m >= 0 && m <= 4)
    // Second-half due Dec 5 (of the tranche start year); first half Jun 5.
    if (inSecondHalf) {
      const startYear = m === 11 ? y : y - 1
      return new Date(startYear, 11, 5)
    }
    return new Date(y, 5, 5)
  }
  // MONTHLY — due the 5th of the current month.
  return new Date(y, today.getMonth(), 5)
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
  /** Client-side branch filter. Front desk + branch admin pass their
   *  scoped branch so the panel narrows the list even if the local
   *  user cache still has cross-branch rows (e.g. from a prior
   *  main-admin session on the same device). Server-side /users
   *  scoping already applies for the FRONTDESK role, but this belt-
   *  and-suspenders check prevents the panels from ever leaking
   *  cross-branch students. */
  viewerBranch?: 'EAST' | 'GREENHILLS'
}

export default function PaymentsGrouped({
  canSendReminders, senderEmail = 'main@sapphireclinicseast.org', senderName = 'Main admin', senderRole = 'ADMIN',
  canDelete = false, viewerBranch,
}: Props) {
  // Filter students by role/disabled AND — for branch-scoped viewers —
  // the viewer's branch. Same filter used both for the initial
  // localStorage seed and the post-hydrate result so the two agree.
  function activeStudentsOnly(us: StoredUser[]): StoredUser[] {
    return us.filter(u =>
      u.role === 'STUDENT'
      && !u.disabledAt
      && (!viewerBranch || u.branch === viewerBranch)
    )
  }

  // Seed from localStorage on mount so the panels render immediately
  // with the last-known list — a fresh session that hits Payments
  // before Students would otherwise flash a blank state until the
  // hydrateUsers fetch resolves. Empty when the cache is empty.
  const [students, setStudents] = useState<StoredUser[]>(() =>
    typeof window === 'undefined' ? [] : activeStudentsOnly(getUsers())
  )
  const [payments, setPayments] = useState<PaymentRecord[]>(() =>
    typeof window === 'undefined' ? [] : getPayments()
  )
  const [search, setSearch] = useState('')
  const [busyDelete, setBusyDelete] = useState<string | null>(null)
  // Overdue-row "🔔 Remind" — keyed by studentId. `busyRemind` marks
  // the currently-firing row; `remindSent` sticks the ✓ for a few
  // seconds after success so staff can see the ack.
  const [busyRemind, setBusyRemind] = useState<string | null>(null)
  const [remindSent, setRemindSent] = useState<Record<string, boolean>>({})

  async function handleManualRemind(r: Row) {
    if (busyRemind || !r.deadline || !r.plan) return
    const period = r.payment?.period
      || (r.plan === 'MONTHLY'
        ? `${['January','February','March','April','May','June','July','August','September','October','November','December'][r.deadline.getMonth()]} ${r.deadline.getFullYear()}`
        : r.plan === 'BIANNUAL'
          ? (r.deadline.getMonth() >= 11
              ? `Second half SY ${r.deadline.getFullYear()}–${r.deadline.getFullYear() + 1}`
              : `First half SY ${r.deadline.getFullYear()}–${r.deadline.getFullYear() + 1}`)
          : `SY ${r.deadline.getFullYear()}–${r.deadline.getFullYear() + 1}`)
    setBusyRemind(r.student.id)
    const sentAt = await sendManualPaymentReminder({
      studentId: r.student.id,
      period,
      dueOn: r.deadline.toISOString(),
    })
    setBusyRemind(null)
    if (sentAt) {
      setRemindSent(prev => ({ ...prev, [r.student.id]: true }))
      window.setTimeout(() => setRemindSent(prev => ({ ...prev, [r.student.id]: false })), 4000)
    } else {
      alert(`Could not send reminder to ${r.student.email}. Retry?`)
    }
  }

  useEffect(() => {
    hydrateUsers().then(us => setStudents(activeStudentsOnly(us))).catch(() => setStudents(activeStudentsOnly(getUsers())))
    setPayments(getPayments())
    // Pull fresh front-desk payments so the current-period status uses
    // server truth (matches the badge on the student profile). Without
    // this the pending list computes against stale localStorage.
    void hydrateFrontDeskPayments().then(() => setPayments(getPayments())).catch(() => { /* ignore */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerBranch])

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

  /** One row per student. Status is CURRENT-PERIOD-AWARE — matches the
   *  badge on the student profile / Students list. A monthly student who
   *  paid June but not July shows PENDING here (they owe July) even
   *  though a PAID row exists for June. Representative record picks the
   *  latest PAID (for the "last paid" columns) OR the freshest PENDING
   *  when nothing is paid. */
  const rows: Row[] = useMemo(() => {
    const byStudent: Record<string, PaymentRecord[]> = {}
    for (const p of payments) (byStudent[p.studentId] ??= []).push(p)
    const today = new Date()
    const monthLabel = today.toLocaleString('en-US', { month: 'long', year: 'numeric' })
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
      // Current-period status trumps ever-paid: a MONTHLY student who
      // paid June is PENDING for July until they pay again. AND a late
      // enrollee who paid THIS month but skipped an earlier SY month
      // (Ragnar enrolled in July, paid July, never paid June) is also
      // PENDING — surfacing them here means the front desk can chase
      // the missing back-balance.
      const periodStatus = currentPeriodPaymentStatusFor(s.id)
      const backMonths = unpaidBackMonthsFor(s.id).filter(
        m => !(m.year === today.getFullYear() && m.monthIdx === today.getMonth())
      )
      const status: 'PAID' | 'PENDING' = (periodStatus === 'PAID' && backMonths.length === 0)
        ? 'PAID' : 'PENDING'
      // For PAID rows, show the latest paid record. For PENDING rows,
      // prefer a real PENDING record (has proof/amount/method to show)
      // over a stale PAID one — leaving representative null when the
      // parent hasn't opened /pay for the current period yet, so the
      // Amount / Period / Method cells render "—".
      const representative = status === 'PAID' ? latestPaid : latestPending
      const plan = representative?.plan ?? latestPaid?.plan ?? inferPaymentPlanFor(s.id) ?? null
      // Deadline picks the current-period one (July 5 for monthly, next
      // tranche's 5th for biannual) when the student is DUE without an
      // explicit PENDING record on file. Late enrollees with back-balance
      // deadline back to the earliest unpaid month's 5th (Jun 5 for
      // Ragnar) so they sort to the top as most-overdue.
      const deadline: Date | null = status === 'PAID'
        ? null
        : backMonths.length > 0
          ? new Date(backMonths[0].year, backMonths[0].monthIdx, 5)
          : latestPending
            ? deadlineFor(latestPending)
            : plan
              ? currentPeriodDeadline(plan, today, monthLabel)
              : null
      return { student: s, payment: representative, status, plan, deadline }
    })
    return out
  }, [students, payments])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => {
      const branchText = r.student.branch === 'EAST' ? 'east' : r.student.branch === 'GREENHILLS' ? 'greenhills' : ''
      const hay = `${r.student.firstName ?? ''} ${r.student.lastName ?? ''} ${r.student.email} ${r.payment?.plan ?? ''} ${branchText}`.toLowerCase()
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

  // Manual "🔔 Remind" flow was retired — the automated cron
  // (/api/public/class-portal/cron/payment-reminders) now emails the
  // right students at the right time (5 days before, day-before,
  // day-after) and every send is logged for the Notifications panel.
  void senderEmail; void senderName; void senderRole; void canSendReminders

  return (
    <div className="space-y-4">
      <div className="card-static">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-[18px] leading-tight">Pending payments — by deadline</h2>
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
              Closest deadline first. Reminders go out automatically 5 days before, the day before, and the day after each deadline. For an overdue row, click <span aria-hidden>🔔</span> <strong>Remind</strong> to fire a manual reminder email now — every send is logged in the Notifications panel below.
            </p>
          </div>
          <input
            className="input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, plan, or branch"
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
                  <th className="py-2 px-3">Branch</th>
                  <th className="py-2 px-3">Plan</th>
                  <th className="py-2 px-3">Period</th>
                  <th className="py-2 px-3">Deadline</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3">Method</th>
                  <th className="py-2 px-3">Proof</th>
                  <th className="py-2 px-3 text-right">Remind</th>
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
                      <td className="py-2.5 px-3 text-[12.5px]">
                        {r.student.branch ? (
                          <span
                            className="badge"
                            style={{
                              background: r.student.branch === 'EAST' ? '#dbeafe' : '#fef3c7',
                              color:      r.student.branch === 'EAST' ? '#1e40af' : '#92400e',
                            }}
                          >
                            {r.student.branch === 'EAST' ? 'East' : 'Greenhills'}
                          </span>
                        ) : <span className="text-[color:var(--mid-gray)]">—</span>}
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
                      <td className="py-2.5 px-3 text-right">
                        {overdue ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-[11.5px] px-2 py-1 rounded-md font-semibold transition-colors disabled:opacity-50"
                            style={{
                              background: remindSent[r.student.id] ? '#dcfce7' : '#fee2e2',
                              color:      remindSent[r.student.id] ? '#166534' : '#9f1239',
                              border:     `1px solid ${remindSent[r.student.id] ? 'rgba(22,101,52,0.35)' : 'rgba(159,18,42,0.35)'}`,
                            }}
                            onClick={() => void handleManualRemind(r)}
                            disabled={busyRemind === r.student.id}
                            title={`Send an overdue-reminder email to ${r.student.email}`}
                          >
                            {remindSent[r.student.id] ? '✓ Sent'
                              : busyRemind === r.student.id ? 'Sending…'
                              : <><span aria-hidden>🔔</span> Remind</>}
                          </button>
                        ) : (
                          <span className="text-[11px] text-[color:var(--mid-gray)]">—</span>
                        )}
                      </td>
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

      {/* Consolidated single-table view: one plan-type filter drives
          the whole table (Annual / Biannual / Monthly), plus a sub-slice
          picker for Biannual (1st/2nd half) and Monthly (month). PAID /
          PENDING recomputed against the picked slice so admin can ask
          "who paid for August 2026" in one place instead of three cards.  */}
      <PaymentsTable
        rows={filteredRows.filter(r => r.plan)}
        canDelete={canDelete}
        busyDelete={busyDelete}
        onDelete={handleDelete}
      />

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

      {/* Automated payment-reminder log — reads from the daily cron's
          audit log. Renders below the deadline / paying-students cards
          so the front desk can quickly see who's already been contacted
          about a given period. */}
      <PaymentReminderNotifications />
    </div>
  )
}


/** Consolidated single-table view of all paying students. Filters:
 *   - Type of payment: All | Annual | Biannual | Monthly (default All)
 *   - When Biannual: 1st / 2nd half toggle (defaults to current half)
 *   - When Monthly:  per-month dropdown for the SY (defaults to current)
 *  Columns: Name | Plan | Branch | Status (Paid / Pending), where
 *  Status is recomputed against the currently-picked slice so
 *  admin can ask "who's paid for August 2026?" and get an answer
 *  without walking three cards + N accordions. */
function PaymentsTable({
  rows, canDelete, busyDelete, onDelete,
}: {
  rows: Row[]
  canDelete: boolean
  busyDelete: string | null
  onDelete: (s: StoredUser) => void
}) {
  const today = new Date()
  const syLabel = schoolYearLabelFor(today)
  const syStartYear = today.getMonth() > 5 || (today.getMonth() === 5 && today.getDate() >= 5)
    ? today.getFullYear()
    : today.getFullYear() - 1

  const [typeFilter, setTypeFilter] = useState<'ALL' | PaymentPlan>('ALL')
  const [half, setHalf] = useState<'FIRST' | 'SECOND'>(() => biannualHalfFor(today).half)
  const syMonths = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const monthIdx = (5 + i) % 12
    const year = i <= 6 ? syStartYear : syStartYear + 1
    return { key: `${year}-${monthIdx}`, year, monthIdx, label: `${['January','February','March','April','May','June','July','August','September','October','November','December'][monthIdx]} ${year}` }
  }), [syStartYear])
  const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`
  const [monthKey, setMonthKey] = useState<string>(
    syMonths.find(m => m.key === currentMonthKey)?.key ?? syMonths[0].key
  )
  const monthChoice = syMonths.find(m => m.key === monthKey) ?? syMonths[0]

  // 1. Filter by plan type.
  const byType = useMemo(() => (
    typeFilter === 'ALL' ? rows : rows.filter(r => r.plan === typeFilter)
  ), [rows, typeFilter])

  // 2. Recompute per-row PAID/PENDING against the picked slice. For
  //    ALL, we keep the row's current-period status (matches the badge).
  //    For a specific plan, use the plan-appropriate slice helper.
  const sliced: Row[] = useMemo(() => byType.map(r => {
    if (r.plan === 'BIANNUAL' && (typeFilter === 'BIANNUAL' || typeFilter === 'ALL')) {
      if (typeFilter === 'BIANNUAL') {
        return { ...r, status: didPayForBiannualHalf(r.student.id, half, syStartYear) ? 'PAID' : 'PENDING' }
      }
      return r
    }
    if (r.plan === 'MONTHLY' && (typeFilter === 'MONTHLY' || typeFilter === 'ALL')) {
      if (typeFilter === 'MONTHLY') {
        return { ...r, status: didPayForMonth(r.student.id, monthChoice.year, monthChoice.monthIdx) ? 'PAID' : 'PENDING' }
      }
      return r
    }
    return r
  }), [byType, typeFilter, half, syStartYear, monthChoice])

  const sortedRows = useMemo(() => sliced.slice().sort((a, b) => {
    const an = `${a.student.lastName ?? ''} ${a.student.firstName ?? ''}`.trim() || a.student.email
    const bn = `${b.student.lastName ?? ''} ${b.student.firstName ?? ''}`.trim() || b.student.email
    return an.localeCompare(bn)
  }), [sliced])

  const sliceLabel = typeFilter === 'BIANNUAL'
    ? `${half === 'FIRST' ? '1st Biannual' : '2nd Biannual'} · ${syLabel}`
    : typeFilter === 'MONTHLY'
      ? monthChoice.label
      : typeFilter === 'ANNUAL'
        ? syLabel
        : 'All plans · current period'

  const paidCount = sortedRows.filter(r => r.status === 'PAID').length
  const pendingCount = sortedRows.filter(r => r.status === 'PENDING').length

  const typeTabs: Array<{ key: 'ALL' | PaymentPlan; label: string }> = [
    { key: 'ALL',      label: 'All' },
    { key: 'ANNUAL',   label: 'Annual' },
    { key: 'BIANNUAL', label: 'Bi-annual' },
    { key: 'MONTHLY',  label: 'Monthly' },
  ]

  return (
    <div className="card-static">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>Payments</div>
          <h2 className="text-[18px] leading-tight">Paying students</h2>
          <div className="text-[11.5px] text-[color:var(--mid-gray)] mt-0.5">
            Showing: <span className="font-semibold">{sliceLabel}</span> · {paidCount} paid · {pendingCount} pending
          </div>
        </div>
      </div>

      {/* Type-of-payment filter */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="inline-flex rounded-lg p-0.5 border" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
          {typeTabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTypeFilter(t.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${typeFilter === t.key ? 'bg-white shadow-sm text-[color:var(--deep-teal)]' : 'text-[color:var(--mid-gray)]'}`}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {typeFilter === 'BIANNUAL' && (
          <div className="inline-flex rounded-lg p-0.5 border" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
            {(['FIRST', 'SECOND'] as const).map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setHalf(h)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${half === h ? 'bg-white shadow-sm text-[color:var(--deep-teal)]' : 'text-[color:var(--mid-gray)]'}`}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {h === 'FIRST' ? '1st Biannual' : '2nd Biannual'}
              </button>
            ))}
          </div>
        )}

        {typeFilter === 'MONTHLY' && (
          <div className="flex items-center gap-2">
            <label className="text-[11.5px] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>Month</label>
            <select className="input" value={monthKey} onChange={e => setMonthKey(e.target.value)} style={{ maxWidth: 200 }}>
              {syMonths.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {sortedRows.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">No students match this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--paper-3)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--paper-2)' }}>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Plan</th>
                <th className="py-2 px-3">Branch</th>
                <th className="py-2 px-3">Status</th>
                {canDelete && <th className="py-2 px-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => (
                <tr key={r.student.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                  <td className="py-2 px-3">
                    <div className="font-semibold text-[color:var(--narra)]">{[r.student.firstName, r.student.lastName].filter(Boolean).join(' ') || r.student.email}</div>
                    <div className="text-[11px] text-[color:var(--mid-gray)]">{r.student.email}{r.student.level ? ` · ${levelLabel(r.student.level as EnrollmentLevel)}` : ''}</div>
                  </td>
                  <td className="py-2 px-3 text-[12.5px]">{r.plan ? planLabel(r.plan) : '—'}</td>
                  <td className="py-2 px-3 text-[12.5px]">
                    {r.student.branch ? (
                      <span
                        className="badge"
                        style={{
                          background: r.student.branch === 'EAST' ? '#dbeafe' : '#fef3c7',
                          color:      r.student.branch === 'EAST' ? '#1e40af' : '#92400e',
                        }}
                      >
                        {r.student.branch === 'EAST' ? 'East' : 'Greenhills'}
                      </span>
                    ) : <span className="text-[color:var(--mid-gray)]">—</span>}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`badge ${r.status === 'PAID' ? 'badge-paid' : 'badge-pending'}`}>
                      {r.status === 'PAID' ? 'Paid' : 'Pending'}
                    </span>
                  </td>
                  {canDelete && (
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        className="text-[11px] px-2 py-0.5 rounded text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] disabled:opacity-40"
                        onClick={() => onDelete(r.student)}
                        disabled={busyDelete === r.student.id}
                        title="Delete this student account (main admin only)."
                      >
                        {busyDelete === r.student.id ? '…' : 'Delete'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
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
