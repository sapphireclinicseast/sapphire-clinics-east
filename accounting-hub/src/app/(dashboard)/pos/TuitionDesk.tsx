'use client'

// POS → Tuition: pick a Class Hub student, see what is due (Class Hub's plan
// rules + any promissory payments) and collect it. "Collect" opens the sale
// form with the tuition already on it; completing the sale records the
// payment in Class Hub — the POS is the only place tuition is recorded. A
// smaller amount than due is a partial payment: the rest stays due.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { GraduationCap, ChevronDown, ChevronRight, Loader2, RefreshCw, Search, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  REMIND_DAYS, TUITION_PLANS, currentSchoolYear, daysBetween, schoolYearPeriods, todayManila, tuitionPrefillFor,
  type TuitionPlan, type TuitionPrefill,
} from '@/lib/tuition'

interface Due {
  key: string; kind: 'REGULAR' | 'PROMISSORY'; plan: TuitionPlan; period: string; dueDate: string
  expected: number; paid: number; remaining: number; state: 'OVERDUE' | 'DUE_SOON' | 'UPCOMING'; daysUntil: number
  planItemId?: string; seq?: number; count?: number
}
interface Student {
  id: string; name: string; email: string; level: string | null; branch: string; patientId: string | null
  plan: TuitionPlan | null; rate: number | null; discountLabel: string | null
  isNew: boolean
  paidThisSy: number; yearTuition: number | null; runningBalance: number | null
  semesters: { semester: number; label: string; tuition: number; paid: number; balance: number; started: boolean }[] | null
  dues: Due[]; nextDue: Due | null
  payments: { period: string; amount: number; date: string; orderNumber: number | null; partial: boolean }[]
  /** Installments settled by discount instead of cash. */
  adjustments: { id: string; period: string; amount: number; reason: string; by: string | null; date: string }[]
  discountedThisSy: number
}

const TUITION_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS']
// Mirrors TUITION_DISCOUNT_ROLES (lib/tuition-server): settling by discount forgoes money.
const DISCOUNT_ROLES = ['ADMIN', 'ACCOUNTANT']
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
const dueText = (d: Due) => (d.daysUntil < 0 ? `${-d.daysUntil} day${d.daysUntil === -1 ? '' : 's'} overdue` : d.daysUntil === 0 ? 'due today' : `due in ${d.daysUntil} day${d.daysUntil === 1 ? '' : 's'}`)
const STATE_STYLE = {
  OVERDUE: { background: '#fee2e2', color: '#b91c1c' },
  DUE_SOON: { background: '#ffedd5', color: '#c2410c' },
  UPCOMING: { background: 'var(--off-white)', color: 'var(--charcoal)' },
}

export default function TuitionDesk({ branch, onCollect }: { branch: string; onCollect: (t: TuitionPrefill) => void }) {
  const [open, setOpen] = useState(true)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<string>('')
  const [schoolYear, setSchoolYear] = useState<number | null>(null)
  const { data: session } = useSession()
  const canDiscount = DISCOUNT_ROLES.includes((session?.user as { role?: string } | undefined)?.role ?? '')
  const enabled = TUITION_BRANCHES.includes(branch)

  const load = useCallback(async () => {
    if (!TUITION_BRANCHES.includes(branch)) { setStudents([]); return }
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/tuition/balances?branch=${branch}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not load tuition.')
      setStudents(d.students || [])
      setSchoolYear(d.schoolYear ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [branch])
  useEffect(() => { void load() }, [load])
  // A completed tuition sale changes what is due.
  useEffect(() => {
    const onRefresh = () => { void load() }
    window.addEventListener('pos-tuition-refresh', onRefresh)
    return () => window.removeEventListener('pos-tuition-refresh', onRefresh)
  }, [load])

  const owing = useMemo(() => students.filter(s => s.dues.length > 0), [students])
  // New Class Hub students show up here by themselves (the list reads Class
  // Hub live) and stay listed until their first payment is recorded.
  const newcomers = useMemo(() => students.filter(s => s.isNew), [students])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [...owing, ...newcomers.filter(s => !owing.includes(s))]
    return students.filter(s => `${s.name} ${s.email}`.toLowerCase().includes(q))
  }, [students, owing, newcomers, search])
  const student = students.find(s => s.id === picked) || null

  if (!enabled) return null
  const totalDue = owing.reduce((t, s) => t + s.dues.filter(d => d.state !== 'UPCOMING').reduce((u, d) => u + d.remaining, 0), 0)

  return (
    <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
      <button onClick={() => setOpen(!open)} className="w-full px-5 py-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
          <GraduationCap size={16} style={{ color: 'var(--teal)' }} /> Tuition — Class Hub students
          {owing.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#ffedd5', color: '#c2410c' }}>
              {owing.length} with dues · {formatCurrency(totalDue)}
            </span>
          )}
          {newcomers.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#e0f2fe', color: '#075985' }}>
              {newcomers.length} new — no payment yet
            </span>
          )}
        </span>
        {open ? <ChevronDown size={16} style={{ color: 'var(--mid-gray)' }} /> : <ChevronRight size={16} style={{ color: 'var(--mid-gray)' }} />}
      </button>
      {open && (
        <div className="px-5 pb-4 border-t" style={{ borderColor: 'var(--light-gray)' }}>
          <p className="text-[11px] mt-3 mb-2" style={{ color: 'var(--mid-gray)' }}>
            Tuition is recorded here only — Class Hub shows it once the sale is completed. Pick a student, then <strong>Collect</strong>; lower the amount for a partial payment and the rest stays due.
          </p>
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-2.5" style={{ color: 'var(--mid-gray)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search any student…" className="w-full pl-8 pr-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
            <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100" title="Refresh"><RefreshCw size={14} style={{ color: 'var(--mid-gray)' }} /></button>
          </div>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          {loading && students.length === 0 ? (
            <p className="text-xs py-3" style={{ color: 'var(--mid-gray)' }}><Loader2 size={13} className="inline animate-spin" /> Loading from Class Hub…</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {shown.length === 0 && <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{search ? 'No student matches.' : 'No tuition due within 7 days and no new students. Search a student to collect anyway.'}</span>}
              {shown.slice(0, 24).map(s => {
                const overdue = s.dues.some(d => d.state === 'OVERDUE')
                return (
                  <button key={s.id} onClick={() => setPicked(picked === s.id ? '' : s.id)} className="px-3 py-1.5 rounded-xl border text-xs text-left"
                    style={picked === s.id ? { background: 'var(--teal)', color: 'white', borderColor: 'var(--teal)' } : { borderColor: overdue ? '#fca5a5' : 'var(--light-gray)', color: 'var(--charcoal)' }}>
                    <span className="font-semibold">{s.name}</span>
                    {s.dues.length > 0 && <span className="ml-1.5" style={picked === s.id ? {} : { color: overdue ? '#b91c1c' : '#c2410c' }}>{formatCurrency(s.dues.reduce((t, d) => t + d.remaining, 0))}</span>}
                    {s.isNew && <span className="ml-1.5 text-[10px] font-bold uppercase" style={picked === s.id ? {} : { color: '#075985' }}>New</span>}
                  </button>
                )
              })}
            </div>
          )}
          {student && (
            <StudentCard key={`${student.id}:${student.dues.map(d => `${d.key}=${d.remaining}`).join()}`} student={student} onCollect={onCollect}
              schoolYear={schoolYear} canDiscount={canDiscount} onChanged={load} />
          )}
        </div>
      )}
    </div>
  )
}

function StudentCard({ student, onCollect, schoolYear, canDiscount, onChanged }: {
  student: Student; onCollect: (t: TuitionPrefill) => void
  schoolYear: number | null; canDiscount: boolean; onChanged: () => void
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(student.dues.map(d => [d.key, String(d.remaining)])))
  // Anything not on the due list: an advance payment, or a student with no plan yet.
  const sy = currentSchoolYear()
  // The installment coming due now (a mid-year enrolee starts there, not June).
  const currentPeriod = (p: TuitionPlan) => {
    const all = schoolYearPeriods(p, sy)
    const today = todayManila()
    return ([...all].reverse().find(x => daysBetween(today, x.dueDate) <= REMIND_DAYS) || all[0])?.period || ''
  }
  const [otherPlan, setOtherPlan] = useState<TuitionPlan>(student.plan || 'MONTHLY')
  const otherPeriods = schoolYearPeriods(otherPlan, sy)
  const [otherPeriod, setOtherPeriod] = useState(() => currentPeriod(student.plan || 'MONTHLY'))
  const [otherAmount, setOtherAmount] = useState('')
  const [otherPartial, setOtherPartial] = useState(false)

  const collect = (d: Due) => {
    const amt = Number(amounts[d.key]) || 0
    if (!(amt > 0)) { alert('Enter the amount being paid.'); return }
    if (amt > d.remaining + 0.005) { alert(`That is more than the ${formatCurrency(d.remaining)} due for ${d.period}. Collect the next period separately.`); return }
    onCollect(tuitionPrefillFor(student, d, amt))
  }
  // Settle what is left of an installment by discount (e.g. a promo) rather than
  // cash: nothing is rung up, the installment just stops showing as owed.
  const discount = async (d: Due) => {
    const raw = prompt(`Amount of ${d.period} settled by discount (not cash) — up to ${formatCurrency(d.remaining)}:`, String(d.remaining))
    if (raw === null) return
    const amount = Number(raw)
    if (!(amount > 0) || amount > d.remaining + 0.005) { alert(`Enter an amount up to ${formatCurrency(d.remaining)}.`); return }
    const reason = prompt('Why is it settled by discount? (e.g. the promo that covered it)', student.discountLabel || '')
    if (!reason?.trim()) return
    const r = await fetch('/api/tuition/adjustments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.id, schoolYear: schoolYear ?? sy, period: d.period, amount, reason }),
    })
    const res = await r.json().catch(() => ({}))
    if (!r.ok) { alert(res.error || 'Could not save the discount.'); return }
    onChanged()
  }
  const removeDiscount = async (id: string, label: string) => {
    if (!confirm(`Remove the ${label} discount? That amount shows as owed again.`)) return
    const r = await fetch(`/api/tuition/adjustments?id=${id}`, { method: 'DELETE' })
    if (!r.ok) { alert('Could not remove the discount.'); return }
    onChanged()
  }
  const collectOther = () => {
    const amt = Number(otherAmount) || 0
    if (!(amt > 0) || !otherPeriod) { alert('Pick the period and enter the amount.'); return }
    onCollect({
      studentId: student.id, studentName: student.name, patientId: student.patientId,
      plan: otherPlan, period: otherPeriod, amount: Math.round(amt * 100) / 100,
      isPartialPayment: otherPartial, listMode: !otherPartial, discountLabel: student.discountLabel,
    })
  }

  return (
    <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap text-xs" style={{ color: 'var(--charcoal)' }}>
        <div>
          <p className="text-sm font-semibold">{student.name}</p>
          <p style={{ color: 'var(--mid-gray)' }}>
            {student.plan ? <>{student.plan.toLowerCase()} plan{student.rate ? <> · {formatCurrency(student.rate)} per installment</> : null}</> : 'No plan yet — the first payment sets it'}
            {' · '}paid this school year <strong style={{ color: '#166534' }}>{formatCurrency(student.paidThisSy)}</strong>
            {student.discountedThisSy > 0.005 && <> · settled by discount <strong>{formatCurrency(student.discountedThisSy)}</strong></>}
          </p>
          {student.semesters && student.runningBalance != null && (
            <p style={{ color: 'var(--mid-gray)' }}>
              {student.semesters.map(x => (
                <span key={x.semester} className="mr-3" style={{ opacity: x.started ? 1 : 0.6 }}>
                  Sem {x.semester}: {formatCurrency(x.paid)} of {formatCurrency(x.tuition)}{x.balance > 0.005 ? <strong style={{ color: '#c44b00' }}> · {formatCurrency(x.balance)} left</strong> : ' ✓'}
                </span>
              ))}
              <br />Running balance (semesters started):{' '}
              <strong style={{ color: student.runningBalance > 0.005 ? '#c44b00' : '#166534' }}>
                {student.runningBalance < -0.005 ? `${formatCurrency(-student.runningBalance)} paid ahead` : formatCurrency(student.runningBalance)}
              </strong>
            </p>
          )}
        </div>
        {student.nextDue && <p style={{ color: 'var(--mid-gray)' }}>Next: {student.nextDue.period} · {formatCurrency(student.nextDue.remaining)} on {fmtDate(student.nextDue.dueDate)}</p>}
      </div>

      {student.dues.length > 0 ? (
        <table className="w-full text-xs">
          <thead><tr>{['Due', 'For', 'Amount due', 'Collect now', ''].map(h => <th key={h} className="text-left pb-1 pr-3 font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>)}</tr></thead>
          <tbody>
            {student.dues.map(d => {
              const amt = Number(amounts[d.key]) || 0
              const partial = amt > 0 && amt < d.remaining - 0.005
              return (
                <tr key={d.key}>
                  <td className="pr-3 py-1 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={STATE_STYLE[d.state]}>{fmtDate(d.dueDate)} · {dueText(d)}</span>
                  </td>
                  <td className="pr-3 py-1">
                    {d.period}
                    {d.kind === 'PROMISSORY' && <span className="ml-1 text-[11px] font-semibold" style={{ color: '#7c3aed' }}>promissory {d.seq} of {d.count}</span>}
                    {d.paid > 0.005 && d.kind === 'REGULAR' && <span className="ml-1 text-[11px]" style={{ color: 'var(--mid-gray)' }}>({formatCurrency(d.paid)} of {formatCurrency(d.expected)} paid)</span>}
                  </td>
                  <td className="pr-3 py-1 font-mono">{formatCurrency(d.remaining)}</td>
                  <td className="pr-3 py-1">
                    <input type="number" min={0} step="0.01" value={amounts[d.key] ?? ''} onChange={e => setAmounts({ ...amounts, [d.key]: e.target.value })}
                      className="w-28 px-2 py-1 rounded-lg border text-xs text-right outline-none bg-white" style={{ borderColor: partial ? '#f59e0b' : 'var(--light-gray)' }} />
                    {partial && <span className="ml-1.5 text-[11px] font-semibold" style={{ color: '#b45309' }}>partial — {formatCurrency(d.remaining - amt)} stays due</span>}
                  </td>
                  <td className="py-1 text-right whitespace-nowrap">
                    {canDiscount && d.kind === 'REGULAR' && (
                      <button onClick={() => discount(d)} className="mr-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border bg-white" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
                        title="Settle what is left by discount (e.g. a promo) — no cash is recorded">Discount</button>
                    )}
                    <button onClick={() => collect(d)} className="px-3 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>Collect</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Nothing due within 7 days.</p>
      )}

      {student.isNew && (
        <p className="text-xs font-semibold" style={{ color: '#075985' }}>
          New student — no payment recorded yet. Record the first payment below; its plan becomes the student&apos;s plan.
        </p>
      )}
      <details className="text-xs" open={!student.plan}>
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--teal)' }}>{student.plan ? 'Other tuition payment (advance, or a period not listed)' : 'First tuition payment'}</summary>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <select value={otherPlan} onChange={e => { const p = e.target.value as TuitionPlan; setOtherPlan(p); setOtherPeriod(currentPeriod(p)) }} className="px-2 py-1.5 rounded-lg border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            {TUITION_PLANS.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </select>
          <select value={otherPeriod} onChange={e => setOtherPeriod(e.target.value)} className="px-2 py-1.5 rounded-lg border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            {otherPeriods.map(p => <option key={p.period} value={p.period}>{p.period}</option>)}
          </select>
          <input type="number" min={0} step="0.01" value={otherAmount} onChange={e => setOtherAmount(e.target.value)} placeholder="Amount paid ₱" className="w-32 px-2 py-1.5 rounded-lg border bg-white text-right" style={{ borderColor: 'var(--light-gray)' }} />
          <label className="flex items-center gap-1" style={{ color: 'var(--charcoal)' }}>
            <input type="checkbox" checked={otherPartial} onChange={e => setOtherPartial(e.target.checked)} /> Partial payment
          </label>
          <button onClick={collectOther} className="px-3 py-1.5 rounded-lg font-semibold text-white" style={{ background: 'var(--teal)' }}>Collect</button>
        </div>
        <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>
          Not partial: the tuition is rung at its list price and the difference is the discount. Partial: it is rung at exactly the amount paid.
        </p>
      </details>

      {student.payments.length > 0 && (
        <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
          <span className="font-semibold">Recorded this school year:</span>{' '}
          {student.payments.slice(-6).map((p, i) => (
            <span key={i} className="mr-2">{p.period} {formatCurrency(p.amount)}{p.partial ? ' (partial)' : ''}{p.orderNumber ? ` #${p.orderNumber}` : ''}</span>
          ))}
        </div>
      )}
      {student.adjustments.length > 0 && (
        <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
          <span className="font-semibold">Settled by discount:</span>{' '}
          {student.adjustments.map(a => (
            <span key={a.id} className="mr-2 inline-flex items-center gap-0.5" title={`${a.reason}${a.by ? ` · ${a.by}` : ''} · ${fmtDate(a.date)}`}>
              {a.period} {formatCurrency(a.amount)} ({a.reason})
              {canDiscount && (
                <button onClick={() => removeDiscount(a.id, `${a.period} ${formatCurrency(a.amount)}`)} className="p-0.5 rounded hover:bg-red-50" title="Remove this discount">
                  <X size={10} style={{ color: '#dc2626' }} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
