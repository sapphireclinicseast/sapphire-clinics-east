'use client'

// Budget — enter the year's budget in Income-Statement format per branch, lock
// each month, and read Budget vs Actual for the locked months or the full year.
// All Branches is a read-only rollup (the API sums every branch). The arithmetic
// lives in ./budget-math.ts and the grid/table pieces in ./BudgetViews.tsx.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { AlertTriangle, Check, Info, LineChart, Loader2, Lock, Save, Target } from 'lucide-react'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'
import { PPE_CLASSIFICATION_LABELS, NON_DEPRECIATING_CLASSIFICATION_LABELS } from '@/lib/asset-classification'
import {
  MS, buildLines, isDirty, monthEntries, netIncomeRow, seedInputs, totalRow, vsRows, vsTotals, yearTotal,
  type ReportData,
} from './budget-math'
import { BudgetGrid, LockStrip, MON, PctOfBudget, Tile, Variance, VsTable, pesoSigned, FAV, UNFAV } from './BudgetViews'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const BRANCHES = [
  { value: 'ALL', label: 'All Branches', short: 'All branches' },
  { value: 'SANDBOX_EAST', label: 'Aura Health East', short: 'East' },
  { value: 'SANDBOX_GREENHILLS', label: 'Aura Health Greenhills', short: 'Greenhills' },
  { value: 'VERDANA_STORE', label: 'Verdana', short: 'Verdana' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute', short: 'Institute' },
]
const CAPEX_LABELS = { ...PPE_CLASSIFICATION_LABELS, ...NON_DEPRECIATING_CLASSIFICATION_LABELS }
type Period = 'H1' | 'H2' | 'FY'
const PERIOD_MONTHS: Record<Period, number[]> = { H1: [1, 2, 3, 4, 5, 6], H2: [7, 8, 9, 10, 11, 12], FY: MS }
const card = { borderColor: 'var(--light-gray)', background: 'white' }
const muted = { color: 'var(--mid-gray)' }
const seg = (on: boolean) => (on ? { background: 'var(--teal)', color: '#fff' } : { color: 'var(--mid-gray)' })
const segBtn = 'h-7 px-3 rounded-md text-xs font-semibold whitespace-nowrap transition-colors'
const segWrap = 'inline-flex rounded-lg border p-0.5 bg-white'
const pill = (on: boolean) => on
  ? { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }
  : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }
const toolbar = { background: '#fcfdfa', borderColor: 'var(--light-gray)' }

export default function BudgetsPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role || ''

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [branch, setBranch] = useState('ALL')
  // "All Branches" is a read-only rollup: the API returns the SUM of every
  // branch's budget, so there is nothing to type, save, or lock here.
  const isRollup = branch === 'ALL'
  const canEdit = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER'].includes(role) && !isRollup
  const [view, setView] = useState<'enter' | 'vs'>('enter')

  const [report, setReport] = useState<ReportData | null>(null)
  const [budgetsByMonth, setBudgetsByMonth] = useState<Record<number, Record<string, number>>>({})
  const [lockedMonths, setLockedMonths] = useState<number[]>([])
  const [capexActual, setCapexActual] = useState<Record<number, Record<string, number>>>({})
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [saving, setSaving] = useState(false)
  const [lockBusy, setLockBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [vsMonth, setVsMonth] = useState(now.getMonth() + 1)
  // Layout preferences
  const [period, setPeriod] = useState<Period>(() => (now.getMonth() < 6 ? 'H1' : 'H2'))
  const [hideEmptyPref, setHideEmpty] = useState<boolean | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const lockedSet = useMemo(() => new Set(lockedMonths), [lockedMonths])
  // Read-only views start with the empty lines hidden; editors start seeing every line.
  const hideEmpty = hideEmptyPref ?? (view === 'vs' || !canEdit)

  const loadReport = useCallback(async () => {
    const params = new URLSearchParams({ year: String(year) })
    if (branch !== 'ALL') params.set('branch', branch)
    try {
      const r = await fetch(`/api/reports?${params}`)
      setReport(r.ok ? await r.json() : null)
      return r.ok ? '' : `the chart of accounts and actuals (HTTP ${r.status})`
    } catch { setReport(null); return 'the chart of accounts and actuals' }
  }, [year, branch])

  const loadCapexActual = useCallback(async () => {
    try {
      const r = await fetch(`/api/budgets/capex-actual?year=${year}&branch=${branch}`)
      setCapexActual(r.ok ? (await r.json()).capexByMonth || {} : {})
      return r.ok ? '' : `asset purchases (HTTP ${r.status})`
    } catch { setCapexActual({}); return 'asset purchases' }
  }, [year, branch])

  const loadBudget = useCallback(async () => {
    try {
      const r = await fetch(`/api/budgets?year=${year}&branch=${branch}`)
      if (r.ok) { const d = await r.json(); setBudgetsByMonth(d.budgetsByMonth || {}); setLockedMonths(d.lockedMonths || []); return '' }
      setBudgetsByMonth({}); setLockedMonths([]); return `the budget (HTTP ${r.status})`
    } catch { setBudgetsByMonth({}); setLockedMonths([]); return 'the budget' }
  }, [year, branch])

  useEffect(() => {
    setLoading(true); setLoadError('')
    Promise.all([loadReport(), loadBudget(), loadCapexActual()])
      .then(errs => { const e = errs.filter(Boolean); if (e.length) setLoadError(`Could not load ${e.join(', ')}.`) })
      .finally(() => setLoading(false))
  }, [loadReport, loadBudget, loadCapexActual, reload])
  const seed = useMemo(() => seedInputs(budgetsByMonth), [budgetsByMonth])
  useEffect(() => { setInputs(seed) }, [seed])
  // Keep the vs-actual month pointed at a locked month; 0 = the Full Year view,
  // which is always available (and the only option before any month is locked).
  useEffect(() => {
    if (!lockedMonths.length) setVsMonth(0)
    else if (vsMonth !== 0 && !lockedSet.has(vsMonth)) setVsMonth(lockedMonths[0])
  }, [lockedMonths]) // eslint-disable-line react-hooks/exhaustive-deps

  const lines = useMemo(() => buildLines(report, CAPEX_LABELS), [report])
  const { revLines, cogsLine, expLines, capexLines } = lines
  const allLines = useMemo(() => [...revLines, cogsLine, ...expLines, ...capexLines], [revLines, cogsLine, expLines, capexLines])
  const dirty = useMemo(() => isDirty(inputs, seed), [inputs, seed])

  // Year-grid totals (same rows as before: revenue, cost & expenses, net income, capex).
  const totals = useMemo(() => ({
    rev: totalRow(inputs, revLines),
    ce: totalRow(inputs, [cogsLine, ...expLines]),
    net: netIncomeRow(inputs, revLines, cogsLine, expLines),
    capex: totalRow(inputs, capexLines),
  }), [inputs, revLines, cogsLine, expLines, capexLines])

  const vs = useMemo(() => vsRows(lines, report, vsMonth === 0 ? MS : [vsMonth], budgetsByMonth, capexActual),
    [lines, report, vsMonth, budgetsByMonth, capexActual])
  const vsT = useMemo(() => vsTotals(vs), [vs])

  const save = async () => {
    setSaving(true); setMsg('')
    const monthly: Record<number, { accountKey: string; accountType: string; amount: number }[]> = {}
    for (const m of MS) if (!lockedSet.has(m)) monthly[m] = monthEntries(inputs, allLines, m)
    try {
      const r = await fetch('/api/budgets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, branch, monthly }) })
      if (r.ok) { setMsg('Saved'); await loadBudget() } else setMsg((await r.json().catch(() => ({}))).error || 'Failed to save')
    } catch { setMsg('Failed to save — check the connection') } finally { setSaving(false) }
  }
  const toggleLock = async (m: number) => {
    const locked = lockedSet.has(m)
    // Locking reloads the budget, which would drop unsaved figures in other months.
    if (!locked && dirty) {
      if (!window.confirm(`You have unsaved changes. Save all of them, then lock ${MONTHS[m - 1]}?`)) return
      await save()
    }
    setLockBusy(m)
    try {
      if (!locked) {
        // Persist that month's latest figures before locking.
        await fetch('/api/budgets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, branch, monthly: { [m]: monthEntries(inputs, allLines, m) } }) })
      }
      const r = await fetch('/api/budgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: locked ? 'unlock' : 'lock', year, month: m, branch }) })
      if (r.ok) await loadBudget()
      else setMsg((await r.json().catch(() => ({}))).error || `Could not ${locked ? 'unlock' : 'lock'} ${MON[m - 1]}`)
    } finally { setLockBusy(null) }
  }
  // Switching year or branch reloads the grid; don't drop typed figures silently.
  const guard = (fn: () => void) => () => { if (!dirty || window.confirm('Discard the budget changes you have not saved?')) { setMsg(''); fn() } }
  const toggleSection = (id: string) => setCollapsed(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  if (!session?.user) return null

  const branchLabel = BRANCHES.find(b => b.value === branch)?.label || branch
  const vsHeading = `${vsMonth === 0 ? `Full year ${year}` : `${MONTHS[vsMonth - 1]} ${year}`}`
  const margin = totals.rev.year ? (totals.net.year / totals.rev.year) * 100 : null

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      {/* ── Title + branch / year ── */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <Target size={22} style={{ color: 'var(--teal)' }} /> Budget
          </h1>
          <p className="mt-1 text-[13px] max-w-3xl" style={muted}>Enter the year&apos;s budget in Income-Statement format, then lock each month. Budget vs Actual is ready once a month is locked.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {BRANCHES.map(b => (
            <button key={b.value} onClick={() => { if (b.value !== branch) guard(() => setBranch(b.value))() }} aria-pressed={branch === b.value} title={b.label}
              className="px-3.5 py-1.5 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors" style={pill(branch === b.value)}>
              {b.short}
            </button>
          ))}
          <span className="w-px h-6 mx-1" style={{ background: 'var(--light-gray)' }} />
          <select value={year} aria-label="Year" onChange={e => { const y = parseInt(e.target.value); guard(() => setYear(y))() }}
            className="h-8 px-2.5 rounded-lg border text-[13px] font-semibold bg-white" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            {[0, 1, 2, 3, 4].map(i => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* ── Views ── */}
      <div className="border-b-2" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex items-end gap-1 -mb-[2px] max-w-full overflow-x-auto" role="tablist">
          {([['enter', 'Enter budget'], ['vs', 'Budget vs Actual']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} role="tab" aria-selected={view === v}
              className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 whitespace-nowrap transition-colors hover:text-[var(--teal)]"
              style={{ borderColor: view === v ? 'var(--teal)' : 'transparent', color: view === v ? 'var(--teal)' : 'var(--mid-gray)' }}>
              {v === 'vs' && <LineChart size={14} />} {l}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border px-4 py-3 flex flex-wrap items-center gap-3" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', borderLeft: '4px solid #dc2626' }}>
          <AlertTriangle size={18} />
          <p className="text-[13px] flex-1 min-w-0">{loadError} The figures below may be incomplete.</p>
          <button onClick={() => setReload(n => n + 1)} className={hrBtn.ghost} style={{ borderColor: '#fecaca', color: '#b91c1c' }}>Try again</button>
        </div>
      )}

      {loading ? <LoadingState /> : view === 'enter' ? (
        <>
          {/* ── Year at a glance ── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard compact label={`Revenue budget ${year}`} value={pesoSigned(totals.rev.year)} sub={branchLabel} accent={{ line: '#4A8073' }} />
            <StatCard compact label="Cost & expenses" value={pesoSigned(totals.ce.year)} sub="COGS + operating expenses" accent={{ line: '#8A9AA0' }} />
            <StatCard compact label="Net income" value={pesoSigned(totals.net.year)} sub={margin == null ? '—' : `${margin.toFixed(1)}% of revenue`}
              accent={{ line: '#3C6A5F', bg: '#f4f8ea', fg: '#3C6A5F' }} />
            <StatCard compact label="Asset purchases" value={pesoSigned(totals.capex.year)} sub="capex, outside net income" accent={{ line: '#2563eb' }} />
            <div className="col-span-2 lg:col-span-1">
              <Tile label="Months locked" value={`${lockedMonths.length} of 12`} line={lockedMonths.length ? '#d97706' : 'var(--light-gray)'}
                note={isRollup ? 'locked in every branch' : lockedMonths.length === 12 ? 'whole year locked' : lockedMonths.length ? 'locked months are read-only' : 'none yet'}>
                <LockStrip locked={lockedSet} />
              </Tile>
            </div>
          </div>

          {isRollup && (
            <div className="rounded-lg border px-4 py-2.5 text-xs flex items-start gap-2" style={{ borderColor: 'var(--light-gray)', borderLeft: '4px solid var(--teal)', background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
              <Info size={14} className="mt-px shrink-0" />
              <span>All Branches shows the <strong>total of every branch&apos;s budget</strong> and is read-only. Pick a branch above to enter amounts or lock months; a month shows as locked here once every branch has locked it.</span>
            </div>
          )}

          {/* ── The grid ── */}
          <div className="rounded-lg border overflow-hidden" style={card}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b" style={toolbar}>
              <div className="flex flex-wrap items-center gap-3">
                <div className={segWrap} style={{ borderColor: 'var(--light-gray)' }}>
                  {([['H1', 'Jan – Jun'], ['H2', 'Jul – Dec'], ['FY', 'Full year']] as [Period, string][]).map(([p, l]) => (
                    <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p} className={segBtn} style={seg(period === p)}>{l}</button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none" style={{ color: 'var(--mid-gray)' }}>
                  <input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} /> Hide empty lines
                </label>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 ml-auto">
                  {dirty ? <span className="text-xs font-semibold flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ color: '#92400e', background: '#fef3c7' }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#d97706' }} />Unsaved changes</span>
                    : msg === 'Saved' ? <span className="text-xs font-semibold flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ color: '#166534', background: '#dcfce7' }}><Check size={12} /> Saved</span> : null}
                  {msg && msg !== 'Saved' && <span className="text-xs" style={{ color: UNFAV }}>{msg}</span>}
                  <button onClick={save} disabled={saving || !dirty} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save all
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-auto max-h-[calc(100vh-260px)] min-h-[320px]">
                <BudgetGrid
                  months={PERIOD_MONTHS[period]}
                  sections={[
                    { id: 'rev', title: 'Revenue', lines: revLines },
                    { id: 'cogs', title: 'Cost of sales', lines: [cogsLine] },
                    { id: 'exp', title: 'Operating expenses', lines: expLines },
                    // Capital expenditure — asset purchases, budgeted per classification.
                    // Sits below net income because capex is a balance-sheet outlay, not an
                    // expense; it never feeds the income-statement totals above.
                    { id: 'capex', title: 'Capital expenditure (asset purchases)', lines: capexLines },
                  ]}
                  totalsAfter={{
                    rev: [{ label: 'Total revenue', row: totals.rev }],
                    exp: [{ label: 'Total cost & expenses', row: totals.ce }, { label: 'Net income', row: totals.net, net: true }],
                    capex: [{ label: 'Total asset purchases', row: totals.capex }],
                  }}
                  inputs={inputs}
                  setInput={(k, v) => { setMsg(''); setInputs(p => ({ ...p, [k]: v })) }}
                  canEdit={canEdit}
                  locked={lockedSet}
                  onToggleLock={toggleLock}
                  lockBusy={lockBusy}
                  hideEmpty={hideEmpty}
                  collapsed={collapsed}
                  onToggleSection={toggleSection}
                  yearTotalOf={key => yearTotal(inputs, key)}
                />
            </div>
          </div>
          <p className="text-[11px]" style={muted}>
            {isRollup
              ? <>Read-only total of every branch. Year total always covers all twelve months, whichever half is shown.</>
              : canEdit
                ? <>Type each line&apos;s monthly budget and press <strong>Save all</strong>. <Lock size={10} className="inline" /> <strong>Open</strong> / <strong>Locked</strong> under each month locks it (its figures are saved first); locked months turn grey and can&apos;t be edited until unlocked. Year total always covers all twelve months.</>
                : <>Only Admin, Accountant and Bookkeeper can enter and lock the budget.</>}
          </p>
        </>
      ) : (
        // ── Budget vs Actual — one locked month, or the Full Year roll-up ──
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[.4px] mr-1" style={muted}>Compare</span>
            <button onClick={() => setVsMonth(0)} aria-pressed={vsMonth === 0} className="px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1 transition-colors" style={pill(vsMonth === 0)}>
              <LineChart size={11} /> Full year {year}
            </button>
            {[...lockedMonths].sort((a, b) => a - b).map(m => (
              <button key={m} onClick={() => setVsMonth(m)} aria-pressed={vsMonth === m} className="px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1 transition-colors" style={pill(vsMonth === m)}>
                <Lock size={10} /> {MON[m - 1]}
              </button>
            ))}
            {!lockedMonths.length && <span className="text-xs ml-1" style={muted}>Single months appear here once they are locked.</span>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <VsTile label="Revenue" b={vsT.tr.b} a={vsT.tr.a} ok={vsT.tr.a >= vsT.tr.b} />
            <VsTile label="Cost & expenses" b={vsT.tce.b} a={vsT.tce.a} ok={vsT.tce.a <= vsT.tce.b} />
            <VsTile label="Net income" b={vsT.netB} a={vsT.netA} ok={vsT.netA >= vsT.netB} strong />
            <VsTile label="Asset purchases" b={vsT.capex.b} a={vsT.capex.a} ok={vsT.capex.a <= vsT.capex.b} />
          </div>

          <div className="rounded-lg border overflow-hidden" style={card}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b" style={toolbar}>
              <h2 className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{vsHeading} · {branchLabel}</h2>
              <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none" style={{ color: 'var(--mid-gray)' }}>
                <input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} /> Hide empty lines
              </label>
            </div>
            <div className="overflow-x-auto">
              <VsTable heading="Line item" hideEmpty={hideEmpty} sections={[
                { title: 'Revenue', rows: vs.rev, total: [{ label: 'Total revenue', b: vsT.tr.b, a: vsT.tr.a, ok: vsT.tr.a >= vsT.tr.b }] },
                { title: 'Cost of sales', rows: [vs.cogs] },
                { title: 'Operating expenses', rows: vs.exp, total: [
                  { label: 'Total cost & expenses', b: vsT.tce.b, a: vsT.tce.a, ok: vsT.tce.a <= vsT.tce.b },
                  { label: 'Net income', b: vsT.netB, a: vsT.netA, ok: vsT.netA >= vsT.netB, net: true },
                ] },
                { title: 'Capital expenditure (asset purchases)', rows: vs.capex, total: [{ label: 'Total asset purchases', b: vsT.capex.b, a: vsT.capex.a, ok: vsT.capex.a <= vsT.capex.b }] },
              ]} />
            </div>
          </div>
          <p className="text-[11px]" style={muted}>
            {vsMonth === 0
              ? <>Full year compares the entire {year} budget (all twelve months as entered) against the year&apos;s actual Income-Statement figures to date.</>
              : <>Actuals are the Income-Statement figures for {MONTHS[vsMonth - 1]} {year}.</>}
            {' '}Variance is <span style={{ color: FAV }}>green</span> when favorable (revenue at or over target, cost and expenses at or under budget) and <span style={{ color: UNFAV }}>red</span> when not. Asset purchases sit outside net income.
          </p>
        </>
      )}
    </div>
  )
}

function VsTile({ label, b, a, ok, strong }: { label: string; b: number; a: number; ok: boolean; strong?: boolean }) {
  return (
    <Tile label={label} value={pesoSigned(a)} tone={strong ? 'strong' : undefined} line={ok ? '#059669' : '#dc2626'}
      note={<span className="flex flex-wrap items-center gap-x-2">
        <span>budget <span className="font-mono">{pesoSigned(b)}</span></span>
        <span className="font-semibold font-mono"><Variance v={a - b} ok={ok} /></span>
        <PctOfBudget actual={a} budget={b} ok={ok} />
      </span>} />
  )
}

function LoadingState() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading the budget">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[0, 1, 2, 3, 4].map(i => <StatCard key={i} loading label="" value="" sub="" />)}</div>
      <div className="rounded-lg border h-[420px] hr-shimmer" style={{ borderColor: 'var(--light-gray)' }} />
      <p className="text-xs" style={muted}>Loading the budget…</p>
    </div>
  )
}
