'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAuth, getUsers, hydrateUsers,
  getPaymentsForStudent, hydrateFrontDeskPayments,
  getGradeForStudent,
  getFile,
  syncLocalDocsToServer,
  fetchFeeSummary, balanceSummaryFor,
  type StoredUser, type PaymentRecord, type GradeRecord, type FeeSummary,
  type EnrollmentLevel, type PaymentMethod,
  levelLabel,
} from '@/lib/session'
import StudentDetail from '@/components/StudentDetail'
import NotificationPanel from '@/components/NotificationPanel'
import CurriculumPanel from '@/components/CurriculumPanel'
import TemplatesPanel from '@/components/TemplatesPanel'
import GradesPanel from '@/components/GradesPanel'
import StudentListPanel from '@/components/StudentListPanel'

type StudentTab = 'PROFILE' | 'PAYMENT' | 'GRADES' | 'NOTIFICATIONS'
type TeacherTab = 'STUDENTS' | 'CURRICULUM' | 'TEMPLATES' | 'GRADES' | 'NOTIFICATIONS'

function fmt(cents: number) {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<StoredUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const auth = getAuth()
    if (!auth) { router.replace('/sign-in'); return }
    // Send admin / branch admin / front-desk users to their proper
    // dashboards instead of falling through to TeacherView (which is
    // why a branch admin landed here and saw "SCEI teacher account"
    // at the top of the screen).
    if (auth.role === 'ADMIN' || auth.role === 'BRANCH_ADMIN') { router.replace('/admin'); return }
    if (auth.role === 'FRONTDESK') { router.replace('/frontdesk'); return }
    if (!auth.userId) { router.replace('/sign-in'); return }
    let cancelled = false
    ;(async () => {
      // Pull the canonical user list from the API so the teacher dashboard
      // sees students enrolled from other devices.
      const users = await hydrateUsers().catch(() => getUsers())
      if (cancelled) return
      // Find the viewer's own record. The API scopes results so a TEACHER
      // viewer only gets STUDENT rows back — their own row won't be in the
      // list. Fall back to a synthetic StoredUser built from the auth token
      // so the dashboard still renders.
      const found = users.find(x => x.id === auth.userId)
      const synthetic: StoredUser = {
        id: auth.userId!,
        role: (auth.role === 'TEACHER' ? 'TEACHER' : 'STUDENT'),
        email: auth.email,
        password: '',
        firstName: auth.firstName,
        createdAt: new Date().toISOString(),
      }
      setUser(found ?? synthetic)
      setReady(true)
      // Catch-up resync: students who enrolled before the server-blob sync
      // shipped still have their docs in IndexedDB only. Push any missing
      // ones up so the partner-school /admission tracker can see them.
      const me = found ?? synthetic
      if (me.role === 'STUDENT' && me.enrollment?.documents) {
        void syncLocalDocsToServer(me.id, me.enrollment.documents)
      }
    })()
    return () => { cancelled = true }
  }, [router])

  if (!ready || !user) return null
  return user.role === 'STUDENT' ? <StudentView user={user} /> : <TeacherView user={user} />
}

/* ────────────────────── STUDENT VIEW ────────────────────── */

function StudentView({ user }: { user: StoredUser }) {
  const [tab, setTab] = useState<StudentTab>('PROFILE')
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [grade, setGrade] = useState<GradeRecord | null>(null)
  const [feeSummary, setFeeSummary] = useState<FeeSummary | null>(null)

  useEffect(() => {
    setPayments(getPaymentsForStudent(user.id))
    setGrade(getGradeForStudent(user.id))
    // Reflect any cashier-converted tuition payments as PAID without
    // requiring the parent to refresh manually.
    hydrateFrontDeskPayments().then(() => setPayments(getPaymentsForStudent(user.id))).catch(() => { /* ignore */ })
    // Pull the fee schedule so the Payment tab can show months owed +
    // running balance amount. Null when the student has no payments
    // yet (back-end precondition) — the Balance card falls back to a
    // placeholder in that case.
    fetchFeeSummary(user.id).then(setFeeSummary).catch(() => { /* ignore */ })
  }, [user.id])

  return (
    <div className="max-w-4xl mx-auto animate-fade-up space-y-6">
      <TabBar tabs={[
        { value: 'PROFILE',       label: 'Profile' },
        { value: 'PAYMENT',       label: 'Payment' },
        { value: 'GRADES',        label: 'Grades' },
        { value: 'NOTIFICATIONS', label: 'Notifications' },
      ]} active={tab} onChange={v => setTab(v as StudentTab)} />

      {tab === 'PROFILE' && <StudentDetail student={user} viewerRole="STUDENT" />}

      {tab === 'PAYMENT' && (
        <PaymentTab payments={payments} studentId={user.id} feeSummary={feeSummary} />
      )}

      {tab === 'GRADES' && (
        <div className="card-static">
          <h2 className="text-[18px] leading-tight mb-3">Grades</h2>
          {!grade ? (
            <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">No grades have been recorded yet by the teacher.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-5 gap-2 text-center">
                <Quarter label="Q1" value={grade.q1} />
                <Quarter label="Q2" value={grade.q2} />
                <Quarter label="Q3" value={grade.q3} />
                <Quarter label="Q4" value={grade.q4} />
                <Quarter label="Year Avg" value={grade.yearAvg} highlight />
              </div>
              <p className="text-[11.5px] text-[color:var(--mid-gray)]">Updated {new Date(grade.updatedAt).toLocaleString()}.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'NOTIFICATIONS' && (
        <NotificationPanel viewer={{
          role: 'STUDENT',
          level: user.level as EnrollmentLevel | undefined,
          email: user.email,
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
          userId: user.id,
        }} />
      )}
    </div>
  )
}

/* ────────────────────── TEACHER VIEW ────────────────────── */

function TeacherView({ user }: { user: StoredUser }) {
  const [tab, setTab] = useState<TeacherTab>('STUDENTS')

  const viewerName = useMemo(() => [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email, [user])

  // Safety net: label by actual role so a non-teacher who lands here
  // (e.g. via a stale link before the role-aware redirect kicks in)
  // doesn't see the wrong account-type chip.
  const roleLabel =
    user.role === 'BRANCH_ADMIN' ? 'SCEI branch admin account'
    : user.role === 'FRONTDESK'   ? 'SCEI front desk account'
    : 'SCEI teacher account'

  return (
    <div className="max-w-5xl mx-auto animate-fade-up space-y-6">
      <div className="card-static">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>{roleLabel}</div>
        <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)]">{viewerName}</h1>
        <p className="text-sm text-[color:var(--mid-gray)]">{user.email}</p>
      </div>

      <TabBar tabs={[
        { value: 'STUDENTS',      label: 'Students' },
        { value: 'CURRICULUM',    label: 'Curriculum' },
        { value: 'TEMPLATES',     label: 'Templates' },
        { value: 'GRADES',        label: 'Grades' },
        { value: 'NOTIFICATIONS', label: 'Notifications' },
      ]} active={tab} onChange={v => setTab(v as TeacherTab)} />

      {tab === 'STUDENTS' && (
        <StudentListPanel viewer={{ role: 'TEACHER', userId: user.id, email: user.email, name: viewerName }} />
      )}

      {tab === 'CURRICULUM' && (
        <CurriculumPanel viewer={{ role: 'TEACHER', email: user.email }} />
      )}

      {tab === 'TEMPLATES' && (
        <TemplatesPanel viewer={{ role: 'TEACHER', email: user.email }} />
      )}

      {tab === 'GRADES' && (
        <GradesPanel viewer={{ role: 'TEACHER', userId: user.id }} />
      )}

      {tab === 'NOTIFICATIONS' && (
        <NotificationPanel viewer={{ role: 'TEACHER', email: user.email, name: viewerName, userId: user.id }} />
      )}
    </div>
  )
}

/* ─────────── tab bar ─────────── */

function TabBar({ tabs, active, onChange }: { tabs: Array<{ value: string; label: string }>; active: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 p-1 bg-[color:var(--pale-teal)] rounded-xl overflow-x-auto" style={{ fontFamily: 'var(--font-display)' }}>
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${active === t.value ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)] hover:text-[color:var(--teal)]'}`}
        >{t.label}</button>
      ))}
    </div>
  )
}

/**
 * Student Payment tab. Branches on whether any payment record is in the
 * PAID state — abandoned PENDING checkouts shouldn't make the student
 * feel like they've paid. When nothing is paid, surface a prominent
 * "you still need to pay tuition" card with a CTA into /pay.
 */
function PaymentTab({ payments, studentId, feeSummary }: {
  payments: PaymentRecord[]
  studentId: string
  feeSummary: FeeSummary | null
}) {
  const hasPaid = payments.some(p => p.status === 'PAID')
  const pending = payments.filter(p => p.status === 'PENDING')

  // Balance card — renders when we have a fee summary (student needs
  // at least one payment on file before the fee-summary endpoint will
  // serve one). balanceSummaryFor combines unpaid-months detection with
  // the per-month installment amount so parents see BOTH which months
  // are owed AND the running peso total.
  const balance = feeSummary
    ? balanceSummaryFor(studentId, {
        // For MONTHLY the per-installment amount is already the full
        // combined (tuition + bundled misc) cost. We pass it as tuition
        // and leave misc at 0 so balanceSummaryFor's math is correct.
        monthlyTuitionCentavos: feeSummary.installmentCentavos,
        monthlyMiscCentavos: 0,
      })
    : null

  if (!hasPaid) {
    return (
      <div className="card-static">
        <h2 className="text-[18px] leading-tight mb-1">Tuition not yet paid</h2>
        <p className="text-sm text-[color:var(--mid-gray)] mb-5">
          {pending.length === 0
            ? 'You have not started a tuition payment yet. Choose your plan and pay securely through PayMongo.'
            : `You have ${pending.length} unfinished checkout${pending.length === 1 ? '' : 's'}. Tuition is still outstanding — please complete your payment via PayMongo.`}
        </p>
        <div className="rounded-xl p-5 border text-center" style={{ borderColor: '#fda4af', background: '#fff1f2' }}>
          <p className="text-[15px] text-[color:var(--narra)] font-semibold mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            You still need to pay tuition.
          </p>
          <a href="/pay" className="btn-cta">Pay tuition fee →</a>
        </div>
        {pending.length > 0 && (
          <details className="mt-4">
            <summary className="text-[12.5px] text-[color:var(--mid-gray)] cursor-pointer select-none">Show unfinished checkout attempts ({pending.length})</summary>
            <PaymentTable payments={pending} />
          </details>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {balance && (balance.unpaidMonths.length > 0 || balance.partialReceiptsForCurrentPeriodCentavos > 0) && (
        <BalanceCard balance={balance} />
      )}
      <div className="card-static">
        <h2 className="text-[18px] leading-tight mb-1">Payment status by trimester</h2>
        <p className="text-sm text-[color:var(--mid-gray)] mb-3">
          Hover a <strong>Paid</strong> or <strong>Pending</strong> cell to see the payment details.
        </p>
        <PaymentTrimesterGrid payments={payments} />
        <details className="mt-4">
          <summary className="text-[12.5px] text-[color:var(--mid-gray)] cursor-pointer select-none">Show full payment history</summary>
          <div className="mt-3">
            <PaymentTable payments={payments} />
          </div>
        </details>
        <div className="mt-4">
          <a href="/pay" className="btn-secondary">Make another payment</a>
        </div>
      </div>
    </div>
  )
}

/** Trimester grid — 11 school months × 3 semesters. Rows are months
 *  (Jun → Apr), columns are semesters: S1 = Jun/Jul/Aug, S2 = Sep-Dec,
 *  S3 = Jan-Apr. Each month belongs to exactly one semester so only one
 *  cell per row is ever filled. The cell shows "Paid" / "Pending" from
 *  the payment whose period includes that month name; hovering reveals
 *  method, date, amount, and reference. Non-monthly plans still render
 *  the grid best-effort (BIANNUAL / ANNUAL payment periods usually
 *  mention a month range so the first matching month lights up). */
function PaymentTrimesterGrid({ payments }: { payments: PaymentRecord[] }) {
  const MONTHS = ['June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April']
  const SEMESTERS: Array<{ key: 1 | 2 | 3; label: string; months: string[] }> = [
    { key: 1, label: 'Semester 1', months: ['June', 'July', 'August'] },
    { key: 2, label: 'Semester 2', months: ['September', 'October', 'November', 'December'] },
    { key: 3, label: 'Semester 3', months: ['January', 'February', 'March', 'April'] },
  ]
  function semesterOf(month: string): 1 | 2 | 3 {
    for (const s of SEMESTERS) if (s.months.includes(month)) return s.key
    return 1
  }

  // For each school month, find payments whose period mentions it. We
  // key by lowercased month name because periods vary ("August 2026",
  // "Aug 2026", "Aug–Jan"). We accept any payment whose period substring
  // includes the full month name — close enough for the trimester grid.
  function paymentsForMonth(month: string): PaymentRecord[] {
    const needle = month.toLowerCase()
    return payments.filter(p => p.period.toLowerCase().includes(needle))
  }

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
      <table className="w-full text-sm border-collapse">
        <thead style={{ background: 'var(--paper-2)' }}>
          <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
            <th className="py-2 px-3 border-b" style={{ borderColor: 'var(--paper-3)' }}>Month</th>
            {SEMESTERS.map(s => (
              <th key={s.key} className="py-2 px-3 border-b border-l text-center" style={{ borderColor: 'var(--paper-3)' }}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MONTHS.map(month => {
            const sem = semesterOf(month)
            const matches = paymentsForMonth(month)
            // Prefer PAID over PENDING when both exist in the same cell.
            const chosen = matches.find(p => p.status === 'PAID') ?? matches[0] ?? null
            return (
              <tr key={month} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                <td className="py-2.5 px-3 text-[13px] font-medium text-[color:var(--narra)]">{month}</td>
                {SEMESTERS.map(s => (
                  <td
                    key={s.key}
                    className="py-2.5 px-3 border-l text-center text-[12.5px]"
                    style={{ borderColor: 'var(--paper-3)' }}
                  >
                    {s.key === sem && chosen ? <PaymentCell payment={chosen} /> : null}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** One grid cell for a payment. Hovering shows method, date, amount,
 *  and reference — rendered as a styled tooltip that unhides on group-
 *  hover rather than relying on the browser's slow native title. */
function PaymentCell({ payment }: { payment: PaymentRecord }) {
  const paid = payment.status === 'PAID'
  const dateIso = payment.paidAt ?? payment.createdAt
  const dateLabel = new Date(dateIso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  const total = payment.tuitionAmount + payment.miscAmount
  const method = paymentMethodLabel(payment.method)
  const reference = payment.paymongoCheckoutId
    || payment.proofFileName
    || payment.voucherCode
    || '—'
  return (
    <span className="relative group inline-block">
      <span className={`badge ${paid ? 'badge-paid' : 'badge-pending'}`}>{paid ? 'Paid' : 'Pending'}</span>
      <span
        className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 hidden group-hover:block text-left bg-white border rounded-lg shadow-xl px-3 py-2 w-[220px]"
        style={{ borderColor: 'var(--paper-3)' }}
        role="tooltip"
      >
        <div className="text-[10.5px] uppercase tracking-wider text-[color:var(--mid-gray)] mb-1">Payment details</div>
        <div className="text-[12.5px] text-[color:var(--narra)]"><strong>Method:</strong> {method}</div>
        <div className="text-[12.5px] text-[color:var(--narra)]"><strong>Date:</strong> {dateLabel}</div>
        <div className="text-[12.5px] text-[color:var(--narra)]"><strong>Amount:</strong> {fmt(total)}</div>
        <div className="text-[12.5px] text-[color:var(--narra)] truncate" title={reference}><strong>Ref:</strong> {reference}</div>
      </span>
    </span>
  )
}

/** Compact card showing the running balance: which months are still
 *  owed and the matching peso total, plus any partial receipts banked
 *  against the current period. Only rendered on MONTHLY plans today
 *  (annual/bi-annual have simpler one-shot semantics). */
function BalanceCard({ balance }: { balance: ReturnType<typeof balanceSummaryFor> }) {
  const owes = balance.unpaidMonths.length > 0
  return (
    <div
      className="card-static"
      style={{
        borderColor: owes ? '#fed7aa' : '#bbf7d0',
        background: owes ? '#fff7ed' : '#f0fdf4',
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: owes ? 'var(--clay)' : '#166534' }}>
            Running balance
          </div>
          <h2 className="text-[18px] leading-tight" style={{ color: 'var(--deep-teal)' }}>
            {owes ? 'Tuition still owed' : 'All caught up'}
          </h2>
        </div>
        <a href="/pay" className="btn-cta text-xs">Pay tuition fee →</a>
      </div>
      {owes ? (
        <>
          <p className="text-sm mb-3" style={{ color: 'var(--ink)' }}>
            Months that still need to be settled:
          </p>
          <ul className="mb-3" style={{ paddingLeft: '1.25rem' }}>
            {balance.unpaidMonthLabels.map(label => (
              <li key={label} className="text-sm" style={{ color: 'var(--ink)' }}>{label}</li>
            ))}
          </ul>
          <div className="rounded-md border p-3 flex items-center justify-between flex-wrap gap-2" style={{ borderColor: '#fed7aa', background: '#fff' }}>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[color:var(--mid-gray)]">Amount owed</div>
              <div className="text-[20px] font-semibold" style={{ color: 'var(--clay)' }}>
                {fmt(balance.totalOwedCentavos)}
              </div>
              <div className="text-[11px] text-[color:var(--mid-gray)]">
                {balance.unpaidMonths.length} month{balance.unpaidMonths.length === 1 ? '' : 's'} ×{' '}
                {fmt(balance.monthlyTuitionCentavos + balance.monthlyMiscCentavos)}
              </div>
            </div>
            {balance.partialReceiptsForCurrentPeriodCentavos > 0 && (
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-[color:var(--mid-gray)]">
                  Partial receipts already banked
                </div>
                <div className="text-[15px] font-semibold" style={{ color: '#166534' }}>
                  {fmt(balance.partialReceiptsForCurrentPeriodCentavos)}
                </div>
                <div className="text-[11px] text-[color:var(--mid-gray)]">
                  Credit toward the next installment
                </div>
              </div>
            )}
          </div>
        </>
      ) : balance.partialReceiptsForCurrentPeriodCentavos > 0 ? (
        <>
          <p className="text-sm mb-2" style={{ color: 'var(--ink)' }}>
            Your current period is covered. The front desk has also banked
            partial receipts totaling{' '}
            <strong style={{ color: '#166534' }}>{fmt(balance.partialReceiptsForCurrentPeriodCentavos)}</strong>{' '}
            against the next installment.
          </p>
        </>
      ) : (
        <p className="text-sm" style={{ color: 'var(--ink)' }}>
          No outstanding balance. Your tuition is settled through the current
          period.
        </p>
      )}
    </div>
  )
}

function PaymentTable({ payments }: { payments: PaymentRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
      <table className="w-full text-sm">
        <thead style={{ background: 'var(--paper-2)' }}>
          <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
            <th className="py-2 px-3">Date</th>
            <th className="py-2 px-3">Plan</th>
            <th className="py-2 px-3">Period</th>
            <th className="py-2 px-3 text-right">Total</th>
            <th className="py-2 px-3">Method</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Proof</th>
          </tr>
        </thead>
        <tbody>
          {payments.map(p => (
            <tr key={p.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
              <td className="py-2.5 px-3 text-[12.5px]">{new Date(p.paidAt ?? p.createdAt).toLocaleDateString()}</td>
              <td className="py-2.5 px-3">{p.plan}</td>
              <td className="py-2.5 px-3 text-[12.5px]">{p.period}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{fmt(p.tuitionAmount + p.miscAmount)}</td>
              <td className="py-2.5 px-3 text-[12.5px]">{paymentMethodLabel(p.method)}</td>
              <td className="py-2.5 px-3"><span className={`badge ${p.status === 'PAID' ? 'badge-paid' : 'badge-pending'}`}>{p.status}</span></td>
              <td className="py-2.5 px-3"><ProofCell payment={p} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function paymentMethodLabel(m: PaymentMethod | undefined): string {
  switch (m) {
    case 'PAYMONGO':        return 'PayMongo'
    case 'FRONT_DESK_CASH': return 'Front desk (cash)'
    case 'BANK_DEPOSIT':    return 'Bank deposit'
    default:                return '—'
  }
}

/** Bank-deposit proof file cell. Shows a View button that opens the
 *  stored blob in a new tab, or "—" when the row has no proof. */
function ProofCell({ payment }: { payment: PaymentRecord }) {
  async function open() {
    if (!payment.proofFileId) return
    const blob = await getFile(payment.proofFileId)
    if (!blob) { alert('Proof file not found in this browser.'); return }
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  if (!payment.proofFileId) {
    return <span className="text-[11.5px] text-[color:var(--mid-gray)]">—</span>
  }
  return (
    <button type="button" className="btn-secondary text-xs" onClick={open} title={payment.proofFileName ?? 'Proof of payment'}>
      View proof
    </button>
  )
}

function Quarter({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl p-3 border" style={{ borderColor: 'var(--paper-3)', background: highlight ? 'var(--sage-tint)' : 'var(--paper-2)' }}>
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{label}</div>
      <div className={`text-[22px] font-bold mt-1 ${highlight ? 'text-[color:var(--narra)]' : 'text-[color:var(--ink)]'}`} style={{ fontFamily: 'var(--font-display)' }}>{value ?? '—'}</div>
    </div>
  )
}

// (Silenced) ensures levelLabel is referenced even though it's only used in some import paths above.
void levelLabel
