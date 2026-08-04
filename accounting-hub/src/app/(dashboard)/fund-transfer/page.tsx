'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Repeat, Plus, Settings, Loader2, X, Eye, Pencil, Trash2, ListChecks, Info, ArrowLeftRight } from 'lucide-react'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'
import { ScanUpload } from '@/components/ScanUpload'
import ForexPanel from './ForexPanel'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Bank { id: string; accountNumber: string; accountTitle: string; currency: string; isCheckingAccount?: boolean }
interface Transfer { id: string; matchedLegs?: number; refNumber: string; date: string; fromAccountId: string; toAccountId: string; fromLabel: string; toLabel: string; amount: number; checkNumber: string | null; description: string | null; proofUrl: string | null; proofUrls?: string[] | null }

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
  const shown = applySortFilter(transfers, get, sort.key, sort.dir, filters)

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <Repeat size={22} style={{ color: 'var(--teal)' }} /> Fund Transfer
        </h1>
        <div className="flex items-center gap-2">
          {view === 'transfers' && canWrite && <button onClick={() => { setEditing(null); setShowForm(true) }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> New Transfer</button>}
          {view === 'transfers' && canWrite && <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}><Settings size={14} /> Settings</button>}
        </div>
      </div>

      {/* Sub-section tabs */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {([['transfers', 'Fund Transfers', Repeat], ['forex', 'Foreign Exchange', ArrowLeftRight], ['checks', 'Check Release Monitoring', ListChecks]] as const).map(([v, label, Icon]) => (
          <button key={v} onClick={() => setView(v)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={{ borderColor: view === v ? 'var(--teal)' : 'transparent', color: view === v ? 'var(--teal)' : 'var(--mid-gray)' }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {view === 'checks' ? <CheckReleaseMonitoring canWrite={canWrite} />
        : view === 'forex' ? <ForexPanel banks={banks} canWrite={canWrite} /> : (<>

      <div className="rounded-xl border px-4 py-2.5 text-sm flex items-start gap-2" style={{ borderColor: '#bfdbfe', background: '#eff6ff', color: '#1e3a8a' }}>
        <Info size={16} className="mt-0.5 flex-shrink-0" />
        <span>Record the transaction under the branch that is the <strong>RECEIVER</strong> of the fund transfer.</span>
      </div>

      {banks.length === 0 && !loading && (
        <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: '#fde68a', background: '#fffbeb', color: '#92400e' }}>
          No bank accounts yet. In <strong>Chart of Accounts</strong>, add/edit a Current-Asset account and tick <strong>&quot;Is this a bank account?&quot;</strong> to make it selectable here.
        </div>
      )}

      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <SortFilterHead cols={cols} sortKey={sort.key} sortDir={sort.dir} filters={filters} onToggleSort={toggleSort} onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))} trailing={canWrite} />
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
            ) : shown.map(t => (
              <tr key={t.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                  {(t.matchedLegs ?? 0) > 0 && (
                    <span title={t.matchedLegs === 2 ? 'Both bank legs matched in Bank Reconciliation' : 'One of two bank legs matched in Bank Reconciliation'}
                      style={{ color: t.matchedLegs === 2 ? '#eab308' : 'var(--light-gray)', marginRight: 4 }}>★</span>
                  )}
                  {t.refNumber}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{t.date}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{t.fromLabel}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{t.toLabel}</td>
                <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(t.amount)}</td>
                <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{t.checkNumber || ''}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{t.description || ''}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {(t.proofUrls && t.proofUrls.length ? t.proofUrls : (t.proofUrl ? [t.proofUrl] : [])).map((url, i) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px]" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Eye size={12} /> {i + 1}</a>
                    ))}
                  </div>
                </td>
                {canWrite && (
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => { setEditing(t); setShowForm(true) }} className="p-1 rounded hover:bg-teal-50 mr-1"><Pencil size={13} style={{ color: 'var(--teal)' }} /></button>
                    <button onClick={() => remove(t)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} style={{ color: '#dc2626' }} /></button>
                  </td>
                )}
              </tr>
            ))}
            {!loading && shown.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>{transfers.length === 0 ? 'No fund transfers yet.' : 'No transfers match the current filters.'}</td></tr>}
          </tbody>
        </table>
      </div>
      </>)}

      {showForm && <TransferForm banks={banks} editing={editing} onClose={() => setShowForm(false)} onSaved={async () => { setShowForm(false); await load() }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

interface CheckRow { id?: string; kind?: 'PETTY_CASH' | 'RFP' | 'FUND_TRANSFER' | 'CANCELLED'; source: string; checkNumber: string; date: string | null; amount: number; reference: string; payee: string; bankAccount: string; proofUrls?: string[] }

function CheckReleaseMonitoring({ canWrite }: { canWrite: boolean }) {
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([])
  const [accountId, setAccountId] = useState('all')
  const [checks, setChecks] = useState<CheckRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCancel, setShowCancel] = useState(false)

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
    { key: 'bankAccount', label: 'Bank Account' }, { key: 'amount', label: 'Amount' },
  ]
  const get = (c: CheckRow, k: string): string | number => k === 'amount' ? c.amount : ((c[k as keyof CheckRow] as string | number) ?? '')
  const shown = applySortFilter(checks, get, sort.key, sort.dir, filters)

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
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Checking Account:</label>
        <select value={accountId} onChange={e => setAccountId(e.target.value)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)', minWidth: 260 }}>
          <option value="all">All checking accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{shown.length} check(s) · Total ₱{peso(total)}</span>
        {canWrite && accounts.length > 0 && (
          <button onClick={() => setShowCancel(true)} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: '#dc2626' }}>
            <Plus size={14} /> Record Cancelled Check
          </button>
        )}
      </div>

      {accounts.length === 0 && !loading && (
        <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: '#fde68a', background: '#fffbeb', color: '#92400e' }}>
          No checking accounts yet. In <strong>Chart of Accounts</strong>, edit a bank account and tick <strong>&quot;Is this a checking account?&quot;</strong>.
        </div>
      )}

      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <SortFilterHead cols={cols} sortKey={sort.key} sortDir={sort.dir} filters={filters} onToggleSort={toggleSort} onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))} trailing={canWrite} />
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
            ) : shown.map((c, i) => {
              const isCancelled = c.source === 'Cancelled'
              return (
              <tr key={`${c.source}-${c.reference}-${c.checkNumber}-${i}`} className="border-t" style={{ borderColor: 'var(--light-gray)', background: isCancelled ? '#fef2f2' : undefined }}>
                <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)', textDecoration: isCancelled ? 'line-through' : undefined }}>
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
                <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{c.date || ''}</td>
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
                <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(c.amount)}</td>
                {canWrite && <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {c.id && c.kind && editing !== `${c.kind}:${c.id}` && (
                    <button onClick={() => startEdit(c)} className="p-1 rounded hover:bg-gray-100" title="Correct the cheque number — updates the source record and everything that reads from it">
                      <Pencil size={13} style={{ color: 'var(--teal)' }} />
                    </button>
                  )}
                  {isCancelled && c.id && <button onClick={() => removeCancelled(c.id!)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} style={{ color: '#dc2626' }} /></button>}
                </td>}
              </tr>
            )})}
            {!loading && shown.length === 0 && accounts.length > 0 && <tr><td colSpan={8} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>{checks.length === 0 ? 'No checks recorded for the selected checking account(s).' : 'No checks match the current filters.'}</td></tr>}
          </tbody>
        </table>
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
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Record Cancelled Check</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Checking Account</label>
        <select value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select account…</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Check Number</label>
        <input value={checkNumber} onChange={e => setCheckNumber(e.target.value)} placeholder="Leading zeros preserved" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-3" style={{ borderColor: 'var(--light-gray)' }} />
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
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
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
        <input value={checkNumber} onChange={e => setCheckNumber(e.target.value)} placeholder="Leading zeros preserved" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-3" style={{ borderColor: 'var(--light-gray)' }} />
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
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Fund Transfer Settings</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Next reference number</label>
        <p className="text-[11px] mb-2" style={{ color: 'var(--mid-gray)' }}>The next transfer will be numbered FT{yy}-{String(parseInt(nextSeq || '1', 10) || 1).padStart(6, '0')}.</p>
        <input value={nextSeq} onChange={e => setNextSeq(e.target.value.replace(/[^0-9]/g, ''))} className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-4" style={{ borderColor: 'var(--light-gray)' }} />
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Save'}</button>
      </div>
    </div>
  )
}
