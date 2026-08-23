'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Target, Lock, Unlock, Save, Loader2, LineChart } from 'lucide-react'
import { PPE_CLASSIFICATION_LABELS, NON_DEPRECIATING_CLASSIFICATION_LABELS } from '@/lib/asset-classification'
import { formatCurrency } from '@/lib/utils'

type LineType = 'REVENUE' | 'COGS' | 'EXPENSE' | 'CAPEX'
interface Line { key: string; label: string; type: LineType }
interface Acct { accountNumber: string; accountTitle: string }
interface MonthData { cogs?: number; revenueByAccount?: Record<string, number>; expenseByAccount?: Record<string, number> }
interface ReportData { accounts?: Record<string, Record<string, Acct[]>>; monthly?: Record<number, MonthData> }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const BRANCHES = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SANDBOX_EAST', label: 'Aura Health East' },
  { value: 'SANDBOX_GREENHILLS', label: 'Aura Health Greenhills' },
  { value: 'VERDANA_STORE', label: 'Verdana' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]
const peso = (n: number) => formatCurrency(n)

export default function BudgetsPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role || ''
  const canEdit = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER'].includes(role)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [branch, setBranch] = useState('ALL')
  const [view, setView] = useState<'enter' | 'vs'>('enter')

  const [report, setReport] = useState<ReportData | null>(null)
  const [budgetsByMonth, setBudgetsByMonth] = useState<Record<number, Record<string, number>>>({})
  const [lockedMonths, setLockedMonths] = useState<number[]>([])
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [vsMonth, setVsMonth] = useState(now.getMonth() + 1)

  const lockedSet = useMemo(() => new Set(lockedMonths), [lockedMonths])

  const loadReport = useCallback(async () => {
    const params = new URLSearchParams({ year: String(year) })
    if (branch !== 'ALL') params.set('branch', branch)
    try { const r = await fetch(`/api/reports?${params}`); setReport(r.ok ? await r.json() : null) } catch { setReport(null) }
  }, [year, branch])

  const [capexActual, setCapexActual] = useState<Record<number, Record<string, number>>>({})
  const loadCapexActual = useCallback(async () => {
    try {
      const r = await fetch(`/api/budgets/capex-actual?year=${year}&branch=${branch}`)
      setCapexActual(r.ok ? (await r.json()).capexByMonth || {} : {})
    } catch { setCapexActual({}) }
  }, [year, branch])

  const loadBudget = useCallback(async () => {
    try {
      const r = await fetch(`/api/budgets?year=${year}&branch=${branch}`)
      if (r.ok) { const d = await r.json(); setBudgetsByMonth(d.budgetsByMonth || {}); setLockedMonths(d.lockedMonths || []) }
      else { setBudgetsByMonth({}); setLockedMonths([]) }
    } catch { setBudgetsByMonth({}); setLockedMonths([]) }
  }, [year, branch])

  useEffect(() => { setLoading(true); Promise.all([loadReport(), loadBudget(), loadCapexActual()]).finally(() => setLoading(false)) }, [loadReport, loadBudget, loadCapexActual])
  useEffect(() => {
    const seed: Record<string, string> = {}
    for (const [m, map] of Object.entries(budgetsByMonth)) for (const [k, v] of Object.entries(map)) seed[`${m}:${k}`] = String(v)
    setInputs(seed)
  }, [budgetsByMonth])
  // Keep the vs-actual month pointed at a locked month.
  useEffect(() => { if (lockedMonths.length && !lockedSet.has(vsMonth)) setVsMonth(lockedMonths[0]) }, [lockedMonths]) // eslint-disable-line react-hooks/exhaustive-deps

  const { revLines, cogsLine, expLines, capexLines } = useMemo(() => {
    const revAccts = Object.values(report?.accounts?.REVENUE || {}).flat()
    const expAccts = Object.values(report?.accounts?.EXPENSE || {}).flat()
    const revLines: Line[] = revAccts.map(a => { const key = `${a.accountNumber} ${a.accountTitle}`; return { key, label: key, type: 'REVENUE' as LineType } })
    const expLines: Line[] = expAccts.map(a => { const key = `${a.accountNumber} ${a.accountTitle}`; return { key, label: key, type: 'EXPENSE' as LineType } })
    const cogsLine: Line = { key: 'COGS — Cost of Sales', label: 'Cost of Sales (COGS)', type: 'COGS' }
    // Capital expenditure: budgeted per asset classification, so Budget vs Actual can be
    // compared against what Asset Management actually recorded as purchased.
    const capexLines: Line[] = Object.entries({ ...PPE_CLASSIFICATION_LABELS, ...NON_DEPRECIATING_CLASSIFICATION_LABELS })
      .map(([code, label]) => ({ key: `${code} ${label}`, label: `${code} ${label}`, type: 'CAPEX' as LineType }))
    return { revLines, cogsLine, expLines, capexLines }
  }, [report])
  const allLines = useMemo(() => [...revLines, cogsLine, ...expLines, ...capexLines], [revLines, cogsLine, expLines, capexLines])

  const bOf = (m: number, key: string) => parseFloat(inputs[`${m}:${key}`] || '0') || 0
  const yearTotal = (key: string) => MS.reduce((s, m) => s + bOf(m, key), 0)
  const monthSum = (lines: Line[], m: number) => lines.reduce((s, l) => s + bOf(m, l.key), 0)

  const monthEntries = (m: number) => allLines.map(l => ({ accountKey: l.key, accountType: l.type, amount: bOf(m, l.key) }))

  const save = async () => {
    setSaving(true); setMsg('')
    const monthly: Record<number, { accountKey: string; accountType: string; amount: number }[]> = {}
    for (const m of MS) if (!lockedSet.has(m)) monthly[m] = monthEntries(m)
    try {
      const r = await fetch('/api/budgets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, branch, monthly }) })
      if (r.ok) { setMsg('Saved'); await loadBudget() } else setMsg((await r.json()).error || 'Failed to save')
    } finally { setSaving(false) }
  }
  const toggleLock = async (m: number) => {
    const locked = lockedSet.has(m)
    if (!locked) {
      // Persist that month's latest figures before locking.
      await fetch('/api/budgets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, branch, monthly: { [m]: monthEntries(m) } }) })
    }
    const r = await fetch('/api/budgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: locked ? 'unlock' : 'lock', year, month: m, branch }) })
    if (r.ok) await loadBudget()
  }

  // ── Cells & rows for the year grid ──────────────────────────────
  const cellCls = 'px-1.5 py-1 text-right'
  const stickyCol = 'sticky left-0 z-10 min-w-[240px] max-w-[240px]'

  const LineRow = ({ l }: { l: Line }) => (
    <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
      <td className={`${stickyCol} px-4 py-1.5 text-sm bg-white`} style={{ color: 'var(--charcoal)' }} title={l.label}>
        <span className="block truncate">{l.label}</span>
      </td>
      {MS.map(m => (
        <td key={m} className={cellCls}>
          <input inputMode="decimal" disabled={!canEdit || lockedSet.has(m)} value={inputs[`${m}:${l.key}`] ?? ''}
            onChange={e => setInputs(p => ({ ...p, [`${m}:${l.key}`]: e.target.value }))} placeholder="0"
            className="w-20 px-1.5 py-1 rounded-md border text-xs text-right font-mono disabled:bg-gray-50 disabled:text-gray-400"
            style={{ borderColor: 'var(--light-gray)' }} />
        </td>
      ))}
      <td className={`${cellCls} font-mono text-xs font-semibold`} style={{ color: 'var(--deep-teal)' }}>{peso(yearTotal(l.key))}</td>
    </tr>
  )
  const SectionHeader = ({ title }: { title: string }) => (
    <tr style={{ background: 'var(--off-white)' }}>
      <td className={`${stickyCol} px-4 py-1.5 text-xs font-bold uppercase tracking-wide`} style={{ background: 'var(--off-white)', color: 'var(--deep-teal)' }}>{title}</td>
      <td colSpan={13} style={{ background: 'var(--off-white)' }} />
    </tr>
  )
  const TotalRow = ({ label, lines, net }: { label: string; lines: Line[]; net?: boolean }) => {
    const monthVal = (m: number) => net ? (monthSum(revLines, m) - monthSum([cogsLine], m) - monthSum(expLines, m)) : monthSum(lines, m)
    const yr = MS.reduce((s, m) => s + monthVal(m), 0)
    return (
      <tr className={net ? 'border-t-2 font-bold' : 'border-t font-semibold'} style={{ borderColor: net ? 'var(--deep-teal)' : 'var(--light-gray)', background: net ? 'var(--pale-teal)' : '#f5f8f8' }}>
        <td className={`${stickyCol} px-4 py-1.5 text-sm`} style={{ background: net ? 'var(--pale-teal)' : '#f5f8f8', color: net ? 'var(--deep-teal)' : 'var(--charcoal)' }}>{label}</td>
        {MS.map(m => <td key={m} className={`${cellCls} font-mono text-xs`} style={{ color: net ? 'var(--deep-teal)' : 'var(--charcoal)' }}>{peso(monthVal(m))}</td>)}
        <td className={`${cellCls} font-mono text-xs`} style={{ color: 'var(--deep-teal)' }}>{peso(yr)}</td>
      </tr>
    )
  }

  // ── Budget vs Actual (locked months only) ───────────────────────
  const vs = useMemo(() => {
    const m = report?.monthly?.[vsMonth] || {}
    const rev = m.revenueByAccount || {}, exp = m.expenseByAccount || {}
    const bud = budgetsByMonth[vsMonth] || {}
    const row = (l: Line) => {
      const actual = l.type === 'REVENUE' ? (rev[l.key] || 0)
        : l.type === 'COGS' ? (m.cogs || 0)
        : l.type === 'CAPEX' ? ((capexActual[vsMonth] || {})[l.key.split(' ')[0]] || 0)
        : (exp[l.key] || 0)
      const budget = bud[l.key] || 0
      const variance = actual - budget
      const favorable = l.type === 'REVENUE' ? actual >= budget : actual <= budget
      return { l, actual, budget, variance, favorable }
    }
    return { rev: revLines.map(row), cogs: row(cogsLine), exp: expLines.map(row), capex: capexLines.map(row) }
  }, [report, vsMonth, budgetsByMonth, revLines, cogsLine, expLines, capexLines, capexActual])

  const VsTable = () => {
    const rows = [...vs.rev, vs.cogs, ...vs.exp]
    const sum = (rs: typeof rows) => rs.reduce((a, r) => ({ b: a.b + r.budget, a: a.a + r.actual }), { b: 0, a: 0 })
    const tr = sum(vs.rev), tce = sum([vs.cogs, ...vs.exp])
    const netB = tr.b - tce.b, netA = tr.a - tce.a
    const VCell = ({ v, ok }: { v: number; ok: boolean }) => <span className="font-semibold" style={{ color: ok ? '#16a34a' : '#dc2626' }}>{v >= 0 ? '+' : '−'}{peso(Math.abs(v))}</span>
    const Sec = ({ title, rs }: { title: string; rs: typeof rows }) => (<>
      <tr style={{ background: 'var(--off-white)' }}><td colSpan={4} className="px-4 py-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--deep-teal)' }}>{title}</td></tr>
      {rs.map(r => (
        <tr key={r.l.key} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
          <td className="px-4 py-2 text-sm" style={{ color: 'var(--charcoal)' }}>{r.l.label}</td>
          <td className="px-4 py-2 text-right text-sm font-mono" style={{ color: 'var(--charcoal)' }}>{peso(r.budget)}</td>
          <td className="px-4 py-2 text-right text-sm font-mono" style={{ color: 'var(--charcoal)' }}>{peso(r.actual)}</td>
          <td className="px-4 py-2 text-right text-sm font-mono"><VCell v={r.variance} ok={r.favorable} /></td>
        </tr>
      ))}
    </>)
    return (
      <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--charcoal)' }}>
            {['{M} {Y} — Line Item'.replace('{M}', MONTHS[vsMonth - 1]).replace('{Y}', String(year)), 'Budget', 'Actual', 'Variance'].map((h, i) =>
              <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}
          </tr></thead>
          <tbody>
            <Sec title="Revenue" rs={vs.rev} />
            <tr className="border-t font-semibold" style={{ borderColor: 'var(--light-gray)', background: '#f5f8f8' }}>
              <td className="px-4 py-2 text-sm">Total Revenue</td><td className="px-4 py-2 text-right text-sm font-mono">{peso(tr.b)}</td><td className="px-4 py-2 text-right text-sm font-mono">{peso(tr.a)}</td>
              <td className="px-4 py-2 text-right text-sm font-mono"><VCell v={tr.a - tr.b} ok={tr.a >= tr.b} /></td>
            </tr>
            <Sec title="Cost of Sales" rs={[vs.cogs]} />
            <Sec title="Operating Expenses" rs={vs.exp} />
            <Sec title="Capital Expenditure (Asset Purchases)" rs={vs.capex} />
            <tr className="border-t font-semibold" style={{ borderColor: 'var(--light-gray)', background: '#f5f8f8' }}>
              <td className="px-4 py-2 text-sm">Total Cost &amp; Expenses</td><td className="px-4 py-2 text-right text-sm font-mono">{peso(tce.b)}</td><td className="px-4 py-2 text-right text-sm font-mono">{peso(tce.a)}</td>
              <td className="px-4 py-2 text-right text-sm font-mono"><VCell v={tce.a - tce.b} ok={tce.a <= tce.b} /></td>
            </tr>
            <tr className="border-t-2 font-bold" style={{ borderColor: 'var(--deep-teal)', background: 'var(--pale-teal)' }}>
              <td className="px-4 py-3 text-sm" style={{ color: 'var(--deep-teal)' }}>NET INCOME</td>
              <td className="px-4 py-3 text-right text-sm font-mono" style={{ color: 'var(--deep-teal)' }}>{peso(netB)}</td>
              <td className="px-4 py-3 text-right text-sm font-mono" style={{ color: 'var(--deep-teal)' }}>{peso(netA)}</td>
              <td className="px-4 py-3 text-right text-sm font-mono"><VCell v={netA - netB} ok={netA >= netB} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  if (!session?.user) return null

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--teal)' }}><Target size={20} className="text-white" /></div>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Budget</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Enter the whole year&apos;s budget in Income-Statement format, then lock each month. Budget vs Actual is generated once a month is locked.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap my-4">
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
          <button onClick={() => setView('enter')} className="px-4 py-2 text-sm font-semibold" style={view === 'enter' ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>Enter Budget</button>
          <button onClick={() => setView('vs')} className="px-4 py-2 text-sm font-semibold flex items-center gap-1.5" style={view === 'vs' ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}><LineChart size={14} /> Budget vs Actual</button>
        </div>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border text-sm bg-white" style={{ borderColor: 'var(--light-gray)' }}>{[0, 1, 2, 3, 4].map(i => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}</select>
        <select value={branch} onChange={e => setBranch(e.target.value)} className="px-3 py-2 rounded-xl border text-sm bg-white" style={{ borderColor: 'var(--light-gray)' }}>{BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}</select>
        {view === 'enter' && (
          <div className="ml-auto flex items-center gap-2">
            {msg && <span className="text-xs" style={{ color: msg === 'Saved' ? '#16a34a' : '#dc2626' }}>{msg}</span>}
            {canEdit && <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save all</button>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 size={22} className="inline animate-spin" style={{ color: 'var(--teal)' }} /></div>
      ) : view === 'enter' ? (
        <>
          <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="text-sm border-collapse">
              <thead>
                <tr style={{ background: 'var(--charcoal)' }}>
                  <th className={`${stickyCol} px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white`} style={{ background: 'var(--charcoal)' }}>{year} — Line Item</th>
                  {MS.map(m => (
                    <th key={m} className="px-1.5 py-2 text-center text-xs font-semibold text-white min-w-[92px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <span>{MON[m - 1]}</span>
                        {canEdit && (
                          <button onClick={() => toggleLock(m)} title={lockedSet.has(m) ? 'Unlock month' : 'Lock month'} className="p-0.5 rounded hover:bg-white/20">
                            {lockedSet.has(m) ? <Lock size={12} className="text-amber-300" /> : <Unlock size={12} className="text-white/60" />}
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white min-w-[96px]">Year Total</th>
                </tr>
              </thead>
              <tbody>
                <SectionHeader title="Revenue" />
                {revLines.map(l => <LineRow key={l.key} l={l} />)}
                <TotalRow label="Total Revenue" lines={revLines} />
                <SectionHeader title="Cost of Sales" />
                <LineRow l={cogsLine} />
                <SectionHeader title="Operating Expenses" />
                {expLines.map(l => <LineRow key={l.key} l={l} />)}
                <TotalRow label="Total Cost & Expenses" lines={[cogsLine, ...expLines]} />
                <TotalRow label="NET INCOME" lines={[]} net />
                {/* Capital expenditure — asset purchases, budgeted per classification.
                    Sits below net income because capex is a balance-sheet outlay, not an
                    expense; it never feeds the income-statement totals above. */}
                <SectionHeader title="Capital Expenditure (Asset Purchases)" />
                {capexLines.map(l => <LineRow key={l.key} l={l} />)}
                <TotalRow label="Total Asset Purchases" lines={capexLines} />
              </tbody>
            </table>
          </div>
          <p className="text-[11px] mt-3" style={{ color: 'var(--mid-gray)' }}>
            Enter each line&apos;s monthly budget. <Lock size={10} className="inline" /> locks a month (its figures are saved first); locked months turn grey and can&apos;t be edited until unlocked. Only Admin/Accountant/Bookkeeper can edit and lock.
          </p>
        </>
      ) : (
        // Budget vs Actual
        lockedMonths.length === 0 ? (
          <div className="rounded-2xl border px-6 py-12 text-center text-sm" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            No months are locked yet. Complete a month&apos;s budget in <strong>Enter Budget</strong> and <strong>lock</strong> it — its Budget vs Actual will appear here.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              <span className="text-xs font-semibold mr-1" style={{ color: 'var(--mid-gray)' }}>Locked month:</span>
              {[...lockedMonths].sort((a, b) => a - b).map(m => (
                <button key={m} onClick={() => setVsMonth(m)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1"
                  style={vsMonth === m ? { background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' } : { background: '#fff', color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>
                  <Lock size={10} /> {MON[m - 1]} {year}
                </button>
              ))}
            </div>
            <VsTable />
            <p className="text-[11px] mt-3" style={{ color: 'var(--mid-gray)' }}>Actuals are the Income-Statement figures for {MONTHS[vsMonth - 1]} {year}{branch !== 'ALL' ? ` · ${BRANCHES.find(b => b.value === branch)?.label}` : ''}. Variance is <span style={{ color: '#16a34a' }}>green</span> when favorable (revenue at/over target, cost/expense at/under budget), <span style={{ color: '#dc2626' }}>red</span> when unfavorable.</p>
          </>
        )
      )}
    </div>
  )
}
