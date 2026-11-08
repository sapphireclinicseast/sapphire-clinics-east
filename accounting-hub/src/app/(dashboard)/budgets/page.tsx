'use client'

// Budget — enter the year's budget in Income-Statement format per branch, lock
// each month, and read Budget vs Actual for the locked months or the full year.
// All Branches is a read-only rollup (the API sums every branch). The arithmetic
// lives in ./budget-math.ts and the grid/table pieces in ./BudgetViews.tsx.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { AlertTriangle, Check, Info, LineChart, Loader2, Lock, Save, Target } from 'lucide-react'
import { PPE_CLASSIFICATION_LABELS, NON_DEPRECIATING_CLASSIFICATION_LABELS } from '@/lib/asset-classification'
import {
  MS, buildLines, isDirty, monthEntries, netIncomeRow, seedInputs, totalRow, vsRows, vsTotals, yearTotal,
  type ReportData,
} from './budget-math'
import { BudgetGrid, LockStrip, MON, PctOfBudget, Tile, Variance, VsTable, pesoSigned, FAV, UNFAV } from './BudgetViews'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const BRANCHES = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SANDBOX_EAST', label: 'Aura Health East' },
  { value: 'SANDBOX_GREENHILLS', label: 'Aura Health Greenhills' },
  { value: 'VERDANA_STORE', label: 'Verdana' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]
const CAPEX_LABELS = { ...PPE_CLASSIFICATION_LABELS, ...NON_DEPRECIATING_CLASSIFICATION_LABELS }
type Period = 'H1' | 'H2' | 'FY'
const PERIOD_MONTHS: Record<Period, number[]> = { H1: [1, 2, 3, 4, 5, 6], H2: [7, 8, 9, 10, 11, 12], FY: MS }
const card = { borderColor: 'var(--light-gray)', background: 'white' }
const muted = { color: 'var(--mid-gray)' }
const seg = (on: boolean) => (on ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' })

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
    <div className="space-y-4">
      {/* ── Title + controls ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: 'var(--teal)' }}><Target size={20} className="text-white" /></div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Budget</h1>
            <p className="text-xs mt-0.5 max-w-2xl" style={muted}>Enter the year&apos;s budget in Income-Statement format, then lock each month. Budget vs Actual is ready once a month is locked.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
            <button onClick={() => setView('enter')} className="px-3.5 py-2 text-sm font-semibold" style={seg(view === 'enter')}>Enter budget</button>
            <button onClick={() => setView('vs')} className="px-3.5 py-2 text-sm font-semibold flex items-center gap-1.5" style={seg(view === 'vs')}><LineChart size={14} /> Budget vs Actual</button>
          </div>
          <select value={year} aria-label="Year" onChange={e => { const y = parseInt(e.target.value); guard(() => setYear(y))() }}
            className="px-3 py-2 rounded-xl border text-sm bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            {[0, 1, 2, 3, 4].map(i => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={branch} aria-label="Branch" onChange={e => { const b = e.target.value; guard(() => setBranch(b))() }}
            className="px-3 py-2 rounded-xl border text-sm bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-3" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>
          <AlertTriangle size={18} />
          <p className="text-sm flex-1 min-w-0">{loadError} The figures below may be incomplete.</p>
          <button onClick={() => setReload(n => n + 1)} className="px-3 py-1.5 rounded-xl border text-sm font-medium bg-white" style={{ borderColor: '#fecaca' }}>Try again</button>
        </div>
      )}

      {loading ? <LoadingState /> : view === 'enter' ? (
        <>
          {/* ── Year at a glance ── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Tile label={`Revenue budget ${year}`} value={pesoSigned(totals.rev.year)} note={branchLabel} />
            <Tile label="Cost & expenses" value={pesoSigned(totals.ce.year)} note="COGS + operating expenses" />
            <Tile label="Net income" value={pesoSigned(totals.net.year)} note={margin == null ? '—' : `${margin.toFixed(1)}% of revenue`} tone="strong" />
            <Tile label="Asset purchases" value={pesoSigned(totals.capex.year)} note="capex, outside net income" />
            <div className="col-span-2 lg:col-span-1">
              <Tile label="Months locked" value={`${lockedMonths.length} of 12`} note={isRollup ? 'locked in every branch' : lockedMonths.length === 12 ? 'whole year locked' : lockedMonths.length ? 'locked months are read-only' : 'none yet'}>
                <LockStrip locked={lockedSet} />
              </Tile>
            </div>
          </div>

          {isRollup && (
            <div className="rounded-2xl border px-4 py-2.5 text-xs flex items-start gap-2" style={{ borderColor: 'var(--bright-teal)', background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
              <Info size={14} className="mt-px shrink-0" />
              <span>All Branches shows the <strong>total of every branch&apos;s budget</strong> and is read-only. Pick a branch above to enter amounts or lock months; a month shows as locked here once every branch has locked it.</span>
            </div>
          )}

          {/* ── The grid ── */}
          <div className="rounded-2xl border overflow-hidden" style={card}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
                  {([['H1', 'Jan – Jun'], ['H2', 'Jul – Dec'], ['FY', 'Full year']] as [Period, string][]).map(([p, l]) => (
                    <button key={p} onClick={() => setPeriod(p)} className="px-3 py-1.5 text-xs font-semibold" style={seg(period === p)}>{l}</button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}>
                  <input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} /> Hide empty lines
                </label>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 ml-auto">
                  {dirty ? <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#b45309' }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#d97706' }} />Unsaved changes</span>
                    : msg === 'Saved' ? <span className="text-xs font-medium flex items-center gap-1" style={{ color: FAV }}><Check size={13} /> Saved</span> : null}
                  {msg && msg !== 'Saved' && <span className="text-xs" style={{ color: UNFAV }}>{msg}</span>}
                  <button onClick={save} disabled={saving || !dirty}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
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
            <span className="text-xs font-semibold mr-1" style={muted}>Compare</span>
            <button onClick={() => setVsMonth(0)} className="px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1"
              style={vsMonth === 0 ? { background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' } : { background: '#fff', color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>
              <LineChart size={11} /> Full year {year}
            </button>
            {[...lockedMonths].sort((a, b) => a - b).map(m => (
              <button key={m} onClick={() => setVsMonth(m)} className="px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1"
                style={vsMonth === m ? { background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' } : { background: '#fff', color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>
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

          <div className="rounded-2xl border" style={card}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b" style={{ borderColor: 'var(--light-gray)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{vsHeading} · {branchLabel}</h2>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}>
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
    <Tile label={label} value={pesoSigned(a)} tone={strong ? 'strong' : undefined}
      note={<span className="flex flex-wrap items-center gap-x-2">
        <span>budget {pesoSigned(b)}</span>
        <span className="font-semibold"><Variance v={a - b} ok={ok} /></span>
        <PctOfBudget actual={a} budget={b} ok={ok} />
      </span>} />
  )
}

function LoadingState() {
  const pulse = 'rounded-2xl border animate-pulse motion-reduce:animate-none'
  const tone = { borderColor: 'var(--light-gray)', background: 'var(--off-white)' }
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[0, 1, 2, 3, 4].map(i => <div key={i} className={`${pulse} h-[92px]`} style={tone} />)}</div>
      <div className={`${pulse} h-[420px]`} style={tone} />
      <p className="text-xs flex items-center gap-2" style={muted}><Loader2 size={14} className="animate-spin" /> Loading the budget…</p>
    </div>
  )
}

