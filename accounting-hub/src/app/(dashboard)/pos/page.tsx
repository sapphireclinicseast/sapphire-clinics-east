'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import {
  ShoppingCart, Search, Plus, X, Trash2, ChevronDown, ChevronUp,
  CreditCard, Wallet, FileText, Download, Printer,
  RefreshCw, Ban, Star, Filter, Undo2, RotateCcw,
  Loader2, AlertCircle, ScanLine, UserPlus,
  Pencil, PlusCircle, ToggleLeft, ToggleRight, Eye, CheckCircle, Gift,
  Globe, Truck, Phone, MapPin, Package, Clock, Upload, DollarSign,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { normalizeSI } from '@/lib/sales-invoice'
import { PaymongoAdvanceQueue } from './PaymongoAdvanceQueue'
import { TiktokImportModal } from './TiktokImportModal'
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
  isFreeSample?: boolean
  variantId?: string
  variantLabel?: string
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
  returnedByBuyer?: boolean
  paymentStatus?: string
  paymentDate?: string | null
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
  type?: string | null
  affiliation?: string | null
  specialization?: string | null
}

interface WalletLedgerEntry {
  date: string
  type: 'RELOAD' | 'DEDUCTION' | 'VOID_REVERSAL' | 'STARTING_BALANCE'
  description: string
  credit: number
  debit: number
  balanceBefore: number
  balanceAfter: number
  orderNumber?: number | null
  orderId?: string | null
  voided?: boolean
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
  soaStatus?: string | null
  attachmentUrl?: string | null
  attachmentUrls?: string[] | null
  _count?: { packages: number }
  packages?: WalletPackage[]
  logs?: WalletLog[]
  ledger?: WalletLedgerEntry[]
  initialBalance?: number
  [key: string]: unknown
}

interface WalletPackage {
  id: string
  serviceName: string
  serviceId?: string | null
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
  valueType?: string  // 'PERCENTAGE' | 'FIXED'
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
  departments?: string[]
  [key: string]: unknown
}

interface Patient {
  id: string
  name: string
  email?: string
  phone?: string
  diagnosis?: string | null
  [key: string]: unknown
}

interface StaffMember {
  id: string
  name: string
  department?: string
  branch?: string
  [key: string]: unknown
}

interface InventoryVariant {
  id: string
  variantType: string
  variantLabel: string
  quantity: number
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
  variants?: InventoryVariant[]
  [key: string]: unknown
}

/* ─────────────────────────── CRM HELPERS ─────────────────────────── */

/**
 * Look up a patient in the marketing-hub CRM by wallet patient name.
 * Match strategy (exactOf):
 *  1. Exact case-insensitive name match.
 *  2. Hyphen-normalised match (TAG-AT ↔ Tagat).
 *  3. Word-subset match: every word of the CRM record's name appears in the
 *     target name — handles CRM storing "Andreas Carel" while wallet has
 *     "ANDREAS JUANCHO CAREL" (middle name missing in CRM).
 *  4. Sole-result fallback.
 *
 * Search fallback order when full-name search returns nothing:
 *  a. Last 2 words — compound surnames like "De Guzman".
 *  b. Last 1 word — simple surnames like "Carel".
 *  c. Last 1 word without hyphens — "TAG-AT" → "TAGAT".
 *  d. First word — given name, more unique for large CRM sets.
 */
async function findCrmPatient(name: string): Promise<Patient | null> {
  // Strip hyphens for loose comparison (handles TAG-AT ↔ Tagat)
  const norm = (s: string) => s.toLowerCase().replace(/-/g, '')
  const targetNormWords = norm(name).split(/\s+/)
  const exactOf = (pts: Patient[]) => {
    // 1st: exact case-insensitive match
    const exact = pts.find(p => p.name.toLowerCase() === name.toLowerCase())
    if (exact) return exact
    // 2nd: hyphen-normalised match (e.g. "Tag-at" ↔ "Tagat")
    const normMatch = pts.find(p => norm(p.name) === norm(name))
    if (normMatch) return normMatch
    // 3rd: every word of the CRM name is present in the target name
    //      (handles CRM storing first+last only, wallet has middle name too)
    const subsetMatch = pts.find(p =>
      norm(p.name).split(/\s+/).every(w => targetNormWords.includes(w))
    )
    if (subsetMatch) return subsetMatch
    // Last resort: sole result
    return pts.length === 1 ? pts[0] : null
  }
  try {
    // 1. Full name search
    const r = await fetch(`/api/pos/patients?search=${encodeURIComponent(name)}`)
    const d: Patient[] = await r.json()
    if (Array.isArray(d) && d.length > 0) return exactOf(d)

    if (name.includes(' ')) {
      const words = name.split(/\s+/)

      // 2. Last 2 words — compound surnames like "De Guzman"
      if (words.length >= 3) {
        const s2 = words.slice(-2).join(' ')
        const r2 = await fetch(`/api/pos/patients?search=${encodeURIComponent(s2)}`)
        const d2: Patient[] = await r2.json()
        if (Array.isArray(d2) && d2.length > 0) { const m = exactOf(d2); if (m) return m }
      }

      // 3. Last 1 word — simple surnames like "Carel" or hyphenated "Tag-at"
      const s1 = words[words.length - 1]
      const r3 = await fetch(`/api/pos/patients?search=${encodeURIComponent(s1)}`)
      const d3: Patient[] = await r3.json()
      if (Array.isArray(d3) && d3.length > 0) { const m = exactOf(d3); if (m) return m }

      // 4. Last 1 word with hyphens removed — "TAG-AT" → "TAGAT"
      const s1nh = s1.replace(/-/g, '')
      if (s1nh !== s1) {
        const r4 = await fetch(`/api/pos/patients?search=${encodeURIComponent(s1nh)}`)
        const d4: Patient[] = await r4.json()
        if (Array.isArray(d4) && d4.length > 0) { const m = exactOf(d4); if (m) return m }
      }

      // 5. First word (given name) — catches cases where surname search returns
      //    too many results and none match via subset (e.g. common surnames)
      const s0 = words[0]
      const r5 = await fetch(`/api/pos/patients?search=${encodeURIComponent(s0)}`)
      const d5: Patient[] = await r5.json()
      if (Array.isArray(d5) && d5.length > 0) { const m = exactOf(d5); if (m) return m }
    }
  } catch { /* network / parse errors — caller handles null */ }
  return null
}

/* ─────────────────────────── CONSTANTS ─────────────────────────── */

const PAYMENT_METHODS_SERVICE = [
  { value: 'CASH', label: 'Cash' },
  { value: 'GCASH', label: 'GCash' },
  { value: 'PAYMAYA', label: 'PayMaya' },
  { value: 'PAYMONGO', label: 'Paymongo' },
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
  // Credit/bulk sale to an outside customer (e.g. Sandbox Clark): no cash now —
  // creates an entry under Accounts Receivable → Others, collected there later.
  { value: 'RECEIVABLE', label: 'Receivable (charge to customer)' },
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
  { value: 'SANDBOX_EAST', label: 'AHEA' },
  { value: 'SANDBOX_GREENHILLS', label: 'AHGH' },
  { value: 'VERDANA_STORE', label: 'Verdana' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]

const GL_SERVICE_TYPES = ['PT', 'OT', 'SLP', 'SPED', 'Psychology', 'MD', 'Orthosis']

const BRANCH_LABELS: Record<string, string> = {
  SANDBOX_EAST: 'East',
  SANDBOX_GREENHILLS: 'Greenhills',
  VERDANA_STORE: 'Verdana',
  ALL: 'All Branches',
}

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
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

function firstOfMonth(): string {
  const now = new Date()
  const manila = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
  return `${manila.getFullYear()}-${String(manila.getMonth() + 1).padStart(2, '0')}-01`
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
  const branchName = order.branch === 'SANDBOX_EAST' ? 'Aura Health Rehab Clinic \u2013 East' : order.branch === 'SANDBOX_GREENHILLS' ? 'Aura Health Rehab Clinic \u2013 Greenhills' : isVerdana ? 'VERDANA STORE' : order.branch === 'AURA_INSTITUTE' ? 'Aura Health Rehab Clinic \u2013 Institute' : order.branch || ''
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
  return ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER'].includes(r) || r.endsWith('_ADMIN')
}

/* ─────────────────────────── HELPERS ─────────────────────────── */

/** Converts legacy /uploads/filename URLs to the new /api/files/filename route */
function normalizeFileUrl(url: string): string {
  if (!url) return url
  if (url.startsWith('/uploads/')) return `/api/files/${url.slice(9)}`
  return url
}

/* ─────────────────────────── MAIN COMPONENT ─────────────────────────── */

export default function POSPage() {
  const { data: session } = useSession()

  // ── Top-level tab: Services | Orders | Products | Sales Summary
  const [mainTab, setMainTab] = useState<'services' | 'orders' | 'products' | 'sales'>('services')
  // ── Services sub-tab
  const [serviceTab, setServiceTab] = useState<'cashier' | 'wallet' | 'discounts' | 'payment-modes'>('cashier')
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

  // Medical Representatives manage referrers under the dedicated Referral section now.
  if (session.user.role === 'MEDREP') {
    redirect('/referral')
  }

  const branch = userBranch(session)
  // A user assigned to a single branch (branch != ALL) is locked to it, even if their role
  // would otherwise let them pick a branch.
  const branchLocked = !!session?.user?.branch && session.user.branch !== 'ALL'
  const canSelectBranch = isAdmin(session) && !branchLocked

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

      {/* Online payments waiting to be loaded onto a patient's advance. Hidden when empty. */}
      {(mainTab === 'services' || mainTab === 'products') && (
        <PaymongoAdvanceQueue branch={branch === 'ALL' ? '' : branch} />
      )}

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
  serviceTab: 'cashier' | 'wallet' | 'discounts' | 'payment-modes'
  setServiceTab: (t: 'cashier' | 'wallet' | 'discounts' | 'payment-modes') => void
  session: { user?: Record<string, unknown> } | null
}) {
  const subTabs = [
    { key: 'cashier' as const, label: 'Cashier' },
    { key: 'wallet' as const, label: 'Digital Wallet' },
    { key: 'discounts' as const, label: 'Discount Settings' },
    { key: 'payment-modes' as const, label: 'Payment Mode Settings' },
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
  // An admin's resolved branch can be 'ALL' (or unset). The cashier must ring up under a
  // CONCRETE branch so that branch's configured payment modes load (modes are branch-specific,
  // none are tagged 'ALL') — otherwise it falls back to the plain hardcoded methods.
  const CASHIER_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
  const [selectedBranch, setSelectedBranch] = useState(CASHIER_BRANCHES.includes(branch) ? branch : 'SANDBOX_EAST')
  const [date, setDate] = useState(today())
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [queueLoading, setQueueLoading] = useState(false)
  const [queueError, setQueueError] = useState('')
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [prefill, setPrefill] = useState<Partial<QueueItem> | null>(null)

  const fetchQueue = useCallback(async () => {
    // Verdana Store is a retail / seminars branch — it has no clinical appointment queue.
    if (selectedBranch === 'VERDANA_STORE') {
      setQueue([]); setQueueError(''); setQueueLoading(false)
      return
    }
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
            <option value="SANDBOX_EAST">Aura Health Rehab - East</option>
            <option value="SANDBOX_GREENHILLS">Aura Health Rehab - Greenhills</option>
            <option value="VERDANA_STORE">Verdana</option>
            <option value="AURA_INSTITUTE">Aura Health Institute</option>
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

      {/* Queue — hidden for Verdana (retail/seminars branch has no appointment queue) */}
      {selectedBranch !== 'VERDANA_STORE' && (
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
      )}

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
  const [newRef, setNewRef] = useState({ name: '', type: 'DOCTOR', affiliation: '', specialization: '' })
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
  // Synchronous re-entrancy guard: blocks duplicate orders from rapid re-clicks
  // before React re-renders the disabled button (state updates lag a render).
  const submittingRef = useRef(false)
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

  // Service search — load full list for price lookups, and search via API for dropdown
  useEffect(() => {
    clearTimeout(serviceTimer.current)
    serviceTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/services?pageSize=1000&branch=${branch}`)
        const d = await r.json()
        setServices(normalize(d) as ServiceItem[])
      } catch { setServices([]) }
    }, 200)
  }, [branch])

  const [serviceDropResults, setServiceDropResults] = useState<ServiceItem[]>([])
  const serviceSearchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (serviceSearch.length < 1) { setServiceDropResults([]); return }
    clearTimeout(serviceSearchTimer.current)
    serviceSearchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/services?pageSize=50&branch=${branch}&search=${encodeURIComponent(serviceSearch)}`)
        const d = await r.json()
        setServiceDropResults(normalize(d) as ServiceItem[])
      } catch { setServiceDropResults([]) }
    }, 200)
  }, [serviceSearch, branch])

  const filteredServices = serviceDropResults

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
      // If the discount is limited to specific departments, only its eligible items count.
      const depts = ds.departments || []
      const base = depts.length
        ? items.filter(it => { const dp = (it as { department?: string }).department; return !!dp && depts.includes(dp) }).reduce((s, it) => s + toNum(it.lineTotal), 0)
        : subtotal
      discountAmount = ds.type === 'PERCENTAGE' ? base * (toNum(ds.value) / 100) : Math.min(toNum(ds.value), base)
    }
  }

  const netAmount = Math.max(0, subtotal - discountAmount)
  const netAmountDisplay = parseFloat(netAmount.toFixed(2))
  // For Package payments, always use netAmount (items prices are already set to per-session rate)
  const totalPayments = payments.reduce((s, p) => {
    if (p.method === 'PACKAGE') return s + netAmount
    return s + toNum(p.amount)
  }, 0)
  const changeDue = totalPayments - netAmount
  // Snap net to displayed 2-dp precision so floating-point arithmetic in stacked
  // discounts never creates a sub-cent gap between what's shown and what's compared.
  const servicePaymentShort = totalPayments < netAmountDisplay - 0.005

  // Search package wallets by patient name
  // Search HMO/GL wallets
  const searchHmoWallets = async (q: string) => {
    setHmoSearch(q)
    try {
      const params = new URLSearchParams({ walletType: 'HMO' })
      if (q) params.set('search', q)
      if (!isAdmin(session) || (session?.user?.branch && session.user.branch !== 'ALL')) params.set('branch', userBranch(session))
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
      if (!isAdmin(session) || (session?.user?.branch && session.user.branch !== 'ALL')) params.set('branch', userBranch(session))
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
        // Override item prices to per-session rate ONLY for services eligible for this package.
        // Non-eligible items (e.g. BASIC SESSION at ₱0) keep their original price and do NOT
        // consume a session slot. If no serviceId or no eligibility rules, fall back to all items.
        if (items.length > 0) {
          const pkgService = services.find((s: ServiceItem) => s.id === activePkg.serviceId)
          const eligibleIds: string[] = pkgService?.eligibleFor
            ? (pkgService.eligibleFor as { eligibleServiceId: string }[]).map(e => e.eligibleServiceId)
            : []
          setItems(prev => prev.map(it => {
            const isEligible = eligibleIds.length === 0 || !it.serviceId || eligibleIds.includes(it.serviceId)
            return isEligible ? { ...it, unitPrice: perSession, lineTotal: perSession * it.quantity } : it
          }))
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
  const handleSubmit = async (asUnpaid = false) => {
    if (items.length === 0) { setError('Add at least one item'); return }
    if (!asUnpaid && servicePaymentShort) { setError('Payments do not cover the net amount'); return }
    if ((effectiveRevenueType === 'UNEARNED' || isAdvancePayment) && !patientName.trim()) {
      setError('Patient name is required for unearned revenue / advance payment orders')
      return
    }

    // Re-entrancy guard — set BEFORE any await so rapid re-clicks during the
    // clinician-validation fetch can't spawn parallel/duplicate orders.
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)

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
            submittingRef.current = false
            setSubmitting(false)
            return
          }
        } catch { /* validation failed silently — allow checkout */ }
      }
    }

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
            // Total sessions = sessions-per-package × quantity purchased
            const totalQty = items.reduce((s, it) => s + it.quantity, 0)
            const sessionCount = (svc as Record<string, unknown>)?.packageSessions
              ? Number((svc as Record<string, unknown>).packageSessions) * totalQty
              : totalQty
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
        salesInvoiceNumber: issuedOfficialInvoice ? normalizeSI(salesInvoiceNumber) : null,
        referenceNumber: referenceNumber.trim() || null,
        notes: orderNotes.trim() || null,
        unpaid: asUnpaid,
      }
      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create order'); setSubmitting(false); return }

      // Deduct wallet balances after order is created
      // Exclude HMO and GL — those are accounts receivable, handled on the backend
      const RECEIVABLE_METHODS = ['HMO', 'GL']

      // 1. Deduct any explicit wallet payment lines (excluding activeWallet — handled separately below)
      const walletPayments = payments.filter(p =>
        p.walletId &&
        toNum(p.amount) > 0 &&
        p.walletId !== activeWallet?.id &&
        !RECEIVABLE_METHODS.includes(p.method) &&
        p.method !== 'PACKAGE'
      )
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

      // 2. Deduct the activeWallet (VIP/Prepaid scanned via barcode or search) — once only
      if (activeWallet) {
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

      // 3. Package session deduction — deduct total item quantity as sessions.
      // Only count items with a non-zero unit price; ₱0 add-ons (e.g. BASIC SESSION)
      // are free companions and must NOT consume a package slot.
      const packagePayment = payments.find(p => p.method === 'PACKAGE' && p.walletId && p.reference?.startsWith('PKG:'))
      if (packagePayment) {
        const pkgId = packagePayment.reference?.replace('PKG:', '') || ''
        const totalSessions = items.filter(it => toNum(it.unitPrice) > 0).reduce((s, it) => s + it.quantity, 0)
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
      submittingRef.current = false
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
        setNewRef({ name: '', type: 'DOCTOR', affiliation: '', specialization: '' })
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
                {filteredServices.map(s => (
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

          {/* Patient Name — disabled for Verdana (seminars/trainings have no patient) */}
          <div className="relative">
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
              Patient Name {branch === 'VERDANA_STORE' && <span className="text-xs font-normal">(disabled — seminar / training)</span>}
            </label>
            <input
              value={branch === 'VERDANA_STORE' ? '' : patientName}
              onChange={e => { setPatientName(e.target.value); setPatientSearch(e.target.value) }}
              onFocus={() => patientSearch.length >= 2 && setShowPatientDrop(true)}
              onBlur={() => setTimeout(() => setShowPatientDrop(false), 200)}
              placeholder={branch === 'VERDANA_STORE' ? 'N/A — Seminar / Training' : 'Search patient...'}
              disabled={branch === 'VERDANA_STORE'}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none disabled:bg-gray-100 disabled:text-gray-400" style={{ borderColor: 'var(--light-gray)' }}
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
                Clinician Name {branch === 'VERDANA_STORE'
                  ? <span className="text-xs font-normal">(disabled — seminar / training)</span>
                  : (isAdvancePayment || hasUnearnedItems) && <span className="text-xs font-normal">(disabled — unearned revenue)</span>}
              </label>
              <input
                value={(isAdvancePayment || hasUnearnedItems || branch === 'VERDANA_STORE') ? '' : clinicianName}
                onChange={e => { setClinicianName(e.target.value); setClinicianSearch(e.target.value) }}
                onFocus={() => clinicianSearch.length >= 2 && setShowClinicianDrop(true)}
                onBlur={() => setTimeout(() => setShowClinicianDrop(false), 200)}
                placeholder={branch === 'VERDANA_STORE' ? 'N/A — Seminar / Training' : (isAdvancePayment || hasUnearnedItems) ? 'N/A — Unearned Revenue' : 'Search clinician...'}
                disabled={isAdvancePayment || hasUnearnedItems || branch === 'VERDANA_STORE'}
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
                  <div className="flex gap-2">
                    {(['DOCTOR', 'LAW_FIRM'] as const).map(t => (
                      <label key={t} className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl border cursor-pointer text-xs flex-1"
                        style={newRef.type === t ? { borderColor: 'var(--teal)', background: 'var(--pale-teal)', color: 'var(--deep-teal)' } : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                        <input type="radio" name="newRefType" checked={newRef.type === t} onChange={() => setNewRef({ ...newRef, type: t })} />
                        {t === 'LAW_FIRM' ? 'Law Firm' : 'Doctor'}
                      </label>
                    ))}
                  </div>
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
                const dedAmt = (d: { rate: number; valueType?: string }) => d.valueType === 'FIXED' ? Number(d.rate) : base * (Number(d.rate) / 100)
                return (
                  <div className="ml-1 pl-3 border-l-2 space-y-0.5" style={{ borderColor: 'var(--light-gray)' }}>
                    {cm.deductions.map(d => {
                      const amt = dedAmt(d)
                      return (
                        <div key={d.id} className="flex justify-between text-xs" style={{ color: 'var(--mid-gray)' }}>
                          <span>{d.name} ({d.valueType === 'FIXED' ? formatCurrency(Number(d.rate)) : `${Number(d.rate)}%`}){d.account ? ` → ${d.account.accountNumber}` : ''}</span>
                          <span className="font-medium text-red-500">-{formatCurrency(amt)}</span>
                        </div>
                      )
                    })}
                    <div className="flex justify-between text-xs font-semibold pt-0.5" style={{ color: 'var(--teal)' }}>
                      <span>Net to {cm.account ? cm.account.accountNumber : 'account'}</span>
                      <span>{formatCurrency(base - cm.deductions.reduce((s, d) => s + dedAmt(d), 0))}</span>
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
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {packageWallets.flatMap(w =>
                      (w.packages || [])
                        .filter((p: WalletPackage) => p.isActive !== false && (p.totalSessions - p.usedSessions) > 0)
                        .map((p: WalletPackage) => {
                          const remaining = p.totalSessions - p.usedSessions
                          const perSession = toNum(p.amountPaid) / p.totalSessions
                          return (
                            <button key={p.id} onClick={() => {
                              setSelectedPackageWallet(w)
                              setPayments(prev => {
                                const existing = prev.findIndex(pm => pm.method === 'PACKAGE')
                                const payment = { method: 'PACKAGE' as const, amount: perSession, walletId: w.id, reference: `PKG:${p.id}` }
                                if (existing >= 0) return prev.map((pm, i) => i === existing ? payment : pm)
                                return [...prev, payment]
                              })
                              const pkgSvc = services.find((s: ServiceItem) => s.id === p.serviceId)
                              const eligIds: string[] = pkgSvc?.eligibleFor
                                ? (pkgSvc.eligibleFor as { eligibleServiceId: string }[]).map((e: { eligibleServiceId: string }) => e.eligibleServiceId)
                                : []
                              setItems(prev => prev.map(it => {
                                const isElig = eligIds.length === 0 || !it.serviceId || eligIds.includes(it.serviceId)
                                return isElig ? { ...it, unitPrice: perSession, lineTotal: perSession * it.quantity } : it
                              }))
                              setPackageSearch(w.patientName)
                              setPackageWallets([])
                            }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded-lg flex justify-between items-start">
                              <div>
                                <span className="font-medium block">{w.patientName}</span>
                                <span className="text-xs" style={{ color: '#6b7280' }}>{p.serviceName}{p.department ? ` · ${p.department}` : ''}</span>
                              </div>
                              <div className="text-right ml-2 shrink-0">
                                <span className="text-xs font-semibold block" style={{ color: '#1e40af' }}>{remaining} sessions left</span>
                                <span className="text-xs" style={{ color: '#6b7280' }}>{formatCurrency(perSession)}/session</span>
                              </div>
                            </button>
                          )
                        })
                    )}
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
                {glWallets.filter(w => w.soaStatus === 'With GL and SOA' && toNum(w.balance) > 0).length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {glWallets.filter(w => w.soaStatus === 'With GL and SOA' && toNum(w.balance) > 0).map(w => {
                      const agency = (w as unknown as { agency?: string }).agency || ''
                      const displayName = agency ? `${w.patientName} (${agency})` : w.patientName
                      return (
                        <button key={w.id} onClick={() => {
                          setPayments(prev => {
                            const existingIdx = prev.findIndex(pm => pm.method === 'GL')
                            const newPay = { method: 'GL' as const, amount: 0, walletId: w.id, reference: displayName }
                            if (existingIdx >= 0) return prev.map((pm, i) => i === existingIdx ? newPay : pm)
                            return [...prev, newPay]
                          })
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
                {glWallets.length > 0 && glWallets.filter(w => w.soaStatus === 'With GL and SOA' && toNum(w.balance) > 0).length === 0 && (
                  <p className="text-xs" style={{ color: '#c2410c' }}>No eligible GL wallets found. The wallet must be set to &quot;With GL and SOA&quot; and have a remaining balance to be used for checkout.</p>
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
                        setPayments(prev => {
                          const existingIdx = prev.findIndex(pm => pm.method === 'ADVANCE')
                          const newPay = { method: 'ADVANCE' as const, amount: 0, walletId: w.id, reference: w.patientName }
                          if (existingIdx >= 0) return prev.map((pm, i) => i === existingIdx ? newPay : pm)
                          return [...prev, newPay]
                        })
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
            <div className="rounded-xl border p-3" style={{ borderColor: '#FFBA6B', background: '#F9F2EB' }}>
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--gold)' }}>
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
                  onChange={e => setSalesInvoiceNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 0001"
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
            {orderType === 'PRODUCT' && (
              <>
                <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>VAT (12%)</span><span style={{ color: 'var(--mid-gray)' }}>{formatCurrency(netAmount * 12 / 112)}</span></div>
                <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Net of VAT</span><span style={{ color: 'var(--mid-gray)' }}>{formatCurrency(netAmount / 1.12)}</span></div>
              </>
            )}
            <div className="flex justify-between text-sm"><span style={{ color: 'var(--mid-gray)' }}>Total Payments</span><span style={{ color: 'var(--charcoal)' }}>{formatCurrency(totalPayments)}</span></div>
            {changeDue >= 0 ? (
              <div className="flex justify-between text-sm"><span style={{ color: 'var(--mid-gray)' }}>Change</span><span className="text-green-700">{formatCurrency(changeDue)}</span></div>
            ) : (
              <div className="flex justify-between text-sm"><span style={{ color: 'var(--mid-gray)' }}>Remaining Balance</span><span className="text-red-600">{formatCurrency(Math.abs(changeDue))}</span></div>
            )}
            {(hasUnearnedItems || isAdvancePayment) && (
              <div className="flex justify-between text-sm mt-1 pt-1 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <span className="font-medium" style={{ color: 'var(--gold)' }}>Revenue Type</span>
                <span className="font-medium" style={{ color: 'var(--gold)' }}>Unearned Revenue</span>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={() => handleSubmit(false)}
            disabled={submitting || items.length === 0 || servicePaymentShort}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--teal)' }}
          >
            {submitting && <Loader2 className="animate-spin" size={16} />}
            Complete Order
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={submitting || items.length === 0}
            title="Record the session now with its correct date; collect payment later. It will show as Unpaid in Orders."
            className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 border"
            style={{ borderColor: '#f59e0b', color: '#b45309', background: '#fffbeb' }}
          >
            Save as Unpaid (collect later)
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
  const [dateFrom, setDateFrom] = useState(firstOfMonth())
  const [dateTo, setDateTo] = useState(today())
  const [statusFilter, setStatusFilter] = useState('')
  const [showVoided, setShowVoided] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [payUnpaidOrder, setPayUnpaidOrder] = useState<Order | null>(null)
  const [ordPage, setOrdPage] = useState(1)
  const [ordPageSize, setOrdPageSize] = useState(25)
  const [orderSearch, setOrderSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ordSortField, setOrdSortField] = useState('orderNumber')
  const [ordSortDir, setOrdSortDir] = useState<'asc' | 'desc'>('desc')
  const [viewOrder, setViewOrder] = useState<Order | null>(null)
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [editItems, setEditItems] = useState<{ name: string; quantity: number; unitPrice: number; lineTotal: number; serviceId?: string }[]>([])
  const [editPayments, setEditPayments] = useState<{ method: string; amount: number; paymentModeId?: string; walletId?: string; reference?: string }[]>([])
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
  // Per-item service search for the line-items list in Edit Order
  const [editItemResults, setEditItemResults] = useState<ServiceItem[][]>([])
  const editItemTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>([])
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
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('pageSize', '500')
      const r = await fetch(`/api/pos/orders?${params}`)
      const d = await r.json()
      setOrders(normalize(d) as Order[])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [selectedBranch, dateFrom, dateTo, statusFilter, debouncedSearch])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const handleAction = async (id: string, action: 'reopen' | 'void' | 'returnByBuyer' | 'refund') => {
    if (action === 'refund') {
      if (!window.confirm('Mark this order as REFUNDED?\n\nThe product(s) are added back to inventory and the sale is recorded as fully refunded (shows under 7160 Sales Returns + the product refund rate). Net collected becomes 0.')) return
      await fetch(`/api/pos/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
    } else if (action === 'void') {
      const reason = window.prompt('Reason for voiding this order:')
      if (!reason) return
      await fetch(`/api/pos/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
    } else if (action === 'returnByBuyer') {
      if (!window.confirm('Mark this order as RETURNED BY BUYER?\n\nThis restocks the returned product(s) into inventory (with a "RETURNED BY BUYER" reference) and reverses the sale.')) return
      await fetch(`/api/pos/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
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
    setEditItemResults(o.items.map(() => []))
    editItemTimers.current = o.items.map(() => null)
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
          paymentModeId: p.paymentModeId || null,
          walletId: p.walletId || null,
          reference: p.reference || null,
        })),
        issuedOfficialInvoice: editIssuedOfficialInvoice,
        salesInvoiceNumber: editIssuedOfficialInvoice ? normalizeSI(editSalesInvoiceNumber) : null,
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
          onChange={e => {
            const val = e.target.value
            setOrderSearch(val)
            setOrdPage(1)
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
            searchDebounceRef.current = setTimeout(() => setDebouncedSearch(val), 350)
          }}
          placeholder="Search by order #, patient, clinician, or item..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ borderColor: 'var(--light-gray)' }}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {canSelectBranch && (
          <select value={selectedBranch} onChange={e => { setSelectedBranch(e.target.value); setOrdPage(1) }}
            className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        )}
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setOrdPage(1) }}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setOrdPage(1) }}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setOrdPage(1) }}
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
          // Search is server-side; apply voided toggle + date + branch guards client-side
          // Guards ensure correct results even if the API returns unfiltered data (e.g. old server code)
          const displayOrders = (showVoided || statusFilter === 'VOIDED' ? orders : orders.filter(o => o.status !== 'VOIDED'))
            .filter(o => {
              const d = new Date(o.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
              if (dateFrom && d < dateFrom) return false
              if (dateTo && d > dateTo) return false
              if (selectedBranch && o.branch !== selectedBranch) return false
              return true
            })
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
                      {o.branch === 'SANDBOX_EAST' ? 'AHEA' : o.branch === 'SANDBOX_GREENHILLS' ? 'AHGH' : o.branch === 'VERDANA_STORE' ? 'Verdana' : o.branch === 'AURA_INSTITUTE' ? 'AHI' : o.branch}
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
                      <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background: o.returnedByBuyer ? '#d1fae5' : badge.bg, color: o.returnedByBuyer ? '#065f46' : badge.color }}>
                        {o.returnedByBuyer ? 'RETURNED' : o.status}
                      </span>
                      {o.paymentStatus === 'UNPAID' && <span className="ml-1 px-2 py-1 rounded-full text-xs font-semibold" style={{ background: '#fef3c7', color: '#b45309' }}>UNPAID</span>}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button onClick={() => setViewOrder(o)} className="p-1.5 rounded-lg hover:bg-gray-100" title="View Details">
                          <Eye size={13} style={{ color: 'var(--mid-gray)' }} />
                        </button>
                        {o.paymentStatus === 'UNPAID' && o.status !== 'VOIDED' && (
                          <button onClick={() => setPayUnpaidOrder(o)} className="p-1.5 rounded-lg hover:bg-amber-50" title="Record Payment">
                            <DollarSign size={13} className="text-amber-600" />
                          </button>
                        )}
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
                            {o.orderType === 'PRODUCT' && (
                              <button onClick={() => handleAction(o.id, 'returnByBuyer')} className="p-1.5 rounded-lg hover:bg-emerald-50" title="Returned by Buyer (restock)">
                                <Undo2 size={13} className="text-emerald-600" />
                              </button>
                            )}
                            {o.orderType === 'PRODUCT' && (
                              <button onClick={() => handleAction(o.id, 'refund')} className="p-1.5 rounded-lg hover:bg-purple-50" title="Refunded (add stock back + record refund)">
                                <RotateCcw size={13} className="text-purple-600" />
                              </button>
                            )}
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

      {/* Record payment on an Unpaid order */}
      {payUnpaidOrder && (
        <RecordUnpaidPaymentModal order={payUnpaidOrder} onClose={() => setPayUnpaidOrder(null)} onSaved={() => { setPayUnpaidOrder(null); fetchOrders() }} />
      )}

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
                <div><span style={{ color: 'var(--mid-gray)' }}>Branch:</span> <span style={{ color: 'var(--charcoal)' }}>{viewOrder.branch === 'SANDBOX_EAST' ? 'AHEA' : viewOrder.branch === 'SANDBOX_GREENHILLS' ? 'AHGH' : viewOrder.branch === 'VERDANA_STORE' ? 'Verdana' : viewOrder.branch === 'AURA_INSTITUTE' ? 'AHI' : viewOrder.branch}</span></div>
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
                  <button onClick={() => {
                    setEditItems(prev => [...prev, { name: '', quantity: 1, unitPrice: 0, lineTotal: 0 }])
                    setEditItemResults(prev => [...prev, []])
                    editItemTimers.current = [...editItemTimers.current, null]
                  }}
                    className="text-xs font-medium" style={{ color: 'var(--teal)' }}>+ Add Item</button>
                </div>
                <div className="space-y-2">
                  {editItems.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: 'var(--off-white)' }}>
                      {/* Service name with search dropdown */}
                      <div className="flex-1 relative">
                        <input
                          value={it.name}
                          onChange={e => {
                            const val = e.target.value
                            setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, name: val, serviceId: undefined } : x))
                            // Debounced service search
                            if (editItemTimers.current[idx]) clearTimeout(editItemTimers.current[idx]!)
                            if (val.length >= 1) {
                              editItemTimers.current[idx] = setTimeout(async () => {
                                try {
                                  const r = await fetch(`/api/services?pageSize=20&branch=${editOrder?.branch || ''}&search=${encodeURIComponent(val)}`)
                                  const d = await r.json()
                                  setEditItemResults(prev => {
                                    const next = [...prev]
                                    next[idx] = (Array.isArray(d) ? d : d.data || []) as ServiceItem[]
                                    return next
                                  })
                                } catch { /* ignore */ }
                              }, 300)
                            } else {
                              setEditItemResults(prev => { const next = [...prev]; next[idx] = []; return next })
                            }
                          }}
                          placeholder="Search service…"
                          className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}
                        />
                        {(editItemResults[idx]?.length ?? 0) > 0 && (
                          <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border rounded-xl shadow-lg max-h-48 overflow-auto" style={{ borderColor: 'var(--light-gray)' }}>
                            {editItemResults[idx].map(svc => (
                              <button key={svc.id} onMouseDown={e => e.preventDefault()} onClick={() => {
                                setEditItems(prev => prev.map((x, i) => i === idx ? {
                                  ...x,
                                  name: svc.name,
                                  unitPrice: Number(svc.price),
                                  lineTotal: Number(svc.price) * x.quantity,
                                  serviceId: svc.id,
                                } : x))
                                setEditItemResults(prev => { const next = [...prev]; next[idx] = []; return next })
                              }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                                {svc.name}
                                {svc.department && <span className="ml-1 text-xs" style={{ color: 'var(--mid-gray)' }}>({svc.department})</span>}
                                <span className="ml-2 text-xs font-medium" style={{ color: 'var(--teal)' }}>{formatCurrency(Number(svc.price))}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
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
                        <button onClick={() => {
                          setEditItems(prev => prev.filter((_, i) => i !== idx))
                          setEditItemResults(prev => prev.filter((_, i) => i !== idx))
                          editItemTimers.current = editItemTimers.current.filter((_, i) => i !== idx)
                        }} className="p-1 rounded hover:bg-red-50">
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
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {editPackageWallets.flatMap(w =>
                            (w.packages || [])
                              .filter((p: WalletPackage) => p.isActive !== false && (p.totalSessions - p.usedSessions) > 0)
                              .map((p: WalletPackage) => {
                                const remaining = p.totalSessions - p.usedSessions
                                const perSession = toNum(p.amountPaid) / p.totalSessions
                                return (
                                  <button key={p.id} onClick={() => {
                                    setEditPayments([{ method: 'PACKAGE', amount: perSession, walletId: w.id, reference: `PKG:${p.id}` }])
                                    setEditItems(prev => prev.map(it => ({ ...it, unitPrice: perSession, lineTotal: perSession * it.quantity })))
                                    setEditShowPackagePay(false)
                                  }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded-lg flex justify-between items-start">
                                    <div>
                                      <span className="font-medium block">{w.patientName}</span>
                                      <span className="text-xs" style={{ color: '#6b7280' }}>{p.serviceName}{p.department ? ` · ${p.department}` : ''}</span>
                                    </div>
                                    <div className="text-right ml-2 shrink-0">
                                      <span className="text-xs font-semibold block" style={{ color: '#1e40af' }}>{remaining} sessions left</span>
                                      <span className="text-xs" style={{ color: '#6b7280' }}>{formatCurrency(perSession)}/session</span>
                                    </div>
                                  </button>
                                )
                              })
                          )}
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
                      onChange={e => setEditSalesInvoiceNumber(e.target.value.replace(/\D/g, ""))}
                      placeholder="e.g. 0001"
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
  const [createForm, setCreateForm] = useState({ patientName: '', patientId: '', patientEmail: '', accountId: '', dateObtained: '', paymentModeId: '', glAmount: '', totalGlAmount: '', agency: '', diagnosis: '', initialRewardPoints: '', branch: 'ALL' })
  const [createAttachments, setCreateAttachments] = useState<string[]>([])
  const [createApprovedServices, setCreateApprovedServices] = useState<string[]>([])
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
  // Close GL column-filter dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterDropRef.current && !filterDropRef.current.contains(e.target as Node)) {
        setOpenFilterCol(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustForm, setAdjustForm] = useState({ amount: '', orderNumber: '', reason: '' })
  const [adjusting, setAdjusting] = useState(false)
  const [startOpen, setStartOpen] = useState(false)
  const [startVal, setStartVal] = useState('')
  const [startBusy, setStartBusy] = useState(false)
  const [walletEditAttachments, setWalletEditAttachments] = useState<string[]>([])
  const [editApprovedServices, setEditApprovedServices] = useState<string[]>([])
  const [walletEditSaving, setWalletEditSaving] = useState(false)
  const [walletEditError, setWalletEditError] = useState('')
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
  // Admin-only branch filter for the wallet list (non-admins are always locked to their branch)
  const [walletBranchFilter, setWalletBranchFilter] = useState('')
  const [glFilters, setGlFilters] = useState<{ services: string[]; soaStatus: string[]; branch: string[]; glStatus: string[]; agency: string; diagnosis: string }>({ services: [], soaStatus: [], branch: [], glStatus: [], agency: '', diagnosis: '' })
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null)
  const filterDropRef = useRef<HTMLDivElement>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const fetchWallets = useCallback(async () => {
    setLoading(true)
    try {
      const qp = new URLSearchParams()
      if (search) qp.set('search', search)
      qp.set('walletType', walletTypeFilter)
      qp.set('pageSize', '500')   // load all wallets so admins always see everything
      if (showDeletedWallets) qp.set('includeDeleted', 'true')
      if (!isAdmin(session)) {
        // Non-admin users are locked to their branch
        qp.set('branch', panelBranch)
      } else if (walletBranchFilter) {
        // Admins can optionally narrow to a specific branch
        qp.set('branch', walletBranchFilter)
      }
      const r = await fetch(`/api/pos/wallets?${qp}`)
      const d = await r.json()
      setWallets(normalize(d) as DigitalWallet[])
    } catch {
      setWallets([])
    } finally {
      setLoading(false)
    }
  }, [search, walletTypeFilter, showDeletedWallets, panelBranch, walletBranchFilter, session])

  useEffect(() => { fetchWallets() }, [fetchWallets])

  // Client-side filtered wallet list for GL column filters
  const glDisplayWallets = useMemo(() => {
    if (walletTypeFilter !== 'GL') return wallets
    return wallets.filter(w => {
      const wgl = w as unknown as { approvedServices?: string[] | null; soaStatus?: string | null; agency?: string | null; diagnosis?: string | null }
      if (glFilters.services.length > 0) {
        const svcs = Array.isArray(wgl.approvedServices) ? wgl.approvedServices : []
        if (!glFilters.services.some(s => svcs.includes(s))) return false
      }
      if (glFilters.soaStatus.length > 0) {
        const st = wgl.soaStatus || 'With GL/No SOA'
        if (!glFilters.soaStatus.includes(st)) return false
      }
      if (glFilters.branch.length > 0) {
        const b = (w.branch as string) || 'ALL'
        if (!glFilters.branch.includes(b)) return false
      }
      if (glFilters.agency.trim()) {
        if (!(wgl.agency || '').toLowerCase().includes(glFilters.agency.trim().toLowerCase())) return false
      }
      if (glFilters.diagnosis.trim()) {
        if (!(wgl.diagnosis || '').toLowerCase().includes(glFilters.diagnosis.trim().toLowerCase())) return false
      }
      if (glFilters.glStatus.length > 0) {
        const approved = toNum((w as unknown as { totalGlAmount?: number | string }).totalGlAmount)
        const remaining = toNum(w.balance)
        let computedStatus: string
        if (approved > 0 && remaining > 0 && remaining < approved) computedStatus = 'Ongoing'
        else if (approved > 0 && remaining > 0 && Math.abs(remaining - approved) < 0.01) computedStatus = 'Not Started'
        else computedStatus = 'Other'
        if (!glFilters.glStatus.includes(computedStatus)) return false
      }
      return true
    })
  }, [wallets, walletTypeFilter, glFilters])

  const [createError, setCreateError] = useState('')
  const [createDuplicateWarning, setCreateDuplicateWarning] = useState<string | null>(null)
  const [createApplicationNo, setCreateApplicationNo] = useState('2nd Application')
  const createWallet = async (allowDuplicate = false) => {
    if (!createForm.patientName.trim()) { setCreateError('Name is required'); return }
    setCreateError('')
    try {
      // When allowing a duplicate GL wallet, append the application label to the name
      const effectiveName = allowDuplicate && walletTypeFilter === 'GL'
        ? `${createForm.patientName.trim()} (${createApplicationNo})`
        : createForm.patientName.trim()
      const payload = {
        ...createForm,
        patientName: effectiveName,
        walletType: walletTypeFilter,
        allowDuplicate,
        // For PACKAGE wallets, balance is computed from package data (not from initialBalance field)
        initialBalance: walletTypeFilter !== 'PACKAGE' && createForm.glAmount ? parseFloat(createForm.glAmount) : undefined,
        totalGlAmount: walletTypeFilter === 'GL' && createForm.totalGlAmount ? parseFloat(createForm.totalGlAmount) : undefined,
        initialRewardPoints: createForm.initialRewardPoints ? parseInt(createForm.initialRewardPoints) : undefined,
        attachmentUrls: walletTypeFilter === 'GL' ? createAttachments : undefined,
        approvedServices: walletTypeFilter === 'GL' && createApprovedServices.length > 0 ? createApprovedServices : undefined,
        diagnosis: walletTypeFilter === 'GL' && createForm.diagnosis ? createForm.diagnosis : undefined,
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
        if (walletTypeFilter === 'GL') {
          // GL wallets: allow re-application — show confirmation instead of hard error
          setCreateDuplicateWarning(createForm.patientName.trim())
          return
        }
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
      setCreateDuplicateWarning(null)
      setCreateApplicationNo('2nd Application')
      setCreateForm({ patientName: '', patientId: '', patientEmail: '', accountId: '', dateObtained: '', paymentModeId: '', glAmount: '', totalGlAmount: '', agency: '', diagnosis: '', initialRewardPoints: '', branch: 'ALL' })
      setCreateAttachments([])
      setCreateApprovedServices([])
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
      const r = await fetch(`/api/pos/wallets/${w.id}`, { cache: 'no-store' })
      const d = await r.json()
      setWalletDetail(d)
    } catch {
      setWalletDetail(null)
    }
  }

  const submitAdjust = async () => {
    if (!walletDetail) return
    const amt = parseFloat(adjustForm.amount)
    if (!(amt > 0)) { alert('Enter an amount greater than zero.'); return }
    setAdjusting(true)
    try {
      const r = await fetch(`/api/pos/wallets/${walletDetail.id}/adjust`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: amt, orderNumber: adjustForm.orderNumber, reason: adjustForm.reason }) })
      if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Failed to adjust balance'); return }
      setAdjustForm({ amount: '', orderNumber: '', reason: '' }); setAdjustOpen(false)
      await loadWalletDetail(walletDetail); fetchWallets()
    } finally { setAdjusting(false) }
  }

  const submitStarting = async () => {
    if (!walletDetail) return
    const v = parseFloat(startVal)
    if (isNaN(v) || v < 0) { alert('Enter a valid starting balance.'); return }
    if (!window.confirm(`Set the starting balance to ₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}? The remaining balance shifts by the same amount.`)) return
    setStartBusy(true)
    try {
      const r = await fetch(`/api/pos/wallets/${walletDetail.id}/starting-balance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startingBalance: v }) })
      if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Failed to set starting balance'); return }
      setStartOpen(false); setStartVal('')
      await loadWalletDetail(walletDetail); fetchWallets()
    } finally { setStartBusy(false) }
  }

  const deleteAdjustment = async (logId: string) => {
    if (!walletDetail) return
    if (!window.confirm('Delete this balance adjustment? The amount will be removed from the wallet balance.')) return
    const r = await fetch(`/api/pos/wallets/${walletDetail.id}/adjust?logId=${logId}`, { method: 'DELETE' })
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Failed to delete adjustment'); return }
    await loadWalletDetail(walletDetail); fetchWallets()
  }

  const startWalletEdit = () => {
    if (!walletDetail) return
    // For GL wallets: detect any existing "(Nth Application)" suffix in the name
    const existingName = walletDetail.patientName || ''
    const appNoMatch = existingName.match(/\s*\((\d+(?:st|nd|rd|th) Application)\)$/)
    const detectedAppNo = appNoMatch ? appNoMatch[1] : 'None'
    setWalletEditForm({
      patientName: walletDetail.patientName || '',
      patientEmail: walletDetail.patientEmail || '',
      dateObtained: walletDetail.dateObtained ? String(walletDetail.dateObtained).split('T')[0] : '',
      agency: (walletDetail.agency as string) || '',
      diagnosis: (walletDetail.diagnosis as string) || '',
      vipTier: walletDetail.vipTier || '',
      balance: String(toNum(walletDetail.balance)),
      attachmentUrl: (walletDetail.attachmentUrl as string) || '',
      accountId: (walletDetail.accountId as string) || '',
      rewardPoints: String(walletDetail.rewardPoints || 0),
      // Use '' when null so saving without touching this field keeps it null (not 0).
      // Always read from totalGlAmount — never from balance — to prevent reversion.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      totalGlAmount: (walletDetail as any).totalGlAmount != null ? String(Number((walletDetail as any).totalGlAmount) || 0) : '',
      branch: (walletDetail.branch as string) || 'ALL',
      applicationNo: walletDetail.walletType === 'GL' ? detectedAppNo : '',
    })
    // Populate approved services for GL wallets
    const existingSvcs = walletDetail.approvedServices as string[] | null
    setEditApprovedServices(Array.isArray(existingSvcs) ? existingSvcs : [])
    // Populate multi-file attachments — prefer new attachmentUrls array, fall back to legacy single URL
    const existingUrls = walletDetail.attachmentUrls as string[] | null
    setWalletEditAttachments(
      existingUrls && existingUrls.length > 0
        ? existingUrls
        : walletDetail.attachmentUrl
          ? [normalizeFileUrl(walletDetail.attachmentUrl as string)]
          : []
    )
    setWalletEditing(true)

    // For GL wallets: if diagnosis not yet stored, auto-fetch from CRM by patient name
    if (walletDetail.walletType === 'GL' && !walletDetail.diagnosis && walletDetail.patientName) {
      const searchName = walletDetail.patientName.replace(/\s*\(\d+(?:st|nd|rd|th) Application\)$/, '').trim()
      findCrmPatient(searchName).then(match => {
        if (match?.diagnosis) {
          setWalletEditForm(prev => ({ ...prev, diagnosis: (match.diagnosis as string) || '' }))
        }
      }).catch(() => {})
    }
  }

  const saveWalletEdit = async () => {
    if (!walletDetail) return
    setWalletEditSaving(true)
    setWalletEditError('')
    try {
      // Detect intentional Approved SOA edits so the API's protection guard
      // permits the write. Without this flag the PUT silently preserves the
      // existing value — which made user-driven corrections appear to "reset"
      // on the next reload.
      const formGlNum = walletDetail.walletType === 'GL' && walletEditForm.totalGlAmount !== ''
        ? Number(walletEditForm.totalGlAmount)
        : null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbGlRaw = (walletDetail as any).totalGlAmount
      const dbGlNum = dbGlRaw != null ? Number(dbGlRaw) : null
      const glAmountChanged = walletDetail.walletType === 'GL'
        && formGlNum !== null
        && formGlNum > 0
        && (dbGlNum === null || Math.abs(formGlNum - dbGlNum) > 0.005)

      const r = await fetch(`/api/pos/wallets/${walletDetail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: walletEditForm.patientName,
          patientEmail: walletEditForm.patientEmail,
          dateObtained: walletEditForm.dateObtained || null,
          agency: walletEditForm.agency || null,
          ...(walletDetail.walletType === 'GL' ? { diagnosis: walletEditForm.diagnosis || null } : {}),
          ...(walletDetail.walletType === 'GL' ? { approvedServices: editApprovedServices.length > 0 ? editApprovedServices : null } : {}),
          vipTier: walletEditForm.vipTier || null,
          // HMO balance is computed from unpaid POS orders — never editable.
          // GL balance is set at creation and auto-managed by orders — not editable after creation.
          ...(walletDetail.walletType !== 'HMO' && walletDetail.walletType !== 'GL' ? { balance: walletEditForm.balance } : {}),
          attachmentUrl: walletEditForm.attachmentUrl || null,
          attachmentUrls: walletDetail.walletType === 'GL' ? walletEditAttachments : undefined,
          accountId: walletEditForm.accountId || null,
          ...(['VIP', 'PREPAID_CARD'].includes(walletDetail.walletType) ? { rewardPoints: walletEditForm.rewardPoints } : {}),
          ...(walletDetail.walletType === 'GL' ? { totalGlAmount: walletEditForm.totalGlAmount } : {}),
          ...(glAmountChanged ? { forceUpdateGlAmount: true } : {}),
          branch: walletEditForm.branch || 'ALL',
        }),
      })
      if (r.ok) {
        // Snapshot the GL amount that was just saved so we can re-apply it after
        // the re-fetch (prevents read-after-write race where the GET returns a
        // slightly stale totalGlAmount and makes it look like the value reverted).
        const savedGlAmount = walletDetail.walletType === 'GL'
          ? (walletEditForm.totalGlAmount !== '' ? Number(walletEditForm.totalGlAmount) : null)
          : undefined
        setWalletEditing(false)
        await loadWalletDetail(walletDetail)
        // Re-apply the saved amount after the reload in case the re-fetch was stale
        if (savedGlAmount !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setWalletDetail((prev: any) => prev ? { ...prev, totalGlAmount: savedGlAmount } : null)
        }
        fetchWallets()
      } else {
        const errData = await r.json().catch(() => ({}))
        setWalletEditError(errData.error || `Save failed (${r.status})`)
      }
    } catch (e) {
      setWalletEditError(`Network error: ${e}`)
    }
    setWalletEditSaving(false)
  }

  const syncAllDiagnosis = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      // Group wallets by clean patient name (strip "(Nth Application)" suffix)
      const nameToWallets = new Map<string, DigitalWallet[]>()
      for (const w of wallets) {
        if (!w.patientName) continue
        const cleanName = w.patientName.replace(/\s*\(\d+(?:st|nd|rd|th) Application\)$/, '').trim()
        if (!nameToWallets.has(cleanName)) nameToWallets.set(cleanName, [])
        nameToWallets.get(cleanName)!.push(w)
      }
      let updated = 0
      for (const [name, group] of Array.from(nameToWallets.entries())) {
        try {
          const match = await findCrmPatient(name)
          if (!match?.diagnosis) continue
          for (const w of group) {
            // Skip if diagnosis is already up to date
            if ((w as unknown as { diagnosis?: string | null }).diagnosis === match.diagnosis) continue
            await fetch(`/api/pos/wallets/${w.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ diagnosis: match.diagnosis }),
            })
            updated++
          }
        } catch { /* skip individual failures */ }
      }
      setSyncResult(`${updated} wallet${updated !== 1 ? 's' : ''} updated`)
      fetchWallets()
    } catch {
      setSyncResult('Sync failed — please try again')
    }
    setSyncing(false)
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
      // PREPAID CARD LAYOUT — Aura Health Rehab Clinic. White (ink-saving) with brand-colour
      // accents and an inline arch logo, designed to feel like a premium upgrade.
      const DEEP = '#244952', TEAL = '#4A8073', GOLD = '#C69849', CLAY = '#CF9D88'
      // Aura arch mark (3 concentric bands), inline SVG so it stays crisp & recolourable.
      const auraArch = (h: number) => `<svg height="${h}" viewBox="0 0 200 104" style="display:block">
        <path d="M10,100 A90,90 0 0,1 190,100 L166,100 A66,66 0 0,0 34,100 Z" fill="#296354"/>
        <path d="M40,100 A60,60 0 0,1 160,100 L140,100 A40,40 0 0,0 60,100 Z" fill="#8EAF74"/>
        <path d="M66,100 A34,34 0 0,1 134,100 L116,100 A16,16 0 0,0 84,100 Z" fill="#6E8E8E"/>
      </svg>`
      frontHtml = `<div class="card" style="background:#FFFFFF;border:1px solid #e5e7eb;position:relative;overflow:hidden">
        <div style="position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg, ${GOLD}, ${CLAY}, ${GOLD})"></div>
        <div style="position:relative;padding:14px 18px;display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;box-sizing:border-box">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="display:flex;align-items:center;gap:8px">
              ${auraArch(34)}
              <div style="line-height:1.1">
                <div style="font-size:13px;font-weight:800;letter-spacing:1.5px;color:${DEEP};font-family:Arial,Helvetica,sans-serif">AURA HEALTH</div>
                <div style="font-size:7.5px;font-weight:700;letter-spacing:3.5px;color:${TEAL};font-family:Arial,Helvetica,sans-serif">REHAB CLINIC</div>
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:9px;font-weight:800;letter-spacing:1.5px;color:${DEEP}">RELOADABLE</div>
              <div style="font-size:16px;font-weight:900;letter-spacing:0.5px;color:${GOLD};font-family:Arial Black,Arial,sans-serif;line-height:1.05">PREPAID</div>
              <div style="font-size:16px;font-weight:900;letter-spacing:0.5px;color:${GOLD};font-family:Arial Black,Arial,sans-serif;line-height:1.05">CARD</div>
            </div>
          </div>
          <div style="position:relative">
            <div style="font-size:17px;font-weight:700;letter-spacing:2.5px;color:${DEEP};font-family:'Courier New',monospace;margin-bottom:8px">${cardNum}</div>
            <div style="display:flex;justify-content:space-between;align-items:flex-end">
              <div>
                <div style="font-size:7px;color:${TEAL};font-weight:800;letter-spacing:1.5px">CARDHOLDER</div>
                <div style="font-size:12px;font-weight:800;color:${DEEP};letter-spacing:0.3px">${w.patientName}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:7px;color:${TEAL};font-weight:800;letter-spacing:1.5px">VALID THRU</div>
                <div style="font-size:12px;font-weight:700;color:${DEEP};font-family:'Courier New',monospace">${expStr}</div>
              </div>
            </div>
          </div>
        </div>
      </div>`
      backHtml = `<div class="card" style="background:#FFFFFF;border:1px solid #e5e7eb;position:relative;overflow:hidden">
        <div style="position:absolute;left:0;right:0;top:0;height:2.5px;background:linear-gradient(90deg, ${GOLD}, ${TEAL}, ${GOLD})"></div>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;padding:12px;box-sizing:border-box;text-align:center">
          <img src="${barcodeImg}" style="height:48px;max-width:250px;margin-bottom:7px" />
          <div style="font-size:9.5px;font-weight:800;color:${DEEP};margin-bottom:5px">
            Thank you for choosing Aura Health Rehab Clinic<br/>for your health and rehabilitation needs!
          </div>
          <div style="font-size:7px;color:#555;text-align:justify;padding:0 12px;margin-bottom:8px;line-height:1.45">
            Your reloadable card lets you earn points every time you avail of our services or purchase products. Simply present this card during each visit to collect points and redeem exclusive Aura Health Rehab Clinic rewards and merchandise.
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            ${auraArch(19)}
            <div style="font-size:9.5px;font-weight:800;letter-spacing:1px;color:${DEEP}">AURA HEALTH REHAB CLINIC</div>
          </div>
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
    const branchLabel = soaBranch === 'SANDBOX_EAST' ? 'Aura Health Rehab Clinic — East' : soaBranch === 'SANDBOX_GREENHILLS' ? 'Aura Health Rehab Clinic — Greenhills' : soaBranch === 'VERDANA_STORE' ? 'Verdana Store' : soaBranch === 'AURA_INSTITUTE' ? 'Aura Health Institute' : 'All Branches'
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

      {/* GL-only: bulk CRM diagnosis sync */}
      {walletTypeFilter === 'GL' && (
        <div className="flex items-center gap-3">
          <button onClick={syncAllDiagnosis} disabled={syncing}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-semibold border"
            style={{ borderColor: '#bfdbfe', background: '#eff6ff', color: '#2563eb', opacity: syncing ? 0.7 : 1, cursor: syncing ? 'not-allowed' : 'pointer' }}>
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {syncing ? 'Syncing from CRM…' : '↻ Sync Diagnosis from CRM'}
          </button>
          {syncResult && (
            <span className="text-xs font-medium" style={{ color: syncResult.includes('failed') ? '#dc2626' : '#15803d' }}>
              {syncResult.includes('failed') ? '✗' : '✓'} {syncResult}
            </span>
          )}
        </div>
      )}

      {/* Show deleted toggle + admin branch filter */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--mid-gray)' }}>
          <input type="checkbox" checked={showDeletedWallets} onChange={e => setShowDeletedWallets(e.target.checked)} className="rounded" />
          Show deleted wallets
        </label>
        {isAdmin(session) && (
          <select
            value={walletBranchFilter}
            onChange={e => setWalletBranchFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border outline-none bg-white"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <option value="">All Branches</option>
            <option value="SANDBOX_EAST">East Branch</option>
            <option value="SANDBOX_GREENHILLS">Greenhills Branch</option>
            <option value="VERDANA_STORE">Verdana Store</option>
            <option value="AURA_INSTITUTE">Aura Health Institute</option>
          </select>
        )}
      </div>

      {/* Wallets Table */}
      <div className="rounded-2xl border bg-white overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
        ) : wallets.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>No wallets found.</div>
        ) : walletTypeFilter === 'GL' && glDisplayWallets.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>No GL wallets match the active filters. <button onClick={() => setGlFilters({ services: [], soaStatus: [], branch: [], glStatus: [], agency: '', diagnosis: '' })} className="underline" style={{ color: 'var(--teal)' }}>Clear filters</button></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--light-gray)' }}>
                {(walletTypeFilter === 'HMO'
                  ? [{ label: 'HMO Provider', field: 'patientName' }, { label: 'Type', field: '' }, { label: 'Receivable Balance', field: 'balance' }, { label: 'Branch', field: 'branch' }, { label: 'Transactions', field: '' }, { label: '', field: '' }]
                  : walletTypeFilter === 'GL'
                  ? [{ label: 'Patient Name', field: 'patientName' }, { label: 'Agency', field: 'agency', filterKey: 'agency', filterType: 'text' as const }, { label: 'Diagnosis', field: '', filterKey: 'diagnosis', filterType: 'text' as const }, { label: 'Services', field: '', filterKey: 'services', filterOptions: GL_SERVICE_TYPES }, { label: 'Approved SOA', field: 'totalGlAmount' }, { label: 'Remaining Balance', field: 'balance' }, { label: 'Status', field: '', filterKey: 'glStatus', filterOptions: ['Ongoing', 'Not Started'] }, { label: 'Branch', field: 'branch', filterKey: 'branch', filterOptions: Object.keys(BRANCH_LABELS) }, { label: 'SOA Status', field: 'soaStatus', filterKey: 'soaStatus', filterOptions: ['With GL/No SOA', 'With GL and SOA'] }, { label: 'Attachment', field: '' }, { label: '', field: '' }]
                  : ['VIP', 'PREPAID_CARD'].includes(walletTypeFilter)
                  ? [{ label: 'Patient Name', field: 'patientName' }, { label: 'Type', field: '' }, { label: 'Balance', field: 'balance' }, { label: 'Branch', field: 'branch' }, { label: 'Barcode', field: 'barcode' }, { label: 'Packages', field: '' }, { label: 'Reward Points', field: 'rewardPoints' }, { label: '', field: '' }]
                  : walletTypeFilter === 'PACKAGE'
                  ? [{ label: 'Patient Name', field: 'patientName' }, { label: 'Package', field: '' }, { label: 'Sessions Used', field: '' }, { label: 'Remaining', field: '' }, { label: 'Amount Paid', field: '' }, { label: 'Rate/Session', field: '' }, { label: 'Branch', field: 'branch' }, { label: 'Status', field: '' }, { label: '', field: '' }]
                  : [{ label: 'Patient Name', field: 'patientName' }, { label: 'Type', field: '' }, { label: 'Balance', field: 'balance' }, { label: 'Branch', field: 'branch' }, { label: 'Packages', field: '' }, { label: '', field: '' }]
                ).map((h: { label: string; field: string; filterKey?: string; filterType?: 'multi' | 'text'; filterOptions?: string[] }) => {
                  const fk = h.filterKey
                  const isFilterActive = fk && walletTypeFilter === 'GL' && (
                    h.filterType === 'text'
                      ? !!(glFilters as unknown as Record<string, string>)[fk]
                      : ((glFilters as unknown as Record<string, string[]>)[fk]?.length ?? 0) > 0
                  )
                  return (
                    <th key={h.label || 'actions'} className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider ${h.field ? 'cursor-pointer select-none hover:bg-gray-50' : ''}`}
                      style={{ color: wSortField === h.field && h.field ? 'var(--teal)' : 'var(--mid-gray)', position: 'relative' }}
                      onClick={() => { if (!h.field) return; if (wSortField === h.field) { setWSortDir(d => d === 'asc' ? 'desc' : 'asc') } else { setWSortField(h.field); setWSortDir('asc') } }}>
                      <span className="flex items-center gap-1">
                        {h.label}
                        {h.field && wSortField === h.field && (
                          <span className="text-[10px]">{wSortDir === 'asc' ? '▲' : '▼'}</span>
                        )}
                        {fk && walletTypeFilter === 'GL' && (
                          <button type="button"
                            onClick={e => { e.stopPropagation(); setOpenFilterCol(openFilterCol === fk ? null : fk) }}
                            className="ml-0.5 p-0.5 rounded hover:bg-gray-200"
                            style={{ color: isFilterActive ? '#2563eb' : '#9ca3af' }}>
                            <Filter size={9} />
                          </button>
                        )}
                      </span>
                      {openFilterCol === fk && fk && (
                        <div ref={filterDropRef}
                          className="absolute z-30 top-full left-0 mt-0.5 bg-white border rounded-xl shadow-xl p-3"
                          style={{ borderColor: 'var(--light-gray)', minWidth: 200 }}
                          onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Filter: {h.label}</span>
                            {isFilterActive && (
                              <button type="button" onClick={() => setGlFilters(prev => ({ ...prev, [fk]: h.filterType === 'text' ? '' : [] }))}
                                className="text-[10px] underline" style={{ color: 'var(--teal)' }}>Clear</button>
                            )}
                          </div>
                          {h.filterType === 'text' ? (
                            <input autoFocus
                              value={(glFilters as unknown as Record<string, string>)[fk] || ''}
                              onChange={e => setGlFilters(prev => ({ ...prev, [fk]: e.target.value }))}
                              placeholder={`Search ${h.label.toLowerCase()}…`}
                              className="w-full px-2 py-1.5 text-xs rounded-lg border outline-none"
                              style={{ borderColor: 'var(--light-gray)' }} />
                          ) : (
                            <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto">
                              {(h.filterOptions || []).map(opt => {
                                const cur = (glFilters as unknown as Record<string, string[]>)[fk] || []
                                const isChecked = cur.includes(opt)
                                return (
                                  <label key={opt} className="flex items-center gap-2 text-xs py-1 px-1 cursor-pointer rounded hover:bg-gray-50">
                                    <input type="checkbox" checked={isChecked}
                                      onChange={() => setGlFilters(prev => {
                                        const c = (prev as unknown as Record<string, string[]>)[fk] || []
                                        return { ...prev, [fk]: isChecked ? c.filter(v => v !== opt) : [...c, opt] }
                                      })}
                                      style={{ accentColor: 'var(--teal)' }} />
                                    {BRANCH_LABELS[opt] || opt}
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {walletTypeFilter === 'PACKAGE' ? (
                // For PACKAGE wallets: show each WalletPackage as a separate row
                [...wallets].sort((a, b) => {
                  const av = (a as DigitalWallet)[wSortField as keyof DigitalWallet]
                  const bv = (b as DigitalWallet)[wSortField as keyof DigitalWallet]
                  const an = typeof av === 'number' ? av : typeof av === 'string' ? (isNaN(Number(av)) ? av.toLowerCase() : Number(av)) : 0
                  const bn = typeof bv === 'number' ? bv : typeof bv === 'string' ? (isNaN(Number(bv)) ? bv.toLowerCase() : Number(bv)) : 0
                  if (an < bn) return wSortDir === 'asc' ? -1 : 1
                  if (an > bn) return wSortDir === 'asc' ? 1 : -1
                  return 0
                }).flatMap(w =>
                  (w.packages || []).length > 0
                    ? (w.packages || []).map((pkg: WalletPackage) => {
                        const remaining = pkg.totalSessions - pkg.usedSessions
                        const perSession = toNum(pkg.amountPaid) / pkg.totalSessions
                        const isFullyUsed = remaining <= 0
                        const isInactive = pkg.isActive === false
                        return (
                          <tr key={pkg.id}
                            className={`border-b cursor-pointer ${w.isActive === false || isInactive ? 'bg-red-50 opacity-60' : isFullyUsed ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                            style={{ borderColor: 'var(--light-gray)' }}
                            onClick={() => w.isActive !== false && !isInactive && loadWalletDetail(w)}>
                            <td className="px-5 py-3 font-medium" style={{ color: w.isActive === false ? '#991b1b' : 'var(--charcoal)' }}>
                              {w.patientName}
                              {w.isActive === false && <span className="ml-2 text-xs font-normal text-red-600">(Deleted)</span>}
                            </td>
                            <td className="px-5 py-3">
                              <span className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{pkg.serviceName}</span>
                              {pkg.department && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ background: '#fce7f3', color: '#be185d' }}>{pkg.department}</span>}
                            </td>
                            <td className="px-5 py-3 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{pkg.usedSessions}/{pkg.totalSessions}</td>
                            <td className="px-5 py-3">
                              <span className="text-sm font-semibold" style={{ color: remaining > 0 ? 'var(--deep-teal)' : 'var(--mid-gray)' }}>{remaining}</span>
                            </td>
                            <td className="px-5 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(toNum(pkg.amountPaid))}</td>
                            <td className="px-5 py-3 text-xs" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(perSession)}/session</td>
                            <td className="px-5 py-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{ background: (w.branch === 'SANDBOX_EAST' ? '#dbeafe' : w.branch === 'SANDBOX_GREENHILLS' ? '#dcfce7' : '#f3e8ff'),
                                         color: (w.branch === 'SANDBOX_EAST' ? '#1e40af' : w.branch === 'SANDBOX_GREENHILLS' ? '#166534' : '#7e22ce') }}>
                                {w.branch === 'SANDBOX_EAST' ? 'East' : w.branch === 'SANDBOX_GREENHILLS' ? 'GH' : 'All'}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={isInactive || isFullyUsed ? { background: '#f3f4f6', color: '#6b7280' } : { background: '#dcfce7', color: '#166534' }}>
                                {isInactive ? 'Inactive' : isFullyUsed ? 'Exhausted' : 'Active'}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-1.5">
                                <button className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                                  View Wallet
                                </button>
                                {w.isActive !== false && (
                                  <button onClick={(e) => { e.stopPropagation(); deleteWallet(w) }}
                                    className="p-1.5 rounded-lg hover:bg-red-50" title="Delete Wallet">
                                    <Trash2 size={13} className="text-red-500" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    : [(
                        <tr key={w.id}
                          className={`border-b cursor-pointer ${w.isActive === false ? 'bg-red-50 opacity-60' : 'hover:bg-gray-50'}`}
                          style={{ borderColor: 'var(--light-gray)' }}
                          onClick={() => w.isActive !== false && loadWalletDetail(w)}>
                          <td className="px-5 py-3 font-medium" style={{ color: w.isActive === false ? '#991b1b' : 'var(--charcoal)' }}>{w.patientName}</td>
                          <td className="px-5 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>No packages</td>
                          <td colSpan={7} className="px-5 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>—</td>
                        </tr>
                      )]
                )
              ) : (
              // All other wallet types: show one row per wallet
              [...(walletTypeFilter === 'GL' ? glDisplayWallets : wallets)].sort((a, b) => {
                const f = wSortField as keyof DigitalWallet
                const av = a[f], bv = b[f]
                const an = typeof av === 'number' ? av : typeof av === 'string' ? (isNaN(Number(av)) ? av.toLowerCase() : Number(av)) : 0
                const bn = typeof bv === 'number' ? bv : typeof bv === 'string' ? (isNaN(Number(bv)) ? bv.toLowerCase() : Number(bv)) : 0
                if (an < bn) return wSortDir === 'asc' ? -1 : 1
                if (an > bn) return wSortDir === 'asc' ? 1 : -1
                return 0
              }).map(w => {
                const typeBadge = WALLET_TYPE_COLORS[w.walletType] || { bg: '#f3f4f6', color: '#374151' }
                const isGlZeroBalance = walletTypeFilter === 'GL' && w.isActive !== false && toNum(w.balance) <= 0
                return (
                  <tr key={w.id}
                    className={`border-b cursor-pointer ${w.isActive === false ? 'bg-red-50 opacity-60' : isGlZeroBalance ? 'bg-gray-100 opacity-70' : 'hover:bg-gray-50'}`}
                    style={{ borderColor: 'var(--light-gray)' }}
                    onClick={() => w.isActive !== false && loadWalletDetail(w)}>
                    <td className="px-5 py-3 font-medium" style={{ color: w.isActive === false ? '#991b1b' : isGlZeroBalance ? '#6b7280' : 'var(--charcoal)' }}>
                      {w.patientName}
                      {w.isActive === false && <span className="ml-2 text-xs font-normal text-red-600">(Deleted)</span>}
                      {isGlZeroBalance && <span className="ml-2 text-xs font-normal" style={{ color: '#9ca3af' }}>(No Balance)</span>}
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
                      <td className="px-5 py-3 text-xs" style={{ color: 'var(--charcoal)' }}>
                        {(w as unknown as { diagnosis?: string | null }).diagnosis
                          ? <span>{(w as unknown as { diagnosis?: string | null }).diagnosis}</span>
                          : <span style={{ color: 'var(--light-gray)' }}>—</span>}
                      </td>
                    )}
                    {walletTypeFilter === 'GL' && (() => {
                      const svcs = (w as unknown as { approvedServices?: string[] | null }).approvedServices
                      return (
                        <>
                          <td className="px-5 py-3">
                            {Array.isArray(svcs) && svcs.length > 0
                              ? <div className="flex flex-wrap gap-1">
                                  {svcs.map(s => (
                                    <span key={s} className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                      style={{ background: '#dbeafe', color: '#1e40af' }}>{s}</span>
                                  ))}
                                </div>
                              : <span style={{ color: 'var(--light-gray)' }}>—</span>}
                          </td>
                          <td className="px-5 py-3 font-semibold" style={{ color: '#15803d' }}>
                            {(w as unknown as { totalGlAmount?: number | string }).totalGlAmount
                              ? formatCurrency(toNum((w as unknown as { totalGlAmount?: number | string }).totalGlAmount))
                              : <span className="text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>—</span>}
                          </td>
                        </>
                      )
                    })()}
                    <td className="px-5 py-3 font-semibold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(toNum(w.balance))}</td>
                    {walletTypeFilter === 'GL' && (() => {
                      const approved = toNum((w as unknown as { totalGlAmount?: number | string }).totalGlAmount)
                      const remaining = toNum(w.balance)
                      if (approved > 0 && remaining > 0 && remaining < approved) {
                        return <td className="px-5 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#dcfce7', color: '#15803d' }}>Ongoing</span></td>
                      } else if (approved > 0 && remaining > 0 && Math.abs(remaining - approved) < 0.01) {
                        return <td className="px-5 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#f3f4f6', color: '#6b7280' }}>Not Started</span></td>
                      } else {
                        return <td className="px-5 py-3"><span style={{ color: 'var(--light-gray)' }}>—</span></td>
                      }
                    })()}
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
                        {/* SOA Status dropdown — gates checkout usage */}
                        <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                          <select
                            value={w.soaStatus || 'With GL/No SOA'}
                            onChange={async (e) => {
                              const soaStatus = e.target.value
                              await fetch(`/api/pos/wallets/${w.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ soaStatus }),
                              })
                              fetchWallets()
                            }}
                            className="text-xs px-2 py-1.5 rounded-lg border font-semibold outline-none cursor-pointer"
                            style={{
                              borderColor: w.soaStatus === 'With GL and SOA' ? '#86efac' : '#fed7aa',
                              background: w.soaStatus === 'With GL and SOA' ? '#f0fdf4' : '#fff7ed',
                              color: w.soaStatus === 'With GL and SOA' ? '#15803d' : '#c2410c',
                            }}>
                            <option value="With GL/No SOA">With GL/No SOA</option>
                            <option value="With GL and SOA">With GL and SOA</option>
                          </select>
                        </td>
                        {/* Attachment files */}
                        <td className="px-5 py-3">
                          {(() => {
                            const gl = w as unknown as { attachmentUrl?: string; attachmentUrls?: string[] }
                            const urls: string[] =
                              gl.attachmentUrls && gl.attachmentUrls.length > 0
                                ? gl.attachmentUrls
                                : gl.attachmentUrl
                                  ? [normalizeFileUrl(gl.attachmentUrl)]
                                  : []
                            if (urls.length === 0) return <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>—</span>
                            return (
                              <div className="flex flex-col gap-0.5">
                                {urls.map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()} className="text-xs underline" style={{ color: 'var(--teal)' }}>
                                    {urls.length > 1 ? `File ${i + 1}` : 'View File'}
                                  </a>
                                ))}
                              </div>
                            )
                          })()}
                        </td>
                        {/* Actions — Delete only (Print SOA is HMO-only) */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
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
              }))
              }
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
                          onClick={() => { setCreateForm({ ...createForm, patientName: pt.name, patientId: pt.id, diagnosis: pt.diagnosis || '' }); setCrmSearch(pt.name); setShowCrmDrop(false) }}
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
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Diagnosis</label>
                    <input value={createForm.diagnosis} onChange={e => setCreateForm({ ...createForm, diagnosis: e.target.value })}
                      placeholder="e.g. Cerebral Palsy, ASD, Language Delay"
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)', background: createForm.patientId ? '#f0fdfa' : 'white' }}
                      readOnly={!!createForm.patientId} />
                    {createForm.patientId
                      ? <p className="text-xs mt-1" style={{ color: 'var(--teal)' }}>Auto-filled from Patient CRM</p>
                      : <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Patient&apos;s primary diagnosis (snapshot from CRM if linked)</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--mid-gray)' }}>Approved Services</label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {GL_SERVICE_TYPES.map(svc => (
                        <label key={svc} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                          <input type="checkbox" checked={createApprovedServices.includes(svc)}
                            onChange={e => setCreateApprovedServices(prev => e.target.checked ? [...prev, svc] : prev.filter(s => s !== svc))}
                            className="rounded" style={{ accentColor: 'var(--teal)' }} />
                          {svc}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: 'var(--mid-gray)' }}>Service types covered by this Guarantee Letter</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Approved SOA *</label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>&#8369;</span>
                      <input type="number" min={0} step="0.01" value={createForm.totalGlAmount || ''}
                        onChange={e => setCreateForm({ ...createForm, totalGlAmount: e.target.value })}
                        placeholder="e.g. 10000"
                        className="flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Full approved amount on the Guarantee Letter (AR — what the agency owes us)</p>
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
                    <div className="flex flex-col gap-2">
                      {createAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {createAttachments.map((url, i) => (
                            <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                              <a href={url} target="_blank" rel="noopener noreferrer" className="underline">File {i + 1}</a>
                              <button type="button" onClick={() => setCreateAttachments(prev => prev.filter((_, j) => j !== i))}
                                className="p-0.5 rounded hover:bg-red-50"><X size={10} className="text-red-400" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label className="self-start px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                        + Add File
                        <input type="file" accept="image/*,.pdf" multiple className="hidden" onChange={async (e) => {
                          const files = Array.from(e.target.files || [])
                          if (!files.length) return
                          for (const file of files) {
                            const fd = new FormData(); fd.append('file', file)
                            try {
                              const res = await fetch('/api/upload', { method: 'POST', body: fd })
                              const data = await res.json()
                              if (data.url) setCreateAttachments(prev => [...prev, data.url])
                            } catch { setCreateError('File upload failed') }
                          }
                          e.target.value = ''
                        }} />
                      </label>
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
                  <option value="SANDBOX_EAST">East Branch</option>
                  <option value="SANDBOX_GREENHILLS">Greenhills Branch</option>
                  <option value="AURA_INSTITUTE">Aura Health Institute</option>
                </select>
              </div>
              {createError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{createError}</p>}

              {/* GL duplicate confirmation */}
              {createDuplicateWarning && walletTypeFilter === 'GL' && (
                <div className="rounded-xl border p-3 space-y-2.5" style={{ borderColor: '#f59e0b', background: '#fffbeb' }}>
                  <p className="text-xs font-semibold" style={{ color: '#92400e' }}>
                    Already exists — Wallet &ldquo;{createDuplicateWarning}&rdquo; already registered.
                    Do you want to make another one?
                  </p>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: '#92400e' }}>Application #</label>
                    <select value={createApplicationNo} onChange={e => setCreateApplicationNo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-xs outline-none bg-white" style={{ borderColor: '#f59e0b' }}>
                      {['1st Application','2nd Application','3rd Application','4th Application','5th Application'].map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => createWallet(true)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
                      Yes — Create as {createApplicationNo}
                    </button>
                    <button type="button" onClick={() => setCreateDuplicateWarning(null)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                      No
                    </button>
                  </div>
                </div>
              )}

              {!createDuplicateWarning && (
                <button onClick={() => createWallet()} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
                  {walletTypeFilter === 'HMO' ? 'Add HMO' : walletTypeFilter === 'GL' ? 'Create GL Wallet' : 'Create Wallet'}
                </button>
              )}
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
                  {walletDetail.walletType === 'GL' && (
                    <div className="col-span-2">
                      <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Application #</label>
                      <select
                        value={walletEditForm.applicationNo || 'None'}
                        onChange={e => {
                          const appNo = e.target.value
                          const baseName = (walletEditForm.patientName || '').replace(/\s*\(\d+(?:st|nd|rd|th) Application\)$/, '').trim()
                          const newName = appNo === 'None' ? baseName : `${baseName} (${appNo})`
                          setWalletEditForm(p => ({ ...p, applicationNo: appNo, patientName: newName }))
                        }}
                        className="w-full px-3 py-2 rounded-xl border text-xs outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                        {['None', '1st Application', '2nd Application', '3rd Application', '4th Application', '5th Application'].map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  )}
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
                  {/* HMO balance is auto-computed from unpaid POS orders — read-only.
                      GL balance is auto-managed by orders (decremented on create, restored on void).
                      It is set once at wallet creation and cannot be manually edited thereafter. */}
                  {walletDetail.walletType !== 'HMO' && walletDetail.walletType !== 'GL' && (
                    <div>
                      <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Balance</label>
                      <input type="number" step="0.01" value={walletEditForm.balance || ''} onChange={e => setWalletEditForm(p => ({ ...p, balance: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  )}
                  {walletDetail.walletType === 'GL' && (
                    <div>
                      <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Remaining Balance (Usable Amount)</label>
                      <div className="w-full px-3 py-2 rounded-xl border text-sm bg-gray-50" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                        {formatCurrency(toNum(walletEditForm.balance))}
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>
                        Read-only. Set at wallet creation; automatically decremented by orders and restored on void.
                      </p>
                    </div>
                  )}
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
                        <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Approved SOA</label>
                        <input type="number" step="0.01" value={walletEditForm.totalGlAmount || ''} onChange={e => setWalletEditForm(p => ({ ...p, totalGlAmount: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div>
                        <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Agency</label>
                        <input value={walletEditForm.agency || ''} onChange={e => setWalletEditForm(p => ({ ...p, agency: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-medium" style={{ color: 'var(--mid-gray)' }}>Diagnosis</label>
                          <button type="button"
                            onClick={() => {
                              if (!walletDetail?.patientName) return
                              const searchName = walletDetail.patientName.replace(/\s*\(\d+(?:st|nd|rd|th) Application\)$/, '').trim()
                              findCrmPatient(searchName).then(match => {
                                if (!match) { alert('No matching patient found in CRM.'); return }
                                if (match.diagnosis) {
                                  setWalletEditForm(prev => ({ ...prev, diagnosis: (match.diagnosis as string) || '' }))
                                } else {
                                  alert('Patient found in CRM but has no diagnosis on record.')
                                }
                              }).catch(() => alert('CRM lookup failed.'))
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-lg font-semibold"
                            style={{ background: '#dbeafe', color: '#1e40af' }}>
                            ↻ Sync from CRM
                          </button>
                        </div>
                        <input value={walletEditForm.diagnosis || ''} onChange={e => setWalletEditForm(p => ({ ...p, diagnosis: e.target.value }))}
                          placeholder="e.g. Cerebral Palsy, ASD"
                          className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>From Patient CRM — edit manually if needed</p>
                      </div>
                      <div className="col-span-2">
                        <label className="font-medium mb-1.5 block" style={{ color: 'var(--mid-gray)' }}>Approved Services</label>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          {GL_SERVICE_TYPES.map(svc => (
                            <label key={svc} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                              <input type="checkbox" checked={editApprovedServices.includes(svc)}
                                onChange={e => setEditApprovedServices(prev => e.target.checked ? [...prev, svc] : prev.filter(s => s !== svc))}
                                className="rounded" style={{ accentColor: 'var(--teal)' }} />
                              {svc}
                            </label>
                          ))}
                        </div>
                        <p className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>Service types covered by this Guarantee Letter</p>
                      </div>
                      <div className="col-span-2">
                        <label className="font-medium mb-1 block" style={{ color: 'var(--mid-gray)' }}>Attachments</label>
                        <div className="flex flex-col gap-2">
                          {walletEditAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {walletEditAttachments.map((url, i) => (
                                <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="underline">File {i + 1}</a>
                                  <button type="button" onClick={() => setWalletEditAttachments(prev => prev.filter((_, j) => j !== i))}
                                    className="p-0.5 rounded hover:bg-red-50"><X size={10} className="text-red-400" /></button>
                                </div>
                              ))}
                            </div>
                          )}
                          <label className="self-start px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                            + Add File
                            <input type="file" accept="image/*,.pdf" multiple className="hidden" onChange={async (ev) => {
                              const files = Array.from(ev.target.files || [])
                              if (!files.length) return
                              for (const file of files) {
                                const fd = new FormData(); fd.append('file', file)
                                try { const res = await fetch('/api/upload', { method: 'POST', body: fd }); const d = await res.json(); if (d.url) setWalletEditAttachments(prev => [...prev, d.url]) } catch {}
                              }
                              ev.target.value = ''
                            }} />
                          </label>
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
                      <option value="SANDBOX_EAST">East Branch</option>
                      <option value="SANDBOX_GREENHILLS">Greenhills Branch</option>
                      <option value="AURA_INSTITUTE">Aura Health Institute</option>
                    </select>
                  </div>
                </div>
                {walletEditError && (
                  <p className="text-xs text-red-600 flex items-center gap-1 pt-1">
                    <AlertCircle size={12} />{walletEditError}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={saveWalletEdit} disabled={walletEditSaving}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                    {walletEditSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => { setWalletEditing(false); setWalletEditError('') }}
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
              {walletDetail.walletType !== 'GL' && (
                <span className="text-sm font-semibold" style={{ color: 'var(--deep-teal)' }}>
                  {walletDetail.walletType === 'HMO' ? 'Outstanding: ' : 'Balance: '}
                  {formatCurrency(toNum(walletDetail.balance))}
                </span>
              )}
            </div>
            {/* GL: two prominent metric cards — #1 AR tracking, #2 consumable balance */}
            {walletDetail.walletType === 'GL' && (
              <div className="grid grid-cols-2 gap-3 mt-2 mb-3">
                <div className="rounded-xl p-3" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#15803d' }}>① Approved SOA</p>
                  <p className="text-lg font-bold" style={{ color: '#15803d' }}>
                    {formatCurrency(toNum((walletDetail as unknown as { totalGlAmount?: number }).totalGlAmount))}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#6b7280' }}>AR amount — what the agency owes us</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--deep-teal)' }}>② Remaining Balance</p>
                  <p className="text-lg font-bold" style={{ color: 'var(--deep-teal)' }}>
                    {formatCurrency(toNum(walletDetail.balance))}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#6b7280' }}>Remaining usable amount for orders</p>
                </div>
              </div>
            )}
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
                {!['VIP', 'PREPAID_CARD'].includes(walletDetail.walletType) && (
                  <button onClick={() => setShowAddPackage(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                    <Plus size={12} /> Add Package
                  </button>
                )}
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
              {walletDetail.walletType === 'HMO' ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Transactions</h4>
                    <a href={`/accounts-receivable?type=HMO&wallet=${walletDetail.id}`}
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
                            <td colSpan={5} className="px-3 py-2 text-right font-bold text-xs">TOTAL OUTSTANDING (UNPAID)</td>
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
              {/* Running Balance — monetary wallets and GL (consumable balance tracking) */}
              {['VIP', 'PREPAID_CARD', 'DOWNPAYMENT', 'ADVANCE', 'GL'].includes(walletDetail.walletType) && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Running Balance</h4>
                    {walletDetail.walletType === 'GL' && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setStartOpen(o => !o); setAdjustOpen(false) }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                          {startOpen ? 'Cancel' : 'Edit starting balance'}
                        </button>
                        <button onClick={() => { setAdjustOpen(o => !o); setStartOpen(false) }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                          {adjustOpen ? 'Cancel adjustment' : 'Adjust balance'}
                        </button>
                        <a href={`/accounts-receivable?type=GL&wallet=${walletDetail.id}`}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                          See Accounts Receivables
                        </a>
                      </div>
                    )}
                  </div>
                  {walletDetail.walletType === 'GL' && adjustOpen && (
                    <div className="rounded-xl border p-3 mb-3" style={{ borderColor: 'var(--teal)', background: 'var(--off-white)' }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Restore balance from a voided order</p>
                      <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Use this when a voided transaction did not return its amount to the wallet. It adds the amount back and tags the voided order in the ledger.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Amount to restore (₱)</label>
                          <input value={adjustForm.amount} onChange={e => setAdjustForm(f => ({ ...f, amount: e.target.value }))} inputMode="decimal" placeholder="0.00" className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Voided order #</label>
                          <input value={adjustForm.orderNumber} onChange={e => setAdjustForm(f => ({ ...f, orderNumber: e.target.value }))} placeholder="e.g. 3999" className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Reason <span className="font-normal text-gray-400">(optional)</span></label>
                          <input value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. void not auto-reversed" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                      </div>
                      <button onClick={submitAdjust} disabled={adjusting} className="mt-3 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{adjusting ? 'Saving…' : 'Restore balance'}</button>
                    </div>
                  )}
                  {walletDetail.walletType === 'GL' && startOpen && (
                    <div className="rounded-xl border p-3 mb-3" style={{ borderColor: 'var(--teal)', background: 'var(--off-white)' }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Correct the starting balance</p>
                      <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>Sets the usable amount at creation (the &ldquo;Starting Balance&rdquo; row). The remaining balance shifts by the same difference; no ledger entry is added.</p>
                      <div className="flex items-end gap-2 flex-wrap">
                        <div>
                          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Starting balance (₱)</label>
                          <input value={startVal} onChange={e => setStartVal(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-44 px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <button onClick={submitStarting} disabled={startBusy} className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{startBusy ? 'Saving…' : 'Set starting balance'}</button>
                      </div>
                    </div>
                  )}
                  {walletDetail.walletType === 'GL' && (
                    <p className="text-[10px] mb-2" style={{ color: 'var(--mid-gray)' }}>
                      Tracks consumption of the Consumable Balance (②). Starting balance reflects the usable amount at the time this GL wallet was created or imported.
                    </p>
                  )}
                  {(walletDetail.ledger || []).length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No money movements recorded yet.</p>
                  ) : (
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'var(--off-white)' }}>
                            {['Date', 'Description', 'Starting', 'Deduction', 'Credit', 'Remaining'].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(walletDetail.ledger || []).map((e, i) => {
                            const rowStyle: React.CSSProperties = e.voided ? { opacity: 0.55 } : {}
                            const typeBadge = e.type === 'DEDUCTION'
                              ? { bg: '#fee2e2', color: '#991b1b', label: 'Deduction' }
                              : e.type === 'RELOAD'
                              ? { bg: '#dcfce7', color: '#166534', label: 'Load' }
                              : e.type === 'STARTING_BALANCE'
                              ? { bg: '#e0e7ff', color: '#3730a3', label: 'Starting Balance' }
                              : { bg: '#dbeafe', color: '#1e40af', label: 'Reversal' }
                            return (
                              <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)', ...rowStyle }}>
                                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{formatDate(e.date)}</td>
                                <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>
                                  <span className="inline-block px-1.5 py-0.5 mr-1.5 rounded text-[10px] font-semibold align-middle" style={{ background: typeBadge.bg, color: typeBadge.color }}>{typeBadge.label}</span>
                                  {e.description}{e.voided ? ' (voided)' : ''}
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(e.balanceBefore)}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: e.debit > 0 ? '#991b1b' : 'var(--mid-gray)' }}>{e.debit > 0 ? `− ${formatCurrency(e.debit)}` : '—'}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: e.credit > 0 ? '#166534' : 'var(--mid-gray)' }}>{e.credit > 0 ? `+ ${formatCurrency(e.credit)}` : '—'}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(e.balanceAfter)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
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
                              <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>
                                {log.description}
                                {walletDetail.walletType === 'GL' && log.action === 'VOID_REVERSAL' && (log.description || '').startsWith('Balance adjustment:') && (
                                  <button onClick={() => deleteAdjustment(log.id)} className="ml-2 inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: '#b91c1c' }} title="Delete this adjustment (reverses the balance)"><Trash2 size={11} /> Delete</button>
                                )}
                              </td>
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
  departments?: string[]
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
  const [deptScope, setDeptScope] = useState<string[]>([])
  const toggleDept = (d: string) => setDeptScope(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
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

  const DEPARTMENTS = ['OT', 'SLP', 'PT', 'SPED', 'PSYCHOLOGY', 'MD', 'ORTHOSIS_PROSTHESIS']
  const DEPT_LABEL: Record<string, string> = { PT: 'Physical Therapy', OT: 'Occupational Therapy', SLP: 'Speech-Language', SPED: 'Special Ed', PSYCHOLOGY: 'Psychology', MD: 'Medical', ORTHOSIS_PROSTHESIS: 'Orthosis/Prosthesis' }

  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', type: 'PERCENTAGE', value: 0, branch: '', walletType: '', accountId: '' })
    setAccountSearch('')
    setRules([])
    setDeptScope([])
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
    setDeptScope(ds.departments || [])
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
        departments: deptScope,
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

              {/* Department scope — which departments this discount can be applied to */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--mid-gray)' }}>Applies to departments <span className="font-normal">(leave all unticked = every department)</span></label>
                <div className="flex flex-wrap gap-2">
                  {DEPARTMENTS.map(d => (
                    <label key={d} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs"
                      style={deptScope.includes(d) ? { borderColor: 'var(--teal)', background: 'var(--pale-teal)', color: 'var(--deep-teal)' } : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                      <input type="checkbox" checked={deptScope.includes(d)} onChange={() => toggleDept(d)} />
                      {DEPT_LABEL[d] || d}
                    </label>
                  ))}
                </div>
              </div>

              {/* Per-Service / Per-Department Discount Rules */}
              {form.walletType && (
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: '#FFBA6B', background: '#F9F2EB' }}>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--gold)' }}>
                      Service-Specific Discount Rules
                    </h4>
                    <button onClick={addRule} className="text-xs font-medium px-3 py-1 rounded-lg" style={{ background: '#F5EAE5', color: 'var(--gold)' }}>
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
   ONLINE ORDERS WIDGET (verdanarehab.com)
   ══════════════════════════════════════════════════════════════ */

interface OnlineOrder {
  id: string
  paymongoId: string
  status: string
  amount: number
  customerName: string
  customerPhone: string
  customerEmail: string
  customerAddress: string
  customerCity: string
  customerZip: string
  shippingFee: number
  items: Array<{ productId: string; title: string; variantLabel?: string; quantity: number; price: number }>
  paidAt: string
  deliveryStatus: 'pending' | 'preparing' | 'shipped' | 'delivered'
}

function OnlineOrdersWidget() {
  const [orders, setOrders] = useState<OnlineOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('https://verdanarehab.com/api/orders?limit=20')
      const data = await res.json()
      setOrders(data.orders || [])
    } catch (err) {
      console.error('Failed to fetch online orders:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])

  async function updateDeliveryStatus(orderId: string, status: string) {
    setUpdatingId(orderId)
    try {
      await fetch('https://verdanarehab.com/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, deliveryStatus: status }),
      })
      await loadOrders()
    } catch (err) {
      console.error('Failed to update delivery status:', err)
    }
    setUpdatingId(null)
  }

  const pendingOrders = orders.filter(o => o.deliveryStatus === 'pending' || o.deliveryStatus === 'preparing')
  const otherOrders = orders.filter(o => o.deliveryStatus === 'shipped' || o.deliveryStatus === 'delivered')

  const statusColors: Record<string, string> = {
    pending: '#fef3c7',
    preparing: '#dbeafe',
    shipped: '#d1fae5',
    delivered: '#f3f4f6',
  }
  const statusTextColors: Record<string, string> = {
    pending: '#92400e',
    preparing: '#1e40af',
    shipped: '#065f46',
    delivered: '#6b7280',
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: pendingOrders.length > 0 ? 'var(--orange)' : 'var(--light-gray)', background: 'white' }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ background: pendingOrders.length > 0 ? '#fff7ed' : '#f8fafc' }}
      >
        <div className="flex items-center gap-2.5">
          <Globe size={16} style={{ color: 'var(--teal)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
            Online Orders (verdanarehab.com)
          </span>
          {pendingOrders.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: 'var(--orange)' }}>
              {pendingOrders.length} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); loadOrders() }}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} style={{ color: 'var(--mid-gray)' }} />
          </button>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin" size={18} style={{ color: 'var(--teal)' }} />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--mid-gray)' }}>
              No online orders yet.
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>
              {/* Pending orders first */}
              {pendingOrders.map(order => (
                <div key={order.id} className="p-4 space-y-3" style={{ background: order.deliveryStatus === 'pending' ? '#fffbeb' : 'white' }}>
                  {/* Order header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{order.id}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: statusColors[order.deliveryStatus], color: statusTextColors[order.deliveryStatus] }}>
                          {order.deliveryStatus}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--mid-gray)' }}>
                        <span className="flex items-center gap-1"><Clock size={11} /> {new Date(order.paidAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        <span className="font-semibold" style={{ color: 'var(--teal)' }}>₱{order.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {order.deliveryStatus === 'pending' && (
                        <button
                          onClick={() => updateDeliveryStatus(order.id, 'preparing')}
                          disabled={updatingId === order.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white flex items-center gap-1"
                          style={{ background: 'var(--teal)' }}>
                          {updatingId === order.id ? <Loader2 className="animate-spin" size={12} /> : <Package size={12} />}
                          Prepare
                        </button>
                      )}
                      {order.deliveryStatus === 'preparing' && (
                        <button
                          onClick={() => updateDeliveryStatus(order.id, 'shipped')}
                          disabled={updatingId === order.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white flex items-center gap-1"
                          style={{ background: '#2563eb' }}>
                          {updatingId === order.id ? <Loader2 className="animate-spin" size={12} /> : <Truck size={12} />}
                          Ship
                        </button>
                      )}
                      {order.deliveryStatus === 'shipped' && (
                        <button
                          onClick={() => updateDeliveryStatus(order.id, 'delivered')}
                          disabled={updatingId === order.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white flex items-center gap-1"
                          style={{ background: '#059669' }}>
                          {updatingId === order.id ? <Loader2 className="animate-spin" size={12} /> : <CheckCircle size={12} />}
                          Delivered
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Customer info */}
                  <div className="rounded-xl p-3 space-y-1.5" style={{ background: '#f8fafc', border: '1px solid var(--light-gray)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{order.customerName}</p>
                    <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--mid-gray)' }}>
                      <Phone size={11} /> {order.customerPhone}
                    </p>
                    <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--mid-gray)' }}>
                      <MapPin size={11} className="mt-0.5 shrink-0" />
                      <span>{order.customerAddress}, {order.customerCity} {order.customerZip}</span>
                    </p>
                  </div>

                  {/* Items */}
                  <div className="space-y-1">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs px-1">
                        <span style={{ color: 'var(--charcoal)' }}>
                          {item.quantity}× {item.title}{item.variantLabel ? ` (${item.variantLabel})` : ''}
                        </span>
                        <span style={{ color: 'var(--mid-gray)' }}>₱{(item.price * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                    {order.shippingFee > 0 && (
                      <div className="flex justify-between text-xs px-1 pt-1 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                        <span className="flex items-center gap-1" style={{ color: 'var(--mid-gray)' }}>
                          <Truck size={10} /> Shipping
                        </span>
                        <span style={{ color: 'var(--mid-gray)' }}>₱{order.shippingFee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Completed orders (collapsed) */}
              {otherOrders.length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-xs font-medium" style={{ color: 'var(--mid-gray)' }}>
                    {otherOrders.length} shipped/delivered order{otherOrders.length > 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </div>
          )}
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
  // Only Verdana and Aura Health Institute carry products for sale.
  const [prodBranch, setProdBranch] = useState('VERDANA_STORE')
  const [productSearch, setProductSearch] = useState('')
  const [showTiktokImport, setShowTiktokImport] = useState(false)
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
  const [platform, setPlatform] = useState('Clinic')
  const [configuredModes, setConfiguredModes] = useState<PaymentModeType[]>([])
  const [submitting, setSubmitting] = useState(false)
  // Synchronous re-entrancy guard: blocks duplicate orders from rapid re-clicks
  // before React re-renders the disabled button (state updates lag a render).
  const submittingRef = useRef(false)
  const [error, setError] = useState('')
  const [prodIssuedInvoice, setProdIssuedInvoice] = useState(false)
  const [prodInvoiceNumber, setProdInvoiceNumber] = useState('')
  const [prodReferenceNumber, setProdReferenceNumber] = useState('')
  const [prodNotes, setProdNotes] = useState('')
  // Variant picker
  const [variantPickerProduct, setVariantPickerProduct] = useState<InventoryProduct | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')

  // Reward points wallet state
  const [rpWalletSearch, setRpWalletSearch] = useState('')
  const [rpWalletResults, setRpWalletResults] = useState<DigitalWallet[]>([])
  const [rpSelectedWallet, setRpSelectedWallet] = useState<DigitalWallet | null>(null)
  const [rpBarcode, setRpBarcode] = useState('')
  const rpBarcodeRef = useRef<HTMLInputElement>(null)

  // Check if any payment is reward points
  const hasRewardPointsPayment = payments.some(p => p.method === 'REWARD_POINTS')

  // Receivable sale (charge to an outside customer, e.g. Sandbox Clark)
  const hasReceivablePayment = payments.some(p => p.method === 'RECEIVABLE')
  const [soldTo, setSoldTo] = useState('')
  // The buyer is looked up in the CRM so a receivable ties to a real record, but
  // a company that has never been a patient can still be typed in free-hand.
  const [soldToResults, setSoldToResults] = useState<{ id: string; name: string }[]>([])
  const [showSoldToDrop, setShowSoldToDrop] = useState(false)
  const soldToTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Who the sale is to. Asked on every checkout, not just credit sales, because an
  // official invoice needs the buyer whatever the payment mode was.
  const [buyerIsPatient, setBuyerIsPatient] = useState(false)
  const [isBusiness, setIsBusiness] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [businessTin, setBusinessTin] = useState('')
  const [buyerAddress, setBuyerAddress] = useState('')
  useEffect(() => {
    if (soldTo.trim().length < 2) { setSoldToResults([]); return }
    clearTimeout(soldToTimer.current)
    soldToTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pos/patients?search=${encodeURIComponent(soldTo)}`)
        const d = await r.json()
        setSoldToResults(Array.isArray(d) ? d.slice(0, 8) : [])
      } catch { setSoldToResults([]) }
    }, 300)
  }, [soldTo])

  useEffect(() => {
    fetch(`/api/pos/payment-modes?branch=${prodBranch}`).then(r => r.json()).then(d => setConfiguredModes(Array.isArray(d) ? d.filter((m: PaymentModeType) => m.isActive) : [])).catch(() => {})
  }, [prodBranch])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/inventory?all=true&branch=${prodBranch}`)
      .then(r => r.json())
      .then(d => setProducts(normalize(d) as InventoryProduct[]))
      .catch(() => {})
      .finally(() => setLoading(false))
    fetch('/api/pos/discount-settings')
      .then(r => r.json())
      .then(d => setDiscountSettings(normalize(d) as DiscountSetting[]))
      .catch(() => {})
  }, [prodBranch])

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase())) ||
    (p.barcode && p.barcode.toLowerCase().includes(productSearch.toLowerCase()))
  )

  const addToCart = (p: InventoryProduct, variantId?: string, variantLabel?: string) => {
    const existing = cart.findIndex(c =>
      c.inventoryItemId === p.id && c.variantId === (variantId ?? undefined)
    )
    if (existing >= 0) {
      setCart(prev => prev.map((c, i) => i === existing ? {
        ...c, quantity: c.quantity + 1,
        lineTotal: c.isFreeSample ? 0 : c.unitPrice * (c.quantity + 1),
      } : c))
    } else {
      const price = toNum(p.sellingPrice)
      setCart(prev => [...prev, {
        inventoryItemId: p.id,
        name: p.name,
        quantity: 1,
        unitPrice: price,
        lineTotal: price,
        isFreeSample: false,
        variantId: variantId ?? undefined,
        variantLabel: variantLabel ?? undefined,
      }])
    }
  }

  const handleProductClick = (p: InventoryProduct) => {
    const activeVariants = (p.variants ?? []).filter(v => v.quantity > 0)
    if (activeVariants.length > 0) {
      setVariantPickerProduct(p)
      setSelectedVariantId(activeVariants[0].id)
    } else {
      addToCart(p)
    }
  }

  const confirmVariantPicker = () => {
    if (!variantPickerProduct) return
    const variant = (variantPickerProduct.variants ?? []).find(v => v.id === selectedVariantId)
    if (!variant) return
    const label = `${variant.variantType}: ${variant.variantLabel}`
    addToCart(variantPickerProduct, variant.id, label)
    setVariantPickerProduct(null)
    setSelectedVariantId('')
  }

  const updateCartQty = (idx: number, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter((_, i) => i !== idx)); return }
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, quantity: qty, lineTotal: c.isFreeSample ? 0 : c.unitPrice * qty } : c))
  }

  const toggleFreeSample = (idx: number) => {
    setCart(prev => prev.map((c, i) => {
      if (i !== idx) return c
      const nowFree = !c.isFreeSample
      if (nowFree) {
        return { ...c, isFreeSample: true, unitPrice: 0, lineTotal: 0 }
      } else {
        // Restore original selling price from product catalog
        const original = toNum(products.find(p => p.id === c.inventoryItemId)?.sellingPrice || 0)
        return { ...c, isFreeSample: false, unitPrice: original, lineTotal: original * c.quantity }
      }
    }))
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
  // Snap to displayed 2-dp precision so floating-point arithmetic never creates
  // a sub-cent gap between what the user sees and what we compare against.
  const netAmountDisplay = parseFloat(netAmount.toFixed(2))
  const totalPayments = payments.reduce((s, p) => s + toNum(p.amount), 0)
  const productPaymentShort = totalPayments < netAmountDisplay - 0.005

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
    const allFreeSamples = cart.every(c => c.isFreeSample)
    if (!allFreeSamples && !hasRewardPointsPayment && productPaymentShort) { setError('Payments do not cover the net amount'); return }
    if (hasReceivablePayment) {
      if (!soldTo.trim()) { setError('Enter who this is sold to (e.g. SANDBOX CLARK) for the Receivable payment'); return }
      if (isBusiness && !businessName.trim()) { setError('Enter the business name — a company sale is billed to the company'); return }
      if (isBusiness && prodIssuedInvoice && !businessTin.trim()) { setError('An official sales invoice to a business needs its TIN'); return }
      if (isBusiness && prodIssuedInvoice && !buyerAddress.trim()) { setError('An official sales invoice to a business needs the business address'); return }
      if (payments.some(p => p.method !== 'RECEIVABLE' && toNum(p.amount) > 0)) {
        setError('Receivable cannot be mixed with other payment methods — record cash portions as a separate order')
        return
      }
    }
    // Re-entrancy guard — block duplicate submissions while one is in flight.
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    try {
      // For fully-free-sample orders (netAmount = 0), send a ₱0 CASH payment so the API accepts it
      const paymentsPayload = allFreeSamples
        ? [{ method: 'CASH', amount: 0, paymentModeId: null, walletId: null, reference: 'Free sample — marketing' }]
        : payments.filter(p => toNum(p.amount) > 0 || p.method === 'REWARD_POINTS').map(p => ({
            method: p.method,
            paymentModeId: p.paymentModeId || null,
            amount: p.method === 'REWARD_POINTS' ? rpMonetaryValue : toNum(p.amount),
            walletId: p.method === 'REWARD_POINTS' ? rpSelectedWallet?.id : null,
            reference: p.method === 'REWARD_POINTS' ? `${rpPointsToUse} pts from ${rpSelectedWallet?.patientName}${rpCoveragePercent < 1 ? ` (${(rpCoveragePercent * 100).toFixed(0)}% coverage)` : ''}` : null,
          }))
      const body = {
        orderType: 'PRODUCT',
        branch: prodBranch,
        platform,
        transactionDate: txDate,
        items: cart.map(c => ({
          inventoryItemId: c.inventoryItemId || null,
          name: c.name,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          lineTotal: c.lineTotal,
          isFreeSample: !!c.isFreeSample,
        })),
        payments: paymentsPayload,
        discountType,
        discountAmount,
        discountLabel: discountLabel || null,
        issuedOfficialInvoice: prodIssuedInvoice,
        salesInvoiceNumber: prodIssuedInvoice ? normalizeSI(prodInvoiceNumber) : null,
        referenceNumber: prodReferenceNumber.trim() || null,
        notes: prodNotes.trim() || null,
        soldTo: hasReceivablePayment ? soldTo.trim() : null,
        isBusiness: hasReceivablePayment && isBusiness,
        businessName: hasReceivablePayment && isBusiness ? businessName.trim() : null,
        issuedSalesInvoice: hasReceivablePayment && isBusiness && prodIssuedInvoice,
        businessTin: hasReceivablePayment && isBusiness && prodIssuedInvoice ? businessTin.trim() : null,
        // Buyer details ride with every order, not just credit sales.
        buyerIsPatient,
        buyerName: soldTo.trim() || null,
        buyerIsBusiness: isBusiness,
        buyerBusinessName: isBusiness ? businessName.trim() || null : null,
        buyerTin: isBusiness && prodIssuedInvoice ? businessTin.trim() || null : null,
        buyerAddress: prodIssuedInvoice && !buyerIsPatient ? buyerAddress.trim() || null : null,
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
      setSoldTo('')
      setError('')
      alert(`Order ${data.orderNumber} created successfully!`)
    } catch {
      setError('Failed to create order')
    } finally {
      submittingRef.current = false
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
        return [...prev, { inventoryItemId: found.id, name: found.name, quantity: 1, unitPrice: price, lineTotal: price, isFreeSample: false }]
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
    <>
    {/* Online Orders from verdanarehab.com */}
    <div className="mb-4">
      <OnlineOrdersWidget />
    </div>

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

        {/* Branch (only Verdana & Aura Health Institute carry products) */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Branch</label>
          <select value={prodBranch} onChange={e => { setProdBranch(e.target.value); setCart([]) }}
            className="px-3 py-2 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="VERDANA_STORE">Verdana</option>
            <option value="AURA_INSTITUTE">Aura Health Institute</option>
          </select>
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
                <button key={p.id} onClick={() => handleProductClick(p)}
                  className="text-left p-3 rounded-xl border hover:shadow-md transition-shadow"
                  style={{ borderColor: 'var(--light-gray)' }}>
                  <p className="text-sm font-medium leading-snug" style={{ color: 'var(--charcoal)' }}>{p.name}</p>
                  {p.sku && <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{p.sku}</p>}
                  {(p.variants ?? []).filter(v => v.quantity > 0).length > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--teal)' }}>
                      {(p.variants ?? []).filter(v => v.quantity > 0).length} variant{(p.variants ?? []).filter(v => v.quantity > 0).length > 1 ? 's' : ''}
                    </p>
                  )}
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
              <button onClick={() => setShowTiktokImport(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }} title="Bulk upload TikTok Shop orders + settlement">
                <Upload size={13} /> TikTok Bulk Upload
              </button>
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
                <div key={idx} className={`rounded-xl p-2 space-y-1.5 ${c.isFreeSample ? 'border' : ''}`}
                  style={c.isFreeSample ? { borderColor: '#d97706', background: '#fffbeb' } : {}}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium flex items-center gap-1" style={{ color: 'var(--charcoal)' }}>
                        {c.isFreeSample && <Gift size={12} style={{ color: '#d97706' }} />}
                        {c.name}
                      </p>
                      {c.variantLabel && (
                        <p className="text-xs font-medium" style={{ color: 'var(--teal)' }}>{c.variantLabel}</p>
                      )}
                      <p className="text-xs" style={{ color: c.isFreeSample ? '#d97706' : 'var(--mid-gray)' }}>
                        {c.isFreeSample ? 'FREE SAMPLE — ₱0' : `${formatCurrency(c.unitPrice)} each`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <button onClick={() => updateCartQty(idx, c.quantity - 1)} className="w-6 h-6 rounded-lg border flex items-center justify-center text-xs" style={{ borderColor: 'var(--light-gray)' }}>-</button>
                      <span className="text-xs w-4 text-center">{c.quantity}</span>
                      <button onClick={() => updateCartQty(idx, c.quantity + 1)} className="w-6 h-6 rounded-lg border flex items-center justify-center text-xs" style={{ borderColor: 'var(--light-gray)' }}>+</button>
                      <span className="text-xs font-medium w-16 text-right" style={{ color: c.isFreeSample ? '#d97706' : 'var(--charcoal)' }}>
                        {c.isFreeSample ? 'FREE' : formatCurrency(c.lineTotal)}
                      </span>
                    </div>
                  </div>
                  {/* Free Sample toggle */}
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!c.isFreeSample}
                      onChange={() => toggleFreeSample(idx)}
                      className="rounded"
                    />
                    <span className="text-xs font-medium" style={{ color: '#d97706' }}>
                      <Gift size={11} className="inline mr-0.5" /> Free Sample (marketing)
                    </span>
                  </label>
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
                      <option value="RECEIVABLE">Receivable (charge to customer)</option>
                    </>
                  ) : (
                    PAYMENT_METHODS_PRODUCT.map(m => <option key={m.value} value={m.value}>{m.label}</option>)
                  )}
                </select>
                {p.method === 'REWARD_POINTS' ? (
                  <span className="w-28 px-2 py-2 rounded-xl border text-xs text-right flex items-center justify-end gap-1" style={{ borderColor: 'var(--light-gray)', color: 'var(--gold)', background: '#F9F2EB' }}>
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

          {/* Who is buying. Asked on every checkout, not only credit sales: an
              official sales invoice needs the buyer whatever the payment mode was.
              A patient is matched from the CRM; anyone else is typed in. */}
          <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: '#93c5fd', background: '#eff6ff' }}>
            <h4 className="text-xs font-semibold" style={{ color: '#1e40af' }}>Buyer</h4>

            <label className="flex items-center gap-2 text-xs" style={{ color: '#1e40af' }}>
              <input type="checkbox" checked={buyerIsPatient}
                onChange={e => {
                  setBuyerIsPatient(e.target.checked)
                  setSoldTo('')
                  // A patient cannot also be a company account, so the business
                  // question disappears rather than sitting there contradicting it.
                  if (e.target.checked) { setIsBusiness(false); setBusinessName(''); setBusinessTin('') }
                }} />
              Patient in clinic
            </label>

            <div className="relative">
              <input value={soldTo}
                onChange={e => { setSoldTo(e.target.value); setShowSoldToDrop(true) }}
                onFocus={() => setShowSoldToDrop(true)}
                placeholder={buyerIsPatient ? 'Search the patient CRM…' : 'Name of buyer (optional)'}
                className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#93c5fd' }} />
              {buyerIsPatient && showSoldToDrop && soldToResults.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border bg-white shadow-lg max-h-52 overflow-y-auto"
                  style={{ borderColor: 'var(--light-gray)' }}>
                  {soldToResults.map(pt => (
                    <button key={pt.id} type="button"
                      onClick={() => { setSoldTo(pt.name); setShowSoldToDrop(false) }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50">{pt.name}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Only someone who is not a patient can be buying for a company. */}
            {!buyerIsPatient && (
              <>
                <label className="flex items-center gap-2 text-xs" style={{ color: '#1e40af' }}>
                  <input type="checkbox" checked={isBusiness}
                    onChange={e => { setIsBusiness(e.target.checked); if (!e.target.checked) { setBusinessName(''); setBusinessTin('') } }} />
                  Business
                </label>
                {isBusiness && (
                  <input value={businessName} onChange={e => setBusinessName(e.target.value)}
                    placeholder="Business name"
                    className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: '#93c5fd' }} />
                )}
              </>
            )}

            {hasReceivablePayment && (
              <p className="text-[11px]" style={{ color: '#1e40af' }}>
                No cash is collected now. The order is saved as Unpaid and a receivable is created under
                {' '}<strong>Accounts Receivable → Other Customers</strong>, where you can set a staggered payment plan and record collections.
              </p>
            )}
          </div>

          {/* Reward Points Wallet Selection */}
          {hasRewardPointsPayment && (
            <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: '#FFBA6B', background: '#F9F2EB' }}>
              <h4 className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--gold)' }}>
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
                  <button onClick={() => setRpSelectedWallet(null)} className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--gold)' }}>Change</button>
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
                  <p style={{ color: 'var(--gold)' }}>
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

          {/* Platform (sales channel for this product order) */}
          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)' }}>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Platform</label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none bg-white"
              style={{ borderColor: 'var(--light-gray)' }}
            >
              {['Website', 'Shopee', 'Lazada', 'Tiktok', 'Clinic'].map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Official Sales Invoice */}
          <div className="rounded-xl p-3 border" style={{ borderColor: 'var(--light-gray)' }}>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={prodIssuedInvoice}
                onChange={e => { setProdIssuedInvoice(e.target.checked); if (!e.target.checked) setProdInvoiceNumber('') }}
                className="w-4 h-4 rounded accent-teal-600" />
              <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Issued Official Sales Invoice</span>
            </label>
            {prodIssuedInvoice && (
              <div className="mt-2 space-y-2">
                <label className="block text-[11px] font-medium" style={{ color: 'var(--mid-gray)' }}>Sales Invoice Number</label>
                <input type="text" value={prodInvoiceNumber} onChange={e => setProdInvoiceNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 0001" className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />

                {/* A company invoice carries the buyer's TIN and address. An
                    outside individual needs an address only. A patient needs
                    neither — the clinic already holds their record. */}
                {isBusiness && (
                  <>
                    <label className="block text-[11px] font-medium" style={{ color: 'var(--mid-gray)' }}>Business TIN Number</label>
                    <input value={businessTin} onChange={e => setBusinessTin(e.target.value)}
                      placeholder="e.g. 010-817-642-00000"
                      className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    <label className="block text-[11px] font-medium" style={{ color: 'var(--mid-gray)' }}>Business Address</label>
                    <input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)}
                      placeholder="Registered business address"
                      className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </>
                )}
                {!isBusiness && !buyerIsPatient && (
                  <>
                    <label className="block text-[11px] font-medium" style={{ color: 'var(--mid-gray)' }}>Address</label>
                    <input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)}
                      placeholder="Buyer's address"
                      className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </>
                )}
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
                <div className="flex justify-between text-xs"><span style={{ color: 'var(--gold)' }}><Star size={10} className="inline" /> Reward Points ({rpPointsToUse.toLocaleString()} pts)</span><span style={{ color: 'var(--gold)' }}>{formatCurrency(rpMonetaryValue)}</span></div>
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
              <div className="flex justify-between text-xs"><span style={{ color: 'var(--gold)' }}><Star size={10} className="inline" /> Points needed</span><span style={{ color: 'var(--gold)' }}>{rewardPointsTotal.toLocaleString()} pts</span></div>
            )}
            {!hasRewardPointsPayment && <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Paid</span><span>{formatCurrency(totalPayments)}</span></div>}
            {!hasRewardPointsPayment && totalPayments >= netAmountDisplay - 0.005 && netAmount > 0 && (
              <div className="flex justify-between text-xs"><span style={{ color: 'var(--mid-gray)' }}>Change</span><span className="text-green-700">{formatCurrency(Math.max(0, totalPayments - netAmountDisplay))}</span></div>
            )}
          </div>

          <button onClick={handleSubmit} disabled={submitting || cart.length === 0 || (!hasRewardPointsPayment && productPaymentShort) || (hasRewardPointsPayment && rpCoveragePercent < 1 && otherPaymentsTotal < rpRemainingBalance - 0.01)}
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

    {showTiktokImport && <TiktokImportModal onClose={() => setShowTiktokImport(false)} onDone={() => { fetch(`/api/inventory?all=true&branch=${prodBranch}`).then(r => r.json()).then(d => setProducts(normalize(d) as InventoryProduct[])).catch(() => {}) }} />}

    {/* ── Variant Picker Modal ─────────────────────────────────── */}
    {variantPickerProduct && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header (fixed) */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--charcoal)' }}>Select Variant</h3>
              <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>{variantPickerProduct.name} · {(variantPickerProduct.variants ?? []).length} option{(variantPickerProduct.variants ?? []).length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={() => setVariantPickerProduct(null)} className="p-1 rounded hover:bg-gray-100">
              <X size={16} />
            </button>
          </div>
          {/* Variant grid (scrolls independently so the footer stays reachable) */}
          <div className="px-5 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(variantPickerProduct.variants ?? []).map(v => (
                <label key={v.id}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${selectedVariantId === v.id ? 'border-teal-500 bg-teal-50' : ''} ${v.quantity <= 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
                  style={{ borderColor: selectedVariantId === v.id ? 'var(--teal)' : 'var(--light-gray)' }}>
                  <input
                    type="radio"
                    name="variant"
                    value={v.id}
                    checked={selectedVariantId === v.id}
                    onChange={() => setSelectedVariantId(v.id)}
                    disabled={v.quantity <= 0}
                    className="accent-teal-600 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${v.quantity <= 0 ? 'text-gray-400' : ''}`} style={v.quantity > 0 ? { color: 'var(--charcoal)' } : {}} title={`${v.variantType}: ${v.variantLabel}`}>
                      {v.variantType}: {v.variantLabel}
                    </p>
                    <p className="text-xs" style={{ color: v.quantity > 0 ? 'var(--mid-gray)' : '#ef4444' }}>
                      {v.quantity > 0 ? `${v.quantity} in stock` : 'Out of stock'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {/* Footer (fixed, always visible) */}
          <div className="flex gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--light-gray)' }}>
            <button onClick={() => setVariantPickerProduct(null)}
              className="flex-1 py-2.5 rounded-xl border text-sm font-medium" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
              Cancel
            </button>
            <button
              onClick={confirmVariantPicker}
              disabled={!selectedVariantId || (variantPickerProduct.variants ?? []).find(v => v.id === selectedVariantId)?.quantity === 0}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--teal)' }}>
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    )}
    </>
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
      {/* Keep both panels mounted so SalesCheckingPanel state (unsaved inputs) survives tab switches.
          Use CSS display instead of conditional rendering to avoid unmount/remount. */}
      <div style={{ display: salesTab === 'summary' ? 'block' : 'none' }}>
        <SalesSummarySection branch={branch} canSelectBranch={canSelectBranch} />
      </div>
      <div style={{ display: salesTab === 'checking' ? 'block' : 'none' }}>
        <SalesCheckingPanel branch={branch} canSelectBranch={canSelectBranch} />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SALES CHECKING PANEL
   ══════════════════════════════════════════════════════════════ */
function SalesCheckingPanel({ branch, canSelectBranch }: { branch: string; canSelectBranch: boolean }) {
  // Always default to a specific branch — Sales Checking is per-branch only
  const [selectedBranch, setSelectedBranch] = useState(canSelectBranch ? 'SANDBOX_EAST' : branch)
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [orders, setOrders] = useState<Order[]>([])
  const [modes, setModes] = useState<PaymentModeType[]>([])
  const [loading, setLoading] = useState(false)
  const [actualAmounts, setActualAmounts] = useState<Record<string, Record<string, number>>>({})
  const [confirmed, setConfirmed] = useState<Record<string, Record<string, boolean>>>({})
  const [remarks, setRemarks] = useState<Record<string, Record<string, string>>>({}) // { date: { method: remark } }
  // cleared days: { "YYYY-MM-DD|branch": true }
  const [clearedDays, setClearedDays] = useState<Record<string, { clearedAt: string; clearedById: string }>>({})
  const [clearingInProgress, setClearingInProgress] = useState(false)
  const [clearingError, setClearingError] = useState<string | null>(null)
  const [savingDay, setSavingDay] = useState<Record<string, boolean>>({})
  const [savedDayFeedback, setSavedDayFeedback] = useState<Record<string, boolean>>({})
  // Calendar month for summary
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth()) // 0-indexed
  // Debounce timers: auto-save 800 ms after the user stops typing in any field for a given day
  const saveDayTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

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

  // Fetch clearing records for current view (date range) + calendar month
  const fetchClearing = useCallback(async () => {
    try {
      // Fetch for selected range + calendar month
      const firstOfMonth = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`
      const lastOfMonth = new Date(calYear, calMonth + 1, 0)
      const lastDate = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(lastOfMonth.getDate()).padStart(2, '0')}`
      const params = new URLSearchParams()
      if (selectedBranch) params.set('branch', selectedBranch)
      // Fetch a wide range covering both filters + calendar
      const earliest = [dateFrom, firstOfMonth].filter(Boolean).sort()[0]
      const latest = [dateTo, lastDate].filter(Boolean).sort().reverse()[0]
      if (earliest) params.set('dateFrom', earliest)
      if (latest) params.set('dateTo', latest)
      const r = await fetch(`/api/pos/sales-clearing?${params}`)
      const data = await r.json()
      if (Array.isArray(data)) {
        const map: Record<string, { clearedAt: string; clearedById: string }> = {}
        const dbActualAmounts: Record<string, Record<string, number>> = {}
        const dbRemarks: Record<string, Record<string, string>> = {}
        for (const rec of data) {
          if (rec.isCleared) {
            map[`${rec.date}|${rec.branch}`] = { clearedAt: rec.clearedAt, clearedById: rec.clearedById }
          }
          if (Array.isArray(rec.actualAmounts)) {
            dbActualAmounts[rec.date] = {}
            for (const item of rec.actualAmounts as { method: string; amount: number }[]) {
              dbActualAmounts[rec.date][item.method] = item.amount
            }
          }
          if (Array.isArray(rec.remarks)) {
            dbRemarks[rec.date] = {}
            for (const item of rec.remarks as { method: string; remarks: string }[]) {
              if (item.remarks) dbRemarks[rec.date][item.method] = item.remarks
            }
          }
        }
        setClearedDays(map)
        // Merge DB saved data per method: preserve any field the user has already edited locally,
        // but fill in DB values for methods the user hasn't touched yet.
        setActualAmounts(prev => {
          const merged = { ...prev }
          for (const [d, methods] of Object.entries(dbActualAmounts)) {
            if (!merged[d]) {
              merged[d] = methods
            } else {
              // Per-method merge — only load from DB for methods not yet in local state
              const dayMerged = { ...merged[d] }
              for (const [method, amount] of Object.entries(methods)) {
                if (dayMerged[method] === undefined) dayMerged[method] = amount
              }
              merged[d] = dayMerged
            }
          }
          return merged
        })
        setRemarks(prev => {
          const merged = { ...prev }
          for (const [d, methods] of Object.entries(dbRemarks)) {
            if (!merged[d]) {
              merged[d] = methods
            } else {
              const dayMerged = { ...merged[d] }
              for (const [method, remark] of Object.entries(methods)) {
                if (!dayMerged[method]) dayMerged[method] = remark
              }
              merged[d] = dayMerged
            }
          }
          return merged
        })
      }
    } catch { /* ignore */ }
  }, [selectedBranch, dateFrom, dateTo, calYear, calMonth])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { fetchClearing() }, [fetchClearing])

  // Group orders by date and payment method
  const activeOrders = orders.filter(o => o.status !== 'VOIDED')
  const byDate = new Map<string, Map<string, number>>()

  for (const o of activeOrders) {
    // Cash reconciles on the day it was collected: use paymentDate when a payment
    // was recorded later than the session (Unpaid → paid), else the session date.
    const day = new Date(String(o.paymentDate || o.transactionDate || o.createdAt)).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    if (!byDate.has(day)) byDate.set(day, new Map())
    const methods = byDate.get(day)!
    for (const p of o.payments) {
      const label = getPaymentLabel(p)
      methods.set(label, (methods.get(label) || 0) + toNum(p.amount))
    }
  }

  const sortedDates = Array.from(byDate.keys()).sort()
  const CHECKING_METHODS = ['CASH', 'CREDIT_CARD', 'DEBIT', 'GCASH', 'PAYMAYA', 'PAYMONGO']
  const sortedMethods = CHECKING_METHODS

  const getActual = (day: string, method: string) => actualAmounts[day]?.[method] ?? ''
  const setActual = (day: string, method: string, val: number) => {
    setActualAmounts(prev => ({ ...prev, [day]: { ...prev[day], [method]: val } }))
  }
  const isConfirmed = (day: string, method: string) => confirmed[day]?.[method] || false
  const toggleConfirm = (day: string, method: string) => {
    setConfirmed(prev => ({ ...prev, [day]: { ...prev[day], [method]: !prev[day]?.[method] } }))
  }
  const getRemark = (day: string, method: string) => remarks[day]?.[method] ?? ''
  const setRemark = (day: string, method: string, val: string) => {
    setRemarks(prev => ({ ...prev, [day]: { ...prev[day], [method]: val } }))
  }

  // Auto-save 800 ms after the user stops typing — prevents data loss when the user
  // changes filters or switches tabs without explicitly clicking Save.
  const debouncedSave = useCallback((day: string) => {
    if (saveDayTimers.current[day]) clearTimeout(saveDayTimers.current[day])
    saveDayTimers.current[day] = setTimeout(() => saveDay(day), 800)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "All cleared" = every method present for that day has OK checked
  const isDayAllCleared = (day: string) => {
    const methods = byDate.get(day)
    if (!methods) return false
    const presentMethods = sortedMethods.filter(m => methods.has(m))
    if (presentMethods.length === 0) return false
    return presentMethods.every(m => isConfirmed(day, m))
  }

  const isClearedInDB = (day: string, br: string) => !!clearedDays[`${day}|${br}`]

  const saveDay = async (day: string) => {
    const br = selectedBranch || branch
    if (!br) return
    setSavingDay(prev => ({ ...prev, [day]: true }))
    try {
      // Include all methods present in byDate for this day
      const dayMethods = byDate.get(day)
      const allMethodKeys = dayMethods ? Array.from(dayMethods.keys()) : []
      const amountsList = allMethodKeys
        .map(m => ({ method: m, amount: (typeof getActual(day, m) === 'number' ? getActual(day, m) as number : 0) }))
      const remarksList = allMethodKeys
        .map(m => ({ method: m, remarks: getRemark(day, m) }))
        .filter(r => r.remarks)
      await fetch('/api/pos/sales-clearing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: day,
          branch: br,
          actualAmounts: amountsList,
          remarks: remarksList.length ? remarksList : null,
        }),
      })
      setSavedDayFeedback(prev => ({ ...prev, [day]: true }))
      setTimeout(() => setSavedDayFeedback(prev => ({ ...prev, [day]: false })), 2500)
    } catch { /* ignore */ }
    setSavingDay(prev => ({ ...prev, [day]: false }))
  }

  const clearDay = async (day: string) => {
    const br = selectedBranch || branch
    if (!br) return
    setClearingInProgress(true)
    setClearingError(null)
    try {
      // Include all methods present in byDate for this day (not just CHECKING_METHODS)
      const dayMethods = byDate.get(day)
      const allMethodKeys = dayMethods ? Array.from(dayMethods.keys()) : []
      const amountsList = allMethodKeys
        .map(m => ({ method: m, amount: (typeof getActual(day, m) === 'number' ? getActual(day, m) as number : 0) }))
      const remarksList = allMethodKeys
        .map(m => ({ method: m, remarks: getRemark(day, m) }))
        .filter(r => r.remarks)
      const res = await fetch('/api/pos/sales-clearing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: day,
          branch: br,
          actualAmounts: amountsList,
          remarks: remarksList.length ? remarksList : null,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setClearingError((errData as { error?: string }).error || `Server error (${res.status})`)
        setClearingInProgress(false)
        return
      }
      await fetchClearing()
    } catch (e) {
      setClearingError(e instanceof Error ? e.message : 'Network error — please try again')
    }
    setClearingInProgress(false)
  }

  const unclearDay = async (day: string) => {
    const br = selectedBranch || branch
    if (!br) return
    await fetch(`/api/pos/sales-clearing?date=${day}&branch=${br}`, { method: 'DELETE' })
    await fetchClearing()
  }

  // Calendar: days that have sales data
  const daysWithSales = new Set(Array.from(byDate.keys()))

  // Days in calendar month with clearing status
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const calFirstDow = new Date(calYear, calMonth, 1).getDay() // 0=Sun

  // selectedBranch is always a specific branch (no All Branches option)
  const calBranches = [selectedBranch || branch]

  return (
    <div className="space-y-6">
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
            <option value="SANDBOX_EAST">East Branch</option>
            <option value="SANDBOX_GREENHILLS">Greenhills Branch</option>
            <option value="AURA_INSTITUTE">Aura Health Institute</option>
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
            const br = selectedBranch || branch
            const cleared = br ? isClearedInDB(day, br) : false
            return (
              <div key={day} className="rounded-2xl border overflow-hidden" style={{ borderColor: cleared ? '#16a34a' : 'var(--light-gray)' }}>
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ background: cleared ? '#dcfce7' : 'var(--pale-teal)', color: cleared ? '#166534' : 'var(--deep-teal)' }}>
                  <span className="font-semibold text-xs">{dayLabel}</span>
                  {cleared && <span className="text-xs font-semibold flex items-center gap-1"><CheckCircle size={12} /> Cleared</span>}
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--off-white)' }}>
                      <th className="px-4 py-2 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Payment Method</th>
                      <th className="px-4 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>System Amount</th>
                      <th className="px-4 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>Actual Amount</th>
                      <th className="px-4 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>Difference</th>
                      <th className="px-4 py-2 text-center font-semibold" style={{ color: 'var(--charcoal)' }}>OK</th>
                      <th className="px-4 py-2 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMethods.filter(m => methods.has(m)).map(method => {
                      const systemAmt = methods.get(method) || 0
                      const actualAmt = typeof getActual(day, method) === 'number' ? getActual(day, method) as number : 0
                      const diff = actualAmt - systemAmt
                      const diffColor = diff === 0 ? '#166534' : diff > 0 ? 'var(--gold)' : '#dc2626'
                      return (
                        <tr key={method} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                          <td className="px-4 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{method}</td>
                          <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(systemAmt)}</td>
                          <td className="px-4 py-2 text-right">
                            <input type="number" step="0.01" value={getActual(day, method)}
                              onChange={e => { setActual(day, method, parseFloat(e.target.value) || 0); debouncedSave(day) }}
                              onBlur={() => saveDay(day)}
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
                          <td className="px-4 py-2">
                            <input type="text" value={getRemark(day, method)}
                              onChange={e => { setRemark(day, method, e.target.value); debouncedSave(day) }}
                              onBlur={() => saveDay(day)}
                              placeholder="Optional note..."
                              className="w-full px-2 py-1 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {/* Cleared for the day button */}
                {br && (
                  <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <div className="flex items-center justify-between">
                      {/* Save draft button — always visible */}
                      <button
                        onClick={() => saveDay(day)}
                        disabled={savingDay[day] || cleared}
                        className="px-4 py-2 rounded-xl text-xs font-medium border transition-all"
                        style={{
                          borderColor: savedDayFeedback[day] ? '#16a34a' : 'var(--teal)',
                          color: savedDayFeedback[day] ? '#16a34a' : 'var(--teal)',
                          background: 'transparent',
                          opacity: (savingDay[day] || cleared) ? 0.5 : 1,
                          cursor: (savingDay[day] || cleared) ? 'not-allowed' : 'pointer',
                        }}>
                        {savingDay[day] ? 'Saving…' : savedDayFeedback[day] ? '✓ Saved' : 'Save'}
                      </button>
                      {cleared ? (
                        <button onClick={() => unclearDay(day)}
                          className="px-4 py-2 rounded-xl text-xs font-medium border"
                          style={{ borderColor: '#16a34a', color: '#16a34a', background: 'transparent' }}>
                          Undo Clearing
                        </button>
                      ) : (
                        <button
                          onClick={() => { setClearingError(null); clearDay(day) }}
                          disabled={clearingInProgress}
                          className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-opacity"
                          style={{ background: '#16a34a', opacity: clearingInProgress ? 0.7 : 1, cursor: clearingInProgress ? 'not-allowed' : 'pointer' }}>
                          {clearingInProgress ? 'Saving…' : 'Cleared for the Day'}
                        </button>
                      )}
                    </div>
                    {clearingError && (
                      <p className="mt-2 text-xs" style={{ color: '#dc2626' }}>⚠ {clearingError}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Calendar Summary */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
            Clearing Summary — {new Date(calYear, calMonth).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => { const d = new Date(calYear, calMonth - 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()) }}
              className="p-1 rounded-lg hover:bg-gray-100 text-sm" style={{ color: 'var(--mid-gray)' }}>‹</button>
            <button onClick={() => { const d = new Date(calYear, calMonth + 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()) }}
              className="p-1 rounded-lg hover:bg-gray-100 text-sm" style={{ color: 'var(--mid-gray)' }}>›</button>
          </div>
        </div>
        <div className="p-4">
          {calBranches.map(br => {
            const brLabel = br === 'SANDBOX_EAST' ? 'East Branch' : br === 'SANDBOX_GREENHILLS' ? 'Greenhills Branch' : br
            return (
              <div key={br} className={calBranches.length > 1 ? 'mb-6' : ''}>
                {calBranches.length > 1 && (
                  <div className="text-xs font-semibold mb-2" style={{ color: 'var(--deep-teal)' }}>{brLabel}</div>
                )}
                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 mb-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="text-center text-xs font-semibold py-1" style={{ color: 'var(--mid-gray)' }}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {/* Empty cells before first day */}
                  {Array.from({ length: calFirstDow }).map((_, i) => <div key={`e${i}`} />)}
                  {Array.from({ length: calDaysInMonth }).map((_, i) => {
                    const d = i + 1
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                    const isCleared = !!clearedDays[`${dateStr}|${br}`]
                    const hasSales = daysWithSales.has(dateStr)
                    const isToday = dateStr === today()
                    let bg = 'transparent'
                    let color = 'var(--mid-gray)'
                    let border = '1px solid transparent'
                    if (isCleared) { bg = '#dcfce7'; color = '#166534' }
                    else if (hasSales) { bg = '#fef9c3'; color = '#92400e' }
                    if (isToday) border = '1.5px solid var(--teal)'
                    return (
                      <div key={d} className="rounded-lg flex flex-col items-center justify-center py-1.5 text-xs font-medium"
                        style={{ background: bg, color, border, minHeight: '36px' }}>
                        <span>{d}</span>
                        {isCleared && <span style={{ fontSize: '9px', lineHeight: 1 }}>✓</span>}
                        {!isCleared && hasSales && <span style={{ fontSize: '9px', lineHeight: 1 }}>•</span>}
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-4 mt-3">
                  <span className="flex items-center gap-1 text-xs" style={{ color: '#166534' }}>
                    <span className="inline-block w-3 h-3 rounded" style={{ background: '#dcfce7' }} /> Cleared
                  </span>
                  <span className="flex items-center gap-1 text-xs" style={{ color: '#92400e' }}>
                    <span className="inline-block w-3 h-3 rounded" style={{ background: '#fef9c3' }} /> Pending
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
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
  const [deductions, setDeductions] = useState<{ name: string; rate: number; valueType: string; accountId: string; accountSearch: string }[]>([])
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
      valueType: d.valueType === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
      accountId: d.accountId || '',
      accountSearch: d.account ? `${d.account.accountNumber} ${d.account.accountTitle}` : '',
    })))
    setError('')
    setShowForm(true)
  }

  const addDeduction = () => setDeductions(prev => [...prev, { name: '', rate: 0, valueType: 'PERCENTAGE', accountId: '', accountSearch: '' }])
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
        valueType: d.valueType || 'PERCENTAGE',
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
                        {m.branch === 'SANDBOX_EAST' ? 'AHEA' : m.branch === 'SANDBOX_GREENHILLS' ? 'AHGH' : m.branch === 'VERDANA_STORE' ? 'Verdana' : m.branch}
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
                            <span className="ml-1" style={{ color: 'var(--mid-gray)' }}>{d.valueType === 'FIXED' ? formatCurrency(Number(d.rate)) : `${Number(d.rate)}%`}</span>
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
                  placeholder="e.g. Cash - AHEA, GCash, Credit Card"
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
                  <option value="PAYMONGO">Paymongo</option>
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
                  <option value="SANDBOX_EAST">East Branch</option>
                  <option value="SANDBOX_GREENHILLS">Greenhills Branch</option>
                  <option value="VERDANA_STORE">Verdana Store</option>
                  <option value="AURA_INSTITUTE">Aura Health Institute</option>
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
                          <input type="number" value={d.rate} min={0} max={d.valueType === 'FIXED' ? undefined : 100} step={0.01}
                            onChange={e => updateDeduction(i, { rate: parseFloat(e.target.value) || 0 })}
                            className="w-16 px-2 py-1.5 rounded-lg border text-xs outline-none text-right" style={{ borderColor: 'var(--light-gray)' }} />
                          <select value={d.valueType || 'PERCENTAGE'}
                            onChange={e => updateDeduction(i, { valueType: e.target.value })}
                            className="px-1.5 py-1.5 rounded-lg border text-xs outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}
                            title="Percentage of gross, or a fixed peso amount">
                            <option value="PERCENTAGE">%</option>
                            <option value="FIXED">₱ Fixed</option>
                          </select>
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

// Collect payment on an Unpaid order — cash is stamped with the collection date
// so it reconciles in the Sales Summary on the day received; session date is kept.
function RecordUnpaidPaymentModal({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const net = toNum(order.netAmount)
  const [payDate, setPayDate] = useState(today())
  const [method, setMethod] = useState('CASH')
  const [amount, setAmount] = useState(String(net))
  const [issueSI, setIssueSI] = useState(!!order.issuedOfficialInvoice)
  const [si, setSi] = useState(order.salesInvoiceNumber || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!(toNum(amount) > 0)) { setErr('Enter the amount collected'); return }
    setBusy(true); setErr('')
    try {
      const r = await fetch(`/api/pos/orders/${order.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recordPayment', paymentDate: payDate, payments: [{ method, amount: toNum(amount) }], issuedOfficialInvoice: issueSI, salesInvoiceNumber: issueSI ? si.trim() : null }),
      })
      if (!r.ok) { setErr((await r.json()).error || 'Failed'); return }
      onSaved()
    } catch { setErr('Network error') } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}><DollarSign size={18} className="text-amber-600" /> Record Payment</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
          Order #{order.orderNumber} · {order.patientName || '—'} · session {formatDate(order.transactionDate)}. The session date stays as recorded; the payment counts in the Sales Summary on the collection date below.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment date</label>
            <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Amount</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className="w-full px-3 py-2 rounded-xl border text-sm font-mono" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
        </div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment method</label>
        <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          {PAYMENT_METHODS_SERVICE.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
          <input type="checkbox" checked={issueSI} onChange={e => setIssueSI(e.target.checked)} /> Issue Sales Invoice
        </label>
        {issueSI && <input value={si} onChange={e => setSi(e.target.value)} placeholder="SI number" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-2" style={{ borderColor: 'var(--light-gray)' }} />}
        {err && <p className="text-xs mb-2" style={{ color: '#dc2626' }}>{err}</p>}
        <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>Net due: <strong style={{ color: 'var(--charcoal)' }}>{formatCurrency(net)}</strong></p>
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>
          {busy && <Loader2 size={15} className="animate-spin" />} Record payment
        </button>
      </div>
    </div>
  )
}
