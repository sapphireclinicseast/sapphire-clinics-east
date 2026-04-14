'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import {
  ShoppingCart, Search, Plus, X, Trash2, ChevronDown, ChevronUp,
  CreditCard, Wallet, FileText, Download, Printer,
  RefreshCw, Ban, Star, Filter,
  Loader2, AlertCircle, ScanLine, UserPlus,
  Pencil, PlusCircle, ToggleLeft, ToggleRight, Eye,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import Pagination from '@/components/ui/Pagination'

/* ─────────────────────────── TYPES ─────────────────────────── */

interface QueueItem {
  id: string
  time: string
  patientName: string
  patientId?: string | null
  sessionType: string
  clinician: string
  converted?: boolean
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
  noPwdDiscount?: boolean
  doctorFee?: string | number | null
  clinicFee?: string | number | null
  revenueType?: string
  [key: string]: unknown
}

interface OrderLineItem {
  serviceId?: string
  inventoryItemId?: string
  name: string
  department?: string
  quantity: number
  unitPrice: number
  lineTotal: number
  hasDoctorFee?: boolean
  pwdDiscountClinicOnly?: boolean
  noPwdDiscount?: boolean
  priceType?: string
  doctorFee?: number
  clinicFee?: number
}

interface PaymentLine {
  method: string
  amount: number
  paymentModeId?: string  // configured PaymentMode id (carries deduction rules + account routing)
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
  issuedOfficialInvoice?: boolean
  salesInvoiceNumber?: string | null
  referenceNumber?: string | null
  notes?: string | null
  status: string
  items: { id: string; name: string; quantity: number; unitPrice: string | number; lineTotal: string | number; serviceId?: string; inventoryItemId?: string; service?: { department?: string; revenueType?: string } | null }[]
  payments: { id: string; method: string; amount: string | number; walletId?: string; reference?: string }[]
  arPaymentItems?: { paymentId: string }[]
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
  vipTier?: string | null
  balance: string | number
  patientId?: string | null
  patientName: string
  patientEmail?: string | null
  rewardPoints: number
  isActive?: boolean
  dateObtained?: string | null
  agency?: string | null
  attachmentUrl?: string | null
  _count?: { packages: number }
  packages?: WalletPackage[]
  logs?: WalletLog[]
  [key: string]: unknown
}

interface WalletPackage {
  id: string
  serviceName: string
  department?: string | null
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

interface PaymentModeDeductionType {
  id: string
  name: string
  rate: number
  accountId?: string | null
  account?: { id: string; accountNumber: string; accountTitle: string } | null
}

interface PaymentModeType {
  id: string
  name: string
  paymentMethod?: string | null  // e.g. 'CASH', 'GCASH', 'CREDIT_CARD'
  branch?: string | null  // null = all branches
  isActive: boolean
  accountId?: string | null
  account?: { id: string; accountNumber: string; accountTitle: string } | null
  deductions: PaymentModeDeductionType[]
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
  barcode?: string | null
  sellingPrice?: string | number | null
  rewardPointsPrice?: number | null
  unitCost?: string | number
  quantity?: number
  [key: string]: unknown
}

/* ─────────────────────────── CONSTANTS ─────────────────────────── */

const PAYMENT_METHODS_SERVICE = [
  { value: 'CASH', label: 'Cash' },
  { value: 'GCASH', label: 'GCash' },
  { value: 'PAYMAYA', label: 'PayMaya' },
  { value: 'DEBIT', label: 'Debit Card' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'HMO', label: 'HMO' },
  { value: 'GL', label: 'Guarantee Letter (GL)' },
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
  { value: 'HMO', label: 'HMO' },
  { value: 'GL', label: 'Guarantee Letter' },
]

const WALLET_TYPE_LABELS: Record<string, string> = {
  PACKAGE: 'Package',
  VIP: 'VIP',
  PREPAID_CARD: 'Prepaid Card',
  DOWNPAYMENT: 'Downpayment',
  ADVANCE: 'Advance',
  HMO: 'HMO',
  GL: 'Guarantee Letter',
}

const WALLET_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  PACKAGE: { bg: '#dbeafe', color: '#1e40af' },
  VIP: { bg: '#fef3c7', color: '#92400e' },
  PREPAID_CARD: { bg: '#dcfce7', color: '#166534' },
  DOWNPAYMENT: { bg: '#fce7f3', color: '#9d174d' },
  ADVANCE: { bg: '#e0e7ff', color: '#3730a3' },
  HMO: { bg: '#fff7ed', color: '#c2410c' },
  GL: { bg: '#f0fdf4', color: '#15803d' },
}

/* ─────────────────────────── HELPERS ─────────────────────────── */

function toNum(v: string | number | undefined | null): number {
  return Number(v) || 0
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function printThermalReceipt(order: {
  orderNumber: string | number
  transactionDate: string
  patientName?: string | null
  clinicianName?: string | null
  items: { name: string; quantity: number; unitPrice: string | number; lineTotal: string | number }[]
  payments: { method: string; amount: string | number }[]
  subtotal: string | number
  discountAmount: string | number
  discountLabel?: string | null
  netAmount: string | number
  revenueType?: string
  branch?: string
  createdBy?: { name: string }
}) {
  const fmt = (v: string | number) => Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const totalPaid = order.payments.reduce((s, p) => s + Number(p.amount), 0)
  const change = totalPaid - Number(order.netAmount)
  const isVerdana = order.branch === 'VERDANA_STORE'
  const branchName = order.branch === 'SANDBOX_EAST' ? 'Sandbox Clinic \u2013 East' : order.branch === 'SANDBOX_GREENHILLS' ? 'Sandbox Clinic \u2013 Greenhills' : isVerdana ? 'VERDANA STORE' : order.branch || ''
  const address = isVerdana ? 'Room 210B, Henry\'s Building, 80 Ortigas Extension, San Juan City' : order.branch === 'SANDBOX_GREENHILLS' ? 'Greenhills Shopping Center, San Juan City' : 'Level 4 Robinsons MetroEast, Brgy. Dela Paz, Pasig City'
  const phone = isVerdana ? '+63 917 173 1368' : '+63 917 118 9289 | (02) 5310 4991'
  const email = isVerdana ? 'verdanatrading@gmail.com' : 'east.sandboxclinic@gmail.com'
  const paymentLabel = order.payments.map(p => p.method.replace(/_/g, ' ')).join(', ')
  const html = `<div style="font-family:'Arial Black',Arial,Helvetica,sans-serif;font-weight:900;font-size:11px;width:280px;padding:8px;line-height:1.5;color:#000">
<div style="text-align:center;font-weight:900;font-size:12px">Sapphire Clinics East Inc.</div>
<div style="text-align:center;font-size:11px;font-weight:900">${branchName}</div>
<div style="text-align:center;font-size:9px;font-weight:900">${address}</div>
<div style="text-align:center;font-size:9px;font-weight:900">VAT-registered TIN: 010-817-642-00000</div>
<div style="text-align:center;font-size:9px;font-weight:900">${phone}</div>
<div style="text-align:center;font-size:9px;font-weight:900;margin-bottom:6px">${email}</div>
<div style="font-size:10px;font-weight:900">Receptionist: ${order.createdBy?.name || '\u2014'}</div>
<div style="font-size:10px;font-weight:900">Date: ${formatDate(order.transactionDate)}</div>
<div style="font-size:10px;font-weight:900">Order No: ${order.orderNumber}</div>
<div style="font-size:10px;font-weight:900">Payment Method: ${paymentLabel}</div>
<div style="font-size:10px;font-weight:900">Patient Name: ${order.patientName || '\u2014'}</div>
<div style="border-top:1px solid #000;border-bottom:1px solid #000;margin:6px 0;padding:3px 0;display:flex;justify-content:space-between;font-weight:900;font-size:10px">
<span>Product/s or Service/s</span><span>Amount</span></div>
${order.items.map(it => `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:900;margin:2px 0">
<span>${it.name}${it.quantity > 1 ? ' x' + it.quantity : ''}</span><span>${fmt(it.lineTotal)}</span></div>`).join('')}
<div style="border-bottom:1px solid #000;margin:6px 0"></div>
<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:900"><span>Subtotal:</span><span>${fmt(order.subtotal)}</span></div>
<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:900"><span>VAT:</span><span>Inclusive</span></div>
${Number(order.discountAmount) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:900"><span>Discount${order.discountLabel ? ' (' + order.discountLabel + ')' : ''}:</span><span>-${fmt(order.discountAmount)}</span></div>` : ''}
<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:900;margin-top:2px"><span>Total:</span><span>${fmt(order.netAmount)}</span></div>
${change > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:900"><span>Change:</span><span>${fmt(change)}</span></div>` : ''}
${order.revenueType === 'UNEARNED' ? '<div style="text-align:center;margin-top:4px;font-size:9px;font-weight:900;font-style:italic">** UNEARNED REVENUE **</div>' : ''}
<div style="text-align:center;margin-top:10px;font-size:11px;font-weight:900">Thank you!</div>
<div style="text-align:center;font-size:8px;font-weight:900;margin:4px 0">Follow us on Facebook, Instagram, and Tiktok @sandboxcliniceast</div>
<div style="text-align:center;font-size:8px;font-weight:900;font-style:italic;margin-bottom:8px">This is not an official sales invoice. Please request the sales invoice from the front desk.</div>
<div style="display:flex;justify-content:center;align-items:center;gap:12px;margin:10px 0">
<img src="/qr-feedback.png" style="width:70px;height:70px;filter:grayscale(100%) contrast(150%)" />
<div style="font-size:8px;font-weight:900;text-align:center;flex:1;line-height:1.3">Scan this QR Code for any concerns/<br/>complaints.</div>
<img src="/scei-mark.png" style="width:65px;height:65px;filter:grayscale(100%) contrast(150%)" onerror="this.style.display='none'" />
</div></div>`

  const win = window.open('', '_blank', 'width=320,height=700')
  if (!win) return
  win.document.write(`<html><head><title>Receipt #${order.orderNumber}</title><style>@page{size:80mm auto;margin:2mm}@media print{body{margin:0}}*{font-family:'Arial Black',Arial,Helvetica,sans-serif!important;font-weight:900!important;color:#000!important}img{filter:grayscale(100%) contrast(150%)!important}</style></head><body style="margin:0;padding:0">${html}<script>setTimeout(()=>{window.print();window.close()},500)<\/script></body></html>`)
  win.document.close()
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

/** Convert "LASTNAME, FIRSTNAME" → "FIRSTNAME LASTNAME" for display, keeps ALL CAPS */
function formatClinicianName(name: string | null | undefined): string {
  if (!name) return '—'
  // If name contains a comma, assume "LASTNAME, FIRSTNAME" format → flip to "FIRSTNAME LASTNAME"
  if (name.includes(',')) {
    const parts = name.split(',').map(p => p.trim())
    if (parts.length === 2 && parts[0] && parts[1]) {
      return `${parts[1]} ${parts[0]}`.toUpperCase()
    }
  }
  return name.toUpperCase()
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

  // ── Top-level tab: Services | Orders | Products | Sales Summary
  const [mainTab, setMainTab] = useState<'services' | 'orders' | 'products' | 'sales'>('services')
  // ── Services sub-tab
  const [serviceTab, setServiceTab] = useState<'cashier' | 'wallet' | 'discounts' | 'payment-modes' | 'referrers'>('cashier')
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
    { key: 'orders' as const, label: 'Orders', icon: <FileText size={16} /> },
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
      {mainTab === 'orders' && (
        <OrdersPanel branch={branch} canSelectBranch={true} />
      )}
      {mainTab === 'products' && (
        <ProductsSection branch={branch} canSelectBranch={canSelectBranch} session={session} />
      )}
      {mainTab === 'sales' && (
        <SalesSection branch={branch} canSelectBranch={canSelectBranch} />
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
  serviceTab: 'cashier' | 'wallet' | 'discounts' | 'payment-modes' | 'referrers'
  setServiceTab: (t: 'cashier' | 'wallet' | 'discounts' | 'payment-modes' | 'referrers') => void
  session: { user?: Record<string, unknown> } | null
}) {
  const subTabs = [
    { key: 'cashier' as const, label: 'Cashier' },
    { key: 'wallet' as const, label: 'Digital Wallet' },
    { key: 'discounts' as const, label: 'Discount Settings' },
    { key: 'payment-modes' as const, label: 'Payment Mode Settings' },
    { key: 'referrers' as const, label: 'Doctor Referrers' },
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
      {serviceTab === 'wallet' && (
        <WalletPanel session={session} />
      )}
      {serviceTab === 'discounts' && (
        <DiscountSettingsPanel />
      )}
      {serviceTab === 'payment-modes' && (
        <PaymentModeSettingsPanel />
      )}
      {serviceTab === 'referrers' && (
        <ReferrerSettingsPanel />
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
                    <td className="px-5 py-3" style={{ color: 'var(--mid-gray)' }}>{formatClinicianName(q.clinician)}</td>
                    <td className="px-5 py-3">
                      {q.converted ? (
                        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#dcfce7', color: '#166534' }}>
                          Converted
                        </span>
                      ) : (
                        <button
                          onClick={() => { setPrefill(q); setShowOrderForm(true) }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                          style={{ background: 'var(--teal)' }}
                        >
                          Convert to Order
                        </button>
                      )}
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
  const [clinicianName, setClinicianName] = useState(prefill?.clinician ? (formatClinicianName(prefill.clinician) === '—' ? '' : formatClinicianName(prefill.clinician)) : '')
  const [clinicianSearch, setClinicianSearch] = useState('')
  const [clinicians, setClinicians] = useState<StaffMember[]>([])
  const [showClinicianDrop, setShowClinicianDrop] = useState(false)
  const [items, setItems] = useState<OrderLineItem[]>([])
  const [serviceSearch, setServiceSearch] = useState('')
  const [services, setServices] = useState<ServiceItem[]>([])
  const [showServiceDrop, setShowServiceDrop] = useState(false)
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: 'CASH', amount: 0 }])
  const [configuredModes, setConfiguredModes] = useState<PaymentModeType[]>([])
  const [pwdDiscount, setPwdDiscount] = useState(false)
  const [customDiscountId, setCustomDiscountId] = useState('')
  const [freeformDiscountAmt, setFreeformDiscountAmt] = useState(0)
  const [freeformDiscountType, setFreeformDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('FIXED')
  const [freeformDiscountRemarks, setFreeformDiscountRemarks] = useState('')
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
  const [dpSearch, setDpSearch] = useState('')
  const [dpWallets, setDpWallets] = useState<DigitalWallet[]>([])
  const [showPackagePay, setShowPackagePay] = useState(false)
  const [packageSearch, setPackageSearch] = useState('')
  const [packageWallets, setPackageWallets] = useState<DigitalWallet[]>([])
  const [selectedPackageWallet, setSelectedPackageWallet] = useState<DigitalWallet | null>(null)
  const [showHmoPay, setShowHmoPay] = useState(false)
  const [hmoSearch, setHmoSearch] = useState('')
  const [hmoWallets, setHmoWallets] = useState<DigitalWallet[]>([])
  const [showGlPay, setShowGlPay] = useState(false)
  const [glSearch, setGlSearch] = useState('')
  const [glWallets, setGlWallets] = useState<DigitalWallet[]>([])
  const [showAdvancePay, setShowAdvancePay] = useState(false)
  const [advanceSearch, setAdvanceSearch] = useState('')
  const [advanceWallets, setAdvanceWallets] = useState<DigitalWallet[]>([])
  const [isAdvancePayment, setIsAdvancePayment] = useState(false)
  const [walletPopup, setWalletPopup] = useState<{ show: boolean; wallet?: DigitalWallet; walletType?: string }>({ show: false })
  const [patientId, setPatientId] = useState(prefill?.patientId as string || '')
  const [activeWallet, setActiveWallet] = useState<DigitalWallet | null>(null) // wallet being used for payment
  const [walletDiscountApplied, setWalletDiscountApplied] = useState(false)
  const [walletDiscountRules, setWalletDiscountRules] = useState<WalletDiscountRuleItem[]>([])
  const [issuedOfficialInvoice, setIssuedOfficialInvoice] = useState(false)
  const [salesInvoiceNumber, setSalesInvoiceNumber] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const patientTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const clinicianTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const serviceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Fetch discount settings + referrers + payment modes on mount
  useEffect(() => {
    fetch('/api/pos/discount-settings').then(r => r.json()).then(d => setDiscountSettings(normalize(d) as DiscountSetting[])).catch(() => {})
    fetch('/api/referrers?all=true').then(r => r.json()).then(d => setReferrers(normalize(d) as Referrer[])).catch(() => {})
    fetch(`/api/pos/payment-modes?branch=${encodeURIComponent(branch)}`).then(r => r.json()).then(d => setConfiguredModes(Array.isArray(d) ? d.filter((m: PaymentModeType) => m.isActive) : [])).catch(() => {})
  }, [branch])

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
        const r = await fetch(`/api/services?pageSize=2000&branch=${branch}`)
        const d = await r.json()
        setServices(normalize(d) as ServiceItem[])
      } catch { setServices([]) }
    }, 200)
  }, [branch])

  const filteredServices = services.filter(s =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  )

  // Compute the effective price for a service based on branch and effective dates
  const effectivePrice = (svc: ServiceItem) => {
    let price = toNum(svc.price)
    const now = new Date()
    const bps = svc.branchPrices as { branch: string; price: string | number; newPrice?: string | number | null; newPriceEffectiveDate?: string | null }[] | undefined
    if (bps?.length) {
      const bp = bps.find(b => b.branch === branch)
      if (bp) {
        price = toNum(bp.price)
        if (bp.newPrice && bp.newPriceEffectiveDate && new Date(bp.newPriceEffectiveDate) <= now) {
          price = toNum(bp.newPrice)
        }
        return price
      }
    }
    if (svc.newPrice && svc.newPriceEffectiveDate && new Date(svc.newPriceEffectiveDate as string) <= now) {
      price = toNum(svc.newPrice as string | number)
    }
    return price
  }

  const addItem = (svc: ServiceItem) => {
    const price = effectivePrice(svc)
    setItems(prev => [...prev, {
      serviceId: svc.id,
      name: svc.name,
      department: svc.department,
      quantity: 1,
      unitPrice: price,
      lineTotal: price,
      hasDoctorFee: svc.hasDoctorFee,
      pwdDiscountClinicOnly: svc.pwdDiscountClinicOnly,
      noPwdDiscount: svc.noPwdDiscount,
      priceType: svc.priceType as string | undefined,
      doctorFee: svc.doctorFee != null ? toNum(svc.doctorFee) : undefined,
      clinicFee: svc.clinicFee != null ? toNum(svc.clinicFee) : undefined,
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

  // Check if ALL items block PWD discount (only fully block if nothing is eligible)
  const pwdBlocked = items.length > 0 && items.every(it => it.noPwdDiscount)
  const pwdBlockedItems = items.filter(it => it.noPwdDiscount).map(it => it.name)
  const hasMixedPwdItems = items.some(it => it.noPwdDiscount) && !pwdBlocked

  // Calculate totals
  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0)

  let discountAmount = 0
  let discountType = 'NONE'
  let discountLabel = ''
  let pwdNote = ''

  if (pwdDiscount) {
    discountType = 'PWD_SC'
    discountLabel = 'PWD/Senior Citizen (20%)'
    // Apply 20% only to items that allow PWD discount (skip noPwdDiscount items)
    const eligibleItems = items.filter(it => !it.noPwdDiscount)
    const hasClinicOnly = eligibleItems.some(it => it.hasDoctorFee && it.pwdDiscountClinicOnly)
    if (hasMixedPwdItems) {
      pwdNote = `Discount excludes: ${pwdBlockedItems.join(', ')}`
    }
    if (hasClinicOnly) {
      pwdNote = (pwdNote ? pwdNote + ' | ' : '') + 'Discount on clinic fee only (doctor fee excluded)'
      discountAmount = eligibleItems.reduce((sum, it) => {
        if (it.hasDoctorFee && it.pwdDiscountClinicOnly && it.clinicFee != null) {
          return sum + (it.clinicFee * it.quantity * 0.2)
        }
        return sum + (it.lineTotal * 0.2)
      }, 0)
    } else {
      discountAmount = eligibleItems.reduce((sum, it) => sum + (it.lineTotal * 0.2), 0)
    }
  } else if (walletDiscountApplied && walletDiscountRules.length > 0 && customDiscountId) {
    // Apply per-service wallet discount rules
    discountType = 'CUSTOM'
    const ds = discountSettings.find(d => d.id === customDiscountId)
    discountLabel = ds?.name || 'Wallet Discount'
    discountAmount = items.reduce((total, it) => {
      const matchByService = walletDiscountRules.find(r => r.serviceId && r.serviceId === it.serviceId)
      const svc = services.find(s => s.id === it.serviceId)
      const matchByDept = walletDiscountRules.find(r => r.department && svc?.department === r.department)
      const rule = matchByService || matchByDept
      if (rule) {
        return total + (it.lineTotal * toNum(rule.discountPercent) / 100)
      }
      if (ds) {
        return total + (ds.type === 'PERCENTAGE' ? it.lineTotal * (toNum(ds.value) / 100) : toNum(ds.value) / items.length)
      }
      return total
    }, 0)
  } else if (customDiscountId === '__FREEFORM__' && freeformDiscountAmt > 0) {
    discountType = 'CUSTOM'
    discountLabel = freeformDiscountRemarks.trim() || 'Custom Discount'
    discountAmount = freeformDiscountType === 'PERCENTAGE' ? subtotal * (freeformDiscountAmt / 100) : freeformDiscountAmt
  } else if (customDiscountId) {
    const ds = discountSettings.find(d => d.id === customDiscountId)
    if (ds) {
      discountType = 'CUSTOM'
      discountLabel = ds.name
      discountAmount = ds.type === 'PERCENTAGE' ? subtotal * (toNum(ds.value) / 100) : toNum(ds.value)
    }
  }

  const netAmount = Math.max(0, subtotal - discountAmount)
  // For Package payments, always use netAmount (items prices are already set to per-session rate)
  const totalPayments = payments.reduce((s, p) => {
    if (p.method === 'PACKAGE') return s + netAmount
    return s + toNum(p.amount)
  }, 0)
  const changeDue = totalPayments - netAmount

  // Search package wallets by patient name
  // Search HMO/GL wallets
  const searchHmoWallets = async (q: string) => {
    setHmoSearch(q)
    try {
      const params = new URLSearchParams({ walletType: 'HMO' })
      if (q) params.set('search', q)
      if (!isAdmin(session)) params.set('branch', userBranch(session))
      const r = await fetch(`/api/pos/wallets?${params}`)
      const d = await r.json()
      setHmoWallets(normalize(d) as DigitalWallet[])
    } catch { setHmoWallets([]) }
  }

  const searchGlWallets = async (q: string) => {
    setGlSearch(q)
    try {
      const params = new URLSearchParams({ walletType: 'GL' })
      if (q) params.set('search', q)
      if (!isAdmin(session)) params.set('branch', userBranch(session))
      const r = await fetch(`/api/pos/wallets?${params}`)
      const d = await r.json()
      setGlWallets(normalize(d) as DigitalWallet[])
    } catch { setGlWallets([]) }
  }

  const searchDpWallets = async (q: string) => {
    setDpSearch(q)
    try {
      const params = new URLSearchParams({ walletType: 'DOWNPAYMENT' })
      if (q) params.set('search', q)
      const r = await fetch(`/api/pos/wallets?${params}`)
      const d = await r.json()
      setDpWallets(normalize(d) as DigitalWallet[])
    } catch { setDpWallets([]) }
  }

  const searchAdvanceWallets = async (q: string) => {
    setAdvanceSearch(q)
    try {
      const params = new URLSearchParams({ walletType: 'ADVANCE' })
      if (q) params.set('search', q)
      const r = await fetch(`/api/pos/wallets?${params}`)
      const d = await r.json()
      setAdvanceWallets(normalize(d) as DigitalWallet[])
    } catch { setAdvanceWallets([]) }
  }

  const searchPackageWallets = async (q: string) => {
    setPackageSearch(q)
    if (q.length < 2) { setPackageWallets([]); return }
    try {
      const r = await fetch(`/api/pos/wallets?search=${encodeURIComponent(q)}&walletType=PACKAGE&branch=${branch}`)
      const d = await r.json()
      setPackageWallets(normalize(d) as DigitalWallet[])
    } catch { setPackageWallets([]) }
  }

  // Select a package wallet — find per-session rate and link
  // Match package to the service being consumed by department or name
  const selectPackageWallet = async (wallet: DigitalWallet) => {
    setSelectedPackageWallet(wallet)
    try {
      const r = await fetch(`/api/pos/wallets/${wallet.id}`)
      const detail = await r.json()
      const allPkgs = (detail.packages || []).filter((pkg: WalletPackage) => {
        const remaining = pkg.totalSessions - pkg.usedSessions
        return remaining > 0 && pkg.isActive
      })
      // Try to match by department of current item(s)
      const currentDept = items[0]?.department?.toUpperCase() || ''
      const currentName = items[0]?.name?.toUpperCase() || ''
      let activePkg = allPkgs.find((pkg: WalletPackage) => {
        const pkgDept = (pkg.department || '').toUpperCase()
        const pkgName = (pkg.serviceName || '').toUpperCase()
        // Match by department (e.g. OT, ST, SLP)
        if (currentDept && pkgDept && pkgDept === currentDept) return true
        // Match by name containing department abbreviation
        if (currentDept && pkgName.includes(currentDept)) return true
        // Match by service name similarity
        if (currentName && pkgName.includes(currentName)) return true
        return false
      })
      // Fallback: pick the first active package if no department match
      if (!activePkg && allPkgs.length > 0) activePkg = allPkgs[0]

      if (activePkg) {
        // Per-session rate = amountPaid at purchase time / total sessions
        // This locks in the original purchase price regardless of current service price
        const perSession = toNum(activePkg.amountPaid) / activePkg.totalSessions
        setPayments(prev => {
          const existing = prev.findIndex(p => p.method === 'PACKAGE')
          if (existing >= 0) {
            return prev.map((p, i) => i === existing ? { ...p, amount: perSession, walletId: wallet.id, reference: `PKG:${activePkg.id}` } : p)
          }
          return [...prev, { method: 'PACKAGE', amount: perSession, walletId: wallet.id, reference: `PKG:${activePkg.id}` }]
        })
        // Override ALL item prices to per-session rate (based on package purchase price, not current price)
        if (items.length > 0) {
          setItems(prev => prev.map(it => ({ ...it, unitPrice: perSession, lineTotal: perSession * it.quantity })))
        }
      } else {
        setError('No active packages with remaining sessions found')
      }
    } catch { setError('Failed to load package details') }
    setShowPackagePay(false)
    setPackageSearch('')
    setPackageWallets([])
  }

  const applyWalletDiscount = async (wallet: DigitalWallet) => {
    setActiveWallet(wallet)
    if (!wallet.walletType) return
    // Don't override discount if user already selected one
    if (customDiscountId || pwdDiscount) return
    try {
      const r = await fetch(`/api/pos/discount-settings?walletType=${wallet.walletType}`)
      const d = await r.json()
      const settings = normalize(d) as DiscountSettingFull[]
      if (settings.length > 0) {
        // Try to match by VIP tier if wallet has one
        let matched = settings[0]
        if (wallet.vipTier && settings.length > 1) {
          const tierName = wallet.vipTier.toLowerCase()
          const tierMatch = settings.find(s => s.name.toLowerCase().includes(tierName))
          if (tierMatch) matched = tierMatch
        }
        if (matched.rules && matched.rules.length > 0) {
          setWalletDiscountRules(matched.rules)
          setWalletDiscountApplied(true)
        }
        setCustomDiscountId(matched.id)
        setPwdDiscount(false)
      }
    } catch { /* no wallet discounts available */ }
  }

  // Wallet barcode scan
  const scanBarcode = async () => {
    if (!walletBarcode.trim()) return
    try {
      const r = await fetch(`/api/pos/wallets/scan/${encodeURIComponent(walletBarcode.trim())}`)
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      // Replace primary payment with wallet — map walletType to PaymentMethod enum
      const walletMethodMap: Record<string, string> = { VIP: 'VIP_CARD', PREPAID_CARD: 'PREPAID_CARD', PACKAGE: 'PACKAGE', DOWNPAYMENT: 'DOWNPAYMENT', ADVANCE: 'ADVANCE', HMO: 'HMO', GL: 'GL' }
      const payMethod = walletMethodMap[d.walletType] || 'PREPAID_CARD'
      setPayments([{ method: payMethod, amount: 0, walletId: d.id, reference: d.barcode }])
      setShowWalletPay(false)
      setWalletBarcode('')
      // Auto-apply wallet discount
      applyWalletDiscount(d)
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

    // Validate clinician has no disabled unit pays for the services in this order
    if (clinicianName.trim() && effectiveRevenueType !== 'UNEARNED' && !isAdvancePayment) {
      const serviceIds = items.filter(i => i.serviceId).map(i => i.serviceId!)
      if (serviceIds.length > 0) {
        try {
          const vRes = await fetch('/api/pos/validate-clinician-services', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clinicianName: clinicianName.trim(), serviceIds }),
          })
          const vData = await vRes.json()
          if (!vData.valid && vData.blockedServices?.length > 0) {
            const serviceList = vData.blockedServices.map((b: { serviceName: string; unitPayName: string }) =>
              `\u2022 ${b.serviceName} (${b.unitPayName})`
            ).join('\n')
            alert(`Cannot complete order.\n\nThe following services have unit pay disabled for ${clinicianName.trim()}:\n\n${serviceList}\n\nPlease remove the service(s) or change the clinician.`)
            return
          }
        } catch { /* validation failed silently — allow checkout */ }
      }
    }

    setSubmitting(true)
    setError('')
    try {
      // If unearned or advance, auto-create/find digital wallet
      const walletType = getWalletType()
      if (walletType && patientId) {
        try {
          // For PACKAGE wallets, use service-specific patientId so different packages get separate wallets
          const firstItem = items[0]
          const svc = services.find(s => s.id === firstItem.serviceId)
          const walletPatientId = walletType === 'PACKAGE' && svc
            ? `${patientId}-${svc.department || 'GEN'}-${firstItem.name.replace(/\s+/g, '-').toUpperCase()}`
            : patientId
          const walletRes = await fetch('/api/pos/wallets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patientName: patientName.trim(),
              patientId: walletPatientId,
              walletType,
              branch,
            }),
          })
          const walletData = await walletRes.json()
          if (walletData.existingWallet) {
            setWalletPopup({ show: true, wallet: walletData, walletType })
          }
          // Reload wallet with the payment amount
          if (walletData.id) {
            // Use packageSessions from the service if available, otherwise fall back to item quantity
            const sessionCount = (svc as Record<string, unknown>)?.packageSessions
              ? Number((svc as Record<string, unknown>).packageSessions)
              : items.reduce((s, it) => s + it.quantity, 0)
            await fetch(`/api/pos/wallets/${walletData.id}/reload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serviceName: firstItem.name,
                serviceId: firstItem.serviceId || null,
                department: svc?.department || null,
                totalSessions: sessionCount,
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
        clinicianName: (isAdvancePayment || hasUnearnedItems) ? null : (clinicianName || null),
        queueItemId: prefill?.id || null,
        transactionDate: txDate,
        items: items.map(it => ({
          serviceId: it.serviceId || null,
          inventoryItemId: it.inventoryItemId || null,
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
        })),
        payments: payments.filter(p => toNum(p.amount) > 0 || p.method === 'PACKAGE').map(p => ({
          method: p.method,
          paymentModeId: p.paymentModeId || null,
          amount: p.method === 'PACKAGE' ? netAmount : toNum(p.amount),
          walletId: p.walletId || null,
          reference: p.reference || null,
        })),
        discountType,
        discountAmount,
        discountLabel: discountLabel || null,
        revenueType: effectiveRevenueType,
        referrerId: referrerId || null,
        issuedOfficialInvoice,
        salesInvoiceNumber: issuedOfficialInvoice ? salesInvoiceNumber.trim() : null,
        referenceNumber: referenceNumber.trim() || null,
        notes: orderNotes.trim() || null,
      }
      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create order'); setSubmitting(false); return }

      // Deduct wallet balance for wallet payments (VIP/Prepaid usage)
      // 1. If activeWallet is set (VIP/Prepaid card applied), deduct the actual payment amount for that wallet
      if (activeWallet?.id) {
        // Find the payment entry that references this wallet to get the actual amount paid
        const activeWalletPayment = payments.find(p => p.walletId === activeWallet.id)
        const deductAmount = activeWalletPayment ? toNum(activeWalletPayment.amount) : netAmount
        if (deductAmount > 0) {
          try {
            await fetch(`/api/pos/wallets/${activeWallet.id}/deduct`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                amount: deductAmount,
                description: `Payment for order ${data.orderNumber} (${activeWallet.walletType || 'wallet'})`,
                orderId: data.id,
              }),
            })
          } catch (e) {
            console.error('Wallet deduction error:', e)
          }
        }
      }

      // 2. Explicit WALLET payment lines (walletId on the payment)
      // Exclude HMO and GL — those are accounts receivable, credited on the backend (not deducted)
      const RECEIVABLE_METHODS = ['HMO', 'GL']
      const walletPayments = payments.filter(p => p.walletId && toNum(p.amount) > 0 && p.walletId !== activeWallet?.id && !RECEIVABLE_METHODS.includes(p.method) && p.method !== 'PACKAGE')
      for (const wp of walletPayments) {
        try {
          await fetch(`/api/pos/wallets/${wp.walletId}/deduct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: toNum(wp.amount),
              description: `Payment for order ${data.orderNumber}`,
              orderId: data.id,
            }),
          })
        } catch (e) {
          console.error('Wallet deduction error:', e)
        }
      }
      // 2. If a VIP/Prepaid wallet was used (activeWallet set via scan/search),
      //    deduct the actual wallet payment amount (not netAmount) from that wallet
      const alreadyDeductedWalletIds = walletPayments.map(wp => wp.walletId)
      if (activeWallet && !alreadyDeductedWalletIds.includes(activeWallet.id)) {
        const walletPay = payments.find(p => p.walletId === activeWallet.id)
        const walletDeductAmt = walletPay ? toNum(walletPay.amount) : netAmount
        if (walletDeductAmt > 0) {
          try {
            await fetch(`/api/pos/wallets/${activeWallet.id}/deduct`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                amount: walletDeductAmt,
                description: `${WALLET_TYPE_LABELS[activeWallet.walletType] || 'Wallet'} used for order ${data.orderNumber}`,
                orderId: data.id,
              }),
            })
          } catch (e) {
            console.error('Active wallet deduction error:', e)
          }
        }
      }

      // 3. Package session deduction — deduct total item quantity as sessions
      const packagePayment = payments.find(p => p.method === 'PACKAGE' && p.walletId && p.reference?.startsWith('PKG:'))
      if (packagePayment) {
        const pkgId = packagePayment.reference?.replace('PKG:', '') || ''
        const totalSessions = items.reduce((s, it) => s + it.quantity, 0)
        if (pkgId && totalSessions > 0) {
          try {
            await fetch(`/api/pos/wallets/${packagePayment.walletId}/deduct`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                packageId: pkgId,
                sessions: totalSessions,
              }),
            })
          } catch (e) {
            console.error('Package session deduction error:', e)
          }
        }
      }

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

          {/* Service Selection — moved up per SCEI request */}
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
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between" style={{ color: 'var(--charcoal)' }}>
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{s.name}</span>
                      {s.department && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#f3e8ff', color: '#6b21a8' }}>
                          {s.department}
                        </span>
                      )}
                      {s.revenueType === 'UNEARNED' && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#fef3c7', color: '#92400e' }}>
                          {(s as Record<string, unknown>).walletType ? String((s as Record<string, unknown>).walletType).replace('_', ' ') : 'Unearned'}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold shrink-0" style={{ color: 'var(--teal)' }}>{formatCurrency(effectivePrice(s))}</span>
                  </button>
                ))}
              </div>
            )}
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

          {/* Clinician — disabled for unearned revenue services and advance payments */}
          {orderType === 'SERVICE' && (
            <div className="relative">
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                Clinician Name {(isAdvancePayment || hasUnearnedItems) && <span className="text-xs font-normal">(disabled — unearned revenue)</span>}
              </label>
              <input
                value={(isAdvancePayment || hasUnearnedItems) ? '' : clinicianName}
                onChange={e => { setClinicianName(e.target.value); setClinicianSearch(e.target.value) }}
                onFocus={() => clinicianSearch.length >= 2 && setShowClinicianDrop(true)}
                onBlur={() => setTimeout(() => setShowClinicianDrop(false), 200)}
                placeholder={(isAdvancePayment || hasUnearnedItems) ? 'N/A — Unearned Revenue' : 'Search clinician...'}
                disabled={isAdvancePayment || hasUnearnedItems}
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
                      <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>
                        {it.name}
                        {it.department && <span className="ml-1 text-xs font-medium" style={{ color: 'var(--mid-gray)' }}>({it.department})</span>}
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={1} value={it.quantity} onChange={e => updateItemQty(idx, parseInt(e.target.value) || 1)}
                          className="w-16 px-2 py-1 rounded-lg border text-sm text-center outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </td>
                      <td className="px-3 py-2">
                        {it.priceType === 'ADJUSTABLE' ? (
                          <input type="number" min={0} step="0.01" value={it.unitPrice}
                            onChange={e => {
                              const p = parseFloat(e.target.value) || 0
                              setItems(prev => prev.map((x, i) => i === idx ? { ...x, unitPrice: p, lineTotal: p * x.quantity } : x))
                            }}
                            className="w-28 px-2 py-1 rounded-lg border text-sm text-right outline-none"
                            style={{ borderColor: 'var(--teal)', background: '#f0fdfa' }}
                            placeholder="Enter price" />
                        ) : (
                          <span style={{ color: 'var(--mid-gray)' }}>{formatCurrency(it.unitPrice)}</span>
                        )}
                      </td>
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
              <label className={`flex items-center gap-2 text-sm ${pwdBlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`} style={{ color: 'var(--charcoal)' }}>
                <input type="checkbox" checked={pwdDiscount && !pwdBlocked}
                  onChange={e => { if (!pwdBlocked) { setPwdDiscount(e.target.checked); if (e.target.checked) setCustomDiscountId('') } }}
                  disabled={pwdBlocked}
                  className="rounded" />
                PWD / Senior Citizen (20%)
              </label>
            </div>
            {pwdBlocked && (
              <p className="text-xs px-2 py-1 rounded-lg" style={{ background: '#fef2f2', color: '#991b1b' }}>
                PWD/SC discount is not available — all items do not accept PWD discount
              </p>
            )}
            {hasMixedPwdItems && !pwdDiscount && (
              <p className="text-xs px-2 py-1 rounded-lg" style={{ background: '#eff6ff', color: '#1e40af' }}>
                Note: {pwdBlockedItems.join(', ')} {pwdBlockedItems.length === 1 ? 'does' : 'do'} not accept PWD discount — discount will apply to eligible items only
              </p>
            )}
            {pwdNote && (
              <p className="text-xs px-2 py-1 rounded-lg" style={{ background: '#fef3c7', color: '#92400e' }}>{pwdNote}</p>
            )}
            {!pwdDiscount && (
              <div className="space-y-2">
                <select value={customDiscountId} onChange={e => {
                  const newId = e.target.value
                  setCustomDiscountId(newId)
                  if (newId !== '__FREEFORM__') { setFreeformDiscountAmt(0); setFreeformDiscountRemarks('') }
                  // When switching discount, check if new selection has wallet rules
                  const ds = discountSettings.find(d => d.id === newId) as DiscountSettingFull | undefined
                  if (ds?.rules && ds.rules.length > 0) {
                    setWalletDiscountRules(ds.rules)
                    setWalletDiscountApplied(true)
                  } else {
                    setWalletDiscountApplied(false)
                    setWalletDiscountRules([])
                  }
                }}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">No custom discount</option>
                  {discountSettings.map(ds => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name}{toNum(ds.value) > 0 ? ` (${ds.type === 'PERCENTAGE' ? `${toNum(ds.value)}%` : formatCurrency(toNum(ds.value))})` : ''}
                    </option>
                  ))}
                  <option value="__FREEFORM__">Custom (manual entry)</option>
                </select>
                {customDiscountId === '__FREEFORM__' && (
                  <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: '#93c5fd', background: '#eff6ff' }}>
                    <div className="flex gap-2">
                      <select value={freeformDiscountType} onChange={e => setFreeformDiscountType(e.target.value as 'PERCENTAGE' | 'FIXED')}
                        className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="FIXED">Fixed (₱)</option>
                        <option value="PERCENTAGE">Percentage (%)</option>
                      </select>
                      <input type="number" min={0} step="0.01" value={freeformDiscountAmt || ''}
                        onChange={e => setFreeformDiscountAmt(parseFloat(e.target.value) || 0)}
                        placeholder={freeformDiscountType === 'PERCENTAGE' ? 'e.g. 10' : 'e.g. 500'}
                        className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                    <input value={freeformDiscountRemarks} onChange={e => setFreeformDiscountRemarks(e.target.value)}
                      placeholder="Remarks / reason for discount *"
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                )}
              </div>
            )}
            {discountAmount > 0 && (
              <p className="text-sm font-medium" style={{ color: 'var(--deep-teal)' }}>
                Discount: -{formatCurrency(discountAmount)}
                {freeformDiscountRemarks && <span className="text-xs font-normal ml-1" style={{ color: 'var(--mid-gray)' }}>({freeformDiscountRemarks})</span>}
                &nbsp;&middot; Net: {formatCurrency(netAmount)}
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
              <div key={idx} className="space-y-1">
                <div className="flex items-center gap-2">
                  <select
                    value={p.paymentModeId || p.method}
                    onChange={e => {
                      const val = e.target.value
                      // Check if user picked a configured payment mode (cuid starts with 'c' and is long)
                      const cm = configuredModes.find(m => m.id === val)
                      if (cm) {
                        setPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, method: cm.paymentMethod || 'CASH', paymentModeId: cm.id } : pp))
                      } else {
                        setPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, method: val, paymentModeId: undefined } : pp))
                      }
                    }}
                    className="px-3 py-2.5 rounded-xl border text-sm outline-none flex-1" style={{ borderColor: 'var(--light-gray)' }}>
                    {configuredModes.length > 0 ? (
                      <>
                        {configuredModes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </>
                    ) : (
                      <>
                        {paymentMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </>
                    )}
                    {/* Digital wallet payment type options */}
                    {p.walletId && (
                      <>
                        <option value="VIP_CARD">VIP Card</option>
                        <option value="PREPAID_CARD">Prepaid Card</option>
                        <option value="PACKAGE">Package</option>
                        <option value="DOWNPAYMENT">Downpayment</option>
                        <option value="ADVANCE">Advance</option>
                        <option value="HMO">HMO</option>
                        <option value="GL">Guarantee Letter</option>
                      </>
                    )}
                    {p.method === 'WALLET' && <option value="WALLET">VIP/Prepaid Card</option>}
                  </select>
                  {p.method === 'PACKAGE' ? (
                    <span className="w-32 px-3 py-2.5 rounded-xl border text-sm text-right font-semibold" style={{ borderColor: '#93c5fd', background: '#eff6ff', color: '#1e40af' }}>
                      {p.walletId ? formatCurrency(netAmount) : '—'}
                    </span>
                  ) : (
                    <input type="number" min={0} step="0.01" value={p.amount || ''} placeholder="Amount"
                      onChange={e => setPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, amount: parseFloat(e.target.value) || 0 } : pp))}
                      className="w-32 px-3 py-2.5 rounded-xl border text-sm outline-none text-right" style={{ borderColor: 'var(--light-gray)' }} />
                  )}
                  {p.reference && !['HMO', 'GL'].includes(p.method) && (
                    <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{p.reference}</span>
                  )}
                  {payments.length > 1 && (
                    <button onClick={() => setPayments(prev => prev.filter((_, i) => i !== idx))} className="p-1 rounded hover:bg-red-50">
                      <X size={14} className="text-red-500" />
                    </button>
                  )}
                </div>
              {/* Deduction preview for configured payment modes */}
              {(() => {
                const cm = configuredModes.find(m => m.id === p.paymentModeId)
                if (!cm || cm.deductions.length === 0) return null
                const base = toNum(p.amount)
                return (
                  <div className="ml-1 pl-3 border-l-2 space-y-0.5" style={{ borderColor: 'var(--light-gray)' }}>
                    {cm.deductions.map(d => {
                      const amt = base * (Number(d.rate) / 100)
                      return (
                        <div key={d.id} className="flex justify-between text-xs" style={{ color: 'var(--mid-gray)' }}>
                          <span>{d.name} ({Number(d.rate)}%){d.account ? ` → ${d.account.accountNumber}` : ''}</span>
                          <span className="font-medium text-red-500">-{formatCurrency(amt)}</span>
                        </div>
                      )
                    })}
                    <div className="flex justify-between text-xs font-semibold pt-0.5" style={{ color: 'var(--teal)' }}>
                      <span>Net to {cm.account ? cm.account.accountNumber : 'account'}</span>
                      <span>{formatCurrency(base - cm.deductions.reduce((s, d) => s + base * (Number(d.rate) / 100), 0))}</span>
                    </div>
                  </div>
                )
              })()}
                {(p.method === 'HMO' || p.method === 'GL') && (
                  <input value={p.reference || ''} placeholder={p.method === 'HMO' ? 'HMO Provider (e.g. Intellicare, Avega)' : 'GL Provider / Reference'}
                    onChange={e => setPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, reference: e.target.value } : pp))}
                    className="w-full px-3 py-2 rounded-xl border text-xs outline-none" style={{ borderColor: p.method === 'HMO' ? '#fed7aa' : '#bbf7d0', background: p.method === 'HMO' ? '#fff7ed' : '#f0fdf4' }} />
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
              <button onClick={() => { const next = !showDownpayment; setShowDownpayment(next); if (next) searchDpWallets('') }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1"
                style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                <CreditCard size={12} /> Has Downpayment
              </button>
              <button onClick={() => setShowPackagePay(!showPackagePay)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ color: '#1e40af' }}>
                Package
              </button>
              <button onClick={() => { const next = !showHmoPay; setShowHmoPay(next); setShowGlPay(false); setShowAdvancePay(false); if (next) searchHmoWallets('') }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ color: '#c2410c' }}>
                HMO
              </button>
              <button onClick={() => { const next = !showGlPay; setShowGlPay(next); setShowHmoPay(false); setShowAdvancePay(false); if (next) searchGlWallets('') }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ color: '#15803d' }}>
                GL
              </button>
              <button onClick={() => { const next = !showAdvancePay; setShowAdvancePay(next); setShowHmoPay(false); setShowGlPay(false); if (next) searchAdvanceWallets('') }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ color: '#7c3aed' }}>
                Advance
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
                    {walletResults.map(w => {
                      const wMethodMap: Record<string, string> = { VIP: 'VIP_CARD', PREPAID_CARD: 'PREPAID_CARD', PACKAGE: 'PACKAGE', DOWNPAYMENT: 'DOWNPAYMENT', ADVANCE: 'ADVANCE', HMO: 'HMO', GL: 'GL' }
                      const wPayMethod = wMethodMap[w.walletType] || 'PREPAID_CARD'
                      return (
                      <button key={w.id} onClick={() => {
                        setPayments([{ method: wPayMethod, amount: 0, walletId: w.id, reference: w.barcode }])
                        setShowWalletPay(false)
                        applyWalletDiscount(w)
                      }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between">
                        <span>{w.patientName}</span>
                        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                          {WALLET_TYPE_LABELS[w.walletType] || ''} · {w.barcode} · Bal: {formatCurrency(toNum(w.balance))}
                        </span>
                      </button>
                    )})}
                  </div>
                )}
              </div>
            )}

            {/* Downpayment search */}
            {showDownpayment && (
              <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: '#f9a8d4', background: '#fdf2f8' }}>
                <p className="text-xs font-semibold" style={{ color: '#9d174d' }}>Search Downpayment wallets</p>
                <input value={dpSearch} onChange={e => searchDpWallets(e.target.value)} placeholder="Search by patient name..."
                  onFocus={() => { if (!dpSearch) searchDpWallets('') }}
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#f9a8d4' }} />
                {dpWallets.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {dpWallets.map(w => (
                      <button key={w.id} onClick={() => {
                        setPayments([{ method: 'DOWNPAYMENT', amount: 0, walletId: w.id, reference: w.patientName }])
                        setShowDownpayment(false)
                        setDpSearch('')
                        setDpWallets([])
                      }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-pink-50 rounded-lg flex justify-between">
                        <span className="font-medium">{w.patientName}</span>
                        <span className="text-xs" style={{ color: '#9d174d' }}>
                          Balance: {formatCurrency(toNum(w.balance))}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {dpWallets.length === 0 && dpSearch.length > 0 && (
                  <p className="text-xs" style={{ color: '#9d174d' }}>No downpayment wallets found.</p>
                )}
              </div>
            )}

            {/* Package wallet search */}
            {showPackagePay && (
              <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: '#93c5fd', background: '#eff6ff' }}>
                <p className="text-xs font-semibold" style={{ color: '#1e40af' }}>Search patient&apos;s package wallet</p>
                <input value={packageSearch} onChange={e => searchPackageWallets(e.target.value)} placeholder="Search by patient name..."
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#93c5fd' }} />
                {packageWallets.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {packageWallets.map(w => {
                      const pkgDept = w.packages?.find(p => p.isActive)?.department || w.packages?.[0]?.department
                      return (
                      <button key={w.id} onClick={() => selectPackageWallet(w)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded-lg flex justify-between">
                        <span className="font-medium">{w.patientName}{pkgDept ? ` (${pkgDept})` : ''}</span>
                        <span className="text-xs" style={{ color: '#1e40af' }}>
                          Balance: {formatCurrency(toNum(w.balance))} · {w._count?.packages || 0} pkg(s)
                        </span>
                      </button>
                      )
                    })}
                  </div>
                )}
                {selectedPackageWallet && (
                  <div className="rounded-lg p-2 text-xs" style={{ background: '#dbeafe', color: '#1e40af' }}>
                    Using: <strong>{selectedPackageWallet.patientName}{(() => { const d = selectedPackageWallet.packages?.find(p => p.isActive)?.department || selectedPackageWallet.packages?.[0]?.department; return d ? ` (${d})` : '' })()}</strong>&apos;s package
                  </div>
                )}
              </div>
            )}

            {/* HMO search */}
            {showHmoPay && (
              <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: '#fdba74', background: '#fff7ed' }}>
                <p className="text-xs font-semibold" style={{ color: '#c2410c' }}>Select HMO Provider</p>
                <input value={hmoSearch} onChange={e => searchHmoWallets(e.target.value)} placeholder="Search HMO (e.g. Intellicare, Avega)..."
                  onFocus={() => { if (!hmoSearch) searchHmoWallets('') }}
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#fdba74' }} />
                {hmoWallets.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {hmoWallets.map(w => (
                      <button key={w.id} onClick={() => {
                        setPayments([{ method: 'HMO', amount: 0, walletId: w.id, reference: w.patientName }])
                        setShowHmoPay(false)
                        setHmoSearch('')
                        setHmoWallets([])
                      }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 rounded-lg flex justify-between">
                        <span className="font-medium">{w.patientName}</span>
                        <span className="text-xs" style={{ color: '#c2410c' }}>
                          Receivable: {formatCurrency(toNum(w.balance))}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {hmoWallets.length === 0 && hmoSearch.length > 0 && (
                  <p className="text-xs" style={{ color: '#c2410c' }}>No HMO providers found. Add one in Digital Wallet &gt; HMO tab first.</p>
                )}
              </div>
            )}

            {/* GL search */}
            {showGlPay && (
              <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: '#86efac', background: '#f0fdf4' }}>
                <p className="text-xs font-semibold" style={{ color: '#15803d' }}>Select Agency (GL)</p>
                <input value={glSearch} onChange={e => searchGlWallets(e.target.value)} placeholder="Search agency (e.g. DSWD, PhilHealth)..."
                  onFocus={() => { if (!glSearch) searchGlWallets('') }}
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#86efac' }} />
                {glWallets.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {glWallets.map(w => {
                      const agency = (w as unknown as { agency?: string }).agency || ''
                      const displayName = agency ? `${w.patientName} (${agency})` : w.patientName
                      return (
                        <button key={w.id} onClick={() => {
                          setPayments([{ method: 'GL', amount: 0, walletId: w.id, reference: displayName }])
                          setShowGlPay(false)
                          setGlSearch('')
                          setGlWallets([])
                        }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 rounded-lg flex justify-between">
                          <span className="font-medium">{displayName}</span>
                          <span className="text-xs" style={{ color: '#15803d' }}>
                            Remaining: {formatCurrency(toNum(w.balance))}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {glWallets.length === 0 && glSearch.length > 0 && (
                  <p className="text-xs" style={{ color: '#15803d' }}>No agencies found. Add one in Digital Wallet &gt; GL tab first.</p>
                )}
              </div>
            )}

            {/* Advance wallet search */}
            {showAdvancePay && (
              <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: '#c4b5fd', background: '#f5f3ff' }}>
                <p className="text-xs font-semibold" style={{ color: '#7c3aed' }}>Search Advance wallets</p>
                <input value={advanceSearch} onChange={e => searchAdvanceWallets(e.target.value)} placeholder="Search by patient name..."
                  onFocus={() => { if (!advanceSearch) searchAdvanceWallets('') }}
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#c4b5fd' }} />
                {advanceWallets.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {advanceWallets.map(w => (
                      <button key={w.id} onClick={() => {
                        setPayments([{ method: 'ADVANCE', amount: 0, walletId: w.id, reference: w.patientName }])
                        setShowAdvancePay(false)
                        setAdvanceSearch('')
                        setAdvanceWallets([])
                      }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 rounded-lg flex justify-between">
                        <span className="font-medium">{w.patientName}</span>
                        <span className="text-xs" style={{ color: '#7c3aed' }}>
                          Balance: {formatCurrency(toNum(w.balance))}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {advanceWallets.length === 0 && advanceSearch.length > 0 && (
                  <p className="text-xs" style={{ color: '#7c3aed' }}>No advance wallets found.</p>
                )}
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
            <div className="rounded-xl border p-3" style={{ borderColor: '#FFBA6B', background: '#FFF8F0' }}>
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#ED6823' }}>
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

          {/* Official Sales Invoice */}
          <div className="rounded-xl p-3 border" style={{ borderColor: 'var(--light-gray)' }}>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={issuedOfficialInvoice}
                onChange={e => { setIssuedOfficialInvoice(e.target.checked); if (!e.target.checked) setSalesInvoiceNumber('') }}
                className="w-4 h-4 rounded accent-teal-600"
              />
              <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Issued Official Sales Invoice</span>
            </label>
            {issuedOfficialInvoice && (
              <div className="mt-2">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Sales Invoice Number</label>
                <input
                  type="text"
                  value={salesInvoiceNumber}
                  onChange={e => setSalesInvoiceNumber(e.target.value)}
                  placeholder="e.g. SI-2026-001234"
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                />
              </div>
            )}
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Reference Number (optional)</label>
            <input type="text" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)}
              placeholder="e.g. OR-2026-001234"
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--light-gray)' }} />
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Remarks (optional)</label>
            <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
              placeholder="Any notes or remarks for this order..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none"
              style={{ borderColor: 'var(--light-gray)' }} />
          </div>

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
                <span className="font-medium" style={{ color: '#ED6823' }}>Revenue Type</span>
                <span className="font-medium" style={{ color: '#ED6823' }}>Unearned Revenue</span>
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
  const [showVoided, setShowVoided] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [ordPage, setOrdPage] = useState(1)
  const [ordPageSize, setOrdPageSize] = useState(25)
  const [orderSearch, setOrderSearch] = useState('')
  const [ordSortField, setOrdSortField] = useState('orderNumber')
  const [ordSortDir, setOrdSortDir] = useState<'asc' | 'desc'>('desc')
  const [viewOrder, setViewOrder] = useState<Order | null>(null)
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [editItems, setEditItems] = useState<{ name: string; quantity: number; unitPrice: number; lineTotal: number; serviceId?: string }[]>([])
  const [editPayments, setEditPayments] = useState<{ method: string; amount: number; paymentModeId?: string; walletId?: string }[]>([])
  const [editPatient, setEditPatient] = useState('')
  const [editClinician, setEditClinician] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editDateReason, setEditDateReason] = useState('')
  const [editDiscountAmt, setEditDiscountAmt] = useState(0)
  const [editDiscountLabel, setEditDiscountLabel] = useState('')
  const [editDiscountType, setEditDiscountType] = useState('NONE')
  const [editPwdDiscount, setEditPwdDiscount] = useState(false)
  const [editCustomDiscountId, setEditCustomDiscountId] = useState('')
  const [editFreeformAmt, setEditFreeformAmt] = useState(0)
  const [editFreeformType, setEditFreeformType] = useState<'FIXED' | 'PERCENTAGE'>('FIXED')
  const [editFreeformRemarks, setEditFreeformRemarks] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [editPatientResults, setEditPatientResults] = useState<{ id: string; name: string; email?: string }[]>([])
  const [editShowPatientDrop, setEditShowPatientDrop] = useState(false)
  const [editClinicianResults, setEditClinicianResults] = useState<{ id: string; name: string; department?: string }[]>([])
  const [editShowClinicianDrop, setEditShowClinicianDrop] = useState(false)
  const [editClinicianSearch, setEditClinicianSearch] = useState('')
  const [editPatientSearch, setEditPatientSearch] = useState('')
  const editPatientTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editClinicianTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [editConfiguredModes, setEditConfiguredModes] = useState<PaymentModeType[]>([])
  const [editIssuedOfficialInvoice, setEditIssuedOfficialInvoice] = useState(false)
  const [editSalesInvoiceNumber, setEditSalesInvoiceNumber] = useState('')
  const [editReferenceNumber, setEditReferenceNumber] = useState('')
  const [editNotes, setEditNotes] = useState('')
  // Wallet search state for edit modal
  const [editShowWalletPay, setEditShowWalletPay] = useState(false)
  const [editWalletBarcode, setEditWalletBarcode] = useState('')
  const [editWalletSearch, setEditWalletSearch] = useState('')
  const [editWalletResults, setEditWalletResults] = useState<DigitalWallet[]>([])
  const [editShowDownpayment, setEditShowDownpayment] = useState(false)
  const [editDpSearch, setEditDpSearch] = useState('')
  const [editDpWallets, setEditDpWallets] = useState<DigitalWallet[]>([])
  const [editShowPackagePay, setEditShowPackagePay] = useState(false)
  const [editPackageSearch, setEditPackageSearch] = useState('')
  const [editPackageWallets, setEditPackageWallets] = useState<DigitalWallet[]>([])
  const [editShowHmoPay, setEditShowHmoPay] = useState(false)
  const [editHmoSearch, setEditHmoSearch] = useState('')
  const [editHmoWallets, setEditHmoWallets] = useState<DigitalWallet[]>([])
  const [editShowGlPay, setEditShowGlPay] = useState(false)
  const [editGlSearch, setEditGlSearch] = useState('')
  const [editGlWallets, setEditGlWallets] = useState<DigitalWallet[]>([])
  const [editShowAdvancePay, setEditShowAdvancePay] = useState(false)
  const [editAdvanceSearch, setEditAdvanceSearch] = useState('')
  const [editAdvanceWallets, setEditAdvanceWallets] = useState<DigitalWallet[]>([])

  // Fetch configured payment modes for edit order
  useEffect(() => {
    const b = canSelectBranch ? '' : branch
    fetch(`/api/pos/payment-modes${b ? `?branch=${encodeURIComponent(b)}` : ''}`)
      .then(r => r.json())
      .then(d => setEditConfiguredModes(Array.isArray(d) ? d.filter((m: PaymentModeType) => m.isActive) : []))
      .catch(() => {})
  }, [branch, canSelectBranch])

  // useEffect-based search for edit patient (same pattern as new order)
  useEffect(() => {
    if (editPatientSearch.length < 2) { setEditPatientResults([]); setEditShowPatientDrop(false); return }
    if (editPatientTimer.current) clearTimeout(editPatientTimer.current)
    editPatientTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pos/patients?search=${encodeURIComponent(editPatientSearch)}`)
        const d = await r.json()
        const results = Array.isArray(d) ? d : d.data || []
        setEditPatientResults(results)
        setEditShowPatientDrop(results.length > 0)
      } catch { setEditPatientResults([]) }
    }, 300)
  }, [editPatientSearch])

  // Edit clinician search — mirrors working new-order pattern exactly
  useEffect(() => {
    if (editClinicianSearch.length < 2) { setEditClinicianResults([]); setEditShowClinicianDrop(false); return }
    clearTimeout(editClinicianTimer.current!)
    editClinicianTimer.current = setTimeout(async () => {
      try {
        const qb = branch === 'SANDBOX_EAST' ? 'SBEA' : branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : ''
        const url = `/api/pos/staff?search=${encodeURIComponent(editClinicianSearch)}&branch=${qb}`
        const r = await fetch(url)
        const d = await r.json()
        const results = Array.isArray(d) ? d : []
        setEditClinicianResults(results)
        setEditShowClinicianDrop(true)
      } catch (err) {
        console.error('[edit-clinician-search]', err)
        setEditClinicianResults([])
      }
    }, 300)
    return () => { clearTimeout(editClinicianTimer.current!) }
  }, [editClinicianSearch, branch])

  // Wallet search helpers for edit modal
  const editSearchWallets = async (q: string) => {
    setEditWalletSearch(q)
    if (q.length < 2) { setEditWalletResults([]); return }
    try {
      const r = await fetch(`/api/pos/wallets?search=${encodeURIComponent(q)}`)
      const d = await r.json()
      setEditWalletResults((Array.isArray(d) ? d : d.data || []) as DigitalWallet[])
    } catch { setEditWalletResults([]) }
  }
  const editScanBarcode = async () => {
    if (!editWalletBarcode.trim()) return
    try {
      const r = await fetch(`/api/pos/wallets/scan/${encodeURIComponent(editWalletBarcode.trim())}`)
      const d = await r.json()
      if (d.error) { setEditError(d.error); return }
      const wMap: Record<string, string> = { VIP: 'VIP_CARD', PREPAID_CARD: 'PREPAID_CARD', PACKAGE: 'PACKAGE', DOWNPAYMENT: 'DOWNPAYMENT', ADVANCE: 'ADVANCE', HMO: 'HMO', GL: 'GL' }
      setEditPayments([{ method: wMap[d.walletType] || 'PREPAID_CARD', amount: 0, walletId: d.id }])
      setEditShowWalletPay(false)
      setEditWalletBarcode('')
    } catch { setEditError('Failed to scan barcode') }
  }
  const editSearchTypedWallets = async (type: string, q: string, setter: (w: DigitalWallet[]) => void) => {
    try {
      const params = new URLSearchParams({ walletType: type })
      if (q) params.set('search', q)
      if (branch) params.set('branch', branch)
      const r = await fetch(`/api/pos/wallets?${params}`)
      const d = await r.json()
      setter((Array.isArray(d) ? d : d.data || []) as DigitalWallet[])
    } catch { setter([]) }
  }

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedBranch) params.set('branch', selectedBranch)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (statusFilter) params.set('status', statusFilter)
      params.set('pageSize', '200')
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

  const openEditOrder = (o: Order) => {
    setEditOrder(o)
    setEditPatient(o.patientName || '')
    setEditClinician(formatClinicianName(o.clinicianName) === '—' ? '' : formatClinicianName(o.clinicianName))
    setEditClinicianSearch('')
    setEditClinicianResults([])
    setEditShowClinicianDrop(false)
    setEditPatientSearch('')
    setEditPatientResults([])
    setEditShowPatientDrop(false)
    setEditItems(o.items.map(it => ({
      name: it.name,
      quantity: it.quantity,
      unitPrice: toNum(it.unitPrice),
      lineTotal: toNum(it.lineTotal),
      serviceId: it.serviceId,
    })))
    setEditPayments(o.payments.map(p => ({ method: p.method, amount: toNum(p.amount), walletId: p.walletId })))
    setEditDate(o.transactionDate ? o.transactionDate.split('T')[0] : today())
    setEditDateReason('')
    const dAmt = toNum(o.discountAmount)
    const dType = o.discountType || 'NONE'
    const dLabel = o.discountLabel || ''
    setEditDiscountAmt(dAmt)
    setEditDiscountLabel(dLabel)
    setEditDiscountType(dType)
    setEditPwdDiscount(dType === 'PWD_SC')
    setEditCustomDiscountId(dType === 'CUSTOM' && dAmt > 0 ? '__FREEFORM__' : '')
    setEditFreeformAmt(dType === 'CUSTOM' ? dAmt : 0)
    setEditFreeformType('FIXED')
    setEditFreeformRemarks(dType === 'CUSTOM' ? dLabel : '')
    setEditIssuedOfficialInvoice(!!o.issuedOfficialInvoice)
    setEditSalesInvoiceNumber(o.salesInvoiceNumber || '')
    setEditReferenceNumber(o.referenceNumber || '')
    setEditNotes((o.notes as string) || '')
    // Reset wallet search states
    setEditShowWalletPay(false); setEditWalletBarcode(''); setEditWalletSearch(''); setEditWalletResults([])
    setEditShowDownpayment(false); setEditDpSearch(''); setEditDpWallets([])
    setEditShowPackagePay(false); setEditPackageSearch(''); setEditPackageWallets([])
    setEditShowHmoPay(false); setEditHmoSearch(''); setEditHmoWallets([])
    setEditShowGlPay(false); setEditGlSearch(''); setEditGlWallets([])
    setEditShowAdvancePay(false); setEditAdvanceSearch(''); setEditAdvanceWallets([])
    setEditError('')
  }

  const editSubtotal = editItems.reduce((s, it) => s + it.lineTotal, 0)
  // Recalculate edit discount based on selected method
  const computedEditDiscount = (() => {
    if (editPwdDiscount) return { amount: editSubtotal * 0.2, label: 'PWD/Senior Citizen (20%)', type: 'PWD_SC' }
    if (editCustomDiscountId === '__FREEFORM__' && editFreeformAmt > 0) {
      const amt = editFreeformType === 'PERCENTAGE' ? editSubtotal * (editFreeformAmt / 100) : editFreeformAmt
      return { amount: amt, label: editFreeformRemarks || 'Custom Discount', type: 'CUSTOM' }
    }
    return { amount: 0, label: '', type: 'NONE' }
  })()
  const editNetAmount = Math.max(0, editSubtotal - computedEditDiscount.amount)
  const editTotalPayments = editPayments.reduce((s, p) => s + p.amount, 0)

  const saveEditOrder = async () => {
    if (!editOrder) return
    // Require reason if date was changed
    const originalDate = editOrder.transactionDate ? editOrder.transactionDate.split('T')[0] : ''
    if (editDate !== originalDate && !editDateReason.trim()) {
      setEditError('Please provide a reason for changing the transaction date')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      const body = {
        action: 'edit',
        patientName: editPatient || null,
        clinicianName: editClinician || null,
        transactionDate: editDate || null,
        dateChangeReason: editDate !== originalDate ? editDateReason.trim() : null,
        discountAmount: computedEditDiscount.amount,
        discountLabel: computedEditDiscount.label || null,
        discountType: computedEditDiscount.type,
        items: editItems.map(it => ({
          serviceId: it.serviceId || null,
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
        })),
        payments: editPayments.filter(p => p.amount > 0).map(p => ({
          method: p.method,
          amount: p.amount,
          walletId: p.walletId || null,
        })),
        issuedOfficialInvoice: editIssuedOfficialInvoice,
        salesInvoiceNumber: editIssuedOfficialInvoice ? editSalesInvoiceNumber.trim() : null,
        referenceNumber: editReferenceNumber.trim() || null,
        notes: editNotes.trim() || null,
      }
      const res = await fetch(`/api/pos/orders/${editOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error || 'Failed to save'); setEditSaving(false); return }
      setEditOrder(null)
      fetchOrders()
    } catch {
      setEditError('Failed to save changes')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
        <input
          value={orderSearch}
          onChange={e => { setOrderSearch(e.target.value); setOrdPage(1) }}
          placeholder="Search by order #, patient, clinician, or item..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ borderColor: 'var(--light-gray)' }}
        />
      </div>

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
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">All Status</option>
          <option value="COMPLETED">Completed</option>
          <option value="REOPENED">Reopened</option>
          <option value="VOIDED">Voided</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--mid-gray)' }}>
          <input type="checkbox" checked={showVoided} onChange={e => setShowVoided(e.target.checked)} />
          Show voided
        </label>
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl border bg-white overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} />
          </div>
        ) : (() => {
          const q = orderSearch.trim().toLowerCase()
          const displayOrders = (showVoided || statusFilter === 'VOIDED' ? orders : orders.filter(o => o.status !== 'VOIDED'))
            .filter(o => !q || String(o.orderNumber).includes(q) || (o.patientName || '').toLowerCase().includes(q) || (o.clinicianName || '').toLowerCase().includes(q) || (o.referenceNumber || '').toLowerCase().includes(q) || o.items.some(it => it.name.toLowerCase().includes(q)))
          return displayOrders.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>No orders found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--light-gray)' }}>
                {[
                  { label: 'Order #', field: 'orderNumber' },
                  { label: 'Date', field: 'transactionDate' },
                  { label: 'Branch', field: 'branch' },
                  { label: 'Type', field: 'orderType' },
                  { label: 'Patient', field: 'patientName' },
                  { label: 'Item(s)', field: '' },
                  { label: 'Clinician', field: 'clinicianName' },
                  { label: 'Ref #', field: 'referenceNumber' },
                  { label: 'Net Amount', field: 'netAmount' },
                  { label: 'Payment', field: '' },
                  { label: 'Status', field: 'status' },
                  { label: 'Actions', field: '' },
                ].map(h => (
                  <th key={h.label} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${h.field ? 'cursor-pointer select-none hover:bg-gray-50' : ''}`}
                    style={{ color: ordSortField === h.field ? 'var(--teal)' : 'var(--mid-gray)' }}
                    onClick={() => { if (!h.field) return; if (ordSortField === h.field) { setOrdSortDir(d => d === 'asc' ? 'desc' : 'asc') } else { setOrdSortField(h.field); setOrdSortDir('asc') } }}>
                    <span className="flex items-center gap-1">
                      {h.label}
                      {h.field && ordSortField === h.field && <span className="text-[10px]">{ordSortDir === 'asc' ? '▲' : '▼'}</span>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...displayOrders].sort((a, b) => {
                const f = ordSortField as keyof Order
                let av = a[f], bv = b[f]
                if (f === 'netAmount') { av = toNum(av as string | number); bv = toNum(bv as string | number) }
                if (f === 'orderNumber') { av = Number(av) || 0; bv = Number(bv) || 0 }
                const an = typeof av === 'number' ? av : String(av || '').toLowerCase()
                const bn = typeof bv === 'number' ? bv : String(bv || '').toLowerCase()
                if (an < bn) return ordSortDir === 'asc' ? -1 : 1
                if (an > bn) return ordSortDir === 'asc' ? 1 : -1
                return 0
              }).slice((ordPage - 1) * ordPageSize, ordPage * ordPageSize).map(o => {
                const badge = ORDER_STATUS_BADGE[o.status] || ORDER_STATUS_BADGE.COMPLETED
                return (
                  <tr key={o.id} className="border-b hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--light-gray)' }} onClick={() => setViewOrder(o)}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{o.orderNumber}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{formatDate(o.transactionDate)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {o.branch === 'SANDBOX_EAST' ? 'SBEA' : o.branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : o.branch === 'VERDANA_STORE' ? 'Verdana' : o.branch}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-1.5 py-0.5 rounded" style={o.orderType === 'SERVICE' ? { background: '#dbeafe', color: '#1e40af' } : { background: '#fef3c7', color: '#92400e' }}>
                        {o.orderType === 'SERVICE' ? 'Service' : 'Product'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{o.patientName || '—'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {o.items.map(it => it.name).join(', ')}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{formatClinicianName(o.clinicianName)}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{o.referenceNumber || '—'}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(toNum(o.netAmount))}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {o.payments.map(p => p.method).join(', ')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background: badge.bg, color: badge.color }}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button onClick={() => setViewOrder(o)} className="p-1.5 rounded-lg hover:bg-gray-100" title="View Details">
                          <Eye size={13} style={{ color: 'var(--mid-gray)' }} />
                        </button>
                        {(o.status === 'COMPLETED' || o.status === 'REOPENED') && (
                          <button onClick={() => printThermalReceipt(o)} className="p-1.5 rounded-lg hover:bg-gray-100" title="Print Receipt">
                            <Printer size={13} style={{ color: 'var(--teal)' }} />
                          </button>
                        )}
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
                          <>
                            <button onClick={() => openEditOrder(o)} className="p-1.5 rounded-lg hover:bg-blue-50" title="Edit">
                              <FileText size={13} className="text-blue-600" />
                            </button>
                            <button onClick={() => handleAction(o.id, 'void')} className="p-1.5 rounded-lg hover:bg-red-50" title="Void">
                              <Ban size={13} className="text-red-500" />
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
        )
          })()}
        {orders.length > 0 && (
          <Pagination totalItems={(showVoided || statusFilter === 'VOIDED' ? orders : orders.filter(o => o.status !== 'VOIDED')).length} page={ordPage} pageSize={ordPageSize}
            onPageChange={setOrdPage} onPageSizeChange={setOrdPageSize} />
        )}
      </div>

      {/* View Order Detail Modal */}
      {viewOrder && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto" onClick={() => setViewOrder(null)}>
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-lg mb-8 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewOrder(null)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--charcoal)' }}>Order #{viewOrder.orderNumber}</h3>

            <div className="space-y-3 text-sm">
              {/* Status */}
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{
                  background: (ORDER_STATUS_BADGE[viewOrder.status] || ORDER_STATUS_BADGE.COMPLETED).bg,
                  color: (ORDER_STATUS_BADGE[viewOrder.status] || ORDER_STATUS_BADGE.COMPLETED).color,
                }}>{viewOrder.status}</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={viewOrder.orderType === 'SERVICE' ? { background: '#dbeafe', color: '#1e40af' } : { background: '#fef3c7', color: '#92400e' }}>
                  {viewOrder.orderType === 'SERVICE' ? 'Service' : 'Product'}
                </span>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><span style={{ color: 'var(--mid-gray)' }}>Date:</span> <span style={{ color: 'var(--charcoal)' }}>{formatDate(viewOrder.transactionDate)}</span></div>
                <div><span style={{ color: 'var(--mid-gray)' }}>Branch:</span> <span style={{ color: 'var(--charcoal)' }}>{viewOrder.branch === 'SANDBOX_EAST' ? 'SBEA' : viewOrder.branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : viewOrder.branch === 'VERDANA_STORE' ? 'Verdana' : viewOrder.branch}</span></div>
                <div><span style={{ color: 'var(--mid-gray)' }}>Patient:</span> <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{viewOrder.patientName || '—'}</span></div>
                <div><span style={{ color: 'var(--mid-gray)' }}>Clinician:</span> <span style={{ color: 'var(--charcoal)' }}>{formatClinicianName(viewOrder.clinicianName)}</span></div>
                <div className="col-span-2"><span style={{ color: 'var(--mid-gray)' }}>Reference #:</span> <span className="font-mono" style={{ color: 'var(--charcoal)' }}>{viewOrder.referenceNumber || <span style={{ color: 'var(--mid-gray)' }}>—</span>}</span></div>
                {viewOrder.referrer && (
                  <div className="col-span-2"><span style={{ color: 'var(--mid-gray)' }}>Referrer:</span> <span style={{ color: 'var(--charcoal)' }}>{viewOrder.referrer.name}</span></div>
                )}
                {viewOrder.createdBy && (
                  <div className="col-span-2"><span style={{ color: 'var(--mid-gray)' }}>Created by:</span> <span style={{ color: 'var(--charcoal)' }}>{viewOrder.createdBy.name}</span></div>
                )}
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Items</p>
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--off-white)' }}>
                        <th className="text-left px-3 py-1.5 font-semibold" style={{ color: 'var(--mid-gray)' }}>Item</th>
                        <th className="text-center px-2 py-1.5 font-semibold" style={{ color: 'var(--mid-gray)' }}>Qty</th>
                        <th className="text-right px-3 py-1.5 font-semibold" style={{ color: 'var(--mid-gray)' }}>Unit Price</th>
                        <th className="text-right px-3 py-1.5 font-semibold" style={{ color: 'var(--mid-gray)' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewOrder.items.map((it, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                          <td className="px-3 py-1.5" style={{ color: 'var(--charcoal)' }}>{it.name}</td>
                          <td className="text-center px-2 py-1.5" style={{ color: 'var(--mid-gray)' }}>{it.quantity}</td>
                          <td className="text-right px-3 py-1.5" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(toNum(it.unitPrice))}</td>
                          <td className="text-right px-3 py-1.5 font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(toNum(it.lineTotal))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--off-white)' }}>
                <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Subtotal</span><span style={{ color: 'var(--charcoal)' }}>{formatCurrency(toNum(viewOrder.subtotal))}</span></div>
                {toNum(viewOrder.discountAmount) > 0 && (
                  <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Discount{viewOrder.discountLabel ? ` (${viewOrder.discountLabel})` : ''}</span><span className="text-red-600">-{formatCurrency(toNum(viewOrder.discountAmount))}</span></div>
                )}
                <div className="flex justify-between text-sm font-bold border-t pt-1" style={{ borderColor: 'var(--light-gray)' }}>
                  <span style={{ color: 'var(--charcoal)' }}>Net Amount</span>
                  <span style={{ color: 'var(--deep-teal)' }}>{formatCurrency(toNum(viewOrder.netAmount))}</span>
                </div>
              </div>

              {/* Payments */}
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payments</p>
                <div className="space-y-1">
                  {viewOrder.payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--off-white)' }}>
                      <span style={{ color: 'var(--charcoal)' }}>{p.method}{p.reference ? ` (${p.reference})` : ''}</span>
                      <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(toNum(p.amount))}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remarks */}
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Remarks</p>
                {viewOrder.notes
                  ? <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>{viewOrder.notes as string}</p>
                  : <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>—</p>
                }
              </div>

              {/* Invoice info */}
              {viewOrder.issuedOfficialInvoice && (
                <div className="text-xs px-3 py-2 rounded-lg" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                  Official Invoice: {viewOrder.salesInvoiceNumber || 'Issued'}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4 pt-3 border-t" style={{ borderColor: 'var(--light-gray)' }}>
              <button onClick={() => { printThermalReceipt(viewOrder); }} className="flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2" style={{ background: 'var(--off-white)', color: 'var(--teal)' }}>
                <Printer size={14} /> Print Receipt
              </button>
              <button onClick={() => setViewOrder(null)} className="px-6 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Reopened Order Modal */}
      {editOrder && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-2xl mb-8 relative">
            <button onClick={() => setEditOrder(null)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>
            <h3 className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Edit Order — {editOrder.orderNumber}
            </h3>
            <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>REOPENED</span>
              &nbsp; {formatDate(editOrder.transactionDate)}
            </p>

            {editError && <p className="text-xs text-red-600 mb-3 flex items-center gap-1"><AlertCircle size={12} />{editError}</p>}

            <div className="space-y-4">
              {/* Transaction Date */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Transaction Date</label>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                {editDate !== (editOrder.transactionDate ? editOrder.transactionDate.split('T')[0] : '') && (
                  <div className="mt-2">
                    <label className="block text-xs font-semibold mb-1" style={{ color: '#991b1b' }}>Reason for date change *</label>
                    <input value={editDateReason} onChange={e => setEditDateReason(e.target.value)}
                      placeholder="e.g. Late entry, correction"
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#fca5a5', background: '#fef2f2' }} />
                  </div>
                )}
              </div>

              {/* Patient & Clinician — with search */}
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Patient Name</label>
                  <input value={editPatient}
                    onChange={e => { setEditPatient(e.target.value); setEditPatientSearch(e.target.value) }}
                    onFocus={() => editPatient.length >= 2 && editPatientResults.length > 0 && setEditShowPatientDrop(true)}
                    onBlur={() => setTimeout(() => setEditShowPatientDrop(false), 200)}
                    placeholder="Search patient..."
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  {editShowPatientDrop && editPatientResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                      {editPatientResults.map(p => (
                        <button key={p.id} onClick={() => { setEditPatient(p.name); setEditPatientSearch(''); setEditShowPatientDrop(false) }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between" style={{ color: 'var(--charcoal)' }}>
                          <span className="font-medium">{p.name}</span>
                          {p.email ? <span className="text-xs ml-2 truncate" style={{ color: 'var(--mid-gray)' }}>{p.email}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Clinician Name</label>
                  <div className="relative">
                    <input value={editClinician}
                      onChange={e => { setEditClinician(e.target.value); setEditClinicianSearch(e.target.value) }}
                      onFocus={() => {
                        // If we already have results, show them; otherwise trigger a search if enough chars
                        if (editClinicianResults.length > 0) setEditShowClinicianDrop(true)
                        else if (editClinician.length >= 2) setEditClinicianSearch(editClinician)
                      }}
                      onBlur={() => setTimeout(() => setEditShowClinicianDrop(false), 200)}
                      placeholder="Type to search clinician..."
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none pr-8" style={{ borderColor: 'var(--light-gray)' }} />
                    {editClinician && (
                      <button type="button" onClick={() => { setEditClinician(''); setEditClinicianSearch(''); setEditClinicianResults([]); setEditShowClinicianDrop(false) }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100" title="Clear">
                        <X size={14} style={{ color: 'var(--mid-gray)' }} />
                      </button>
                    )}
                  </div>
                  {editShowClinicianDrop && editClinicianResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                      {editClinicianResults.map(c => (
                        <button key={c.id} onClick={() => { setEditClinician(c.name); setEditClinicianSearch(''); setEditShowClinicianDrop(false) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                          {c.name} {c.department ? <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>({c.department})</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>LINE ITEMS</h4>
                  <button onClick={() => setEditItems(prev => [...prev, { name: '', quantity: 1, unitPrice: 0, lineTotal: 0 }])}
                    className="text-xs font-medium" style={{ color: 'var(--teal)' }}>+ Add Item</button>
                </div>
                <div className="space-y-2">
                  {editItems.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: 'var(--off-white)' }}>
                      <input value={it.name} onChange={e => setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                        className="flex-1 px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      <input type="number" min={1} value={it.quantity}
                        onChange={e => {
                          const qty = parseInt(e.target.value) || 1
                          setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, quantity: qty, lineTotal: x.unitPrice * qty } : x))
                        }}
                        className="w-16 px-2 py-1.5 rounded-lg border text-sm text-center outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      <input type="number" min={0} step="0.01" value={it.unitPrice}
                        onChange={e => {
                          const price = parseFloat(e.target.value) || 0
                          setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, unitPrice: price, lineTotal: price * x.quantity } : x))
                        }}
                        className="w-28 px-2 py-1.5 rounded-lg border text-sm text-right outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      <span className="text-sm font-medium w-24 text-right" style={{ color: 'var(--charcoal)' }}>{formatCurrency(it.lineTotal)}</span>
                      {editItems.length > 1 && (
                        <button onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))} className="p-1 rounded hover:bg-red-50">
                          <Trash2 size={12} className="text-red-500" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-right text-sm font-semibold mt-2" style={{ color: 'var(--charcoal)' }}>Subtotal: {formatCurrency(editSubtotal)}</p>
              </div>

              {/* Payments */}
              <div>
                <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--mid-gray)' }}>PAYMENTS</h4>
                <div className="space-y-2">
                  {editPayments.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select value={p.paymentModeId || p.method} onChange={e => {
                        const val = e.target.value
                        const cm = editConfiguredModes.find(m => m.id === val)
                        if (cm) {
                          setEditPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, method: cm.paymentMethod || 'CASH', paymentModeId: cm.id } : pp))
                        } else {
                          setEditPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, method: val, paymentModeId: undefined } : pp))
                        }
                      }}
                        className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                        {editConfiguredModes.length > 0 ? (
                          editConfiguredModes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
                        ) : (
                          PAYMENT_METHODS_SERVICE.map(m => <option key={m.value} value={m.value}>{m.label}</option>)
                        )}
                        {/* Digital wallet payment type options */}
                        {p.walletId && (
                          <>
                            <option value="VIP_CARD">VIP Card</option>
                            <option value="PREPAID_CARD">Prepaid Card</option>
                            <option value="PACKAGE">Package</option>
                            <option value="DOWNPAYMENT">Downpayment</option>
                            <option value="HMO">HMO</option>
                            <option value="GL">Guarantee Letter</option>
                          </>
                        )}
                      </select>
                      <input type="number" min={0} step="0.01" value={p.amount || ''}
                        onChange={e => setEditPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, amount: parseFloat(e.target.value) || 0 } : pp))}
                        className="w-32 px-3 py-2 rounded-xl border text-sm text-right outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      {editPayments.length > 1 && (
                        <button onClick={() => setEditPayments(prev => prev.filter((_, i) => i !== idx))} className="p-1 rounded hover:bg-red-50">
                          <X size={14} className="text-red-500" />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setEditPayments(prev => [...prev, { method: 'CASH', amount: 0 }])}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>+ Add Payment</button>
                    <button onClick={() => setEditShowWalletPay(!editShowWalletPay)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                      <Wallet size={12} /> VIP/Prepaid Card
                    </button>
                    <button onClick={() => { setEditShowDownpayment(!editShowDownpayment); if (!editShowDownpayment) editSearchTypedWallets('DOWNPAYMENT', '', setEditDpWallets) }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                      <CreditCard size={12} /> Has Downpayment
                    </button>
                    <button onClick={() => setEditShowPackagePay(!editShowPackagePay)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ color: '#1e40af' }}>Package</button>
                    <button onClick={() => { setEditShowHmoPay(!editShowHmoPay); setEditShowGlPay(false); setEditShowAdvancePay(false); if (!editShowHmoPay) editSearchTypedWallets('HMO', '', setEditHmoWallets) }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ color: '#c2410c' }}>HMO</button>
                    <button onClick={() => { setEditShowGlPay(!editShowGlPay); setEditShowHmoPay(false); setEditShowAdvancePay(false); if (!editShowGlPay) editSearchTypedWallets('GL', '', setEditGlWallets) }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ color: '#15803d' }}>GL</button>
                    <button onClick={() => { setEditShowAdvancePay(!editShowAdvancePay); setEditShowHmoPay(false); setEditShowGlPay(false); if (!editShowAdvancePay) editSearchTypedWallets('ADVANCE', '', setEditAdvanceWallets) }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ color: '#7c3aed' }}>Advance</button>
                  </div>

                  {/* VIP/Prepaid Card search */}
                  {editShowWalletPay && (
                    <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                      <div className="flex gap-2">
                        <input value={editWalletBarcode} onChange={e => setEditWalletBarcode(e.target.value)} placeholder="Scan barcode..."
                          onKeyDown={e => e.key === 'Enter' && editScanBarcode()}
                          className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        <button onClick={editScanBarcode} className="px-3 py-2 rounded-xl text-sm text-white" style={{ background: 'var(--teal)' }}>
                          <ScanLine size={14} />
                        </button>
                      </div>
                      <div className="text-xs text-center" style={{ color: 'var(--mid-gray)' }}>or search by name</div>
                      <input value={editWalletSearch} onChange={e => editSearchWallets(e.target.value)} placeholder="Search patient name..."
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      {editWalletResults.length > 0 && (
                        <div className="max-h-32 overflow-y-auto">
                          {editWalletResults.map(w => {
                            const wMethodMap: Record<string, string> = { VIP: 'VIP_CARD', PREPAID_CARD: 'PREPAID_CARD', PACKAGE: 'PACKAGE', DOWNPAYMENT: 'DOWNPAYMENT', ADVANCE: 'ADVANCE', HMO: 'HMO', GL: 'GL' }
                            return (
                              <button key={w.id} onClick={() => {
                                setEditPayments([{ method: wMethodMap[w.walletType] || 'PREPAID_CARD', amount: 0, walletId: w.id }])
                                setEditShowWalletPay(false)
                              }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between">
                                <span>{w.patientName}</span>
                                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                                  {w.walletType} · {w.barcode} · Bal: {formatCurrency(toNum(w.balance))}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Downpayment search */}
                  {editShowDownpayment && (
                    <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: '#f9a8d4', background: '#fdf2f8' }}>
                      <p className="text-xs font-semibold" style={{ color: '#9d174d' }}>Search Downpayment wallets</p>
                      <input value={editDpSearch} onChange={e => { setEditDpSearch(e.target.value); editSearchTypedWallets('DOWNPAYMENT', e.target.value, setEditDpWallets) }} placeholder="Search by patient name..."
                        onFocus={() => { if (!editDpSearch) editSearchTypedWallets('DOWNPAYMENT', '', setEditDpWallets) }}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#f9a8d4' }} />
                      {editDpWallets.length > 0 && (
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {editDpWallets.map(w => (
                            <button key={w.id} onClick={() => {
                              setEditPayments([{ method: 'DOWNPAYMENT', amount: 0, walletId: w.id }])
                              setEditShowDownpayment(false)
                            }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-pink-50 rounded-lg flex justify-between">
                              <span className="font-medium">{w.patientName}</span>
                              <span className="text-xs" style={{ color: '#9d174d' }}>Balance: {formatCurrency(toNum(w.balance))}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Package search */}
                  {editShowPackagePay && (
                    <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: '#93c5fd', background: '#eff6ff' }}>
                      <p className="text-xs font-semibold" style={{ color: '#1e40af' }}>Search patient&apos;s package wallet</p>
                      <input value={editPackageSearch} onChange={e => { setEditPackageSearch(e.target.value); editSearchTypedWallets('PACKAGE', e.target.value, setEditPackageWallets) }} placeholder="Search by patient name..."
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#93c5fd' }} />
                      {editPackageWallets.length > 0 && (
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {editPackageWallets.map(w => {
                            const pkgDept = w.packages?.find(p => p.isActive)?.department || w.packages?.[0]?.department
                            return (
                            <button key={w.id} onClick={() => {
                              setEditPayments([{ method: 'PACKAGE', amount: 0, walletId: w.id }])
                              setEditShowPackagePay(false)
                            }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded-lg flex justify-between">
                              <span className="font-medium">{w.patientName}{pkgDept ? ` (${pkgDept})` : ''}</span>
                              <span className="text-xs" style={{ color: '#1e40af' }}>Balance: {formatCurrency(toNum(w.balance))}</span>
                            </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* HMO search */}
                  {editShowHmoPay && (
                    <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: '#fdba74', background: '#fff7ed' }}>
                      <p className="text-xs font-semibold" style={{ color: '#c2410c' }}>Select HMO Provider</p>
                      <input value={editHmoSearch} onChange={e => { setEditHmoSearch(e.target.value); editSearchTypedWallets('HMO', e.target.value, setEditHmoWallets) }} placeholder="Search HMO..."
                        onFocus={() => { if (!editHmoSearch) editSearchTypedWallets('HMO', '', setEditHmoWallets) }}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#fdba74' }} />
                      {editHmoWallets.length > 0 && (
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {editHmoWallets.map(w => (
                            <button key={w.id} onClick={() => {
                              setEditPayments([{ method: 'HMO', amount: 0, walletId: w.id }])
                              setEditShowHmoPay(false)
                            }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 rounded-lg flex justify-between">
                              <span className="font-medium">{w.patientName}</span>
                              <span className="text-xs" style={{ color: '#c2410c' }}>Receivable: {formatCurrency(toNum(w.balance))}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* GL search */}
                  {editShowGlPay && (
                    <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: '#86efac', background: '#f0fdf4' }}>
                      <p className="text-xs font-semibold" style={{ color: '#15803d' }}>Select Agency (GL)</p>
                      <input value={editGlSearch} onChange={e => { setEditGlSearch(e.target.value); editSearchTypedWallets('GL', e.target.value, setEditGlWallets) }} placeholder="Search agency..."
                        onFocus={() => { if (!editGlSearch) editSearchTypedWallets('GL', '', setEditGlWallets) }}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#86efac' }} />
                      {editGlWallets.length > 0 && (
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {editGlWallets.map(w => (
                            <button key={w.id} onClick={() => {
                              setEditPayments([{ method: 'GL', amount: 0, walletId: w.id }])
                              setEditShowGlPay(false)
                            }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 rounded-lg flex justify-between">
                              <span className="font-medium">{w.patientName}</span>
                              <span className="text-xs" style={{ color: '#15803d' }}>Remaining: {formatCurrency(toNum(w.balance))}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Advance search */}
                  {editShowAdvancePay && (
                    <div className="p-3 rounded-xl border space-y-2" style={{ borderColor: '#c4b5fd', background: '#f5f3ff' }}>
                      <p className="text-xs font-semibold" style={{ color: '#7c3aed' }}>Search Advance wallets</p>
                      <input value={editAdvanceSearch} onChange={e => { setEditAdvanceSearch(e.target.value); editSearchTypedWallets('ADVANCE', e.target.value, setEditAdvanceWallets) }} placeholder="Search by patient name..."
                        onFocus={() => { if (!editAdvanceSearch) editSearchTypedWallets('ADVANCE', '', setEditAdvanceWallets) }}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#c4b5fd' }} />
                      {editAdvanceWallets.length > 0 && (
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {editAdvanceWallets.map(w => (
                            <button key={w.id} onClick={() => {
                              setEditPayments([{ method: 'ADVANCE', amount: 0, walletId: w.id }])
                              setEditShowAdvancePay(false)
                            }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 rounded-lg flex justify-between">
                              <span className="font-medium">{w.patientName}</span>
                              <span className="text-xs" style={{ color: '#7c3aed' }}>Balance: {formatCurrency(toNum(w.balance))}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-right text-sm mt-2" style={{ color: editTotalPayments >= editNetAmount ? 'var(--deep-teal)' : '#991b1b' }}>
                  Total Payments: {formatCurrency(editTotalPayments)}
                </p>
              </div>

              {/* Discount Section — mirrors New Payment form */}
              <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
                <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Discounts</h4>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--charcoal)' }}>
                    <input type="checkbox" checked={editPwdDiscount}
                      onChange={e => { setEditPwdDiscount(e.target.checked); if (e.target.checked) { setEditCustomDiscountId(''); setEditFreeformAmt(0) } }}
                      className="rounded" />
                    PWD / Senior Citizen (20%)
                  </label>
                </div>
                {editPwdDiscount && (
                  <p className="text-xs font-medium" style={{ color: 'var(--deep-teal)' }}>
                    Discount: -{formatCurrency(computedEditDiscount.amount)} &middot; Net: {formatCurrency(editNetAmount)}
                  </p>
                )}
                {!editPwdDiscount && (
                  <div className="space-y-2">
                    <select value={editCustomDiscountId}
                      onChange={e => { setEditCustomDiscountId(e.target.value); if (e.target.value !== '__FREEFORM__') { setEditFreeformAmt(0); setEditFreeformRemarks('') } }}
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">No discount</option>
                      <option value="__FREEFORM__">Custom amount</option>
                    </select>
                    {editCustomDiscountId === '__FREEFORM__' && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <select value={editFreeformType} onChange={e => setEditFreeformType(e.target.value as 'FIXED' | 'PERCENTAGE')}
                            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                            <option value="FIXED">Fixed (₱)</option>
                            <option value="PERCENTAGE">Percentage (%)</option>
                          </select>
                          <input type="number" min={0} step="0.01" value={editFreeformAmt || ''}
                            onChange={e => setEditFreeformAmt(parseFloat(e.target.value) || 0)}
                            placeholder={editFreeformType === 'FIXED' ? 'Amount' : 'Percent'}
                            className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <input value={editFreeformRemarks} onChange={e => setEditFreeformRemarks(e.target.value)}
                          placeholder="Discount reason / label"
                          className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                    )}
                  </div>
                )}
                {computedEditDiscount.amount > 0 && !editPwdDiscount && (
                  <p className="text-right text-sm font-semibold" style={{ color: 'var(--deep-teal)' }}>
                    Discount: -{formatCurrency(computedEditDiscount.amount)} &middot; Net: {formatCurrency(editNetAmount)}
                  </p>
                )}
              </div>

              {/* Official Sales Invoice */}
              <div className="rounded-xl p-3 border" style={{ borderColor: 'var(--light-gray)' }}>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editIssuedOfficialInvoice}
                    onChange={e => { setEditIssuedOfficialInvoice(e.target.checked); if (!e.target.checked) setEditSalesInvoiceNumber('') }}
                    className="w-4 h-4 rounded accent-teal-600"
                  />
                  <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Issued Official Sales Invoice</span>
                </label>
                {editIssuedOfficialInvoice && (
                  <div className="mt-2">
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Sales Invoice Number</label>
                    <input
                      type="text"
                      value={editSalesInvoiceNumber}
                      onChange={e => setEditSalesInvoiceNumber(e.target.value)}
                      placeholder="e.g. SI-2026-001234"
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--light-gray)' }}
                    />
                  </div>
                )}
              </div>

              {/* Reference Number */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Reference Number (optional)</label>
                <input type="text" value={editReferenceNumber} onChange={e => setEditReferenceNumber(e.target.value)}
                  placeholder="e.g. OR-2026-001234"
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }} />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Remarks (optional)</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                  placeholder="Any notes or remarks for this order..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none"
                  style={{ borderColor: 'var(--light-gray)' }} />
              </div>

              {/* Save */}
              <div className="flex gap-2 pt-2">
                <button onClick={saveEditOrder} disabled={editSaving || editItems.length === 0}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'var(--teal)' }}>
                  {editSaving && <Loader2 className="animate-spin" size={14} />}
                  Save Changes
                </button>
                <button onClick={() => setEditOrder(null)}
                  className="px-6 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   DIGITAL WALLET PANEL
   ══════════════════════════════════════════════════════════════ */

function WalletPanel({ session }: { session: { user?: Record<string, unknown> } | null }) {
  const [walletTypeFilter, setWalletTypeFilter] = useState('VIP')
  const [search, setSearch] = useState('')
  const [wallets, setWallets] = useState<DigitalWallet[]>([])
  const [loading, setLoading] = useState(false)
  const [wSortField, setWSortField] = useState('patientName')
  const [wSortDir, setWSortDir] = useState<'asc' | 'desc'>('asc')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ patientName: '', patientId: '', patientEmail: '', accountId: '', dateObtained: '', paymentModeId: '', glAmount: '', totalGlAmount: '', attachmentUrl: '', agency: '', initialRewardPoints: '', branch: 'ALL' })
  const [createAccountSearch, setCreateAccountSearch] = useState('')
  const [arAccounts, setArAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [crmSearch, setCrmSearch] = useState('')
  const [crmPatients, setCrmPatients] = useState<Patient[]>([])
  const [showCrmDrop, setShowCrmDrop] = useState(false)
  const crmTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [walletPaymentModes, setWalletPaymentModes] = useState<PaymentModeType[]>([])
  // Fetch ASSET accounts for AR classification (HMO/GL)
  useEffect(() => {
    fetch('/api/chart-of-accounts?accountType=ASSET&pageSize=500')
      .then(r => r.json())
      .then(d => setArAccounts((d.data || []).map((a: { id: string; accountNumber: string; accountTitle: string }) => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle }))))
      .catch(() => {})
  }, [])
  // Fetch payment modes for wallet creation form
  useEffect(() => {
    fetch('/api/pos/payment-modes')
      .then(r => r.json())
      .then(d => setWalletPaymentModes(Array.isArray(d) ? d.filter((m: PaymentModeType) => m.isActive) : []))
      .catch(() => {})
  }, [])
  // CRM patient search
  useEffect(() => {
    if (crmSearch.length < 2) { setCrmPatients([]); setShowCrmDrop(false); return }
    clearTimeout(crmTimer.current)
    crmTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pos/patients?search=${encodeURIComponent(crmSearch)}`)
        const d = await r.json()
        setCrmPatients(Array.isArray(d) ? d : [])
        setShowCrmDrop(true)
      } catch { setCrmPatients([]) }
    }, 300)
  }, [crmSearch])
  const [selectedWallet, setSelectedWallet] = useState<DigitalWallet | null>(null)
  const [showDeletedWallets, setShowDeletedWallets] = useState(false)
  const [walletDetail, setWalletDetail] = useState<DigitalWallet | null>(null)
  const [walletEditing, setWalletEditing] = useState(false)
  const [walletEditForm, setWalletEditForm] = useState<Record<string, string>>({})
  const [walletEditSaving, setWalletEditSaving] = useState(false)
  const [showAddPackage, setShowAddPackage] = useState(false)
  const [showSOA, setShowSOA] = useState<DigitalWallet | null>(null)
  const [soaDateFrom, setSoaDateFrom] = useState(today())
  const [soaDateTo, setSoaDateTo] = useState(today())
  const [soaBranch, setSoaBranch] = useState('')
  const [soaOrders, setSoaOrders] = useState<Order[]>([])
  const [pkgForm, setPkgForm] = useState({ serviceName: '', serviceId: '', department: '', totalSessions: 1, amountPaid: 0, expiresAt: '' })
  const [pkgServiceSearch, setPkgServiceSearch] = useState('')
  const [pkgServiceResults, setPkgServiceResults] = useState<{ id: string; name: string; department: string; packageSessions?: number; price: number }[]>([])
  const [showPkgServiceDrop, setShowPkgServiceDrop] = useState(false)
  const pkgSearchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Create-modal package search (separate from add-package form)
  const [createPkgSearch, setCreatePkgSearch] = useState('')
  const [createPkgResults, setCreatePkgResults] = useState<{ id: string; name: string; department: string; packageSessions?: number; price: number }[]>([])
  const [showCreatePkgDrop, setShowCreatePkgDrop] = useState(false)
  const [createPkgSelected, setCreatePkgSelected] = useState<{ serviceId: string; serviceName: string; department: string; totalSessions: number; amountPaid: number; usedSessions: number } | null>(null)
  const createPkgTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const barcodeRef = useRef<SVGSVGElement>(null)

  // Debounced search for UNEARNED PACKAGE services (for add-package dropdown)
  useEffect(() => {
    if (pkgSearchTimer.current) clearTimeout(pkgSearchTimer.current)
    if (pkgServiceSearch.length < 2) { setPkgServiceResults([]); setShowPkgServiceDrop(false); return }
    pkgSearchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/services?search=${encodeURIComponent(pkgServiceSearch)}&revenueType=UNEARNED&walletType=PACKAGE&pageSize=20`)
        const d = await r.json()
        const items = (Array.isArray(d) ? d : d.data || []).map((s: { id: string; name: string; department: string; packageSessions?: number; price: number }) => ({
          id: s.id, name: s.name, department: s.department, packageSessions: s.packageSessions || null, price: s.price,
        }))
        setPkgServiceResults(items)
        setShowPkgServiceDrop(items.length > 0)
      } catch { setPkgServiceResults([]) }
    }, 300)
    return () => { if (pkgSearchTimer.current) clearTimeout(pkgSearchTimer.current) }
  }, [pkgServiceSearch])

  // Debounced search for create-modal package service
  useEffect(() => {
    if (createPkgTimer.current) clearTimeout(createPkgTimer.current)
    if (createPkgSearch.length < 2) { setCreatePkgResults([]); setShowCreatePkgDrop(false); return }
    createPkgTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/services?search=${encodeURIComponent(createPkgSearch)}&revenueType=UNEARNED&walletType=PACKAGE&pageSize=20`)
        const d = await r.json()
        const items = (Array.isArray(d) ? d : d.data || []).map((s: { id: string; name: string; department: string; packageSessions?: number; price: number }) => ({
          id: s.id, name: s.name, department: s.department, packageSessions: s.packageSessions || null, price: s.price,
        }))
        setCreatePkgResults(items)
        setShowCreatePkgDrop(items.length > 0)
      } catch { setCreatePkgResults([]) }
    }, 300)
    return () => { if (createPkgTimer.current) clearTimeout(createPkgTimer.current) }
  }, [createPkgSearch])

  const walletSubTabs = [
    { key: 'VIP', label: 'VIP' },
    { key: 'PACKAGE', label: 'Package' },
    { key: 'DOWNPAYMENT', label: 'Downpayments' },
    { key: 'ADVANCE', label: 'Advances' },
    { key: 'PREPAID_CARD', label: 'Prepaid Card' },
    { key: 'HMO', label: 'HMO' },
    { key: 'GL', label: 'GL' },
  ]

  const panelBranch = userBranch(session)

  const fetchWallets = useCallback(async () => {
    setLoading(true)
    try {
      const qp = new URLSearchParams()
      if (search) qp.set('search', search)
      qp.set('walletType', walletTypeFilter)
      if (showDeletedWallets) qp.set('includeDeleted', 'true')
      // Non-admin users only see wallets for their branch + ALL
      if (!isAdmin(session)) qp.set('branch', panelBranch)
      const r = await fetch(`/api/pos/wallets?${qp}`)
      const d = await r.json()
      setWallets(normalize(d) as DigitalWallet[])
    } catch {
      setWallets([])
    } finally {
      setLoading(false)
    }
  }, [search, walletTypeFilter, showDeletedWallets, panelBranch, session])

  useEffect(() => { fetchWallets() }, [fetchWallets])

  const [createError, setCreateError] = useState('')
  const createWallet = async () => {
    if (!createForm.patientName.trim()) { setCreateError('Name is required'); return }
    setCreateError('')
    try {
      const payload = {
        ...createForm,
        walletType: walletTypeFilter,
        // For PACKAGE wallets, balance is computed from package data (not from initialBalance field)
        initialBalance: walletTypeFilter !== 'PACKAGE' && createForm.glAmount ? parseFloat(createForm.glAmount) : undefined,
        totalGlAmount: walletTypeFilter === 'GL' && createForm.totalGlAmount ? parseFloat(createForm.totalGlAmount) : undefined,
        initialRewardPoints: createForm.initialRewardPoints ? parseInt(createForm.initialRewardPoints) : undefined,
      }
      const r = await fetch('/api/pos/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await r.json()
      if (!r.ok) {
        setCreateError(data.error || `Failed (${r.status})`)
        return
      }
      if (data.existingWallet) {
        setCreateError(`Already exists — ${walletTypeFilter === 'HMO' ? 'HMO' : 'Wallet'} "${createForm.patientName}" already registered.`)
        fetchWallets()
        return
      }
      // If PACKAGE wallet and a package service was selected, auto-add the first package
      if (walletTypeFilter === 'PACKAGE' && createPkgSelected && data.id) {
        try {
          await fetch(`/api/pos/wallets/${data.id}/reload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              serviceName: createPkgSelected.serviceName,
              serviceId: createPkgSelected.serviceId,
              department: createPkgSelected.department,
              totalSessions: createPkgSelected.totalSessions,
              amountPaid: createPkgSelected.amountPaid,
              usedSessions: createPkgSelected.usedSessions || 0,
              expiresAt: '',
            }),
          })
        } catch {}
      }
      setShowCreate(false)
      setCreateForm({ patientName: '', patientId: '', patientEmail: '', accountId: '', dateObtained: '', paymentModeId: '', glAmount: '', totalGlAmount: '', attachmentUrl: '', agency: '', initialRewardPoints: '', branch: 'ALL' })
      setCreateAccountSearch('')
      setCrmSearch('')
      setCrmPatients([])
      setCreatePkgSelected(null)
      setCreatePkgSearch('')
      fetchWallets()
    } catch (e) {
      setCreateError(`Network error: ${e}`)
    }
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

  const startWalletEdit = () => {
    if (!walletDetail) return
    setWalletEditForm({
      patientName: walletDetail.patientName || '',
      patientEmail: walletDetail.patientEmail || '',
      dateObtained: walletDetail.dateObtained ? String(walletDetail.dateObtained).split('T')[0] : '',
      agency: (walletDetail.agency as string) || '',
      vipTier: walletDetail.vipTier || '',
      balance: String(toNum(walletDetail.balance)),
      attachmentUrl: (walletDetail.attachmentUrl as string) || '',
      accountId: (walletDetail.accountId as string) || '',
      rewardPoints: String(walletDetail.rewardPoints || 0),
      totalGlAmount: String(toNum(walletDetail.totalGlAmount as string | number | null)),
      branch: (walletDetail.branch as string) || 'ALL',
    })
    setWalletEditing(true)
  }

  const saveWalletEdit = async () => {
    if (!walletDetail) return
    setWalletEditSaving(true)
    try {
      const r = await fetch(`/api/pos/wallets/${walletDetail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: walletEditForm.patientName,
          patientEmail: walletEditForm.patientEmail,
          dateObtained: walletEditForm.dateObtained || null,
          agency: walletEditForm.agency || null,
          vipTier: walletEditForm.vipTier || null,
          balance: walletEditForm.balance,
          attachmentUrl: walletEditForm.attachmentUrl || null,
          accountId: walletEditForm.accountId || null,
          ...(['VIP', 'PREPAID_CARD'].includes(walletDetail.walletType) ? { rewardPoints: walletEditForm.rewardPoints } : {}),
          ...(walletDetail.walletType === 'GL' ? { totalGlAmount: walletEditForm.totalGlAmount } : {}),
          branch: walletEditForm.branch || 'ALL',
        }),
      })
      if (r.ok) {
        setWalletEditing(false)
        loadWalletDetail(walletDetail)
        fetchWallets()
      }
    } catch {}
    setWalletEditSaving(false)
  }

  const deleteWallet = async (wallet: DigitalWallet) => {
    const reason = window.prompt('Reason for deleting this wallet:')
    if (!reason?.trim()) return
    if (!window.confirm(`Are you sure you want to delete the ${WALLET_TYPE_LABELS[wallet.walletType] || wallet.walletType} wallet for "${wallet.patientName}"?\n\nReason: ${reason}\n\nThis action will be logged.`)) return
    try {
      const r = await fetch(`/api/pos/wallets/${wallet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false, deleteReason: reason.trim() }),
      })
      if (r.ok) {
        setSelectedWallet(null)
        setWalletDetail(null)
        fetchWallets()
      }
    } catch {}
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
        body: JSON.stringify({
          serviceName: pkgForm.serviceName,
          serviceId: pkgForm.serviceId || undefined,
          department: pkgForm.department || undefined,
          totalSessions: pkgForm.totalSessions,
          amountPaid: pkgForm.amountPaid,
          expiresAt: pkgForm.expiresAt,
        }),
      })
      if (r.ok) {
        setShowAddPackage(false)
        setPkgForm({ serviceName: '', serviceId: '', department: '', totalSessions: 1, amountPaid: 0, expiresAt: '' })
        setPkgServiceSearch('')
        loadWalletDetail(walletDetail)
      }
    } catch {}
  }

  const deductSession = async (pkgId: string, serviceName: string, amountPaid: number, totalSessions: number) => {
    if (!walletDetail) return
    const perSession = amountPaid / totalSessions
    if (!window.confirm(`Deduct 1 session from "${serviceName}"?\n\nPer-session rate: ₱${perSession.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nWallet balance will decrease by this amount.`)) return
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

  const printCard = (w: DigitalWallet) => {
    // Generate barcode as data URL
    const canvas = document.createElement('canvas')
    const isVIP = w.walletType === 'VIP'
    const tier = (w.vipTier || 'PLATINUM').toUpperCase()

    // VIP cards: white background with black text/logo
    const colors = isVIP
      ? { bg: '#FFFFFF', text: '#000000', barFg: '#000000', barBg: '#FFFFFF' }
      : { bg: '#FFFFFF', text: '#222', barFg: '#000', barBg: '#FFFFFF' }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const JsBarcodeLib = require('jsbarcode')
      JsBarcodeLib(canvas, w.barcode, {
        format: 'CODE128', width: 2, height: 50, displayValue: true,
        fontSize: 12, margin: 6, font: 'monospace',
        lineColor: colors.barFg, background: colors.barBg,
      })
    } catch { /* invalid */ }
    const barcodeImg = canvas.toDataURL('image/png')

    const cardNum = w.barcode.replace(/-/g, '').replace(/(.{4})/g, '$1 ').trim()
    const created = new Date(w.createdAt as string || Date.now())
    const expiry = new Date(created)
    expiry.setFullYear(expiry.getFullYear() + 3)
    const expStr = `${String(expiry.getMonth() + 1).padStart(2, '0')}/${String(expiry.getFullYear()).slice(-2)}`
    const logoUrl = `${window.location.origin}/brand/sandbox-clinic-logo.png`

    // SCEI diamond mark logos (actual PNGs)
    const sceiMarkWhite = `${window.location.origin}/brand/scei-mark-white.png`
    const sceiMarkDark = `${window.location.origin}/brand/scei-mark-dark.png`
    const sceiMark = isVIP ? sceiMarkDark : sceiMarkWhite

    const cardW = '85.6mm'
    const cardH = '54mm'

    let frontHtml: string
    let backHtml: string

    if (isVIP) {
      // VIP CARD LAYOUT — white card, ink-saving, tier accent color for text
      const tierAccent = tier === 'GOLD' ? '#B8860B' : tier === 'SILVER' ? '#6B7280' : '#374151'
      const tierLine = tier === 'GOLD' ? 'linear-gradient(90deg, transparent, #B8860B, transparent)'
        : tier === 'SILVER' ? 'linear-gradient(90deg, transparent, #9CA3AF, transparent)'
        : 'linear-gradient(90deg, transparent, #6B7280, transparent)'

      frontHtml = `<div class="card" style="background:#FFFFFF;border:1px solid #e5e7eb;position:relative;overflow:hidden">
        <div style="padding:14px 18px;display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;box-sizing:border-box">
          <!-- Top: SCEI mark + tier badge -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <img src="${sceiMark}" style="width:42px;height:42px;object-fit:contain" />
            <div style="font-size:7px;font-weight:900;letter-spacing:3px;color:${tierAccent};font-family:Arial Black,Arial,Helvetica,sans-serif">${tier}</div>
          </div>
          <!-- Center: VIP CARD prominent -->
          <div style="text-align:center;margin:-2px 0">
            <div style="font-size:8px;font-weight:900;letter-spacing:6px;color:${tierAccent};font-family:Arial Black,Arial,Helvetica,sans-serif;margin-bottom:2px">EXCLUSIVE</div>
            <div style="font-size:28px;font-weight:900;letter-spacing:10px;color:#1a1a1a;font-family:Arial Black,Arial,Helvetica,sans-serif;line-height:1">VIP</div>
            <div style="width:60px;height:1.5px;background:${tierLine};margin:4px auto"></div>
            <div style="font-size:8px;font-weight:900;letter-spacing:5px;color:#4B5563;font-family:Arial Black,Arial,Helvetica,sans-serif">MEMBER CARD</div>
          </div>
          <!-- Bottom: card number + name -->
          <div>
            <div style="font-size:9px;font-weight:900;letter-spacing:2.5px;color:#6B7280;font-family:Arial Black,Arial,Helvetica,sans-serif">${cardNum}</div>
            <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:3px">
              <div style="font-size:8px;font-weight:900;letter-spacing:1px;color:${tierAccent};font-family:Arial Black,Arial,Helvetica,sans-serif">${w.patientName}</div>
              <div>
                <div style="font-size:5.5px;color:#6B7280;font-weight:900;letter-spacing:1px;font-family:Arial,Helvetica,sans-serif">EXP</div>
                <div style="font-size:7.5px;font-weight:900;color:#4B5563;font-family:Arial Black,Arial,Helvetica,sans-serif">${expStr}</div>
              </div>
            </div>
          </div>
        </div>
      </div>`
      backHtml = `<div class="card" style="background:#FFFFFF;border:1px solid #e5e7eb;position:relative;overflow:hidden">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;padding:14px;box-sizing:border-box">
          <img src="${barcodeImg}" style="height:45px;max-width:230px;margin-bottom:8px" />
          <div style="width:40px;height:1.5px;background:${tierLine};margin-bottom:8px"></div>
          <div style="font-size:8px;font-weight:900;letter-spacing:3px;color:${tierAccent};font-family:Arial Black,Arial,Helvetica,sans-serif;text-align:center">
            SAPPHIRE CLINICS EAST INC.
          </div>
          <div style="font-size:6px;font-weight:900;letter-spacing:1px;color:#6B7280;font-family:Arial Black,Arial,Helvetica,sans-serif;margin-top:3px">
            EXCLUSIVE VIP MEMBER PRIVILEGES
          </div>
        </div>
      </div>`
    } else {
      // PREPAID CARD LAYOUT (Sandbox Clinic style)
      frontHtml = `<div class="card" style="background:#FFF;border:1px solid #ddd">
        <div style="padding:15px;display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;box-sizing:border-box">
          <img src="${logoUrl}" style="height:32px;object-fit:contain;align-self:flex-start" />
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#222;font-family:monospace;margin-bottom:6px">${cardNum}</div>
            <div style="display:flex;justify-content:space-between;align-items:flex-end">
              <div>
                <div style="font-size:6px;color:#E8641B;font-weight:700">EXP DATE</div>
                <div style="font-size:9px;font-weight:600;color:#333;font-family:monospace">${expStr}</div>
                <div style="font-size:8px;color:#E8641B;font-weight:700;margin-top:4px">${w.patientName}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:9px;font-weight:900;color:#222">RELOADABLE</div>
                <div style="font-size:11px;font-weight:900;color:#E8641B">PREPAID</div>
                <div style="font-size:11px;font-weight:900;color:#E8641B">CARD</div>
              </div>
            </div>
          </div>
        </div>
      </div>`
      backHtml = `<div class="card" style="background:#FFF;border:1px solid #ddd">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;padding:12px;box-sizing:border-box;text-align:center">
          <img src="${barcodeImg}" style="height:45px;max-width:240px;margin-bottom:6px" />
          <div style="font-size:7px;font-weight:700;color:#E8641B;margin-bottom:4px">
            Thank you for choosing Sandbox Clinic<br/>for your health and rehabilitation needs!
          </div>
          <div style="font-size:5.5px;color:#333;text-align:justify;padding:0 8px;margin-bottom:4px;line-height:1.4">
            Your reloadable card lets you earn points every time you avail of our services or purchase products. Simply present this card during each visit to collect points and redeem exclusive Sandbox rewards and merchandise.
          </div>
          <img src="${logoUrl}" style="height:18px;object-fit:contain" />
        </div>
      </div>`
    }

    const win = window.open('', '_blank', 'width=340,height=440')
    if (!win) return
    win.document.write(`<html><head><title>Card: ${w.patientName}</title>
      <style>
        @page { size: 85.6mm 54mm; margin: 0; }
        @media print { body { margin: 0; padding: 0; } }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
        .card {
          width: 85.6mm; height: 54mm;
          box-sizing: border-box;
          overflow: hidden;
          page-break-after: always;
          page-break-inside: avoid;
          margin: 0; padding: 0;
        }
      </style>
    </head><body>
      ${frontHtml}
      ${backHtml}
      <script>
        const imgs = document.querySelectorAll('img');
        let loaded = 0;
        const total = imgs.length;
        function checkPrint() { if (++loaded >= total) setTimeout(() => window.print(), 400); }
        imgs.forEach(img => { if (img.complete) checkPrint(); else { img.onload = checkPrint; img.onerror = checkPrint; } });
        if (total === 0) setTimeout(() => window.print(), 400);
      <\/script>
    </body></html>`)
    win.document.close()
  }

  // SOA: fetch orders for HMO/GL
  const fetchSOAOrders = async () => {
    if (!showSOA) return
    try {
      const params = new URLSearchParams({ pageSize: '500' })
      if (soaDateFrom) params.set('dateFrom', soaDateFrom)
      if (soaDateTo) params.set('dateTo', soaDateTo)
      if (soaBranch) params.set('branch', soaBranch)
      const r = await fetch(`/api/pos/orders?${params}`)
      const d = await r.json()
      const allOrders = normalize(d) as Order[]
      // Filter: orders with HMO/GL payment referencing this provider, exclude paid (AR settled)
      const providerName = showSOA.patientName
      const walletMethod = showSOA.walletType // HMO or GL
      const filtered = allOrders.filter(o =>
        o.status !== 'VOIDED' &&
        !(o.arPaymentItems || []).length &&
        o.payments.some(p => p.method === walletMethod && (
          (p.walletId === showSOA.id) ||
          (p.reference && p.reference.trim().toLowerCase() === providerName.toLowerCase())
        ))
      )
      setSoaOrders(filtered)
    } catch { setSoaOrders([]) }
  }

  const printSOA = () => {
    if (!showSOA) return
    const providerName = showSOA.patientName
    const isHMO = showSOA.walletType === 'HMO'
    const branchLabel = soaBranch === 'SANDBOX_EAST' ? 'Sandbox Clinic — East' : soaBranch === 'SANDBOX_GREENHILLS' ? 'Sandbox Clinic — Greenhills' : soaBranch === 'VERDANA_STORE' ? 'Verdana Store' : 'All Branches'
    const logoUrl = `${window.location.origin}/brand/sandbox-clinic-logo.png`
    const totalAmount = soaOrders.reduce((s, o) => {
      const hmoPayment = o.payments.find(p => p.method === showSOA.walletType && p.reference?.trim().toLowerCase() === providerName.toLowerCase())
      return s + (hmoPayment ? toNum(hmoPayment.amount) : 0)
    }, 0)
    const fmt = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const rows = soaOrders.map(o => {
      const hmoPayment = o.payments.find(p => p.method === showSOA.walletType && p.reference?.trim().toLowerCase() === providerName.toLowerCase())
      return `<tr>
        <td style="border:1px solid #ddd;padding:6px 8px;font-size:10px">${formatDate(o.transactionDate)}</td>
        <td style="border:1px solid #ddd;padding:6px 8px;font-size:10px">${o.items.map(it => it.name).join(', ')}</td>
        <td style="border:1px solid #ddd;padding:6px 8px;font-size:10px">${o.patientName || '—'}</td>
        <td style="border:1px solid #ddd;padding:6px 8px;font-size:10px">${formatClinicianName(o.clinicianName)}</td>
        <td style="border:1px solid #ddd;padding:6px 8px;font-size:10px;text-align:right;font-weight:600">₱${fmt(hmoPayment ? toNum(hmoPayment.amount) : 0)}</td>
      </tr>`
    }).join('')

    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    win.document.write(`<html><head><title>SOA - ${providerName}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { width: 100%; border-collapse: collapse; }
      </style>
    </head><body>
      <div style="display:flex;align-items:center;gap:15px;margin-bottom:20px">
        <img src="${logoUrl}" style="height:40px" />
        <div>
          <div style="font-size:16px;font-weight:700;color:#2B5F6B">SAPPHIRE CLINICS EAST INC.</div>
          <div style="font-size:11px;color:#666">${branchLabel}</div>
        </div>
      </div>

      <div style="text-align:center;margin-bottom:15px">
        <div style="font-size:18px;font-weight:700;color:#222">STATEMENT OF ACCOUNT</div>
        <div style="font-size:12px;color:#666;margin-top:4px">
          ${isHMO ? 'HMO' : 'Guarantee Letter (GL)'}: <strong>${providerName}</strong>
        </div>
        <div style="font-size:11px;color:#999;margin-top:2px">
          Period: ${formatDate(soaDateFrom)} — ${formatDate(soaDateTo)}
        </div>
      </div>

      <table>
        <thead>
          <tr style="background:#f5f5f5">
            <th style="border:1px solid #ddd;padding:8px;text-align:left;font-size:10px">Date</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:left;font-size:10px">Service</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:left;font-size:10px">Patient</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:left;font-size:10px">Clinician</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:right;font-size:10px">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4">
            <td colspan="4" style="border:1px solid #ddd;padding:8px;font-weight:700;font-size:11px;text-align:right">TOTAL RECEIVABLE</td>
            <td style="border:1px solid #ddd;padding:8px;font-weight:700;font-size:13px;text-align:right;color:#166534">₱${fmt(totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top:60px;display:flex;justify-content:space-between;gap:30px">
        <div style="flex:1;text-align:center">
          <div style="border-top:1px solid #000;margin-top:40px;padding-top:4px;font-size:10px;font-weight:600">Front Desk</div>
          <div style="font-size:9px;color:#666">Name / Signature</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="border-top:1px solid #000;margin-top:40px;padding-top:4px;font-size:10px;font-weight:600">${isHMO ? 'HMO Officer' : 'GL Officer'}</div>
          <div style="font-size:9px;color:#666">Name / Signature</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="border-top:1px solid #000;margin-top:40px;padding-top:4px;font-size:10px;font-weight:600">Clinic Manager</div>
          <div style="font-size:9px;color:#666">Name / Signature</div>
        </div>
      </div>

      <script>
        const imgs = document.querySelectorAll('img');
        let loaded = 0;
        imgs.forEach(img => { if (img.complete) loaded++; else img.onload = () => { if (++loaded >= imgs.length) setTimeout(() => window.print(), 300); }; });
        if (loaded >= imgs.length) setTimeout(() => window.print(), 500);
      <\/script>
    </body></html>`)
    win.document.close()
  }

  return (
    <div className="space-y-4">
      {/* Wallet Type Sub-tabs */}
      <div className="flex gap-1 flex-wrap">
        {walletSubTabs.map(t => {
          const colors = WALLET_TYPE_COLORS[t.key] || { bg: '#f3f4f6', color: '#374151' }
          return (
            <button
              key={t.key}
              onClick={() => { setWalletTypeFilter(t.key); setSearch('') }}
              className="px-4 py-2 text-sm rounded-xl font-medium transition-colors"
              style={{
                background: walletTypeFilter === t.key ? colors.bg : 'transparent',
                color: walletTypeFilter === t.key ? colors.color : 'var(--mid-gray)',
                border: walletTypeFilter === t.key ? `1px solid ${colors.color}30` : '1px solid transparent',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Search + Create */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-3" style={{ color: 'var(--mid-gray)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={walletTypeFilter === 'HMO' ? 'Search HMO provider...' : walletTypeFilter === 'GL' ? 'Search GL wallets by patient name...' : `Search ${WALLET_TYPE_LABELS[walletTypeFilter] || ''} wallets by patient name...`}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <button onClick={() => { setShowCreate(true); setCreateError('') }} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--teal)' }}>
          <Plus size={16} /> {walletTypeFilter === 'HMO' ? 'Add HMO' : walletTypeFilter === 'GL' ? 'Create GL Wallet' : 'Create Wallet'}
        </button>
      </div>

      {/* Show deleted toggle */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--mid-gray)' }}>
          <input type="checkbox" checked={showDeletedWallets} onChange={e => setShowDeletedWallets(e.target.checked)} className="rounded" />
          Show deleted wallets
        </label>
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
                {(walletTypeFilter === 'HMO'
                  ? [{ label: 'HMO Provider', field: 'patientName' }, { label: 'Type', field: '' }, { label: 'Receivable Balance', field: 'balance' }, { label: 'Branch', field: 'branch' }, { label: 'Transactions', field: '' }, { label: '', field: '' }]
                  : walletTypeFilter === 'GL'
                  ? [{ label: 'Patient Name', field: 'patientName' }, { label: 'Agency', field: 'agency' }, { label: 'Total GL Amount', field: 'totalGlAmount' }, { label: 'Balance', field: 'balance' }, { label: 'Branch', field: 'branch' }, { label: 'Attachment', field: '' }, { label: '', field: '' }]
                  : ['VIP', 'PREPAID_CARD'].includes(walletTypeFilter)
                  ? [{ label: 'Patient Name', field: 'patientName' }, { label: 'Type', field: '' }, { label: 'Balance', field: 'balance' }, { label: 'Branch', field: 'branch' }, { label: 'Barcode', field: 'barcode' }, { label: 'Packages', field: '' }, { label: 'Reward Points', field: 'rewardPoints' }, { label: '', field: '' }]
                  : [{ label: 'Patient Name', field: 'patientName' }, { label: 'Type', field: '' }, { label: 'Balance', field: 'balance' }, { label: 'Branch', field: 'branch' }, { label: 'Packages', field: '' }, { label: '', field: '' }]
                ).map(h => (
                  <th key={h.label || 'actions'} className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider ${h.field ? 'cursor-pointer select-none hover:bg-gray-50' : ''}`}
                    style={{ color: wSortField === h.field ? 'var(--teal)' : 'var(--mid-gray)' }}
                    onClick={() => { if (!h.field) return; if (wSortField === h.field) { setWSortDir(d => d === 'asc' ? 'desc' : 'asc') } else { setWSortField(h.field); setWSortDir('asc') } }}>
                    <span className="flex items-center gap-1">
                      {h.label}
                      {h.field && wSortField === h.field && (
                        <span className="text-[10px]">{wSortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...wallets].sort((a, b) => {
                const f = wSortField as keyof DigitalWallet
                const av = a[f], bv = b[f]
                const an = typeof av === 'number' ? av : typeof av === 'string' ? (isNaN(Number(av)) ? av.toLowerCase() : Number(av)) : 0
                const bn = typeof bv === 'number' ? bv : typeof bv === 'string' ? (isNaN(Number(bv)) ? bv.toLowerCase() : Number(bv)) : 0
                if (an < bn) return wSortDir === 'asc' ? -1 : 1
                if (an > bn) return wSortDir === 'asc' ? 1 : -1
                return 0
              }).map(w => {
                const typeBadge = WALLET_TYPE_COLORS[w.walletType] || { bg: '#f3f4f6', color: '#374151' }
                return (
                  <tr key={w.id}
                    className={`border-b cursor-pointer ${w.isActive === false ? 'bg-red-50 opacity-60' : 'hover:bg-gray-50'}`}
                    style={{ borderColor: 'var(--light-gray)' }}
                    onClick={() => w.isActive !== false && loadWalletDetail(w)}>
                    <td className="px-5 py-3 font-medium" style={{ color: w.isActive === false ? '#991b1b' : 'var(--charcoal)' }}>
                      {w.patientName}
                      {w.isActive === false && <span className="ml-2 text-xs font-normal text-red-600">(Deleted)</span>}
                    </td>
                    <td className="px-5 py-3">
                      {walletTypeFilter === 'GL' ? (
                        <span className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                          {(w as unknown as { agency?: string }).agency || <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: typeBadge.bg, color: typeBadge.color }}>
                            {WALLET_TYPE_LABELS[w.walletType] || w.walletType}
                          </span>
                          {w.walletType === 'VIP' && w.vipTier && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: w.vipTier === 'PLATINUM' ? '#e2e8f0' : w.vipTier === 'GOLD' ? '#fef3c7' : '#e0e7ff', color: w.vipTier === 'PLATINUM' ? '#475569' : w.vipTier === 'GOLD' ? '#92400e' : '#3730a3' }}>
                              {w.vipTier}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    {walletTypeFilter === 'GL' && (
                      <td className="px-5 py-3 font-semibold" style={{ color: '#15803d' }}>
                        {(w as unknown as { totalGlAmount?: number | string }).totalGlAmount
                          ? formatCurrency(toNum((w as unknown as { totalGlAmount?: number | string }).totalGlAmount))
                          : <span className="text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>—</span>}
                      </td>
                    )}
                    <td className="px-5 py-3 font-semibold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(toNum(w.balance))}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: (w.branch === 'SANDBOX_EAST' ? '#dbeafe' : w.branch === 'SANDBOX_GREENHILLS' ? '#dcfce7' : '#f3e8ff'),
                                 color: (w.branch === 'SANDBOX_EAST' ? '#1e40af' : w.branch === 'SANDBOX_GREENHILLS' ? '#166534' : '#7e22ce') }}>
                        {w.branch === 'SANDBOX_EAST' ? 'East' : w.branch === 'SANDBOX_GREENHILLS' ? 'GH' : 'All'}
                      </span>
                    </td>
                    {walletTypeFilter === 'HMO' ? (
                      <>
                        <td className="px-5 py-3" style={{ color: 'var(--mid-gray)' }}>{w._count?.packages || 0}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={(e) => { e.stopPropagation(); setShowSOA(w) }}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ color: '#c2410c' }}>
                              Print SOA
                            </button>
                            <button className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                              View
                            </button>
                            {w.isActive !== false && (
                              <button onClick={(e) => { e.stopPropagation(); deleteWallet(w) }}
                                className="p-1.5 rounded-lg hover:bg-red-50" title="Delete HMO Wallet">
                                <Trash2 size={13} className="text-red-500" />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    ) : walletTypeFilter === 'GL' ? (
                      <>
                        <td className="px-5 py-3">
                          {(w as unknown as { attachmentUrl?: string }).attachmentUrl ? (
                            <a href={(w as unknown as { attachmentUrl: string }).attachmentUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()} className="text-xs underline" style={{ color: 'var(--teal)' }}>
                              View File
                            </a>
                          ) : <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>—</span>}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={(e) => { e.stopPropagation(); setShowSOA(w) }}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ color: '#15803d' }}>
                              Print SOA
                            </button>
                            {w.isActive !== false && (
                              <button onClick={(e) => { e.stopPropagation(); deleteWallet(w) }}
                                className="p-1.5 rounded-lg hover:bg-red-50" title="Delete GL Wallet">
                                <Trash2 size={13} className="text-red-500" />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        {['VIP', 'PREPAID_CARD'].includes(walletTypeFilter) && (
                          <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>
                            {w.barcode || '—'}
                          </td>
                        )}
                        <td className="px-5 py-3" style={{ color: 'var(--mid-gray)' }}>{w._count?.packages || 0}</td>
                        {['VIP', 'PREPAID_CARD'].includes(walletTypeFilter) && (
                          <td className="px-5 py-3">
                            <span className="flex items-center gap-1" style={{ color: 'var(--teal)' }}>
                              {['VIP', 'PREPAID_CARD'].includes(w.walletType) ? <><Star size={12} /> {w.rewardPoints || 0}</> : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                            </span>
                          </td>
                        )}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            {['VIP', 'PREPAID_CARD'].includes(w.walletType) && (
                              <button onClick={(e) => { e.stopPropagation(); printCard(w) }}
                                className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ color: '#E8641B' }}>
                                Print Card
                              </button>
                            )}
                            {w.isActive !== false && (
                              <button className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                                View
                              </button>
                            )}
                            {w.isActive !== false && (
                              <button onClick={(e) => { e.stopPropagation(); deleteWallet(w) }}
                                className="p-1.5 rounded-lg hover:bg-red-50" title="Delete">
                                <Trash2 size={13} className="text-red-500" />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
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
            <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {walletTypeFilter === 'HMO' ? 'Add HMO Provider' : walletTypeFilter === 'GL' ? 'Create GL Wallet' : 'Create Digital Wallet'}
            </h3>
            <div className="space-y-3">
              {/* Patient Name — CRM search for patient wallets, plain input for HMO/GL */}
              {walletTypeFilter !== 'HMO' ? (
                <div className="relative">
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Patient Name *</label>
                  <input
                    value={createForm.patientId ? createForm.patientName : crmSearch}
                    onChange={e => {
                      setCrmSearch(e.target.value)
                      setShowCrmDrop(true)
                      if (!e.target.value) setCreateForm({ ...createForm, patientName: '', patientId: '' })
                    }}
                    placeholder="Search patient from CRM..."
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: createForm.patientId ? 'var(--teal)' : 'var(--light-gray)', background: createForm.patientId ? '#f0fdfa' : 'white' }}
                  />
                  {createForm.patientId && (
                    <button type="button" onClick={() => { setCreateForm({ ...createForm, patientName: '', patientId: '' }); setCrmSearch('') }}
                      className="absolute right-2 top-7 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                  )}
                  {showCrmDrop && crmPatients.length > 0 && !createForm.patientId && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                      {crmPatients.slice(0, 8).map((pt: Patient) => (
                        <button key={pt.id} type="button"
                          onClick={() => { setCreateForm({ ...createForm, patientName: pt.name, patientId: pt.id }); setCrmSearch(pt.name); setShowCrmDrop(false) }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                          <span className="font-medium">{pt.name}</span>
                          {pt.email && <span className="text-gray-400 ml-1">— {pt.email}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {crmSearch.length >= 2 && crmPatients.length === 0 && !createForm.patientId && (
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>No patients found — type name manually below</p>
                  )}
                  {/* Allow manual entry if not found in CRM */}
                  {crmSearch.length >= 2 && !createForm.patientId && (
                    <button type="button"
                      onClick={() => { setCreateForm({ ...createForm, patientName: crmSearch, patientId: '' }); setShowCrmDrop(false) }}
                      className="text-xs mt-1 underline" style={{ color: 'var(--teal)' }}>
                      Use "{crmSearch}" as name (not in CRM)
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                    {walletTypeFilter === 'HMO' ? 'HMO Provider Name *' : 'Agency Name *'}
                  </label>
                  <input value={createForm.patientName} onChange={e => setCreateForm({ ...createForm, patientName: e.target.value })}
                    placeholder={walletTypeFilter === 'HMO' ? 'e.g. Intellicare, Avega, Maxicare' : 'e.g. DSWD, PhilHealth'}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                  {walletTypeFilter === 'HMO' || walletTypeFilter === 'GL' ? 'Contact Email' : 'Email'}
                </label>
                <input value={createForm.patientEmail} onChange={e => setCreateForm({ ...createForm, patientEmail: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              {/* Package Service — searchable for PACKAGE wallets */}
              {walletTypeFilter === 'PACKAGE' && (
                <div className="relative">
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Package Service *</label>
                  <input
                    value={createPkgSelected ? createPkgSelected.serviceName : createPkgSearch}
                    onChange={e => {
                      setCreatePkgSearch(e.target.value)
                      setShowCreatePkgDrop(true)
                      if (!e.target.value) setCreatePkgSelected(null)
                    }}
                    placeholder="Search package (e.g. 12 Basic Session Package)..."
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: createPkgSelected ? 'var(--teal)' : 'var(--light-gray)', background: createPkgSelected ? '#f0fdfa' : 'white' }}
                  />
                  {createPkgSelected && (
                    <button type="button" onClick={() => { setCreatePkgSelected(null); setCreatePkgSearch('') }}
                      className="absolute right-2 top-7 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                  )}
                  {createPkgSelected && (
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: '#e0e7ff', color: '#3730a3' }}>{createPkgSelected.department}</span>
                      <span style={{ color: 'var(--mid-gray)' }}>{createPkgSelected.totalSessions} sessions</span>
                      <span style={{ color: 'var(--deep-teal)' }}>System price: &#8369;{createPkgSelected.amountPaid.toLocaleString()}</span>
                    </div>
                  )}
                  {createPkgSelected && (
                    <div className="mt-2">
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                        Price During Purchase <span className="font-normal">(override if different from system price)</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>&#8369;</span>
                        <input type="number" min={0} step="0.01"
                          value={createPkgSelected.amountPaid || ''}
                          onChange={e => setCreatePkgSelected({ ...createPkgSelected, amountPaid: parseFloat(e.target.value) || 0 })}
                          className="flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      {createPkgSelected.totalSessions > 0 && createPkgSelected.amountPaid > 0 && (
                        <p className="text-xs mt-1" style={{ color: 'var(--deep-teal)' }}>
                          Per-session rate: &#8369;{(createPkgSelected.amountPaid / createPkgSelected.totalSessions).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  )}
                  {createPkgSelected && (
                    <div className="mt-2">
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                        Sessions Already Used <span className="font-normal">(optional — for migrating existing packages)</span>
                      </label>
                      <input type="number" min={0} max={createPkgSelected.totalSessions - 1} step="1"
                        value={createPkgSelected.usedSessions || ''}
                        onChange={e => setCreatePkgSelected({ ...createPkgSelected, usedSessions: parseInt(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      {createPkgSelected.usedSessions > 0 && createPkgSelected.totalSessions > 0 && createPkgSelected.amountPaid > 0 && (
                        <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                          Remaining: {createPkgSelected.totalSessions - createPkgSelected.usedSessions} session(s) — Balance: &#8369;{((createPkgSelected.amountPaid / createPkgSelected.totalSessions) * (createPkgSelected.totalSessions - createPkgSelected.usedSessions)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  )}
                  {showCreatePkgDrop && createPkgResults.length > 0 && !createPkgSelected && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                      {createPkgResults.map(s => (
                        <button key={s.id} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                          onClick={() => {
                            setCreatePkgSelected({ serviceId: s.id, serviceName: s.name, department: s.department, totalSessions: s.packageSessions || 1, amountPaid: s.price || 0, usedSessions: 0 })
                            setCreatePkgSearch(s.name)
                            setShowCreatePkgDrop(false)
                          }}>
                          <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{s.name}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#e0e7ff', color: '#3730a3' }}>{s.department}</span>
                            {s.packageSessions && <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{s.packageSessions}s</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* COA Account for HMO — Accounts Receivable classification (GL auto-uses 1010) */}
              {walletTypeFilter === 'HMO' && (
                <div className="relative">
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                    Chart of Account <span className="font-normal">(Accounts Receivable)</span>
                  </label>
                  <input type="text" value={createAccountSearch}
                    onChange={e => { setCreateAccountSearch(e.target.value); if (!e.target.value) setCreateForm({ ...createForm, accountId: '' }) }}
                    placeholder="Search account..."
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: createForm.accountId ? 'var(--teal)' : 'var(--light-gray)', background: createForm.accountId ? '#f0fdfa' : 'white' }} />
                  {createForm.accountId && (
                    <button type="button" onClick={() => { setCreateForm({ ...createForm, accountId: '' }); setCreateAccountSearch('') }}
                      className="absolute right-2 top-7 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                  )}
                  {createAccountSearch && !createForm.accountId && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-36 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                      {arAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(createAccountSearch.toLowerCase())).slice(0, 8).map(a => (
                        <button key={a.id} type="button" onClick={() => { setCreateForm({ ...createForm, accountId: a.id }); setCreateAccountSearch(`${a.accountNumber} ${a.accountTitle}`) }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                          <span className="font-mono font-medium" style={{ color: 'var(--teal)' }}>{a.accountNumber}</span> {a.accountTitle}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Date Obtained */}
              {walletTypeFilter !== 'HMO' && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date Obtained</label>
                  <input type="date" value={createForm.dateObtained}
                    onChange={e => setCreateForm({ ...createForm, dateObtained: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              )}
              {/* Form of Payment (not for HMO or GL — GL is recorded as AR) */}
              {walletTypeFilter !== 'HMO' && walletTypeFilter !== 'GL' && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Form of Payment</label>
                  <select value={createForm.paymentModeId}
                    onChange={e => setCreateForm({ ...createForm, paymentModeId: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="">— Select payment mode —</option>
                    {walletPaymentModes.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Initial Balance — for migration of existing wallets (VIP/Prepaid only; PACKAGE uses sessions already used instead) */}
              {walletTypeFilter !== 'HMO' && walletTypeFilter !== 'GL' && walletTypeFilter !== 'PACKAGE' && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Initial Balance <span className="font-normal">(optional — for migrating existing wallets)</span></label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>&#8369;</span>
                    <input type="number" min={0} step="0.01" value={createForm.glAmount || ''}
                      onChange={e => setCreateForm({ ...createForm, glAmount: e.target.value })}
                      placeholder="0.00"
                      className="flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                </div>
              )}
              {/* Initial Reward Points — for VIP wallet migration */}
              {walletTypeFilter === 'VIP' && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Initial Reward Points <span className="font-normal">(optional — for migrating existing wallets)</span></label>
                  <input type="number" min={0} step="1" value={createForm.initialRewardPoints || ''}
                    onChange={e => setCreateForm({ ...createForm, initialRewardPoints: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              )}
              {/* GL-specific: Agency, Amount and Attachment */}
              {walletTypeFilter === 'GL' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Agency *</label>
                    <input value={createForm.agency} onChange={e => setCreateForm({ ...createForm, agency: e.target.value })}
                      placeholder="e.g. DSWD, PhilHealth, OWWA, GSIS"
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>The issuing agency of this Guarantee Letter</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Total GL Amount (Accounts Receivable) *</label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>&#8369;</span>
                      <input type="number" min={0} step="0.01" value={createForm.totalGlAmount || ''}
                        onChange={e => setCreateForm({ ...createForm, totalGlAmount: e.target.value })}
                        placeholder="e.g. 10000"
                        className="flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Full approved amount — this goes into Accounts Receivable</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Remaining Balance (Usable Amount)</label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>&#8369;</span>
                      <input type="number" min={0} step="0.01" value={createForm.glAmount || ''}
                        onChange={e => setCreateForm({ ...createForm, glAmount: e.target.value })}
                        placeholder="e.g. 5000"
                        className="flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Amount still available to use (may be less than Total GL Amount if partially used)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Attach Proof of GL</label>
                    <div className="flex items-center gap-2">
                      {createForm.attachmentUrl ? (
                        <>
                          <a href={createForm.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: 'var(--teal)' }}>
                            File uploaded
                          </a>
                          <button type="button" onClick={() => setCreateForm({ ...createForm, attachmentUrl: '' })}
                            className="p-1 rounded hover:bg-red-50"><X size={12} className="text-red-400" /></button>
                        </>
                      ) : (
                        <label className="px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                          Upload File
                          <input type="file" accept="image/*,.pdf" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const formData = new FormData()
                            formData.append('file', file)
                            try {
                              const res = await fetch('/api/upload', { method: 'POST', body: formData })
                              const data = await res.json()
                              if (data.url) setCreateForm({ ...createForm, attachmentUrl: data.url })
                            } catch { setCreateError('File upload failed') }
                          }} />
                        </label>
                      )}
                    </div>
                  </div>
                </>
              )}
              {/* Branch Assignment */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch</label>
                <select value={createForm.branch} onChange={e => setCreateForm({ ...createForm, branch: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="ALL">All Branches</option>
                  <option value="SANDBOX_EAST">Sandbox East</option>
                  <option value="SANDBOX_GREENHILLS">Sandbox Greenhills</option>
                </select>
              </div>
              {createError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{createError}</p>}
              <button onClick={createWallet} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
                {walletTypeFilter === 'HMO' ? 'Add HMO' : walletTypeFilter === 'GL' ? 'Create GL Wallet' : 'Create Wallet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Detail Modal */}
      {selectedWallet && walletDetail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-2xl mb-8 relative">
            <div className="absolute top-4 right-4 flex items-center gap-1">
              {!walletEditing && (
                <button onClick={startWalletEdit} className="p-1.5 rounded-lg hover:bg-gray-100" title="Edit wallet">
                  <Pencil size={16} style={{ color: 'var(--teal)' }} />
                </button>
              )}
              <button onClick={() => { setSelectedWallet(null); setWalletDetail(null); setWalletEditing(false) }} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>

            {walletEditing ? (
              <div className="mb-4 space-y-3">
                <h4 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Edit Wallet</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="col-span-2">
                    <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Name</label>
                    <input value={walletEditForm.patientName || ''} onChange={e => setWalletEditForm(p => ({ ...p, patientName: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Email</label>
                    <input value={walletEditForm.patientEmail || ''} onChange={e => setWalletEditForm(p => ({ ...p, patientEmail: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Date Obtained</label>
                    <input type="date" value={walletEditForm.dateObtained || ''} onChange={e => setWalletEditForm(p => ({ ...p, dateObtained: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Balance</label>
                    <input type="number" step="0.01" value={walletEditForm.balance || ''} onChange={e => setWalletEditForm(p => ({ ...p, balance: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  {walletDetail.walletType === 'VIP' && (
                    <div>
                      <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>VIP Tier</label>
                      <select value={walletEditForm.vipTier || ''} onChange={e => setWalletEditForm(p => ({ ...p, vipTier: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">None</option>
                        <option value="PLATINUM">Platinum</option>
                        <option value="GOLD">Gold</option>
                        <option value="SILVER">Silver</option>
                      </select>
                    </div>
                  )}
                  {['VIP', 'PREPAID_CARD'].includes(walletDetail.walletType) && (
                    <div>
                      <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Reward Points</label>
                      <input type="number" step="1" value={walletEditForm.rewardPoints || ''} onChange={e => setWalletEditForm(p => ({ ...p, rewardPoints: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  )}
                  {walletDetail.walletType === 'GL' && (
                    <>
                      <div>
                        <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Total GL Amount (AR)</label>
                        <input type="number" step="0.01" value={walletEditForm.totalGlAmount || ''} onChange={e => setWalletEditForm(p => ({ ...p, totalGlAmount: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div>
                        <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Agency</label>
                        <input value={walletEditForm.agency || ''} onChange={e => setWalletEditForm(p => ({ ...p, agency: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div>
                        <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Attachment</label>
                        <div className="flex items-center gap-2">
                          {walletEditForm.attachmentUrl ? (
                            <>
                              <a href={walletEditForm.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: 'var(--teal)' }}>View</a>
                              <button type="button" onClick={() => setWalletEditForm(p => ({ ...p, attachmentUrl: '' }))}
                                className="p-1 rounded hover:bg-red-50"><X size={12} className="text-red-400" /></button>
                            </>
                          ) : (
                            <label className="px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                              Upload
                              <input type="file" accept="image/*,.pdf" className="hidden" onChange={async (ev) => {
                                const file = ev.target.files?.[0]
                                if (!file) return
                                const fd = new FormData(); fd.append('file', file)
                                try { const res = await fetch('/api/upload', { method: 'POST', body: fd }); const d = await res.json(); if (d.url) setWalletEditForm(p => ({ ...p, attachmentUrl: d.url })) } catch {}
                              }} />
                            </label>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                  {walletDetail.walletType === 'HMO' && (
                    <div className="col-span-2">
                      <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Chart of Accounts</label>
                      <select value={walletEditForm.accountId || ''} onChange={e => setWalletEditForm(p => ({ ...p, accountId: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">— None —</option>
                        {arAccounts.map(a => (
                          <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Branch</label>
                    <select value={walletEditForm.branch || 'ALL'} onChange={e => setWalletEditForm(p => ({ ...p, branch: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="ALL">All Branches</option>
                      <option value="SANDBOX_EAST">Sandbox East</option>
                      <option value="SANDBOX_GREENHILLS">Sandbox Greenhills</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={saveWalletEdit} disabled={walletEditSaving}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                    {walletEditSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setWalletEditing(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
            <h3 className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {walletDetail.patientName}
            </h3>
            <div className="flex items-center gap-2 mb-1">
              {(() => {
                const typeBadge = WALLET_TYPE_COLORS[walletDetail.walletType] || { bg: '#f3f4f6', color: '#374151' }
                return (
                  <>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: typeBadge.bg, color: typeBadge.color }}>
                      {WALLET_TYPE_LABELS[walletDetail.walletType] || walletDetail.walletType}
                    </span>
                    {walletDetail.walletType === 'VIP' && walletDetail.vipTier && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: walletDetail.vipTier === 'PLATINUM' ? '#e2e8f0' : walletDetail.vipTier === 'GOLD' ? '#fef3c7' : '#e0e7ff', color: walletDetail.vipTier === 'PLATINUM' ? '#475569' : walletDetail.vipTier === 'GOLD' ? '#92400e' : '#3730a3' }}>
                        {walletDetail.vipTier}
                      </span>
                    )}
                  </>
                )
              })()}
              <span className="text-sm font-semibold" style={{ color: 'var(--deep-teal)' }}>
                Balance: {formatCurrency(toNum(walletDetail.balance))}
              </span>
              {walletDetail.walletType === 'GL' && (walletDetail as unknown as { totalGlAmount?: number }).totalGlAmount != null && (
                <span className="text-sm font-semibold" style={{ color: '#15803d' }}>
                  &nbsp;&middot;&nbsp;Total GL: {formatCurrency(toNum((walletDetail as unknown as { totalGlAmount?: number }).totalGlAmount))}
                </span>
              )}
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
              {walletDetail.patientEmail || 'No email'}
              {walletDetail.dateObtained && <> &middot; Obtained: {formatDate(String(walletDetail.dateObtained))}</>}
              {['VIP', 'PREPAID_CARD'].includes(walletDetail.walletType) && (
                <> &middot; Reward Points: <Star size={10} className="inline" /> {walletDetail.rewardPoints || 0}</>
              )}
              {walletDetail.walletType === 'GL' && walletDetail.agency && <> &middot; Agency: {String(walletDetail.agency)}</>}
            </p>
              </>
            )}

            {/* Barcode — only for VIP and Prepaid Card */}
            {['VIP', 'PREPAID_CARD'].includes(walletDetail.walletType) && (
              <div className="flex items-center gap-4 mb-4 p-3 rounded-xl" style={{ background: 'var(--off-white)' }}>
                <svg ref={barcodeRef} />
                <button onClick={printBarcode} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                  <Printer size={12} /> Print
                </button>
              </div>
            )}

            {/* Packages — hidden for HMO/GL wallets */}
            {!['HMO', 'GL'].includes(walletDetail.walletType) && (<>
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
                          <p className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                            {pkg.serviceName}
                            {pkg.department && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#fce7f3', color: '#be185d' }}>
                                {pkg.department}
                              </span>
                            )}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                            {pkg.usedSessions}/{pkg.totalSessions} used &middot; {remaining} remaining
                            &middot; Paid: {formatCurrency(toNum(pkg.amountPaid))}
                            &middot; <span style={{ color: 'var(--deep-teal)' }}>{formatCurrency(toNum(pkg.amountPaid) / pkg.totalSessions)}/session</span>
                            {pkg.expiresAt && <> &middot; Expires: {formatDate(pkg.expiresAt)}</>}
                          </p>
                          {expired && <span className="text-xs text-red-600">Expired</span>}
                        </div>
                        <button
                          onClick={() => deductSession(pkg.id, pkg.serviceName, toNum(pkg.amountPaid), pkg.totalSessions)}
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
                <div className="relative">
                  <input
                    value={pkgForm.serviceId ? pkgForm.serviceName : pkgServiceSearch}
                    onChange={e => {
                      setPkgServiceSearch(e.target.value)
                      setShowPkgServiceDrop(true)
                      if (!e.target.value) setPkgForm({ ...pkgForm, serviceName: '', serviceId: '', department: '' })
                    }}
                    placeholder="Search package service..."
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: pkgForm.serviceId ? 'var(--teal)' : 'var(--light-gray)', background: pkgForm.serviceId ? '#f0fdfa' : 'white' }}
                  />
                  {pkgForm.serviceId && (
                    <button type="button" onClick={() => { setPkgForm({ ...pkgForm, serviceName: '', serviceId: '', department: '', totalSessions: 1, amountPaid: 0 }); setPkgServiceSearch('') }}
                      className="absolute right-2 top-2 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                  )}
                  {showPkgServiceDrop && pkgServiceResults.length > 0 && !pkgForm.serviceId && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                      {pkgServiceResults.map(s => (
                        <button key={s.id} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                          onClick={() => {
                            setPkgForm({ ...pkgForm, serviceName: s.name, serviceId: s.id, department: s.department, totalSessions: s.packageSessions || 1, amountPaid: s.price || 0 })
                            setPkgServiceSearch(s.name)
                            setShowPkgServiceDrop(false)
                          }}>
                          <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{s.name}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#e0e7ff', color: '#3730a3' }}>{s.department}</span>
                            {s.packageSessions && <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{s.packageSessions} sessions</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                {pkgForm.totalSessions > 0 && pkgForm.amountPaid > 0 && (
                  <p className="text-xs" style={{ color: 'var(--deep-teal)' }}>
                    Per-session rate: &#8369;{(pkgForm.amountPaid / pkgForm.totalSessions).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
                <div className="flex gap-2">
                  <button onClick={addPackage} className="px-4 py-2 rounded-xl text-sm text-white font-medium" style={{ background: 'var(--teal)' }}>Add</button>
                  <button onClick={() => setShowAddPackage(false)} className="px-4 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
                </div>
              </div>
            )}
            </>)}

            {/* Wallet Logs */}
            <div>
              {['HMO', 'GL'].includes(walletDetail.walletType) ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Transactions</h4>
                    <a href={`/accounts-receivable?type=${walletDetail.walletType}&wallet=${walletDetail.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                      See Accounts Receivables
                    </a>
                  </div>
                  {(walletDetail as unknown as { orders?: { id: string; orderNumber: number; transactionDate: string; patientName: string; clinicianName: string; items: { name: string }[]; payments: { method: string; amount: string | number; walletId?: string }[] }[] }).orders?.length ? (
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'var(--off-white)' }}>
                            {['Date', 'Patient', 'Clinician', 'Service', 'Amount', 'Status'].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {((walletDetail as unknown as { orders?: { id: string; orderNumber: number; transactionDate: string; patientName: string; clinicianName: string; items: { name: string }[]; payments: { method: string; amount: string | number; walletId?: string }[]; arPaymentItems?: { paymentId: string }[] }[] }).orders || []).map(o => {
                            const pay = o.payments.find(p => p.walletId === walletDetail.id)
                            const isPaid = (o.arPaymentItems || []).length > 0
                            return (
                              <tr key={o.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{formatDate(o.transactionDate)}</td>
                                <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{o.patientName || '—'}</td>
                                <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{formatClinicianName(o.clinicianName)}</td>
                                <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{o.items.map(it => it.name).join(', ')}</td>
                                <td className="px-3 py-2 font-semibold text-right" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(pay ? toNum(pay.amount) : 0)}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                    style={isPaid ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                                    {isPaid ? 'Paid' : 'Unpaid'}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#f0fdf4' }}>
                            <td colSpan={5} className="px-3 py-2 text-right font-bold text-xs">TOTAL RECEIVABLE</td>
                            <td className="px-3 py-2 text-right font-bold text-sm" style={{ color: '#166534' }}>
                              {formatCurrency(((walletDetail as unknown as { orders?: { payments: { amount: string | number; walletId?: string }[]; arPaymentItems?: { paymentId: string }[] }[] }).orders || []).filter(o => !(o.arPaymentItems || []).length).reduce((s, o) => {
                                const pay = o.payments.find(p => p.walletId === walletDetail.id)
                                return s + (pay ? toNum(pay.amount) : 0)
                              }, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No transactions yet.</p>
                  )}
                </>
              ) : (
                <>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Activity Logs</h4>
              {(() => {
                const isRewardEligible = ['VIP', 'PREPAID_CARD'].includes(walletDetail.walletType)
                const headers = isRewardEligible ? ['Date', 'Action', 'Description', 'Sessions', 'Points'] : ['Date', 'Action', 'Description', 'Sessions']
                const logs = (walletDetail.logs || []).filter(log => !isRewardEligible ? log.action !== 'REWARD_EARN' : true)
                return logs.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No activity yet.</p>
                ) : (
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'var(--off-white)' }}>
                          {headers.map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map(log => {
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
                              {isRewardEligible && (
                                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{log.pointsChange ? `${log.pointsChange > 0 ? '+' : ''}${log.pointsChange}` : '—'}</td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* SOA Modal for HMO/GL */}
      {showSOA && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-2xl mb-8 relative">
            <button onClick={() => { setShowSOA(null); setSoaOrders([]) }} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>
            <h3 className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Statement of Account
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>
              {showSOA.walletType === 'HMO' ? 'HMO' : 'GL'}: <strong>{showSOA.patientName}</strong>
            </p>

            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>From</label>
                <input type="date" value={soaDateFrom} onChange={e => setSoaDateFrom(e.target.value)}
                  className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>To</label>
                <input type="date" value={soaDateTo} onChange={e => setSoaDateTo(e.target.value)}
                  className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch</label>
                <select value={soaBranch} onChange={e => setSoaBranch(e.target.value)}
                  className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                  {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
              <button onClick={fetchSOAOrders} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--teal)' }}>
                Generate
              </button>
            </div>

            {soaOrders.length > 0 && (
              <>
                <div className="rounded-xl border overflow-hidden mb-4" style={{ borderColor: 'var(--light-gray)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--off-white)' }}>
                        {['Date', 'Service', 'Patient', 'Clinician', 'Amount'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {soaOrders.map(o => {
                        const p = o.payments.find(p => p.method === showSOA.walletType && p.reference?.trim().toLowerCase() === showSOA.patientName.toLowerCase())
                        return (
                          <tr key={o.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                            <td className="px-3 py-2">{formatDate(o.transactionDate)}</td>
                            <td className="px-3 py-2">{o.items.map(it => it.name).join(', ')}</td>
                            <td className="px-3 py-2">{o.patientName || '—'}</td>
                            <td className="px-3 py-2">{formatClinicianName(o.clinicianName)}</td>
                            <td className="px-3 py-2 font-semibold text-right">{formatCurrency(p ? toNum(p.amount) : 0)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f0fdf4' }}>
                        <td colSpan={4} className="px-3 py-2 text-right font-bold text-xs">TOTAL RECEIVABLE</td>
                        <td className="px-3 py-2 text-right font-bold text-sm" style={{ color: '#166534' }}>
                          {formatCurrency(soaOrders.reduce((s, o) => {
                            const p = o.payments.find(p => p.method === showSOA.walletType && p.reference?.trim().toLowerCase() === showSOA.patientName.toLowerCase())
                            return s + (p ? toNum(p.amount) : 0)
                          }, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <button onClick={printSOA} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--teal)' }}>
                  <Printer size={14} /> Print Statement of Account
                </button>
              </>
            )}
            {soaOrders.length === 0 && (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--mid-gray)' }}>Select date range and branch, then click Generate.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   DISCOUNT SETTINGS PANEL
   ══════════════════════════════════════════════════════════════ */

interface WalletDiscountRuleItem {
  serviceId?: string | null
  department?: string | null
  discountPercent: number
  service?: { name: string } | null
}

interface DiscountSettingFull {
  id: string
  name: string
  type: string
  value: string | number
  branch?: string | null
  walletType?: string | null
  accountId?: string | null
  account?: { id: string; accountNumber: string; accountTitle: string } | null
  isActive?: boolean
  rules?: WalletDiscountRuleItem[]
  [key: string]: unknown
}

function DiscountSettingsPanel() {
  const [settings, setSettings] = useState<DiscountSettingFull[]>([])
  const [services, setServices] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', type: 'PERCENTAGE' as string, value: 0, branch: '', walletType: '', accountId: '',
  })
  const [accountSearch, setAccountSearch] = useState('')
  const [discountAccounts, setDiscountAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string; normalBalance: string }[]>([])
  const [rules, setRules] = useState<{ serviceId: string; department: string; discountPercent: number }[]>([])
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [dsRes, svcRes] = await Promise.all([
        fetch('/api/pos/discount-settings'),
        fetch('/api/services?all=true'),
      ])
      const dsData = await dsRes.json()
      const svcData = await svcRes.json()
      setSettings(normalize(dsData) as DiscountSettingFull[])
      setServices(normalize(svcData) as ServiceItem[])
    } catch {
      setSettings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Fetch REVENUE accounts with DEBIT normal balance (contra-revenue / discount accounts)
  useEffect(() => {
    fetch('/api/chart-of-accounts?accountType=REVENUE&pageSize=500')
      .then(r => r.json())
      .then(d => setDiscountAccounts(
        (d.data || [])
          .filter((a: { normalBalance: string }) => a.normalBalance === 'DEBIT')
          .map((a: { id: string; accountNumber: string; accountTitle: string; normalBalance: string }) => ({
            id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle, normalBalance: a.normalBalance,
          }))
      ))
      .catch(() => {})
  }, [])

  const DEPARTMENTS = ['OT', 'SLP', 'PT', 'SPED', 'PSYCHOLOGY', 'MD']

  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', type: 'PERCENTAGE', value: 0, branch: '', walletType: '', accountId: '' })
    setAccountSearch('')
    setRules([])
    setShowForm(true)
    setError('')
  }

  const openEdit = (ds: DiscountSettingFull) => {
    setEditingId(ds.id)
    setForm({
      name: ds.name,
      type: ds.type,
      value: toNum(ds.value),
      branch: ds.branch || '',
      walletType: ds.walletType || '',
      accountId: ds.accountId || '',
    })
    setAccountSearch(ds.account ? `${ds.account.accountNumber} ${ds.account.accountTitle}` : '')
    setRules((ds.rules || []).map(r => ({
      serviceId: r.serviceId || '',
      department: r.department || '',
      discountPercent: toNum(r.discountPercent),
    })))
    setShowForm(true)
    setError('')
  }

  const saveDiscount = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setError('')
    try {
      const body = {
        ...form,
        walletType: form.walletType || null,
        branch: form.branch || null,
        accountId: form.accountId || null,
        rules: rules.filter(r => r.discountPercent > 0 && (r.serviceId || r.department)),
      }

      let res: Response
      if (editingId) {
        res = await fetch('/api/pos/discount-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...body }),
        })
      } else {
        res = await fetch('/api/pos/discount-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      if (res.ok) {
        setShowForm(false)
        fetchData()
      } else {
        const d = await res.json()
        setError(d.error || 'Failed to save')
      }
    } catch {
      setError('Failed to save')
    }
  }

  const deleteDiscount = async (id: string) => {
    if (!window.confirm('Remove this discount setting?')) return
    await fetch('/api/pos/discount-settings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchData()
  }

  const addRule = () => {
    setRules(prev => [...prev, { serviceId: '', department: '', discountPercent: 0 }])
  }

  const walletSettings = settings.filter(s => s.walletType)
  const generalSettings = settings.filter(s => !s.walletType)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Discount Settings</h3>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--teal)' }}>
          <Plus size={16} /> New Discount
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
      ) : (
        <>
          {/* General Discounts */}
          <div className="rounded-2xl border bg-white p-4 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>General Discounts</h4>
            {generalSettings.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No general discounts configured.</p>
            ) : generalSettings.map(ds => (
              <div key={ds.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--off-white)' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{ds.name}</p>
                  <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                    {ds.type === 'PERCENTAGE' ? `${toNum(ds.value)}%` : formatCurrency(toNum(ds.value))} off
                    {ds.branch ? ` · ${ds.branch}` : ''}
                  </p>
                  {ds.account && (
                    <p className="text-xs" style={{ color: 'var(--teal)' }}>{ds.account.accountNumber} {ds.account.accountTitle}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(ds)} className="p-1.5 rounded-lg hover:bg-blue-50"><FileText size={13} className="text-blue-600" /></button>
                  <button onClick={() => deleteDiscount(ds.id)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} className="text-red-500" /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Wallet-Linked Discounts (VIP, Prepaid, etc.) */}
          <div className="rounded-2xl border bg-white p-4 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
              Wallet-Linked Discounts (VIP / Prepaid Card / Package)
            </h4>
            {walletSettings.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No wallet-linked discounts. Create one to auto-apply discounts when a VIP/Prepaid card is used at checkout.</p>
            ) : walletSettings.map(ds => {
              const typeBadge = WALLET_TYPE_COLORS[ds.walletType || ''] || { bg: '#f3f4f6', color: '#374151' }
              return (
                <div key={ds.id} className="p-3 rounded-xl border space-y-2" style={{ borderColor: 'var(--light-gray)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: typeBadge.bg, color: typeBadge.color }}>
                        {WALLET_TYPE_LABELS[ds.walletType || ''] || ds.walletType}
                      </span>
                      <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{ds.name}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(ds)} className="p-1.5 rounded-lg hover:bg-blue-50"><FileText size={13} className="text-blue-600" /></button>
                      <button onClick={() => deleteDiscount(ds.id)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} className="text-red-500" /></button>
                    </div>
                  </div>
                  {(ds.rules || []).length > 0 && (
                    <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'var(--off-white)' }}>
                            <th className="px-3 py-1.5 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>Service / Department</th>
                            <th className="px-3 py-1.5 text-right font-semibold" style={{ color: 'var(--mid-gray)' }}>Discount %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(ds.rules || []).map((r, idx) => (
                            <tr key={idx} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                              <td className="px-3 py-1.5" style={{ color: 'var(--charcoal)' }}>
                                {r.service?.name || r.department || 'All services'}
                              </td>
                              <td className="px-3 py-1.5 text-right font-semibold" style={{ color: 'var(--deep-teal)' }}>
                                {toNum(r.discountPercent)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-2xl mb-8 relative">
            <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>
            <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {editingId ? 'Edit Discount' : 'New Discount'}
            </h3>

            {error && <p className="text-xs text-red-600 mb-3 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Discount Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. VIP Gold Card Discount"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED">Fixed Amount</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Default Value</label>
                  <input type="number" min={0} step="0.01" value={form.value || ''} onChange={e => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                  Link to Wallet Type <span className="font-normal">(leave empty for general discount)</span>
                </label>
                <select value={form.walletType} onChange={e => setForm({ ...form, walletType: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">None — General Discount</option>
                  {WALLET_TYPES.map(wt => <option key={wt.value} value={wt.value}>{wt.label}</option>)}
                </select>
              </div>

              {/* COA Account — searchable (contra-revenue accounts with DEBIT normal balance) */}
              <div className="relative">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                  Chart of Account <span className="font-normal">(Debit normal balance — discount/contra-revenue)</span>
                </label>
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => { setAccountSearch(e.target.value); if (!e.target.value) setForm({ ...form, accountId: '' }) }}
                  placeholder="Search discount account..."
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: form.accountId ? 'var(--teal)' : 'var(--light-gray)', background: form.accountId ? '#f0fdfa' : 'white' }}
                />
                {form.accountId && (
                  <button type="button" onClick={() => { setForm({ ...form, accountId: '' }); setAccountSearch('') }}
                    className="absolute right-2 top-7 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                )}
                {accountSearch && !form.accountId && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                    {discountAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(accountSearch.toLowerCase())).slice(0, 10).map(a => (
                      <button key={a.id} type="button" onClick={() => { setForm({ ...form, accountId: a.id }); setAccountSearch(`${a.accountNumber} ${a.accountTitle}`) }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                        <span className="font-mono font-medium" style={{ color: 'var(--teal)' }}>{a.accountNumber}</span> {a.accountTitle}
                      </button>
                    ))}
                    {discountAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(accountSearch.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>No matching accounts (must be REVENUE with DEBIT normal balance)</p>
                    )}
                  </div>
                )}
              </div>

              {/* Per-Service / Per-Department Discount Rules */}
              {form.walletType && (
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: '#FFBA6B', background: '#FFF8F0' }}>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#ED6823' }}>
                      Service-Specific Discount Rules
                    </h4>
                    <button onClick={addRule} className="text-xs font-medium px-3 py-1 rounded-lg" style={{ background: '#FFF0E6', color: '#ED6823' }}>
                      + Add Rule
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: '#6b21a8' }}>
                    Specify different discount percentages per service or department. When this wallet is used at checkout, these rules will override the default discount.
                  </p>
                  {rules.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No specific rules — the default {form.type === 'PERCENTAGE' ? `${form.value}%` : formatCurrency(form.value)} will apply to all services.</p>
                  ) : rules.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-white">
                      <select value={r.department} onChange={e => setRules(prev => prev.map((x, i) => i === idx ? { ...x, department: e.target.value, serviceId: '' } : x))}
                        className="px-2 py-1.5 rounded-lg border text-xs outline-none flex-1" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">All Departments</option>
                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>or</span>
                      <select value={r.serviceId} onChange={e => setRules(prev => prev.map((x, i) => i === idx ? { ...x, serviceId: e.target.value, department: '' } : x))}
                        className="px-2 py-1.5 rounded-lg border text-xs outline-none flex-1" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">Specific Service</option>
                        {services.filter(s => !r.department || s.department === r.department).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <input type="number" min={0} max={100} step="0.1" value={r.discountPercent || ''}
                        onChange={e => setRules(prev => prev.map((x, i) => i === idx ? { ...x, discountPercent: parseFloat(e.target.value) || 0 } : x))}
                        placeholder="%" className="w-20 px-2 py-1.5 rounded-lg border text-xs text-right outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>%</span>
                      <button onClick={() => setRules(prev => prev.filter((_, i) => i !== idx))} className="p-1 rounded hover:bg-red-50">
                        <Trash2 size={12} className="text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={saveDiscount} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
                  {editingId ? 'Update Discount' : 'Create Discount'}
                </button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                  Cancel
                </button>
              </div>
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
  const [appliedDiscounts, setAppliedDiscounts] = useState<{ label: string; type: 'PERCENTAGE' | 'FIXED'; value: number; remarks?: string }[]>([])
  const [showAddDiscount, setShowAddDiscount] = useState(false)
  const [newDiscountType, setNewDiscountType] = useState<'preset' | 'pwd' | 'custom'>('preset')
  const [newDiscountPresetId, setNewDiscountPresetId] = useState('')
  const [newDiscountAmt, setNewDiscountAmt] = useState(0)
  const [newDiscountAmtType, setNewDiscountAmtType] = useState<'PERCENTAGE' | 'FIXED'>('FIXED')
  const [newDiscountRemarks, setNewDiscountRemarks] = useState('')
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: 'CASH', amount: 0 }])
  const [configuredModes, setConfiguredModes] = useState<PaymentModeType[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [prodIssuedInvoice, setProdIssuedInvoice] = useState(false)
  const [prodInvoiceNumber, setProdInvoiceNumber] = useState('')
  const [prodReferenceNumber, setProdReferenceNumber] = useState('')
  const [prodNotes, setProdNotes] = useState('')
  // Reward points wallet state
  const [rpWalletSearch, setRpWalletSearch] = useState('')
  const [rpWalletResults, setRpWalletResults] = useState<DigitalWallet[]>([])
  const [rpSelectedWallet, setRpSelectedWallet] = useState<DigitalWallet | null>(null)
  const [rpBarcode, setRpBarcode] = useState('')
  const rpBarcodeRef = useRef<HTMLInputElement>(null)

  // Check if any payment is reward points
  const hasRewardPointsPayment = payments.some(p => p.method === 'REWARD_POINTS')

  useEffect(() => {
    fetch('/api/pos/payment-modes?branch=VERDANA_STORE').then(r => r.json()).then(d => setConfiguredModes(Array.isArray(d) ? d.filter((m: PaymentModeType) => m.isActive) : [])).catch(() => {})
  }, [])

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
    (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase())) ||
    (p.barcode && p.barcode.toLowerCase().includes(productSearch.toLowerCase()))
  )

  const addToCart = (p: InventoryProduct) => {
    const existing = cart.findIndex(c => c.inventoryItemId === p.id)
    if (existing >= 0) {
      setCart(prev => prev.map((c, i) => i === existing ? { ...c, quantity: c.quantity + 1, lineTotal: c.unitPrice * (c.quantity + 1) } : c))
    } else {
      const price = toNum(p.sellingPrice)
      setCart(prev => [...prev, { inventoryItemId: p.id, name: p.name, quantity: 1, unitPrice: price, lineTotal: price }])
    }
  }

  const updateCartQty = (idx: number, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter((_, i) => i !== idx)); return }
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, quantity: qty, lineTotal: c.unitPrice * qty } : c))
  }

  const subtotal = cart.reduce((s, c) => s + c.lineTotal, 0)

  // Calculate stacked discounts — each discount applied to original subtotal
  let discountAmount = 0
  const discountLabels: string[] = []
  appliedDiscounts.forEach(d => {
    const amt = d.type === 'PERCENTAGE' ? subtotal * (d.value / 100) : d.value
    discountAmount += amt
    discountLabels.push(`${d.label}${d.remarks ? ` (${d.remarks})` : ''}`)
  })
  const discountType = appliedDiscounts.length > 0 ? 'CUSTOM' : 'NONE'
  const discountLabel = discountLabels.join(' + ')

  const addDiscount = () => {
    if (newDiscountType === 'pwd') {
      if (appliedDiscounts.some(d => d.label === 'PWD/Senior Citizen')) return
      setAppliedDiscounts(prev => [...prev, { label: 'PWD/Senior Citizen', type: 'PERCENTAGE', value: 20 }])
    } else if (newDiscountType === 'preset' && newDiscountPresetId) {
      const ds = discountSettings.find(d => d.id === newDiscountPresetId)
      if (ds) {
        setAppliedDiscounts(prev => [...prev, { label: ds.name, type: ds.type as 'PERCENTAGE' | 'FIXED', value: toNum(ds.value) }])
      }
    } else if (newDiscountType === 'custom' && newDiscountAmt > 0) {
      setAppliedDiscounts(prev => [...prev, {
        label: 'Custom',
        type: newDiscountAmtType,
        value: newDiscountAmt,
        remarks: newDiscountRemarks.trim() || undefined,
      }])
    }
    setShowAddDiscount(false)
    setNewDiscountPresetId('')
    setNewDiscountAmt(0)
    setNewDiscountRemarks('')
  }

  const netAmount = Math.max(0, subtotal - discountAmount)
  const totalPayments = payments.reduce((s, p) => s + toNum(p.amount), 0)

  // Calculate reward points total for cart items
  const rewardPointsTotal = cart.reduce((s, c) => {
    const prod = products.find(p => p.id === c.inventoryItemId)
    return s + (prod?.rewardPointsPrice || 0) * c.quantity
  }, 0)

  // Wallet search for reward points
  const searchRpWallets = async (q: string) => {
    setRpWalletSearch(q)
    if (q.length < 2) { setRpWalletResults([]); return }
    try {
      // Fetch VIP wallets first, then PREPAID_CARD, merge results
      const branchParam = !isAdmin(session) ? `&branch=${encodeURIComponent(userBranch(session))}` : ''
      const [rVip, rPrepaid] = await Promise.all([
        fetch(`/api/pos/wallets?search=${encodeURIComponent(q)}&walletType=VIP${branchParam}`),
        fetch(`/api/pos/wallets?search=${encodeURIComponent(q)}&walletType=PREPAID_CARD${branchParam}`),
      ])
      const [dVip, dPrepaid] = await Promise.all([rVip.json(), rPrepaid.json()])
      const combined = [...(normalize(dVip) as DigitalWallet[]), ...(normalize(dPrepaid) as DigitalWallet[])]
      setRpWalletResults(combined)
    } catch { setRpWalletResults([]) }
  }

  const scanRpBarcode = async () => {
    if (!rpBarcode.trim()) return
    try {
      const r = await fetch(`/api/pos/wallets/scan/${encodeURIComponent(rpBarcode.trim())}`)
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      setRpSelectedWallet(d)
      setRpBarcode('')
    } catch { setError('Failed to scan barcode') }
  }

  // Reward points partial coverage calculation
  const rpWalletPoints = rpSelectedWallet?.rewardPoints || 0
  const rpPointsToUse = hasRewardPointsPayment ? Math.min(rpWalletPoints, rewardPointsTotal) : 0
  const rpCoveragePercent = rewardPointsTotal > 0 ? rpPointsToUse / rewardPointsTotal : 0
  const rpMonetaryValue = netAmount * rpCoveragePercent // how much the points cover in Php
  const rpRemainingBalance = netAmount - rpMonetaryValue // how much the customer still needs to pay
  const otherPaymentsTotal = payments.filter(p => p.method !== 'REWARD_POINTS').reduce((s, p) => s + toNum(p.amount), 0)

  const handleSubmit = async () => {
    if (cart.length === 0) { setError('Add at least one product'); return }
    // For reward points payment, check wallet is selected
    if (hasRewardPointsPayment) {
      if (!rpSelectedWallet) { setError('Please scan or search a wallet for reward points payment'); return }
      // If partial coverage, other payments must cover the remaining balance
      if (rpCoveragePercent < 1 && otherPaymentsTotal < rpRemainingBalance - 0.01) {
        setError(`Reward points cover ${(rpCoveragePercent * 100).toFixed(0)}% (${formatCurrency(rpMonetaryValue)}). Remaining ${formatCurrency(rpRemainingBalance)} must be covered by other payments.`)
        return
      }
    }
    if (!hasRewardPointsPayment && totalPayments < netAmount) { setError('Payments do not cover the net amount'); return }
    setSubmitting(true)
    setError('')
    try {
      const body = {
        orderType: 'PRODUCT',
        branch: 'VERDANA_STORE',
        transactionDate: txDate,
        items: cart.map(c => ({
          inventoryItemId: c.inventoryItemId || null,
          name: c.name,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          lineTotal: c.lineTotal,
        })),
        payments: payments.filter(p => toNum(p.amount) > 0 || p.method === 'REWARD_POINTS').map(p => ({
          method: p.method,
          paymentModeId: p.paymentModeId || null,
          amount: p.method === 'REWARD_POINTS' ? rpMonetaryValue : toNum(p.amount),
          walletId: p.method === 'REWARD_POINTS' ? rpSelectedWallet?.id : null,
          reference: p.method === 'REWARD_POINTS' ? `${rpPointsToUse} pts from ${rpSelectedWallet?.patientName}${rpCoveragePercent < 1 ? ` (${(rpCoveragePercent * 100).toFixed(0)}% coverage)` : ''}` : null,
        })),
        discountType,
        discountAmount,
        discountLabel: discountLabel || null,
        issuedOfficialInvoice: prodIssuedInvoice,
        salesInvoiceNumber: prodIssuedInvoice ? prodInvoiceNumber.trim() : null,
        referenceNumber: prodReferenceNumber.trim() || null,
        notes: prodNotes.trim() || null,
      }
      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create order'); setSubmitting(false); return }

      // Deduct reward points from wallet (only the points actually used)
      if (hasRewardPointsPayment && rpSelectedWallet && rpPointsToUse > 0) {
        try {
          await fetch(`/api/pos/wallets/${rpSelectedWallet.id}/deduct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rewardPoints: rpPointsToUse,
              description: `Product purchase: Order #${data.orderNumber} (${rpPointsToUse} pts${rpCoveragePercent < 1 ? `, ${(rpCoveragePercent * 100).toFixed(0)}% coverage` : ''})`,
              orderId: data.id,
            }),
          })
        } catch (e) { console.error('Reward points deduction error:', e) }
      }

      setCart([])
      setPayments([{ method: 'CASH', amount: 0 }])
      setAppliedDiscounts([])
      setRpSelectedWallet(null)
      setRpWalletSearch('')
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

  // Barcode scanner handler
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanSuccess, setScanSuccess] = useState('')
  const [txDate, setTxDate] = useState(today())

  const handleBarcodeScan = (barcode: string) => {
    const trimmed = barcode.trim()
    if (!trimmed) { setError('Please scan or type a barcode/SKU'); return }
    // Try to find product by barcode or SKU (exact or partial match)
    const found = products.find(p =>
      (p.barcode && p.barcode.toLowerCase() === trimmed.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase() === trimmed.toLowerCase())
    )
    if (found) {
      // Directly add to cart without relying on closure
      const price = toNum(found.sellingPrice)
      setCart(prev => {
        const existing = prev.findIndex(c => c.inventoryItemId === found.id)
        if (existing >= 0) {
          return prev.map((c, i) => i === existing ? { ...c, quantity: c.quantity + 1, lineTotal: c.unitPrice * (c.quantity + 1) } : c)
        }
        return [...prev, { inventoryItemId: found.id, name: found.name, quantity: 1, unitPrice: price, lineTotal: price }]
      })
      setBarcodeInput('')
      setScanSuccess(`✓ Added: ${found.name}`)
      setTimeout(() => setScanSuccess(''), 2000)
      // Refocus input for next scan
      barcodeInputRef.current?.focus()
    } else {
      setError(`No product found for barcode: ${trimmed}`)
      setTimeout(() => setError(''), 3000)
      setBarcodeInput('')
      barcodeInputRef.current?.focus()
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Product List */}
      <div className="lg:col-span-2 space-y-4">
        {/* Barcode Scanner Input */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <ScanLine size={14} className="absolute left-3 top-3" style={{ color: 'var(--teal)' }} />
              <input
                ref={barcodeInputRef}
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleBarcodeScan(barcodeInput)
                  }
                }}
                placeholder="Scan barcode or type SKU and press Enter..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm outline-none font-mono"
                style={{ borderColor: 'var(--teal)', background: 'var(--pale-teal)' }}
              />
            </div>
            <button
              type="button"
              onClick={() => handleBarcodeScan(barcodeInput)}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-white flex items-center gap-1.5 shrink-0"
              style={{ background: 'var(--teal)' }}>
              <ScanLine size={14} /> Scan
            </button>
          </div>
          {scanSuccess && (
            <p className="text-xs font-medium px-2 py-1 rounded-lg" style={{ background: '#dcfce7', color: '#166534' }}>{scanSuccess}</p>
          )}
        </div>

        {/* Search */}
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
                  <p className="text-sm font-bold mt-1" style={{ color: 'var(--teal)' }}>{formatCurrency(toNum(p.sellingPrice))}</p>
                  {p.rewardPointsPrice && (
                    <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#92400e' }}>
                      <Star size={10} /> {p.rewardPointsPrice.toLocaleString()} pts
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="space-y-4">
        <div className="rounded-2xl border bg-white p-4 space-y-4" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
              <ShoppingCart size={16} /> Cart ({cart.length})
            </h3>
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--mid-gray)' }}>Date</label>
              <input
                type="date"
                value={txDate}
                onChange={e => setTxDate(e.target.value)}
                className="px-2 py-1 rounded-lg border text-xs outline-none"
                style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
              />
            </div>
          </div>

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

          {/* Discounts (stackable) */}
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Discounts</h4>
              <button onClick={() => setShowAddDiscount(!showAddDiscount)} className="text-xs font-medium" style={{ color: 'var(--teal)' }}>
                + Add Discount
              </button>
            </div>
            {appliedDiscounts.map((d, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs p-1.5 rounded-lg" style={{ background: 'var(--off-white)' }}>
                <span style={{ color: 'var(--charcoal)' }}>
                  {d.label} ({d.type === 'PERCENTAGE' ? `${d.value}%` : formatCurrency(d.value)})
                  {d.remarks && <span className="text-xs font-normal ml-1" style={{ color: 'var(--mid-gray)' }}>— {d.remarks}</span>}
                </span>
                <button onClick={() => setAppliedDiscounts(prev => prev.filter((_, i) => i !== idx))} className="p-0.5 rounded hover:bg-red-50">
                  <X size={12} className="text-red-500" />
                </button>
              </div>
            ))}
            {showAddDiscount && (
              <div className="p-2 rounded-xl border space-y-2" style={{ borderColor: '#93c5fd', background: '#eff6ff' }}>
                <div className="flex gap-1.5">
                  <select value={newDiscountType} onChange={e => setNewDiscountType(e.target.value as 'preset' | 'pwd' | 'custom')}
                    className="px-2 py-1.5 rounded-lg border text-xs outline-none flex-1" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="pwd">PWD / Senior (20%)</option>
                    <option value="preset">Preset Discount</option>
                    <option value="custom">Custom (manual)</option>
                  </select>
                </div>
                {newDiscountType === 'preset' && (
                  <select value={newDiscountPresetId} onChange={e => setNewDiscountPresetId(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="">Select discount...</option>
                    {discountSettings.map(ds => (
                      <option key={ds.id} value={ds.id}>{ds.name}{toNum(ds.value) > 0 ? ` (${ds.type === 'PERCENTAGE' ? `${toNum(ds.value)}%` : formatCurrency(toNum(ds.value))})` : ''}</option>
                    ))}
                  </select>
                )}
                {newDiscountType === 'custom' && (
                  <>
                    <div className="flex gap-1.5">
                      <select value={newDiscountAmtType} onChange={e => setNewDiscountAmtType(e.target.value as 'PERCENTAGE' | 'FIXED')}
                        className="px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="FIXED">₱ Fixed</option>
                        <option value="PERCENTAGE">% Pct</option>
                      </select>
                      <input type="number" min={0} step="0.01" value={newDiscountAmt || ''}
                        onChange={e => setNewDiscountAmt(parseFloat(e.target.value) || 0)}
                        placeholder="Amount" className="flex-1 px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                    <input value={newDiscountRemarks} onChange={e => setNewDiscountRemarks(e.target.value)}
                      placeholder="Remarks / reason" className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </>
                )}
                <button onClick={addDiscount} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                  Apply
                </button>
              </div>
            )}
            {discountAmount > 0 && (
              <p className="text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>
                Total Discount: -{formatCurrency(discountAmount)}
              </p>
            )}
          </div>

          {/* Payment */}
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Payment</h4>
            {payments.map((p, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <select value={p.paymentModeId || p.method} onChange={e => {
                    const val = e.target.value
                    const cm = configuredModes.find(m => m.id === val)
                    if (cm) {
                      setPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, method: cm.paymentMethod || 'CASH', paymentModeId: cm.id } : pp))
                    } else {
                      setPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, method: val, paymentModeId: undefined } : pp))
                    }
                  }}
                  className="px-2 py-2 rounded-xl border text-xs outline-none flex-1" style={{ borderColor: 'var(--light-gray)' }}>
                  {configuredModes.length > 0 ? (
                    <>
                      {configuredModes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      <option value="REWARD_POINTS">Reward Points</option>
                    </>
                  ) : (
                    PAYMENT_METHODS_PRODUCT.map(m => <option key={m.value} value={m.value}>{m.label}</option>)
                  )}
                </select>
                {p.method === 'REWARD_POINTS' ? (
                  <span className="w-28 px-2 py-2 rounded-xl border text-xs text-right flex items-center justify-end gap-1" style={{ borderColor: 'var(--light-gray)', color: '#ED6823', background: '#FFF8F0' }}>
                    <Star size={10} /> {rpPointsToUse.toLocaleString()}/{rewardPointsTotal.toLocaleString()}
                  </span>
                ) : (
                  <input type="number" min={0} step="0.01" value={p.amount || ''} placeholder="Amt"
                    onChange={e => setPayments(prev => prev.map((pp, i) => i === idx ? { ...pp, amount: parseFloat(e.target.value) || 0 } : pp))}
                    className="w-24 px-2 py-2 rounded-xl border text-xs outline-none text-right" style={{ borderColor: 'var(--light-gray)' }} />
                )}
                {payments.length > 1 && (
                  <button onClick={() => { setPayments(prev => prev.filter((_, i) => i !== idx)); if (p.method === 'REWARD_POINTS') setRpSelectedWallet(null) }} className="p-1 rounded hover:bg-red-50">
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

          {/* Reward Points Wallet Selection */}
          {hasRewardPointsPayment && (
            <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: '#FFBA6B', background: '#FFF8F0' }}>
              <h4 className="text-xs font-semibold flex items-center gap-1" style={{ color: '#ED6823' }}>
                <Star size={12} /> Select Wallet for Reward Points
              </h4>
              {rpSelectedWallet ? (
                <div className="flex items-center justify-between p-2 rounded-lg bg-white">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{rpSelectedWallet.patientName}</p>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: WALLET_TYPE_COLORS[rpSelectedWallet.walletType]?.bg || '#f3f4f6', color: WALLET_TYPE_COLORS[rpSelectedWallet.walletType]?.color || '#374151' }}>
                        {WALLET_TYPE_LABELS[rpSelectedWallet.walletType] || rpSelectedWallet.walletType}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {rpSelectedWallet.barcode} &middot; <Star size={10} className="inline" /> {rpSelectedWallet.rewardPoints?.toLocaleString() || 0} pts available
                    </p>
                  </div>
                  <button onClick={() => setRpSelectedWallet(null)} className="text-xs px-2 py-1 rounded-lg" style={{ color: '#ED6823' }}>Change</button>
                </div>
              ) : (
                <>
                  <div className="flex gap-1">
                    <input ref={rpBarcodeRef} value={rpBarcode} onChange={e => setRpBarcode(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && scanRpBarcode()}
                      placeholder="Scan wallet barcode..."
                      className="flex-1 px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    <button onClick={scanRpBarcode} className="px-2 py-1.5 rounded-lg text-xs text-white" style={{ background: 'var(--teal)' }}>
                      <ScanLine size={12} />
                    </button>
                  </div>
                  <input value={rpWalletSearch} onChange={e => searchRpWallets(e.target.value)}
                    placeholder="Or search patient name..."
                    className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  {rpWalletResults.length > 0 && rpWalletResults.map(w => (
                    <button key={w.id} onClick={() => { setRpSelectedWallet(w); setRpWalletResults([]) }}
                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50 flex justify-between items-center rounded-lg">
                      <div>
                        <span className="font-medium">{w.patientName}</span>
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: WALLET_TYPE_COLORS[w.walletType]?.bg || '#f3f4f6', color: WALLET_TYPE_COLORS[w.walletType]?.color || '#374151' }}>
                          {WALLET_TYPE_LABELS[w.walletType] || w.walletType}
                        </span>
                      </div>
                      <span style={{ color: 'var(--mid-gray)' }}><Star size={10} className="inline" /> {w.rewardPoints?.toLocaleString() || 0} pts</span>
                    </button>
                  ))}
                </>
              )}
              {cart.length > 0 && (
                <div className="text-xs font-medium space-y-0.5">
                  <p style={{ color: '#ED6823' }}>
                    Points needed: {rewardPointsTotal.toLocaleString()} pts &middot; Available: {rpSelectedWallet ? rpWalletPoints.toLocaleString() : '—'} pts
                  </p>
                  {rpSelectedWallet && rpWalletPoints < rewardPointsTotal && (
                    <p style={{ color: '#92400e' }}>
                      Using {rpPointsToUse.toLocaleString()} pts = {(rpCoveragePercent * 100).toFixed(0)}% coverage ({formatCurrency(rpMonetaryValue)}).
                      Remaining: <strong>{formatCurrency(rpRemainingBalance)}</strong> — pay via other method.
                    </p>
                  )}
                  {rpSelectedWallet && rpWalletPoints >= rewardPointsTotal && (
                    <p style={{ color: '#166534' }}>Fully covered by reward points!</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Official Sales Invoice */}
          <div className="rounded-xl p-3 border" style={{ borderColor: 'var(--light-gray)' }}>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={prodIssuedInvoice}
                onChange={e => { setProdIssuedInvoice(e.target.checked); if (!e.target.checked) setProdInvoiceNumber('') }}
                className="w-4 h-4 rounded accent-teal-600" />
              <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Issued Official Sales Invoice</span>
            </label>
            {prodIssuedInvoice && (
              <div className="mt-2">
                <input type="text" value={prodInvoiceNumber} onChange={e => setProdInvoiceNumber(e.target.value)}
                  placeholder="Sales Invoice Number" className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
            )}
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Reference Number (optional)</label>
            <input type="text" value={prodReferenceNumber} onChange={e => setProdReferenceNumber(e.target.value)}
              placeholder="e.g. OR-2026-001234" className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Remarks (optional)</label>
            <textarea value={prodNotes} onChange={e => setProdNotes(e.target.value)}
              placeholder="Any notes or remarks for this order..."
              rows={2}
              className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none resize-none"
              style={{ borderColor: 'var(--light-gray)' }} />
          </div>

          {/* Totals */}
          <div className="pt-2 border-t space-y-1" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            {discountAmount > 0 && <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Discount</span><span className="text-red-600">-{formatCurrency(discountAmount)}</span></div>}
            <div className="flex justify-between text-sm font-bold"><span style={{ color: 'var(--charcoal)' }}>Net</span><span style={{ color: 'var(--deep-teal)' }}>{formatCurrency(netAmount)}</span></div>
            {hasRewardPointsPayment && rpSelectedWallet && (
              <>
                <div className="flex justify-between text-xs"><span style={{ color: '#ED6823' }}><Star size={10} className="inline" /> Reward Points ({rpPointsToUse.toLocaleString()} pts)</span><span style={{ color: '#ED6823' }}>{formatCurrency(rpMonetaryValue)}</span></div>
                {rpCoveragePercent < 1 && (
                  <>
                    <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Remaining Balance</span><span style={{ color: '#991b1b' }}>{formatCurrency(rpRemainingBalance)}</span></div>
                    <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Other Payments</span><span>{formatCurrency(otherPaymentsTotal)}</span></div>
                    {otherPaymentsTotal > rpRemainingBalance && (
                      <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Change</span><span className="text-green-700">{formatCurrency(otherPaymentsTotal - rpRemainingBalance)}</span></div>
                    )}
                  </>
                )}
              </>
            )}
            {hasRewardPointsPayment && !rpSelectedWallet && rewardPointsTotal > 0 && (
              <div className="flex justify-between text-xs"><span style={{ color: '#ED6823' }}><Star size={10} className="inline" /> Points needed</span><span style={{ color: '#ED6823' }}>{rewardPointsTotal.toLocaleString()} pts</span></div>
            )}
            {!hasRewardPointsPayment && <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Paid</span><span>{formatCurrency(totalPayments)}</span></div>}
            {!hasRewardPointsPayment && totalPayments >= netAmount && netAmount > 0 && (
              <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Change</span><span className="text-green-700">{formatCurrency(totalPayments - netAmount)}</span></div>
            )}
          </div>

          <button onClick={handleSubmit} disabled={submitting || cart.length === 0 || (!hasRewardPointsPayment && totalPayments < netAmount) || (hasRewardPointsPayment && rpCoveragePercent < 1 && otherPaymentsTotal < rpRemainingBalance - 0.01)}
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

function SalesSection({ branch, canSelectBranch }: { branch: string; canSelectBranch: boolean }) {
  const [salesTab, setSalesTab] = useState<'summary' | 'checking'>('summary')
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {[
          { key: 'summary' as const, label: 'Sales Summary' },
          { key: 'checking' as const, label: 'Sales Checking' },
        ].map(t => (
          <button key={t.key} onClick={() => setSalesTab(t.key)}
            className="px-4 py-2 text-sm rounded-xl font-medium transition-colors"
            style={{ background: salesTab === t.key ? 'var(--pale-teal)' : 'transparent', color: salesTab === t.key ? 'var(--deep-teal)' : 'var(--mid-gray)' }}>
            {t.label}
          </button>
        ))}
      </div>
      {salesTab === 'summary' && <SalesSummarySection branch={branch} canSelectBranch={canSelectBranch} />}
      {salesTab === 'checking' && <SalesCheckingPanel branch={branch} canSelectBranch={canSelectBranch} />}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SALES CHECKING PANEL
   ══════════════════════════════════════════════════════════════ */
function SalesCheckingPanel({ branch, canSelectBranch }: { branch: string; canSelectBranch: boolean }) {
  const [selectedBranch, setSelectedBranch] = useState(canSelectBranch ? '' : branch)
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [orders, setOrders] = useState<Order[]>([])
  const [modes, setModes] = useState<PaymentModeType[]>([])
  const [loading, setLoading] = useState(false)
  const [actualAmounts, setActualAmounts] = useState<Record<string, Record<string, number>>>({}) // { date: { method: amount } }
  const [confirmed, setConfirmed] = useState<Record<string, Record<string, boolean>>>({}) // { date: { method: bool } }

  useEffect(() => {
    fetch('/api/pos/payment-modes').then(r => r.json()).then(d => setModes(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const modeNameMap = new Map(modes.map(m => [m.id, m.name]))
  const getPaymentLabel = (p: { method: string }) => modeNameMap.get(p.method) || p.method || 'Unknown'

  const fetchOrders = useCallback(async () => {
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
    } catch { setOrders([]) }
    finally { setLoading(false) }
  }, [selectedBranch, dateFrom, dateTo])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  // Group orders by date and payment method
  const activeOrders = orders.filter(o => o.status !== 'VOIDED')
  const byDate = new Map<string, Map<string, number>>()

  for (const o of activeOrders) {
    const day = new Date(String(o.transactionDate || o.createdAt)).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    if (!byDate.has(day)) byDate.set(day, new Map())
    const methods = byDate.get(day)!
    for (const p of o.payments) {
      const label = getPaymentLabel(p)
      methods.set(label, (methods.get(label) || 0) + toNum(p.amount))
    }
  }

  const sortedDates = Array.from(byDate.keys()).sort()
  const allMethods = new Set<string>()
  byDate.forEach(m => m.forEach((_, k) => allMethods.add(k)))
  const sortedMethods = Array.from(allMethods).sort()

  const getActual = (day: string, method: string) => actualAmounts[day]?.[method] ?? ''
  const setActual = (day: string, method: string, val: number) => {
    setActualAmounts(prev => ({ ...prev, [day]: { ...prev[day], [method]: val } }))
  }
  const isConfirmed = (day: string, method: string) => confirmed[day]?.[method] || false
  const toggleConfirm = (day: string, method: string) => {
    setConfirmed(prev => ({ ...prev, [day]: { ...prev[day], [method]: !prev[day]?.[method] } }))
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>Sales Checking</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
          Compare system sales against actual bank/account deposits per day and payment method.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {canSelectBranch && (
          <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="">All Branches</option>
            <option value="SANDBOX_EAST">Sandbox East</option>
            <option value="SANDBOX_GREENHILLS">Sandbox Greenhills</option>
          </select>
        )}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 size={20} className="animate-spin mx-auto" style={{ color: 'var(--teal)' }} /></div>
      ) : sortedDates.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--mid-gray)' }}>No sales data for this period.</div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map(day => {
            const methods = byDate.get(day)!
            const dayLabel = new Date(day + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
            return (
              <div key={day} className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                <div className="px-4 py-2.5 font-semibold text-xs" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{dayLabel}</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--off-white)' }}>
                      <th className="px-4 py-2 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Payment Method</th>
                      <th className="px-4 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>System Amount</th>
                      <th className="px-4 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>Actual Amount</th>
                      <th className="px-4 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>Difference</th>
                      <th className="px-4 py-2 text-center font-semibold" style={{ color: 'var(--charcoal)' }}>OK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMethods.filter(m => methods.has(m)).map(method => {
                      const systemAmt = methods.get(method) || 0
                      const actualAmt = typeof getActual(day, method) === 'number' ? getActual(day, method) as number : 0
                      const diff = actualAmt - systemAmt
                      const diffColor = diff === 0 ? '#166534' : diff > 0 ? '#ED6823' : '#dc2626'
                      return (
                        <tr key={method} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                          <td className="px-4 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{method}</td>
                          <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(systemAmt)}</td>
                          <td className="px-4 py-2 text-right">
                            <input type="number" step="0.01" value={getActual(day, method)}
                              onChange={e => setActual(day, method, parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="w-28 px-2 py-1 rounded-lg border text-xs text-right outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-medium" style={{ color: actualAmt ? diffColor : 'var(--mid-gray)' }}>
                            {actualAmt ? (diff >= 0 ? '+' : '') + formatCurrency(diff) : '—'}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {diff === 0 && actualAmt > 0 ? (
                              <label className="cursor-pointer">
                                <input type="checkbox" checked={isConfirmed(day, method)}
                                  onChange={() => toggleConfirm(day, method)} className="rounded" />
                              </label>
                            ) : (
                              <span className="text-xs" style={{ color: 'var(--light-gray)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SALES SUMMARY
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

  // Calculate summary — exclude UNEARNED revenue from Gross/Net Sales
  const activeOrders = orders.filter(o => o.status !== 'VOIDED')
  const earnedOrders = activeOrders.filter(o => o.revenueType !== 'UNEARNED')
  const grossSales = earnedOrders.reduce((s, o) => s + toNum(o.subtotal), 0)
  const totalDiscounts = earnedOrders.reduce((s, o) => s + toNum(o.discountAmount), 0)
  const netSales = earnedOrders.reduce((s, o) => s + toNum(o.netAmount), 0)
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

  // HMO/GL provider breakdown
  const hmoBreakdown: Record<string, { count: number; total: number }> = {}
  const glBreakdown: Record<string, { count: number; total: number }> = {}
  activeOrders.forEach(o => {
    o.payments.forEach(p => {
      if (p.method === 'HMO' && p.reference) {
        const provider = p.reference.trim() || 'Unspecified'
        if (!hmoBreakdown[provider]) hmoBreakdown[provider] = { count: 0, total: 0 }
        hmoBreakdown[provider].count++
        hmoBreakdown[provider].total += toNum(p.amount)
      }
      if (p.method === 'GL' && p.reference) {
        const provider = p.reference.trim() || 'Unspecified'
        if (!glBreakdown[provider]) glBreakdown[provider] = { count: 0, total: 0 }
        glBreakdown[provider].count++
        glBreakdown[provider].total += toNum(p.amount)
      }
    })
  })

  const serviceOrders = activeOrders.filter(o => o.orderType === 'SERVICE')
  const productOrders = activeOrders.filter(o => o.orderType === 'PRODUCT')

  // Department breakdown for SCEI report — uses Service.department field, earned revenue only
  const DEPT_LABEL_MAP: Record<string, string> = {
    'MD': 'MD',
    'PT': 'PHYSICAL THERAPY',
    'OT': 'OCCUPATIONAL THERAPY',
    'SLP': 'SPEECH LANGUAGE PATHOLOGY',
    'SPED': 'SPECIAL EDUCATION',
    'PSYCHOLOGY': 'PSYCHOLOGY',
    'O&P': 'ORTHOSIS AND PROSTHESIS',
  }

  const deptBreakdown: Record<string, number> = {}
  earnedOrders.filter(o => o.orderType === 'SERVICE').forEach(o => {
    o.items.forEach(it => {
      // Use service.department from the linked Service model
      const rawDept = it.service?.department || ''
      const dept = DEPT_LABEL_MAP[rawDept] || rawDept.toUpperCase() || 'OTHER'
      if (!deptBreakdown[dept]) deptBreakdown[dept] = 0
      deptBreakdown[dept] += toNum(it.lineTotal)
    })
  })

  // Discount breakdown by type
  const discountBreakdown: Record<string, number> = {}
  earnedOrders.forEach(o => {
    const amt = toNum(o.discountAmount)
    if (amt > 0) {
      const label = o.discountLabel || o.discountType || 'Other'
      if (!discountBreakdown[label]) discountBreakdown[label] = 0
      discountBreakdown[label] += amt
    }
  })

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
    if (!win) return
    const fmt = (v: number) => `Php ${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const branchLabel = selectedBranch === 'SANDBOX_EAST' ? 'SANDBOX CLINIC \u2013 EAST' : selectedBranch === 'SANDBOX_GREENHILLS' ? 'SANDBOX CLINIC \u2013 GREENHILLS' : 'ALL BRANCHES'
    const DEPTS = ['MD', 'PHYSICAL THERAPY', 'OCCUPATIONAL THERAPY', 'SPEECH LANGUAGE PATHOLOGY', 'SPECIAL EDUCATION', 'ORTHOSIS AND PROSTHESIS', 'PSYCHOLOGY']
    const discountLines = Object.entries(discountBreakdown).map(([k, v]) => `   ${k}: ${fmt(v)}`).join('\n') || '   None'
    const paymentLines = Object.entries(paymentBreakdown).map(([k, v]) => `   ${k.replace(/_/g, ' ')}: ${fmt(v.total)}`).join('\n') || '   None'
    const deptLines = DEPTS.map(d => `${d}: ${fmt(deptBreakdown[d] || 0)}`).join('\n')

    const content = `<div style="font-family:'Arial Black',Arial,Helvetica,sans-serif;font-size:11px;font-weight:900;border:1px solid #000;padding:20px;max-width:600px;margin:auto;line-height:1.7;position:relative">
<img src="/scei-logo-full.png" style="position:absolute;top:16px;right:16px;width:100px;height:auto" onerror="this.style.display='none'" />
<div style="text-align:center;font-size:12px;font-weight:900;margin-bottom:4px;letter-spacing:0.5px">${branchLabel}</div>
<div style="text-align:center;font-size:11px;font-weight:900;margin-bottom:12px">SALES FOR THE DAY</div>

<div style="font-size:11px;white-space:pre-wrap;font-family:'Arial Black',Arial,Helvetica,sans-serif;font-weight:900;line-height:1.7">Date: ${formatDate(dateFrom)}${dateFrom !== dateTo ? ' to ' + formatDate(dateTo) : ''}

Total Sales (Gross): ${fmt(grossSales)}

Discounts:
${discountLines}

Total Discounts: ${fmt(totalDiscounts)}
Net Sales: ${fmt(netSales)}

Unearned Revenue: ${fmt(unearnedRevenue)}

Modes of Payment
${paymentLines}


${deptLines}

Remarks:


This is to certify that all the details
here are true and correct, and match the
endorsed sales for the day.

Front Desk: ___________________________
Signature:  ___________________________

Validated by: _________________________
Signature:    _________________________
</div></div>`

    win.document.write(`<html><head><title>Daily Sales Report - ${dateFrom}</title>
<style>@page{size:letter;margin:20mm}body{margin:0;padding:20px}*{font-family:'Arial Black',Arial,Helvetica,sans-serif!important;font-weight:900!important}</style>
</head><body>${content}<script>setTimeout(()=>{window.print()},300)<\/script></body></html>`)
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
                          <td className="px-4 py-2" style={{ color: 'var(--charcoal)' }}>{method.replace(/_/g, ' ')}</td>
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

              {/* HMO Provider Breakdown */}
              {Object.keys(hmoBreakdown).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2" style={{ color: '#c2410c' }}>HMO Breakdown by Provider</h4>
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#fed7aa' }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: '#fff7ed' }}>
                          {['HMO Provider', 'Count', 'Total'].map(h => (
                            <th key={h} className="px-4 py-2 text-left text-xs font-semibold" style={{ color: '#c2410c' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(hmoBreakdown).sort((a, b) => b[1].total - a[1].total).map(([provider, data]) => (
                          <tr key={provider} className="border-t" style={{ borderColor: '#fed7aa' }}>
                            <td className="px-4 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>HMO-{provider}</td>
                            <td className="px-4 py-2" style={{ color: 'var(--mid-gray)' }}>{data.count}</td>
                            <td className="px-4 py-2 font-semibold" style={{ color: '#c2410c' }}>{formatCurrency(data.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* GL Provider Breakdown */}
              {Object.keys(glBreakdown).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2" style={{ color: '#15803d' }}>Guarantee Letter (GL) Breakdown</h4>
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#bbf7d0' }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: '#f0fdf4' }}>
                          {['GL Provider', 'Count', 'Total'].map(h => (
                            <th key={h} className="px-4 py-2 text-left text-xs font-semibold" style={{ color: '#15803d' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(glBreakdown).sort((a, b) => b[1].total - a[1].total).map(([provider, data]) => (
                          <tr key={provider} className="border-t" style={{ borderColor: '#bbf7d0' }}>
                            <td className="px-4 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>GL-{provider}</td>
                            <td className="px-4 py-2" style={{ color: 'var(--mid-gray)' }}>{data.count}</td>
                            <td className="px-4 py-2 font-semibold" style={{ color: '#15803d' }}>{formatCurrency(data.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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

/* ══════════════════════════════════════════════════════════════
   REFERRER SETTINGS PANEL
   ══════════════════════════════════════════════════════════════ */
function ReferrerSettingsPanel() {
  const [referrers, setReferrers] = useState<{ id: string; name: string; affiliation?: string | null; specialization?: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', affiliation: '', specialization: '' })
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const fetchReferrers = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/referrers?all=true')
      const d = await r.json()
      setReferrers(Array.isArray(d) ? d : d.data || [])
    } catch { setReferrers([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchReferrers() }, [fetchReferrers])

  const filtered = referrers.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.affiliation?.toLowerCase().includes(search.toLowerCase()) ||
    r.specialization?.toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => { setEditingId(null); setForm({ name: '', affiliation: '', specialization: '' }); setError(''); setShowForm(true) }
  const openEdit = (r: typeof referrers[0]) => { setEditingId(r.id); setForm({ name: r.name, affiliation: r.affiliation || '', specialization: r.specialization || '' }); setError(''); setShowForm(true) }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setError('')
    const body = { id: editingId, name: form.name.trim(), affiliation: form.affiliation.trim() || null, specialization: form.specialization.trim() || null }
    const res = await fetch('/api/referrers', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) { setShowForm(false); fetchReferrers() }
    else { const d = await res.json(); setError(d.error || 'Failed to save') }
  }

  const deleteReferrer = async (id: string) => {
    if (!window.confirm('Remove this referrer?')) return
    await fetch('/api/referrers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    fetchReferrers()
  }

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    try {
      const text = await file.text()
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      const header = lines[0].toLowerCase()
      const hasHeader = header.includes('name') || header.includes('affiliation')
      const dataLines = hasHeader ? lines.slice(1) : lines
      let created = 0
      for (const line of dataLines) {
        const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
        if (!cols[0]) continue
        const res = await fetch('/api/referrers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cols[0], affiliation: cols[1] || null, specialization: cols[2] || null }),
        })
        if (res.ok) created++
      }
      alert(`Uploaded ${created} referrer(s).`)
      fetchReferrers()
    } catch { setError('Failed to parse CSV') }
    finally { setUploading(false); e.target.value = '' }
  }

  const downloadCsv = () => {
    const rows = [['Name', 'Affiliation', 'Specialization'], ...referrers.map(r => [r.name, r.affiliation || '', r.specialization || ''])]
    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'doctor_referrers.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  const downloadPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    doc.setFontSize(14); doc.text('Doctor Referrers', 14, 16)
    doc.setFontSize(8); doc.setTextColor(120); doc.text(`Generated ${new Date().toLocaleDateString('en-PH')}`, 14, 22); doc.setTextColor(0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    autoTable(doc as any, {
      startY: 28,
      head: [['#', 'Name', 'Affiliation', 'Specialization']],
      body: referrers.map((r, i) => [i + 1, r.name, r.affiliation || '', r.specialization || '']),
      styles: { fontSize: 8 }, headStyles: { fillColor: [46, 94, 90] },
    })
    doc.save('doctor_referrers.pdf')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>Doctor Referrers</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Manage referring doctors. Upload CSV (Name, Affiliation, Specialization) or add individually.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadCsv} className="px-3 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>CSV</button>
          <button onClick={downloadPdf} className="px-3 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>PDF</button>
          <button onClick={() => {
            const csv = 'Name,Affiliation,Specialization\nDr. Juan Dela Cruz,Manila Medical Center,Orthopedics\n'
            const blob = new Blob([csv], { type: 'text/csv' })
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'referrer_template.csv'; a.click(); URL.revokeObjectURL(a.href)
          }} className="px-3 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            Template
          </button>
          <label className="px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer" style={{ borderColor: 'var(--light-gray)', color: uploading ? 'var(--mid-gray)' : 'var(--gold)' }}>
            {uploading ? 'Uploading...' : 'Upload CSV'}
            <input type="file" accept=".csv,.txt" onChange={handleCsvUpload} className="hidden" disabled={uploading} />
          </label>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
            <Plus size={14} /> Add Referrer
          </button>
        </div>
      </div>

      <div className="relative w-60">
        <Search size={14} className="absolute left-3 top-2.5" style={{ color: 'var(--mid-gray)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search referrers..."
          className="pl-9 pr-3 py-2 rounded-xl border text-sm outline-none w-full" style={{ borderColor: 'var(--light-gray)' }} />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading ? (
        <div className="py-12 text-center" style={{ color: 'var(--mid-gray)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--mid-gray)' }}>No referrers found.</div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--pale-teal)' }}>
                {['Name', 'Affiliation', 'Specialization', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>{r.name}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.affiliation || '—'}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.specialization || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil size={13} style={{ color: 'var(--teal)' }} /></button>
                      <button onClick={() => deleteReferrer(r.id)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: 'white' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{editingId ? 'Edit Referrer' : 'Add Referrer'}</h3>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Affiliation</label>
              <input value={form.affiliation} onChange={e => setForm({ ...form, affiliation: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Specialization</label>
              <input value={form.specialization} onChange={e => setForm({ ...form, specialization: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={save} className="px-4 py-2 rounded-xl text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                {editingId ? 'Update' : 'Add'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PAYMENT MODE SETTINGS PANEL
   ══════════════════════════════════════════════════════════════ */

function PaymentModeSettingsPanel() {
  const [modes, setModes] = useState<PaymentModeType[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', paymentMethod: '', branch: '', accountId: '', isActive: true })
  const [accountSearch, setAccountSearch] = useState('')
  const [allAccounts, setAllAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string; accountType: string }[]>([])
  const [deductions, setDeductions] = useState<{ name: string; rate: number; accountId: string; accountSearch: string }[]>([])
  const [error, setError] = useState('')

  const fetchModes = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/pos/payment-modes')
      const d = await r.json()
      setModes(Array.isArray(d) ? d : [])
    } catch { setModes([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchModes() }, [fetchModes])

  useEffect(() => {
    fetch('/api/chart-of-accounts?pageSize=1000')
      .then(r => r.json())
      .then(d => setAllAccounts((d.data || []).map((a: { id: string; accountNumber: string; accountTitle: string; accountType: string }) => ({
        id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle, accountType: a.accountType,
      })))
      )
      .catch(() => {})
  }, [])

  const filteredAccounts = (q: string) =>
    allAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8)

  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', paymentMethod: '', branch: '', accountId: '', isActive: true })
    setAccountSearch('')
    setDeductions([])
    setError('')
    setShowForm(true)
  }

  const openEdit = (m: PaymentModeType) => {
    setEditingId(m.id)
    setForm({ name: m.name, paymentMethod: m.paymentMethod || '', branch: m.branch || '', accountId: m.accountId || '', isActive: m.isActive })
    setAccountSearch(m.account ? `${m.account.accountNumber} ${m.account.accountTitle}` : '')
    setDeductions((m.deductions || []).map(d => ({
      name: d.name,
      rate: Number(d.rate),
      accountId: d.accountId || '',
      accountSearch: d.account ? `${d.account.accountNumber} ${d.account.accountTitle}` : '',
    })))
    setError('')
    setShowForm(true)
  }

  const addDeduction = () => setDeductions(prev => [...prev, { name: '', rate: 0, accountId: '', accountSearch: '' }])
  const removeDeduction = (i: number) => setDeductions(prev => prev.filter((_, idx) => idx !== i))
  const updateDeduction = (i: number, updates: Record<string, string | number>) =>
    setDeductions(prev => prev.map((d, idx) => idx === i ? { ...d, ...updates } : d))

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setError('')
    const body = {
      id: editingId,
      name: form.name,
      paymentMethod: form.paymentMethod || null,
      branch: form.branch || null,
      accountId: form.accountId || null,
      isActive: form.isActive,
      deductions: deductions.filter(d => d.name.trim() && d.rate > 0).map(d => ({
        name: d.name.trim(),
        rate: d.rate,
        accountId: d.accountId || null,
      })),
    }
    const res = await fetch('/api/pos/payment-modes', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { setShowForm(false); fetchModes() }
    else { const d = await res.json(); setError(d.error || 'Failed to save') }
  }

  const deleteMode = async (id: string) => {
    if (!window.confirm('Deactivate this payment mode?')) return
    await fetch('/api/pos/payment-modes', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchModes()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>Payment Mode Settings</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
            Configure payment methods, the asset account where net proceeds are lodged, and any applicable deductions (e.g. credit card fees).
          </p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
          <Plus size={14} /> Add Mode
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8" style={{ color: 'var(--mid-gray)' }}><Loader2 className="animate-spin" size={16} /> Loading...</div>
      ) : modes.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--mid-gray)' }}>No payment modes configured yet.</div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--pale-teal)' }}>
                {['Mode', 'Net Proceeds Account', 'Deductions', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modes.map(m => (
                <tr key={m.id} className="border-t" style={{ borderColor: 'var(--light-gray)', opacity: m.isActive ? 1 : 0.5 }}>
                  <td className="px-4 py-3">
                    <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{m.name}</span>
                    {m.branch ? (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                        {m.branch === 'SANDBOX_EAST' ? 'SBEA' : m.branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : m.branch === 'VERDANA_STORE' ? 'Verdana' : m.branch}
                      </span>
                    ) : (
                      <span className="ml-2 text-[10px]" style={{ color: 'var(--mid-gray)' }}>All</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                    {m.account ? <span><span className="font-mono" style={{ color: 'var(--teal)' }}>{m.account.accountNumber}</span> {m.account.accountTitle}</span> : <span className="italic">Not set</span>}
                  </td>
                  <td className="px-4 py-3">
                    {m.deductions.length === 0 ? (
                      <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>None</span>
                    ) : (
                      <div className="space-y-0.5">
                        {m.deductions.map(d => (
                          <div key={d.id} className="text-xs" style={{ color: 'var(--charcoal)' }}>
                            <span className="font-medium">{d.name}</span>
                            <span className="ml-1" style={{ color: 'var(--mid-gray)' }}>{Number(d.rate)}%</span>
                            {d.account && <span className="ml-1 font-mono text-xs" style={{ color: 'var(--teal)' }}>→ {d.account.accountNumber}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil size={13} style={{ color: 'var(--teal)' }} /></button>
                      <button onClick={() => deleteMode(m.id)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-10 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-lg mb-10 relative">
            <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>
            <h3 className="text-base font-bold mb-4" style={{ color: 'var(--charcoal)' }}>
              {editingId ? 'Edit Payment Mode' : 'Add Payment Mode'}
            </h3>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Mode Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Cash - SBEA, GCash, Credit Card"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>

              {/* Payment Method Type */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                  Payment Method Type <span className="font-normal">(determines journal entry category)</span>
                </label>
                <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">— Select type —</option>
                  <option value="CASH">Cash</option>
                  <option value="GCASH">GCash</option>
                  <option value="PAYMAYA">PayMaya</option>
                  <option value="DEBIT">Debit Card</option>
                  <option value="CREDIT_CARD">Credit Card</option>
                  <option value="SHOPEE">Shopee</option>
                  <option value="LAZADA">Lazada</option>
                  <option value="TIKTOK">TikTok Shop</option>
                </select>
              </div>

              {/* Branch */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                  Branch <span className="font-normal">(leave blank for all branches)</span>
                </label>
                <select value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">All Branches</option>
                  <option value="SANDBOX_EAST">Sandbox East</option>
                  <option value="SANDBOX_GREENHILLS">Sandbox Greenhills</option>
                  <option value="VERDANA_STORE">Verdana Store</option>
                </select>
              </div>

              {/* Net proceeds account */}
              <div className="relative">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                  Net Proceeds Account <span className="font-normal">(asset account where net cash is deposited)</span>
                </label>
                <input type="text" value={accountSearch}
                  onChange={e => { setAccountSearch(e.target.value); if (!e.target.value) setForm({ ...form, accountId: '' }) }}
                  placeholder="Search account..."
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: form.accountId ? 'var(--teal)' : 'var(--light-gray)', background: form.accountId ? '#f0fdfa' : 'white' }} />
                {form.accountId && (
                  <button type="button" onClick={() => { setForm({ ...form, accountId: '' }); setAccountSearch('') }}
                    className="absolute right-2 top-7 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                )}
                {accountSearch && !form.accountId && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-36 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                    {filteredAccounts(accountSearch).map(a => (
                      <button key={a.id} type="button"
                        onClick={() => { setForm({ ...form, accountId: a.id }); setAccountSearch(`${a.accountNumber} ${a.accountTitle}`) }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50">
                        <span className="font-mono font-medium" style={{ color: 'var(--teal)' }}>{a.accountNumber}</span> {a.accountTitle}
                        <span className="ml-1 text-gray-400">({a.accountType})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Deductions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Deductions</label>
                  <button type="button" onClick={addDeduction} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--teal)' }}>
                    <PlusCircle size={13} /> Add Deduction
                  </button>
                </div>
                {deductions.length === 0 && (
                  <p className="text-xs italic" style={{ color: 'var(--mid-gray)' }}>No deductions — e.g. add Merchant Discount Rate for credit cards</p>
                )}
                <div className="space-y-3">
                  {deductions.map((d, i) => (
                    <div key={i} className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--light-gray)' }}>
                      <div className="flex gap-2">
                        <input value={d.name} onChange={e => updateDeduction(i, { name: e.target.value })}
                          placeholder="e.g. Merchant Discount Rate"
                          className="flex-1 px-2.5 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        <div className="flex items-center gap-1">
                          <input type="number" value={d.rate} min={0} max={100} step={0.01}
                            onChange={e => updateDeduction(i, { rate: parseFloat(e.target.value) || 0 })}
                            className="w-16 px-2 py-1.5 rounded-lg border text-xs outline-none text-right" style={{ borderColor: 'var(--light-gray)' }} />
                          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>%</span>
                        </div>
                        <button type="button" onClick={() => removeDeduction(i)} className="p-1 rounded hover:bg-red-50">
                          <X size={13} className="text-red-400" />
                        </button>
                      </div>
                      {/* Deduction COA */}
                      <div className="relative">
                        <input type="text" value={d.accountSearch}
                          onChange={e => updateDeduction(i, { accountSearch: e.target.value, ...(!e.target.value ? { accountId: '' } : {}) })}
                          placeholder="COA — expense or liability account..."
                          className="w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none"
                          style={{ borderColor: d.accountId ? 'var(--teal)' : 'var(--light-gray)', background: d.accountId ? '#f0fdfa' : 'white' }} />
                        {d.accountId && (
                          <button type="button" onClick={() => updateDeduction(i, { accountId: '', accountSearch: '' })}
                            className="absolute right-2 top-1.5 p-0.5 rounded hover:bg-gray-100"><X size={11} style={{ color: 'var(--mid-gray)' }} /></button>
                        )}
                        {d.accountSearch && !d.accountId && (
                          <div className="absolute z-30 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-28 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                            {filteredAccounts(d.accountSearch).map(a => (
                              <button key={a.id} type="button"
                                onClick={() => updateDeduction(i, { accountId: a.id, accountSearch: `${a.accountNumber} ${a.accountTitle}` })}
                                className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-50">
                                <span className="font-mono font-medium" style={{ color: 'var(--teal)' }}>{a.accountNumber}</span> {a.accountTitle}
                                <span className="ml-1 text-gray-400">({a.accountType})</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              {editingId && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setForm({ ...form, isActive: !form.isActive })}>
                    {form.isActive ? <ToggleRight size={22} style={{ color: 'var(--teal)' }} /> : <ToggleLeft size={22} style={{ color: 'var(--mid-gray)' }} />}
                  </button>
                  <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{form.isActive ? 'Active' : 'Inactive'}</span>
                </div>
              )}

              {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}

              <button onClick={save} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
                {editingId ? 'Save Changes' : 'Create Payment Mode'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
