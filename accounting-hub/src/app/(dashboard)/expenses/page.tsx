'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Settings, Loader2, Trash2, X, Maximize2, Minimize2, Search, ArrowUp, ArrowDown, Upload, Download, Eye, Wallet, CreditCard, CheckCircle2, Pencil, FileText } from 'lucide-react'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'
import { BillingVoucherModal } from '@/components/BillingVoucherModal'
import type { BVLine } from '@/lib/billing-voucher'

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
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

const TABS = [
  { key: 'recurring', label: 'Recurring expense', recordType: 'RECURRING', group: 'Expense Recording' },
  { key: 'onetime', label: 'One-time expense', recordType: 'ONE_TIME', group: 'Expense Recording' },
  { key: 'rfp', label: 'RFP', recordType: '', group: 'Expense Recording' },
  { key: 'cc-report', label: 'Credit Card Report', recordType: '', group: 'Expense Reports' },
  { key: 'expense-report', label: 'Expense Report', recordType: '', group: 'Expense Reports' },
  { key: 'suppliers', label: 'Suppliers', recordType: '', group: 'Suppliers' },
  { key: 'flowchart', label: 'Flowchart', recordType: '', group: 'Help' },
] as const
type TabKey = typeof TABS[number]['key']
const TAB_GROUPS = ['Expense Recording', 'Expense Reports', 'Suppliers', 'Help'] as const

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
  audited: boolean
  reimbursementId: string | null
  reimbursement: { refNumber: string } | null
  recurFrequency: string | null
  recurDeadlineDay: number | null
  distributeMonthly: boolean
  amountVaries: boolean
  hasEwt: boolean
  ewtRate: number | null
  distributeStart: string | null
  distributeEnd: string | null
}

interface Card { id: string; branch: string; bank: string; cardNumber: string; bankCode: string }
interface Supplier { id: string | null; registeredName: string; registeredAddress: string; tin: string; branch: string; branchLabel: string; firstAppeared: string | null }
interface Rfp {
  id: string; refNumber: string; grossTotal: string | number; payableTotal: string | number; status: string; kind: string | null
  module?: string; meta?: { source?: string; payableType?: string; idKind?: string; ids?: string[]; cutoffPeriod?: string; netTotal?: number; paymentId?: string } | null
  paidAt: string | null; paymentMethod: string | null; checkNumber: string | null; debitAccount: string | null
  creditCardId: string | null; proofUrl: string | null; createdAt: string; _count: { entries: number }
}

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
const fetchDataUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url); if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>(resolve => {
      const fr = new FileReader()
      fr.onloadend = () => resolve(fr.result as string)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch { return null }
}
const monthInput = (d: string | null) => (d ? String(d).slice(0, 7) : '')
const monthsInWindow = (startISO: string | null, endISO: string | null) => {
  if (!startISO || !endISO) return 0
  const s = new Date(startISO), e = new Date(endISO)
  const c = (e.getUTCFullYear() * 12 + e.getUTCMonth()) - (s.getUTCFullYear() * 12 + s.getUTCMonth()) + 1
  return c > 0 ? c : 0
}
// EWT is computed on the net of VAT; it reduces the cash payable (not the expense).
const ewtAmount = (e: Entry) => (e.hasEwt && e.ewtRate ? netOfVat(e) * (e.ewtRate / 100) : 0)
const payableOf = (e: Entry) => netOfVat(e) - ewtAmount(e)
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
  const role = (session?.user as { role?: string })?.role || ''
  const canWrite = WRITE_ROLES.includes(role)
  const canAudit = role === 'ADMIN' || role === 'ACCOUNTANT'

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
  const [rfpMode, setRfpMode] = useState<'VALID' | 'INVALID' | null>(null)
  const [showRfpModal, setShowRfpModal] = useState(false)
  const [rfpManualSeq, setRfpManualSeq] = useState('')
  const [generatingRfp, setGeneratingRfp] = useState(false)
  const [rfps, setRfps] = useState<Rfp[]>([])
  // RFP list sort/filter
  const [rfpSort, setRfpSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [rfpFilters, setRfpFilters] = useState<Record<string, string>>({})
  const rfpToggleSort = (k: string) => setRfpSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const rfpCols = [
    { key: 'refNumber', label: 'Reference Number' },
    { key: 'date', label: 'Date' },
    { key: 'kind', label: 'Kind' },
    { key: 'entries', label: 'Entries' },
    { key: 'grossTotal', label: 'Gross Total' },
    { key: 'payableTotal', label: 'Amount Payable' },
    { key: 'status', label: 'Status' },
  ]
  const rfpGet = (r: Rfp, k: string): string | number =>
    k === 'refNumber' ? r.refNumber
      : k === 'date' ? new Date(r.createdAt).toISOString().slice(0, 10)
      : k === 'kind' ? (r.module === 'PAYROLL_SALARY' ? 'Salaries' : r.module === 'PAYROLL_BENEFIT' ? 'Benefits' : r.kind === 'INVALID' ? 'Invalid' : 'Valid')
      : k === 'entries' ? (r.module && r.module.startsWith('PAYROLL') ? (r.meta?.ids?.length || 0) : r._count.entries)
      : k === 'grossTotal' ? num(r.grossTotal)
      : k === 'payableTotal' ? num(r.payableTotal)
      : k === 'status' ? (r.status === 'PAID' ? 'Paid' : 'For Payment')
      : ''
  const shownRfps = applySortFilter(rfps, rfpGet, rfpSort.key, rfpSort.dir, rfpFilters)
  const [recurringDue, setRecurringDue] = useState<{ id: string; payee: string | null; accountTitle: string | null; description: string | null; grossAmount: number; frequency: string; nextDue: string; daysUntil: number; amountVaries?: boolean }[]>([])
  const [genFromRecurring, setGenFromRecurring] = useState('')
  const [payTarget, setPayTarget] = useState<Rfp | null>(null)
  const [payrollPayTarget, setPayrollPayTarget] = useState<Rfp | null>(null)
  const [bvTarget, setBvTarget] = useState<{ refNumber: string; date: string; lines: BVLine[]; branch: string } | null>(null)
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

  const loadRfps = useCallback(async (br: string) => {
    try {
      const r = await fetch(`/api/expenses/rfp?branch=${br}`)
      setRfps(r.ok ? await r.json() : [])
    } catch { setRfps([]) }
  }, [])

  const loadRecurringDue = useCallback(async (br: string) => {
    try {
      const r = await fetch(`/api/expenses/recurring-due?branch=${br}`)
      const d = r.ok ? await r.json() : { due: [] }
      setRecurringDue(d.due || [])
    } catch { setRecurringDue([]) }
  }, [])

  useEffect(() => {
    setSelected(new Set()); setRfpMode(null)
    loadEntries(branch, recordType); loadSettings(branch); loadCards(branch); loadSuppliers(branch); loadRfps(branch); loadRecurringDue(branch)
  }, [branch, recordType, loadEntries, loadSettings, loadCards, loadSuppliers, loadRfps, loadRecurringDue])

  const generateFromRecurring = async (recurringId: string) => {
    setGenFromRecurring(recurringId)
    try {
      const r = await fetch('/api/expenses/recurring-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recurringId }),
      })
      if (r.ok) {
        if (tab !== 'onetime') setTab('onetime')
        await loadEntries(branch, 'ONE_TIME')
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 80)
      } else alert((await r.json()).error || 'Failed to generate entry')
    } catch { alert('Failed to generate entry') }
    setGenFromRecurring('')
  }

  useEffect(() => {
    fetch('/api/chart-of-accounts?pageSize=1000')
      .then(r => r.ok ? r.json() : [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        const list = Array.isArray(d) ? d : (d.accounts || d.data || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setCoaOptions(list.map((a: any) => `${a.accountNumber} ${a.accountTitle}`))
      })
      .catch(() => setCoaOptions([]))
    fetch('/api/chart-of-accounts?accountType=ASSET&pageSize=1000')
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

  // Duplicate the most-recent entry (fresh number) so only the amount needs changing.
  const duplicateLast = async () => {
    const src = entries[entries.length - 1]
    if (!src) { alert('No previous entry to duplicate yet.'); return }
    setAdding(true)
    try {
      const r = await fetch('/api/petty-cash/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, recordType }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed to add row'); return }
      const e = await r.json()
      const copy = { requestor: src.requestor, department: src.department, date: src.date, description: src.description, vatable: src.vatable, siNumber: src.siNumber, tinNumber: src.tinNumber, registeredName: src.registeredName, registeredAddress: src.registeredAddress, grossAmount: src.grossAmount, accountTitle: src.accountTitle, validity: src.validity, hasEwt: src.hasEwt, ewtRate: src.ewtRate }
      const pr = await fetch('/api/petty-cash/entries', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id, ...copy }) })
      const updated = pr.ok ? await pr.json() : { ...e, ...copy }
      setEntries(prev => [...prev, updated]); setNextPcvSeq(s => s + 1)
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 60)
    } catch { /* ignore */ } finally { setAdding(false) }
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

  // ── RFP (replaces the old per-entry "For Payment") ──
  const rfpValidity = rfpMode === 'VALID' ? 'Valid' : rfpMode === 'INVALID' ? 'Invalid' : null
  const isSelectable = (e: Entry) => !e.reimbursementId && !!e.audited && rfpValidity != null && e.validity === rfpValidity
  const setAudited = async (id: string, audited: boolean) => {
    patchLocal(id, { audited })
    try { await fetch('/api/petty-cash/audited', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, audited }) }) } catch { /* ignore */ }
  }
  const startRfp = (mode: 'VALID' | 'INVALID') => { setRfpMode(mode); setSelected(new Set()) }
  const cancelRfp = () => { setRfpMode(null); setSelected(new Set()) }

  const generateRfp = async (manualSeq?: string) => {
    setGeneratingRfp(true)
    try {
      const ids = [...selected]
      const sel = entries.filter(e => selected.has(e.id))
      const res = await fetch('/api/expenses/rfp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, entryIds: ids, kind: rfpMode || 'VALID', manualSeq: manualSeq || null }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Failed to generate RFP'); setGeneratingRfp(false); return }
      const { id, refNumber } = await res.json()
      try {
        const pdfData = await buildRfpPdf(refNumber, branch, sel)
        await fetch('/api/expenses/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, pdfData }) })
      } catch { /* pdf best-effort */ }
      setShowRfpModal(false); setRfpMode(null); setSelected(new Set()); setRfpManualSeq('')
      await loadEntries(branch, recordType); await loadRfps(branch)
      setTab('rfp')
    } catch { alert('Failed to generate RFP') }
    setGeneratingRfp(false)
  }

  const recordRfpPaid = async (rfp: Rfp, p: { datePaid: string; paymentMethod: string; checkNumber: string; paymentBankAccount: string; creditCard: string; creditCardId: string; payrollAccount: string; proofUrl?: string | null }) => {
    setPaying(true)
    try {
      const res = await fetch('/api/expenses/rfp', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rfp.id, action: 'pay', ...p }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Failed to record payment'); setPaying(false); return }
      setPayTarget(null)
      await loadRfps(branch); await loadEntries(branch, recordType)
    } catch { alert('Failed to record payment') }
    setPaying(false)
  }

  const openBillingVoucher = async (rfp: Rfp) => {
    try {
      const res = await fetch(`/api/expenses/rfp?id=${rfp.id}&items=1`)
      const d = res.ok ? await res.json() : { lines: [] }
      setBvTarget({ refNumber: rfp.refNumber, date: new Date(rfp.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }), lines: d.lines || [], branch })
    } catch { alert('Could not load RFP line items.') }
  }

  const isPayrollRfp = (r: Rfp) => r.module === 'PAYROLL_SALARY' || r.module === 'PAYROLL_BENEFIT'
  // Reverse a paid payroll RFP's underlying salary/benefit payment (deletes its journal + un-remits).
  const reversePayrollPayment = async (rfp: Rfp) => {
    const pid = rfp.meta?.paymentId
    if (!pid) return
    const url = rfp.module === 'PAYROLL_SALARY' ? `/api/payroll/salary-payments?id=${pid}` : `/api/payroll/benefit-payments?id=${pid}`
    await fetch(url, { method: 'DELETE' })
  }

  const unpayRfp = async (rfp: Rfp) => {
    if (!confirm(`Unmark ${rfp.refNumber} as paid?${isPayrollRfp(rfp) ? ' The recorded payment + its journal entry are reversed.' : ' Payment details on its entries are cleared.'}`)) return
    try {
      if (isPayrollRfp(rfp)) await reversePayrollPayment(rfp)
      await fetch('/api/expenses/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rfp.id, action: 'unpay' }) })
      await loadRfps(branch); await loadEntries(branch, recordType)
    } catch { /* ignore */ }
  }

  const deleteRfp = async (rfp: Rfp) => {
    const payrollNote = isPayrollRfp(rfp) ? ' The payroll rows return to Payable (any recorded payment is reversed).' : ` Its ${rfp._count.entries} entr${rfp._count.entries === 1 ? 'y' : 'ies'} will be released back for a new RFP.`
    if (!confirm(`Delete RFP ${rfp.refNumber}?${payrollNote}`)) return
    try {
      if (isPayrollRfp(rfp) && rfp.status === 'PAID') await reversePayrollPayment(rfp)
      setRfps(prev => prev.filter(r => r.id !== rfp.id))
      await fetch(`/api/expenses/rfp?id=${rfp.id}`, { method: 'DELETE' }); await loadEntries(branch, recordType)
    } catch { /* ignore */ }
  }

  const downloadRfpPdf = async (rfp: Rfp) => {
    try {
      const r = await fetch(`/api/expenses/rfp?id=${rfp.id}`)
      if (!r.ok) return
      const { pdfData } = await r.json()
      if (!pdfData) { alert('No PDF stored for this RFP.'); return }
      const a = document.createElement('a'); a.href = pdfData; a.download = `${rfp.refNumber}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
    } catch { /* ignore */ }
  }

  const buildRfpPdf = async (refNumber: string, br: string, rows: Entry[]): Promise<string> => {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const branchLabel = BRANCHES.find(b => b.value === br)?.label || br
    // 3-logo header (SCEI · Aura · Verdana), top-right.
    const logoH = 12
    let lx = pageW - 10
    for (const src of ['/login-verdana.png', '/login-aura.png', '/login-scei.png']) {
      const data = await fetchDataUrl(src)
      if (!data) continue
      try {
        const props = doc.getImageProperties(data)
        const w = (props.width / props.height) * logoH
        lx -= w
        doc.addImage(data, 'PNG', lx, 8, w, logoH)
        lx -= 4
      } catch { /* skip bad logo */ }
    }
    doc.setFont('helvetica', 'bold').setFontSize(13).text('Request for Payment (RFP)', 14, 15)
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text(`Branch: ${branchLabel}`, 14, 20)
    doc.text(`Ref No: ${refNumber}`, 14, 24)
    doc.text(`Date: ${new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}`, 14, 28)
    const tG = rows.reduce((s, e) => s + num(e.grossAmount), 0)
    const tN = rows.reduce((s, e) => s + netOfVat(e), 0)
    const tV = rows.reduce((s, e) => s + vatAmount(e), 0)
    const tE = rows.reduce((s, e) => s + ewtAmount(e), 0)
    const tP = rows.reduce((s, e) => s + payableOf(e), 0)
    autoTable(doc, {
      startY: 33,
      head: [['PCV Number', 'Payee', 'Date', 'Account Title', 'Description', 'Vatable', 'Gross Amount', 'Net of VAT', 'VAT Amount', 'EWT', 'Amount Payable']],
      body: rows.map(e => [e.pcvNumber, e.requestor || '', e.date ? String(e.date).slice(0, 10) : '', e.accountTitle || '', e.description || '', e.vatable || '', peso(num(e.grossAmount)), peso(netOfVat(e)), peso(vatAmount(e)), e.hasEwt ? `${peso(ewtAmount(e))} (${e.ewtRate}%)` : '', peso(payableOf(e))]),
      foot: [['', '', '', '', '', 'TOTAL', peso(tG), peso(tN), peso(tV), peso(tE), peso(tP)]],
      styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [36, 73, 82], textColor: 255 },
      footStyles: { fillColor: [237, 243, 217], textColor: [30, 30, 30], fontStyle: 'bold' },
      columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' } },
      margin: { left: 10, right: 10 },
    })
    doc.save(`${refNumber}.pdf`)
    return doc.output('datauristring')
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
  // Column sort/filter for the recording grid.
  const [gridSort, setGridSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: '', dir: 'asc' })
  const [gridFilters, setGridFilters] = useState<Record<string, string>>({})
  const gridToggleSort = (k: string) => setGridSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  // Recurring entries are setups (no payment), so a stale paidAt shouldn't lock them.
  const locked = (e: Entry) => !!e.reimbursementId || (e.recordType !== 'RECURRING' && !!e.paidAt) || !!e.finalized || !canWrite
  const vatEditable = (e: Entry) => e.vatable === 'VAT' || e.vatable === 'Non-VAT' || e.vatable === 'NV'

  const q = search.trim().toLowerCase()
  const shown = q
    ? entries.filter(e => [e.pcvNumber, e.requestor, e.description, e.accountTitle, e.siNumber, e.registeredName, e.tinNumber, e.paymentMethod]
        .some(v => (v || '').toString().toLowerCase().includes(q)))
    : entries

  // Per-column header sort/filter. `plain` columns (proof/actions) get no controls.
  const gridCols: { key: string; label: string; plain?: boolean }[] = [
    { key: 'refNumber', label: 'Reference Number' }, { key: 'requestor', label: 'Payee' }, { key: 'department', label: 'Department' },
    { key: 'date', label: 'Date' }, { key: 'description', label: 'Description' }, { key: 'descHub', label: 'Description for Hub' },
    { key: 'validity', label: 'Valid/Invalid' }, { key: 'vatable', label: 'Vatable' }, { key: 'siNumber', label: 'SI Number' },
    { key: 'tinNumber', label: 'TIN Number' }, { key: 'tinNumber2', label: 'TIN Number 2' }, { key: 'branchCode', label: 'Branch Code' },
    { key: 'registeredName', label: 'Registered name' }, { key: 'registeredAddress', label: 'Registered Address' },
    { key: 'grossAmount', label: 'Gross Amount' }, { key: 'netOfVat', label: 'Net of VAT' }, { key: 'vatAmount', label: 'VAT Amount' },
    { key: 'accountTitle', label: 'Account Title' }, { key: 'hasEwt', label: 'Has EWT?' }, { key: 'ewtRate', label: 'EWT %' },
    ...(isRecurringTab ? [
      { key: 'recurFrequency', label: 'Recurs' }, { key: 'recurDeadlineDay', label: 'Deadline (day)' },
      { key: 'amountVaries', label: 'Amount changes monthly?' }, { key: 'distributeMonthly', label: 'Distribute monthly?' },
      { key: 'monthlyAmount', label: 'Monthly Amount' }, { key: 'distributeStart', label: 'Charge from' }, { key: 'distributeEnd', label: 'Charge to' },
    ] : []),
    { key: 'payment', label: 'Payment' }, { key: 'proof', label: 'Proof', plain: true },
    ...(recordType === 'ONE_TIME' ? [{ key: 'audited', label: 'Audited' }] : []),
  ]
  const gridGet = (e: Entry, k: string): string | number => {
    switch (k) {
      case 'refNumber': return e.reimbursement?.refNumber || e.pcvNumber || ''
      case 'requestor': return e.requestor || ''
      case 'department': return e.department || ''
      case 'date': return e.date ? String(e.date).slice(0, 10) : ''
      case 'description': return e.description || ''
      case 'descHub': return descForHub(e) || ''
      case 'validity': return e.validity || ''
      case 'vatable': return e.vatable || ''
      case 'siNumber': return e.siNumber || ''
      case 'tinNumber': return e.tinNumber || ''
      case 'tinNumber2': return tinNumber2(e.tinNumber) || ''
      case 'branchCode': return branchCodeOf(e.tinNumber) || ''
      case 'registeredName': return e.registeredName || ''
      case 'registeredAddress': return e.registeredAddress || ''
      case 'grossAmount': return num(e.grossAmount)
      case 'netOfVat': return netOfVat(e)
      case 'vatAmount': return vatAmount(e)
      case 'accountTitle': return e.accountTitle || ''
      case 'hasEwt': return e.hasEwt ? 'Yes' : 'No'
      case 'ewtRate': return e.ewtRate ?? ''
      case 'recurFrequency': return e.recurFrequency || ''
      case 'recurDeadlineDay': return e.recurDeadlineDay ?? ''
      case 'amountVaries': return e.amountVaries ? 'Yes' : 'No'
      case 'distributeMonthly': return e.distributeMonthly ? 'Yes' : 'No'
      case 'monthlyAmount': return e.distributeMonthly ? monthlyAmt(e) : ''
      case 'distributeStart': return e.distributeStart ? String(e.distributeStart).slice(0, 7) : ''
      case 'distributeEnd': return e.distributeEnd ? String(e.distributeEnd).slice(0, 7) : ''
      case 'payment': return e.paidAt ? `${new Date(e.paidAt).toLocaleDateString('en-PH')} ${e.paymentMethod || ''}` : (e.reimbursementId ? 'In RFP' : 'Not yet in RFP')
      case 'audited': return e.audited ? 'Yes' : 'No'
      default: return ''
    }
  }
  const displayed = applySortFilter(shown, gridGet, gridSort.key, gridSort.dir, gridFilters)
  const totalGross = displayed.reduce((s, e) => s + num(e.grossAmount), 0)

  const selectableIds = displayed.filter(isSelectable).map(e => e.id)
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

      {/* Sub-tabs, grouped */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="flex items-end flex-wrap gap-4">
          {TAB_GROUPS.map(g => {
            const groupTabs = TABS.filter(t => t.group === g)
            if (groupTabs.length === 0) return null
            return (
              <div key={g}>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-1 ml-1" style={{ color: 'var(--mid-gray)' }}>{g}</p>
                <div className="flex rounded-xl overflow-hidden border flex-wrap" style={{ borderColor: 'var(--light-gray)' }}>
                  {groupTabs.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                      className="px-4 py-2 text-xs font-semibold transition-colors"
                      style={tab === t.key ? { background: 'var(--deep-teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        {recordType === 'ONE_TIME' && canWrite && (
          <div className="flex items-center gap-2 flex-wrap">
            {rfpMode === null ? (
              <>
                <button onClick={() => startRfp('VALID')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
                  <CreditCard size={15} /> RFP (Valid)
                </button>
                <button onClick={() => startRfp('INVALID')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                  <CreditCard size={15} /> RFP (Invalid)
                </button>
              </>
            ) : (
              <>
                <span className="text-xs font-bold" style={{ color: '#dc2626' }}>Select {rfpMode === 'VALID' ? 'Valid' : 'Invalid'} Entries</span>
                <button onClick={() => setShowRfpModal(true)} disabled={selected.size === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--teal)' }}>
                  <CreditCard size={15} /> Generate RFP ({rfpMode === 'VALID' ? 'Valid' : 'Invalid'}){selected.size > 0 ? ` · ${selected.size}` : ''}
                </button>
                <button onClick={cancelRfp} className="px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
              </>
            )}
          </div>
        )}
      </div>

      {recordType === 'ONE_TIME' && recurringDue.length > 0 && (
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <div className="flex items-center gap-2 mb-2">
            <CreditCard size={16} style={{ color: 'var(--teal)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Recurring expenses to enter</h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{recurringDue.length}</span>
          </div>
          <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Due soon (from Recurring setups). Click Enter to create a One-time entry pre-filled for the accountant to validate.</p>
          <div className="space-y-2">
            {recurringDue.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 bg-white border" style={{ borderColor: 'var(--light-gray)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--charcoal)' }}>{d.payee || d.description || d.accountTitle || 'Recurring expense'}</p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>
                    {({ MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', BIANNUALLY: 'Biannually', ANNUALLY: 'Annually' } as Record<string, string>)[d.frequency] || d.frequency}
                    {d.accountTitle ? ` · ${d.accountTitle}` : ''} · {d.amountVaries ? 'amount varies' : `₱${peso(d.grossAmount)}`}
                  </p>
                </div>
                <div className="text-right whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={d.daysUntil <= 0 ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#fef3c7', color: '#92400e' }}>
                    {d.daysUntil <= 0 ? 'Due now' : `Due in ${d.daysUntil}d`} · {d.nextDue}
                  </span>
                  {canWrite && (
                    <button onClick={() => generateFromRecurring(d.id)} disabled={genFromRecurring === d.id}
                      className="ml-2 inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                      {genFromRecurring === d.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Enter
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                    {gridCols.map(col => (
                      <th key={col.key} className="border-r border-b px-2 py-2 text-left align-top whitespace-nowrap"
                        style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                        {col.plain ? (
                          <span className="font-semibold">{col.label}</span>
                        ) : (
                          <>
                            <button onClick={() => gridToggleSort(col.key)} className="flex items-center gap-1 font-semibold">
                              {col.label}
                              <span style={{ color: gridSort.key === col.key ? 'var(--teal)' : 'var(--light-gray)' }}>{gridSort.key === col.key ? (gridSort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                            </button>
                            <input value={gridFilters[col.key] || ''} onChange={ev => setGridFilters(f => ({ ...f, [col.key]: ev.target.value }))} placeholder="filter…"
                              className="mt-1 w-full px-1.5 py-0.5 rounded border text-[11px] font-normal" style={{ borderColor: 'var(--light-gray)' }} />
                          </>
                        )}
                      </th>
                    ))}
                    <th className="border-r border-b px-2 py-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }} />
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(e => {
                    const lk = locked(e)
                    const ve = vatEditable(e)
                    return (
                      <tr key={e.id} style={{ background: e.paidAt ? '#dcfce7' : e.reimbursementId ? '#ffedd5' : e.finalized ? '#fef9c3' : '#fff' }}>
                        <td className="border-r border-b text-center" style={{ borderColor: 'var(--light-gray)' }}>
                          <input type="checkbox" checked={selected.has(e.id)} disabled={!isSelectable(e)}
                            onChange={() => toggleOne(e.id)} title={e.paidAt ? 'Locked (paid)' : ''} />
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <span className="px-2 py-1.5 block whitespace-nowrap font-mono" style={{ color: 'var(--charcoal)' }}>{e.reimbursement?.refNumber || e.pcvNumber}</span>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <SupplierCombo value={e.requestor || ''} disabled={lk} placeholder="Payee" suppliers={suppliers}
                            onCommit={(val, sup) => {
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
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <select className={cellCls} value={e.hasEwt ? 'Yes' : 'No'} disabled={lk} style={{ minWidth: 70 }}
                            onChange={ev => { const yes = ev.target.value === 'Yes'; saveField(e.id, { hasEwt: yes, ewtRate: yes ? (e.ewtRate || 5) : null }, false) }}>
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </select>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : (e.hasEwt ? '#fff' : '#f3f4f6') }}>
                          <select className={cellCls} value={e.ewtRate ?? ''} disabled={lk || !e.hasEwt} style={{ minWidth: 70 }}
                            onChange={ev => saveField(e.id, { ewtRate: ev.target.value ? Number(ev.target.value) : null }, false)}>
                            <option value=""></option>
                            <option value="5">5%</option>
                            <option value="10">10%</option>
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
                              <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                                <select className={cellCls} value={e.amountVaries ? 'Yes' : 'No'} disabled={lk} style={{ minWidth: 80 }}
                                  title="e.g. rent that changes each month — the generated One-time entry's amount is left blank for the accountant"
                                  onChange={ev => {
                                    const yes = ev.target.value === 'Yes'
                                    const patch: Partial<Entry> = { amountVaries: yes }
                                    if (yes) { patch.distributeMonthly = false; patch.distributeStart = null; patch.distributeEnd = null }
                                    saveField(e.id, patch, false)
                                  }}>
                                  <option value="No">No</option>
                                  <option value="Yes">Yes</option>
                                </select>
                              </td>
                              <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: lk ? 'transparent' : (canDistribute && !e.amountVaries ? '#fff' : '#f3f4f6') }}>
                                <select className={cellCls} value={e.distributeMonthly ? 'Yes' : 'No'} disabled={lk || !canDistribute || e.amountVaries} style={{ minWidth: 80 }}
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
                            </div>
                          ) : e.reimbursementId ? (
                            <span className="px-2 py-1.5 block text-[11px]" style={{ color: '#92400e', minWidth: 160 }}>In RFP — for payment</span>
                          ) : (
                            <span className="px-2 py-1.5 block text-[11px]" style={{ color: 'var(--mid-gray)', minWidth: 160 }}>Not yet in RFP</span>
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
                        {recordType === 'ONE_TIME' && (
                          <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                            <select className={cellCls} value={e.audited ? 'Yes' : 'No'} disabled={!canAudit}
                              title={!canAudit ? 'Only an Accountant or Admin can change the audit status' : ''}
                              onChange={ev => setAudited(e.id, ev.target.value === 'Yes')} style={{ minWidth: 70 }}>
                              <option value="No">No</option>
                              <option value="Yes">Yes</option>
                            </select>
                          </td>
                        )}
                        <td className="border-b px-1 text-center" style={{ borderColor: 'var(--light-gray)' }}>
                          {canWrite && !e.reimbursementId && (e.recordType === 'RECURRING' || !e.paidAt) && (
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
                  {displayed.length === 0 && (
                    <tr><td colSpan={isRecurringTab ? 31 : 25} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>
                      {q || Object.values(gridFilters).some(Boolean) ? 'No entries match your search/filters.' : 'No entries yet. Click "Add Row" to start.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {canWrite && (
            <div className="flex items-center gap-2">
              <button onClick={addRow} disabled={adding}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--teal)' }}>
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Row
              </button>
              <button onClick={duplicateLast} disabled={adding || entries.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border disabled:opacity-50"
                style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }} title="Copy the last entry's details into a new row (change the amount)">
                <Plus size={14} /> Duplicate previous entry
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'cc-report' && (
        <CcReportTab branch={branch} cards={cards} canWrite={canWrite} canEdit={canAudit} />
      )}

      {tab === 'rfp' && (
        <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <SortFilterHead cols={rfpCols} sortKey={rfpSort.key} sortDir={rfpSort.dir} filters={rfpFilters}
              onToggleSort={rfpToggleSort} onFilter={(k, v) => setRfpFilters(f => ({ ...f, [k]: v }))} trailing />
            <tbody>
              {shownRfps.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{r.refNumber}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{new Date(r.createdAt).toLocaleDateString('en-PH')}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.module === 'PAYROLL_SALARY' ? 'Salaries' : r.module === 'PAYROLL_BENEFIT' ? 'Benefits' : r.kind === 'INVALID' ? 'Invalid' : 'Valid'}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.module && r.module.startsWith('PAYROLL') ? (r.meta?.ids?.length || 0) : r._count.entries}</td>
                  <td className="px-4 py-2.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>₱{peso(num(r.grossTotal))}</td>
                  <td className="px-4 py-2.5 text-right font-semibold" style={{ color: 'var(--deep-teal)' }}>₱{peso(num(r.payableTotal))}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={r.status === 'PAID' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                      {r.status === 'PAID' ? 'Paid' : 'For Payment'}
                    </span>
                    {r.status === 'PAID' && r.paidAt && (
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                        {new Date(r.paidAt).toLocaleDateString('en-PH')}{r.paymentMethod ? ` · ${r.paymentMethod}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => downloadRfpPdf(r)} title="Download PDF"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                      <Download size={13} /> PDF
                    </button>
                    <button onClick={() => openBillingVoucher(r)} title="Billing Voucher"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                      <FileText size={13} /> Billing Voucher
                    </button>
                    {r.proofUrl && (
                      <a href={r.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                        <Eye size={13} /> Proof
                      </a>
                    )}
                    {canWrite && r.status !== 'PAID' && (
                      <button onClick={() => isPayrollRfp(r) ? setPayrollPayTarget(r) : setPayTarget(r)} title="Record as Paid"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white mr-1" style={{ background: 'var(--teal)' }}>
                        <CreditCard size={13} /> {isPayrollRfp(r) ? 'Paid' : 'Record as Paid'}
                      </button>
                    )}
                    {canWrite && r.status === 'PAID' && !isPayrollRfp(r) && (
                      <button onClick={() => setPayTarget(r)} title="Edit payment"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                        <Pencil size={13} /> Edit
                      </button>
                    )}
                    {canWrite && r.status === 'PAID' && (
                      <button onClick={() => unpayRfp(r)} title="Unmark paid"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                        Unpay
                      </button>
                    )}
                    {canWrite && (
                      <button onClick={() => deleteRfp(r)} title="Delete (releases entries)"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: '#fecaca', color: '#dc2626' }}>
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {shownRfps.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>
                  {rfps.length === 0 ? 'No RFPs yet. In Recurring/One-time expense, click "RFP (Valid)" or "RFP (Invalid)", select entries, then Generate RFP.' : 'No RFPs match the current filters.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'expense-report' && (
        <ExpenseReportTab branch={branch} canWrite={canWrite} canEdit={canAudit} />
      )}

      {tab === 'suppliers' && (
        <SuppliersTab branch={branch} canWrite={canWrite} />
      )}

      {tab === 'flowchart' && (
        <div className="rounded-2xl border bg-white p-6" style={{ borderColor: 'var(--light-gray)' }}>
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Expenses Workflow</h2>
          <p className="text-xs font-semibold mb-6" style={{ color: 'var(--teal)' }}>For expenses more than ₱2,000.</p>

          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--charcoal)' }}>Recurring Expense</h3>
          <div className="flex flex-col items-center mb-8">
            {([
              { n: 1, title: 'Set up a recurring expense', desc: 'Especially prepaid ones (e.g. annual subscription). Distributed/prepaid auto-amortizes in the income statement.' },
              { n: 2, title: 'Renewal / monthly alert', desc: 'Prepaid: alerts to renew on expiry. Monthly: a monthly alert.' },
              { n: 3, title: 'Convert to One-time expense', desc: 'The alert lets you enter it as a One-time expense (top of the One-time tab).' },
            ] as const).map((s, i, arr) => (
              <div key={s.n} className="w-full max-w-xl flex flex-col items-center">
                <div className="w-full rounded-2xl border p-4 flex items-start gap-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'var(--teal)' }}>{s.n}</div>
                  <div className="min-w-0"><p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{s.title}</p><p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{s.desc}</p></div>
                </div>
                {i < arr.length - 1 && <div className="text-xl leading-none my-1" style={{ color: 'var(--teal)' }}>↓</div>}
              </div>
            ))}
          </div>

          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--charcoal)' }}>One-time Expense</h3>
          <div className="flex flex-col items-center">
            {([
              { n: 1, title: 'Expense entry', who: 'Bookkeeper', desc: 'Encode the one-time expense.' },
              { n: 2, title: 'Audited', who: 'Accountant', desc: 'Accountant sets Audited = Yes.' },
              { n: 3, title: 'Filed for RFP', who: 'Accountant', desc: 'Group audited entries via RFP (Valid) or RFP (Invalid).' },
              { n: 4, title: 'Print & submit for approval', who: '', desc: 'Print the reimbursement (RFP) report and submit for approval.' },
              { n: 5, title: 'Mark as Paid', who: '', desc: 'Once reimbursed & replenished, open the RFP and click “Record as Paid”.' },
              { n: 6, title: 'Expense Report', who: '', desc: 'The paid entries appear in the Expense Report.' },
            ] as const).map((s, i, arr) => (
              <div key={s.n} className="w-full max-w-xl flex flex-col items-center">
                <div className="w-full rounded-2xl border p-4 flex items-start gap-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'var(--teal)' }}>{s.n}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{s.title}{s.who && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold align-middle" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{s.who}</span>}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{s.desc}</p>
                  </div>
                </div>
                {i < arr.length - 1 && <div className="text-xl leading-none my-1" style={{ color: 'var(--teal)' }}>↓</div>}
              </div>
            ))}
          </div>
        </div>
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

      {showRfpModal && (() => {
        const sel = entries.filter(e => selected.has(e.id))
        const tG = sel.reduce((s, e) => s + num(e.grossAmount), 0)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowRfpModal(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={ev => ev.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Generate RFP ({rfpMode === 'VALID' ? 'Valid' : 'Invalid'})</h2>
                <button onClick={() => setShowRfpModal(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>
                {sel.length} {rfpMode === 'VALID' ? 'valid' : 'invalid'} entr{sel.length === 1 ? 'y' : 'ies'} will be grouped into one RFP and locked. Total <strong style={{ color: 'var(--charcoal)' }}>₱{peso(tG)}</strong>. Record the payment afterwards in the RFP tab.
              </p>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>RFP Number (optional)</label>
              <input type="text" inputMode="numeric" value={rfpManualSeq} onChange={ev => setRfpManualSeq(ev.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 000007 — leave blank to auto-number" className="w-full px-3 py-2 rounded-xl border text-sm mb-4 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
              <button onClick={() => generateRfp(rfpManualSeq)} disabled={generatingRfp || sel.length === 0}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>
                {generatingRfp ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} {generatingRfp ? 'Generating…' : 'Generate RFP'}
              </button>
            </div>
          </div>
        )
      })()}

      {payTarget && (
        <ForPaymentModal count={payTarget._count.entries} bankOptions={bankOptions} cards={cards} paying={paying}
          title={`Record RFP as Paid — ${payTarget.refNumber}`} confirmLabel="Confirm Payment"
          onClose={() => setPayTarget(null)} onAddCard={addCard} onSubmit={p => recordRfpPaid(payTarget, p)} />
      )}

      {payrollPayTarget && (
        <RecordPayrollPaymentModal rfp={payrollPayTarget}
          onClose={() => setPayrollPayTarget(null)}
          onDone={async () => { setPayrollPayTarget(null); await loadRfps(branch) }} />
      )}

      {bvTarget && <BillingVoucherModal refNumber={bvTarget.refNumber} date={bvTarget.date} lines={bvTarget.lines} branch={bvTarget.branch} onClose={() => setBvTarget(null)} />}

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
function ForPaymentModal({ count, bankOptions, cards, paying, title, confirmLabel, onClose, onAddCard, onSubmit }: {
  count: number; bankOptions: string[]; cards: Card[]; paying: boolean; title?: string; confirmLabel?: string
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
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{title || 'For Payment'}</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>
          {count} entr{count === 1 ? 'y' : 'ies'} in this RFP. Enter the payment details below.
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
          {paying ? 'Recording…' : (confirmLabel || 'Confirm Payment')}
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
  paidAt: string | null; paymentForm: string | null; paymentRef: string | null
}
interface CcTxn {
  id: string; pcvNumber: string; requestor: string | null; date: string | null
  description: string | null; accountTitle: string | null; grossAmount: string | number; paidAt: string | null
}

function CcReportTab({ branch, cards, canWrite, canEdit }: { branch: string; cards: Card[]; canWrite: boolean; canEdit: boolean }) {
  const now = new Date()
  const [cardId, setCardId] = useState('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [reports, setReports] = useState<CcReport[]>([])
  const [txns, setTxns] = useState<CcTxn[]>([])
  const [loadingTxns, setLoadingTxns] = useState(false)
  const [creating, setCreating] = useState(false)
  const [uploadingStmt, setUploadingStmt] = useState('')
  const [txnRefresh, setTxnRefresh] = useState(0)
  const [editRow, setEditRow] = useState<{ id: string; date: string; accountTitle: string; description: string; gross: number } | null>(null)
  const [payCcTarget, setPayCcTarget] = useState<CcReport | null>(null)
  const [txnSort, setTxnSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'asc' })
  const [txnFilters, setTxnFilters] = useState<Record<string, string>>({})
  const txnToggleSort = (k: string) => setTxnSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const txnCols = [
    { key: 'pcvNumber', label: 'Reference Number' }, { key: 'requestor', label: 'Payee' }, { key: 'date', label: 'Expense Date' },
    { key: 'description', label: 'Description' }, { key: 'accountTitle', label: 'Account Title' }, { key: 'paidAt', label: 'Charged On' }, { key: 'amount', label: 'Amount' },
  ]
  const txnGet = (t: CcTxn, k: string): string | number =>
    k === 'pcvNumber' ? t.pcvNumber : k === 'requestor' ? (t.requestor || '') : k === 'date' ? (t.date ? String(t.date).slice(0, 10) : '')
      : k === 'description' ? (t.description || '') : k === 'accountTitle' ? (t.accountTitle || '') : k === 'paidAt' ? (t.paidAt ? String(t.paidAt).slice(0, 10) : '')
      : k === 'amount' ? num(t.grossAmount) : ''
  const deleteTxn = async (id: string) => {
    if (!confirm('Delete this entry? It will be removed from the report and any RFP it was in.')) return
    setTxns(prev => prev.filter(t => t.id !== id))
    try { await fetch(`/api/expenses/report-entry?id=${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }

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
  }, [branch, cardId, month, year, txnRefresh])

  const report = reports.find(r => r.cardId === cardId && r.periodMonth === month && r.periodYear === year) || null
  const total = txns.reduce((s, t) => s + num(t.grossAmount), 0)
  const shownTxns = applySortFilter(txns, txnGet, txnSort.key, txnSort.dir, txnFilters)
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
  const markPaid = async (id: string, p: { datePaid: string; paymentForm: string; paymentRef: string }) => {
    const r = await fetch('/api/expenses/cc-reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'pay', ...p }) })
    if (r.ok) { const rep = await r.json(); setReports(prev => prev.map(x => (x.id === id ? { ...x, ...rep } : x))) }
    else alert((await r.json()).error || 'Failed to record payment')
  }
  const unpay = async (id: string) => {
    const r = await fetch('/api/expenses/cc-reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'unpay' }) })
    if (r.ok) { const rep = await r.json(); setReports(prev => prev.map(x => (x.id === id ? { ...x, ...rep } : x))) }
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
    if (!confirm('Delete this CC report? Its one-time expenses are released back to One-time expense as editable entries (payment cleared).')) return
    setReports(prev => prev.filter(r => r.id !== id))
    try { await fetch(`/api/expenses/cc-reports?id=${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }

  const CC_COLS = ['Reference Number', 'Payee', 'Expense Date', 'Description', 'Account Title', 'Charged On', 'Amount']
  const ccCells = (t: CcTxn) => [t.pcvNumber, t.requestor || '', t.date ? String(t.date).slice(0, 10) : '', t.description || '', t.accountTitle || '', t.paidAt ? String(t.paidAt).slice(0, 10) : '', num(t.grossAmount).toFixed(2)]
  const ccTitle = () => `${cardOf(cardId) ? cardLabel(cardOf(cardId)!) : ''} · ${MONTHS[month - 1]} ${year}${report ? ` · ${report.refNumber}` : ''}`
  const exportCcExcel = async () => {
    const XLSX = await import('xlsx')
    const aoa = [[ccTitle()], CC_COLS, ...txns.map(ccCells), ['', '', '', '', '', 'TOTAL', total.toFixed(2)]]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'CC Report')
    XLSX.writeFile(wb, `${report ? report.refNumber : 'cc-report'}.xlsx`)
  }
  const exportCcPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setFont('helvetica', 'bold').setFontSize(13).text('Credit Card Report', 14, 14)
    doc.setFont('helvetica', 'normal').setFontSize(9).text(ccTitle(), 14, 20)
    autoTable(doc, {
      startY: 24, head: [CC_COLS], body: txns.map(ccCells),
      foot: [['', '', '', '', '', 'TOTAL', total.toFixed(2)]],
      styles: { fontSize: 7.5, cellPadding: 1.5 }, headStyles: { fillColor: [36, 73, 82], textColor: 255 },
      footStyles: { fillColor: [237, 243, 217], textColor: [30, 30, 30], fontStyle: 'bold' },
      columnStyles: { 6: { halign: 'right' } }, margin: { left: 10, right: 10 },
    })
    doc.save(`${report ? report.refNumber : 'cc-report'}.pdf`)
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
              {report && !report.paidAt && (
                <p className="text-[11px] mt-1" style={{ color: '#92400e' }}>These charges appear in the Expense Report only after the card bill is marked paid.</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={exportCcPdf} disabled={txns.length === 0} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border disabled:opacity-40" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                <Download size={14} /> PDF
              </button>
              <button onClick={exportCcExcel} disabled={txns.length === 0} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border disabled:opacity-40" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                <Download size={14} /> Excel
              </button>
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
                  {report.paidAt ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: '#dcfce7', color: '#166534' }}>
                      <CheckCircle2 size={14} /> Paid {String(report.paidAt).slice(0, 10)}{report.paymentForm ? ` · ${report.paymentForm}` : ''}{report.paymentRef ? ` · ${report.paymentRef}` : ''}
                      {canWrite && <button onClick={() => setPayCcTarget(report)} title="Edit / unpay" className="ml-1"><Pencil size={12} /></button>}
                    </span>
                  ) : canWrite ? (
                    <button onClick={() => setPayCcTarget(report)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#c44b00' }}>
                      <CheckCircle2 size={14} /> Mark Card Bill Paid
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>Card bill unpaid</span>
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
                <SortFilterHead cols={txnCols} sortKey={txnSort.key} sortDir={txnSort.dir} filters={txnFilters}
                  onToggleSort={txnToggleSort} onFilter={(k, v) => setTxnFilters(f => ({ ...f, [k]: v }))} trailing={canEdit} />
                <tbody>
                  {shownTxns.map(t => (
                    <tr key={t.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{t.pcvNumber}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{t.requestor || ''}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{t.date ? String(t.date).slice(0, 10) : ''}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{t.description || ''}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{t.accountTitle || ''}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{t.paidAt ? String(t.paidAt).slice(0, 10) : ''}</td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(num(t.grossAmount))}</td>
                      {canEdit && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={() => setEditRow({ id: t.id, date: t.date ? String(t.date).slice(0, 10) : '', accountTitle: t.accountTitle || '', description: t.description || '', gross: num(t.grossAmount) })}
                            title="Edit" className="p-1 rounded hover:bg-teal-50 mr-1"><Pencil size={13} style={{ color: 'var(--teal)' }} /></button>
                          <button onClick={() => deleteTxn(t.id)} title="Delete" className="p-1 rounded hover:bg-red-50"><Trash2 size={13} style={{ color: '#dc2626' }} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {shownTxns.length === 0 && (
                    <tr><td colSpan={canEdit ? 8 : 7} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>{txns.length === 0 ? `No credit-card charges for this card in ${MONTHS[month - 1]} ${year}.` : 'No charges match the current filters.'}</td></tr>
                  )}
                  {shownTxns.length > 0 && (
                    <tr className="border-t-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                      <td colSpan={6} className="px-3 py-2 text-right font-bold" style={{ color: 'var(--charcoal)' }}>TOTAL</td>
                      <td className="px-3 py-2 text-right font-bold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(total)}</td>
                      {canEdit && <td />}
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

      {editRow && (
        <ReportEntryEditModal row={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); setTxnRefresh(x => x + 1) }} />
      )}
      {payCcTarget && (
        <CcPaidModal report={payCcTarget} onClose={() => setPayCcTarget(null)}
          onPay={async p => { await markPaid(payCcTarget.id, p); setPayCcTarget(null) }}
          onUnpay={async () => { await unpay(payCcTarget.id); setPayCcTarget(null) }} />
      )}
    </div>
  )
}

// Record settlement of the credit-card bill (date + form of payment).
function CcPaidModal({ report, onClose, onPay, onUnpay }: {
  report: CcReport; onClose: () => void
  onPay: (p: { datePaid: string; paymentForm: string; paymentRef: string }) => Promise<void>; onUnpay: () => Promise<void>
}) {
  const [datePaid, setDatePaid] = useState(report.paidAt ? String(report.paidAt).slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [form, setForm] = useState(report.paymentForm || 'Check Deposit')
  const [ref, setRef] = useState(report.paymentRef || '')
  const [busy, setBusy] = useState(false)
  const refLabel = form === 'Online Fund Transfer' ? 'Transfer reference number' : form === 'Cash Deposit' ? 'Deposit slip / reference (optional)' : 'Check number'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Mark Credit Card Bill Paid</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>{report.refNumber} — settle how the card bill was paid. Its charged expenses then appear in the Expense Report.</p>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Date of payment</label>
        <input type="date" value={datePaid} onChange={e => setDatePaid(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Form of payment</label>
        <select value={form} onChange={e => setForm(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option>Check Deposit</option><option>Cash Deposit</option><option>Online Fund Transfer</option>
        </select>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>{refLabel}</label>
        <input value={ref} onChange={e => setRef(e.target.value)} placeholder="Leading zeros preserved" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-4" style={{ borderColor: 'var(--light-gray)' }} />
        <div className="flex gap-2">
          <button onClick={async () => { setBusy(true); try { await onPay({ datePaid, paymentForm: form, paymentRef: ref }) } finally { setBusy(false) } }} disabled={busy}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Save payment'}</button>
          {report.paidAt && <button onClick={async () => { setBusy(true); try { await onUnpay() } finally { setBusy(false) } }} disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>Unpay</button>}
        </div>
      </div>
    </div>
  )
}

// ── Expense Report tab ─────────────────────────────────────────
interface ErRow {
  id: string; source: string; reimbursementId: string | null; refNumber: string; payee: string; paymentAccount: string; paymentDate: string
  paymentMethod: string; pcvNumber: string; accountTitle: string; description: string
  netOfVat: number; gross: number; checkInfo: string; validity: string; filingStatus: string
}

function ExpenseReportTab({ branch, canWrite, canEdit }: { branch: string; canWrite: boolean; canEdit: boolean }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<ErRow[]>([])
  const [editRow, setEditRow] = useState<{ id: string; date: string; accountTitle: string; description: string; gross: number } | null>(null)
  // "Delete" from the Expense Report returns the entry's RFP to the RFP tab (un-pays it).
  const returnToRfp = async (r: ErRow) => {
    if (!r.reimbursementId) { alert('No RFP linked to this entry.'); return }
    if (!confirm(`Return RFP ${r.refNumber || ''} to the RFP tab? It will be marked unpaid and its entries go back "for payment". Continue?`)) return
    const url = r.source === 'PETTY_CASH' ? '/api/petty-cash/reimbursements' : '/api/expenses/rfp'
    try {
      const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.reimbursementId, action: 'unpay' }) })
      if (res.ok) load()
      else alert((await res.json()).error || 'Failed')
    } catch { alert('Failed') }
  }
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

  // Treat anything not explicitly Invalid/Cancelled (incl. blank validity) as Valid.
  const valid = rows.filter(r => r.validity !== 'Invalid' && r.validity !== 'Cancelled')
  const invalid = rows.filter(r => r.validity === 'Invalid')
  const totalValid = valid.reduce((s, r) => s + r.netOfVat, 0)
  const totalInvalid = invalid.reduce((s, r) => s + r.netOfVat, 0)
  const base = view === 'Valid' ? valid : invalid

  const [erSort, setErSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'paymentDate', dir: 'asc' })
  const [erFilters, setErFilters] = useState<Record<string, string>>({})
  const erToggleSort = (k: string) => setErSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const erCols = [
    { key: 'payee', label: 'Payee' }, { key: 'paymentAccount', label: 'Payment Account' }, { key: 'paymentDate', label: 'Payment Date' },
    { key: 'paymentMethod', label: 'Payment Method' }, { key: 'pcvNumber', label: 'Reference Number' }, { key: 'accountTitle', label: 'Account Title' },
    { key: 'description', label: 'Description' }, { key: 'netOfVat', label: 'Amount Net of VAT' }, { key: 'checkInfo', label: 'Check Number / Online Transfer Ref. No.' }, { key: 'status', label: 'Status' },
  ]
  const erGet = (r: ErRow, k: string): string | number =>
    k === 'netOfVat' ? r.netOfVat : k === 'status' ? (r.filingStatus === 'FILED' ? 'Filed' : 'For Filing')
      : (r[k as keyof ErRow] as string | number) ?? ''
  const shown = applySortFilter(base, erGet, erSort.key, erSort.dir, erFilters)
  const shownTotal = shown.reduce((s, r) => s + r.netOfVat, 0)

  const setStatus = async (id: string, filingStatus: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, filingStatus } : r)))
    try { await fetch('/api/expenses/filing-status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, filingStatus }) }) } catch { /* ignore */ }
  }

  const COLS_ER = ['Payee', 'Payment Account', 'Payment Date', 'Payment Method', 'Reference Number', 'Account Title', 'Description', 'Net of VAT', 'Check Number / Online Transfer Ref. No.', 'Status']
  const rowCells = (r: ErRow) => [r.payee, r.paymentAccount, r.paymentDate, r.paymentMethod, r.pcvNumber, r.accountTitle, r.description, r.netOfVat.toFixed(2), r.checkInfo, r.filingStatus === 'FILED' ? 'Filed' : 'For Filing']
  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const total = view === 'Valid' ? totalValid : totalInvalid
    const aoa = [COLS_ER, ...shown.map(rowCells), ['', '', '', '', '', '', `TOTAL ${view}`, total.toFixed(2), '', '']]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${view} Expenses`)
    XLSX.writeFile(wb, `expense-report-${view.toLowerCase()}.xlsx`)
  }
  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setFont('helvetica', 'bold').setFontSize(13).text(`Expense Report — ${view} Expenses`, 14, 14)
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text(`Range: ${from || 'start'} → ${to || 'end'}   ·   ${shown.length} item(s)`, 14, 20)
    const total = view === 'Valid' ? totalValid : totalInvalid
    autoTable(doc, {
      startY: 24, head: [COLS_ER], body: shown.map(rowCells),
      foot: [['', '', '', '', '', '', `TOTAL ${view}`, total.toFixed(2), '', '']],
      styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [36, 73, 82], textColor: 255 },
      footStyles: { fillColor: [237, 243, 217], textColor: [30, 30, 30], fontStyle: 'bold' },
      columnStyles: { 7: { halign: 'right' } }, margin: { left: 10, right: 10 },
    })
    doc.save(`expense-report-${view.toLowerCase()}.pdf`)
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
        <div className="flex-1" />
        <button onClick={exportPdf} disabled={shown.length === 0} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border disabled:opacity-40" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
          <Download size={14} /> PDF
        </button>
        <button onClick={exportExcel} disabled={shown.length === 0} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border disabled:opacity-40" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
          <Download size={14} /> Excel
        </button>
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
            <SortFilterHead cols={erCols} sortKey={erSort.key} sortDir={erSort.dir} filters={erFilters}
              onToggleSort={erToggleSort} onFilter={(k, v) => setErFilters(f => ({ ...f, [k]: v }))} trailing={canEdit} />
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
                    {canEdit && (
                      <td className="border-b px-2 py-2 text-right whitespace-nowrap" style={{ borderColor: 'var(--light-gray)' }}>
                        <button onClick={() => setEditRow({ id: r.id, date: r.paymentDate, accountTitle: r.accountTitle, description: r.description, gross: r.gross })}
                          title="Edit" className="p-1 rounded hover:bg-teal-50 mr-1"><Pencil size={13} style={{ color: 'var(--teal)' }} /></button>
                        <button onClick={() => returnToRfp(r)} title="Return to RFP (un-pay)" className="p-1 rounded hover:bg-amber-50"><Trash2 size={13} style={{ color: '#dc2626' }} /></button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {shown.length === 0 && (
                <tr><td colSpan={canEdit ? 11 : 10} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>{base.length === 0 ? `No ${view.toLowerCase()} paid expenses${(from || to) ? ' in this date range' : ''}.` : 'No rows match the current filters.'}</td></tr>
              )}
              {shown.length > 0 && (
                <tr style={{ background: 'var(--off-white)' }}>
                  <td colSpan={7} className="border-r border-b px-3 py-2 text-right font-bold" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>TOTAL {view}</td>
                  <td className="border-r border-b px-3 py-2 text-right font-bold whitespace-nowrap" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>₱{peso(shownTotal)}</td>
                  <td className="border-r border-b" style={{ borderColor: 'var(--light-gray)' }} colSpan={canEdit ? 3 : 2}></td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {editRow && (
        <ReportEntryEditModal row={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); load() }} />
      )}
    </div>
  )
}

// ── Edit an entry from a report (bypasses the paid/RFP lock) ──
function ReportEntryEditModal({ row, onClose, onSaved }: {
  row: { id: string; date: string; accountTitle: string; description: string; gross: number }
  onClose: () => void; onSaved: () => void
}) {
  const [date, setDate] = useState(row.date || '')
  const [accountTitle, setAccountTitle] = useState(row.accountTitle || '')
  const [description, setDescription] = useState(row.description || '')
  const [gross, setGross] = useState(String(row.gross || ''))
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/expenses/report-entry', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, date: date || null, accountTitle, description, grossAmount: Number(gross) || 0 }),
      })
      if (r.ok) onSaved()
      else alert((await r.json()).error || 'Failed to save')
    } catch { alert('Failed to save') }
    setSaving(false)
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Edit Entry</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Account Title</label>
        <input value={accountTitle} onChange={e => setAccountTitle(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Gross Amount</label>
        <input type="number" step="0.01" value={gross} onChange={e => setGross(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-4 text-right" style={{ borderColor: 'var(--light-gray)' }} />
        <button onClick={save} disabled={saving} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{saving ? 'Saving…' : 'Save Changes'}</button>
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

// ── Payee autocomplete (styled combobox over the Suppliers list) ──
function SupplierCombo({ value, disabled, placeholder, suppliers, onCommit }: {
  value: string; disabled: boolean; placeholder?: string; suppliers: Supplier[]
  onCommit: (val: string, sup: Supplier | null) => void
}) {
  const inputCls = 'w-full bg-transparent px-2 py-1.5 text-xs outline-none focus:bg-[var(--pale-teal)] rounded'
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setDraft(value) }, [value])

  const place = () => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 2, left: r.left, width: r.width }) }
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open])

  const q = draft.trim().toLowerCase()
  const matches = suppliers.filter(s => !q || s.registeredName.toLowerCase().includes(q)).slice(0, 40)
  const commit = (val: string) => {
    const sup = suppliers.find(s => s.registeredName.trim().toLowerCase() === val.trim().toLowerCase()) || null
    onCommit(val, sup)
  }
  const pick = (s: Supplier) => { setDraft(s.registeredName); setOpen(false); onCommit(s.registeredName, s) }

  return (
    <>
      <input ref={ref} className={inputCls} disabled={disabled} value={draft} placeholder={placeholder} style={{ minWidth: 170 }}
        onFocus={() => { place(); setOpen(true) }}
        onChange={e => { setDraft(e.target.value); place(); setOpen(true) }}
        onBlur={() => { window.setTimeout(() => setOpen(false), 120); commit(draft) }}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false)
          else if (e.key === 'Enter') { setOpen(false); commit(draft); (e.target as HTMLInputElement).blur() }
        }} />
      {open && !disabled && pos && matches.length > 0 && (
        <div className="fixed z-[80] rounded-xl border bg-white shadow-xl overflow-auto"
          style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 220), maxHeight: 240, borderColor: 'var(--light-gray)' }}>
          {matches.map(s => (
            <button key={(s.id || '') + s.registeredName} type="button"
              onMouseDown={e => { e.preventDefault(); pick(s) }}
              className="w-full text-left px-3 py-2 hover:bg-[var(--pale-teal)] border-b last:border-b-0" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="text-xs font-medium truncate" style={{ color: 'var(--charcoal)' }}>{s.registeredName}</div>
              {(s.tin || s.registeredAddress) && (
                <div className="text-[10px] truncate" style={{ color: 'var(--mid-gray)' }}>{[s.tin, s.registeredAddress].filter(Boolean).join(' · ')}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// Record payment for a payroll-sourced RFP (Salaries / Benefits Payable).
function RecordPayrollPaymentModal({ rfp, onClose, onDone }: { rfp: Rfp; onClose: () => void; onDone: () => void }) {
  const isSalary = rfp.module === 'PAYROLL_SALARY'
  const total = typeof rfp.grossTotal === 'number' ? rfp.grossTotal : parseFloat(rfp.grossTotal)
  const count = rfp.meta?.ids?.length || 0
  const [assets, setAssets] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [q, setQ] = useState('')
  const [feeQ, setFeeQ] = useState('')
  const [datePaid, setDatePaid] = useState(new Date().toISOString().slice(0, 10))
  const [fromAccountId, setFromAccountId] = useState('')
  const [bankRef, setBankRef] = useState('')
  const [remarks, setRemarks] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [feeAmount, setFeeAmount] = useState('')
  const [feeExpenseAccountId, setFeeExpenseAccountId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetch('/api/chart-of-accounts?pageSize=1000').then(r => r.ok ? r.json() : { data: [] }).then(d => setAssets((d.data || []).filter((a: { accountType: string }) => a.accountType === 'ASSET').map((a: { id: string; accountNumber: string; accountTitle: string }) => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle })))).catch(() => {}) }, [])
  const allAccts = assets
  const filtered = allAccts.filter(a => !q || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(q.toLowerCase()))
  const feeFiltered = allAccts.filter(a => !feeQ || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(feeQ.toLowerCase()))

  const upload = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try { const fd = new FormData(); fd.append('file', file); const r = await fetch('/api/upload', { method: 'POST', body: fd }); if (r.ok) { const d = await r.json(); setProofUrl(d.url || d.fileUrl || '') } else alert('Upload failed') } catch { alert('Upload failed') } finally { setUploading(false) }
  }

  const submit = async () => {
    if (!fromAccountId) { alert('Choose a source account.'); return }
    setBusy(true)
    try {
      const ids = rfp.meta?.ids || []
      const useEmployee = isSalary ? (rfp.meta?.payableType === 'EMPLOYEE') : true
      const idBody = useEmployee ? { employeePayslipIds: ids } : { payrollEntryIds: ids }
      const hasFee = isSalary && Number(feeAmount) > 0 && feeExpenseAccountId
      const endpoint = isSalary ? '/api/payroll/salary-payments' : '/api/payroll/benefit-payments'
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...idBody, paymentDate: datePaid, fromAccountId, proofUrl: proofUrl || null,
          notes: bankRef || null, remarks: remarks || null,
          ...(hasFee ? { feeAmount: Number(feeAmount), feeExpenseAccountId, feeCashAccountId: fromAccountId } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Failed to record payment'); return }
      const paymentId = data?.payment?.id || null
      await fetch('/api/expenses/rfp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rfp.id, action: 'pay-payroll', paymentId, datePaid, paymentMethod: 'Bank/Cash', proofUrl: proofUrl || null }) })
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Record {isSalary ? 'Salary' : 'Benefit'} Payment</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <div className="rounded-xl px-4 py-2.5 mb-4 text-sm font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{count} entries — Net Pay: ₱{peso(total)} · {rfp.refNumber}</div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Payment Date</label>
        <input type="date" value={datePaid} onChange={e => setDatePaid(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Source Account (Cash/Bank)</label>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search asset accounts…" className="w-full px-3 py-2 rounded-xl border text-sm mb-1" style={{ borderColor: 'var(--light-gray)' }} />
        <select value={fromAccountId} onChange={e => setFromAccountId(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">— Select Account —</option>{filtered.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
        </select>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Bank transaction reference number</label>
        <input value={bankRef} onChange={e => setBankRef(e.target.value)} placeholder="Reference / check number" className="w-full px-3 py-2 rounded-xl border text-sm mb-3 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Remarks</label>
        <input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Anything else to note for this transaction" className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Proof of Remittance (optional)</label>
        <div className="flex items-center gap-2 mb-3">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer" style={{ background: 'var(--teal)' }}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {proofUrl ? 'Replace' : 'Upload proof file (image or PDF)'}
            <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => { upload(e.target.files?.[0] || null); e.target.value = '' }} />
          </label>
          {proofUrl && <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--teal)' }}><Eye size={13} /> View</a>}
        </div>
        {isSalary && (
          <div className="rounded-xl border p-3 mb-4" style={{ borderColor: 'var(--light-gray)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>Remittance Fee (optional)</p>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Fee Amount</label>
            <input value={feeAmount} onChange={e => setFeeAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-full px-3 py-2 rounded-xl border text-sm mb-2 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
            {Number(feeAmount) > 0 && (<>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Fee Expense Account</label>
              <input value={feeQ} onChange={e => setFeeQ(e.target.value)} placeholder="Search accounts…" className="w-full px-3 py-2 rounded-xl border text-sm mb-1" style={{ borderColor: 'var(--light-gray)' }} />
              <select value={feeExpenseAccountId} onChange={e => setFeeExpenseAccountId(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
                <option value="">— Select Account —</option>{feeFiltered.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
              </select>
            </>)}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : `Record Payment — ₱${peso(total)}`}</button>
        </div>
      </div>
    </div>
  )
}
