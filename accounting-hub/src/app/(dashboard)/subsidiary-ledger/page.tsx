'use client'

/**
 * Subsidiary Ledger — the transaction breakdown behind every COA account.
 *
 * Reads /api/subsidiary-ledger and lays the result out the way a general
 * ledger report reads: accounts grouped by type, each showing its opening
 * balance, every posting in the range (with the counter-account "split") and
 * a "Total for <account>" line. Clicking a posting opens the full journal
 * entry so both sides are visible.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Loader2, ChevronRight, ChevronDown, Search, X, RotateCcw, AlertTriangle, BookOpen,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { refTypeLabel } from '@/lib/accounting/subsidiary-ledger'
import { branchLabel, POSTABLE_BRANCHES } from '@/lib/branch'
import DownloadMenu from '@/components/ui/DownloadMenu'
import { downloadXlsx, downloadPdf } from '@/lib/export'

interface SplitLine { account: string; debit: number; credit: number }

interface LedgerLine {
  id: string
  journalEntryId: string
  date: string
  refType: string
  refId: string | null
  branch: string
  description: string
  entryDescription: string
  split: string
  splitLines: SplitLine[]
  debit: number
  credit: number
  balance: number
}

interface LedgerAccount {
  accountId: string
  accountNumber: string
  accountTitle: string
  accountType: string
  subType: string | null
  normalBalance: 'DEBIT' | 'CREDIT'
  isActive: boolean
  opening: number
  debitTotal: number
  creditTotal: number
  closing: number
  lines: LedgerLine[]
  lineCount: number
  truncated: boolean
}

interface Ledger {
  range: { from: string; to: string }
  branch: string
  accounts: LedgerAccount[]
  totals: { opening: number; debit: number; credit: number; closing: number; lineCount: number }
  truncated: boolean
  limit: number
  branchLocked: boolean
}

interface AccountOption {
  id: string
  accountNumber: string
  accountTitle: string
  accountType: string
  isActive: boolean
}

const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const

const TYPE_LABEL: Record<string, string> = {
  ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Equity',
  REVENUE: 'Revenue', EXPENSE: 'Expenses',
}


const iso = (d: Date) => d.toISOString().slice(0, 10)

function monthStart(d = new Date()) {
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
}

/** Quick date presets — the ranges an accountant actually asks for. */
function presetRange(key: string): { from: string; to: string } {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  switch (key) {
    case 'thisMonth': return { from: iso(new Date(Date.UTC(y, m, 1))),     to: iso(now) }
    case 'lastMonth': return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) }
    case 'thisQuarter': {
      const q = Math.floor(m / 3) * 3
      return { from: iso(new Date(Date.UTC(y, q, 1))), to: iso(now) }
    }
    case 'thisYear':  return { from: iso(new Date(Date.UTC(y, 0, 1))),     to: iso(now) }
    case 'lastYear':  return { from: iso(new Date(Date.UTC(y - 1, 0, 1))), to: iso(new Date(Date.UTC(y - 1, 11, 31))) }
    default:          return { from: monthStart(), to: iso(now) }
  }
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })

/** Signed amounts render as plain figures; only negatives get the parenthesis treatment. */
const money = (n: number) => (n < 0 ? `(${formatCurrency(Math.abs(n))})` : formatCurrency(n))

/** Historical JE descriptions were stored with the pre-rebrand branch codes — sanitize at display time only. */
const rebrand = (s: string) => s.replace(/\bSBEA\b/g, 'AHEA').replace(/\bSBGH\b/g, 'AHGH')

export default function SubsidiaryLedgerPage() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(iso(new Date()))
  const [accountType, setAccountType] = useState('ALL')
  const [accountId, setAccountId] = useState('')
  const [branch, setBranch] = useState('ALL')
  const [refType, setRefType] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [includeEmpty, setIncludeEmpty] = useState(false)

  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [options, setOptions] = useState<{ accounts: AccountOption[]; refTypes: string[] }>({ accounts: [], refTypes: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<{ line: LedgerLine; account: LedgerAccount } | null>(null)

  // ── Data ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/subsidiary-ledger/options?includeInactive=${includeInactive}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setOptions(d) })
      .catch(() => {})
  }, [includeInactive])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams({ from, to, accountType, branch, includeInactive: String(includeInactive), includeEmpty: String(includeEmpty) })
      if (accountId) qs.set('accountIds', accountId)
      if (refType) qs.set('refType', refType)
      if (search) qs.set('search', search)
      const res = await fetch(`/api/subsidiary-ledger?${qs}`)
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || 'Failed to load the ledger')
        setLedger(null)
        return
      }
      setLedger(await res.json())
    } catch {
      setError('Failed to load the ledger')
      setLedger(null)
    } finally {
      setLoading(false)
    }
  }, [from, to, accountType, accountId, branch, refType, search, includeInactive, includeEmpty])

  useEffect(() => { load() }, [load])

  // Debounce the free-text box so typing doesn't hammer the API.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // ── Grouping ──────────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const out: Record<string, LedgerAccount[]> = { ASSET: [], LIABILITY: [], EQUITY: [], REVENUE: [], EXPENSE: [] }
    for (const a of ledger?.accounts || []) out[a.accountType]?.push(a)
    return out
  }, [ledger])

  const typeTotals = useCallback((accts: LedgerAccount[]) => accts.reduce(
    (s, a) => ({
      opening: s.opening + a.opening,
      debit:   s.debit   + a.debitTotal,
      credit:  s.credit  + a.creditTotal,
      closing: s.closing + a.closing,
    }),
    { opening: 0, debit: 0, credit: 0, closing: 0 },
  ), [])

  const toggle = (id: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const allCollapsed = (ledger?.accounts.length || 0) > 0 && collapsed.size === ledger?.accounts.length
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set((ledger?.accounts || []).map(a => a.accountId)))

  const resetFilters = () => {
    const r = presetRange('thisMonth')
    setFrom(r.from); setTo(r.to)
    setAccountType('ALL'); setAccountId(''); setBranch('ALL'); setRefType('')
    setSearchInput(''); setSearch('')
    setIncludeInactive(false); setIncludeEmpty(false)
  }

  // ── Export ────────────────────────────────────────────────────────────────
  const exportRows = useCallback(() => {
    const rows: (string | number)[][] = []
    for (const t of TYPE_ORDER) {
      for (const a of grouped[t]) {
        rows.push([`${a.accountNumber} ${a.accountTitle}`, '', '', '', 'Opening balance', '', '', '', a.opening])
        for (const l of a.lines) {
          rows.push([
            `${a.accountNumber} ${a.accountTitle}`,
            fmtDate(l.date),
            refTypeLabel(l.refType),
            l.refId || '',
            rebrand(l.description),
            l.split,
            l.debit || '',
            l.credit || '',
            l.balance,
          ])
        }
        rows.push([`Total for ${a.accountNumber} ${a.accountTitle}`, '', '', '', '', '', a.debitTotal, a.creditTotal, a.closing])
      }
    }
    return rows
  }, [grouped])

  const onDownload = (format: 'xlsx' | 'pdf') => {
    const headers = ['Account', 'Date', 'Transaction Type', 'Num', 'Memo / Description', 'Split', 'Debit', 'Credit', 'Balance']
    const title = 'Subsidiary Ledger'
    const subtitle = `${fmtDate(from)} – ${fmtDate(to)} · ${branchLabel(branch) || branch}`
    if (format === 'xlsx') {
      downloadXlsx(`subsidiary-ledger-${from}-to-${to}`, [{ name: 'Subsidiary Ledger', headers, rows: exportRows() }])
    } else {
      downloadPdf({ title, subtitle, headers, rows: exportRows(), landscape: true })
    }
  }

  const selectClass = 'text-sm px-3 py-1.5 rounded-lg border bg-white outline-none'
  const borderStyle = { borderColor: 'var(--light-gray)' }

  return (
    <div className="px-6 py-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Subsidiary Ledger</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Every transaction posted to each account, with its opening and closing balance. Filter by account type,
            account, branch or transaction type.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleAll} disabled={!ledger?.accounts.length}
            className="text-xs px-3 py-1.5 rounded-xl font-semibold border disabled:opacity-40"
            style={borderStyle}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
          <DownloadMenu onDownload={onDownload} />
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-white p-3 mb-4" style={borderStyle}>
        <div className="flex flex-wrap items-center gap-2">
          <select className={selectClass} style={borderStyle} value="" onChange={e => {
            if (!e.target.value) return
            const r = presetRange(e.target.value)
            setFrom(r.from); setTo(r.to)
          }}>
            <option value="">Quick range…</option>
            <option value="thisMonth">This month</option>
            <option value="lastMonth">Last month</option>
            <option value="thisQuarter">This quarter</option>
            <option value="thisYear">This year</option>
            <option value="lastYear">Last year</option>
          </select>

          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={selectClass} style={borderStyle} />
          <span className="text-xs text-gray-500">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={selectClass} style={borderStyle} />

          <select value={accountType} onChange={e => { setAccountType(e.target.value); setAccountId('') }} className={selectClass} style={borderStyle}>
            <option value="ALL">All account types</option>
            {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>

          <select value={accountId} onChange={e => setAccountId(e.target.value)} className={selectClass} style={borderStyle}>
            <option value="">All accounts</option>
            {options.accounts
              .filter(a => accountType === 'ALL' || a.accountType === accountType)
              .map(a => (
                <option key={a.id} value={a.id}>
                  {a.accountNumber} — {a.accountTitle}{a.isActive ? '' : ' (inactive)'}
                </option>
              ))}
          </select>

          <select value={branch} onChange={e => setBranch(e.target.value)} className={selectClass} style={borderStyle}>
            {/* 'ALL' first, matching the previous dropdown order. */}
            {['ALL', ...POSTABLE_BRANCHES.filter(v => v !== 'ALL')].map(v => <option key={v} value={v}>{branchLabel(v)}</option>)}
          </select>

          <select value={refType} onChange={e => setRefType(e.target.value)} className={selectClass} style={borderStyle}>
            <option value="">All transaction types</option>
            {options.refTypes.map(t => <option key={t} value={t}>{refTypeLabel(t)}</option>)}
          </select>

          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search memo, reference or account…" value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className={`${selectClass} pl-8 pr-7 w-64`} style={borderStyle} />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                <X size={13} />
              </button>
            )}
          </div>

          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={includeEmpty} onChange={e => setIncludeEmpty(e.target.checked)} />
            Show accounts with no activity
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />
            Include inactive accounts
          </label>

          <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {ledger && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          {[
            { label: 'Accounts', value: String(ledger.accounts.length) },
            { label: 'Transactions', value: String(ledger.totals.lineCount) },
            { label: 'Total debits', value: formatCurrency(ledger.totals.debit) },
            { label: 'Total credits', value: formatCurrency(ledger.totals.credit) },
            { label: 'Difference', value: money(ledger.totals.debit - ledger.totals.credit) },
          ].map(c => (
            <div key={c.label} className="rounded-xl border bg-white px-4 py-2.5" style={borderStyle}>
              <p className="text-[10px] uppercase tracking-widest text-gray-500">{c.label}</p>
              <p className="text-sm font-semibold font-mono mt-0.5">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {ledger?.branchLocked && (
        <div className="mb-3 px-4 py-2 rounded-lg text-xs bg-blue-50 text-blue-900">
          Your account is scoped to {branchLabel(ledger.branch) || ledger.branch} — the ledger shows that branch only.
        </div>
      )}

      {ledger?.truncated && (
        <div className="mb-3 px-4 py-2 rounded-lg text-xs bg-amber-50 text-amber-900 flex items-center gap-2">
          <AlertTriangle size={14} />
          Showing the first {ledger.limit.toLocaleString()} of {ledger.totals.lineCount.toLocaleString()} transactions.
          Account totals below are still complete — narrow the date range or pick one account to see every line.
        </div>
      )}

      {error && <div className="mb-3 px-4 py-2 rounded-lg text-sm bg-red-50 text-red-800">{error}</div>}

      {/* Ledger */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-teal-600" size={22} /></div>
      ) : !ledger || ledger.accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen size={28} className="text-gray-300 mb-2" />
          <p className="text-sm text-gray-600">No accounts with activity in this range.</p>
          <p className="text-xs text-gray-400 mt-1">Widen the dates, or tick &ldquo;Show accounts with no activity&rdquo;.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {TYPE_ORDER.map(t => {
            const accts = grouped[t]
            if (!accts.length) return null
            const tt = typeTotals(accts)
            return (
              <div key={t} className="border rounded-xl overflow-hidden bg-white" style={borderStyle}>
                <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: 'var(--deep-teal)' }}>
                  <span className="text-sm font-semibold text-white" style={{ fontFamily: 'var(--font-display)' }}>{TYPE_LABEL[t]}</span>
                  <span className="text-[11px] font-mono text-white/80">
                    DR {formatCurrency(tt.debit)} · CR {formatCurrency(tt.credit)} · Closing {money(tt.closing)}
                  </span>
                </div>

                {accts.map(a => {
                  const isOpen = !collapsed.has(a.accountId)
                  return (
                    <div key={a.accountId} className="border-t" style={borderStyle}>
                      {/* Account header */}
                      <button onClick={() => toggle(a.accountId)}
                        className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 text-left">
                        <span className="flex items-center gap-2 min-w-0">
                          {isOpen ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                          <span className="font-mono text-xs text-gray-500 shrink-0">{a.accountNumber}</span>
                          <span className="text-sm font-medium truncate">{a.accountTitle}</span>
                          {!a.isActive && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">INACTIVE</span>}
                          <span className="text-[10px] text-gray-400 shrink-0">{a.lineCount} txn{a.lineCount === 1 ? '' : 's'}</span>
                        </span>
                        <span className="text-xs font-mono text-gray-600 shrink-0 pl-3">{money(a.closing)}</span>
                      </button>

                      {isOpen && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="text-[10px] uppercase tracking-wider text-gray-500 bg-gray-50">
                              <tr>
                                <th className="text-left px-4 py-1.5 w-28">Date</th>
                                <th className="text-left px-3 py-1.5 w-44">Transaction Type</th>
                                <th className="text-left px-3 py-1.5 w-32">Num</th>
                                <th className="text-left px-3 py-1.5">Memo / Description</th>
                                <th className="text-left px-3 py-1.5 w-56">Split</th>
                                <th className="text-right px-3 py-1.5 w-32">Debit</th>
                                <th className="text-right px-3 py-1.5 w-32">Credit</th>
                                <th className="text-right px-4 py-1.5 w-36">Balance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* Opening balance */}
                              <tr className="border-t" style={borderStyle}>
                                <td className="px-4 py-1.5 text-xs text-gray-500" colSpan={5}>
                                  Opening balance as of {fmtDate(from)}
                                </td>
                                <td /><td />
                                <td className="px-4 py-1.5 text-right font-mono text-xs text-gray-600">{money(a.opening)}</td>
                              </tr>

                              {a.lines.map(l => (
                                <tr key={l.id}
                                  onClick={() => setDetail({ line: l, account: a })}
                                  className="border-t cursor-pointer hover:bg-teal-50/40"
                                  style={borderStyle}>
                                  <td className="px-4 py-1.5 text-xs whitespace-nowrap">{fmtDate(l.date)}</td>
                                  <td className="px-3 py-1.5 text-xs">{refTypeLabel(l.refType)}</td>
                                  <td className="px-3 py-1.5 font-mono text-[11px] text-gray-500 truncate max-w-[8rem]" title={l.refId || ''}>{l.refId || '—'}</td>
                                  <td className="px-3 py-1.5 text-xs" title={rebrand(l.entryDescription)}>{rebrand(l.description)}</td>
                                  <td className="px-3 py-1.5 text-xs text-gray-500 truncate max-w-[14rem]" title={l.splitLines.map(s => s.account).join(', ')}>{l.split}</td>
                                  <td className="px-3 py-1.5 text-right font-mono text-xs">{l.debit ? formatCurrency(l.debit) : ''}</td>
                                  <td className="px-3 py-1.5 text-right font-mono text-xs">{l.credit ? formatCurrency(l.credit) : ''}</td>
                                  <td className="px-4 py-1.5 text-right font-mono text-xs">{money(l.balance)}</td>
                                </tr>
                              ))}

                              {a.truncated && (
                                <tr className="border-t" style={borderStyle}>
                                  <td colSpan={8} className="px-4 py-1.5 text-[11px] text-amber-800 bg-amber-50">
                                    {a.lineCount - a.lines.length} further transaction{a.lineCount - a.lines.length === 1 ? '' : 's'} not shown — the totals below still include them.
                                  </td>
                                </tr>
                              )}

                              {/* Total for account */}
                              <tr className="border-t font-semibold bg-gray-50" style={borderStyle}>
                                <td className="px-4 py-1.5 text-xs" colSpan={5}>Total for {a.accountNumber} {a.accountTitle}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-xs">{formatCurrency(a.debitTotal)}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-xs">{formatCurrency(a.creditTotal)}</td>
                                <td className="px-4 py-1.5 text-right font-mono text-xs">{money(a.closing)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Grand total */}
          <div className="rounded-xl border bg-white px-4 py-3 flex items-center justify-between" style={borderStyle}>
            <span className="text-sm font-semibold">Total — all filtered accounts</span>
            <span className="text-xs font-mono text-gray-700">
              Debits {formatCurrency(ledger.totals.debit)} · Credits {formatCurrency(ledger.totals.credit)} ·
              Difference {money(ledger.totals.debit - ledger.totals.credit)}
            </span>
          </div>
        </div>
      )}

      {/* Journal-entry drill-down */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b flex items-center justify-between" style={borderStyle}>
              <div>
                <h2 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                  {refTypeLabel(detail.line.refType)}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {fmtDate(detail.line.date)} · {branchLabel(detail.line.branch) || detail.line.branch}
                  {detail.line.refId ? ` · Ref ${detail.line.refId}` : ''}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="px-5 py-3">
              <p className="text-sm mb-3">{rebrand(detail.line.entryDescription)}</p>
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="text-left py-1.5">Account</th>
                    <th className="text-right py-1.5 w-32">Debit</th>
                    <th className="text-right py-1.5 w-32">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t" style={borderStyle}>
                    <td className="py-1.5 font-medium">
                      {detail.account.accountNumber} {detail.account.accountTitle}
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>THIS ACCOUNT</span>
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs">{detail.line.debit ? formatCurrency(detail.line.debit) : ''}</td>
                    <td className="py-1.5 text-right font-mono text-xs">{detail.line.credit ? formatCurrency(detail.line.credit) : ''}</td>
                  </tr>
                  {detail.line.splitLines.map((s, i) => (
                    <tr key={i} className="border-t" style={borderStyle}>
                      <td className="py-1.5">{s.account}</td>
                      <td className="py-1.5 text-right font-mono text-xs">{s.debit ? formatCurrency(s.debit) : ''}</td>
                      <td className="py-1.5 text-right font-mono text-xs">{s.credit ? formatCurrency(s.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail.line.description !== detail.line.entryDescription && (
                <p className="text-xs text-gray-500 mt-3">Line memo: {rebrand(detail.line.description)}</p>
              )}
              <p className="text-[10px] text-gray-400 mt-3 font-mono">Journal entry {detail.line.journalEntryId}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
