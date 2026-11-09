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
import {
  DashCard, KpiCard, EmptyState, StatusPill, Tag, Icon, PillTabs,
  CONTROL, CONTROL_SM, CONTROL_STYLE, LABEL_STYLE, BTN_SM, BTN_DANGER_GHOST, SECONDARY_STYLE,
  TH, TH_STYLE, TD, TR, TR_STYLE, DANGER,
} from '@/components/hub/ui'


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

  // Headline counts for the tiles. Same row statuses and the same
  // "deadline before today" overdue rule the pending table uses.
  const todayForCounts = new Date()
  const paidTotal = rows.filter(r => r.status === 'PAID').length
  const pendingTotal = rows.filter(r => r.status === 'PENDING').length
  const overdueTotal = rows.filter(r => r.status === 'PENDING' && r.deadline && r.deadline < todayForCounts).length
  const noRecordTotal = rows.filter(r => !r.plan).length
  const noRecordRows = filteredRows.filter(r => !r.plan)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Paid this period" icon={<Icon name="check" />} value={paidTotal} sub={`of ${rows.length} active students`} />
        <KpiCard label="Pending" icon={<Icon name="clock" />} accent="var(--sun)" value={pendingTotal} sub="Owe the current period" />
        <KpiCard label="Overdue" icon={<Icon name="alert" />} accent={DANGER} value={overdueTotal} sub="Deadline has passed" />
        <KpiCard label="No payment record" icon={<Icon name="users" />} accent="var(--slate)" value={noRecordTotal} sub="Never started checkout" />
      </div>

      {/* One search drives every list in this panel. */}
      <label className="relative block w-full sm:max-w-[360px]">
        <span className="sr-only">Search students in the payment lists</span>
        <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
        <input
          className={`${CONTROL} w-full pl-8`}
          style={CONTROL_STYLE}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, plan, or branch"
        />
      </label>

      <DashCard
        flush
        title="Pending payments — by deadline"
        icon={<Icon name="clock" size={15} />}
        description={<>Closest deadline first. Reminders go out automatically 5 days before, the day before, and the day after each deadline. For an overdue row, click <strong>Remind</strong> to send a reminder email now — every send is logged in the reminders card below.</>}
        action={pendingByDeadline.length > 0 ? <StatusPill tone="warn">{pendingByDeadline.length} pending</StatusPill> : undefined}
      >
        {pendingByDeadline.length === 0 ? (
          <EmptyState icon="check" title={search.trim() ? `No pending payments match “${search}”.` : 'No pending payments.'} hint={search.trim() ? 'Try a name, email, plan or branch.' : 'Every active student is paid for the current period.'} />
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 520 }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: canDelete ? 1040 : 960 }}>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={TH} style={TH_STYLE}>Student</th>
                  <th className={TH} style={TH_STYLE}>Branch</th>
                  <th className={TH} style={TH_STYLE}>Plan</th>
                  <th className={TH} style={TH_STYLE}>Period</th>
                  <th className={TH} style={TH_STYLE}>Deadline</th>
                  <th className={`${TH} text-right`} style={TH_STYLE}>Amount</th>
                  <th className={TH} style={TH_STYLE}>Method</th>
                  <th className={TH} style={TH_STYLE}>Proof</th>
                  <th className={`${TH} text-right`} style={TH_STYLE}>Remind</th>
                  {canDelete && <th className={`${TH} text-right`} style={TH_STYLE}><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {pendingByDeadline.map(r => {
                  const today = new Date()
                  const overdue = r.deadline ? r.deadline < today : false
                  return (
                    <tr key={r.student.id} className={TR} style={TR_STYLE}>
                      <StudentCell student={r.student} />
                      <td className={TD}><BranchTag branch={r.student.branch} /></td>
                      <td className={`${TD} text-[12.5px]`}>{r.plan ? planLabel(r.plan) : '—'}</td>
                      <td className={`${TD} text-[12.5px]`}>{r.payment?.period ?? '—'}</td>
                      <td className={`${TD} text-[12.5px] whitespace-nowrap`}>
                        <div style={{ color: overdue ? DANGER : 'var(--charcoal)', fontWeight: overdue ? 600 : 400 }}>{r.deadline ? r.deadline.toLocaleDateString() : '—'}</div>
                        {r.deadline && (
                          <div className="mt-1">
                            {overdue ? <StatusPill tone="error">Overdue</StatusPill> : <StatusPill tone="warn">Due</StatusPill>}
                          </div>
                        )}
                      </td>
                      <td className={`${TD} text-right tabular-nums whitespace-nowrap font-semibold`} style={{ color: 'var(--charcoal)' }}>{r.payment ? fmt(r.payment.tuitionAmount + r.payment.miscAmount) : '—'}</td>
                      <td className={`${TD} text-[12.5px]`}>{methodLabel(r.payment?.method)}</td>
                      <td className={TD}><ProofBtn payment={r.payment} /></td>
                      <td className={`${TD} text-right`}>
                        {overdue ? (
                          <button
                            type="button"
                            className={BTN_SM}
                            style={remindSent[r.student.id]
                              ? { background: '#EEF5E8', color: '#2F5A28', border: '1px solid #CFE0BF' }
                              : { ...SECONDARY_STYLE, color: DANGER, border: '1px solid #FECACA' }}
                            onClick={() => void handleManualRemind(r)}
                            disabled={busyRemind === r.student.id}
                            title={`Send an overdue-reminder email to ${r.student.email}`}
                          >
                            {remindSent[r.student.id] ? <><Icon name="check" size={12} /> Sent</>
                              : busyRemind === r.student.id ? 'Sending…'
                              : <><Icon name="alert" size={12} /> Remind</>}
                          </button>
                        ) : (
                          <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>—</span>
                        )}
                      </td>
                      {canDelete && (
                        <td className={`${TD} text-right`}>
                          <button
                            type="button"
                            className={BTN_DANGER_GHOST}
                            style={{ color: DANGER }}
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
      </DashCard>

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
      {noRecordRows.length > 0 && (
        <DashCard
          flush
          title="No payment record yet"
          icon={<Icon name="users" size={15} />}
          description="Students who haven't started checkout. Send them a reminder to pay."
          action={<StatusPill tone="neutral">{noRecordRows.length} student{noRecordRows.length === 1 ? '' : 's'}</StatusPill>}
        >
          <ul className="overflow-auto" style={{ maxHeight: 420 }}>
            {noRecordRows.map((r, i) => (
              <li key={r.student.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 text-sm" style={i ? TR_STYLE : undefined}>
                <div className="min-w-0">
                  <div className="font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{[r.student.firstName, r.student.lastName].filter(Boolean).join(' ') || r.student.email}</div>
                  <div className="text-[11.5px] truncate" style={{ color: 'var(--mid-gray)' }}>{r.student.email} · {r.student.level ? levelLabel(r.student.level as EnrollmentLevel) : '—'}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <BranchTag branch={r.student.branch} />
                  {canDelete && (
                    <button
                      type="button"
                      className={BTN_DANGER_GHOST}
                      style={{ color: DANGER }}
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
        </DashCard>
      )}

      {/* Automated payment-reminder log — reads from the daily cron's
          audit log. Renders below the deadline / paying-students cards
          so the front desk can quickly see who's already been contacted
          about a given period. */}
      <PaymentReminderNotifications />
    </div>
  )
}

/** Name over email · level, shared by both tables. */
function StudentCell({ student }: { student: StoredUser }) {
  return (
    <td className={TD} style={{ minWidth: 200 }}>
      <div className="font-semibold" style={{ color: 'var(--charcoal)' }}>{[student.firstName, student.lastName].filter(Boolean).join(' ') || student.email}</div>
      <div className="text-[11px] break-all" style={{ color: 'var(--mid-gray)' }}>{student.email}{student.level ? ` · ${levelLabel(student.level as EnrollmentLevel)}` : ''}</div>
    </td>
  )
}

function BranchTag({ branch }: { branch: StoredUser['branch'] }) {
  if (!branch) return <span style={{ color: 'var(--mid-gray)' }}>—</span>
  return <Tag tone={branch === 'EAST' ? 'brand' : 'info'}>{branch === 'EAST' ? 'East' : 'Greenhills'}</Tag>
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
    <DashCard
      flush
      title="Paying students"
      icon={<Icon name="wallet" size={15} />}
      description={<>Showing <span className="font-semibold">{sliceLabel}</span> · {paidCount} paid · {pendingCount} pending</>}
    >
      {/* Type-of-payment filter */}
      <div className="px-4 sm:px-5 py-3 flex items-center gap-2 flex-wrap" style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <PillTabs
          label="Filter by type of payment"
          size="sm"
          tabs={typeTabs.map(t => ({ id: t.key, label: t.label }))}
          value={typeFilter}
          onChange={id => setTypeFilter(id as 'ALL' | PaymentPlan)}
        />

        {typeFilter === 'BIANNUAL' && (
          <PillTabs
            label="Bi-annual installment"
            size="sm"
            tabs={(['FIRST', 'SECOND'] as const).map(h => ({ id: h, label: h === 'FIRST' ? '1st Biannual' : '2nd Biannual' }))}
            value={half}
            onChange={id => setHalf(id as 'FIRST' | 'SECOND')}
          />
        )}

        {typeFilter === 'MONTHLY' && (
          <div className="flex items-center gap-2">
            <label htmlFor="paying-students-month" className="text-[11px] font-semibold uppercase tracking-wider" style={LABEL_STYLE}>Month</label>
            <select id="paying-students-month" className={CONTROL_SM} style={{ ...CONTROL_STYLE, maxWidth: 200 }} value={monthKey} onChange={e => setMonthKey(e.target.value)}>
              {syMonths.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {sortedRows.length === 0 ? (
        <EmptyState icon="search" title="No students match this filter." hint="Try another plan type, or clear the search above." />
      ) : (
        <div className="overflow-auto" style={{ maxHeight: 560 }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 600 }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={TH} style={TH_STYLE}>Name</th>
                <th className={TH} style={TH_STYLE}>Plan</th>
                <th className={TH} style={TH_STYLE}>Branch</th>
                <th className={TH} style={TH_STYLE}>Status</th>
                {canDelete && <th className={`${TH} text-right`} style={TH_STYLE}><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => (
                <tr key={r.student.id} className={TR} style={TR_STYLE}>
                  <StudentCell student={r.student} />
                  <td className={`${TD} text-[12.5px]`}>{r.plan ? planLabel(r.plan) : '—'}</td>
                  <td className={TD}><BranchTag branch={r.student.branch} /></td>
                  <td className={TD}>
                    {r.status === 'PAID'
                      ? <StatusPill tone="success">Paid</StatusPill>
                      : <StatusPill tone="warn">Pending</StatusPill>}
                  </td>
                  {canDelete && (
                    <td className={`${TD} text-right`}>
                      <button
                        type="button"
                        className={BTN_DANGER_GHOST}
                        style={{ color: DANGER }}
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
    </DashCard>
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
    return <span className="text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>—</span>
  }
  return (
    <button type="button" className={BTN_SM} style={SECONDARY_STYLE} onClick={open}>
      <Icon name="eye" size={12} /> View
    </button>
  )
}
