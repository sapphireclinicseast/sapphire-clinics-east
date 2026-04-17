'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  Building2,
  FileText,
} from 'lucide-react'

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
  photoUrl: string | null
  departments: string[]
  utilized: boolean
  controlNumber: string | null
  remarks: string | null
  createdById: string
  createdBy: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

// ── Constants ─────────────────────────────────────────────────

const BRANCH_OPTIONS = [
  { value: 'SANDBOX_EAST', label: 'Sandbox East' },
  { value: 'SANDBOX_GREENHILLS', label: 'Sandbox Greenhills' },
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
]

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

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

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
    photoUrl: '',
    departments: [] as string[],
    utilized: true,
    controlNumber: '',
    remarks: '',
  }
}

// ── Page ──────────────────────────────────────────────────────

export default function AssetManagementPage() {
  const { data: session, status } = useSession()

  const userRole = session?.user?.role as string
  const isBranchRestricted = ['SBEA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_ADMIN', 'SBGH_FRONTDESK', 'VERDANA_ADMIN'].includes(userRole)
  const userBranch = userRole?.includes('SBEA')
    ? 'SANDBOX_EAST'
    : userRole?.includes('SBGH')
    ? 'SANDBOX_GREENHILLS'
    : userRole?.includes('VERDANA')
    ? 'VERDANA_STORE'
    : ''

  const canWrite = WRITE_ROLES.includes(userRole)

  // ── State ───────────────────────────────────────────────────
  const [assets, setAssets] = useState<Asset[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [branchFilter, setBranchFilter] = useState(isBranchRestricted ? userBranch : '')

  const [showModal, setShowModal] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [form, setForm] = useState(emptyForm(isBranchRestricted ? userBranch : 'SANDBOX_EAST'))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Photo upload
  const [uploading, setUploading] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFilename, setPhotoFilename] = useState('')

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Supplier search
  const [supplierSearch, setSupplierSearch] = useState('')

  // ── Auth guard ───────────────────────────────────────────────
  if (status === 'unauthenticated') redirect('/login')

  // ── Derived computed values ──────────────────────────────────
  const purchasePriceNum = parseFloat(form.purchasePrice) || 0
  const quantityNum = parseInt(form.quantity) || 1
  const totalAmount = purchasePriceNum * quantityNum
  const yearsNum = parseInt(form.yearsDepreciation) || 5
  const monthlyDepreciation = totalAmount > 0 ? totalAmount / (yearsNum * 12) : 0
  const depreciationEndDate = form.dateBought ? computeEndDate(form.dateBought, yearsNum) : ''

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

  useEffect(() => {
    if (status === 'authenticated') {
      fetchAssets()
      fetchSuppliers()
    }
  }, [status, fetchAssets, fetchSuppliers])

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
      photoUrl: asset.photoUrl ?? '',
      departments: Array.isArray(asset.departments) ? (asset.departments as string[]) : [],
      utilized: asset.utilized,
      controlNumber: asset.controlNumber ?? '',
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
        photoUrl: form.photoUrl || null,
        departments: form.departments,
        utilized: form.utilized,
        controlNumber: form.controlNumber.trim() || null,
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

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 size={24} className="text-teal-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Asset Management</h1>
        </div>
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

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} />
          {error}
          <button className="ml-auto" onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Asset Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Classification</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Branch</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Amount</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Monthly Depr.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">End Date</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Utilized</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Control No.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Departments</th>
                  {canWrite && (
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {asset.photoUrl && (
                          /\.(jpg|jpeg|png|webp)$/i.test(asset.photoUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={asset.photoUrl} alt="" className="w-8 h-8 rounded object-cover border border-gray-200" />
                          ) : (
                            <FileText size={16} className="text-gray-400" />
                          )
                        )}
                        {asset.name}
                      </div>
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
                    <td className="px-4 py-3 text-gray-600">{asset.controlNumber ?? '—'}</td>
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
                          {confirmDeleteId === asset.id ? (
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
                          )}
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
                    onChange={(e) => setForm((f) => ({ ...f, classification: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Select classification…</option>
                    {CLASSIFICATION_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

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

              {/* Photo upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Photo of Asset</label>
                <div className="flex items-start gap-4">
                  <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer hover:bg-gray-50 transition-colors">
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {uploading ? 'Uploading…' : 'Upload file'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      className="hidden"
                      onChange={handlePhotoUpload}
                      disabled={uploading}
                    />
                  </label>
                  {form.photoUrl && (
                    <div className="flex items-center gap-2">
                      {photoPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoPreview} alt="Asset preview" className="w-16 h-16 object-cover rounded border border-gray-200" />
                      ) : (
                        <div className="flex items-center gap-1 text-gray-500">
                          <FileText size={20} />
                          <span className="text-xs">{photoFilename}</span>
                        </div>
                      )}
                      <button onClick={removePhoto} className="text-red-500 hover:text-red-700">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, or PDF — max 10MB</p>
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

              {/* Control Number + Remarks */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Control Number</label>
                  <input
                    type="text"
                    value={form.controlNumber}
                    onChange={(e) => setForm((f) => ({ ...f, controlNumber: e.target.value }))}
                    placeholder="e.g. SBEA-2025-001"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
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
    </div>
  )
}
