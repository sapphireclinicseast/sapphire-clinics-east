'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { ArrowLeftRight, Upload, Plus, Loader2, X, Search, Check, Link2, Ban, RotateCcw, Trash2 } from 'lucide-react'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface BankAcct { id: string; accountNumber: string; accountTitle: string; currency: string; pendingCount: number; postedCount: number; excludedCount: number; beginningBalance: number; startDate: string | null; postedBalance: number }
interface Txn { id: string; date: string; description: string; spent: number; received: number; status: string; fromToName: string | null; categoryAccountId: string | null; categoryLabel: string | null; matchType: string | null; matchId: string | null; matchLabel: string | null; note: string | null; proofUrl: string | null }
interface Coa { id: string; accountNumber: string; accountTitle: string }
interface Match { type: string; id: string; label: string; date: string; amount: number }

export default function BankReconciliationPage() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user?.role as string) || '')

  const [accounts, setAccounts] = useState<BankAcct[]>([])
  const [sel, setSel] = useState('')
  const [tab, setTab] = useState<'PENDING' | 'POSTED' | 'EXCLUDED'>('PENDING')
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [coa, setCoa] = useState<Coa[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [matchFor, setMatchFor] = useState<Txn | null>(null)
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

  const refreshAll = async () => { await Promise.all([loadAccounts(), loadTxns()]) }
  const act = async (body: Record<string, unknown>) => { const r = await fetch('/api/bank-rec/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) { alert((await r.json()).error || 'Failed'); return } await refreshAll() }
  const del = async (id: string) => { if (!confirm('Delete this bank line?')) return; await fetch(`/api/bank-rec/transactions?id=${id}`, { method: 'DELETE' }); await refreshAll() }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <ArrowLeftRight size={22} style={{ color: 'var(--teal)' }} /> Bank transactions
        </h1>
        {canWrite && sel && (
          <div className="flex items-center gap-2">
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

          {/* Tabs + search */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex rounded-xl overflow-hidden border w-fit" style={{ borderColor: 'var(--light-gray)' }}>
              {([['PENDING', `Pending (${account?.pendingCount ?? 0})`], ['POSTED', `Posted (${account?.postedCount ?? 0})`], ['EXCLUDED', `Excluded (${account?.excludedCount ?? 0})`]] as const).map(([k, lbl]) => (
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
  const [map, setMap] = useState<{ date: string; description: string; spent: string; received: string }>({ date: '', description: '', spent: '', received: '' })
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File | null) => {
    if (!file) return
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
      date: find(['date']), description: find(['description', 'desc', 'details', 'narration', 'particular']),
      spent: find(['spent', 'debit', 'withdraw', 'paid out', 'out']), received: find(['received', 'credit', 'deposit', 'paid in']),
    })
  }
  const toNum = (v: unknown) => { const n = parseFloat(String(v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : Math.abs(n) }
  const toDate = (v: unknown) => { if (v instanceof Date) return v.toISOString().slice(0, 10); const d = new Date(String(v)); return isNaN(+d) ? '' : d.toISOString().slice(0, 10) }
  const preview = useMemo(() => rows.slice(0, 5).map(r => ({ date: toDate(r[map.date]), description: String(r[map.description] || ''), spent: toNum(r[map.spent]), received: toNum(r[map.received]) })), [rows, map])

  const importRows = async () => {
    if (!map.date || !map.description || (!map.spent && !map.received)) { alert('Map Date, Description, and at least one of Spent / Received.'); return }
    const payload = rows.map(r => ({ date: toDate(r[map.date]), description: String(r[map.description] || ''), spent: toNum(r[map.spent]), received: toNum(r[map.received]) })).filter(r => r.date && (r.spent > 0 || r.received > 0))
    if (!payload.length) { alert('No valid rows after mapping.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/bank-rec/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bankAccountId, rows: payload, batchStamp: preview[0]?.date || '' }) })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Import failed'); return }
      alert(`Imported ${d.imported} transaction(s).`); onDone()
    } finally { setBusy(false) }
  }
  const Sel = ({ k, label }: { k: keyof typeof map; label: string }) => (
    <div><label className="block text-[11px] font-semibold mb-0.5" style={{ color: 'var(--charcoal)' }}>{label}</label>
      <select value={map[k]} onChange={e => setMap(m => ({ ...m, [k]: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
        <option value="">—</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  )
  return (
    <Modal title="Upload bank statement" onClose={onClose} wide>
      <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>Upload a CSV or Excel statement. The first sheet&apos;s header row is used; map the columns below.</p>
      <input type="file" accept=".csv,.xlsx,.xls" onChange={e => onFile(e.target.files?.[0] || null)} className="mb-3 text-xs" />
      {headers.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <Sel k="date" label="Date" /><Sel k="description" label="Description" /><Sel k="spent" label="Spent (debit)" /><Sel k="received" label="Received (credit)" />
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
  const [busy, setBusy] = useState(false)
  useEffect(() => { fetch(`/api/bank-rec/matches?txnId=${txn.id}`).then(r => r.ok ? r.json() : { matches: [] }).then(d => setMatches(d.matches || [])).catch(() => setMatches([])) }, [txn.id])
  const pick = async (m: Match) => { setBusy(true); try { await fetch('/api/bank-rec/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: txn.id, action: 'match', matchType: m.type, matchId: m.id, matchLabel: m.label }) }); onDone() } finally { setBusy(false) } }
  return (
    <Modal title="Match to a recorded transaction" onClose={onClose}>
      <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{txn.date} · {txn.description} · <strong>₱{peso(txn.spent > 0 ? txn.spent : txn.received)}</strong></p>
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
