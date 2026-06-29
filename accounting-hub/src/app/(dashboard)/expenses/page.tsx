'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Settings, Loader2, Trash2, X, Maximize2, Minimize2, Search, ArrowUp, ArrowDown, Upload, Eye, Wallet, CreditCard } from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────
const BRANCHES = [
  { code: 'AHEA', value: 'SANDBOX_EAST', label: 'AHEA' },
  { code: 'AHGH', value: 'SANDBOX_GREENHILLS', label: 'AHGH' },
  { code: 'VER', value: 'VERDANA_STORE', label: 'VERDANA' },
]
const DEPARTMENTS = ['ADMIN', 'PT', 'OT', 'SLP', 'SPED', 'PSYCH', 'MD', 'ORTHOSIS']
const VATABLE = ['VAT', 'Non-VAT']
const VALIDITY = ['Valid', 'Invalid', 'Cancelled']
const PAYMENT_METHODS = ['Check deposit', 'Check encashment to deposit as cash', 'Credit card', "Deposit to admin officer's bank account"]
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

const TABS = [
  { key: 'recurring', label: 'Recurring expense', recordType: 'RECURRING' },
  { key: 'onetime', label: 'One-time expense', recordType: 'ONE_TIME' },
  { key: 'cc-report', label: 'Credit Card Report', recordType: '' },
  { key: 'expense-report', label: 'Expense Report', recordType: '' },
  { key: 'suppliers', label: 'Suppliers', recordType: '' },
] as const
type TabKey = typeof TABS[number]['key']

interface Entry {
  id: string
  branch: string
  pcvNumber: string
  pcvSeq: number
  requestor: string | null      // reused as Payee
  department: string | null
  date: string | null
  description: string | null
  vatable: string | null
  validity: string | null
  siNumber: string | null
  tinNumber: string | null
  registeredName: string | null
  registeredAddress: string | null
  grossAmount: string | number
  accountTitle: string | null
  proofUrl: string | null
  recordType: string | null
  paidAt: string | null
  paymentMethod: string | null
  checkNumber: string | null
  creditCard: string | null
  payrollAccount: string | null
  paymentBankAccount: string | null
}

interface Card { id: string; branch: string; bank: string; cardNumber: string; bankCode: string }

// ── Computed helpers ───────────────────────────────────────────
const digitsOnly = (s: string | null) => (s || '').replace(/\D/g, '')
const formatTin = (raw: string) => {
  const d = digitsOnly(raw).slice(0, 14)
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 14)].filter(Boolean).join('-')
}
const tinNumber2 = (tin: string | null) => {
  const d = digitsOnly(tin).slice(0, 9)
  return d.length === 9 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}` : ''
}
const branchCodeOf = (tin: string | null) => digitsOnly(tin).slice(9, 14)
const num = (v: string | number | null) => Number(v) || 0
const netOfVat = (e: Entry) => (e.vatable === 'VAT' ? num(e.grossAmount) / 1.12 : num(e.grossAmount))
const vatAmount = (e: Entry) => num(e.grossAmount) - netOfVat(e)
const descForHub = (e: Entry) => (e.description ? `${e.pcvNumber}; ${e.description}` : e.pcvNumber)
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cardLabel = (c: Card) => `${c.bank} •••• ${c.cardNumber.slice(-4)} (${c.bankCode})`

export default function ExpensesPage() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user as { role?: string })?.role || '')

  const [branch, setBranch] = useState('SANDBOX_EAST')
  const [tab, setTab] = useState<TabKey>('recurring')
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [coaOptions, setCoaOptions] = useState<string[]>([])
  const [bankOptions, setBankOptions] = useState<string[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [nextPcvSeq, setNextPcvSeq] = useState<number>(1)
  const [showSettings, setShowSettings] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showPayModal, setShowPayModal] = useState(false)
  const [paying, setPaying] = useState(false)
  const [search, setSearch] = useState('')
  const [uploadingProof, setUploadingProof] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const recordType = TABS.find(t => t.key === tab)?.recordType || ''
  const isRecording = recordType === 'RECURRING' || recordType === 'ONE_TIME'

  const loadEntries = useCallback(async (br: string, rt: string) => {
    if (!rt) { setEntries([]); setLoading(false); return }
    setLoading(true)
    try {
      const r = await fetch(`/api/petty-cash/entries?branch=${br}&recordType=${rt}`)
      setEntries(r.ok ? await r.json() : [])
    } catch { setEntries([]) }
    setLoading(false)
  }, [])

  const loadSettings = useCallback(async (br: string) => {
    try {
      const r = await fetch(`/api/petty-cash/settings?branch=${br}`)
      if (r.ok) { const s = await r.json(); setNextPcvSeq(s.nextPcvSeq || 1) }
    } catch { /* ignore */ }
  }, [])

  const loadCards = useCallback(async (br: string) => {
    try {
      const r = await fetch(`/api/expenses/credit-cards?branch=${br}`)
      setCards(r.ok ? await r.json() : [])
    } catch { setCards([]) }
  }, [])

  useEffect(() => {
    setSelected(new Set())
    loadEntries(branch, recordType); loadSettings(branch); loadCards(branch)
  }, [branch, recordType, loadEntries, loadSettings, loadCards])

  useEffect(() => {
    fetch('/api/chart-of-accounts')
      .then(r => r.ok ? r.json() : [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        const list = Array.isArray(d) ? d : (d.accounts || d.data || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setCoaOptions(list.map((a: any) => `${a.accountNumber} ${a.accountTitle}`))
      })
      .catch(() => setCoaOptions([]))
    fetch('/api/chart-of-accounts?accountType=ASSET')
      .then(r => r.ok ? r.json() : [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        const list = Array.isArray(d) ? d : (d.accounts || d.data || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setBankOptions(list.map((a: any) => `${a.accountNumber} ${a.accountTitle}`))
      })
      .catch(() => setBankOptions([]))
  }, [])

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const patchLocal = (id: string, patch: Partial<Entry>) =>
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)))

  const saveField = (id: string, patch: Partial<Entry>, debounce = true) => {
    patchLocal(id, patch)
    const doSave = async () => {
      try {
        await fetch('/api/petty-cash/entries', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...patch }),
        })
      } catch { /* ignore */ }
    }
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id])
    if (debounce) saveTimers.current[id] = setTimeout(doSave, 500)
    else doSave()
  }

  const addRow = async () => {
    setAdding(true)
    try {
      const r = await fetch('/api/petty-cash/entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, recordType }),
      })
      if (r.ok) {
        const e = await r.json(); setEntries(prev => [...prev, e]); setNextPcvSeq(s => s + 1)
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 60)
      } else alert((await r.json()).error || 'Failed to add row')
    } catch { /* ignore */ }
    setAdding(false)
  }

  const uploadProof = async (id: string, file: File | null) => {
    if (!file) return
    setUploadingProof(id)
    try {
      const fd = new FormData(); fd.append('file', file)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      if (up.ok) saveField(id, { proofUrl: (await up.json()).url }, false)
      else alert((await up.json()).error || 'Upload failed')
    } catch { alert('Upload failed') }
    setUploadingProof('')
  }

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this entry?')) return
    setEntries(prev => prev.filter(e => e.id !== id))
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    try { await fetch(`/api/petty-cash/entries?id=${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }

  const addCard = async (bank: string, cardNumber: string, bankCode: string): Promise<Card | null> => {
    try {
      const r = await fetch('/api/expenses/credit-cards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, bank, cardNumber, bankCode }),
      })
      if (!r.ok) { alert((await r.json()).error || 'Failed to add card'); return null }
      const c = await r.json(); setCards(prev => [...prev, c]); return c
    } catch { alert('Failed to add card'); return null }
  }

  const deleteCard = async (id: string) => {
    setCards(prev => prev.filter(c => c.id !== id))
    try { await fetch(`/api/expenses/credit-cards?id=${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }

  const submitPayment = async (p: { datePaid: string; paymentMethod: string; checkNumber: string; paymentBankAccount: string; creditCard: string; payrollAccount: string }) => {
    setPaying(true)
    try {
      const res = await fetch('/api/expenses/pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryIds: [...selected], ...p }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Failed to record payment'); setPaying(false); return }
      setShowPayModal(false); setSelected(new Set())
      await loadEntries(branch, recordType)
    } catch { alert('Failed to record payment') }
    setPaying(false)
  }

  const unpay = async (id: string) => {
    if (!confirm('Unlock this entry? Its payment details will be cleared.')) return
    try {
      await fetch('/api/expenses/pay', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryIds: [id] }),
      })
      await loadEntries(branch, recordType)
    } catch { /* ignore */ }
  }

  const cellCls = 'w-full bg-transparent px-2 py-1.5 text-xs outline-none focus:bg-[var(--pale-teal)] rounded'
  const tdCls = 'border-r border-b align-top'
  const locked = (e: Entry) => !!e.paidAt || !canWrite
  const vatEditable = (e: Entry) => e.vatable === 'VAT' || e.vatable === 'Non-VAT' || e.vatable === 'NV'

  const q = search.trim().toLowerCase()
  const shown = q
    ? entries.filter(e => [e.pcvNumber, e.requestor, e.description, e.accountTitle, e.siNumber, e.registeredName, e.tinNumber, e.paymentMethod]
        .some(v => (v || '').toString().toLowerCase().includes(q)))
    : entries
  const totalGross = shown.reduce((s, e) => s + num(e.grossAmount), 0)

  const selectableIds = shown.filter(e => !e.paidAt).map(e => e.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds))
  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className={expanded ? 'fixed inset-0 z-50 overflow-auto p-6 space-y-4' : 'space-y-4'} style={expanded ? { background: 'var(--off-white)' } : undefined}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <Wallet size={22} style={{ color: 'var(--teal)' }} /> Expenses
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.map(b => (
              <button key={b.value} onClick={() => setBranch(b.value)}
                className="px-4 py-2 text-xs font-semibold transition-colors"
                style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
                {b.label}
              </button>
            ))}
          </div>
          <button onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            {expanded ? <><Minimize2 size={14} /> Collapse</> : <><Maximize2 size={14} /> Expand</>}
          </button>
          <button onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <Settings size={14} /> Settings
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex rounded-xl overflow-hidden border flex-wrap" style={{ borderColor: 'var(--light-gray)' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-4 py-2 text-xs font-semibold transition-colors"
              style={tab === t.key ? { background: 'var(--deep-teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
              {t.label}
            </button>
          ))}
        </div>
        {isRecording && canWrite && (
          <button onClick={() => setShowPayModal(true)} disabled={selected.size === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--teal)' }}>
            <CreditCard size={15} /> For Payment{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        )}
      </div>

      {isRecording && (
        <>
          {/* Search + scroll controls */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search payee, description, PCV, account…"
                className="w-full pl-9 pr-8 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X size={15} style={{ color: 'var(--mid-gray)' }} /></button>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                <ArrowUp size={14} /> Top
              </button>
              <button onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                <ArrowDown size={14} /> Bottom
              </button>
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            {shown.length}{q ? ` of ${entries.length}` : ''} entries · {selected.size} selected · Total Gross <strong style={{ color: 'var(--charcoal)' }}>₱{peso(totalGross)}</strong>
            {' · '}Next PCV #{nextPcvSeq}
          </p>

          <div ref={scrollRef} className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)', maxHeight: expanded ? 'calc(100vh - 260px)' : '66vh' }}>
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
            ) : (
              <table className="text-xs" style={{ borderCollapse: 'collapse', minWidth: 2360 }}>
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="border-r border-b px-2 py-2 text-center" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!canWrite || selectableIds.length === 0} title="Select all" />
                    </th>
                    {['PCV Number', 'Payee', 'Department', 'Date', 'Description', 'Description for Hub',
                      'Valid/Invalid', 'Vatable', 'SI Number', 'TIN Number', 'TIN Number 2', 'Branch Code', 'Registered name',
                      'Registered Address', 'Gross Amount', 'Net of VAT', 'VAT Amount', 'Account Title', 'Payment', 'Proof', ''
                    ].map((h, i) => (
                      <th key={i} className="border-r border-b px-2 py-2 text-left font-semibold whitespace-nowrap"
                        style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map(e => {
                    const lk = locked(e)
                    const ve = vatEditable(e)
                    return (
                      <tr key={e.id} style={{ background: e.paidAt ? '#c3ccd6' : '#fff' }}>
                        <td className="border-r border-b text-center" style={{ borderColor: 'var(--light-gray)' }}>
                          <input type="checkbox" checked={selected.has(e.id)} disabled={lk}
                            onChange={() => toggleOne(e.id)} title={e.paidAt ? 'Locked (paid)' : ''} />
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <span className="px-2 py-1.5 block whitespace-nowrap font-mono" style={{ color: 'var(--charcoal)' }}>{e.pcvNumber}</span>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <input className={cellCls} disabled={lk} value={e.requestor || ''} placeholder="Payee" style={{ minWidth: 170 }}
                            onChange={ev => patchLocal(e.id, { requestor: ev.target.value })}
                            onBlur={ev => saveField(e.id, { requestor: ev.target.value }, false)} />
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <select className={cellCls} value={e.department || ''} disabled={lk}
                            onChange={ev => saveField(e.id, { department: ev.target.value }, false)}>
                            <option value=""></option>
                            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <input type="date" className={cellCls} disabled={lk}
                            value={e.date ? String(e.date).slice(0, 10) : ''}
                            onChange={ev => saveField(e.id, { date: ev.target.value }, false)} />
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <input className={cellCls} disabled={lk} value={e.description || ''} style={{ minWidth: 220 }}
                            onChange={ev => patchLocal(e.id, { description: ev.target.value })}
                            onBlur={ev => saveField(e.id, { description: ev.target.value }, false)} />
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : '#fafafa' }}>
                          <span className="px-2 py-1.5 block" style={{ color: 'var(--mid-gray)', minWidth: 240 }}>{descForHub(e)}</span>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <select className={cellCls} value={e.validity || ''} disabled={lk}
                            onChange={ev => {
                              const v = ev.target.value
                              const patch: Partial<Entry> = { validity: v }
                              if (v !== 'Valid') { patch.vatable = null; patch.siNumber = null; patch.tinNumber = null }
                              saveField(e.id, patch, false)
                            }}>
                            <option value=""></option>
                            {VALIDITY.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : (e.validity === 'Valid' ? '#fff' : '#f3f4f6') }}>
                          <select className={cellCls} value={e.vatable || ''} disabled={lk || e.validity !== 'Valid'}
                            onChange={ev => {
                              const v = ev.target.value
                              const patch: Partial<Entry> = { vatable: v }
                              if (v !== 'VAT' && v !== 'Non-VAT') { patch.siNumber = null; patch.tinNumber = null }
                              saveField(e.id, patch, false)
                            }}>
                            <option value=""></option>
                            {VATABLE.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : (ve ? '#fff' : '#f3f4f6') }}>
                          <input className={cellCls} disabled={lk || !ve} value={e.siNumber || ''} style={{ minWidth: 140 }}
                            onChange={ev => patchLocal(e.id, { siNumber: ev.target.value })}
                            onBlur={ev => saveField(e.id, { siNumber: ev.target.value }, false)} />
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : (ve ? '#fff' : '#f3f4f6') }}>
                          <input className={cellCls} disabled={lk || !ve} value={e.tinNumber || ''} placeholder="XXX-XXX-XXX-XXXXX" style={{ minWidth: 150 }}
                            onChange={ev => patchLocal(e.id, { tinNumber: formatTin(ev.target.value) })}
                            onBlur={ev => saveField(e.id, { tinNumber: formatTin(ev.target.value) }, false)} />
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : '#fafafa' }}>
                          <span className="px-2 py-1.5 block whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{tinNumber2(e.tinNumber)}</span>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : '#fafafa' }}>
                          <span className="px-2 py-1.5 block whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{branchCodeOf(e.tinNumber)}</span>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <input className={cellCls} disabled={lk} value={e.registeredName || ''} style={{ minWidth: 180 }}
                            onChange={ev => patchLocal(e.id, { registeredName: ev.target.value })}
                            onBlur={ev => saveField(e.id, { registeredName: ev.target.value }, false)} />
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <input className={cellCls} disabled={lk} value={e.registeredAddress || ''} style={{ minWidth: 220 }}
                            onChange={ev => patchLocal(e.id, { registeredAddress: ev.target.value })}
                            onBlur={ev => saveField(e.id, { registeredAddress: ev.target.value }, false)} />
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <input type="number" step="0.01" className={`${cellCls} text-right`} disabled={lk}
                            value={num(e.grossAmount) === 0 ? '' : String(e.grossAmount)} style={{ minWidth: 110 }}
                            onChange={ev => patchLocal(e.id, { grossAmount: ev.target.value })}
                            onBlur={ev => saveField(e.id, { grossAmount: Number(ev.target.value) || 0 }, false)} />
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : '#fafafa' }}>
                          <span className="px-2 py-1.5 block text-right" style={{ color: 'var(--mid-gray)' }}>{peso(netOfVat(e))}</span>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : '#fafafa' }}>
                          <span className="px-2 py-1.5 block text-right" style={{ color: 'var(--mid-gray)' }}>{peso(vatAmount(e))}</span>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <select className={cellCls} value={e.accountTitle || ''} disabled={lk}
                            onChange={ev => saveField(e.id, { accountTitle: ev.target.value }, false)} style={{ minWidth: 200 }}>
                            <option value=""></option>
                            {coaOptions.map(c => <option key={c} value={c}>{c}</option>)}
                            {e.accountTitle && !coaOptions.includes(e.accountTitle) && <option value={e.accountTitle}>{e.accountTitle}</option>}
                          </select>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          {e.paidAt ? (
                            <div className="px-2 py-1 text-[11px]" style={{ minWidth: 160, color: 'var(--charcoal)' }}>
                              <div className="font-semibold">{new Date(e.paidAt).toLocaleDateString('en-PH')}</div>
                              <div style={{ color: 'var(--mid-gray)' }}>{e.paymentMethod}</div>
                              {e.checkNumber && <div style={{ color: 'var(--mid-gray)' }}>Check #{e.checkNumber}</div>}
                              {e.creditCard && <div style={{ color: 'var(--mid-gray)' }}>{e.creditCard}</div>}
                              {e.payrollAccount && <div style={{ color: 'var(--mid-gray)' }}>Acct {e.payrollAccount}</div>}
                              {e.paymentBankAccount && <div style={{ color: 'var(--mid-gray)' }}>{e.paymentBankAccount}</div>}
                              {canWrite && <button onClick={() => unpay(e.id)} className="mt-0.5 underline" style={{ color: '#dc2626' }}>Unlock</button>}
                            </div>
                          ) : (
                            <span className="px-2 py-1.5 block text-[11px]" style={{ color: 'var(--mid-gray)', minWidth: 160 }}>Unpaid</span>
                          )}
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <div className="flex items-center gap-1 px-1 py-1 whitespace-nowrap">
                            {e.proofUrl && (
                              <a href={e.proofUrl} target="_blank" rel="noopener noreferrer" title="View proof"
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[11px]"
                                style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                                <Eye size={12} /> View
                              </a>
                            )}
                            {!lk && (
                              <label className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium text-white cursor-pointer" style={{ background: 'var(--teal)' }}>
                                {uploadingProof === e.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                {e.proofUrl ? 'Replace' : 'Upload'}
                                <input type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                                  onChange={ev => { uploadProof(e.id, ev.target.files?.[0] || null); ev.target.value = '' }} />
                              </label>
                            )}
                          </div>
                        </td>
                        <td className="border-b px-1 text-center" style={{ borderColor: 'var(--light-gray)' }}>
                          {!lk && (
                            <button onClick={() => deleteRow(e.id)} title="Delete" className="p-1 rounded hover:bg-red-50">
                              <Trash2 size={13} style={{ color: '#dc2626' }} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {shown.length === 0 && (
                    <tr><td colSpan={22} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>
                      {q ? 'No entries match your search.' : 'No entries yet. Click "Add Row" to start.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {canWrite && (
            <button onClick={addRow} disabled={adding}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--teal)' }}>
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Row
            </button>
          )}
        </>
      )}

      {!isRecording && (
        <div className="rounded-2xl border bg-white py-20 text-center" style={{ borderColor: 'var(--light-gray)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{TABS.find(t => t.key === tab)?.label}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Coming soon — instructions pending.</p>
        </div>
      )}

      {showSettings && (
        <CreditCardSettings branch={branch} cards={cards} canWrite={canWrite}
          onClose={() => setShowSettings(false)} onAdd={addCard} onDelete={deleteCard} />
      )}

      {showPayModal && (
        <ForPaymentModal count={selected.size} bankOptions={bankOptions} cards={cards} paying={paying}
          onClose={() => setShowPayModal(false)} onAddCard={addCard} onSubmit={submitPayment} />
      )}
    </div>
  )
}

// ── For Payment modal ──────────────────────────────────────────
function ForPaymentModal({ count, bankOptions, cards, paying, onClose, onAddCard, onSubmit }: {
  count: number; bankOptions: string[]; cards: Card[]; paying: boolean
  onClose: () => void; onAddCard: (bank: string, cardNumber: string, bankCode: string) => Promise<Card | null>
  onSubmit: (p: { datePaid: string; paymentMethod: string; checkNumber: string; paymentBankAccount: string; creditCard: string; payrollAccount: string }) => void
}) {
  const [datePaid, setDatePaid] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('')
  const [checkNumber, setCheckNumber] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [card, setCard] = useState('')
  const [payrollAccount, setPayrollAccount] = useState('')
  const [showAddCard, setShowAddCard] = useState(false)
  const [nb, setNb] = useState(''); const [nn, setNn] = useState(''); const [nc, setNc] = useState('')

  const isCheck = method === 'Check deposit' || method === 'Check encashment to deposit as cash'
  const isCard = method === 'Credit card'
  const isPayroll = method === "Deposit to admin officer's bank account"

  const submit = () => {
    if (!datePaid) { alert('Enter the Date of Payment.'); return }
    if (!method) { alert('Select a Payment Method.'); return }
    if (isCheck && (!checkNumber || !bankAccount)) { alert('Enter the Check Number and bank account.'); return }
    if (isCard && !card) { alert('Choose a credit card.'); return }
    if (isPayroll && !payrollAccount) { alert("Enter the admin officer's bank account number."); return }
    onSubmit({ datePaid, paymentMethod: method, checkNumber: isCheck ? checkNumber : '', paymentBankAccount: isCheck ? bankAccount : '', creditCard: isCard ? card : '', payrollAccount: isPayroll ? payrollAccount : '' })
  }

  const saveNewCard = async () => {
    if (!nb || !nn || !nc) { alert('Enter the bank, card number and bank code.'); return }
    const c = await onAddCard(nb, nn, nc)
    if (c) { setCard(cardLabel(c)); setShowAddCard(false); setNb(''); setNn(''); setNc('') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>For Payment</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>
          {count} selected entr{count === 1 ? 'y' : 'ies'} will be marked paid and locked.
        </p>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date of Payment</label>
        <input type="date" value={datePaid} onChange={e => setDatePaid(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment Method</label>
        <select value={method} onChange={e => setMethod(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select method…</option>
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {isCheck && (
          <>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Check Number</label>
            <input type="text" inputMode="numeric" value={checkNumber} onChange={e => setCheckNumber(e.target.value)}
              placeholder="e.g. 0001234" className="w-full px-3 py-2 rounded-xl border text-sm mb-1 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
            <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Leading zeros are preserved.</p>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Bank account</label>
            <select value={bankAccount} onChange={e => setBankAccount(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">Select account…</option>
              {bankOptions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </>
        )}

        {isCard && (
          <>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Credit card</label>
            <div className="flex items-center gap-2 mb-3">
              <select value={card} onChange={e => setCard(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
                <option value="">Select card…</option>
                {cards.map(c => <option key={c.id} value={cardLabel(c)}>{cardLabel(c)}</option>)}
              </select>
              <button onClick={() => setShowAddCard(v => !v)} title="Add a credit card"
                className="px-3 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>+</button>
            </div>
            {showAddCard && (
              <div className="rounded-xl border p-3 mb-3 space-y-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <input value={nb} onChange={e => setNb(e.target.value)} placeholder="Bank (e.g. BDO)" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
                <input value={nn} onChange={e => setNn(e.target.value)} placeholder="Credit card number" className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: 'var(--light-gray)' }} />
                <input value={nc} onChange={e => setNc(e.target.value)} placeholder="Bank code (e.g. CBC)" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
                <button onClick={saveNewCard} className="w-full py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>Save card</button>
              </div>
            )}
          </>
        )}

        {isPayroll && (
          <>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Admin officer&apos;s bank account number</label>
            <input type="text" inputMode="numeric" value={payrollAccount} onChange={e => setPayrollAccount(e.target.value)}
              placeholder="e.g. 0012345678" className="w-full px-3 py-2 rounded-xl border text-sm mb-1 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
            <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Leading zeros are preserved.</p>
          </>
        )}

        <button onClick={submit} disabled={paying}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'var(--teal)' }}>
          {paying ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
          {paying ? 'Recording…' : 'Confirm Payment'}
        </button>
      </div>
    </div>
  )
}

// ── Credit Card settings ───────────────────────────────────────
function CreditCardSettings({ branch, cards, canWrite, onClose, onAdd, onDelete }: {
  branch: string; cards: Card[]; canWrite: boolean
  onClose: () => void; onAdd: (bank: string, cardNumber: string, bankCode: string) => Promise<Card | null>; onDelete: (id: string) => void
}) {
  const [bank, setBank] = useState(''); const [number, setNumber] = useState(''); const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const branchLabel = BRANCHES.find(b => b.value === branch)?.label || branch

  const add = async () => {
    if (!bank || !number || !code) { alert('Enter the bank, credit card number and bank code.'); return }
    setSaving(true)
    const c = await onAdd(bank, number, code)
    if (c) { setBank(''); setNumber(''); setCode('') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
            <CreditCard size={18} style={{ color: 'var(--teal)' }} /> Credit Cards — {branchLabel}
          </h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
          Pre-set the bank, credit card number and bank code (e.g. BDO → &quot;BDO&quot;, Chinabank → &quot;CBC&quot;). These appear in the For Payment credit-card dropdown.
        </p>

        <div className="space-y-1 mb-3 max-h-60 overflow-auto">
          {cards.map(c => (
            <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--off-white)' }}>
              <div className="text-xs" style={{ color: 'var(--charcoal)' }}>
                <span className="font-semibold">{c.bank}</span> · <span className="font-mono">{c.cardNumber}</span> · <span style={{ color: 'var(--mid-gray)' }}>{c.bankCode}</span>
              </div>
              {canWrite && <button onClick={() => onDelete(c.id)} title="Remove"><X size={14} style={{ color: '#dc2626' }} /></button>}
            </div>
          ))}
          {cards.length === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--mid-gray)' }}>No credit cards yet.</p>}
        </div>

        {canWrite && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            <input value={bank} onChange={e => setBank(e.target.value)} placeholder="Bank (BDO)" className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
            <input value={number} onChange={e => setNumber(e.target.value)} placeholder="Card number" className="px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: 'var(--light-gray)' }} />
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="Code (CBC)" className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
        )}
        {canWrite && (
          <button onClick={add} disabled={saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add Credit Card
          </button>
        )}
      </div>
    </div>
  )
}
