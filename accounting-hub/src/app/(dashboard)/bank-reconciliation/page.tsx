'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { SortFilterHead, applySortFilter, type SortCol } from '@/components/SortFilterHead'
import { branchForBankAccount, branchLabel } from '@/lib/branch'
import { ArrowLeftRight, Upload, Plus, Loader2, X, Search, Check, Link2, Ban, RotateCcw, Trash2, Download, Lock, Unlock, Wallet, Wand2, Save, HandCoins } from 'lucide-react'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const GRID_COLS: SortCol[] = [
  { key: 'date', label: 'Date' }, { key: 'description', label: 'Bank Description' },
  { key: 'spent', label: 'Spent' }, { key: 'received', label: 'Received' },
  { key: 'fromTo', label: 'From/To' }, { key: 'match', label: 'Match / Categorise' },
]

// Sort value per column. Dates and amounts are returned as numbers so they order
// by magnitude rather than as text ("9" before "10").
const cellValue = (t: Txn, key: string): string | number => {
  switch (key) {
    case 'date': return +new Date(t.date)
    case 'description': return t.description || ''
    case 'spent': return t.spent || 0
    case 'received': return t.received || 0
    case 'fromTo': return t.fromToName || ''
    case 'match': return t.matchLabel || t.categoryLabel || ''
    default: return ''
  }
}

// What a typed filter matches against: the text as displayed, so "2026-06"
// filters dates and "1,454" filters an amount the way it is shown.
const cellText = (t: Txn, key: string): string => {
  switch (key) {
    case 'date': return t.date
    case 'spent': return t.spent > 0 ? peso(t.spent) : ''
    case 'received': return t.received > 0 ? peso(t.received) : ''
    default: return String(cellValue(t, key))
  }
}

interface BankAcct { id: string; accountNumber: string; accountTitle: string; currency: string; pendingCount: number; postedCount: number; excludedCount: number; archivedCount: number; beginningBalance: number; startDate: string | null; postedBalance: number; statementBalance: number; fxRate: number | null; fxRateDate: string | null; postedBalancePhp: number | null }
interface Txn { id: string; date: string; description: string; spent: number; received: number; status: string; fromToName: string | null; categoryAccountId: string | null; categoryLabel: string | null; matchType: string | null; matchId: string | null; matchLabel: string | null; note: string | null; proofUrl: string | null }
interface Coa { id: string; accountNumber: string; accountTitle: string }
interface Match { type: string; id: string; label: string; date: string; amount: number; modeId?: string; posPaymentIds?: string[]; details?: string[]; partial?: boolean; partOf?: boolean }
interface FxMatch { id: string; label: string; date: string; amount: number; currency: string; rate: number | null }
interface Hint { kind: string; label: string; amount: number; date: string; n: number }
interface UntaggedGroup { type: string; label: string; count: number; total: number; truncated: boolean; items: { id: string; label: string; date: string; amount: number; dir: string }[] }
interface ForexAcct { id: string; accountNumber: string; accountTitle: string; currency: string; isForexAccount: boolean }
interface FxRate { id: string; currency: string; date: string; phpPerUnit: number; source: string; note: string | null }
interface ImportBatch { id: string; fileName: string | null; createdAt: string; createdBy: string | null; total: number; pending: number; posted: number; archived: number; from: string | null; to: string | null }

export default function BankReconciliationPage() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user?.role as string) || '')
  const isAdmin = (session?.user?.role as string) === 'ADMIN'

  const [accounts, setAccounts] = useState<BankAcct[]>([])
  const [showFT, setShowFT] = useState(false)
  // Set when the transfer modal is opened from a single line rather than the toolbar.
  const [ftFor, setFtFor] = useState<Txn | null>(null)
  const [sel, setSel] = useState('')
  const [tab, setTab] = useState<'PENDING' | 'POSTED' | 'EXCLUDED' | 'ARCHIVED'>('PENDING')
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [coa, setCoa] = useState<Coa[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [matchFor, setMatchFor] = useState<Txn | null>(null)
  const [imports, setImports] = useState<ImportBatch[]>([])
  const [hints, setHints] = useState<Record<string, Hint>>({})
  const [autoRules, setAutoRules] = useState<Record<string, { ruleId: string; label: string }>>({})
  const [autoPosting, setAutoPosting] = useState<string | null>(null)
  const [showImports, setShowImports] = useState(false)
  const [rates, setRates] = useState<FxRate[]>([])
  const [showForexCfg, setShowForexCfg] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [catFor, setCatFor] = useState<Txn | null>(null)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [onlyHinted, setOnlyHinted] = useState(false)

  const account = accounts.find(a => a.id === sel) || null
  const cur = account && account.currency !== 'PHP' ? account.currency : ''
  const money = (n: number) => (cur ? `${cur} ${peso(n)}` : `₱${peso(n)}`)

  const sorted = useMemo(
    () => applySortFilter(txns, cellValue, sortKey, sortDir, filters, cellText),
    [txns, sortKey, sortDir, filters],
  )
  const visible = useMemo(
    () => (onlyHinted ? sorted.filter(t => hints[t.id]) : sorted),
    [sorted, onlyHinted, hints],
  )
  const hintCount = useMemo(() => sorted.filter(t => hints[t.id]).length, [sorted, hints])
  const toggleSort = (k: string) => {
    // Same column flips direction; a new column starts descending for dates and
    // amounts (most recent / largest first) and ascending for text.
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(['date', 'spent', 'received'].includes(k) ? 'desc' : 'asc') }
  }
  const setFilter = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }))
  const activeFilters = Object.values(filters).filter(Boolean).length

  const loadAccounts = useCallback(async () => {
    try { const r = await fetch('/api/bank-rec/accounts'); const d = r.ok ? await r.json() : []; setAccounts(d); setSel(prev => (prev && d.find((a: BankAcct) => a.id === prev)) ? prev : (d[0]?.id || '')) } catch { setAccounts([]) }
  }, [])
  useEffect(() => { loadAccounts() }, [loadAccounts])
  useEffect(() => { fetch('/api/chart-of-accounts?pageSize=1000').then(r => r.ok ? r.json() : { data: [] }).then(d => setCoa((d.data || []).map((a: Coa) => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle })))).catch(() => {}) }, [])

  const loadTxns = useCallback(async () => {
    if (!sel) { setTxns([]); return }
    setLoading(true)
    try { const r = await fetch(`/api/bank-rec/transactions?bankAccountId=${sel}&status=${tab}&search=${encodeURIComponent(search)}`); setTxns(r.ok ? await r.json() : []) } catch { setTxns([]) } finally { setLoading(false) }
  }, [sel, tab, search])
  useEffect(() => { loadTxns() }, [loadTxns])

  const loadImports = useCallback(async () => {
    if (!sel) { setImports([]); return }
    try { const r = await fetch(`/api/bank-rec/imports?bankAccountId=${sel}`); setImports(r.ok ? await r.json() : []) } catch { setImports([]) }
  }, [sel])
  useEffect(() => { loadImports() }, [loadImports])

  // Which rows look like something the Hub already recorded. Advisory only —
  // nothing is posted from this; it just says where to look first.
  const loadHints = useCallback(async () => {
    if (!sel) { setHints({}); return }
    try {
      const r = await fetch(`/api/bank-rec/match-hints?bankAccountId=${sel}&status=${tab}`)
      const d = r.ok ? await r.json() : {}
      setHints(d.hints || {})
      setAutoRules(d.autoRules || {})
    } catch { setHints({}) }
  }, [sel, tab])
  useEffect(() => { loadHints() }, [loadHints])

  const foreignCur = account && account.currency !== 'PHP' ? account.currency : ''
  const loadRates = useCallback(async () => {
    if (!foreignCur) { setRates([]); return }
    try { const r = await fetch(`/api/bank-rec/rates?currency=${foreignCur}`); setRates(r.ok ? await r.json() : []) } catch { setRates([]) }
  }, [foreignCur])
  useEffect(() => { loadRates() }, [loadRates])
  const addRate = async () => {
    const date = prompt(`Rate date (YYYY-MM-DD) for ${foreignCur}:`, new Date().toISOString().slice(0, 10))
    if (!date) return
    const v = prompt(`PHP for 1 ${foreignCur} on ${date}:`, '')
    if (!v || !(Number(v) > 0)) return
    const r = await fetch('/api/bank-rec/rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currency: foreignCur, date, phpPerUnit: Number(v) }) })
    if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
    await Promise.all([loadRates(), loadAccounts()])
  }
  const delRate = async (id: string) => {
    if (!confirm('Remove this rate?\n\nLines already posted keep the rate they were posted at.')) return
    await fetch(`/api/bank-rec/rates?id=${id}`, { method: 'DELETE' })
    await Promise.all([loadRates(), loadAccounts()])
  }

  const refreshAll = async () => { await Promise.all([loadAccounts(), loadTxns(), loadImports(), loadHints()]) }
  const deleteBatch = async (b: ImportBatch, force = false) => {
    if (!force && !confirm(`Delete this upload?\n\n${b.fileName || 'Upload'} — ${b.total} line(s)${b.from ? `, ${b.from} to ${b.to}` : ''}.\n\nEvery line it created is removed from this account.`)) return
    const r = await fetch(`/api/bank-rec/imports?id=${b.id}${force ? '&force=1' : ''}`, { method: 'DELETE' })
    const d = await r.json()
    if (!r.ok) {
      if (d.needsForce && confirm(`${d.error}\n\nDelete them anyway?`)) return deleteBatch(b, true)
      if (!d.needsForce) alert(d.error || 'Failed')
      return
    }
    alert(`Deleted ${d.deleted} line(s).`)
    await refreshAll()
  }
  // The petty cash accounts are the only ones where a withdrawal is not a
  // payment — it is the branch officer drawing the float into cash.
  const isPettyCashAccount = /petty cash/i.test(account?.accountTitle || '')
  const act = async (body: Record<string, unknown>) => { const r = await fetch('/api/bank-rec/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) { alert((await r.json()).error || 'Failed'); return } await refreshAll() }
  const del = async (id: string) => { if (!confirm('Delete this bank line?')) return; await fetch(`/api/bank-rec/transactions?id=${id}`, { method: 'DELETE' }); await refreshAll() }
  const lockOlder = async () => {
    if (!account?.startDate) return
    if (!confirm(`Lock every untagged bank line dated before ${account.startDate}?\n\nThey stay on file but can no longer be matched or categorised. Already-posted lines are not affected.`)) return
    const r = await fetch('/api/bank-rec/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lock-older', bankAccountId: account.id }) })
    const d = await r.json()
    if (!r.ok) { alert(d.error || 'Failed'); return }
    alert(`Locked ${d.archived} line(s) dated before ${d.cutoff}.`)
    await refreshAll()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <ArrowLeftRight size={22} style={{ color: 'var(--teal)' }} /> Bank transactions
        </h1>
        {canWrite && sel && (
          <div className="flex items-center gap-2">

            <button onClick={async () => {
              if (!confirm('Match pending money-in lines against day settlement batches (per payment mode, net of fees, T+0..5 banking days)?')) return
              const r = await fetch('/api/bank-rec/settle-match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
              const d = await r.json()
              if (!r.ok) { alert(d.error || 'Failed'); return }
              alert(`Matched ${d.matched} settlement line(s). ${d.remainingPending.toLocaleString()} still pending.`)
              await refreshAll()
            }} title="Bulk-match card/e-wallet day settlements to their order batches" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Check size={14} /> Match settlements</button>
            <button onClick={async () => {
              if (!confirm('Pair internal transfers across ALL bank accounts? A spent and an equal received (≥₱5,000) on two of our own accounts within 3 banking days, with exactly one possible counterpart each, are recorded as one Fund Transfer and both posted. Ambiguous pairs are left for the Match dialog.')) return
              const r = await fetch('/api/bank-rec/transfer-match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
              const d = await r.json()
              if (!r.ok) { alert(d.error || 'Failed'); return }
              alert(`Paired ${d.matched} internal transfer(s)${d.matched ? ':\n' + d.pairs.slice(0, 12).map((p: { refNumber: string; amount: number; from: string; to: string; date: string }) => `${p.refNumber} · ${p.date} · ₱${p.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} ${p.from} → ${p.to}`).join('\n') + (d.pairs.length > 12 ? `\n…and ${d.pairs.length - 12} more` : '') : ''}`)
              await refreshAll()
            }} title="Bulk-pair internal transfers between our own accounts (equal amount, both pending, ≤3 banking days, unambiguous)" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><ArrowLeftRight size={14} /> Match transfers</button>
            <button onClick={() => setShowRules(true)} title="Auto-categorize recurring lines by description pattern" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Wand2 size={14} /> Auto-rules</button>
            <button onClick={() => setShowForexCfg(true)} title="Choose which bank accounts take part in buying foreign currency" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><ArrowLeftRight size={14} /> Currency exchange</button>
            <button onClick={() => setShowFT(true)} title="Record a transfer between two bank accounts, or from a bank account to a petty cash box" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><ArrowLeftRight size={14} /> Record Fund Transfer</button>
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Upload size={14} /> Upload from file</button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Add transaction</button>
          </div>
        )}
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-2xl border p-6 text-sm" style={{ borderColor: '#fde68a', background: '#fffbeb', color: '#92400e' }}>
          No bank accounts yet. In <strong>Chart of Accounts</strong>, tick <strong>&quot;Is this a bank account?&quot;</strong> on your Current-Asset bank accounts, then set their opening balance &amp; start date here.
        </div>
      ) : (
        <>
          {/* Account cards */}
          <div className="flex gap-3 overflow-x-auto pb-1">
            {accounts.map(a => (
              <button key={a.id} onClick={() => setSel(a.id)} className="text-left rounded-2xl border p-3 min-w-[230px] transition-colors"
                style={{ borderColor: sel === a.id ? 'var(--teal)' : 'var(--light-gray)', borderWidth: sel === a.id ? 2 : 1, background: '#fff' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{a.accountNumber}</p>
                  {a.pendingCount > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--charcoal)', color: '#fff' }}>{a.pendingCount}</span>}
                </div>
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{a.accountTitle}</p>
                <p className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>
                  {a.currency && a.currency !== 'PHP' ? `${a.currency} ` : '₱'}{peso(a.postedBalance)}
                </p>
                {a.currency !== 'PHP' && (
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--deep-teal)' }}>
                    {a.postedBalancePhp !== null ? `≈ ₱${peso(a.postedBalancePhp)} @ ${a.fxRate}` : 'No exchange rate on file'}
                  </p>
                )}
                <p className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>Posted balance{a.startDate ? ` · since ${a.startDate}` : ''}</p>
                {/* What the loaded statement lines themselves add up to, pending
                    ones included — so adding or deleting a line moves a figure
                    here even before it has been tagged. */}
                {a.pendingCount > 0 && (
                  <p className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                    With {a.pendingCount} pending: <strong style={{ color: 'var(--charcoal)' }}>
                      {a.currency && a.currency !== 'PHP' ? `${a.currency} ` : '₱'}{peso(a.statementBalance)}
                    </strong>
                  </p>
                )}
              </button>
            ))}
          </div>

          {account && !account.startDate && (
            <div className="rounded-xl border px-4 py-2 text-xs" style={{ borderColor: '#fde68a', background: '#fffbeb', color: '#92400e' }}>
              No reconciliation start date set for this account. Set one under <strong>Opening balance</strong> below so matching only considers Hub entries from that date onward.
            </div>
          )}

          {/* Records the Hub holds that no bank line accounts for */}
          <UntaggedPanel />

          {/* Opening balance — the figure the Balance Sheet starts this account
              from, and the date reconciliation begins counting Hub entries. */}
          {account && <OpeningBalance account={account} canWrite={canWrite} onSaved={refreshAll} />}

          {/* Exchange rates — only for accounts not held in PHP */}
          {foreignCur && (
            <div className="rounded-2xl border bg-white p-3" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{foreignCur} exchange rates</p>
                {canWrite && <button onClick={addRate} className="text-xs font-semibold px-2.5 py-1 rounded-lg border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>+ Add rate</button>}
              </div>
              <p className="text-[11px] mb-2" style={{ color: 'var(--mid-gray)' }}>
                Used to state this account in PHP for the Balance Sheet. Matching a currency exchange records the rate it implied automatically.
              </p>
              {rates.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No rates yet — match a currency exchange, or add one.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {rates.slice(0, 12).map(r => (
                    <span key={r.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px]" style={{ borderColor: 'var(--light-gray)' }}>
                      <span style={{ color: 'var(--mid-gray)' }}>{r.date}</span>
                      <strong style={{ color: 'var(--charcoal)' }}>{r.phpPerUnit}</strong>
                      {r.source === 'FOREX_MATCH' && <span title="Captured from a matched currency exchange" style={{ color: 'var(--deep-teal)' }}>auto</span>}
                      {canWrite && <button onClick={() => delRate(r.id)} style={{ color: '#b91c1c' }}>×</button>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Uploaded data */}
          {imports.length > 0 && (
            <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              <button onClick={() => setShowImports(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-left">
                <span className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                  <Upload size={14} style={{ color: 'var(--teal)' }} /> Uploaded data
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{imports.length}</span>
                </span>
                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{showImports ? 'Hide' : 'Show'}</span>
              </button>
              {showImports && (
                <div className="border-t overflow-auto" style={{ borderColor: 'var(--light-gray)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--off-white)' }}>
                        {['File', 'Uploaded', 'Covers', 'Lines', 'Pending', 'Posted', 'Locked', ''].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {imports.map(b => (
                        <tr key={b.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                          <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{b.fileName || 'Upload'}</td>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                            {b.createdAt.startsWith('1970') ? '—' : new Date(b.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                            {b.createdBy ? ` · ${b.createdBy}` : ''}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{b.from ? `${b.from} → ${b.to}` : '—'}</td>
                          <td className="px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>{b.total}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{b.pending}</td>
                          <td className="px-3 py-2" style={{ color: b.posted ? 'var(--deep-teal)' : 'var(--mid-gray)' }}>{b.posted}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{b.archived}</td>
                          <td className="px-3 py-2 text-right">
                            {canWrite && (
                              <button onClick={() => deleteBatch(b)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>
                                <Trash2 size={12} /> Delete upload
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="px-3 py-2 text-[11px] border-t" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    Deleting an upload removes every line it created on this account. Posted lines are kept back unless you confirm again, because removing them also drops the journal entries they produced.
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === 'ARCHIVED' && (
            <div className="rounded-xl border px-4 py-2 text-xs" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
              <Lock size={12} className="inline mr-1.5" style={{ verticalAlign: '-1px' }} />
              Kept on file for the record{account?.startDate ? ` — dated before ${account.startDate}` : ''}. These pre-date the Hub, so there is nothing recorded here to match them against; they are locked from tagging and post nothing to the general ledger.
            </div>
          )}

          {/* Tabs + search */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex rounded-xl overflow-hidden border w-fit" style={{ borderColor: 'var(--light-gray)' }}>
              {([['PENDING', `Pending (${account?.pendingCount ?? 0})`], ['POSTED', `Posted (${account?.postedCount ?? 0})`], ['EXCLUDED', `Excluded (${account?.excludedCount ?? 0})`], ['ARCHIVED', `Archived (${account?.archivedCount ?? 0})`]] as const).map(([k, lbl]) => (
                <button key={k} onClick={() => setTab(k)} className="px-4 py-2 text-xs font-semibold" style={tab === k ? { background: 'var(--deep-teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{lbl}</button>
              ))}
            </div>
            <div className="relative">
              <Search size={14} style={{ color: 'var(--mid-gray)', position: 'absolute', left: 10, top: 9 }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description, payee, match, FT ref…" className="pl-8 pr-3 py-2 rounded-xl border text-xs" style={{ borderColor: 'var(--light-gray)', minWidth: 220 }} />
            </div>
            {hintCount > 0 && (
              <button onClick={() => setOnlyHinted(v => !v)}
                title="Rows whose amount and date line up with something already recorded in the Hub"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border"
                style={{ borderColor: onlyHinted ? '#ca8a04' : 'var(--light-gray)', background: onlyHinted ? '#fef9c3' : 'transparent', color: '#854d0e' }}>
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#fde047' }} />
                {hintCount} likely match{hintCount > 1 ? 'es' : ''}
              </button>
            )}
            {activeFilters > 0 && (
              <button onClick={() => setFilters({})} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                <X size={13} /> Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
              </button>
            )}
            {txns.length > 0 && (
              <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                {visible.length === txns.length ? `${txns.length} rows` : `${visible.length} of ${txns.length} rows`}
              </span>
            )}
          </div>

          {/* Grid */}
          <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-sm">
              <SortFilterHead cols={GRID_COLS} sortKey={sortKey} sortDir={sortDir} filters={filters}
                onToggleSort={toggleSort} onFilter={setFilter} trailing />
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
                ) : txns.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>No {tab.toLowerCase()} transactions.</td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>
                    No rows match these filters. <button onClick={() => setFilters({})} className="underline" style={{ color: 'var(--teal)' }}>Clear filters</button>
                  </td></tr>
                ) : visible.map(t => (
                  <tr key={t.id} className="border-t" style={{ borderColor: 'var(--light-gray)', background: hints[t.id] ? '#fef9c3' : undefined }}>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{t.date}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>
                      {t.description}
                      {hints[t.id] && (
                        <span className="block text-[10px] mt-0.5" style={{ color: '#854d0e' }} title={`${hints[t.id].label} · ₱${peso(hints[t.id].amount)} on ${hints[t.id].date}`}>
                          Likely {hints[t.id].kind.toLowerCase()}: {hints[t.id].label}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold" style={{ color: t.spent > 0 ? '#b91c1c' : 'var(--light-gray)' }}>{t.spent > 0 ? money(t.spent) : ''}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold" style={{ color: t.received > 0 ? '#166534' : 'var(--light-gray)' }}>{t.received > 0 ? money(t.received) : ''}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{t.fromToName || ''}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {t.status === 'POSTED'
                        ? (t.matchLabel ? <span style={{ color: 'var(--deep-teal)' }}>Matched · {t.matchLabel}</span> : t.categoryLabel ? <span style={{ color: 'var(--deep-teal)' }}>{t.categoryLabel}</span> : <span style={{ color: 'var(--mid-gray)' }}>Posted</span>)
                        : t.status === 'EXCLUDED' ? <span style={{ color: 'var(--mid-gray)' }}>Excluded</span>
                        : t.status === 'ARCHIVED' ? <span className="inline-flex items-center gap-1" style={{ color: 'var(--mid-gray)' }}><Lock size={12} /> Locked — pre-Hub</span>
                        : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {canWrite && t.status === 'PENDING' && (
                        <>
                          {autoRules[t.id] && (
                            <button onClick={async () => {
                              setAutoPosting(t.id)
                              try {
                                const r = await fetch('/api/bank-rec/rules/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactionId: t.id }) })
                                const d = await r.json().catch(() => ({}))
                                if (!r.ok || !d.posted) alert(d.errors?.[0] || d.error || 'The rule did not post this line')
                                await refreshAll()
                              } finally { setAutoPosting(null) }
                            }} disabled={autoPosting === t.id}
                              title={`Auto-rule: ${autoRules[t.id].label}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white mr-1 disabled:opacity-50" style={{ background: 'var(--deep-teal)' }}>
                              {autoPosting === t.id ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Auto-post
                            </button>
                          )}
                          <button onClick={() => setMatchFor(t)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}><Link2 size={13} /> Match</button>
                          <button onClick={() => setCatFor(t)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white mr-1" style={{ background: 'var(--teal)' }}><Check size={13} /> Categorise</button>
                          <button onClick={() => setFtFor(t)} title="Record this line as a transfer to another of our accounts, or to a petty cash box" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}><ArrowLeftRight size={13} /> Transfer</button>
                          {/* A withdrawal from a petty cash account is the officer drawing the
                              float as cash — the same money, in hand rather than in the passbook.
                              Nothing to post and nothing to match, so it needs its own way to close. */}
                          {isPettyCashAccount && t.spent > 0 && (
                            <button onClick={() => {
                              if (!confirm(`Close ${money(t.spent)} as cash withdrawn to the box?\n\nThe petty cash account is the float, so cash in the officer's hands is still this account's money. The line is marked reconciled and nothing is posted — the spending is already recognised from the petty cash vouchers.`)) return
                              act({ id: t.id, action: 'close-petty-cash-withdrawal' })
                            }} title="Cash withdrawn to the box — reconcile without posting" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}><HandCoins size={13} /> Cash on hand</button>
                          )}
                          <button onClick={() => act({ id: t.id, action: 'exclude' })} title="Exclude" className="inline-flex items-center px-2 py-1 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}><Ban size={13} /></button>
                        </>
                      )}
                      {canWrite && t.status === 'POSTED' && (
                        <button onClick={() => act({ id: t.id, action: 'unpost' })} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><RotateCcw size={13} /> Undo</button>
                      )}
                      {isAdmin && t.status === 'ARCHIVED' && (
                        <button onClick={() => act({ id: t.id, action: 'unarchive' })} title="Unlock this line for tagging" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}><Unlock size={13} /> Unlock</button>
                      )}
                      {canWrite && t.status === 'EXCLUDED' && (
                        <>
                          <button onClick={() => act({ id: t.id, action: 'unpost' })} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><RotateCcw size={13} /> Restore</button>
                          <button onClick={() => del(t.id)} className="inline-flex items-center px-2 py-1 rounded-lg text-xs border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}><Trash2 size={13} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showRules && <RulesModal coa={coa} accounts={accounts} onClose={() => setShowRules(false)} onDone={refreshAll} />}
      {showForexCfg && <ForexAccountsModal onClose={() => setShowForexCfg(false)} onSaved={async () => { setShowForexCfg(false); await refreshAll() }} />}
      {showFT && <RecordFundTransferModal accounts={accounts} defaultFromId={account?.id || ''} onClose={() => setShowFT(false)} onDone={async () => { setShowFT(false); await refreshAll() }} />}
      {ftFor && <RecordFundTransferModal accounts={accounts} defaultFromId={account?.id || ''} line={ftFor} onClose={() => setFtFor(null)} onDone={async () => { setFtFor(null); await refreshAll() }} />}
      {showUpload && account && <UploadModal bankAccountId={account.id} onClose={() => setShowUpload(false)} onDone={async () => { setShowUpload(false); await refreshAll() }} />}
      {showAdd && account && <AddModal bankAccountId={account.id} onClose={() => setShowAdd(false)} onDone={async () => { setShowAdd(false); await refreshAll() }} />}
      {catFor && <CategoriseModal txn={catFor} coa={coa} account={account} onClose={() => setCatFor(null)} onDone={async () => { setCatFor(null); await refreshAll() }} />}
      {matchFor && <MatchModal txn={matchFor} coa={coa} onClose={() => setMatchFor(null)} onCategorise={() => { setCatFor(matchFor); setMatchFor(null) }} onDone={async () => { setMatchFor(null); await refreshAll() }} />}
    </div>
  )
}

interface BankRule { id: string; pattern: string; direction: string; bankAccountId: string | null; categoryAccountId: string; fromToName: string | null; effectiveFrom: string | null; active: boolean; pendingMatches: number; categoryLabel: string }

function RulesModal({ coa, accounts, onClose, onDone }: { coa: Coa[]; accounts: BankAcct[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [rules, setRules] = useState<BankRule[]>([])
  const [pendingTotal, setPendingTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  // new-rule form
  const [pattern, setPattern] = useState('')
  const [direction, setDirection] = useState<'OUT' | 'IN' | 'ANY'>('OUT')
  const [scopeAcct, setScopeAcct] = useState('')
  const [catQ, setCatQ] = useState('')
  const [categoryAccountId, setCategoryAccountId] = useState('')
  const [fromToName, setFromToName] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const load = async () => {
    setLoading(true)
    try { const r = await fetch('/api/bank-rec/rules'); const d = await r.json(); setRules(d.rules || []); setPendingTotal(d.pendingTotal || 0) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  const filteredCoa = coa.filter(c => catQ && `${c.accountNumber} ${c.accountTitle}`.toLowerCase().includes(catQ.toLowerCase())).slice(0, 8)
  const create = async () => {
    if (!pattern.trim() || !categoryAccountId) { alert('A rule needs a pattern and a category account.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/bank-rec/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pattern, direction, bankAccountId: scopeAcct || null, categoryAccountId, fromToName: fromToName || null, effectiveFrom: effectiveFrom || null }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      setPattern(''); setCatQ(''); setCategoryAccountId(''); setFromToName('')
      await load()
    } finally { setBusy(false) }
  }
  const toggle = async (rule: BankRule) => {
    await fetch('/api/bank-rec/rules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rule.id, active: !rule.active }) })
    await load()
  }
  const remove = async (rule: BankRule) => {
    if (!confirm(`Delete the rule "${rule.pattern}"? Lines it already posted stay posted.`)) return
    await fetch(`/api/bank-rec/rules?id=${rule.id}`, { method: 'DELETE' })
    await load()
  }
  const apply = async () => {
    const reach = rules.filter(r => r.active).reduce((s, r) => s + r.pendingMatches, 0)
    if (!reach) { alert('No active rule matches any pending line.'); return }
    if (!confirm(`Post ${reach.toLocaleString()} pending line(s) using the active rules?\n\nEach gets the same journal entry a manual categorise would post. This can be undone per line with Unpost.`)) return
    setBusy(true)
    try {
      // The server caps each run; loop until the backlog is done.
      let total = 0
      for (let i = 0; i < 20; i++) {
        const r = await fetch('/api/bank-rec/rules/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
        const d = await r.json()
        if (!r.ok) { alert(d.error || 'Failed'); break }
        total += d.posted
        if (d.errors?.length) { alert(`Posted ${total.toLocaleString()} so far, then hit errors:\n${d.errors.join('\n')}`); break }
        if (!d.capped) { alert(`Posted ${total.toLocaleString()} line(s).${d.skippedFx ? ` Skipped ${d.skippedFx} on foreign-currency accounts (they need a rate — categorise those by hand).` : ''}`); break }
      }
      await load(); await onDone()
    } finally { setBusy(false) }
  }
  const activeReach = rules.filter(r => r.active).reduce((s, r) => s + r.pendingMatches, 0)
  return (
    <Modal title="Auto-categorize rules" onClose={onClose} wide>
      <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
        A rule matches pending lines whose description or payee contains the pattern (case doesn&apos;t matter), then posts
        the same entry a manual categorise would — spent lines debit the category, received lines credit it. The first rule
        that matches a line wins, so put specific patterns above broad ones. {pendingTotal.toLocaleString()} line(s) are pending.
      </p>

      {/* New rule */}
      <div className="rounded-xl border p-3 mb-3 space-y-2" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap gap-2">
          <input value={pattern} onChange={e => setPattern(e.target.value)} placeholder='Pattern, e.g. "ROBINSONS LAND" or "GCASH"' className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          <select value={direction} onChange={e => setDirection(e.target.value as 'OUT' | 'IN' | 'ANY')} className="px-2 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="OUT">Money out</option><option value="IN">Money in</option><option value="ANY">Either</option>
          </select>
          <select value={scopeAcct} onChange={e => setScopeAcct(e.target.value)} className="px-2 py-2 rounded-xl border text-sm max-w-[210px]" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="">Any bank account</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.accountTitle}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          <div className="relative flex-1 min-w-[220px]">
            <input value={categoryAccountId ? (coa.find(c => c.id === categoryAccountId) ? `${coa.find(c => c.id === categoryAccountId)!.accountNumber} ${coa.find(c => c.id === categoryAccountId)!.accountTitle}` : catQ) : catQ}
              onChange={e => { setCatQ(e.target.value); setCategoryAccountId('') }}
              placeholder="Category account — search the chart" className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
            {!categoryAccountId && filteredCoa.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border bg-white shadow-lg max-h-44 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                {filteredCoa.map(c => (
                  <button key={c.id} type="button" onClick={() => { setCategoryAccountId(c.id); setCatQ('') }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">{c.accountNumber} {c.accountTitle}</button>
                ))}
              </div>
            )}
          </div>
          <input value={fromToName} onChange={e => setFromToName(e.target.value)} placeholder="Payee to stamp (optional)" className="px-3 py-2 rounded-xl border text-sm outline-none min-w-[180px]" style={{ borderColor: 'var(--light-gray)' }} />
          <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--mid-gray)' }} title="Lines dated before this stay untouched — expenses before it were recorded through other channels, and a rule reaching back would count them twice.">
            from <input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} className="px-2 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          </label>
          <button onClick={create} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>Add rule</button>
        </div>
      </div>

      {/* Rules list */}
      {loading ? <div className="py-6 text-center"><Loader2 className="animate-spin inline" size={18} /></div> : rules.length === 0 ? (
        <p className="text-sm py-4 text-center" style={{ color: 'var(--mid-gray)' }}>No rules yet. Add one above — e.g. pattern &quot;ROBINSONS&quot;, money out, category 8110 Rent Expense.</p>
      ) : (
        <div className="space-y-1 mb-3 max-h-72 overflow-y-auto">
          {rules.map(r => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--light-gray)', opacity: r.active ? 1 : 0.5 }}>
              <span className="font-mono font-semibold">&quot;{r.pattern}&quot;</span>
              <span style={{ color: 'var(--mid-gray)' }}>{r.direction === 'OUT' ? 'out' : r.direction === 'IN' ? 'in' : 'any'}</span>
              <span>→ {r.categoryLabel}</span>
              {r.fromToName && <span style={{ color: 'var(--mid-gray)' }}>payee: {r.fromToName}</span>}
              {r.effectiveFrom && <span style={{ color: 'var(--mid-gray)' }}>from {String(r.effectiveFrom).slice(0, 10)}</span>}
              <span className="ml-auto px-2 py-0.5 rounded-full font-bold" style={{ background: r.pendingMatches ? 'var(--teal)' : 'var(--light-gray)', color: r.pendingMatches ? '#fff' : 'var(--mid-gray)' }}>{r.pendingMatches} pending</span>
              <button onClick={() => toggle(r)} title={r.active ? 'Pause' : 'Resume'} className="underline">{r.active ? 'pause' : 'resume'}</button>
              <button onClick={() => remove(r)} title="Delete rule"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Close</button>
        <button onClick={apply} disabled={busy || !activeReach} className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-1.5" style={{ background: activeReach ? 'var(--teal)' : 'var(--light-gray)' }}>
          {busy ? <Loader2 className="animate-spin" size={14} /> : <Wand2 size={14} />} Apply rules to {activeReach.toLocaleString()} pending
        </button>
      </div>
    </Modal>
  )
}

function AddModal({ bankAccountId, onClose, onDone }: { bankAccountId: string; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [dir, setDir] = useState<'spent' | 'received'>('spent')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!date || !description || !(Number(amount) > 0)) { alert('Enter date, description and amount.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/bank-rec/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bankAccountId, date, description, spent: dir === 'spent' ? Number(amount) : 0, received: dir === 'received' ? Number(amount) : 0 }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Add bank transaction" onClose={onClose}>
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Date</label>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Bank description</label>
      <input value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
      <div className="flex gap-2 mb-4">
        <select value={dir} onChange={e => setDir(e.target.value as 'spent' | 'received')} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}><option value="spent">Spent</option><option value="received">Received</option></select>
        <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="flex-1 px-3 py-2 rounded-xl border text-sm font-mono" style={{ borderColor: 'var(--light-gray)' }} />
      </div>
      <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Add'}</button>
    </Modal>
  )
}

function UploadModal({ bankAccountId, onClose, onDone }: { bankAccountId: string; onClose: () => void; onDone: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [map, setMap] = useState<{ date: string; description: string; spent: string; received: string; balance: string }>({ date: '', description: '', spent: '', received: '', balance: '' })
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')

  const onFile = async (file: File | null) => {
    if (!file) return
    setFileName(file.name)
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
    if (!json.length) { alert('No rows found in the file.'); return }
    const hdrs = Object.keys(json[0])
    setHeaders(hdrs); setRows(json)
    const find = (kw: string[]) => hdrs.find(h => kw.some(k => h.toLowerCase().includes(k))) || ''
    setMap({
      // Description: BDO "Memo", AUB "TXN code", plus common bank labels.
      date: find(['txn date', 'transaction date', 'date']),
      description: find(['description', 'desc', 'memo', 'txn code', 'particular', 'narration', 'details', 'remarks', 'code']),
      spent: find(['spent', 'debit', 'withdraw', 'paid out', 'out']), received: find(['received', 'credit', 'deposit', 'paid in']),
      // Optional: the statement's running balance, used to prefill Beginning Balances.
      balance: find(['balance', 'running balance']),
    })
  }
  const toNum = (v: unknown) => { const n = parseFloat(String(v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : Math.abs(n) }
  // Use LOCAL date components (avoids a UTC off-by-one for midnight dates like "2/3/25").
  const pad = (n: number) => String(n).padStart(2, '0')
  const toDate = (v: unknown) => { const d = v instanceof Date ? v : new Date(String(v)); return isNaN(+d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
  const toBal = (v: unknown) => { if (v === undefined || v === null || String(v).trim() === '') return '' ; const n = parseFloat(String(v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? '' : n }
  const preview = useMemo(() => rows.slice(0, 5).map(r => ({ date: toDate(r[map.date]), description: String(r[map.description] || '').trim(), spent: toNum(r[map.spent]), received: toNum(r[map.received]), balance: map.balance ? toBal(r[map.balance]) : '' })), [rows, map])

  const importRows = async () => {
    if (!map.date || !map.description || (!map.spent && !map.received)) { alert('Map Date, Description, and at least one of Spent / Received.'); return }
    const payload = rows.map(r => ({ date: toDate(r[map.date]), description: String(r[map.description] || '').trim(), spent: toNum(r[map.spent]), received: toNum(r[map.received]), balance: map.balance ? toBal(r[map.balance]) : '' })).filter(r => r.date && (r.spent > 0 || r.received > 0))
    if (!payload.length) { alert('No valid rows after mapping.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/bank-rec/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bankAccountId, rows: payload, fileName, batchStamp: preview[0]?.date || '' }) })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Import failed'); return }
      const bits = [`Imported ${d.imported} transaction(s).`]
      if (d.autoPosted) bits.push(`Auto-rules categorized ${d.autoPosted} of them.`)
      if (d.archived) bits.push(`${d.archived} pre-date the reconciliation start date and were filed as Archived (locked from tagging).`)
      // "Skipped" means this account already held an identical line from an
      // earlier upload, so it was not added a second time. It does not mean the
      // line was matched to anything — matching is reconciling a bank line
      // against a Hub record, which is a separate step you do in the grid.
      if (d.skipped) bits.push(`${d.skipped} already uploaded previously, so not added again (this is not the same as matching).`)
      alert(bits.join('\n')); onDone()
    } finally { setBusy(false) }
  }
  const Sel = ({ k, label }: { k: keyof typeof map; label: string }) => (
    <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--charcoal)' }}>{label}</label>
      <select value={map[k]} onChange={e => setMap(m => ({ ...m, [k]: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
        <option value="">—</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  )
  const downloadTemplate = () => {
    const csv = [
      'Date,Description,Spent,Received,Balance',
      '2025-02-03,Sample payment out (e.g. ONLINE TRANSFER / check),1000.00,,24000.00',
      '2025-02-04,Sample deposit in (e.g. CD / collection),,2500.00,26500.00',
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'bank-statement-template.csv'; a.click(); URL.revokeObjectURL(a.href)
  }
  return (
    <Modal title="Upload bank statement" onClose={onClose} wide>
      <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>Upload a CSV or Excel statement (BDO, AUB, etc.). The first sheet&apos;s header row is read; columns are auto-mapped and you can adjust them below. <strong>Spent</strong> = money out (debit), <strong>Received</strong> = money in (credit).</p>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ background: 'var(--teal)' }}>
          <Upload size={15} /> Choose File
          <input type="file" accept=".csv,.xlsx,.xls" onChange={e => onFile(e.target.files?.[0] || null)} className="hidden" />
        </label>
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{fileName || 'No file chosen (CSV or Excel)'}</span>
        <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ml-auto" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
          <Download size={13} /> Download Template
        </button>
      </div>
      {headers.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
            <Sel k="date" label="Date" /><Sel k="description" label="Description" /><Sel k="spent" label="Spent (debit)" /><Sel k="received" label="Received (credit)" /><Sel k="balance" label="Balance (optional)" />
          </div>
          <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Preview ({rows.length} rows)</p>
          <div className="rounded-xl border overflow-auto mb-3" style={{ borderColor: 'var(--light-gray)', maxHeight: 180 }}>
            <table className="w-full text-[11px]"><thead><tr style={{ background: 'var(--off-white)' }}>{['Date', 'Description', 'Spent', 'Received'].map(h => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>{preview.map((p, i) => <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}><td className="px-2 py-1">{p.date}</td><td className="px-2 py-1">{p.description}</td><td className="px-2 py-1 text-right">{p.spent || ''}</td><td className="px-2 py-1 text-right">{p.received || ''}</td></tr>)}</tbody>
            </table>
          </div>
          <button onClick={importRows} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : `Import ${rows.length} rows`}</button>
        </>
      )}
    </Modal>
  )
}

function CategoriseModal({ txn, coa: allCoa, account, onClose, onDone }: { txn: Txn; coa: Coa[]; account: BankAcct | null; onClose: () => void; onDone: () => void }) {
  // This line's own bank account is never a valid category — picking it debits
  // and credits the same account, so the entry records nothing.
  const coa = useMemo(() => allCoa.filter(c => c.id !== account?.id), [allCoa, account])
  const [q, setQ] = useState('')
  const [categoryAccountId, setCat] = useState('')
  const [fromToName, setFromTo] = useState(txn.fromToName || '')
  const [busy, setBusy] = useState(false)
  // Reports are filtered by branch, so an entry left on "All Branches" shows up
  // only in the consolidated view. Branch-held accounts (AHEA/AHGH/VER) answer
  // this from their own name; the company-wide SCEI/SCI accounts cannot, so the
  // picker is there to attribute those.
  const derivedBranch = branchForBankAccount(account?.accountTitle)
  const [branch, setBranch] = useState(derivedBranch)
  const filtered = coa.filter(c => !q || `${c.accountNumber} ${c.accountTitle}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50)
  const foreign = !!account && account.currency !== 'PHP'
  const native = txn.spent > 0 ? txn.spent : txn.received
  const [rate, setRate] = useState<string>('')
  const effRate = Number(rate) || account?.fxRate || 0
  const save = async (withRate?: number) => {
    if (!categoryAccountId) { alert('Choose a category account.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/bank-rec/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: txn.id, action: 'categorise', categoryAccountId, fromToName, branch, fxRate: withRate ?? (rate ? Number(rate) : undefined) }) })
      const d = await r.json()
      if (!r.ok) {
        // No rate on file yet — take one here rather than sending the user away.
        if (d.needsRate) {
          const entered = prompt(`${d.error}\n\nPHP for 1 ${d.currency} on ${txn.date}:`, '')
          if (entered && Number(entered) > 0) {
            await fetch('/api/bank-rec/rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currency: d.currency, date: txn.date, phpPerUnit: Number(entered), note: 'Entered while categorising' }) })
            return save(Number(entered))
          }
          return
        }
        alert(d.error || 'Failed'); return
      }
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Categorise & post" onClose={onClose}>
      <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{txn.date} · {txn.description} · <strong>{foreign ? `${account!.currency} ` : '₱'}{peso(native)}</strong> {txn.spent > 0 ? '(out)' : '(in)'}</p>
      {foreign && (
        <div className="rounded-xl border px-3 py-2 mb-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-[11px] mb-1.5" style={{ color: 'var(--mid-gray)' }}>
            The ledger is kept in PHP, so this line is posted at the rate for its date.
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>PHP per 1 {account!.currency}</label>
            <input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal"
              placeholder={account!.fxRate ? String(account!.fxRate) : '0.0000'}
              className="w-28 px-2 py-1 rounded-lg border text-xs font-mono" style={{ borderColor: 'var(--light-gray)' }} />
            <span className="text-xs font-semibold ml-auto" style={{ color: 'var(--deep-teal)' }}>
              {effRate > 0 ? `= ₱${peso(Math.round(native * effRate * 100) / 100)}` : 'no rate on file'}
            </span>
          </div>
          {!rate && account!.fxRateDate && (
            <p className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>Using the rate recorded {account!.fxRateDate}. Leave blank to keep it.</p>
          )}
        </div>
      )}
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>From / To (payee or customer)</label>
      <input value={fromToName} onChange={e => setFromTo(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Category account</label>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search account…" className="w-full px-3 py-2 rounded-xl border text-sm mb-1" style={{ borderColor: 'var(--light-gray)' }} />
      <div className="rounded-xl border overflow-auto mb-3" style={{ borderColor: 'var(--light-gray)', maxHeight: 200 }}>
        {filtered.map(c => (
          <button key={c.id} onClick={() => setCat(c.id)} className="block w-full text-left px-3 py-1.5 text-xs" style={{ background: categoryAccountId === c.id ? 'var(--pale-teal)' : '#fff', color: 'var(--charcoal)' }}>{c.accountNumber} — {c.accountTitle}</button>
        ))}
      </div>
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Branch</label>
      <select value={branch} onChange={e => setBranch(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-1" style={{ borderColor: 'var(--light-gray)' }}>
        <option value="SANDBOX_EAST">Aura Health East</option>
        <option value="SANDBOX_GREENHILLS">Aura Health Greenhills</option>
        <option value="VERDANA_STORE">Verdana</option>
        <option value="AURA_INSTITUTE">Aura Health Institute</option>
        <option value="ALL">All Branches (company-wide)</option>
      </select>
      <p className="text-[11px] mb-3" style={{ color: branch === 'ALL' ? '#b45309' : 'var(--mid-gray)' }}>
        {branch === 'ALL'
          ? 'On "All Branches" this entry appears only in the consolidated reports — it will not show on any per-branch statement. Pick a branch if it belongs to one.'
          : `Reported under ${branchLabel(branch)}.${derivedBranch === 'ALL' ? ' This is a company-wide account, so the branch is your call.' : ''}`}
      </p>
      <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Posts a journal entry: {txn.spent > 0 ? 'debit the category, credit this bank account.' : 'debit this bank account, credit the category.'}</p>
      <button onClick={() => save()} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Categorise & post'}</button>
    </Modal>
  )
}

// POS settlement picker — a bank deposit that settles a batch of POS order
// payments (a day's cash deposited 1-3 days later, or a card/GCash batch
// credited net of the mode's deductions). The user picks the mode, adjusts the
// sale-date window, ticks the payments the deposit covers (whole days or a
// separately-deposited subset), and confirms; the running net total shows how
// far the selection is from the bank amount.
interface PosMode { id: string; name: string; method: string | null; branch: string | null; settlesHere: boolean; deductions: string[] }
interface PosPay { id: string; date: string; orderNumber: number; name: string; branch: string; gross: number; net: number; settledBy: string | null }
function PosSettlementPicker({ txn, onDone }: { txn: Txn; onDone: () => void }) {
  const [modes, setModes] = useState<PosMode[] | null>(null)
  const [modeId, setModeId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [pays, setPays] = useState<PosPay[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const bankAmt = txn.received

  useEffect(() => {
    fetch(`/api/bank-rec/pos-settlement?txnId=${txn.id}`).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return
      setModes(d.modes || [])
      setFrom(d.suggestedFrom || ''); setTo(d.suggestedTo || '')
      const here = (d.modes || []).filter((m: PosMode) => m.settlesHere)
      if (here.length === 1) setModeId(here[0].id)
    }).catch(() => setModes([]))
  }, [txn.id])

  useEffect(() => {
    if (!modeId) { setPays(null); return }
    setPays(null); setSel(new Set())
    const p = new URLSearchParams({ txnId: txn.id, modeId })
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    fetch(`/api/bank-rec/pos-settlement?${p}`).then(r => r.ok ? r.json() : null).then(d => setPays(d?.payments || [])).catch(() => setPays([]))
  }, [txn.id, modeId, from, to])

  const days = useMemo(() => {
    const m = new Map<string, PosPay[]>()
    for (const p of pays || []) { const arr = m.get(p.date) || []; arr.push(p); m.set(p.date, arr) }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [pays])
  const selNet = (pays || []).filter(p => sel.has(p.id)).reduce((s, p) => s + p.net, 0)
  const diff = Math.round((selNet - bankAmt) * 100) / 100
  const toggle = (id: string) => setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleDay = (d: string) => {
    const ids = (pays || []).filter(p => p.date === d && !p.settledBy).map(p => p.id)
    const allOn = ids.every(id => sel.has(id))
    setSel(prev => { const n = new Set(prev); for (const id of ids) { if (allOn) n.delete(id); else n.add(id) } return n })
  }
  const confirm = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/bank-rec/pos-settlement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txnId: txn.id, modeId, orderPaymentIds: [...sel] }) })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Failed'); return }
      onDone()
    } finally { setBusy(false) }
  }

  if (modes === null) return <p className="text-xs py-2" style={{ color: 'var(--mid-gray)' }}><Loader2 size={13} className="inline animate-spin" /> Loading POS modes…</p>
  return (
    <div className="rounded-xl border p-3 mb-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <select value={modeId} onChange={e => setModeId(e.target.value)} className="px-2 py-1.5 rounded-lg border text-xs bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">— Payment mode —</option>
          {modes.map(m => <option key={m.id} value={m.id}>{m.name}{m.settlesHere ? ' ★ settles here' : ''}{m.deductions.length ? ` (less ${m.deductions.join(', ')})` : ''}</option>)}
        </select>
        <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Sales from</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-2 py-1 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
        <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-2 py-1 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
      </div>
      {modeId && (pays === null ? (
        <p className="text-xs py-2" style={{ color: 'var(--mid-gray)' }}><Loader2 size={13} className="inline animate-spin" /> Loading payments…</p>
      ) : pays.length === 0 ? (
        <p className="text-xs py-1" style={{ color: 'var(--mid-gray)' }}>No completed-order payments in this window for that mode.</p>
      ) : (
        <>
          <div className="rounded-lg border overflow-y-auto bg-white" style={{ borderColor: 'var(--light-gray)', maxHeight: 230 }}>
            {days.map(([d, rows]) => (
              <div key={d}>
                <button type="button" onClick={() => toggleDay(d)} className="w-full text-left px-2.5 py-1 text-[11px] font-semibold sticky top-0" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>
                  {d} — {rows.length} payment(s) · net ₱{peso(rows.reduce((s, p) => s + p.net, 0))} <span className="font-normal" style={{ color: 'var(--teal)' }}>(toggle day)</span>
                </button>
                {rows.map(p => (
                  <label key={p.id} className={`flex items-center gap-2 px-2.5 py-1 text-xs border-t ${p.settledBy ? 'opacity-50' : 'cursor-pointer'}`} style={{ borderColor: 'var(--light-gray)' }} title={p.settledBy ? `Already settled: ${p.settledBy}` : undefined}>
                    <input type="checkbox" disabled={!!p.settledBy} checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
                    <span className="w-14 font-mono">#{p.orderNumber}</span>
                    <span className="flex-1 truncate">{p.name}{p.settledBy ? ' · settled ✓' : ''}</span>
                    <span className="tabular-nums">₱{peso(p.net)}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 text-xs">
            <span style={{ color: 'var(--mid-gray)' }}>{sel.size} selected · net <strong style={{ color: 'var(--charcoal)' }}>₱{peso(selNet)}</strong> vs bank ₱{peso(bankAmt)}
              {sel.size > 0 && <span className="ml-1 font-semibold" style={{ color: Math.abs(diff) < 0.01 ? '#166534' : '#b45309' }}>{Math.abs(diff) < 0.01 ? '· exact match' : `· off by ₱${peso(Math.abs(diff))}`}</span>}
            </span>
            <button onClick={confirm} disabled={busy || sel.size === 0} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
              {busy ? <Loader2 size={13} className="inline animate-spin" /> : `Settle ${sel.size} payment(s)`}
            </button>
          </div>
        </>
      ))}
    </div>
  )
}

function MatchModal({ txn, coa, onClose, onDone, onCategorise }: { txn: Txn; coa: Coa[]; onClose: () => void; onDone: () => void; onCategorise: () => void }) {
  const [matches, setMatches] = useState<Match[] | null>(null)
  // Where the sliver goes when the ticked records don't reach the bank amount
  // to the centavo (bank interest, a charge, a rounding difference).
  const [diffAcct, setDiffAcct] = useState('')
  const [fx, setFx] = useState<FxMatch[]>([])
  const [busy, setBusy] = useState(false)
  // Manual search: any of these switches from same-amount suggestions to a
  // label search over every recorded transaction in the range — needed when the
  // amounts can never agree (e.g. a CNY bank debit vs a PHP expense entry).
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showPos, setShowPos] = useState(false)
  const [sel, setSel] = useState<Record<string, Match>>({})
  const [partials, setPartials] = useState<Match[]>([])
  // Records BIGGER than this line — the deposit is one instalment of them.
  const [bigger, setBigger] = useState<Match[]>([])
  const searching = !!(q.trim() || from || to)
  useEffect(() => {
    setMatches(null)
    const t = setTimeout(() => {
      const p = new URLSearchParams({ txnId: txn.id })
      if (q.trim()) p.set('q', q.trim())
      if (from) p.set('from', from)
      if (to) p.set('to', to)
      fetch(`/api/bank-rec/matches?${p}`).then(r => r.ok ? r.json() : { matches: [] })
        .then(d => { setMatches(d.matches || []); setPartials(d.partials || []); setBigger(d.bigger || []) })
        .catch(() => { setMatches([]); setPartials([]) })
    }, q.trim() ? 350 : 0)
    return () => clearTimeout(t)
  }, [txn.id, q, from, to])
  useEffect(() => { fetch(`/api/bank-rec/matches?txnId=${txn.id}&mode=forex`).then(r => r.ok ? r.json() : { matches: [] }).then(d => setFx(d.matches || [])).catch(() => setFx([])) }, [txn.id])
  const pick = async (m: Match) => {
    setBusy(true)
    try {
      // An interbank candidate is the OTHER bank line of an internal transfer —
      // confirming records one FundTransfer and posts both legs together.
      // POS sale / day settlement suggestions confirm through the settlement
      // batch endpoint so the covered order payments get locked to this deposit.
      if (m.type === 'POS_SALE' || m.type === 'POS_DAY') {
        const r = await fetch('/api/bank-rec/pos-settlement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txnId: txn.id, modeId: m.modeId, orderPaymentIds: m.posPaymentIds || [] }) })
        if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'Failed to match'); return }
        onDone(); return
      }
      // Settling part of a bigger record: the label carries the portion so the
      // grid shows what this line covered and what the record still awaits.
      // Judged on the amounts, not on which list the record came from — the
      // record is often months from the deposit (a subscription recorded at
      // year end, paid in June) and is then reached by search rather than by
      // the suggestions.
      const isPart = m.type !== 'INTERBANK' && m.type !== 'POS_SALE' && m.type !== 'POS_DAY' && m.amount > target + 0.01
      const partLabel = isPart
        ? `Part payment ₱${peso(target)} of ₱${peso(m.amount)} · ${m.label}`.slice(0, 500)
        : m.label
      const body = m.type === 'INTERBANK'
        ? { id: txn.id, action: 'match-interbank', counterpartId: m.id }
        : { id: txn.id, action: 'match', matchType: m.type, matchId: m.id, matchLabel: partLabel }
      const r = await fetch('/api/bank-rec/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'Failed to match'); return }
      onDone()
    } finally { setBusy(false) }
  }
  // One deposit often settles several records at once — Scott So and Sofia Tan
  // paying ₱250,000 each into a single ₱500,000 line, or two cash loans arriving
  // as one cheque. Ticking them accumulates a running total against the bank
  // amount so the combination can be confirmed only once it actually adds up.
  const key = (m: Match) => `${m.type}-${m.id}`
  const combinable = (m: Match) => m.type !== 'POS_SALE' && m.type !== 'POS_DAY' && m.type !== 'INTERBANK'
  const toggle = (m: Match) => setSel(prev => {
    const next = { ...prev }
    if (next[key(m)]) delete next[key(m)]; else next[key(m)] = m
    return next
  })
  const selList = Object.values(sel)
  const target = txn.spent > 0 ? txn.spent : txn.received
  const selTotal = Math.round(selList.reduce((s, m) => s + m.amount, 0) * 100) / 100
  const selDiff = Math.round((selTotal - target) * 100) / 100

  const pickMany = async () => {
    if (selList.length < 1) return
    if (selDiff !== 0 && !diffAcct) return
    setBusy(true)
    try {
      const types = [...new Set(selList.map(m => m.type))]
      // A bank line carries one matchId, so a combination is stored as the ids
      // joined; the label is what makes it legible afterwards.
      const diffNote = selDiff !== 0
        ? ` + ₱${peso(Math.abs(selDiff))} to ${coa.find(c => c.id === diffAcct)?.accountNumber || 'difference'}`
        : ''
      const label = `${selList.length} record${selList.length === 1 ? '' : 's'} · ${selList.map(m => `${m.label} ₱${peso(m.amount)}`).join(' + ')}${diffNote}`
      const body = {
        id: txn.id, action: 'match',
        matchType: types.length === 1 ? types[0] : 'MULTI',
        matchId: selList.map(m => m.id).join(','),
        matchLabel: label.slice(0, 500),
        ...(selDiff !== 0 && diffAcct ? { differenceAccountId: diffAcct, recordsTotal: selTotal } : {}),
      }
      const r = await fetch('/api/bank-rec/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'Failed to match'); return }
      onDone()
    } finally { setBusy(false) }
  }

  const pickFx = async (m: FxMatch) => {
    const mine = txn.spent > 0 ? txn.spent : txn.received
    if (!confirm(`Record a currency exchange?\n\n₱${peso(txn.spent > 0 ? mine : m.amount)} ⇄ ${peso(txn.spent > 0 ? m.amount : mine)} ${m.currency}\nRate: 1 ${m.currency} = ${m.rate} PHP\n\nBoth bank lines will be posted against one fund transfer.`)) return
    setBusy(true)
    try {
      const r = await fetch('/api/bank-rec/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: txn.id, action: 'match-forex', counterpartId: m.id }) })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Failed'); return }
      alert(`Recorded ${d.refNumber} at 1 ${m.currency} = ${d.rate} PHP.`)
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Match to a recorded transaction" onClose={onClose}>
      <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{txn.date} · {txn.description} · <strong>₱{peso(txn.spent > 0 ? txn.spent : txn.received)}</strong></p>

      {/* Money in: offer settling a batch of POS order payments (daily cash
          deposit / card-GCash settlement, net of mode deductions). */}
      {txn.received > 0 && (
        <div className="mb-3">
          <button type="button" onClick={() => setShowPos(v => !v)} className="text-xs font-semibold underline" style={{ color: 'var(--teal)' }}>
            {showPos ? 'Hide POS settlement' : 'Settle POS orders (daily cash / card / GCash batch)…'}
          </button>
          {showPos && <div className="mt-2"><PosSettlementPicker txn={txn} onDone={onDone} /></div>}
        </div>
      )}

      {/* Search any recorded transaction — bypasses the same-amount suggester */}
      <div className="mb-3 space-y-1.5">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search recorded transactions (ref no, payee, description)…"
          className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: searching ? 'var(--teal)' : 'var(--light-gray)' }} />
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
          <span>From</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-2 py-1 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
          <span>to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-2 py-1 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
          {searching && <button onClick={() => { setQ(''); setFrom(''); setTo('') }} className="underline" style={{ color: 'var(--teal)' }}>Clear — back to suggestions</button>}
        </div>
        {searching && <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Searching all recorded transactions in the range (amounts may differ — e.g. a foreign-currency bank line against its PHP entry). Pick the record this bank line settles.</p>}
      </div>

      {fx.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--charcoal)' }}>
            <ArrowLeftRight size={13} style={{ color: 'var(--teal)' }} /> Currency exchange
          </p>
          <p className="text-[11px] mb-2" style={{ color: 'var(--mid-gray)' }}>
            The other side of this exchange, on an account held in another currency. Picking one records a single fund transfer and stores the rate it implies — check the rate looks right before confirming.
          </p>
          <div className="space-y-2">
            {fx.map(m => (
              <button key={m.id} onClick={() => pickFx(m)} disabled={busy} className="w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left disabled:opacity-50" style={{ borderColor: 'var(--teal)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{m.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} {m.currency}</p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>{m.date} · {m.label}</p>
                </div>
                <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>1 {m.currency} = {m.rate} PHP</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {matches === null ? <p className="text-sm py-6 text-center" style={{ color: 'var(--mid-gray)' }}><Loader2 size={15} className="inline animate-spin" /> Finding matches…</p>
        : matches.length === 0 && partials.length === 0 && bigger.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>
              {searching
                ? 'Nothing found in that range — adjust the search or dates.'
                : 'No suggested matches (by amount within 7 days). Search above to find any recorded transaction, or categorise it instead.'}
            </p>
            {!searching && <button onClick={onCategorise} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>Categorise instead</button>}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              {matches.length > 0
                ? 'Click a record to match it on its own, or tick several to combine them when one deposit covered more than one.'
                : 'Nothing matches this amount on its own. Tick the records that together make up this deposit.'}
            </p>
            {selList.length > 0 && (
              <div className="rounded-xl border px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
                style={{ borderColor: selDiff === 0 ? '#16a34a' : 'var(--gold)', background: selDiff === 0 ? '#dcfce7' : '#fefce8' }}>
                <div className="text-xs" style={{ color: 'var(--charcoal)' }}>
                  <strong>{selList.length} selected</strong> · ₱{peso(selTotal)} of ₱{peso(target)}
                  <span className="ml-2 font-semibold" style={{ color: selDiff === 0 ? '#166534' : '#b45309' }}>
                    {selDiff === 0 ? 'adds up exactly' : `${selDiff > 0 ? 'over' : 'short'} by ₱${peso(Math.abs(selDiff))}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSel({})} className="text-xs underline" style={{ color: 'var(--mid-gray)' }}>Clear</button>
                  <button onClick={pickMany} disabled={busy || selList.length < 1 || (selDiff !== 0 && !diffAcct)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
                    style={{ background: '#16a34a', cursor: (selList.length < 1 || (selDiff !== 0 && !diffAcct)) ? 'not-allowed' : 'pointer' }}
                    title={selDiff !== 0 && !diffAcct ? 'Choose where the difference goes, or tick records that add up exactly' : 'Match these records to this bank line'}>
                    {selDiff === 0 ? `Match ${selList.length} together` : `Match ${selList.length} + difference`}
                  </button>
                </div>
              </div>
            )}
            {/* The bank rarely agrees to the centavo — interest lands on top of a
                deposit, a charge comes off a payment. Naming the account for the
                remainder settles the line in full instead of leaving it open. */}
            {/* One ticked record bigger than the line is almost never a
                difference to expense — it is an instalment. Offering a ₱990,000
                "difference" against a ₱10,000 deposit invites a serious
                misposting, so that case gets the part-payment route instead. */}
            {selList.length === 1 && selDiff > 0 && (
              <div className="rounded-xl border px-3 py-2 space-y-1.5" style={{ borderColor: 'var(--gold)', background: '#fffbeb' }}>
                <p className="text-[11px]" style={{ color: '#92400e' }}>
                  <strong>{selList[0].label}</strong> is bigger than this line. If this deposit paid only part of it, record it as a part payment — ₱{peso(Math.abs(selDiff))} stays open for the other bank lines that made it up.
                </p>
                <button onClick={() => pick(selList[0])} disabled={busy}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--teal)' }}>
                  Record ₱{peso(target)} as part payment
                </button>
              </div>
            )}
            {selList.length > 0 && selDiff !== 0 && !(selList.length === 1 && selDiff > 0) && (
              <div className="rounded-xl border px-3 py-2 space-y-1.5" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <label className="block text-[11px] font-semibold" style={{ color: 'var(--charcoal)' }}>
                  Record the ₱{peso(Math.abs(selDiff))} {selDiff < 0 ? 'the bank has on top' : 'the records have on top'} as
                </label>
                <select value={diffAcct} onChange={e => setDiffAcct(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">— leave unmatched (button stays off) —</option>
                  {coa.map(c => (
                    <option key={c.id} value={c.id}>{c.accountNumber} — {c.accountTitle}</option>
                  ))}
                </select>
                <p className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                  A journal entry posts for the difference only; the ticked records keep their own accounting. Typical picks: interest income, bank charges, other income.
                </p>
              </div>
            )}
            {matches.map(m => (
              <div key={`${m.type}-${m.id}`} className="w-full rounded-xl border px-3 py-2 flex items-start gap-2.5"
                style={{ borderColor: sel[key(m)] ? 'var(--teal)' : 'var(--light-gray)', background: sel[key(m)] ? 'var(--pale-teal)' : 'transparent' }}>
                {combinable(m) && (
                  <input type="checkbox" checked={!!sel[key(m)]} onChange={() => toggle(m)} disabled={busy}
                    className="mt-1 shrink-0 cursor-pointer" title="Combine with other records to make up this bank line" />
                )}
                <button onClick={() => pick(m)} disabled={busy} className="flex-1 min-w-0 text-left disabled:opacity-50">
                  <div className="flex items-center justify-between gap-2">
                    <div><p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{m.label}</p><p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{m.date}</p></div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--deep-teal)' }}>₱{peso(m.amount)}</span>
                  </div>
                  {/* Day settlements list what the total is made of, so one click confirms an informed tag. */}
                  {m.details && m.details.length > 0 && (
                    <ul className="mt-1.5 pl-3 space-y-0.5 border-l-2" style={{ borderColor: 'var(--light-gray)' }}>
                      {m.details.map((d, i) => <li key={i} className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{d}</li>)}
                    </ul>
                  )}
                </button>
              </div>
            ))}

            {/* Records smaller than the bank line. They can never match on their
                own, so they are tick-only — a deposit that covered two or three
                of them is confirmed from the running total above. */}
            {partials.length > 0 && (
              <div className="pt-1">
                <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Or combine several records
                </p>
                <p className="text-[11px] mb-2" style={{ color: 'var(--mid-gray)' }}>
                  Smaller records in the same period — tick the ones this deposit paid for until they add up to ₱{peso(target)}.
                </p>
                <div className="space-y-1.5">
                  {partials.map(m => (
                    <label key={`${m.type}-${m.id}`} className="w-full rounded-xl border px-3 py-2 flex items-start gap-2.5 cursor-pointer"
                      style={{ borderColor: sel[key(m)] ? 'var(--teal)' : 'var(--light-gray)', background: sel[key(m)] ? 'var(--pale-teal)' : 'transparent' }}>
                      <input type="checkbox" checked={!!sel[key(m)]} onChange={() => toggle(m)} disabled={busy} className="mt-1 shrink-0 cursor-pointer" />
                      <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{m.label}</span>
                          <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>{m.date}</span>
                        </span>
                        <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>₱{peso(m.amount)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {/* The mirror of combining: this deposit is one instalment of a
                bigger record. A ₱1,000,000 subscription paid as ₱10,000 then
                ₱990,000 — match each line to the same record. */}
            {bigger.length > 0 && (
              <div className="pt-1">
                <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Or this line is part of a bigger record
                </p>
                <p className="text-[11px] mb-2" style={{ color: 'var(--mid-gray)' }}>
                  Records larger than ₱{peso(target)} in the same period. Pick one if this deposit paid only part of it — the rest stays open for the other bank lines that made it up.
                </p>
                <div className="space-y-1.5">
                  {bigger.map(m => (
                    <button key={`big-${m.type}-${m.id}`} onClick={() => pick(m)} disabled={busy}
                      className="w-full text-left rounded-xl border px-3 py-2 flex items-start justify-between gap-2 disabled:opacity-50"
                      style={{ borderColor: 'var(--light-gray)' }}>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{m.label}</span>
                        <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                          {m.date} · this line covers ₱{peso(target)}, leaving ₱{peso(Math.round((m.amount - target) * 100) / 100)}
                        </span>
                      </span>
                      <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>₱{peso(m.amount)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </Modal>
  )
}

/** Record a transfer between two accounts without leaving Bank Reconciliation.
 *  The account list is the same one shown in the strip above, so petty-cash-on-hand
 *  accounts are selectable as a destination — that is how a cash withdrawal to the
 *  physical box gets recorded and later matched against the bank line. */
// Records a transfer between two of our own accounts. Opened either from the
// toolbar (blank) or from a single bank line via `line`, in which case the date,
// amount and this line's own side are taken from the statement — a line that
// went out makes this account the "from", one that came in makes it the "to" —
// and the line is matched to the new transfer on save, so it does not have to be
// hunted down in the Match dialog afterwards.
function RecordFundTransferModal({ accounts, defaultFromId, line, onClose, onDone }: {
  accounts: BankAcct[]; defaultFromId: string; line?: Txn | null; onClose: () => void; onDone: () => void
}) {
  const lineIsSpent = !!line && line.spent > 0
  const [fromId, setFromId] = useState(lineIsSpent || !line ? defaultFromId : '')
  const [toId, setToId] = useState(line && !lineIsSpent ? defaultFromId : '')
  const [date, setDate] = useState(line ? line.date : new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(line ? String(line.spent > 0 ? line.spent : line.received) : '')
  const [checkNumber, setCheckNumber] = useState('')
  const [description, setDescription] = useState(line ? line.description : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const label = (a: BankAcct) => `${a.accountNumber} — ${a.accountTitle}`
  const from = accounts.find(a => a.id === fromId)
  const to = accounts.find(a => a.id === toId)
  const crossCurrency = !!from && !!to && from.currency !== to.currency

  const save = async () => {
    setErr('')
    const amt = parseFloat(amount)
    if (!fromId || !toId) { setErr('Choose both accounts'); return }
    if (fromId === toId) { setErr('The two accounts must be different'); return }
    if (!amt || amt <= 0) { setErr('Enter an amount'); return }
    if (crossCurrency) { setErr('These accounts hold different currencies — use Currency exchange in Fund Transfer instead'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/fund-transfers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, fromAccountId: fromId, toAccountId: toId, amount: amt, checkNumber: checkNumber || null, description: description || null, proofUrls: [] }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Failed to record the transfer'); return }
      // Opened from a bank line: tie that line to the transfer we just made, so
      // it leaves the pending list here rather than waiting to be found again in
      // the Match dialog. The label matches what the Match dialog would write.
      // The transfer itself is already recorded, so a failure here is reported
      // without discarding it — the line can still be matched by hand.
      if (line) {
        const m = await fetch('/api/bank-rec/transactions', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: line.id, action: 'match', matchType: 'FUND_TRANSFER', matchId: d.id, matchLabel: `${d.refNumber} · Fund Transfer` }),
        })
        if (!m.ok) {
          const md = await m.json().catch(() => ({}))
          setErr(`Transfer ${d.refNumber} was recorded, but this line could not be matched to it (${md.error || 'failed'}). Match it by hand.`)
          return
        }
      }
      onDone()
    } catch { setErr('Network error') }
    finally { setSaving(false) }
  }

  const field = { borderColor: 'var(--light-gray)' }
  return (
    <Modal title="Record Fund Transfer" onClose={onClose}>
      <div className="space-y-3">
        {line && (
          <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>
            {line.date} · {line.description} · <strong>₱{peso(line.spent > 0 ? line.spent : line.received)}</strong> {line.spent > 0 ? 'out' : 'in'} — so this account is the {lineIsSpent ? 'source' : 'destination'}. Choose the {lineIsSpent ? 'destination' : 'source'} below.
          </p>
        )}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>From</label>
          {/* The statement already says which way this line went, so its own side
              is fixed — only the far side is a choice. */}
          <select value={fromId} onChange={e => setFromId(e.target.value)} disabled={lineIsSpent} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ ...field, background: lineIsSpent ? 'var(--off-white)' : undefined }}>
            <option value="">— Select account —</option>
            {accounts.filter(a => lineIsSpent || a.id !== toId).map(a => <option key={a.id} value={a.id}>{label(a)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>To <span className="font-normal">(another bank account, or a petty cash box)</span></label>
          <select value={toId} onChange={e => setToId(e.target.value)} disabled={!!line && !lineIsSpent} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ ...field, background: (!!line && !lineIsSpent) ? 'var(--off-white)' : undefined }}>
            <option value="">— Select account —</option>
            {accounts.filter(a => a.id !== fromId).map(a => <option key={a.id} value={a.id}>{label(a)}</option>)}
          </select>
        </div>
        {crossCurrency && (
          <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fff7ed', color: '#9a3412' }}>
            {from!.currency} → {to!.currency}: record this under Fund Transfer › Currency exchange so the rate is captured.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={field} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Amount</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={field} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Cheque no. <span className="font-normal">(optional)</span></label>
            <input value={checkNumber} onChange={e => setCheckNumber(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={field} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Description <span className="font-normal">(optional)</span></label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={field} />
          </div>
        </div>
        {err && <p className="text-xs" style={{ color: '#b91c1c' }}>{err}</p>}
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
          Recorded as a fund transfer, so both sides become matchable against their bank lines.
        </p>
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
            {saving ? 'Saving…' : 'Record transfer'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl p-6 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[88vh] overflow-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{title}</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        {children}
      </div>
    </div>
  )
}


// Opening balance for one bank account. This used to be a separate page listing
// every account in the chart, but only bank accounts ever carried a figure, and
// the date it sets is what bank reconciliation counts from — so it belongs with
// the account it describes.
function OpeningBalance({ account, canWrite, onSaved }: { account: BankAcct; canWrite: boolean; onSaved: () => void }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [amount, setAmount] = useState('')
  const [startDate, setStartDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setAmount(account.beginningBalance ? String(account.beginningBalance) : '')
    setStartDate(account.startDate || '')
  }, [account.id, account.beginningBalance, account.startDate])

  const save = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/beginning-balances', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, entries: [{ accountId: account.id, amount: Number(amount) || 0, startDate: startDate || null }] }),
      })
      if (!r.ok) { alert('Failed to save: ' + (await r.text())); return }
      await onSaved()
    } finally { setBusy(false) }
  }

  // Read the figure off the uploaded statements rather than typing it in.
  const prefill = async () => {
    const asOf = prompt(`Read this account's balance from its uploaded statements as of which date?`, `${year - 1}-12-31`)
    if (!asOf) return
    setBusy(true)
    try {
      const r = await fetch(`/api/bank-rec/balance-as-of?date=${encodeURIComponent(asOf)}`)
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Failed'); return }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = (d.accounts || []).find((a: any) => a.accountId === account.id)
      if (!row || row.balance === null) {
        alert(row?.needsRate
          ? `This account is held in ${row.currency} and has no exchange rate on file for ${asOf}, so it cannot be stated in PHP yet.`
          : `No uploaded statement line on or before ${asOf} carries a running balance for this account.\n\nRe-upload with the Balance column mapped.`)
        return
      }
      setAmount(String(row.balance))
      if (!startDate) setStartDate(asOf)
      alert(row.currency !== 'PHP'
        ? `${row.native.toLocaleString('en-PH', { minimumFractionDigits: 2 })} ${row.currency} @ ${row.rate} = PHP ${row.balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}.\n\nNot saved yet — press Save.`
        : `PHP ${row.balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })} as of ${row.asOf}.\n\nNot saved yet — press Save.`)
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-left">
        <span className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
          <Wallet size={14} style={{ color: 'var(--teal)' }} /> Opening balance
          {!account.startDate && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>no start date</span>}
        </span>
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
          {account.currency !== 'PHP' ? account.currency : '₱'}{peso(account.beginningBalance)}{account.startDate ? ` · from ${account.startDate}` : ''} · {open ? 'Hide' : 'Edit'}
        </span>
      </button>
      {open && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--light-gray)' }}>
          <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>
            The figure the Balance Sheet starts this account from, and the date reconciliation begins counting Hub entries. Lines dated before it are kept on file but locked from tagging.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs">
              <span className="block mb-1 font-semibold" style={{ color: 'var(--charcoal)' }}>Fiscal year</span>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                {Array.from({ length: 5 }, (_, i) => thisYear - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="block mb-1 font-semibold" style={{ color: 'var(--charcoal)' }}>Opening balance (PHP)</span>
              <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00"
                className="w-40 px-2 py-1.5 rounded-lg border text-xs font-mono" style={{ borderColor: 'var(--light-gray)' }} />
            </label>
            <label className="text-xs">
              <span className="block mb-1 font-semibold" style={{ color: 'var(--charcoal)' }}>Reconcile from</span>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
            </label>
            {canWrite && (
              <>
                <button onClick={prefill} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                  <Wand2 size={13} /> Read from statements
                </button>
                <button onClick={save} disabled={busy} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                </button>
              </>
            )}
          </div>
          {account.currency !== 'PHP' && (
            <p className="text-[11px] mt-2" style={{ color: 'var(--mid-gray)' }}>
              This account is held in {account.currency}. The Balance Sheet is PHP throughout, so the opening balance is stored as its PHP equivalent.
            </p>
          )}
        </div>
      )}
    </div>
  )
}


// Which bank accounts actually buy foreign currency.
//
// Currency-exchange matching has no amount to check — the two sides never agree
// on one — so it pairs on direction and date. That is fine while a single pair
// of accounts exchanges money and misleading as soon as it is not, which is what
// this narrows.
function ForexAccountsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [accounts, setAccounts] = useState<ForexAcct[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/bank-rec/forex-accounts').then(r => r.ok ? r.json() : { accounts: [] }).then(d => {
      setAccounts(d.accounts || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPicked(new Set((d.accounts || []).filter((a: any) => a.isForexAccount).map((a: any) => a.id)))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const save = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/bank-rec/forex-accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds: [...picked] }),
      })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }

  const currencies = [...new Set(accounts.filter(a => picked.has(a.id)).map(a => a.currency || 'PHP'))]
  const onlyOneCurrency = picked.size > 0 && currencies.length < 2

  return (
    <Modal title="Currency exchange accounts" onClose={onClose}>
      <p className="text-sm mb-1" style={{ color: 'var(--mid-gray)' }}>
        Tick the bank accounts that actually take part in buying foreign currency — the account the pesos leave, and the one the currency arrives in.
      </p>
      <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>
        The two sides of an exchange never share an amount, so they are paired on direction and date alone. Narrowing this to the accounts really involved is what keeps that from suggesting unrelated pairs.
      </p>

      {loading ? <p className="text-sm py-6 text-center" style={{ color: 'var(--mid-gray)' }}><Loader2 size={15} className="inline animate-spin" /> Loading…</p> : (
        <div className="space-y-1.5 mb-3 max-h-72 overflow-auto">
          {accounts.map(a => (
            <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer"
              style={{ borderColor: picked.has(a.id) ? 'var(--teal)' : 'var(--light-gray)', background: picked.has(a.id) ? 'var(--off-white)' : 'transparent' }}>
              <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
              <span className="text-xs" style={{ color: 'var(--charcoal)' }}>
                <strong>{a.accountNumber}</strong> — {a.accountTitle}
              </span>
              <span className="ml-auto text-[11px] font-semibold" style={{ color: a.currency !== 'PHP' ? 'var(--deep-teal)' : 'var(--mid-gray)' }}>{a.currency || 'PHP'}</span>
            </label>
          ))}
        </div>
      )}

      {picked.size === 0 && !loading && (
        <p className="text-[11px] rounded-xl px-3 py-2 mb-3" style={{ background: '#fffbeb', color: '#92400e' }}>
          Nothing ticked, so no preference is recorded and every account held in another currency is still considered — the behaviour before this setting existed.
        </p>
      )}
      {onlyOneCurrency && (
        <p className="text-[11px] rounded-xl px-3 py-2 mb-3" style={{ background: '#fffbeb', color: '#92400e' }}>
          Every ticked account is held in {currencies[0]}. An exchange needs two currencies, so nothing will be suggested until an account in another one is ticked too.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
        <button onClick={save} disabled={busy || loading} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
          {busy ? <Loader2 size={14} className="inline animate-spin" /> : null} Save
        </button>
      </div>
    </Modal>
  )
}


// Records the Hub holds that no bank line accounts for.
//
// The grid shows the other half of reconciliation — bank lines with nothing
// matched to them. A payment with no bank line at all appears nowhere in that
// view, which makes it the easier of the two to miss entirely.
function UntaggedPanel() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ from: string; to: string; totalUntagged: number; totalRecords: number; groups: UntaggedGroup[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      const r = await fetch(`/api/bank-rec/untagged?${q}`)
      setData(r.ok ? await r.json() : null)
    } catch { setData(null) } finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { if (open) load() }, [open, load])

  return (
    <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-left">
        <span className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
          <Link2 size={14} style={{ color: 'var(--teal)' }} /> Untagged transactions
          {data && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: data.totalUntagged ? '#fef3c7' : 'var(--off-white)', color: data.totalUntagged ? '#92400e' : 'var(--mid-gray)' }}>
              {data.totalUntagged}
            </span>
          )}
        </span>
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--light-gray)' }}>
          <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>
            Everything recorded in the Hub that no posted bank line points at, across every bank account. The grid above shows the opposite case — bank lines with nothing matched to them.
          </p>
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <label className="text-xs">
              <span className="block mb-1 font-semibold" style={{ color: 'var(--charcoal)' }}>From</span>
              <input type="date" value={from} max={to || today} onChange={e => setFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
            </label>
            <label className="text-xs">
              <span className="block mb-1 font-semibold" style={{ color: 'var(--charcoal)' }}>To</span>
              <input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
            </label>
            <button onClick={load} disabled={loading} className="px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
              {loading ? <Loader2 size={13} className="inline animate-spin" /> : null} Refresh
            </button>
            {data && <span className="text-[11px] ml-auto" style={{ color: 'var(--mid-gray)' }}>{data.from} to {data.to} · {data.totalUntagged} of {data.totalRecords} records untagged</span>}
          </div>

          {loading && !data ? <p className="text-xs py-6 text-center" style={{ color: 'var(--mid-gray)' }}><Loader2 size={14} className="inline animate-spin" /> Loading…</p>
          : !data || data.groups.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--mid-gray)' }}>
              Nothing untagged in this period — every recorded payment has a bank line pointing at it.
            </p>
          ) : (
            <div className="space-y-2">
              {data.groups.map(g => (
                <div key={g.type} className="rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                  <button onClick={() => setExpanded(e => e === g.type ? null : g.type)} className="w-full flex items-center justify-between px-3 py-2 text-left">
                    <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>{g.label}</span>
                    <span className="text-xs flex items-center gap-3">
                      <span style={{ color: 'var(--mid-gray)' }}>{g.count} record{g.count === 1 ? '' : 's'}</span>
                      <strong style={{ color: 'var(--charcoal)' }}>₱{peso(g.total)}</strong>
                      <span style={{ color: 'var(--mid-gray)' }}>{expanded === g.type ? '▲' : '▼'}</span>
                    </span>
                  </button>
                  {expanded === g.type && (
                    <div className="border-t overflow-auto" style={{ borderColor: 'var(--light-gray)', maxHeight: 280 }}>
                      <table className="w-full text-[11px]">
                        <tbody>
                          {g.items.map(i => (
                            <tr key={i.id} className="border-b" style={{ borderColor: 'var(--light-gray)' }}>
                              <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{i.date}</td>
                              <td className="px-3 py-1.5" style={{ color: 'var(--charcoal)' }}>{i.label}</td>
                              <td className="px-3 py-1.5 text-right whitespace-nowrap font-semibold"
                                style={{ color: i.dir === 'out' ? '#b91c1c' : '#166534' }}>₱{peso(i.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {g.truncated && <p className="px-3 py-1.5 text-[10px]" style={{ color: 'var(--mid-gray)' }}>Showing the 200 most recent of {g.count}.</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
