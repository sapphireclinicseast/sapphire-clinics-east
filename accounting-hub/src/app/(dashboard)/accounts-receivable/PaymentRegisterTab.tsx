'use client'

// Accounts Receivable → Payment Register (Hannah 2026-11-17: "a payment history
// (joint) tracker that combines both HMO and GL so we know that a sequence was not
// missed").
//
// Every AR payment from both HMO and Guarantee Letter Payment History in one list,
// laid out by its AR reference (AR25-0001, AR25-0002, … AHEA-AR26-0009, …). A
// number that was skipped shows as a red "missing" row in its place. A number on
// more than one row is flagged: on the same date that is one deposit split across
// several wallets (one row per patient or HMO); on different dates the number was
// used twice. Payments with no reference at all are listed underneath.
// References are set in Payment History › Record Payment. A number given in the
// hub after the fact, before its paper copy was compiled, carries the
// "physical copy pending" tag: those rows are violet until "Mark compiled".

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { branchShort } from '@/lib/branch'
import { downloadXlsx } from '@/lib/export'
import { refInSeries } from '@/lib/ar-ref'
import { StatCard, HrShimmerStyle } from '@/components/ui/hr-look'

interface RegisterRow {
  id: string
  ref: string
  series: string
  num: number | null
  paymentDate: string
  type: 'HMO' | 'GL'
  payer: string
  agency: string
  branch: string
  cash: number
  withheld: number
  overpayment: number
  settled: number
  sessions: number
  /** Proof files attached in Payment History (PV, deposit slip, claim notice…). */
  proofUrls: string[]
  notes: string
  noCash: boolean
  /** AR number given in the hub before its physical copy was compiled. */
  copyPending: boolean
}

type Line =
  | { kind: 'row'; row: RegisterRow; groupSize: number; groupIndex: number; reused: boolean }
  | { kind: 'missing'; series: string; num: number }

interface SeriesInfo {
  series: string
  numbers: number[]
  max: number
  missing: number[]
  /** Numbers on more than one row: same date (one deposit split) or not (reused). */
  split: number[]
  reused: number[]
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
const dayOf = (d: string) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
// Year a series covers: "AR25" → 2025, "AHEA-AR26" → 2026, "TC25" → 2025.
const seriesYear = (s: string) => 2000 + parseInt(s.slice(-2), 10)
// QuickBooks-era and East first, then the other branches, AR before TC.
const seriesOrder = (s: string) => `${s.slice(-2)}|${s.includes('TC') ? 1 : 0}|${s.startsWith('AHGH') ? 2 : s.startsWith('VER') ? 3 : s.startsWith('AHEA') ? 1 : 0}`
const isTc = (s: string) => /(^|-)TC\d{2}$/.test(s)
const seriesLabel = (s: string) =>
  s.startsWith('AHEA-AR') ? `${s} (East)` : s.startsWith('AHGH-AR') ? `${s} (Greenhills)` : s.startsWith('VER-AR') ? `${s} (Verdana)`
    : isTc(s) ? `${s} (BIR 2307 withholding booked on its own)` : `${s} (QuickBooks era)`

const VIOLET = { bar: '#7c3aed', bg: '#f5f3ff', chipBg: '#ede9fe', text: '#5b21b6' }

export default function PaymentRegisterTab({ branch, canEdit = false }: { branch: string; canEdit?: boolean }) {
  const [rows, setRows] = useState<RegisterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [year, setYear] = useState<string>(String(new Date().getFullYear()))
  const [fType, setFType] = useState<'' | 'HMO' | 'GL'>('')
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [showNoCash, setShowNoCash] = useState(false)
  const [onlyPending, setOnlyPending] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/accounts-receivable/payment-register${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`)
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Could not load the payment register'); setRows([]) }
      else setRows(d.rows ?? [])
    } catch {
      setError('Could not load the payment register.')
    } finally { setLoading(false) }
  }, [branch])
  useEffect(() => { load() }, [load])

  // Clears the "physical copy pending" tag once the paper copy is compiled.
  // Writes the payment's notes only — no tags, amounts or journal entry change.
  const markCompiled = async (r: RegisterRow) => {
    if (!window.confirm(`Mark ${r.ref} as compiled? Its physical copy is filed.`)) return
    setBusyId(r.id); setError('')
    try {
      const res = await fetch('/api/accounts-receivable/payment-register', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, copyPending: false }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) setError(d.error ?? 'Could not mark it compiled')
      else setRows(prev => prev.map(x => x.id === r.id ? { ...x, copyPending: false } : x))
    } catch {
      setError('Could not mark it compiled.')
    } finally { setBusyId('') }
  }

  const years = useMemo(() => {
    const s = new Set<number>()
    for (const r of rows) s.add(r.series ? seriesYear(r.series) : new Date(r.paymentDate).getFullYear())
    return [...s].sort((a, b) => b - a)
  }, [rows])

  // Sequence check per series — always on the full list, so a filter never hides a gap.
  const seriesInfo = useMemo(() => {
    const by = new Map<string, RegisterRow[]>()
    for (const r of rows) {
      if (!r.series || r.num == null) continue
      by.set(r.series, [...(by.get(r.series) || []), r])
    }
    const out: SeriesInfo[] = []
    for (const [series, list] of by) {
      const numbers = [...new Set(list.map(r => r.num as number))].sort((a, b) => a - b)
      const max = numbers[numbers.length - 1] || 0
      // AHEA-AR26 starts at 0001 even though 0001–0008 were written without the
      // prefix; parseArRef already files those under AHEA.
      // TC (BIR 2307) numbers are not checked for gaps: most 2307s are folded into
      // their AR payment's withholding (QuickBooks TC25-0001…0009 sit inside
      // AR25-0002…0020) and only the rest are entries of their own.
      const missing: number[] = []
      if (!isTc(series)) for (let i = 1; i <= max; i++) if (!numbers.includes(i)) missing.push(i)
      const split: number[] = [], reused: number[] = []
      for (const num of numbers) {
        const same = list.filter(r => r.num === num)
        if (same.length < 2) continue
        if (new Set(same.map(r => dayOf(r.paymentDate))).size === 1) split.push(num); else reused.push(num)
      }
      out.push({ series, numbers, max, missing, split, reused })
    }
    return out.sort((a, b) => seriesOrder(a.series).localeCompare(seriesOrder(b.series)))
  }, [rows])

  const inYear = useCallback((series: string, date: string) =>
    !year || (series ? seriesYear(series) : new Date(date).getFullYear()) === Number(year), [year])

  const needle = q.trim().toLowerCase()
  const matches = useCallback((r: RegisterRow) =>
    (!fType || r.type === fType)
    && (!onlyPending || r.copyPending)
    && (!needle || `${r.ref} ${r.payer} ${r.agency} ${r.notes}`.toLowerCase().includes(needle)), [fType, needle, onlyPending])

  // The numbered list, series by series, with a red row wherever a number is missing.
  const lines = useMemo(() => {
    const out: { series: string; lines: Line[] }[] = []
    for (const info of seriesInfo) {
      if (!inYear(info.series, '')) continue
      const list = rows.filter(r => r.series === info.series)
      const ls: Line[] = []
      for (let num = 1; num <= info.max; num++) {
        const same = list.filter(r => r.num === num).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))
        if (!same.length) {
          if (info.missing.includes(num) && !fType && !needle && !onlyProblems && !onlyPending) ls.push({ kind: 'missing', series: info.series, num })
          continue
        }
        const reused = info.reused.includes(num)
        const problem = reused || info.split.includes(num)
        same.forEach((row, i) => {
          if (!matches(row)) return
          if (onlyProblems && !problem) return
          ls.push({ kind: 'row', row, groupSize: same.length, groupIndex: i, reused })
        })
      }
      if (ls.length) out.push({ series: info.series, lines: ls })
    }
    return out
  }, [seriesInfo, rows, inYear, matches, onlyProblems, onlyPending, fType, needle])

  const unnumbered = useMemo(() => rows
    .filter(r => !r.ref && inYear('', r.paymentDate) && matches(r) && (showNoCash || !r.noCash))
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate)), [rows, inYear, matches, showNoCash])
  const hiddenNoCash = useMemo(() => rows.filter(r => !r.ref && r.noCash && inYear('', r.paymentDate)).length, [rows, inYear])

  const yearInfo = seriesInfo.filter(s => inYear(s.series, ''))
  const missingCount = yearInfo.reduce((s, i) => s + i.missing.length, 0)
  const reusedCount = yearInfo.reduce((s, i) => s + i.reused.length, 0)
  const numberedCount = yearInfo.filter(i => !isTc(i.series)).reduce((s, i) => s + i.numbers.length, 0)
  const unnumberedCash = rows.filter(r => !r.ref && !r.noCash && inYear('', r.paymentDate))
  const pendingCount = rows.filter(r => r.ref && r.copyPending && inYear(r.series, r.paymentDate)).length

  const exportXlsx = () => {
    const headers = ['Reference', 'Status', 'Date', 'Type', 'Payer', 'Branch', 'Cash Received', 'Withholding / Discount', 'Excess (held)', 'Sessions', 'Proof', 'Physical copy', 'Notes']
    const out: (string | number)[][] = []
    for (const s of lines) for (const l of s.lines) {
      if (l.kind === 'missing') { out.push([refInSeries(l.series, l.num), 'MISSING — no payment has this number', '', '', '', '', '', '', '', '', '', '']); continue }
      const r = l.row
      const status = l.groupSize > 1 ? (l.reused ? `Number used ${l.groupSize}× on different dates` : `One deposit, row ${l.groupIndex + 1} of ${l.groupSize}`) : 'OK'
      out.push([r.ref, status, dayOf(r.paymentDate), r.type, r.payer, branchShort(r.branch) || '', r.cash.toFixed(2), r.withheld.toFixed(2), r.overpayment.toFixed(2), r.sessions, r.proofUrls.length ? 'Yes' : 'No', r.copyPending ? 'Pending' : 'Compiled', r.notes])
    }
    for (const r of unnumbered) out.push(['', 'NO REFERENCE', dayOf(r.paymentDate), r.type, r.payer, branchShort(r.branch) || '', r.cash.toFixed(2), r.withheld.toFixed(2), r.overpayment.toFixed(2), r.sessions, r.proofUrls.length ? 'Yes' : 'No', '', r.notes])
    downloadXlsx(`Payment Register ${year || 'All years'}.xlsx`, [{ name: 'Payment Register', headers, rows: out }])
  }

  const inp = 'px-3 py-2 rounded-lg border text-sm'
  const inpStyle = { borderColor: 'var(--light-gray)', background: '#fff' }
  const th = 'px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap'
  const typePill = (t: 'HMO' | 'GL') => (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
      style={t === 'HMO' ? { background: '#EDF3D9', color: '#3C6A5F' } : { background: '#eff6ff', color: '#1d4ed8' }}>{t}</span>
  )
  const rowCells = (r: RegisterRow) => (
    <>
      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.paymentDate)}</td>
      <td className="px-3 py-2">{typePill(r.type)}</td>
      <td className="px-3 py-2" style={{ maxWidth: 260 }}>
        <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{r.payer}</span>
        {r.agency && <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>{r.agency}</span>}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--mid-gray)' }}>{branchShort(r.branch) || '—'}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatCurrency(r.cash)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums" style={{ color: r.withheld ? 'var(--charcoal)' : 'var(--mid-gray)' }}>{r.withheld ? formatCurrency(r.withheld) : '—'}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{r.sessions || '—'}</td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        {r.proofUrls.length === 0
          ? <span style={{ color: '#b45309' }} title="No proof attached in Payment History">none</span>
          : r.proofUrls.map((url, i) => (
              <a key={url + i} href={url} target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold underline underline-offset-2 hover:opacity-80"
                style={{ color: 'var(--teal)', marginLeft: i ? 8 : 0 }}
                title={`Open ${decodeURIComponent(url.split('/').pop() || 'proof')}`}>
                {r.proofUrls.length > 1 ? `View ${i + 1}` : 'View'}
              </a>
            ))}
      </td>
      <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)', maxWidth: 380 }}><span className="line-clamp-2" title={r.notes}>{r.notes || '—'}</span></td>
    </>
  )

  return (
    <div className="space-y-4">
      <HrShimmerStyle />
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Payment Register — HMO and GL</h2>
        <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
          Every recorded AR payment from both Payment Histories, in reference-number order, so a skipped number shows at once.
          References are set in Payment History › Record Payment.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard loading={loading} label="AR numbers used" value={String(numberedCount)}
          sub={`${yearInfo.filter(i => !isTc(i.series)).length} AR sequence${yearInfo.filter(i => !isTc(i.series)).length === 1 ? '' : 's'}${year ? ` · ${year}` : ''}`} tone={numberedCount ? 'green' : 'zero'} />
        <StatCard loading={loading} label="Missing numbers" value={String(missingCount)}
          sub={missingCount ? 'Skipped in a sequence — shown in red below' : 'No number skipped'} tone={missingCount ? 'red' : 'zero'} />
        <StatCard loading={loading} label="Number used twice" value={String(reusedCount)}
          sub={reusedCount ? 'Same number on different dates' : 'Each number used once'} tone={reusedCount ? 'amber' : 'zero'}
          active={onlyProblems} onClick={reusedCount ? () => setOnlyProblems(v => !v) : undefined} />
        <StatCard loading={loading} label="No reference" value={String(unnumberedCash.length)} compact
          sub={unnumberedCash.length ? `${formatCurrency(unnumberedCash.reduce((s, r) => s + r.cash, 0))} received without an AR number` : 'Every collection has a number'}
          tone={unnumberedCash.length ? 'amber' : 'zero'} />
      </div>

      {!loading && yearInfo.length > 0 && (
        <div className="rounded-lg border bg-white px-4 py-3 space-y-1.5" style={{ borderColor: 'var(--light-gray)' }}>
          {yearInfo.map(i => (
            <div key={i.series} className="text-sm flex flex-wrap items-baseline gap-x-2" style={{ color: 'var(--charcoal)' }}>
              <span className="font-semibold">{seriesLabel(i.series)}:</span>
              <span className="tabular-nums">{isTc(i.series) ? `${i.numbers.length} entr${i.numbers.length === 1 ? 'y' : 'ies'}` : `${refInSeries(i.series, 1).slice(-4)}–${refInSeries(i.series, i.max).slice(-4)}`}</span>
              {isTc(i.series)
                ? <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>not checked for gaps — the other 2307s are inside their AR payments&apos; withholding</span>
                : i.missing.length === 0
                ? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#dcfce7', color: '#166534' }}>complete</span>
                : <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#fee2e2', color: '#991b1b' }}>
                    missing {i.missing.map(m => refInSeries(i.series, m)).join(', ')}
                  </span>}
              {i.reused.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>
                  used on different dates: {i.reused.map(m => refInSeries(i.series, m)).join(', ')}
                </span>
              )}
              {i.split.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                  {i.split.length} number{i.split.length === 1 ? ' covers' : 's cover'} one deposit split across several wallets
                </span>
              )}
              {i.series === 'AHEA-AR26' && (
                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>· 0001–0008 were written without the AHEA prefix (AR26-0001…)</span>
              )}
            </div>
          ))}
          {pendingCount > 0 && (
            <div className="text-sm flex flex-wrap items-center gap-x-2" style={{ color: 'var(--charcoal)' }}>
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: VIOLET.bar }} />
              <span><span className="font-semibold">{pendingCount}</span> number{pendingCount === 1 ? '' : 's'} given in the hub — physical copy not compiled yet (violet rows)</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select className={inp} style={inpStyle} value={year} onChange={e => setYear(e.target.value)} aria-label="Year">
          <option value="">All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }} role="group" aria-label="Type">
          {(['', 'HMO', 'GL'] as const).map(t => (
            <button key={t || 'all'} type="button" onClick={() => setFType(t)}
              className="px-3 py-2 text-xs font-semibold"
              style={{ background: fType === t ? 'var(--teal)' : '#fff', color: fType === t ? '#fff' : 'var(--charcoal)' }}>
              {t || 'HMO + GL'}
            </button>
          ))}
        </div>
        <input className={inp} style={{ ...inpStyle, minWidth: 220 }} placeholder="Search reference, payer, notes…" value={q} onChange={e => setQ(e.target.value)} />
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}>
          <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} />
          Only numbers on more than one row
        </label>
        {pendingCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: VIOLET.text }}>
            <input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />
            Only physical copy pending ({pendingCount})
          </label>
        )}
        <button onClick={exportXlsx} disabled={loading || (!lines.length && !unnumbered.length)}
          className="ml-auto px-3 py-2 rounded-lg text-sm font-medium border disabled:opacity-50"
          style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)', background: '#fff' }}>
          Download Excel
        </button>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FCA5A5' }}>{error}</div>
      )}

      {/* The table scrolls in its own box so the column headers stay in view
          (Hannah 2026-11-18: "make the column headers stay even when i scroll down"). */}
      <div className="rounded-lg border overflow-auto bg-white max-h-[calc(100vh-180px)] min-h-[320px]" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: '#f8faf6', color: 'var(--mid-gray)', boxShadow: '0 1px 0 #E9EFDC' }}>
              <th className={`${th} text-left`}>Reference</th>
              <th className={`${th} text-left`}>Date</th>
              <th className={`${th} text-left`}>Type</th>
              <th className={`${th} text-left`}>Payer</th>
              <th className={`${th} text-left`}>Branch</th>
              <th className={`${th} text-right`}>Cash received</th>
              <th className={`${th} text-right`}>Withholding / discount</th>
              <th className={`${th} text-right`}>Sessions</th>
              <th className={`${th} text-center`}>Proof</th>
              <th className={`${th} text-left`}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="px-4 py-10 text-center" style={{ color: 'var(--mid-gray)' }}>Loading…</td></tr>}
            {!loading && !lines.length && !error && (
              <tr><td colSpan={10} className="px-4 py-10 text-center" style={{ color: 'var(--mid-gray)' }}>No numbered payments match these filters.</td></tr>
            )}
            {lines.map(s => (
              <Fragment key={s.series}>
                <tr><td colSpan={10} className="px-3 pt-4 pb-1.5 text-[12px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--teal)', borderBottom: '1px solid #E9EFDC' }}>{seriesLabel(s.series)}</td></tr>
                {s.lines.map(l => l.kind === 'missing' ? (
                  <tr key={`m-${l.series}-${l.num}`} style={{ background: '#fef2f2', borderBottom: '1px solid #E9EFDC', boxShadow: 'inset 4px 0 0 #dc2626' }}>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap tabular-nums" style={{ color: '#991b1b' }}>{refInSeries(l.series, l.num)}</td>
                    <td colSpan={9} className="px-3 py-2 text-sm font-semibold" style={{ color: '#991b1b' }}>Missing — no HMO or GL payment has this number</td>
                  </tr>
                ) : (
                  <tr key={l.row.id} style={{
                    borderBottom: '1px solid #E9EFDC',
                    boxShadow: l.row.copyPending ? `inset 4px 0 0 ${VIOLET.bar}` : l.groupSize > 1 ? `inset 4px 0 0 ${l.reused ? '#d97706' : '#4A8073'}` : undefined,
                    background: l.reused ? '#fffbeb' : l.row.copyPending ? VIOLET.bg : undefined,
                  }}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>{l.row.ref}</span>
                      {l.groupSize > 1 && (
                        <span className="block text-[11px]" style={{ color: l.reused ? '#b45309' : 'var(--mid-gray)' }}>
                          {l.reused ? `used ${l.groupSize}× on different dates` : `one deposit · ${l.groupIndex + 1} of ${l.groupSize}`}
                        </span>
                      )}
                      {l.row.copyPending && (
                        <span className="mt-1 flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: VIOLET.chipBg, color: VIOLET.text }}
                            title="AR number given in the hub; the physical copy has not been compiled yet">Physical copy pending</span>
                          {canEdit && (
                            <button type="button" onClick={() => markCompiled(l.row)} disabled={busyId === l.row.id}
                              className="text-[10.5px] font-semibold underline underline-offset-2 disabled:opacity-50" style={{ color: VIOLET.text }}>
                              {busyId === l.row.id ? 'Saving…' : 'Mark compiled'}
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    {rowCells(l.row)}
                  </tr>
                ))}
              </Fragment>
            ))}
            {!loading && (unnumbered.length > 0 || hiddenNoCash > 0) && (
              <>
                <tr><td colSpan={10} className="px-3 pt-5 pb-1.5" style={{ borderBottom: '1px solid #E9EFDC' }}>
                  <span className="text-[12px] font-bold uppercase tracking-[.4px]" style={{ color: '#b45309' }}>No reference number</span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--mid-gray)' }}>recorded in Payment History without an AR number at the head of its notes</span>
                  {hiddenNoCash > 0 && (
                    <label className="ml-3 inline-flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                      title="SCI-era ₱0 markers and GL write-offs: no cash was received, so no AR number is needed">
                      <input type="checkbox" checked={showNoCash} onChange={e => setShowNoCash(e.target.checked)} />
                      Also show markers and write-offs with no cash ({hiddenNoCash})
                    </label>
                  )}
                </td></tr>
                {unnumbered.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #E9EFDC', boxShadow: r.noCash ? undefined : 'inset 4px 0 0 #d97706' }}>
                    <td className="px-3 py-2 whitespace-nowrap text-xs font-semibold" style={{ color: r.noCash ? 'var(--mid-gray)' : '#b45309' }}>{r.noCash ? 'no cash' : 'no number'}</td>
                    {rowCells(r)}
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
