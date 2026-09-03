'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import LoaSubmissionsTab from './LoaSubmissionsTab'
import { useSession } from 'next-auth/react'
import { userBranchScope } from '@/lib/branch-scope'
import { branchLabel } from '@/lib/branch'
import { SortFilterHead, applySortFilter, type SortCol } from '@/components/SortFilterHead'
import { useSearchParams } from 'next/navigation'
import {
  FileCheck, Search, ChevronUp, ChevronDown, ArrowUpDown,
  X, AlertCircle, DollarSign, Calendar, Upload, Trash2, Pencil,
  Download, Filter, FileText, Settings, Maximize2, Minimize2,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { downloadXlsx, downloadReportPdf } from '@/lib/export'
import { ScanUpload } from '@/components/ScanUpload'
import SoaReport from './SoaReport'
import SubmittedForSoa from './SubmittedForSoa'
import OthersTab from './OthersTab'
import ExpandablePanel from './ExpandablePanel'
import DetailedGl, { type GlCaseRow } from './DetailedGl'

interface ARWallet {
  id: string
  patientName: string
  balance: number | string
  branch?: string | null
  // Only returned for GL wallets — the approved amount on the Guarantee Letter.
  totalGlAmount?: number | string | null
  // Consumption-based outstanding (sum of unpaid orders)
  consumedOutstanding?: number
  // An agency that bills per session and settles afterwards (no approved SOA to
  // draw down against) — the Municipality of Cainta works this way, like an HMO.
  perSession?: boolean
  // Lifetime settled by this agency (cash + tax withheld), and how long it took.
  paidTotal?: number
  commissionTotal?: number
  // When the letter/SOA was obtained (dateObtained, else the record's createdAt).
  // monthsToPay counts from this date, so the two always reconcile.
  soaDate?: string | null
  lastPaymentDate?: string | null
  monthsToPay?: number | null
  // Total consumed (paid + unpaid, GL only)
  totalConsumedAmount?: number
  accountId?: string | null
  account?: { accountNumber: string; accountTitle: string } | null
}

interface AROrder {
  id: string
  orderNumber: number
  patientId?: string | null
  transactionDate: string
  arCustomDate?: string | null   // Manually overridden date — used in Invoice & SOA when set
  patientName: string
  clinicianName: string
  createdBy?: { name: string } | null
  branch: string
  netAmount: number | string
  arProofUrl?: string | null
  items: { name: string; service?: { department?: string | null; hmoPaysClinicianDirect?: boolean } | null }[]
  payments: { amount: number | string; walletId?: string }[]
  arPaymentItems: { paymentId: string }[]
  soaSubmissionItems?: { submission: { submittedDate: string } }[]
  soaApprovalStatus?: string | null   // APPROVED | DISAPPROVED | null (pending)
}

interface ARSummary {
  orderCount: number
  totalBilled: number
  byDepartment: { label: string; amount: number }[]
  byProvider: { label: string; amount: number }[]
  directToClinician?: { orderCount: number; total: number; byProvider: { label: string; amount: number }[] }
}

interface InvoiceSetting {
  branch: string
  companyName?: string | null
  tradeName?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
}

interface ARPaymentRecord {
  id: string
  walletId: string
  paymentDate: string
  amount: number | string
  discount: number | string
  proofUrl?: string | null
  notes?: string | null
  salesInvoiceNumber?: string | null
  branch?: string | null
  cashAccountId?: string | null
  cashAccount?: { accountNumber: string; accountTitle: string } | null
  overpayment?: number | string | null
  overpaymentAccountId?: string | null
  overpaymentAccount?: { accountNumber: string; accountTitle: string } | null
  createdBy: { name: string }
  items: { orderId: string }[]
}

const toNum = (v: unknown) => Number(v) || 0

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Helper: parse arProofUrl which may be a plain URL or a JSON array of URLs.
function parseProofUrls(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const p = JSON.parse(raw)
    if (Array.isArray(p)) return p.filter(Boolean) as string[]
  } catch { /* plain URL */ }
  return [raw]
}
function serializeProofUrls(urls: string[]): string | null {
  const clean = urls.filter(Boolean)
  if (clean.length === 0) return null
  if (clean.length === 1) return clean[0]
  return JSON.stringify(clean)
}

interface PatientInfo {
  firstName?: string; lastName?: string
  email?: string | null; phone?: string | null
  dob?: string | null; sex?: string | null
  address?: string | null; city?: string | null
}

async function buildInvoicePdf(
  order: AROrder,
  setting: InvoiceSetting | null | undefined,
  walletName: string,
  patientInfo: PatientInfo | null
) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, ml = 15, mr = 15, contentW = W - ml - mr
  const C_TEAL: [number, number, number] = [13, 148, 136]
  const C_CHARCOAL: [number, number, number] = [31, 41, 55]
  const C_GRAY: [number, number, number] = [107, 114, 128]
  const C_LGRAY: [number, number, number] = [220, 220, 220]

  const companyName = setting?.companyName || 'Clinic'
  const tradeName   = setting?.tradeName || ''
  const address = setting?.address || ''
  const phone = setting?.phone || ''
  const amt = order.payments.reduce((s, p) => s + toNum(p.amount), 0)
  const amtStr = 'Php ' + amt.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const receiptNo = `#${String(order.orderNumber).padStart(6, '0')}`
  // Use manually overridden date if set, otherwise fall back to the original transaction date
  const effectiveDate = order.arCustomDate || order.transactionDate
  const dateStr = formatDate(effectiveDate)

  // ── TOP RIGHT: company contact block ──
  let y = 15
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...C_TEAL)
  doc.text(companyName, W - mr, y, { align: 'right' }); y += 5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C_GRAY)
  if (address) { doc.text(address, W - mr, y, { align: 'right' }); y += 4 }
  if (phone) { doc.text(phone, W - mr, y, { align: 'right' }) }

  // ── TEAL BAND ──
  y = 34
  doc.setFillColor(...C_TEAL)
  doc.rect(ml, y, contentW, 1.2, 'F')
  y += 7

  // ── LEFT: large clinic name + trade name ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...C_CHARCOAL)
  doc.text(companyName, ml, y + 4)
  if (tradeName) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C_GRAY)
    doc.text(tradeName, ml, y + 10)
  }

  // ── RIGHT: receipt detail box ──
  const boxX = W - mr - 72, boxY = y - 2, boxW = 72, boxH = 31
  doc.setDrawColor(...C_LGRAY); doc.setLineWidth(0.3)
  doc.rect(boxX, boxY, boxW, boxH)
  const cashier = order.createdBy?.name || '—'
  const details: [string, string][] = [
    ['Receipt No.', receiptNo],
    ['Date', dateStr],
    ['Cashier', cashier],
    ['Patient ID', order.patientId || '—'],
  ]
  let bY = boxY + 6.5
  for (const [label, val] of details) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C_GRAY)
    doc.text(label + ':', boxX + 3, bY)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...C_CHARCOAL)
    doc.text(val, boxX + 29, bY)
    bY += 6
  }
  y += 36

  // ── THIN DIVIDER ──
  doc.setDrawColor(...C_LGRAY); doc.setLineWidth(0.2)
  doc.line(ml, y, W - mr, y); y += 6

  // ── INVOICE FROM / TO ──
  const halfW = contentW / 2 - 4
  const fromX = ml, toX = ml + contentW / 2 + 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C_TEAL)
  doc.text('Invoice From', fromX, y)
  doc.text('Invoice To', toX, y)
  y += 5

  // Left column (From)
  let fromY = y
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...C_CHARCOAL)
  doc.text(companyName, fromX, fromY); fromY += 4
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C_GRAY)
  if (address) {
    const lines = doc.splitTextToSize(address, halfW) as string[]
    lines.forEach(l => { doc.text(l, fromX, fromY); fromY += 4 })
  }
  if (phone) { doc.text(`Tel: ${phone}`, fromX, fromY); fromY += 4 }

  // Right column (To) — use live patient data when available
  let toY = y
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...C_CHARCOAL)
  const toName = patientInfo
    ? `${patientInfo.firstName || ''} ${patientInfo.lastName || ''}`.trim() || order.patientName || '—'
    : order.patientName || '—'
  doc.text(toName, toX, toY); toY += 4
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C_GRAY)
  const patientAddress = patientInfo
    ? [patientInfo.address, patientInfo.city].filter(Boolean).join(', ') || '—'
    : '—'
  const patientPhone  = patientInfo?.phone || '—'
  const patientEmail  = patientInfo?.email || '—'
  const patientDob    = patientInfo?.dob
    ? new Date(patientInfo.dob).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—'
  const patientSex    = patientInfo?.sex || '—'
  for (const [label, val] of [
    ['Address', patientAddress],
    ['Phone',   patientPhone],
    ['Email',   patientEmail],
    ['Birthday',patientDob],
    ['Sex',     patientSex],
  ] as [string, string][]) {
    doc.text(`${label}: ${val}`, toX, toY); toY += 4
  }

  y = Math.max(fromY, toY) + 6

  // ── ITEMS TABLE ──
  autoTable(doc, {
    startY: y,
    head: [['Item #', 'Description', 'Amount']],
    body: order.items.map((item, i) => [
      String(i + 1),
      item.name,
      i === order.items.length - 1 ? amtStr : '',
    ]),
    theme: 'plain',
    headStyles: { fillColor: C_TEAL, textColor: [255, 255, 255] as [number,number,number], fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { fontSize: 8, textColor: C_CHARCOAL },
    columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 45, halign: 'right' } },
    margin: { left: ml, right: mr },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6

  // ── THIN DIVIDER ──
  doc.setDrawColor(...C_LGRAY); doc.setLineWidth(0.2)
  doc.line(ml, y, W - mr, y); y += 5

  // ── TOTALS ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C_CHARCOAL)
  doc.text('Total:', ml, y)
  doc.text(amtStr, W - mr, y, { align: 'right' }); y += 5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C_GRAY)
  doc.text(`Total Paid: HMO - ${walletName}`, ml, y)
  doc.text(amtStr, W - mr, y, { align: 'right' }); y += 8

  // ── FOOTER DIVIDER ──
  doc.setDrawColor(...C_LGRAY); doc.setLineWidth(0.2)
  doc.line(ml, y, W - mr, y); y += 5

  // ── FOOTER ──
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C_GRAY)
  doc.text('THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX', W / 2, y, { align: 'center' }); y += 4
  doc.text('— Nothing follows —', W / 2, y, { align: 'center' })

  doc.output('dataurlnewwindow')
}

// Per-transaction proof upload cell — supports multiple files per order.
// Files are stored as a JSON array in arProofUrl (or plain string for single).
function ProofCell({ orderId, currentUrl, onChange }: {
  orderId: string; currentUrl: string | null; onChange: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false)

  const urls = parseProofUrls(currentUrl)

  const persist = async (newUrls: string[]) => {
    const serialized = serializeProofUrls(newUrls)
    const r = await fetch('/api/accounts-receivable/proof', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, arProofUrl: serialized }),
    })
    if (!r.ok) throw new Error((await r.json()).error || 'Save failed')
    onChange(serialized)
  }

  /* ScanUpload streams several photos back-to-back from the phone poll, so
     additions accumulate through a ref — two photos arriving in one tick must
     not each persist against the same stale list and drop one another. */
  const pendingRef = useRef<string[] | null>(null)
  const addUrl = (url: string) => {
    const next = [...(pendingRef.current ?? urls), url]
    pendingRef.current = next
    persist(next)
      .catch(e => alert((e as Error).message || 'Failed to attach proof'))
      .finally(() => { if (pendingRef.current === next) pendingRef.current = null })
  }

  const remove = async (urlToRemove: string) => {
    if (!confirm('Remove this proof file?')) return
    setBusy(true)
    try {
      await persist(urls.filter(u => u !== urlToRemove))
    } catch (e) {
      alert((e as Error).message || 'Failed to remove proof')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col items-center gap-1 min-w-[90px]">
      {urls.map((url, i) => (
        <div key={url} className="flex items-center gap-1">
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg border text-[10px] font-medium"
            style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
            <FileCheck size={10} /> {urls.length > 1 ? `File ${i + 1}` : 'View'}
          </a>
          <button onClick={() => remove(url)} disabled={busy}
            className="p-0.5 rounded hover:bg-red-50 disabled:opacity-40" title="Remove this file">
            <X size={10} className="text-red-400" />
          </button>
        </div>
      ))}
      {/* File pick or QR scan — the phone photographs the proof and it lands
          on this order automatically, same session flow as everywhere else. */}
      <ScanUpload compact section="ar-proof" prefix={`ARPROOF-${orderId.slice(-6).toUpperCase()}`}
        existingCount={urls.length} onUploaded={addUrl}
        label={urls.length > 0 ? '+ Add' : 'Upload'} />
    </div>
  )
}

export default function AccountsReceivablePage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role || ''
  const isHmoOfficer = role === 'HMO_OFFICER'
  // Branch front desk keep the HMO tab read-only (no Record Payment) and skip its
  // Overview, but they maintain the Guarantee Letter paper trail, so the GL tab and
  // its Detailed GL sheet are theirs to edit. Other Customers stays hidden.
  const isFrontdesk = ['AHEA_FRONTDESK', 'AHGH_FRONTDESK'].includes(role)
  const visibleTabs = (isHmoOfficer ? ['HMO'] : isFrontdesk ? ['HMO', 'GL'] : ['HMO', 'GL', 'OTHERS']) as readonly ('HMO' | 'GL' | 'OTHERS')[]
  // Money: recording a payment against an agency or provider stays with the roles
  // that reconcile it.
  const canWrite = !isFrontdesk
  // Detailed GL case tracking. Mirrors WRITE_ROLES in
  // src/app/api/accounts-receivable/gl-case/route.ts — the API is the real gate, and
  // showing a pencil to someone whose save would 403 is worse than hiding it.
  const canEditGlCase = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN',
    'VERDANA_ADMIN', 'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK'].includes(role)
  const scope = userBranchScope((session?.user as { branch?: string })?.branch)
  const searchParams = useSearchParams()
  // HMO Officers and front desk are locked to the HMO tab only
  const initialType = ['GL', 'OTHERS'].includes(searchParams.get('type') || '')
    && (isHmoOfficer ? false : !(isFrontdesk && searchParams.get('type') === 'OTHERS'))
    ? (searchParams.get('type') as 'GL' | 'OTHERS') : 'HMO'
  const initialWallet = searchParams.get('wallet') || ''

  const [tab, setTab] = useState<'HMO' | 'GL' | 'OTHERS'>(initialType as 'HMO' | 'GL' | 'OTHERS')
  const [branch, setBranch] = useState(scope.enum || '')
  useEffect(() => { if (scope.enum && branch !== scope.enum) setBranch(scope.enum) }, [scope.enum]) // eslint-disable-line react-hooks/exhaustive-deps
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [walletFilter, setWalletFilter] = useState(initialWallet)
  const [sortField, setSortField] = useState('transactionDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Sort/filter for the Consumption table. Kept separate from sortField/sortDir
  // above, which drive the server-side order of the transactions list.
  const [consSortKey, setConsSortKey] = useState('')
  const [consSortDir, setConsSortDir] = useState<'asc' | 'desc'>('asc')
  const [consFilters, setConsFilters] = useState<Record<string, string>>({})
  const toggleConsSort = (k: string) => {
    if (consSortKey === k) setConsSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setConsSortKey(k); setConsSortDir('asc') }
  }

  const [wallets, setWallets] = useState<ARWallet[]>([])
  const [orders, setOrders] = useState<AROrder[]>([])
  const [arPayments, setArPayments] = useState<ARPaymentRecord[]>([])
  // Detailed GL entries created without a POS wallet behind them.
  const [glCases, setGlCases] = useState<GlCaseRow[]>([])
  // Full-history totals from the API. The `orders` list is capped at 500, so
  // summary figures must come from here or older years drop out silently.
  const [summary, setSummary] = useState<ARSummary | null>(null)
  const [loading, setLoading] = useState(true)

  // Aging dashboard state
  type AgingBucket = 'b0_30' | 'b31_60' | 'b61_90' | 'b90plus'
  interface AgingRow {
    walletId: string; walletName: string; ar: number; revenue: number; arDays: number;
    aging: { b0_30: number; b31_60: number; b61_90: number; b90plus: number };
    orderIdsByBucket: Record<AgingBucket, string[]>;
  }
  const [agingData, setAgingData] = useState<{
    periodDays: number; totalAR: number; totalRevenue: number; totalAllDeptRevenue: number; arDaysOverall: number; perWallet: AgingRow[];
  } | null>(null)
  const [agingPeriodDays, setAgingPeriodDays] = useState(90)
  // When user clicks a cell, filter the orders table to that bucket's ids
  const [bucketFilterIds, setBucketFilterIds] = useState<string[] | null>(null)
  const [bucketFilterLabel, setBucketFilterLabel] = useState('')
  // Drill-down popup: the actual sessions behind an aging figure.
  const [sessionModal, setSessionModal] = useState<{ label: string; ids: string[] } | null>(null)
  // Free-text filter over Payment History (both wallet tabs).
  const [paySearch, setPaySearch] = useState('')
  const [arDaysSort, setArDaysSort] = useState<'asc' | 'desc'>('desc')
  // Download menu for the summary dashboard (separate from the Per HMO one).
  const [showSummaryDownload, setShowSummaryDownload] = useState(false)
  // GL sub-tab: the dashboard, or the full case sheet.
  const [glSubTab, setGlSubTab] = useState<'overview' | 'detailed'>(
    searchParams.get('gltab') === 'detailed' ? 'detailed' : 'overview')
  const glFocusId = searchParams.get('focus') || ''

  // Record Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [payWalletId, setPayWalletId] = useState('')
  const [payWalletIds, setPayWalletIds] = useState<string[]>([])
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [payAmount, setPayAmount] = useState('')
  const [payDiscount, setPayDiscount] = useState('')
  const [payDiscountAccountId, setPayDiscountAccountId] = useState('')
  const [payDiscountSearch, setPayDiscountSearch] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [paySalesInvoice, setPaySalesInvoice] = useState('')
  const [payProofUrls, setPayProofUrls] = useState<string[]>([])
  const [paySelectedOrders, setPaySelectedOrders] = useState<string[]>([])
  // The page's `orders` list is capped to the 500 newest, so old (e.g. imported
  // QB 2025) orders never reach it. The tag list instead uses a wallet-scoped
  // fetch, which the API returns uncapped-in-practice.
  const [payWalletOrders, setPayWalletOrders] = useState<AROrder[]>([])
  // Payment-modal tagging UX: full-screen toggle + tag-list filters (search / date range)
  const [payModalExpanded, setPayModalExpanded] = useState(false)
  const [payTagSearch, setPayTagSearch] = useState('')
  const [payTagFrom, setPayTagFrom] = useState('')
  const [payTagTo, setPayTagTo] = useState('')
  const [payError, setPayError] = useState('')
  const [paySaving, setPaySaving] = useState(false)
  const [discountAccounts, setDiscountAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [cashAccounts, setCashAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [payCashAccountId, setPayCashAccountId] = useState('')
  const [payCashAccountSearch, setPayCashAccountSearch] = useState('')
  // HMO overpayment: income accounts (REVENUE, credit balance) the excess can be classified to
  const [incomeAccounts, setIncomeAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [payOverpayAccountId, setPayOverpayAccountId] = useState('')
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)

  // HMO sub-tab state
  const [hmoSubTab, setHmoSubTab] = useState<'overview' | 'per-hmo' | 'soa-report' | 'submitted-soa' | 'loa'>('overview')
  // useSession resolves after the first render, so the initial tab/sub-tab are
  // picked before the role is known. Snap them back once it arrives — a ?type=
  // link or a stale sub-tab must not park a restricted user on a hidden view.
  useEffect(() => {
    if (!visibleTabs.includes(tab)) { setTab('HMO'); setWalletFilter(''); setBucketFilterIds(null); setBucketFilterLabel('') }
    if (isFrontdesk && hmoSubTab === 'overview') setHmoSubTab('per-hmo')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFrontdesk, tab, hmoSubTab, visibleTabs.join(',')])
  // Per HMO sub-tab state
  const [perHmoWallet, setPerHmoWallet] = useState('')
  // Fullscreen overlay for the Per HMO table — it carries a lot of columns.
  const [perHmoExpanded, setPerHmoExpanded] = useState(false)
  useEffect(() => {
    if (!perHmoExpanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPerHmoExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [perHmoExpanded])
  const [perHmoFrom, setPerHmoFrom] = useState('')
  const [perHmoTo, setPerHmoTo] = useState('')
  const [perHmoSortField, setPerHmoSortField] = useState('transactionDate')
  const [perHmoSortDir, setPerHmoSortDir] = useState<'asc' | 'desc'>('desc')
  const [perHmoColSearch, setPerHmoColSearch] = useState<Record<string, string>>({})
  // Per HMO fetches its own period rather than sifting the page list. That list
  // is the 500 newest orders, which reaches back only a few months, so every
  // imported QuickBooks order sat outside it and the tab showed
  // "No transactions found" for any past year.
  const [perHmoFetched, setPerHmoFetched] = useState<AROrder[] | null>(null)
  const [perHmoLoading, setPerHmoLoading] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)

  // Invoice Settings state
  const [invoiceSettings, setInvoiceSettings] = useState<Record<string, InvoiceSetting>>({})
  const [showInvoiceSettings, setShowInvoiceSettings] = useState(false)
  const [invSettingBranch, setInvSettingBranch] = useState('')
  const [invForm, setInvForm] = useState<Partial<InvoiceSetting>>({})
  const [invSettingSaving, setInvSettingSaving] = useState(false)
  const [invoiceBusy, setInvoiceBusy] = useState<string | null>(null)

  // Change Date — inline editing state per order
  const [changeDateEditId, setChangeDateEditId] = useState<string | null>(null)
  const [changeDateValue, setChangeDateValue] = useState('')
  const [changeDateBusy, setChangeDateBusy] = useState<string | null>(null)

  // Approved-SOA recompute (one-shot data correction for the 2026-04-08
  // migration that clobbered totalGlAmount with the then-current balance).
  const [recomputeBusy, setRecomputeBusy] = useState(false)
  const [recomputeResult, setRecomputeResult] = useState<{
    updated: number; skipped: number;
    changes: { patientName: string; currentTotalGlAmount: number | null; derivedTotalGlAmount: number }[];
  } | null>(null)
  const canRecomputeSoa = session?.user?.role === 'ADMIN' || session?.user?.role === 'ACCOUNTANT'

  const fetchData = useCallback(async () => {
    if (tab === 'OTHERS') return // Others has its own fetch inside OthersTab
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: tab, sortField, sortDir })
      if (branch) params.set('branch', branch)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (walletFilter) params.set('walletId', walletFilter)
      const res = await fetch(`/api/accounts-receivable?${params}`)
      const data = await res.json()
      setWallets(data.wallets || [])
      setOrders(data.orders || [])
      setArPayments(data.arPayments || [])
      setGlCases(data.glCases || [])
      setSummary(data.summary || null)
    } catch {
      setOrders([])
      setGlCases([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [tab, branch, dateFrom, dateTo, walletFilter, sortField, sortDir])

  useEffect(() => { fetchData() }, [fetchData])

  // Wallet-scoped orders for the Record Payment tag list — reaches past the
  // page list's 500-newest cap so old imported (QB) orders are taggable too.
  useEffect(() => {
    setPayWalletOrders([])
    if (!showPaymentModal || tab === 'GL' || !payWalletId) return
    const ctl = new AbortController()
    fetch(`/api/accounts-receivable?type=${tab}&walletId=${payWalletId}`, { signal: ctl.signal })
      .then(r => r.json())
      .then(d => setPayWalletOrders(d.orders || []))
      .catch(() => {})
    return () => ctl.abort()
  }, [showPaymentModal, tab, payWalletId])

  // Per HMO's own order fetch. Any of its filters makes the request narrow
  // enough for the API to lift the 500-row page cap, so a past year returns the
  // imported QB orders it actually holds. With no filter set there is nothing
  // to widen to, and the tab falls back to the page list.
  useEffect(() => {
    if (tab !== 'HMO' || hmoSubTab !== 'per-hmo') return
    if (!perHmoWallet && !perHmoFrom && !perHmoTo) { setPerHmoFetched(null); return }
    const ctl = new AbortController()
    const params = new URLSearchParams({ type: 'HMO', sortField, sortDir })
    if (branch) params.set('branch', branch)
    if (perHmoWallet) params.set('walletId', perHmoWallet)
    if (perHmoFrom) params.set('dateFrom', perHmoFrom)
    if (perHmoTo) params.set('dateTo', perHmoTo)
    setPerHmoLoading(true)
    fetch(`/api/accounts-receivable?${params}`, { signal: ctl.signal })
      .then(r => r.json())
      .then(d => setPerHmoFetched(d.orders || []))
      .catch(() => {})
      .finally(() => setPerHmoLoading(false))
    return () => ctl.abort()
  }, [tab, hmoSubTab, branch, perHmoWallet, perHmoFrom, perHmoTo, sortField, sortDir])

  // Fetch aging dashboard data whenever tab / branch / period changes
  useEffect(() => {
    if (tab === 'OTHERS') return
    const ctl = new AbortController()
    const load = async () => {
      try {
        const p = new URLSearchParams({ type: tab, periodDays: String(agingPeriodDays) })
        if (branch) p.set('branch', branch)
        const r = await fetch(`/api/accounts-receivable/aging?${p}`, { signal: ctl.signal })
        if (!r.ok) return
        const d = await r.json()
        setAgingData(d)
      } catch { /* ignore abort / network */ }
    }
    load()
    return () => ctl.abort()
  }, [tab, branch, agingPeriodDays])

  // Fetch REVENUE COA accounts once: DEBIT-balance ones are discount/write-off
  // targets; CREDIT-balance ones are income accounts an overpayment can go to.
  useEffect(() => {
    fetch('/api/chart-of-accounts?accountType=REVENUE&pageSize=500')
      .then(r => r.json())
      .then(d => {
        const rows = (d.data || []) as { id: string; accountNumber: string; accountTitle: string; normalBalance: string }[]
        const slim = (a: typeof rows[number]) => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle })
        setDiscountAccounts(rows.filter(a => a.normalBalance === 'DEBIT').map(slim))
        setIncomeAccounts(rows.filter(a => a.normalBalance === 'CREDIT').map(slim))
      })
      .catch(() => {})
  }, [])

  // Fetch ASSET-type accounts for cash/bank account selection (Debit Account)
  useEffect(() => {
    fetch('/api/chart-of-accounts?accountType=ASSET&pageSize=500')
      .then(r => r.json())
      .then(d => setCashAccounts(
        (d.data || [])
          .map((a: { id: string; accountNumber: string; accountTitle: string }) => ({
            id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle,
          }))
      ))
      .catch(() => {})
  }, [])

  // Fetch invoice settings (per-branch)
  useEffect(() => {
    fetch('/api/accounts-receivable/invoice-settings')
      .then(r => r.json())
      .then((data: InvoiceSetting[]) => {
        const map: Record<string, InvoiceSetting> = {}
        for (const s of data) map[s.branch] = s
        setInvoiceSettings(map)
      })
      .catch(() => {})
  }, [])

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ArrowUpDown size={12} className="opacity-30" />
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  // Consumption rows, sorted and filtered. The two groups are ordered and
  // filtered independently so approved-SOA agencies stay above the per-session
  // ones — they are read differently and must not interleave.
  const consumptionRows = useMemo(() => {
    const pctOf = (w: ARWallet) => {
      const approved = toNum(w.balance)
      return approved > 0 ? ((w.consumedOutstanding || 0) / approved) * 100 : 0
    }
    // Sorting wants numbers; filtering wants the text actually on screen — an
    // agency with no payment reads "unpaid", not a sentinel number.
    const sortGet = (w: ARWallet, k: string): string | number => {
      switch (k) {
        case 'name': return w.patientName || ''
        case 'branch': return branchLabel(w.branch)
        case 'approved': return toNum(w.balance)
        case 'paid': return toNum(w.paidTotal)
        // Undated rows sort to the end rather than to 1970.
        case 'soaDate': return w.soaDate ? String(w.soaDate) : '￿'
        case 'paidDate': return w.lastPaymentDate ? String(w.lastPaymentDate) : '￿'
        // What the agency still owes: approved less what it has settled.
        case 'ar': return Math.max(0, toNum(w.balance) - toNum(w.paidTotal))
        case 'commission': return toNum(w.commissionTotal)
        // Unpaid agencies sort to the end either way rather than as zero.
        case 'months': return typeof w.monthsToPay === 'number' ? w.monthsToPay : Number.MAX_SAFE_INTEGER
        case 'consumed': return w.consumedOutstanding || 0
        case 'pct': return w.perSession ? -1 : pctOf(w)
        default: return ''
      }
    }
    const filterGet = (w: ARWallet, k: string): string | number => {
      switch (k) {
        case 'months': return typeof w.monthsToPay === 'number' ? `${w.monthsToPay.toFixed(1)} mo` : 'unpaid'
        case 'soaDate': return w.soaDate ? formatDate(w.soaDate) : '—'
        case 'paidDate': return w.lastPaymentDate ? formatDate(w.lastPaymentDate) : 'unpaid'
        case 'pct': return w.perSession ? 'per session' : `${pctOf(w).toFixed(1)}%`
        default: return sortGet(w, k)
      }
    }
    const sortGroup = (rows: ARWallet[]) =>
      applySortFilter(rows, sortGet, consSortKey, consSortDir, consFilters, filterGet)
    return [
      ...sortGroup(wallets.filter(w => !w.perSession)),
      ...sortGroup(wallets.filter(w => w.perSession)),
    ]
  }, [wallets, consSortKey, consSortDir, consFilters])

  const consumptionCols: SortCol[] = tab === 'GL'
    ? [
      { key: 'name', label: 'Agency / Name' },
      { key: 'branch', label: 'Branch' },
      { key: 'approved', label: 'Approved SOA' },
      { key: 'soaDate', label: 'Date of SOA' },
      { key: 'paid', label: 'Paid' },
      { key: 'paidDate', label: 'Date Paid' },
      { key: 'commission', label: 'Commission' },
      { key: 'months', label: 'Months to pay' },
      { key: 'ar', label: 'AR Balance' },
      { key: 'consumed', label: 'Consumed' },
      { key: 'pct', label: '% Consumed' },
    ]
    : [
      { key: 'name', label: 'HMO Provider' },
      { key: 'branch', label: 'Branch' },
      { key: 'approved', label: 'Outstanding' },
    ]

  /**
   * One definition of each Payment History column, used by the free-text search,
   * the per-column filters, the sort and nothing else — so what is displayed,
   * what is searched and what is sorted can never drift apart.
   *
   * `sort` returns a number where the column is numeric or a date, so amounts
   * order by value rather than by the text "1,000" sorting before "9".
   */
  const payCols = useMemo(() => ([
    { key: 'date',    label: 'Date',            text: (p: ARPaymentRecord) => formatDate(p.paymentDate),
      sort: (p: ARPaymentRecord) => new Date(p.paymentDate).getTime() },
    { key: 'si',      label: 'SI Number',       text: (p: ARPaymentRecord) => p.salesInvoiceNumber || '' },
    { key: 'agency',  label: 'Provider/Agency', text: (p: ARPaymentRecord) => wallets.find(w => w.id === p.walletId)?.patientName || '' },
    { key: 'amount',  label: 'Amount',          text: (p: ARPaymentRecord) => formatCurrency(toNum(p.amount)),
      sort: (p: ARPaymentRecord) => toNum(p.amount), numeric: true },
    { key: 'discount', label: 'Discount',       text: (p: ARPaymentRecord) => toNum(p.discount) ? formatCurrency(toNum(p.discount)) : '',
      sort: (p: ARPaymentRecord) => toNum(p.discount), numeric: true },
    { key: 'account', label: 'Debit Account',   text: (p: ARPaymentRecord) => p.cashAccount ? `${p.cashAccount.accountNumber} ${p.cashAccount.accountTitle}` : '' },
    { key: 'orders',  label: 'Orders',          text: (p: ARPaymentRecord) => String(p.items?.length ?? 0),
      sort: (p: ARPaymentRecord) => p.items?.length ?? 0, numeric: true },
    { key: 'notes',   label: 'Notes',           text: (p: ARPaymentRecord) => p.notes || '' },
    { key: 'proof',   label: 'Proof',           text: () => '' },
    { key: 'by',      label: 'Recorded By',     text: (p: ARPaymentRecord) => p.createdBy?.name || '' },
  ]), [wallets])

  const [paySort, setPaySort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [payFilters, setPayFilters] = useState<Record<string, string>>({})

  const togglePaySort = (key: string) =>
    setPaySort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  // Payment History search — matches the text actually on the row, so what the
  // user reads is what they can search for.
  const shownPayments = useMemo(() => {
    const q = paySearch.trim().toLowerCase()
    let out = arPayments
    if (q) out = out.filter(p => payCols.map(c => c.text(p)).join(' ').toLowerCase().includes(q))
    for (const c of payCols) {
      const needle = (payFilters[c.key] || '').trim().toLowerCase()
      if (needle) out = out.filter(p => c.text(p).toLowerCase().includes(needle))
    }
    const col = payCols.find(c => c.key === paySort.key)
    if (!col) return out
    return [...out].sort((a, b) => {
      const av = col.sort ? col.sort(a) : col.text(a)
      const bv = col.sort ? col.sort(b) : col.text(b)
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
      return paySort.dir === 'asc' ? cmp : -cmp
    })
  }, [arPayments, paySearch, payCols, payFilters, paySort])

  const activePayFilters = Object.values(payFilters).filter(v => (v || '').trim()).length

  const totalReceivable = wallets.reduce((s, w) => s + toNum(w.balance), 0)
  const unpaidOrders = orders.filter(o => o.arPaymentItems.length === 0)
  // Sessions the HMO settles with the clinician directly — never our receivable.
  const isDirectToClinician = (o: AROrder) =>
    o.items.length > 0 && o.items.every(it => it.service?.hmoPaysClinicianDirect)
    && !o.payments.some(p => p.walletId && wallets.find(w => w.id === p.walletId && (w as { paysClinicForMd?: boolean }).paysClinicForMd))

  // ---- Payment-modal tag-list filters (shared by HMO transaction tagging and GL patient tagging) ----
  const tagQuery = payTagSearch.trim().toLowerCase()
  // Amount form of the query: "₱4,000" / "4,000.00" → "4000" / "4000.00"
  const tagAmtQuery = tagQuery.replace(/[₱,\s]/g, '')

  const inTagDateRange = (iso: string | null | undefined) => {
    const d = (iso || '').slice(0, 10)
    if (!d) return !payTagFrom && !payTagTo
    if (payTagFrom && d < payTagFrom) return false
    if (payTagTo && d > payTagTo) return false
    return true
  }

  const tagTextOrAmountMatches = (text: string, amounts: number[]) => {
    if (!tagQuery) return true
    if (text.toLowerCase().includes(tagQuery)) return true
    if (!tagAmtQuery || !/^[\d.]+$/.test(tagAmtQuery)) return false
    return amounts.some(a => String(a).includes(tagAmtQuery) || a.toFixed(2).includes(tagAmtQuery))
  }

  const tagFiltersActive = !!(tagQuery || payTagFrom || payTagTo)

  const renderTagFilterBar = (placeholder: string) => (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <div className="relative flex-1 min-w-[160px]">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
        <input type="text" value={payTagSearch} onChange={e => setPayTagSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-8 pr-2 py-2 rounded-xl border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
      </div>
      <input type="date" value={payTagFrom} onChange={e => setPayTagFrom(e.target.value)} title="From date"
        className="px-2 py-2 rounded-xl border text-xs outline-none"
        style={{ borderColor: payTagFrom ? 'var(--teal)' : 'var(--light-gray)', color: 'var(--charcoal)' }} />
      <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
      <input type="date" value={payTagTo} onChange={e => setPayTagTo(e.target.value)} title="To date"
        className="px-2 py-2 rounded-xl border text-xs outline-none"
        style={{ borderColor: payTagTo ? 'var(--teal)' : 'var(--light-gray)', color: 'var(--charcoal)' }} />
      {tagFiltersActive && (
        <button type="button" onClick={() => { setPayTagSearch(''); setPayTagFrom(''); setPayTagTo('') }}
          title="Clear filters" className="p-1.5 rounded-lg hover:bg-gray-100">
          <X size={14} style={{ color: 'var(--mid-gray)' }} />
        </button>
      )}
    </div>
  )

  const openPaymentModal = () => {
    setEditingPaymentId(null)
    setPayWalletId(walletFilter || '')
    setPayWalletIds(walletFilter ? [walletFilter] : [])
    setPayDate(new Date().toISOString().split('T')[0])
    setPayAmount('')
    setPayDiscount('')
    setPayDiscountAccountId('')
    setPayDiscountSearch('')
    setPayCashAccountId('')
    setPayCashAccountSearch('')
    setPayOverpayAccountId('')
    setPayNotes('')
    setPaySalesInvoice('')
    setPayProofUrls([])
    setPaySelectedOrders([])
    setPayError('')
    setPayModalExpanded(false)
    setPayTagSearch('')
    setPayTagFrom('')
    setPayTagTo('')
    setShowPaymentModal(true)
  }

  const openEditPaymentModal = (p: ARPaymentRecord) => {
    setEditingPaymentId(p.id)
    setPayWalletId(p.walletId)
    setPayWalletIds([p.walletId])
    setPayDate(new Date(p.paymentDate).toISOString().split('T')[0])
    setPayAmount(String(toNum(p.amount)))
    setPayDiscount(toNum(p.discount) > 0 ? String(toNum(p.discount)) : '')
    setPayDiscountAccountId('')
    setPayDiscountSearch('')
    setPayCashAccountId(p.cashAccountId || '')
    setPayCashAccountSearch(p.cashAccount ? `${p.cashAccount.accountNumber} ${p.cashAccount.accountTitle}` : '')
    setPayOverpayAccountId(p.overpaymentAccountId || '')
    setPayNotes(p.notes || '')
    setPaySalesInvoice(p.salesInvoiceNumber || '')
    setPayProofUrls(parseProofUrls(p.proofUrl))
    setPaySelectedOrders(p.items.map(i => i.orderId))
    setPayError('')
    setPayModalExpanded(false)
    setPayTagSearch('')
    setPayTagFrom('')
    setPayTagTo('')
    setShowPaymentModal(true)
  }

  // HMO overpayment: how much of the payment (+discount) exceeds the tagged
  // transactions. Only derivable when transactions are tagged — the tag list is
  // what proves the payer sent a few pesos extra.
  const payTaggedTotal = (() => {
    if (tab === 'GL' || !payWalletId || paySelectedOrders.length === 0) return 0
    const source = payWalletOrders.length ? payWalletOrders : orders
    return paySelectedOrders.reduce((s, oid) => {
      const o = source.find(x => x.id === oid)
      return s + toNum(o?.payments.find(p => p.walletId === payWalletId)?.amount)
    }, 0)
  })()
  const payOverpay = paySelectedOrders.length > 0 && payTaggedTotal > 0
    ? Math.max(0, +(toNum(payAmount) + toNum(payDiscount) - payTaggedTotal).toFixed(2))
    : 0

  const savePayment = async () => {
    // For GL multi-select, use payWalletIds; for HMO use payWalletId
    const effectiveWalletIds = tab === 'GL' && !editingPaymentId ? payWalletIds : (payWalletId ? [payWalletId] : [])
    if (effectiveWalletIds.length === 0) { setPayError('Select an HMO/Agency'); return }
    if (!payAmount || toNum(payAmount) <= 0) { setPayError('Amount is required'); return }
    if (payOverpay > 0 && !payOverpayAccountId) { setPayError(`Choose an income account for the ${formatCurrency(payOverpay)} overpayment`); return }
    setPaySaving(true)
    setPayError('')
    try {
      const isEdit = !!editingPaymentId
      // For GL multi-select (new payment), create one payment per wallet splitting evenly, or single bulk
      const res = await fetch('/api/accounts-receivable/payments', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: editingPaymentId } : {}),
          walletId: effectiveWalletIds[0],
          walletIds: effectiveWalletIds.length > 1 ? effectiveWalletIds : undefined,
          paymentDate: payDate,
          amount: toNum(payAmount),
          discount: toNum(payDiscount),
          discountAccountId: payDiscountAccountId || null,
          cashAccountId: payCashAccountId || null,
          overpayment: payOverpay,
          overpaymentAccountId: payOverpay > 0 ? payOverpayAccountId : null,
          orderIds: paySelectedOrders,
          proofUrl: payProofUrls.length > 0 ? JSON.stringify(payProofUrls) : null,
          notes: payNotes || null,
          salesInvoiceNumber: paySalesInvoice || null,
          branch: branch || null,
        }),
      })
      if (res.ok) {
        setShowPaymentModal(false)
        fetchData()
      } else {
        const d = await res.json()
        setPayError(d.error || 'Failed to save')
      }
    } catch {
      setPayError('Network error')
    } finally {
      setPaySaving(false)
    }
  }

  const deletePayment = async (payment: ARPaymentRecord) => {
    const wallet = wallets.find(w => w.id === payment.walletId)
    const reason = window.prompt(
      `Delete payment of ${formatCurrency(toNum(payment.amount))} for "${wallet?.patientName || 'Unknown'}"?\n\nThis will restore the wallet balance.\n\nPlease enter a reason:`
    )
    if (!reason?.trim()) return
    try {
      const res = await fetch(`/api/accounts-receivable/payments?id=${payment.id}&reason=${encodeURIComponent(reason.trim())}`, { method: 'DELETE' })
      if (res.ok) {
        fetchData()
      } else {
        const d = await res.json()
        alert(d.error || 'Failed to delete payment')
      }
    } catch {
      alert('Network error')
    }
  }

  const saveInvoiceSettings = async () => {
    if (!invSettingBranch) return
    setInvSettingSaving(true)
    try {
      const res = await fetch('/api/accounts-receivable/invoice-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: invSettingBranch, ...invForm }),
      })
      if (res.ok) {
        const updated: InvoiceSetting = await res.json()
        setInvoiceSettings(prev => ({ ...prev, [updated.branch]: updated }))
      }
    } catch { /* ignore */ }
    finally { setInvSettingSaving(false) }
  }

  const saveCustomDate = async (orderId: string, newDate: string | null) => {
    setChangeDateBusy(orderId)
    try {
      const res = await fetch('/api/accounts-receivable/custom-date', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, arCustomDate: newDate }),
      })
      if (res.ok) {
        setOrders(prev => prev.map(o =>
          o.id === orderId ? { ...o, arCustomDate: newDate } : o
        ))
      }
    } catch { /* ignore */ }
    finally {
      setChangeDateBusy(null)
      setChangeDateEditId(null)
    }
  }

  /* ── SOA Submission Status (Pending / Approved / Disapproved) ──
     Manual per-claim outcome; a paid order displays as Approved regardless. */
  const [soaStatusBusy, setSoaStatusBusy] = useState<string | null>(null)
  const saveSoaStatus = async (orderId: string, status: string) => {
    setSoaStatusBusy(orderId)
    try {
      const res = await fetch('/api/accounts-receivable/soa-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status: status || null }),
      })
      if (res.ok) {
        setOrders(prev => prev.map(o =>
          o.id === orderId ? { ...o, soaApprovalStatus: status || null } : o
        ))
      }
    } catch { /* ignore */ }
    finally { setSoaStatusBusy(null) }
  }

  /* ── Summary dashboard export ──────────────────────────────────
     Builds the four tables on this screen once, so the Excel workbook and
     the PDF always carry the same figures. Everything reflects the filters
     currently applied — the file should match what the screen shows, not a
     second, unfiltered version of the truth. */
  const buildSummaryExport = () => {
    const isGL = tab === 'GL'
    const money = (n: number) => Number(n || 0).toFixed(2)

    const scopeBits = [
      branch ? branchLabel(branch) : 'All branches',
      `last ${agingPeriodDays} days`,
      dateFrom || dateTo ? `orders ${dateFrom || 'start'} → ${dateTo || 'today'}` : null,
      walletFilter ? (wallets.find(w => w.id === walletFilter)?.patientName || null) : null,
    ].filter(Boolean)

    const kpis = [
      { label: 'AR Days (Overall)', value: agingData ? `${agingData.arDaysOverall.toFixed(1)} days` : '—' },
      { label: 'Total AR', value: agingData ? formatCurrency(agingData.totalAR) : '—' },
      { label: `Revenue (${agingPeriodDays}d)`, value: agingData ? formatCurrency(agingData.totalRevenue) : '—' },
      ...(!isGL && agingData?.totalAllDeptRevenue != null
        ? [{ label: 'All-dept revenue', value: formatCurrency(agingData.totalAllDeptRevenue) }]
        : []),
    ]

    // 1) Consumption — same columns and order as the on-screen table.
    const consumptionHeaders = consumptionCols.map(c => c.label)
    const consumptionRowsOut = consumptionRows.map(w => {
      const approved = toNum(w.balance)
      const consumed = typeof w.consumedOutstanding === 'number' ? w.consumedOutstanding : 0
      const pct = approved > 0 ? (consumed / approved) * 100 : 0
      const base = [w.patientName, branchLabel(w.branch) || '—']
      return isGL
        ? [...base, money(approved),
           w.soaDate ? formatDate(w.soaDate) : '—',
           money(toNum(w.paidTotal)),
           w.lastPaymentDate ? formatDate(w.lastPaymentDate) : 'unpaid',
           money(toNum(w.commissionTotal)),
           typeof w.monthsToPay === 'number' ? `${w.monthsToPay.toFixed(1)} mo` : 'unpaid',
           money(Math.max(0, approved - toNum(w.paidTotal))),
           money(consumed), w.perSession ? 'per session' : `${pct.toFixed(1)}%`]
        : [...base, money(approved)]
    })

    // 2) AR Days per wallet
    const arDaysRows = (agingData?.perWallet || [])
      .filter(w => w.ar > 0 || w.revenue > 0)
      .sort((a, b) => arDaysSort === 'asc' ? a.arDays - b.arDays : b.arDays - a.arDays)
      .map(w => [w.walletName, money(w.ar), money(w.revenue), w.arDays.toFixed(1)])

    // 3) Aging buckets, with the same TOTAL line the screen shows
    const agingRows = (agingData?.perWallet || []).filter(w => w.ar > 0)
    const bucketTotals = agingRows.reduce(
      (acc, r) => ({
        b0_30: acc.b0_30 + r.aging.b0_30, b31_60: acc.b31_60 + r.aging.b31_60,
        b61_90: acc.b61_90 + r.aging.b61_90, b90plus: acc.b90plus + r.aging.b90plus,
        ar: acc.ar + r.ar,
      }),
      { b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0, ar: 0 },
    )

    // 4) Payment history
    const paymentRows = arPayments.map(p => [
      formatDate(p.paymentDate),
      p.salesInvoiceNumber || '—',
      wallets.find(w => w.id === p.walletId)?.patientName || '—',
      money(toNum(p.amount)),
      money(toNum(p.discount)),
      p.cashAccount ? `${p.cashAccount.accountNumber} ${p.cashAccount.accountTitle}` : '—',
      String(p.items?.length ?? 0),
      p.notes || '',
      p.createdBy?.name || '—',
    ])

    return {
      label: isGL ? 'Guarantee Letters (GL)' : 'HMO Providers',
      scope: scopeBits.join(' · '),
      kpis,
      sections: [
        { heading: 'Consumption', headers: consumptionHeaders, rows: consumptionRowsOut },
        // AR Days and Aging Receivable Details are HMO-only, matching the screen:
        // both panels are hidden on the GL tab, so the GL export must not carry
        // sections the user can no longer see.
        ...(isGL ? [] : [
          {
            heading: `AR Days per ${isGL ? 'Agency' : 'HMO'}`,
            headers: [isGL ? 'Agency' : 'HMO', 'Total AR', `Revenue (${agingPeriodDays}d)`, 'AR Days'],
            rows: arDaysRows,
          },
          {
            heading: 'Aging Receivable Details',
            headers: [isGL ? 'Agency' : 'HMO', '0–30 days', '31–60 days', '61–90 days', '>90 days', 'Total'],
            rows: agingRows.map(w => [w.walletName, money(w.aging.b0_30), money(w.aging.b31_60),
                                      money(w.aging.b61_90), money(w.aging.b90plus), money(w.ar)]),
            totalRow: ['TOTAL', money(bucketTotals.b0_30), money(bucketTotals.b31_60),
                       money(bucketTotals.b61_90), money(bucketTotals.b90plus), money(bucketTotals.ar)],
          },
        ]),
        {
          heading: 'Payment History',
          headers: ['Date', 'SI Number', isGL ? 'Agency' : 'Provider', 'Amount', 'Discount', 'Debit Account', 'Orders', 'Notes', 'Recorded By'],
          rows: paymentRows,
        },
      ],
    }
  }

  const downloadSummaryExcel = () => {
    const x = buildSummaryExport()
    const stamp = new Date().toISOString().slice(0, 10)
    downloadXlsx(`ar-summary-${tab.toLowerCase()}-${stamp}`, [
      // The headline figures ride in their own sheet — putting them above a
      // table would break the header row every other tool expects on row 1.
      { name: 'Summary', headers: ['Figure', 'Value'], rows: [
        ['Scope', x.scope],
        ...x.kpis.map(k => [k.label, k.value]),
      ] },
      ...x.sections.map(s => ({
        name: s.heading,
        headers: s.headers,
        rows: s.totalRow ? [...s.rows, s.totalRow] : s.rows,
      })),
    ])
    setShowSummaryDownload(false)
  }

  const downloadSummaryPdf = () => {
    const x = buildSummaryExport()
    downloadReportPdf({
      title: `Accounts Receivable Summary — ${x.label}`,
      subtitle: x.scope,
      kpis: x.kpis,
      sections: x.sections,
      landscape: true,
    })
    setShowSummaryDownload(false)
  }

  const toggleOrderSelect = (orderId: string) => {
    setPaySelectedOrders(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    )
  }

  if (!session?.user) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <FileCheck size={28} style={{ color: 'var(--teal)' }} /> Accounts Receivable
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>Monitor and record payments from HMO providers and Guarantee Letter agencies</p>
        </div>
        {tab !== 'OTHERS' && (
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Total Receivable ({tab})</p>
            <p className="text-lg font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(totalReceivable)}</p>
          </div>
          {canWrite && (
          <button onClick={openPaymentModal} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--teal)' }}>
            <DollarSign size={16} /> Record Payment
          </button>
          )}
        </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {visibleTabs.map(t => (
          <button key={t} onClick={() => { setTab(t); setWalletFilter(''); setBucketFilterIds(null); setBucketFilterLabel(''); setHmoSubTab(isFrontdesk ? 'per-hmo' : 'overview') }}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={tab === t
              ? { background: 'var(--teal)', color: 'white' }
              : { background: 'var(--off-white)', color: 'var(--charcoal)' }}>
            {t === 'HMO' ? 'HMO Providers' : t === 'GL' ? 'Guarantee Letters (GL)' : 'Other Customers'}
          </button>
        ))}
      </div>

      {/* Branch filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Branch:</span>
        {([
          { value: '', label: 'All' },
          { value: 'SANDBOX_EAST', label: 'East Branch' },
          { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
          { value: 'VERDANA_STORE', label: 'Verdana' },
          { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
        ] as const).filter(b => !scope.enum || b.value === scope.enum).map(b => (
          <button
            key={b.value}
            onClick={() => setBranch(b.value)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
            style={branch === b.value
              ? { background: 'var(--teal)', color: 'white' }
              : { background: 'var(--off-white)', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
            {b.label}
          </button>
        ))}
      </div>

      {/* HMO Sub-tabs */}
      {tab === 'HMO' && (
        <div className="flex gap-2 border-b pb-0" style={{ borderColor: 'var(--light-gray)' }}>
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'per-hmo', label: 'Per HMO' },
            { key: 'soa-report', label: 'Generate SOA' },
            { key: 'submitted-soa', label: 'SOA Submissions' },
            // Letters of Authorization are raised in the Operations Hub; this is
            // the HMO officer's read-only window onto them.
            { key: 'loa', label: 'LOA Submission' },
          ] as const).filter(st => !(isFrontdesk && st.key === 'overview')).map(st => (
            <button key={st.key} onClick={() => setHmoSubTab(st.key)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={hmoSubTab === st.key
                ? { color: 'var(--teal)', borderBottom: '2px solid var(--teal)' }
                : { color: 'var(--mid-gray)', borderBottom: '2px solid transparent' }}>
              {st.label}
            </button>
          ))}
        </div>
      )}

      {/* GL Sub-tabs */}
      {tab === 'GL' && (
        <div className="flex gap-2 border-b pb-0" style={{ borderColor: 'var(--light-gray)' }}>
          {([{ key: 'overview', label: 'Overview' }, { key: 'detailed', label: 'Detailed GL' }] as const).map(st => (
            <button key={st.key} onClick={() => setGlSubTab(st.key)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={glSubTab === st.key
                ? { color: 'var(--teal)', borderBottom: '2px solid var(--teal)' }
                : { color: 'var(--mid-gray)', borderBottom: '2px solid transparent' }}>
              {st.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Detailed GL: every letter in the OPGL summary layout ── */}
      {tab === 'GL' && glSubTab === 'detailed' && (
        <DetailedGl
          canWrite={canEditGlCase}
          onSaved={fetchData}
          focusId={glFocusId}
          glCases={glCases}
          wallets={wallets.map(w => ({
            ...w,
            // "Rendered service?" — has anything actually been billed to the letter.
            hasOrders: orders.some(o => o.payments.some(p => p.walletId === w.id)),
          }))}
        />
      )}

      {/* ── GL Summary: % consumed, % paid, department pie chart ── */}
      {tab === 'GL' && (() => {
        // Per-session agencies have no approved amount, so they are left out of the
        // approved-basis percentages — including them would divide a consumed figure
        // by a denominator that does not contain it.
        // The branch chips above filter the orders query server-side, but the wallet
        // query is not branch-scoped, so GL Summary was reporting every branch no
        // matter which chip was lit. Scope it here, on the same [branch, 'ALL']
        // convention the order filter uses, so a company-wide letter still shows in
        // the branch views it funds.
        const inBranch = (w: ARWallet) => !branch || w.branch === branch || w.branch === 'ALL'
        const branchWallets = wallets.filter(inBranch)
        const branchWalletIds = new Set(branchWallets.map(w => w.id))
        const approvedWallets = branchWallets.filter(w => !w.perSession)
        const perSessionWallets = branchWallets.filter(w => w.perSession)
        const perSessionOutstanding = perSessionWallets.reduce((s, w) => s + toNum(w.balance), 0)
        const totalApproved = approvedWallets.reduce((s, w) => s + toNum(w.totalGlAmount), 0)
        // Use consumedOutstanding (= totalGlAmount − remaining balance) so that
        // zero-balance wallets and partially-consumed wallets are included correctly.
        const totalConsumed = approvedWallets.reduce((s, w) => s + (w.consumedOutstanding ?? 0), 0)
        const totalPaid = arPayments
          .filter(p => !branch || !p.walletId || branchWalletIds.has(p.walletId))
          .reduce((s, p) => s + toNum(p.amount), 0)
        const pctConsumed = totalApproved > 0 ? Math.min(100, (totalConsumed / totalApproved) * 100) : 0
        const pctPaid = totalApproved > 0 ? Math.min(100, (totalPaid / totalApproved) * 100) : 0

        // Active GL wallets: isActive=true (from API) AND remaining balance > 0 (not fully exhausted).
        // The AR API overrides w.balance with totalGlAmount for GL (approved-amount AR),
        // so comparing balance vs totalGlAmount would always be equal. Instead use
        // consumedOutstanding (= totalGlAmount − rawBalance) which the API computes
        // server-side from the actual DB balance field before the substitution.
        // A wallet is "active" when it still has remaining balance (whether or not any amount
        // has been consumed yet — untouched wallets with full balance are also active).
        const activeGlCount = approvedWallets.filter(w => {
          const consumed = w.consumedOutstanding ?? 0
          return toNum(w.totalGlAmount) > consumed + 0.005
        }).length

        // Service type breakdown from approvedServices field on GL wallets
        // Each wallet may approve multiple service types; count applications per type.
        const svcTypeMap = new Map<string, number>()
        for (const w of branchWallets) {
          const svcs = (w as unknown as { approvedServices?: string[] | null }).approvedServices
          if (Array.isArray(svcs)) {
            for (const s of svcs) svcTypeMap.set(s, (svcTypeMap.get(s) || 0) + 1)
          }
        }
        const svcTotal = Array.from(svcTypeMap.values()).reduce((s, v) => s + v, 0)
        const svcEntries = Array.from(svcTypeMap.entries()).sort((a, b) => b[1] - a[1])
        const SVC_COLORS = ['#0d9488','#0891b2','#7c3aed','#db2777','#d97706','#16a34a','#dc2626','#9333ea']

        // Build SVG pie for service types
        const buildSvcPie = (entries: [string, number][], total: number) => {
          let cum = -90
          return entries.map(([label, val], i) => {
            const pct = total > 0 ? val / total : 0
            const sweep = pct * 360
            const s1 = (cum * Math.PI) / 180
            const e1 = ((cum + sweep) * Math.PI) / 180
            const r = 60
            const x1 = 70 + r * Math.cos(s1), y1 = 70 + r * Math.sin(s1)
            const x2 = 70 + r * Math.cos(e1), y2 = 70 + r * Math.sin(e1)
            const large = sweep > 180 ? 1 : 0
            const d = pct === 1
              ? `M70,70 m-${r},0 a${r},${r} 0 1,1 ${r*2},0 a${r},${r} 0 1,1 -${r*2},0`
              : `M70,70 L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`
            const result = { label, val, pct, color: SVC_COLORS[i % SVC_COLORS.length], d }
            cum += sweep
            return result
          })
        }
        const svcSlices = buildSvcPie(svcEntries, svcTotal)

        // Department breakdown from GL orders
        const deptMap = new Map<string, number>()
        for (const o of orders) {
          for (const it of o.items) {
            const dept = it.service?.department || 'Other'
            const pay = o.payments.find(p => p.walletId && wallets.some(w => w.id === p.walletId))
            const amt = pay ? toNum(pay.amount) : toNum(o.netAmount)
            deptMap.set(dept, (deptMap.get(dept) || 0) + amt)
          }
        }
        const deptTotal = Array.from(deptMap.values()).reduce((s, v) => s + v, 0)
        const deptEntries = Array.from(deptMap.entries())
          .sort((a, b) => b[1] - a[1])
        const PIE_COLORS = ['#0d9488','#0891b2','#7c3aed','#db2777','#d97706','#16a34a','#dc2626','#9333ea','#0ea5e9','#f59e0b']

        // Build SVG pie chart
        let cumAngle = -90 // start at top
        const pieSlices = deptEntries.map(([ dept, val ], i) => {
          const pct = deptTotal > 0 ? val / deptTotal : 0
          const sweep = pct * 360
          const startRad = (cumAngle * Math.PI) / 180
          const endRad = ((cumAngle + sweep) * Math.PI) / 180
          const r = 60
          const x1 = 70 + r * Math.cos(startRad)
          const y1 = 70 + r * Math.sin(startRad)
          const x2 = 70 + r * Math.cos(endRad)
          const y2 = 70 + r * Math.sin(endRad)
          const large = sweep > 180 ? 1 : 0
          const d = pct === 1
            ? `M70,70 m-${r},0 a${r},${r} 0 1,1 ${r*2},0 a${r},${r} 0 1,1 -${r*2},0`
            : `M70,70 L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`
          const result = { dept, val, pct, color: PIE_COLORS[i % PIE_COLORS.length], d }
          cumAngle += sweep
          return result
        })

        return (
          <div className="rounded-2xl border p-4 space-y-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>GL Summary</h2>
              {canRecomputeSoa && (
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    disabled={recomputeBusy}
                    onClick={async () => {
                      if (!confirm('Recompute Approved SOA from the ledger for every GL wallet?\n\nThis derives the original starting balance from each wallet\'s deductions and only updates wallets where the stored Approved SOA is lower than the derived value. Wallets with no consumption are left alone.')) return
                      setRecomputeBusy(true)
                      setRecomputeResult(null)
                      try {
                        const r = await fetch('/api/admin/recompute-gl-soa', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({}),
                        })
                        const d = await r.json()
                        if (!r.ok) { alert(d.error || `Failed (${r.status})`); return }
                        setRecomputeResult({ updated: d.updated, skipped: d.skipped, changes: d.changes || [] })
                        await fetchData()
                      } catch (e) {
                        alert(`Recompute failed: ${e}`)
                      } finally {
                        setRecomputeBusy(false)
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50"
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}
                  >
                    {recomputeBusy ? 'Recomputing…' : 'Recompute Approved SOA from ledger'}
                  </button>
                  {recomputeResult && (
                    <p className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                      Updated {recomputeResult.updated} · Preserved {recomputeResult.skipped}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* % cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Active GL wallets count — isActive=true and remaining balance > 0 */}
              <div className="rounded-xl p-4 border" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Active GL Wallets</p>
                <p className="text-3xl font-bold" style={{ color: 'var(--charcoal)' }}>{activeGlCount}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Active wallets with remaining balance</p>
              </div>
              {/* Approved */}
              <div className="rounded-xl p-4 border" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Total Approved (SOA)</p>
                <p className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(totalApproved)}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Amount government agency will pay</p>
              </div>

              {/* % Consumed */}
              <div className="rounded-xl p-4 border" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Consumed vs Approved</p>
                <p className="text-xl font-bold" style={{ color: pctConsumed >= 90 ? '#dc2626' : pctConsumed >= 70 ? '#d97706' : '#0d9488' }}>
                  {pctConsumed.toFixed(1)}%
                </p>
                <div className="mt-2 rounded-full overflow-hidden h-2" style={{ background: 'var(--light-gray)' }}>
                  <div style={{ width: `${pctConsumed}%`, background: pctConsumed >= 90 ? '#dc2626' : pctConsumed >= 70 ? '#d97706' : '#0d9488', height: '100%', transition: 'width 0.4s' }} />
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(totalConsumed)} consumed of {formatCurrency(totalApproved)}</p>
              </div>

              {/* % Paid */}
              <div className="rounded-xl p-4 border" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Paid vs Approved</p>
                <p className="text-xl font-bold" style={{ color: '#166534' }}>
                  {pctPaid.toFixed(1)}%
                </p>
                <div className="mt-2 rounded-full overflow-hidden h-2" style={{ background: 'var(--light-gray)' }}>
                  <div style={{ width: `${pctPaid}%`, background: '#16a34a', height: '100%', transition: 'width 0.4s' }} />
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(totalPaid)} received of {formatCurrency(totalApproved)}</p>
              </div>
            </div>

            {/* Two-column chart row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Department pie chart */}
              {deptEntries.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-3" style={{ color: 'var(--mid-gray)' }}>GL Orders by Department</p>
                  <div className="flex flex-wrap items-center gap-6">
                    <svg viewBox="0 0 140 140" width={140} height={140} className="flex-shrink-0">
                      {pieSlices.map((s, i) => (
                        <path key={i} d={s.d} fill={s.color} stroke="white" strokeWidth={1.5} />
                      ))}
                    </svg>
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      {pieSlices.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                          <span className="text-xs font-medium truncate" style={{ color: 'var(--charcoal)' }}>{s.dept}</span>
                          <span className="text-xs ml-auto flex-shrink-0" style={{ color: 'var(--mid-gray)' }}>
                            {formatCurrency(s.val)} <span className="font-semibold">({(s.pct * 100).toFixed(1)}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Service type pie chart — from approvedServices on GL wallets */}
              {svcSlices.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-3" style={{ color: 'var(--mid-gray)' }}>GL Applications by Service Type</p>
                  <div className="flex flex-wrap items-center gap-6">
                    <svg viewBox="0 0 140 140" width={140} height={140} className="flex-shrink-0">
                      {svcSlices.map((s, i) => (
                        <path key={i} d={s.d} fill={s.color} stroke="white" strokeWidth={1.5} />
                      ))}
                    </svg>
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      {svcSlices.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                          <span className="text-xs font-medium truncate" style={{ color: 'var(--charcoal)' }}>{s.label}</span>
                          <span className="text-xs ml-auto flex-shrink-0" style={{ color: 'var(--mid-gray)' }}>
                            {s.val} wallet{s.val !== 1 ? 's' : ''} <span className="font-semibold">({(s.pct * 100).toFixed(1)}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] mt-2" style={{ color: 'var(--mid-gray)' }}>
                    Count of GL wallets with each approved service type. One wallet may appear in multiple types.
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── HMO Summary ── */}
      {tab === 'HMO' && hmoSubTab === 'overview' && (() => {
        const totalProviders = wallets.length
        // Billed comes from the API's full-history aggregate, not the capped
        // `orders` list — otherwise 2024/2025 orders are excluded from the total.
        const totalHmoOrders = summary
          ? summary.totalBilled
          : orders.reduce((s, o) => s + o.payments.reduce((ps, p) => ps + toNum(p.amount), 0), 0)
        const totalPaid = arPayments.reduce((s, p) => s + toNum(p.amount), 0)
        const pctPaid = totalHmoOrders > 0 ? Math.min(100, (totalPaid / totalHmoOrders) * 100) : 0

        const PIE_COLORS = ['#0d9488','#0891b2','#7c3aed','#db2777','#d97706','#16a34a','#dc2626','#9333ea','#0ea5e9','#f59e0b']

        // Helper: build SVG pie slices from a Map<string, number>
        const buildPie = (entries: [string, number][], total: number) => {
          let cum = -90
          return entries.map(([label, val], i) => {
            const pct = total > 0 ? val / total : 0
            const sweep = pct * 360
            const s1 = (cum * Math.PI) / 180
            const e1 = ((cum + sweep) * Math.PI) / 180
            const r = 60
            const x1 = 70 + r * Math.cos(s1), y1 = 70 + r * Math.sin(s1)
            const x2 = 70 + r * Math.cos(e1), y2 = 70 + r * Math.sin(e1)
            const large = sweep > 180 ? 1 : 0
            const d = pct === 1
              ? `M70,70 m-${r},0 a${r},${r} 0 1,1 ${r*2},0 a${r},${r} 0 1,1 -${r*2},0`
              : `M70,70 L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`
            const result = { label, val, pct, color: PIE_COLORS[i % PIE_COLORS.length], d }
            cum += sweep
            return result
          })
        }

        // Department breakdown — split each order's payment proportionally across
        // departments. Served by the API across all orders; the local pass is the
        // fallback for an older API response that carries no summary.
        const deptMap = new Map<string, number>()
        if (summary) {
          for (const d of summary.byDepartment) deptMap.set(d.label, d.amount)
        } else {
          for (const o of orders) {
            const pay = o.payments[0]
            const amt = pay ? toNum(pay.amount) : 0
            if (amt === 0) continue
            // Count items per department within this order
            const itemsByDept = new Map<string, number>()
            for (const it of o.items) {
              const dept = it.service?.department || 'Other'
              itemsByDept.set(dept, (itemsByDept.get(dept) || 0) + 1)
            }
            const totalItems = o.items.length || 1
            for (const [dept, count] of itemsByDept) {
              deptMap.set(dept, (deptMap.get(dept) || 0) + (count / totalItems) * amt)
            }
          }
        }
        const deptEntries = Array.from(deptMap.entries()).sort((a, b) => b[1] - a[1])
        const deptTotal = deptEntries.reduce((s, [, v]) => s + v, 0)
        const deptSlices = buildPie(deptEntries, deptTotal)

        // Provider breakdown (HMO orders by wallet/provider)
        const provMap = new Map<string, number>()
        if (summary) {
          for (const p of summary.byProvider) provMap.set(p.label, p.amount)
        } else {
          for (const o of orders) {
            for (const p of o.payments) {
              const wallet = wallets.find(w => w.id === p.walletId)
              const name = wallet?.patientName || 'Unknown'
              provMap.set(name, (provMap.get(name) || 0) + toNum(p.amount))
            }
          }
        }
        const provEntries = Array.from(provMap.entries()).sort((a, b) => b[1] - a[1])
        const provTotal = provEntries.reduce((s, [, v]) => s + v, 0)
        const provSlices = buildPie(provEntries, provTotal)

        // Shared pie chart renderer
        const PieChart = ({ slices, title }: { slices: { label: string; val: number; pct: number; color: string; d: string }[]; title: string }) => (
          slices.length === 0 ? null : (
            <div>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--mid-gray)' }}>{title}</p>
              <div className="flex flex-wrap items-start gap-4">
                <svg viewBox="0 0 140 140" width={120} height={120} className="flex-shrink-0">
                  {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} stroke="white" strokeWidth={1.5} />)}
                </svg>
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  {slices.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-xs font-medium truncate" style={{ color: 'var(--charcoal)' }}>{s.label}</span>
                      <span className="text-xs ml-auto flex-shrink-0 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                        {formatCurrency(s.val)} <span className="font-semibold">({(s.pct * 100).toFixed(1)}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        )

        return (
          <div className="rounded-2xl border p-4 space-y-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>HMO Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl p-4 border" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Total HMO Providers</p>
                <p className="text-3xl font-bold" style={{ color: 'var(--charcoal)' }}>{totalProviders}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Active HMO wallets</p>
              </div>
              <div className="rounded-xl p-4 border" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>% Paid vs HMO Orders</p>
                <p className="text-xl font-bold" style={{ color: '#166534' }}>{pctPaid.toFixed(1)}%</p>
                <div className="mt-2 rounded-full overflow-hidden h-2" style={{ background: 'var(--light-gray)' }}>
                  <div style={{ width: `${pctPaid}%`, background: '#16a34a', height: '100%', transition: 'width 0.4s' }} />
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(totalPaid)} received of {formatCurrency(totalHmoOrders)}</p>
              </div>
              <div className="rounded-xl p-4 border" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Total HMO Billed</p>
                <p className="text-xl font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(totalHmoOrders)}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Total outstanding: {formatCurrency(totalHmoOrders - totalPaid)}</p>
              </div>
              {(summary?.directToClinician?.orderCount ?? 0) > 0 && (
                <div className="rounded-xl p-4 border" style={{ borderColor: '#fdba74', background: '#fff7ed' }}>
                  <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: '#9a3412' }}>Paid Direct to Clinician</p>
                  <p className="text-xl font-bold" style={{ color: '#9a3412' }}>{formatCurrency(summary!.directToClinician!.total)}</p>
                  <p className="text-xs mt-1" style={{ color: '#9a3412' }}>
                    {summary!.directToClinician!.orderCount} session{summary!.directToClinician!.orderCount === 1 ? '' : 's'} the HMO settles with the clinician — not in our AR
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: '#c2410c' }}>
                    {summary!.directToClinician!.byProvider.slice(0, 3).map(pv => `${pv.label} ${formatCurrency(pv.amount)}`).join(' · ')}
                  </p>
                </div>
              )}
            </div>
            {/* Two pie charts side by side */}
            {(deptSlices.length > 0 || provSlices.length > 0) && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-2 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <PieChart slices={deptSlices} title="HMO Orders by Department" />
                <PieChart slices={provSlices} title="HMO Orders by Provider" />
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Others: receivables from outside customers (e.g. Sandbox Clark) ── */}
      {tab === 'OTHERS' && <OthersTab branch={branch} canWrite={!isHmoOfficer} />}

      {/* ── Overview content (AR Dashboard + Filters + Cards + Table + Payment History) ── */}
      {tab !== 'OTHERS' && (tab !== 'HMO' || hmoSubTab === 'overview') && (tab !== 'GL' || glSubTab === 'overview') && <>

      {/* ── Dashboard: AR Days + Aging Receivable Details ── */}
      <div className="rounded-2xl border p-4 space-y-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>AR Dashboard — {tab}</h2>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              Days Sales Outstanding and aging buckets. AR Days = (average AR ÷ period revenue) × period days.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Period:</label>
            <select value={agingPeriodDays} onChange={e => setAgingPeriodDays(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-lg border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
              <option value={365}>Last 365 days</option>
            </select>
            <div className="relative">
              <button
                onClick={() => setShowSummaryDownload(v => !v)}
                disabled={!agingData}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium border bg-white disabled:opacity-50"
                style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                <Download size={14} /> Download
              </button>
              {showSummaryDownload && (
                <div className="absolute right-0 top-full mt-1 z-20 rounded-xl border bg-white shadow-lg" style={{ borderColor: 'var(--light-gray)', minWidth: 170 }}>
                  <button onClick={downloadSummaryExcel} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 rounded-t-xl" style={{ color: 'var(--charcoal)' }}>
                    Download as Excel
                  </button>
                  <button onClick={downloadSummaryPdf} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 rounded-b-xl" style={{ color: 'var(--charcoal)' }}>
                    Download as PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Overall AR Days card */}
        <div className="rounded-xl p-4 grid grid-cols-3 gap-4" style={{ background: 'white', border: '1px solid var(--light-gray)' }}>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>AR Days (Overall)</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--deep-teal)' }}>
              {agingData ? agingData.arDaysOverall.toFixed(1) : '—'}
              <span className="text-sm font-normal ml-1" style={{ color: 'var(--mid-gray)' }}>days</span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Total AR</p>
            <p className="text-xl font-bold mt-1" style={{ color: '#dc2626' }}>
              {agingData ? formatCurrency(agingData.totalAR) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Period Revenue</p>
            <p className="text-xl font-bold mt-1" style={{ color: '#166534' }}>
              {agingData ? formatCurrency(tab === 'HMO' ? (agingData.totalAllDeptRevenue ?? agingData.totalRevenue) : agingData.totalRevenue) : '—'}
            </p>
            {tab === 'HMO' && agingData?.totalAllDeptRevenue != null && (
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>All dept. revenue (HMO depts)</p>
            )}
          </div>
        </div>

        {/* AR Days per wallet — sortable table. Hidden on the GL tab; HMO still
            shows it (as "AR Days per HMO") off this same block. */}
        {tab !== 'GL' && agingData && agingData.perWallet.filter(w => w.ar > 0 || w.revenue > 0).length > 0 && (
          <div id="ar-days-per-agency">
            <ExpandablePanel title={`AR Days per ${tab === 'HMO' ? 'HMO' : 'Agency'}`} maxHeight={260}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 z-10" style={{ background: 'var(--pale-teal)' }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>{tab === 'HMO' ? 'HMO' : 'Agency'}</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>Total AR</th>
                    <th
                      className="px-3 py-2 text-right text-xs font-semibold cursor-pointer select-none"
                      style={{ color: 'var(--deep-teal)' }}
                      onClick={() => setArDaysSort(s => s === 'asc' ? 'desc' : 'asc')}
                    >
                      AR Days {arDaysSort === 'asc' ? '↑' : '↓'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...agingData.perWallet.filter(w => w.ar > 0 || w.revenue > 0)]
                    .sort((a, b) => arDaysSort === 'asc' ? a.arDays - b.arDays : b.arDays - a.arDays)
                    .map((w, i) => (
                      <tr key={w.walletId} style={{ borderTop: i > 0 ? '1px solid var(--light-gray)' : undefined }}>
                        <td className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--charcoal)' }}>{w.walletName}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: '#dc2626' }}>{formatCurrency(w.ar)}</td>
                        <td className="px-3 py-2 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--deep-teal)' }}>{w.arDays.toFixed(1)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </ExpandablePanel>
          </div>
        )}

        {/* Aging Receivable Details. Hidden on the GL tab; HMO still shows it,
            where clicking a bucket amount still filters the transactions table
            below via setBucketFilterIds. */}
        {tab !== 'GL' && (
        <div id="ar-aging-details">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>
              Aging Receivable Details — click an amount to see the transactions included
            </p>
            {bucketFilterIds && (
              <button onClick={() => { setBucketFilterIds(null); setBucketFilterLabel('') }}
                className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                Viewing: {bucketFilterLabel} · Clear
              </button>
            )}
          </div>
          <ExpandablePanel title="Aging Receivable Details" subtitle="Click an amount to see the transactions included" maxHeight={280}>
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10" style={{ background: 'var(--pale-teal)' }}>
                  <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>{tab === 'HMO' ? 'HMO' : 'Agency'}</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>0–30 days</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>31–60 days</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>61–90 days</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>&gt;90 days</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {!agingData ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>Loading aging…</td></tr>
                ) : agingData.perWallet.filter(w => w.ar > 0).length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>No outstanding receivables.</td></tr>
                ) : (() => {
                  const rows = agingData.perWallet.filter(w => w.ar > 0)
                  const buckets: AgingBucket[] = ['b0_30', 'b31_60', 'b61_90', 'b90plus']
                  const bucketLabels: Record<AgingBucket, string> = { b0_30: '0–30 days', b31_60: '31–60 days', b61_90: '61–90 days', b90plus: '>90 days' }
                  const clickCell = (w: AgingRow, b: AgingBucket) => {
                    const ids = w.orderIdsByBucket[b]
                    if (!ids || ids.length === 0) return
                    // Show the sessions themselves. This used to scroll to
                    // [data-ar-transactions-table], a selector that matches no
                    // element, so the click appeared to do nothing.
                    setBucketFilterIds(ids)
                    setBucketFilterLabel(`${w.walletName} · ${bucketLabels[b]}`)
                    setSessionModal({ label: `${w.walletName} · ${bucketLabels[b]}`, ids })
                  }
                  const totals = buckets.reduce((acc, b) => ({ ...acc, [b]: rows.reduce((s, r) => s + r.aging[b], 0) }), {} as Record<AgingBucket, number>)
                  const grandTotal = rows.reduce((s, r) => s + r.ar, 0)
                  return (
                    <>
                      {rows.map(w => (
                        <tr key={w.walletId} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                          <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{w.walletName}</td>
                          {buckets.map(b => (
                            <td key={b} className="px-3 py-2 text-right">
                              {w.aging[b] > 0 ? (
                                <button onClick={() => clickCell(w, b)}
                                  className="font-mono underline hover:opacity-80"
                                  style={{ color: b === 'b90plus' ? '#dc2626' : b === 'b61_90' ? '#c44b00' : 'var(--charcoal)' }}>
                                  {formatCurrency(w.aging[b])}
                                </button>
                              ) : <span className="font-mono" style={{ color: 'var(--light-gray)' }}>—</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(w.ar)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: 'var(--off-white)' }}>
                        <td className="px-3 py-2 font-bold text-xs" style={{ color: 'var(--charcoal)' }}>TOTAL</td>
                        {buckets.map(b => (
                          <td key={b} className="px-3 py-2 text-right font-mono font-bold text-xs" style={{ color: 'var(--charcoal)' }}>{formatCurrency(totals[b])}</td>
                        ))}
                        <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(grandTotal)}</td>
                      </tr>
                    </>
                  )
                })()}
              </tbody>
            </table>
          </ExpandablePanel>
        </div>
        )}
      </div>

      {/* Payment History — always shown, on both wallet tabs. Hiding it when empty made
          it look as though HMO had no such section at all, when in fact no HMO
          payment had been recorded (the one that was is since reversed). */}
      {(
        <div id="ar-payment-history">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
              Payment History — {tab}
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                {shownPayments.length === arPayments.length ? arPayments.length : `${shownPayments.length} of ${arPayments.length}`}
              </span>
            </h3>
            <div className="relative ml-auto min-w-[240px] flex-1 max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
              <input
                value={paySearch}
                onChange={e => setPaySearch(e.target.value)}
                placeholder={`Search ${tab === 'GL' ? 'agency' : 'provider'}, SI number, amount, notes…`}
                className="w-full pl-8 pr-7 py-1.5 rounded-lg border text-xs outline-none"
                style={{ borderColor: 'var(--light-gray)' }} />
              {paySearch && (
                <button onClick={() => setPaySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X size={12} style={{ color: 'var(--mid-gray)' }} />
                </button>
              )}
            </div>
            {/* Column filters live in the header row and are easy to forget once
                scrolled past, so the way out sits up here with the count. */}
            {activePayFilters > 0 && (
              <button onClick={() => setPayFilters({})}
                className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg shrink-0"
                style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                Clear {activePayFilters} filter{activePayFilters === 1 ? '' : 's'}
              </button>
            )}
          </div>
          <ExpandablePanel title={`Payment History — ${tab}`} maxHeight={320}>
            <table className="w-full text-xs">
              <thead>
                <tr className="sticky top-0 z-10" style={{ background: 'var(--off-white)' }}>
                  {payCols.map(c => (
                    <th key={c.key} className="text-left px-3 py-2 align-top font-semibold" style={{ color: 'var(--mid-gray)' }}>
                      <button onClick={() => togglePaySort(c.key)}
                        className="flex items-center gap-1 font-semibold hover:opacity-70"
                        style={{ marginLeft: c.numeric ? 'auto' : undefined }}>
                        {c.label}
                        {paySort.key === c.key
                          ? (paySort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
                          : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                      </button>
                      {/* Proof holds links rather than text, so filtering it would
                          match nothing — the header still sorts. */}
                      {c.key !== 'proof' && (
                        <input
                          value={payFilters[c.key] || ''}
                          onChange={e => setPayFilters(f => ({ ...f, [c.key]: e.target.value }))}
                          placeholder="Filter…"
                          className="mt-1 w-full min-w-[70px] px-1.5 py-0.5 rounded border text-[10px] outline-none font-normal"
                          style={{ borderColor: 'var(--light-gray)' }} />
                      )}
                    </th>
                  ))}
                  <th className="text-left px-3 py-2" />
                </tr>
                {/* Subtotals follow the filters: what the rows below add up to,
                    not the all-time total. */}
                {shownPayments.length > 0 && (
                  <tr className="sticky z-10" style={{ top: '58px', background: 'var(--pale-teal)' }}>
                    {payCols.map(c => (
                      <td key={c.key} className={`px-3 py-1.5 font-bold ${c.numeric ? 'text-right font-mono' : ''}`}
                        style={{ color: 'var(--deep-teal)' }}>
                        {c.key === 'date' ? `Subtotal (${shownPayments.length})`
                          : c.key === 'amount' ? formatCurrency(shownPayments.reduce((sum, pp) => sum + toNum(pp.amount), 0))
                          : c.key === 'discount' ? formatCurrency(shownPayments.reduce((sum, pp) => sum + toNum(pp.discount), 0))
                          : ''}
                      </td>
                    ))}
                    <td />
                  </tr>
                )}
              </thead>
              <tbody>
                {shownPayments.length === 0 && (
                  <tr><td colSpan={11} className="text-center py-8 text-xs" style={{ color: 'var(--mid-gray)' }}>
                    {arPayments.length > 0
                      ? (paySearch.trim()
                          ? `No payment matches “${paySearch.trim()}”.`
                          : 'No payment matches the column filters.')
                      : `No ${tab} payments recorded yet. Payments recorded against ${tab === 'HMO' ? 'an HMO provider' : 'a Guarantee Letter agency'} appear here, newest first.`}
                  </td></tr>
                )}
                {shownPayments.map(p => {
                  const wallet = wallets.find(w => w.id === p.walletId)
                  const proofFiles = parseProofUrls(p.proofUrl)
                  return (
                    <tr key={p.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-2">{formatDate(p.paymentDate)}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: 'var(--charcoal)' }}>{p.salesInvoiceNumber || '—'}</td>
                      <td className="px-3 py-2">{wallet?.patientName || '—'}</td>
                      <td className="px-3 py-2 font-medium" style={{ color: '#166534' }}>
                        {formatCurrency(toNum(p.amount))}
                        {toNum(p.overpayment) > 0 && (
                          <span className="block text-[10px] font-normal" style={{ color: '#92400e' }}
                            title={p.overpaymentAccount ? `Booked to ${p.overpaymentAccount.accountNumber} ${p.overpaymentAccount.accountTitle}` : undefined}>
                            incl. {formatCurrency(toNum(p.overpayment))} overpayment
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{toNum(p.discount) > 0 ? formatCurrency(toNum(p.discount)) : '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--teal)' }}>{p.cashAccount ? `${p.cashAccount.accountNumber} ${p.cashAccount.accountTitle}` : '—'}</td>
                      <td className="px-3 py-2">{p.items.length} orders</td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{p.notes || '—'}</td>
                      <td className="px-3 py-2">
                        {proofFiles.length === 0 ? (
                          <span style={{ color: 'var(--light-gray)' }}>—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {proofFiles.map((url, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <a href={url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs underline font-medium" style={{ color: 'var(--teal)' }}
                                  title={url.split('/').pop()}>
                                  View {proofFiles.length > 1 ? `#${i + 1}` : ''}
                                </a>
                                <a href={url} download
                                  className="p-0.5 rounded hover:bg-teal-50" title="Download">
                                  <Download size={11} style={{ color: 'var(--teal)' }} />
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{p.createdBy.name}</td>
                      <td className="px-3 py-2 flex items-center gap-1">
                        <button onClick={() => openEditPaymentModal(p)} className="p-1.5 rounded-lg hover:bg-blue-50" title="Edit payment">
                          <Pencil size={14} className="text-blue-400" />
                        </button>
                        <button onClick={() => deletePayment(p)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete payment">
                          <Trash2 size={14} className="text-red-400" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ExpandablePanel>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>{tab === 'HMO' ? 'HMO Provider' : 'Agency'}</label>
          <select value={walletFilter} onChange={e => setWalletFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="">All</option>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.patientName} ({formatCurrency(toNum(w.balance))})</option>)}
          </select>
        </div>
      </div>

      {/* Consumption — what each agency approved, how much of it has been used, and
          what they have settled so far. */}
      <div className="flex items-baseline justify-between mt-4 mb-2">
        <h3 className="text-sm font-bold" style={{ color: 'var(--deep-teal)' }}>Consumption</h3>
        {tab === 'GL' && (
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            Months to pay counts from the letter being recorded to its latest payment, in 30-day months.
          </p>
        )}
      </div>
      <div id="ar-utilization">
      <ExpandablePanel title="Consumption" subtitle={tab === 'GL' ? 'Months to pay counts from the SOA date to the latest payment, in 30-day months.' : undefined} maxHeight={260}>
        <table className="w-full text-sm">
          <SortFilterHead
            cols={consumptionCols}
            sortKey={consSortKey}
            sortDir={consSortDir}
            filters={consFilters}
            onToggleSort={toggleConsSort}
            onFilter={(k, v) => setConsFilters(f => ({ ...f, [k]: v }))}
          />
          <tbody>
            {/* Approved-SOA agencies first, then the per-session ones under their own
                heading: they are read differently, so they are not mixed in. */}
            {consumptionRows.map((w, i, arr) => {
              const approved = toNum(w.balance)
              const consumed = typeof w.consumedOutstanding === 'number' ? w.consumedOutstanding : 0
              const paid = toNum(w.paidTotal)
              const pct = approved > 0 ? (consumed / approved) * 100 : 0
              const isSelected = walletFilter === w.id
              const startsPerSession = tab === 'GL' && !!w.perSession && !arr[i - 1]?.perSession
              return (
                <Fragment key={`grp-${w.id}`}>
                {startsPerSession && (
                  <tr style={{ background: 'var(--pale-teal, #f0f7f6)' }}>
                    <td colSpan={consumptionCols.length} className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>
                      Billed per session, settled afterwards — no approved SOA
                    </td>
                  </tr>
                )}
                <tr key={w.id}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  style={{ borderTop: i > 0 ? '1px solid var(--light-gray)' : undefined, background: isSelected ? '#f0fdfa' : undefined }}
                  onClick={() => setWalletFilter(isSelected ? '' : w.id)}>
                  <td className="px-3 py-2">
                    <p className="text-xs font-semibold" style={{ color: isSelected ? 'var(--teal)' : 'var(--charcoal)' }}>{w.patientName}</p>
                    {w.account && <p className="text-[10px]" style={{ color: 'var(--teal)' }}>{w.account.accountNumber} {w.account.accountTitle}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: w.branch ? 'var(--charcoal)' : 'var(--light-gray)' }}>
                    {w.branch ? branchLabel(w.branch) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-bold tabular-nums" style={{ color: approved > 0 ? '#dc2626' : '#166534' }}>
                    {formatCurrency(approved)}
                  </td>
                  {tab === 'GL' && <>
                    <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: w.soaDate ? 'var(--charcoal)' : 'var(--light-gray)' }}>
                      {w.soaDate ? formatDate(w.soaDate) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums" style={{ color: paid > 0 ? '#166534' : 'var(--light-gray)' }}>
                      {paid > 0 ? formatCurrency(paid) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: w.lastPaymentDate ? 'var(--charcoal)' : 'var(--light-gray)' }}>
                      {w.lastPaymentDate ? formatDate(w.lastPaymentDate) : 'unpaid'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: toNum(w.commissionTotal) > 0 ? 'var(--mid-gray)' : 'var(--light-gray)' }}>
                      {toNum(w.commissionTotal) > 0 ? formatCurrency(toNum(w.commissionTotal)) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: 'var(--charcoal)' }}>
                      {typeof w.monthsToPay === 'number'
                        ? `${w.monthsToPay.toFixed(1)} mo`
                        : <span style={{ color: 'var(--light-gray)' }}>unpaid</span>}
                    </td>
                    {/* What this person's agency still owes: approved less settled. */}
                    <td className="px-3 py-2 text-right text-xs font-bold tabular-nums"
                      style={{ color: Math.max(0, approved - paid) > 0 ? '#dc2626' : '#166534' }}>
                      {formatCurrency(Math.max(0, approved - paid))}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: 'var(--charcoal)' }}>
                      {consumed > 0 ? formatCurrency(consumed) : <span style={{ color: 'var(--light-gray)' }}>—</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums" style={{ color: pct > 80 ? '#dc2626' : pct > 50 ? '#c44b00' : '#166534' }}>
                      {w.perSession
                        ? <span style={{ color: 'var(--mid-gray)' }}>per session</span>
                        : consumed > 0 ? `${pct.toFixed(1)}%` : <span style={{ color: 'var(--light-gray)' }}>—</span>}
                    </td>
                  </>}
                </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </ExpandablePanel>
      </div>


      </>}

      {/* ── Per HMO sub-tab content ── */}
      {tab === 'HMO' && hmoSubTab === 'loa' && <LoaSubmissionsTab />}

      {tab === 'HMO' && hmoSubTab === 'per-hmo' && (() => {
        // Filter the main orders data
        // Prefer the period this tab fetched for itself; the page list is only
        // the 500 newest orders and cannot answer for a past year.
        let perHmoOrders = perHmoFetched ?? orders
        // Period membership follows the same rule as the server: a Change Date
        // (arCustomDate), where one was set, decides the period instead of the
        // transaction date. Reading transactionDate here re-dropped rows the
        // server had deliberately moved into range.
        const periodDate = (o: AROrder) =>
          new Date(o.arCustomDate ?? o.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
        if (perHmoWallet) perHmoOrders = perHmoOrders.filter(o => o.payments.some(p => p.walletId === perHmoWallet))
        if (perHmoFrom) perHmoOrders = perHmoOrders.filter(o => periodDate(o) >= perHmoFrom)
        if (perHmoTo) perHmoOrders = perHmoOrders.filter(o => periodDate(o) <= perHmoTo)
        // Apply column searches
        if (perHmoColSearch.patient) {
          const q = perHmoColSearch.patient.toLowerCase()
          perHmoOrders = perHmoOrders.filter(o => (o.patientName || '').toLowerCase().includes(q))
        }
        if (perHmoColSearch.service) {
          const q = perHmoColSearch.service.toLowerCase()
          perHmoOrders = perHmoOrders.filter(o => o.items.map(i => i.name).join(', ').toLowerCase().includes(q))
        }
        if (perHmoColSearch.clinician) {
          const q = perHmoColSearch.clinician.toLowerCase()
          perHmoOrders = perHmoOrders.filter(o => (o.clinicianName || '').toLowerCase().includes(q))
        }
        if (perHmoColSearch.hmo) {
          const q = perHmoColSearch.hmo.toLowerCase()
          perHmoOrders = perHmoOrders.filter(o => {
            const w = wallets.find(w => w.id === o.payments[0]?.walletId)
            return (w?.patientName || '').toLowerCase().includes(q)
          })
        }

        // Sort
        perHmoOrders = [...perHmoOrders].sort((a, b) => {
          let aVal: string | number = '', bVal: string | number = ''
          if (perHmoSortField === 'transactionDate') { aVal = a.transactionDate; bVal = b.transactionDate }
          else if (perHmoSortField === 'patientName') { aVal = a.patientName || ''; bVal = b.patientName || '' }
          else if (perHmoSortField === 'amount') {
            aVal = a.payments.reduce((s, p) => s + toNum(p.amount), 0)
            bVal = b.payments.reduce((s, p) => s + toNum(p.amount), 0)
          } else if (perHmoSortField === 'service') {
            aVal = a.items.map(i => i.name).join(', ')
            bVal = b.items.map(i => i.name).join(', ')
          } else if (perHmoSortField === 'clinician') {
            aVal = a.clinicianName || ''
            bVal = b.clinicianName || ''
          }
          if (aVal < bVal) return perHmoSortDir === 'asc' ? -1 : 1
          if (aVal > bVal) return perHmoSortDir === 'asc' ? 1 : -1
          return 0
        })

        const togglePerHmoSort = (field: string) => {
          if (perHmoSortField === field) setPerHmoSortDir(d => d === 'asc' ? 'desc' : 'asc')
          else { setPerHmoSortField(field); setPerHmoSortDir('asc') }
        }

        const downloadPdf = () => {
          // Use jsPDF — dynamic import
          import('jspdf').then(({ jsPDF }) => {
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
            const margin = 15
            let y = margin
            doc.setFontSize(14)
            doc.text('HMO AR Report', margin, y); y += 8
            doc.setFontSize(9)
            doc.text(`Generated: ${new Date().toLocaleDateString('en-PH')}`, margin, y); y += 6
            if (perHmoWallet) {
              const w = wallets.find(w => w.id === perHmoWallet)
              doc.text(`HMO: ${w?.patientName || perHmoWallet}`, margin, y); y += 6
            }
            if (perHmoFrom || perHmoTo) {
              doc.text(`Period: ${perHmoFrom || '—'} to ${perHmoTo || '—'}`, margin, y); y += 6
            }
            y += 2
            // Header
            const cols = ['Date', 'Service', 'Patient', 'Clinician', 'HMO', 'Amount', 'SOA', 'SOA Date']
            const colWidths = [24, 60, 40, 38, 36, 26, 14, 24]
            let x = margin
            doc.setFontSize(8); doc.setFont('helvetica', 'bold')
            cols.forEach((c, i) => { doc.text(c, x, y); x += colWidths[i] }); y += 5
            doc.setFont('helvetica', 'normal')
            for (const o of perHmoOrders) {
              if (y > 185) { doc.addPage(); y = margin }
              x = margin
              const wallet = wallets.find(w => w.id === o.payments[0]?.walletId)
              const amt = o.payments.reduce((s, p) => s + toNum(p.amount), 0)
              const amtStr = amt.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
              const soaDates = (o.soaSubmissionItems || []).map(i => i.submission.submittedDate).sort()
              const row = [
                formatDate(o.transactionDate),
                o.items.map(i => i.name).join(', '),
                o.patientName || '—',
                o.clinicianName || '—',
                wallet?.patientName || '—',
                amtStr,
                soaDates.length ? 'Yes' : 'No',
                soaDates.length ? formatDate(soaDates[soaDates.length - 1]) : '—',
              ]
              row.forEach((cell, i) => {
                const maxW = colWidths[i] - 2
                const text = doc.splitTextToSize(String(cell), maxW)[0] || ''
                doc.text(text, x, y); x += colWidths[i]
              })
              y += 5
            }
            doc.save('hmo-ar-report.pdf')
          })
          setShowDownloadMenu(false)
        }

        const downloadExcel = () => {
          import('xlsx').then((XLSX) => {
            const rows = perHmoOrders.map(o => {
              const wallet = wallets.find(w => w.id === o.payments[0]?.walletId)
              const amt = o.payments.reduce((s, p) => s + toNum(p.amount), 0)
              const soaDates = (o.soaSubmissionItems || []).map(i => i.submission.submittedDate).sort()
              return {
                Date: formatDate(o.transactionDate),
                Service: o.items.map(i => i.name).join(', '),
                Patient: o.patientName || '—',
                Clinician: o.clinicianName || '—',
                HMO: wallet?.patientName || '—',
                Amount: amt,
                'SOA Submitted': soaDates.length ? 'Yes' : 'No',
                'Date SOA Submitted': soaDates.length ? formatDate(soaDates[soaDates.length - 1]) : '',
                'Submission Status': o.arPaymentItems.length > 0 ? 'Approved'
                  : o.soaApprovalStatus === 'APPROVED' ? 'Approved'
                  : o.soaApprovalStatus === 'DISAPPROVED' ? 'Disapproved' : 'Pending',
                Proof: o.arProofUrl || '',
              }
            })
            const ws = XLSX.utils.json_to_sheet(rows)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'HMO AR')
            XLSX.writeFile(wb, 'hmo-ar-report.xlsx')
          })
          setShowDownloadMenu(false)
        }

        return (
          <div
            className={perHmoExpanded ? 'fixed inset-0 z-40 overflow-y-auto p-6 space-y-4' : 'space-y-4'}
            style={perHmoExpanded ? { background: 'var(--off-white)' } : undefined}
          >
            {/* Filters + Download */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>HMO Provider</label>
                <select value={perHmoWallet} onChange={e => setPerHmoWallet(e.target.value)}
                  className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">All Providers</option>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.patientName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>From</label>
                <input type="date" value={perHmoFrom} onChange={e => setPerHmoFrom(e.target.value)}
                  className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>To</label>
                <input type="date" value={perHmoTo} onChange={e => setPerHmoTo(e.target.value)}
                  className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div className="relative ml-auto flex items-center gap-2">
                <button
                  onClick={() => setPerHmoExpanded(v => !v)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--mid-gray)', color: 'var(--mid-gray)' }}
                  title={perHmoExpanded ? 'Back to the normal page view' : 'Expand this table to the full screen'}>
                  {perHmoExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {perHmoExpanded ? 'Collapse' : 'Expand'}
                </button>
                <button
                  onClick={() => {
                    setInvSettingBranch('')
                    setInvForm({})
                    setShowInvoiceSettings(true)
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--mid-gray)', color: 'var(--mid-gray)' }}>
                  <Settings size={14} /> Invoice Settings
                </button>
                <div className="relative">
                <button
                  onClick={() => setShowDownloadMenu(v => !v)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                  <Download size={14} /> Download
                </button>
                {showDownloadMenu && (
                  <div className="absolute right-0 top-full mt-1 z-20 rounded-xl border bg-white shadow-lg" style={{ borderColor: 'var(--light-gray)', minWidth: 150 }}>
                    <button onClick={downloadPdf} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 rounded-t-xl" style={{ color: 'var(--charcoal)' }}>
                      Download as PDF
                    </button>
                    <button onClick={downloadExcel} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 rounded-b-xl" style={{ color: 'var(--charcoal)' }}>
                      Download as Excel
                    </button>
                  </div>
                )}
                </div>{/* /download relative */}
              </div>{/* /ml-auto flex */}
            </div>{/* /filters row */}

            {/* Sortable/filterable table */}
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    {[
                      { label: 'Date', field: 'transactionDate', searchKey: 'date' },
                      { label: 'Change Date', field: '', searchKey: '' },
                      { label: 'Service', field: 'service', searchKey: 'service' },
                      { label: 'Patient', field: 'patientName', searchKey: 'patient' },
                      { label: 'Clinician', field: 'clinician', searchKey: 'clinician' },
                      { label: 'HMO', field: 'hmo', searchKey: 'hmo' },
                      { label: 'Amount', field: 'amount', searchKey: 'amount' },
                      { label: 'Status', field: 'status', searchKey: 'status' },
                      { label: 'SOA Submitted', field: '', searchKey: '' },
                      { label: 'Date SOA Submitted', field: '', searchKey: '' },
                      { label: 'Submission Status', field: '', searchKey: '' },
                      { label: 'Invoice', field: '', searchKey: '' },
                      { label: 'Proof', field: '', searchKey: '' },
                    ].map(col => (
                      <th key={col.label} className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>
                        <div className={`flex items-center gap-1 ${col.field ? 'cursor-pointer select-none' : ''}`}
                          onClick={() => col.field && togglePerHmoSort(col.field)}>
                          <span className="text-xs font-semibold">{col.label}</span>
                          {col.field && perHmoSortField === col.field && (
                            <span className="text-[10px]">{perHmoSortDir === 'asc' ? '▲' : '▼'}</span>
                          )}
                          {col.field && perHmoSortField !== col.field && <ArrowUpDown size={10} style={{ color: 'var(--light-gray)' }} />}
                        </div>
                        {col.searchKey && ['service', 'patient', 'clinician', 'hmo'].includes(col.searchKey) && (
                          <input
                            className="mt-1 w-full px-2 py-0.5 rounded border text-xs outline-none"
                            style={{ borderColor: 'var(--light-gray)' }}
                            placeholder={`Filter…`}
                            value={perHmoColSearch[col.searchKey] || ''}
                            onChange={e => setPerHmoColSearch(prev => ({ ...prev, [col.searchKey]: e.target.value }))}
                            onClick={e => e.stopPropagation()}
                          />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={13} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>Loading...</td></tr>
                  ) : perHmoOrders.length === 0 ? (
                    <tr><td colSpan={13} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                      {/* Fetching a past year takes a moment — saying "none" while
                          the rows are still in flight is how this read as empty. */}
                      {perHmoLoading ? 'Loading transactions…' : 'No transactions found'}
                    </td></tr>
                  ) : perHmoOrders.map(o => {
                    const wallet = wallets.find(w => w.id === o.payments[0]?.walletId)
                    const amt = o.payments.reduce((s, p) => s + toNum(p.amount), 0)
                    const isPaid = o.arPaymentItems.length > 0
                    const isDirect = isDirectToClinician(o)
                    const isEditingDate = changeDateEditId === o.id
                    const isBusyDate = changeDateBusy === o.id
                    return (
                      <tr key={o.id} className="border-t hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)', background: isDirect ? '#fff7ed' : undefined }}>
                        {/* Original transaction date */}
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
                          {formatDate(o.transactionDate)}
                          {isDirect && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap" title="The HMO pays the clinician directly — not part of our AR" style={{ background: '#ffedd5', color: '#c2410c' }}>direct to clinician</span>
                          )}
                        </td>
                        {/* Change Date cell */}
                        <td className="px-3 py-2 text-center" style={{ minWidth: 130 }}>
                          {isEditingDate ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="date"
                                autoFocus
                                defaultValue={
                                  o.arCustomDate
                                    ? new Date(o.arCustomDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
                                    : new Date(o.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
                                }
                                onChange={e => setChangeDateValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Escape') { setChangeDateEditId(null); setChangeDateValue('') }
                                }}
                                className="px-1.5 py-0.5 rounded border text-xs outline-none"
                                style={{ borderColor: 'var(--teal)', width: 110 }}
                              />
                              <button
                                disabled={isBusyDate}
                                onClick={() => {
                                  if (changeDateValue) saveCustomDate(o.id, changeDateValue)
                                  else { setChangeDateEditId(null); setChangeDateValue('') }
                                }}
                                className="text-[10px] px-1.5 py-0.5 rounded font-semibold text-white disabled:opacity-50"
                                style={{ background: 'var(--teal)' }}>
                                {isBusyDate ? '…' : '✓'}
                              </button>
                              <button
                                onClick={() => { setChangeDateEditId(null); setChangeDateValue('') }}
                                className="text-[10px] px-1 py-0.5 rounded"
                                style={{ color: 'var(--mid-gray)' }}>
                                ✕
                              </button>
                            </div>
                          ) : o.arCustomDate ? (
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>
                                {formatDate(o.arCustomDate)}
                              </span>
                              <button
                                title="Edit changed date"
                                onClick={() => { setChangeDateEditId(o.id); setChangeDateValue('') }}
                                className="p-0.5 rounded hover:bg-teal-50"
                                style={{ color: 'var(--teal)' }}>
                                <Pencil size={10} />
                              </button>
                              <button
                                title="Clear — revert to original date"
                                disabled={isBusyDate}
                                onClick={() => saveCustomDate(o.id, null)}
                                className="p-0.5 rounded hover:bg-red-50 disabled:opacity-40">
                                <X size={10} className="text-red-400" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setChangeDateEditId(o.id); setChangeDateValue('') }}
                              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg border text-[10px] font-medium"
                              style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                              <Calendar size={9} /> Set
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--charcoal)' }}>{o.items.map(i => i.name).join(', ')}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--charcoal)' }}>{o.patientName || '—'}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--charcoal)' }}>{o.clinicianName || '—'}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{wallet?.patientName || '—'}</td>
                        <td className="px-3 py-2 text-xs text-right font-medium" style={{ color: 'var(--charcoal)' }}>
                          <div className="relative group inline-block cursor-default">
                            {formatCurrency(amt)}
                            <span className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block z-20 text-[10px] font-normal rounded-lg px-3 py-2 shadow-xl pointer-events-none"
                              style={{ background: '#1f2937', color: 'white', width: 220, whiteSpace: 'normal', lineHeight: 1.5 }}>
                              To revise this amount, coordinate with front desk so it is reflected here.
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={isPaid ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                            {isPaid ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                        {/* SOA Submitted — automated: Yes once the order is in any
                            SOA Submissions batch (logged there, or auto-recorded when
                            an SOA Report was generated over it). */}
                        {(() => {
                          const soaDates = (o.soaSubmissionItems || []).map(i => i.submission.submittedDate).sort()
                          const soaSubmitted = soaDates.length > 0
                          return (
                            <>
                              <td className="px-3 py-2 text-center">
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                  style={soaSubmitted ? { background: '#dcfce7', color: '#166534' } : { background: '#f3f4f6', color: '#6b7280' }}>
                                  {soaSubmitted ? 'Yes' : 'No'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-center whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                                {soaSubmitted ? formatDate(soaDates[soaDates.length - 1]) : '—'}
                              </td>
                              {/* Submission Status — Pending by default; Paid auto-shows Approved */}
                              <td className="px-3 py-2 text-center">
                                {isPaid ? (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" title="Automatically Approved — this claim is tagged as Paid"
                                    style={{ background: '#dcfce7', color: '#166534' }}>
                                    Approved
                                  </span>
                                ) : (
                                  <select
                                    value={o.soaApprovalStatus || ''}
                                    disabled={soaStatusBusy === o.id}
                                    onChange={e => saveSoaStatus(o.id, e.target.value)}
                                    className="px-1.5 py-1 rounded-lg border text-xs outline-none disabled:opacity-50"
                                    style={{
                                      borderColor: 'var(--light-gray)',
                                      color: o.soaApprovalStatus === 'APPROVED' ? '#166534' : o.soaApprovalStatus === 'DISAPPROVED' ? '#b91c1c' : 'var(--mid-gray)',
                                      background: o.soaApprovalStatus === 'APPROVED' ? '#dcfce7' : o.soaApprovalStatus === 'DISAPPROVED' ? '#fee2e2' : 'white',
                                    }}>
                                    <option value="">Pending</option>
                                    <option value="APPROVED">Approved</option>
                                    <option value="DISAPPROVED">Disapproved</option>
                                  </select>
                                )}
                              </td>
                            </>
                          )
                        })()}
                        <td className="px-3 py-2 text-center">
                          <button
                            disabled={invoiceBusy === o.id}
                            onClick={async () => {
                              setInvoiceBusy(o.id)
                              try {
                                // Fetch patient info from Marketing Hub CRM
                                let patientInfo: PatientInfo | null = null
                                if (o.patientId) {
                                  try {
                                    const pr = await fetch(`/api/accounts-receivable/patient-info?patientId=${encodeURIComponent(o.patientId)}`)
                                    if (pr.ok) {
                                      const pd = await pr.json()
                                      patientInfo = pd.patient ?? null
                                    }
                                  } catch { /* use null if unavailable */ }
                                }
                                const setting = invoiceSettings[o.branch] ?? null
                                await buildInvoicePdf(o, setting, wallet?.patientName || '—', patientInfo)
                              } catch (e) {
                                alert((e as Error).message || 'Failed to generate invoice')
                              } finally {
                                setInvoiceBusy(null)
                              }
                            }}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg border text-[10px] font-medium disabled:opacity-50"
                            style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                            <FileText size={10} />
                            {invoiceBusy === o.id ? '…' : 'Invoice'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <ProofCell orderId={o.id} currentUrl={o.arProofUrl || null}
                            onChange={(url) => setOrders(prev => prev.map(x => x.id === o.id ? { ...x, arProofUrl: url } : x))} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ── SOA Report sub-tab ── */}
      {tab === 'HMO' && hmoSubTab === 'soa-report' && (
        <SoaReport
          wallets={wallets.map(w => ({ id: w.id, patientName: w.patientName, branch: w.branch }))}
          isAdmin={['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN'].includes((session?.user as { role?: string })?.role || '')}
          canWrite={canWrite}
        />
      )}

      {tab === 'HMO' && hmoSubTab === 'submitted-soa' && (
        <SubmittedForSoa
          wallets={wallets.map(w => ({ id: w.id, patientName: w.patientName }))}
          canWrite={['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER'].includes((session?.user as { role?: string })?.role || '')}
        />
      )}
      {/* ── Sessions behind an aging figure ──────────────────────────────
          The orders list is capped by the API, so a bucket can reference an
          order that was never loaded. Say so rather than quietly showing a
          shorter list than the figure that was clicked. */}
      {sessionModal && (() => {
        const found = orders.filter(o => sessionModal.ids.includes(o.id))
        const missing = sessionModal.ids.length - found.length
        const amountOf = (o: AROrder) => o.payments.reduce((s, p) => s + toNum(p.amount), 0)
        const total = found.reduce((s, o) => s + amountOf(o), 0)
        return (
          <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
            onClick={() => setSessionModal(null)}>
            <div className="bg-white rounded-2xl w-full max-w-3xl mt-10 overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between px-5 py-3 border-b"
                style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Sessions included</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{sessionModal.label}</p>
                </div>
                <button onClick={() => setSessionModal(null)} className="p-1.5 rounded-lg hover:bg-gray-200">
                  <X size={16} style={{ color: 'var(--mid-gray)' }} />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="sticky top-0 z-10" style={{ background: 'var(--pale-teal)' }}>
                      {['Date', 'Order #', 'Patient', 'Service', 'Clinician', 'Branch', 'Amount'].map(h => (
                        <th key={h} className={`px-3 py-2 font-semibold ${h === 'Amount' ? 'text-right' : 'text-left'}`}
                          style={{ color: 'var(--deep-teal)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {found.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-xs" style={{ color: 'var(--mid-gray)' }}>
                        These sessions are older than the loaded window, so their details aren&apos;t available here.
                      </td></tr>
                    )}
                    {found.map(o => (
                      <tr key={o.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(o.arCustomDate || o.transactionDate)}</td>
                        <td className="px-3 py-2 font-mono">{o.orderNumber}</td>
                        <td className="px-3 py-2">{o.patientName || '—'}</td>
                        <td className="px-3 py-2">{o.items.map(i => i.name).join(', ') || '—'}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{o.clinicianName || '—'}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{branchLabel(o.branch) || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(amountOf(o))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between px-5 py-3 border-t text-xs"
                style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <span style={{ color: 'var(--mid-gray)' }}>
                  {found.length} of {sessionModal.ids.length} session{sessionModal.ids.length === 1 ? '' : 's'}
                  {missing > 0 && ` · ${missing} not loaded`}
                </span>
                <span className="font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Invoice Settings Modal */}
      {showInvoiceSettings && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-lg mb-8 relative">
            <button onClick={() => setShowInvoiceSettings(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>
            <h3 className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              <Settings size={18} className="inline mr-1" style={{ color: 'var(--teal)' }} /> Invoice Settings
            </h3>
            <p className="text-xs mb-5" style={{ color: 'var(--mid-gray)' }}>Set the company details shown at the top of each invoice, per branch.</p>

            {/* Branch selector */}
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch</label>
              <input
                list="invoice-branch-list"
                value={invSettingBranch}
                onChange={e => {
                  const b = e.target.value
                  setInvSettingBranch(b)
                  const existing = invoiceSettings[b]
                  setInvForm(existing ? {
                    companyName: existing.companyName || '',
                    tradeName: existing.tradeName || '',
                    address: existing.address || '',
                    phone: existing.phone || '',
                    email: existing.email || '',
                  } : { companyName: '', tradeName: '', address: '', phone: '', email: '' })
                }}
                placeholder="Select or type branch…"
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--light-gray)' }}
              />
              <datalist id="invoice-branch-list">
                {Array.from(new Set([
                  ...Object.keys(invoiceSettings),
                  ...orders.map(o => o.branch).filter(Boolean),
                ])).sort().map(b => <option key={b} value={b} />)}
              </datalist>
            </div>

            {/* Form fields */}
            <div className="space-y-3">
              {[
                { key: 'companyName', label: 'Company Name', placeholder: 'e.g. SAPPHIRE CLINICS EAST INCORPORATED' },
                { key: 'tradeName', label: 'Trade Name', placeholder: 'e.g. East Branch' },
                { key: 'address', label: 'Address', placeholder: 'Street, City' },
                { key: 'phone', label: 'Contact Number', placeholder: 'e.g. +63 912 345 6789' },
                { key: 'email', label: 'Email (optional)', placeholder: 'e.g. info@clinic.com' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>{label}</label>
                  <input
                    type="text"
                    value={(invForm as Record<string, string>)[key] || ''}
                    onChange={e => setInvForm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--light-gray)' }}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-5">
              <button onClick={() => setShowInvoiceSettings(false)}
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
              <button
                onClick={async () => { await saveInvoiceSettings(); setShowInvoiceSettings(false) }}
                disabled={invSettingSaving || !invSettingBranch}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--teal)' }}>
                {invSettingSaving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>

            {/* Existing configs */}
            {Object.keys(invoiceSettings).length > 0 && (
              <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--mid-gray)' }}>Configured branches</p>
                <div className="space-y-1">
                  {Object.values(invoiceSettings).map(s => (
                    <button key={s.branch}
                      onClick={() => {
                        setInvSettingBranch(s.branch)
                        setInvForm({
                          companyName: s.companyName || '',
                          tradeName: s.tradeName || '',
                          address: s.address || '',
                          phone: s.phone || '',
                          email: s.email || '',
                        })
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 border text-xs"
                      style={{ borderColor: 'var(--light-gray)' }}>
                      <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{s.branch}</span>
                      {s.companyName && <span className="ml-2" style={{ color: 'var(--mid-gray)' }}>{s.companyName}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div className={`fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto ${payModalExpanded ? '' : 'pt-8'}`}>
          <div className={`bg-white p-6 shadow-xl w-full relative ${payModalExpanded ? 'max-w-none min-h-full rounded-none' : 'max-w-lg mb-8 rounded-2xl'}`}>
            <button onClick={() => setPayModalExpanded(v => !v)}
              title={payModalExpanded ? 'Exit full screen' : 'Expand to full screen'}
              className="absolute top-4 right-12 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-100 text-xs font-medium"
              style={{ color: 'var(--mid-gray)' }}>
              {payModalExpanded ? <><Minimize2 size={14} /> Collapse</> : <><Maximize2 size={14} /> Expand</>}
            </button>
            <button onClick={() => setShowPaymentModal(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>
            <div className={payModalExpanded ? 'max-w-4xl mx-auto' : ''}>
            <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              <DollarSign size={20} className="inline" style={{ color: 'var(--teal)' }} /> {editingPaymentId ? 'Edit Payment' : 'Record Payment'}
            </h3>

            <div className="space-y-4">
              {/* Provider/Agency */}
              {tab === 'GL' && !editingPaymentId ? (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                    Select GL Patients (tick all that apply)
                  </label>
                  {renderTagFilterBar('Search patient name or amount...')}
                  {(() => {
                    // Date range keeps patients with at least one transaction in range.
                    // The page order list is capped, so a wallet with no loaded orders is
                    // kept rather than hidden — we can't prove it falls outside the range.
                    const dateFilterOn = !!(payTagFrom || payTagTo)
                    const visibleWallets = wallets.filter(w => {
                      if (!tagTextOrAmountMatches(w.patientName, [toNum(w.balance)])) return false
                      if (!dateFilterOn) return true
                      const walletOrders = orders.filter(o => o.payments.some(p => p.walletId === w.id))
                      return walletOrders.length === 0 || walletOrders.some(o => inTagDateRange(o.transactionDate))
                    })
                    return (
                      <>
                        <div className={`rounded-xl border overflow-y-auto ${payModalExpanded ? 'max-h-[60vh]' : 'max-h-48'}`} style={{ borderColor: 'var(--light-gray)' }}>
                          {visibleWallets.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--mid-gray)' }}>No patients match the current filters.</p>
                          ) : visibleWallets.map(w => (
                            <label key={w.id} className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 cursor-pointer border-b" style={{ borderColor: 'var(--light-gray)' }}>
                              <input type="checkbox" checked={payWalletIds.includes(w.id)}
                                onChange={() => {
                                  setPayWalletIds(prev => prev.includes(w.id) ? prev.filter(id => id !== w.id) : [...prev, w.id])
                                  if (!payWalletId) setPayWalletId(w.id)
                                }}
                                className="rounded" />
                              <span className="flex-1 font-medium" style={{ color: 'var(--charcoal)' }}>{w.patientName}</span>
                              <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Balance: {formatCurrency(toNum(w.balance))}</span>
                            </label>
                          ))}
                        </div>
                        {tagFiltersActive && (
                          <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                            Showing {visibleWallets.length} of {wallets.length} patients{payWalletIds.length > 0 ? ` · ${payWalletIds.length} ticked` : ''}
                          </p>
                        )}
                      </>
                    )
                  })()}
                  {payWalletIds.length > 1 && (
                    <p className="text-xs mt-1 font-medium" style={{ color: 'var(--deep-teal)' }}>
                      {payWalletIds.length} selected &middot; Combined balance: {formatCurrency(wallets.filter(w => payWalletIds.includes(w.id)).reduce((s, w) => s + toNum(w.balance), 0))}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                    {tab === 'HMO' ? 'HMO Provider' : 'Agency (GL)'}
                  </label>
                  <select value={payWalletId} onChange={e => setPayWalletId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="">— Select —</option>
                    {wallets.map(w => <option key={w.id} value={w.id}>{w.patientName} (Balance: {formatCurrency(toNum(w.balance))})</option>)}
                  </select>
                </div>
              )}

              {/* Payment Date + Sales Invoice Number */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment Date</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Sales Invoice Number</label>
                  <input type="text" value={paySalesInvoice} onChange={e => setPaySalesInvoice(e.target.value)}
                    placeholder="SI issued for this collection"
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              </div>

              {/* Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment Amount</label>
                  <input type="number" min={0} step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Discount Applied</label>
                  <input type="number" min={0} step="0.01" value={payDiscount} onChange={e => setPayDiscount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              </div>

              {/* Discount Account */}
              {toNum(payDiscount) > 0 && (
                <div className="relative">
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Discount Account (COA)</label>
                  <input type="text" value={payDiscountSearch}
                    onChange={e => { setPayDiscountSearch(e.target.value); if (!e.target.value) setPayDiscountAccountId('') }}
                    placeholder="Search discount account..."
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: payDiscountAccountId ? 'var(--teal)' : 'var(--light-gray)', background: payDiscountAccountId ? '#f0fdfa' : 'white' }} />
                  {payDiscountAccountId && (
                    <button type="button" onClick={() => { setPayDiscountAccountId(''); setPayDiscountSearch('') }}
                      className="absolute right-2 top-7 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                  )}
                  {payDiscountSearch && !payDiscountAccountId && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-36 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                      {discountAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(payDiscountSearch.toLowerCase())).slice(0, 8).map(a => (
                        <button key={a.id} type="button" onClick={() => { setPayDiscountAccountId(a.id); setPayDiscountSearch(`${a.accountNumber} ${a.accountTitle}`) }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                          <span className="font-mono font-medium" style={{ color: 'var(--teal)' }}>{a.accountNumber}</span> {a.accountTitle}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Debit Account (Cash/Bank account) */}
              <div className="relative">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Debit Account (where payment was received)</label>
                <input type="text" value={payCashAccountSearch}
                  onChange={e => { setPayCashAccountSearch(e.target.value); if (!e.target.value) setPayCashAccountId('') }}
                  placeholder="Search account (e.g. Cash, BDO, BPI)..."
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: payCashAccountId ? 'var(--teal)' : 'var(--light-gray)', background: payCashAccountId ? '#f0fdfa' : 'white' }} />
                {payCashAccountId && (
                  <button type="button" onClick={() => { setPayCashAccountId(''); setPayCashAccountSearch('') }}
                    className="absolute right-2 top-7 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                )}
                {payCashAccountSearch && !payCashAccountId && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-36 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                    {cashAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(payCashAccountSearch.toLowerCase())).slice(0, 8).map(a => (
                      <button key={a.id} type="button" onClick={() => { setPayCashAccountId(a.id); setPayCashAccountSearch(`${a.accountNumber} ${a.accountTitle}`) }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                        <span className="font-mono font-medium" style={{ color: 'var(--teal)' }}>{a.accountNumber}</span> {a.accountTitle}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tag transactions — HMO only; not needed for GL (payment tracked at wallet level) */}
              {tab !== 'GL' && (payWalletId || payWalletIds.length > 0) && (() => {
                // When editing, show all orders for this wallet (paid or unpaid); when creating, show only unpaid.
                // Prefer the wallet-scoped fetch (uncapped, includes old imported orders);
                // fall back to the page list while it loads.
                const selectedIds: string[] = payWalletId ? [payWalletId] : []
                const source = payWalletOrders.length ? payWalletOrders : orders
                const eligibleOrders = editingPaymentId
                  ? source.filter(o => o.payments.some(p => selectedIds.includes(p.walletId || '')))
                  : source.filter(o => o.arPaymentItems.length === 0 && o.payments.some(p => selectedIds.includes(p.walletId || '')))
                const visibleOrders = eligibleOrders.filter(o => {
                  if (!inTagDateRange(o.transactionDate)) return false
                  const amt = toNum(o.payments.find(p => selectedIds.includes(p.walletId || ''))?.amount)
                  return tagTextOrAmountMatches(`${o.patientName} ${o.items.map(i => i.name).join(' ')}`, [amt])
                })
                return eligibleOrders.length > 0 ? (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Tag Transactions Included</label>
                  {renderTagFilterBar('Search name, service, amount...')}
                  <div className={`rounded-xl border overflow-y-auto ${payModalExpanded ? 'max-h-[60vh]' : 'max-h-40'}`} style={{ borderColor: 'var(--light-gray)' }}>
                    {visibleOrders.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--mid-gray)' }}>No transactions match the current filters.</p>
                    ) : visibleOrders.map(o => {
                      const amt = o.payments.find(p => selectedIds.includes(p.walletId || ''))
                      return (
                        <label key={o.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer border-b" style={{ borderColor: 'var(--light-gray)' }}>
                          <input type="checkbox" checked={paySelectedOrders.includes(o.id)}
                            onChange={() => toggleOrderSelect(o.id)}
                            className="rounded" />
                          <span style={{ color: 'var(--mid-gray)' }}>{formatDate(o.transactionDate)}</span>
                          <span className="flex-1" style={{ color: 'var(--charcoal)' }}>{o.patientName} — {o.items.map(i => i.name).join(', ')}</span>
                          <span className="font-medium">{formatCurrency(toNum(amt?.amount))}</span>
                        </label>
                      )
                    })}
                  </div>
                  {tagFiltersActive && (
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                      Showing {visibleOrders.length} of {eligibleOrders.length} transactions{paySelectedOrders.length > 0 ? ` · ${paySelectedOrders.length} tagged` : ''}
                    </p>
                  )}
                  {paySelectedOrders.length > 0 && (
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                      Tagged total: <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(payTaggedTotal)}</span>
                      {' · '}Payment{toNum(payDiscount) > 0 ? ' + discount' : ''}: <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(toNum(payAmount) + toNum(payDiscount))}</span>
                    </p>
                  )}
                </div>
                ) : null
              })()}

              {/* Overpayment: payer remitted more than the tagged AR — classify the excess as income */}
              {payOverpay > 0 && (
                <div className="rounded-xl border p-3" style={{ borderColor: '#fcd34d', background: '#fffbeb' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#92400e' }}>
                    Overpayment of {formatCurrency(payOverpay)} — the payment exceeds the tagged transactions.
                    Only {formatCurrency(payTaggedTotal)} settles AR; classify the excess as income:
                  </p>
                  <select value={payOverpayAccountId} onChange={e => setPayOverpayAccountId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none bg-white"
                    style={{ borderColor: payOverpayAccountId ? 'var(--teal)' : '#fcd34d' }}>
                    <option value="">— Select income account —</option>
                    {incomeAccounts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
                  </select>
                </div>
              )}

              {/* Proof of payment — multi-file upload */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                  Proof of Payment
                  <span className="ml-1 font-normal" style={{ color: 'var(--mid-gray)' }}>({payProofUrls.length} file{payProofUrls.length !== 1 ? 's' : ''})</span>
                </label>
                <div className="space-y-1.5">
                  {payProofUrls.map((url, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs" style={{ borderColor: 'var(--teal)', background: '#f0fdfa' }}>
                      <Upload size={12} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 truncate underline" style={{ color: 'var(--teal)' }}>
                        {url.split('/').pop()}
                      </a>
                      <a href={url} download className="p-0.5 rounded hover:bg-teal-100" title="Download">
                        <Download size={12} style={{ color: 'var(--teal)' }} />
                      </a>
                      <button type="button"
                        onClick={() => setPayProofUrls(prev => prev.filter((_, i) => i !== idx))}
                        className="p-0.5 rounded hover:bg-red-50" title="Remove">
                        <X size={12} style={{ color: '#dc2626' }} />
                      </button>
                    </div>
                  ))}
                  <ScanUpload section="ar" prefix={`AR-${paySalesInvoice || payDate}`} existingCount={payProofUrls.length}
                    label={payProofUrls.length === 0 ? 'Upload file' : 'Add another file'}
                    onUploaded={url => setPayProofUrls(prev => [...prev, url])} />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Notes</label>
                <textarea value={payNotes} onChange={e => setPayNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>

              {payError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{payError}</p>}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPaymentModal(false)}
                  className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                <button onClick={savePayment} disabled={paySaving}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'var(--teal)' }}>
                  {paySaving ? 'Saving...' : editingPaymentId ? 'Update Payment' : 'Record Payment'}
                </button>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
