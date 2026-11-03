'use client'

/**
 * Payroll › Employees › Special Pay Runs — 13th-month, maternity and final pay.
 *
 * Each run is saved as a payslip whose period carries a suffix instead of a
 * cutoff number (see src/lib/payroll/special-runs.ts), so once it is locked it
 * is posted to the ledger, lands in Salaries Payable for payment, and shows up
 * in Taxes › Withholding on Compensation by itself. This screen only prepares
 * the figures; Lock & Post / Unlock call the same endpoints as a regular cutoff.
 *
 * A year can have a 13th-month payout schedule (e.g. 50% with the November 1st
 * cutoff, the rest with the 2nd); each payout is then prepared and locked on
 * its own. 13th-month payslips stay out of the staff's My Payslips until
 * payroll clicks Release to staff.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Gift, Baby, LogOut, Loader2, RefreshCw, Save, Lock, Unlock, Trash2, Plus, X, AlertCircle, Info, CheckCircle2, Eye, EyeOff, CalendarClock } from 'lucide-react'
import {
  SPECIAL_LABEL, THIRTEENTH_EXEMPT_CEILING, LEAVE_CONVERSION_EXEMPT_DAYS, classifyLines, parseSpecialPeriod,
  cleanTranches, trancheFor, trancheDue, cutoffLabel, type SpecialRunType, type SpecialLine, type ThirteenthTranche,
} from '@/lib/payroll/special-runs'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const peso = (v: unknown) => `₱${(Number(v) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const n = (v: unknown) => Number(v) || 0
const r2 = (v: number) => Math.round(v * 100) / 100
const BRANCH_LABEL: Record<string, string> = { SBEA: 'East', SBGH: 'Greenhills', VERDANA: 'Verdana' }
const inputCls = 'px-2.5 py-1.5 rounded-lg border text-xs'
const inputStyle = { borderColor: 'var(--light-gray)' }

interface Run {
  id: string; type: SpecialRunType; cutoffPeriod: string; year: number; month: number; branch: string; status: string
  employeeId: string; name: string; gross: number; taxable: number; exempt: number; tax: number; deductions: number; net: number
  salariesRemitted: boolean; taxRemitted: boolean
  details: {
    lines?: SpecialLine[]; deductions?: { label: string; amount: number }[]; notes?: string | null
    maternity?: { days: number; sssBenefit: number; fullPay: number; periodFrom?: string | null; periodTo?: string | null }
    tranche?: { month: number; cutoff: number; percent: number; cumPercent: number; isLast: boolean }
    holdFromStaff?: boolean
  }
}
interface ThirteenthRow {
  employeeId: string; name: string; branch: string; isMWE: boolean
  basis: number; lates: number; cutoffs: number; draftCutoffs: number; accrued: number; alreadyPaid: number; due: number; exemptUsed: number
  existing: { id: string; status: string; amount: number; extraBasic: number } | null
}
interface Emp { id: string; firstName: string; lastName: string; branch: string; isActive: boolean }
interface FinalSheet {
  employee: { id: string; name: string; branch: string; isActive: boolean; isMWE: boolean; dailyRate: number }
  period: string
  thirteenth: { basis: number; cutoffs: number; draftCutoffs: number; accrued: number; alreadyPaid: number; due: number }
  leave: { type: string; max: number; used: number; remaining: number }[]
  loans: { id: string; label: string; balance: number }[]
  exemptUsed: number; monthTaxable: number
  existing: { id: string; status: string } | null
}
interface MatSheet {
  employee: { id: string; name: string; branch: string; dailyRate: number }
  period: string; calendarDayRate: number
  maternityLeaves: { startDate: string | null; endDate: string | null }[]
  existing: { id: string; status: string } | null
}
interface ExtraLine { key: string; label: string; amount: string; taxable: boolean }
interface TrancheEdit { key: string; month: string; cutoff: string; percent: string }
interface DedLine { key: string; label: string; amount: string; staffLoanId?: string | null }

const TABS: { key: SpecialRunType; label: string; icon: typeof Gift }[] = [
  { key: 'THIRTEENTH', label: '13th Month Pay', icon: Gift },
  { key: 'MATERNITY', label: 'Maternity Pay', icon: Baby },
  { key: 'FINAL', label: 'Final Pay', icon: LogOut },
]

export default function SpecialPayRuns({ canWrite, branch, cutoffMonth, cutoffYear }: { canWrite: boolean; branch: string; cutoffMonth: number; cutoffYear: number }) {
  const [tab, setTab] = useState<SpecialRunType>('THIRTEENTH')
  // The month the run is PAID in — it decides which month's payroll, ledger and 1601-C it falls under.
  const [year, setYear] = useState(cutoffYear)
  const [month, setMonth] = useState(cutoffMonth)
  useEffect(() => { setYear(cutoffYear); setMonth(cutoffMonth) }, [cutoffYear, cutoffMonth])

  const [runs, setRuns] = useState<Run[]>([])
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [schedule, setSchedule] = useState<ThirteenthTranche[]>([])   // the year's 13th-month payout schedule; [] = one run per month

  const fetchRuns = useCallback(async () => {
    setLoadingRuns(true)
    try {
      const q = new URLSearchParams({ year: String(year) }); if (branch) q.set('branch', branch)
      const res = await fetch(`/api/payroll/special-runs?${q}`)
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to load special runs'); return }
      setRuns(Array.isArray(d.runs) ? d.runs : [])
      setSchedule(Array.isArray(d.schedule) ? d.schedule : [])
    } catch (e) { setError(String(e)) } finally { setLoadingRuns(false) }
  }, [year, branch])
  useEffect(() => { fetchRuns() }, [fetchRuns])

  /* ── 13th-month payout schedule for the year ── */
  const [schedEdit, setSchedEdit] = useState<TrancheEdit[] | null>(null)   // null = not editing
  const [t13PickRaw, setT13Pick] = useState('')   // "<month>-<cutoff>" of the payout being prepared
  // The payout being prepared — defaults to the one in the payroll month on screen, else the first.
  const pick = useMemo(() => {
    if (!schedule.length) return null
    const [m, c] = t13PickRaw.split('-').map(Number)
    const fallback = schedule.find(t => t.month === cutoffMonth) || schedule[0]
    return trancheFor(schedule, m, c) || trancheFor(schedule, fallback.month, fallback.cutoff)
  }, [schedule, t13PickRaw, cutoffMonth])
  const t13Month = pick ? pick.month : month
  const t13Cutoff = pick ? pick.cutoff : null
  const t13Cum = pick ? pick.cumPercent : 100
  const trancheText = (t: { percent: number; isLast: boolean }, count: number) => (t.isLast && count > 1 ? 'balance' : `${t.percent}%`)

  const schedProblem = schedEdit ? cleanTranches(schedEdit.map(t => ({ month: t.month, cutoff: t.cutoff, percent: t.percent }))).problem : null
  const schedTotal = schedEdit ? r2(schedEdit.reduce((s, t) => s + n(t.percent), 0)) : 0
  const startSchedEdit = () => setSchedEdit(schedule.length
    ? schedule.map((t, i) => ({ key: `t${i}`, month: String(t.month), cutoff: String(t.cutoff), percent: String(t.percent) }))
    : [{ key: 't0', month: String(month), cutoff: '1', percent: '50' }, { key: 't1', month: String(month), cutoff: '2', percent: '50' }])
  const saveSchedule = async (tranches: TrancheEdit[]) => {
    setError(''); setNotice(''); setBusy('schedule')
    try {
      const res = await fetch('/api/payroll/special-runs', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, tranches: tranches.map(t => ({ month: n(t.month), cutoff: n(t.cutoff), percent: n(t.percent) })) }) })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to save the payout schedule'); return }
      setSchedule(d.schedule || []); setSchedEdit(null); setT13([])
      setNotice(d.schedule?.length ? `13th-month payout schedule for ${year} saved.` : `Payout schedule for ${year} removed — the 13th month is paid in one run again.`)
    } catch (e) { setError(String(e)) } finally { setBusy('') }
  }

  const save = async (type: SpecialRunType, rows: unknown[], at?: { month: number; cutoff: number | null }) => {
    setError(''); setNotice(''); setBusy('save')
    try {
      const res = await fetch('/api/payroll/special-runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, year, month: at ? at.month : month, cutoff: at?.cutoff ?? null, rows }) })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to save'); return false }
      const skipped: { name: string; reason: string }[] = d.skipped || []
      if (skipped.length) setError(`Not saved — ${skipped.map(s => `${s.name}: ${s.reason}`).join('; ')}`)
      if ((d.saved || []).length) setNotice(`${d.saved.length} ${SPECIAL_LABEL[type].toLowerCase()} draft${d.saved.length === 1 ? '' : 's'} saved. Review below, then Lock & Post.`)
      await fetchRuns()
      return (d.saved || []).length > 0
    } catch (e) { setError(String(e)); return false } finally { setBusy('') }
  }

  /* ── Lock & post / unlock / delete — the regular payroll endpoints ── */
  const lockGroup = async (cutoffPeriod: string, br: string, group: Run[]) => {
    const total = group.reduce((s, x) => s + x.net, 0)
    const held = group.some(x => x.details.holdFromStaff === true)
    if (!confirm(`Lock and post ${group.length} payslip(s) for ${group[0] ? SPECIAL_LABEL[group[0].type] : cutoffPeriod} — ${BRANCH_LABEL[br] || br}?\n\nNet to pay: ${peso(total)}. This posts the journal entry and sends the net pay to Salaries Payable.${held ? '\n\nStaff are not notified: no email goes out, and the payslips stay hidden from their My Payslips until you click Release to staff.' : ''}`)) return
    setBusy(`lock:${cutoffPeriod}|${br}`); setError(''); setNotice('')
    try {
      const draftIds = group.filter(x => x.status === 'DRAFT').map(x => x.id)
      if (draftIds.length) {
        const r = await fetch('/api/payroll/employee-payslips', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: draftIds, status: 'FINAL' }) })
        if (!r.ok) { setError((await r.json()).error || 'Failed to finalize'); return }
      }
      const res = await fetch('/api/payroll/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cutoffPeriod, branch: br, payrollType: 'EMPLOYEE' }) })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to lock'); return }
      setNotice(`Locked and posted. It is now in Salaries Payable for payment, and in Taxes › Withholding on Compensation.${held ? ' Staff cannot see it yet — click Release to staff when you are ready.' : ''}`)
    } catch (e) { setError(String(e)) } finally { setBusy(''); fetchRuns() }
  }
  const unlockGroup = async (cutoffPeriod: string, br: string) => {
    if (!confirm('Unlock this run? Its journal entry is deleted and the payslips become editable again. Not possible once it has been paid or its tax remitted.')) return
    setBusy(`unlock:${cutoffPeriod}|${br}`); setError(''); setNotice('')
    try {
      const res = await fetch('/api/payroll/finalize', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cutoffPeriod, branch: br, payrollType: 'EMPLOYEE' }) })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to unlock'); return }
      setNotice('Unlocked. The payslips are editable again.')
    } catch (e) { setError(String(e)) } finally { setBusy(''); fetchRuns() }
  }
  const removeRun = async (run: Run) => {
    if (!confirm(`Delete the ${SPECIAL_LABEL[run.type].toLowerCase()} draft for ${run.name}?`)) return
    setBusy(`del:${run.id}`); setError('')
    try {
      const res = await fetch(`/api/payroll/special-runs?id=${run.id}`, { method: 'DELETE' })
      if (!res.ok) setError((await res.json()).error || 'Failed to delete')
    } catch (e) { setError(String(e)) } finally { setBusy(''); fetchRuns() }
  }
  const removeDrafts = async (key: string, label: string, drafts: Run[]) => {
    if (!confirm(`Delete all ${drafts.length} unlocked payslip(s) of ${label}?`)) return
    setBusy(`deldrafts:${key}`); setError('')
    try {
      for (const r of drafts) {
        const res = await fetch(`/api/payroll/special-runs?id=${r.id}`, { method: 'DELETE' })
        if (!res.ok) { setError(`${r.name}: ${(await res.json()).error || 'Failed to delete'}`); break }
      }
    } catch (e) { setError(String(e)) } finally { setBusy(''); fetchRuns() }
  }
  /** Show or hide a 13th-month run in the staff's My Payslips (teletherapy hub). Nothing is emailed either way. */
  const setStaffVisibility = async (cutoffPeriod: string, br: string, count: number, release: boolean) => {
    if (!confirm(release
      ? `Show these ${count} 13th-month payslip(s) in the staff's My Payslips?\n\nNo email or notice is sent — staff see them the next time they open My Payslips.`
      : `Hide these ${count} 13th-month payslip(s) from the staff's My Payslips again?`)) return
    setBusy(`vis:${cutoffPeriod}|${br}`); setError(''); setNotice('')
    try {
      const res = await fetch('/api/payroll/special-runs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cutoffPeriod, branch: br, holdFromStaff: !release }) })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to update'); return }
      setNotice(release ? 'Released — staff can now see these payslips in My Payslips.' : 'Hidden from staff again.')
    } catch (e) { setError(String(e)) } finally { setBusy(''); fetchRuns() }
  }

  /* ══ 13th month ══ */
  const [t13, setT13] = useState<ThirteenthRow[]>([])
  const [t13Edit, setT13Edit] = useState<Record<string, { include: boolean; extra: string; amount: string; touched: boolean; tax: string }>>({})
  const [t13Loading, setT13Loading] = useState(false)
  const load13 = useCallback(async () => {
    setT13Loading(true); setError('')
    try {
      const q = new URLSearchParams({ compute: 'THIRTEENTH', year: String(year), month: String(t13Month) }); if (branch) q.set('branch', branch)
      if (t13Cutoff) q.set('cutoff', String(t13Cutoff))
      const res = await fetch(`/api/payroll/special-runs?${q}`)
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to compute'); return }
      const rows: ThirteenthRow[] = d.rows || []
      setT13(rows)
      const ed: typeof t13Edit = {}
      for (const r of rows) {
        const locked = r.existing?.status === 'LOCKED'
        ed[r.employeeId] = {
          include: !locked && (r.existing ? true : r.due > 0),
          extra: r.existing?.extraBasic ? String(r.existing.extraBasic) : '',
          amount: String(r.existing ? r.existing.amount : r.due),
          touched: !!r.existing,
          tax: '',
        }
      }
      setT13Edit(ed)
    } catch (e) { setError(String(e)) } finally { setT13Loading(false) }
  }, [year, t13Month, t13Cutoff, branch])

  const set13 = (id: string, patch: Partial<{ include: boolean; extra: string; amount: string; touched: boolean; tax: string }>) =>
    setT13Edit(prev => {
      const cur = prev[id]; if (!cur) return prev
      const next = { ...cur, ...patch }
      // Changing the extra basic pay recomputes the amount, unless the amount was typed by hand.
      if (patch.extra !== undefined && !next.touched) {
        const row = t13.find(r => r.employeeId === id)
        if (row) next.amount = String(trancheDue((row.basis + n(patch.extra)) / 12, t13Cum, row.alreadyPaid))
      }
      return { ...prev, [id]: next }
    })

  const save13 = async () => {
    const rows = t13.filter(r => t13Edit[r.employeeId]?.include && n(t13Edit[r.employeeId].amount) > 0).map(r => ({
      employeeId: r.employeeId, extraBasic: n(t13Edit[r.employeeId].extra),
      lines: [{ kind: 'THIRTEENTH', label: `13th month pay ${year}${pick ? ` — ${trancheText(pick, pick.count)} (${MONTHS[pick.month - 1]} ${cutoffLabel(pick.cutoff)})` : ''}`, amount: n(t13Edit[r.employeeId].amount) }],
      // Blank = let the hub compute the withholding; a typed figure (0 included) overrides it.
      taxOverride: t13Edit[r.employeeId].tax === '' ? null : n(t13Edit[r.employeeId].tax),
    }))
    if (!rows.length) { setError('Tick at least one employee with an amount to pay.'); return }
    if (await save('THIRTEENTH', rows, { month: t13Month, cutoff: t13Cutoff })) load13()
  }

  /* ══ Employee picker (maternity + final pay) ══ */
  const [emps, setEmps] = useState<Emp[]>([])
  useEffect(() => {
    if (tab === 'THIRTEENTH' || emps.length) return
    const q = new URLSearchParams({ employees: '1' }); if (branch) q.set('branch', branch)
    fetch(`/api/payroll/special-runs?${q}`).then(r => r.ok ? r.json() : { employees: [] }).then(d => setEmps(d.employees || [])).catch(() => {})
  }, [tab, branch, emps.length])
  useEffect(() => { setEmps([]) }, [branch])

  /* ══ Final pay ══ */
  const [finEmp, setFinEmp] = useState('')
  const [fin, setFin] = useState<FinalSheet | null>(null)
  const [finLoading, setFinLoading] = useState(false)
  const [fin13, setFin13] = useState('')
  const [finLeaveDays, setFinLeaveDays] = useState('')
  const [finLeaveRate, setFinLeaveRate] = useState('')
  const [finLeaveAmt, setFinLeaveAmt] = useState('')   // '' = days × rate; a typed figure overrides it
  const [finExtras, setFinExtras] = useState<ExtraLine[]>([])
  const [finDeds, setFinDeds] = useState<DedLine[]>([])
  const [finTax, setFinTax] = useState('')
  const [finNotes, setFinNotes] = useState('')
  const loadFinal = useCallback(async (employeeId: string) => {
    if (!employeeId) { setFin(null); return }
    setFinLoading(true); setError('')
    try {
      const res = await fetch(`/api/payroll/special-runs?${new URLSearchParams({ compute: 'FINAL', employeeId, year: String(year), month: String(month) })}`)
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to compute'); setFin(null); return }
      setFin(d)
      setFin13(String(d.thirteenth.due))
      const sil = (d.leave as FinalSheet['leave']).find(l => l.type === 'SIL')
      setFinLeaveDays(String(sil ? sil.remaining : 0))
      setFinLeaveRate(String(d.employee.dailyRate))
      setFinLeaveAmt('')
      setFinExtras([])
      setFinDeds((d.loans as FinalSheet['loans']).map(l => ({ key: `loan-${l.id}`, label: l.label, amount: String(l.balance), staffLoanId: l.id })))
      setFinTax(''); setFinNotes('')
    } catch (e) { setError(String(e)) } finally { setFinLoading(false) }
  }, [year, month])
  useEffect(() => { if (tab === 'FINAL') loadFinal(finEmp) }, [tab, finEmp, loadFinal])

  const finLines: SpecialLine[] = useMemo(() => {
    const out: SpecialLine[] = []
    if (n(fin13) > 0) out.push({ kind: 'THIRTEENTH', label: `Pro-rated 13th month pay ${year}`, amount: n(fin13) })
    const days = n(finLeaveDays), rate = n(finLeaveRate)
    const leaveAmt = finLeaveAmt === '' ? r2(days * rate) : n(finLeaveAmt)
    if (leaveAmt > 0) out.push({ kind: 'LEAVE_CONVERSION', label: `Unused leave converted to cash (${days} day${days === 1 ? '' : 's'})`, amount: leaveAmt, days, rate })
    for (const x of finExtras) if (n(x.amount) > 0) out.push({ kind: x.taxable ? 'OTHER_TAXABLE' : 'OTHER_NONTAXABLE', label: x.label || 'Other pay', amount: n(x.amount) })
    return out
  }, [fin13, finLeaveDays, finLeaveRate, finLeaveAmt, finExtras, year])
  const finCalc = useMemo(() => classifyLines(finLines, fin?.exemptUsed || 0), [finLines, fin])
  const finDedTotal = finDeds.reduce((s, d) => s + n(d.amount), 0)

  const saveFinal = async () => {
    if (!fin) return
    const ok = await save('FINAL', [{
      employeeId: fin.employee.id, lines: finLines,
      deductions: finDeds.filter(d => n(d.amount) > 0).map(d => ({ label: d.label || 'Deduction', amount: n(d.amount), staffLoanId: d.staffLoanId || null })),
      taxOverride: finTax === '' ? null : n(finTax), notes: finNotes,
    }])
    if (ok) loadFinal(fin.employee.id)
  }

  /* ══ Maternity ══ */
  const [matEmp, setMatEmp] = useState('')
  const [mat, setMat] = useState<MatSheet | null>(null)
  const [matLoading, setMatLoading] = useState(false)
  const [matFrom, setMatFrom] = useState('')
  const [matTo, setMatTo] = useState('')
  const [matDays, setMatDays] = useState('105')
  const [matFull, setMatFull] = useState('')
  const [matFullTouched, setMatFullTouched] = useState(false)
  const [matSss, setMatSss] = useState('')
  const [matDiffOv, setMatDiffOv] = useState('')   // '' = full pay less SSS benefit; a typed figure overrides it
  const [matNotes, setMatNotes] = useState('')
  const loadMat = useCallback(async (employeeId: string) => {
    if (!employeeId) { setMat(null); return }
    setMatLoading(true); setError('')
    try {
      const res = await fetch(`/api/payroll/special-runs?${new URLSearchParams({ compute: 'MATERNITY', employeeId, year: String(year), month: String(month) })}`)
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to load'); setMat(null); return }
      setMat(d)
      const lv = (d.maternityLeaves || [])[0]
      setMatFrom(lv?.startDate ? String(lv.startDate).slice(0, 10) : '')
      setMatTo(lv?.endDate ? String(lv.endDate).slice(0, 10) : '')
      setMatDays('105'); setMatFullTouched(false); setMatFull(String(r2(d.calendarDayRate * 105))); setMatSss(''); setMatDiffOv(''); setMatNotes('')
    } catch (e) { setError(String(e)) } finally { setMatLoading(false) }
  }, [year, month])
  useEffect(() => { if (tab === 'MATERNITY') loadMat(matEmp) }, [tab, matEmp, loadMat])
  useEffect(() => { if (mat && !matFullTouched) setMatFull(String(r2(mat.calendarDayRate * n(matDays)))) }, [matDays, mat, matFullTouched])
  const matDiffComputed = r2(Math.max(0, n(matFull) - n(matSss)))
  const matDiff = matDiffOv === '' ? matDiffComputed : r2(Math.max(0, n(matDiffOv)))

  const saveMat = async () => {
    if (!mat) return
    if (!(n(matSss) > 0) && !(matDiff > 0)) { setError('Enter the SSS maternity benefit and/or the full pay for the leave.'); return }
    const ok = await save('MATERNITY', [{
      employeeId: mat.employee.id, notes: matNotes,
      lines: matDiff > 0 ? [{ kind: 'SALARY_DIFFERENTIAL', label: `Maternity salary differential (${n(matDays)} days)`, amount: matDiff, days: n(matDays) }] : [],
      maternity: { periodFrom: matFrom || undefined, periodTo: matTo || undefined, days: n(matDays), sssBenefit: n(matSss), fullPay: n(matFull) },
    }])
    if (ok) loadMat(mat.employee.id)
  }

  /* ══ Saved runs for the active tab ══ */
  const tabRuns = runs.filter(r => r.type === tab)
  const groups = useMemo(() => {
    const m = new Map<string, Run[]>()
    for (const r of tabRuns) { const k = `${r.cutoffPeriod}|${r.branch}`; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r) }
    return [...m.entries()].map(([k, g]) => ({
      key: k, cutoffPeriod: g[0].cutoffPeriod, branch: g[0].branch, month: g[0].month, year: g[0].year,
      cutoff: parseSpecialPeriod(g[0].cutoffPeriod)?.cutoff ?? null, tranche: g[0].details.tranche ?? null,
      held: g.some(r => r.details.holdFromStaff === true),
      runs: g.sort((a, b) => a.name.localeCompare(b.name)),
    }))
      .sort((a, b) => b.cutoffPeriod.localeCompare(a.cutoffPeriod) || a.branch.localeCompare(b.branch))
  }, [tabRuns])

  const statusPill = (s: string) => {
    const c = s === 'LOCKED' ? { bg: '#dcfce7', fg: '#166534', t: 'Locked & posted' } : s === 'FINAL' ? { bg: '#dbeafe', fg: '#1e40af', t: 'Final' } : { bg: '#fef3c7', fg: '#92400e', t: 'Draft' }
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: c.bg, color: c.fg }}>{c.t}</span>
  }
  const Note = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-start gap-2 p-3 rounded-lg text-xs" style={{ background: '#eff6ff', color: '#1e40af' }}><Info size={14} className="mt-0.5 shrink-0" /><div>{children}</div></div>
  )
  const empSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={e => onChange(e.target.value)} className={`${inputCls} min-w-[260px]`} style={inputStyle}>
      <option value="">Select employee…</option>
      {emps.map(e => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName} — {BRANCH_LABEL[e.branch] || e.branch}{e.isActive ? '' : ' (inactive)'}</option>)}
    </select>
  )

  return (
    <div className="space-y-4">
      {/* Type tabs + pay month */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setError(''); setNotice('') }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all"
              style={tab === t.key ? { background: 'var(--deep-teal)', color: '#fff', borderColor: 'var(--deep-teal)' } : { color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          {tab === 'THIRTEENTH' && pick ? (
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payout</label>
              <select value={`${pick.month}-${pick.cutoff}`} onChange={e => { setT13Pick(e.target.value); setT13([]) }} className={inputCls} style={inputStyle}>
                {schedule.map((t, i) => <option key={`${t.month}-${t.cutoff}`} value={`${t.month}-${t.cutoff}`}>{MONTHS[t.month - 1]} · {cutoffLabel(t.cutoff)} — {trancheText({ percent: t.percent, isLast: i === schedule.length - 1 }, schedule.length)}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Paid in (month)</label>
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className={inputCls} style={inputStyle}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Year</label>
            <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || year)} className={`${inputCls} w-20`} style={inputStyle} />
          </div>
        </div>
      </div>

      {error && <div className="flex items-start gap-2 p-3 rounded-lg text-xs" style={{ background: '#fef2f2', color: '#dc2626' }}><AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{error}</span></div>}
      {notice && <div className="flex items-start gap-2 p-3 rounded-lg text-xs" style={{ background: '#f0fdf4', color: '#166534' }}><CheckCircle2 size={14} className="mt-0.5 shrink-0" /> <span>{notice}</span></div>}

      {/* ── 13th month worksheet ── */}
      {tab === 'THIRTEENTH' && (
        <div className="space-y-3">
          <Note>
            <b>13th month = basic salary earned in {year} ÷ 12.</b> Basic salary is the basic pay and paid leave on the finalized or locked cutoff payslips, less tardiness and undertime — overtime, holiday and rest-day premiums, night differential and allowances are not included. Use <b>Add&apos;l basic pay</b> for basic salary that is not in the hub yet (e.g. cutoffs still to be run before year-end). 13th-month pay is tax-exempt up to {peso(THIRTEENTH_EXEMPT_CEILING)} a year; only the excess is taxed. Every computed figure is a starting point: type over <b>Amount to pay</b> or <b>Withholding tax</b> to override it.
            {' '}Locking a 13th-month run notifies no one: it stays hidden from the staff&apos;s <b>My Payslips</b> until you click <b>Release to staff</b>.
          </Note>

          {/* Payout schedule — which cutoffs the 13th month is paid with, and how much in each */}
          <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--charcoal)' }}><CalendarClock size={14} style={{ color: 'var(--teal)' }} /> Payout schedule — {year}</div>
              {canWrite && !schedEdit && (
                <button onClick={startSchedEdit} className="text-[11px] font-semibold" style={{ color: 'var(--teal)' }}>{schedule.length ? 'Edit schedule' : 'Set up payout schedule'}</button>
              )}
            </div>
            {!schedEdit && (schedule.length === 0
              ? <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Not set: the whole 13th month is paid in one run, in the month you pick above. Set a schedule to pay it in parts with regular cutoffs, e.g. 50% with the November 1st cutoff and 50% with the 2nd.</div>
              : <div className="flex flex-wrap gap-1.5">
                  {schedule.map((t, i) => (
                    <span key={`${t.month}-${t.cutoff}`} className="px-2 py-1 rounded-lg text-[11px] font-medium" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                      {MONTHS[t.month - 1]} · {cutoffLabel(t.cutoff)} — {t.percent}%{i === schedule.length - 1 && schedule.length > 1 ? ' (pays the balance)' : ''}
                    </span>
                  ))}
                </div>)}
            {schedEdit && (
              <div className="space-y-2">
                {schedEdit.map(t => (
                  <div key={t.key} className="flex flex-wrap items-center gap-2">
                    <select value={t.month} onChange={e => setSchedEdit(p => p && p.map(x => x.key === t.key ? { ...x, month: e.target.value } : x))} className={inputCls} style={inputStyle}>
                      {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <select value={t.cutoff} onChange={e => setSchedEdit(p => p && p.map(x => x.key === t.key ? { ...x, cutoff: e.target.value } : x))} className={inputCls} style={inputStyle}>
                      <option value="1">1st cutoff</option><option value="2">2nd cutoff</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <input type="number" value={t.percent} onChange={e => setSchedEdit(p => p && p.map(x => x.key === t.key ? { ...x, percent: e.target.value } : x))} className={`${inputCls} w-20 text-right`} style={inputStyle} />
                      <span className="text-xs">% of the 13th month</span>
                    </div>
                    <button onClick={() => setSchedEdit(p => p && p.filter(x => x.key !== t.key))} title="Remove this payout"><X size={13} style={{ color: 'var(--mid-gray)' }} /></button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => setSchedEdit(p => p && [...p, { key: `t${Date.now()}`, month: String(month), cutoff: '2', percent: '' }])} className="flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--teal)' }}><Plus size={12} /> Add payout</button>
                  <span className="text-[11px] font-semibold" style={{ color: Math.abs(schedTotal - 100) > 0.001 ? '#dc2626' : '#166534' }}>Total {schedTotal}%</span>
                  {schedProblem && schedEdit.length > 0 && <span className="text-[11px]" style={{ color: '#dc2626' }}>{schedProblem}</span>}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>Each payout pays its share of the 13th month as computed when you run it; the last one pays whatever is left, so it also picks up basic salary earned after the earlier payouts.</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => saveSchedule(schedEdit)} disabled={busy === 'schedule' || (schedEdit.length > 0 && !!schedProblem)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60" style={{ background: 'var(--deep-teal)' }}>
                    {busy === 'schedule' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {schedEdit.length ? 'Save schedule' : 'Remove schedule'}
                  </button>
                  <button onClick={() => setSchedEdit(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* A whole-month draft saved before the schedule counts as already paid and would zero the scheduled payouts. */}
          {schedule.length > 0 && groups.filter(g => !g.cutoff && g.runs.some(r => r.status !== 'LOCKED')).map(g => (
            <div key={`legacy-${g.key}`} className="flex items-start gap-2 p-3 rounded-lg text-xs" style={{ background: '#fffbeb', color: '#92400e' }}>
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>The <b>{MONTHS[g.month - 1]} {g.year} · {BRANCH_LABEL[g.branch] || g.branch}</b> 13th-month draft was saved before the payout schedule, as one full payment. It counts as already paid, so the scheduled payouts would come out as ₱0 — use <b>Delete drafts</b> on it below, then compute again.</span>
            </div>
          ))}
          {pick && (
            <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              {pick.isLast && pick.count > 1
                ? <><b>{MONTHS[pick.month - 1]} {cutoffLabel(pick.cutoff)}</b> is the last payout: it pays the balance — the full 13th month less what is already paid.</>
                : <><b>{MONTHS[pick.month - 1]} {cutoffLabel(pick.cutoff)}</b> pays {pick.percent}% of the 13th month{pick.index > 0 ? ` (${pick.cumPercent}% in total once it is out, less what is already paid)` : ''}.</>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={load13} disabled={t13Loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60" style={{ background: 'var(--teal)' }}>
              {t13Loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {t13.length ? 'Recompute' : 'Compute 13th month'}
            </button>
            {canWrite && t13.length > 0 && (
              <button onClick={save13} disabled={busy === 'save'} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60" style={{ background: 'var(--deep-teal)' }}>
                {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save ticked as draft
              </button>
            )}
            {t13.length > 0 && <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              {t13.filter(r => t13Edit[r.employeeId]?.include).length} ticked · {peso(t13.filter(r => t13Edit[r.employeeId]?.include).reduce((s, r) => s + n(t13Edit[r.employeeId]?.amount), 0))}
            </span>}
          </div>
          {t13.length > 0 && (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-xs">
                <thead><tr style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                  {['', 'Employee', 'Branch', 'Cutoffs', 'Basic salary earned', "Add'l basic pay", '13th month accrued', 'Already paid', pick ? `This payout (${trancheText(pick, pick.count)})` : 'Amount to pay', 'Taxable', 'Withholding tax', 'Status'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}
                </tr></thead>
                <tbody>
                  {t13.map(r => {
                    const ed = t13Edit[r.employeeId]; if (!ed) return null
                    const locked = r.existing?.status === 'LOCKED'
                    const accrued = r2((r.basis + n(ed.extra)) / 12)
                    const taxable = classifyLines([{ kind: 'THIRTEENTH', label: '', amount: n(ed.amount) }], r.exemptUsed).taxable
                    return (
                      <tr key={r.employeeId} className="border-t" style={{ borderColor: 'var(--light-gray)', opacity: locked ? 0.6 : 1 }}>
                        <td className="px-3 py-2"><input type="checkbox" checked={ed.include} disabled={locked || !canWrite} onChange={e => set13(r.employeeId, { include: e.target.checked })} /></td>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{r.name}{r.isMWE && <span className="ml-1 text-[10px]" style={{ color: 'var(--mid-gray)' }}>MWE</span>}</td>
                        <td className="px-3 py-2">{BRANCH_LABEL[r.branch] || r.branch}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.cutoffs}{r.draftCutoffs > 0 && <span className="ml-1 text-[10px]" style={{ color: '#d97706' }} title="Draft cutoff payslips are not counted until finalized">+{r.draftCutoffs} draft</span>}</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap" title={r.lates ? `After ${peso(r.lates)} of tardiness/undertime` : ''}>{peso(r.basis)}</td>
                        <td className="px-3 py-2"><input type="number" value={ed.extra} disabled={locked || !canWrite} onChange={e => set13(r.employeeId, { extra: e.target.value })} placeholder="0.00" className={`${inputCls} w-28 text-right`} style={inputStyle} /></td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{peso(accrued)}</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{r.alreadyPaid ? peso(r.alreadyPaid) : '—'}</td>
                        <td className="px-3 py-2"><input type="number" value={ed.amount} disabled={locked || !canWrite} onChange={e => set13(r.employeeId, { amount: e.target.value, touched: true })} className={`${inputCls} w-28 text-right font-semibold`} style={inputStyle} /></td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: taxable > 0 ? '#dc2626' : 'var(--mid-gray)' }}>{taxable > 0 ? peso(taxable) : 'Exempt'}</td>
                        <td className="px-3 py-2"><input type="number" value={ed.tax} disabled={locked || !canWrite} onChange={e => set13(r.employeeId, { tax: e.target.value })} placeholder="Computed" title="Leave blank to compute it on save; type a figure to override" className={`${inputCls} w-24 text-right`} style={inputStyle} /></td>
                        <td className="px-3 py-2">{r.existing ? statusPill(r.existing.status) : <span style={{ color: 'var(--mid-gray)' }}>Not saved</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Maternity worksheet ── */}
      {tab === 'MATERNITY' && (
        <div className="space-y-3">
          <Note>
            Under the Expanded Maternity Leave Law the employee receives her <b>full pay</b> for the leave (105 days; 120 for a solo parent; 60 for miscarriage or emergency termination). SSS pays the <b>maternity benefit</b>, which the company advances and later claims back; the company itself pays only the <b>salary differential</b> (full pay less the SSS benefit). Both are tax-exempt. Saving here creates a payslip for the salary differential and records the SSS benefit as an advance under <b>Benefits Payable › Availments</b>, where its payment and SSS reimbursement are tracked.
          </Note>
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Employee</label>{empSelect(matEmp, setMatEmp)}</div>
            {matLoading && <Loader2 size={14} className="animate-spin mb-2" style={{ color: 'var(--mid-gray)' }} />}
          </div>
          {mat && (
            <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="flex items-center gap-2 text-sm font-semibold">{mat.employee.name} {mat.existing && statusPill(mat.existing.status)}</div>
              {mat.existing?.status === 'LOCKED' && <div className="text-xs" style={{ color: '#d97706' }}>A maternity run for this month is already locked. Unlock it below to change it.</div>}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Leave from</label><input type="date" value={matFrom} onChange={e => setMatFrom(e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Leave to</label><input type="date" value={matTo} onChange={e => setMatTo(e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Days of leave</label>
                  <select value={['105', '120', '60'].includes(matDays) ? matDays : 'custom'} onChange={e => { if (e.target.value !== 'custom') setMatDays(e.target.value) }} className={`${inputCls} w-full`} style={inputStyle}>
                    <option value="105">105 — live birth</option><option value="120">120 — solo parent</option><option value="60">60 — miscarriage / ETP</option><option value="custom">Other…</option>
                  </select></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Days (edit if different)</label><input type="number" value={matDays} onChange={e => setMatDays(e.target.value)} className={`${inputCls} w-full text-right`} style={inputStyle} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Full pay for the leave</label><input type="number" value={matFull} onChange={e => { setMatFull(e.target.value); setMatFullTouched(true) }} className={`${inputCls} w-full text-right`} style={inputStyle} />
                  <div className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>{peso(mat.calendarDayRate)}/day × {n(matDays)} days = {peso(mat.calendarDayRate * n(matDays))}</div></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>SSS maternity benefit</label><input type="number" value={matSss} onChange={e => setMatSss(e.target.value)} placeholder="From the SSS computation" className={`${inputCls} w-full text-right`} style={inputStyle} />
                  <div className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>Advanced by the company, reimbursed by SSS</div></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Salary differential (payroll)</label><input type="number" value={matDiffOv} onChange={e => setMatDiffOv(e.target.value)} placeholder={String(matDiffComputed)} className={`${inputCls} w-full text-right font-semibold`} style={inputStyle} />
                  <div className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>Full pay less SSS benefit = {peso(matDiffComputed)} — tax-exempt. Type a figure to override.</div></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Total the employee receives</label><div className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold text-right" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{peso(n(matSss) + matDiff)}</div></div>
              </div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Notes</label><input value={matNotes} onChange={e => setMatNotes(e.target.value)} className={`${inputCls} w-full`} style={inputStyle} placeholder="e.g. SSS claim reference" /></div>
              {canWrite && mat.existing?.status !== 'LOCKED' && (
                <button onClick={saveMat} disabled={busy === 'save'} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60" style={{ background: 'var(--deep-teal)' }}>
                  {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save as draft
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Final pay worksheet ── */}
      {tab === 'FINAL' && (
        <div className="space-y-3">
          <Note>
            Final pay gathers what is still owed to an employee who is leaving: the <b>pro-rated 13th month</b> (basic salary earned this year ÷ 12, less any 13th month already released), <b>unused leave converted to cash</b> (tax-exempt for the first {LEAVE_CONVERSION_EXEMPT_DAYS} days), and anything else you add — less outstanding <b>staff loans</b> and other deductions. Run the last regular cutoff as usual first; unpaid salary that will not go through a cutoff can be added as a taxable line here.
          </Note>
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Employee</label>{empSelect(finEmp, setFinEmp)}</div>
            {finLoading && <Loader2 size={14} className="animate-spin mb-2" style={{ color: 'var(--mid-gray)' }} />}
          </div>
          {fin && (() => {
            const locked = fin.existing?.status === 'LOCKED'
            const tax = finTax === '' ? null : n(finTax)
            const net = r2(finCalc.gross - (tax ?? 0) - finDedTotal)
            return (
              <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--light-gray)' }}>
                <div className="flex items-center gap-2 text-sm font-semibold">{fin.employee.name} {fin.existing && statusPill(fin.existing.status)}{fin.employee.isActive && <span className="text-[10px] font-normal" style={{ color: '#d97706' }}>still marked active</span>}</div>
                {locked && <div className="text-xs" style={{ color: '#d97706' }}>The final pay for this month is already locked. Unlock it below to change it.</div>}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Earnings</div>
                    <div>
                      <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Pro-rated 13th month pay</label>
                      <input type="number" value={fin13} disabled={locked} onChange={e => setFin13(e.target.value)} className={`${inputCls} w-40 text-right`} style={inputStyle} />
                      <div className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>
                        Basic earned {peso(fin.thirteenth.basis)} over {fin.thirteenth.cutoffs} cutoff{fin.thirteenth.cutoffs === 1 ? '' : 's'} ÷ 12 = {peso(fin.thirteenth.accrued)}{fin.thirteenth.alreadyPaid > 0 && <> · less {peso(fin.thirteenth.alreadyPaid)} already paid</>}
                        {fin.thirteenth.draftCutoffs > 0 && <span style={{ color: '#d97706' }}> · {fin.thirteenth.draftCutoffs} draft cutoff(s) not counted</span>}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Unused leave converted to cash</label>
                      <div className="flex items-center gap-2">
                        <input type="number" value={finLeaveDays} disabled={locked} onChange={e => setFinLeaveDays(e.target.value)} className={`${inputCls} w-20 text-right`} style={inputStyle} /> <span className="text-xs">days ×</span>
                        <input type="number" value={finLeaveRate} disabled={locked} onChange={e => setFinLeaveRate(e.target.value)} className={`${inputCls} w-28 text-right`} style={inputStyle} />
                        <span className="text-xs">=</span>
                        <input type="number" value={finLeaveAmt} disabled={locked} onChange={e => setFinLeaveAmt(e.target.value)} placeholder={String(r2(n(finLeaveDays) * n(finLeaveRate)))} title="Leave blank to use days × rate; type a figure to override" className={`${inputCls} w-28 text-right`} style={inputStyle} />
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>
                        Unused this year: {fin.leave.map(l => `${l.type === 'VACATION' ? 'VL' : l.type === 'SICK' ? 'SL' : l.type} ${l.remaining}/${l.max}`).join(' · ')}. Defaults to unused SIL; change the days to follow company policy.
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between"><label className="text-[10px] font-semibold" style={{ color: 'var(--mid-gray)' }}>Other pay</label>
                        {!locked && <button onClick={() => setFinExtras(p => [...p, { key: `x${Date.now()}`, label: '', amount: '', taxable: true }])} className="flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--teal)' }}><Plus size={12} /> Add line</button>}</div>
                      {finExtras.length === 0 && <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>None. Add unpaid salary, separation pay, refunds…</div>}
                      {finExtras.map(x => (
                        <div key={x.key} className="flex items-center gap-2 mt-1.5">
                          <input value={x.label} onChange={e => setFinExtras(p => p.map(y => y.key === x.key ? { ...y, label: e.target.value } : y))} placeholder="Description" className={`${inputCls} flex-1`} style={inputStyle} />
                          <input type="number" value={x.amount} onChange={e => setFinExtras(p => p.map(y => y.key === x.key ? { ...y, amount: e.target.value } : y))} placeholder="0.00" className={`${inputCls} w-28 text-right`} style={inputStyle} />
                          <label className="flex items-center gap-1 text-[11px] whitespace-nowrap"><input type="checkbox" checked={x.taxable} onChange={e => setFinExtras(p => p.map(y => y.key === x.key ? { ...y, taxable: e.target.checked } : y))} /> Taxable</label>
                          <button onClick={() => setFinExtras(p => p.filter(y => y.key !== x.key))}><X size={13} style={{ color: 'var(--mid-gray)' }} /></button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between"><div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Deductions</div>
                      {!locked && <button onClick={() => setFinDeds(p => [...p, { key: `d${Date.now()}`, label: '', amount: '' }])} className="flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--teal)' }}><Plus size={12} /> Add deduction</button>}</div>
                    {finDeds.length === 0 && <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>No outstanding staff loans on record.</div>}
                    {finDeds.map(d => (
                      <div key={d.key} className="flex items-center gap-2">
                        <input value={d.label} disabled={!!d.staffLoanId} onChange={e => setFinDeds(p => p.map(y => y.key === d.key ? { ...y, label: e.target.value } : y))} placeholder="Description" className={`${inputCls} flex-1`} style={inputStyle} />
                        <input type="number" value={d.amount} onChange={e => setFinDeds(p => p.map(y => y.key === d.key ? { ...y, amount: e.target.value } : y))} placeholder="0.00" className={`${inputCls} w-28 text-right`} style={inputStyle} />
                        {d.staffLoanId && <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }} title="Repays the staff loan when the run is locked">loan</span>}
                        <button onClick={() => setFinDeds(p => p.filter(y => y.key !== d.key))}><X size={13} style={{ color: 'var(--mid-gray)' }} /></button>
                      </div>
                    ))}
                    <div>
                      <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Withholding tax</label>
                      <input type="number" value={finTax} disabled={locked} onChange={e => setFinTax(e.target.value)} placeholder="Computed on save" className={`${inputCls} w-40 text-right`} style={inputStyle} />
                      <div className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>Leave blank to compute it from the taxable part ({peso(finCalc.taxable)}) on top of this month&apos;s other taxable pay ({peso(fin.monthTaxable)}). Type a figure to override, e.g. the year-end adjustment.</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                  {[['Gross final pay', finCalc.gross], ['Tax-exempt', r2(finCalc.exempt13th + finCalc.exemptOther)], ['Taxable', finCalc.taxable], ['Deductions', finDedTotal], [tax == null ? 'Net (before tax)' : 'Net final pay', net]].map(([l, v]) => (
                    <div key={l as string} className="rounded-lg p-2.5" style={{ background: 'var(--off-white)' }}><div className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>{l}</div><div className="font-mono font-semibold">{peso(v)}</div></div>
                  ))}
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Notes</label><input value={finNotes} disabled={locked} onChange={e => setFinNotes(e.target.value)} className={`${inputCls} w-full`} style={inputStyle} placeholder="e.g. last day, clearance reference" /></div>
                {canWrite && !locked && (
                  <button onClick={saveFinal} disabled={busy === 'save' || finCalc.gross <= 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60" style={{ background: 'var(--deep-teal)' }}>
                    {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save as draft
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Saved runs ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 pt-2">
          <div className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>Saved {SPECIAL_LABEL[tab].toLowerCase()} runs — {year}</div>
          {loadingRuns && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--mid-gray)' }} />}
        </div>
        {!loadingRuns && groups.length === 0 && <div className="text-xs p-4 rounded-xl border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>No {SPECIAL_LABEL[tab].toLowerCase()} runs saved for {year} yet.</div>}
        {groups.map(g => {
          const open = g.runs.filter(r => r.status !== 'LOCKED')
          const allLocked = open.length === 0
          const paid = g.runs.some(r => r.salariesRemitted || r.taxRemitted)
          return (
            <div key={g.key} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" style={{ background: 'var(--off-white)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs font-semibold">
                    {MONTHS[g.month - 1]} {g.year}{g.cutoff ? ` · ${cutoffLabel(g.cutoff)}` : ''}{g.tranche ? ` (${g.tranche.isLast && g.tranche.cumPercent === 100 && g.tranche.percent < 100 ? 'balance' : `${g.tranche.percent}%`})` : ''} · {BRANCH_LABEL[g.branch] || g.branch}
                    <span className="font-normal" style={{ color: 'var(--mid-gray)' }}> · {g.runs.length} payslip{g.runs.length === 1 ? '' : 's'} · net {peso(g.runs.reduce((s, r) => s + r.net, 0))}</span>
                  </div>
                  {tab === 'THIRTEENTH' && (g.held
                    ? <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#f3f4f6', color: '#4b5563' }} title="Not shown in the staff's My Payslips"><EyeOff size={11} /> Hidden from staff</span>
                    : g.runs.some(r => r.status === 'LOCKED') && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#dcfce7', color: '#166534' }}><Eye size={11} /> In staff&apos;s My Payslips</span>)}
                </div>
                {canWrite && (
                  <div className="flex items-center gap-2">
                    {tab === 'THIRTEENTH' && g.runs.some(r => r.status === 'LOCKED') && (
                      <button onClick={() => setStaffVisibility(g.cutoffPeriod, g.branch, g.runs.length, g.held)} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-60" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                        {busy === `vis:${g.key}` ? <Loader2 size={13} className="animate-spin" /> : g.held ? <Eye size={13} /> : <EyeOff size={13} />} {g.held ? 'Release to staff' : 'Hide from staff'}
                      </button>
                    )}
                    {open.length > 0 && (
                      <button onClick={() => removeDrafts(g.key, `${MONTHS[g.month - 1]} ${g.year}${g.cutoff ? ` ${cutoffLabel(g.cutoff)}` : ''} · ${BRANCH_LABEL[g.branch] || g.branch}`, open)} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-60" style={{ borderColor: 'var(--light-gray)', color: '#dc2626' }}>
                        {busy === `deldrafts:${g.key}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete drafts
                      </button>
                    )}
                    {!allLocked && (
                      <button onClick={() => lockGroup(g.cutoffPeriod, g.branch, open)} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60" style={{ background: '#dc2626' }}>
                        {busy === `lock:${g.key}` ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />} Lock &amp; Post
                      </button>
                    )}
                    {g.runs.some(r => r.status === 'LOCKED') && !paid && (
                      <button onClick={() => unlockGroup(g.cutoffPeriod, g.branch)} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-60" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                        {busy === `unlock:${g.key}` ? <Loader2 size={13} className="animate-spin" /> : <Unlock size={13} />} Unlock
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr style={{ color: 'var(--mid-gray)' }}>{['Employee', 'Gross', 'Tax-exempt', 'Taxable', 'Tax withheld', 'Deductions', 'Net pay', 'Status', ''].map(h => <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody>
                    {g.runs.map(r => (
                      <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                        <td className="px-3 py-2">
                          <div className="font-medium whitespace-nowrap">{r.name}</div>
                          <div className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                            {(r.details.lines || []).map(l => `${l.label} ${peso(l.amount)}`).join(' · ')}
                            {r.details.maternity && r.details.maternity.sssBenefit > 0 && <>{(r.details.lines || []).length ? ' · ' : ''}SSS benefit advanced {peso(r.details.maternity.sssBenefit)} (in Availments)</>}
                            {(r.details.deductions || []).length > 0 && <> · less {(r.details.deductions || []).map(d => `${d.label} ${peso(d.amount)}`).join(', ')}</>}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{peso(r.gross)}</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{peso(r.exempt)}</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{peso(r.taxable)}</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{peso(r.tax)}</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{peso(r.deductions)}</td>
                        <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">{peso(r.net)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{statusPill(r.status)}{r.salariesRemitted && <span className="ml-1 text-[10px]" style={{ color: '#166534' }}>paid</span>}</td>
                        <td className="px-3 py-2">{canWrite && r.status !== 'LOCKED' && (
                          <button onClick={() => removeRun(r)} disabled={!!busy} title="Delete this draft">{busy === `del:${r.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} style={{ color: '#dc2626' }} />}</button>
                        )}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
