'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { ArrowLeftRight, Upload, Plus, Loader2, X, Search, Check, Link2, Ban, RotateCcw, Trash2, Download, Lock, Unlock } from 'lucide-react'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface BankAcct { id: string; accountNumber: string; accountTitle: string; currency: string; pendingCount: number; postedCount: number; excludedCount: number; archivedCount: number; beginningBalance: number; startDate: string | null; postedBalance: number }
interface Txn { id: string; date: string; description: string; spent: number; received: number; status: string; fromToName: string | null; categoryAccountId: string | null; categoryLabel: string | null; matchType: string | null; matchId: string | null; matchLabel: string | null; note: string | null; proofUrl: string | null }
interface Coa { id: string; accountNumber: string; accountTitle: string }
interface Match { type: string; id: string; label: string; date: string; amount: number }
interface FxMatch { id: string; label: string; date: string; amount: number; currency: string; rate: number | null }
interface ImportBatch { id: string; fileName: string | null; createdAt: string; createdBy: string | null; total: number; pending: number; posted: number; archived: number; from: string | null; to: string | null }

export default function BankReconciliationPage() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user?.role as string) || '')
  const isAdmin = (session?.user?.role as string) === 'ADMIN'

  const [accounts, setAccounts] = useState<BankAcct[]>([])
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
  const [showImports, setShowImports] = useState(false)
  const [catFor, setCatFor] = useState<Txn | null>(null)

  const account = accounts.find(a => a.id === sel) || null

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

  const refreshAll = async () => { await Promise.all([loadAccounts(), loadTxns(), loadImports()]) }
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
            {account?.startDate && (account?.pendingCount ?? 0) > 0 && (
              <button onClick={lockOlder} title={`Lock untagged lines dated before ${account.startDate}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Lock size={14} /> Lock pre-{account.startDate.slice(0, 7)}</button>
            )}
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Upload size={14} /> Upload from file</button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Add transaction</button>
          </div>
        )}
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-2xl border p-6 text-sm" style={{ borderColor: '#fde68a', background: '#fffbeb', color: '#92400e' }}>
          No bank accounts yet. In <strong>Chart of Accounts</strong>, tick <strong>&quot;Is this a bank account?&quot;</strong> on your Current-Asset bank accounts, then set their opening balance &amp; start date in <strong>Beginning Balances</strong>.
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
                <p className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(a.postedBalance)}</p>
                <p className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>Posted balance{a.startDate ? ` · since ${a.startDate}` : ''}</p>
              </button>
            ))}
          </div>

          {account && !account.startDate && (
            <div className="rounded-xl border px-4 py-2 text-xs" style={{ borderColor: '#fde68a', background: '#fffbeb', color: '#92400e' }}>
              No reconciliation start date set for this account. Set one in <strong>Beginning Balances</strong> so matching only considers Hub entries from that date onward.
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
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description…" className="pl-8 pr-3 py-2 rounded-xl border text-xs" style={{ borderColor: 'var(--light-gray)', minWidth: 220 }} />
            </div>
          </div>

          {/* Grid */}
          <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--off-white)' }}>
                  {['Date', 'Bank Description', 'Spent', 'Received', 'From/To', 'Match / Categorise', 'Action'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
                ) : txns.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>No {tab.toLowerCase()} transactions.</td></tr>
                ) : txns.map(t => (
                  <tr key={t.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{t.date}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{t.description}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold" style={{ color: t.spent > 0 ? '#b91c1c' : 'var(--light-gray)' }}>{t.spent > 0 ? `₱${peso(t.spent)}` : ''}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold" style={{ color: t.received > 0 ? '#166534' : 'var(--light-gray)' }}>{t.received > 0 ? `₱${peso(t.received)}` : ''}</td>
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
                          <button onClick={() => setMatchFor(t)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}><Link2 size={13} /> Match</button>
                          <button onClick={() => setCatFor(t)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white mr-1" style={{ background: 'var(--teal)' }}><Check size={13} /> Categorise</button>
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

      {showUpload && account && <UploadModal bankAccountId={account.id} onClose={() => setShowUpload(false)} onDone={async () => { setShowUpload(false); await refreshAll() }} />}
      {showAdd && account && <AddModal bankAccountId={account.id} onClose={() => setShowAdd(false)} onDone={async () => { setShowAdd(false); await refreshAll() }} />}
      {catFor && <CategoriseModal txn={catFor} coa={coa} onClose={() => setCatFor(null)} onDone={async () => { setCatFor(null); await refreshAll() }} />}
      {matchFor && <MatchModal txn={matchFor} onClose={() => setMatchFor(null)} onCategorise={() => { setCatFor(matchFor); setMatchFor(null) }} onDone={async () => { setMatchFor(null); await refreshAll() }} />}
    </div>
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
      if (d.archived) bits.push(`${d.archived} pre-date the reconciliation start date and were filed as Archived (locked from tagging).`)
      if (d.skipped) bits.push(`${d.skipped} skipped as already on file.`)
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

function CategoriseModal({ txn, coa, onClose, onDone }: { txn: Txn; coa: Coa[]; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('')
  const [categoryAccountId, setCat] = useState('')
  const [fromToName, setFromTo] = useState(txn.fromToName || '')
  const [busy, setBusy] = useState(false)
  const filtered = coa.filter(c => !q || `${c.accountNumber} ${c.accountTitle}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50)
  const save = async () => {
    if (!categoryAccountId) { alert('Choose a category account.'); return }
    setBusy(true)
    try { const r = await fetch('/api/bank-rec/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: txn.id, action: 'categorise', categoryAccountId, fromToName }) }); if (!r.ok) { alert((await r.json()).error || 'Failed'); return } onDone() } finally { setBusy(false) }
  }
  return (
    <Modal title="Categorise & post" onClose={onClose}>
      <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{txn.date} · {txn.description} · <strong>₱{peso(txn.spent > 0 ? txn.spent : txn.received)}</strong> {txn.spent > 0 ? '(out)' : '(in)'}</p>
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>From / To (payee or customer)</label>
      <input value={fromToName} onChange={e => setFromTo(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Category account</label>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search account…" className="w-full px-3 py-2 rounded-xl border text-sm mb-1" style={{ borderColor: 'var(--light-gray)' }} />
      <div className="rounded-xl border overflow-auto mb-3" style={{ borderColor: 'var(--light-gray)', maxHeight: 200 }}>
        {filtered.map(c => (
          <button key={c.id} onClick={() => setCat(c.id)} className="block w-full text-left px-3 py-1.5 text-xs" style={{ background: categoryAccountId === c.id ? 'var(--pale-teal)' : '#fff', color: 'var(--charcoal)' }}>{c.accountNumber} — {c.accountTitle}</button>
        ))}
      </div>
      <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Posts a journal entry: {txn.spent > 0 ? 'debit the category, credit this bank account.' : 'debit this bank account, credit the category.'}</p>
      <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Categorise & post'}</button>
    </Modal>
  )
}

function MatchModal({ txn, onClose, onDone, onCategorise }: { txn: Txn; onClose: () => void; onDone: () => void; onCategorise: () => void }) {
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [fx, setFx] = useState<FxMatch[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { fetch(`/api/bank-rec/matches?txnId=${txn.id}`).then(r => r.ok ? r.json() : { matches: [] }).then(d => setMatches(d.matches || [])).catch(() => setMatches([])) }, [txn.id])
  useEffect(() => { fetch(`/api/bank-rec/matches?txnId=${txn.id}&mode=forex`).then(r => r.ok ? r.json() : { matches: [] }).then(d => setFx(d.matches || [])).catch(() => setFx([])) }, [txn.id])
  const pick = async (m: Match) => { setBusy(true); try { await fetch('/api/bank-rec/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: txn.id, action: 'match', matchType: m.type, matchId: m.id, matchLabel: m.label }) }); onDone() } finally { setBusy(false) } }
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
        : matches.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>No suggested matches (by amount within 7 days). You can categorise it instead.</p>
            <button onClick={onCategorise} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>Categorise instead</button>
          </div>
        ) : (
          <div className="space-y-2">
            {matches.map(m => (
              <button key={`${m.type}-${m.id}`} onClick={() => pick(m)} disabled={busy} className="w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left disabled:opacity-50" style={{ borderColor: 'var(--light-gray)' }}>
                <div><p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{m.label}</p><p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{m.date}</p></div>
                <span className="text-sm font-semibold" style={{ color: 'var(--deep-teal)' }}>₱{peso(m.amount)}</span>
              </button>
            ))}
          </div>
        )}
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
