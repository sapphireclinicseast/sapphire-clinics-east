'use client'

// ── Bank history ────────────────────────────────────────────────────────────
// One bank account the way the bank's own app shows it: newest first, grouped
// by day, money in, money out, and the balance after every line. Read-only.

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Download, Loader2, Search } from 'lucide-react'
import { StatCard, hrBtn } from '@/components/ui/hr-look'

interface Line {
  id: string; date: string; description: string; fromToName: string | null
  moneyIn: number; moneyOut: number; balance: number | null; printed: boolean; gap: number | null
  status: string; matchLabel: string | null; excluded: boolean
}
interface History {
  account: { id: string; accountNumber: string; accountTitle: string; currency: string }
  from: string | null; to: string | null
  firstDate: string | null; latestDate: string | null; latestBalance: number | null; excludedCount: number
  opening: number | null; closing: number | null; moneyIn: number; moneyOut: number; gaps: number
  dayClose: Record<string, number | null>
  lines: Line[]
}

type Period = 'month' | 'last-month' | '3m' | 'year' | 'all' | 'custom'
const PERIODS: [Period, string][] = [['month', 'This month'], ['last-month', 'Last month'], ['3m', 'Last 3 months'], ['year', 'This year'], ['all', 'All']]

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
function todayManila() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }
}
function rangeFor(p: Period): { from: string; to: string } {
  const t = todayManila()
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
  const back = (months: number) => { const z = new Date(Date.UTC(t.y, t.m - 1 - months, 1)); return { y: z.getUTCFullYear(), m: z.getUTCMonth() + 1 } }
  switch (p) {
    // Open-ended: run to the newest line, which can carry a later value date
    // than today's.
    case 'month': return { from: iso(t.y, t.m, 1), to: '' }
    case 'last-month': { const b = back(1); return { from: iso(b.y, b.m, 1), to: iso(b.y, b.m, lastDay(b.y, b.m)) } }
    case '3m': { const b = back(2); return { from: iso(b.y, b.m, 1), to: '' } }
    case 'year': return { from: iso(t.y, 1, 1), to: '' }
    default: return { from: '', to: '' }
  }
}
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const shortDate = (d: string | null) => d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—'

const PAGE = 250
const plural = (n: number, w: string) => `${n.toLocaleString('en-PH')} ${w}${n === 1 ? '' : 's'}`

export default function BankHistory({ accountId }: { accountId: string }) {
  const [period, setPeriod] = useState<Period>('3m')
  const [from, setFrom] = useState(() => rangeFor('3m').from)
  const [to, setTo] = useState(() => rangeFor('3m').to)
  const [showExcluded, setShowExcluded] = useState(false)
  const [search, setSearch] = useState('')
  const [flow, setFlow] = useState<'all' | 'in' | 'out'>('all')
  const [shown, setShown] = useState(PAGE)

  const pick = (p: Period) => {
    setPeriod(p)
    if (p !== 'custom') { const r = rangeFor(p); setFrom(r.from); setTo(r.to) }
  }

  // What to fetch; a change of account, dates or the excluded toggle is a new
  // request, and "loading" is simply "the answer on hand is for another one".
  const reqKey = useMemo(() => {
    if (!accountId) return ''
    const q = new URLSearchParams({ bankAccountId: accountId })
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    if (showExcluded) q.set('excluded', '1')
    return `/api/bank-rec/history?${q}`
  }, [accountId, from, to, showExcluded])
  const [res, setRes] = useState<{ key: string; data: History | null; error: string } | null>(null)
  useEffect(() => {
    if (!reqKey) return
    let live = true
    fetch(reqKey)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load the history'); return d as History })
      .then(d => { if (live) { setRes({ key: reqKey, data: d, error: '' }); setShown(PAGE) } })
      .catch(e => { if (live) setRes({ key: reqKey, data: null, error: String(e?.message || e) }) })
    return () => { live = false }
  }, [reqKey])
  const loading = !!reqKey && res?.key !== reqKey
  const data = res?.data ?? null
  const error = res && res.key === reqKey ? res.error : ''

  const cur = data && data.account.currency !== 'PHP' ? data.account.currency : ''
  const amt = (n: number) => `${cur ? `${cur} ` : '₱'}${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const bal = (n: number | null) => (n === null ? '—' : amt(n))

  // Newest first, as a bank app lists them; day order inside comes from the API.
  const filtered = useMemo(() => {
    if (!data) return []
    const s = search.trim().toLowerCase()
    return [...data.lines].reverse().filter(l => {
      if (flow === 'in' && !(l.moneyIn > 0)) return false
      if (flow === 'out' && !(l.moneyOut > 0)) return false
      if (s && !`${l.description} ${l.fromToName || ''} ${l.matchLabel || ''}`.toLowerCase().includes(s)) return false
      return true
    })
  }, [data, search, flow])

  const groups = useMemo(() => {
    const out: { date: string; lines: Line[] }[] = []
    for (const l of filtered.slice(0, shown)) {
      const g = out[out.length - 1]
      if (g && g.date === l.date) g.lines.push(l)
      else out.push({ date: l.date, lines: [l] })
    }
    return out
  }, [filtered, shown])

  const downloadCsv = () => {
    if (!data) return
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const n2 = (n: number) => (n ? n.toFixed(2) : '')
    const rows = [['Date', 'Description', 'From / to', 'Money in', 'Money out', 'Balance', 'Bank Rec status']]
    for (const l of data.lines) {
      rows.push([l.date, l.description, l.fromToName || '', n2(l.moneyIn), n2(l.moneyOut),
        l.excluded ? '' : (l.balance === null ? '' : l.balance.toFixed(2)), l.excluded ? 'Excluded' : l.status === 'POSTED' ? 'Posted' : 'Pending'])
    }
    const blob = new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${data.account.accountTitle} - bank history ${data.from || data.firstDate || ''} to ${data.to || data.latestDate || ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const counted = data ? data.lines.filter(l => !l.excluded).length : 0
  return (
    <div className="space-y-4">
      {/* Where the bank says the account stands right now */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
          Bank balance{' '}
          <strong className="text-base tabular-nums" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{data ? bal(data.latestBalance) : '…'}</strong>
          {data?.latestDate && <> as of {shortDate(data.latestDate)}</>}
        </p>
        {data?.firstDate && (
          <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            Statement lines on file: {shortDate(data.firstDate)} – {shortDate(data.latestDate)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Opening balance" value={data ? bal(data.opening) : '—'} sub={from ? `Before ${shortDate(from)}` : 'Before the first line'} accent={{ line: '#4A8073', fg: 'var(--charcoal)' }} loading={loading && !data} compact />
        <StatCard label="Money in" value={data ? `+${amt(data.moneyIn)}` : '—'} sub={flow === 'in' ? 'Showing money in · click to clear' : plural(data ? data.lines.filter(l => !l.excluded && l.moneyIn > 0).length : 0, 'credit')}
          tone="green" active={flow === 'in'} onClick={() => setFlow(f => (f === 'in' ? 'all' : 'in'))} loading={loading && !data} compact />
        <StatCard label="Money out" value={data ? `−${amt(data.moneyOut)}` : '—'} sub={flow === 'out' ? 'Showing money out · click to clear' : plural(data ? data.lines.filter(l => !l.excluded && l.moneyOut > 0).length : 0, 'debit')}
          accent={{ line: '#b91c1c', fg: '#991b1b' }} active={flow === 'out'} onClick={() => setFlow(f => (f === 'out' ? 'all' : 'out'))} loading={loading && !data} compact />
        <StatCard label="Closing balance" value={data ? bal(data.closing) : '—'} sub={to ? `End of ${shortDate(to)}` : data?.latestDate ? `After the last line, ${shortDate(data.latestDate)}` : 'After the last line'} tone="blue" loading={loading && !data} compact />
      </div>

      {data && data.gaps > 0 && (
        <div className="rounded-lg border px-4 py-2.5 text-xs flex items-start gap-2" style={{ borderColor: '#fde68a', background: '#fffbeb', color: '#92400e' }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            <strong>{data.gaps} day{data.gaps > 1 ? 's' : ''}</strong> in this period {data.gaps > 1 ? "don't" : "doesn't"} add up to the balance the bank printed. The Hub is missing a line the bank has, or holds one twice. Each is marked below on its day, with the difference.
          </span>
        </div>
      )}

      <div className="rounded-lg border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
            {PERIODS.map(([k, lbl]) => (
              <button key={k} onClick={() => pick(k)} className="px-3 py-1.5 text-xs font-semibold"
                style={period === k ? { background: 'var(--deep-teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{lbl}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--mid-gray)' }}>
            <input type="date" value={from} max={to || undefined} onChange={e => { setPeriod('custom'); setFrom(e.target.value) }}
              className="h-8 px-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} aria-label="From" />
            <span>to</span>
            <input type="date" value={to} min={from || undefined} onChange={e => { setPeriod('custom'); setTo(e.target.value) }}
              className="h-8 px-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} aria-label="To" />
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} style={{ color: 'var(--mid-gray)', position: 'absolute', left: 10, top: 9 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description or payee…"
              className="w-full h-8 pl-8 pr-3 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          {data && data.excludedCount > 0 && (
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--mid-gray)' }}
              title="Lines switched off in Bank Rec (a doubled upload, or a line that is not on the statement). Shown greyed out and never counted.">
              <input type="checkbox" checked={showExcluded} onChange={e => setShowExcluded(e.target.checked)} />
              Show excluded ({data.excludedCount})
            </label>
          )}
          <button onClick={downloadCsv} disabled={!data || !data.lines.length} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <Download size={13} /> CSV
          </button>
        </div>

        {/* Lines */}
        {loading && !data ? (
          <div className="p-6 flex items-center gap-2 text-xs" style={{ color: 'var(--mid-gray)' }}><Loader2 size={14} className="animate-spin" /> Loading bank history…</div>
        ) : error ? (
          <div className="p-6 text-xs" style={{ color: '#b91c1c' }}>{error}</div>
        ) : !filtered.length ? (
          <div className="p-6 text-xs" style={{ color: 'var(--mid-gray)' }}>
            {data && data.lines.length ? 'No lines match the search.' : 'No statement lines in this period.'}
          </div>
        ) : (
          <div className={loading ? 'opacity-60' : ''}>
            {groups.map(g => {
              // A day that doesn't add up: the bank's end-of-day balance against
              // the day it opened on plus these lines.
              const off = data?.lines.find(l => l.date === g.date && l.gap !== null)?.gap ?? null
              return (
              <div key={g.date}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[.4px]"
                  style={{ background: off !== null ? '#fffbeb' : '#f8faf6', color: 'var(--mid-gray)', borderTop: '1px solid var(--light-gray)', borderBottom: '1px solid var(--light-gray)', borderLeft: `3px solid ${off !== null ? '#d97706' : 'transparent'}` }}>
                  <span>{dayLabel(g.date)}</span>
                  <span className="flex items-center gap-2 normal-case tracking-normal font-semibold tabular-nums">
                    {off !== null && (
                      <span className="inline-flex items-center gap-1 px-2 py-px rounded-full text-[10.5px]" style={{ background: '#fef3c7', color: '#92400e' }}
                        title={`The bank's end-of-day balance is ${amt(Math.abs(off))} ${off > 0 ? 'higher' : 'lower'} than the day's opening balance plus these lines. A line is missing from the Hub, or one is in twice.`}>
                        <AlertTriangle size={11} /> Off by {off > 0 ? '+' : '−'}{amt(Math.abs(off))}
                      </span>
                    )}
                    End of day {bal(data?.dayClose[g.date] ?? null)}
                  </span>
                </div>
                {g.lines.map(l => {
                  const isIn = l.moneyIn > 0 && !(l.moneyOut > 0)
                  const net = l.moneyIn - l.moneyOut
                  return (
                    <div key={l.id} className="flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0"
                      style={{ borderColor: '#E9EFDC', opacity: l.excluded ? 0.55 : 1 }}>
                      <span className="mt-0.5 shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full"
                        style={{ background: isIn ? '#dcfce7' : '#fee2e2', color: isIn ? '#166534' : '#991b1b' }}>
                        {isIn ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--charcoal)' }} title={l.description}>{l.description}</p>
                        <p className="text-[11px] flex flex-wrap items-center gap-x-2 gap-y-0.5" style={{ color: 'var(--mid-gray)' }}>
                          {l.fromToName && <span className="truncate max-w-[260px]">{l.fromToName}</span>}
                          {l.excluded ? (
                            <span className="px-1.5 py-px rounded-full text-[10px] font-semibold" style={{ background: '#f1f5f9', color: '#475569' }}>Excluded in Bank Rec</span>
                          ) : l.status === 'POSTED' ? (
                            <span className="px-1.5 py-px rounded-full text-[10px] font-semibold" style={{ background: '#dcfce7', color: '#166534' }} title={l.matchLabel || undefined}>Recorded</span>
                          ) : (
                            <span className="px-1.5 py-px rounded-full text-[10px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>To reconcile</span>
                          )}
                          {l.matchLabel && !l.excluded && <span className="truncate max-w-[280px]" style={{ color: '#8A9AA0' }}>{l.matchLabel}</span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-[13px] font-bold tabular-nums ${l.excluded ? 'line-through' : ''}`} style={{ color: net >= 0 ? '#047857' : 'var(--charcoal)' }}>
                          {net >= 0 ? '+' : '−'}{amt(Math.abs(net))}
                        </p>
                        {!l.excluded && (
                          <p className="text-[11px] tabular-nums" style={{ color: 'var(--mid-gray)' }}
                            title={l.printed ? 'Balance printed on the bank statement' : 'Worked out from the line before; the statement printed no balance for this line'}>
                            {l.printed ? '' : '≈ '}{bal(l.balance)}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              )
            })}
            {filtered.length > shown && (
              <div className="p-3 text-center border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <button onClick={() => setShown(n => n + PAGE)} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                  Show {Math.min(PAGE, filtered.length - shown)} more of {filtered.length - shown}
                </button>
              </div>
            )}
            <p className="px-4 py-2 text-[11px] border-t" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
              {counted} line{counted === 1 ? '' : 's'} in this period. Balances are the ones printed on the bank statement; &quot;≈&quot; marks a balance worked out from the line before, where the statement printed none. Split and combined lines from Bank Rec are shown as the single line the bank listed.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
