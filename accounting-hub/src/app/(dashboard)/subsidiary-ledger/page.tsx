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
  ChevronRight, ChevronDown, Search, X, RotateCcw, AlertTriangle, BookOpen,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { refTypeLabel } from '@/lib/accounting/subsidiary-ledger'
import { branchLabel, POSTABLE_BRANCHES } from '@/lib/branch'
import DownloadMenu from '@/components/ui/DownloadMenu'
import { downloadXlsx, downloadPdf } from '@/lib/export'
import { AccountPicker, type PickableAccount } from '@/components/AccountPicker'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'

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

// HR Hub look: one colour per account type (same as the Chart of Accounts).
const TYPE_LINE: Record<string, string> = {
  ASSET: '#3b82f6', LIABILITY: '#db2777', EQUITY: '#9333ea', REVENUE: '#059669', EXPENSE: '#d97706',
}
const TYPE_PILL: Record<string, { background: string; color: string }> = {
  ASSET: { background: '#dbeafe', color: '#1e40af' }, LIABILITY: { background: '#fce7f3', color: '#9d174d' },
  EQUITY: { background: '#f3e8ff', color: '#6b21a8' }, REVENUE: { background: '#dcfce7', color: '#166534' },
  EXPENSE: { background: '#fef3c7', color: '#92400e' },
}
const PRESETS = [
  { key: 'thisMonth', label: 'This month' }, { key: 'lastMonth', label: 'Last month' },
  { key: 'thisQuarter', label: 'This quarter' }, { key: 'thisYear', label: 'This year' }, { key: 'lastYear', label: 'Last year' },
]


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

  // ── Render ────────────────────────────────────────────────────────────────
  const inputCls = 'h-9 px-2.5 rounded-lg border bg-white text-[13px] outline-none focus:border-[var(--teal)]'
  const inputStyle = { borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }
  const activePreset = PRESETS.find(p => { const r = presetRange(p.key); return r.from === from && r.to === to })?.key
  const diff = ledger ? ledger.totals.debit - ledger.totals.credit : 0
  const balanced = Math.abs(diff) < 0.005
  const rangeLabel = `${fmtDate(from)} – ${fmtDate(to)}`
  const pickerAccounts: PickableAccount[] = options.accounts
    .filter(a => accountType === 'ALL' || a.accountType === accountType)
    .map(a => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.isActive ? a.accountTitle : `${a.accountTitle} (inactive)`, accountType: a.accountType }))
  const pillBtn = (on: boolean) => ({
    className: 'h-8 px-3 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors',
    style: on
      ? { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff' }
      : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' },
  })

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Subsidiary Ledger</h1>
          <p className="mt-1 text-[13px] max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
            Every transaction posted to each account, with its opening and closing balance. Click a line to see the whole journal entry.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={toggleAll} disabled={!ledger?.accounts.length} className={`${hrBtn.ghost} h-9`}
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            {allCollapsed ? <><ChevronDown size={14} /> Expand all</> : <><ChevronRight size={14} /> Collapse all</>}
          </button>
          <DownloadMenu onDownload={onDownload} />
        </div>
      </div>

      {/* Range + filters */}
      <section className="rounded-lg border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-[.5px] mr-1" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>Range</span>
          {PRESETS.map(p => {
            const b = pillBtn(activePreset === p.key)
            return (
              <button key={p.key} onClick={() => { const r = presetRange(p.key); setFrom(r.from); setTo(r.to) }} aria-pressed={activePreset === p.key}
                className={b.className} style={b.style}>{p.label}</button>
            )
          })}
          <div className="flex items-center gap-1.5 sm:ml-auto">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="From" className={inputCls} style={inputStyle} />
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="To" className={inputCls} style={inputStyle} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t rounded-b-lg" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <label className="flex items-center gap-1.5 h-9 px-3 w-full sm:w-72 rounded-lg border bg-white focus-within:border-[var(--teal)] focus-within:shadow-[0_0_0_3px_rgba(74,128,115,0.12)]"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--hr-faint)' }}>
            <Search size={15} className="flex-shrink-0" />
            <input type="text" placeholder="Search memo, reference or account…" value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" style={{ color: 'var(--charcoal)' }} />
            {searchInput && <button onClick={() => setSearchInput('')} title="Clear search"><X size={14} /></button>}
          </label>

          <select value={accountType} onChange={e => { setAccountType(e.target.value); setAccountId('') }} className={inputCls}
            style={{ ...inputStyle, borderColor: accountType !== 'ALL' ? 'var(--teal)' : 'var(--light-gray)' }}>
            <option value="ALL">All account types</option>
            {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>

          <div className="w-full sm:w-72">
            <AccountPicker accounts={pickerAccounts} value={accountId} valueKey="id"
              onChange={v => setAccountId(v)} clearLabel="All accounts"
              placeholder="All accounts — type a number or name…"
              className="w-full h-9 px-2.5 rounded-lg border text-[13px]" />
          </div>

          <select value={branch} onChange={e => setBranch(e.target.value)} className={inputCls}
            style={{ ...inputStyle, borderColor: branch !== 'ALL' ? 'var(--teal)' : 'var(--light-gray)' }}>
            {/* 'ALL' first, matching the previous dropdown order. */}
            {['ALL', ...POSTABLE_BRANCHES.filter(v => v !== 'ALL')].map(v => <option key={v} value={v}>{branchLabel(v)}</option>)}
          </select>

          <select value={refType} onChange={e => setRefType(e.target.value)} className={inputCls}
            style={{ ...inputStyle, borderColor: refType ? 'var(--teal)' : 'var(--light-gray)' }}>
            <option value="">All transaction types</option>
            {options.refTypes.map(t => <option key={t} value={t}>{refTypeLabel(t)}</option>)}
          </select>

          {(() => { const b = pillBtn(includeEmpty); return (
            <button onClick={() => setIncludeEmpty(v => !v)} aria-pressed={includeEmpty} className={b.className} style={b.style}
              title="Also list accounts with no postings in the range">No-activity accounts</button>
          ) })()}
          {(() => { const b = pillBtn(includeInactive); return (
            <button onClick={() => setIncludeInactive(v => !v)} aria-pressed={includeInactive} className={b.className} style={b.style}
              title="Also list accounts switched off in the Chart of Accounts">Inactive accounts</button>
          ) })()}

          <button onClick={resetFilters} className="flex items-center gap-1 text-xs font-semibold px-1.5 h-8 hover:underline underline-offset-2" style={{ color: 'var(--teal)' }}>
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </section>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-[0.8fr_0.8fr_1.2fr_1.2fr_1.2fr] gap-3">
        <StatCard loading={loading} label="Accounts" value={String(ledger?.accounts.length ?? 0)}
          sub={includeEmpty ? 'Including ones with no activity' : 'With activity in the range'} accent={{ line: 'var(--teal)' }} />
        <StatCard loading={loading} label="Transactions" value={(ledger?.totals.lineCount ?? 0).toLocaleString()}
          sub={ledger?.truncated ? `First ${ledger.limit.toLocaleString()} listed below` : rangeLabel}
          tone={ledger?.truncated ? 'amber' : undefined} accent={ledger?.truncated ? undefined : { line: 'var(--teal)' }} />
        <StatCard loading={loading} compact label="Total debits" value={formatCurrency(ledger?.totals.debit ?? 0)} sub={rangeLabel} accent={{ line: '#3b82f6' }} />
        <StatCard loading={loading} compact label="Total credits" value={formatCurrency(ledger?.totals.credit ?? 0)} sub={rangeLabel} accent={{ line: '#9333ea' }} />
        <StatCard loading={loading} compact label="Difference" value={money(diff)}
          sub={balanced ? 'Debits equal credits' : 'Debits − credits for these filters'}
          tone={balanced ? 'green' : 'zero'} accent={balanced ? undefined : { line: 'var(--light-gray)' }} />
      </div>

      {ledger?.branchLocked && (
        <div className="px-4 py-2.5 rounded-lg border text-[13px]" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a' }}>
          Your account is scoped to {branchLabel(ledger.branch) || ledger.branch} — the ledger shows that branch only.
        </div>
      )}

      {ledger?.truncated && !loading && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg border text-[13px]" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          <span>
            Showing the first {ledger.limit.toLocaleString()} of {ledger.totals.lineCount.toLocaleString()} transactions.
            Account totals below are still complete — narrow the date range or pick one account to see every line.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-[13px]" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Ledger */}
      {loading ? (
        <section className="rounded-lg border bg-white p-4 space-y-2" style={{ borderColor: 'var(--light-gray)' }} aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-10 rounded-md hr-shimmer" />)}
        </section>
      ) : !ledger || ledger.accounts.length === 0 ? (
        <section className="rounded-lg border bg-white px-6 py-14 flex flex-col items-center text-center" style={{ borderColor: 'var(--light-gray)' }}>
          <span className="mb-2.5 flex w-11 h-11 items-center justify-center rounded-full" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
            <BookOpen size={20} />
          </span>
          <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>No accounts with activity in this range</p>
          <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Widen the dates, or list the accounts with no activity too.</p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {!includeEmpty && (
              <button onClick={() => setIncludeEmpty(true)} className={hrBtn.outline} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>Show no-activity accounts</button>
            )}
            <button onClick={resetFilters} className={hrBtn.outline} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Reset filters</button>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {TYPE_ORDER.map(t => {
            const accts = grouped[t]
            if (!accts.length) return null
            const tt = typeTotals(accts)
            return (
              <section key={t} className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                {/* Type header */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 border-b"
                  style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)', boxShadow: `inset 4px 0 0 ${TYPE_LINE[t]}` }}>
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-[.5px]" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{TYPE_LABEL[t]}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={TYPE_PILL[t]}>
                      {accts.length} account{accts.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums" style={{ color: 'var(--mid-gray)' }}>
                    <span>Debits <strong className="font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(tt.debit)}</strong></span>
                    <span>Credits <strong className="font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(tt.credit)}</strong></span>
                    <span>Closing <strong className="font-semibold" style={{ color: 'var(--charcoal)' }}>{money(tt.closing)}</strong></span>
                  </span>
                </div>

                {accts.map(a => {
                  const isOpen = !collapsed.has(a.accountId)
                  return (
                    <div key={a.accountId} className="border-b last:border-b-0" style={{ borderColor: 'var(--light-gray)' }}>
                      {/* Account header */}
                      <button onClick={() => toggle(a.accountId)} aria-expanded={isOpen}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#fafbf7]">
                        <ChevronDown size={15} className={`flex-shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} style={{ color: 'var(--mid-gray)' }} />
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                          <span className="font-mono text-[12.5px] font-semibold" style={{ color: 'var(--charcoal)' }}>{a.accountNumber}</span>
                          <span className="text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>{a.accountTitle}</span>
                          {!a.isActive && <span className="px-1.5 py-px rounded text-[10.5px] font-semibold" style={{ background: '#f1f5f2', color: '#55616A' }}>Inactive</span>}
                          <span className="px-1.5 py-px rounded-full text-[10.5px] font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                            {a.lineCount.toLocaleString()} txn{a.lineCount === 1 ? '' : 's'}
                          </span>
                        </span>
                        <span className="ml-auto flex items-center gap-4 pl-3 text-xs tabular-nums whitespace-nowrap">
                          <span className="hidden md:inline" style={{ color: 'var(--hr-faint)' }}>Opening {money(a.opening)}</span>
                          <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{money(a.closing)}</span>
                        </span>
                      </button>

                      {isOpen && (
                        <div className="overflow-x-auto border-t" style={{ borderColor: 'var(--hr-line)' }}>
                          <table className="w-full min-w-[900px] text-[13px]" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: 'var(--hr-head)' }}>
                                {([
                                  ['Date', 'text-left pl-11 pr-3 w-32'], ['Transaction type', 'text-left px-3 w-40'], ['Num', 'text-left px-3 w-24'],
                                  ['Memo / description', 'text-left px-3'], ['Split', 'text-left px-3 w-52'],
                                  ['Debit', 'text-right px-3 w-28'], ['Credit', 'text-right px-3 w-28'], ['Balance', 'text-right px-4 w-32'],
                                ] as const).map(([h, cls]) => (
                                  <th key={h} className={`${cls} py-2 text-[11px] font-bold uppercase tracking-[.5px] whitespace-nowrap border-b`}
                                    style={{ color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {/* Opening balance */}
                              <tr className="border-b" style={{ borderColor: 'var(--hr-line)' }}>
                                <td className="pl-11 pr-3 py-2 text-xs italic" style={{ color: 'var(--mid-gray)' }} colSpan={5}>
                                  Opening balance as of {fmtDate(from)}
                                </td>
                                <td /><td />
                                <td className="px-4 py-2 text-right font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>{money(a.opening)}</td>
                              </tr>

                              {a.lines.map(l => (
                                <tr key={l.id}
                                  onClick={() => setDetail({ line: l, account: a })}
                                  className="border-b cursor-pointer transition-colors hover:bg-[#f3f8ea]"
                                  style={{ borderColor: 'var(--hr-line)' }}
                                  title="Open the whole journal entry">
                                  <td className="pl-11 pr-3 py-2 text-xs whitespace-nowrap tabular-nums" style={{ color: 'var(--charcoal)' }}>{fmtDate(l.date)}</td>
                                  <td className="px-3 py-2">
                                    <span className="inline-block max-w-full truncate px-2 py-px rounded-full text-[11px] font-semibold align-middle" style={{ background: '#f1f5f2', color: '#475569' }}>
                                      {refTypeLabel(l.refType)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 font-mono text-[11px] truncate max-w-[6rem]" style={{ color: 'var(--hr-faint)' }} title={l.refId || ''}>{l.refId || '—'}</td>
                                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--charcoal)' }} title={rebrand(l.entryDescription)}>{rebrand(l.description)}</td>
                                  <td className="px-3 py-2 text-xs truncate max-w-[13rem]" style={{ color: 'var(--mid-gray)' }} title={l.splitLines.map(s => s.account).join(', ')}>{l.split}</td>
                                  <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{l.debit ? formatCurrency(l.debit) : ''}</td>
                                  <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{l.credit ? formatCurrency(l.credit) : ''}</td>
                                  <td className="px-4 py-2 text-right font-mono text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>{money(l.balance)}</td>
                                </tr>
                              ))}

                              {a.truncated && (
                                <tr className="border-b" style={{ borderColor: 'var(--hr-line)' }}>
                                  <td colSpan={8} className="pl-11 pr-4 py-2 text-[11px]" style={{ background: '#fffbeb', color: '#92400e' }}>
                                    {a.lineCount - a.lines.length} further transaction{a.lineCount - a.lines.length === 1 ? '' : 's'} not shown — the totals below still include them.
                                  </td>
                                </tr>
                              )}

                              {/* Total for account */}
                              <tr style={{ background: 'var(--hr-head)' }}>
                                <td className="pl-11 pr-3 py-2 text-xs font-bold" style={{ color: 'var(--charcoal)' }} colSpan={5}>Total for {a.accountNumber} {a.accountTitle}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(a.debitTotal)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(a.creditTotal)}</td>
                                <td className="px-4 py-2 text-right font-mono text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{money(a.closing)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </section>
            )
          })}

          {/* Grand total */}
          <section className="rounded-lg border bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
            style={{ borderColor: 'var(--light-gray)', boxShadow: `inset 4px 0 0 ${balanced ? '#059669' : 'var(--light-gray)'}` }}>
            <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Total — all filtered accounts</span>
            <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums" style={{ color: 'var(--mid-gray)' }}>
              <span>Debits <strong className="font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(ledger.totals.debit)}</strong></span>
              <span>Credits <strong className="font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(ledger.totals.credit)}</strong></span>
              <span>Difference <strong className="font-semibold" style={{ color: balanced ? '#047857' : 'var(--charcoal)' }}>{money(diff)}</strong></span>
            </span>
          </section>
        </div>
      )}

      {/* Journal-entry drill-down */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.15)]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-start justify-between gap-3" style={{ borderColor: 'var(--light-gray)' }}>
              <div>
                <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  {refTypeLabel(detail.line.refType)}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                  {fmtDate(detail.line.date)} · {branchLabel(detail.line.branch) || detail.line.branch}
                  {detail.line.refId ? ` · Ref ${detail.line.refId}` : ''}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1 rounded-lg hover:bg-[var(--off-white)]" title="Close">
                <X size={18} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>

            <div className="px-5 py-4">
              <p className="text-sm mb-3" style={{ color: 'var(--charcoal)' }}>{rebrand(detail.line.entryDescription)}</p>
              <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--hr-head)' }}>
                    {([['Account', 'text-left px-3'], ['Debit', 'text-right px-3 w-32'], ['Credit', 'text-right px-3 w-32']] as const).map(([h, cls]) => (
                      <th key={h} className={`${cls} py-2 text-[11px] font-bold uppercase tracking-[.5px] border-b`} style={{ color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b" style={{ borderColor: 'var(--hr-line)', background: '#f8fbf1' }}>
                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>
                      {detail.account.accountNumber} {detail.account.accountTitle}
                      <span className="ml-2 px-1.5 py-px rounded text-[10.5px] font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>This account</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{detail.line.debit ? formatCurrency(detail.line.debit) : ''}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{detail.line.credit ? formatCurrency(detail.line.credit) : ''}</td>
                  </tr>
                  {detail.line.splitLines.map((s, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: 'var(--hr-line)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{s.account}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{s.debit ? formatCurrency(s.debit) : ''}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{s.credit ? formatCurrency(s.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail.line.description !== detail.line.entryDescription && (
                <p className="text-xs mt-3" style={{ color: 'var(--mid-gray)' }}>Line memo: {rebrand(detail.line.description)}</p>
              )}
              <p className="text-[10px] mt-3 font-mono" style={{ color: 'var(--hr-faint)' }}>Journal entry {detail.line.journalEntryId}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
