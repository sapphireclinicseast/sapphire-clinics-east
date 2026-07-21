'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Target, Lock, Unlock, Save, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

type LineType = 'REVENUE' | 'COGS' | 'EXPENSE'
interface Line { key: string; label: string; type: LineType; actual: number }
interface Acct { accountNumber: string; accountTitle: string }
interface MonthData { cogs?: number; revenueByAccount?: Record<string, number>; expenseByAccount?: Record<string, number> }
interface ReportData { accounts?: Record<string, Record<string, Acct[]>>; monthly?: Record<number, MonthData> }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
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
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [branch, setBranch] = useState('ALL')

  const [report, setReport] = useState<ReportData | null>(null)
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [locked, setLocked] = useState(false)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const loadReport = useCallback(async () => {
    const params = new URLSearchParams({ year: String(year) })
    if (branch !== 'ALL') params.set('branch', branch)
    try { const r = await fetch(`/api/reports?${params}`); setReport(r.ok ? await r.json() : null) }
    catch { setReport(null) }
  }, [year, branch])

  const loadBudget = useCallback(async () => {
    try {
      const r = await fetch(`/api/budgets?year=${year}&month=${month}&branch=${branch}`)
      if (r.ok) { const d = await r.json(); setBudgets(d.budgets || {}); setLocked(!!d.locked) }
      else { setBudgets({}); setLocked(false) }
    } catch { setBudgets({}); setLocked(false) }
  }, [year, month, branch])

  useEffect(() => { setLoading(true); Promise.all([loadReport(), loadBudget()]).finally(() => setLoading(false)) }, [loadReport, loadBudget])
  // Seed the editable inputs whenever saved budgets (re)load.
  useEffect(() => { setInputs(Object.fromEntries(Object.entries(budgets).map(([k, v]) => [k, String(v)]))) }, [budgets])

  // ── Build the Income-Statement line items with this month's actuals ──
  const { revLines, cogsLine, expLines } = useMemo(() => {
    const m: MonthData = report?.monthly?.[month] || {}
    const rev = m.revenueByAccount || {}, exp = m.expenseByAccount || {}
    const revAccts = Object.values(report?.accounts?.REVENUE || {}).flat()
    const expAccts = Object.values(report?.accounts?.EXPENSE || {}).flat()
    const revLines: Line[] = revAccts.map(a => { const key = `${a.accountNumber} ${a.accountTitle}`; return { key, label: key, type: 'REVENUE' as LineType, actual: rev[key] || 0 } })
    const revSeen = new Set(revLines.map(l => l.key))
    for (const k of Object.keys(rev)) if (!revSeen.has(k)) revLines.push({ key: k, label: k, type: 'REVENUE', actual: rev[k] })
    const expLines: Line[] = expAccts.map(a => { const key = `${a.accountNumber} ${a.accountTitle}`; return { key, label: key, type: 'EXPENSE' as LineType, actual: exp[key] || 0 } })
    const expSeen = new Set(expLines.map(l => l.key))
    for (const k of Object.keys(exp)) if (!expSeen.has(k)) expLines.push({ key: k, label: k, type: 'EXPENSE', actual: exp[k] })
    const cogsLine: Line = { key: 'COGS — Cost of Sales', label: 'Cost of Sales (COGS)', type: 'COGS', actual: m.cogs || 0 }
    return { revLines, cogsLine, expLines }
  }, [report, month])

  const budgetOf = (key: string) => parseFloat(inputs[key] || '0') || 0
  // Favorable = green: revenue met/beat target, or expense/COGS at/under budget.
  const favorable = (l: Line) => l.type === 'REVENUE' ? l.actual >= budgetOf(l.key) : l.actual <= budgetOf(l.key)

  const totals = useMemo(() => {
    const sum = (lines: Line[]) => lines.reduce((a, l) => ({ b: a.b + budgetOf(l.key), a: a.a + l.actual }), { b: 0, a: 0 })
    const r = sum(revLines), c = sum([cogsLine]), e = sum(expLines)
    return {
      rev: r, cogs: c, exp: e,
      netBudget: r.b - c.b - e.b,
      netActual: r.a - c.a - e.a,
    }
  }, [revLines, cogsLine, expLines, inputs]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true); setMsg('')
    const all = [...revLines, cogsLine, ...expLines]
    const entries = all.map(l => ({ accountKey: l.key, accountType: l.type, amount: budgetOf(l.key) }))
    try {
      const r = await fetch('/api/budgets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, branch, entries }) })
      if (r.ok) { setMsg('Saved'); await loadBudget() } else { setMsg((await r.json()).error || 'Failed to save') }
    } finally { setSaving(false) }
  }
  const toggleLock = async () => {
    const r = await fetch('/api/budgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: locked ? 'unlock' : 'lock', year, month, branch }) })
    if (r.ok) await loadBudget()
  }

  const VarianceCell = ({ l }: { l: Line }) => {
    const v = l.actual - budgetOf(l.key)
    const ok = favorable(l)
    return <span className="font-semibold" style={{ color: ok ? '#16a34a' : '#dc2626' }}>{v >= 0 ? '+' : '−'}{peso(Math.abs(v))}</span>
  }

  const Section = ({ title, lines }: { title: string; lines: Line[] }) => (
    <>
      <tr style={{ background: 'var(--off-white)' }}><td colSpan={4} className="px-4 py-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--deep-teal)' }}>{title}</td></tr>
      {lines.map(l => (
        <tr key={l.key} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
          <td className="px-4 py-2 text-sm" style={{ color: 'var(--charcoal)' }}>{l.label}</td>
          <td className="px-4 py-2 text-right">
            <input inputMode="decimal" disabled={!canEdit || locked} value={inputs[l.key] ?? ''} onChange={e => setInputs(p => ({ ...p, [l.key]: e.target.value }))}
              placeholder="0.00" className="w-32 px-2 py-1 rounded-lg border text-sm text-right font-mono disabled:bg-gray-50 disabled:text-gray-500" style={{ borderColor: 'var(--light-gray)' }} />
          </td>
          <td className="px-4 py-2 text-right text-sm font-mono" style={{ color: 'var(--charcoal)' }}>{peso(l.actual)}</td>
          <td className="px-4 py-2 text-right text-sm font-mono"><VarianceCell l={l} /></td>
        </tr>
      ))}
    </>
  )

  if (!session?.user) return null

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--teal)' }}><Target size={20} className="text-white" /></div>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Budget</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Budget vs. actual, in Income-Statement format. Variance is red when unfavorable, green when favorable.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap my-4">
        <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border text-sm bg-white" style={{ borderColor: 'var(--light-gray)' }}>{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border text-sm bg-white" style={{ borderColor: 'var(--light-gray)' }}>{[0, 1, 2, 3, 4].map(i => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}</select>
        <select value={branch} onChange={e => setBranch(e.target.value)} className="px-3 py-2 rounded-xl border text-sm bg-white" style={{ borderColor: 'var(--light-gray)' }}>{BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}</select>
        {locked && <span className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}><Lock size={12} /> Locked</span>}
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-xs" style={{ color: msg === 'Saved' ? '#16a34a' : '#dc2626' }}>{msg}</span>}
          {canEdit && !locked && <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save</button>}
          {canEdit && <button onClick={toggleLock} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: locked ? 'var(--teal)' : 'var(--mid-gray)' }}>{locked ? <><Unlock size={14} /> Unlock</> : <><Lock size={14} /> Lock</>}</button>}
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 size={22} className="inline animate-spin" style={{ color: 'var(--teal)' }} /></div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--charcoal)' }}>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white">{MONTHS[month - 1]} {year} — Line Item</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white">Budget</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white">Actual</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white">Variance</th>
              </tr>
            </thead>
            <tbody>
              <Section title="Revenue" lines={revLines} />
              <tr className="border-t font-semibold" style={{ borderColor: 'var(--light-gray)', background: '#f5f8f8' }}>
                <td className="px-4 py-2 text-sm">Total Revenue</td>
                <td className="px-4 py-2 text-right text-sm font-mono">{peso(totals.rev.b)}</td>
                <td className="px-4 py-2 text-right text-sm font-mono">{peso(totals.rev.a)}</td>
                <td className="px-4 py-2 text-right text-sm font-mono" style={{ color: totals.rev.a >= totals.rev.b ? '#16a34a' : '#dc2626' }}>{totals.rev.a - totals.rev.b >= 0 ? '+' : '−'}{peso(Math.abs(totals.rev.a - totals.rev.b))}</td>
              </tr>
              <Section title="Cost of Sales" lines={[cogsLine]} />
              <Section title="Operating Expenses" lines={expLines} />
              <tr className="border-t font-semibold" style={{ borderColor: 'var(--light-gray)', background: '#f5f8f8' }}>
                <td className="px-4 py-2 text-sm">Total Cost &amp; Expenses</td>
                <td className="px-4 py-2 text-right text-sm font-mono">{peso(totals.cogs.b + totals.exp.b)}</td>
                <td className="px-4 py-2 text-right text-sm font-mono">{peso(totals.cogs.a + totals.exp.a)}</td>
                <td className="px-4 py-2 text-right text-sm font-mono" style={{ color: (totals.cogs.a + totals.exp.a) <= (totals.cogs.b + totals.exp.b) ? '#16a34a' : '#dc2626' }}>{(totals.cogs.a + totals.exp.a) - (totals.cogs.b + totals.exp.b) >= 0 ? '+' : '−'}{peso(Math.abs((totals.cogs.a + totals.exp.a) - (totals.cogs.b + totals.exp.b)))}</td>
              </tr>
              <tr className="border-t-2 font-bold" style={{ borderColor: 'var(--deep-teal)', background: 'var(--pale-teal)' }}>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--deep-teal)' }}>NET INCOME</td>
                <td className="px-4 py-3 text-right text-sm font-mono" style={{ color: 'var(--deep-teal)' }}>{peso(totals.netBudget)}</td>
                <td className="px-4 py-3 text-right text-sm font-mono" style={{ color: 'var(--deep-teal)' }}>{peso(totals.netActual)}</td>
                <td className="px-4 py-3 text-right text-sm font-mono" style={{ color: totals.netActual >= totals.netBudget ? '#16a34a' : '#dc2626' }}>{totals.netActual - totals.netBudget >= 0 ? '+' : '−'}{peso(Math.abs(totals.netActual - totals.netBudget))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] mt-3" style={{ color: 'var(--mid-gray)' }}>Actuals are the same figures as the Income Statement for {MONTHS[month - 1]} {year}{branch !== 'ALL' ? ` · ${BRANCHES.find(b => b.value === branch)?.label}` : ''}. Enter each line&apos;s monthly budget, then Lock to finalize.</p>
    </div>
  )
}
