'use client'

// Accounts Receivable → Tuition: Class Hub students, their tuition payments
// and promissory notes, and the payment schedule set for each note. A note may
// delay a payment by at most 3 months and never past the end of its semester
// (lib/tuition.ts). Scheduled payments are collected at the POS (Tuition
// picker); the sale marks them paid here and records them in Class Hub — the
// POS is the only place tuition is recorded.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, X, Plus, Trash2, CalendarClock, ChevronDown, ChevronRight, Eye, AlertTriangle, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  ITEM_STATE_LABEL, MAX_PLAN_PAYMENTS, currentSchoolYear, latestAllowedDate, planProblem, schoolYearLabel,
  semesterLabel, semesterOf, type ItemState,
} from '@/lib/tuition'

interface PlanItem { id: string; seq: number; dueDate: string; amount: number; classPortalPaymentId: string | null; paidOn: string | null; orderNumber: number | null; inPos: boolean; state: ItemState; daysUntil: number }
interface Plan { id: string; promissoryNoteId: string | null; schoolYear: number; semester: number; originalDueDate: string; amount: number; notes: string | null; status: string; items: PlanItem[]; paid: number; balance: number }
interface Payment { classPortalPaymentId: string; plan: string; period: string; amount: number; status: string; method: string | null; methodDetail: string | null; isPartialPayment: boolean; recordedOn: string; confirmedOn: string | null; orderNumber: number | null; saleDate: string | null; where: 'POS' | 'WAITING' | 'CLASS_HUB_ONLY' | 'VOIDED' }
interface Note { id: string; fileName: string; fileType: string; notes: string | null; uploadedBy: string | null; createdAt: string }
interface SemesterRow { semester: number; label: string; start: string; end: string; tuition: number; paid: number; balance: number; started: boolean }
const balanceText = (b: number) => (b < -0.005 ? `${formatCurrency(-b)} paid ahead` : formatCurrency(b))
interface RegularDue { key: string; period: string; dueDate: string; expected: number; paid: number; remaining: number; state: 'OVERDUE' | 'DUE_SOON' | 'UPCOMING'; daysUntil: number }
interface Student {
  id: string; name: string; email: string; level: string | null; branch: string; patientId: string | null
  payments: Payment[]; notes: Note[]; plans: Plan[]
  tuitionPlan: string | null; rate: number | null
  /** By semester: tuition net of discounts, paid, balance. runningBalance = tuition of
   *  the semesters started so far − paid (negative = paid ahead). */
  semesters: SemesterRow[] | null; yearTuition: number | null; runningBalance: number | null
  /** Regular installments overdue or due within 7 days (Class Hub plan rules, as at the POS). */
  dues: RegularDue[]
  /** Installments settled by discount instead of cash — counted in dues and the running balance. */
  adjustments: Adjustment[]
}
interface Adjustment { id: string; period: string; amount: number; reason: string; by: string | null; date: string }
// Mirrors TUITION_DISCOUNT_ROLES (lib/tuition-server): settling by discount forgoes money.
const DISCOUNT_ROLES = ['ADMIN', 'ACCOUNTANT']

const overdueOf = (s: Student) => s.dues.filter(d => d.state === 'OVERDUE')
/** Behind on a regular installment with no promissory note to cover it. */
const isDelayedNoNote = (s: Student) => s.notes.length === 0 && overdueOf(s).length > 0

const BRANCH_LABEL: Record<string, string> = { SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills' }
const LEVEL_LABEL = (l: string | null) => (l ? l.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : '')
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
const STATE_STYLE: Record<ItemState, { background: string; color: string }> = {
  PAID_ON_TIME: { background: '#dcfce7', color: '#166534' },
  PAID_LATE: { background: '#fef9c3', color: '#854d0e' },
  OVERDUE: { background: '#fee2e2', color: '#b91c1c' },
  DUE_SOON: { background: '#ffedd5', color: '#c2410c' },
  UPCOMING: { background: 'var(--off-white)', color: 'var(--charcoal)' },
}
const WHERE_LABEL: Record<Payment['where'], { text: string; style: { background: string; color: string } }> = {
  POS: { text: 'POS sale', style: { background: '#dcfce7', color: '#166534' } },
  WAITING: { text: 'Waiting in POS', style: { background: '#fef3c7', color: '#92400e' } },
  CLASS_HUB_ONLY: { text: 'Confirmed in Class Hub — no linked POS sale', style: { background: '#fee2e2', color: '#b91c1c' } },
  VOIDED: { text: 'Voided', style: { background: 'var(--off-white)', color: 'var(--mid-gray)' } },
}

type PlanStatus = 'DELAYED_NO_NOTE' | 'OVERDUE' | 'DUE_SOON' | 'NEEDS_PLAN' | 'ON_SCHEDULE' | 'COMPLETED' | 'COMPLETED_LATE' | 'NONE'
function planStatus(s: Student): PlanStatus {
  if (isDelayedNoNote(s)) return 'DELAYED_NO_NOTE'
  const items = s.plans.filter(p => p.status === 'ACTIVE').flatMap(p => p.items)
  if (!items.length) return s.notes.length ? 'NEEDS_PLAN' : 'NONE'
  if (items.some(i => i.state === 'OVERDUE')) return 'OVERDUE'
  if (items.some(i => i.state === 'DUE_SOON')) return 'DUE_SOON'
  if (items.every(i => i.paidOn)) return items.some(i => i.state === 'PAID_LATE') ? 'COMPLETED_LATE' : 'COMPLETED'
  return 'ON_SCHEDULE'
}
const PLAN_STATUS: Record<PlanStatus, { text: string; style: { background: string; color: string } } | null> = {
  DELAYED_NO_NOTE: { text: 'Delayed — no promissory note', style: { background: '#fee2e2', color: '#991b1b' } },
  OVERDUE: { text: 'Overdue', style: STATE_STYLE.OVERDUE },
  DUE_SOON: { text: 'Due within 7 days', style: STATE_STYLE.DUE_SOON },
  NEEDS_PLAN: { text: 'Note — no plan yet', style: { background: '#fef3c7', color: '#92400e' } },
  ON_SCHEDULE: { text: 'On schedule', style: { background: '#e0f2fe', color: '#075985' } },
  COMPLETED: { text: 'Paid on time', style: STATE_STYLE.PAID_ON_TIME },
  COMPLETED_LATE: { text: 'Paid, some late', style: STATE_STYLE.PAID_LATE },
  NONE: null,
}

export default function TuitionTab({ branch, canWrite }: { branch: string; canWrite: boolean }) {
  const thisSy = currentSchoolYear()
  const [sy, setSy] = useState(thisSy)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'notes' | 'delayed' | 'attention'>('notes')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ student: Student; plan: Plan | null } | null>(null)
  const [busy, setBusy] = useState('')
  const { data: session } = useSession()
  const canDiscount = DISCOUNT_ROLES.includes((session?.user as { role?: string } | undefined)?.role ?? '')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const qs = new URLSearchParams({ sy: String(sy), ...(branch ? { branch } : {}) })
      const res = await fetch(`/api/tuition?${qs}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not load tuition.')
      setStudents(d.students || [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [branch, sy])
  useEffect(() => { void load() }, [load])

  const toggle = (id: string) => setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // Settle what is left of an installment by discount (e.g. a promo) rather than
  // cash: nothing is rung up, the installment just stops showing as owed.
  const discount = async (s: Student, d: RegularDue) => {
    const raw = prompt(`Amount of ${d.period} settled by discount (not cash) — up to ${formatCurrency(d.remaining)}:`, String(d.remaining))
    if (raw === null) return
    const amount = Number(raw)
    if (!(amount > 0) || amount > d.remaining + 0.005) { alert(`Enter an amount up to ${formatCurrency(d.remaining)}.`); return }
    const reason = prompt('Why is it settled by discount? (e.g. the promo that covered it)')
    if (!reason?.trim()) return
    setBusy(`disc:${s.id}`)
    try {
      const r = await fetch('/api/tuition/adjustments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: s.id, schoolYear: sy, period: d.period, amount, reason }),
      })
      const res = await r.json().catch(() => ({}))
      if (!r.ok) { alert(res.error || 'Could not save the discount.'); return }
      await load()
    } finally { setBusy('') }
  }
  const removeDiscount = async (a: Adjustment) => {
    if (!confirm(`Remove the ${a.period} ${formatCurrency(a.amount)} discount? That amount shows as owed again.`)) return
    const r = await fetch(`/api/tuition/adjustments?id=${a.id}`, { method: 'DELETE' })
    if (!r.ok) { alert('Could not remove the discount.'); return }
    await load()
  }

  const totals = useMemo(() => {
    const items = students.flatMap(s => s.plans.filter(p => p.status === 'ACTIVE').flatMap(p => p.items))
    const sum = (xs: PlanItem[]) => xs.reduce((t, i) => t + i.amount, 0)
    const outside = students.flatMap(s => s.payments.filter(p => p.where === 'CLASS_HUB_ONLY'))
    return {
      withNotes: students.filter(s => s.notes.length).length,
      activePlans: students.reduce((t, s) => t + s.plans.filter(p => p.status === 'ACTIVE').length, 0),
      dueSoon: sum(items.filter(i => i.state === 'DUE_SOON')),
      overdue: sum(items.filter(i => i.state === 'OVERDUE')),
      outsideCount: outside.length,
      outsideAmount: outside.reduce((t, p) => t + p.amount, 0),
      delayedCount: students.filter(isDelayedNoNote).length,
      delayedAmount: students.filter(isDelayedNoNote).reduce((t, s) => t + overdueOf(s).reduce((u, d) => u + d.remaining, 0), 0),
    }
  }, [students])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter(s => {
      if (q && !`${s.name} ${s.email}`.toLowerCase().includes(q)) return false
      // Default view: everyone on a promissory note, plus everyone behind without one.
      if (filter === 'notes') return s.notes.length > 0 || s.plans.length > 0 || isDelayedNoNote(s)
      if (filter === 'delayed') return isDelayedNoNote(s)
      if (filter === 'attention') return ['DELAYED_NO_NOTE', 'OVERDUE', 'DUE_SOON', 'NEEDS_PLAN'].includes(planStatus(s)) || s.payments.some(p => p.where === 'CLASS_HUB_ONLY')
      return true
    })
  }, [students, search, filter])

  async function cancelPlan(plan: Plan) {
    if (!confirm('Cancel this payment plan? Its scheduled payments stop showing in the bell and at the POS.')) return
    setBusy(plan.id); setError('')
    try {
      const res = await fetch(`/api/tuition/plans/${plan.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not cancel the plan.')
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const nextPayment = (s: Student) => s.plans.filter(p => p.status === 'ACTIVE').flatMap(p => p.items).filter(i => !i.paidOn).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
          Class Hub tuition: payments recorded there, the promissory notes uploaded there, and the payment schedule for each note.
          A promissory can delay a payment by at most <strong>3 months</strong>, and never past the end of its semester
          (Semester 1 Jun–Aug, 2 Sep–Dec, 3 Jan–Apr). Scheduled payments are collected at the POS.
        </p>
        <div className="flex items-center gap-2">
          <select value={sy} onChange={e => setSy(Number(e.target.value))} className="px-3 py-2 rounded-xl border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
            {[thisSy, thisSy - 1].map(y => <option key={y} value={y}>{schoolYearLabel(y)}</option>)}
          </select>
          <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="px-3 py-2 rounded-xl border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="notes">Promissory notes & delayed</option>
            <option value="delayed">Delayed — no promissory note</option>
            <option value="attention">Needs attention</option>
            <option value="all">All students</option>
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student…" className="px-3 py-2 rounded-xl border text-xs w-44" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Students with promissory notes', value: String(totals.withNotes), sub: `${totals.activePlans} active plan${totals.activePlans === 1 ? '' : 's'}` },
          { label: 'Delayed, no promissory note', value: String(totals.delayedCount), sub: totals.delayedCount ? `${formatCurrency(totals.delayedAmount)} overdue` : 'none', color: totals.delayedCount ? '#991b1b' : undefined },
          { label: 'Promissory due within 7 days', value: formatCurrency(totals.dueSoon), sub: 'scheduled, unpaid', color: '#c2410c' },
          { label: 'Promissory overdue', value: formatCurrency(totals.overdue), sub: 'past the scheduled date', color: '#b91c1c' },
          { label: 'Confirmed in Class Hub, no linked POS sale', value: String(totals.outsideCount), sub: totals.outsideCount ? `${formatCurrency(totals.outsideAmount)} to check` : 'none', color: totals.outsideCount ? '#b91c1c' : undefined },
        ].map(c => (
          <div key={c.label} className="rounded-2xl border bg-white px-4 py-3" style={{ borderColor: 'var(--light-gray)' }}>
            <p className="text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>{c.label}</p>
            <p className="text-lg font-bold" style={{ color: c.color || 'var(--deep-teal)' }}>{c.value}</p>
            <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--off-white)' }}>
              <th className="px-3 py-2.5 w-8" />
              {['Student', 'Branch', 'Paid this SY', 'Running balance', 'Overdue', 'Promissory notes', 'Status', 'Next scheduled payment', ''].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /> Loading from Class Hub…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>
                {filter === 'notes' ? 'No promissory notes and no delayed students this school year.' : filter === 'delayed' ? 'No student is behind without a promissory note.' : filter === 'attention' ? 'Nothing needs attention.' : 'No students found.'}
              </td></tr>
            ) : shown.map(s => {
              const paid = s.payments.filter(p => p.where === 'POS' || p.where === 'CLASS_HUB_ONLY').reduce((t, p) => t + p.amount, 0)
              const discounted = (s.adjustments || []).reduce((t, a) => t + a.amount, 0)
              const overdue = overdueOf(s)
              const overdueAmt = overdue.reduce((t, d) => t + d.remaining, 0) + s.plans.filter(p => p.status === 'ACTIVE').flatMap(p => p.items).filter(i => i.state === 'OVERDUE').reduce((t, i) => t + i.amount, 0)
              const st = PLAN_STATUS[planStatus(s)]
              const next = nextPayment(s)
              const active = s.plans.filter(p => p.status === 'ACTIVE')
              const freeNotes = s.notes.filter(n => !active.some(p => p.promissoryNoteId === n.id))
              return (
                <Fragment key={s.id}>
                  <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-2.5">
                      <button onClick={() => toggle(s.id)} title="Details">{expanded.has(s.id) ? <ChevronDown size={14} style={{ color: 'var(--mid-gray)' }} /> : <ChevronRight size={14} style={{ color: 'var(--mid-gray)' }} />}</button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium" style={{ color: 'var(--charcoal)' }}>{s.name}</div>
                      <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{[LEVEL_LABEL(s.level), s.email].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{BRANCH_LABEL[s.branch] || s.branch}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color: '#166534' }}>{formatCurrency(paid)}</td>
                    <td className="px-3 py-2.5 text-right text-xs whitespace-nowrap" title={s.semesters ? 'Tuition of the semesters started so far, less everything paid' : 'No payment recorded yet, so the plan and rate are not known'}>
                      {s.runningBalance == null ? <span style={{ color: 'var(--mid-gray)' }}>—</span>
                        : <span className="font-mono font-semibold" style={{ color: s.runningBalance > 0.005 ? '#c44b00' : '#166534' }}>{balanceText(s.runningBalance)}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs whitespace-nowrap">
                      {overdueAmt > 0.005
                        ? <><span className="font-mono font-semibold" style={{ color: '#b91c1c' }}>{formatCurrency(overdueAmt)}</span>{overdue.length > 0 && <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{overdue.map(d => d.period.replace(/ \d{4}$/, '')).join(', ')}</div>}</>
                        : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {s.notes.length === 0 ? <span style={{ color: 'var(--mid-gray)' }}>—</span> : s.notes.map(n => (
                        <a key={n.id} href={`/api/tuition/notes/${n.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mr-2" style={{ color: 'var(--teal)' }} title={n.fileName}>
                          <FileText size={12} /> {fmtDate(n.createdAt.slice(0, 10))}
                        </a>
                      ))}
                    </td>
                    <td className="px-3 py-2.5">
                      {st ? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={st.style}>{st.text}</span> : <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                      {next ? <>{fmtDate(next.dueDate)} · <span className="font-mono">{formatCurrency(next.amount)}</span></>
                        : s.dues.find(d => d.state === 'DUE_SOON') ? (() => { const d = s.dues.find(x => x.state === 'DUE_SOON')!; return <>{fmtDate(d.dueDate)} · <span className="font-mono">{formatCurrency(d.remaining)}</span> <span style={{ color: 'var(--mid-gray)' }}>({d.period})</span></> })()
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {canWrite && freeNotes.length > 0 && (
                        <button onClick={() => setEditing({ student: s, plan: null })} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                          <CalendarClock size={13} /> Set payment plan
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded.has(s.id) && (
                    <tr className="border-t" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                      <td />
                      <td colSpan={9} className="px-3 py-3 space-y-4">
                        {/* Running balance: tuition this school year (net of discounts) − payments */}
                        {s.semesters && (
                          <div>
                            <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--mid-gray)' }}>
                              Running balance by semester{s.tuitionPlan ? ` · ${s.tuitionPlan.toLowerCase()} plan` : ''}{s.rate ? ` · ${formatCurrency(s.rate)} per installment, after discounts` : ''}
                            </p>
                            <table className="text-xs w-full" style={{ maxWidth: 720 }}>
                              <thead><tr>{['Semester', 'Tuition', 'Paid', 'Balance', ''].map(h => <th key={h} className="text-left pr-4 pb-1 font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>)}</tr></thead>
                              <tbody>
                                {s.semesters.map(x => (
                                  <tr key={x.semester} style={{ opacity: x.started ? 1 : 0.6 }}>
                                    <td className="pr-4 py-0.5">{x.label}</td>
                                    <td className="pr-4 py-0.5 font-mono">{formatCurrency(x.tuition)}</td>
                                    <td className="pr-4 py-0.5 font-mono" style={{ color: '#166534' }}>{formatCurrency(x.paid)}</td>
                                    <td className="pr-4 py-0.5 font-mono font-semibold" style={{ color: x.balance > 0.005 ? '#c44b00' : '#166534' }}>{formatCurrency(x.balance)}</td>
                                    <td className="py-0.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>{x.started ? '' : 'not started yet'}</td>
                                  </tr>
                                ))}
                                {s.adjustments.length > 0 && (
                                  <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                                    <td className="pr-4 pt-1">Settled by discount (not cash)</td>
                                    <td />
                                    <td className="pr-4 pt-1 font-mono">{formatCurrency(discounted)}</td>
                                    <td colSpan={2} />
                                  </tr>
                                )}
                                <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                                  <td className="pr-4 pt-1 font-semibold">Running balance (semesters started)</td>
                                  <td className="pr-4 pt-1 font-mono">{formatCurrency(s.semesters.filter(x => x.started).reduce((t, x) => t + x.tuition, 0))}</td>
                                  <td className="pr-4 pt-1 font-mono" style={{ color: '#166534' }}>{formatCurrency(paid)}</td>
                                  <td className="pr-4 pt-1 font-mono font-semibold" style={{ color: (s.runningBalance || 0) > 0.005 ? '#c44b00' : '#166534' }}>{balanceText(s.runningBalance || 0)}</td>
                                  <td />
                                </tr>
                              </tbody>
                            </table>
                            <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>
                              Whole school year: {formatCurrency(s.yearTuition || 0)} tuition − {formatCurrency(paid)} paid{discounted > 0.005 ? ` − ${formatCurrency(discounted)} discount` : ''} = {balanceText((s.yearTuition || 0) - paid - discounted)} left. Payments fill Semester 1, then 2, then 3.
                            </p>
                            {s.adjustments.length > 0 && (
                              <div className="mt-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                                <span className="font-semibold">Settled by discount:</span>{' '}
                                {s.adjustments.map(a => (
                                  <span key={a.id} className="mr-3 inline-flex items-center gap-1">
                                    {a.period} <span className="font-mono">{formatCurrency(a.amount)}</span> — {a.reason}{a.by ? ` · ${a.by}` : ''} · {fmtDate(a.date)}
                                    {canDiscount && (
                                      <button onClick={() => removeDiscount(a)} className="p-0.5 rounded hover:bg-red-50" title="Remove this discount"><X size={11} style={{ color: '#dc2626' }} /></button>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Overdue regular installments (Class Hub plan rules) */}
                        {overdue.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#991b1b' }}>
                              Overdue installments{s.tuitionPlan ? ` · ${s.tuitionPlan.toLowerCase()} plan` : ''}{s.rate ? ` · ${formatCurrency(s.rate)} each` : ''}
                              {s.notes.length === 0 && ' — no promissory note uploaded in Class Hub yet'}
                            </p>
                            <table className="text-xs w-full" style={{ maxWidth: 720 }}>
                              <thead><tr>{['For', 'Was due', 'Days late', 'Paid', 'Still owed', ''].map(h => <th key={h} className="text-left pr-4 pb-1 font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>)}</tr></thead>
                              <tbody>
                                {overdue.map(d => (
                                  <tr key={d.key}>
                                    <td className="pr-4 py-0.5">{d.period}</td>
                                    <td className="pr-4 py-0.5 whitespace-nowrap">{fmtDate(d.dueDate)}</td>
                                    <td className="pr-4 py-0.5">{-d.daysUntil}</td>
                                    <td className="pr-4 py-0.5 font-mono">{d.paid > 0.005 ? formatCurrency(d.paid) : '—'}</td>
                                    <td className="pr-4 py-0.5 font-mono font-semibold" style={{ color: '#b91c1c' }}>{formatCurrency(d.remaining)}</td>
                                    <td className="py-0.5">
                                      {canDiscount && (
                                        <button onClick={() => discount(s, d)} disabled={busy === `disc:${s.id}`}
                                          className="px-2 py-0.5 rounded-lg border text-[11px] font-semibold bg-white disabled:opacity-50" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
                                          title="Settle what is left by discount (e.g. a promo) — no cash is recorded">Settle by discount</button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>
                              Based on the payments recorded for this school year. Collect at POS → Tuition, or have the family give a promissory note in Class Hub to set a payment plan.
                            </p>
                          </div>
                        )}
                        {/* Payment plans */}
                        <div>
                          <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--mid-gray)' }}>Payment plans</p>
                          {s.plans.length === 0 ? (
                            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{s.notes.length ? 'No plan yet for the promissory note.' : 'No promissory note uploaded in Class Hub.'}</p>
                          ) : s.plans.map(p => (
                            <div key={p.id} className="rounded-xl border bg-white p-3 mb-2" style={{ borderColor: 'var(--light-gray)', opacity: p.status === 'CANCELLED' ? 0.6 : 1 }}>
                              <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                                <div className="text-xs" style={{ color: 'var(--charcoal)' }}>
                                  <strong>{semesterLabel(p.schoolYear, p.semester)}</strong> · originally due {fmtDate(p.originalDueDate)} · covers <span className="font-mono">{formatCurrency(p.amount)}</span>
                                  {' '}· paid <span className="font-mono" style={{ color: '#166534' }}>{formatCurrency(p.paid)}</span> · balance <span className="font-mono" style={{ color: p.balance > 0.005 ? '#c44b00' : '#166534' }}>{formatCurrency(p.balance)}</span>
                                  {p.status === 'CANCELLED' && <span className="ml-2 font-semibold" style={{ color: '#b91c1c' }}>Cancelled</span>}
                                  {p.notes && <div className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{p.notes}</div>}
                                </div>
                                {canWrite && p.status === 'ACTIVE' && (
                                  <div className="flex gap-1.5">
                                    <button onClick={() => setEditing({ student: s, plan: p })} className="px-2.5 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Edit</button>
                                    <button onClick={() => cancelPlan(p)} disabled={busy === p.id} className="px-2 py-1 rounded-lg text-xs border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}><Trash2 size={12} /></button>
                                  </div>
                                )}
                              </div>
                              <table className="text-xs w-full" style={{ maxWidth: 820 }}>
                                <thead><tr>{['#', 'Scheduled', 'Amount', 'Status', 'Collected', ''].map(h => <th key={h} className="text-left pr-4 pb-1 font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>)}</tr></thead>
                                <tbody>
                                  {p.items.map(i => (
                                    <tr key={i.id}>
                                      <td className="pr-4 py-1">{i.seq}</td>
                                      <td className="pr-4 py-1 whitespace-nowrap">{fmtDate(i.dueDate)}</td>
                                      <td className="pr-4 py-1 font-mono">{formatCurrency(i.amount)}</td>
                                      <td className="pr-4 py-1">
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={STATE_STYLE[i.state]}>
                                          {ITEM_STATE_LABEL[i.state]}{i.state === 'OVERDUE' ? ` · ${-i.daysUntil}d` : i.state === 'DUE_SOON' ? ` · ${i.daysUntil === 0 ? 'today' : `in ${i.daysUntil}d`}` : ''}
                                        </span>
                                      </td>
                                      <td className="pr-4 py-1 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                                        {i.paidOn ? <>{fmtDate(i.paidOn)}{i.orderNumber ? ` · POS #${i.orderNumber}` : ' · Class Hub only'}</> : i.inPos ? 'Waiting in POS' : '—'}
                                      </td>
                                      <td className="py-1 text-right text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                                        {p.status === 'ACTIVE' && !i.paidOn && !i.inPos && 'Collect at POS → Tuition'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>

                        {/* Class Hub payments */}
                        <div>
                          <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--mid-gray)' }}>Class Hub payments · {schoolYearLabel(sy)}</p>
                          {s.payments.length === 0 ? (
                            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No payments recorded in Class Hub this school year.</p>
                          ) : (
                            <table className="text-xs w-full" style={{ maxWidth: 980 }}>
                              <thead><tr>{['Recorded', 'Period', 'Plan', 'Amount', 'Method', 'Where it stands', 'Paid on'].map(h => <th key={h} className="text-left pr-4 pb-1 font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>)}</tr></thead>
                              <tbody>
                                {s.payments.map(p => (
                                  <tr key={p.classPortalPaymentId}>
                                    <td className="pr-4 py-1 whitespace-nowrap">{fmtDate(p.recordedOn)}</td>
                                    <td className="pr-4 py-1">{p.period}{p.isPartialPayment && <span className="ml-1 text-[10px] font-semibold" style={{ color: '#92400e' }}>PARTIAL</span>}</td>
                                    <td className="pr-4 py-1">{p.plan}</td>
                                    <td className="pr-4 py-1 font-mono">{formatCurrency(p.amount)}</td>
                                    <td className="pr-4 py-1">{(p.methodDetail || p.method || '—').replace(/_/g, ' ').toLowerCase()}</td>
                                    <td className="pr-4 py-1"><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={WHERE_LABEL[p.where].style}>{WHERE_LABEL[p.where].text}{p.orderNumber ? ` #${p.orderNumber}` : ''}</span></td>
                                    <td className="pr-4 py-1 whitespace-nowrap">{fmtDate(p.saleDate || p.confirmedOn)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {s.payments.some(p => p.where === 'CLASS_HUB_ONLY') && (
                            <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: '#b91c1c' }}>
                              <AlertTriangle size={12} /> Confirmed in Class Hub before the POS became the only place to complete tuition, and no POS sale is linked to it. Check whether it was rung up as a separate sale; if not, it is missing from the ledger.
                            </p>
                          )}
                        </div>

                        {/* Promissory notes */}
                        <div>
                          <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--mid-gray)' }}>Promissory notes (uploaded in Class Hub)</p>
                          {s.notes.length === 0 ? <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>None.</p> : (
                            <div className="flex flex-wrap gap-2">
                              {s.notes.map(n => (
                                <a key={n.id} href={`/api/tuition/notes/${n.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs bg-white" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                                  <Eye size={12} /> {n.fileName} <span style={{ color: 'var(--mid-gray)' }}>· {fmtDate(n.createdAt.slice(0, 10))}{n.uploadedBy ? ` · ${n.uploadedBy}` : ''}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {editing && <PlanModal student={editing.student} plan={editing.plan} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />}
    </div>
  )
}

function PlanModal({ student, plan, onClose, onSaved }: { student: Student; plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const usedNotes = new Set(student.plans.filter(p => p.status === 'ACTIVE' && p.id !== plan?.id).map(p => p.promissoryNoteId))
  const noteChoices = student.notes.filter(n => !usedNotes.has(n.id))
  const [noteId, setNoteId] = useState(plan?.promissoryNoteId || noteChoices[0]?.id || '')
  const [originalDue, setOriginalDue] = useState(plan?.originalDueDate || '')
  const [amount, setAmount] = useState(plan ? String(plan.amount) : '')
  const [notes, setNotes] = useState(plan?.notes || '')
  const [rows, setRows] = useState<{ id?: string; dueDate: string; amount: string; locked: boolean }[]>(
    plan ? plan.items.map(i => ({ id: i.id, dueDate: i.dueDate, amount: String(i.amount), locked: !!i.classPortalPaymentId })) : [{ dueDate: '', amount: '', locked: false }],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const amt = Number(amount) || 0
  const parsed = rows.map(r => ({ id: r.id, dueDate: r.dueDate, amount: Number(r.amount) || 0 }))
  const sem = originalDue ? semesterOf(originalDue) : null
  const limit = originalDue ? latestAllowedDate(originalDue) : null
  const problem = planProblem({ originalDueDate: originalDue, amount: amt, items: [...parsed].sort((a, b) => a.dueDate.localeCompare(b.dueDate)) })
  const scheduled = parsed.reduce((t, r) => t + r.amount, 0)

  // Spread the amount evenly over the rows, leaving locked rows as they are.
  function splitEvenly() {
    const lockedSum = rows.filter(r => r.locked).reduce((t, r) => t + (Number(r.amount) || 0), 0)
    const open = rows.filter(r => !r.locked)
    if (!open.length || !(amt > lockedSum)) return
    const each = Math.floor(((amt - lockedSum) / open.length) * 100) / 100
    const last = Math.round((amt - lockedSum - each * (open.length - 1)) * 100) / 100
    let k = 0
    setRows(rows.map(r => (r.locked ? r : { ...r, amount: String(++k === open.length ? last : each) })))
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const body = { studentId: student.id, promissoryNoteId: noteId, originalDueDate: originalDue, amount: amt, notes, items: parsed }
      const res = await fetch(plan ? `/api/tuition/plans/${plan.id}` : '/api/tuition/plans', {
        method: plan ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not save the plan.')
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{plan ? 'Edit payment plan' : 'Set payment plan'}</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>{student.name} · {BRANCH_LABEL[student.branch] || student.branch}</p>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Promissory note (from Class Hub)</label>
        <select value={noteId} onChange={e => setNoteId(e.target.value)} disabled={!!plan} className="w-full px-3 py-2 rounded-xl border text-sm mb-3 disabled:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}>
          {(plan ? student.notes.filter(n => n.id === plan.promissoryNoteId) : noteChoices).map(n => (
            <option key={n.id} value={n.id}>{n.fileName} · uploaded {fmtDate(n.createdAt.slice(0, 10))}</option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3 mb-1">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Originally due on</label>
            <input type="date" value={originalDue} onChange={e => setOriginalDue(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Amount the note covers (₱)</label>
            <input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
        </div>
        <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>
          {!originalDue ? 'The tuition payment the family could not make on time.'
            : !sem ? 'May is between school years — pick the date the payment was due within a semester.'
            : <>{semesterLabel(sem.schoolYear, sem.semester)}. Latest allowed date: <strong style={{ color: 'var(--charcoal)' }}>{fmtDate(limit!.date)}</strong> {limit!.limitedBy === 'semester' ? '(end of the semester — the 3-month limit would cross into the next one)' : '(3 months after the original due date)'}.</>}
        </p>

        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Scheduled payments</label>
          <button onClick={splitEvenly} className="text-[11px] font-medium" style={{ color: 'var(--teal)' }}>Split the amount evenly</button>
        </div>
        <div className="space-y-2 mb-2">
          {rows.map((r, i) => (
            <div key={r.id || i} className="flex items-center gap-2">
              <span className="text-xs w-5" style={{ color: 'var(--mid-gray)' }}>{i + 1}</span>
              <input type="date" value={r.dueDate} disabled={r.locked} max={limit?.date} onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} className="flex-1 px-3 py-2 rounded-xl border text-sm disabled:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }} />
              <input type="number" min={0} step="0.01" value={r.amount} disabled={r.locked} placeholder="₱" onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className="w-32 px-3 py-2 rounded-xl border text-sm disabled:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }} />
              {r.locked
                ? <span className="text-[10px] w-14 font-semibold" style={{ color: '#92400e' }} title="Already sent to the POS queue">In POS</span>
                : <button onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1} className="w-14 text-red-500 disabled:opacity-30"><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
        {rows.length < MAX_PLAN_PAYMENTS && (
          <button onClick={() => setRows([...rows, { dueDate: '', amount: '', locked: false }])} className="inline-flex items-center gap-1 text-xs font-medium mb-3" style={{ color: 'var(--teal)' }}>
            <Plus size={13} /> Add a payment
          </button>
        )}
        <p className="text-[11px] mb-3" style={{ color: Math.abs(scheduled - amt) > 0.005 ? '#c44b00' : 'var(--mid-gray)' }}>
          Scheduled {formatCurrency(scheduled)} of {formatCurrency(amt)}
        </p>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Notes (optional)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Parent will pay after the 15th payday" className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />

        {(problem || error) && <p className="text-xs mb-3" style={{ color: '#b91c1c' }}>{error || problem}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
          <button onClick={save} disabled={!!problem || !noteId || saving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
            {saving ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </div>
    </div>
  )
}
