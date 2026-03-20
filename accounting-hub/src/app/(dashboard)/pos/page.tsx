'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import {
  ShoppingCart, Search, Plus, X, Trash2, ChevronDown, ChevronUp,
  CreditCard, Wallet, FileText, Download, Printer,
  RefreshCw, Ban, Star, Filter,
  Loader2, AlertCircle, ScanLine, UserPlus,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

/* ─────────────────────────── TYPES ─────────────────────────── */

interface QueueItem {
  id: string
  time: string
  patientName: string
  sessionType: string
  clinician: string
  [key: string]: unknown
}

interface ServiceItem {
  id: string
  name: string
  price: string | number
  department?: string
  branch?: string
  hasDoctorFee?: boolean
  pwdDiscountClinicOnly?: boolean
  revenueType?: string
  [key: string]: unknown
}

interface OrderLineItem {
  serviceId?: string
  inventoryItemId?: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
  hasDoctorFee?: boolean
  pwdDiscountClinicOnly?: boolean
}

interface PaymentLine {
  method: string
  amount: number
  walletId?: string
  reference?: string
}

interface Order {
  id: string
  orderNumber: string
  orderType: string
  branch: string
  transactionDate: string
  patientName?: string
  clinicianName?: string
  subtotal: string | number
  discountType: string
  discountAmount: string | number
  discountLabel?: string
  netAmount: string | number
  revenueType: string
  status: string
  items: { id: string; name: string; quantity: number; unitPrice: string | number; lineTotal: string | number; serviceId?: string; inventoryItemId?: string }[]
  payments: { id: string; method: string; amount: string | number; walletId?: string; reference?: string }[]
  referrer?: { id: string; name: string } | null
  createdBy?: { name: string }
  [key: string]: unknown
}

interface Referrer {
  id: string
  name: string
  affiliation?: string | null
  specialization?: string | null
}

interface DigitalWallet {
  id: string
  barcode: string
  walletType: string
  balance: string | number
  patientId?: string | null
  patientName: string
  patientEmail?: string | null
  rewardPoints: number
  _count?: { packages: number }
  packages?: WalletPackage[]
  logs?: WalletLog[]
  [key: string]: unknown
}

interface WalletPackage {
  id: string
  serviceName: string
  totalSessions: number
  usedSessions: number
  amountPaid: string | number
  expiresAt?: string | null
  isActive: boolean
  [key: string]: unknown
}

interface WalletLog {
  id: string
  action: string
  description: string
  sessions?: number | null
  pointsChange?: number | null
  createdAt: string
  [key: string]: unknown
}

interface DiscountSetting {
  id: string
  name: string
  type: 'PERCENTAGE' | 'FIXED'
  value: string | number
  branch?: string | null
  [key: string]: unknown
}

interface Patient {
  id: string
  name: string
  email?: string
  phone?: string
  [key: string]: unknown
}

interface StaffMember {
  id: string
  name: string
  department?: string
  branch?: string
  [key: string]: unknown
}

interface InventoryProduct {
  id: string
  name: string
  sku?: string
  price: string | number
  stock?: number
  [key: string]: unknown
}

/* ─────────────────────────── CONSTANTS ─────────────────────────── */

const PAYMENT_METHODS_SERVICE = [
  { value: 'CASH', label: 'Cash' },
  { value: 'GCASH', label: 'GCash' },
  { value: 'PAYMAYA', label: 'PayMaya' },
  { value: 'DEBIT', label: 'Debit Card' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
]

const PAYMENT_METHODS_PRODUCT = [
  ...PAYMENT_METHODS_SERVICE,
  { value: 'SHOPEE', label: 'Shopee' },
  { value: 'LAZADA', label: 'Lazada' },
  { value: 'TIKTOK', label: 'TikTok Shop' },
  { value: 'REWARD_POINTS', label: 'Reward Points' },
]

const ORDER_STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  COMPLETED: { bg: '#dcfce7', color: '#166534' },
  REOPENED: { bg: '#fef3c7', color: '#92400e' },
  VOIDED: { bg: '#fee2e2', color: '#991b1b' },
}

const WALLET_ACTION_BADGE: Record<string, { bg: string; color: string }> = {
  DEDUCTION: { bg: '#fee2e2', color: '#991b1b' },
  RELOAD: { bg: '#dcfce7', color: '#166534' },
  REWARD_EARN: { bg: '#dbeafe', color: '#1e40af' },
  REWARD_SPEND: { bg: '#fef3c7', color: '#92400e' },
}

const BRANCHES = [
  { value: '', label: 'All Branches' },
  { value: 'SANDBOX_EAST', label: 'SBEA' },
  { value: 'SANDBOX_GREENHILLS', label: 'SBGH' },
  { value: 'VERDANA_STORE', label: 'Verdana' },
]

const WALLET_TYPES = [
  { value: 'PACKAGE', label: 'Package' },
  { value: 'VIP', label: 'VIP' },
  { value: 'PREPAID_CARD', label: 'Prepaid Card' },
  { value: 'DOWNPAYMENT', label: 'Downpayment' },
  { value: 'ADVANCE', label: 'Advance' },
]

const WALLET_TYPE_LABELS: Record<string, string> = {
  PACKAGE: 'Package',
  VIP: 'VIP',
  PREPAID_CARD: 'Prepaid Card',
  DOWNPAYMENT: 'Downpayment',
  ADVANCE: 'Advance',
}

const WALLET_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  PACKAGE: { bg: '#dbeafe', color: '#1e40af' },
  VIP: { bg: '#fef3c7', color: '#92400e' },
  PREPAID_CARD: { bg: '#dcfce7', color: '#166534' },
  DOWNPAYMENT: { bg: '#fce7f3', color: '#9d174d' },
  ADVANCE: { bg: '#e0e7ff', color: '#3730a3' },
}

/* ─────────────────────────── HELPERS ─────────────────────────── */

function toNum(v: string | number | undefined | null): number {
  return Number(v) || 0
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function normalize(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    if ('data' in data) {
      const d = (data as { data: unknown }).data
      if (Array.isArray(d)) return d
    }
    if ('items' in data) {
      const d = (data as { items: unknown }).items
      if (Array.isArray(d)) return d
    }
  }
  return []
}

function queueBranch(branch: string): string {
  if (branch === 'SANDBOX_EAST') return 'SBEA'
  if (branch === 'SANDBOX_GREENHILLS') return 'SBGH'
  return 'SBEA'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userBranch(session: any): string {
  const role = session?.user?.role || ''
  if (role.startsWith('SBEA')) return 'SANDBOX_EAST'
  if (role.startsWith('SBGH')) return 'SANDBOX_GREENHILLS'
  if (role.startsWith('VERDANA')) return 'VERDANA_STORE'
  return session?.user?.branch || 'SANDBOX_EAST'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any): boolean {
  const r = session?.user?.role || ''
  return ['ADMIN', 'ACCOUNTANT'].includes(r) || r.endsWith('_ADMIN')
}

/* ─────────────────────────── MAIN COMPONENT ─────────────────────────── */

export default function POSPage() {
  const { data: session } = useSession()

  // ── Top-level tab: Services | Products | Sales Summary
  const [mainTab, setMainTab] = useState<'services' | 'products' | 'sales'>('services')
  // ── Services sub-tab
  const [serviceTab, setServiceTab] = useState<'cashier' | 'orders' | 'wallet'>('cashier')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session?.user) setLoading(false)
  }, [session])

  if (!session?.user || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin mr-2" size={20} style={{ color: 'var(--teal)' }} />
        <span style={{ color: 'var(--mid-gray)' }}>Loading POS...</span>
      </div>
    )
  }

  const branch = userBranch(session)
  const canSelectBranch = isAdmin(session)

  const mainTabs = [
    { key: 'services' as const, label: 'Services', icon: <CreditCard size={16} /> },
    { key: 'products' as const, label: 'Products', icon: <ShoppingCart size={16} /> },
    { key: 'sales' as const, label: 'Sales Summary', icon: <FileText size={16} /> },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Point of Sale
        </h1>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {mainTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: mainTab === t.key ? 'var(--teal)' : 'var(--mid-gray)',
              borderBottom: mainTab === t.key ? '2px solid var(--teal)' : '2px solid transparent',
              fontFamily: 'var(--font-display)',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {mainTab === 'services' && (
        <ServicesSection
          branch={branch}
          canSelectBranch={canSelectBranch}
          serviceTab={serviceTab}
          setServiceTab={setServiceTab}
          session={session}
        />
      )}
      {mainTab === 'products' && (
        <ProductsSection branch={branch} canSelectBranch={canSelectBranch} session={session} />
      )}
      {mainTab === 'sales' && (
        <SalesSummarySection branch={branch} canSelectBranch={canSelectBranch} />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SERVICES SECTION (Cashier / Orders / Digital Wallet)
   ══════════════════════════════════════════════════════════════ */

function ServicesSection({
  branch, canSelectBranch, serviceTab, setServiceTab, session,
}: {
  branch: string
  canSelectBranch: boolean
  serviceTab: 'cashier' | 'orders' | 'wallet'
  setServiceTab: (t: 'cashier' | 'orders' | 'wallet') => void
  session: { user?: Record<string, unknown> } | null
}) {
  const subTabs = [
    { key: 'cashier' as const, label: 'Cashier' },
    { key: 'orders' as const, label: 'Orders' },
    { key: 'wallet' as const, label: 'Digital Wallet' },
  ]

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1">
        {subTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setServiceTab(t.key)}
            className="px-4 py-2 text-sm rounded-xl font-medium transition-colors"
            style={{
              background: serviceTab === t.key ? 'var(--pale-teal)' : 'transparent',
              color: serviceTab === t.key ? 'var(--deep-teal)' : 'var(--mid-gray)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {serviceTab === 'cashier' && (
        <CashierPanel branch={branch} canSelectBranch={canSelectBranch} session={session} />
      )}
      {serviceTab === 'orders' && (
        <OrdersPanel branch={branch} canSelectBranch={canSelectBranch} />
      )}
      {serviceTab === 'wallet' && (
        <WalletPanel session={session} />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   CASHIER PANEL
   ══════════════════════════════════════════════════════════════ */

function CashierPanel({
  branch, canSelectBranch, session,
}: {
  branch: string
  canSelectBranch: boolean
  session: { user?: Record<string, unknown> } | null
}) {
  const [selectedBranch, setSelectedBranch] = useState(branch)
  const [date, setDate] = useState(today())
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [queueLoading, setQueueLoading] = useState(false)
  const [queueError, setQueueError] = useState('')
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [prefill, setPrefill] = useState<Partial<QueueItem> | null>(null)

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true)
    setQueueError('')
    try {
      const qb = queueBranch(selectedBranch)
      const res = await fetch(`/api/pos/queue?branch=${qb}&date=${date}`)
      const data = await res.json()
      if (data.error) {
        setQueueError(data.error)
        setQueue([])
      } else {
        setQueue(normalize(data) as QueueItem[])
      }
    } catch {
      setQueueError('Unable to connect to scheduling system')
      setQueue([])
    } finally {
      setQueueLoading(false)
    }
  }, [selectedBranch, date])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  // Auto-refresh queue every 30 seconds for live updates
  useEffect(() => {
    const interval = setInterval(() => { fetchQueue() }, 30000)
    return () => clearInterval(interval)
  }, [fetchQueue])

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {canSelectBranch && (
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            className="px-3 py-2.5 rounded-xl border text-sm outline-none"
            style={{ borderColor: 'var(--light-gray)' }}
          >
            <option value="SANDBOX_EAST">SBEA</option>
            <option value="SANDBOX_GREENHILLS">SBGH</option>
          </select>
        )}
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ borderColor: 'var(--light-gray)' }}
        />
        <button
          onClick={() => { setPrefill(null); setShowOrderForm(true) }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
          style={{ background: 'var(--teal)' }}
        >
          <Plus size={16} /> New Payment
        </button>
      </div>

      {/* Queue */}
      <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--light-gray)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
            Appointment Queue — {formatDate(date)}
          </h3>
          <button onClick={fetchQueue} className="p-1.5 rounded-lg hover:bg-gray-100">
            <RefreshCw size={14} style={{ color: 'var(--mid-gray)' }} />
          </button>
        </div>
        <div className="overflow-x-auto">
          {queueLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} />
            </div>
          ) : queueError ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>
              <AlertCircle size={16} /> {queueError}
            </div>
          ) : queue.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>
              No confirmed appointments for this date.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--light-gray)' }}>
                  {['Time', 'Patient Name', 'Session Type', 'Clinician', 'Action'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map(q => (
                  <tr key={q.id} className="border-b hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-5 py-3" style={{ color: 'var(--charcoal)' }}>{q.time}</td>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{q.patientName}</td>
                    <td className="px-5 py-3" style={{ color: 'var(--mid-gray)' }}>{q.sessionType}</td>
                    <td className="px-5 py-3" style={{ color: 'var(--mid-gray)' }}>{q.clinician}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => { setPrefill(q); setShowOrderForm(true) }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                        style={{ background: 'var(--teal)' }}
                      >
                        Convert to Order
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Order Form Modal */}
      {showOrderForm && (
        <OrderFormModal
          branch={selectedBranch}
          prefill={prefill}
          session={session}
          onClose={() => { setShowOrderForm(false); setPrefill(null) }}
          onSuccess={() => { setShowOrderForm(false); setPrefill(null); fetchQueue() }}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   ORDER FORM MODAL
   ══════════════════════════════════════════════════════════════ */

function OrderFormModal({
  branch, prefill, session, onClose, onSuccess, orderType = 'SERVICE',
  paymentMethods = PAYMENT_METHODS_SERVICE,
}: {
  branch: string
  prefill: Partial<QueueItem> | null
  session: { user?: Record<string, unknown> } | null
  onClose: () => void
  onSuccess: () => void
  orderType?: string
  paymentMethods?: { value: string; label: string }[]
}) {
  const [txDate, setTxDate] = useState(today())
  const [patientName, setPatientName] = useState(prefill?.patientName || '')
  const [patientSearch, setPatientSearch] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [showPatientDrop, setShowPatientDrop] = useState(false)
  const [clinicianName, setClinicianName] = useState(prefill?.clinician || '')
  const [clinicianSearch, setClinicianSearch] = useState('')
  const [clinicians, setClinicians] = useState<StaffMember[]>([])
  const [showClinicianDrop, setShowClinicianDrop] = useState(false)
  const [items, setItems] = useState<OrderLineItem[]>([])
  const [serviceSearch, setServiceSearch] = useState('')
  const [services, setServices] = useState<ServiceItem[]>([])
  const [showServiceDrop, setShowServiceDrop] = useState(false)
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: 'CASH', amount: 0 }])
  const [pwdDiscount, setPwdDiscount] = useState(false)
  const [customDiscountId, setCustomDiscountId] = useState('')
  const [discountSettings, setDiscountSettings] = useState<DiscountSetting[]>([])
  const [referrers, setReferrers] = useState<Referrer[]>([])
  const [referrerId, setReferrerId] = useState('')
  const [referrerSearch, setReferrerSearch] = useState('')
  const [showReferrerDrop, setShowReferrerDrop] = useState(false)
  const [showAddReferrer, setShowAddReferrer] = useState(false)
  const [newRef, setNewRef] = useState({ name: '', affiliation: '', specialization: '' })
  const [showWalletPay, setShowWalletPay] = useState(false)
  const [walletBarcode, setWalletBarcode] = useState('')
  const [walletSearch, setWalletSearch] = useState('')
  const [walletResults, setWalletResults] = useState<DigitalWallet[]>([])
  const [showDownpayment, setShowDownpayment] = useState(false)
  const [isAdvancePayment, setIsAdvancePayment] = useState(false)
  const [walletPopup, setWalletPopup] = useState<{ show: boolean; wallet?: DigitalWallet; walletType?: string }>({ show: false })
  const [patientId, setPatientId] = useState(prefill?.patientId as string || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const patientTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const clinicianTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const serviceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Fetch discount settings + referrers on mount
  useEffect(() => {
    fetch('/api/pos/discount-settings').then(r => r.json()).then(d => setDiscountSettings(normalize(d) as DiscountSetting[])).catch(() => {})
    fetch('/api/referrers?all=true').then(r => r.json()).then(d => setReferrers(normalize(d) as Referrer[])).catch(() => {})
  }, [])

  // Patient search
  useEffect(() => {
    if (patientSearch.length < 2) { setPatients([]); return }
    clearTimeout(patientTimer.current)
    patientTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pos/patients?search=${encodeURIComponent(patientSearch)}`)
        const d = await r.json()
        setPatients(normalize(d) as Patient[])
        setShowPatientDrop(true)
      } catch { setPatients([]) }
    }, 300)
  }, [patientSearch])

  // Clinician search
  useEffect(() => {
    if (clinicianSearch.length < 2) { setClinicians([]); return }
    clearTimeout(clinicianTimer.current)
    clinicianTimer.current = setTimeout(async () => {
      try {
        const qb = branch === 'SANDBOX_EAST' ? 'SBEA' : branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : ''
        const r = await fetch(`/api/pos/staff?search=${encodeURIComponent(clinicianSearch)}&branch=${qb}`)
        const d = await r.json()
        setClinicians(Array.isArray(d) ? d as StaffMember[] : [])
        setShowClinicianDrop(true)
      } catch { setClinicians([]) }
    }, 300)
  }, [clinicianSearch, branch])

  // Service search
  useEffect(() => {
    clearTimeout(serviceTimer.current)
    serviceTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/services?pageSize=500&branch=${branch}`)
        const d = await r.json()
        setServices(normalize(d) as ServiceItem[])
      } catch { setServices([]) }
    }, 200)
  }, [branch])

  const filteredServices = services.filter(s =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  )

  const addItem = (svc: ServiceItem) => {
    const price = toNum(svc.price)
    setItems(prev => [...prev, {
      serviceId: svc.id,
      name: svc.name,
      quantity: 1,
      unitPrice: price,
      lineTotal: price,
      hasDoctorFee: svc.hasDoctorFee,
      pwdDiscountClinicOnly: svc.pwdDiscountClinicOnly,
    }])
    setServiceSearch('')
    setShowServiceDrop(false)
  }

  const updateItemQty = (idx: number, qty: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: qty, lineTotal: it.unitPrice * qty } : it))
  }

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  // Calculate totals
  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0)

  let discountAmount = 0
  let discountType = 'NONE'
  let discountLabel = ''
  let pwdNote = ''

  if (pwdDiscount) {
    discountType = 'PWD_SENIOR'
    discountLabel = 'PWD/Senior Citizen (20%)'
    // Check if any item has pwdDiscountClinicOnly
    const hasClinicOnly = items.some(it => it.hasDoctorFee && it.pwdDiscountClinicOnly)
    if (hasClinicOnly) {
      pwdNote = 'Discount on clinic fee only (doctor fee excluded)'
    }
    discountAmount = subtotal * 0.2
  } else if (customDiscountId) {
    const ds = discountSettings.find(d => d.id === customDiscountId)
    if (ds) {
      discountType = 'CUSTOM'
      discountLabel = ds.name
      discountAmount = ds.type === 'PERCENTAGE' ? subtotal * (toNum(ds.value) / 100) : toNum(ds.value)
    }
  }

  const netAmount = Math.max(0, subtotal - discountAmount)
  const totalPayments = payments.reduce((s, p) => s + toNum(p.amount), 0)
  const changeDue = totalPayments - netAmount

  // Wallet barcode scan
  const scanBarcode = async () => {
    if (!walletBarcode.trim()) return
    try {
      const r = await fetch(`/api/pos/wallets/scan/${encodeURIComponent(walletBarcode.trim())}`)
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      // Add wallet payment line
      setPayments(prev => [...prev, { method: 'WALLET', amount: 0, walletId: d.id, reference: d.barcode }])
      setShowWalletPay(false)
      setWalletBarcode('')
    } catch { setError('Failed to scan barcode') }
  }

  // Wallet name search
  const searchWallets = async (q: string) => {
    setWalletSearch(q)
    if (q.length < 2) { setWalletResults([]); return }
    try {
      const r = await fetch(`/api/pos/wallets?search=${encodeURIComponent(q)}`)
      const d = await r.json()
      setWalletResults(normalize(d) as DigitalWallet[])
    } catch { setWalletResults([]) }
  }

  // Determine if any item is unearned revenue
  const hasUnearnedItems = items.some(it => {
    const svc = services.find(s => s.id === it.serviceId)
    return svc?.revenueType === 'UNEARNED'
  })

  // Determine wallet type based on service revenue type or advance payment
  const getWalletType = (): string | null => {
    if (isAdvancePayment) return 'ADVANCE'
    if (!hasUnearnedItems) return null
    // For unearned, determine type from service name patterns
    // Default to PACKAGE for unearned revenue services
    const firstUnearned = items.find(it => {
      const svc = services.find(s => s.id === it.serviceId)
      return svc?.revenueType === 'UNEARNED'
    })
    if (!firstUnearned) return null
    const name = firstUnearned.name.toUpperCase()
    if (name.includes('VIP')) return 'VIP'
    if (name.includes('PREPAID')) return 'PREPAID_CARD'
    if (name.includes('DOWNPAYMENT') || name.includes('DOWN PAYMENT')) return 'DOWNPAYMENT'
    if (name.includes('ADVANCE')) return 'ADVANCE'
    return 'PACKAGE'
  }

  const effectiveRevenueType = isAdvancePayment || hasUnearnedItems ? 'UNEARNED' : 'EARNED'

  // Submit order
  const handleSubmit = async () => {
    if (items.length === 0) { setError('Add at least one item'); return }
    if (totalPayments < netAmount) { setError('Payments do not cover the net amount'); return }
    if ((effectiveRevenueType === 'UNEARNED' || isAdvancePayment) && !patientName.trim()) {
      setError('Patient name is required for unearned revenue / advance payment orders')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      // If unearned or advance, auto-create/find digital wallet
      const walletType = getWalletType()
      if (walletType && patientId) {
        try {
          const walletRes = await fetch('/api/pos/wallets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patientName: patientName.trim(),
              patientId,
              walletType,
            }),
          })
          const walletData = await walletRes.json()
          if (walletData.existingWallet) {
            setWalletPopup({ show: true, wallet: walletData, walletType })
          }
          // Reload wallet with the payment amount
          if (walletData.id) {
            const firstItem = items[0]
            await fetch(`/api/pos/wallets/${walletData.id}/reload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serviceName: firstItem.name,
                serviceId: firstItem.serviceId || null,
                totalSessions: items.reduce((s, it) => s + it.quantity, 0),
                amountPaid: netAmount,
              }),
            })
          }
        } catch (e) {
          console.error('Wallet creation error:', e)
        }
      }

      const body = {
        orderType,
        branch,
        patientName: patientName || null,
        patientId: patientId || null,
        clinicianName: isAdvancePayment ? null : (clinicianName || null),
        transactionDate: txDate,
        items: items.map(it => ({
          serviceId: it.serviceId || null,
          inventoryItemId: it.inventoryItemId || null,
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
        })),
        payments: payments.filter(p => toNum(p.amount) > 0).map(p => ({
          method: p.method,
          amount: toNum(p.amount),
          walletId: p.walletId || null,
          reference: p.reference || null,
        })),
        discountType,
        discountAmount,
        discountLabel: discountLabel || null,
        revenueType: effectiveRevenueType,
        referrerId: referrerId || null,
      }
      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create order'); setSubmitting(false); return }
      onSuccess()
    } catch {
      setError('Failed to create order')
    } finally {
      setSubmitting(false)
    }
  }

  const addReferrer = async () => {
    if (!newRef.name.trim()) return
    try {
      const r = await fetch('/api/referrers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRef),
      })
      const d = await r.json()
      if (r.ok) {
        setReferrers(prev => [...prev, d])
        setReferrerId(d.id)
        setShowAddReferrer(false)
        setNewRef({ name: '', affiliation: '', specialization: '' })
      }
    } catch {}
  }

  const filteredReferrers = referrers.filter(r =>
    r.name.toLowerCase().includes(referrerSearch.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-2xl mb-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
          <X size={18} style={{ color: 'var(--mid-gray)' }} />
        </button>

        <h2 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          {prefill ? 'Convert to Order' : 'New Payment'}
        </h2>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700 flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Transaction Date */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Transaction Date</label>
            <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          </div>

          {/* Patient Name */}
          <div className="relative">
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Patient Name</label>
            <input
              value={patientName}
              onChange={e => { setPatientName(e.target.value); setPatientSearch(e.target.value) }}
              onFocus={() => patientSearch.length >= 2 && setShowPatientDrop(true)}
              onBlur={() => setTimeout(() => setShowPatientDrop(false), 200)}
              placeholder="Search patient..."
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}
            />
            {showPatientDrop && patients.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                {patients.map(p => (
                  <button key={p.id} onClick={() => { setPatientName(p.name); setPatientId(p.id); setShowPatientDrop(false) }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between" style={{ color: 'var(--charcoal)' }}>
                    <span className="font-medium">{p.name}</span>
                    {p.email ? <span className="text-xs ml-2 truncate" style={{ color: 'var(--mid-gray)' }}>{p.email}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Clinician */}
          {orderType === 'SERVICE' && (
            <div className="relative">
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                Clinician Name {isAdvancePayment && <span className="text-xs font-normal">(disabled for advance payments)</span>}
              </label>
              <input
                value={isAdvancePayment ? '' : clinicianName}
                onChange={e => { setClinicianName(e.target.value); setClinicianSearch(e.target.value) }}
                onFocus={() => clinicianSearch.length >= 2 && setShowClinicianDrop(true)}
                onBlur={() => setTimeout(() => setShowClinicianDrop(false), 200)}
                placeholder={isAdvancePayment ? 'N/A — Advance Payment' : 'Search clinician...'}
                disabled={isAdvancePayment}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none disabled:bg-gray-100 disabled:text-gray-400"
                style={{ borderColor: 'var(--light-gray)' }}
              />
              {showClinicianDrop && clinicians.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                  {clinicians.map(c => (
                    <button key={c.id} onClick={() => { setClinicianName(c.name); setShowClinicianDrop(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                      {c.name} {c.department ? <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>({c.department})</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Service Selection */}
          <div className="relative">
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
              {orderType === 'SERVICE' ? 'Add Service' : 'Add Product'}
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3" style={{ color: 'var(--mid-gray)' }} />
              <input
                value={serviceSearch}
                onChange={e => { setServiceSearch(e.target.value); setShowServiceDrop(true) }}
                onFocus={() => setShowServiceDrop(true)}
                placeholder={`Search ${orderType === 'SERVICE' ? 'services' : 'products'}...`}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}
              />
            </div>
            {showServiceDrop && serviceSearch.length > 0 && filteredServices.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                {filteredServices.slice(0, 20).map(s => (
                  <button key={s.id} onClick={() => addItem(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between" style={{ color: 'var(--charcoal)' }}>
                    <span>{s.name}</span>
                    <span style={{ color: 'var(--teal)' }}>{formatCurrency(toNum(s.price))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items Table */}
          {items.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    {['Item', 'Qty', 'Unit Price', 'Total', ''].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{it.name}</td>
                      <td className="px-3 py-2">
                        <input type="number" min={1} value={it.quantity} onChange={e => updateItemQty(idx, parseInt(e.target.value) || 1)}
                          className="w-16 px-2 py-1 rounded-lg border text-sm text-center outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(it.unitPrice)}</td>
                      <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(it.lineTotal)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-red-50">
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-right text-sm font-semibold border-t" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                Subtotal: {formatCurrency(subtotal)}
              </div>
            </div>
          )}

          {/* Discount Section */}
          <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Discounts</h4>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--charcoal)' }}>
                <input type="checkbox" checked={pwdDiscount}
                  onChange={e => { setPwdDiscount(e.target.checked); if (e.target.checked) setCustomDiscountId('') }}
                  className="rounded" />
                PWD / Senior Citizen (20%)
              </label>
            </div>
            {pwdNote && (
              <p className="text-xs px-2 py-1 rounded-lg" style={{ background: '#fef3c7', color: '#92400e' }}>{pwdNote}</p>
            )}
            {!pwdDiscount && (
              <div>
                <select value={customDiscountId} onChange={e => setCustomDiscountId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">No custom discount</option>
                  {discountSettings.map(ds => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name} ({ds.type === 'PERCENTAGE' ? `${toNum(ds.value)}%` : formatCurrency(toNum(ds.value))})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {discountAmount > 0 && (
              <p className="text-sm font-medium" style={{ color: 'var(--deep-teal)' }}>
                Discount: -{formatCurrency(discountAmount)} &middot; Net: {formatCurrency(netAmount)}
              </p>
            )}
          </div>

          {/* Referral */}
          {orderType === 'SERVICE' && (
            <div className="relative">
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Doctor Referral (optional)</label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    value={referrerSearch}
                    onChange={e => { setReferrerSearch(e.target.value); setShowReferrerDrop(true) }}
                    onFocus={() => setShowReferrerDrop(true)}
                    placeholder="Search referrer..."
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}
                  />
                  {showReferrerDrop && filteredReferrers.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-32 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                      {filteredReferrers.map(r => (
                        <button key={r.id} onClick={() => { setReferrerId(r.id); setReferrerSearch(r.name); setShowReferrerDrop(false) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                          {r.name} {r.specialization ? <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>— {r.specialization}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setShowAddReferrer(!showAddReferrer)}
                  className="px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                  <UserPlus size={14} />
                </button>
              </div>
              {showAddReferrer && (
                <div className="mt-2 p-3 rounded-xl border space-y-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                  <input value={newRef.name} onChange={e => setNewRef({ ...newRef, name: e.target.value })} placeholder="Name *"
                    className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  <input value={newRef.affiliation} onChange={e => setNewRef({ ...newRef, affiliation: e.target.value })} placeholder="Affiliation"
                    className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  <input value={newRef.specialization} onChange={e => setNewRef({ ...newRef, specialization: e.target.value })} placeholder="Specialization"
                    className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  <button onClick={addReferrer} className="px-4 py-2 rounded-xl text-sm text-white font-medium" style={{ background: 'var(--teal)' }}>
                    Add Referrer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Payments */}
          <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Payments</h4>
            {payments.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select value={p.method} onChange={e => setPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, method: e.target.value } : pp))}
                  className="px-3 py-2.5 rounded-xl border text-sm outline-none flex-1" style={{ borderColor: 'var(--light-gray)' }}>
                  {paymentMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  {p.method === 'WALLET' && <option value="WALLET">VIP/Prepaid Card</option>}
                </select>
                <input type="number" min={0} step="0.01" value={p.amount || ''} placeholder="Amount"
                  onChange={e => setPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, amount: parseFloat(e.target.value) || 0 } : pp))}
                  className="w-32 px-3 py-2.5 rounded-xl border text-sm outline-none text-right" style={{ borderColor: 'var(--light-gray)' }} />
                {p.reference && <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{p.reference}</span>}
                {payments.length > 1 && (
                  <button onClick={() => setPayments(prev => prev.filter((_, i) => i !== idx))} className="p-1 rounded hover:bg-red-50">
                    <X size={14} className="text-red-500" />
                  </button>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPayments(prev => [...prev, { method: 'CASH', amount: 0 }])}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                + Add Payment
              </button>
              <button onClick={() => setShowWalletPay(!showWalletPay)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1"
                style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                <Wallet size={12} /> VIP/Prepaid Card
              </button>
              <button onClick={() => setShowDownpayment(!showDownpayment)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1"
                style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                <CreditCard size={12} /> Has Downpayment
              </button>
            </div>

            {/* Wallet scan / search */}
            {showWalletPay && (
              <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <div className="flex gap-2">
                  <input value={walletBarcode} onChange={e => setWalletBarcode(e.target.value)} placeholder="Scan barcode..."
                    onKeyDown={e => e.key === 'Enter' && scanBarcode()}
                    className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  <button onClick={scanBarcode} className="px-3 py-2 rounded-xl text-sm text-white" style={{ background: 'var(--teal)' }}>
                    <ScanLine size={14} />
                  </button>
                </div>
                <div className="text-xs text-center" style={{ color: 'var(--mid-gray)' }}>or search by name</div>
                <input value={walletSearch} onChange={e => searchWallets(e.target.value)} placeholder="Search patient name..."
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                {walletResults.length > 0 && (
                  <div className="max-h-32 overflow-y-auto">
                    {walletResults.map(w => (
                      <button key={w.id} onClick={() => {
                        setPayments(prev => [...prev, { method: 'WALLET', amount: 0, walletId: w.id, reference: w.barcode }])
                        setShowWalletPay(false)
                      }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between">
                        <span>{w.patientName}</span>
                        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{w.barcode}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Downpayment search */}
            {showDownpayment && (
              <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Search for existing wallet with balance</p>
                <input value={walletSearch} onChange={e => searchWallets(e.target.value)} placeholder="Patient name..."
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                {walletResults.length > 0 && walletResults.map(w => (
                  <button key={w.id} onClick={() => {
                    setPayments(prev => [...prev, { method: 'WALLET', amount: 0, walletId: w.id, reference: `DP-${w.barcode}` }])
                    setShowDownpayment(false)
                  }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between">
                    <span>{w.patientName}</span>
                    <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{w.barcode}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Advance Payment Toggle */}
          {orderType === 'SERVICE' && !hasUnearnedItems && (
            <div className="rounded-xl border p-3" style={{ borderColor: isAdvancePayment ? 'var(--teal)' : 'var(--light-gray)', background: isAdvancePayment ? 'var(--pale-teal)' : 'transparent' }}>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--charcoal)' }}>
                <input type="checkbox" checked={isAdvancePayment}
                  onChange={e => {
                    setIsAdvancePayment(e.target.checked)
                    if (e.target.checked) setClinicianName('')
                  }}
                  className="rounded" />
                <span className="font-medium">Is this an advance payment?</span>
              </label>
              {isAdvancePayment && (
                <p className="text-xs mt-1 ml-6" style={{ color: 'var(--deep-teal)' }}>
                  This will be classified as Unearned Revenue. A digital wallet (Advance type) will be created for the patient.
                </p>
              )}
            </div>
          )}

          {/* Unearned Revenue Notice */}
          {(hasUnearnedItems || isAdvancePayment) && (
            <div className="rounded-xl border p-3" style={{ borderColor: '#c084fc', background: '#faf5ff' }}>
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#7c3aed' }}>
                <Wallet size={14} />
                Unearned Revenue — Digital Wallet
              </div>
              <p className="text-xs mt-1" style={{ color: '#6b21a8' }}>
                {isAdvancePayment
                  ? 'An Advance wallet will be auto-created/updated for this patient upon checkout.'
                  : `A ${WALLET_TYPE_LABELS[getWalletType() || 'PACKAGE'] || 'Package'} wallet will be auto-created/updated for this patient upon checkout.`
                }
              </p>
            </div>
          )}

          {/* Totals */}
          <div className="rounded-xl p-4 space-y-1" style={{ background: 'var(--off-white)' }}>
            <div className="flex justify-between text-sm"><span style={{ color: 'var(--mid-gray)' }}>Subtotal</span><span style={{ color: 'var(--charcoal)' }}>{formatCurrency(subtotal)}</span></div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm"><span style={{ color: 'var(--mid-gray)' }}>Discount ({discountLabel})</span><span className="text-red-600">-{formatCurrency(discountAmount)}</span></div>
            )}
            <div className="flex justify-between text-sm font-bold"><span style={{ color: 'var(--charcoal)' }}>Net Amount</span><span style={{ color: 'var(--deep-teal)' }}>{formatCurrency(netAmount)}</span></div>
            <div className="flex justify-between text-sm"><span style={{ color: 'var(--mid-gray)' }}>Total Payments</span><span style={{ color: 'var(--charcoal)' }}>{formatCurrency(totalPayments)}</span></div>
            {changeDue >= 0 ? (
              <div className="flex justify-between text-sm"><span style={{ color: 'var(--mid-gray)' }}>Change</span><span className="text-green-700">{formatCurrency(changeDue)}</span></div>
            ) : (
              <div className="flex justify-between text-sm"><span style={{ color: 'var(--mid-gray)' }}>Remaining Balance</span><span className="text-red-600">{formatCurrency(Math.abs(changeDue))}</span></div>
            )}
            {(hasUnearnedItems || isAdvancePayment) && (
              <div className="flex justify-between text-sm mt-1 pt-1 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <span className="font-medium" style={{ color: '#7c3aed' }}>Revenue Type</span>
                <span className="font-medium" style={{ color: '#7c3aed' }}>Unearned Revenue</span>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || items.length === 0 || totalPayments < netAmount}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--teal)' }}
          >
            {submitting && <Loader2 className="animate-spin" size={16} />}
            Complete Order
          </button>
        </div>

        {/* Existing Wallet Popup */}
        {walletPopup.show && walletPopup.wallet && (
          <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center">
            <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm">
              <div className="flex items-center gap-2 mb-3">
                <Wallet size={20} style={{ color: 'var(--teal)' }} />
                <h3 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  Existing Wallet Detected
                </h3>
              </div>
              <div className="rounded-xl p-3 mb-4" style={{ background: 'var(--off-white)' }}>
                <p className="text-sm" style={{ color: 'var(--charcoal)' }}>
                  <span className="font-medium">{walletPopup.wallet.patientName}</span>
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                  Type: <span className="font-semibold">{WALLET_TYPE_LABELS[walletPopup.walletType || ''] || walletPopup.walletType}</span>
                </p>
                <p className="text-sm mt-2 font-semibold" style={{ color: 'var(--deep-teal)' }}>
                  Current Balance: {formatCurrency(toNum(walletPopup.wallet.balance))}
                </p>
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
                The payment has been added to this existing wallet.
              </p>
              <button onClick={() => setWalletPopup({ show: false })}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   ORDERS PANEL
   ══════════════════════════════════════════════════════════════ */

function OrdersPanel({ branch, canSelectBranch }: { branch: string; canSelectBranch: boolean }) {
  const [selectedBranch, setSelectedBranch] = useState(canSelectBranch ? '' : branch)
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [statusFilter, setStatusFilter] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedBranch) params.set('branch', selectedBranch)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (statusFilter) params.set('status', statusFilter)
      params.set('orderType', 'SERVICE')
      params.set('pageSize', '100')
      const r = await fetch(`/api/pos/orders?${params}`)
      const d = await r.json()
      setOrders(normalize(d) as Order[])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [selectedBranch, dateFrom, dateTo, statusFilter])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const handleAction = async (id: string, action: 'reopen' | 'void') => {
    if (action === 'void') {
      const reason = window.prompt('Reason for voiding this order:')
      if (!reason) return
      await fetch(`/api/pos/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
    } else {
      await fetch(`/api/pos/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
    }
    fetchOrders()
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {canSelectBranch && (
          <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
            className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.filter(b => b.value !== 'VERDANA_STORE').map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        )}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">All Status</option>
          <option value="COMPLETED">Completed</option>
          <option value="REOPENED">Reopened</option>
          <option value="VOIDED">Voided</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl border bg-white overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>No orders found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--light-gray)' }}>
                {['Order #', 'Date', 'Patient', 'Service(s)', 'Clinician', 'Net Amount', 'Payment', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const badge = ORDER_STATUS_BADGE[o.status] || ORDER_STATUS_BADGE.COMPLETED
                return (
                  <tr key={o.id} className="border-b hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{o.orderNumber}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{formatDate(o.transactionDate)}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{o.patientName || '—'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {o.items.map(it => it.name).join(', ')}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{o.clinicianName || '—'}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(toNum(o.netAmount))}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {o.payments.map(p => p.method).join(', ')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background: badge.bg, color: badge.color }}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {o.status === 'COMPLETED' && (
                          <>
                            <button onClick={() => handleAction(o.id, 'reopen')} className="p-1.5 rounded-lg hover:bg-amber-50" title="Reopen">
                              <RefreshCw size={13} className="text-amber-600" />
                            </button>
                            <button onClick={() => handleAction(o.id, 'void')} className="p-1.5 rounded-lg hover:bg-red-50" title="Void">
                              <Ban size={13} className="text-red-500" />
                            </button>
                          </>
                        )}
                        {o.status === 'REOPENED' && (
                          <button onClick={() => handleAction(o.id, 'void')} className="p-1.5 rounded-lg hover:bg-red-50" title="Void">
                            <Ban size={13} className="text-red-500" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   DIGITAL WALLET PANEL
   ══════════════════════════════════════════════════════════════ */

function WalletPanel({ session }: { session: { user?: Record<string, unknown> } | null }) {
  const [search, setSearch] = useState('')
  const [wallets, setWallets] = useState<DigitalWallet[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ patientName: '', patientId: '', patientEmail: '' })
  const [selectedWallet, setSelectedWallet] = useState<DigitalWallet | null>(null)
  const [walletDetail, setWalletDetail] = useState<DigitalWallet | null>(null)
  const [showAddPackage, setShowAddPackage] = useState(false)
  const [pkgForm, setPkgForm] = useState({ serviceName: '', totalSessions: 1, amountPaid: 0, expiresAt: '' })
  const barcodeRef = useRef<SVGSVGElement>(null)

  const fetchWallets = useCallback(async () => {
    setLoading(true)
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : ''
      const r = await fetch(`/api/pos/wallets${params}`)
      const d = await r.json()
      setWallets(normalize(d) as DigitalWallet[])
    } catch {
      setWallets([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchWallets() }, [fetchWallets])

  const createWallet = async () => {
    if (!createForm.patientName.trim()) return
    try {
      const r = await fetch('/api/pos/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      })
      if (r.ok) {
        setShowCreate(false)
        setCreateForm({ patientName: '', patientId: '', patientEmail: '' })
        fetchWallets()
      }
    } catch {}
  }

  const loadWalletDetail = async (w: DigitalWallet) => {
    setSelectedWallet(w)
    try {
      const r = await fetch(`/api/pos/wallets/${w.id}`)
      const d = await r.json()
      setWalletDetail(d)
    } catch {
      setWalletDetail(null)
    }
  }

  // Barcode rendering
  useEffect(() => {
    if (walletDetail?.barcode && barcodeRef.current) {
      try {
        const JsBarcode = require('jsbarcode')
        JsBarcode(barcodeRef.current, walletDetail.barcode, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 14,
        })
      } catch {}
    }
  }, [walletDetail?.barcode])

  const addPackage = async () => {
    if (!walletDetail || !pkgForm.serviceName.trim()) return
    try {
      const r = await fetch(`/api/pos/wallets/${walletDetail.id}/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pkgForm),
      })
      if (r.ok) {
        setShowAddPackage(false)
        setPkgForm({ serviceName: '', totalSessions: 1, amountPaid: 0, expiresAt: '' })
        loadWalletDetail(walletDetail)
      }
    } catch {}
  }

  const deductSession = async (pkgId: string, serviceName: string) => {
    if (!walletDetail) return
    if (!window.confirm(`Deduct 1 session from "${serviceName}"?`)) return
    try {
      await fetch(`/api/pos/wallets/${walletDetail.id}/deduct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkgId, sessions: 1 }),
      })
      loadWalletDetail(walletDetail)
    } catch {}
  }

  const printBarcode = () => {
    const svg = barcodeRef.current
    if (!svg) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<html><body style="display:flex;align-items:center;justify-content:center;min-height:100vh">
      ${svg.outerHTML}<script>window.print();window.close();<\/script></body></html>`)
    win.document.close()
  }

  return (
    <div className="space-y-4">
      {/* Search + Create */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-3" style={{ color: 'var(--mid-gray)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by patient name or barcode..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--teal)' }}>
          <Plus size={16} /> Create Wallet
        </button>
      </div>

      {/* Wallets Table */}
      <div className="rounded-2xl border bg-white overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
        ) : wallets.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>No wallets found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--light-gray)' }}>
                {['Patient Name', 'Type', 'Balance', 'Barcode', 'Packages', 'Reward Points', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wallets.map(w => {
                const typeBadge = WALLET_TYPE_COLORS[w.walletType] || { bg: '#f3f4f6', color: '#374151' }
                return (
                  <tr key={w.id} className="border-b hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--light-gray)' }}
                    onClick={() => loadWalletDetail(w)}>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{w.patientName}</td>
                    <td className="px-5 py-3">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: typeBadge.bg, color: typeBadge.color }}>
                        {WALLET_TYPE_LABELS[w.walletType] || w.walletType}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-semibold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(toNum(w.balance))}</td>
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>{w.barcode}</td>
                    <td className="px-5 py-3" style={{ color: 'var(--mid-gray)' }}>{w._count?.packages || 0}</td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-1" style={{ color: 'var(--teal)' }}>
                        <Star size={12} /> {w.rewardPoints || 0}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                        View
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Wallet Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md relative">
            <button onClick={() => setShowCreate(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>
            <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Create Digital Wallet</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Patient Name *</label>
                <input value={createForm.patientName} onChange={e => setCreateForm({ ...createForm, patientName: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Patient ID</label>
                <input value={createForm.patientId} onChange={e => setCreateForm({ ...createForm, patientId: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Email</label>
                <input value={createForm.patientEmail} onChange={e => setCreateForm({ ...createForm, patientEmail: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <button onClick={createWallet} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
                Create Wallet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Detail Modal */}
      {selectedWallet && walletDetail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-2xl mb-8 relative">
            <button onClick={() => { setSelectedWallet(null); setWalletDetail(null) }} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>

            <h3 className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {walletDetail.patientName}
            </h3>
            <div className="flex items-center gap-2 mb-1">
              {(() => {
                const typeBadge = WALLET_TYPE_COLORS[walletDetail.walletType] || { bg: '#f3f4f6', color: '#374151' }
                return (
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: typeBadge.bg, color: typeBadge.color }}>
                    {WALLET_TYPE_LABELS[walletDetail.walletType] || walletDetail.walletType}
                  </span>
                )
              })()}
              <span className="text-sm font-semibold" style={{ color: 'var(--deep-teal)' }}>
                Balance: {formatCurrency(toNum(walletDetail.balance))}
              </span>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
              {walletDetail.patientEmail || 'No email'} &middot; Reward Points: <Star size={10} className="inline" /> {walletDetail.rewardPoints || 0}
            </p>

            {/* Barcode */}
            <div className="flex items-center gap-4 mb-4 p-3 rounded-xl" style={{ background: 'var(--off-white)' }}>
              <svg ref={barcodeRef} />
              <button onClick={printBarcode} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                <Printer size={12} /> Print
              </button>
            </div>

            {/* Packages */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Packages</h4>
                <button onClick={() => setShowAddPackage(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                  <Plus size={12} /> Add Package
                </button>
              </div>
              {(walletDetail.packages || []).length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No packages.</p>
              ) : (
                <div className="space-y-2">
                  {(walletDetail.packages || []).map(pkg => {
                    const remaining = pkg.totalSessions - pkg.usedSessions
                    const expired = pkg.expiresAt && new Date(pkg.expiresAt) < new Date()
                    return (
                      <div key={pkg.id} className="rounded-xl border p-3 flex items-center justify-between" style={{ borderColor: 'var(--light-gray)' }}>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{pkg.serviceName}</p>
                          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                            {pkg.usedSessions}/{pkg.totalSessions} used &middot; {remaining} remaining
                            &middot; Paid: {formatCurrency(toNum(pkg.amountPaid))}
                            {pkg.expiresAt && <> &middot; Expires: {formatDate(pkg.expiresAt)}</>}
                          </p>
                          {expired && <span className="text-xs text-red-600">Expired</span>}
                        </div>
                        <button
                          onClick={() => deductSession(pkg.id, pkg.serviceName)}
                          disabled={remaining <= 0 || !!expired}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                          style={{ background: remaining > 0 && !expired ? 'var(--teal)' : 'var(--mid-gray)' }}
                        >
                          Deduct Session
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Add Package Form */}
            {showAddPackage && (
              <div className="mb-4 p-4 rounded-xl border space-y-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <h4 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Add Package</h4>
                <input value={pkgForm.serviceName} onChange={e => setPkgForm({ ...pkgForm, serviceName: e.target.value })} placeholder="Service Name *"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Sessions</label>
                    <input type="number" min={1} value={pkgForm.totalSessions} onChange={e => setPkgForm({ ...pkgForm, totalSessions: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Amount Paid</label>
                    <input type="number" min={0} step="0.01" value={pkgForm.amountPaid || ''} onChange={e => setPkgForm({ ...pkgForm, amountPaid: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Expires At</label>
                    <input type="date" value={pkgForm.expiresAt} onChange={e => setPkgForm({ ...pkgForm, expiresAt: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addPackage} className="px-4 py-2 rounded-xl text-sm text-white font-medium" style={{ background: 'var(--teal)' }}>Add</button>
                  <button onClick={() => setShowAddPackage(false)} className="px-4 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Wallet Logs */}
            <div>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Activity Logs</h4>
              {(walletDetail.logs || []).length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No activity yet.</p>
              ) : (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--off-white)' }}>
                        {['Date', 'Action', 'Description', 'Sessions', 'Points'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(walletDetail.logs || []).map(log => {
                        const badge = WALLET_ACTION_BADGE[log.action] || { bg: '#f3f4f6', color: '#374151' }
                        return (
                          <tr key={log.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                            <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{formatDate(log.createdAt)}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: badge.bg, color: badge.color }}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{log.description}</td>
                            <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{log.sessions ?? '—'}</td>
                            <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{log.pointsChange ? `${log.pointsChange > 0 ? '+' : ''}${log.pointsChange}` : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PRODUCTS SECTION
   ══════════════════════════════════════════════════════════════ */

function ProductsSection({
  branch, canSelectBranch, session,
}: {
  branch: string
  canSelectBranch: boolean
  session: { user?: Record<string, unknown> } | null
}) {
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [cart, setCart] = useState<OrderLineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [discountSettings, setDiscountSettings] = useState<DiscountSetting[]>([])
  const [showDiscountSettings, setShowDiscountSettings] = useState(false)
  const [dsForm, setDsForm] = useState({ name: '', type: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED', value: 0, branch: '' })
  const [pwdDiscount, setPwdDiscount] = useState(false)
  const [customDiscountId, setCustomDiscountId] = useState('')
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: 'CASH', amount: 0 }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/inventory?all=true&branch=VERDANA_STORE')
      .then(r => r.json())
      .then(d => setProducts(normalize(d) as InventoryProduct[]))
      .catch(() => {})
      .finally(() => setLoading(false))
    fetch('/api/pos/discount-settings')
      .then(r => r.json())
      .then(d => setDiscountSettings(normalize(d) as DiscountSetting[]))
      .catch(() => {})
  }, [])

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  )

  const addToCart = (p: InventoryProduct) => {
    const existing = cart.findIndex(c => c.inventoryItemId === p.id)
    if (existing >= 0) {
      setCart(prev => prev.map((c, i) => i === existing ? { ...c, quantity: c.quantity + 1, lineTotal: c.unitPrice * (c.quantity + 1) } : c))
    } else {
      const price = toNum(p.price)
      setCart(prev => [...prev, { inventoryItemId: p.id, name: p.name, quantity: 1, unitPrice: price, lineTotal: price }])
    }
  }

  const updateCartQty = (idx: number, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter((_, i) => i !== idx)); return }
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, quantity: qty, lineTotal: c.unitPrice * qty } : c))
  }

  const subtotal = cart.reduce((s, c) => s + c.lineTotal, 0)

  let discountAmount = 0
  let discountType = 'NONE'
  let discountLabel = ''

  if (pwdDiscount) {
    discountType = 'PWD_SENIOR'
    discountLabel = 'PWD/Senior Citizen (20%)'
    discountAmount = subtotal * 0.2
  } else if (customDiscountId) {
    const ds = discountSettings.find(d => d.id === customDiscountId)
    if (ds) {
      discountType = 'CUSTOM'
      discountLabel = ds.name
      discountAmount = ds.type === 'PERCENTAGE' ? subtotal * (toNum(ds.value) / 100) : toNum(ds.value)
    }
  }

  const netAmount = Math.max(0, subtotal - discountAmount)
  const totalPayments = payments.reduce((s, p) => s + toNum(p.amount), 0)

  const handleSubmit = async () => {
    if (cart.length === 0) { setError('Add at least one product'); return }
    if (totalPayments < netAmount) { setError('Payments do not cover the net amount'); return }
    setSubmitting(true)
    setError('')
    try {
      const body = {
        orderType: 'PRODUCT',
        branch: 'VERDANA_STORE',
        transactionDate: today(),
        items: cart.map(c => ({
          inventoryItemId: c.inventoryItemId || null,
          name: c.name,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          lineTotal: c.lineTotal,
        })),
        payments: payments.filter(p => toNum(p.amount) > 0).map(p => ({
          method: p.method,
          amount: toNum(p.amount),
        })),
        discountType,
        discountAmount,
        discountLabel: discountLabel || null,
      }
      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create order'); setSubmitting(false); return }
      setCart([])
      setPayments([{ method: 'CASH', amount: 0 }])
      setPwdDiscount(false)
      setCustomDiscountId('')
      setError('')
      alert(`Order ${data.orderNumber} created successfully!`)
    } catch {
      setError('Failed to create order')
    } finally {
      setSubmitting(false)
    }
  }

  const createDiscountSetting = async () => {
    if (!dsForm.name.trim()) return
    try {
      const r = await fetch('/api/pos/discount-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dsForm),
      })
      if (r.ok) {
        const d = await r.json()
        setDiscountSettings(prev => [...prev, d])
        setDsForm({ name: '', type: 'PERCENTAGE', value: 0, branch: '' })
      }
    } catch {}
  }

  const deleteDiscountSetting = async (id: string) => {
    if (!window.confirm('Remove this discount setting?')) return
    try {
      await fetch('/api/pos/discount-settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setDiscountSettings(prev => prev.filter(d => d.id !== id))
    } catch {}
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Product List */}
      <div className="lg:col-span-2 space-y-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3" style={{ color: 'var(--mid-gray)' }} />
          <input value={productSearch} onChange={e => setProductSearch(e.target.value)}
            placeholder="Search products by name or SKU..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        </div>

        <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>No products found.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
              {filteredProducts.map(p => (
                <button key={p.id} onClick={() => addToCart(p)}
                  className="text-left p-3 rounded-xl border hover:shadow-md transition-shadow"
                  style={{ borderColor: 'var(--light-gray)' }}>
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--charcoal)' }}>{p.name}</p>
                  {p.sku && <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{p.sku}</p>}
                  <p className="text-sm font-bold mt-1" style={{ color: 'var(--teal)' }}>{formatCurrency(toNum(p.price))}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="space-y-4">
        <div className="rounded-2xl border bg-white p-4 space-y-4" style={{ borderColor: 'var(--light-gray)' }}>
          <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
            <ShoppingCart size={16} /> Cart ({cart.length})
          </h3>

          {error && (
            <div className="px-3 py-2 rounded-xl text-xs bg-red-50 text-red-700 flex items-center gap-1">
              <AlertCircle size={12} /> {error}
            </div>
          )}

          {cart.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--mid-gray)' }}>Cart is empty</p>
          ) : (
            <div className="space-y-2">
              {cart.map((c, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{ color: 'var(--charcoal)' }}>{c.name}</p>
                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(c.unitPrice)} each</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <button onClick={() => updateCartQty(idx, c.quantity - 1)} className="w-6 h-6 rounded-lg border flex items-center justify-center text-xs" style={{ borderColor: 'var(--light-gray)' }}>-</button>
                    <span className="text-xs w-4 text-center">{c.quantity}</span>
                    <button onClick={() => updateCartQty(idx, c.quantity + 1)} className="w-6 h-6 rounded-lg border flex items-center justify-center text-xs" style={{ borderColor: 'var(--light-gray)' }}>+</button>
                    <span className="text-xs font-medium w-16 text-right" style={{ color: 'var(--charcoal)' }}>{formatCurrency(c.lineTotal)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Discount */}
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--light-gray)' }}>
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--charcoal)' }}>
              <input type="checkbox" checked={pwdDiscount}
                onChange={e => { setPwdDiscount(e.target.checked); if (e.target.checked) setCustomDiscountId('') }} className="rounded" />
              PWD / Senior (20%)
            </label>
            {!pwdDiscount && (
              <select value={customDiscountId} onChange={e => setCustomDiscountId(e.target.value)}
                className="w-full px-2 py-2 rounded-xl border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                <option value="">No discount</option>
                {discountSettings.map(ds => (
                  <option key={ds.id} value={ds.id}>{ds.name} ({ds.type === 'PERCENTAGE' ? `${toNum(ds.value)}%` : formatCurrency(toNum(ds.value))})</option>
                ))}
              </select>
            )}
          </div>

          {/* Payment */}
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Payment</h4>
            {payments.map((p, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <select value={p.method} onChange={e => setPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, method: e.target.value } : pp))}
                  className="px-2 py-2 rounded-xl border text-xs outline-none flex-1" style={{ borderColor: 'var(--light-gray)' }}>
                  {PAYMENT_METHODS_PRODUCT.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <input type="number" min={0} step="0.01" value={p.amount || ''} placeholder="Amt"
                  onChange={e => setPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, amount: parseFloat(e.target.value) || 0 } : pp))}
                  className="w-24 px-2 py-2 rounded-xl border text-xs outline-none text-right" style={{ borderColor: 'var(--light-gray)' }} />
                {payments.length > 1 && (
                  <button onClick={() => setPayments(prev => prev.filter((_, i) => i !== idx))} className="p-1 rounded hover:bg-red-50">
                    <X size={12} className="text-red-500" />
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setPayments(prev => [...prev, { method: 'CASH', amount: 0 }])}
              className="text-xs font-medium" style={{ color: 'var(--teal)' }}>
              + Add Payment
            </button>
          </div>

          {/* Totals */}
          <div className="pt-2 border-t space-y-1" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            {discountAmount > 0 && <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Discount</span><span className="text-red-600">-{formatCurrency(discountAmount)}</span></div>}
            <div className="flex justify-between text-sm font-bold"><span style={{ color: 'var(--charcoal)' }}>Net</span><span style={{ color: 'var(--deep-teal)' }}>{formatCurrency(netAmount)}</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Paid</span><span>{formatCurrency(totalPayments)}</span></div>
            {totalPayments >= netAmount && netAmount > 0 && (
              <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Change</span><span className="text-green-700">{formatCurrency(totalPayments - netAmount)}</span></div>
            )}
          </div>

          <button onClick={handleSubmit} disabled={submitting || cart.length === 0 || totalPayments < netAmount}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--teal)' }}>
            {submitting && <Loader2 className="animate-spin" size={14} />}
            Complete Order
          </button>
        </div>

        {/* Discount Settings */}
        <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <button onClick={() => setShowDiscountSettings(!showDiscountSettings)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium"
            style={{ color: 'var(--charcoal)' }}>
            Discount Settings
            {showDiscountSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showDiscountSettings && (
            <div className="px-4 pb-4 space-y-3">
              {discountSettings.map(ds => (
                <div key={ds.id} className="flex items-center justify-between text-xs p-2 rounded-lg" style={{ background: 'var(--off-white)' }}>
                  <span style={{ color: 'var(--charcoal)' }}>{ds.name} — {ds.type === 'PERCENTAGE' ? `${toNum(ds.value)}%` : formatCurrency(toNum(ds.value))}</span>
                  <button onClick={() => deleteDiscountSetting(ds.id)} className="p-1 rounded hover:bg-red-50"><Trash2 size={12} className="text-red-500" /></button>
                </div>
              ))}
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <input value={dsForm.name} onChange={e => setDsForm({ ...dsForm, name: e.target.value })} placeholder="Discount name"
                  className="w-full px-3 py-2 rounded-xl border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                <div className="flex gap-2">
                  <select value={dsForm.type} onChange={e => setDsForm({ ...dsForm, type: e.target.value as 'PERCENTAGE' | 'FIXED' })}
                    className="px-3 py-2 rounded-xl border text-xs outline-none flex-1" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED">Fixed Amount</option>
                  </select>
                  <input type="number" min={0} value={dsForm.value || ''} onChange={e => setDsForm({ ...dsForm, value: parseFloat(e.target.value) || 0 })}
                    placeholder="Value" className="w-24 px-3 py-2 rounded-xl border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
                <button onClick={createDiscountSetting} className="px-4 py-2 rounded-xl text-xs text-white font-medium" style={{ background: 'var(--teal)' }}>
                  Add Discount
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SALES SUMMARY SECTION
   ══════════════════════════════════════════════════════════════ */

function SalesSummarySection({ branch, canSelectBranch }: { branch: string; canSelectBranch: boolean }) {
  const [selectedBranch, setSelectedBranch] = useState(canSelectBranch ? '' : branch)
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedBranch) params.set('branch', selectedBranch)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      params.set('pageSize', '500')
      const r = await fetch(`/api/pos/orders?${params}`)
      const d = await r.json()
      setOrders(normalize(d) as Order[])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [selectedBranch, dateFrom, dateTo])

  useEffect(() => { fetchReport() }, [fetchReport])

  // Calculate summary
  const activeOrders = orders.filter(o => o.status !== 'VOIDED')
  const grossSales = activeOrders.reduce((s, o) => s + toNum(o.subtotal), 0)
  const totalDiscounts = activeOrders.reduce((s, o) => s + toNum(o.discountAmount), 0)
  const netSales = activeOrders.reduce((s, o) => s + toNum(o.netAmount), 0)
  const unearnedRevenue = activeOrders.filter(o => o.revenueType === 'UNEARNED').reduce((s, o) => s + toNum(o.netAmount), 0)

  // Payment method breakdown
  const paymentBreakdown: Record<string, { count: number; total: number }> = {}
  activeOrders.forEach(o => {
    o.payments.forEach(p => {
      const m = p.method
      if (!paymentBreakdown[m]) paymentBreakdown[m] = { count: 0, total: 0 }
      paymentBreakdown[m].count++
      paymentBreakdown[m].total += toNum(p.amount)
    })
  })

  const serviceOrders = activeOrders.filter(o => o.orderType === 'SERVICE')
  const productOrders = activeOrders.filter(o => o.orderType === 'PRODUCT')

  const exportCSV = (type: 'services' | 'products') => {
    const filtered = type === 'services' ? serviceOrders : productOrders
    const rows = [['Order #', 'Date', 'Patient', 'Items', 'Subtotal', 'Discount', 'Net Amount', 'Payments', 'Status']]
    filtered.forEach(o => {
      rows.push([
        o.orderNumber,
        o.transactionDate,
        o.patientName || '',
        o.items.map(i => i.name).join('; '),
        toNum(o.subtotal).toFixed(2),
        toNum(o.discountAmount).toFixed(2),
        toNum(o.netAmount).toFixed(2),
        o.payments.map(p => `${p.method}:${toNum(p.amount).toFixed(2)}`).join('; '),
        o.status,
      ])
    })
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}-report-${dateFrom}-to-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printReport = () => {
    const win = window.open('', '_blank')
    if (!win || !printRef.current) return
    win.document.write(`<html><head><title>Sales Report</title><style>
      body{font-family:sans-serif;padding:20px}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}
      th{background:#f5f5f5}
      h1,h2,h3{margin:8px 0}
    </style></head><body>${printRef.current.innerHTML}<script>window.print();window.close();<\/script></body></html>`)
    win.document.close()
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {canSelectBranch && (
          <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
            className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        )}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        <button onClick={fetchReport} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--teal)' }}>
          <Filter size={14} /> Generate
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
      ) : (
        <>
          {/* Report Card */}
          <div ref={printRef}>
            <div className="rounded-2xl border bg-white p-6 space-y-6" style={{ borderColor: 'var(--light-gray)' }}>
              <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                End-of-Day Report
              </h3>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                {formatDate(dateFrom)} {dateFrom !== dateTo ? `— ${formatDate(dateTo)}` : ''} &middot; {activeOrders.length} transactions
              </p>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Gross Sales', value: grossSales, color: 'var(--charcoal)' },
                  { label: 'Discounts', value: totalDiscounts, color: '#991b1b' },
                  { label: 'Net Sales', value: netSales, color: 'var(--deep-teal)' },
                  { label: 'Unearned Revenue', value: unearnedRevenue, color: '#92400e' },
                ].map(c => (
                  <div key={c.label} className="rounded-xl p-4" style={{ background: 'var(--off-white)' }}>
                    <p className="text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>{c.label}</p>
                    <p className="text-lg font-bold" style={{ color: c.color }}>{formatCurrency(c.value)}</p>
                  </div>
                ))}
              </div>

              {/* Payment Method Breakdown */}
              <div>
                <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Payment Method Breakdown</h4>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--off-white)' }}>
                        {['Method', 'Count', 'Total'].map(h => (
                          <th key={h} className="px-4 py-2 text-left text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(paymentBreakdown).map(([method, data]) => (
                        <tr key={method} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                          <td className="px-4 py-2" style={{ color: 'var(--charcoal)' }}>{method}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--mid-gray)' }}>{data.count}</td>
                          <td className="px-4 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(data.total)}</td>
                        </tr>
                      ))}
                      {Object.keys(paymentBreakdown).length === 0 && (
                        <tr><td colSpan={3} className="px-4 py-4 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>No payment data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex flex-wrap gap-3">
            <button onClick={() => exportCSV('services')} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
              <Download size={14} /> Services CSV
            </button>
            <button onClick={() => exportCSV('products')} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
              <Download size={14} /> Products CSV
            </button>
            <button onClick={printReport} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
              <Printer size={14} /> Print Report
            </button>
          </div>
        </>
      )}
    </div>
  )
}
