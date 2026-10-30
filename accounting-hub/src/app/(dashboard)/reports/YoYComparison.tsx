'use client'

/**
 * Year-over-Year comparison — the Income Statement for a chosen month range
 * (e.g. Jan–Oct) in one year against the same months of another year.
 *
 * Ledger basis (default): both years come from the ledger engine
 * (/api/reports/v2), the same source the Income Statement tab renders, so every
 * figure ties to that screen. Each engine row carries Jan..Dec movements; a
 * range is the sum of its months, and every subtotal is rebuilt from those sums
 * with the engine's own formulas.
 *
 * Audited basis (optional, FY2024–FY2025 only): those years come from the
 * audited management-accounts package (/api/reports → historical), which is the
 * declared view of those years — the 2025 ledger lacks the year-end
 * adjustments. Only its subtotals are comparable across layouts, so the table
 * drops to summary level and everything below EBITDA becomes one line.
 */

import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { Loader2, Download, Printer, CalendarRange, ChevronRight, ChevronDown } from 'lucide-react'
import { downloadXlsx, downloadPdf } from '@/lib/export'
import { INCOME_TAX_RATE } from '@/lib/reports/income-statement-totals'
import { LAST_MANUAL_YEAR, type HistoricalReportPayload } from '@/lib/reports/historical-fs'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FIRST_YEAR = 2024 // neither the ledger nor the audited package goes further back
const BRANCHES = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SBEA', label: 'East Branch (AHEA)' },
  { value: 'SBGH', label: 'Greenhills Branch (AHGH)' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]

interface EngineRow { number: string; title: string; monthly: number[] }
interface EngineSection { key: string; rows: EngineRow[] }
interface EnginePayload { incomeStatement?: { sections: EngineSection[] } }
type Basis = 'ledger' | 'audited'

const SECTION_KEYS = ['REVENUE', 'DISCOUNTS', 'COGS', 'OPEX', 'DEPRECIATION', 'INTEREST', 'NON_OPERATING'] as const
type SectionKey = typeof SECTION_KEYS[number]
const SECTION_META: Record<SectionKey, { label: string; good: 'up' | 'down' }> = {
  REVENUE: { label: 'Gross Revenue', good: 'up' },
  DISCOUNTS: { label: 'Less: Discounts and Refunds', good: 'down' },
  COGS: { label: 'Cost of Sales', good: 'down' },
  OPEX: { label: 'Operating Expenses', good: 'down' },
  DEPRECIATION: { label: 'Depreciation', good: 'down' },
  INTEREST: { label: 'Interest', good: 'down' },
  NON_OPERATING: { label: 'Non-Operating Expenses', good: 'down' },
}

/** One year's figures for the selected months, whichever source they came from. */
interface Figures {
  totals: Record<SectionKey, number>
  tax: number
  /** Everything between EBITDA and Net Income (depreciation, interest, other, tax). */
  below: number
  /** Account lines per section — ledger only; null on the audited basis. */
  lines: Record<SectionKey, Map<string, { number: string; title: string; v: number }>> | null
  notes: string[]
}

type Line = { number: string; title: string; a: number; b: number }
type Block =
  | { kind: 'section'; key: string; label: string; good: 'up' | 'down'; a: number; b: number; lines: Line[] }
  | { kind: 'total'; label: string; good: 'up' | 'down'; a: number; b: number; grand?: boolean }

const r2 = (n: number) => Math.round(n * 100) / 100
const peso = (n: number) => {
  const s = Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `(${s})` : s
}

/** Change of `a` (selected year) against `b` (comparison year). */
function change(a: number, b: number, good: 'up' | 'down') {
  const diff = r2(a - b)
  // Measured against |b| so the sign keeps meaning when the base is negative
  // (a net loss shrinking reads as a positive change).
  const pct = Math.abs(b) >= 0.005 ? (diff / Math.abs(b)) * 100 : null
  const better = diff === 0 ? null : (good === 'up' ? diff > 0 : diff < 0)
  return { diff, pct, better }
}

function ledgerFigures(p: EnginePayload, from: number, to: number): Figures {
  const rangeSum = (m: number[]) => {
    let s = 0
    for (let i = from - 1; i <= to - 1; i++) s += m?.[i] || 0
    return s
  }
  const totals = {} as Record<SectionKey, number>
  const lines = {} as NonNullable<Figures['lines']>
  for (const key of SECTION_KEYS) {
    const map = new Map<string, { number: string; title: string; v: number }>()
    for (const row of p.incomeStatement?.sections.find(s => s.key === key)?.rows || []) {
      const id = row.number || row.title
      const cur = map.get(id) || { number: row.number, title: row.title, v: 0 }
      cur.v = r2(cur.v + rangeSum(row.monthly))
      map.set(id, cur)
    }
    lines[key] = map
    totals[key] = r2([...map.values()].reduce((t, l) => t + l.v, 0))
  }
  const ebt = totals.REVENUE - totals.DISCOUNTS - totals.COGS - totals.OPEX
    - totals.DEPRECIATION - totals.INTEREST - totals.NON_OPERATING
  const tax = r2(ebt * INCOME_TAX_RATE)
  return {
    totals, tax, lines, notes: [],
    below: r2(totals.DEPRECIATION + totals.INTEREST + totals.NON_OPERATING + tax),
  }
}

/**
 * The audited package's layout differs by year (2024 and 2025 were prepared
 * differently), but both carry the same subtotals with month columns. A full
 * Jan–Dec range uses each subtotal's FY figure, which can include amounts the
 * books recorded for the year without allocating them to a month.
 */
function auditedFigures(h: HistoricalReportPayload, from: number, to: number): Figures | string {
  if (h.emptyReason) return h.emptyReason
  const rows = h.incomeStatement?.rows || []
  const find = (re: RegExp) => rows.find(r => r.kind !== 'line' && r.kind !== 'header' && re.test(r.label))
  const gross = find(/^(Total for 7000 Gross Revenue|Total Sales)$/)
  const net = find(/^(Total for Net Sales|Total Income)$/)
  const cogs = find(/^(Total for Cost of Sales|Total Cost of Sales)$/)
  const ebitdaRow = find(/^EBITDA$/)
  const niRow = find(/^Net Income$/)
  if (!gross || !net || !cogs || !ebitdaRow || !niRow) {
    return `The ${h.year} audited statement's layout wasn't recognised, so it can't be compared at summary level.`
  }
  const full = from === 1 && to === 12
  const val = (r: { monthly: number[] | null; total: number | null }) =>
    full && r.total != null ? r.total : (r.monthly || []).slice(from - 1, to).reduce((s, v) => s + (v || 0), 0)
  const grossRev = r2(val(gross)), netSales = r2(val(net)), costOfSales = r2(val(cogs))
  const ebitda = r2(val(ebitdaRow)), netIncome = r2(val(niRow))
  const grossProfit = r2(netSales - costOfSales)
  return {
    totals: {
      REVENUE: grossRev,
      DISCOUNTS: r2(grossRev - netSales),
      COGS: costOfSales,
      // Whatever separates gross profit from EBITDA in the audited layout (2024
      // also nets a small "Other Income" line here), so the column foots.
      OPEX: r2(grossProfit - ebitda),
      DEPRECIATION: 0, INTEREST: 0, NON_OPERATING: 0,
    },
    tax: 0,
    below: r2(ebitda - netIncome),
    lines: null,
    notes: [...h.notes, ...h.isNotes].map(n => `${h.year} (audited): ${n}`),
  }
}

export default function YoYComparison({ lockedBranch }: { lockedBranch?: string | null }) {
  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth() + 1
  const yearOptions = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i)

  const [yearA, setYearA] = useState(thisYear)
  const [yearB, setYearB] = useState(Math.max(FIRST_YEAR, thisYear - 1))
  const [fromM, setFromM] = useState(1)
  const [toM, setToM] = useState(thisMonth)
  const [branch, setBranch] = useState(lockedBranch || 'ALL')
  const [basis, setBasis] = useState<Basis>('ledger')
  useEffect(() => { if (lockedBranch) setBranch(lockedBranch) }, [lockedBranch])

  const [cache, setCache] = useState<Record<string, EnginePayload | HistoricalReportPayload>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const seq = useRef(0)

  // Which source serves a year: the audited package only exists through
  // FY2025, and only when that basis is chosen.
  const sourceOf = (y: number) => (basis === 'audited' && y <= LAST_MANUAL_YEAR ? 'aud' : 'v2')
  const keyOf = (y: number) => `${sourceOf(y)}:${y}|${branch}`
  const auditedApplies = yearA <= LAST_MANUAL_YEAR || yearB <= LAST_MANUAL_YEAR

  // Load what the two years need. Each year+branch+source is cached, so
  // changing only the month range is instant; a newer load supersedes an older.
  useEffect(() => {
    const keys = [...new Set([keyOf(yearA), keyOf(yearB)])]
    const missing = keys.filter(k => !cache[k])
    if (missing.length === 0) {
      // Everything is cached: retire any in-flight load so its spinner can't linger.
      seq.current++
      setLoading(false); setError('')
      return
    }
    const mine = ++seq.current
    const ctl = new AbortController()
    setLoading(true); setError('')
    Promise.all(missing.map(async k => {
      const [src, rest] = k.split(':')
      const [y, b] = rest.split('|')
      const url = src === 'aud'
        ? `/api/reports?year=${y}&branch=${encodeURIComponent(b)}`
        : `/api/reports/v2?year=${y}&branch=${encodeURIComponent(b)}`
      const r = await fetch(url, { signal: ctl.signal })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Could not load ${y}`)
      if (src === 'aud' && !j.historical) throw new Error(`No audited statements for ${y}`)
      return [k, (src === 'aud' ? j.historical : j) as EnginePayload | HistoricalReportPayload] as const
    }))
      .then(pairs => { if (mine === seq.current) setCache(c => ({ ...c, ...Object.fromEntries(pairs) })) })
      .catch(e => { if (mine === seq.current && (e as Error).name !== 'AbortError') setError((e as Error).message || 'Failed to load') })
      .finally(() => { if (mine === seq.current) setLoading(false) })
    return () => ctl.abort()
    // keyOf folds in basis and branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearA, yearB, branch, basis, cache])

  const figuresFor = (y: number): Figures | string | null => {
    const p = cache[keyOf(y)]
    if (!p) return null
    return sourceOf(y) === 'aud'
      ? auditedFigures(p as HistoricalReportPayload, fromM, toM)
      : ledgerFigures(p as EnginePayload, fromM, toM)
  }
  const figA = figuresFor(yearA)
  const figB = figuresFor(yearB)
  const figError = typeof figA === 'string' ? `${yearA}: ${figA}` : typeof figB === 'string' ? `${yearB}: ${figB}` : ''

  const blocks = useMemo<Block[] | null>(() => {
    if (!figA || !figB || typeof figA === 'string' || typeof figB === 'string') return null
    const detail = !!(figA.lines && figB.lines)
    const mergedLines = (key: SectionKey): Line[] => {
      if (!detail) return []
      const byId = new Map<string, Line>()
      for (const [id, l] of figB.lines![key]) byId.set(id, { number: l.number, title: l.title, a: 0, b: l.v })
      for (const [id, l] of figA.lines![key]) {
        // The selected year's title wins when an account was renamed.
        const cur = byId.get(id) || { number: l.number, title: l.title, a: 0, b: 0 }
        cur.title = l.title
        cur.a = l.v
        byId.set(id, cur)
      }
      return [...byId.values()]
        .filter(l => Math.abs(l.a) >= 0.005 || Math.abs(l.b) >= 0.005)
        .sort((x, y) => x.number.localeCompare(y.number))
    }
    const section = (key: SectionKey): Block => ({
      kind: 'section', key, ...SECTION_META[key],
      a: figA.totals[key], b: figB.totals[key], lines: mergedLines(key),
    })
    const pair = (f: (x: Figures) => number) => ({ a: r2(f(figA)), b: r2(f(figB)) })
    const netSales = (x: Figures) => x.totals.REVENUE - x.totals.DISCOUNTS
    const grossProfit = (x: Figures) => netSales(x) - x.totals.COGS
    const ebitda = (x: Figures) => grossProfit(x) - x.totals.OPEX

    const out: Block[] = [
      section('REVENUE'),
      section('DISCOUNTS'),
      { kind: 'total', label: 'Net Sales', good: 'up', ...pair(netSales) },
      section('COGS'),
      { kind: 'total', label: 'Gross Profit', good: 'up', ...pair(grossProfit) },
      section('OPEX'),
      { kind: 'total', label: 'EBITDA', good: 'up', ...pair(ebitda) },
    ]
    if (detail) {
      for (const k of ['DEPRECIATION', 'INTEREST', 'NON_OPERATING'] as const) {
        if (figA.lines![k].size > 0 || figB.lines![k].size > 0) out.push(section(k))
      }
      if (INCOME_TAX_RATE > 0) out.push({ kind: 'total', label: 'Provision for Income Tax', good: 'down', ...pair(x => x.tax) })
    } else {
      // The audited layout doesn't split what lies below EBITDA the way the
      // ledger does, so both columns carry it as one line.
      out.push({ kind: 'section', key: 'BELOW', label: 'Depreciation, interest, other & income tax', good: 'down', ...pair(x => x.below), lines: [] })
    }
    out.push({ kind: 'total', label: 'Net Income', good: 'up', grand: true, ...pair(x => ebitda(x) - x.below) })
    return out
  }, [figA, figB])

  const rangeLabel = fromM === toM ? MONTHS[fromM - 1] : `${MONTHS[fromM - 1]}–${MONTHS[toM - 1]}`
  const tagOf = (y: number) => (sourceOf(y) === 'aud' ? ' (audited)' : '')
  const colA = `${rangeLabel} ${yearA}${tagOf(yearA)}`
  const colB = `${rangeLabel} ${yearB}${tagOf(yearB)}`
  const branchLabel = BRANCHES.find(b => b.value === branch)?.label || branch
  const inProgress = (yearA === thisYear || yearB === thisYear) && toM >= thisMonth
  const auditedInUse = auditedApplies && basis === 'audited'
  const yearNotes = [figB, figA].flatMap(f => (f && typeof f !== 'string' ? f.notes : []))
  const toggle = (k: string) => setOpen(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const exportRows = (): (string | number)[][] => {
    if (!blocks) return []
    const row = (label: string, a: number, b: number, good: 'up' | 'down') => {
      const c = change(a, b, good)
      return [label, b, a, c.diff, c.pct === null ? (c.diff === 0 ? '' : 'new') : `${c.pct.toFixed(1)}%`]
    }
    const rows: (string | number)[][] = []
    for (const blk of blocks) {
      rows.push(row(blk.kind === 'section' ? blk.label : blk.label.toUpperCase(), blk.a, blk.b, blk.good))
      if (blk.kind === 'section') for (const l of blk.lines) rows.push(row(`    ${l.number} ${l.title}`, l.a, l.b, blk.good))
    }
    return rows
  }
  const headers = ['Line', colB, colA, 'Change (₱)', 'Change (%)']
  const basisTag = auditedInUse ? 'audited-basis' : 'ledger'
  const exportXlsx = () => downloadXlsx(`yoy-${rangeLabel}-${yearA}-vs-${yearB}-${branch}-${basisTag}`, [{ name: 'YoY Comparison', headers, rows: exportRows() }])
  const exportPdf = () => downloadPdf({
    title: `Year-over-Year Comparison — ${colA} vs ${colB}`,
    subtitle: `${branchLabel}${auditedInUse ? ' · FY2024–FY2025 on the audited basis' : ''}`,
    headers,
    rows: exportRows().map(r => r.map((c, i) => (i >= 1 && i <= 3 && typeof c === 'number') ? peso(c) : c)),
    landscape: true,
  })

  const sel = 'px-3 py-2 rounded-xl border text-sm bg-white'
  const ChangeCells = ({ a, b, good, strong }: { a: number; b: number; good: 'up' | 'down'; strong?: boolean }) => {
    const c = change(a, b, good)
    const color = c.better === null ? 'var(--mid-gray)' : c.better ? '#15803d' : '#b91c1c'
    return (
      <>
        <td className="px-3 py-2 text-right font-mono whitespace-nowrap" style={{ color, fontWeight: strong ? 700 : undefined }}>
          {c.diff === 0 ? '—' : `${c.diff > 0 ? '+' : '−'}${peso(Math.abs(c.diff))}`}
        </td>
        <td className="px-3 py-2 text-right font-mono whitespace-nowrap" style={{ color, fontWeight: strong ? 700 : undefined }}>
          {c.pct === null
            ? (c.diff === 0 ? '—' : 'new')
            : `${c.diff > 0 ? '▲' : c.diff < 0 ? '▼' : ''} ${Math.abs(c.pct).toFixed(1)}%`}
        </td>
      </>
    )
  }

  const shownError = error || figError
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold mr-1" style={{ color: 'var(--deep-teal)' }}>
          <CalendarRange size={16} /> Year-over-Year
        </span>
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>From</label>
        <select value={fromM} onChange={e => { const v = parseInt(e.target.value); setFromM(v); if (toM < v) setToM(v) }} className={sel} style={{ borderColor: 'var(--light-gray)' }}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</label>
        <select value={toM} onChange={e => { const v = parseInt(e.target.value); setToM(v); if (fromM > v) setFromM(v) }} className={sel} style={{ borderColor: 'var(--light-gray)' }}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <span className="mx-1 h-6 w-px" style={{ background: 'var(--light-gray)' }} />
        <select value={yearA} onChange={e => setYearA(parseInt(e.target.value))} className={sel} style={{ borderColor: 'var(--light-gray)' }}>
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>vs</label>
        <select value={yearB} onChange={e => setYearB(parseInt(e.target.value))} className={sel} style={{ borderColor: 'var(--light-gray)' }}>
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={branch} onChange={e => setBranch(e.target.value)} disabled={!!lockedBranch} className={sel} style={{ borderColor: 'var(--light-gray)' }}>
          {(lockedBranch ? BRANCHES.filter(b => b.value === lockedBranch) : BRANCHES).map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        {auditedApplies && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>FY2024–2025 basis</span>
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
              {(['ledger', 'audited'] as const).map(b => (
                <button key={b} onClick={() => setBasis(b)} className="px-3 py-2 text-xs font-semibold"
                  title={b === 'ledger' ? 'Same ledger as the Income Statement tab — account detail available' : 'Audited management accounts — summary lines only'}
                  style={basis === b ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
                  {b === 'ledger' ? 'Ledger' : 'Audited'}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportXlsx} disabled={!blocks} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}><Download size={15} /> Excel</button>
          <button onClick={exportPdf} disabled={!blocks} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}><Printer size={15} /> PDF</button>
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
        Income Statement for <strong>{rangeLabel}</strong> of {yearA} against the same months of {yearB}
        {auditedInUse
          ? <>, with FY2024–FY2025 taken from the <strong>audited management accounts</strong> (summary lines only — account detail isn&apos;t available on that basis).</>
          : <>, from the same ledger as the Income Statement tab. Click a section to see its accounts.</>}
        {' '}Green means better (revenue and profit up, costs down); red means worse.
        {!auditedInUse && auditedApplies && <> FY2024–FY2025 can also be compared on the <strong>audited</strong> basis — the 2025 ledger lacks the year-end adjustments, so its profit lines differ from the audited statements.</>}
        {yearA === yearB && <> <strong>Both years are the same</strong> — pick a different comparison year.</>}
        {inProgress && <> <strong>{MONTHS[thisMonth - 1]} {thisYear} is still in progress</strong>, so its figures are partial.</>}
      </p>
      {yearNotes.length > 0 && (
        <ul className="text-xs list-disc pl-5 space-y-0.5" style={{ color: 'var(--mid-gray)' }}>
          {yearNotes.map(n => <li key={n}>{n}</li>)}
        </ul>
      )}

      {shownError ? (
        <div className="px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700">{shownError}</div>
      ) : loading || !blocks ? (
        <div className="py-16 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
          <Loader2 size={20} className="inline animate-spin mr-2" style={{ color: 'var(--teal)' }} /> Building both years…
        </div>
      ) : (
        <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm" style={{ minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'var(--off-white)' }}>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>{branchLabel}</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase" style={{ color: 'var(--mid-gray)' }}>{colB}</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase" style={{ color: 'var(--charcoal)' }}>{colA}</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase" style={{ color: 'var(--mid-gray)' }}>Change (₱)</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase" style={{ color: 'var(--mid-gray)' }}>Change (%)</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map(blk => blk.kind === 'section' ? (
                <Fragment key={blk.key}>
                  <tr className={`border-t ${blk.lines.length ? 'cursor-pointer hover:bg-gray-50' : ''}`} style={{ borderColor: 'var(--light-gray)' }}
                    onClick={blk.lines.length ? () => toggle(blk.key) : undefined}>
                    <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>
                      <span className="inline-flex items-center gap-1">
                        {blk.lines.length > 0
                          ? (open.has(blk.key) ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
                          : <span className="inline-block w-[14px]" />}
                        {blk.label}
                        {blk.lines.length > 0 && <span className="text-[11px] font-normal" style={{ color: 'var(--mid-gray)' }}>({blk.lines.length})</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{peso(blk.b)}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{peso(blk.a)}</td>
                    <ChangeCells a={blk.a} b={blk.b} good={blk.good} />
                  </tr>
                  {open.has(blk.key) && blk.lines.map(l => (
                    <tr key={`${blk.key}-${l.number}-${l.title}`} className="border-t text-xs" style={{ borderColor: 'var(--light-gray)', background: '#fbfbfa' }}>
                      <td className="py-1.5 pr-3" style={{ paddingLeft: '2.25rem', color: 'var(--charcoal)' }}>
                        <span className="font-mono" style={{ color: 'var(--mid-gray)' }}>{l.number}</span> {l.title}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{peso(l.b)}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{peso(l.a)}</td>
                      <ChangeCells a={l.a} b={l.b} good={blk.good} />
                    </tr>
                  ))}
                </Fragment>
              ) : (
                <tr key={blk.label} className="border-t" style={{ borderColor: 'var(--light-gray)', background: blk.grand ? 'var(--pale-teal)' : 'var(--off-white)', borderTopWidth: blk.grand ? 2 : 1 }}>
                  <td className="px-3 py-2.5 font-bold" style={{ color: blk.grand ? 'var(--deep-teal)' : 'var(--charcoal)' }}>{blk.label}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: blk.b < 0 ? '#b91c1c' : 'var(--mid-gray)' }}>{peso(blk.b)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: blk.a < 0 ? '#b91c1c' : 'var(--charcoal)' }}>{peso(blk.a)}</td>
                  <ChangeCells a={blk.a} b={blk.b} good={blk.good} strong />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
