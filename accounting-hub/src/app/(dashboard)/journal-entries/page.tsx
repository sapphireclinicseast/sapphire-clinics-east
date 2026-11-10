'use client'

// General Journal — the QuickBooks-style catch-all. When a transaction has no
// module of its own (or you are not yet sure how to classify it), enter it
// here as balanced debits and credits; it posts to the same ledger every
// report, drill-down and statement reads, so it flows everywhere at once.
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useFocusTarget, revealRow } from '@/lib/use-focus-target'
import { useSession } from 'next-auth/react'
import { BookOpen, Plus, Loader2, Trash2, X, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'

interface JLine { account: string; debit: number; credit: number; description: string | null }
interface JE { id: string; entryDate: string; description: string; refType: string; refId: string | null; branch: string; total: number; lines: JLine[] }
interface Coa { id: string; accountNumber: string; accountTitle: string }
interface DraftLine { accountId: string; accountLabel: string; q: string; debit: string; credit: string; description: string }

const peso = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const BRANCHES = ['ALL', 'SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA', 'VERDANA_STORE']
const BRANCH_LABEL: Record<string, string> = { ALL: 'All branches', SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA: 'Verdana', VERDANA_STORE: 'Verdana Store', AURA_INSTITUTE: 'Aura Health Institute' }
const TH = 'text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap text-[var(--mid-gray)]'
const blankLine = (): DraftLine => ({ accountId: '', accountLabel: '', q: '', debit: '', credit: '', description: '' })

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: 'Manual', POS_ORDER: 'POS', BANK_REC: 'Bank Rec', AR_PAYMENT: 'AR', AP_SETTLEMENT: 'AP',
  PAYROLL_CONSULTANT: 'Payroll', PAYROLL_EMPLOYEE: 'Payroll', QB_PAYROLL_IMPORT: 'QB import',
  PAYROLL_CONSULTANT_ACCRUAL: 'Payroll', PAYROLL_CONSULTANT_ACCRUAL_REVERSAL: 'Payroll',
  QB_WHT_IMPORT: 'QB import', QB_LIAB_IMPORT: 'QB import', ASSET_PURCHASE: 'Assets',
}

export default function JournalEntriesPage() {
  return <Suspense fallback={null}><JournalEntriesInner /></Suspense>
}

function JournalEntriesInner() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user as { role?: string })?.role || '')
  const [entries, setEntries] = useState<JE[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyManual, setOnlyManual] = useState(true)
  const [q, setQ] = useState('')
  // Display-only split of the loaded list by source (the cards double as the switch).
  const [srcFilter, setSrcFilter] = useState<'' | 'manual' | 'module'>('')
  const [coa, setCoa] = useState<Coa[]>([])
  const [showNew, setShowNew] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // Deep link from global search: /journal-entries?focus=<id>&q=<description>
  const { focus, done } = useFocusTarget()
  const searchParams = useSearchParams()
  const focusQ = searchParams.get('q') || ''
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/journal-entries/recent?manual=${onlyManual}&q=${encodeURIComponent(q)}`)
      const d = await r.json()
      setEntries(d.entries || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [onlyManual])  // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving from search: the target is usually a system-generated entry, so drop
  // the "manual only" filter and seed the search box before loading.
  useEffect(() => {
    if (!focus) return
    setQ(focusQ)
    setOnlyManual(false)
    ;(async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/journal-entries/recent?manual=false&q=${encodeURIComponent(focusQ)}`)
        const d = await r.json()
        setEntries(d.entries || [])
      } finally { setLoading(false) }
    })()
  }, [focus, focusQ])

  // Once it's on screen, expand it and jump to it.
  useEffect(() => {
    if (!focus || loading) return
    if (!entries.some(e => e.id === focus)) return
    setExpanded(x => ({ ...x, [focus]: true }))
    const t = setTimeout(() => { revealRow(rowRefs.current[focus]); done() }, 60)
    return () => clearTimeout(t)
  }, [focus, loading, entries, done])
  useEffect(() => {
    fetch('/api/chart-of-accounts?pageSize=1000').then(r => r.ok ? r.json() : { data: [] })
      .then(d => setCoa((d.data || []).map((a: Coa) => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle }))))
      .catch(() => {})
  }, [])

  const del = async (e: JE) => {
    if (!confirm(`Delete ${e.refId || 'this entry'} (₱${peso(e.total)})? It disappears from every ledger and statement.`)) return
    const r = await fetch(`/api/journal-entries?id=${e.id}`, { method: 'DELETE' })
    if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
    await load()
  }

  const isManual = (e: JE) => e.refType === 'MANUAL'
  const manualRows = entries.filter(isManual)
  const moduleRows = entries.filter(e => !isManual(e))
  const listed = srcFilter === 'manual' ? manualRows : srcFilter === 'module' ? moduleRows : entries
  const unbalanced = entries.filter(e => Math.abs(e.lines.reduce((s, l) => s + l.debit - l.credit, 0)) > 0.005).length
  const dates = entries.map(e => e.entryDate).sort()
  const range = dates.length ? (dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`) : ''
  const topSources = Object.entries(moduleRows.reduce<Record<string, number>>((m, e) => {
    const k = SOURCE_LABEL[e.refType] || e.refType
    m[k] = (m[k] || 0) + 1
    return m
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${k} ${n}`).join(' · ')
  const colCount = canWrite ? 8 : 7

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <BookOpen size={22} style={{ color: 'var(--teal)' }} /> General Journal
          </h1>
          <p className="mt-1 text-[13px] max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
            Entries here post straight to the ledger every report reads (subsidiary ledgers, both Reports engines, the drill-downs). Use it for anything without a module of its own; if unsure of the classification, post to the account of best judgment and re-enter it later.
          </p>
        </div>
        {canWrite && (
          <button onClick={() => setShowNew(true)} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
            <Plus size={15} /> New journal entry
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard loading={loading} label="Entries shown" value={String(entries.length)}
          sub={entries.length ? `Newest first · ${range}` : 'Nothing matches'} accent={entries.length ? { line: '#4A8073' } : undefined} />
        <StatCard compact loading={loading} label="Total posted" value={`₱${peso(entries.reduce((s, e) => s + e.total, 0))}`}
          sub={unbalanced ? `${unbalanced} entr${unbalanced === 1 ? 'y' : 'ies'} out of balance` : 'Debits equal credits on every entry'}
          tone={unbalanced ? 'red' : entries.length ? 'green' : 'zero'} />
        <StatCard loading={loading} label="Manual" value={String(manualRows.length)}
          sub="Entered on this page" accent={manualRows.length ? { line: '#4A8073' } : undefined}
          active={srcFilter === 'manual'} onClick={() => setSrcFilter(f => f === 'manual' ? '' : 'manual')} />
        <StatCard loading={loading} label="From modules" value={String(moduleRows.length)}
          sub={moduleRows.length ? topSources : onlyManual ? 'Hidden by “Manual only”' : 'None in this list'} tone={moduleRows.length ? 'blue' : 'zero'}
          active={srcFilter === 'module'} onClick={() => setSrcFilter(f => f === 'module' ? '' : 'module')} />
      </div>

      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <div className="inline-flex rounded-lg border p-0.5 bg-white" style={{ borderColor: 'var(--light-gray)' }} role="group" aria-label="Sources">
            {([[true, 'Manual only'], [false, 'All sources']] as const).map(([v, label]) => (
              <button key={label} onClick={() => { setOnlyManual(v); setSrcFilter('') }} aria-pressed={onlyManual === v}
                className="h-7 px-3 rounded-md text-xs font-semibold transition-colors"
                style={onlyManual === v ? { background: 'var(--teal)', color: '#fff' } : { color: 'var(--mid-gray)' }}>{label}</button>
            ))}
          </div>
          <form className="relative flex-1 min-w-[200px] max-w-md" onSubmit={e => { e.preventDefault(); load() }}>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--hr-faint)' }} />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search memo or journal no. — Enter to search"
              className="w-full h-8 pl-8 pr-3 rounded-lg border text-xs bg-white" style={{ borderColor: 'var(--light-gray)' }} />
          </form>
          {srcFilter && (
            <button onClick={() => setSrcFilter('')} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold"
              style={srcFilter === 'manual' ? { background: 'var(--pale-teal)', color: 'var(--deep-teal)' } : { background: '#eff6ff', color: '#1d4ed8' }}>
              {srcFilter === 'manual' ? 'Manual' : 'From modules'} <X size={12} />
            </button>
          )}
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{listed.length} of {entries.length} · click a row for its lines</span>
          <div className="ml-auto hidden md:flex items-center gap-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#4A8073' }} />Manual</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#93c5fd' }} />From a module</span>
          </div>
        </div>
        <div className="overflow-x-auto relative">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--hr-head)' }}>
                <th className={`${TH} w-8`}><span className="sr-only">Expand</span></th><th className={TH}>Date</th><th className={TH}>Journal no.</th>
                <th className={TH}>Source</th><th className={TH}>Memo</th><th className={TH}>Branch</th>
                <th className={`${TH} text-right`}>Amount</th>{canWrite && <th className={TH}><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [0, 1, 2, 3, 4].map(k => <tr key={k} className="border-t" style={{ borderColor: 'var(--hr-line)' }}><td colSpan={colCount} className="px-4 py-2.5"><div className="h-5 rounded hr-shimmer" /></td></tr>)
              ) : listed.length === 0 ? (
                <tr><td colSpan={colCount} className="text-center py-12 text-[13px]" style={{ color: 'var(--mid-gray)' }}>
                  {entries.length ? 'No entries match this filter.' : 'No entries found.'}
                </td></tr>
              ) : listed.map(e => {
                const manual = isManual(e)
                const open = !!expanded[e.id]
                const dr = e.lines.reduce((s, l) => s + l.debit, 0)
                const cr = e.lines.reduce((s, l) => s + l.credit, 0)
                return (
                  <Fragment key={e.id}>
                    <tr ref={el => { rowRefs.current[e.id] = el }}
                      className="border-t cursor-pointer transition-colors hover:bg-[#fafcf6]" style={{ borderColor: 'var(--hr-line)', background: open ? '#fafcf6' : undefined }}
                      onClick={() => setExpanded(x => ({ ...x, [e.id]: !x[e.id] }))} aria-expanded={open}>
                      <td className="px-3 py-2.5" style={{ boxShadow: `inset 4px 0 0 ${manual ? '#4A8073' : '#93c5fd'}`, color: 'var(--mid-gray)' }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{e.entryDate}</td>
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{e.refId || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={manual ? { background: 'var(--pale-teal)', color: 'var(--deep-teal)' } : { background: '#eff6ff', color: '#1d4ed8' }}>{SOURCE_LABEL[e.refType] || e.refType}</span>
                      </td>
                      <td className="px-3 py-2.5 max-w-md truncate text-[13px]" style={{ color: 'var(--charcoal)' }} title={e.description}>{e.description}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{BRANCH_LABEL[e.branch] || e.branch}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(e.total)}</td>
                      {canWrite && (
                        <td className="px-3 py-2.5 text-right">
                          {manual && <button onClick={ev => { ev.stopPropagation(); del(e) }} title="Delete this manual entry" aria-label={`Delete ${e.refId || 'this entry'}`} className="p-1.5 rounded hover:bg-red-50"><Trash2 size={14} className="text-red-500" /></button>}
                        </td>
                      )}
                    </tr>
                    {open && (
                      <tr className="border-t" style={{ borderColor: 'var(--hr-line)', background: '#fcfdfa' }}>
                        <td style={{ boxShadow: `inset 4px 0 0 ${manual ? '#4A8073' : '#93c5fd'}` }} />
                        <td colSpan={colCount - 1} className="px-3 py-3">
                          <div className="rounded-lg border bg-white overflow-x-auto max-w-4xl" style={{ borderColor: 'var(--light-gray)' }}>
                            <table className="text-xs w-full">
                              <thead>
                                <tr style={{ background: 'var(--hr-head)' }}>
                                  <th className="text-left px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Account</th>
                                  <th className="text-right px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Debit</th>
                                  <th className="text-right px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Credit</th>
                                  <th className="text-left px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Description</th>
                                </tr>
                              </thead>
                              <tbody>
                                {e.lines.map((l, i) => (
                                  <tr key={i} className="border-t" style={{ borderColor: 'var(--hr-line)' }}>
                                    <td className={`py-1.5 pr-3 ${l.credit > 0 && !l.debit ? 'pl-7' : 'pl-3'}`} style={{ color: 'var(--charcoal)' }}>{l.account}</td>
                                    <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap" style={{ minWidth: 110, color: 'var(--charcoal)' }}>{l.debit > 0 ? `₱${peso(l.debit)}` : ''}</td>
                                    <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap" style={{ minWidth: 110, color: 'var(--charcoal)' }}>{l.credit > 0 ? `₱${peso(l.credit)}` : ''}</td>
                                    <td className="px-3 py-1.5" style={{ color: 'var(--mid-gray)' }}>{l.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)' }}>
                                  <td className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Total</td>
                                  <td className="px-3 py-1.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(dr)}</td>
                                  <td className="px-3 py-1.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(cr)}</td>
                                  <td className="px-3 py-1.5 text-[11px] font-semibold" style={{ color: Math.abs(dr - cr) < 0.005 ? '#047857' : '#b91c1c' }}>{Math.abs(dr - cr) < 0.005 ? 'Balanced' : `Out of balance by ₱${peso(Math.abs(dr - cr))}`}</td>
                                </tr>
                              </tfoot>
                            </table>
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
      </div>

      {showNew && <NewEntryModal coa={coa} onClose={() => setShowNew(false)} onDone={async () => { setShowNew(false); await load() }} />}
    </div>
  )
}

function NewEntryModal({ coa, onClose, onDone }: { coa: Coa[]; onClose: () => void; onDone: () => void }) {
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))
  const [branch, setBranch] = useState('ALL')
  const [memo, setMemo] = useState('')
  // Contribution-margin department tags: empty = "All" (allocated by rent %).
  const [departments, setDepartments] = useState<string[]>([])
  const [lines, setLines] = useState<DraftLine[]>([blankLine(), blankLine()])
  const [busy, setBusy] = useState(false)
  const upd = (i: number, patch: Partial<DraftLine>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  const totals = useMemo(() => ({
    dr: lines.reduce((s, l) => s + (Number(l.debit) || 0), 0),
    cr: lines.reduce((s, l) => s + (Number(l.credit) || 0), 0),
  }), [lines])
  const balanced = Math.abs(totals.dr - totals.cr) < 0.005 && totals.dr > 0
  const save = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/journal-entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryDate, branch, memo, departments, lines: lines.map(l => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: l.description })) }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Failed'); return }
      alert(`Posted as ${d.refId}. It is on the ledger now.`)
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-xl border shadow-xl w-full max-w-4xl p-5 max-h-[92vh] overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>New journal entry</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--pale-teal)]"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <div className="flex gap-2 mb-3 flex-wrap">
          <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Journal date<br />
            <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          </label>
          <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Branch<br />
            <select value={branch} onChange={e => setBranch(e.target.value)} className="px-2 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
              {BRANCHES.map(b => <option key={b} value={b}>{BRANCH_LABEL[b] || b}</option>)}
            </select>
          </label>
          <label className="flex-1 min-w-[240px] text-xs" style={{ color: 'var(--mid-gray)' }}>Memo<br />
            <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="What this entry records" className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          </label>
        </div>

        {/* Department tags for the contribution-margin analysis. "All"
            (nothing ticked) = allocated by the configured rent percentages. */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Department</span>
          <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer select-none"
            style={{ border: `1px solid ${departments.length === 0 ? 'var(--deep-teal, #14532d)' : 'var(--light-gray)'}`, background: departments.length === 0 ? '#f0f7f2' : 'white', color: 'var(--charcoal)' }}>
            <input type="checkbox" checked={departments.length === 0} onChange={() => setDepartments([])} className="accent-current" />
            All
          </label>
          {['PT', 'OT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'TRAINING', 'RETAIL'].map(d => (
            <label key={d} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer select-none"
              style={{ border: `1px solid ${departments.includes(d) ? 'var(--deep-teal, #14532d)' : 'var(--light-gray)'}`, background: departments.includes(d) ? '#f0f7f2' : 'white', color: 'var(--charcoal)' }}>
              <input type="checkbox" checked={departments.includes(d)}
                onChange={() => setDepartments(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])} className="accent-current" />
              {d === 'PSYCHOLOGY' ? 'Psych' : d === 'ORTHOSIS' ? 'Ortho' : d}
            </label>
          ))}
        </div>

        <table className="w-full text-sm mb-2">
          <thead>
            <tr className="text-left text-xs" style={{ color: 'var(--mid-gray)' }}>
              <th className="py-1 w-8">#</th><th className="py-1">Account</th>
              <th className="py-1 text-right w-32">Debit (PHP)</th><th className="py-1 text-right w-32">Credit (PHP)</th>
              <th className="py-1">Description</th><th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const filtered = l.q && !l.accountId ? coa.filter(c => `${c.accountNumber} ${c.accountTitle}`.toLowerCase().includes(l.q.toLowerCase())).slice(0, 8) : []
              return (
                <tr key={i} className="border-t align-top" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="py-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{i + 1}</td>
                  <td className="py-1.5 pr-2 relative">
                    <input value={l.accountId ? l.accountLabel : l.q}
                      onChange={e => upd(i, { q: e.target.value, accountId: '', accountLabel: '' })}
                      placeholder="Search account…" className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    {filtered.length > 0 && (
                      <div className="absolute z-20 left-0 right-2 mt-1 rounded-lg border bg-white shadow-lg max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                        {filtered.map(c => (
                          <button key={c.id} type="button" onClick={() => upd(i, { accountId: c.id, accountLabel: `${c.accountNumber} ${c.accountTitle}`, q: '' })}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">{c.accountNumber} {c.accountTitle}</button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2"><input type="number" value={l.debit} onChange={e => upd(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} className="w-full px-2 py-1.5 rounded-lg border text-sm text-right outline-none" style={{ borderColor: 'var(--light-gray)' }} /></td>
                  <td className="py-1.5 pr-2"><input type="number" value={l.credit} onChange={e => upd(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} className="w-full px-2 py-1.5 rounded-lg border text-sm text-right outline-none" style={{ borderColor: 'var(--light-gray)' }} /></td>
                  <td className="py-1.5 pr-2"><input value={l.description} onChange={e => upd(i, { description: e.target.value })} className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} /></td>
                  <td className="py-1.5">{lines.length > 2 && <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}><Trash2 size={13} style={{ color: 'var(--mid-gray)' }} /></button>}</td>
                </tr>
              )
            })}
            <tr className="border-t font-semibold" style={{ borderColor: 'var(--light-gray)' }}>
              <td></td><td className="py-2 text-right text-xs" style={{ color: 'var(--mid-gray)' }}>Total</td>
              <td className="py-2 pr-2 text-right tabular-nums">₱{peso(totals.dr)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">₱{peso(totals.cr)}</td>
              <td colSpan={2} className="py-2 text-xs" style={{ color: balanced ? '#15803d' : '#b45309' }}>
                {balanced ? 'Balanced' : totals.dr || totals.cr ? `Out of balance by ₱${peso(Math.abs(totals.dr - totals.cr))}` : ''}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex items-center justify-between">
          <button onClick={() => setLines(ls => [...ls, blankLine()])} className="px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)' }}>Add lines</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
            <button onClick={save} disabled={busy || !balanced} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: balanced ? 'var(--teal)' : 'var(--light-gray)' }}>
              {busy ? <Loader2 className="animate-spin inline" size={14} /> : 'Save & post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
