'use client'

// Accounts Payable register — itemizes the 4010 lump so each payable can be
// closed against the account that actually settled it. Salaries and taxes
// clear through RFPs; this is for everything else, which previously had no
// way to close at all.
import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { FileText, Plus, Loader2, Trash2, CheckCircle2, RotateCcw, X, Search, AlertTriangle } from 'lucide-react'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'

interface Item {
  id: string; vendor: string; description: string | null; amount: string
  currency: string; foreignAmount: string | null; fxRate: string | null
  dateIncurred: string; branch: string; status: string
  closedAt: string | null; closeAccountLabel: string | null; closeNote: string | null
}
interface Coa { id: string; accountNumber: string; accountTitle: string }

const peso = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const CURRENCIES = ['PHP', 'CNY', 'USD', 'EUR', 'JPY', 'KRW', 'SGD', 'HKD', 'GBP']
const BRANCH_LABEL: Record<string, string> = { ALL: 'All branches', SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA: 'Verdana', VERDANA_STORE: 'Verdana Store' }
const TH = 'text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap text-[var(--mid-gray)]'

/** The rate on file for a currency on a date, to suggest in a rate box. */
function useRateOnFile(currency: string, date: string): number | null {
  const [found, setFound] = useState<{ key: string; rate: number | null }>({ key: '', rate: null })
  const key = `${currency}|${date}`
  useEffect(() => {
    if (currency === 'PHP') return
    let stale = false
    fetch(`/api/reports/fx-rate?currency=${currency}${date ? `&asOf=${date}` : ''}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!stale) setFound({ key, rate: Number(d?.phpPerUnit) > 0 ? Number(d.phpPerUnit) : null }) })
      .catch(() => {})
    return () => { stale = true }
  }, [currency, date, key])
  return currency !== 'PHP' && found.key === key ? found.rate : null
}

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
  const [search, setSearch] = useState('')

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

  const closedTotal = closed.reduce((s, i) => s + Number(i.amount), 0)
  const needle = search.trim().toLowerCase()
  const listed = needle
    ? shown.filter(i => `${i.vendor} ${i.description || ''} ${i.closeAccountLabel || ''} ${i.closeNote || ''}`.toLowerCase().includes(needle))
    : shown
  const listedTotal = listed.reduce((s, i) => s + Number(i.amount), 0)
  const matched = Math.abs(gap) < 1
  const colCount = 5 + (tab === 'CLOSED' ? 1 : 0) + (canWrite ? 1 : 0)

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <FileText size={22} style={{ color: 'var(--teal)' }} /> Accounts Payable
          </h1>
          <p className="mt-1 text-[13px] max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
            Itemizes the 4010 Accounts Payable balance so each bill can be closed against the account that settled it. Salaries and taxes clear through RFPs instead.
          </p>
        </div>
        {canWrite && (
          <button onClick={() => setShowAdd(true)} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
            <Plus size={15} /> Add payable
          </button>
        )}
      </div>

      {/* Tie-out: the register vs the ledger's 4010 lump */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard compact loading={loading} label="Open payables" value={`₱${peso(openTotal)}`}
          sub={`${open.length} item${open.length === 1 ? '' : 's'} to close`} tone={open.length ? 'amber' : 'zero'}
          active={tab === 'OPEN'} activeSub={`${open.length} item${open.length === 1 ? '' : 's'} · showing below`} onClick={() => setTab('OPEN')} />
        <StatCard compact loading={loading} label="4010 on the ledger" value={`₱${peso(ledgerBalance)}`}
          sub="Opening balance + this year's postings" accent={{ line: '#4A8073' }} />
        <StatCard compact loading={loading} label="Difference" value={`₱${peso(Math.abs(gap))}`}
          sub={matched ? 'Register covers the whole balance' : gap > 0 ? 'Ledger balance not yet itemized' : 'Listed above the ledger balance'}
          tone={matched ? 'green' : 'amber'} title="4010 ledger balance minus the open items listed here" />
        <StatCard compact loading={loading} label="Closed" value={`₱${peso(closedTotal)}`}
          sub={`${closed.length} settled or written off`} tone={closed.length ? 'green' : 'zero'}
          active={tab === 'CLOSED'} activeSub={`${closed.length} item${closed.length === 1 ? '' : 's'} · showing below`} onClick={() => setTab('CLOSED')} />
      </div>

      {!loading && !matched && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg border text-[13px]" style={{ background: '#fffbeb', borderColor: '#fde68a', borderLeft: '4px solid #d97706', color: '#92400e' }}>
          <AlertTriangle size={15} className="flex-none mt-0.5" />
          <span>₱{peso(Math.abs(gap))} of the ledger balance {gap > 0 ? 'is not yet itemized here — add the payables that make it up' : 'less than the items listed — some items here may already be settled or double-listed'}.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b-2" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex items-end gap-1 -mb-[2px] max-w-full overflow-x-auto" role="tablist">
          {([['OPEN', 'Open', open.length], ['CLOSED', 'Closed', closed.length]] as const).map(([v, label, n]) => (
            <button key={v} onClick={() => setTab(v)} role="tab" aria-selected={tab === v}
              className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 whitespace-nowrap transition-colors hover:text-[var(--teal)]"
              style={{ fontFamily: 'var(--font-display)', borderColor: tab === v ? 'var(--teal)' : 'transparent', color: tab === v ? 'var(--teal)' : 'var(--mid-gray)' }}>
              {label}
              {!loading && <span className="px-1.5 rounded-full text-[11px] font-bold" style={{ background: tab === v ? 'var(--pale-teal)' : '#f1f5f2', color: tab === v ? 'var(--deep-teal)' : 'var(--mid-gray)' }}>{n}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--hr-faint)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tab === 'OPEN' ? 'Search vendor or description…' : 'Search vendor, description or account…'}
              className="w-full h-8 pl-8 pr-3 rounded-lg border text-xs bg-white" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{listed.length} of {shown.length}</span>
          <div className="ml-auto hidden md:flex items-center gap-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#d97706' }} />Open</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#059669' }} />Closed</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--hr-head)' }}>
                <th className={TH}>Vendor</th><th className={TH}>Description</th>
                <th className={TH}>Incurred</th><th className={TH}>Branch</th>
                <th className={`${TH} text-right`}>Amount</th>
                {tab === 'CLOSED' && <th className={TH}>Settled by</th>}
                {canWrite && <th className={`${TH} text-right`}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [0, 1, 2, 3].map(k => <tr key={k} className="border-t" style={{ borderColor: 'var(--hr-line)' }}><td colSpan={colCount} className="px-4 py-2.5"><div className="h-5 rounded hr-shimmer" /></td></tr>)
              ) : listed.length === 0 ? (
                <tr><td colSpan={colCount} className="text-center py-12 text-[13px]" style={{ color: 'var(--mid-gray)' }}>
                  {needle ? 'No payables match this search.' : tab === 'OPEN' ? 'No open payables listed. Add the items that make up the 4010 balance to start closing them.' : 'Nothing closed yet.'}
                </td></tr>
              ) : listed.map(i => {
                const isOpen = i.status === 'OPEN'
                return (
                  <tr key={i.id} className="border-t transition-colors hover:bg-[#fafcf6]" style={{ borderColor: 'var(--hr-line)' }}>
                    <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)', boxShadow: `inset 4px 0 0 ${isOpen ? '#d97706' : '#059669'}` }}>{i.vendor}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{i.description || '—'}</td>
                    <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{String(i.dateIncurred).slice(0, 10)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{BRANCH_LABEL[i.branch] || i.branch}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                      ₱{peso(Number(i.amount))}
                      {i.currency !== 'PHP' && i.foreignAmount && (
                        <span className="block text-[11px] font-normal" style={{ color: 'var(--mid-gray)' }}>{i.currency} {peso(Number(i.foreignAmount))} @ {Number(i.fxRate)}</span>
                      )}
                    </td>
                    {tab === 'CLOSED' && (
                      <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                        {i.closeAccountLabel && <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{i.closeAccountLabel}</span>}
                        {i.closedAt ? <span className="font-mono"> · {String(i.closedAt).slice(0, 10)}</span> : ''}{i.closeNote ? ` · ${i.closeNote}` : ''}
                      </td>
                    )}
                    {canWrite && (
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {isOpen ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button onClick={() => setCloseFor(i)} title="Close — post the settling entry" className={hrBtn.ghost} style={{ borderColor: 'var(--teal)', color: 'var(--deep-teal)' }}><CheckCircle2 size={13} /> Close</button>
                            <button onClick={() => del(i)} title="Remove from register" aria-label={`Remove ${i.vendor} from the register`} className="p-1.5 rounded hover:bg-red-50"><Trash2 size={14} className="text-red-500" /></button>
                          </span>
                        ) : (
                          <button onClick={() => { if (confirm('Reopen? The settling journal entry will be removed.')) act({ id: i.id, action: 'reopen' }) }} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}><RotateCcw size={12} /> Reopen</button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            {!loading && listed.length > 0 && (
              <tfoot>
                <tr className="border-t-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)' }}>
                  <td colSpan={4} className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Total · {listed.length} item{listed.length === 1 ? '' : 's'}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>₱{peso(listedTotal)}</td>
                  {colCount > 5 && <td colSpan={colCount - 5} />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onDone={async () => { setShowAdd(false); await load() }} />}
      {closeFor && <CloseModal item={closeFor} coa={coa} onClose={() => setCloseFor(null)} onDone={async () => { setCloseFor(null); await load() }} />}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-xl border shadow-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--pale-teal)]"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
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
  const [currency, setCurrency] = useState('PHP')
  const [rate, setRate] = useState('')
  const [busy, setBusy] = useState(false)
  const foreign = currency !== 'PHP'
  const rateOnFile = useRateOnFile(currency, dateIncurred)
  const effRate = foreign ? (Number(rate) || rateOnFile || 0) : 0
  const save = async () => {
    if (foreign && !(effRate > 0)) { alert(`Enter the PHP rate for 1 ${currency}.`); return }
    setBusy(true)
    try {
      const r = await fetch('/api/accounts-payable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendor, description, amount: Number(amount), dateIncurred, branch, currency, ...(foreign ? { fxRate: effRate } : {}) }) })
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
        <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor / who it is owed to" className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What for (optional)" className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        <div className="flex gap-2">
          <select value={currency} onChange={e => { setCurrency(e.target.value); setRate('') }} aria-label="Currency" className="px-2 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder={foreign ? `Amount in ${currency}` : 'Amount'} className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <div className="flex gap-2">
          <input type="date" value={dateIncurred} onChange={e => setDateIncurred(e.target.value)} className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          <select value={branch} onChange={e => setBranch(e.target.value)} className="flex-1 min-w-0 px-2 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
            {['ALL', 'SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA', 'VERDANA_STORE'].map(b => <option key={b} value={b}>{BRANCH_LABEL[b] || b}</option>)}
          </select>
        </div>
        {foreign && (
          <div className="rounded-lg border px-3 py-2 flex items-center gap-2 flex-wrap" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <label className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>PHP per 1 {currency}</label>
            <input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" placeholder={rateOnFile ? String(rateOnFile) : '0.0000'}
              className="w-28 px-2 py-1 rounded-lg border text-xs font-mono" style={{ borderColor: 'var(--light-gray)' }} />
            <span className="text-xs font-semibold ml-auto" style={{ color: 'var(--deep-teal)' }}>
              {effRate > 0 ? `= ₱${peso(Math.round(Number(amount) * effRate * 100) / 100)}` : 'no rate on file'}
            </span>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 className="animate-spin inline" size={14} /> : 'Add'}</button>
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
  const [noJournal, setNoJournal] = useState(false)
  const [busy, setBusy] = useState(false)
  const filtered = useMemo(() => coa.filter(c => q && `${c.accountNumber} ${c.accountTitle}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8), [coa, q])
  const chosen = coa.find(c => c.id === closeAccountId)
  const foreign = item.currency !== 'PHP' && !!item.foreignAmount
  const [rate, setRate] = useState('')
  const rateOnFile = useRateOnFile(foreign ? item.currency : 'PHP', closedOn)
  const effRate = foreign ? (Number(rate) || rateOnFile || 0) : 0
  const paid = foreign && effRate > 0 ? Math.round(Number(item.foreignAmount) * effRate * 100) / 100 : Number(item.amount)
  const fxGap = Math.round((paid - Number(item.amount)) * 100) / 100
  const save = async () => {
    if (!noJournal && !closeAccountId) { alert('Choose the account that settles this payable.'); return }
    if (!noJournal && foreign && !(effRate > 0)) { alert(`Enter the PHP rate for 1 ${item.currency} it was paid at.`); return }
    setBusy(true)
    try {
      const r = await fetch('/api/accounts-payable', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, action: 'close', closeAccountId, closedOn, note, noJournal, ...(foreign ? { fxRate: effRate } : {}) }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <Modal title={`Close — ${item.vendor}`} onClose={onClose}>
      <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>
        ₱{peso(Number(item.amount))}{foreign ? ` (${item.currency} ${peso(Number(item.foreignAmount))} @ ${Number(item.fxRate)})` : ''}{item.description ? ` · ${item.description}` : ''}. Closing posts
        {' '}<strong>Dr 4010 Accounts Payable / Cr the account below</strong> — the bank or petty cash it was paid from,
        or an income/equity account if it is being written off.
      </p>
      <div className="space-y-2">
        <label className="flex items-start gap-2 text-xs rounded-lg border p-2" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          <input type="checkbox" checked={noJournal} onChange={e => setNoJournal(e.target.checked)} className="mt-0.5" />
          <span><strong>Already settled — close without posting.</strong> For items the ledger never carried (e.g. old
          QuickBooks bills whose payments were recorded separately). Nothing posts; the item is just marked closed.</span>
        </label>
        {!noJournal && (
        <div className="relative">
          <input value={chosen ? `${chosen.accountNumber} ${chosen.accountTitle}` : q}
            onChange={e => { setQ(e.target.value); setCloseAccountId('') }}
            placeholder="Settling account — search the chart" className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          {!closeAccountId && filtered.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border bg-white shadow-lg max-h-44 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
              {filtered.map(c => (
                <button key={c.id} type="button" onClick={() => { setCloseAccountId(c.id); setQ('') }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">{c.accountNumber} {c.accountTitle}</button>
              ))}
            </div>
          )}
        </div>
        )}
        {!noJournal && foreign && (
          <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Paid at: PHP per 1 {item.currency}</label>
              <input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" placeholder={rateOnFile ? String(rateOnFile) : '0.0000'}
                className="w-28 px-2 py-1 rounded-lg border text-xs font-mono" style={{ borderColor: 'var(--light-gray)' }} />
              <span className="text-xs font-semibold ml-auto" style={{ color: 'var(--deep-teal)' }}>
                {effRate > 0 ? `= ₱${peso(paid)}` : 'no rate on file'}
              </span>
            </div>
            {effRate > 0 && fxGap !== 0 && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>
                ₱{peso(Math.abs(fxGap))} exchange {fxGap > 0 ? 'loss' : 'gain'} posts to 8400 Exchange Gain or Loss.
              </p>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <input type="date" value={closedOn} onChange={e => setClosedOn(e.target.value)} className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional — e.g. check no., write-off reason)" className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 className="animate-spin inline" size={14} /> : 'Close payable'}</button>
        </div>
      </div>
    </Modal>
  )
}
