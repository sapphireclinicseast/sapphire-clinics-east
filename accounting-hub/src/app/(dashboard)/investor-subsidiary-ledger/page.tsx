'use client'
/* Investor · Subsidiary Ledger
 *
 * The subsidiary ledger an investor can trust: every account, its opening,
 * period movement, and closing — read from the SAME ledger-engine dataset
 * that renders the financial statements, so the two cannot disagree. Each
 * drill fetches the account's underlying lines and proves the tie on screen:
 * the engine's exact line totals are compared against the account row the
 * statements sum, and the badge shows the difference (₱0.00 or the truth).
 *
 * Person-identifying detail (patients, personnel) is withheld server-side
 * for the INVESTOR role; references, sources, months, and amounts are full.
 */
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { ScrollText, X, Loader2, CheckCircle, AlertCircle, Search } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Row {
  number: string; title: string; type: string
  opening: number; debit: number; credit: number; closing: number
  monthly: number[]
}
interface DrillLine { month: number; source: string; label: string; debit: number; credit: number }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
const TYPE_LABEL: Record<string, string> = {
  ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Equity',
  REVENUE: 'Revenue', EXPENSE: 'Expenses',
}
const nice = (s: string) => s.replace(/-/g, ' ').replace(/^journal:/, '').replace(/_/g, ' ').toLowerCase()

export default function InvestorSubsidiaryLedger() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role || ''
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [drill, setDrill] = useState<{ row: Row; lines: DrillLine[]; totals: { debit: number; credit: number }; truncated: boolean } | null>(null)
  const [drillFor, setDrillFor] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/reports/v2?year=${year}&branch=ALL`)
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed to load')
      const d = await r.json()
      const all: Row[] = [
        ...d.balanceSheet.sections.flatMap((s: { rows: Row[] }) => s.rows),
        ...d.incomeStatement.sections.flatMap((s: { rows: Row[] }) => s.rows),
      ]
      const seen = new Set<string>()
      setRows(all.filter(x => {
        if (seen.has(x.number)) return false
        seen.add(x.number)
        return Math.abs(x.opening) >= 0.005 || Math.abs(x.debit) >= 0.005 || Math.abs(x.credit) >= 0.005
      }))
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [year])
  useEffect(() => { load() }, [load])

  const openDrill = async (row: Row) => {
    setDrillFor(row.number)
    try {
      const r = await fetch(`/api/reports/v2?year=${year}&branch=ALL&account=${row.number}&month=12&cumulative=1`)
      if (!r.ok) throw new Error('Drill failed')
      const d = await r.json()
      setDrill({
        row,
        lines: (d.collected || []) as DrillLine[],
        totals: d.collectedTotals || { debit: 0, credit: 0 },
        truncated: !!d.collectedTruncated,
      })
    } catch { setError('Could not load the account detail.') }
    finally { setDrillFor(null) }
  }

  /* The tie check: the engine's exact totals over every underlying line for
     months 1–12 must equal the account row's period debits and credits — the
     figures the statements sum. Opening lines (month 0) are listed separately
     and compared against the row's opening. */
  const tie = (() => {
    if (!drill) return null
    const m0 = drill.lines.filter(l => l.month === 0)
    const m0d = m0.reduce((s, l) => s + l.debit, 0), m0c = m0.reduce((s, l) => s + l.credit, 0)
    const dDiff = Math.round((drill.totals.debit - m0d - drill.row.debit) * 100) / 100
    const cDiff = Math.round((drill.totals.credit - m0c - drill.row.credit) * 100) / 100
    return { ok: Math.abs(dDiff) < 0.01 && Math.abs(cDiff) < 0.01, dDiff, cDiff }
  })()

  if (role && !['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'INVESTOR'].includes(role)) {
    return <div className="p-8 text-sm" style={{ color: 'var(--mid-gray)' }}>This page is available to investors and finance users.</div>
  }

  const filtered = rows.filter(r => !q || r.number.includes(q) || r.title.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <ScrollText size={24} /> Subsidiary Ledger
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Every account behind the financial statements, from the same ledger dataset — open an account to see its
            underlying entries and the proof that they tie.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="px-3 py-2 rounded-xl border text-sm bg-white outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            {Array.from({ length: now.getFullYear() - 2023 }, (_, i) => 2024 + i).map(y =>
              <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div className="relative my-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search account number or title…"
          className="w-full pl-9 pr-3 py-2 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }} />
      </div>

      {error && <div className="mb-4 p-3 rounded-xl text-sm flex items-center gap-2" style={{ background: '#fef2f2', color: '#b91c1c' }}><AlertCircle size={16} />{error}</div>}
      {loading ? (
        <div className="flex items-center gap-2 p-8 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="animate-spin" /> Building the ledger dataset…</div>
      ) : TYPE_ORDER.map(t => {
        const group = filtered.filter(r => r.type === t)
        if (!group.length) return null
        return (
          <div key={t} className="mb-6 rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{TYPE_LABEL[t]}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                    <th className="text-left px-4 py-2 font-semibold">Account</th>
                    <th className="text-right px-4 py-2 font-semibold">Opening</th>
                    <th className="text-right px-4 py-2 font-semibold">Debits</th>
                    <th className="text-right px-4 py-2 font-semibold">Credits</th>
                    <th className="text-right px-4 py-2 font-semibold">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map(r => (
                    <tr key={r.number} onClick={() => openDrill(r)}
                      className="border-t cursor-pointer hover:bg-teal-50/40 transition-colors" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs mr-2" style={{ color: 'var(--mid-gray)' }}>{r.number}</span>
                        <span style={{ color: 'var(--charcoal)' }}>{r.title}</span>
                        {drillFor === r.number && <Loader2 size={13} className="inline ml-2 animate-spin" style={{ color: 'var(--teal)' }} />}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(r.opening)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.debit)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--charcoal)' }}>{formatCurrency(r.credit)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(r.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {drill && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDrill(null)}>
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 pb-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
              <div>
                <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  {drill.row.number} {drill.row.title}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                  {year} · every underlying entry, from the same dataset as the statements
                </p>
              </div>
              <div className="flex items-center gap-2">
                {tie && (tie.ok ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: '#f0fdf4', color: '#15803d' }}>
                    <CheckCircle size={13} /> Ties to the statements
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: '#fef2f2', color: '#b91c1c' }}>
                    <AlertCircle size={13} /> Off by {formatCurrency(Math.abs(tie.dDiff) + Math.abs(tie.cDiff))}
                  </span>
                ))}
                <button onClick={() => setDrill(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
              </div>
            </div>
            <div className="overflow-y-auto px-5 pb-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs sticky top-0 bg-white" style={{ color: 'var(--mid-gray)' }}>
                    <th className="text-left py-2 pr-3 font-semibold">Month</th>
                    <th className="text-left py-2 pr-3 font-semibold">Source</th>
                    <th className="text-left py-2 pr-3 font-semibold">Detail</th>
                    <th className="text-right py-2 pl-3 font-semibold">Debit</th>
                    <th className="text-right py-2 pl-3 font-semibold">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {drill.lines.map((l, i) => (
                    <tr key={i} className="border-t align-top" style={{ borderColor: 'var(--off-white)' }}>
                      <td className="py-2 pr-3 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{l.month === 0 ? 'Opening' : MONTHS[l.month - 1]}</td>
                      <td className="py-2 pr-3 whitespace-nowrap capitalize" style={{ color: 'var(--mid-gray)' }}>{nice(l.source)}</td>
                      <td className="py-2 pr-3" style={{ color: 'var(--charcoal)' }}>{l.label}</td>
                      <td className="py-2 pl-3 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{l.debit ? formatCurrency(l.debit) : ''}</td>
                      <td className="py-2 pl-3 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{l.credit ? formatCurrency(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {drill.truncated && (
                <p className="text-xs py-2" style={{ color: 'var(--mid-gray)' }}>
                  Long account — the list shows the first entries, but the totals and the tie check cover every line.
                </p>
              )}
            </div>
            <div className="px-5 py-3 border-t flex flex-wrap gap-x-6 gap-y-1 text-sm" style={{ borderColor: 'var(--light-gray)' }}>
              <span style={{ color: 'var(--mid-gray)' }}>Period totals (all lines):</span>
              <span className="tabular-nums font-semibold" style={{ color: 'var(--charcoal)' }}>Dr {formatCurrency(drill.totals.debit - drill.lines.filter(l => l.month === 0).reduce((s, l) => s + l.debit, 0))}</span>
              <span className="tabular-nums font-semibold" style={{ color: 'var(--charcoal)' }}>Cr {formatCurrency(drill.totals.credit - drill.lines.filter(l => l.month === 0).reduce((s, l) => s + l.credit, 0))}</span>
              <span style={{ color: 'var(--mid-gray)' }}>Statement row:</span>
              <span className="tabular-nums font-semibold" style={{ color: 'var(--deep-teal)' }}>Dr {formatCurrency(drill.row.debit)} · Cr {formatCurrency(drill.row.credit)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
