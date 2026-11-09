'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { toChequeInput } from '@/lib/cheque-number'
import { useSession } from 'next-auth/react'
import { Repeat, Plus, Settings, Loader2, X, Eye, Pencil, Trash2, ListChecks, Info, ArrowLeftRight, ChevronRight} from 'lucide-react'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'
import { ScanUpload } from '@/components/ScanUpload'
import ForexPanel from './ForexPanel'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn, type StatTone } from '@/components/ui/hr-look'
import { SFH_STYLE } from './hr-bits'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Bank { id: string; accountNumber: string; accountTitle: string; currency: string; isCheckingAccount?: boolean }
interface Transfer { id: string; matchedLegs?: number; refNumber: string; date: string; fromAccountId: string; toAccountId: string; fromLabel: string; toLabel: string; amount: number; checkNumber: string | null; description: string | null; proofUrl: string | null; proofUrls?: string[] | null }

// Bank Reconciliation match state of a transfer, from how many bank lines are linked to it.
type LegState = 'both' | 'one' | 'none' | 'multi'
const LEG_KEYS: LegState[] = ['both', 'one', 'none', 'multi']
const LEG_STATES: Record<LegState, { label: string; short: string; hint: string; accent: { line: string; bg?: string; fg?: string }; pill: { bg: string; fg: string } }> = {
  both:  { label: 'Both legs matched', short: 'Both legs', hint: 'reconciled', accent: { line: '#ca8a04', bg: '#fefce8', fg: '#a16207' }, pill: { bg: '#fef9c3', fg: '#854d0e' } },
  one:   { label: 'One leg matched', short: 'One leg', hint: 'other leg pending', accent: { line: '#d97706', fg: '#b45309' }, pill: { bg: '#fef3c7', fg: '#92400e' } },
  none:  { label: 'Not matched', short: 'Not matched', hint: 'no bank line yet', accent: { line: '#94a3b8', fg: '#475569' }, pill: { bg: '#f1f5f9', fg: '#475569' } },
  multi: { label: '3+ bank lines', short: '3+ lines', hint: 'more than two lines linked', accent: { line: '#2563eb', fg: '#1d4ed8' }, pill: { bg: '#eff6ff', fg: '#1d4ed8' } },
}
const legStateOf = (t: { matchedLegs?: number }): LegState => { const n = t.matchedLegs ?? 0; return n === 2 ? 'both' : n === 1 ? 'one' : n === 0 ? 'none' : 'multi' }

export default function FundTransferPage() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user?.role as string) || '')

  const [banks, setBanks] = useState<Bank[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Transfer | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [view, setView] = useState<'transfers' | 'forex' | 'checks'>('transfers')

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [filters, setFilters] = useState<Record<string, string>>({})
  const toggleSort = (k: string) => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const cols = [
    { key: 'refNumber', label: 'Reference Number' }, { key: 'date', label: 'Date of Transaction' }, { key: 'fromLabel', label: 'From' },
    { key: 'toLabel', label: 'To' }, { key: 'amount', label: 'Amount' }, { key: 'checkNumber', label: 'Check Number' },
    { key: 'description', label: 'Description / Purpose' }, { key: 'proof', label: 'Proof', plain: true },
  ]
  const get = (t: Transfer, k: string): string | number =>
    k === 'amount' ? t.amount : k === 'proof' ? '' : ((t[k as keyof Transfer] as string | number) ?? '')
  const [legFilter, setLegFilter] = useState<LegState | ''>('')
  const shown = applySortFilter(legFilter ? transfers.filter(t => legStateOf(t) === legFilter) : transfers, get, sort.key, sort.dir, filters)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [b, t] = await Promise.all([fetch('/api/bank-accounts'), fetch('/api/fund-transfers')])
      setBanks(b.ok ? await b.json() : [])
      setTransfers(t.ok ? await t.json() : [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const remove = async (t: Transfer) => { if (!confirm(`Delete ${t.refNumber}?`)) return; await fetch(`/api/fund-transfers?id=${t.id}`, { method: 'DELETE' }); await load() }

  // Bank-rec match state per transfer (same rule as the row colours): every transfer is in exactly one.
  const legState = legStateOf
  const byLeg = LEG_KEYS.map(k => { const rs = transfers.filter(t => legState(t) === k); return { k, n: rs.length, total: rs.reduce((s, t) => s + t.amount, 0) } })
  const shownTotal = shown.reduce((s, t) => s + t.amount, 0)

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      <style>{SFH_STYLE}</style>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <Repeat size={22} style={{ color: 'var(--teal)' }} /> Fund Transfer
          </h1>
          <p className="mt-1 text-[13px] max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
            Money moved between the company&apos;s own bank accounts, currency purchases, and every cheque released from a checking account.
          </p>
        </div>
        {view === 'transfers' && canWrite && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => setShowSettings(true)} className={hrBtn.outline} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}><Settings size={14} /> Settings</button>
            <button onClick={() => { setEditing(null); setShowForm(true) }} className={hrBtn.primary} style={{ background: 'var(--teal)' }}><Plus size={15} /> New transfer</button>
          </div>
        )}
      </div>

      {/* Sub-section tabs */}
      <div className="border-b-2" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex items-end -mb-[2px] max-w-full overflow-x-auto" role="tablist">
          {([['transfers', 'Fund Transfers', Repeat], ['forex', 'Foreign Exchange', ArrowLeftRight], ['checks', 'Check Release Monitoring', ListChecks]] as const).map(([v, label, Icon]) => (
            <button key={v} onClick={() => setView(v)} role="tab" aria-selected={view === v}
              className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 whitespace-nowrap transition-colors hover:text-[var(--teal)]"
              style={{ fontFamily: 'var(--font-display)', borderColor: view === v ? 'var(--teal)' : 'transparent', color: view === v ? 'var(--teal)' : 'var(--mid-gray)' }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'checks' ? <CheckReleaseMonitoring canWrite={canWrite} />
        : view === 'forex' ? <ForexPanel banks={banks} canWrite={canWrite} /> : (<>

      <div className="rounded-lg border px-4 py-2.5 text-[13px] flex items-start gap-2" style={{ borderColor: '#bfdbfe', borderLeft: '4px solid #2563eb', background: '#eff6ff', color: '#1e3a8a' }}>
        <Info size={15} className="mt-0.5 flex-shrink-0" />
        <span>Record the transaction under the branch that is the <strong>RECEIVER</strong> of the fund transfer.</span>
      </div>

      {banks.length === 0 && !loading && (
        <div className="rounded-lg border px-4 py-2.5 text-[13px]" style={{ borderColor: '#fde68a', borderLeft: '4px solid #d97706', background: '#fffbeb', color: '#92400e' }}>
          No bank accounts yet. In <strong>Chart of Accounts</strong>, add/edit a Current-Asset account and tick <strong>&quot;Is this a bank account?&quot;</strong> to make it selectable here.
        </div>
      )}

      {/* Bank Reconciliation match state — the four cards cover every transfer once */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {byLeg.map(({ k, n, total }) => {
          const s = LEG_STATES[k]
          return (
            <StatCard key={k} compact loading={loading} label={s.label} value={`₱${peso(total)}`}
              sub={`${n} transfer${n === 1 ? '' : 's'} · ${s.hint}`}
              accent={n ? s.accent : undefined} tone="zero"
              active={legFilter === k} onClick={() => setLegFilter(f => f === k ? '' : k)} />
          )
        })}
      </div>

      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <span className="text-[13px] font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Transfers</span>
          {legFilter && (
            <button onClick={() => setLegFilter('')} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold"
              style={{ background: LEG_STATES[legFilter].pill.bg, color: LEG_STATES[legFilter].pill.fg }}>
              {LEG_STATES[legFilter].label} <X size={12} />
            </button>
          )}
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{shown.length} of {transfers.length} · <span className="font-mono">₱{peso(shownTotal)}</span></span>
          <div className="ml-auto hidden md:flex items-center gap-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            {LEG_KEYS.map(k => <span key={k} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: LEG_STATES[k].accent.line }} />{LEG_STATES[k].short}</span>)}
          </div>
        </div>
        <div className="overflow-auto hr-sfh">
          <table className="w-full text-sm">
            <SortFilterHead cols={cols} sortKey={sort.key} sortDir={sort.dir} filters={filters} onToggleSort={toggleSort} onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))} trailing={canWrite} />
            <tbody>
              {loading ? (
                [0, 1, 2, 3].map(i => <tr key={i} className="border-t" style={{ borderColor: 'var(--hr-line)' }}><td colSpan={9} className="px-4 py-2.5"><div className="h-5 rounded hr-shimmer" /></td></tr>)
              ) : shown.map(t => {
                // A star was too easy to miss, so the whole row carries the state:
                // solid yellow when both bank legs are matched, a paler wash when
                // only one is, nothing at all when the transfer is untagged.
                const legs = t.matchedLegs ?? 0
                const rowBg = legs === 2 ? '#fef9c3' : legs === 1 ? '#fefce8' : undefined
                return (
                <tr key={t.id} className="border-t transition-colors hover:brightness-[0.985]" style={{ borderColor: 'var(--hr-line)', background: rowBg }}
                  title={legs === 2 ? 'Both bank legs matched in Bank Reconciliation'
                    : legs === 1 ? 'One of two bank legs matched in Bank Reconciliation' : undefined}>
                  <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)', boxShadow: `inset 4px 0 0 ${LEG_STATES[legState(t)].accent.line}` }}>
                    {legs > 0 && (
                      <span style={{ color: legs === 2 ? '#ca8a04' : '#d4d4d8', marginRight: 4 }}>★</span>
                    )}
                    {t.refNumber}
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{t.date}</td>
                  <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{t.fromLabel}</td>
                  <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{t.toLabel}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(t.amount)}</td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{t.checkNumber || ''}</td>
                  <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{t.description || ''}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(t.proofUrls && t.proofUrls.length ? t.proofUrls : (t.proofUrl ? [t.proofUrl] : [])).map((url, i) => (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-white text-[11px] font-semibold hover:border-[var(--teal)]" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>
                      ))}
                    </div>
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => { setEditing(t); setShowForm(true) }} title="Edit" aria-label={`Edit ${t.refNumber}`} className="p-1.5 rounded hover:bg-[var(--pale-teal)] mr-0.5"><Pencil size={13} style={{ color: 'var(--teal)' }} /></button>
                      <button onClick={() => remove(t)} title="Delete" aria-label={`Delete ${t.refNumber}`} className="p-1.5 rounded hover:bg-red-50"><Trash2 size={13} style={{ color: '#dc2626' }} /></button>
                    </td>
                  )}
                </tr>
              )})}
              {!loading && shown.length === 0 && <tr><td colSpan={9} className="text-center py-12 text-[13px]" style={{ color: 'var(--mid-gray)' }}>{transfers.length === 0 ? 'No fund transfers yet.' : 'No transfers match the current filters.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      </>)}

      {showForm && <TransferForm banks={banks} editing={editing} onClose={() => setShowForm(false)} onSaved={async () => { setShowForm(false); await load() }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

interface CheckRow { id?: string; kind?: 'PETTY_CASH' | 'RFP' | 'FUND_TRANSFER' | 'CANCELLED'; source: string; checkNumber: string; date: string | null; amount: number; reference: string; payee: string; bankAccount: string; proofUrls?: string[]
  /** Entry paid through an RFP in the same cheque — shown as breakdown, already inside the RFP line's amount. */
  viaRfp?: boolean
  /** The expense lines that made up this cheque. Empty when the cheque is one record. */
  items?: CheckRow[]
  /** Sum of those lines, when the cheque also exists in the chequebook register. */
  recordedTotal?: number
  /** True when the recorded lines do not add up to the cheque as written. */
  mismatch?: boolean
  registerStatus?: string
  /** True when bank reconciliation has matched a bank line to this cheque. */
  cleared?: boolean
  clearedOn?: string | null }

// Bank Rec state of a cheque — the same words as the Bank Rec column.
type ChkState = 'matched' | 'notMatched' | 'cancelled' | 'unused'
const CHK_KEYS: ChkState[] = ['matched', 'notMatched', 'cancelled', 'unused']
const CHK_STATES: Record<ChkState, { text: string; label: string; hint: string; tone: StatTone; line: string; pill: { bg: string; fg: string } }> = {
  matched:    { text: 'Matched', label: 'Cleared', hint: 'matched in Bank Rec', tone: 'green', line: '#059669', pill: { bg: '#dcfce7', fg: '#15803d' } },
  notMatched: { text: 'Not matched', label: 'Not matched', hint: 'no bank line tagged', tone: 'amber', line: '#d97706', pill: { bg: '#ffedd5', fg: '#c2410c' } },
  cancelled:  { text: 'Cancelled', label: 'Cancelled', hint: 'never cleared', tone: 'red', line: '#dc2626', pill: { bg: '#fee2e2', fg: '#b91c1c' } },
  unused:     { text: 'Unused', label: 'Unused leaves', hint: 'blank', tone: 'zero', line: '#cbd5e1', pill: { bg: '#f1f5f9', fg: '#475569' } },
}
const chkKeyOf = (text: string): ChkState => (CHK_KEYS.find(k => CHK_STATES[k].text === text) || 'notMatched')

function CheckReleaseMonitoring({ canWrite }: { canWrite: boolean }) {
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([])
  const [accountId, setAccountId] = useState('all')
  const [checks, setChecks] = useState<CheckRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCancel, setShowCancel] = useState(false)
  // Which grouped cheques are opened to show the lines that make them up.
  const [openCheque, setOpenCheque] = useState<Set<string>>(new Set())
  const toggleCheque = (k: string) => setOpenCheque(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'checkNumber', dir: 'asc' })
  // Correcting a mistyped cheque number writes back to whichever record produced the
  // row, so the source, its RFP and the ledger all read the same number.
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [savingChk, setSavingChk] = useState(false)

  const startEdit = (c: CheckRow) => { setEditing(`${c.kind}:${c.id}`); setDraft(c.checkNumber) }
  const saveCheckNumber = async (c: CheckRow) => {
    const next = draft.trim()
    if (!next || next === c.checkNumber) { setEditing(null); return }
    setSavingChk(true)
    try {
      const r = await fetch('/api/fund-transfers/checks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: c.kind, id: c.id, checkNumber: next }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Could not update the cheque number'); return }
      setEditing(null)
      await load()
    } catch { alert('Network error') }
    finally { setSavingChk(false) }
  }
  const [filters, setFilters] = useState<Record<string, string>>({})
  const toggleSort = (k: string) => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const cols = [
    { key: 'checkNumber', label: 'Check No.' }, { key: 'date', label: 'Date' }, { key: 'source', label: 'Source' },
    { key: 'reference', label: 'Reference' }, { key: 'payee', label: 'Payee / Description' },
    { key: 'bankAccount', label: 'Bank Account' }, { key: 'cleared', label: 'Bank Rec' }, { key: 'amount', label: 'Amount' },
  ]
  // The Bank Rec column filters on the words you would actually type, not on a
  // raw boolean — "not cleared" is how the state is read aloud.
  const clearedText = (c: CheckRow): string =>
    (c.source === 'Cancelled' || c.registerStatus === 'CANCELLED') ? 'Cancelled'
      : c.registerStatus === 'UNUSED' ? 'Unused'
      : c.cleared ? 'Matched' : 'Not matched'
  const get = (c: CheckRow, k: string): string | number =>
    k === 'amount' ? c.amount
      : k === 'cleared' ? clearedText(c)
      : ((c[k as keyof CheckRow] as string | number) ?? '')
  const [chkFilter, setChkFilter] = useState<ChkState | ''>('')
  const shown = applySortFilter(chkFilter ? checks.filter(c => chkKeyOf(clearedText(c)) === chkFilter) : checks, get, sort.key, sort.dir, filters)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/fund-transfers/checks?accountId=${encodeURIComponent(accountId)}`)
      const d = r.ok ? await r.json() : { checks: [], accounts: [] }
      setChecks(d.checks || [])
      setAccounts(d.accounts || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [accountId])
  useEffect(() => { load() }, [load])

  const total = shown.reduce((s, c) => s + c.amount, 0)
  const srcColor: Record<string, string> = { 'Petty Cash': '#0f766e', Expense: '#b45309', 'RFP / Tax': '#7c3aed', 'Fund Transfer': '#2563eb', Cancelled: '#dc2626' }

  const removeCancelled = async (id: string) => {
    if (!confirm('Remove this cancelled-check record?')) return
    await fetch(`/api/fund-transfers/checks?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="space-y-4">
      {/* Bank Rec state of every cheque for the chosen account(s) — each cheque counts once */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {CHK_KEYS.map(k => {
          const s = CHK_STATES[k]
          const rs = checks.filter(c => clearedText(c) === s.text)
          const amt = rs.reduce((sum, c) => sum + c.amount, 0)
          return (
            <StatCard key={k} compact loading={loading} label={s.label} value={k === 'unused' ? String(rs.length) : `₱${peso(amt)}`}
              sub={k === 'unused' ? 'blank leaves in the register' : `${rs.length} cheque${rs.length === 1 ? '' : 's'} · ${s.hint}`}
              tone={rs.length ? s.tone : 'zero'}
              active={chkFilter === k} onClick={() => setChkFilter(f => f === k ? '' : k)} />
          )
        })}
      </div>

      {accounts.length === 0 && !loading && (
        <div className="rounded-lg border px-4 py-2.5 text-[13px]" style={{ borderColor: '#fde68a', borderLeft: '4px solid #d97706', background: '#fffbeb', color: '#92400e' }}>
          No checking accounts yet. In <strong>Chart of Accounts</strong>, edit a bank account and tick <strong>&quot;Is this a checking account?&quot;</strong>.
        </div>
      )}

      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <label htmlFor="chk-account" className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Checking account</label>
          <select id="chk-account" value={accountId} onChange={e => setAccountId(e.target.value)} className="h-8 px-2.5 rounded-lg border text-xs bg-white max-w-full" style={{ borderColor: 'var(--light-gray)', minWidth: 220 }}>
            <option value="all">All checking accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {chkFilter && (
            <button onClick={() => setChkFilter('')} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold"
              style={{ background: CHK_STATES[chkFilter].pill.bg, color: CHK_STATES[chkFilter].pill.fg }}>
              {CHK_STATES[chkFilter].label} <X size={12} />
            </button>
          )}
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{shown.length} check(s) · Total <span className="font-mono">₱{peso(total)}</span></span>
          {canWrite && accounts.length > 0 && (
            <button onClick={() => setShowCancel(true)} className={`${hrBtn.ghost} ml-auto`} style={{ borderColor: '#fecaca', color: '#b91c1c' }}>
              <Plus size={13} /> Record cancelled check
            </button>
          )}
        </div>
        <div className="overflow-auto hr-sfh">
        <table className="w-full text-sm">
          <SortFilterHead cols={cols} sortKey={sort.key} sortDir={sort.dir} filters={filters} onToggleSort={toggleSort} onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))} trailing={canWrite} />
          <tbody>
            {loading ? (
              [0, 1, 2, 3].map(k => <tr key={k} className="border-t" style={{ borderColor: 'var(--hr-line)' }}><td colSpan={9} className="px-4 py-2.5"><div className="h-5 rounded hr-shimmer" /></td></tr>)
            ) : shown.map((c, i) => {
              const isCancelled = c.source === 'Cancelled' || c.registerStatus === 'CANCELLED'
              const isUnused = c.registerStatus === 'UNUSED'
              const parts = c.items || []
              const key = `${c.checkNumber}|${c.bankAccount}`
              const isOpen = openCheque.has(key)
              return (
              <Fragment key={`${c.source}-${c.reference}-${c.checkNumber}-${i}`}>
              <tr className="border-t" style={{ borderColor: 'var(--hr-line)', background: isCancelled ? '#fef2f2' : isUnused ? '#f8fafc' : c.mismatch ? '#fffbeb' : undefined }}>
                <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)', textDecoration: isCancelled ? 'line-through' : undefined, boxShadow: `inset 4px 0 0 ${CHK_STATES[chkKeyOf(clearedText(c))].line}` }}>
                  {parts.length > 1 && (
                    <button onClick={() => toggleCheque(key)} className="mr-1.5 align-middle" title={isOpen ? 'Hide the lines under this cheque' : `Show the ${parts.length} lines under this cheque`}>
                      <ChevronRight size={13} style={{ color: 'var(--mid-gray)', transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform .12s' }} />
                    </button>
                  )}
                  {editing === `${c.kind}:${c.id}` ? (
                    <span className="inline-flex items-center gap-1">
                      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveCheckNumber(c); if (e.key === 'Escape') setEditing(null) }}
                        className="px-2 py-1 rounded border text-xs font-mono w-44 outline-none" style={{ borderColor: 'var(--teal)' }} />
                      <button onClick={() => saveCheckNumber(c)} disabled={savingChk} className="text-[11px] font-semibold px-1.5 py-1 rounded disabled:opacity-50" style={{ color: 'var(--teal)' }}>Save</button>
                      <button onClick={() => setEditing(null)} className="text-[11px] px-1 py-1 rounded" style={{ color: 'var(--mid-gray)' }}>Cancel</button>
                    </span>
                  ) : c.checkNumber}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{c.date || ''}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap"><span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: (srcColor[c.source] || '#64748b') + '1a', color: srcColor[c.source] || '#64748b' }}>{c.source}</span></td>
                <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--charcoal)' }}>{c.reference}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>
                  {c.payee}
                  {c.proofUrls && c.proofUrls.length > 0 && (
                    <span className="inline-flex flex-wrap gap-1.5 ml-1 align-middle">
                      {c.proofUrls.map((u, k) => (
                        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5" style={{ color: 'var(--teal)' }} title="View scanned check"><Eye size={11} /> {c.proofUrls!.length > 1 ? k + 1 : ''}</a>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{c.bankAccount}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {/* A cancelled or unused leaf was never going to clear, so asking
                      whether it did would be noise. */}
                  {isCancelled ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#fee2e2', color: '#b91c1c' }}>Cancelled</span>
                  ) : isUnused ? (
                    <span className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>—</span>
                  ) : c.cleared ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#dcfce7', color: '#15803d' }}
                      title={c.clearedOn ? `Matched in Bank Reconciliation — cleared the bank ${c.clearedOn}` : 'Matched in Bank Reconciliation'}>
                      Cleared{c.clearedOn ? ` ${c.clearedOn}` : ''}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#ffedd5', color: '#c2410c' }}
                      title="Nothing in Bank Reconciliation is matched to this cheque, so the hub cannot show it leaving the account. Either it has not cleared, or the bank line exists but has not been tagged to it yet.">
                      Not matched
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap" style={{ color: isUnused ? 'var(--mid-gray)' : 'var(--charcoal)' }}>
                  {isUnused ? '—' : `₱${peso(c.amount)}`}
                  {c.mismatch && c.recordedTotal !== undefined && (
                    <span className="block text-[10px] font-normal" style={{ color: '#b45309' }}
                      title="What the cheque was written for, against what the recorded expenses add up to">
                      recorded ₱{peso(c.recordedTotal)}
                    </span>
                  )}
                </td>
                {canWrite && <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {c.id && c.kind && editing !== `${c.kind}:${c.id}` && (
                    <button onClick={() => startEdit(c)} className="p-1 rounded hover:bg-gray-100" title="Correct the cheque number — updates the source record and everything that reads from it">
                      <Pencil size={13} style={{ color: 'var(--teal)' }} />
                    </button>
                  )}
                  {isCancelled && c.id && <button onClick={() => removeCancelled(c.id!)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} style={{ color: '#dc2626' }} /></button>}
                </td>}
              </tr>
              {isOpen && parts.map((p, j) => (
                <tr key={`${key}-part-${j}`} className="border-t" style={{ borderColor: 'var(--hr-line)', background: '#fbfbfa' }}>
                  <td className="px-3 py-1.5 text-[11px]" style={{ color: 'var(--mid-gray)', paddingLeft: '2.5rem' }}>↳ {j + 1} of {parts.length}</td>
                  <td className="px-3 py-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>{p.date || ''}</td>
                  <td className="px-3 py-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>{p.source}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono" style={{ color: 'var(--charcoal)' }}>{p.reference}</td>
                  <td className="px-3 py-1.5 text-[11px]" style={{ color: 'var(--charcoal)' }}>{p.payee}</td>
                  <td></td>
                  <td></td>
                  <td className="px-3 py-1.5 text-right text-[11px] font-semibold whitespace-nowrap" style={{ color: p.viaRfp ? 'var(--mid-gray)' : 'var(--charcoal)' }}>
                    ₱{peso(p.amount)}
                    {p.viaRfp && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: '#e0e7ff', color: '#3730a3' }}
                        title="Paid through the RFP on this cheque — this amount is already inside the RFP line, so it is not added to the cheque total again.">
                        in RFP
                      </span>
                    )}
                  </td>
                  {canWrite && <td></td>}
                </tr>
              ))}
              </Fragment>
            )})}
            {!loading && shown.length === 0 && accounts.length > 0 && <tr><td colSpan={9} className="text-center py-12 text-[13px]" style={{ color: 'var(--mid-gray)' }}>{checks.length === 0 ? 'No checks recorded for the selected checking account(s).' : 'No checks match the current filters.'}</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {showCancel && <CancelledCheckModal accounts={accounts} defaultAccountId={accountId !== 'all' ? accountId : ''} onClose={() => setShowCancel(false)} onSaved={async () => { setShowCancel(false); await load() }} />}
    </div>
  )
}

function CancelledCheckModal({ accounts, defaultAccountId, onClose, onSaved }: { accounts: { id: string; label: string }[]; defaultAccountId: string; onClose: () => void; onSaved: () => void }) {
  const [accountId, setAccountId] = useState(defaultAccountId || (accounts[0]?.id ?? ''))
  const [checkNumber, setCheckNumber] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [payee, setPayee] = useState('')
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!accountId || !checkNumber.trim() || !date) { alert('Checking account, check number and date are required.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/fund-transfers/checks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, checkNumber, date, payee, reason, amount: Number(amount) || 0, proofUrls }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border shadow-xl p-6 w-full max-w-md max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Record Cancelled Check</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Checking Account</label>
        <select value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select account…</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Check Number</label>
        <input value={checkNumber} onChange={e => setCheckNumber(toChequeInput(e.target.value))} inputMode="numeric" placeholder="Numbers only — leading zeros preserved" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Date Cancelled</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Payee (optional)</label>
        <input value={payee} onChange={e => setPayee(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Reason (optional)</label>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. spoiled, wrong amount, reissued" className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Amount (optional)</label>
        <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Scanned check <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(you can add more than one)</span></label>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {proofUrls.map((u, i) => (
            <span key={u} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
              <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> Scan {i + 1}</a>
              <button onClick={() => setProofUrls(p => p.filter(x => x !== u))}><X size={12} style={{ color: '#dc2626' }} /></button>
            </span>
          ))}
          <ScanUpload compact section="fund-transfer" prefix={`CANCELLED-${checkNumber || 'check'}`}
            existingCount={proofUrls.length} label="Add scan" onUploaded={url => setProofUrls(p => [...p, url])} />
        </div>
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#dc2626' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Record cancelled check'}</button>
      </div>
    </div>
  )
}

function TransferForm({ banks, editing, onClose, onSaved }: { banks: Bank[]; editing: Transfer | null; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(editing?.date || new Date().toISOString().slice(0, 10))
  const [fromAccountId, setFrom] = useState(editing?.fromAccountId || '')
  const [toAccountId, setTo] = useState(editing?.toAccountId || '')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [checkNumber, setCheckNumber] = useState(editing?.checkNumber || '')
  const [description, setDescription] = useState(editing?.description || '')
  const [proofUrls, setProofUrls] = useState<string[]>(editing?.proofUrls?.length ? editing.proofUrls : (editing?.proofUrl ? [editing.proofUrl] : []))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!date || !fromAccountId || !toAccountId) { alert('Date, From and To are required.'); return }
    if (fromAccountId === toAccountId) { alert('From and To must differ.'); return }
    if (!(Number(amount) > 0)) { alert('Enter a valid amount.'); return }
    setBusy(true)
    try {
      const body = { date, fromAccountId, toAccountId, amount: Number(amount), checkNumber, description, proofUrls }
      const res = editing
        ? await fetch('/api/fund-transfers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...body }) })
        : await fetch('/api/fund-transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { alert((await res.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border shadow-xl p-6 w-full max-w-md max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{editing ? `Edit ${editing.refNumber}` : 'New Fund Transfer'}</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Date of Transaction</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>From (bank account)</label>
        <select value={fromAccountId} onChange={e => setFrom(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select account…</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}
        </select>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>To (bank account)</label>
        <select value={toAccountId} onChange={e => setTo(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select account…</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}
        </select>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Amount</label>
        <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Check Number</label>
        <input value={checkNumber} onChange={e => setCheckNumber(toChequeInput(e.target.value))} inputMode="numeric" placeholder="Numbers only — leading zeros preserved" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Description / Purpose</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Proof (you can add multiple)</label>
        <div className="space-y-1 mb-2">
          {proofUrls.map((url, i) => (
            <div key={url} className="flex items-center gap-2 text-xs">
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> Proof {i + 1}</a>
              <button onClick={() => setProofUrls(prev => prev.filter(u => u !== url))} className="text-[11px]" style={{ color: '#dc2626' }}><X size={12} className="inline" /></button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-4">
          <ScanUpload section="fund-transfer" prefix={`FT-${checkNumber || date}`} existingCount={proofUrls.length}
            label={proofUrls.length ? 'Add another' : 'Upload'} onUploaded={url => setProofUrls(prev => [...prev, url])} />
        </div>
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : (editing ? 'Save changes' : 'Save transfer')}</button>
      </div>
    </div>
  )
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [nextSeq, setNextSeq] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { fetch('/api/fund-transfers/settings').then(r => r.ok ? r.json() : { nextSeq: 1 }).then(d => setNextSeq(String(d.nextSeq))).catch(() => {}) }, [])
  const save = async () => {
    const n = parseInt(nextSeq, 10); if (isNaN(n) || n < 1) { alert('Enter a valid number (≥ 1).'); return }
    setBusy(true)
    try { const r = await fetch('/api/fund-transfers/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextSeq: n }) }); if (r.ok) onClose(); else alert((await r.json()).error || 'Failed') } finally { setBusy(false) }
  }
  const yy = new Date().getFullYear() % 100
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Fund Transfer Settings</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Next reference number</label>
        <p className="text-[11px] mb-2" style={{ color: 'var(--mid-gray)' }}>The next transfer will be numbered FT{yy}-{String(parseInt(nextSeq || '1', 10) || 1).padStart(6, '0')}.</p>
        <input value={nextSeq} onChange={e => setNextSeq(e.target.value.replace(/[^0-9]/g, ''))} className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-4" style={{ borderColor: 'var(--light-gray)' }} />
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Save'}</button>
      </div>
    </div>
  )
}
