'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import {
  Plus, Pencil, Trash2, X, Search, Stethoscope,
  ArrowUpDown, ChevronUp, ChevronDown, AlertCircle, XCircle,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { downloadXlsx, downloadPdf } from '@/lib/export'
import DownloadMenu from '@/components/ui/DownloadMenu'
import Pagination from '@/components/ui/Pagination'

interface Service {
  id: string
  name: string
  department: string
  branch: string
  price: string | number
  priceType: string
  revenueType: string
  walletType: string | null
  vipTier: string | null
  packageSessions: number | null
  hasDoctorFee: boolean
  doctorFee: string | number | null
  clinicFee: string | number | null
  pwdDiscountClinicOnly: boolean
  noPwdDiscount: boolean
  description: string | null
  revenueAccountId: string | null
  revenueAccount?: { id: string; accountNumber: string; accountTitle: string } | null
  isActive: boolean
  createdAt: string
  eligibleFor?: { eligibleService: { id: string; name: string; department: string; price: string | number }; discountPercent?: number | string | null }[]
}

interface RevenueAccount {
  id: string
  accountNumber: string
  accountTitle: string
}

const DEPARTMENTS = [
  { value: 'ALL', label: 'All Departments' },
  { value: 'PT', label: 'Physical Therapy' },
  { value: 'MD', label: 'Medical Doctor' },
  { value: 'OT', label: 'Occupational Therapy' },
  { value: 'SLP', label: 'Speech-Language Pathology' },
  { value: 'SPED', label: 'Special Education' },
  { value: 'PSYCHOLOGY', label: 'Psychology' },
  { value: 'ORTHOSIS_PROSTHESIS', label: 'Orthosis & Prosthesis' },
]

const DEPT_LABELS: Record<string, string> = Object.fromEntries(DEPARTMENTS.map(d => [d.value, d.label]))

const BRANCHES = [
  { value: 'SANDBOX_EAST', label: 'Sandbox East' },
  { value: 'SANDBOX_GREENHILLS', label: 'Sandbox Greenhills' },
  { value: 'ALL', label: 'All Branches' },
]

const BRANCH_LABELS: Record<string, string> = Object.fromEntries(BRANCHES.map(b => [b.value, b.label]))

const DEPT_BADGE: Record<string, { bg: string; color: string }> = {
  PT: { bg: '#dbeafe', color: '#1e40af' },
  MD: { bg: '#dcfce7', color: '#166534' },
  OT: { bg: '#f3e8ff', color: '#6b21a8' },
  SLP: { bg: '#fce7f3', color: '#9d174d' },
  SPED: { bg: '#fef3c7', color: '#92400e' },
  PSYCHOLOGY: { bg: '#e0e7ff', color: '#3730a3' },
  ORTHOSIS_PROSTHESIS: { bg: '#ccfbf1', color: '#115e59' },
}

export default function ServicesPage() {
  const { data: session } = useSession()
  const sessionUserId = session?.user?.id as string | undefined
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoaded = useRef(false)
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [error, setError] = useState('')
  const [svcPage, setSvcPage] = useState(1)
  const [svcPageSize, setSvcPageSize] = useState(25)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Service | null>(null)

  // Form fields
  const [fName, setFName] = useState('')
  const [fDept, setFDept] = useState('PT')
  const [fBranch, setFBranch] = useState('ALL')
  const [fPrice, setFPrice] = useState('')
  const [fPriceType, setFPriceType] = useState('FIXED')
  const [fRevenueType, setFRevenueType] = useState('EARNED')
  const [fHasDoctorFee, setFHasDoctorFee] = useState(false)
  const [fDoctorFee, setFDoctorFee] = useState('')
  const [fClinicFee, setFClinicFee] = useState('')
  const [fPwdClinicOnly, setFPwdClinicOnly] = useState(false)
  const [fNoPwdDiscount, setFNoPwdDiscount] = useState(false)
  const [fDescription, setFDescription] = useState('')
  const [fWalletType, setFWalletType] = useState('')
  const [fVipTier, setFVipTier] = useState('')
  const [fPackageSessions, setFPackageSessions] = useState('')
  const [fRevenueAccountId, setFRevenueAccountId] = useState('')
  const [revenueAccounts, setRevenueAccounts] = useState<RevenueAccount[]>([])
  const [fEligibleServices, setFEligibleServices] = useState<{ serviceId: string; discountPercent: number }[]>([])
  const [eligibleSearch, setEligibleSearch] = useState('')

  const canWrite = session?.user?.role && ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN'].includes(session.user.role as string)

  const fetchServices = useCallback(async () => {
    try {
      const params = new URLSearchParams({ pageSize: '500', sortField, sortDir })
      if (search) params.set('search', search)
      if (filterDept) params.set('department', filterDept)
      if (filterBranch) params.set('branch', filterBranch)
      const res = await fetch(`/api/services?${params}`)
      const data = await res.json()
      setServices(data.data || [])
    } catch { setError('Failed to load services') }
    finally { setLoading(false) }
  }, [search, filterDept, filterBranch, sortField, sortDir])

  // Initial load
  useEffect(() => {
    if (!sessionUserId || initialLoaded.current) return
    initialLoaded.current = true
    fetchServices()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId])

  // Fetch revenue accounts for COA dropdown
  useEffect(() => {
    if (!sessionUserId) return
    fetch('/api/chart-of-accounts?accountType=REVENUE&pageSize=500')
      .then(r => r.json())
      .then(d => setRevenueAccounts((d.data || []).map((a: RevenueAccount) => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle }))))
      .catch(() => {})
  }, [sessionUserId])

  // Refetch on filter/sort changes (debounced, only after initial load)
  useEffect(() => {
    if (!initialLoaded.current) return
    const timeout = setTimeout(() => { fetchServices() }, 300)
    return () => clearTimeout(timeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterDept, filterBranch, sortField, sortDir])

  // Sort toggle
  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ArrowUpDown size={12} className="opacity-30" />
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  // Form handlers
  function openCreate() {
    setEditing(null)
    setFName(''); setFDept('PT'); setFBranch('ALL'); setFPrice('')
    setFPriceType('FIXED'); setFRevenueType('EARNED'); setFHasDoctorFee(false); setFDoctorFee('')
    setFClinicFee(''); setFPwdClinicOnly(false); setFNoPwdDiscount(false); setFDescription('')
    setFWalletType(''); setFVipTier(''); setFPackageSessions(''); setFRevenueAccountId(''); setFEligibleServices([]); setEligibleSearch('')
    setError(''); setModalOpen(true)
  }

  function openEdit(s: Service) {
    setEditing(s)
    setFName(s.name); setFDept(s.department); setFBranch(s.branch)
    setFPrice(String(s.price)); setFPriceType(s.priceType); setFRevenueType(s.revenueType)
    setFHasDoctorFee(s.hasDoctorFee)
    setFDoctorFee(s.doctorFee != null ? String(s.doctorFee) : '')
    setFClinicFee(s.clinicFee != null ? String(s.clinicFee) : '')
    setFPwdClinicOnly(s.pwdDiscountClinicOnly)
    setFNoPwdDiscount(s.noPwdDiscount)
    setFDescription(s.description || '')
    setFWalletType(s.walletType || '')
    setFVipTier(s.vipTier || '')
    setFPackageSessions(s.packageSessions != null ? String(s.packageSessions) : '')
    setFRevenueAccountId(s.revenueAccountId || '')
    setFEligibleServices(
      (s.eligibleFor || []).map((e: { eligibleService: { id: string }; discountPercent?: number | string | null }) => ({
        serviceId: e.eligibleService.id,
        discountPercent: Number(e.discountPercent) || 0,
      }))
    )
    setEligibleSearch('')
    setError(''); setModalOpen(true)
  }

  // Auto-calculate total price when doctor fee + clinic fee change
  useEffect(() => {
    if (fHasDoctorFee && fDoctorFee && fClinicFee) {
      const total = parseFloat(fDoctorFee) + parseFloat(fClinicFee)
      if (!isNaN(total)) setFPrice(String(total))
    }
  }, [fHasDoctorFee, fDoctorFee, fClinicFee])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const body: Record<string, unknown> = {
      name: fName, department: fDept, branch: fBranch,
      price: fPrice, priceType: fPriceType, revenueType: fRevenueType,
      walletType: fRevenueType === 'UNEARNED' ? (fWalletType || null) : null,
      vipTier: fRevenueType === 'UNEARNED' && fWalletType === 'VIP' ? (fVipTier || null) : null,
      packageSessions: fRevenueType === 'UNEARNED' && fWalletType === 'PACKAGE' ? (parseInt(fPackageSessions) || null) : null,
      eligibleServices: fRevenueType === 'UNEARNED' && (fWalletType === 'PACKAGE' || fWalletType === 'VIP') ? fEligibleServices : [],
      hasDoctorFee: fHasDoctorFee,
      doctorFee: fHasDoctorFee ? fDoctorFee : null,
      clinicFee: fHasDoctorFee ? fClinicFee : null,
      pwdDiscountClinicOnly: fHasDoctorFee ? fPwdClinicOnly : false,
      noPwdDiscount: fNoPwdDiscount,
      description: fDescription,
      revenueAccountId: fRevenueAccountId || null,
    }
    if (editing) body.id = editing.id
    try {
      const res = await fetch('/api/services', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); setSaving(false); return }
      setModalOpen(false); fetchServices()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/services?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); return }
      setDeleteConfirm(null); fetchServices()
    } catch { setError('Network error') }
  }

  // PWD discount preview calculation
  function calcPwdPreview() {
    const totalPrice = parseFloat(fPrice) || 0
    const doctor = parseFloat(fDoctorFee) || 0
    const clinic = parseFloat(fClinicFee) || 0

    if (!fHasDoctorFee || !fPwdClinicOnly) {
      // Standard 20% on total
      const discount = totalPrice * 0.20
      return { discount, finalPrice: totalPrice - discount, label: 'Standard PWD (20% on total)' }
    }
    // PWD only on clinic fee
    const discount = clinic * 0.20
    return { discount, finalPrice: doctor + clinic - discount, label: 'PWD on clinic fee only (20%)' }
  }

  /* ── Download Handler ───────────────────────────────────── */
  const handleDownloadServices = (format: 'xlsx' | 'pdf') => {
    const headers = ['Name', 'Department', 'Branch', 'Price', 'Price Type', 'Revenue Type', 'Doctor Fee', 'Clinic Fee', 'Has Doctor Fee', 'PWD Clinic Only', 'VIP Tier', 'Package Sessions', 'Status']
    const rows = services.map(s => [
      s.name, DEPT_LABELS[s.department] || s.department, BRANCH_LABELS[s.branch] || s.branch,
      formatCurrency(Number(s.price)), s.priceType, s.revenueType,
      s.doctorFee != null ? formatCurrency(Number(s.doctorFee)) : '', s.clinicFee != null ? formatCurrency(Number(s.clinicFee)) : '',
      s.hasDoctorFee ? 'Yes' : 'No', s.pwdDiscountClinicOnly ? 'Yes' : 'No',
      s.vipTier || '', s.packageSessions ?? '', s.isActive ? 'Active' : 'Inactive'
    ])
    if (format === 'xlsx') downloadXlsx('Services', [{ name: 'Services', headers, rows }])
    else downloadPdf({ title: 'Services', subtitle: `${rows.length} services`, headers, rows, landscape: true })
  }

  if (loading && !initialLoaded.current) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Services
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Manage clinic services, pricing, and PWD discount rules
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DownloadMenu onDownload={handleDownloadServices} label="Download" />
          {canWrite && (
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--teal)' }}>
              <Plus size={18} /> Add Service
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
          <input type="text" placeholder="Search services..." value={search}
            onChange={(e) => { setSearch(e.target.value); setSvcPage(1) }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none"
            style={{ borderColor: 'var(--light-gray)', background: 'white' }} />
        </div>
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <option value="">All Departments</option>
          {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <option value="">All Branches</option>
          {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </div>

      {/* Error */}
      {error && !modalOpen && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>
      )}

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--off-white)' }}>
                <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                  onClick={() => toggleSort('name')}>
                  <span className="flex items-center gap-1">Service Name <SortIcon field="name" /></span>
                </th>
                <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                  onClick={() => toggleSort('department')}>
                  <span className="flex items-center gap-1">Department <SortIcon field="department" /></span>
                </th>
                <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                  onClick={() => toggleSort('branch')}>
                  <span className="flex items-center gap-1">Branch <SortIcon field="branch" /></span>
                </th>
                <th className="text-right px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                  onClick={() => toggleSort('price')}>
                  <span className="flex items-center justify-end gap-1">Price <SortIcon field="price" /></span>
                </th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Pricing</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Revenue</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>PWD Rule</th>
                {canWrite && <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {services.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 8 : 7} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                    <Stethoscope size={32} className="mx-auto mb-2 opacity-40" />
                    <p>No services found</p>
                    {canWrite && <p className="text-xs mt-1">Add clinic services to get started</p>}
                  </td>
                </tr>
              ) : services.slice((svcPage - 1) * svcPageSize, svcPage * svcPageSize).map((s) => {
                const price = Number(s.price)
                const doctor = s.doctorFee != null ? Number(s.doctorFee) : null
                const clinic = s.clinicFee != null ? Number(s.clinicFee) : null
                const badge = DEPT_BADGE[s.department] || { bg: '#f3f4f6', color: '#374151' }

                return (
                  <tr key={s.id} className="border-t hover:bg-gray-50/50 transition-colors" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>
                      {s.name}
                      {s.revenueAccount && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--teal)' }}>{s.revenueAccount.accountNumber} {s.revenueAccount.accountTitle}</p>
                      )}
                      {s.description && <p className="text-xs mt-0.5 truncate max-w-[200px]" style={{ color: 'var(--mid-gray)' }}>{s.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-md text-xs font-medium" style={{ background: badge.bg, color: badge.color }}>
                        {DEPT_LABELS[s.department] || s.department}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {BRANCH_LABELS[s.branch] || s.branch}
                    </td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>
                      {formatCurrency(price)}
                      {s.hasDoctorFee && doctor != null && clinic != null && (
                        <div className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                          Dr: {formatCurrency(doctor)} + Clinic: {formatCurrency(clinic)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-md text-xs font-medium"
                        style={s.priceType === 'FIXED'
                          ? { background: '#f3f4f6', color: '#374151' }
                          : { background: '#fef3c7', color: '#92400e' }}>
                        {s.priceType === 'FIXED' ? 'Fixed' : 'Adjustable'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-md text-xs font-medium"
                        style={s.revenueType === 'EARNED'
                          ? { background: '#dcfce7', color: '#166534' }
                          : { background: '#fef3c7', color: '#92400e' }}>
                        {s.revenueType === 'EARNED' ? 'Sales' : s.walletType ? `${s.walletType.replace('_', ' ')}${s.packageSessions ? ` (${s.packageSessions}s)` : ''}` : 'Unearned'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {s.noPwdDiscount ? (
                        <span className="flex items-center gap-1 text-red-500 font-medium">
                          <XCircle size={12} /> No PWD Discount
                        </span>
                      ) : s.hasDoctorFee && s.pwdDiscountClinicOnly ? (
                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                          <AlertCircle size={12} /> Clinic fee only
                        </span>
                      ) : (
                        <span>Standard (20% total)</span>
                      )}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Edit">
                            <Pencil size={15} style={{ color: 'var(--teal)' }} />
                          </button>
                          <button onClick={() => setDeleteConfirm(s)} className="p-2 rounded-lg hover:bg-red-50 transition-colors" title="Delete">
                            <Trash2 size={15} className="text-red-500" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {services.length > 0 && (
          <Pagination totalItems={services.length} page={svcPage} pageSize={svcPageSize}
            onPageChange={setSvcPage} onPageSizeChange={setSvcPageSize} />
        )}
      </div>

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Deactivate Service</h3>
            <p className="text-sm mb-2" style={{ color: 'var(--mid-gray)' }}>
              <strong>{deleteConfirm.name}</strong> — {DEPT_LABELS[deleteConfirm.department]}
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--mid-gray)' }}>This will hide the service from active listings.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} className="px-4 py-2 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600">Deactivate</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                {editing ? 'Edit Service' : 'Add Service'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>

            {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Service Name */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Service Name</label>
                <input type="text" value={fName} onChange={(e) => setFName(e.target.value)} required
                  placeholder="e.g. Physical Therapy Session"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }} />
              </div>

              {/* Department + Branch */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Department</label>
                  <select value={fDept} onChange={(e) => setFDept(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--light-gray)' }}>
                    {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Branch</label>
                  <select value={fBranch} onChange={(e) => setFBranch(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--light-gray)' }}>
                    {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Price + Price Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                    Total Price (PHP) {fHasDoctorFee && <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(auto-calculated)</span>}
                  </label>
                  <input type="number" step="0.01" value={fPrice}
                    onChange={(e) => setFPrice(e.target.value)}
                    readOnly={fHasDoctorFee}
                    required placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--light-gray)', background: fHasDoctorFee ? 'var(--off-white)' : 'white' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Price Type</label>
                  <select value={fPriceType} onChange={(e) => setFPriceType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="FIXED">Fixed</option>
                    <option value="ADJUSTABLE">Adjustable by Cashier</option>
                  </select>
                </div>
              </div>

              {/* Revenue Type */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Revenue Classification</label>
                <select value={fRevenueType} onChange={(e) => setFRevenueType(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="EARNED">Earned Revenue (Sales — recognized immediately)</option>
                  <option value="UNEARNED">Unearned Revenue (Package / VIP / Downpayment — consumed later)</option>
                </select>
                {fRevenueType === 'UNEARNED' && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Wallet Type</label>
                      <select value={fWalletType} onChange={(e) => setFWalletType(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">— Select type —</option>
                        <option value="PACKAGE">Package (sessions-based)</option>
                        <option value="VIP">VIP Card</option>
                        <option value="PREPAID_CARD">Prepaid Card</option>
                        <option value="DOWNPAYMENT">Downpayment</option>
                        <option value="ADVANCE">Advance Payment</option>
                      </select>
                    </div>

                    {fWalletType === 'VIP' && (
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>VIP Tier</label>
                        <select value={fVipTier} onChange={(e) => setFVipTier(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                          style={{ borderColor: 'var(--light-gray)' }}>
                          <option value="">— Select tier —</option>
                          <option value="PLATINUM">Platinum</option>
                          <option value="GOLD">Gold</option>
                          <option value="SILVER">Silver</option>
                        </select>
                      </div>
                    )}

                    {fWalletType === 'PACKAGE' && (
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Number of Sessions</label>
                        <input type="number" min="1" value={fPackageSessions} onChange={(e) => setFPackageSessions(e.target.value)}
                          placeholder="e.g. 10"
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                          style={{ borderColor: 'var(--light-gray)' }} />
                        {fPackageSessions && fPrice && (
                          <p className="mt-1 text-xs" style={{ color: 'var(--deep-teal)' }}>
                            Per-session rate: {formatCurrency(parseFloat(fPrice) / (parseInt(fPackageSessions) || 1))}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Eligible Services Picker (PACKAGE + VIP) */}
                    {(fWalletType === 'PACKAGE' || fWalletType === 'VIP') && (
                      <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: fWalletType === 'VIP' ? '#c084fc' : 'var(--teal)', background: fWalletType === 'VIP' ? '#faf5ff' : 'var(--pale-teal)' }}>
                        <label className="block text-xs font-semibold" style={{ color: fWalletType === 'VIP' ? '#7c3aed' : 'var(--deep-teal)' }}>
                          {fWalletType === 'PACKAGE' ? 'Eligible Services (which services can use this package)' : 'Included Services (with discount per service)'}
                        </label>

                        {/* Search + Add */}
                        <div className="relative">
                          <input value={eligibleSearch} onChange={(e) => setEligibleSearch(e.target.value)}
                            placeholder="Search earned services to add..."
                            className="w-full px-3 py-2 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                          {eligibleSearch.length >= 2 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-36 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                              {services
                                .filter(s => s.revenueType === 'EARNED' && s.name.toLowerCase().includes(eligibleSearch.toLowerCase()) && !fEligibleServices.some(es => es.serviceId === s.id))
                                .slice(0, 15)
                                .map(s => (
                                  <button key={s.id} type="button" onClick={() => {
                                    setFEligibleServices(prev => [...prev, { serviceId: s.id, discountPercent: 0 }])
                                    setEligibleSearch('')
                                  }}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex justify-between" style={{ color: 'var(--charcoal)' }}>
                                    <span>{s.name} <span className="text-xs px-1 py-0.5 rounded" style={{ background: '#f3e8ff', color: '#6b21a8' }}>{s.department}</span></span>
                                    <span style={{ color: 'var(--teal)' }}>{formatCurrency(Number(s.price))}</span>
                                  </button>
                                ))}
                              {services.filter(s => s.revenueType === 'EARNED' && s.name.toLowerCase().includes(eligibleSearch.toLowerCase()) && !fEligibleServices.some(es => es.serviceId === s.id)).length === 0 && (
                                <p className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>No matching earned services found</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Selected Services */}
                        {fEligibleServices.length === 0 ? (
                          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                            {fWalletType === 'PACKAGE' ? 'No services selected — all earned services will be eligible by default.' : 'No services added — add services to set per-service discounts.'}
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {fEligibleServices.map((es, idx) => {
                              const svc = services.find(s => s.id === es.serviceId)
                              return (
                                <div key={es.serviceId} className="flex items-center gap-2 p-2 rounded-lg bg-white text-xs">
                                  <span className="flex-1 font-medium" style={{ color: 'var(--charcoal)' }}>
                                    {svc?.name || 'Unknown'} <span className="px-1 py-0.5 rounded" style={{ background: '#f3e8ff', color: '#6b21a8' }}>{svc?.department}</span>
                                  </span>
                                  {fWalletType === 'VIP' && (
                                    <div className="flex items-center gap-1">
                                      <input type="number" min={0} max={100} step="0.5" value={es.discountPercent || ''}
                                        onChange={(e) => setFEligibleServices(prev => prev.map((x, i) => i === idx ? { ...x, discountPercent: parseFloat(e.target.value) || 0 } : x))}
                                        placeholder="%" className="w-16 px-2 py-1 rounded border text-xs text-right outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                                      <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>%</span>
                                    </div>
                                  )}
                                  <button type="button" onClick={() => setFEligibleServices(prev => prev.filter((_, i) => i !== idx))}
                                    className="p-1 rounded hover:bg-red-50">
                                    <X size={12} className="text-red-500" />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-xs px-1" style={{ color: '#92400e' }}>
                      {fWalletType === 'PACKAGE'
                        ? `This service will create a Package wallet. Each session used will record ${fPackageSessions ? formatCurrency(parseFloat(fPrice || '0') / (parseInt(fPackageSessions) || 1)) : '—'} as earned revenue.`
                        : fWalletType === 'VIP'
                          ? 'This VIP card will auto-apply the set discounts when the barcode is scanned during checkout.'
                          : fWalletType
                            ? `A ${fWalletType.replace('_', ' ')} digital wallet will be auto-created for the patient during checkout.`
                            : 'This service will be classified as Unearned Revenue (liability) until sessions are consumed.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Doctor Fee Toggle */}
              <div className="p-3 rounded-xl border" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--charcoal)' }}>
                  <input type="checkbox" checked={fHasDoctorFee}
                    onChange={(e) => {
                      setFHasDoctorFee(e.target.checked)
                      if (!e.target.checked) { setFDoctorFee(''); setFClinicFee(''); setFPwdClinicOnly(false) }
                    }}
                    className="rounded" />
                  This service has a separate Doctor Fee + Clinic Fee
                </label>

                {fHasDoctorFee && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Doctor&apos;s Fee (PHP)</label>
                        <input type="number" step="0.01" value={fDoctorFee}
                          onChange={(e) => setFDoctorFee(e.target.value)}
                          placeholder="e.g. 3000" required
                          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                          style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Clinic Fee (PHP)</label>
                        <input type="number" step="0.01" value={fClinicFee}
                          onChange={(e) => setFClinicFee(e.target.value)}
                          placeholder="e.g. 800" required
                          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                          style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                    </div>

                    {/* PWD Discount Rule */}
                    <div className="p-3 rounded-lg border" style={{ borderColor: '#fcd34d', background: '#fffbeb' }}>
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer" style={{ color: '#92400e' }}>
                        <input type="checkbox" checked={fPwdClinicOnly}
                          onChange={(e) => setFPwdClinicOnly(e.target.checked)}
                          className="rounded" />
                        PWD 20% discount applies to clinic fee only (doctor does not accept PWD discount)
                      </label>

                      {/* PWD Preview */}
                      {fPrice && (
                        <div className="mt-2 text-xs space-y-1" style={{ color: '#78350f' }}>
                          {(() => {
                            const { discount, finalPrice, label } = calcPwdPreview()
                            return (
                              <>
                                <div className="font-medium">{label}</div>
                                <div>Total Price: {formatCurrency(Number(fPrice))}</div>
                                <div>PWD Discount: -{formatCurrency(discount)}</div>
                                <div className="font-semibold">Patient Pays: {formatCurrency(finalPrice)}</div>
                              </>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* No PWD Discount Toggle */}
              <div className="p-3 rounded-xl border" style={{ borderColor: fNoPwdDiscount ? '#fca5a5' : 'var(--light-gray)', background: fNoPwdDiscount ? '#fef2f2' : 'var(--off-white)' }}>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: fNoPwdDiscount ? '#991b1b' : 'var(--charcoal)' }}>
                  <input type="checkbox" checked={fNoPwdDiscount}
                    onChange={(e) => setFNoPwdDiscount(e.target.checked)}
                    className="rounded" />
                  No PWD/Senior Citizen Discount
                </label>
                {fNoPwdDiscount && (
                  <p className="mt-1.5 text-xs" style={{ color: '#991b1b' }}>
                    When this service is added to an order, the PWD/SC discount checkbox will be disabled at checkout.
                  </p>
                )}
              </div>

              {/* Description */}
              {/* Revenue Account (COA) */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Revenue Account <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(Chart of Accounts)</span>
                </label>
                <select value={fRevenueAccountId} onChange={(e) => setFRevenueAccountId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">— Not assigned —</option>
                  {revenueAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.accountNumber} {a.accountTitle}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Description <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(optional)</span>
                </label>
                <textarea value={fDescription} onChange={(e) => setFDescription(e.target.value)}
                  rows={2} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none"
                  style={{ borderColor: 'var(--light-gray)' }} />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'var(--teal)' }}>
                  {saving ? 'Saving...' : editing ? 'Update Service' : 'Add Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
