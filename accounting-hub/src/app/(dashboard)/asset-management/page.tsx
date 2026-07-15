'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { ScanUpload } from '@/components/ScanUpload'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  Building2,
  FileText,
  Settings2,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
  Image as ImageIcon,
  Printer,
  FileDown,
  ClipboardCheck,
  CheckCircle2,
  Lock,
} from 'lucide-react'
import { downloadXlsx, downloadPdf } from '@/lib/export'

// ── Types ─────────────────────────────────────────────────────

interface Supplier {
  id: string
  supplierName: string
}

interface Asset {
  id: string
  branch: string
  name: string
  purchasePrice: number
  quantity: number
  totalAmount: number
  dateBought: string
  classification: string
  yearsDepreciation: number
  monthlyDepreciation: number
  depreciationEndDate: string
  supplierId: string | null
  supplier: { id: string; supplierName: string } | null
  sourceAccountId: string | null
  photoUrl: string | null
  photoUrls: string[] | null
  isDefective: boolean
  departments: string[]
  utilized: boolean
  controlNumber: string | null
  accountableName: string | null
  remarks: string | null
  createdById: string
  createdBy: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

// ── Constants ─────────────────────────────────────────────────

const BRANCH_OPTIONS = [
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
]

const CLASSIFICATION_OPTIONS = [
  { value: '2020', label: '2020 — Buildings' },
  { value: '2030', label: '2030 — Clinic Appliances' },
  { value: '2040', label: '2040 — Educational Toys, Books, and Others' },
  { value: '2050', label: '2050 — Furniture and Fixtures' },
  { value: '2060', label: '2060 — Office Equipment and Electronic Devices' },
  { value: '2070', label: '2070 — PPE and Lease Improvements' },
  { value: '2080', label: '2080 — Therapy Equipment' },
  { value: '2090', label: '2090 — Treatment and Assessment Tools' },
  { value: '2100', label: '2100 — Vehicles' },
  // Non-depreciating (intangibles + other non-current assets)
  { value: '3010', label: '3010 — Goodwill (not depreciated)' },
  { value: '3020', label: '3020 — Trademark (not depreciated)' },
  { value: '3110', label: '3110 — Security Deposit (not depreciated)' },
  { value: '3120', label: '3120 — SEC Registration (not depreciated)' },
  { value: '3130', label: '3130 — Construction Bond (not depreciated)' },
]

// Classifications that do NOT depreciate — carried at cost on the Balance Sheet.
const NON_DEPRECIATING = new Set(['3010', '3020', '3110', '3120', '3130'])
const isDepreciating = (code: string) => !!code && !NON_DEPRECIATING.has(code)

const DEPRECIATION_YEARS = [3, 5, 10]

const DEPARTMENT_OPTIONS = [
  'Admin',
  'Physical Therapy',
  'Occupational Therapy',
  'Speech-Language Pathology',
  'Special Education',
  'Orthosis & Prosthesis',
  'Psychology',
  'Medical Doctor',
]

// Front-desk can add/edit assets (photos, renaming); delete + audits stay with accounting.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const MANAGE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// ── Helpers ───────────────────────────────────────────────────

function formatCurrency(value: number) {
  return Number(value).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
}

function formatEndDate(dateStr: string) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

function formatDateInput(dateStr: string) {
  if (!dateStr) return ''
  return dateStr.substring(0, 10)
}

function branchLabel(branch: string) {
  return BRANCH_OPTIONS.find((b) => b.value === branch)?.label ?? branch
}

function classificationLabel(code: string) {
  return CLASSIFICATION_OPTIONS.find((c) => c.value === code)?.label ?? code
}

function computeEndDate(dateBought: string, years: number): string {
  if (!dateBought || !years) return ''
  const d = new Date(dateBought)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString()
}

// ── Empty form ────────────────────────────────────────────────

function emptyForm(branch: string) {
  return {
    branch,
    name: '',
    purchasePrice: '',
    quantity: '1',
    dateBought: '',
    classification: '',
    yearsDepreciation: '5',
    supplierId: '',
    sourceAccountId: '',
    photoUrl: '',
    photoUrls: [] as string[],
    isDefective: false,
    departments: [] as string[],
    utilized: true,
    controlNumber: '',
    accountableName: '',
    remarks: '',
  }
}

// ── Page ──────────────────────────────────────────────────────

export default function AssetManagementPage() {
  const { data: session, status } = useSession()

  const userRole = session?.user?.role as string
  const isBranchRestricted = ['AHEA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_ADMIN', 'AHGH_FRONTDESK', 'VERDANA_ADMIN'].includes(userRole)
  const userBranch = userRole?.includes('SBEA')
    ? 'SANDBOX_EAST'
    : userRole?.includes('SBGH')
    ? 'SANDBOX_GREENHILLS'
    : userRole?.includes('VERDANA')
    ? 'VERDANA_STORE'
    : ''

  const canWrite = WRITE_ROLES.includes(userRole)
  const canManage = MANAGE_ROLES.includes(userRole) // delete assets + run audits

  // ── State ───────────────────────────────────────────────────
  const [assets, setAssets] = useState<Asset[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [banks, setBanks] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [branchFilter, setBranchFilter] = useState(isBranchRestricted ? userBranch : '')

  const [showModal, setShowModal] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [form, setForm] = useState(emptyForm(isBranchRestricted ? userBranch : 'SANDBOX_EAST'))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  // HR-Hub staff names for the Accountability typeahead (loaded when the form's branch is known).
  const [staffNames, setStaffNames] = useState<string[]>([])
  useEffect(() => {
    if (!showModal) return
    const b = form.branch === 'SANDBOX_EAST' ? 'SBEA' : form.branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : form.branch === 'VERDANA_STORE' ? 'VERDANA' : ''
    fetch(`/api/pos/staff${b ? `?branch=${b}` : ''}`).then(r => r.ok ? r.json() : [])
      .then((d: unknown) => {
        const list = (Array.isArray(d) ? d : ((d as { staff?: unknown[] })?.staff ?? [])) as { name?: string }[]
        setStaffNames([...new Set(list.map(s => s.name || '').filter(Boolean))])
      })
      .catch(() => setStaffNames([]))
  }, [showModal, form.branch])

  // Photo upload
  const [uploading, setUploading] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFilename, setPhotoFilename] = useState('')

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Supplier search
  const [supplierSearch, setSupplierSearch] = useState('')

  // Search & sort & column filters
  const [search, setSearch] = useState('')
  type SortKey = 'name' | 'classification' | 'branch' | 'totalAmount' | 'monthlyDepreciation' | 'depreciationEndDate' | 'utilized' | 'controlNumber'
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  type ColFilters = {
    name: string; classification: string; branch: string; utilized: string;
  }
  const [colFilters, setColFilters] = useState<ColFilters>({ name: '', classification: '', branch: '', utilized: '' })
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null)

  // Depreciation defaults (classification → years)
  const [depDefaults, setDepDefaults] = useState<Record<string, number>>({})
  const [showDepSettings, setShowDepSettings] = useState(false)
  const [depSettingsForm, setDepSettingsForm] = useState<Record<string, number>>({})
  const [savingDepSettings, setSavingDepSettings] = useState(false)

  // Lightbox + photo gallery
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [galleryAsset, setGalleryAsset] = useState<Asset | null>(null)
  const [tab, setTab] = useState<'assets' | 'audit' | 'flowchart'>('assets')
  const photosOf = (a: Asset): string[] => {
    const arr = Array.isArray(a.photoUrls) ? a.photoUrls : []
    if (arr.length) return arr
    return a.photoUrl ? [a.photoUrl] : []
  }

  // ── Auth guard ───────────────────────────────────────────────
  if (status === 'unauthenticated') redirect('/login')

  // ── Derived computed values ──────────────────────────────────
  const purchasePriceNum = parseFloat(form.purchasePrice) || 0
  const quantityNum = parseInt(form.quantity) || 1
  const totalAmount = purchasePriceNum * quantityNum
  const noDep = !isDepreciating(form.classification)
  const yearsNum = noDep ? 0 : (parseInt(form.yearsDepreciation) || 5)
  const monthlyDepreciation = (!noDep && totalAmount > 0) ? totalAmount / (yearsNum * 12) : 0
  const depreciationEndDate = noDep ? (form.dateBought || '') : (form.dateBought ? computeEndDate(form.dateBought, yearsNum) : '')

  // ── Data fetching ────────────────────────────────────────────
  const fetchAssets = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (!isBranchRestricted && branchFilter) params.set('branch', branchFilter)
      const res = await fetch(`/api/assets?${params}`)
      if (!res.ok) throw new Error('Failed to load assets')
      const data = await res.json()
      setAssets(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }, [branchFilter, isBranchRestricted])

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers?all=true')
      if (!res.ok) return
      const data = await res.json()
      setSuppliers(data)
    } catch {
      // non-critical
    }
  }, [])

  const fetchDepDefaults = useCallback(async () => {
    try {
      const res = await fetch('/api/assets/depreciation-defaults')
      if (!res.ok) return
      const data = await res.json()
      setDepDefaults(data)
    } catch {
      // non-critical
    }
  }, [])

  const fetchBanks = useCallback(async () => {
    try {
      const res = await fetch('/api/bank-accounts')
      if (res.ok) setBanks(await res.json())
    } catch { /* non-critical */ }
  }, [])
  useEffect(() => { fetchBanks() }, [fetchBanks])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchAssets()
      fetchSuppliers()
      fetchDepDefaults()
    }
  }, [status, fetchAssets, fetchSuppliers, fetchDepDefaults])

  // ── Modal helpers ────────────────────────────────────────────
  function openAdd() {
    setEditingAsset(null)
    const defaultBranch = isBranchRestricted ? userBranch : 'SANDBOX_EAST'
    setForm(emptyForm(defaultBranch))
    setPhotoPreview(null)
    setPhotoFilename('')
    setFormError('')
    setShowModal(true)
  }

  function openEdit(asset: Asset) {
    setEditingAsset(asset)
    setForm({
      branch: asset.branch,
      name: asset.name,
      purchasePrice: String(asset.purchasePrice),
      quantity: String(asset.quantity),
      dateBought: formatDateInput(asset.dateBought),
      classification: asset.classification,
      yearsDepreciation: String(asset.yearsDepreciation),
      supplierId: asset.supplierId ?? '',
      sourceAccountId: asset.sourceAccountId ?? '',
      photoUrl: asset.photoUrl ?? '',
      photoUrls: Array.isArray(asset.photoUrls) ? asset.photoUrls : (asset.photoUrl ? [asset.photoUrl] : []),
      isDefective: !!asset.isDefective,
      departments: Array.isArray(asset.departments) ? (asset.departments as string[]) : [],
      utilized: asset.utilized,
      controlNumber: asset.controlNumber ?? '',
      accountableName: asset.accountableName ?? '',
      remarks: asset.remarks ?? '',
    })
    if (asset.photoUrl) {
      const isImage = /\.(jpg|jpeg|png|webp)$/i.test(asset.photoUrl)
      setPhotoPreview(isImage ? asset.photoUrl : null)
      setPhotoFilename(asset.photoUrl.split('/').pop() ?? '')
    } else {
      setPhotoPreview(null)
      setPhotoFilename('')
    }
    setFormError('')
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingAsset(null)
    setFormError('')
  }

  // ── Photo upload ─────────────────────────────────────────────
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json()
        setFormError(err.error ?? 'Upload failed')
        return
      }
      const data = await res.json()
      setForm((f) => ({ ...f, photoUrl: data.url }))
      setPhotoFilename(data.filename)
      const isImage = /\.(jpg|jpeg|png|webp)$/i.test(data.url)
      setPhotoPreview(isImage ? data.url : null)
    } catch {
      setFormError('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function removePhoto() {
    setForm((f) => ({ ...f, photoUrl: '' }))
    setPhotoPreview(null)
    setPhotoFilename('')
  }

  // ── Department toggle ────────────────────────────────────────
  function toggleDepartment(dept: string) {
    setForm((f) => ({
      ...f,
      departments: f.departments.includes(dept)
        ? f.departments.filter((d) => d !== dept)
        : [...f.departments, dept],
    }))
  }

  // ── Classification change → auto-fill depreciation years ────
  function handleClassificationChange(value: string) {
    const defaultYears = depDefaults[value]
    setForm((f) => ({
      ...f,
      classification: value,
      ...(defaultYears ? { yearsDepreciation: String(defaultYears) } : {}),
    }))
  }

  // ── Depreciation Settings modal ──────────────────────────────
  function openDepSettings() {
    // Pre-fill form with current defaults
    const initial: Record<string, number> = {}
    for (const c of CLASSIFICATION_OPTIONS) {
      initial[c.value] = depDefaults[c.value] ?? 5
    }
    setDepSettingsForm(initial)
    setShowDepSettings(true)
  }

  async function saveDepSettings() {
    setSavingDepSettings(true)
    try {
      const res = await fetch('/api/assets/depreciation-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(depSettingsForm),
      })
      if (!res.ok) throw new Error('Failed to save')
      const updated = await res.json()
      setDepDefaults(updated)
      setShowDepSettings(false)
    } catch {
      // non-critical — keep modal open
    } finally {
      setSavingDepSettings(false)
    }
  }

  // ── Save ─────────────────────────────────────────────────────
  async function handleSave() {
    setFormError('')
    if (!form.name.trim()) { setFormError('Asset Name is required'); return }
    if (!form.branch) { setFormError('Branch is required'); return }
    if (!purchasePriceNum || purchasePriceNum <= 0) { setFormError('Purchase price must be > 0'); return }
    if (!form.dateBought) { setFormError('Date Bought is required'); return }
    if (!form.classification) { setFormError('Classification is required'); return }

    setSaving(true)
    try {
      const payload = {
        branch: form.branch,
        name: form.name.trim(),
        purchasePrice: purchasePriceNum,
        quantity: quantityNum,
        totalAmount,
        dateBought: form.dateBought,
        classification: form.classification,
        yearsDepreciation: yearsNum,
        monthlyDepreciation,
        depreciationEndDate,
        supplierId: form.supplierId || null,
        sourceAccountId: form.sourceAccountId || null,
        photoUrl: form.photoUrls[0] || form.photoUrl || null,
        photoUrls: form.photoUrls,
        isDefective: form.isDefective,
        departments: form.departments,
        utilized: form.utilized,
        accountableName: form.accountableName.trim() || null,
        remarks: form.remarks.trim() || null,
      }

      const url = editingAsset ? `/api/assets?id=${editingAsset.id}` : '/api/assets'
      const method = editingAsset ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        setFormError(err.error ?? 'Save failed')
        return
      }
      closeModal()
      fetchAssets()
    } catch {
      setFormError('Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/assets?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error ?? 'Delete failed')
        return
      }
      setConfirmDeleteId(null)
      fetchAssets()
    } catch {
      setError('Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Filtered suppliers ────────────────────────────────────────
  const filteredSuppliers = supplierSearch
    ? suppliers.filter((s) => s.supplierName.toLowerCase().includes(supplierSearch.toLowerCase()))
    : suppliers

  // ── Sort + filter helpers ─────────────────────────────────────
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
    setOpenFilterCol(null)
  }

  const displayedAssets = assets
    .filter((a) => {
      const q = search.toLowerCase()
      if (q && ![a.name, a.classification, classificationLabel(a.classification), branchLabel(a.branch), a.controlNumber ?? '', a.remarks ?? ''].some((v) => v.toLowerCase().includes(q))) return false
      if (colFilters.name && !a.name.toLowerCase().includes(colFilters.name.toLowerCase())) return false
      if (colFilters.classification && a.classification !== colFilters.classification) return false
      if (colFilters.branch && a.branch !== colFilters.branch) return false
      if (colFilters.utilized === 'yes' && !a.utilized) return false
      if (colFilters.utilized === 'no' && a.utilized) return false
      return true
    })
    .sort((a, b) => {
      let av: string | number = '', bv: string | number = ''
      if (sortKey === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase() }
      else if (sortKey === 'classification') { av = a.classification; bv = b.classification }
      else if (sortKey === 'branch') { av = a.branch; bv = b.branch }
      else if (sortKey === 'totalAmount') { av = a.totalAmount; bv = b.totalAmount }
      else if (sortKey === 'monthlyDepreciation') { av = a.monthlyDepreciation; bv = b.monthlyDepreciation }
      else if (sortKey === 'depreciationEndDate') { av = a.depreciationEndDate; bv = b.depreciationEndDate }
      else if (sortKey === 'utilized') { av = a.utilized ? 1 : 0; bv = b.utilized ? 1 : 0 }
      else if (sortKey === 'controlNumber') { av = (a.controlNumber ?? '').toLowerCase(); bv = (b.controlNumber ?? '').toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  // Download the current (filtered/sorted) asset list — a print guide for naming.
  const exportAssets = (fmt: 'xlsx' | 'pdf') => {
    const headers = ['Control No.', 'Asset Name', 'Classification', 'Branch', 'Accountable', 'Departments', 'Condition']
    const rows = displayedAssets.map((a) => [
      a.controlNumber || '', a.name, classificationLabel(a.classification), branchLabel(a.branch),
      a.accountableName || '', (a.departments as string[]).join(', '), a.isDefective ? 'Defective' : 'OK',
    ])
    const scope = branchFilter ? branchLabel(branchFilter) : 'All branches'
    if (fmt === 'xlsx') downloadXlsx(`asset-list-${branchFilter || 'all'}`, [{ name: 'Assets', headers, rows }])
    else downloadPdf({ title: 'Asset List — Naming Guide', subtitle: `${scope} · ${displayedAssets.length} asset(s)`, headers, rows, landscape: true })
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 size={24} className="text-teal-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Asset Management</h1>
        </div>
        {tab === 'assets' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportAssets('xlsx')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
              title="Download the current list as Excel"
            >
              <FileDown size={16} /> Excel
            </button>
            <button
              onClick={() => exportAssets('pdf')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
              title="Download the current list as PDF (print as naming guide)"
            >
              <Printer size={16} /> PDF
            </button>
            {canManage && (
            <button
              onClick={openDepSettings}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            >
              <Settings2 size={16} />
              Depreciation Settings
            </button>
            )}
            {canWrite && (
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--teal)' }}
            >
              <Plus size={16} />
              Add Asset
            </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {([['assets', 'Assets'], ['audit', 'Asset Audit'], ['flowchart', 'Recording Flowchart']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={{ borderColor: tab === v ? 'var(--teal)' : 'transparent', color: tab === v ? 'var(--teal)' : 'var(--mid-gray)' }}>{label}</button>
        ))}
      </div>

      {tab === 'audit' && <AssetAuditTab canWrite={canManage} />}
      {tab === 'flowchart' && <AssetFlowchart />}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} />
          {error}
          <button className="ml-auto" onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {tab === 'assets' && (<>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Global search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search assets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-56"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>

        {!isBranchRestricted && (
          <div>
            <label className="text-xs font-medium text-gray-500 mr-2">Branch</label>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">All Branches</option>
              {BRANCH_OPTIONS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </div>
        )}
        {isBranchRestricted && (
          <span className="text-sm text-gray-500">
            Showing: <strong>{branchLabel(userBranch)}</strong>
          </span>
        )}

        {/* Active filter chips */}
        {(colFilters.name || colFilters.classification || colFilters.branch || colFilters.utilized) && (
          <div className="flex items-center gap-2 flex-wrap">
            {colFilters.name && (
              <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2.5 py-0.5 text-xs">
                Name: {colFilters.name}
                <button onClick={() => setColFilters(f => ({ ...f, name: '' }))}><X size={10} /></button>
              </span>
            )}
            {colFilters.classification && (
              <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2.5 py-0.5 text-xs">
                Class: {classificationLabel(colFilters.classification)}
                <button onClick={() => setColFilters(f => ({ ...f, classification: '' }))}><X size={10} /></button>
              </span>
            )}
            {colFilters.branch && (
              <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2.5 py-0.5 text-xs">
                Branch: {branchLabel(colFilters.branch)}
                <button onClick={() => setColFilters(f => ({ ...f, branch: '' }))}><X size={10} /></button>
              </span>
            )}
            {colFilters.utilized && (
              <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2.5 py-0.5 text-xs">
                Utilized: {colFilters.utilized === 'yes' ? 'Yes' : 'No'}
                <button onClick={() => setColFilters(f => ({ ...f, utilized: '' }))}><X size={10} /></button>
              </span>
            )}
            <button onClick={() => setColFilters({ name: '', classification: '', branch: '', utilized: '' })} className="text-xs text-gray-500 hover:text-red-600 underline">
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" />
            Loading assets…
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Building2 size={32} />
            <p>No assets found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto" onClick={() => setOpenFilterCol(null)}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">

                  {/* ── Photo ── */}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Photo</th>

                  {/* ── Asset Name ── */}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <div className="flex items-center gap-1">
                      <button className="flex items-center gap-1 hover:text-gray-800" onClick={(e) => { e.stopPropagation(); toggleSort('name') }}>
                        Asset Name
                        {sortKey === 'name' ? (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={12} className="text-gray-400" />}
                      </button>
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setOpenFilterCol(openFilterCol === 'name' ? null : 'name')}
                          className={`p-0.5 rounded hover:bg-gray-200 ${colFilters.name ? 'text-teal-600' : 'text-gray-400'}`}>
                          <Filter size={11} />
                        </button>
                        {openFilterCol === 'name' && (
                          <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-48">
                            <input autoFocus type="text" placeholder="Filter name…" value={colFilters.name}
                              onChange={(e) => setColFilters(f => ({ ...f, name: e.target.value }))}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500" />
                          </div>
                        )}
                      </div>
                    </div>
                  </th>

                  {/* ── Classification ── */}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <div className="flex items-center gap-1">
                      <button className="flex items-center gap-1 hover:text-gray-800" onClick={(e) => { e.stopPropagation(); toggleSort('classification') }}>
                        Classification
                        {sortKey === 'classification' ? (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={12} className="text-gray-400" />}
                      </button>
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setOpenFilterCol(openFilterCol === 'classification' ? null : 'classification')}
                          className={`p-0.5 rounded hover:bg-gray-200 ${colFilters.classification ? 'text-teal-600' : 'text-gray-400'}`}>
                          <Filter size={11} />
                        </button>
                        {openFilterCol === 'classification' && (
                          <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-56">
                            <select value={colFilters.classification}
                              onChange={(e) => setColFilters(f => ({ ...f, classification: e.target.value }))}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500">
                              <option value="">All</option>
                              {CLASSIFICATION_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>

                  {/* ── Branch ── */}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <div className="flex items-center gap-1">
                      <button className="flex items-center gap-1 hover:text-gray-800" onClick={(e) => { e.stopPropagation(); toggleSort('branch') }}>
                        Branch
                        {sortKey === 'branch' ? (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={12} className="text-gray-400" />}
                      </button>
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setOpenFilterCol(openFilterCol === 'branch' ? null : 'branch')}
                          className={`p-0.5 rounded hover:bg-gray-200 ${colFilters.branch ? 'text-teal-600' : 'text-gray-400'}`}>
                          <Filter size={11} />
                        </button>
                        {openFilterCol === 'branch' && (
                          <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-48">
                            <select value={colFilters.branch}
                              onChange={(e) => setColFilters(f => ({ ...f, branch: e.target.value }))}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500">
                              <option value="">All</option>
                              {BRANCH_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>

                  {/* ── Total Amount ── */}
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <button className="flex items-center gap-1 ml-auto hover:text-gray-800" onClick={() => toggleSort('totalAmount')}>
                      {sortKey === 'totalAmount' ? (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={12} className="text-gray-400" />}
                      Total Amount
                    </button>
                  </th>

                  {/* ── Monthly Depr. ── */}
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <button className="flex items-center gap-1 ml-auto hover:text-gray-800" onClick={() => toggleSort('monthlyDepreciation')}>
                      {sortKey === 'monthlyDepreciation' ? (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={12} className="text-gray-400" />}
                      Monthly Depr.
                    </button>
                  </th>

                  {/* ── End Date ── */}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <button className="flex items-center gap-1 hover:text-gray-800" onClick={() => toggleSort('depreciationEndDate')}>
                      End Date
                      {sortKey === 'depreciationEndDate' ? (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={12} className="text-gray-400" />}
                    </button>
                  </th>

                  {/* ── Utilized ── */}
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <div className="flex items-center justify-center gap-1">
                      <button className="flex items-center gap-1 hover:text-gray-800" onClick={(e) => { e.stopPropagation(); toggleSort('utilized') }}>
                        Utilized
                        {sortKey === 'utilized' ? (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={12} className="text-gray-400" />}
                      </button>
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setOpenFilterCol(openFilterCol === 'utilized' ? null : 'utilized')}
                          className={`p-0.5 rounded hover:bg-gray-200 ${colFilters.utilized ? 'text-teal-600' : 'text-gray-400'}`}>
                          <Filter size={11} />
                        </button>
                        {openFilterCol === 'utilized' && (
                          <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-32">
                            <select value={colFilters.utilized}
                              onChange={(e) => setColFilters(f => ({ ...f, utilized: e.target.value }))}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500">
                              <option value="">All</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>

                  {/* ── Condition ── */}
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Condition</th>

                  {/* ── Control No. ── */}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <button className="flex items-center gap-1 hover:text-gray-800" onClick={() => toggleSort('controlNumber')}>
                      Control No.
                      {sortKey === 'controlNumber' ? (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={12} className="text-gray-400" />}
                    </button>
                  </th>

                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Accountability</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Departments</th>
                  {canWrite && (
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedAssets.length === 0 ? (
                  <tr>
                    <td colSpan={canWrite ? 12 : 11} className="text-center py-10 text-gray-400 text-sm">
                      No assets match your search or filters.
                    </td>
                  </tr>
                ) : displayedAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {(() => {
                        const photos = photosOf(asset); const main = photos[0]
                        if (!main) return <div className="w-12 h-12 rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-gray-300"><ImageIcon size={16} /></div>
                        const isImg = /\.(jpg|jpeg|png|webp)$/i.test(main)
                        return (
                          <button className="relative block" onClick={(e) => { e.stopPropagation(); setGalleryAsset(asset) }} title={photos.length > 1 ? `${photos.length} photos` : 'View photo'}>
                            {isImg ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={main} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition-opacity" />
                            ) : (
                              <div className="w-12 h-12 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400"><FileText size={18} /></div>
                            )}
                            {photos.length > 1 && <span className="absolute -bottom-1 -right-1 px-1 py-0.5 rounded-full text-[9px] font-bold text-white" style={{ background: 'var(--teal)' }}>{photos.length}</span>}
                          </button>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {asset.name}
                      {asset.isDefective && <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#fee2e2', color: '#b91c1c' }}>Defective</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{classificationLabel(asset.classification)}</td>
                    <td className="px-4 py-3 text-gray-600">{branchLabel(asset.branch)}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{formatCurrency(asset.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(asset.monthlyDepreciation)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatEndDate(asset.depreciationEndDate)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        asset.utilized
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {asset.utilized ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={asset.isDefective ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#dcfce7', color: '#166534' }}>
                        {asset.isDefective ? 'Defective' : 'OK'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{asset.controlNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{asset.accountableName ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[160px]">
                      <span className="truncate block" title={(asset.departments as string[]).join(', ')}>
                        {(asset.departments as string[]).length > 0
                          ? (asset.departments as string[]).join(', ')
                          : '—'}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(asset)}
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          {canManage && (confirmDeleteId === asset.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-red-600">Sure?</span>
                              <button
                                onClick={() => handleDelete(asset.id)}
                                disabled={deletingId === asset.id}
                                className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                              >
                                {deletingId === asset.id ? <Loader2 size={10} className="animate-spin" /> : 'Yes'}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(asset.id)}
                              className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}

      {/* Photo gallery */}
      {galleryAsset && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setGalleryAsset(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-2xl max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">{galleryAsset.name} — Photos</h3>
              <button onClick={() => setGalleryAsset(null)}><X size={18} className="text-gray-500" /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photosOf(galleryAsset).map((url, i) => (
                <div key={url} className="relative">
                  {/\.(jpg|jpeg|png|webp)$/i.test(url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="w-full aspect-square object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80" onClick={() => setLightboxUrl(url)} />
                  ) : (
                    <button onClick={() => window.open(url, '_blank')} className="w-full aspect-square rounded-lg border border-gray-200 flex items-center justify-center text-teal-600"><FileText size={28} /></button>
                  )}
                  {i === 0 && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: 'var(--teal)' }}>Main</span>}
                </div>
              ))}
              {photosOf(galleryAsset).length === 0 && <p className="col-span-3 text-center py-8 text-sm text-gray-400">No photos.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingAsset ? 'Edit Asset' : 'Add Asset'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-5">
              {formError && (
                <div className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-3 text-sm">
                  <AlertCircle size={16} />
                  {formError}
                </div>
              )}

              {/* Row 1: Branch + Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch <span className="text-red-500">*</span></label>
                  <select
                    value={form.branch}
                    onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                    disabled={isBranchRestricted}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    {BRANCH_OPTIONS.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Treatment Table"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Row 2: Price + Qty */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price during Purchase <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.purchasePrice}
                    onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Include all costs to be capitalized (e.g. freight, delivery, installation). Total Amount = Price × Qty.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Total Amount (computed, read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount</label>
                <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700 font-medium">
                  {formatCurrency(totalAmount)}
                </div>
              </div>

              {/* Row 3: Date Bought + Classification */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Bought <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={form.dateBought}
                    onChange={(e) => setForm((f) => ({ ...f, dateBought: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset Classification <span className="text-red-500">*</span></label>
                  <select
                    value={form.classification}
                    onChange={(e) => handleClassificationChange(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Select classification…</option>
                    {CLASSIFICATION_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {noDep ? (
                /* Intangibles / other non-current assets are carried at cost — no depreciation. */
                <div className="rounded-lg px-3 py-2 text-sm" style={{ background: '#f0fdfa', color: '#0f766e' }}>
                  This is a non-depreciating asset (intangible / other non-current asset). It is carried at cost on the Balance Sheet with no depreciation.
                </div>
              ) : (
                <>
                  {/* Row 4: Years Depreciation */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Years for Depreciation</label>
                    <select
                      value={form.yearsDepreciation}
                      onChange={(e) => setForm((f) => ({ ...f, yearsDepreciation: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      {DEPRECIATION_YEARS.map((y) => (
                        <option key={y} value={y}>{y} years</option>
                      ))}
                    </select>
                  </div>

                  {/* Computed: Monthly Depreciation + End Date */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Depreciation (computed)</label>
                      <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700 font-medium">
                        {formatCurrency(monthlyDepreciation)}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Month for Depreciation (computed)</label>
                      <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
                        {depreciationEndDate ? formatEndDate(depreciationEndDate) : '—'}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Supplier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Search supplier…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 mb-1"
                />
                <select
                  value={form.supplierId}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, supplierId: e.target.value }))
                    setSupplierSearch('')
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">— No Supplier —</option>
                  {filteredSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.supplierName}</option>
                  ))}
                </select>
              </div>

              {/* Purchased from (funding bank account) + journal-entry preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchased from <span className="font-normal text-gray-400">(bank account — records the purchase as a journal entry)</span></label>
                <select
                  value={form.sourceAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, sourceAccountId: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">— Not recorded (no journal entry) —</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}
                </select>
                {form.sourceAccountId && (
                  <div className="mt-2 rounded-lg border p-2.5 text-xs font-mono" style={{ borderColor: 'var(--light-gray)', background: '#f8fafc', color: '#334155' }}>
                    <div className="mb-1 font-sans font-semibold text-[11px]" style={{ color: 'var(--mid-gray)' }}>Journal entry on save:</div>
                    <div>DR&nbsp; {form.classification ? classificationLabel(form.classification) : 'Asset (PPE)'} &nbsp;<span className="float-right">{formatCurrency(totalAmount)}</span></div>
                    <div>CR&nbsp;&nbsp;&nbsp;&nbsp; {banks.find(b => b.id === form.sourceAccountId)?.accountTitle || 'Bank'} <span className="float-right">{formatCurrency(totalAmount)}</span></div>
                  </div>
                )}
              </div>

              {/* Photos (main + gallery) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Photos of Asset <span className="font-normal text-gray-400">— first is the Main photo (shown in the list); add more than one</span></label>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {form.photoUrls.map((url, i) => (
                    <div key={url} className="relative">
                      {/\.(jpg|jpeg|png|webp)$/i.test(url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80"
                          onClick={() => setLightboxUrl(url)} title="Click to enlarge" />
                      ) : (
                        <button onClick={() => window.open(url, '_blank')} className="w-16 h-16 rounded-lg border border-gray-200 flex items-center justify-center text-teal-600"><FileText size={20} /></button>
                      )}
                      {i === 0 && <span className="absolute -top-1.5 -left-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white" style={{ background: 'var(--teal)' }}>Main</span>}
                      <div className="absolute -top-1.5 -right-1.5 flex gap-0.5">
                        {i !== 0 && <button onClick={() => setForm(f => { const a = [...f.photoUrls]; const [m] = a.splice(i, 1); return { ...f, photoUrls: [m, ...a] } })} title="Make main" className="w-4 h-4 rounded-full bg-teal-600 text-white text-[9px] flex items-center justify-center">★</button>}
                        <button onClick={() => setForm(f => ({ ...f, photoUrls: f.photoUrls.filter(u => u !== url) }))} title="Remove" className="w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center"><X size={9} /></button>
                      </div>
                    </div>
                  ))}
                  <ScanUpload
                    prefix={form.controlNumber || form.name || 'ASSET'}
                    section="asset"
                    existingCount={form.photoUrls.length}
                    label="Add photo"
                    onUploaded={(url) => setForm((f) => ({ ...f, photoUrls: [...f.photoUrls, url] }))}
                  />
                </div>
                <p className="text-xs text-gray-400">JPG, PNG, or PDF — max 10MB each</p>
              </div>

              {/* Defective */}
              <div>
                <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.isDefective} onChange={(e) => setForm(f => ({ ...f, isDefective: e.target.checked }))} />
                  Mark as defective
                </label>
              </div>

              {/* Departments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Departments</label>
                <div className="grid grid-cols-2 gap-2">
                  {DEPARTMENT_OPTIONS.map((dept) => (
                    <label key={dept} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.departments.includes(dept)}
                        onChange={() => toggleDepartment(dept)}
                        className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-sm text-gray-700">{dept}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Utilized */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Utilized</label>
                <div className="flex items-center gap-4">
                  {[true, false].map((val) => (
                    <label key={String(val)} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="utilized"
                        checked={form.utilized === val}
                        onChange={() => setForm((f) => ({ ...f, utilized: val }))}
                        className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-sm text-gray-700">{val ? 'Yes' : 'No'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Accountability + Control Number */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Accountability</label>
                  <input
                    type="text"
                    list="asset-staff-list"
                    value={form.accountableName}
                    onChange={(e) => setForm((f) => ({ ...f, accountableName: e.target.value }))}
                    placeholder="Type or pick a staff name…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <datalist id="asset-staff-list">
                    {staffNames.map((n) => <option key={n} value={n} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Control Number</label>
                  <input
                    type="text"
                    value={editingAsset ? (form.controlNumber || '—') : 'Auto-generated on save'}
                    readOnly disabled
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 font-mono"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Format: BRANCH-YEAR-000x (e.g. AHEA-2026-0001)</p>
                </div>
              </div>

              {/* Remarks */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <textarea
                    value={form.remarks}
                    onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                    rows={2}
                    placeholder="Optional notes…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                style={{ background: 'var(--teal)' }}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingAsset ? 'Save Changes' : 'Add Asset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Depreciation Settings Modal ──────────────────────── */}
      {showDepSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Settings2 size={18} className="text-teal-600" />
                <h2 className="text-lg font-semibold text-gray-900">Depreciation Settings</h2>
              </div>
              <button onClick={() => setShowDepSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[60vh]">
              <p className="text-sm text-gray-500">
                Set the default depreciation period for each asset classification. When adding a new asset,
                selecting a classification will automatically fill in the years from these settings.
              </p>
              <div className="space-y-3">
                {CLASSIFICATION_OPTIONS.map((c) => (
                  <div key={c.value} className="flex items-center justify-between gap-4">
                    <label className="text-sm text-gray-700 flex-1">{c.label}</label>
                    <select
                      value={depSettingsForm[c.value] ?? 5}
                      onChange={(e) => setDepSettingsForm((prev) => ({ ...prev, [c.value]: Number(e.target.value) }))}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 w-32 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value={3}>3 years</option>
                      <option value={5}>5 years</option>
                      <option value={10}>10 years</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowDepSettings(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveDepSettings}
                disabled={savingDepSettings}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                style={{ background: 'var(--teal)' }}
              >
                {savingDepSettings && <Loader2 size={14} className="animate-spin" />}
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ─────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X size={28} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Asset"
              className="w-full h-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Asset recording flowchart ─────────────────────────────────
function AssetFlowchart() {
  const steps = [
    { n: 1, title: 'Record the purchase as an expense', who: 'Front desk / Bookkeeper', desc: 'Enter the asset purchase in Petty Cash (petty-cash float) or as a One-time Expense. In the Account Title, pick the asset account — a PPE class (2020–2100) or an intangible / other non-current asset (3010–3130).', je: null, tag: 'Petty Cash · One-time Expense' },
    { n: 2, title: 'Add it to Asset Management', who: 'Accountant / Bookkeeper', desc: 'On finalizing the entry — or anytime, via the "Add to Asset Management" button under its Account Title — confirm the prompt. The asset record is created automatically.', je: null, tag: null },
    { n: 3, title: 'Details are pre-filled', who: 'Automatic', desc: 'Branch, price (net of VAT), date bought, classification, depreciation (default years → monthly + end date), supplier and department are carried over from the entry. If a CEO expense is split across branches, one asset is created per branch, each priced at that branch’s allocated amount.', je: null, tag: null },
    { n: 4, title: 'No bank credit here', who: '', desc: 'The asset is created with "Purchased from = Not recorded (no journal entry)". The cash was already paid from petty cash (credited to the bank later at replenishment / RFP) or by the expense’s own payment — so booking a bank credit here would double-count it.', je: 'No journal entry (cash handled by replenishment)', tag: 'Bank credited at RFP replenishment, not here' },
    { n: 5, title: 'Shows on the Balance Sheet', who: 'Automatic', desc: 'The asset is carried at cost under Non-Current Assets. Depreciating classes (PPE 2020–2100) accrue monthly depreciation with an Accumulated Depreciation contra line; intangibles / other non-current assets (3010–3130) are carried at cost with NO depreciation.', je: 'Depreciation: DR 8070 Depreciation Expense / CR 2010 Accumulated Depreciation (PPE only)', tag: 'Balance Sheet (Non-Current Assets) + Income Statement (depreciation)' },
  ]
  return (
    <div className="rounded-2xl border bg-white p-6" style={{ borderColor: 'var(--light-gray)' }}>
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Asset Recording Workflow</h2>
      <p className="text-xs mb-6" style={{ color: 'var(--mid-gray)' }}>Assets are recorded as a One-time Expense or Petty Cash entry (with an asset account), then transferred here automatically. The cash is handled by that entry / its replenishment, so the asset itself posts no bank credit — it only adds the asset to the Balance Sheet and its depreciation schedule.</p>
      <div className="flex flex-col items-center">
        {steps.map((s, i, arr) => (
          <div key={s.n} className="w-full max-w-2xl flex flex-col items-center">
            <div className="w-full rounded-2xl border p-4 flex items-start gap-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'var(--teal)' }}>{s.n}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{s.title}{s.who && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold align-middle" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{s.who}</span>}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{s.desc}</p>
                {s.je && <p className="text-[11px] mt-1.5 font-mono px-2 py-1 rounded" style={{ background: '#f1f5f9', color: '#334155' }}>{s.je}</p>}
                {s.tag && <p className="text-[10px] mt-1 font-semibold" style={{ color: 'var(--deep-teal)' }}>→ {s.tag}</p>}
              </div>
            </div>
            {i < arr.length - 1 && <div className="text-xl leading-none my-1" style={{ color: 'var(--teal)' }}>↓</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Asset Audit tab ───────────────────────────────────────────
interface AuditRow { id: string; refNumber: string; dateFrom: string; dateTo: string; auditorName: string; branch: string; departments: string[]; status: string; finalizedAt: string | null; createdAt: string; itemCount: number; replacementCount: number; assessedCount: number }
interface AuditItem { id: string; assetId: string; assetName: string; controlNumber: string | null; classification: string | null; accountableName: string | null; usable: boolean | null; needsReplacement: boolean; remarks: string | null; photoUrl?: string | null }
interface AuditDetail { id: string; refNumber: string; dateFrom: string; dateTo: string; auditorName: string; branch: string; departments: string[]; status: string; proofUrls: string[] | null; finalizedAt: string | null; items: AuditItem[] }

const dISO = (s: string) => String(s).slice(0, 10)

function AssetAuditTab({ canWrite }: { canWrite: boolean }) {
  const [audits, setAudits] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/assets/audits'); setAudits(r.ok ? await r.json() : []) }
    catch { setAudits([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const del = async (a: AuditRow) => {
    if (!confirm(`Delete draft audit ${a.refNumber}?`)) return
    const r = await fetch(`/api/assets/audits?id=${a.id}`, { method: 'DELETE' })
    if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
    load()
  }
  const exportReplacements = async (a: AuditRow) => {
    const r = await fetch(`/api/assets/audits?id=${a.id}`)
    if (!r.ok) return
    const j: AuditDetail = await r.json()
    const repl = (j.items || []).filter(i => i.needsReplacement)
    if (repl.length === 0) { alert('No assets flagged for replacement in this audit.'); return }
    const headers = ['Control No.', 'Asset', 'Classification', 'Accountable', 'Usable', 'Remarks']
    const rows = repl.map(i => [i.controlNumber || '', i.assetName, classificationLabel(i.classification || ''), i.accountableName || '', i.usable === false ? 'No' : i.usable ? 'Yes' : '—', i.remarks || ''])
    downloadXlsx(`assets-for-replacement-${j.refNumber}`, [{ name: 'For Replacement', headers, rows }])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Annual physical audits — snapshot the assets in scope, mark each usable or for replacement, then finalize to lock.</p>
        {canWrite && <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--teal)' }}><Plus size={16} /> Add New Audit</button>}
      </div>

      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <thead><tr className="text-left bg-gray-50" style={{ color: 'var(--mid-gray)' }}>
            {['Audit Ref.', 'Period', 'Auditor', 'Branch', 'Assessed', 'For Replacement', 'Status', ''].map(h => <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">{h}</th>)}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
            : audits.map(a => (
              <tr key={a.id} className="border-t hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-4 py-3 font-mono font-semibold text-gray-900">{a.refNumber}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{dISO(a.dateFrom)} → {dISO(a.dateTo)}</td>
                <td className="px-4 py-3 text-gray-700">{a.auditorName}</td>
                <td className="px-4 py-3 text-gray-600">{a.branch === 'ALL' ? 'All branches' : branchLabel(a.branch)}</td>
                <td className="px-4 py-3 text-gray-600">{a.assessedCount}/{a.itemCount}</td>
                <td className="px-4 py-3"><span className="font-semibold" style={{ color: a.replacementCount ? '#b91c1c' : 'var(--mid-gray)' }}>{a.replacementCount}</span></td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={a.status === 'FINALIZED' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef9c3', color: '#854d0e' }}>
                    {a.status === 'FINALIZED' ? <><Lock size={10} /> Finalized</> : 'Draft'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setOpenId(a.id)} className="px-2 py-1 rounded text-xs font-semibold" style={{ color: 'var(--teal)' }}>{a.status === 'FINALIZED' ? 'View' : 'Open'}</button>
                  {a.replacementCount > 0 && <button onClick={() => exportReplacements(a)} title="For-replacement list" className="p-1 rounded hover:bg-gray-100"><FileDown size={14} className="text-gray-500" /></button>}
                  {canWrite && a.status !== 'FINALIZED' && <button onClick={() => del(a)} title="Delete draft" className="p-1 rounded hover:bg-red-50"><Trash2 size={14} className="text-red-400" /></button>}
                </td>
              </tr>
            ))}
            {!loading && audits.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-gray-400 text-sm">No audits yet. Click “Add New Audit” to start.</td></tr>}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateAuditModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); load(); setOpenId(id) }} />}
      {openId && <AuditDetailModal id={openId} canWrite={canWrite} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  )
}

function CreateAuditModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [auditorName, setAuditorName] = useState('')
  const [branch, setBranch] = useState('ALL')
  const [departments, setDepartments] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const toggleDep = (d: string) => setDepartments(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])
  const save = async () => {
    if (!auditorName.trim()) { alert('Enter who conducted the audit.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/assets/audits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateFrom, dateTo, auditorName, branch, departments }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onCreated((await r.json()).id)
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><ClipboardCheck size={18} style={{ color: 'var(--teal)' }} /> New Asset Audit</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Audit from</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Audit to</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} /></div>
        </div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Conducted by</label>
        <input value={auditorName} onChange={e => setAuditorName(e.target.value)} placeholder="Auditor name" className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold text-gray-600 mb-1">Branch</label>
        <select value={branch} onChange={e => setBranch(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="ALL">All branches</option>{BRANCH_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Departments <span className="font-normal text-gray-400">(none = all)</span></label>
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {DEPARTMENT_OPTIONS.map(d => (
            <label key={d} className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={departments.includes(d)} onChange={() => toggleDep(d)} /> {d}
            </label>
          ))}
        </div>
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Create audit & load assets'}</button>
      </div>
    </div>
  )
}

function AuditDetailModal({ id, canWrite, onClose, onChanged }: { id: string; canWrite: boolean; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<AuditDetail | null>(null)
  const [items, setItems] = useState<AuditItem[]>([])
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [img, setImg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/assets/audits?id=${id}`)
    if (r.ok) { const j: AuditDetail = await r.json(); setD(j); setItems(j.items); setProofUrls(Array.isArray(j.proofUrls) ? j.proofUrls : []) }
  }, [id])
  useEffect(() => { load() }, [load])

  const locked = d?.status === 'FINALIZED' || !canWrite
  const patch = (iid: string, p: Partial<AuditItem>) => setItems(prev => prev.map(x => x.id === iid ? { ...x, ...p } : x))

  const save = async (finalize = false) => {
    if (finalize && !confirm('Finalize and lock this audit? Results can no longer be edited.')) return
    setBusy(true)
    try {
      const r = await fetch(`/api/assets/audits?id=${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(i => ({ id: i.id, usable: i.usable, needsReplacement: i.needsReplacement, remarks: i.remarks })), proofUrls, ...(finalize ? { action: 'finalize' } : {}) }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      await load(); onChanged()
      if (finalize) alert('Audit finalized.')
    } finally { setBusy(false) }
  }

  const replacements = items.filter(i => i.needsReplacement)
  const exportReplace = (fmt: 'xlsx' | 'pdf') => {
    const headers = ['Control No.', 'Asset', 'Classification', 'Accountable', 'Usable', 'Remarks']
    const rows = replacements.map(i => [i.controlNumber || '', i.assetName, classificationLabel(i.classification || ''), i.accountableName || '', i.usable === false ? 'No' : i.usable ? 'Yes' : '—', i.remarks || ''])
    if (fmt === 'xlsx') downloadXlsx(`assets-for-replacement-${d?.refNumber}`, [{ name: 'For Replacement', headers, rows }])
    else downloadPdf({ title: `Assets for Replacement — ${d?.refNumber}`, subtitle: `${d?.branch === 'ALL' ? 'All branches' : branchLabel(d?.branch || '')} · Auditor: ${d?.auditorName}`, headers, rows, landscape: true })
  }

  const printAudit = () => {
    if (!d) return
    const rowsHtml = items.map(i => `<tr><td>${i.controlNumber || ''}</td><td>${i.assetName}</td><td>${classificationLabel(i.classification || '')}</td><td>${i.accountableName || ''}</td><td style="text-align:center">${i.usable === false ? 'Not usable' : i.usable ? 'Usable' : '—'}</td><td style="text-align:center">${i.needsReplacement ? 'YES' : ''}</td><td>${i.remarks || ''}</td></tr>`).join('')
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<html><head><title>${d.refNumber}</title><style>
      body{font-family:Arial,sans-serif;padding:28px;color:#111}h1{font-size:18px;margin:0}h2{font-size:13px;color:#555;font-weight:normal;margin:2px 0 14px}
      table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#f0f0f0}
      .sig{margin-top:48px;display:flex;justify-content:space-between}.sig div{width:45%}.line{margin-top:40px;border-top:1px solid #000;padding-top:4px;text-align:center;font-size:12px}
    </style></head><body>
      <h1>Asset Audit Report — ${d.refNumber}</h1>
      <h2>Period: ${dISO(d.dateFrom)} to ${dISO(d.dateTo)} &nbsp;·&nbsp; Branch: ${d.branch === 'ALL' ? 'All branches' : branchLabel(d.branch)} &nbsp;·&nbsp; Departments: ${(d.departments || []).join(', ') || 'All'} &nbsp;·&nbsp; Status: ${d.status}</h2>
      <table><thead><tr><th>Control No.</th><th>Asset</th><th>Classification</th><th>Accountable</th><th>Condition</th><th>Replace</th><th>Remarks</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="sig"><div><div class="line">${d.auditorName}</div><div style="text-align:center;font-size:11px;color:#555">Audited by (signature over printed name)</div></div><div><div class="line">&nbsp;</div><div style="text-align:center;font-size:11px;color:#555">Noted by</div></div></div>
    </body></html>`)
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-5xl my-8" onClick={e => e.stopPropagation()}>
        {!d ? <div className="py-10 text-center"><Loader2 size={18} className="inline animate-spin" /></div> : (<>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">{d.refNumber}
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={d.status === 'FINALIZED' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef9c3', color: '#854d0e' }}>{d.status === 'FINALIZED' ? 'Finalized' : 'Draft'}</span>
            </h2>
            <button onClick={onClose}><X size={18} className="text-gray-500" /></button>
          </div>
          <p className="text-xs text-gray-500 mb-3">{dISO(d.dateFrom)} → {dISO(d.dateTo)} · {d.branch === 'ALL' ? 'All branches' : branchLabel(d.branch)} · {(d.departments || []).join(', ') || 'All departments'} · Auditor: {d.auditorName}</p>

          <div className="rounded-xl border overflow-auto mb-3" style={{ borderColor: 'var(--light-gray)', maxHeight: '46vh' }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: 'var(--off-white)' }}><tr className="text-left text-gray-500">
                {['Photo', 'Control No.', 'Asset', 'Classification', 'Accountable', 'Condition', 'Replace?', 'Remarks'].map(h => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className="border-t" style={{ borderColor: 'var(--light-gray)', background: i.needsReplacement ? '#fef2f2' : undefined }}>
                    <td className="px-2 py-1.5">
                      {i.photoUrl ? (
                        /\.(jpg|jpeg|png|webp)$/i.test(i.photoUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={i.photoUrl} alt="" className="w-10 h-10 rounded object-cover border border-gray-200 cursor-pointer hover:opacity-80" onClick={() => setImg(i.photoUrl!)} />
                        ) : (
                          <button onClick={() => window.open(i.photoUrl!, '_blank')} className="w-10 h-10 rounded border border-gray-200 flex items-center justify-center text-gray-400"><FileText size={14} /></button>
                        )
                      ) : (
                        <div className="w-10 h-10 rounded border border-dashed border-gray-200 flex items-center justify-center text-gray-300"><ImageIcon size={13} /></div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{i.controlNumber || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-800">{i.assetName}</td>
                    <td className="px-2 py-1.5 text-gray-500">{classificationLabel(i.classification || '')}</td>
                    <td className="px-2 py-1.5 text-gray-500">{i.accountableName || '—'}</td>
                    <td className="px-2 py-1.5">
                      <select disabled={locked} value={i.usable === null || i.usable === undefined ? '' : i.usable ? 'yes' : 'no'}
                        onChange={e => { const v = e.target.value; patch(i.id, { usable: v === '' ? null : v === 'yes' }) }}
                        className="px-1.5 py-1 rounded border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">—</option><option value="yes">Usable</option><option value="no">Not usable</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" disabled={locked} checked={i.needsReplacement} onChange={e => patch(i.id, { needsReplacement: e.target.checked })} /></td>
                    <td className="px-2 py-1.5"><input disabled={locked} value={i.remarks || ''} onChange={e => patch(i.id, { remarks: e.target.value })} className="w-full px-1.5 py-1 rounded border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 flex-wrap mb-4">
            <span className="text-xs text-gray-500">Proof of audit:</span>
            {proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}><FileText size={12} /> {i + 1}</a>)}
            {!locked && <ScanUpload compact section="asset" prefix={`${d.refNumber}-PROOF`} existingCount={proofUrls.length} label="Add proof" onUploaded={url => setProofUrls(p => [...p, url])} />}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={printAudit} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Printer size={15} /> Print</button>
            {replacements.length > 0 && <>
              <button onClick={() => exportReplace('xlsx')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><FileDown size={15} /> Replacements (Excel)</button>
              <button onClick={() => exportReplace('pdf')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><FileDown size={15} /> Replacements (PDF)</button>
            </>}
            {!locked && <>
              <button onClick={() => save(false)} disabled={busy} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Save Edit</button>
              <button onClick={() => save(true)} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#166534' }}><Lock size={15} /> Finalize Audit</button>
            </>}
          </div>
          {replacements.length > 0 && <p className="text-[11px] mt-2" style={{ color: '#b91c1c' }}>{replacements.length} asset(s) flagged for replacement.</p>}
        </>)}
      </div>
      {img && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6" onClick={() => setImg(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
