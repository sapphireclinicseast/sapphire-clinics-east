'use client'

import { branchFileTag, branchShort } from '@/lib/branch'
import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { toChequeInput } from '@/lib/cheque-number'
import { AccountPicker, type PickableAccount } from '@/components/AccountPicker'
import { useFocusTarget } from '@/lib/use-focus-target'
import { useSession } from 'next-auth/react'
import { userBranchScope, canViewPettyCashCeoVerdana, PETTY_CASH_VIEW_ONLY_BRANCHES } from '@/lib/branch-scope'
import { Plus, Settings, Loader2, Trash2, X, Maximize2, Minimize2, Download, Upload, FileDown, FileText, CheckCircle2, Paperclip, Eye, Pencil, RotateCcw, Search, Columns3, Banknote, ClipboardCheck } from 'lucide-react'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'
import { useResizableColumns, ResizableColgroup, ColResizeHandle } from '@/components/useResizableColumns'
import { assetClassFromAccountTitle, ASSET_CLASSIFICATION_LABELS, isDepreciatingClassification, inventoryClassFromAccountTitle, INVENTORY_CLASSIFICATION_LABELS } from '@/lib/asset-classification'
import { ScanUpload } from '@/components/ScanUpload'
import { DownloadBar } from '@/components/DownloadBar'
import { downloadXlsx, downloadPdf, inDateRange, type ExportFormat } from '@/lib/export'
import { BillingVoucherModal } from '@/components/BillingVoucherModal'
import type { RfpMemoParts } from '@/lib/billing-voucher'
import type { BVLine } from '@/lib/billing-voucher'
import { isMixedVat, netOfVat as entryNet, vatBase, vatOf as entryVat } from '@/lib/vat'
import { ExistingAssetPicker } from '@/components/ExistingAssetPicker'
import { NameCombobox } from '@/components/NameCombobox'
import { snapSupplierName, supplierNameIndex } from '@/lib/supplier-snap'
import { balanceShares, typeShare } from '@/lib/petty-cash-shares'
import { HR_VARS, HR_PAGE_CLASS, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'

// ── Constants ──────────────────────────────────────────────────
const BRANCHES = [
  { code: 'AHEA', value: 'SANDBOX_EAST', label: 'AHEA' },
  { code: 'AHGH', value: 'SANDBOX_GREENHILLS', label: 'AHGH' },
  { code: 'VER', value: 'VERDANA_STORE', label: 'VERDANA' },
  { code: 'AHI', value: 'AURA_INSTITUTE', label: 'AHI' },
  { code: 'CEO', value: 'CEO', label: 'CEO' },
]
const ALLOC_BRANCHES = BRANCHES.filter(b => b.value !== 'CEO')
const DEPARTMENTS = ['ADMIN', 'PT', 'OT', 'SLP', 'SPED', 'PSYCH', 'MD', 'ORTHOSIS']

// ── Contribution-margin department tags ──────────────────────────────────
// Which department(s) an expense belongs to, for the Contribution Margin
// analysis. "All" (nothing ticked) = allocated by the configured rent
// percentages; tick one or more to charge those departments directly.
const CM_DEPTS = ['PT', 'OT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'TRAINING', 'RETAIL', 'ADMIN'] as const
function DeptTagCell({ value, disabled, onSave }: { value: string[]; disabled?: boolean; onSave: (next: string[]) => void }) {
  const [open, setOpen] = useState(false)
  // Portal positioning: the grid scrolls in an overflow container that clipped
  // this dropdown (the tail of the list was unreachable), so the panel renders
  // to <body> at a fixed position instead, clamped to stay on screen.
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({
        top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 308)),
        left: Math.max(8, Math.min(r.left, window.innerWidth - 196)),
      })
    }
    setOpen(o => !o)
  }
  const label = value.length ? value.map(d => d === 'PSYCHOLOGY' ? 'PSYCH' : d === 'ORTHOSIS' ? 'ORTHO' : d).join(', ') : 'All'
  return (
    <div className="relative">
      <button ref={btnRef} type="button" disabled={disabled} onClick={toggleOpen} title={label}
        className="px-2 py-1.5 w-full text-left text-sm whitespace-nowrap rounded"
        style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', color: value.length ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
        {label} ▾
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[59]" onClick={() => setOpen(false)} />
          <div className="fixed z-[60] p-2 rounded-xl bg-white shadow-lg overflow-y-auto"
            style={{ top: pos.top, left: pos.left, maxHeight: 300, border: '1px solid var(--light-gray)', minWidth: 180 }}>
          <label className="flex items-center gap-2 px-1 py-1 text-xs font-semibold cursor-pointer" style={{ color: 'var(--charcoal)' }}>
            <input type="checkbox" checked={value.length === 0} onChange={() => { onSave([]); }} className="accent-current" />
            All (use rent %)
          </label>
          <div className="my-1" style={{ borderTop: '1px solid var(--light-gray)' }} />
          {CM_DEPTS.map(d => (
            <label key={d} className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer" style={{ color: 'var(--charcoal)' }}>
              <input type="checkbox" checked={value.includes(d)}
                onChange={() => onSave(value.includes(d) ? value.filter(x => x !== d) : [...value, d])}
                className="accent-current" />
              {d === 'PSYCHOLOGY' ? 'Psychology' : d === 'ORTHOSIS' ? 'Orthosis' : d === 'ADMIN' ? 'Admin' : d}
            </label>
          ))}
          <button type="button" onClick={() => setOpen(false)}
            className="mt-1 w-full py-1 rounded-lg text-xs font-medium" style={{ background: 'var(--light-gray)' }}>Done</button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

const PCF_STATUS = ['Unliquidated', 'For Replenishment', 'Cancelled', 'Missing']
const VATABLE = ['VAT', 'Non-VAT']
const VALIDITY = ['Valid', 'Invalid', 'Cancelled']
const PAYMENT_METHODS = ['Check deposit', 'Check encashment to deposit as cash', 'Online Fund Transfer']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

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
  vatPortion: string | number | null
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
  rfpBranchMap: Record<string, string> | null   // CEO only: branch → RFP report id
  assetAddedAt: string | null                    // persistent "added to Asset Management" timestamp
  inventoryRecordedAt: string | null             // persistent "recorded in Inventory & Procurement" timestamp
  reimbursementId: string | null
  paidAt: string | null
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
  payableTo: string | null
  createdAt: string
  filterBranch?: string | null   // CEO branch RFP: which branch's allocations
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
const netOfVat = (e: Entry) => entryNet(e)
const vatAmount = (e: Entry) => entryVat(e)
// A part-VAT entry is stored as vatable 'VAT' + vatPortion (lib/vat).
const PART_VAT = 'VAT + Non-VAT'
const vatLabel = (e: Entry) => (isMixedVat(e) ? PART_VAT : e.vatable || '')
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

// Look: the HR Hub house style (components/ui/hr-look).
const BRANCH_NAMES: Record<string, string> = {
  SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana', AURA_INSTITUTE: 'Aura Health Institute', CEO: 'CEO',
}
// Row colour by workflow state: same rule and order as before, softer shades,
// plus a coloured edge on the first cell.
const ROW_TONES = {
  replenished: { bg: '#f2faf5', line: '#059669', label: 'Replenished' },
  forRepl:     { bg: '#fffbeb', line: '#d97706', label: 'For replenishment' },   // or in an RFP
  cancelled:   { bg: '#f5f6f3', line: '#94a3b8', label: 'Cancelled' },
  missing:     { bg: '#fef2f2', line: '#dc2626', label: 'Missing' },
  finalized:   { bg: '#f8fbf1', line: '#4A8073', label: 'Finalized' },
  draft:       { bg: '#ffffff', line: '#DDE6CC', label: 'Draft' },
} as const
const rowTone = (e: Entry) =>
  e.pcfStatus === 'Replenished' ? ROW_TONES.replenished
  : (e.pcfStatus === 'For Replenishment' || e.reimbursementId || (e.rfpBranchMap && Object.keys(e.rfpBranchMap).length > 0)) ? ROW_TONES.forRepl
  : e.pcfStatus === 'Cancelled' ? ROW_TONES.cancelled
  : e.pcfStatus === 'Missing' ? ROW_TONES.missing
  : e.finalized ? ROW_TONES.finalized
  : ROW_TONES.draft
const STATUS_PILL: Record<string, { bg: string; fg: string }> = {
  'Unliquidated':      { bg: '#eff6ff', fg: '#1d4ed8' },
  'For Replenishment': { bg: '#fef3c7', fg: '#92400e' },
  'Replenished':       { bg: '#dcfce7', fg: '#166534' },
  'Cancelled':         { bg: '#f1f5f9', fg: '#475569' },
  'Missing':           { bg: '#fee2e2', fg: '#991b1b' },
}
const pillOf = (status: string | null) => STATUS_PILL[status || ''] || { bg: '#f1f5f2', fg: '#55616A' }

// Entries grid columns, in the order of the PCF form / import template.
type GridCol = { key: string; label: string; plain?: boolean }
const gridColumnsFor = (branch: string): GridCol[] => [
  { key: 'refNumber', label: 'Reference Number' }, { key: 'requestor', label: 'Requestor' }, { key: 'department', label: 'Department' },
  { key: 'pcfStatus', label: 'PCF Status' }, { key: 'date', label: 'Date' }, { key: 'description', label: 'Description' }, { key: 'descHub', label: 'Description for Hub' },
  { key: 'validity', label: 'Valid/Invalid' }, { key: 'vatable', label: 'Vatable' }, { key: 'siNumber', label: 'SI Number' },
  { key: 'tinNumber', label: 'TIN Number' }, { key: 'tinNumber2', label: 'TIN Number 2' }, { key: 'branchCode', label: 'Branch Code' },
  { key: 'registeredName', label: 'Registered name' }, { key: 'registeredAddress', label: 'Registered Address' },
  { key: 'grossAmount', label: 'Gross Amount' }, { key: 'netOfVat', label: 'Net of VAT' }, { key: 'vatAmount', label: 'VAT Amount' }, { key: 'accountTitle', label: 'Account Title' },
  ...(branch === 'CEO' ? [{ key: 'branchAlloc', label: 'Branch (allocations)', plain: true }] : []),
  { key: 'proof', label: 'Proof', plain: true }, { key: 'audited', label: 'Audited' },
]
// Starting widths, wide enough for each column's content (names, dates and
// reference numbers were cut off at the old measured-from-the-header widths).
const COL_W: Record<string, number> = {
  refNumber: 236, requestor: 172, department: 108, pcfStatus: 164, date: 136, description: 260, descHub: 280,
  validity: 108, vatable: 140, siNumber: 132, tinNumber: 164, tinNumber2: 116, branchCode: 96,
  registeredName: 224, registeredAddress: 240, grossAmount: 128, netOfVat: 116, vatAmount: 108,
  accountTitle: 256, branchAlloc: 228, proof: 184, audited: 100,
}
const SELECT_W = 44
const ACTIONS_W = 120
// Columns the reference, supplier and amount work does not need day to day.
// They are computed from other cells; the Columns menu brings them back.
const DEFAULT_HIDDEN = ['descHub', 'tinNumber2', 'branchCode']
const UNHIDEABLE = ['refNumber', 'branchAlloc']

export default function PettyCashPage() {
  return <Suspense fallback={null}><PettyCashInner /></Suspense>
}

function PettyCashInner() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role || ''
  // Users assigned to a single branch only see that branch here.
  const scope = userBranchScope((session?.user as { branch?: string })?.branch)
  // Branch-locked accountants & bookkeepers additionally get read-only visibility
  // into the CEO and Verdana petty-cash sections.
  const canCrossView = !!scope.enum && canViewPettyCashCeoVerdana(role)

  const [branch, setBranch] = useState(scope.enum || 'SANDBOX_EAST')
  // Read-only when a branch-locked user is viewing a section outside their own
  // branch (i.e. an East/GH accountant looking at the CEO or Verdana sections).
  const viewOnly = !!scope.enum && branch !== scope.enum
  const canWrite = WRITE_ROLES.includes(role) && !viewOnly
  // Only Accountant + main Admin may set the Audited flag (and not on view-only branches).
  const canAudit = (role === 'ADMIN' || role === 'ACCOUNTANT') && !viewOnly
  // Session loads async — once we know the user is branch-locked, force their branch.
  useEffect(() => { if (scope.enum && branch !== scope.enum) setBranch(scope.enum) }, [scope.enum]) // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<'entries' | 'reimbursements' | 'cashcount' | 'flowchart'>('entries')
  const [entries, setEntries] = useState<Entry[]>([])
  // ── Cash Count reconciliation (per branch)
  const [fundAmount, setFundAmount] = useState('')
  const [cashBreakdown, setCashBreakdown] = useState<Record<string, string>>({})
  const [dueToFrom, setDueToFrom] = useState<{ label: string; direction: 'TO' | 'FROM'; amount: string }[]>([])
  const [ccSaving, setCcSaving] = useState(false)
  const [reimbursements, setReimbursements] = useState<Reimb[]>([])
  const [dlFrom, setDlFrom] = useState(''); const [dlTo, setDlTo] = useState('')  // download date range
  // RFP list sort/filter
  const [rfpSort, setRfpSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [rfpFilters, setRfpFilters] = useState<Record<string, string>>({})
  const rfpToggleSort = (k: string) => setRfpSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const rfpCols = [
    { key: 'refNumber', label: 'Reference Number' },
    { key: 'date', label: 'Date' },
    { key: 'payableTo', label: 'Payable to' },
    { key: 'entries', label: 'Entries' },
    { key: 'grossTotal', label: 'Gross Total' },
    { key: 'payableTotal', label: 'Amount Payable' },
    { key: 'status', label: 'Status' },
  ]
  const rfpGet = (r: Reimb, k: string): string | number =>
    k === 'refNumber' ? r.refNumber
      : k === 'date' ? new Date(r.createdAt).toISOString().slice(0, 10)
      : k === 'payableTo' ? (r.payableTo || '')
      : k === 'entries' ? r._count.entries
      : k === 'grossTotal' ? num(r.grossTotal)
      : k === 'payableTotal' ? num(r.payableTotal)
      : k === 'status' ? (r.status === 'PAID' ? 'Paid' : 'Pending')
      : ''
  const shownReimb = applySortFilter(reimbursements, rfpGet, rfpSort.key, rfpSort.dir, rfpFilters)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [coaOptions, setCoaOptions] = useState<string[]>([])
  const [coaAccounts, setCoaAccounts] = useState<PickableAccount[]>([])
  const [requestors, setRequestors] = useState<string[]>([])
  const [nextPcvSeq, setNextPcvSeq] = useState<number>(1)
  const [showSettings, setShowSettings] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rfpMode, setRfpMode] = useState<'VALID' | 'INVALID' | null>(null)
  // CEO RFP only: which branch's allocations this RFP covers.
  const [rfpBranch, setRfpBranch] = useState<string>('')
  const [showAddPopup, setShowAddPopup] = useState(false)
  const [addSameSeq, setAddSameSeq] = useState('')
  const [showReimbModal, setShowReimbModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [bankOptions, setBankOptions] = useState<string[]>([])
  const [payTarget, setPayTarget] = useState<Reimb | null>(null)
  const [bvTarget, setBvTarget] = useState<{ refNumber: string; date: string; lines: BVLine[]; branch?: string; defaultBilledTo?: string ; payment?: RfpMemoParts } | null>(null)
  const [supplierNames, setSupplierNames] = useState<Set<string>>(new Set())
  const [suppliers, setSuppliers] = useState<{ registeredName: string; registeredAddress: string; tin: string }[]>([])
  const [newSupplierPrompt, setNewSupplierPrompt] = useState<{ registeredName: string; registeredAddress: string; tin: string } | null>(null)
  // One supplier list across every branch (and the CEO fund) for the Registered
  // Name picker: picking a supplier fills its TIN and address.
  const [pickSuppliers, setPickSuppliers] = useState<{ registeredName: string; registeredAddress: string; tin: string }[]>([])
  const loadPickSuppliers = useCallback(() => {
    fetch('/api/expenses/suppliers?branch=ALL').then(r => (r.ok ? r.json() : { suppliers: [] }))
      .then((d: { suppliers?: { registeredName: string; registeredAddress?: string; tin?: string }[] }) =>
        setPickSuppliers((d.suppliers || []).map(s => ({ registeredName: s.registeredName, registeredAddress: s.registeredAddress || '', tin: s.tin || '' }))))
      .catch(() => setPickSuppliers([]))
  }, [])
  useEffect(() => { loadPickSuppliers() }, [loadPickSuppliers])
  const pickByName = new Map(pickSuppliers.map(s => [s.registeredName.trim().toLowerCase(), s]))
  const pickNames = pickSuppliers.map(s => s.registeredName)
  const pickHints = Object.fromEntries(pickSuppliers.filter(s => s.tin).map(s => [s.registeredName, s.tin]))
  // Saving a Registered Name: a known supplier brings its address and TIN along.
  // A near-miss of a known supplier ("SHOPPEE") is saved as that supplier and
  // brings its address and TIN too — same rule the server applies (lib/supplier-snap).
  const supplierPatch = (typed: string): Record<string, string> => {
    const name = snapSupplierName(typed, supplierNameIndex(pickNames)).name
    const sup = pickByName.get(name.trim().toLowerCase())
    const patch: Record<string, string> = { registeredName: name.trim().toUpperCase() }
    if (sup?.registeredAddress) patch.registeredAddress = sup.registeredAddress
    if (sup?.tin) patch.tinNumber = formatTin(sup.tin)
    return patch
  }
  // "Add to Asset Management" prompt for entries tagged with a PPE classification.
  const [assetPrompt, setAssetPrompt] = useState<Entry | null>(null)
  const [assetBusy, setAssetBusy] = useState(false)
  const [assetResult, setAssetResult] = useState<{ count: number; addedTo?: { name: string; controlNumber: string | null; added: number; totalAmount: number } | null } | null>(null)
  // Details typed into the "Add to Asset Management" dialog (photos, custodian, remarks).
  // multi/quantity/unitNames: "more than 1 item" — one asset with per-piece custodians,
  // each piece getting a sub control number (-01, -02, …) under one control number.
  const [assetForm, setAssetForm] = useState<{ name: string; accountableName: string; remarks: string; photoUrls: string[]; multi: boolean; quantity: string; unitNames: string[]; addTo: boolean; existingAssetId: string; sameAll?: boolean }>({ name: '', accountableName: '', remarks: '', photoUrls: [], multi: false, quantity: '2', unitNames: [], addTo: false, existingAssetId: '' })
  // HR-Hub staff names for the Accountability typeahead — same source as the Asset
  // Management form, so typed custodians match staff records (and the Accountability
  // summary tab) exactly instead of free-typed spellings.
  const [assetStaffNames, setAssetStaffNames] = useState<string[]>([])
  useEffect(() => {
    if (!assetPrompt) return
    const code = assetPrompt.branch === 'SANDBOX_EAST' ? 'SBEA' : assetPrompt.branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : assetPrompt.branch === 'VERDANA_STORE' ? 'VERDANA' : ''
    fetch(`/api/pos/staff${code ? `?branch=${code}` : ''}`).then(r => r.ok ? r.json() : [])
      .then((d: unknown) => {
        const list = (Array.isArray(d) ? d : ((d as { staff?: unknown[] })?.staff ?? [])) as { name?: string }[]
        setAssetStaffNames([...new Set(list.map(s => s.name || '').filter(Boolean))])
      })
      .catch(() => setAssetStaffNames([]))
  }, [assetPrompt])
  const [assetReAddWarn, setAssetReAddWarn] = useState<Entry | null>(null)   // "already added" confirmation
  // "Record in Inventory & Procurement" prompt for inventory-classification entries.
  const [invPrompt, setInvPrompt] = useState<Entry | null>(null)
  const [invReAddWarn, setInvReAddWarn] = useState<Entry | null>(null)   // "already recorded" confirmation
  const goToInventory = (e: Entry, action: 'create' | 'adjust' | 'freight') => {
    try {
      // Freight is capitalized net of VAT (VAT is recoverable Input VAT); item
      // cost / replenishment amounts use the gross paid.
      const net = netOfVat(e)
      localStorage.setItem('pcf-inventory-draft', JSON.stringify({
        action, entryId: e.id, name: e.description || '', unitCost: Number(e.grossAmount) || 0,
        freightAmount: Math.round(net * 100) / 100,
        branch: e.branch, supplierName: e.registeredName || '', fromPettyCash: true,
      }))
    } catch { /* ignore */ }
    const q = action === 'adjust' ? '/inventory?tab=Adjustments&fromPcf=1'
      : action === 'freight' ? '/inventory?tab=Adjustments&fromPcf=1&freight=1'
      : '/inventory?fromPcf=1'
    window.location.href = q
  }
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
      if (r.ok) {
        const s = await r.json()
        setRequestors(s.requestors || []); setNextPcvSeq(s.nextPcvSeq || 1)
        setFundAmount(s.fundAmount != null && Number(s.fundAmount) ? String(Number(s.fundAmount)) : '')
        const bd: Record<string, string> = {}
        if (s.cashBreakdown && typeof s.cashBreakdown === 'object') {
          for (const [k, v] of Object.entries(s.cashBreakdown as Record<string, unknown>)) bd[k] = String(v)
        }
        setCashBreakdown(bd)
        setDueToFrom(Array.isArray(s.dueToFrom) ? s.dueToFrom.map((d: { label?: string; direction?: string; amount?: number }) => ({ label: String(d.label || ''), direction: d.direction === 'FROM' ? 'FROM' : 'TO', amount: String(d.amount ?? '') })) : [])
      }
    } catch { /* ignore */ }
  }, [])

  const saveCashCount = async () => {
    setCcSaving(true)
    try {
      const bd: Record<string, number> = {}
      for (const [k, v] of Object.entries(cashBreakdown)) { const n = parseInt(v, 10); if (Number.isFinite(n) && n > 0) bd[k] = n }
      const r = await fetch('/api/petty-cash/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch,
          fundAmount: num(fundAmount),
          cashBreakdown: bd,
          dueToFrom: dueToFrom.filter(d => d.label.trim()).map(d => ({ label: d.label.trim(), direction: d.direction, amount: num(d.amount) })),
        }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'Failed to save'); return }
      await loadSettings(branch)
    } catch { alert('Network error') } finally { setCcSaving(false) }
  }

  const loadReimbursements = useCallback(async (br: string) => {
    try {
      const r = await fetch(`/api/petty-cash/reimbursements?branch=${br}`)
      setReimbursements(r.ok ? await r.json() : [])
    } catch { setReimbursements([]) }
  }, [])

  // Inline "Payable to" edit on an RFP — optimistic, persists on blur.
  const savePayableReimb = async (rfp: Reimb, value: string) => {
    const v = value.trim()
    if ((rfp.payableTo || '') === v) return
    setReimbursements(prev => prev.map(x => x.id === rfp.id ? { ...x, payableTo: v || null } : x))
    try { await fetch('/api/petty-cash/reimbursements', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rfp.id, action: 'set-payable', payableTo: v }) }) } catch { /* ignore */ }
  }

  // ── Downloads (Excel / PDF) with the From/To range ──
  const brName = BRANCHES.find(b => b.value === branch)?.label || branch
  const exportEntries = (fmt: ExportFormat) => {
    const rows = entries.filter(e => inDateRange(e.date, dlFrom, dlTo))
    const headers = ['PCV Number', 'Requestor', 'Department', 'Date', 'Description', 'Vatable', 'SI Number', 'TIN', 'Registered Name', 'Account Title', 'Validity', 'PCF Status', 'Gross Amount']
    const body = rows.map(e => [e.pcvNumber, e.requestor || '', e.department || '', e.date ? String(e.date).slice(0, 10) : '', e.description || '', vatLabel(e), e.siNumber || '', e.tinNumber || '', e.registeredName || '', e.accountTitle || '', e.validity || '', e.pcfStatus || '', num(e.grossAmount).toFixed(2)])
    if (fmt === 'xlsx') downloadXlsx(`petty-cash-entries-${branchFileTag(branch)}`, [{ name: 'Petty Cash', headers, rows: body }])
    else downloadPdf({ title: `Petty Cash Entries — ${brName}`, subtitle: `Range: ${dlFrom || 'start'} → ${dlTo || 'end'} · ${body.length} entr${body.length === 1 ? 'y' : 'ies'}`, headers, rows: body, landscape: true })
  }
  const exportReimb = (fmt: ExportFormat) => {
    const rows = shownReimb.filter(r => inDateRange(r.createdAt, dlFrom, dlTo))
    const headers = ['Reference Number', 'Date', 'Payable to', 'Entries', 'Gross Total', 'Amount Payable', 'Status']
    const body = rows.map(r => [r.refNumber, new Date(r.createdAt).toISOString().slice(0, 10), r.payableTo || '', r._count.entries, num(r.grossTotal).toFixed(2), num(r.payableTotal).toFixed(2), r.status === 'PAID' ? 'Paid' : 'Pending'])
    if (fmt === 'xlsx') downloadXlsx(`petty-cash-rfp-${branchFileTag(branch)}`, [{ name: 'RFP', headers, rows: body }])
    else downloadPdf({ title: `Petty Cash RFP — ${brName}`, subtitle: `Range: ${dlFrom || 'start'} → ${dlTo || 'end'} · ${body.length} RFP(s)`, headers, rows: body, landscape: true })
  }

  useEffect(() => {
    setSelected(new Set())
    loadEntries(branch); loadSettings(branch); loadReimbursements(branch)
    // Suppliers list is only defined for the expense branches (not CEO).
    if (['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE'].includes(branch)) {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setCoaAccounts(list.map((a: any) => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle, accountType: a.accountType })))
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
        const r = await fetch('/api/petty-cash/entries', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...patch }),
        })
        if ('branchAllocations' in patch && !r.ok) {
          const d = await r.json().catch(() => ({}))
          alert(d.error || 'Could not save the branch shares.')
          loadEntries(branch)
          return
        }
        // A title change can take the entry's assets out of Asset Management
        // server-side — show the stamp the server kept, not the stale one. A new
        // amount carries the branch shares with it, so show those too.
        // The server may file a Registered Name under a known supplier — show what it saved.
        if (('accountTitle' in patch || 'grossAmount' in patch || 'registeredName' in patch) && r.ok) {
          const u = await r.json().catch(() => null)
          if ('accountTitle' in patch && u && 'assetAddedAt' in u) patchLocal(id, { assetAddedAt: u.assetAddedAt })
          if ('grossAmount' in patch && u && 'branchAllocations' in u) patchLocal(id, { branchAllocations: u.branchAllocations })
          if ('registeredName' in patch && u && 'registeredName' in u && u.registeredName !== patch.registeredName) patchLocal(id, { registeredName: u.registeredName })
        }
      } catch { /* ignore */ }
    }
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id])
    if (debounce) saveTimers.current[id] = setTimeout(doSave, 500)
    else doSave()
  }

  // Overhaul / force the PCV reference number (to match a physical hard copy).
  const savePcv = async (e: Entry, raw: string) => {
    const val = raw.trim()
    if (!val || val === e.pcvNumber) { patchLocal(e.id, { pcvNumber: e.pcvNumber }); return }
    const prev = e.pcvNumber
    patchLocal(e.id, { pcvNumber: val })
    try {
      const r = await fetch('/api/petty-cash/entries', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: e.id, pcvNumber: val }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'Could not change the reference number.'); patchLocal(e.id, { pcvNumber: prev }) }
      else { const u = await r.json(); patchLocal(e.id, { pcvNumber: u.pcvNumber, pcvSeq: u.pcvSeq }) }
    } catch { patchLocal(e.id, { pcvNumber: prev }) }
  }
  // Re-parent an entry under an existing PCV base (joins it as the next -NN sub).
  const assignPcv = async (e: Entry, seq: number) => {
    try {
      const r = await fetch('/api/petty-cash/entries', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: e.id, assignToSeq: seq }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'Could not assign to that PCV number.'); return }
      const u = await r.json()
      patchLocal(e.id, { pcvNumber: u.pcvNumber, pcvSeq: u.pcvSeq, pcvSub: u.pcvSub })
    } catch { alert('Could not assign to that PCV number.') }
  }

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const headers = ['Control Reference No.', 'Requestor', 'Department', 'PCF Status', 'Date', 'Description', 'Valid/Invalid', 'Vatable',
      'SI Number', 'TIN Number', 'Registered Name', 'Registered Address', 'Gross Amount', 'Account Title']
    const example = ['CTRL-0001', 'JUAN DELA CRUZ', 'ADMIN', 'For Replenishment', '2026-06-29', 'Sample expense (delete this row)',
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
    // "Control Reference No." (and spelling variants) lands on the same
    // referenceNumber column — it is the control reference of the hard copy.
    controlreferenceno: 'referenceNumber', controlrefno: 'referenceNumber',
    controlreferencenumber: 'referenceNumber', controlref: 'referenceNumber', controlno: 'referenceNumber',
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
      // Control Reference No. is required on every imported row.
      const missingRef = rows
        .map((r, i) => (!String(r.referenceNumber ?? '').trim() ? i + 2 : 0))  // +2: header row + 1-based
        .filter(Boolean)
      if (missingRef.length) {
        alert(`Control Reference No. is required on every row. Missing on file row(s): ${missingRef.slice(0, 20).join(', ')}${missingRef.length > 20 ? '…' : ''}`)
        setImporting(false)
        return
      }
      const res = await fetch('/api/petty-cash/entries/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, rows }),
      })
      if (res.ok) {
        const d = await res.json(); await loadEntries(branch); await loadSettings(branch)
        const matched = (d.suppliersMatched || []) as { from: string; to: string }[]
        alert(`Imported ${d.created} row(s).` + (matched.length ? `\n\nSupplier names filed under the supplier already on record:\n${matched.map(m => `• ${m.from} → ${m.to}`).join('\n')}` : ''))
      }
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

  // Duplicate the most-recent "For Replenishment" entry (fresh PCV) so only the
  // amount needs changing. A replenished entry is never the source: copying it would
  // make a new, unpaid row born "Replenished" — hidden and counted as liquidated.
  const duplicateLast = async () => {
    const latest = (pred: (e: Entry) => boolean) => [...entries].reverse().find(pred)
    const src = latest(e => e.pcfStatus === 'For Replenishment')
      ?? latest(e => e.pcfStatus !== 'Replenished')
      ?? entries[entries.length - 1]
    if (!src) { alert('No previous entry to duplicate yet.'); return }
    setAdding(true)
    try {
      const r = await fetch('/api/petty-cash/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, samePcvSeq: null }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed to add row'); return }
      const e = await r.json()
      const copy = { requestor: src.requestor, department: src.department, pcfStatus: src.pcfStatus === 'Replenished' ? 'For Replenishment' : src.pcfStatus, date: src.date, description: src.description, vatable: src.vatable, vatPortion: src.vatPortion, siNumber: src.siNumber, tinNumber: src.tinNumber, registeredName: src.registeredName, registeredAddress: src.registeredAddress, grossAmount: src.grossAmount, accountTitle: src.accountTitle, validity: src.validity }
      const pr = await fetch('/api/petty-cash/entries', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id, ...copy }) })
      const updated = pr.ok ? await pr.json() : { ...e, ...copy }
      setEntries(prev => [...prev, updated]); setNextPcvSeq(s => s + 1)
    } catch { /* ignore */ } finally { setAdding(false) }
  }

  const getAllocArr = (e: Entry) => (Array.isArray(e.branchAllocations) ? e.branchAllocations : [])
  const allocOf = (e: Entry, bv: string) => getAllocArr(e).find(x => x.branch === bv)?.amount
  const allocSum = (e: Entry) => getAllocArr(e).reduce((sm, a) => sm + (Number(a.amount) || 0), 0)
  const saveAlloc = (e: Entry, arr: { branch: string; amount: number }[], debounce = false) => saveField(e.id, { branchAllocations: arr }, debounce)
  const toggleAlloc = (e: Entry, bv: string) => {
    const arr = getAllocArr(e).slice()
    const i = arr.findIndex(x => x.branch === bv)
    if (i >= 0) arr.splice(i, 1); else arr.push({ branch: bv, amount: 0 })
    saveAlloc(e, balanceShares(arr, num(e.grossAmount)))
  }
  const setAllocAmt = (e: Entry, bv: string, val: string) => {
    saveAlloc(e, typeShare(getAllocArr(e), bv, val, num(e.grossAmount)), true)
  }

  const proofsOf = (e: Entry): string[] => {
    const arr = Array.isArray(e.proofUrls) ? e.proofUrls : []
    if (arr.length) return arr
    return e.proofUrl ? [e.proofUrl] : []
  }
  const removeProof = (e: Entry, url: string) => {
    const next = proofsOf(e).filter(u => u !== url)
    saveField(e.id, { proofUrls: next, proofUrl: next[0] ?? null }, false)
  }
  // Race-safe append (ScanUpload may deliver several photos in quick succession).
  const gridTableRef = useRef<HTMLTableElement>(null)
  // v2: widths stored under the old key were seeded before the Department cell
  // grew (dept tags) and could leave the trailing actions column with no room —
  // a fresh key re-measures every column once against the current layout.
  // Columns the user chose to hide (Columns menu), remembered per browser.
  const [hiddenCols, setHiddenCols] = useState<string[]>(DEFAULT_HIDDEN)
  useEffect(() => {
    try { const raw = localStorage.getItem('pcf-hidden-cols'); if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) setHiddenCols(v.filter(k => typeof k === 'string')) } } catch { /* ignore */ }
  }, [])
  const visibleCols = gridColumnsFor(branch).filter(c => !hiddenCols.includes(c.key))
  // v3: starting widths come from COL_W (wide enough for the content); widths
  // are kept per branch and per set of hidden columns.
  const gridRz = useResizableColumns(
    `petty-cash-entries-grid-v3-${branch}-${[...hiddenCols].sort().join('.')}`,
    gridTableRef,
    [SELECT_W, ...visibleCols.map(c => COL_W[c.key] ?? 120), ACTIONS_W],
  )
  const entriesRef = useRef(entries)
  useEffect(() => { entriesRef.current = entries }, [entries])
  const appendProof = (id: string, url: string) => {
    const e = entriesRef.current.find(x => x.id === id); if (!e) return
    const cur = proofsOf(e); const next = [...cur, url]
    entriesRef.current = entriesRef.current.map(x => x.id === id ? { ...x, proofUrls: next, proofUrl: next[0] } : x)
    saveField(id, { proofUrls: next, proofUrl: next[0] }, false)
  }

  // Undo a replenishment from the entry's own row: the RFP that paid this
  // batch flips back to unpaid and EVERY entry in it returns to "For
  // Replenishment" — payment is recorded per RFP, so the undo is per RFP too.
  const undoReplenishment = async (e: Entry) => {
    if (!e.reimbursementId) return
    if (!confirm(`Undo the replenishment that paid ${refOf(e)}?\n\nThe whole replenishment RFP goes back to UNPAID and every entry it covers returns to "For Replenishment" (payment is recorded per RFP, not per entry). Re-record the payment from Expenses → RFP when ready.`)) return
    try {
      const r = await fetch('/api/petty-cash/reimbursements', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.reimbursementId, action: 'unpay' }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      await loadEntries(branch)
    } catch { /* ignore */ }
  }

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this entry?')) return
    setEntries(prev => prev.filter(e => e.id !== id))
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    try { await fetch(`/api/petty-cash/entries?id=${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }

  // ── Reimbursement (Phase 2) ───────────────────────────────────
  const buildReimbursementPdf = async (refNumber: string, br: string, rows: Entry[], ceoBranch?: string | null): Promise<string> => {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    // For CEO branch RFPs each row shows only the branch-allocated portion.
    const grossOf = (e: Entry) => ceoBranch ? (allocOf(e, ceoBranch) || 0) : num(e.grossAmount)
    const netOf = (e: Entry) => entryNet(e, grossOf(e))
    const vatOf = (e: Entry) => grossOf(e) - netOf(e)
    // CEO petty cash RFP → "CEO Petty Cash" (the allocated branch is in the Ref No.).
    const branchLabel = br === 'CEO' ? 'CEO Petty Cash' : (BRANCHES.find(b => b.value === br)?.label || br)
    const logo = await fetchDataUrl('/aura-logo.png')
    let tx = 14
    if (logo) { doc.addImage(logo, 'PNG', 14, 9, 18, 18); tx = 36 }
    doc.setFont('helvetica', 'bold').setFontSize(13).text('Request for Payment (RFP)', tx, 15)
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text(`Branch: ${branchLabel}`, tx, 20)
    doc.text(`Ref No: ${refNumber}`, tx, 24)
    doc.text(`Date: ${new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}`, tx, 28)
    const tG = rows.reduce((s, e) => s + grossOf(e), 0)
    const tN = rows.reduce((s, e) => s + netOf(e), 0)
    const tV = rows.reduce((s, e) => s + vatOf(e), 0)
    autoTable(doc, {
      startY: 33,
      head: [['Reference Number', 'Requestor', 'Department', 'PCF Status', 'Date', 'Description', 'Vatable', 'Gross Amount', 'Net of VAT', 'VAT Amount']],
      body: rows.map(e => [
        refOf(e), e.requestor || '', e.department || '', e.pcfStatus || '',
        e.date ? String(e.date).slice(0, 10) : '', e.description || '', vatLabel(e),
        peso(grossOf(e)), peso(netOf(e)), peso(vatOf(e)),
      ]),
      foot: [['', '', '', '', '', '', 'TOTAL',
        { content: peso(tG), styles: { halign: 'right' } },
        { content: peso(tN), styles: { halign: 'right' } },
        { content: peso(tV), styles: { halign: 'right' } },
      ]],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [36, 73, 82], textColor: 255 },
      footStyles: { fillColor: [237, 243, 217], textColor: [30, 30, 30], fontStyle: 'bold' },
      columnStyles: { 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
      margin: { left: 10, right: 10 },
    })
    // No automatic download — generating an RFP stores the PDF on the report
    // row; the Download button on the Reimbursements tab serves it on demand.
    return doc.output('datauristring')
  }

  const generateReimbursement = async (manualSeq?: string) => {
    setGenerating(true)
    try {
      const ids = [...selected]
      const sel = entries.filter(e => selected.has(e.id))
      const res = await fetch('/api/petty-cash/reimbursements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, entryIds: ids, kind: rfpMode || 'VALID', manualSeq: manualSeq || null, filterBranch: isCeo ? rfpBranch : null }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Failed to generate'); setGenerating(false); return }
      const { id, refNumber } = await res.json()
      const pdfData = await buildReimbursementPdf(refNumber, branch, sel, isCeo ? rfpBranch : null)
      try {
        await fetch('/api/petty-cash/reimbursements', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, pdfData }),
        })
      } catch { /* pdf storage best-effort */ }
      setSelected(new Set())
      setShowReimbModal(false)
      setRfpMode(null)
      setRfpBranch('')
      // The RFP list names the "Already on …" chips, so it must know the new one.
      await Promise.all([loadEntries(branch), loadReimbursements(branch)])
      alert(`RFP ${refNumber} created — find it under Expenses → RFP (all RFPs are now consolidated into one consecutive list).`)
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

  const openBillingVoucher = async (rep: Reimb) => {
    try {
      const res = await fetch(`/api/petty-cash/reimbursements?id=${rep.id}&items=1`)
      const d = res.ok ? await res.json() : { lines: [] }
      setBvTarget({
        refNumber: rep.refNumber, date: new Date(rep.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }),
        lines: d.lines || [], branch, defaultBilledTo: rep.payableTo || '',
        payment: {
          payee: rep.payableTo || ((d.lines || [])[0]?.payee ?? ''),
          purpose: (d.lines || [])[0]?.memo || (d.lines || [])[0]?.description || '',
          bankAccount: rep.debitAccount || '',
          paymentMode: rep.paymentMethod || '',
          reference: rep.transferRef || rep.checkNumber || '',
        },
      })
    } catch { alert('Could not load RFP line items.') }
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
    // On save (finalize), offer to add a new supplier to the Suppliers list.
    // Invalid-classified expenses are not real suppliers — never add them to the list.
    if (name && e.validity !== 'Invalid' && ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE'].includes(branch) && !supplierNames.has(name.toLowerCase())) {
      setNewSupplierPrompt({ registeredName: name, registeredAddress: e.registeredAddress || '', tin: e.tinNumber || '' })
    }
    // Asset-classification entries are added to Asset Management via the dedicated
    // "Add to Asset Management" button under the Account Title (works anytime).
  }
  // Move a petty-cash entry to One-Time Expense (same row, record type flips):
  // it becomes RFP-payable from a bank account instead of the branch float.
  const transferToOneTime = async (e: Entry) => {
    if (!confirm(`Move ${e.pcvNumber} to One-Time Expense? It leaves Petty Cash and becomes payable through an Expenses RFP (bank account) instead of the float replenishment.`)) return
    try {
      const r = await fetch('/api/petty-cash/entries/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { alert(j.error || 'Failed to transfer'); return }
      await loadEntries(branch)
      alert(`${e.pcvNumber} moved to One-Time Expense — find it under Expenses → One-time expense.`)
    } catch { alert('Failed to transfer') }
  }

  const confirmAddAsset = async () => {
    if (!assetPrompt) return
    if (assetForm.addTo && !assetForm.existingAssetId) { alert('Pick the asset this payment belongs to.'); return }
    setAssetBusy(true)
    try {
      const qty = assetForm.multi ? Math.max(1, Math.min(200, parseInt(assetForm.quantity) || 1)) : 1
      const r = await fetch('/api/assets/from-entry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: assetPrompt.id,
          existingAssetId: assetForm.addTo ? assetForm.existingAssetId : undefined,
          name: assetForm.name,
          accountableName: assetForm.accountableName,
          remarks: assetForm.remarks,
          photoUrl: assetForm.photoUrls[0] || null,
          photoUrls: assetForm.photoUrls,
          quantity: qty,
          units: qty > 1
            ? Array.from({ length: qty }, (_, i) => ({ accountableName: ((assetForm.sameAll ? assetForm.accountableName : assetForm.unitNames[i]) || '').trim() || null }))
            : undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Failed to add asset'); setAssetBusy(false); return }
      patchLocal(assetPrompt.id, { assetAddedAt: d.assetAddedAt || new Date().toISOString() })
      setAssetResult({ count: (d.created || []).length, addedTo: d.addedTo || null })
      setAssetPrompt(null)
    } catch { alert('Failed to add asset') }
    setAssetBusy(false)
  }
  const confirmAddSupplier = async () => {
    if (!newSupplierPrompt) return
    try {
      const r = await fetch('/api/expenses/suppliers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, ...newSupplierPrompt }),
      })
      if (r.ok) { setSupplierNames(prev => new Set(prev).add(newSupplierPrompt.registeredName.trim().toLowerCase())); loadPickSuppliers() }
    } catch { /* ignore */ }
    setNewSupplierPrompt(null)
  }

  const cellCls = 'w-full bg-transparent px-2 py-1.5 text-xs outline-none rounded enabled:hover:bg-[rgba(35,48,56,0.04)] focus:bg-[var(--pale-teal)]'
  const tdCls = 'border-r border-b align-top'
  const locked = (e: Entry) => !!e.reimbursementId || !!e.finalized || !canWrite
  const vatEditable = (e: Entry) => e.vatable === 'VAT' || e.vatable === 'Non-VAT' || e.vatable === 'NV'

  // Per-column header sort/filter for the entries grid.
  const [gridSort, setGridSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: '', dir: 'asc' })
  const [gridFilters, setGridFilters] = useState<Record<string, string>>({})
  // Replenished rows are hidden by default so the working set sits in view
  // without scrolling. The tick box alone decides — a header filter only
  // searches what is shown (it used to search hidden rows too, so an unticked
  // box with "tiktok" typed in still listed every replenished TikTok row).
  // The global-search deep link turns the box on so the clicked PCV is found.
  const [showReplenished, setShowReplenished] = useState(false)
  useEffect(() => { try { setShowReplenished(localStorage.getItem('pcf-show-replenished') === '1') } catch { /* ignore */ } }, [])
  const toggleShowReplenished = () => setShowReplenished(v => { const nv = !v; try { localStorage.setItem('pcf-show-replenished', nv ? '1' : '0') } catch { /* ignore */ } return nv })
  // Deep link from global search — filter the grid to the PCV that was clicked.
  const { focus, done } = useFocusTarget()
  useEffect(() => { if (focus) { setGridFilters(f => ({ ...f, refNumber: focus })); setShowReplenished(true); done() } }, [focus, done])
  const gridToggleSort = (k: string) => setGridSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const gridCols = gridColumnsFor(branch)
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
      case 'vatable': return vatLabel(e)
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
      // CEO allocations: the branch values this entry is allocated to (nonzero),
      // so the header dropdown can filter entries by allocation branch.
      case 'branchAlloc': return getAllocArr(e).filter(a => Number(a.amount) !== 0).map(a => a.branch).join(' ')
      default: return ''
    }
  }
  // Hide replenished rows unless the tick box is on. When a filter is typed,
  // count the replenished rows it would also match so the grid can say so.
  // One search box over the columns people look things up by.
  const [gridSearch, setGridSearch] = useState('')
  const searchQ = gridSearch.trim().toLowerCase()
  const matchesSearch = (e: Entry) => !searchQ || [
    refOf(e), e.requestor, e.description, e.registeredName, e.siNumber, e.tinNumber, e.accountTitle, e.pcfStatus,
    peso(num(e.grossAmount)), String(num(e.grossAmount)),
  ].some(v => (v || '').toLowerCase().includes(searchQ))
  const anyGridFilter = Object.values(gridFilters).some(v => (v || '').trim() !== '')
  const gridRows = showReplenished ? entries : entries.filter(e => e.pcfStatus !== 'Replenished')
  const displayed = applySortFilter(gridRows, gridGet, gridSort.key, gridSort.dir, gridFilters).filter(matchesSearch)
  const hiddenMatches = showReplenished || !(anyGridFilter || searchQ) ? 0
    : applySortFilter(entries.filter(e => e.pcfStatus === 'Replenished'), gridGet, '', 'asc', gridFilters).filter(matchesSearch).length
  const totalGross = displayed.reduce((s, e) => s + num(e.grossAmount), 0)
  const totalNet = displayed.reduce((s, e) => s + netOfVat(e), 0)
  const totalVat = displayed.reduce((s, e) => s + vatAmount(e), 0)
  const clearGridFilters = () => { setGridFilters({}); setGridSearch(''); restoreReplPref() }
  // Remembered "show replenished" choice — quick filters change the view
  // without overwriting it, and clearing them puts it back.
  const restoreReplPref = () => { try { setShowReplenished(localStorage.getItem('pcf-show-replenished') === '1') } catch { setShowReplenished(false) } }

  // ── Fund at a glance (same sums as the old three boxes) ──
  const sumGross = (list: Entry[]) => list.reduce((s, e) => s + num(e.grossAmount), 0)
  const unliqEntries = entries.filter(e => e.pcfStatus === 'Unliquidated')
  const forReplEntries = entries.filter(e => e.pcfStatus === 'For Replenishment')
  const replEntries = entries.filter(e => e.pcfStatus === 'Replenished')
  const openCount = entries.filter(e => e.pcfStatus !== 'Replenished').length
  // Work still to do on open entries: not audited / no account title (both
  // keep an entry out of an RFP), and anything marked Missing.
  const openWork = entries.filter(e => e.pcfStatus !== 'Replenished' && e.pcfStatus !== 'Cancelled')
  const toAuditCount = openWork.filter(e => !e.audited).length
  const noTitleCount = openWork.filter(e => !(e.accountTitle || '').trim()).length
  const missingCount = entries.filter(e => e.pcfStatus === 'Missing').length
  type TileKind = 'forRepl' | 'unliq' | 'repl' | 'audit'
  const activeTile: TileKind | null = gridFilters.pcfStatus === 'For Replenishment' ? 'forRepl'
    : gridFilters.pcfStatus === 'Unliquidated' ? 'unliq'
    : gridFilters.pcfStatus === 'Replenished' ? 'repl'
    : gridFilters.audited === 'No' ? 'audit' : null
  const tileFilter = (k: TileKind) => {
    if (activeTile === k) {
      setGridFilters(f => { const n = { ...f }; delete n.pcfStatus; delete n.audited; return n })
      if (k === 'repl') restoreReplPref()
      return
    }
    setGridFilters(f => {
      const n = { ...f }; delete n.pcfStatus; delete n.audited
      if (k === 'audit') n.audited = 'No'
      else n.pcfStatus = k === 'forRepl' ? 'For Replenishment' : k === 'unliq' ? 'Unliquidated' : 'Replenished'
      return n
    })
    if (k === 'repl') setShowReplenished(true)
  }
  const toggleCol = (k: string) => {
    setHiddenCols(prev => {
      const next = prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]
      try { localStorage.setItem('pcf-hidden-cols', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
    // A hidden column must not keep filtering the grid out of sight.
    setGridFilters(f => { if (!f[k]) return f; const n = { ...f }; delete n[k]; return n })
  }
  const [colsOpen, setColsOpen] = useState(false)
  const show = (k: string) => !hiddenCols.includes(k)
  const stickyRefLeft = gridRz.widths[0] || SELECT_W

  // Entries are only selectable after an RFP button is clicked, and only those
  // matching the chosen kind's validity (and not already in an RFP).
  const rfpValidity = rfpMode === 'VALID' ? 'Valid' : rfpMode === 'INVALID' ? 'Invalid' : null
  const isCeo = branch === 'CEO'
  // Why a row cannot be ticked, said on the row and in the banner. A CEO row
  // already on the chosen branch's pending RFP used to look exactly like a fresh
  // one — same colour, a disabled box, no reason — so "I can't RFP these" read
  // as a bug when they were simply filed already.
  // CEO: an entry is selectable for the chosen RFP branch if it has a nonzero
  // allocation to that branch and that branch portion hasn't been RFP'd yet — so
  // a shared entry can be ticked once per branch.
  const rfpRefById = new Map(reimbursements.map(r => [r.id, r.refNumber]))
  const branchLabel = (v: string) => ALLOC_BRANCHES.find(b => b.value === v)?.label || v
  type TickBlock = { kind: 'mode' | 'onRfp' | 'title' | 'validity' | 'audit' | 'branch' | 'share'; text: string; ref?: string }
  const onRfp = (rfpId: string, forBranch?: string): TickBlock => {
    const ref = rfpRefById.get(rfpId)
    return { kind: 'onRfp', ref, text: `Already on ${ref || 'an RFP'}${forBranch ? ` for ${branchLabel(forBranch)}` : ''}` }
  }
  const tickBlock = (e: Entry): TickBlock | null => {
    if (rfpValidity == null) return e.reimbursementId ? onRfp(e.reimbursementId) : { kind: 'mode', text: 'Click RFP (Valid) or RFP (Invalid) first' }
    if (!isCeo && e.reimbursementId) return onRfp(e.reimbursementId)
    if (isCeo && rfpBranch && e.rfpBranchMap?.[rfpBranch]) return onRfp(e.rfpBranchMap[rfpBranch], rfpBranch)
    // A row without an Account Title cannot be tagged into an RFP — the reports
    // drop untitled rows entirely, so tagging one buries the expense.
    if (!(e.accountTitle || '').trim()) return { kind: 'title', text: 'Set the Account Title first' }
    if (e.validity !== rfpValidity) return { kind: 'validity', text: `Only ${rfpValidity.toLowerCase()} entries can be ticked` }
    if (!e.audited) return { kind: 'audit', text: 'Entry must be Audited = Yes first' }
    if (isCeo) {
      if (!rfpBranch) return { kind: 'branch', text: 'Choose the branch for this RFP first' }
      const amt = allocOf(e, rfpBranch)
      if (!amt) return { kind: 'share', text: `No ${branchLabel(rfpBranch)} share on this entry` }
    }
    return null
  }
  const isSelectable = (e: Entry) => rfpValidity != null && tickBlock(e) === null
  const selectableIds = displayed.filter(isSelectable).map(e => e.id)
  // Banner breakdown of the rows that can't be ticked, by reason.
  const tickSummary = (() => {
    if (rfpValidity == null) return ''
    const n: Record<string, number> = {}
    const refs = new Set<string>()
    for (const e of displayed) {
      const b = tickBlock(e)
      if (!b) continue
      n[b.kind] = (n[b.kind] || 0) + 1
      if (b.kind === 'onRfp') refs.add(b.ref || '')
    }
    const bl = isCeo && rfpBranch ? branchLabel(rfpBranch) : ''
    const parts: string[] = []
    if (n.onRfp) parts.push(`${n.onRfp} already on ${refs.size === 1 && !refs.has('') ? [...refs][0] : `an RFP${bl ? ` for ${bl}` : ''}`}`)
    if (n.share) parts.push(`${n.share} with no ${bl} share`)
    if (n.audit) parts.push(`${n.audit} not audited`)
    if (n.validity) parts.push(`${n.validity} not ${rfpValidity.toLowerCase()}`)
    if (n.title) parts.push(`${n.title} without an account title`)
    return parts.join(', ')
  })()
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds))
  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const startRfp = (mode: 'VALID' | 'INVALID') => { setRfpMode(mode); setSelected(new Set()); if (tab !== 'entries') setTab('entries') }
  const cancelRfp = () => { setRfpMode(null); setSelected(new Set()); setRfpBranch('') }
  // Distinct existing PCV bases (for "same PCV as a previous entry").
  const pcvBases = Array.from(new Map(entries.map(e => [e.pcvSeq, e.pcvNumber.replace(/-\d{2}$/, '')])).entries())
    .map(([seq, label]) => ({ seq, label }))
    .sort((a, b) => b.seq - a.seq)   // most recent PCV first
  const confirmAddRow = () => { setShowAddPopup(false); addRow(addSameSeq ? Number(addSameSeq) : null); setAddSameSeq('') }
  // Audit status updates even on locked rows (audit happens after RFP).
  const setAudited = async (id: string, audited: boolean) => {
    if (audited) {
      const row = entries.find(e => e.id === id)
      if (row && !(row.accountTitle || '').trim()) { alert('Set the Account Title first — a row cannot be tagged as audited while it is blank.'); return }
    }
    patchLocal(id, { audited })
    try { await fetch('/api/petty-cash/audited', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, audited }) }) } catch { /* ignore */ }
  }

  const { ghost: ghostBtn, primary: primaryBtn, outline: outlineBtn } = hrBtn
  const selectedEntries = rfpMode ? entries.filter(e => selected.has(e.id)) : []
  const selectedTotal = isCeo
    ? selectedEntries.reduce((s, e) => s + (Number(allocOf(e, rfpBranch)) || 0), 0)
    : sumGross(selectedEntries)
  const dlCount = entries.filter(e => inDateRange(e.date, dlFrom, dlTo)).length

  return (
    <div className={expanded ? 'fixed inset-0 z-50 overflow-auto p-4 lg:p-6 space-y-4' : HR_PAGE_CLASS}
      style={{ ...HR_VARS, background: 'var(--off-white)', color: 'var(--charcoal)' }}>
      <HrShimmerStyle />

      {/* ── Header: title + branch ── */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Petty Cash</h1>
          <p className="mt-1 text-[13px] max-w-2xl" style={{ color: 'var(--mid-gray)' }}>
            Encode petty cash spending, audit it, file it for an RFP, and count the cash on hand.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Branch">
          {(scope.enum
            ? BRANCHES.filter(b => b.value === scope.enum || (canCrossView && PETTY_CASH_VIEW_ONLY_BRANCHES.includes(b.value)))
            : BRANCHES).map(b => (
            <button key={b.value} onClick={() => setBranch(b.value)} aria-pressed={branch === b.value}
              className="px-3.5 py-1.5 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors"
              style={branch === b.value
                ? { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }
                : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}
              title={canCrossView && PETTY_CASH_VIEW_ONLY_BRANCHES.includes(b.value) ? 'View only' : BRANCH_NAMES[b.value]}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabs + page actions ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b-2" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex overflow-x-auto -mb-[2px]" role="tablist">
          {/* PCF Reimbursements tab removed — all RFPs now live under Expenses → RFP as one consecutive list */}
          {([['entries', 'Entries'], ['cashcount', 'Cash Count'], ['flowchart', 'Flowchart']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)} role="tab" aria-selected={tab === k}
              className="px-4 py-2.5 border-b-2 text-[13px] font-semibold whitespace-nowrap transition-colors hover:text-[var(--teal)]"
              style={{ fontFamily: 'var(--font-display)', borderColor: tab === k ? 'var(--teal)' : 'transparent', color: tab === k ? 'var(--teal)' : 'var(--mid-gray)' }}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {viewOnly && (
            <span className="inline-flex items-center gap-1 h-8 px-3 rounded-full border text-xs font-semibold"
              style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#b45309' }}>
              <Eye size={13} /> View only
            </span>
          )}
          <span className="inline-flex items-center h-8 px-3 rounded-full border bg-white text-xs font-semibold whitespace-nowrap"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }} title="The next new entry gets this PCV number">
            {BRANCH_NAMES[branch] || branch} · Next PCV #{nextPcvSeq}
          </span>
          <button onClick={() => setShowSettings(true)} className={ghostBtn} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <Settings size={14} /> Settings
          </button>
          <button onClick={downloadTemplate} className={ghostBtn} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <Download size={14} /> Template
          </button>
          {canWrite && (
            <button onClick={() => fileInputRef.current?.click()} disabled={importing} className={ghostBtn}
              style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import CSV/Excel
            </button>
          )}
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = '' }} />
          <button onClick={() => setExpanded(v => !v)} className={ghostBtn} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}
            title={expanded ? 'Back to the normal page' : 'Fill the screen with the grid'}>
            {expanded ? <><Minimize2 size={14} /> Collapse</> : <><Maximize2 size={14} /> Expand</>}
          </button>
        </div>
      </div>

      {tab === 'entries' && (
        <>
          {/* ── Fund at a glance (cards double as quick filters) ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard loading={loading} label="For replenishment" value={`₱${peso(sumGross(forReplEntries))}`}
              sub={`${forReplEntries.length} entr${forReplEntries.length === 1 ? 'y' : 'ies'} · awaiting the RFP payment`}
              tone={forReplEntries.length ? 'amber' : 'zero'} active={activeTile === 'forRepl'} onClick={() => tileFilter('forRepl')}
              title="Show only the entries waiting for replenishment" />
            <StatCard loading={loading} label="Unliquidated" value={`₱${peso(sumGross(unliqEntries))}`}
              sub={`${unliqEntries.length} entr${unliqEntries.length === 1 ? 'y' : 'ies'} · cash out, receipts pending`}
              tone={unliqEntries.length ? 'blue' : 'zero'} active={activeTile === 'unliq'} onClick={() => tileFilter('unliq')}
              title="Show only the unliquidated entries" />
            <StatCard loading={loading} label="Liquidated" value={`₱${peso(sumGross(replEntries))}`}
              sub={`${replEntries.length} replenished entr${replEntries.length === 1 ? 'y' : 'ies'}`}
              tone={replEntries.length ? 'green' : 'zero'} active={activeTile === 'repl'} onClick={() => tileFilter('repl')}
              title="Show only the replenished entries" />
            <StatCard loading={loading} label="To audit" value={toAuditCount.toLocaleString()}
              sub={noTitleCount ? `${noTitleCount} open without an account title`
                : missingCount ? `${missingCount} marked Missing`
                : toAuditCount ? 'Open entries not yet audited' : 'Every open entry is audited'}
              tone={toAuditCount || noTitleCount || missingCount ? 'red' : 'zero'} active={activeTile === 'audit'}
              onClick={toAuditCount ? () => tileFilter('audit') : activeTile === 'audit' ? () => tileFilter('audit') : undefined}
              title="An entry must be audited and have an account title before it can go into an RFP" />
          </div>

          {/* ── Entries card ── */}
          <section className="rounded-lg border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-3.5 pb-3">
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  Entries <span className="ml-1 text-xs font-semibold" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-body)' }}>
                    {loading ? '' : `${displayed.length.toLocaleString()}${displayed.length !== entries.length ? ` of ${entries.length.toLocaleString()}` : ''}`}
                  </span>
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                  Every cell saves as you leave it. Finalize a row with ✓, then audit it, then file it for an RFP.
                </p>
              </div>
              {canWrite && (
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setShowAddPopup(true)} disabled={adding} className={primaryBtn} style={{ background: 'var(--teal)' }}>
                    {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />} Add entry
                  </button>
                  <button onClick={duplicateLast} disabled={adding || entries.length === 0} className={outlineBtn}
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
                    title="Copy the latest For Replenishment entry's details into a new row (change the amount)">
                    <Plus size={15} /> Duplicate previous entry
                  </button>
                  {rfpMode === null && (
                    <>
                      <button onClick={() => startRfp('VALID')} className={outlineBtn} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                        <FileText size={15} /> RFP (Valid)
                      </button>
                      <button onClick={() => startRfp('INVALID')} className={outlineBtn} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                        <FileText size={15} /> RFP (Invalid)
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {rfpMode !== null && canWrite ? (
              // ── RFP picking mode ──
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-y" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold" style={{ color: '#92400e', fontFamily: 'var(--font-display)' }}>
                    Tick the {rfpMode === 'VALID' ? 'valid' : 'invalid'} entries for this RFP
                  </p>
                  <p className="text-xs" style={{ color: '#b45309' }}>
                    Only audited {rfpMode === 'VALID' ? 'valid' : 'invalid'} entries with an account title can be ticked
                    {isCeo ? ', and only those with a share for the branch you choose' : ''}. {selectableIds.length.toLocaleString()} of the {displayed.length.toLocaleString()} shown can be ticked{tickSummary ? ` — ${tickSummary}` : ''}.
                    {isCeo && !rfpBranch ? <strong> Choose a branch to see which can be ticked.</strong> : null}
                  </p>
                </div>
                {isCeo && (
                  <select value={rfpBranch} onChange={e => { setRfpBranch(e.target.value); setSelected(new Set()) }}
                    className="h-9 px-3 rounded-lg text-xs font-semibold border bg-white" style={{ borderColor: rfpBranch ? 'var(--teal)' : '#dc2626', color: 'var(--charcoal)' }}>
                    <option value="">Choose branch…</option>
                    {ALLOC_BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                )}
                <span className="text-xs font-semibold whitespace-nowrap tabular-nums" style={{ color: '#92400e' }}>
                  {selected.size} selected{selected.size ? ` · ₱${peso(selectedTotal)}` : ''}{isCeo && rfpBranch && selected.size ? ` for ${ALLOC_BRANCHES.find(b => b.value === rfpBranch)?.label}` : ''}
                </span>
                <button onClick={() => setShowReimbModal(true)} disabled={selected.size === 0 || (isCeo && !rfpBranch)}
                  className={primaryBtn} style={{ background: 'var(--teal)' }}>
                  <FileText size={15} /> Generate RFP ({rfpMode === 'VALID' ? 'Valid' : 'Invalid'}){isCeo && rfpBranch ? ` · ${ALLOC_BRANCHES.find(b => b.value === rfpBranch)?.label}` : ''}{selected.size > 0 ? ` · ${selected.size}` : ''}
                </button>
                <button onClick={cancelRfp} className={outlineBtn} style={{ borderColor: '#fcd34d', color: '#92400e' }}>Cancel</button>
              </div>
            ) : (
              // ── Toolbar: search, open/all, columns, legend ──
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-y" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
                <label className="flex items-center gap-1.5 h-9 px-3 w-full sm:w-60 rounded-lg border bg-white focus-within:border-[var(--teal)] focus-within:shadow-[0_0_0_3px_rgba(74,128,115,0.12)]"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--hr-faint)' }}>
                  <Search size={15} className="flex-shrink-0" />
                  <input value={gridSearch} onChange={e => setGridSearch(e.target.value)} placeholder="Search reference, description, supplier, SI…"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" style={{ color: 'var(--charcoal)' }} />
                  {gridSearch && <button onClick={() => setGridSearch('')} title="Clear search"><X size={14} /></button>}
                </label>
                <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}
                  title="Replenished rows are hidden by default so the working set stays in view">
                  {([[false, 'Open', openCount], [true, 'All', entries.length]] as const).map(([v, lbl, n]) => (
                    <button key={lbl} onClick={() => { if (showReplenished !== v) toggleShowReplenished() }} aria-pressed={showReplenished === v}
                      className="h-9 px-3 text-xs font-semibold whitespace-nowrap"
                      style={showReplenished === v ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
                      {lbl} <span className="tabular-nums opacity-80">{loading ? '' : n.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <button onClick={() => setColsOpen(o => !o)} className={`${ghostBtn} h-9`} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    <Columns3 size={14} /> Columns{hiddenCols.filter(k => gridCols.some(c => c.key === k)).length ? ` · ${hiddenCols.filter(k => gridCols.some(c => c.key === k)).length} hidden` : ''}
                  </button>
                  {colsOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setColsOpen(false)} />
                      <div className="absolute left-0 top-full mt-1 z-40 w-60 max-h-80 overflow-y-auto rounded-lg border bg-white p-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
                        style={{ borderColor: 'var(--light-gray)' }}>
                        <p className="px-1.5 pb-1 text-[11px] font-bold uppercase tracking-[.5px]" style={{ color: 'var(--mid-gray)' }}>Show columns</p>
                        {gridCols.filter(c => !UNHIDEABLE.includes(c.key)).map(c => (
                          <label key={c.key} className="flex items-center gap-2 px-1.5 py-1 rounded text-xs cursor-pointer hover:bg-[var(--off-white)]" style={{ color: 'var(--charcoal)' }}>
                            <input type="checkbox" checked={show(c.key)} onChange={() => toggleCol(c.key)} className="accent-[var(--teal)]" />
                            {c.label}
                          </label>
                        ))}
                        <button onClick={() => { setHiddenCols(DEFAULT_HIDDEN); try { localStorage.setItem('pcf-hidden-cols', JSON.stringify(DEFAULT_HIDDEN)) } catch { /* ignore */ } }}
                          className="mt-1 w-full text-left px-1.5 py-1 text-[11px] font-semibold" style={{ color: 'var(--teal)' }}>
                          Reset to the usual columns
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {(anyGridFilter || searchQ) && (
                  <button onClick={clearGridFilters} className="text-xs font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--teal)' }}>
                    Clear filters
                  </button>
                )}
                {hiddenMatches > 0 && (
                  <button onClick={toggleShowReplenished} className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                    {hiddenMatches} replenished {hiddenMatches === 1 ? 'entry matches' : 'entries match'} (hidden) · <span className="font-semibold" style={{ color: 'var(--teal)' }}>show</span>
                  </button>
                )}
                <div className="ml-auto hidden xl:flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                  {Object.values(ROW_TONES).map(t => (
                    <span key={t.label} className="inline-flex items-center gap-1.5 whitespace-nowrap"
                      title={t === ROW_TONES.forRepl ? 'For replenishment, or already in an RFP' : undefined}>
                      <span className="w-3 h-3 rounded-[3px] border" style={{ background: t.bg, borderColor: 'var(--light-gray)', boxShadow: `inset 3px 0 0 ${t.line}` }} />
                      {t.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-auto" style={{ maxHeight: expanded ? 'calc(100vh - 300px)' : '68vh' }}>
            {loading ? (
              <div className="p-4 space-y-2" aria-busy="true">
                {Array.from({ length: 7 }, (_, i) => <div key={i} className="h-10 rounded-md hr-shimmer" />)}
              </div>
            ) : (
              <>
              <table ref={gridTableRef} className="text-xs rz-grid" style={{ borderCollapse: 'collapse', minWidth: '100%', ...gridRz.tableStyle }}>
                <ResizableColgroup rz={gridRz} />
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="border-b px-2 py-2 text-center"
                      style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)', position: 'sticky', left: 0, zIndex: 25 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!canWrite || selectableIds.length === 0} title="Select all" className="accent-[var(--teal)]" />
                    </th>
                    {visibleCols.map((col, ci) => (
                      <th key={col.key} className={`border-b border-r px-2 py-2 text-left align-top whitespace-nowrap relative ${col.key === 'refNumber' ? 'sm:sticky' : ''}`}
                        style={{
                          color: 'var(--mid-gray)', borderColor: 'var(--hr-line)', borderBottomColor: 'var(--light-gray)', background: 'var(--hr-head)',
                          // above the other columns' resize grips (z 20) when scrolled sideways
                          ...(col.key === 'refNumber' ? { left: stickyRefLeft, zIndex: 25, boxShadow: '4px 0 6px -4px rgba(35,48,56,0.14)' } : {}),
                        }}>
                        {col.key === 'branchAlloc' ? (
                          <div>
                            <span className="block text-[11px] font-bold uppercase tracking-[.5px]">{col.label}</span>
                            <select value={gridFilters['branchAlloc'] || ''} onChange={ev => setGridFilters(f => ({ ...f, branchAlloc: ev.target.value }))}
                              className="mt-1.5 w-full px-1.5 py-1 rounded-md border bg-white text-[11px] font-normal" style={{ borderColor: 'var(--hr-line)', color: 'var(--charcoal)' }}>
                              <option value="">All branches</option>
                              {ALLOC_BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                            </select>
                          </div>
                        ) : col.plain ? (
                          <span className="text-[11px] font-bold uppercase tracking-[.5px]">{col.label}</span>
                        ) : (
                          <>
                            <button onClick={() => gridToggleSort(col.key)}
                              className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[.5px] hover:text-[var(--teal)]"
                              style={gridSort.key === col.key ? { color: 'var(--teal)' } : undefined}>
                              {col.label}
                              <span className="text-[10px]" style={{ opacity: gridSort.key === col.key ? 1 : 0.45 }}>{gridSort.key === col.key ? (gridSort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                            </button>
                            <input value={gridFilters[col.key] || ''} onChange={ev => setGridFilters(f => ({ ...f, [col.key]: ev.target.value }))} placeholder="Filter"
                              className="mt-1.5 w-full px-2 py-1 rounded-md border bg-white text-[11px] font-normal outline-none focus:border-[var(--teal)]"
                              style={{ borderColor: gridFilters[col.key] ? 'var(--teal)' : 'var(--hr-line)', color: 'var(--charcoal)' }} />
                          </>
                        )}
                        <ColResizeHandle rz={gridRz} index={ci + 1} />
                      </th>
                    ))}
                    {/* Actions column: sticky right (same pattern as the Expenses grid) so the
                        finalize/edit/delete controls and the finalized ✓ stay visible without
                        scrolling the wide grid. */}
                    <th className="border-b px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[.5px] whitespace-nowrap"
                      style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)', position: 'sticky', right: 0, zIndex: 25, color: 'var(--mid-gray)', boxShadow: '-4px 0 6px -4px rgba(35,48,56,0.14)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(e => {
                    const lk = locked(e)
                    const ve = vatEditable(e)
                    const tone = rowTone(e)
                    const block = tickBlock(e)
                    return (
                      // Colour by workflow state — identical across all branches (CEO included).
                      // "In an RFP" and "For Replenishment" are the same state (awaiting the
                      // replenishment payment) → same colour, whether tracked via reimbursementId
                      // (branches) or rfpBranchMap (CEO). See ROW_TONES / rowTone.
                      <tr key={e.id} style={{ background: tone.bg }}>
                        <td className="border-b text-center align-top pt-2"
                          style={{ borderColor: 'var(--hr-line)', position: 'sticky', left: 0, zIndex: 2, background: 'inherit', boxShadow: `inset 4px 0 0 ${tone.line}` }}
                          title={rfpMode !== null && block ? block.text : tone.label}>
                          <input type="checkbox" className="accent-[var(--teal)]" checked={selected.has(e.id)} disabled={!canWrite || !isSelectable(e)}
                            onChange={() => toggleOne(e.id)}
                            title={block?.text || ''} />
                        </td>
                        <td className={`${tdCls} sm:sticky`} style={{ borderColor: 'var(--hr-line)', left: stickyRefLeft, zIndex: 2, background: 'inherit', boxShadow: '4px 0 6px -4px rgba(35,48,56,0.14)' }}>
                          <div className="flex items-center whitespace-nowrap">
                            <input key={e.pcvNumber} defaultValue={e.pcvNumber} disabled={!!e.reimbursementId || !!e.paidAt || !canWrite}
                              className={`${cellCls} font-mono font-semibold flex-1 min-w-0`}
                              title="Reference number — edit to match your physical hard copy"
                              onBlur={ev => savePcv(e, ev.target.value)}
                              onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }} />
                            {(e.validity === 'Valid' || e.validity === 'Invalid') && <span className="text-[10px] pr-1 font-mono" style={{ color: 'var(--mid-gray)' }}>{e.validity === 'Valid' ? '-VAL' : '-INV'}</span>}
                            {!e.reimbursementId && !e.paidAt && canWrite && pcvBases.length > 0 && (
                              <select value="" title="Assign to a previous PCV number"
                                onChange={ev => { const s = ev.target.value; if (s) { if (confirm(`Assign this entry under ${pcvBases.find(b => String(b.seq) === s)?.label}?`)) assignPcv(e, Number(s)); ev.target.value = '' } }}
                                className="text-[10px] rounded border bg-white" style={{ borderColor: 'var(--hr-line)', color: 'var(--mid-gray)', maxWidth: 24 }}>
                                <option value="">⋯</option>
                                {pcvBases.filter(b => b.seq !== e.pcvSeq).map(b => <option key={b.seq} value={b.seq}>Assign to {b.label}</option>)}
                              </select>
                            )}
                          </div>
                          {rfpMode !== null && block?.kind === 'onRfp' && (
                            <div className="mt-0.5 inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis"
                              style={{ background: '#fef3c7', color: '#92400e' }} title={block.text}>
                              On {block.ref || 'an RFP'}
                            </div>
                          )}
                        </td>
                        {show('requestor') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
                            <select className={cellCls} value={e.requestor || ''} disabled={lk}
                              onChange={ev => saveField(e.id, { requestor: ev.target.value }, false)}>
                              <option value=""></option>
                              {requestors.map(r => <option key={r} value={r}>{r}</option>)}
                              {e.requestor && !requestors.includes(e.requestor) && <option value={e.requestor}>{e.requestor}</option>}
                            </select>
                          </td>
                        )}
                        {show('department') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
                            <DeptTagCell value={(e as unknown as { departments?: string[] }).departments || []} disabled={lk}
                              onSave={next => saveField(e.id, { departments: next } as unknown as Partial<Entry>, false)} />
                          </td>
                        )}
                        {show('pcfStatus') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
                            {e.pcfStatus === 'Replenished' ? (
                              <span className="inline-flex m-1 px-2.5 py-0.5 rounded-full whitespace-nowrap text-[11.5px] font-semibold"
                                style={{ background: pillOf('Replenished').bg, color: pillOf('Replenished').fg }}>Replenished</span>
                            ) : (
                              <select className="m-1 max-w-[calc(100%-0.5rem)] px-2 py-0.5 rounded-full text-[11.5px] font-semibold outline-none border border-transparent focus:border-[var(--teal)] disabled:opacity-100"
                                value={e.pcfStatus || ''} disabled={lk}
                                onChange={ev => saveField(e.id, { pcfStatus: ev.target.value }, false)}
                                style={{ background: pillOf(e.pcfStatus).bg, color: pillOf(e.pcfStatus).fg }}>
                                <option value="">—</option>
                                {PCF_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            )}
                          </td>
                        )}
                        {show('date') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
                            <input type="date" className={cellCls} disabled={lk}
                              value={e.date ? String(e.date).slice(0, 10) : ''}
                              onChange={ev => saveField(e.id, { date: ev.target.value }, false)} />
                          </td>
                        )}
                        {show('description') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
                            <input className={cellCls} disabled={lk} value={e.description || ''}
                              onChange={ev => patchLocal(e.id, { description: ev.target.value })}
                              onBlur={ev => saveField(e.id, { description: ev.target.value }, false)} />
                          </td>
                        )}
                        {show('descHub') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)', background: lk ? 'transparent' : 'var(--hr-head)' }}>
                            <span className="px-2 py-1.5 line-clamp-2" style={{ color: 'var(--mid-gray)' }} title={descForHub(e)}>{descForHub(e)}</span>
                          </td>
                        )}
                        {show('validity') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
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
                        )}
                        {show('vatable') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)', background: lk ? 'transparent' : (e.validity === 'Valid' ? '#fff' : '#f2f5ee') }}>
                            <select className={cellCls} value={vatLabel(e)} disabled={lk || e.validity !== 'Valid'}
                              onChange={ev => {
                                const v = ev.target.value
                                // Part VAT starts with the whole gross as the VAT part;
                                // type the VAT-inclusive amount in the box below.
                                if (v === PART_VAT) { saveField(e.id, { vatable: 'VAT', vatPortion: num(e.grossAmount) }, false); return }
                                const patch: Partial<Entry> = { vatable: v, vatPortion: null }
                                if (v !== 'VAT' && v !== 'Non-VAT') { patch.siNumber = null; patch.tinNumber = null }
                                saveField(e.id, patch, false)
                              }}>
                              <option value=""></option>
                              {VATABLE.map(v => <option key={v} value={v}>{v}</option>)}
                              <option value={PART_VAT}>{PART_VAT}</option>
                            </select>
                            {isMixedVat(e) && (
                              // Two aligned rows: labels on the left (one line each),
                              // the typed VAT part and the computed non-VAT part
                              // right-aligned in the same column.
                              <div className="grid grid-cols-[auto_1fr] items-center gap-x-1 px-1 pb-1 text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                                <span className="whitespace-nowrap">VAT part ₱</span>
                                <input type="number" step="0.01" className={`${cellCls} text-right`} disabled={lk}
                                  title="The VAT-inclusive amount bought from a VAT-registered seller. The rest of the gross is non-VAT."
                                  value={e.vatPortion == null ? '' : String(e.vatPortion)}
                                  onWheel={ev => ev.currentTarget.blur()}
                                  onChange={ev => patchLocal(e.id, { vatPortion: ev.target.value })}
                                  onBlur={ev => saveField(e.id, { vatPortion: Math.min(Math.abs(Number(ev.target.value) || 0), Math.abs(num(e.grossAmount))) }, false)} />
                                <span className="whitespace-nowrap">Non-VAT part ₱</span>
                                <span className="px-2 text-xs text-right">{peso(num(e.grossAmount) - vatBase(e))}</span>
                              </div>
                            )}
                          </td>
                        )}
                        {show('siNumber') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)', background: lk ? 'transparent' : (ve ? '#fff' : '#f2f5ee') }}>
                            <input className={cellCls} disabled={lk || !ve} value={e.siNumber || ''}
                              onChange={ev => patchLocal(e.id, { siNumber: ev.target.value })}
                              onBlur={ev => saveField(e.id, { siNumber: ev.target.value }, false)} />
                          </td>
                        )}
                        {show('tinNumber') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)', background: lk ? 'transparent' : (ve ? '#fff' : '#f2f5ee') }}>
                            <input className={cellCls} disabled={lk || !ve} value={e.tinNumber || ''} placeholder="XXX-XXX-XXX-XXXXX"
                              onChange={ev => patchLocal(e.id, { tinNumber: formatTin(ev.target.value) })}
                              onBlur={ev => saveField(e.id, { tinNumber: formatTin(ev.target.value) }, false)} />
                          </td>
                        )}
                        {show('tinNumber2') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)', background: lk ? 'transparent' : 'var(--hr-head)' }}>
                            <span className="px-2 py-1.5 block whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{tinNumber2(e.tinNumber)}</span>
                          </td>
                        )}
                        {show('branchCode') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)', background: lk ? 'transparent' : 'var(--hr-head)' }}>
                            <span className="px-2 py-1.5 block whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{branchCodeOf(e.tinNumber)}</span>
                          </td>
                        )}
                        {show('registeredName') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
                            <NameCombobox options={pickNames} hints={pickHints} disabled={lk} value={e.registeredName || ''}
                              className={cellCls} placeholder="Type or pick a supplier…"
                              onChange={v => patchLocal(e.id, { registeredName: v })}
                              onCommit={v => saveField(e.id, supplierPatch(v) as Partial<Entry>, false)} />
                          </td>
                        )}
                        {show('registeredAddress') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
                            <input className={cellCls} disabled={lk} value={e.registeredAddress || ''}
                              onChange={ev => patchLocal(e.id, { registeredAddress: ev.target.value })}
                              onBlur={ev => saveField(e.id, { registeredAddress: ev.target.value.trim().toUpperCase() }, false)} />
                          </td>
                        )}
                        {show('grossAmount') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
                            <input type="number" step="0.01" className={`${cellCls} text-right`} disabled={lk}
                              value={num(e.grossAmount) === 0 ? '' : String(e.grossAmount)}
                              onWheel={ev => ev.currentTarget.blur()}
                              onChange={ev => patchLocal(e.id, { grossAmount: ev.target.value })}
                              onBlur={ev => saveField(e.id, { grossAmount: Number(ev.target.value) || 0 }, false)} />
                          </td>
                        )}
                        {show('netOfVat') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)', background: lk ? 'transparent' : 'var(--hr-head)' }}>
                            <span className="px-2 py-1.5 block text-right" style={{ color: 'var(--mid-gray)' }}>{peso(netOfVat(e))}</span>
                          </td>
                        )}
                        {show('vatAmount') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)', background: lk ? 'transparent' : 'var(--hr-head)' }}>
                            <span className="px-2 py-1.5 block text-right" style={{ color: 'var(--mid-gray)' }}>{peso(vatAmount(e))}</span>
                          </td>
                        )}
                        {show('accountTitle') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
                            <AccountPicker accounts={coaAccounts} value={e.accountTitle || ''} valueKey="numberTitle"
                              disabled={lk} className={cellCls} placeholder="Type a number or a name…"
                              clearLabel="— Clear —"
                              onChange={v => {
                                if (e.assetAddedAt && v && !assetClassFromAccountTitle(v)
                                  && !confirm(`${refOf(e)} is in Asset Management. Changing it to ${v} removes its asset record from Asset Management (the cost becomes an expense). Continue?`)) return
                                saveField(e.id, { accountTitle: v }, false)
                              }} />
                            {/* Only tangible (depreciating PPE) classifications — not intangibles. */}
                            {(() => {
                              const ac = assetClassFromAccountTitle(e.accountTitle)
                              if (!canWrite || !ac || !isDepreciatingClassification(ac)) return null
                              return e.assetAddedAt ? (
                                // Already in the register: plain status, no button — re-adding
                                // created duplicate assets. Deleting the asset (or re-tagging the
                                // entry as an expense) releases the stamp and brings the button back.
                                <span title={`Added to Asset Management on ${String(e.assetAddedAt).slice(0, 10)}`}
                                  className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
                                  style={{ color: '#16a34a', background: '#f0fdf4' }}>
                                  <CheckCircle2 size={11} /> In Asset Management
                                </span>
                              ) : (
                                <button onClick={() => { setAssetForm({ name: e.description || '', accountableName: '', remarks: '', photoUrls: [], multi: false, quantity: '2', unitNames: [] , addTo: false, existingAssetId: '' }); setAssetPrompt(e) }} title="Add this asset to Asset Management"
                                  className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap"
                                  style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                                  <Plus size={11} /> Add to Asset Management
                                </button>
                              )
                            })()}
                            {canWrite && inventoryClassFromAccountTitle(e.accountTitle) && (
                              e.inventoryRecordedAt ? (
                                <button onClick={() => setInvReAddWarn(e)} title={`Already recorded in Inventory on ${String(e.inventoryRecordedAt).slice(0, 10)}`}
                                  className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap"
                                  style={{ borderColor: '#16a34a', color: '#16a34a', background: '#f0fdf4' }}>
                                  <CheckCircle2 size={11} /> Recorded in Inventory
                                </button>
                              ) : (
                                <button onClick={() => setInvPrompt(e)} title="Record this in Inventory & Procurement"
                                  className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap"
                                  style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                                  <Plus size={11} /> Record in Inventory
                                </button>
                              )
                            )}
                          </td>
                        )}
                        {branch === 'CEO' && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
                            <div className="px-1 py-1">
                              {ALLOC_BRANCHES.map(b => {
                                const checked = allocOf(e, b.value) !== undefined
                                // The last ticked branch takes whatever the others leave (lib/petty-cash-shares).
                                const fillsItself = checked && getAllocArr(e).at(-1)?.branch === b.value
                                return (
                                  <div key={b.value} className="flex items-center gap-1 mb-0.5">
                                    <label className="flex items-center gap-1 text-[11px]">
                                      <input type="checkbox" checked={checked} disabled={lk} onChange={() => toggleAlloc(e, b.value)} /> {b.label}
                                    </label>
                                    <input type="number" step="0.01" disabled={lk || !checked || fillsItself} placeholder="0"
                                      title={fillsItself ? 'Fills itself with the rest of the entry' : undefined}
                                      value={checked ? String(allocOf(e, b.value) ?? '') : ''}
                                      onWheel={ev => ev.currentTarget.blur()}
                                      onChange={ev => setAllocAmt(e, b.value, ev.target.value)}
                                      className="w-20 px-1 py-0.5 text-[11px] border rounded text-right" style={{ borderColor: 'var(--hr-line)', ...(fillsItself ? { background: 'var(--off-white)' } : {}) }} />
                                  </div>
                                )
                              })}
                              <div className="text-[10px] mt-0.5" style={{ color: Math.abs(allocSum(e) - num(e.grossAmount)) < 0.01 ? 'var(--mid-gray)' : '#dc2626' }}>
                                &Sigma; {peso(allocSum(e))} / {peso(num(e.grossAmount))}
                              </div>
                            </div>
                          </td>
                        )}
                        {show('proof') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
                            <div className="flex flex-col gap-1 px-1 py-1">
                              {proofsOf(e).map((url, i) => (
                                <div key={url} className="flex items-center gap-1 whitespace-nowrap">
                                  <a href={url} target="_blank" rel="noopener noreferrer" title="View proof"
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[11px]"
                                    style={{ borderColor: 'var(--hr-line)', color: 'var(--charcoal)' }}>
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
                                <ScanUpload compact section="petty-cash" prefix={e.pcvNumber}
                                  existingCount={proofsOf(e).length}
                                  label={proofsOf(e).length ? 'Add' : 'Upload'}
                                  onUploaded={url => appendProof(e.id, url)} />
                              )}
                            </div>
                          </td>
                        )}
                        {show('audited') && (
                          <td className={tdCls} style={{ borderColor: 'var(--hr-line)' }}>
                            <select className="m-1 px-2 py-0.5 rounded-full text-[11.5px] font-semibold outline-none border border-transparent focus:border-[var(--teal)] disabled:opacity-100"
                              value={e.audited ? 'Yes' : 'No'} disabled={!canAudit}
                              title={!canAudit ? 'Only an Accountant or Admin can change the audit status' : ''}
                              onChange={ev => setAudited(e.id, ev.target.value === 'Yes')}
                              style={e.audited ? { background: '#dcfce7', color: '#166534' } : { background: '#f1f5f2', color: '#55616A' }}>
                              <option value="No">No</option>
                              <option value="Yes">Yes</option>
                            </select>
                          </td>
                        )}
                        <td className="border-b px-1 text-center" style={{ borderColor: 'var(--hr-line)', position: 'sticky', right: 0, zIndex: 4, background: 'inherit', boxShadow: '-5px 0 6px -4px rgba(0,0,0,0.18)' }}>
                          {canWrite && !e.reimbursementId ? (
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
                              {!e.finalized && (
                                <button onClick={() => transferToOneTime(e)}
                                  title="Move this entry to One-Time Expense — it keeps its number and becomes RFP-payable from a bank account instead of the petty-cash float"
                                  className="p-1 rounded hover:bg-teal-50">
                                  <FileText size={13} style={{ color: 'var(--teal)' }} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-0.5 whitespace-nowrap">
                              {e.finalized && (
                                // Locked (in an RFP): keep the finalized ✓ visible as a read-only state.
                                <span title="Finalized · locked (in an RFP)" className="inline-flex p-1">
                                  <CheckCircle2 size={14} style={{ color: '#16a34a' }} />
                                </span>
                              )}
                              {canWrite && e.pcfStatus === 'Replenished' && e.reimbursementId && (
                                <button onClick={() => undoReplenishment(e)}
                                  title="Undo replenishment — the RFP that paid this batch goes back to unpaid and all its entries return to For Replenishment"
                                  className="p-1 rounded hover:bg-red-50">
                                  <RotateCcw size={13} style={{ color: '#b91c1c' }} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {displayed.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr style={{ background: 'var(--hr-head)' }}>
                      <td className="border-t-2" style={{ borderColor: 'var(--light-gray)', position: 'sticky', left: 0, zIndex: 3, background: 'var(--hr-head)' }} />
                      {visibleCols.map(c => (
                        <td key={c.key} className={`border-t-2 px-2 py-2 text-xs font-bold tabular-nums whitespace-nowrap ${c.key === 'refNumber' ? 'sm:sticky' : ''}`}
                          style={{
                            borderColor: 'var(--light-gray)', color: 'var(--charcoal)', textAlign: c.key === 'refNumber' ? 'left' : 'right',
                            ...(c.key === 'refNumber' ? { left: stickyRefLeft, zIndex: 3, background: 'var(--hr-head)', boxShadow: '4px 0 6px -4px rgba(35,48,56,0.14)' } : {}),
                          }}>
                          {c.key === 'refNumber' ? <>Total · {displayed.length.toLocaleString()} entr{displayed.length === 1 ? 'y' : 'ies'}</>
                            : c.key === 'grossAmount' ? `₱${peso(totalGross)}`
                            : c.key === 'netOfVat' ? peso(totalNet)
                            : c.key === 'vatAmount' ? peso(totalVat)
                            : null}
                        </td>
                      ))}
                      <td className="border-t-2" style={{ borderColor: 'var(--light-gray)', position: 'sticky', right: 0, zIndex: 3, background: 'var(--hr-head)' }} />
                    </tr>
                  </tfoot>
                )}
              </table>
              {/* Empty grid: a plain block under the header row is exactly as wide as the
                  visible area, so the message sits in the middle of what you can see
                  (inside the table it centred on the full 3,000px grid). Sticky keeps it
                  in place if the grid is scrolled sideways. */}
              {displayed.length === 0 && (
                <div className="sticky left-0 px-6 py-14 flex flex-col items-center text-center">
                {entries.length === 0 ? (
                  <>
                    <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>No entries yet</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                      {canWrite ? 'Add the first petty cash entry, or import the CSV/Excel template.' : `${BRANCH_NAMES[branch] || branch} has no petty cash entries.`}
                    </p>
                    {canWrite && (
                      <button onClick={() => setShowAddPopup(true)} className={`${primaryBtn} mt-4`} style={{ background: 'var(--teal)' }}>
                        <Plus size={15} /> Add entry
                      </button>
                    )}
                  </>
                ) : !showReplenished && !anyGridFilter && !searchQ && openCount === 0 ? (
                  <>
                    <span className="mx-auto mb-2.5 flex w-11 h-11 items-center justify-center rounded-full" style={{ background: '#ecfdf5', color: '#059669' }}>
                      <CheckCircle2 size={22} />
                    </span>
                    <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>All caught up</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                      Every one of the {entries.length.toLocaleString()} entries is replenished, so there is nothing open.
                    </p>
                    <button onClick={toggleShowReplenished} className={`${outlineBtn} mt-4`} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                      Show all {entries.length.toLocaleString()} entries
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>No entries match</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                      Nothing fits the search and column filters{hiddenMatches > 0 ? ` (${hiddenMatches} replenished ${hiddenMatches === 1 ? 'entry matches' : 'entries match'} but ${hiddenMatches === 1 ? 'is' : 'are'} hidden)` : ''}.
                    </p>
                    <button onClick={clearGridFilters} className={`${outlineBtn} mt-4`} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                      Clear filters
                    </button>
                  </>
                )}
                </div>
              )}
              </>
            )}
            </div>

            {/* ── Export (same files as before) ── */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
              <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>Export entries dated</span>
              <input type="date" value={dlFrom} onChange={e => setDlFrom(e.target.value)} aria-label="From"
                className="h-8 px-2 rounded-lg border bg-white text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} />
              <span>to</span>
              <input type="date" value={dlTo} onChange={e => setDlTo(e.target.value)} aria-label="To"
                className="h-8 px-2 rounded-lg border bg-white text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} />
              {(dlFrom || dlTo) && <button onClick={() => { setDlFrom(''); setDlTo('') }} className="underline">clear</button>}
              <span className="ml-auto tabular-nums">{dlCount.toLocaleString()} in range</span>
              <button onClick={() => exportEntries('xlsx')} className={ghostBtn} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                <FileDown size={14} style={{ color: '#166534' }} /> Excel
              </button>
              <button onClick={() => exportEntries('pdf')} className={ghostBtn} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                <FileDown size={14} style={{ color: '#b91c1c' }} /> PDF
              </button>
            </div>
          </section>

          {isCeo && <CeoPcfHistoryPanel />}
        </>
      )}

      {tab === 'reimbursements' && (
        <>
        <DownloadBar from={dlFrom} to={dlTo} onFrom={setDlFrom} onTo={setDlTo} onExport={exportReimb}
          dateLabel="RFP date" note={`${shownReimb.filter(r => inDateRange(r.createdAt, dlFrom, dlTo)).length} in range`} />
        <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <SortFilterHead cols={rfpCols} sortKey={rfpSort.key} sortDir={rfpSort.dir} filters={rfpFilters}
              onToggleSort={rfpToggleSort} onFilter={(k, v) => setRfpFilters(f => ({ ...f, [k]: v }))} trailing />
            <tbody>
              {shownReimb.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{r.refNumber}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{new Date(r.createdAt).toLocaleDateString('en-PH')}</td>
                  <td className="px-4 py-2.5">
                    {canWrite ? (
                      <input defaultValue={r.payableTo || ''} placeholder="Payable to…" onBlur={e => savePayableReimb(r, e.target.value)}
                        className="w-36 px-2 py-1 rounded border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
                    ) : <span className="text-xs" style={{ color: 'var(--charcoal)' }}>{r.payableTo || '—'}</span>}
                  </td>
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
                    <button onClick={() => openBillingVoucher(r)} title="Billing Voucher"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border mr-1"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                      <FileText size={13} /> BV
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
                <tr><td colSpan={8} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>
                  {reimbursements.length === 0 ? 'No RFPs yet. Click "RFP (Valid)" or "RFP (Invalid)", then select entries.' : 'No RFPs match the current filters.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {tab === 'cashcount' && (() => {
        const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.25, 0.10, 0.05, 0.01]
        const pcsOf = (d: number) => parseInt(cashBreakdown[String(d)] || '0', 10) || 0
        const cashCountTotal = DENOMS.reduce((s, d) => s + d * pcsOf(d), 0)
        const forReplTotal = entries.filter(e => e.pcfStatus === 'For Replenishment').reduce((s, e) => s + num(e.grossAmount), 0)
        const fund = num(fundAmount)
        const unliquidated = fund - cashCountTotal - forReplTotal
        // Explicit check: the unaccounted balance above should match the advances
        // actually documented as still Unliquidated in the entries. Any gap is a
        // real shortage (negative) or overage (positive).
        const trackedUnliquidated = entries.filter(e => e.pcfStatus === 'Unliquidated').reduce((s, e) => s + num(e.grossAmount), 0)
        const shortageOverage = trackedUnliquidated - unliquidated
        const setPcs = (d: number, v: string) => setCashBreakdown(prev => ({ ...prev, [String(d)]: v.replace(/[^0-9]/g, '') }))
        const ccPeso = (v: number) => (v < 0 ? `(${peso(Math.abs(v))})` : peso(v))
        const fundSet = fund !== 0
        return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Cash on hand" value={`₱${peso(cashCountTotal)}`} sub="Counted by denomination"
              tone={cashCountTotal ? 'green' : 'zero'} />
            <StatCard label="For replenishment" value={`₱${peso(forReplTotal)}`} sub="Spent, awaiting the RFP payment"
              tone={forReplTotal ? 'amber' : 'zero'} />
            <StatCard label="Unaccounted" value={`₱${ccPeso(unliquidated)}`} sub="Fund − cash count − for replenishment"
              tone={!fundSet ? 'zero' : unliquidated ? 'blue' : 'zero'} />
            <StatCard label="Shortage / overage" value={`₱${ccPeso(shortageOverage)}`}
              sub={!fundSet ? 'Enter the fund amount first' : shortageOverage === 0 ? 'Reconciles' : shortageOverage < 0 ? 'Shortage' : 'Overage'}
              tone={!fundSet || shortageOverage === 0 ? 'zero' : shortageOverage < 0 ? 'red' : 'green'} />
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* ── For Checking ── */}
          <section className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
              <ClipboardCheck size={16} style={{ color: 'var(--teal)' }} />
              <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>For Checking</h3>
            </div>
            <div className="px-4 py-3 text-sm">
              {([['Total Cash Count', cashCountTotal], ['For Replenishment', forReplTotal], ['Unliquidated (unaccounted)', unliquidated]] as [string, number][]).map(([label, val]) => (
                <div key={label} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--hr-line)' }}>
                  <span style={{ color: 'var(--charcoal)' }}>{label}</span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>{peso(val)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-2.5 mt-1">
                <span className="font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Total Petty Cash Fund</span>
                {canWrite ? (
                  <input value={fundAmount} onChange={e => setFundAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="30000"
                    className="w-36 h-9 px-3 rounded-lg border text-sm text-right font-semibold tabular-nums outline-none focus:border-[var(--teal)] focus:shadow-[0_0_0_3px_rgba(74,128,115,0.12)]"
                    style={{ borderColor: fundSet ? 'var(--light-gray)' : '#fcd34d', background: fundSet ? '#fff' : '#fffbeb' }} />
                ) : <span className="font-bold tabular-nums">{peso(fund)}</span>}
              </div>
              {!fundSet && (
                <p className="text-[11px] -mt-1 mb-1" style={{ color: '#b45309' }}>No fund amount is saved for this branch yet, so the check below is not meaningful.</p>
              )}
              <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>Unliquidated = Fund − Cash Count − For Replenishment (the unaccounted balance of the fund).</p>

              <div className="flex items-center justify-between py-2.5 mt-3 px-3 rounded-lg border-l-4"
                style={{
                  background: shortageOverage === 0 ? 'var(--hr-head)' : shortageOverage < 0 ? '#fef2f2' : '#ecfdf5',
                  borderLeftColor: shortageOverage === 0 ? 'var(--light-gray)' : shortageOverage < 0 ? '#dc2626' : '#059669',
                }}>
                <span className="font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Cash (Shortage)/Overage</span>
                <span className="font-bold tabular-nums" style={{ color: shortageOverage < 0 ? '#dc2626' : shortageOverage > 0 ? '#047857' : 'var(--mid-gray)' }}>
                  {shortageOverage < 0 ? `(${peso(Math.abs(shortageOverage))})` : peso(shortageOverage)}
                </span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>Check: documented unliquidated advances (₱{peso(trackedUnliquidated)}) − unaccounted balance. Negative = shortage, positive = overage, 0 = reconciles.</p>

              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-[.5px]" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>Money with staff — due to / from employee</h4>
                  {canWrite && <button onClick={() => setDueToFrom(p => [...p, { label: '', direction: 'TO', amount: '' }])} className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>+ Add row</button>}
                </div>
                {dueToFrom.length === 0 && <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No staff balances recorded.</p>}
                {dueToFrom.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    {canWrite ? (<>
                      <input value={d.label} onChange={e => setDueToFrom(p => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Name / dept" className="flex-1 min-w-0 h-8 px-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
                      <select value={d.direction} onChange={e => setDueToFrom(p => p.map((x, j) => j === i ? { ...x, direction: e.target.value as 'TO' | 'FROM' } : x))} className="h-8 px-1.5 rounded-lg border text-xs bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="TO">Due TO employee</option>
                        <option value="FROM">Due FROM employee</option>
                      </select>
                      <input value={d.amount} onChange={e => setDueToFrom(p => p.map((x, j) => j === i ? { ...x, amount: e.target.value.replace(/[^0-9.]/g, '') } : x))} placeholder="0.00" className="w-24 h-8 px-2 rounded-lg border text-xs text-right tabular-nums" style={{ borderColor: 'var(--light-gray)' }} />
                      <button onClick={() => setDueToFrom(p => p.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-red-50" title="Remove"><X size={14} style={{ color: '#dc2626' }} /></button>
                    </>) : (
                      <div className="flex items-center justify-between w-full text-xs">
                        <span style={{ color: 'var(--charcoal)' }}>{d.label} — DUE {d.direction} EMPLOYEE</span>
                        <span className="tabular-nums">{peso(num(d.amount))}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {canWrite && (
                <button onClick={saveCashCount} disabled={ccSaving} className={`${primaryBtn} mt-5 w-full justify-center`} style={{ background: 'var(--teal)' }}>
                  {ccSaving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save Cash Count'}
                </button>
              )}
            </div>
          </section>

          {/* ── Cash Breakdown ── */}
          <section className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
              <Banknote size={16} style={{ color: 'var(--teal)' }} />
              <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Cash Breakdown</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--hr-head)' }}>
                  {(['Denomination', 'pcs', 'Total'] as const).map((h, i) => (
                    <th key={h} className={`${i === 0 ? 'text-left px-4' : i === 1 ? 'text-right px-3' : 'text-right px-4'} py-2.5 text-[11px] font-bold uppercase tracking-[.5px] border-b`}
                      style={{ color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DENOMS.map(d => {
                  const pcs = pcsOf(d)
                  return (
                    <tr key={d} className="border-b" style={{ borderColor: 'var(--hr-line)' }}>
                      <td className="px-4 py-1.5 tabular-nums font-semibold" style={{ color: 'var(--charcoal)' }}>₱{d >= 1 ? d.toLocaleString('en-PH') : d.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right">
                        {canWrite ? (
                          <input value={cashBreakdown[String(d)] || ''} onChange={e => setPcs(d, e.target.value)} placeholder="0" inputMode="numeric"
                            className="w-20 h-8 px-2 rounded-lg border text-xs text-right tabular-nums outline-none focus:border-[var(--teal)]" style={{ borderColor: 'var(--light-gray)' }} />
                        ) : <span className="tabular-nums">{pcs || '—'}</span>}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: pcs ? 'var(--charcoal)' : 'var(--hr-faint)' }}>{pcs ? peso(d * pcs) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--hr-head)' }}>
                  <td className="px-4 py-3 font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }} colSpan={2}>Total Cash On Hand</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: 'var(--teal)' }}>{peso(cashCountTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        </div>
        </div>
        )
      })()}

      {tab === 'flowchart' && (
        <section className="rounded-lg border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
            <div>
              <h2 className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Petty Cash Workflow</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>From entry to reimbursement to the Expense Report.</p>
            </div>
            <span className="inline-flex items-center h-7 px-3 rounded-full text-xs font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
              For expenses less than or equal to ₱2,000.
            </span>
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {([
              { n: 1, title: 'Petty cash entry', who: 'Bookkeeper', desc: 'Encode entries in the Entries tab.' },
              { n: 2, title: 'Audited', who: 'Accountant', desc: 'Accountant reviews and sets Audited = Yes.' },
              { n: 3, title: 'Filed for RFP', who: 'Accountant', desc: 'Group audited entries via RFP (Valid) or RFP (Invalid).' },
              { n: 4, title: 'Print & submit for approval', who: '', desc: 'Print the petty cash / RFP report and submit it for approval.' },
              { n: 5, title: 'Mark as Paid', who: '', desc: 'Once reimbursed & replenished, open the RFP and click “Record as Paid”.' },
              { n: 6, title: 'Expense Report', who: '', desc: 'The paid entries appear in the Expense Report (Expenses section).' },
            ] as const).map(s => (
              <li key={s.n} className="relative flex items-start gap-3 rounded-lg border p-4" style={{ borderColor: 'var(--light-gray)', borderLeft: '4px solid var(--teal)', background: '#fff' }}>
                <span className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: 'var(--pale-teal)', color: 'var(--teal)', fontFamily: 'var(--font-display)' }}>{s.n}</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                    {s.title}
                    {s.who && <span className="px-2 py-0.5 rounded text-[11px] font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--teal)', fontFamily: 'var(--font-body)' }}>{s.who}</span>}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}


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

      {bvTarget && <BillingVoucherModal refNumber={bvTarget.refNumber} date={bvTarget.date} lines={bvTarget.lines} branch={bvTarget.branch} defaultBilledTo={bvTarget.defaultBilledTo} payment={bvTarget.payment} preparedBy={session?.user?.name || ''} onClose={() => setBvTarget(null)} />}

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

      {assetPrompt && (() => {
        const cls = assetClassFromAccountTitle(assetPrompt.accountTitle) || ''
        const vf = num(assetPrompt.grossAmount) ? netOfVat(assetPrompt) / num(assetPrompt.grossAmount) : 1
        const alloc = getAllocArr(assetPrompt).filter(a => a.branch && Number(a.amount) !== 0)
        const targets = alloc.length >= 1
          ? alloc.map(a => ({ branch: a.branch, price: Number(a.amount) * vf }))
          : [{ branch: assetPrompt.branch, price: num(assetPrompt.grossAmount) * vf }]
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setAssetPrompt(null)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Add to Asset Management?</h2>
              <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>
                This entry is classified as <strong>{cls} — {ASSET_CLASSIFICATION_LABELS[cls]}</strong>.
                {targets.length > 1 && ' It is split across branches, so one asset will be created per branch:'}
              </p>
              <div className="rounded-xl px-3 py-2 mb-4 text-sm space-y-1" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>
                {targets.map((t, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{BRANCHES.find(b => b.value === t.branch)?.label || t.branch}</span>
                    <span className="font-mono font-semibold">₱{peso(Math.round(t.price * 100) / 100)}</span>
                  </div>
                ))}
                <div className="text-xs pt-1" style={{ color: 'var(--mid-gray)' }}>Amounts are net of VAT · depreciation, supplier &amp; department are pre-filled · Control No. is auto-assigned.</div>
              </div>
              {targets.length === 1 && (
                <div className="flex rounded-xl p-1 mb-3 text-xs font-semibold" style={{ background: 'var(--off-white)' }}>
                  {[[false, 'New asset'], [true, 'Add to an existing asset']].map(([v, label]) => (
                    <button key={String(v)} type="button" onClick={() => setAssetForm(f => ({ ...f, addTo: v as boolean }))}
                      className="flex-1 py-1.5 rounded-lg" style={assetForm.addTo === v ? { background: 'white', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : { color: 'var(--mid-gray)' }}>
                      {label as string}
                    </button>
                  ))}
                </div>
              )}
              {assetForm.addTo && targets.length === 1 ? (
                <div className="mb-4">
                  <p className="text-xs mb-2" style={{ color: 'var(--mid-gray)' }}>
                    For a balance payment: the down payment made the asset, so this ₱{peso(Math.round(targets[0].price * 100) / 100)} is added to its cost and its depreciation covers the full price.
                  </p>
                  <ExistingAssetPicker branch={targets[0].branch} value={assetForm.existingAssetId} onChange={id => setAssetForm(f => ({ ...f, existingAssetId: id }))} />
                </div>
              ) : (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Asset name <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>— as it will show in Asset Management</span></label>
                  <input value={assetForm.name} onChange={ev => setAssetForm(f => ({ ...f, name: ev.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: 'var(--light-gray)' }}
                    placeholder={ASSET_CLASSIFICATION_LABELS[cls as keyof typeof ASSET_CLASSIFICATION_LABELS] || 'Asset name'} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Accountability <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>— staff accountable / custodian</span></label>
                  {!assetForm.multi && (
                    <NameCombobox value={assetForm.accountableName} onChange={v => setAssetForm(f => ({ ...f, accountableName: v }))} options={['Not Applicable', ...assetStaffNames]}
                      className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: 'var(--light-gray)' }} placeholder="Type or pick a staff name…" />
                  )}
                  {/* Per-piece custody only fits a single-branch entry — a CEO allocation
                      already becomes one asset per branch. */}
                  {targets.length === 1 && (
                    <label className="flex items-center gap-2 text-xs mt-2 cursor-pointer" style={{ color: 'var(--charcoal)' }}>
                      <input type="checkbox" checked={assetForm.multi}
                        onChange={ev => setAssetForm(f => ({ ...f, multi: ev.target.checked }))} />
                      More than 1 item — each piece gets a sub control number (-01, -02, …) and its own custodian
                    </label>
                  )}
                  {assetForm.multi && targets.length === 1 && (() => {
                    const qty = Math.max(1, Math.min(200, parseInt(assetForm.quantity) || 1))
                    return (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>How many items?</span>
                          <input type="number" min={1} max={200} value={assetForm.quantity}
                            onChange={ev => setAssetForm(f => ({ ...f, quantity: ev.target.value }))}
                            className="w-20 border rounded-lg px-2.5 py-1.5 text-sm" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        {/* One custodian for every piece (Hannah, 2026-11-01). */}
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--charcoal)' }}>
                          <input type="checkbox" checked={!!assetForm.sameAll} onChange={ev => setAssetForm(f => ({ ...f, sameAll: ev.target.checked }))} />
                          Same person for all {qty} items
                        </label>
                        {assetForm.sameAll ? (
                          <NameCombobox value={assetForm.accountableName} onChange={v => setAssetForm(f => ({ ...f, accountableName: v }))} options={['Not Applicable', ...assetStaffNames]}
                            className="w-full border rounded-lg px-2.5 py-1.5 text-sm" style={{ borderColor: 'var(--light-gray)' }} placeholder="Staff accountable for every piece…" />
                        ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                          {Array.from({ length: qty }, (_, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="w-9 shrink-0 font-mono text-[11px]" style={{ color: 'var(--mid-gray)' }}>-{String(i + 1).padStart(2, '0')}</span>
                              <NameCombobox value={assetForm.unitNames[i] ?? ''} options={['Not Applicable', ...assetStaffNames]}
                                onChange={v => setAssetForm(f => {
                                  const unitNames = [...f.unitNames]
                                  while (unitNames.length < qty) unitNames.push('')
                                  unitNames[i] = v
                                  return { ...f, unitNames }
                                })}
                                className="flex-1 border rounded-lg px-2.5 py-1.5 text-sm" style={{ borderColor: 'var(--light-gray)' }}
                                placeholder="Staff accountable for this piece…" />
                            </div>
                          ))}
                        </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Remarks</label>
                  <textarea value={assetForm.remarks} onChange={ev => setAssetForm(f => ({ ...f, remarks: ev.target.value }))} rows={2}
                    className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: 'var(--light-gray)' }} placeholder="Condition, location, serial no.…" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Photos <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>— first is the main photo</span></label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {assetForm.photoUrls.map(url => (
                      <div key={url} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-12 h-12 object-cover rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                        <button onClick={() => setAssetForm(f => ({ ...f, photoUrls: f.photoUrls.filter(u => u !== url) }))} title="Remove"
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">×</button>
                      </div>
                    ))}
                    <ScanUpload compact section="asset" prefix={assetPrompt.pcvNumber || 'ASSET'} existingCount={assetForm.photoUrls.length}
                      label="Add photo" onUploaded={url => setAssetForm(f => ({ ...f, photoUrls: [...f.photoUrls, url] }))} />
                  </div>
                </div>
              </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setAssetPrompt(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>No, skip</button>
                <button onClick={confirmAddAsset} disabled={assetBusy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                  {assetBusy ? 'Saving…' : assetForm.addTo && targets.length === 1 ? 'Add to this asset' : `Yes, create ${targets.length > 1 ? `${targets.length} assets` : 'asset'}`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {assetResult && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setAssetResult(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <CheckCircle2 size={32} className="mx-auto mb-2" style={{ color: 'var(--teal)' }} />
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Added to Asset Management</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>{assetResult.addedTo ? `Added ₱${peso(assetResult.addedTo.added)} to ${assetResult.addedTo.controlNumber || ''} ${assetResult.addedTo.name} — its cost is now ₱${peso(assetResult.addedTo.totalAmount)}.` : `Created ${assetResult.count} asset record${assetResult.count === 1 ? '' : 's'}. Review or add photos in Asset Management.`}</p>
            <div className="flex gap-2">
              <button onClick={() => setAssetResult(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Close</button>
              <a href="/asset-management" className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white text-center" style={{ background: 'var(--teal)' }}>Go to Asset Management</a>
            </div>
          </div>
        </div>
      )}

      {assetReAddWarn && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setAssetReAddWarn(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1" style={{ color: '#b45309' }}>Already added</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>
              This entry was already added to Asset Management on <strong>{String(assetReAddWarn.assetAddedAt).slice(0, 10)}</strong>. Adding it again will create <strong>another</strong> asset record. Are you sure?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setAssetReAddWarn(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
              <button onClick={() => { const e = assetReAddWarn; setAssetReAddWarn(null); setAssetForm({ name: e?.description || '', accountableName: '', remarks: '', photoUrls: [], multi: false, quantity: '2', unitNames: [] , addTo: false, existingAssetId: '' }); setAssetPrompt(e) }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#dc2626' }}>Add again</button>
            </div>
          </div>
        </div>
      )}

      {invReAddWarn && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setInvReAddWarn(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1" style={{ color: '#b45309' }}>Already recorded</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>
              This entry was already recorded in Inventory &amp; Procurement on <strong>{String(invReAddWarn.inventoryRecordedAt).slice(0, 10)}</strong>. Recording it again may create a <strong>duplicate</strong> item or stock movement. Are you sure?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setInvReAddWarn(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
              <button onClick={() => { const e = invReAddWarn; setInvReAddWarn(null); setInvPrompt(e) }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#dc2626' }}>Record again</button>
            </div>
          </div>
        </div>
      )}

      {invPrompt && (() => {
        const cls = inventoryClassFromAccountTitle(invPrompt.accountTitle) || ''
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setInvPrompt(null)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Record in Inventory &amp; Procurement?</h2>
              <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>
                This entry is classified as <strong>{cls} — {INVENTORY_CLASSIFICATION_LABELS[cls]}</strong>. It stays in the replenishment total here; recording it in Inventory keeps the item count correct, with no double-count on the Balance Sheet.
              </p>
              <div className="rounded-xl px-3 py-2 mb-4 text-sm" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>
                <div className="font-semibold">{invPrompt.description || '—'}</div>
                <div className="text-xs" style={{ color: 'var(--mid-gray)' }}>₱{peso(num(invPrompt.grossAmount))} · {BRANCHES.find(b => b.value === invPrompt.branch)?.label || invPrompt.branch}</div>
              </div>
              <div className="space-y-2">
                <button onClick={() => goToInventory(invPrompt, 'create')} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>New item → create in Inventory &amp; Procurement</button>
                <button onClick={() => goToInventory(invPrompt, 'adjust')} className="w-full py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>Replenishment → record a stock Adjustment</button>
                <button onClick={() => goToInventory(invPrompt, 'freight')} className="w-full py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>Freight Forwarder Cost (Capitalized)</button>
                <button onClick={() => setInvPrompt(null)} className="w-full py-2 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Skip</button>
              </div>
            </div>
          </div>
        )
      })()}
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
  // Draft insurance: everything typed here is kept in sessionStorage per RFP,
  // so accidentally closing the modal or leaving the page never costs the
  // half-filled form. Cleared only on a successful submit.
  const draftKey = `pc-rfp-pay-draft:${report.id}`
  const draft: Record<string, string> | null = (() => {
    try { return JSON.parse(sessionStorage.getItem(draftKey) || 'null') } catch { return null }
  })()
  const [debit, setDebit] = useState(draft?.debit ?? (report.debitAccount || ''))
  const [deposit, setDeposit] = useState(draft?.deposit ?? (report.depositAccount || ''))
  const [datePaid, setDatePaid] = useState(draft?.datePaid ?? (report.paidAt ? String(report.paidAt).slice(0, 10) : new Date().toISOString().slice(0, 10)))
  const [paymentMethod, setPaymentMethod] = useState(draft?.paymentMethod ?? (report.paymentMethod || ''))
  const [checkNumber, setCheckNumber] = useState(draft?.checkNumber ?? (report.checkNumber || ''))
  const [transferRef, setTransferRef] = useState(draft?.transferRef ?? (report.transferRef || ''))
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ debit, deposit, datePaid, paymentMethod, checkNumber, transferRef })) } catch { /* storage unavailable */ }
  }, [draftKey, debit, deposit, datePaid, paymentMethod, checkNumber, transferRef])
  const isCheck = paymentMethod === 'Check deposit' || paymentMethod === 'Check encashment to deposit as cash'
  const isTransfer = paymentMethod === 'Online Fund Transfer'
  const submit = async () => {
    if (!datePaid) { alert('Enter the Date Paid.'); return }
    if (!paymentMethod) { alert('Select a Payment Method.'); return }
    if (isCheck && !checkNumber.trim()) { alert('Enter the Check Number.'); return }
    if (isTransfer && !transferRef.trim()) { alert('Enter the transfer Reference Number.'); return }
    if (!debit || !deposit) { alert('Select both the debit (from) and deposit (to) accounts.'); return }
    setSaving(true)
    try {
      await onPay(report, debit, deposit, file, datePaid, paymentMethod, isCheck ? checkNumber.trim() : '', isTransfer ? transferRef.trim() : '')
      try { sessionStorage.removeItem(draftKey) } catch { /* ignore */ }
      onClose()
    } catch { /* handled in onPay */ }
    setSaving(false)
  }
  return (
    // No backdrop-close: a stray click outside must not throw away a half-filled form.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
            <input type="text" inputMode="numeric" value={checkNumber} onChange={e => setCheckNumber(toChequeInput(e.target.value))}
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
        <input list="pc-deposit-bank-accounts" value={deposit} onChange={e => setDeposit(e.target.value)}
          placeholder="Select a company account or type any external account"
          className="w-full px-3 py-2 rounded-xl border text-sm mb-1" style={{ borderColor: 'var(--light-gray)' }} />
        <datalist id="pc-deposit-bank-accounts">{bankOptions.map(a => <option key={a} value={a} />)}</datalist>
        <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Pick one of our accounts from the list, or type the payee&apos;s / any bank account not in the chart of accounts.</p>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Proof of deposit (image / PDF)</label>
        <label className="flex items-center gap-2 cursor-pointer mb-1">
          <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
            <Upload size={13} /> Choose File
          </span>
          <span className="text-xs truncate" style={{ color: 'var(--mid-gray)', maxWidth: 220 }}>{file ? file.name : (report.proofUrl ? 'Current proof kept' : 'No file chosen')}</span>
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>
        <p className="text-[11px] mb-4" style={{ color: 'var(--mid-gray)' }}>{report.proofUrl ? 'A proof is already attached — choose a new file to replace it. ' : 'Optional, but recommended. '}Max 30MB.</p>

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


/* ── Past PCF (CEO) — the fund before it lived in the Hub ──────────────
   Amounts were advanced to the CEO, spent across branches, and replenished
   not-to-the-peso, so the RFP model cannot hold it. This register shows that
   history verbatim from the interbranch monitoring workbook: read-only and
   ledger-neutral, because QuickBooks already carried the expense side. */
function CeoPcfHistoryPanel() {
  const [rows, setRows] = useState<{ id: string; branch: string; date: string; particulars: string; receivedBy: string | null; cashIn: number; cashOut: number; remarks: string | null; qbRecorded: boolean; qbRef: string | null; running: number }[]>([])
  const [totals, setTotals] = useState<{ inn: number; out: number; rows: number; unrecorded: number } | null>(null)
  const [histBranch, setHistBranch] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/petty-cash/ceo-history?branch=${encodeURIComponent(histBranch)}`)
      .then(r => r.ok ? r.json() : { rows: [], totals: null })
      .then(d => { setRows(d.rows || []); setTotals(d.totals || null) })
      .finally(() => setLoading(false))
  }, [open, histBranch])
  const peso = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
          Past PCF (historical fund) {totals ? `— ₱${peso(totals.inn)} received · ₱${peso(totals.out)} spent · ${totals.rows.toLocaleString()} entries` : ''}
        </span>
        <span className="text-xs" style={{ color: 'var(--teal)' }}>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            The CEO fund before it lived in the Hub: advances in, spending out, replenished not-to-the-peso.
            Read-only and ledger-neutral — QuickBooks already carried these expenses; this is the fund&apos;s own story.
            {totals && totals.unrecorded > 0 && <> <strong style={{ color: '#b45309' }}>{totals.unrecorded} spend entr{totals.unrecorded === 1 ? 'y' : 'ies'} were never marked as recorded in QB</strong> — worth a look.</>}
          </p>
          <div className="flex gap-2">
            {['', 'East', 'Greenhills', 'Verdana'].map(b => (
              <button key={b || 'all'} onClick={() => setHistBranch(b)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                style={histBranch === b ? { background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' } : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                {b || 'All branches'}
              </button>
            ))}
          </div>
          {loading ? <div className="py-6 text-center"><Loader2 size={18} className="animate-spin inline" /></div> : (
            <div className="rounded-xl border overflow-auto" style={{ borderColor: 'var(--light-gray)', maxHeight: 420 }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="sticky top-0" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                    {['Date', 'Branch', 'Particulars', 'Received by', 'In', 'Out', 'Running', 'QB'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{r.date}</td>
                      <td className="px-3 py-1.5">{branchShort(r.branch)}</td>
                      <td className="px-3 py-1.5 max-w-md truncate" style={{ color: 'var(--charcoal)' }} title={r.particulars}>{r.particulars}</td>
                      <td className="px-3 py-1.5">{r.receivedBy}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: r.cashIn ? '#166534' : 'var(--light-gray)' }}>{r.cashIn ? peso(r.cashIn) : ''}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.cashOut ? peso(r.cashOut) : ''}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: 'var(--mid-gray)' }}>{peso(r.running)}</td>
                      <td className="px-3 py-1.5">{r.qbRecorded ? <span title={r.qbRef || 'Recorded in QuickBooks'} style={{ color: '#166534' }}>✓</span> : <span title="Not marked as recorded" style={{ color: '#b45309' }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
