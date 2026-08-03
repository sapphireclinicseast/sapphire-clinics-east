'use client'

// Accounts Payable register — itemizes the 4010 lump so each payable can be
// closed against the account that actually settled it. Salaries and taxes
// clear through RFPs; this is for everything else, which previously had no
// way to close at all.
import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { FileText, Plus, Loader2, Trash2, CheckCircle2, RotateCcw, X } from 'lucide-react'

interface Item {
  id: string; vendor: string; description: string | null; amount: string
  dateIncurred: string; branch: string; status: string
  closedAt: string | null; closeAccountLabel: string | null; closeNote: string | null
}
interface Coa { id: string; accountNumber: string; accountTitle: string }

const peso = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

export default function AccountsPayablePage() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user as { role?: string })?.role || '')
  const [items, setItems] = useState<Item[]>([])
  const [ledgerBalance, setLedgerBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [coa, setCoa] = useState<Coa[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [closeFor, setCloseFor] = useState<Item | null>(null)
  const [tab, setTab] = useState<'OPEN' | 'CLOSED'>('OPEN')

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/accounts-payable')
      const d = await r.json()
      setItems(d.items || []); setLedgerBalance(d.ledgerBalance || 0)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    fetch('/api/chart-of-accounts?pageSize=1000').then(r => r.ok ? r.json() : { data: [] })
      .then(d => setCoa((d.data || []).map((a: Coa) => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle }))))
      .catch(() => {})
  }, [])

  const open = items.filter(i => i.status === 'OPEN')
  const closed = items.filter(i => i.status === 'CLOSED')
  const openTotal = open.reduce((s, i) => s + Number(i.amount), 0)
  const shown = tab === 'OPEN' ? open : closed
  const gap = Math.round((ledgerBalance - openTotal) * 100) / 100

  const act = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/accounts-payable', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
    await load()
  }
  const del = async (i: Item) => {
    if (!confirm(`Delete "${i.vendor}" (₱${peso(Number(i.amount))}) from the register?`)) return
    const r = await fetch(`/api/accounts-payable?id=${i.id}`, { method: 'DELETE' })
    if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <FileText size={22} style={{ color: 'var(--teal)' }} /> Accounts Payable
        </h1>
        {canWrite && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
            <Plus size={15} /> Add payable
          </button>
        )}
      </div>

      {/* Tie-out: the register vs the ledger's 4010 lump */}
      <div className="rounded-2xl border p-4 flex flex-wrap gap-6 items-center" style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
        <div>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Open items in this register</p>
          <p className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(openTotal)} <span className="text-sm font-normal" style={{ color: 'var(--mid-gray)' }}>({open.length})</span></p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>4010 balance on the ledger</p>
          <p className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(ledgerBalance)}</p>
        </div>
        <div className="text-xs max-w-md" style={{ color: Math.abs(gap) < 1 ? '#15803d' : '#b45309' }}>
          {Math.abs(gap) < 1
            ? 'The register accounts for the whole ledger balance.'
            : `₱${peso(Math.abs(gap))} of the ledger balance ${gap > 0 ? 'is not yet itemized here — add the payables that make it up' : 'less than the items listed — some items here may already be settled or double-listed'}.`}
        </div>
      </div>

      <div className="flex border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {([['OPEN', `Open (${open.length})`], ['CLOSED', `Closed (${closed.length})`]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px"
            style={{ borderColor: tab === v ? 'var(--teal)' : 'transparent', color: tab === v ? 'var(--teal)' : 'var(--mid-gray)' }}>{label}</button>
        ))}
      </div>

      {loading ? <div className="py-10 text-center"><Loader2 className="animate-spin inline" size={22} /></div> : shown.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>
          {tab === 'OPEN' ? 'No open payables listed. Add the items that make up the 4010 balance to start closing them.' : 'Nothing closed yet.'}
        </p>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                <th className="px-3 py-2">Vendor</th><th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Incurred</th><th className="px-3 py-2">Branch</th>
                <th className="px-3 py-2 text-right">Amount</th>
                {tab === 'CLOSED' && <th className="px-3 py-2">Settled by</th>}
                {canWrite && <th className="px-3 py-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map(i => (
                <tr key={i.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{i.vendor}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{i.description || '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{String(i.dateIncurred).slice(0, 10)}</td>
                  <td className="px-3 py-2 text-xs">{i.branch}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">₱{peso(Number(i.amount))}</td>
                  {tab === 'CLOSED' && (
                    <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {i.closeAccountLabel}{i.closedAt ? ` · ${String(i.closedAt).slice(0, 10)}` : ''}{i.closeNote ? ` · ${i.closeNote}` : ''}
                    </td>
                  )}
                  {canWrite && (
                    <td className="px-3 py-2 text-right">
                      {i.status === 'OPEN' ? (
                        <span className="inline-flex gap-2">
                          <button onClick={() => setCloseFor(i)} title="Close — post the settling entry" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}><CheckCircle2 size={13} /> Close</button>
                          <button onClick={() => del(i)} title="Remove from register"><Trash2 size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                        </span>
                      ) : (
                        <button onClick={() => { if (confirm('Reopen? The settling journal entry will be removed.')) act({ id: i.id, action: 'reopen' }) }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)' }}><RotateCcw size={12} /> Reopen</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onDone={async () => { setShowAdd(false); await load() }} />}
      {closeFor && <CloseModal item={closeFor} coa={coa} onClose={() => setCloseFor(null)} onDone={async () => { setCloseFor(null); await load() }} />}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold" style={{ color: 'var(--charcoal)' }}>{title}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function AddModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dateIncurred, setDateIncurred] = useState('')
  const [branch, setBranch] = useState('ALL')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/accounts-payable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendor, description, amount: Number(amount), dateIncurred, branch }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Add a payable" onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
        Listing an item here does not post anything — it itemizes the existing 4010 balance. The entry posts when you close it.
      </p>
      <div className="space-y-2">
        <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor / who it is owed to" className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What for (optional)" className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        <div className="flex gap-2">
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          <input type="date" value={dateIncurred} onChange={e => setDateIncurred(e.target.value)} className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          <select value={branch} onChange={e => setBranch(e.target.value)} className="px-2 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
            {['ALL', 'SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA', 'VERDANA_STORE'].map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 className="animate-spin inline" size={14} /> : 'Add'}</button>
        </div>
      </div>
    </Modal>
  )
}

function CloseModal({ item, coa, onClose, onDone }: { item: Item; coa: Coa[]; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('')
  const [closeAccountId, setCloseAccountId] = useState('')
  const [closedOn, setClosedOn] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const filtered = useMemo(() => coa.filter(c => q && `${c.accountNumber} ${c.accountTitle}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8), [coa, q])
  const chosen = coa.find(c => c.id === closeAccountId)
  const save = async () => {
    if (!closeAccountId) { alert('Choose the account that settles this payable.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/accounts-payable', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, action: 'close', closeAccountId, closedOn, note }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <Modal title={`Close — ${item.vendor}`} onClose={onClose}>
      <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>
        ₱{peso(Number(item.amount))}{item.description ? ` · ${item.description}` : ''}. Closing posts
        {' '}<strong>Dr 4010 Accounts Payable / Cr the account below</strong> — the bank or petty cash it was paid from,
        or an income/equity account if it is being written off.
      </p>
      <div className="space-y-2">
        <div className="relative">
          <input value={chosen ? `${chosen.accountNumber} ${chosen.accountTitle}` : q}
            onChange={e => { setQ(e.target.value); setCloseAccountId('') }}
            placeholder="Settling account — search the chart" className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          {!closeAccountId && filtered.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border bg-white shadow-lg max-h-44 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
              {filtered.map(c => (
                <button key={c.id} type="button" onClick={() => { setCloseAccountId(c.id); setQ('') }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">{c.accountNumber} {c.accountTitle}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input type="date" value={closedOn} onChange={e => setClosedOn(e.target.value)} className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional — e.g. check no., write-off reason)" className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 className="animate-spin inline" size={14} /> : 'Close payable'}</button>
        </div>
      </div>
    </Modal>
  )
}
