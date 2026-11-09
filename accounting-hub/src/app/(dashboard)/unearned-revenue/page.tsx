'use client'

// Unearned Revenue (4050) — the movement view. Money in before it is earned
// (package deposits, advance payments at cashiering) credits this account;
// consuming sessions and refunds debit it. This page shows that cycle:
// opening, monthly debit/credit movement, and every underlying line.
// Filterable by date range (history reaches back to 2024) and branch.
// The arithmetic lives in ./movement.ts; this file is only the view.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Inbox, PiggyBank, Search, X } from 'lucide-react'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'
import Pagination from '@/components/ui/Pagination'
import MovementChart, { BALANCE_COLOR, RECEIVED_COLOR, RELEASED_COLOR, Swatch } from './MovementChart'
import {
  type Line, BRANCHES, branchShort, dayLabel, groupByYear, monthLabel, monthlyMovement, peso, pesoSigned,
  sourceHint, sourceLabel, summarize,
} from './movement'

// History starts in 2024 (QB import); default the range to everything.
const HISTORY_START = '2024-01-01'
const todayStr = () => new Date().toISOString().slice(0, 10)
const yearStartStr = () => `${todayStr().slice(0, 4)}-01-01`
const last12Str = () => {
  const d = new Date()
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 11)
  return d.toISOString().slice(0, 10)
}

type Side = 'ALL' | 'CR' | 'DR'
const card = { borderColor: 'var(--light-gray)', background: 'white' }
const muted = { color: 'var(--mid-gray)' }
const ink = { color: 'var(--charcoal)' }
// HR Hub table header cell, card header and toolbar strip.
const TH = 'text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap'
const headStyle = { background: 'var(--hr-head)', color: 'var(--mid-gray)' }
const toolbar = { background: '#fcfdfa', borderColor: 'var(--light-gray)' }
const BRANCH_PILL: Record<string, string> = {
  ALL: 'All branches', SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana', AURA_INSTITUTE: 'Institute',
}

export default function UnearnedRevenuePage() {
  const [lines, setLines] = useState<Line[]>([])
  const [opening, setOpening] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [from, setFrom] = useState(HISTORY_START)
  const [to, setTo] = useState(todayStr())
  const [branch, setBranch] = useState('ALL')
  // Line-list filters
  const [monthKey, setMonthKey] = useState('')   // 'YYYY-MM' picked in the chart or month table
  const [src, setSrc] = useState('')
  const [side, setSide] = useState<Side>('ALL')
  const [q, setQ] = useState('')
  const [newestFirst, setNewestFirst] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  // Years the month table shows expanded; null = the default (latest year only).
  const [openYears, setOpenYears] = useState<Set<string> | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const p = new URLSearchParams({ accountNumber: '4050', from, to, branch, limit: '50000' })
        const r = await fetch(`/api/journal-entries?${p}`, { signal: ctl.signal })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error || `Could not load 4050 (HTTP ${r.status})`)
        setLines((d.lines || []).map((l: Line) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit) })))
        setOpening(Number(d.opening) || 0)
        setMonthKey('')
        setPage(1)
        setOpenYears(null)
      } catch (e) {
        if (ctl.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Could not load 4050')
        setLines([])
        setOpening(0)
      } finally { if (!ctl.signal.aborted) setLoading(false) }
    })()
    return () => ctl.abort()
  }, [from, to, branch, reload])

  /* ── figures (see ./movement.ts) ── */
  const { rows, totalCr, totalDr, closing } = useMemo(() => summarize(opening, monthlyMovement(lines)), [opening, lines])
  const years = useMemo(() => groupByYear(rows), [rows])
  const latestYear = years.length ? years[years.length - 1].year : ''
  const isOpen = (y: string) => (openYears ? openYears.has(y) : y === latestYear)
  const toggleYear = (y: string) => setOpenYears(prev => {
    const s = new Set(prev ?? (latestYear ? [latestYear] : []))
    if (s.has(y)) s.delete(y); else s.add(y)
    return s
  })
  const crLines = useMemo(() => lines.reduce((n, l) => n + (l.credit > 0 ? 1 : 0), 0), [lines])
  const drLines = useMemo(() => lines.reduce((n, l) => n + (l.debit > 0 ? 1 : 0), 0), [lines])

  /* ── line list ── */
  const inMonth = useMemo(() => (monthKey ? lines.filter(l => String(l.date).slice(0, 7) === monthKey) : lines), [lines, monthKey])
  const sourceCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of inMonth) m.set(l.refType, (m.get(l.refType) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [inMonth])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = inMonth.filter(l =>
      (!src || l.refType === src)
      && (side === 'ALL' || (side === 'CR' ? l.credit > 0 : l.debit > 0))
      && (!needle || `${l.description || ''} ${l.jeDescription || ''}`.toLowerCase().includes(needle)))
    return newestFirst ? out.reverse() : out
  }, [inMonth, src, side, q, newestFirst])
  const shownCr = useMemo(() => shown.reduce((s, l) => s + l.credit, 0), [shown])
  const shownDr = useMemo(() => shown.reduce((s, l) => s + l.debit, 0), [shown])
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize))
  const curPage = Math.min(page, pageCount)
  const pageRows = shown.slice((curPage - 1) * pageSize, curPage * pageSize)
  const listFiltered = !!(src || side !== 'ALL' || q.trim())

  const pickMonth = (k: string) => { setMonthKey(cur => (cur === k ? '' : k)); setPage(1) }
  const clearListFilters = () => { setSrc(''); setSide('ALL'); setQ(''); setPage(1) }
  const setRange = (f: string, t: string) => { setFrom(f); setTo(t) }
  const presets: [string, string, string][] = [
    ['All history', HISTORY_START, todayStr()],
    ['Last 12 months', last12Str(), todayStr()],
    ['This year', yearStartStr(), todayStr()],
  ]
  const branchName = BRANCHES.find(([v]) => v === branch)?.[1] || branch
  const showBranchCol = branch === 'ALL'

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      {/* ── Title + branch ── */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <PiggyBank size={22} style={{ color: 'var(--teal)' }} /> Unearned Revenue
          </h1>
          <p className="mt-1 text-[13px] max-w-3xl" style={muted}>
            Account 4050 — money received before it is earned. Package deposits and advance payments credit it at cashiering;
            sessions used and refunds debit it back out.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Branch">
          {BRANCHES.map(([v, l]) => (
            <button key={v} onClick={() => setBranch(v)} aria-pressed={branch === v} title={l}
              className="px-3.5 py-1.5 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors"
              style={branch === v
                ? { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }
                : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
              {BRANCH_PILL[v] || l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Date range ── */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-lg border" style={toolbar}>
        <span className="text-[11px] font-bold uppercase tracking-[.4px]" style={muted}>Range</span>
        <div className="inline-flex rounded-lg border p-0.5 bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          {presets.map(([label, f, t]) => {
            const on = from === f && to === t
            return (
              <button key={label} onClick={() => setRange(f, t)} aria-pressed={on}
                className="h-7 px-3 rounded-md text-xs font-semibold whitespace-nowrap transition-colors"
                style={on ? { background: 'var(--teal)', color: '#fff' } : { color: 'var(--mid-gray)' }}>
                {label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <input type="date" aria-label="From" value={from} min={HISTORY_START} max={to} onChange={e => e.target.value && setFrom(e.target.value)}
            className="h-8 px-2 rounded-lg border text-xs bg-white" style={{ borderColor: 'var(--light-gray)' }} />
          <span className="text-xs" style={muted}>to</span>
          <input type="date" aria-label="To" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)}
            className="h-8 px-2 rounded-lg border text-xs bg-white" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border px-4 py-4 flex flex-wrap items-center gap-3" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', borderLeft: '4px solid #dc2626' }}>
          <AlertTriangle size={18} />
          <p className="text-[13px] flex-1 min-w-0">{error}</p>
          <button onClick={() => setReload(n => n + 1)} className={hrBtn.ghost} style={{ borderColor: '#fecaca', color: '#b91c1c' }}>
            Try again
          </button>
        </div>
      ) : loading ? (
        <LoadingState />
      ) : (
        <>
          {/* ── Summary: opening + received − released = balance ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard compact label="Opening balance" value={pesoSigned(opening)} sub={`before ${dayLabel(from)}`}
              accent={{ line: '#8A9AA0' }} />
            <StatCard compact label="+ Received" value={pesoSigned(totalCr)} sub={`${crLines.toLocaleString()} credit line${crLines === 1 ? '' : 's'}`}
              accent={{ line: RECEIVED_COLOR, fg: '#3C6A5F' }} />
            <StatCard compact label="− Released" value={pesoSigned(totalDr)} sub={`${drLines.toLocaleString()} debit line${drLines === 1 ? '' : 's'}`}
              accent={{ line: RELEASED_COLOR, fg: '#9a5a1c' }} />
            <StatCard compact label="= Balance at end of range" value={pesoSigned(closing)} sub={`as of ${dayLabel(to)} · ${branchName}`}
              accent={{ line: '#3C6A5F', bg: '#f4f8ea', fg: '#3C6A5F' }} />
          </div>

          {lines.length === 0 ? (
            <div className="rounded-lg border px-4 py-12 text-center" style={card}>
              <Inbox size={32} className="mx-auto mb-2 opacity-40" style={muted} />
              <p className="text-[13px] font-semibold" style={ink}>No 4050 movement in this range</p>
              <p className="text-xs mt-1" style={muted}>
                Nothing was received or released between {dayLabel(from)} and {dayLabel(to)} for {branchName}.
              </p>
              {(from !== HISTORY_START || branch !== 'ALL') && (
                <button onClick={() => { setRange(HISTORY_START, todayStr()); setBranch('ALL') }}
                  className={`${hrBtn.primary} mt-3`} style={{ background: 'var(--teal)' }}>
                  Show all history, all branches
                </button>
              )}
            </div>
          ) : (
            <>
              {/* ── Month view: chart + months grouped by year ── */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div className="rounded-lg border min-w-0" style={card}>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
                    <h2 className="text-sm font-bold" style={{ ...ink, fontFamily: 'var(--font-display)' }}>Monthly movement</h2>
                    <div className="flex flex-wrap items-center gap-3 text-[11px]" style={muted}>
                      <span><Swatch c={RECEIVED_COLOR} />Received</span>
                      <span><Swatch c={RELEASED_COLOR} />Released</span>
                      <span><Swatch c={BALANCE_COLOR} line />Month-end balance</span>
                    </div>
                  </div>
                  <div className="px-4 pt-3 pb-3">
                    <MovementChart rows={rows} selected={monthKey} onSelect={pickMonth} />
                    <p className="text-[11px] mt-1" style={muted}>Tap or click a month to list its lines below.</p>
                  </div>
                </div>

                <div className="rounded-lg border overflow-hidden flex flex-col min-w-0" style={card}>
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
                    <h2 className="text-sm font-bold" style={{ ...ink, fontFamily: 'var(--font-display)' }}>By month</h2>
                    {years.length > 1 && (
                      <button className="text-xs font-semibold hover:underline" style={{ color: 'var(--teal)' }}
                        onClick={() => setOpenYears(years.every(y => isOpen(y.year)) ? new Set() : new Set(years.map(y => y.year)))}>
                        {years.every(y => isOpen(y.year)) ? 'Collapse all' : 'Expand all'}
                      </button>
                    )}
                  </div>
                  <div className="overflow-auto xl:max-h-[318px] max-h-[460px]">
                    <table className="w-full text-[11px] sm:text-xs tabular-nums">
                      <thead className="sticky top-0 z-[1]">
                        <tr style={headStyle}>
                          <th className={`${TH} text-left px-3 py-2`}>Month</th>
                          <th className={`${TH} text-right px-1.5 sm:px-2 py-2`}>Received</th>
                          <th className={`${TH} text-right px-1.5 sm:px-2 py-2`}>Released</th>
                          <th className={`${TH} text-right px-1.5 sm:px-2 py-2`}>Net</th>
                          <th className={`${TH} text-right px-3 py-2 hidden sm:table-cell`}>Balance</th>
                        </tr>
                      </thead>
                      {years.map(y => (
                        <tbody key={y.year}>
                          <tr className="border-t cursor-pointer hover:bg-[#f4f7ec]" style={{ borderColor: 'var(--hr-line)', background: '#fcfdfa' }} onClick={() => toggleYear(y.year)}>
                            <td className="px-3 py-2 font-bold whitespace-nowrap" style={ink}>
                              {isOpen(y.year) ? <ChevronDown size={13} className="inline -mt-0.5 mr-1" /> : <ChevronRight size={13} className="inline -mt-0.5 mr-1" />}
                              {y.year}
                            </td>
                            <td className="px-1.5 sm:px-2 py-2 text-right font-mono font-semibold" style={ink}>{peso(y.cr)}</td>
                            <td className="px-1.5 sm:px-2 py-2 text-right font-mono font-semibold" style={ink}>{peso(y.dr)}</td>
                            <td className="px-1.5 sm:px-2 py-2 text-right font-mono font-semibold" style={ink}>{peso(y.net)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold hidden sm:table-cell" style={ink}>{peso(y.balance)}</td>
                          </tr>
                          {isOpen(y.year) && y.months.map(m => {
                            const on = m.key === monthKey
                            return (
                              <tr key={m.key} className="border-t cursor-pointer transition-colors hover:bg-[#fafcf6]" onClick={() => pickMonth(m.key)}
                                style={{ borderColor: 'var(--hr-line)', background: on ? 'var(--pale-teal)' : undefined }}>
                                <td className="pl-5 sm:pl-8 pr-2 sm:pr-3 py-1.5 whitespace-nowrap"
                                  style={{ color: on ? 'var(--deep-teal)' : 'var(--charcoal)', fontWeight: on ? 700 : 400, boxShadow: on ? 'inset 4px 0 0 var(--teal)' : undefined }}>
                                  {monthLabel(m.key).slice(0, 3)}
                                </td>
                                <td className="px-1.5 sm:px-2 py-1.5 text-right font-mono" style={{ color: m.cr ? 'var(--charcoal)' : 'var(--hr-faint)' }}>{m.cr ? peso(m.cr) : '—'}</td>
                                <td className="px-1.5 sm:px-2 py-1.5 text-right font-mono" style={{ color: m.dr ? 'var(--charcoal)' : 'var(--hr-faint)' }}>{m.dr ? peso(m.dr) : '—'}</td>
                                <td className="px-1.5 sm:px-2 py-1.5 text-right font-mono font-semibold" style={ink}>{m.cr || m.dr ? peso(m.net) : '—'}</td>
                                <td className="px-3 py-1.5 text-right font-mono hidden sm:table-cell" style={muted}>{peso(m.balance)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      ))}
                      <tfoot className="sticky bottom-0">
                        <tr className="border-t-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)' }}>
                          <td className="px-3 py-2 text-[11px] font-bold uppercase tracking-[.4px]" style={muted}>Total</td>
                          <td className="px-1.5 sm:px-2 py-2 text-right font-mono font-bold" style={ink}>{peso(totalCr)}</td>
                          <td className="px-1.5 sm:px-2 py-2 text-right font-mono font-bold" style={ink}>{peso(totalDr)}</td>
                          <td className="px-1.5 sm:px-2 py-2 text-right font-mono font-bold" style={ink}>{peso(totalCr - totalDr)}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold hidden sm:table-cell" style={{ color: 'var(--deep-teal)' }}>{peso(closing)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* ── Lines ── */}
              <div className="rounded-lg border overflow-hidden" style={card}>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
                  <h2 className="text-sm font-bold flex flex-wrap items-center gap-2" style={{ ...ink, fontFamily: 'var(--font-display)' }}>
                    Lines
                    <span className="px-1.5 rounded-full text-[11px] font-bold tabular-nums" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)', fontFamily: 'var(--font-body)' }}>{shown.length.toLocaleString()}</span>
                    {monthKey && (
                      <button onClick={() => pickMonth(monthKey)} className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold"
                        style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)', fontFamily: 'var(--font-body)' }} title="Show every month">
                        {monthLabel(monthKey)} <X size={12} />
                      </button>
                    )}
                  </h2>
                  <p className="text-xs tabular-nums" style={muted}>
                    received <span className="font-mono font-semibold" style={ink}>{pesoSigned(shownCr)}</span>
                    {' · '}released <span className="font-mono font-semibold" style={ink}>{pesoSigned(shownDr)}</span>
                    {listFiltered && <> · <button onClick={clearListFilters} className="font-semibold hover:underline" style={{ color: 'var(--teal)' }}>clear filters</button></>}
                  </p>
                </div>
                <div className="px-4 py-2.5 space-y-2 border-b" style={toolbar}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[150px] max-w-sm">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--hr-faint)' }} />
                      <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Search descriptions…"
                        className="w-full h-8 pl-8 pr-3 rounded-lg border text-xs bg-white outline-none focus:border-[var(--teal)]" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                    <div className="inline-flex rounded-lg border p-0.5 bg-white shrink-0" style={{ borderColor: 'var(--light-gray)' }}>
                      {([['ALL', 'All'], ['CR', 'Received'], ['DR', 'Released']] as [Side, string][]).map(([v, l]) => (
                        <button key={v} onClick={() => { setSide(v); setPage(1) }} aria-pressed={side === v}
                          className="h-7 px-3 rounded-md text-xs font-semibold transition-colors"
                          style={side === v ? { background: 'var(--teal)', color: '#fff' } : { color: 'var(--mid-gray)' }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <SourceChip on={!src} label="All sources" count={inMonth.length} onClick={() => { setSrc(''); setPage(1) }} />
                    {sourceCounts.map(([s, c]) => (
                      <SourceChip key={s} on={src === s} label={sourceLabel(s)} title={sourceHint(s)} count={c}
                        onClick={() => { setSrc(src === s ? '' : s); setPage(1) }} />
                    ))}
                  </div>
                </div>

                {shown.length === 0 ? (
                  <div className="px-4 py-12 text-center text-[13px]" style={muted}>
                    No lines match these filters.{' '}
                    <button onClick={() => { clearListFilters(); setMonthKey('') }} className="font-semibold hover:underline" style={{ color: 'var(--teal)' }}>Clear them</button>
                  </div>
                ) : (
                  <>
                    {/* Wide screens: table */}
                    <table className="w-full text-xs hidden md:table">
                      <thead>
                        <tr className="text-left" style={headStyle}>
                          <th className={`${TH} px-4 py-2.5`}>
                            <button onClick={() => { setNewestFirst(v => !v); setPage(1) }} className="inline-flex items-center gap-1 uppercase hover:text-[var(--teal)]" title="Change the order">
                              Date {newestFirst ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                            </button>
                          </th>
                          {showBranchCol && <th className={`${TH} px-3 py-2.5`}>Branch</th>}
                          <th className={`${TH} px-3 py-2.5`}>Source</th>
                          <th className={`${TH} px-3 py-2.5 w-full`}>Description</th>
                          <th className={`${TH} px-3 py-2.5 text-right`}>Released (Dr)</th>
                          <th className={`${TH} px-4 py-2.5 text-right`}>Received (Cr)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((l, i) => (
                          <tr key={`${curPage}-${i}`} className="border-t align-top transition-colors hover:bg-[#fafcf6]" style={{ borderColor: 'var(--hr-line)' }}>
                            <td className="px-4 py-2 font-mono whitespace-nowrap"
                              style={{ ...ink, boxShadow: `inset 4px 0 0 ${l.credit > 0 ? RECEIVED_COLOR : RELEASED_COLOR}` }}>{dayLabel(l.date)}</td>
                            {showBranchCol && <td className="px-3 py-2 whitespace-nowrap" style={muted}>{branchShort(l.branch)}</td>}
                            <td className="px-3 py-2 whitespace-nowrap leading-4"><SourcePill t={l.refType} /></td>
                            <td className="px-3 py-2 break-words" style={ink}>{l.description || l.jeDescription || '—'}</td>
                            <td className="px-3 py-2 text-right font-mono whitespace-nowrap" style={ink}>{l.debit > 0 ? peso(l.debit) : ''}</td>
                            <td className="px-4 py-2 text-right font-mono whitespace-nowrap" style={ink}>{l.credit > 0 ? peso(l.credit) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Phones: one card per line */}
                    <div className="md:hidden">
                      <div className="flex justify-end px-4 py-1.5 text-xs" style={headStyle}>
                        <button onClick={() => { setNewestFirst(v => !v); setPage(1) }} className="inline-flex items-center gap-1 font-semibold">
                          {newestFirst ? 'Newest first' : 'Oldest first'} {newestFirst ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                        </button>
                      </div>
                      {pageRows.map((l, i) => (
                        <div key={`${curPage}-${i}`} className="px-4 py-2.5 border-t" style={{ borderColor: 'var(--hr-line)', boxShadow: `inset 4px 0 0 ${l.credit > 0 ? RECEIVED_COLOR : RELEASED_COLOR}` }}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs" style={muted}>
                                <span className="font-mono" style={ink}>{dayLabel(l.date)}</span>
                                {showBranchCol && <> · {branchShort(l.branch)}</>}
                              </p>
                              <div className="mt-1"><SourcePill t={l.refType} /></div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold font-mono" style={{ color: l.credit > 0 ? '#3C6A5F' : 'var(--charcoal)' }}>
                                {peso(l.credit > 0 ? l.credit : l.debit)}
                              </p>
                              <p className="text-[10px]" style={muted}>{l.credit > 0 ? 'received · Cr' : 'released · Dr'}</p>
                            </div>
                          </div>
                          <p className="text-xs mt-1.5 break-words" style={ink}>{l.description || l.jeDescription || '—'}</p>
                        </div>
                      ))}
                    </div>

                    <div className="px-3 border-t" style={toolbar}>
                      <Pagination totalItems={shown.length} page={curPage} pageSize={pageSize} pageSizeOptions={[25, 50, 100, 200]}
                        onPageChange={setPage} onPageSizeChange={setPageSize} />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function SourceChip({ on, label, count, title, onClick }: { on: boolean; label: string; count: number; title?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} aria-pressed={on}
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs font-semibold transition-colors hover:border-[var(--teal)]"
      style={on ? { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff' } : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
      {label}
      <span className="tabular-nums" style={{ opacity: on ? 0.85 : 0.55 }}>{count.toLocaleString()}</span>
    </button>
  )
}

function SourcePill({ t }: { t: string }) {
  const reversal = /REVERSAL|REFUND/.test(t)
  return (
    <span title={sourceHint(t)} className="inline-block align-top px-2 py-0.5 -my-0.5 rounded-full text-[11px] leading-4 font-semibold whitespace-nowrap"
      style={reversal ? { background: '#fef3c7', color: '#92400e' } : { background: '#f1f5f2', color: '#55616A' }}>
      {sourceLabel(t)}
    </span>
  )
}

function LoadingState() {
  const tone = { borderColor: 'var(--light-gray)' }
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading 4050 lines">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => <StatCard key={i} loading label="" value="" sub="" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="rounded-lg border h-[340px] hr-shimmer" style={tone} />
        <div className="rounded-lg border h-[340px] hidden sm:block hr-shimmer" style={tone} />
      </div>
      <p className="text-xs" style={muted}>Loading 4050 lines…</p>
    </div>
  )
}
