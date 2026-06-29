'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Settings, Loader2, Trash2, X, Maximize2, Minimize2, Search, ArrowUp, ArrowDown, Upload, Download, Eye, Wallet, CreditCard, CheckCircle2, Pencil } from 'lucide-react'

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
const RECUR_FREQ = [
  { v: 'MONTHLY', label: 'Monthly' },
  { v: 'QUARTERLY', label: 'Quarterly' },
  { v: 'BIANNUALLY', label: 'Biannually' },
  { v: 'ANNUALLY', label: 'Annually' },
]
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
  proofUrls: string[] | null
  recordType: string | null
  paidAt: string | null
  paymentMethod: string | null
  checkNumber: string | null
  creditCard: string | null
  payrollAccount: string | null
  paymentBankAccount: string | null
  finalized: boolean
  recurFrequency: string | null
  recurDeadlineDay: number | null
  distributeMonthly: boolean
  distributeStart: string | null
  distributeEnd: string | null
}

interface Card { id: string; branch: string; bank: string; cardNumber: string; bankCode: string }
interface Supplier { id: string | null; registeredName: string; registeredAddress: string; tin: string; branch: string; branchLabel: string; firstAppeared: string | null }

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
const monthInput = (d: string | null) => (d ? String(d).slice(0, 7) : '')
const monthsInWindow = (startISO: string | null, endISO: string | null) => {
  if (!startISO || !endISO) return 0
  const s = new Date(startISO), e = new Date(endISO)
  const c = (e.getUTCFullYear() * 12 + e.getUTCMonth()) - (s.getUTCFullYear() * 12 + s.getUTCMonth()) + 1
  return c > 0 ? c : 0
}
const monthlyAmt = (e: Entry) => {
  if (!e.distributeMonthly) return 0
  const c = monthsInWindow(e.distributeStart, e.distributeEnd)
  return c > 0 ? num(e.grossAmount) / c : 0
}

// Upload via XHR so we can report upload progress (0–100%).
function uploadWithProgress(file: File, onProgress: (pct: number) => void): Promise<{ ok: boolean; url?: string; error?: string }> {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.upload.onprogress = ev => { if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100)) }
    xhr.onload = () => {
      try { const d = JSON.parse(xhr.responseText || '{}'); resolve({ ...d, ok: xhr.status >= 200 && xhr.status < 300 }) }
      catch { resolve({ ok: false, error: 'Upload failed' }) }
    }
    xhr.onerror = () => resolve({ ok: false, error: 'Upload failed' })
    const fd = new FormData(); fd.append('file', file)
    xhr.send(fd)
  })
}

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
  const [prepaidAccount, setPrepaidAccount] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [newSupplierPrompt, setNewSupplierPrompt] = useState<{ registeredName: string; registeredAddress: string; tin: string } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showPayModal, setShowPayModal] = useState(false)
  const [paying, setPaying] = useState(false)
  const [search, setSearch] = useState('')
  const [uploadingProof, setUploadingProof] = useState('')
  const [uploadPct, setUploadPct] = useState<Record<string, number>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  const recordType = TABS.find(t => t.key === tab)?.recordType || ''
  const isRecording = recordType === 'RECURRING' || recordType === 'ONE_TIME'
  const isRecurringTab = recordType === 'RECURRING'

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
      if (r.ok) { const s = await r.json(); setNextPcvSeq(s.nextPcvSeq || 1); setPrepaidAccount(s.prepaidAccount || '') }
    } catch { /* ignore */ }
  }, [])

  const loadCards = useCallback(async (br: string) => {
    try {
      const r = await fetch(`/api/expenses/credit-cards?branch=${br}`)
      setCards(r.ok ? await r.json() : [])
    } catch { setCards([]) }
  }, [])

  const loadSuppliers = useCallback(async (br: string) => {
    try {
      const r = await fetch(`/api/expenses/suppliers?branch=${br}&all=1`)
      const d = r.ok ? await r.json() : { suppliers: [] }
      setSuppliers(d.suppliers || [])
    } catch { setSuppliers([]) }
  }, [])

  useEffect(() => {
    setSelected(new Set())
    loadEntries(branch, recordType); loadSettings(branch); loadCards(branch); loadSuppliers(branch)
  }, [branch, recordType, loadEntries, loadSettings, loadCards, loadSuppliers])

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

  const proofsOf = (e: Entry): string[] => {
    const arr = Array.isArray(e.proofUrls) ? e.proofUrls : []
    if (arr.length) return arr
    return e.proofUrl ? [e.proofUrl] : []
  }
  const uploadProof = async (id: string, file: File | null) => {
    if (!file) return
    const e0 = entries.find(x => x.id === id)
    const cur = e0 ? proofsOf(e0) : []
    setUploadingProof(id)
    setUploadPct(p => ({ ...p, [id]: 0 }))
    const res = await uploadWithProgress(file, pct => setUploadPct(p => ({ ...p, [id]: pct })))
    if (res.ok && res.url) { const next = [...cur, res.url]; saveField(id, { proofUrls: next, proofUrl: next[0] }, false) }
    else alert(res.error || 'Upload failed')
    setUploadingProof('')
    setUploadPct(p => { const n = { ...p }; delete n[id]; return n })
  }
  const removeProof = (e: Entry, url: string) => {
    const next = proofsOf(e).filter(u => u !== url)
    saveField(e.id, { proofUrls: next, proofUrl: next[0] ?? null }, false)
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

  const submitPayment = async (p: { datePaid: string; paymentMethod: string; checkNumber: string; paymentBankAccount: string; creditCard: string; creditCardId: string; payrollAccount: string }) => {
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

  const supplierByName = new Map(suppliers.map(s => [s.registeredName.trim().toLowerCase(), s]))
  const finalizeEntry = (e: Entry) => {
    saveField(e.id, { finalized: true }, false)
    const name = (e.registeredName || '').trim()
    if (name && !supplierByName.has(name.toLowerCase())) {
      setNewSupplierPrompt({ registeredName: name, registeredAddress: e.registeredAddress || '', tin: e.tinNumber || '' })
    }
  }
  const confirmAddSupplier = async () => {
    if (!newSupplierPrompt) return
    try {
      const r = await fetch('/api/expenses/suppliers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, ...newSupplierPrompt }),
      })
      if (r.ok) await loadSuppliers(branch)
    } catch { /* ignore */ }
    setNewSupplierPrompt(null)
  }

  const cellCls = 'w-full bg-transparent px-2 py-1.5 text-xs outline-none focus:bg-[var(--pale-teal)] rounded'
  const tdCls = 'border-r border-b align-top'
  const locked = (e: Entry) => !!e.paidAt || !!e.finalized || !canWrite
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
              <table className="text-xs" style={{ borderCollapse: 'collapse', minWidth: isRecurringTab ? 3160 : 2360 }}>
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="border-r border-b px-2 py-2 text-center" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!canWrite || selectableIds.length === 0} title="Select all" />
                    </th>
                    {['PCV Number', 'Payee', 'Department', 'Date', 'Description', 'Description for Hub',
                      'Valid/Invalid', 'Vatable', 'SI Number', 'TIN Number', 'TIN Number 2', 'Branch Code', 'Registered name',
                      'Registered Address', 'Gross Amount', 'Net of VAT', 'VAT Amount', 'Account Title',
                      ...(isRecurringTab ? ['Recurs', 'Deadline (day)', 'Distribute monthly?', 'Monthly Amount', 'Charge from', 'Charge to'] : []),
                      'Payment', 'Proof', ''
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
                      <tr key={e.id} style={{ background: e.paidAt ? '#c3ccd6' : (e.finalized ? '#eaf7ee' : '#fff') }}>
                        <td className="border-r border-b text-center" style={{ borderColor: 'var(--light-gray)' }}>
                          <input type="checkbox" checked={selected.has(e.id)} disabled={!canWrite || !!e.paidAt}
                            onChange={() => toggleOne(e.id)} title={e.paidAt ? 'Locked (paid)' : ''} />
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <span className="px-2 py-1.5 block whitespace-nowrap font-mono" style={{ color: 'var(--charcoal)' }}>{e.pcvNumber}</span>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <input list="exp-supplier-names" className={cellCls} disabled={lk} value={e.requestor || ''} placeholder="Payee" style={{ minWidth: 170 }}
                            onChange={ev => patchLocal(e.id, { requestor: ev.target.value })}
                            onBlur={ev => {
                              const val = ev.target.value
                              const sup = supplierByName.get(val.trim().toLowerCase())
                              const patch: Partial<Entry> = { requestor: val }
                              if (sup) {
                                patch.registeredName = sup.registeredName
                                if (sup.registeredAddress) patch.registeredAddress = sup.registeredAddress
                                if (!e.tinNumber && sup.tin) patch.tinNumber = sup.tin
                              }
                              saveField(e.id, patch, false)
                            }} />
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
                        {isRecurringTab && (() => {
                          const freqMonthly = e.recurFrequency === 'MONTHLY'
                          const canDistribute = !!e.recurFrequency && !freqMonthly
                          return (
                            <>
                              <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                                <select className={cellCls} value={e.recurFrequency || ''} disabled={lk} style={{ minWidth: 120 }}
                                  onChange={ev => {
                                    const v = ev.target.value
                                    const patch: Partial<Entry> = { recurFrequency: v }
                                    if (v === 'MONTHLY' || !v) { patch.distributeMonthly = false; patch.distributeStart = null; patch.distributeEnd = null }
                                    saveField(e.id, patch, false)
                                  }}>
                                  <option value=""></option>
                                  {RECUR_FREQ.map(f => <option key={f.v} value={f.v}>{f.label}</option>)}
                                </select>
                              </td>
                              <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                                <input type="number" min="1" max="31" className={`${cellCls} text-center`} disabled={lk} placeholder="nth"
                                  value={e.recurDeadlineDay ?? ''} style={{ minWidth: 80 }}
                                  onChange={ev => patchLocal(e.id, { recurDeadlineDay: ev.target.value ? Number(ev.target.value) : null })}
                                  onBlur={ev => saveField(e.id, { recurDeadlineDay: ev.target.value ? Number(ev.target.value) : null }, false)} />
                              </td>
                              <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : (canDistribute ? '#fff' : '#f3f4f6') }}>
                                <select className={cellCls} value={e.distributeMonthly ? 'Yes' : 'No'} disabled={lk || !canDistribute} style={{ minWidth: 80 }}
                                  onChange={ev => {
                                    const yes = ev.target.value === 'Yes'
                                    const patch: Partial<Entry> = { distributeMonthly: yes }
                                    if (!yes) { patch.distributeStart = null; patch.distributeEnd = null }
                                    saveField(e.id, patch, false)
                                  }}>
                                  <option value="No">No</option>
                                  <option value="Yes">Yes</option>
                                </select>
                              </td>
                              <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : '#fafafa' }}>
                                <span className="px-2 py-1.5 block text-right" style={{ color: 'var(--mid-gray)', minWidth: 100 }}>
                                  {e.distributeMonthly ? peso(monthlyAmt(e)) : '—'}
                                </span>
                              </td>
                              <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : (e.distributeMonthly ? '#fff' : '#f3f4f6') }}>
                                <input type="month" className={cellCls} disabled={lk || !e.distributeMonthly} style={{ minWidth: 130 }}
                                  value={monthInput(e.distributeStart)}
                                  onChange={ev => saveField(e.id, { distributeStart: ev.target.value ? `${ev.target.value}-01` : null }, false)} />
                              </td>
                              <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : (e.distributeMonthly ? '#fff' : '#f3f4f6') }}>
                                <input type="month" className={cellCls} disabled={lk || !e.distributeMonthly} style={{ minWidth: 130 }}
                                  value={monthInput(e.distributeEnd)}
                                  onChange={ev => saveField(e.id, { distributeEnd: ev.target.value ? `${ev.target.value}-01` : null }, false)} />
                              </td>
                            </>
                          )
                        })()}
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
                          <div className="flex flex-col gap-1 px-1 py-1" style={{ minWidth: 120 }}>
                            {proofsOf(e).map((url, i) => (
                              <div key={url} className="flex items-center gap-1 whitespace-nowrap">
                                <a href={url} target="_blank" rel="noopener noreferrer" title="View proof"
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[11px]"
                                  style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                                  <Eye size={12} /> {i + 1}
                                </a>
                                {!lk && (
                                  <button onClick={() => removeProof(e, url)} title="Remove this proof" className="p-0.5 rounded hover:bg-red-50">
                                    <X size={12} style={{ color: '#dc2626' }} />
                                  </button>
                                )}
                              </div>
                            ))}
                            {!lk && (
                              <label className="inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium text-white cursor-pointer" style={{ background: 'var(--teal)' }}>
                                {uploadingProof === e.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                {uploadingProof === e.id ? `${uploadPct[e.id] ?? 0}%` : (proofsOf(e).length ? 'Add proof' : 'Upload')}
                                <input type="file" className="hidden" disabled={uploadingProof === e.id} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                                  onChange={ev => { uploadProof(e.id, ev.target.files?.[0] || null); ev.target.value = '' }} />
                              </label>
                            )}
                          </div>
                        </td>
                        <td className="border-b px-1 text-center" style={{ borderColor: 'var(--light-gray)' }}>
                          {canWrite && !e.paidAt && (
                            <div className="flex items-center justify-center gap-0.5 whitespace-nowrap">
                              <button onClick={() => finalizeEntry(e)} disabled={!!e.finalized}
                                title={e.finalized ? 'Finalized' : 'Mark as finalized'} className="p-1 rounded hover:bg-green-50">
                                <CheckCircle2 size={14} style={{ color: e.finalized ? '#16a34a' : '#9ca3af' }} />
                              </button>
                              <button onClick={() => saveField(e.id, { finalized: false }, false)} disabled={!e.finalized}
                                title="Edit (re-open)" className="p-1 rounded hover:bg-teal-50 disabled:opacity-40">
                                <Pencil size={13} style={{ color: 'var(--teal)' }} />
                              </button>
                              <button onClick={() => deleteRow(e.id)} title="Delete" className="p-1 rounded hover:bg-red-50">
                                <Trash2 size={13} style={{ color: '#dc2626' }} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {shown.length === 0 && (
                    <tr><td colSpan={isRecurringTab ? 28 : 22} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>
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

      {tab === 'cc-report' && (
        <CcReportTab branch={branch} cards={cards} canWrite={canWrite} />
      )}

      {tab === 'expense-report' && (
        <ExpenseReportTab branch={branch} canWrite={canWrite} />
      )}

      {tab === 'suppliers' && (
        <SuppliersTab branch={branch} canWrite={canWrite} />
      )}

      {showSettings && (
        <CreditCardSettings branch={branch} cards={cards} canWrite={canWrite}
          bankOptions={bankOptions} prepaidAccount={prepaidAccount}
          onClose={() => setShowSettings(false)} onAdd={addCard} onDelete={deleteCard}
          onSavePrepaid={async (acct) => {
            setPrepaidAccount(acct)
            try {
              await fetch('/api/petty-cash/settings', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ branch, prepaidAccount: acct }),
              })
            } catch { /* ignore */ }
          }} />
      )}

      {showPayModal && (
        <ForPaymentModal count={selected.size} bankOptions={bankOptions} cards={cards} paying={paying}
          onClose={() => setShowPayModal(false)} onAddCard={addCard} onSubmit={submitPayment} />
      )}

      {/* Registered-name suggestions for the Payee field */}
      <datalist id="exp-supplier-names">
        {suppliers.map(s => <option key={(s.id || '') + s.registeredName} value={s.registeredName} />)}
      </datalist>

      {newSupplierPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setNewSupplierPrompt(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Add to Suppliers?</h2>
            <p className="text-sm mb-1" style={{ color: 'var(--mid-gray)' }}>This supplier isn&apos;t in your Suppliers list yet:</p>
            <div className="rounded-xl px-3 py-2 mb-4 text-sm" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>
              <div className="font-semibold">{newSupplierPrompt.registeredName}</div>
              {newSupplierPrompt.registeredAddress && <div className="text-xs" style={{ color: 'var(--mid-gray)' }}>{newSupplierPrompt.registeredAddress}</div>}
              {newSupplierPrompt.tin && <div className="text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>TIN {newSupplierPrompt.tin}</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setNewSupplierPrompt(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>No, skip</button>
              <button onClick={confirmAddSupplier} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>Yes, add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── For Payment modal ──────────────────────────────────────────
function ForPaymentModal({ count, bankOptions, cards, paying, onClose, onAddCard, onSubmit }: {
  count: number; bankOptions: string[]; cards: Card[]; paying: boolean
  onClose: () => void; onAddCard: (bank: string, cardNumber: string, bankCode: string) => Promise<Card | null>
  onSubmit: (p: { datePaid: string; paymentMethod: string; checkNumber: string; paymentBankAccount: string; creditCard: string; creditCardId: string; payrollAccount: string }) => void
}) {
  const [datePaid, setDatePaid] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('')
  const [checkNumber, setCheckNumber] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [cardId, setCardId] = useState('')
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
    if (isCard && !cardId) { alert('Choose a credit card.'); return }
    if (isPayroll && !payrollAccount) { alert("Enter the admin officer's bank account number."); return }
    const selCard = cards.find(c => c.id === cardId)
    onSubmit({ datePaid, paymentMethod: method, checkNumber: isCheck ? checkNumber : '', paymentBankAccount: isCheck ? bankAccount : '', creditCard: isCard && selCard ? cardLabel(selCard) : '', creditCardId: isCard ? cardId : '', payrollAccount: isPayroll ? payrollAccount : '' })
  }

  const saveNewCard = async () => {
    if (!nb || !nn || !nc) { alert('Enter the bank, card number and bank code.'); return }
    const c = await onAddCard(nb, nn, nc)
    if (c) { setCardId(c.id); setShowAddCard(false); setNb(''); setNn(''); setNc('') }
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
              <select value={cardId} onChange={e => setCardId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
                <option value="">Select card…</option>
                {cards.map(c => <option key={c.id} value={c.id}>{cardLabel(c)}</option>)}
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
function CreditCardSettings({ branch, cards, canWrite, bankOptions, prepaidAccount, onClose, onAdd, onDelete, onSavePrepaid }: {
  branch: string; cards: Card[]; canWrite: boolean; bankOptions: string[]; prepaidAccount: string
  onClose: () => void; onAdd: (bank: string, cardNumber: string, bankCode: string) => Promise<Card | null>; onDelete: (id: string) => void
  onSavePrepaid: (acct: string) => void
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

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Prepaid Expense account (for amortized recurring expenses)</label>
        <select value={prepaidAccount} onChange={e => onSavePrepaid(e.target.value)} disabled={!canWrite}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-1" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select asset account…</option>
          {bankOptions.map(a => <option key={a} value={a}>{a}</option>)}
          {prepaidAccount && !bankOptions.includes(prepaidAccount) && <option value={prepaidAccount}>{prepaidAccount}</option>}
        </select>
        <p className="text-[11px] mb-4" style={{ color: 'var(--mid-gray)' }}>
          When a recurring expense is set to distribute monthly, its net is parked here (Balance Sheet asset) and recognized as expense each month in Reports.
        </p>

        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Credit Cards</h3>
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

// ── Credit Card Report tab ─────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

interface CcReport {
  id: string; branch: string; cardId: string; bankCode: string; refNumber: string
  periodMonth: number; periodYear: number; statementUrl: string | null; status: string; createdAt: string
}
interface CcTxn {
  id: string; pcvNumber: string; requestor: string | null; date: string | null
  description: string | null; accountTitle: string | null; grossAmount: string | number; paidAt: string | null
}

function CcReportTab({ branch, cards, canWrite }: { branch: string; cards: Card[]; canWrite: boolean }) {
  const now = new Date()
  const [cardId, setCardId] = useState('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [reports, setReports] = useState<CcReport[]>([])
  const [txns, setTxns] = useState<CcTxn[]>([])
  const [loadingTxns, setLoadingTxns] = useState(false)
  const [creating, setCreating] = useState(false)
  const [uploadingStmt, setUploadingStmt] = useState('')

  const loadReports = useCallback(async () => {
    try { const r = await fetch(`/api/expenses/cc-reports?branch=${branch}`); setReports(r.ok ? await r.json() : []) }
    catch { setReports([]) }
  }, [branch])
  useEffect(() => { loadReports() }, [loadReports])

  useEffect(() => {
    if (!cardId) { setTxns([]); return }
    let alive = true
    setLoadingTxns(true)
    fetch(`/api/expenses/cc-transactions?branch=${branch}&cardId=${cardId}&month=${month}&year=${year}`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (alive) setTxns(d) })
      .catch(() => { if (alive) setTxns([]) })
      .finally(() => { if (alive) setLoadingTxns(false) })
    return () => { alive = false }
  }, [branch, cardId, month, year])

  const report = reports.find(r => r.cardId === cardId && r.periodMonth === month && r.periodYear === year) || null
  const total = txns.reduce((s, t) => s + num(t.grossAmount), 0)
  const cardOf = (id: string) => cards.find(c => c.id === id)

  const createReport = async () => {
    if (!cardId) { alert('Choose a credit card.'); return }
    setCreating(true)
    try {
      const r = await fetch('/api/expenses/cc-reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, cardId, periodMonth: month, periodYear: year }),
      })
      if (r.ok) { const rep = await r.json(); setReports(prev => (prev.some(x => x.id === rep.id) ? prev : [rep, ...prev])) }
      else alert((await r.json()).error || 'Failed to create report')
    } catch { alert('Failed to create report') }
    setCreating(false)
  }
  const setStatus = async (id: string, status: string) => {
    setReports(prev => prev.map(r => (r.id === id ? { ...r, status } : r)))
    try { await fetch('/api/expenses/cc-reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }) } catch { /* ignore */ }
  }
  const uploadStatement = async (id: string, file: File | null) => {
    if (!file) return
    setUploadingStmt(id)
    try {
      const fd = new FormData(); fd.append('file', file)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      if (up.ok) {
        const url = (await up.json()).url
        setReports(prev => prev.map(r => (r.id === id ? { ...r, statementUrl: url } : r)))
        await fetch('/api/expenses/cc-reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, statementUrl: url }) })
      } else alert((await up.json()).error || 'Upload failed')
    } catch { alert('Upload failed') }
    setUploadingStmt('')
  }
  const deleteReport = async (id: string) => {
    if (!confirm('Delete this CC report? The expense transactions themselves are not deleted.')) return
    setReports(prev => prev.filter(r => r.id !== id))
    try { await fetch(`/api/expenses/cc-reports?id=${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }

  const years: number[] = []
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 4; y--) years.push(y)

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border bg-white py-16 text-center" style={{ borderColor: 'var(--light-gray)' }}>
        <CreditCard size={28} className="mx-auto mb-2" style={{ color: 'var(--mid-gray)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>No credit cards set up yet</p>
        <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Add a credit card in Settings first (with its bank code), then charge one-time expenses to it.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Credit Card</label>
          <select value={cardId} onChange={e => setCardId(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)', minWidth: 230 }}>
            <option value="">Select card…</option>
            {cards.map(c => <option key={c.id} value={c.id}>{cardLabel(c)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Month</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
            {MONTHS.map((mLabel, i) => <option key={i} value={i + 1}>{mLabel}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {cardId && (
        <>
          {/* Report header / actions */}
          <div className="rounded-2xl border bg-white p-4 flex items-center justify-between flex-wrap gap-3" style={{ borderColor: 'var(--light-gray)' }}>
            <div>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{cardOf(cardId) ? cardLabel(cardOf(cardId)!) : ''} · {MONTHS[month - 1]} {year}</p>
              {report ? (
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--charcoal)' }}>{report.refNumber}</p>
              ) : (
                <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No CC report generated for this card &amp; month yet.</p>
              )}
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{txns.length} transaction(s) · Total <strong style={{ color: 'var(--charcoal)' }}>₱{peso(total)}</strong></p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!report && canWrite && (
                <button onClick={createReport} disabled={creating}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} Create CC Report
                </button>
              )}
              {report && (
                <>
                  <select value={report.status} disabled={!canWrite} onChange={e => setStatus(report.id, e.target.value)}
                    className="px-3 py-2 rounded-xl border text-sm font-semibold" style={{ borderColor: 'var(--light-gray)', color: report.status === 'FILED' ? '#166534' : '#92400e' }}>
                    <option value="FOR_FILING">For Filing</option>
                    <option value="FILED">Filed</option>
                  </select>
                  {report.statementUrl && (
                    <a href={report.statementUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                      <Eye size={14} /> Statement
                    </a>
                  )}
                  {canWrite && (
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ background: 'var(--teal)' }}>
                      {uploadingStmt === report.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {report.statementUrl ? 'Replace statement' : 'Upload statement'}
                      <input type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                        onChange={ev => { uploadStatement(report.id, ev.target.files?.[0] || null); ev.target.value = '' }} />
                    </label>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Transactions */}
          <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)', maxHeight: '50vh' }}>
            {loadingTxns ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0">
                  <tr style={{ background: 'var(--off-white)' }}>
                    {['PCV Number', 'Payee', 'Expense Date', 'Description', 'Account Title', 'Charged On', 'Amount'].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txns.map(t => (
                    <tr key={t.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{t.pcvNumber}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{t.requestor || ''}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{t.date ? String(t.date).slice(0, 10) : ''}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{t.description || ''}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{t.accountTitle || ''}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{t.paidAt ? String(t.paidAt).slice(0, 10) : ''}</td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(num(t.grossAmount))}</td>
                    </tr>
                  ))}
                  {txns.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No credit-card charges for this card in {MONTHS[month - 1]} {year}.</td></tr>
                  )}
                  {txns.length > 0 && (
                    <tr className="border-t-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                      <td colSpan={6} className="px-3 py-2 text-right font-bold" style={{ color: 'var(--charcoal)' }}>TOTAL</td>
                      <td className="px-3 py-2 text-right font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(total)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* All saved CC reports */}
      <div>
        <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Saved CC Reports</h3>
        <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--off-white)' }}>
                {['Reference', 'Card', 'Period', 'Status', 'Statement', ''].map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map(r => {
                const c = cardOf(r.cardId)
                return (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{r.refNumber}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{c ? cardLabel(c) : r.bankCode}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{MONTHS[r.periodMonth - 1]} {r.periodYear}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={r.status === 'FILED' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                        {r.status === 'FILED' ? 'Filed' : 'For Filing'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {r.statementUrl
                        ? <a href={r.statementUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: 'var(--teal)' }}><Eye size={12} /> View</a>
                        : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canWrite && (
                        <button onClick={() => deleteReport(r.id)} title="Delete report" className="p-1 rounded hover:bg-red-50">
                          <Trash2 size={13} style={{ color: '#dc2626' }} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {reports.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No CC reports yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Expense Report tab ─────────────────────────────────────────
interface ErRow {
  id: string; source: string; payee: string; paymentAccount: string; paymentDate: string
  paymentMethod: string; pcvNumber: string; accountTitle: string; description: string
  netOfVat: number; checkInfo: string; validity: string; filingStatus: string
}

function ExpenseReportTab({ branch, canWrite }: { branch: string; canWrite: boolean }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<ErRow[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'Valid' | 'Invalid'>('Valid')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ branch })
      if (from) qs.set('from', from)
      if (to) qs.set('to', to)
      const r = await fetch(`/api/expenses/expense-report?${qs.toString()}`)
      const d = r.ok ? await r.json() : { rows: [] }
      setRows(d.rows || [])
    } catch { setRows([]) }
    setLoading(false)
  }, [branch, from, to])
  useEffect(() => { load() }, [load])

  const valid = rows.filter(r => r.validity === 'Valid')
  const invalid = rows.filter(r => r.validity === 'Invalid')
  const totalValid = valid.reduce((s, r) => s + r.netOfVat, 0)
  const totalInvalid = invalid.reduce((s, r) => s + r.netOfVat, 0)
  const shown = view === 'Valid' ? valid : invalid

  const setStatus = async (id: string, filingStatus: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, filingStatus } : r)))
    try { await fetch('/api/expenses/filing-status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, filingStatus }) }) } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4">
      {/* Date filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>From (payment date)</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        {(from || to) && <button onClick={() => { setFrom(''); setTo('') }} className="px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Clear</button>}
      </div>

      {/* Summary totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Total Valid Expenses (net of VAT) · {valid.length} item(s)</p>
          <p className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(totalValid)}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Total Invalid Expenses (net of VAT) · {invalid.length} item(s)</p>
          <p className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(totalInvalid)}</p>
        </div>
      </div>

      {/* Valid / Invalid toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
          {(['Valid', 'Invalid'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-4 py-2 text-xs font-semibold transition-colors"
              style={view === v ? { background: 'var(--deep-teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
              {v} ({v === 'Valid' ? valid.length : invalid.length})
            </button>
          ))}
        </div>
        <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--mid-gray)' }}>
          <span className="inline-block w-3 h-3 rounded" style={{ background: '#dbeafe' }} /> Petty cash (reimbursement)
        </span>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)', maxHeight: '62vh' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
        ) : (
          <table className="text-xs" style={{ borderCollapse: 'collapse', minWidth: 1700 }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ background: 'var(--off-white)' }}>
                {['Payee', 'Payment Account', 'Payment Date', 'Payment Method', 'PCV Number', 'Account Title', 'Description', 'Amount Net of VAT', 'Check Number', 'Status'].map((h, i) => (
                  <th key={i} className="border-r border-b px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                const pc = r.source === 'PETTY_CASH'
                return (
                  <tr key={r.id} style={{ background: pc ? '#dbeafe' : '#fff' }}>
                    <td className="border-r border-b px-3 py-2 whitespace-nowrap" style={{ borderColor: 'var(--light-gray)', color: pc ? '#1e40af' : 'var(--charcoal)', fontWeight: pc ? 600 : 400 }}>{r.payee}</td>
                    <td className="border-r border-b px-3 py-2" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>{r.paymentAccount}</td>
                    <td className="border-r border-b px-3 py-2 whitespace-nowrap" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>{r.paymentDate}</td>
                    <td className="border-r border-b px-3 py-2" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>{r.paymentMethod}</td>
                    <td className="border-r border-b px-3 py-2 font-mono whitespace-nowrap" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>{r.pcvNumber}</td>
                    <td className="border-r border-b px-3 py-2" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>{r.accountTitle}</td>
                    <td className="border-r border-b px-3 py-2" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>{r.description}</td>
                    <td className="border-r border-b px-3 py-2 text-right whitespace-nowrap font-semibold" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>₱{peso(r.netOfVat)}</td>
                    <td className="border-r border-b px-3 py-2 whitespace-nowrap" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>{r.checkInfo}</td>
                    <td className="border-r border-b px-3 py-2" style={{ borderColor: 'var(--light-gray)' }}>
                      <select value={r.filingStatus} disabled={!canWrite} onChange={e => setStatus(r.id, e.target.value)}
                        className="px-2 py-1 rounded-lg border text-[11px] font-semibold" style={{ borderColor: 'var(--light-gray)', color: r.filingStatus === 'FILED' ? '#166534' : '#92400e' }}>
                        <option value="FOR_FILING">For Filing</option>
                        <option value="FILED">Filed</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
              {shown.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>No {view.toLowerCase()} paid expenses{(from || to) ? ' in this date range' : ''}.</td></tr>
              )}
              {shown.length > 0 && (
                <tr style={{ background: 'var(--off-white)' }}>
                  <td colSpan={7} className="border-r border-b px-3 py-2 text-right font-bold" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>TOTAL {view}</td>
                  <td className="border-r border-b px-3 py-2 text-right font-bold whitespace-nowrap" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>₱{peso(view === 'Valid' ? totalValid : totalInvalid)}</td>
                  <td className="border-r border-b" style={{ borderColor: 'var(--light-gray)' }} colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Suppliers tab ──────────────────────────────────────────────
type SupSortKey = 'tin' | 'branchLabel' | 'registeredName' | 'registeredAddress'

function SuppliersTab({ branch, canWrite }: { branch: string; canWrite: boolean }) {
  const [rows, setRows] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [seeAll, setSeeAll] = useState(true)
  const [sortKey, setSortKey] = useState<SupSortKey>('registeredName')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [colFilter, setColFilter] = useState<Record<SupSortKey, string>>({ tin: '', branchLabel: '', registeredName: '', registeredAddress: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [na, setNa] = useState(''); const [nad, setNad] = useState(''); const [nt, setNt] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ branch })
      if (seeAll) qs.set('all', '1'); else { if (from) qs.set('from', from); if (to) qs.set('to', to) }
      const r = await fetch(`/api/expenses/suppliers?${qs.toString()}`)
      const d = r.ok ? await r.json() : { suppliers: [] }
      setRows(d.suppliers || [])
    } catch { setRows([]) }
    setLoading(false)
  }, [branch, seeAll, from, to])
  useEffect(() => { load() }, [load])

  const addSupplier = async () => {
    if (!na.trim()) { alert('Registered Name is required.'); return }
    try {
      const r = await fetch('/api/expenses/suppliers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, registeredName: na.trim(), registeredAddress: nad.trim(), tin: nt.trim() }),
      })
      if (r.ok) { setShowAdd(false); setNa(''); setNad(''); setNt(''); await load() }
      else alert((await r.json()).error || 'Failed to add')
    } catch { alert('Failed to add') }
  }
  const deleteSupplier = async (id: string | null) => {
    if (!id) { alert('This supplier is derived from expense entries and has no saved record to delete.'); return }
    if (!confirm('Remove this saved supplier? (Entries that reference it are not affected.)')) return
    setRows(prev => prev.filter(s => s.id !== id))
    try { await fetch(`/api/expenses/suppliers?id=${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([
      ['Registered Name', 'Registered Address', 'TIN'],
      ['SAMPLE VENDOR INC', 'SAMPLE ADDRESS, CITY', '000-000-000-00000'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Suppliers')
    XLSX.writeFile(wb, 'suppliers-import-template.xlsx')
  }
  const handleImportFile = async (file: File) => {
    setImporting(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const map: Record<string, string> = { registeredname: 'registeredName', name: 'registeredName', registeredaddress: 'registeredAddress', address: 'registeredAddress', tin: 'tin' }
      const out = json.map(raw => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const o: any = {}
        for (const k of Object.keys(raw)) { const f = map[k.toLowerCase().replace(/[^a-z0-9]/g, '')]; if (f) o[f] = String(raw[k]).trim() }
        return o
      }).filter(o => o.registeredName)
      if (out.length === 0) { alert('No supplier rows found.'); setImporting(false); return }
      const r = await fetch('/api/expenses/suppliers/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, rows: out }),
      })
      if (r.ok) { const d = await r.json(); await load(); alert(`Imported ${d.created} supplier(s).`) }
      else alert((await r.json()).error || 'Import failed')
    } catch { alert('Could not read the file. Use the template (.xlsx or .csv).') }
    setImporting(false)
  }

  const toggleSort = (k: SupSortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  const q = search.trim().toLowerCase()
  let shown = rows.filter(s => {
    if (q && ![s.tin, s.registeredName, s.registeredAddress, s.branchLabel].some(v => (v || '').toLowerCase().includes(q))) return false
    for (const k of ['tin', 'branchLabel', 'registeredName', 'registeredAddress'] as SupSortKey[]) {
      const f = colFilter[k].trim().toLowerCase()
      if (f && !((s[k] || '') as string).toLowerCase().includes(f)) return false
    }
    return true
  })
  shown = [...shown].sort((a, b) => {
    const av = ((a[sortKey] || '') as string).toLowerCase(), bv = ((b[sortKey] || '') as string).toLowerCase()
    return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === 'asc' ? 1 : -1)
  })

  const COLS: { key: SupSortKey; label: string }[] = [
    { key: 'tin', label: 'TIN' }, { key: 'branchLabel', label: 'Branch' },
    { key: 'registeredName', label: 'Registered Name' }, { key: 'registeredAddress', label: 'Registered Address' },
  ]

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers…"
            className="w-full pl-9 pr-8 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X size={15} style={{ color: 'var(--mid-gray)' }} /></button>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <Download size={14} /> Template
          </button>
          {canWrite && (
            <button onClick={() => fileRef.current?.click()} disabled={importing} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import CSV/Excel
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = '' }} />
          {canWrite && (
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
              <Plus size={15} /> Add
            </button>
          )}
        </div>
      </div>

      {/* Date filter */}
      <div className="flex items-end gap-3 flex-wrap">
        <label className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>
          <input type="checkbox" checked={seeAll} onChange={e => setSeeAll(e.target.checked)} /> See All
        </label>
        <div>
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>From (first appeared)</label>
          <input type="date" value={from} disabled={seeAll} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded-xl border text-sm disabled:opacity-50" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>To</label>
          <input type="date" value={to} disabled={seeAll} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded-xl border text-sm disabled:opacity-50" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <span className="text-xs pb-2" style={{ color: 'var(--mid-gray)' }}>{shown.length} supplier(s)</span>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)', maxHeight: '60vh' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
        ) : (
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ background: 'var(--off-white)' }}>
                {COLS.map(c => (
                  <th key={c.key} className="border-r border-b px-3 py-2 text-left font-semibold" style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                    <button onClick={() => toggleSort(c.key)} className="flex items-center gap-1">
                      {c.label}
                      <span style={{ color: sortKey === c.key ? 'var(--teal)' : 'var(--light-gray)' }}>{sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                    <input value={colFilter[c.key]} onChange={e => setColFilter(f => ({ ...f, [c.key]: e.target.value }))} placeholder="filter…"
                      className="mt-1 w-full px-2 py-1 rounded border text-[11px] font-normal" style={{ borderColor: 'var(--light-gray)' }} />
                  </th>
                ))}
                <th className="border-b px-3 py-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s, i) => (
                <tr key={(s.id || '') + s.registeredName + i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="border-r border-b px-3 py-2 font-mono whitespace-nowrap" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>{s.tin || '—'}</td>
                  <td className="border-r border-b px-3 py-2 whitespace-nowrap" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>{s.branchLabel}</td>
                  <td className="border-r border-b px-3 py-2" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)', fontWeight: 600 }}>{s.registeredName}</td>
                  <td className="border-r border-b px-3 py-2" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>{s.registeredAddress || '—'}</td>
                  <td className="border-b px-3 py-2 text-right" style={{ borderColor: 'var(--light-gray)' }}>
                    {canWrite && s.id && (
                      <button onClick={() => deleteSupplier(s.id)} title="Remove saved supplier" className="p-1 rounded hover:bg-red-50">
                        <Trash2 size={13} style={{ color: '#dc2626' }} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>No suppliers{q || !seeAll ? ' match the filters' : ' yet'}.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Add Supplier</h2>
              <button onClick={() => setShowAdd(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Registered Name</label>
            <input value={na} onChange={e => setNa(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Registered Address</label>
            <input value={nad} onChange={e => setNad(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>TIN</label>
            <input value={nt} onChange={e => setNt(e.target.value)} placeholder="XXX-XXX-XXX-XXXXX" className="w-full px-3 py-2 rounded-xl border text-sm mb-4 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
            <button onClick={addSupplier} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>Add Supplier</button>
          </div>
        </div>
      )}
    </div>
  )
}
