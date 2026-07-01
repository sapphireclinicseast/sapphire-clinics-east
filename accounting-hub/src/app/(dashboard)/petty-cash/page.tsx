'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Settings, Loader2, Trash2, X, Maximize2, Minimize2, Download, Upload, FileDown, FileText, CheckCircle2, Paperclip, Eye, Pencil } from 'lucide-react'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'

// ── Constants ──────────────────────────────────────────────────
const BRANCHES = [
  { code: 'AHEA', value: 'SANDBOX_EAST', label: 'AHEA' },
  { code: 'AHGH', value: 'SANDBOX_GREENHILLS', label: 'AHGH' },
  { code: 'VER', value: 'VERDANA_STORE', label: 'VERDANA' },
  { code: 'CEO', value: 'CEO', label: 'CEO' },
]
const ALLOC_BRANCHES = BRANCHES.filter(b => b.value !== 'CEO')
const DEPARTMENTS = ['ADMIN', 'PT', 'OT', 'SLP', 'SPED', 'PSYCH', 'MD', 'ORTHOSIS']
const PCF_STATUS = ['Unliquidated', 'For Replenishment', 'Cancelled', 'Missing']
const VATABLE = ['VAT', 'Non-VAT']
const VALIDITY = ['Valid', 'Invalid', 'Cancelled']
const PAYMENT_METHODS = ['Check deposit', 'Check encashment to deposit as cash', 'Online Fund Transfer']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

interface Entry {
  id: string
  branch: string
  pcvNumber: string
  pcvSeq: number
  pcvSub: number
  requestor: string | null
  department: string | null
  pcfStatus: string | null
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
  referenceNumber: string | null
  proofUrl: string | null
  proofUrls: string[] | null
  branchAllocations: { branch: string; amount: number }[] | null
  reimbursementId: string | null
  finalized: boolean
  audited: boolean
}

interface Reimb {
  id: string
  refNumber: string
  grossTotal: string | number
  payableTotal: string | number
  status: string
  kind: string | null
  paidAt: string | null
  paymentMethod: string | null
  checkNumber: string | null
  transferRef: string | null
  debitAccount: string | null
  depositAccount: string | null
  proofUrl: string | null
  createdAt: string
  _count: { entries: number }
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
// Reference number shown to users: PCV base-sub + VAL/INV once validity is set.
const refOf = (e: Entry) => `${e.pcvNumber}${e.validity === 'Valid' ? '-VAL' : e.validity === 'Invalid' ? '-INV' : ''}`
const descForHub = (e: Entry) => (e.description ? `${refOf(e)}; ${e.description}` : refOf(e))
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

export default function PettyCashPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role || ''
  const canWrite = WRITE_ROLES.includes(role)
  // Only Accountant + main Admin may set the Audited flag.
  const canAudit = role === 'ADMIN' || role === 'ACCOUNTANT'

  const [branch, setBranch] = useState('SANDBOX_EAST')
  const [tab, setTab] = useState<'entries' | 'reimbursements' | 'flowchart'>('entries')
  const [entries, setEntries] = useState<Entry[]>([])
  const [reimbursements, setReimbursements] = useState<Reimb[]>([])
  // RFP list sort/filter
  const [rfpSort, setRfpSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [rfpFilters, setRfpFilters] = useState<Record<string, string>>({})
  const rfpToggleSort = (k: string) => setRfpSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const rfpCols = [
    { key: 'refNumber', label: 'Reference Number' },
    { key: 'date', label: 'Date' },
    { key: 'entries', label: 'Entries' },
    { key: 'grossTotal', label: 'Gross Total' },
    { key: 'payableTotal', label: 'Amount Payable' },
    { key: 'status', label: 'Status' },
  ]
  const rfpGet = (r: Reimb, k: string): string | number =>
    k === 'refNumber' ? r.refNumber
      : k === 'date' ? new Date(r.createdAt).toISOString().slice(0, 10)
      : k === 'entries' ? r._count.entries
      : k === 'grossTotal' ? num(r.grossTotal)
      : k === 'payableTotal' ? num(r.payableTotal)
      : k === 'status' ? (r.status === 'PAID' ? 'Paid' : 'Pending')
      : ''
  const shownReimb = applySortFilter(reimbursements, rfpGet, rfpSort.key, rfpSort.dir, rfpFilters)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [coaOptions, setCoaOptions] = useState<string[]>([])
  const [requestors, setRequestors] = useState<string[]>([])
  const [nextPcvSeq, setNextPcvSeq] = useState<number>(1)
  const [showSettings, setShowSettings] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rfpMode, setRfpMode] = useState<'VALID' | 'INVALID' | null>(null)
  const [showAddPopup, setShowAddPopup] = useState(false)
  const [addSameSeq, setAddSameSeq] = useState('')
  const [showReimbModal, setShowReimbModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [bankOptions, setBankOptions] = useState<string[]>([])
  const [payTarget, setPayTarget] = useState<Reimb | null>(null)
  const [uploadingProof, setUploadingProof] = useState('')
  const [uploadPct, setUploadPct] = useState<Record<string, number>>({})
  const [supplierNames, setSupplierNames] = useState<Set<string>>(new Set())
  const [suppliers, setSuppliers] = useState<{ registeredName: string; registeredAddress: string; tin: string }[]>([])
  const [newSupplierPrompt, setNewSupplierPrompt] = useState<{ registeredName: string; registeredAddress: string; tin: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadEntries = useCallback(async (br: string) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/petty-cash/entries?branch=${br}`)
      setEntries(r.ok ? await r.json() : [])
    } catch { setEntries([]) }
    setLoading(false)
  }, [])

  const loadSettings = useCallback(async (br: string) => {
    try {
      const r = await fetch(`/api/petty-cash/settings?branch=${br}`)
      if (r.ok) { const s = await r.json(); setRequestors(s.requestors || []); setNextPcvSeq(s.nextPcvSeq || 1) }
    } catch { /* ignore */ }
  }, [])

  const loadReimbursements = useCallback(async (br: string) => {
    try {
      const r = await fetch(`/api/petty-cash/reimbursements?branch=${br}`)
      setReimbursements(r.ok ? await r.json() : [])
    } catch { setReimbursements([]) }
  }, [])

  useEffect(() => {
    setSelected(new Set())
    loadEntries(branch); loadSettings(branch); loadReimbursements(branch)
    // Suppliers list is only defined for the expense branches (not CEO).
    if (['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE'].includes(branch)) {
      fetch(`/api/expenses/suppliers?branch=${branch}&all=1`)
        .then(r => (r.ok ? r.json() : { suppliers: [] }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((d: any) => {
          const list = (d.suppliers || []) as { registeredName: string; registeredAddress?: string; tin?: string }[]
          setSuppliers(list.map(s => ({ registeredName: s.registeredName, registeredAddress: s.registeredAddress || '', tin: s.tin || '' })))
          setSupplierNames(new Set(list.map(s => String(s.registeredName).trim().toLowerCase())))
        })
        .catch(() => { setSuppliers([]); setSupplierNames(new Set()) })
    } else { setSuppliers([]); setSupplierNames(new Set()) }
  }, [branch, loadEntries, loadSettings, loadReimbursements])

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
  }, [])

  useEffect(() => {
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

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const headers = ['Requestor', 'Department', 'PCF Status', 'Date', 'Description', 'Valid/Invalid', 'Vatable',
      'SI Number', 'TIN Number', 'Registered Name', 'Registered Address', 'Gross Amount', 'Account Title']
    const example = ['JUAN DELA CRUZ', 'ADMIN', 'For Replenishment', '2026-06-29', 'Sample expense (delete this row)',
      'Valid', 'VAT', 'SI-0001', '000-000-000-00000', 'SAMPLE VENDOR INC', 'SAMPLE ADDRESS, CITY', 1120, '8050 Courier and Shipping Expense']
    const ws = XLSX.utils.aoa_to_sheet([headers, example])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Petty Cash')
    XLSX.writeFile(wb, 'petty-cash-import-template.xlsx')
  }

  const FIELD_MAP: Record<string, string> = {
    requestor: 'requestor', department: 'department', pcfstatus: 'pcfStatus', date: 'date',
    description: 'description', vatable: 'vatable', sinumber: 'siNumber', sino: 'siNumber',
    tinnumber: 'tinNumber', registeredname: 'registeredName', registeredaddress: 'registeredAddress',
    grossamount: 'grossAmount', gross: 'grossAmount', accounttitle: 'accountTitle',
    referencenumber: 'referenceNumber', reference: 'referenceNumber',
    validinvalid: 'validity', valid: 'validity', validity: 'validity',
  }

  const handleImportFile = async (file: File) => {
    setImporting(true)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
      const rows = json.map(raw => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const out: any = {}
        for (const k of Object.keys(raw)) {
          const field = FIELD_MAP[k.toLowerCase().replace(/[^a-z0-9]/g, '')]
          if (!field) continue
          let v = raw[k]
          if (field === 'date' && v instanceof Date) v = v.toISOString()
          if (field === 'tinNumber' && v) v = formatTin(String(v))
          out[field] = v
        }
        return out
      }).filter(r => Object.values(r).some(v => v !== '' && v !== null && v !== undefined))
      if (rows.length === 0) { alert('No data rows found in the file.'); setImporting(false); return }
      const res = await fetch('/api/petty-cash/entries/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, rows }),
      })
      if (res.ok) { const d = await res.json(); await loadEntries(branch); await loadSettings(branch); alert(`Imported ${d.created} row(s).`) }
      else alert((await res.json()).error || 'Import failed')
    } catch (e) { console.error(e); alert('Could not read the file. Use the downloaded template (.xlsx or .csv).') }
    setImporting(false)
  }

  const addRow = async (samePcvSeq?: number | null) => {
    setAdding(true)
    try {
      const r = await fetch('/api/petty-cash/entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, samePcvSeq: samePcvSeq ?? null }),
      })
      // Only a brand-new PCV consumes the next sequence number.
      if (r.ok) { const e = await r.json(); setEntries(prev => [...prev, e]); if (samePcvSeq == null) setNextPcvSeq(s => s + 1) }
      else alert((await r.json()).error || 'Failed to add row')
    } catch { /* ignore */ }
    setAdding(false)
  }

  const getAllocArr = (e: Entry) => (Array.isArray(e.branchAllocations) ? e.branchAllocations : [])
  const allocOf = (e: Entry, bv: string) => getAllocArr(e).find(x => x.branch === bv)?.amount
  const allocSum = (e: Entry) => getAllocArr(e).reduce((sm, a) => sm + (Number(a.amount) || 0), 0)
  const saveAlloc = (e: Entry, arr: { branch: string; amount: number }[], debounce = false) => saveField(e.id, { branchAllocations: arr }, debounce)
  const toggleAlloc = (e: Entry, bv: string) => {
    const arr = getAllocArr(e).slice()
    const i = arr.findIndex(x => x.branch === bv)
    if (i >= 0) arr.splice(i, 1); else arr.push({ branch: bv, amount: 0 })
    if (arr.length === 1) arr[0].amount = num(e.grossAmount)
    saveAlloc(e, arr)
  }
  const setAllocAmt = (e: Entry, bv: string, val: string) => {
    const arr = getAllocArr(e).slice()
    const amt = Number(val) || 0
    const i = arr.findIndex(x => x.branch === bv)
    if (i >= 0) arr[i] = { branch: bv, amount: amt }; else arr.push({ branch: bv, amount: amt })
    saveAlloc(e, arr, true)
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

  // ── Reimbursement (Phase 2) ───────────────────────────────────
  const buildReimbursementPdf = async (refNumber: string, br: string, rows: Entry[]): Promise<string> => {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const branchLabel = BRANCHES.find(b => b.value === br)?.label || br
    const logo = await fetchDataUrl('/aura-logo.png')
    let tx = 14
    if (logo) { doc.addImage(logo, 'PNG', 14, 9, 18, 18); tx = 36 }
    doc.setFont('helvetica', 'bold').setFontSize(13).text('Request for Payment (RFP)', tx, 15)
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text(`Branch: ${branchLabel}`, tx, 20)
    doc.text(`Ref No: ${refNumber}`, tx, 24)
    doc.text(`Date: ${new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}`, tx, 28)
    const tG = rows.reduce((s, e) => s + num(e.grossAmount), 0)
    const tN = rows.reduce((s, e) => s + netOfVat(e), 0)
    const tV = rows.reduce((s, e) => s + vatAmount(e), 0)
    autoTable(doc, {
      startY: 33,
      head: [['Reference Number', 'Requestor', 'Department', 'PCF Status', 'Date', 'Description', 'Vatable', 'Gross Amount', 'Net of VAT', 'VAT Amount']],
      body: rows.map(e => [
        refOf(e), e.requestor || '', e.department || '', e.pcfStatus || '',
        e.date ? String(e.date).slice(0, 10) : '', e.description || '', e.vatable || '',
        peso(num(e.grossAmount)), peso(netOfVat(e)), peso(vatAmount(e)),
      ]),
      foot: [['', '', '', '', '', '', 'TOTAL', peso(tG), peso(tN), peso(tV)]],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [36, 73, 82], textColor: 255 },
      footStyles: { fillColor: [237, 243, 217], textColor: [30, 30, 30], fontStyle: 'bold' },
      columnStyles: { 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
      margin: { left: 10, right: 10 },
    })
    doc.save(`${refNumber}.pdf`)
    return doc.output('datauristring')
  }

  const generateReimbursement = async (manualSeq?: string) => {
    setGenerating(true)
    try {
      const ids = [...selected]
      const sel = entries.filter(e => selected.has(e.id))
      const res = await fetch('/api/petty-cash/reimbursements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, entryIds: ids, kind: rfpMode || 'VALID', manualSeq: manualSeq || null }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Failed to generate'); setGenerating(false); return }
      const { id, refNumber } = await res.json()
      const pdfData = await buildReimbursementPdf(refNumber, branch, sel)
      try {
        await fetch('/api/petty-cash/reimbursements', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, pdfData }),
        })
      } catch { /* pdf storage best-effort */ }
      setSelected(new Set())
      setShowReimbModal(false)
      setRfpMode(null)
      await loadEntries(branch)
      await loadReimbursements(branch)
      setTab('reimbursements')
    } catch { alert('Failed to generate reimbursement') }
    setGenerating(false)
  }

  const downloadReimbursementPdf = async (rep: Reimb) => {
    try {
      const r = await fetch(`/api/petty-cash/reimbursements?id=${rep.id}`)
      if (!r.ok) return
      const { pdfData } = await r.json()
      if (!pdfData) { alert('No PDF stored for this report.'); return }
      const a = document.createElement('a')
      a.href = pdfData; a.download = `${rep.refNumber}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
    } catch { /* ignore */ }
  }

  const recordPaid = async (rep: Reimb, debitAccount: string, depositAccount: string, file: File | null, datePaid: string, paymentMethod: string, checkNumber: string, transferRef: string) => {
    let proofUrl: string | null = rep.proofUrl ?? null
    if (file) {
      const fd = new FormData(); fd.append('file', file)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!up.ok) { alert((await up.json()).error || 'Proof upload failed'); throw new Error('upload') }
      proofUrl = (await up.json()).url
    }
    const res = await fetch('/api/petty-cash/reimbursements', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rep.id, action: 'pay', debitAccount, depositAccount, proofUrl, datePaid, paymentMethod, checkNumber, transferRef }),
    })
    if (!res.ok) { alert((await res.json()).error || 'Failed to record payment'); throw new Error('pay') }
    await loadReimbursements(branch)
  }

  const deleteReimbursement = async (rep: Reimb) => {
    if (!confirm(`Delete RFP ${rep.refNumber}? Its ${rep._count.entries} entr${rep._count.entries === 1 ? 'y' : 'ies'} will go back to Petty Cash Entries as "For Replenishment".`)) return
    try {
      await fetch(`/api/petty-cash/reimbursements?id=${rep.id}`, { method: 'DELETE' })
      await loadReimbursements(branch); await loadEntries(branch)
    } catch { /* ignore */ }
  }

  const finalizeEntry = (e: Entry) => {
    saveField(e.id, { finalized: true }, false)
    const name = (e.registeredName || '').trim()
    if (name && ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE'].includes(branch) && !supplierNames.has(name.toLowerCase())) {
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
      if (r.ok) setSupplierNames(prev => new Set(prev).add(newSupplierPrompt.registeredName.trim().toLowerCase()))
    } catch { /* ignore */ }
    setNewSupplierPrompt(null)
  }

  const cellCls = 'w-full bg-transparent px-2 py-1.5 text-xs outline-none focus:bg-[var(--pale-teal)] rounded'
  const tdCls = 'border-r border-b align-top'
  const locked = (e: Entry) => !!e.reimbursementId || !!e.finalized || !canWrite
  const vatEditable = (e: Entry) => e.vatable === 'VAT' || e.vatable === 'Non-VAT' || e.vatable === 'NV'

  // Per-column header sort/filter for the entries grid.
  const [gridSort, setGridSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: '', dir: 'asc' })
  const [gridFilters, setGridFilters] = useState<Record<string, string>>({})
  const gridToggleSort = (k: string) => setGridSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const gridCols: { key: string; label: string; plain?: boolean }[] = [
    { key: 'refNumber', label: 'Reference Number' }, { key: 'requestor', label: 'Requestor' }, { key: 'department', label: 'Department' },
    { key: 'pcfStatus', label: 'PCF Status' }, { key: 'date', label: 'Date' }, { key: 'description', label: 'Description' }, { key: 'descHub', label: 'Description for Hub' },
    { key: 'validity', label: 'Valid/Invalid' }, { key: 'vatable', label: 'Vatable' }, { key: 'siNumber', label: 'SI Number' },
    { key: 'tinNumber', label: 'TIN Number' }, { key: 'tinNumber2', label: 'TIN Number 2' }, { key: 'branchCode', label: 'Branch Code' },
    { key: 'registeredName', label: 'Registered name' }, { key: 'registeredAddress', label: 'Registered Address' },
    { key: 'grossAmount', label: 'Gross Amount' }, { key: 'netOfVat', label: 'Net of VAT' }, { key: 'vatAmount', label: 'VAT Amount' }, { key: 'accountTitle', label: 'Account Title' },
    ...(branch === 'CEO' ? [{ key: 'branchAlloc', label: 'Branch (allocations)', plain: true }] : []),
    { key: 'proof', label: 'Proof', plain: true }, { key: 'audited', label: 'Audited' },
  ]
  const gridGet = (e: Entry, k: string): string | number => {
    switch (k) {
      case 'refNumber': return refOf(e)
      case 'requestor': return e.requestor || ''
      case 'department': return e.department || ''
      case 'pcfStatus': return e.pcfStatus || ''
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
      case 'audited': return e.audited ? 'Yes' : 'No'
      default: return ''
    }
  }
  const displayed = applySortFilter(entries, gridGet, gridSort.key, gridSort.dir, gridFilters)
  const totalGross = displayed.reduce((s, e) => s + num(e.grossAmount), 0)

  // Entries are only selectable after an RFP button is clicked, and only those
  // matching the chosen kind's validity (and not already in an RFP).
  const rfpValidity = rfpMode === 'VALID' ? 'Valid' : rfpMode === 'INVALID' ? 'Invalid' : null
  const isSelectable = (e: Entry) => !e.reimbursementId && !!e.audited && rfpValidity != null && e.validity === rfpValidity
  const selectableIds = displayed.filter(isSelectable).map(e => e.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds))
  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const startRfp = (mode: 'VALID' | 'INVALID') => { setRfpMode(mode); setSelected(new Set()); if (tab !== 'entries') setTab('entries') }
  const cancelRfp = () => { setRfpMode(null); setSelected(new Set()) }
  // Distinct existing PCV bases (for "same PCV as a previous entry").
  const pcvBases = Array.from(new Map(entries.map(e => [e.pcvSeq, e.pcvNumber.replace(/-\d{2}$/, '')])).entries())
    .map(([seq, label]) => ({ seq, label }))
    .sort((a, b) => b.seq - a.seq)   // most recent PCV first
  const confirmAddRow = () => { setShowAddPopup(false); addRow(addSameSeq ? Number(addSameSeq) : null); setAddSameSeq('') }
  const supplierByName = new Map(suppliers.map(s => [s.registeredName.trim().toLowerCase(), s]))
  // Audit status updates even on locked rows (audit happens after RFP).
  const setAudited = async (id: string, audited: boolean) => {
    patchLocal(id, { audited })
    try { await fetch('/api/petty-cash/audited', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, audited }) }) } catch { /* ignore */ }
  }

  return (
    <div className={expanded ? 'fixed inset-0 z-50 overflow-auto p-6 space-y-4' : 'space-y-4'} style={expanded ? { background: 'var(--off-white)' } : undefined}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Petty Cash
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.map(b => (
              <button key={b.value} onClick={() => setBranch(b.value)}
                className="px-4 py-2 text-xs font-semibold transition-colors"
                style={branch === b.value
                  ? { background: 'var(--teal)', color: '#fff' }
                  : { background: '#fff', color: 'var(--mid-gray)' }}>
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
          <button onClick={downloadTemplate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <Download size={14} /> Template
          </button>
          {canWrite && (
            <button onClick={() => fileInputRef.current?.click()} disabled={importing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--teal)' }}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import CSV/Excel
            </button>
          )}
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = '' }} />
        </div>
      </div>

      {/* Tabs + RFP actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
          {([['entries', 'Entries'], ['reimbursements', `RFP (${reimbursements.length})`], ['flowchart', 'Flowchart']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)}
              className="px-4 py-2 text-xs font-semibold transition-colors"
              style={tab === k ? { background: 'var(--deep-teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
              {lbl}
            </button>
          ))}
        </div>
        {tab === 'entries' && canWrite && (
          <div className="flex items-center gap-2 flex-wrap">
            {rfpMode === null ? (
              <>
                <button onClick={() => startRfp('VALID')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
                  <FileText size={15} /> RFP (Valid)
                </button>
                <button onClick={() => startRfp('INVALID')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                  <FileText size={15} /> RFP (Invalid)
                </button>
              </>
            ) : (
              <>
                <span className="text-xs font-bold" style={{ color: '#dc2626' }}>
                  Select {rfpMode === 'VALID' ? 'Valid' : 'Invalid'} Entries
                </span>
                <button onClick={() => setShowReimbModal(true)} disabled={selected.size === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--teal)' }}>
                  <FileText size={15} /> Generate RFP ({rfpMode === 'VALID' ? 'Valid' : 'Invalid'}){selected.size > 0 ? ` · ${selected.size}` : ''}
                </button>
                <button onClick={cancelRfp}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {tab === 'entries' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              ['Unliquidated Total', entries.filter(e => e.pcfStatus === 'Unliquidated').reduce((s, e) => s + num(e.grossAmount), 0)],
              ['For Replenishment Total', entries.filter(e => e.pcfStatus === 'For Replenishment').reduce((s, e) => s + num(e.grossAmount), 0)],
              ['Liquidated Total', entries.filter(e => e.pcfStatus === 'Replenished').reduce((s, e) => s + num(e.grossAmount), 0)],
            ] as const).map(([lbl, v]) => (
              <div key={lbl} className="rounded-2xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <p className="text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>{lbl}</p>
                <p className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(v as number)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            {entries.length} entries · {selected.size} selected · Total Gross <strong style={{ color: 'var(--charcoal)' }}>₱{peso(totalGross)}</strong>
            {' · '}Next PCV #{nextPcvSeq}
          </p>

          <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)', maxHeight: expanded ? 'calc(100vh - 210px)' : '70vh' }}>
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
            ) : (
              <table className="text-xs" style={{ borderCollapse: 'collapse', minWidth: 2560 }}>
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
                      <tr key={e.id} style={{ background: e.pcfStatus === 'Replenished' ? '#dcfce7' : e.reimbursementId ? '#ffedd5' : e.finalized ? '#fef9c3' : '#fff' }}>
                        <td className="border-r border-b text-center" style={{ borderColor: 'var(--light-gray)' }}>
                          <input type="checkbox" checked={selected.has(e.id)} disabled={!canWrite || !isSelectable(e)}
                            onChange={() => toggleOne(e.id)}
                            title={e.reimbursementId ? 'Locked (in an RFP)' : rfpMode === null ? 'Click RFP (Valid) or RFP (Invalid) first' : e.validity !== rfpValidity ? `Only ${rfpMode === 'VALID' ? 'valid' : 'invalid'} entries can be selected` : !e.audited ? 'Entry must be Audited = Yes first' : ''} />
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <span className="px-2 py-1.5 block whitespace-nowrap font-mono" style={{ color: 'var(--charcoal)' }}>{refOf(e)}</span>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <select className={cellCls} value={e.requestor || ''} disabled={lk}
                            onChange={ev => saveField(e.id, { requestor: ev.target.value }, false)} style={{ minWidth: 160 }}>
                            <option value=""></option>
                            {requestors.map(r => <option key={r} value={r}>{r}</option>)}
                            {e.requestor && !requestors.includes(e.requestor) && <option value={e.requestor}>{e.requestor}</option>}
                          </select>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <select className={cellCls} value={e.department || ''} disabled={lk}
                            onChange={ev => saveField(e.id, { department: ev.target.value }, false)}>
                            <option value=""></option>
                            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </td>
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          {e.pcfStatus === 'Replenished' ? (
                            <span className="px-2 py-1.5 block whitespace-nowrap font-semibold" style={{ color: '#166534', minWidth: 140 }}>Replenished</span>
                          ) : (
                            <select className={cellCls} value={e.pcfStatus || ''} disabled={lk}
                              onChange={ev => saveField(e.id, { pcfStatus: ev.target.value }, false)} style={{ minWidth: 140 }}>
                              <option value=""></option>
                              {PCF_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          )}
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
                          <input className={cellCls} disabled={lk || !ve} value={e.tinNumber || ''} placeholder="XXX-XXX-XXX-XXXXX"
                            style={{ minWidth: 150 }}
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
                          <input list="pc-supplier-names" className={cellCls} disabled={lk} value={e.registeredName || ''} style={{ minWidth: 180 }}
                            onChange={ev => patchLocal(e.id, { registeredName: ev.target.value })}
                            onBlur={ev => {
                              const val = ev.target.value
                              const sup = supplierByName.get(val.trim().toLowerCase())
                              const patch: Partial<Entry> = { registeredName: val }
                              if (sup) {
                                if (sup.registeredAddress) patch.registeredAddress = sup.registeredAddress
                                if (!e.tinNumber && sup.tin) patch.tinNumber = formatTin(sup.tin)
                              }
                              saveField(e.id, patch, false)
                            }} />
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
                        {branch === 'CEO' && (
                          <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                            <div className="px-1 py-1" style={{ minWidth: 210 }}>
                              {ALLOC_BRANCHES.map(b => {
                                const checked = allocOf(e, b.value) !== undefined
                                return (
                                  <div key={b.value} className="flex items-center gap-1 mb-0.5">
                                    <label className="flex items-center gap-1 text-[11px]" style={{ minWidth: 56 }}>
                                      <input type="checkbox" checked={checked} disabled={lk} onChange={() => toggleAlloc(e, b.value)} /> {b.label}
                                    </label>
                                    <input type="number" step="0.01" disabled={lk || !checked} placeholder="0"
                                      value={checked ? String(allocOf(e, b.value) ?? '') : ''}
                                      onChange={ev => setAllocAmt(e, b.value, ev.target.value)}
                                      className="w-20 px-1 py-0.5 text-[11px] border rounded text-right" style={{ borderColor: 'var(--light-gray)' }} />
                                  </div>
                                )
                              })}
                              <div className="text-[10px] mt-0.5" style={{ color: Math.abs(allocSum(e) - num(e.grossAmount)) < 0.01 ? 'var(--mid-gray)' : '#dc2626' }}>
                                &Sigma; {peso(allocSum(e))} / {peso(num(e.grossAmount))}
                              </div>
                            </div>
                          </td>
                        )}
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
                        <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                          <select className={cellCls} value={e.audited ? 'Yes' : 'No'} disabled={!canAudit}
                            title={!canAudit ? 'Only an Accountant or Admin can change the audit status' : ''}
                            onChange={ev => setAudited(e.id, ev.target.value === 'Yes')} style={{ minWidth: 70 }}>
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </select>
                        </td>
                        <td className="border-b px-1 text-center" style={{ borderColor: 'var(--light-gray)' }}>
                          {canWrite && !e.reimbursementId && (
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
                    <tr><td colSpan={branch === 'CEO' ? 24 : 23} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>
                      {entries.length === 0 ? 'No entries yet. Click "Add Row" to start.' : 'No entries match the current filters.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {canWrite && (
            <button onClick={() => setShowAddPopup(true)} disabled={adding}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--teal)' }}>
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Row
            </button>
          )}
        </>
      )}

      {tab === 'reimbursements' && (
        <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <SortFilterHead cols={rfpCols} sortKey={rfpSort.key} sortDir={rfpSort.dir} filters={rfpFilters}
              onToggleSort={rfpToggleSort} onFilter={(k, v) => setRfpFilters(f => ({ ...f, [k]: v }))} trailing />
            <tbody>
              {shownReimb.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{r.refNumber}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{new Date(r.createdAt).toLocaleDateString('en-PH')}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{r._count.entries}</td>
                  <td className="px-4 py-2.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>₱{peso(num(r.grossTotal))}</td>
                  <td className="px-4 py-2.5 text-right font-semibold" style={{ color: 'var(--deep-teal)' }}>₱{peso(num(r.payableTotal))}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={r.status === 'PAID' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                      {r.status === 'PAID' ? 'Paid' : 'Pending'}
                    </span>
                    {r.status === 'PAID' && r.paidAt && (
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                        {new Date(r.paidAt).toLocaleDateString('en-PH')}{r.paymentMethod ? ` · ${r.paymentMethod}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => downloadReimbursementPdf(r)} title="Download PDF"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                      <FileDown size={13} /> PDF
                    </button>
                    {r.proofUrl && (
                      <>
                        <a href={r.proofUrl} target="_blank" rel="noopener noreferrer" title="View proof of deposit"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1"
                          style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                          <Eye size={13} /> View
                        </a>
                        <a href={r.proofUrl} download title="Download proof of deposit"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1"
                          style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                          <Download size={13} /> Proof
                        </a>
                      </>
                    )}
                    {canWrite && r.status !== 'PAID' && (
                      <button onClick={() => setPayTarget(r)} title="Record as Paid"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white mr-1"
                        style={{ background: 'var(--teal)' }}>
                        <CheckCircle2 size={13} /> Record as Paid
                      </button>
                    )}
                    {canWrite && r.status === 'PAID' && (
                      <button onClick={() => setPayTarget(r)} title="Edit payment details"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1"
                        style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                        <Pencil size={13} /> Edit
                      </button>
                    )}
                    {canWrite && (
                      <button onClick={() => deleteReimbursement(r)} title="Delete (unlocks entries)"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border"
                        style={{ borderColor: '#fecaca', color: '#dc2626' }}>
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {shownReimb.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>
                  {reimbursements.length === 0 ? 'No RFPs yet. Click "RFP (Valid)" or "RFP (Invalid)", then select entries.' : 'No RFPs match the current filters.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'flowchart' && (
        <div className="rounded-2xl border bg-white p-6" style={{ borderColor: 'var(--light-gray)' }}>
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Petty Cash Workflow</h2>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>From entry to reimbursement to the Expense Report.</p>
          <p className="text-xs mb-6 font-semibold" style={{ color: 'var(--teal)' }}>For expenses less than or equal to ₱2,000.</p>
          <div className="flex flex-col items-center">
            {([
              { n: 1, title: 'Petty cash entry', who: 'Bookkeeper', desc: 'Encode entries in the Entries tab.' },
              { n: 2, title: 'Audited', who: 'Accountant', desc: 'Accountant reviews and sets Audited = Yes.' },
              { n: 3, title: 'Filed for RFP', who: 'Accountant', desc: 'Group audited entries via RFP (Valid) or RFP (Invalid).' },
              { n: 4, title: 'Print & submit for approval', who: '', desc: 'Print the petty cash / RFP report and submit it for approval.' },
              { n: 5, title: 'Mark as Paid', who: '', desc: 'Once reimbursed & replenished, open the RFP and click “Record as Paid”.' },
              { n: 6, title: 'Expense Report', who: '', desc: 'The paid entries appear in the Expense Report (Expenses section).' },
            ] as const).map((s, i, arr) => (
              <div key={s.n} className="w-full max-w-xl flex flex-col items-center">
                <div className="w-full rounded-2xl border p-4 flex items-start gap-3"
                  style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'var(--teal)' }}>{s.n}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>
                      {s.title}{s.who && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold align-middle" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{s.who}</span>}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{s.desc}</p>
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <div className="text-xl leading-none my-1" style={{ color: 'var(--teal)' }}>↓</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Registered-name suggestions from Suppliers */}
      <datalist id="pc-supplier-names">
        {suppliers.map(s => <option key={s.registeredName} value={s.registeredName} />)}
      </datalist>

      {showAddPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAddPopup(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Add Entry</h2>
              <button onClick={() => setShowAddPopup(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <p className="text-sm mb-2" style={{ color: 'var(--mid-gray)' }}>Is it in the same PCV as a previous entry?</p>
            <select value={addSameSeq} onChange={e => setAddSameSeq(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm mb-2 font-mono" style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">No — new PCV ({BRANCHES.find(b => b.value === branch)?.code || branch}-PCV{new Date().getFullYear() % 100}-{String(nextPcvSeq).padStart(6, '0')}-01)</option>
              {pcvBases.map(b => <option key={b.seq} value={b.seq}>Yes — same as {b.label}</option>)}
            </select>
            <p className="text-[11px] mb-4" style={{ color: 'var(--mid-gray)' }}>Choosing an existing PCV adds the next sub-number (-02, -03, …).</p>
            <button onClick={confirmAddRow} disabled={adding}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>
              {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add Row
            </button>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsModal branch={branch} requestors={requestors} nextPcvSeq={nextPcvSeq} canWrite={canWrite}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => { setRequestors(s.requestors); setNextPcvSeq(s.nextPcvSeq) }} />
      )}

      {showReimbModal && (
        <ReimbModal entries={entries.filter(e => selected.has(e.id))} generating={generating}
          onClose={() => setShowReimbModal(false)} onGenerate={generateReimbursement} />
      )}

      {payTarget && (
        <RecordPaidModal report={payTarget} bankOptions={bankOptions}
          onClose={() => setPayTarget(null)} onPay={recordPaid} />
      )}

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

// ── Reimbursement modal ────────────────────────────────────────
function ReimbModal({ entries, generating, onClose, onGenerate }: {
  entries: Entry[]; generating: boolean; onClose: () => void; onGenerate: (manualSeq?: string) => void
}) {
  const [manualSeq, setManualSeq] = useState('')
  const tG = entries.reduce((s, e) => s + num(e.grossAmount), 0)
  const tN = entries.reduce((s, e) => s + netOfVat(e), 0)
  const tV = entries.reduce((s, e) => s + vatAmount(e), 0)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Request for Payment (RFP)</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>
          {entries.length} selected entr{entries.length === 1 ? 'y' : 'ies'} will be included and locked.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[['Gross Amount', tG], ['Net of VAT', tN], ['VAT Amount', tV]].map(([lbl, v]) => (
            <div key={lbl as string} className="rounded-xl p-3 text-center" style={{ background: 'var(--off-white)' }}>
              <p className="text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>{lbl as string}</p>
              <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>₱{peso(v as number)}</p>
            </div>
          ))}
        </div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>RFP Number (optional)</label>
        <input type="text" inputMode="numeric" value={manualSeq} onChange={e => setManualSeq(e.target.value.replace(/\D/g, ''))}
          placeholder="e.g. 000007 — leave blank to auto-number" className="w-full px-3 py-2 rounded-xl border text-sm mb-5 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
        <button onClick={() => onGenerate(manualSeq)} disabled={generating || entries.length === 0}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'var(--teal)' }}>
          {generating ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
          {generating ? 'Generating…' : 'Generate PDF'}
        </button>
      </div>
    </div>
  )
}

function RecordPaidModal({ report, bankOptions, onClose, onPay }: {
  report: Reimb; bankOptions: string[]
  onClose: () => void; onPay: (rep: Reimb, debit: string, deposit: string, file: File | null, datePaid: string, paymentMethod: string, checkNumber: string, transferRef: string) => Promise<void>
}) {
  const isEdit = report.status === 'PAID'
  const [debit, setDebit] = useState(report.debitAccount || '')
  const [deposit, setDeposit] = useState(report.depositAccount || '')
  const [datePaid, setDatePaid] = useState(report.paidAt ? String(report.paidAt).slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState(report.paymentMethod || '')
  const [checkNumber, setCheckNumber] = useState(report.checkNumber || '')
  const [transferRef, setTransferRef] = useState(report.transferRef || '')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const isCheck = paymentMethod === 'Check deposit' || paymentMethod === 'Check encashment to deposit as cash'
  const isTransfer = paymentMethod === 'Online Fund Transfer'
  const submit = async () => {
    if (!datePaid) { alert('Enter the Date Paid.'); return }
    if (!paymentMethod) { alert('Select a Payment Method.'); return }
    if (isCheck && !checkNumber.trim()) { alert('Enter the Check Number.'); return }
    if (isTransfer && !transferRef.trim()) { alert('Enter the transfer Reference Number.'); return }
    if (!debit || !deposit) { alert('Select both the debit (from) and deposit (to) accounts.'); return }
    setSaving(true)
    try { await onPay(report, debit, deposit, file, datePaid, paymentMethod, isCheck ? checkNumber.trim() : '', isTransfer ? transferRef.trim() : ''); onClose() } catch { /* handled in onPay */ }
    setSaving(false)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{isEdit ? 'Edit Payment Details' : 'Record as Paid'} — {report.refNumber}</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date Paid</label>
        <input type="date" value={datePaid} onChange={e => setDatePaid(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment Method</label>
        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select method…</option>
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {isCheck && (
          <>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Check Number</label>
            <input type="text" inputMode="numeric" value={checkNumber} onChange={e => setCheckNumber(e.target.value)}
              placeholder="e.g. 0001234" className="w-full px-3 py-2 rounded-xl border text-sm mb-1 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
            <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Leading zeros are preserved. The check&apos;s bank is the &quot;Debited from&quot; account below.</p>
          </>
        )}

        {isTransfer && (
          <>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Reference Number</label>
            <input type="text" value={transferRef} onChange={e => setTransferRef(e.target.value)}
              placeholder="Transfer reference no." className="w-full px-3 py-2 rounded-xl border text-sm mb-3 font-mono" style={{ borderColor: 'var(--light-gray)' }} />
          </>
        )}

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Debited from (bank account)</label>
        <select value={debit} onChange={e => setDebit(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select account…</option>
          {bankOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Deposited to (bank account)</label>
        <select value={deposit} onChange={e => setDeposit(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select account…</option>
          {bankOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Proof of deposit (image / PDF)</label>
        <label className="flex items-center gap-2 cursor-pointer mb-1">
          <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
            <Upload size={13} /> Choose File
          </span>
          <span className="text-xs truncate" style={{ color: 'var(--mid-gray)', maxWidth: 220 }}>{file ? file.name : (report.proofUrl ? 'Current proof kept' : 'No file chosen')}</span>
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>
        <p className="text-[11px] mb-4" style={{ color: 'var(--mid-gray)' }}>{report.proofUrl ? 'A proof is already attached — choose a new file to replace it. ' : 'Optional, but recommended. '}Max 10MB.</p>

        <button onClick={submit} disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'var(--teal)' }}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Record as Paid')}
        </button>
      </div>
    </div>
  )
}

function SettingsModal({ branch, requestors, nextPcvSeq, canWrite, onClose, onSaved }: {
  branch: string; requestors: string[]; nextPcvSeq: number; canWrite: boolean
  onClose: () => void; onSaved: (s: { requestors: string[]; nextPcvSeq: number }) => void
}) {
  const [startNum, setStartNum] = useState(String(nextPcvSeq))
  const [names, setNames] = useState<string[]>(requestors)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const branchLabel = BRANCHES.find(b => b.value === branch)?.label || branch

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/petty-cash/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, nextPcvSeq: parseInt(startNum, 10) || 1, requestors: names }),
      })
      if (r.ok) { const s = await r.json(); onSaved({ requestors: s.requestors, nextPcvSeq: s.nextPcvSeq }); onClose() }
      else alert((await r.json()).error || 'Failed to save')
    } catch { alert('Failed to save') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Petty Cash Settings — {branchLabel}</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Next PCV start number</label>
        <input type="number" min="1" value={startNum} onChange={e => setStartNum(e.target.value)} disabled={!canWrite}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-1" style={{ borderColor: 'var(--light-gray)' }} />
        <p className="text-[11px] mb-4" style={{ color: 'var(--mid-gray)' }}>
          The next row added will be {BRANCHES.find(b => b.value === branch)?.code || branch}-PCV{new Date().getFullYear() % 100}-{String(parseInt(startNum, 10) || 1).padStart(6, '0')}.
        </p>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Requestors ({names.length})</label>
        <div className="space-y-1 mb-2 max-h-52 overflow-auto">
          {names.map((n, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg px-3 py-1.5" style={{ background: 'var(--off-white)' }}>
              <span className="text-xs" style={{ color: 'var(--charcoal)' }}>{n}</span>
              {canWrite && <button onClick={() => setNames(names.filter((_, j) => j !== i))}><X size={13} style={{ color: '#dc2626' }} /></button>}
            </div>
          ))}
        </div>
        {canWrite && (
          <div className="flex gap-2 mb-4">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add requestor name"
              onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { setNames([...names, newName.trim()]); setNewName('') } }}
              className="flex-1 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
            <button onClick={() => { if (newName.trim()) { setNames([...names, newName.trim()]); setNewName('') } }}
              className="px-3 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>Add</button>
          </div>
        )}

        {canWrite && (
          <button onClick={save} disabled={saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        )}
      </div>
    </div>
  )
}
