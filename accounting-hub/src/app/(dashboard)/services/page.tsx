'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { userBranchScope } from '@/lib/branch-scope'
import { useSession } from 'next-auth/react'
import {
  Plus, Pencil, Trash2, X, Search, Stethoscope,
  ArrowUpDown, ChevronUp, ChevronDown, AlertCircle, XCircle, FileCheck, History, Loader2,
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
  issuedOfficialInvoice: boolean
  isHmoGl?: boolean
  recognitionMonths?: number | null
  hmoPaysClinicianDirect?: boolean
  newPrice?: string | number | null
  newPriceEffectiveDate?: string | null
  branchPrices?: { id?: string; branch: string; price: string | number; newPrice?: string | number | null; newPriceEffectiveDate?: string | null }[]
  description: string | null
  revenueAccountId: string | null
  revenueAccount?: { id: string; accountNumber: string; accountTitle: string } | null
  unitPayId?: string | null
  unitPay?: { id: string; name: string } | null
  unitPayEnabled?: boolean
  thresholdCounted?: boolean
  thresholdQty?: number
  isActive: boolean
  createdAt: string
  eligibleFor?: { eligibleService: { id: string; name: string; department: string; price: string | number }; discountPercent?: number | string | null; sessionCost?: number | string | null }[]
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
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
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
  // ── Price history ────────────────────────────────────────
  type PriceRow = { id: string; field: string; branch: string | null; oldValue: number | null; newValue: number | null; source: string; note: string | null; changedAt: string; by: string | null }
  type OlderEdit = { changedAt: string; by: string | null; fields: string[] }
  const [phService, setPhService] = useState<{ id: string; name: string } | null>(null)
  const [phRows, setPhRows] = useState<PriceRow[] | null>(null)
  const [phOlder, setPhOlder] = useState<OlderEdit[]>([])
  const [phLoading, setPhLoading] = useState(false)

  async function openPriceHistory(svc: { id: string; name: string }) {
    setPhService(svc); setPhRows(null); setPhOlder([]); setPhLoading(true)
    try {
      const res = await fetch(`/api/services/${svc.id}/price-history`)
      if (res.ok) {
        const d = await res.json()
        setPhRows(d.history ?? [])
        setPhOlder(d.olderEdits ?? [])
      } else setPhRows([])
    } catch { setPhRows([]) }
    finally { setPhLoading(false) }
  }

  const { data: session } = useSession()
  const sessionUserId = session?.user?.id as string | undefined
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoaded = useRef(false)
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const isFrontDesk = session?.user?.role && ['AHEA_FRONTDESK', 'AHGH_FRONTDESK'].includes(session.user.role as string)
  const userBranch = session?.user?.branch as string | undefined
  const scope = userBranchScope(userBranch)
  // Any branch-locked user (or front desk) is pinned to their branch.
  const lockBranch = scope.enum || (isFrontDesk ? userBranch : null) || null
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
  const [fNewPrice, setFNewPrice] = useState('')
  const [fNewPriceDate, setFNewPriceDate] = useState('')
  const [fBranchPrices, setFBranchPrices] = useState<{ branch: string; price: string; newPrice: string; newPriceDate: string }[]>([])
  const [fPriceType, setFPriceType] = useState('FIXED')
  const [fRevenueType, setFRevenueType] = useState('EARNED')
  const [fHasDoctorFee, setFHasDoctorFee] = useState(false)
  const [fDoctorFee, setFDoctorFee] = useState('')
  const [fClinicFee, setFClinicFee] = useState('')
  const [fPwdClinicOnly, setFPwdClinicOnly] = useState(false)
  const [fNoPwdDiscount, setFNoPwdDiscount] = useState(false)
  const [fIssuedOfficialInvoice, setFIssuedOfficialInvoice] = useState(false)
  const [fIsHmoGl, setFIsHmoGl] = useState(false)
  const [fRecognitionMonths, setFRecognitionMonths] = useState('')
  const [fHmoDirect, setFHmoDirect] = useState(false)
  const [fDescription, setFDescription] = useState('')
  const [fWalletType, setFWalletType] = useState('')
  const [fVipTier, setFVipTier] = useState('')
  const [fPackageSessions, setFPackageSessions] = useState('')
  const [fRevenueAccountId, setFRevenueAccountId] = useState('')
  const [fRevenueAccountSearch, setFRevenueAccountSearch] = useState('')
  const [revenueAccounts, setRevenueAccounts] = useState<RevenueAccount[]>([])
  const [fUnitPayId, setFUnitPayId] = useState('')
  const [fUnitPayEnabled, setFUnitPayEnabled] = useState(true)
  const [fThresholdCounted, setFThresholdCounted] = useState(false)
  const [fThresholdQty, setFThresholdQty] = useState('1')
  const [unitPays, setUnitPays] = useState<{ id: string; name: string }[]>([])
  const [fEligibleServices, setFEligibleServices] = useState<{ serviceId: string; discountPercent: number; sessionCost: number; name?: string; department?: string }[]>([])
  const [eligibleSearch, setEligibleSearch] = useState('')
  const [eligibleResults, setEligibleResults] = useState<Service[]>([])
  const [eligibleLoading, setEligibleLoading] = useState(false)

  const canWrite = session?.user?.role && ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN'].includes(session.user.role as string)

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

  // Lock branch filter for branch-locked users (single-branch assignment or front desk)
  useEffect(() => {
    if (lockBranch && filterBranch !== lockBranch) {
      setFilterBranch(lockBranch)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockBranch])

  // Initial load
  useEffect(() => {
    if (!sessionUserId || initialLoaded.current) return
    // Wait for branch to be set for locked users before first fetch
    if (lockBranch && !filterBranch) return
    initialLoaded.current = true
    fetchServices()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId, filterBranch])

  // Fetch revenue + liability accounts for COA dropdown (liability for unearned revenue / packages)
  useEffect(() => {
    if (!sessionUserId) return
    const mapAccounts = (d: { data?: RevenueAccount[] }) =>
      (d.data || []).map((a) => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle }))
    Promise.all([
      fetch('/api/chart-of-accounts?accountType=REVENUE&pageSize=500').then(r => r.json()),
      fetch('/api/chart-of-accounts?accountType=LIABILITY&pageSize=500').then(r => r.json()),
    ]).then(([rev, liab]) => setRevenueAccounts([...mapAccounts(rev), ...mapAccounts(liab)])).catch(() => {})
    // Fetch unit pay types for payroll tagging
    fetch('/api/payroll/unit-pay').then(r => r.json())
      .then(d => setUnitPays((d || []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name }))))
      .catch(() => {})
  }, [sessionUserId])

  // Refetch on filter/sort changes (debounced, only after initial load)
  useEffect(() => {
    if (!initialLoaded.current) return
    const timeout = setTimeout(() => { fetchServices() }, 300)
    return () => clearTimeout(timeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterDept, filterBranch, sortField, sortDir])

  // Search earned services for eligible services picker (independent of table filters)
  useEffect(() => {
    if (eligibleSearch.length < 2) { setEligibleResults([]); return }
    setEligibleLoading(true)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/services?revenueType=EARNED&search=${encodeURIComponent(eligibleSearch)}&pageSize=20&sortField=name&sortDir=asc`)
        const data = await res.json()
        setEligibleResults((data.data || []).filter((s: Service) => !fEligibleServices.some(es => es.serviceId === s.id)))
      } catch { setEligibleResults([]) }
      finally { setEligibleLoading(false) }
    }, 250)
    return () => clearTimeout(timeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleSearch])

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
    setFName(''); setFDept('PT'); setFBranch('ALL'); setFPrice(''); setFNewPrice(''); setFNewPriceDate(''); setFBranchPrices([])
    setFPriceType('FIXED'); setFRevenueType('EARNED'); setFHasDoctorFee(false); setFDoctorFee('')
    setFClinicFee(''); setFPwdClinicOnly(false); setFNoPwdDiscount(false); setFIssuedOfficialInvoice(false); setFIsHmoGl(false); setFHmoDirect(false); setFRecognitionMonths(''); setFDescription('')
    setFWalletType(''); setFVipTier(''); setFPackageSessions(''); setFRevenueAccountId(''); setFRevenueAccountSearch(''); setFUnitPayId(''); setFUnitPayEnabled(false); setFThresholdCounted(false); setFThresholdQty('1'); setFEligibleServices([]); setEligibleSearch(''); setEligibleResults([])
    setError(''); setModalOpen(true)
  }

  function openEdit(s: Service) {
    setEditing(s)
    setFName(s.name); setFDept(s.department); setFBranch(s.branch)
    setFPrice(String(s.price)); setFNewPrice(s.newPrice != null ? String(s.newPrice) : ''); setFNewPriceDate(s.newPriceEffectiveDate ? String(s.newPriceEffectiveDate).split('T')[0] : '')
    setFBranchPrices((s.branchPrices || []).map(bp => ({ branch: bp.branch, price: String(bp.price), newPrice: bp.newPrice != null ? String(bp.newPrice) : '', newPriceDate: bp.newPriceEffectiveDate ? String(bp.newPriceEffectiveDate).split('T')[0] : '' })))
    setFPriceType(s.priceType); setFRevenueType(s.revenueType)
    setFHasDoctorFee(s.hasDoctorFee)
    setFDoctorFee(s.doctorFee != null ? String(s.doctorFee) : '')
    setFClinicFee(s.clinicFee != null ? String(s.clinicFee) : '')
    setFPwdClinicOnly(s.pwdDiscountClinicOnly)
    setFNoPwdDiscount(s.noPwdDiscount)
    setFIssuedOfficialInvoice(s.issuedOfficialInvoice)
    setFIsHmoGl(!!s.isHmoGl)
    setFRecognitionMonths(s.recognitionMonths ? String(s.recognitionMonths) : '')
    setFHmoDirect(!!s.hmoPaysClinicianDirect)
    setFDescription(s.description || '')
    setFWalletType(s.walletType || '')
    setFVipTier(s.vipTier || '')
    setFPackageSessions(s.packageSessions != null ? String(s.packageSessions) : '')
    setFRevenueAccountId(s.revenueAccountId || '')
    setFRevenueAccountSearch(s.revenueAccount ? `${s.revenueAccount.accountNumber} ${s.revenueAccount.accountTitle}` : '')
    setFUnitPayId(s.unitPayId || '')
    setFUnitPayEnabled(!!s.unitPayId && s.unitPayEnabled !== false)
    setFThresholdCounted(!!s.thresholdCounted)
    setFThresholdQty(String(s.thresholdQty ?? 1))
    setFEligibleServices(
      (s.eligibleFor || []).map((e: { eligibleService: { id: string; name: string; department: string }; discountPercent?: number | string | null; sessionCost?: number | string | null }) => ({
        serviceId: e.eligibleService.id,
        name: e.eligibleService.name,
        department: e.eligibleService.department,
        discountPercent: Number(e.discountPercent) || 0,
        sessionCost: Number(e.sessionCost) || 1,
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
      issuedOfficialInvoice: fIssuedOfficialInvoice,
      isHmoGl: fIsHmoGl,
      recognitionMonths: fRecognitionMonths ? parseInt(fRecognitionMonths, 10) : null,
      hmoPaysClinicianDirect: fHmoDirect,
      description: fDescription,
      revenueAccountId: fRevenueAccountId || null,
      unitPayId: fUnitPayEnabled ? (fUnitPayId || null) : null,
      unitPayEnabled: fUnitPayEnabled,
      thresholdCounted: fThresholdCounted,
      thresholdQty: fThresholdCounted ? (parseFloat(fThresholdQty) || 1) : 1,
      newPrice: fNewPrice || null,
      newPriceEffectiveDate: fNewPriceDate || null,
      branchPrices: fBranch === 'ALL' ? fBranchPrices.filter(bp => bp.price).map(bp => ({ branch: bp.branch, price: bp.price, newPrice: bp.newPrice || null, newPriceEffectiveDate: bp.newPriceDate || null })) : [],
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
  const [taggingHmoGl, setTaggingHmoGl] = useState(false)
  const autoTagHmoGl = async () => {
    if (!confirm('Tag all PT/OT/SLP HMO services (AMAPHIL, PHILCARE, SUNLIFE, …) and GL services ("- OP") as HMO/GL? Their sales will post as Receivables Sales.')) return
    setTaggingHmoGl(true)
    try {
      const r = await fetch('/api/services/auto-tag-hmogl', { method: 'POST' })
      if (!r.ok) { alert('Failed to auto-tag.'); return }
      const d = await r.json()
      alert(`Matched ${d.matched} HMO/GL service(s); newly tagged ${d.newlyTagged?.length ?? 0}.${d.newlyTagged?.length ? '\n\n' + d.newlyTagged.slice(0, 40).join('\n') + (d.newlyTagged.length > 40 ? `\n…and ${d.newlyTagged.length - 40} more` : '') : ''}`)
      fetchServices()
    } finally { setTaggingHmoGl(false) }
  }

  const handleDownloadServices = (format: 'xlsx' | 'pdf') => {
    // Determine the effective branch for price resolution
    const effectiveBranch = filterBranch || (isFrontDesk ? userBranch : '') || ''

    // Resolve branch-specific price for a service
    const resolvePrice = (s: Service): { price: number; newPrice: number | null } => {
      if (effectiveBranch && s.branchPrices?.length) {
        const bp = s.branchPrices.find(b => b.branch === effectiveBranch)
        if (bp) return { price: Number(bp.price), newPrice: bp.newPrice != null ? Number(bp.newPrice) : null }
      }
      return { price: Number(s.price), newPrice: s.newPrice != null ? Number(s.newPrice) : null }
    }

    // Build subtitle reflecting active filters
    const subtitleParts: string[] = []
    if (effectiveBranch) subtitleParts.push(BRANCH_LABELS[effectiveBranch] || effectiveBranch)
    if (filterDept) subtitleParts.push(DEPT_LABELS[filterDept] || filterDept)
    const subtitle = subtitleParts.length ? subtitleParts.join(' · ') : 'All Branches'

    const headers = ['Name', 'Department', 'Branch', 'Price', 'New Price', 'Price Type', 'Revenue Type', 'Doctor Fee', 'Clinic Fee', 'PWD Rule', 'Status']
    const rows = services.map(s => {
      const { price, newPrice } = resolvePrice(s)
      const pwdRule = s.noPwdDiscount ? 'No PWD Discount' : s.hasDoctorFee && s.pwdDiscountClinicOnly ? 'Clinic fee only (20%)' : 'Standard (20% total)'
      return [
        s.name,
        DEPT_LABELS[s.department] || s.department,
        BRANCH_LABELS[s.branch] || s.branch,
        formatCurrency(price),
        newPrice != null && newPrice > 0 ? formatCurrency(newPrice) : '',
        s.priceType === 'FIXED' ? 'Fixed' : 'Adjustable',
        s.revenueType === 'EARNED' ? 'Sales' : s.walletType ? s.walletType.replace('_', ' ') : 'Unearned',
        s.doctorFee != null ? formatCurrency(Number(s.doctorFee)) : '',
        s.clinicFee != null ? formatCurrency(Number(s.clinicFee)) : '',
        pwdRule,
        s.isActive ? 'Active' : 'Inactive',
      ]
    })

    const title = effectiveBranch ? `Services — ${BRANCH_LABELS[effectiveBranch] || effectiveBranch}` : 'Services'
    if (format === 'xlsx') downloadXlsx(title, [{ name: 'Services', headers, rows }])
    else downloadPdf({ title, subtitle: `${rows.length} services · ${subtitle}`, headers, rows, landscape: true })
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
            <button onClick={autoTagHmoGl} disabled={taggingHmoGl}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }} title="Tag PT/OT/SLP HMO providers + '- OP' GL services as HMO/GL">
              {taggingHmoGl ? '…' : 'Auto-tag HMO/GL'}
            </button>
          )}
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
        {isFrontDesk ? (
          <span className="px-3 py-2.5 rounded-xl border text-sm"
            style={{ borderColor: 'var(--light-gray)', background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
            {BRANCHES.find(b => b.value === filterBranch)?.label || filterBranch}
          </span>
        ) : (
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} disabled={!!lockBranch}
            className="px-3 py-2.5 rounded-xl border text-sm outline-none"
            style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            {!lockBranch && <option value="">All Branches</option>}
            {(lockBranch ? BRANCHES.filter(b => b.value === lockBranch) : BRANCHES).map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        )}
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
                <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
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
                      <span className="flex items-center gap-1.5">
                        {s.name}
                        {s.issuedOfficialInvoice && (
                          <span title="Issued Official Sales Invoice" className="flex-shrink-0"><FileCheck size={14} style={{ color: '#16a34a' }} /></span>
                        )}
                      </span>
                      {s.revenueAccount && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--teal)' }}>{s.revenueAccount.accountNumber} {s.revenueAccount.accountTitle}</p>
                      )}
                      {s.unitPay && (
                        <p className="text-xs mt-0.5" style={{ color: s.unitPayEnabled === false ? 'var(--mid-gray)' : 'var(--gold)' }}>
                          Unit Pay: {s.unitPay.name}{s.unitPayEnabled === false ? ' (disabled)' : ''}
                        </p>
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
                      {s.newPrice != null && Number(s.newPrice) > 0 && (
                        <div className="text-xs mt-0.5" style={{ color: '#2563eb' }}>
                          → {formatCurrency(Number(s.newPrice))}
                          {s.newPriceEffectiveDate && <span className="ml-1" style={{ color: 'var(--mid-gray)' }}>({new Date(s.newPriceEffectiveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})</span>}
                        </div>
                      )}
                      {s.branchPrices && s.branchPrices.length > 0 && (
                        <div className="text-xs mt-1 space-y-0.5">
                          {s.branchPrices.map(bp => (
                            <div key={bp.branch} style={{ color: 'var(--mid-gray)' }}>
                              {bp.branch === 'SANDBOX_EAST' ? 'East' : 'GH'}: {formatCurrency(Number(bp.price))}
                              {bp.newPrice != null && Number(bp.newPrice) > 0 && (
                                <span style={{ color: '#2563eb' }}> → {formatCurrency(Number(bp.newPrice))}</span>
                              )}
                            </div>
                          ))}
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
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openPriceHistory(s)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Price History">
                          <History size={15} style={{ color: 'var(--mid-gray)' }} />
                        </button>
                        {canWrite && (
                          <>
                            <button onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Edit">
                              <Pencil size={15} style={{ color: 'var(--teal)' }} />
                            </button>
                            <button onClick={() => setDeleteConfirm(s)} className="p-2 rounded-lg hover:bg-red-50 transition-colors" title="Delete">
                              <Trash2 size={15} className="text-red-500" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
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
              {(() => {
                const hasBP = fBranch === 'ALL' && fBranchPrices.some(bp => bp.price)
                const priceDisabled = fHasDoctorFee || hasBP
                return (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: hasBP ? 'var(--mid-gray)' : 'var(--charcoal)' }}>
                    Total Price (PHP) {fHasDoctorFee && <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(auto-calculated)</span>}
                    {hasBP && <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(per-branch)</span>}
                  </label>
                  <input type="number" step="0.01" value={fPrice}
                    onChange={(e) => setFPrice(e.target.value)}
                    readOnly={priceDisabled}
                    required={!hasBP} placeholder={hasBP ? 'Using per-branch prices' : '0.00'}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--light-gray)', background: priceDisabled ? 'var(--off-white)' : 'white' }} />
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
                )
              })()}

              {/* New Price + Effective Date */}
              {(() => {
                const hasBranchPricing = fBranch === 'ALL' && fBranchPrices.some(bp => bp.price)
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: hasBranchPricing ? 'var(--mid-gray)' : 'var(--charcoal)' }}>New Price (PHP)</label>
                        <input type="number" step="0.01" value={fNewPrice} onChange={(e) => setFNewPrice(e.target.value)}
                          placeholder={hasBranchPricing ? 'Using per-branch prices' : 'Leave blank if no change'}
                          disabled={hasBranchPricing}
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                          style={{ borderColor: 'var(--light-gray)', background: hasBranchPricing ? 'var(--off-white)' : 'white' }} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: hasBranchPricing ? 'var(--mid-gray)' : 'var(--charcoal)' }}>Effective Date</label>
                        <input type="date" value={fNewPriceDate} onChange={(e) => setFNewPriceDate(e.target.value)}
                          disabled={hasBranchPricing}
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                          style={{ borderColor: 'var(--light-gray)', background: hasBranchPricing ? 'var(--off-white)' : 'white' }} />
                      </div>
                    </div>
                    {fNewPrice && !hasBranchPricing && <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>When the effective date arrives, the current price will become the old price and the new price will take effect.</p>}
                    {hasBranchPricing && <p className="text-xs" style={{ color: '#3730a3' }}>General price fields disabled — using per-branch pricing below.</p>}
                  </>
                )
              })()}

              {/* Per-branch pricing (only for ALL-branch services) */}
              {fBranch === 'ALL' && (
                <div className="p-3 rounded-xl border" style={{ borderColor: '#e0e7ff', background: '#f8faff' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#3730a3' }}>Per-Branch Price Overrides</p>
                  <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>Leave blank to use the default price above for that branch.</p>
                  {['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'AURA_INSTITUTE'].map(br => {
                    const bp = fBranchPrices.find(b => b.branch === br) || { branch: br, price: '', newPrice: '', newPriceDate: '' }
                    const update = (field: string, val: string) => {
                      setFBranchPrices(prev => {
                        const existing = prev.find(b => b.branch === br)
                        if (existing) return prev.map(b => b.branch === br ? { ...b, [field]: val } : b)
                        return [...prev, { branch: br, price: '', newPrice: '', newPriceDate: '', [field]: val }]
                      })
                    }
                    return (
                      <div key={br} className="mb-2 last:mb-0">
                        <p className="text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>{br === 'SANDBOX_EAST' ? 'East Branch' : 'Greenhills Branch'}</p>
                        <div className="grid grid-cols-3 gap-2">
                          <input type="number" step="0.01" value={bp.price} onChange={(e) => update('price', e.target.value)}
                            placeholder="Price" className="px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                          <input type="number" step="0.01" value={bp.newPrice} onChange={(e) => update('newPrice', e.target.value)}
                            placeholder="New Price" className="px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                          <input type="date" value={bp.newPriceDate} onChange={(e) => update('newPriceDate', e.target.value)}
                            className="px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

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
                      <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: fWalletType === 'VIP' ? '#FFBA6B' : 'var(--teal)', background: fWalletType === 'VIP' ? '#F9F2EB' : 'var(--pale-teal)' }}>
                        <label className="block text-xs font-semibold" style={{ color: fWalletType === 'VIP' ? 'var(--gold)' : 'var(--deep-teal)' }}>
                          {fWalletType === 'PACKAGE' ? 'Eligible Services (which services can use this package)' : 'Included Services (with discount per service)'}
                        </label>

                        {/* Search + Add */}
                        <div className="relative">
                          <input value={eligibleSearch} onChange={(e) => setEligibleSearch(e.target.value)}
                            placeholder="Search earned services to add..."
                            className="w-full px-3 py-2 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                          {eligibleSearch.length >= 2 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-36 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                              {eligibleLoading ? (
                                <p className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>Searching...</p>
                              ) : eligibleResults.length === 0 ? (
                                <p className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>No matching earned services found</p>
                              ) : eligibleResults.map(s => (
                                  <button key={s.id} type="button" onClick={() => {
                                    setFEligibleServices(prev => [...prev, { serviceId: s.id, name: s.name, department: s.department, discountPercent: 0, sessionCost: 1 }])
                                    setEligibleSearch('')
                                    setEligibleResults([])
                                  }}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex justify-between" style={{ color: 'var(--charcoal)' }}>
                                    <span>{s.name} <span className="text-xs px-1 py-0.5 rounded" style={{ background: '#f3e8ff', color: '#6b21a8' }}>{s.department}</span></span>
                                    <span style={{ color: 'var(--teal)' }}>{formatCurrency(Number(s.price))}</span>
                                  </button>
                                ))}
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
                              const svcName = es.name || services.find(s => s.id === es.serviceId)?.name || 'Unknown'
                              const svcDept = es.department || services.find(s => s.id === es.serviceId)?.department || ''
                              return (
                                <div key={es.serviceId} className="flex items-center gap-2 p-2 rounded-lg bg-white text-xs">
                                  <span className="flex-1 font-medium" style={{ color: 'var(--charcoal)' }}>
                                    {svcName} {svcDept && <span className="px-1 py-0.5 rounded" style={{ background: '#f3e8ff', color: '#6b21a8' }}>{svcDept}</span>}
                                  </span>
                                  {fWalletType === 'VIP' && (
                                    <div className="flex items-center gap-1">
                                      <input type="number" min={0} max={100} step="0.5" value={es.discountPercent || ''}
                                        onChange={(e) => setFEligibleServices(prev => prev.map((x, i) => i === idx ? { ...x, discountPercent: parseFloat(e.target.value) || 0 } : x))}
                                        placeholder="%" className="w-16 px-2 py-1 rounded border text-xs text-right outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                                      <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>%</span>
                                    </div>
                                  )}
                                  {fWalletType === 'PACKAGE' && (
                                    <div className="flex items-center gap-1" title="Sessions deducted from the package each time this service is availed (0.5 steps)">
                                      <input type="number" min={0.5} step="0.5" value={es.sessionCost || ''}
                                        onChange={(e) => setFEligibleServices(prev => prev.map((x, i) => i === idx ? { ...x, sessionCost: parseFloat(e.target.value) || 0 } : x))}
                                        onBlur={() => setFEligibleServices(prev => prev.map((x, i) => i === idx ? { ...x, sessionCost: Math.max(0.5, Math.round((x.sessionCost || 1) * 2) / 2) } : x))}
                                        className="w-16 px-2 py-1 rounded border text-xs text-right outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                                      <span className="text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>session{(es.sessionCost || 1) !== 1 ? 's' : ''}</span>
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

              {/* Issued Official Sales Invoice */}
              <div className="p-3 rounded-xl border" style={{ borderColor: fIssuedOfficialInvoice ? '#86efac' : 'var(--light-gray)', background: fIssuedOfficialInvoice ? '#f0fdf4' : 'var(--off-white)' }}>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: fIssuedOfficialInvoice ? '#166534' : 'var(--charcoal)' }}>
                  <input type="checkbox" checked={fIssuedOfficialInvoice}
                    onChange={(e) => setFIssuedOfficialInvoice(e.target.checked)}
                    className="rounded" />
                  Issued Official Sales Invoice
                </label>
                {fIssuedOfficialInvoice && (
                  <p className="mt-1.5 text-xs" style={{ color: '#166534' }}>
                    This service will be marked as having an official sales invoice in the Sales Summary.
                  </p>
                )}
              </div>

              <div className="p-3 rounded-xl border" style={{ borderColor: fIsHmoGl ? '#fdba74' : 'var(--light-gray)', background: fIsHmoGl ? '#fff7ed' : 'var(--off-white)' }}>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: fIsHmoGl ? '#9a3412' : 'var(--charcoal)' }}>
                  <input type="checkbox" checked={fIsHmoGl}
                    onChange={(e) => setFIsHmoGl(e.target.checked)}
                    className="rounded" />
                  This service is HMO / Guarantee Letter
                </label>
                {fIsHmoGl && (
                  <p className="mt-1.5 text-xs" style={{ color: '#9a3412' }}>
                    Sales of this service are receivables — they show under &ldquo;Receivables Sales&rdquo; in the income statement.
                  </p>
                )}
                <label className="mt-2 flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: fHmoDirect ? '#9a3412' : 'var(--charcoal)' }}>
                  <input type="checkbox" checked={fHmoDirect}
                    onChange={(e) => setFHmoDirect(e.target.checked)}
                    className="rounded" />
                  If HMO, pays directly to the clinician
                </label>
                {fHmoDirect && (
                  <p className="mt-1.5 text-xs" style={{ color: '#9a3412' }}>
                    The HMO settles these sessions with the clinician, not with us — they are monitored separately in Accounts Receivable (retroactively) and excluded from our AR totals and aging.
                  </p>
                )}
              </div>

              {/* Period-fee recognition (tuition): revenue earned over N months */}
              <div className="p-3 rounded-xl border" style={{ borderColor: fRecognitionMonths ? '#93c5fd' : 'var(--light-gray)', background: fRecognitionMonths ? '#eff6ff' : 'var(--off-white)' }}>
                <label className="block text-sm font-medium" style={{ color: fRecognitionMonths ? '#1e40af' : 'var(--charcoal)' }}>
                  Tuition / period fee — recognize over
                  <input type="number" min={2} max={24} value={fRecognitionMonths}
                    onChange={(e) => setFRecognitionMonths(e.target.value)}
                    placeholder="—"
                    className="mx-2 w-16 px-2 py-1 rounded-lg border text-sm text-center outline-none bg-white"
                    style={{ borderColor: 'var(--light-gray)' }} />
                  months
                </label>
                <p className="mt-1.5 text-xs" style={{ color: fRecognitionMonths ? '#1e40af' : 'var(--mid-gray)' }}>
                  Leave blank for normal services (revenue on payment day). Set for period fees the payer owes
                  whether or not they attend: the reports recognize one part per covered month, starting the payment
                  month, and hold the rest as Unearned Revenue. Tuition: annual 10, biannual 5, monthly blank.
                </p>
              </div>

              {/* Revenue Account (COA) — searchable */}
              <div className="relative">
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Revenue Account <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(Credit on checkout)</span>
                </label>
                <input
                  type="text"
                  value={fRevenueAccountSearch}
                  onChange={(e) => { setFRevenueAccountSearch(e.target.value); if (!e.target.value) setFRevenueAccountId('') }}
                  placeholder="Search account..."
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: fRevenueAccountId ? 'var(--teal)' : 'var(--light-gray)', background: fRevenueAccountId ? '#f0fdfa' : 'white' }}
                />
                {fRevenueAccountId && (
                  <button type="button" onClick={() => { setFRevenueAccountId(''); setFRevenueAccountSearch('') }}
                    className="absolute right-2 top-8 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                )}
                {fRevenueAccountSearch && !fRevenueAccountId && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                    {revenueAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(fRevenueAccountSearch.toLowerCase())).slice(0, 10).map(a => (
                      <button key={a.id} type="button" onClick={() => { setFRevenueAccountId(a.id); setFRevenueAccountSearch(`${a.accountNumber} ${a.accountTitle}`) }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                        <span className="font-mono font-medium" style={{ color: 'var(--teal)' }}>{a.accountNumber}</span> {a.accountTitle}
                      </button>
                    ))}
                    {revenueAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(fRevenueAccountSearch.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>No matching accounts</p>
                    )}
                  </div>
                )}
              </div>

              {/* Unit Pay (for payroll tagging) */}
              <div>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" checked={fUnitPayEnabled}
                    onChange={e => { setFUnitPayEnabled(e.target.checked); if (!e.target.checked) setFUnitPayId('') }}
                    className="rounded" />
                  <span className="text-xs font-medium" style={{ color: 'var(--charcoal)' }}>
                    Has Unit Pay Card <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(Payroll — links to consultant fee)</span>
                  </span>
                </label>
                {fUnitPayEnabled ? (
                  <select value={fUnitPayId} onChange={(e) => setFUnitPayId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: fUnitPayId ? 'var(--teal)' : 'var(--light-gray)', background: fUnitPayId ? '#f0fdfa' : 'white' }}>
                    <option value="">— Select unit pay —</option>
                    {unitPays.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>No Unit Pay Card</p>
                )}
              </div>

              {/* Daily patient-threshold incentive count */}
              <div>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" checked={fThresholdCounted}
                    onChange={e => { setFThresholdCounted(e.target.checked); if (!e.target.checked) setFThresholdQty('1') }}
                    className="rounded" />
                  <span className="text-xs font-medium" style={{ color: 'var(--charcoal)' }}>
                    Included in patient threshold count <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(daily min-patients incentive)</span>
                  </span>
                </label>
                {fThresholdCounted ? (
                  <div className="flex items-center gap-2">
                    <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Qty for threshold count</label>
                    <input type="number" min={0.5} step={0.5} value={fThresholdQty}
                      onChange={(e) => setFThresholdQty(e.target.value)}
                      className="w-20 px-3 py-2 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--teal)', background: '#f0fdfa' }} />
                    <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>session(s) per unit (e.g. 0.5 for a half session, 2 for a 2-hour session)</span>
                  </div>
                ) : (
                  <p className="text-xs px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>Not counted toward the daily patient threshold</p>
                )}
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

      {/* ── Price History ───────────────────────────────────── */}
      {phService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setPhService(null)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-5 pt-5 pb-3">
              <div>
                <h3 className="text-base font-semibold" style={{ color: 'var(--charcoal)' }}>Price History</h3>
                <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>{phService.name}</p>
              </div>
              <button onClick={() => setPhService(null)} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
            </div>

            <div className="px-5 pb-5 overflow-y-auto">
              {phLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} />
                </div>
              ) : (phRows && phRows.length === 0 && phOlder.length === 0) ? (
                <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>No price changes recorded yet.</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--light-gray)' }}>
                        <th className="text-left py-2 font-semibold" style={{ color: 'var(--mid-gray)' }}>Date</th>
                        <th className="text-left py-2 font-semibold" style={{ color: 'var(--mid-gray)' }}>What</th>
                        <th className="text-right py-2 font-semibold" style={{ color: 'var(--mid-gray)' }}>From</th>
                        <th className="text-right py-2 font-semibold" style={{ color: 'var(--mid-gray)' }}>To</th>
                        <th className="text-right py-2 font-semibold" style={{ color: 'var(--mid-gray)' }}>Change</th>
                        <th className="text-left py-2 pl-3 font-semibold" style={{ color: 'var(--mid-gray)' }}>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(phRows ?? []).map((r) => {
                        const diff = r.oldValue != null && r.newValue != null ? r.newValue - r.oldValue : null
                        const label = r.field === 'price' ? 'Price' : r.field === 'doctorFee' ? "Doctor's fee"
                          : r.field === 'clinicFee' ? 'Clinic fee' : r.field === 'newPrice' ? 'Scheduled price' : r.field
                        return (
                          <tr key={r.id} style={{ borderBottom: '1px solid var(--off-white)' }}>
                            <td className="py-2 whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                              {new Date(r.changedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </td>
                            <td className="py-2" style={{ color: 'var(--charcoal)' }}>
                              {label}{r.branch ? ` · ${r.branch}` : ''}
                              {r.source === 'BASELINE' && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: '#f1f5f9', color: '#475569' }}>starting point</span>
                              )}
                            </td>
                            <td className="py-2 text-right" style={{ color: 'var(--mid-gray)' }}>
                              {r.oldValue == null ? '—' : `₱${r.oldValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                            </td>
                            <td className="py-2 text-right font-medium" style={{ color: 'var(--charcoal)' }}>
                              {r.newValue == null ? '—' : `₱${r.newValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                            </td>
                            <td className="py-2 text-right font-medium" style={{ color: diff == null ? 'var(--mid-gray)' : diff > 0 ? '#166534' : diff < 0 ? '#b91c1c' : 'var(--mid-gray)' }}>
                              {diff == null ? '—' : `${diff > 0 ? '+' : ''}₱${diff.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                            </td>
                            <td className="py-2 pl-3" style={{ color: 'var(--mid-gray)' }}>{r.by ?? '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {phOlder.length > 0 && (
                    <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--light-gray)' }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--mid-gray)' }}>EARLIER EDITS</p>
                      <p className="text-xs mb-2" style={{ color: 'var(--mid-gray)' }}>
                        These predate price tracking. The audit log recorded that a price field was edited, but not the amounts.
                      </p>
                      <ul className="space-y-1">
                        {phOlder.map((o, i) => (
                          <li key={i} className="text-xs" style={{ color: 'var(--charcoal)' }}>
                            {new Date(o.changedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                            {' — '}{o.fields.join(', ')}{o.by ? ` · ${o.by}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
