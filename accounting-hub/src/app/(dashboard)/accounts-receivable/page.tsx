'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useSession } from 'next-auth/react'
import { userBranchScope } from '@/lib/branch-scope'
import { useSearchParams } from 'next/navigation'
import {
  FileCheck, Search, ChevronUp, ChevronDown, ArrowUpDown,
  X, AlertCircle, DollarSign, Calendar, Upload, Trash2, Pencil,
  Download, Filter, FileText, Settings,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { ScanUpload } from '@/components/ScanUpload'
import SoaReport from './SoaReport'

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
  items: { name: string; service?: { department?: string | null } | null }[]
  payments: { amount: number | string; walletId?: string }[]
  arPaymentItems: { paymentId: string }[]
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
  const inputRef = useRef<HTMLInputElement>(null)

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

  const upload = async (file: File) => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const ud = await up.json()
      if (!up.ok || !ud.url) throw new Error(ud.error || 'Upload failed')
      await persist([...urls, ud.url])
    } catch (e) {
      alert((e as Error).message || 'Failed to attach proof')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
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
      <label
        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg border cursor-pointer text-[10px] font-medium"
        style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', opacity: busy ? 0.5 : 1 }}>
        <Upload size={10} />
        {busy ? '…' : urls.length > 0 ? '+ Add' : 'Upload'}
        <input ref={inputRef} type="file" accept="image/*,.pdf,application/pdf" className="hidden"
          disabled={busy}
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) await upload(f) }} />
      </label>
    </div>
  )
}

export default function AccountsReceivablePage() {
  const { data: session } = useSession()
  const isHmoOfficer = session?.user?.role === 'HMO_OFFICER'
  const scope = userBranchScope((session?.user as { branch?: string })?.branch)
  const searchParams = useSearchParams()
  // HMO Officers are locked to the HMO tab only
  const initialType = !isHmoOfficer && searchParams.get('type') === 'GL' ? 'GL' : 'HMO'
  const initialWallet = searchParams.get('wallet') || ''

  const [tab, setTab] = useState<'HMO' | 'GL'>(initialType as 'HMO' | 'GL')
  const [branch, setBranch] = useState(scope.enum || '')
  useEffect(() => { if (scope.enum && branch !== scope.enum) setBranch(scope.enum) }, [scope.enum]) // eslint-disable-line react-hooks/exhaustive-deps
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [walletFilter, setWalletFilter] = useState(initialWallet)
  const [sortField, setSortField] = useState('transactionDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [wallets, setWallets] = useState<ARWallet[]>([])
  const [orders, setOrders] = useState<AROrder[]>([])
  const [arPayments, setArPayments] = useState<ARPaymentRecord[]>([])
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
  const [arDaysSort, setArDaysSort] = useState<'asc' | 'desc'>('desc')

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
  const [payError, setPayError] = useState('')
  const [paySaving, setPaySaving] = useState(false)
  const [discountAccounts, setDiscountAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [cashAccounts, setCashAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [payCashAccountId, setPayCashAccountId] = useState('')
  const [payCashAccountSearch, setPayCashAccountSearch] = useState('')
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)

  // HMO sub-tab state
  const [hmoSubTab, setHmoSubTab] = useState<'overview' | 'per-hmo' | 'soa-report'>('overview')
  // Per HMO sub-tab state
  const [perHmoWallet, setPerHmoWallet] = useState('')
  const [perHmoFrom, setPerHmoFrom] = useState('')
  const [perHmoTo, setPerHmoTo] = useState('')
  const [perHmoSortField, setPerHmoSortField] = useState('transactionDate')
  const [perHmoSortDir, setPerHmoSortDir] = useState<'asc' | 'desc'>('desc')
  const [perHmoColSearch, setPerHmoColSearch] = useState<Record<string, string>>({})
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
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [tab, branch, dateFrom, dateTo, walletFilter, sortField, sortDir])

  useEffect(() => { fetchData() }, [fetchData])

  // Fetch aging dashboard data whenever tab / branch / period changes
  useEffect(() => {
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

  // Fetch discount COA accounts (REVENUE with DEBIT balance)
  useEffect(() => {
    fetch('/api/chart-of-accounts?accountType=REVENUE&pageSize=500')
      .then(r => r.json())
      .then(d => setDiscountAccounts(
        (d.data || [])
          .filter((a: { normalBalance: string }) => a.normalBalance === 'DEBIT')
          .map((a: { id: string; accountNumber: string; accountTitle: string }) => ({
            id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle,
          }))
      ))
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

  const totalReceivable = wallets.reduce((s, w) => s + toNum(w.balance), 0)
  const unpaidOrders = orders.filter(o => o.arPaymentItems.length === 0)

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
    setPayNotes('')
    setPaySalesInvoice('')
    setPayProofUrls([])
    setPaySelectedOrders([])
    setPayError('')
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
    setPayNotes(p.notes || '')
    setPaySalesInvoice(p.salesInvoiceNumber || '')
    setPayProofUrls(parseProofUrls(p.proofUrl))
    setPaySelectedOrders(p.items.map(i => i.orderId))
    setPayError('')
    setShowPaymentModal(true)
  }

  const savePayment = async () => {
    // For GL multi-select, use payWalletIds; for HMO use payWalletId
    const effectiveWalletIds = tab === 'GL' && !editingPaymentId ? payWalletIds : (payWalletId ? [payWalletId] : [])
    if (effectiveWalletIds.length === 0) { setPayError('Select an HMO/Agency'); return }
    if (!payAmount || toNum(payAmount) <= 0) { setPayError('Amount is required'); return }
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
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Total Receivable ({tab})</p>
            <p className="text-lg font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(totalReceivable)}</p>
          </div>
          <button onClick={openPaymentModal} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--teal)' }}>
            <DollarSign size={16} /> Record Payment
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['HMO', 'GL'] as const).filter(t => !(isHmoOfficer && t === 'GL')).map(t => (
          <button key={t} onClick={() => { setTab(t); setWalletFilter(''); setBucketFilterIds(null); setBucketFilterLabel(''); setHmoSubTab('overview') }}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={tab === t
              ? { background: 'var(--teal)', color: 'white' }
              : { background: 'var(--off-white)', color: 'var(--charcoal)' }}>
            {t === 'HMO' ? 'HMO Providers' : 'Guarantee Letters (GL)'}
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
            { key: 'soa-report', label: 'SOA Report' },
          ] as const).map(st => (
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

      {/* ── GL Summary: % consumed, % paid, department pie chart ── */}
      {tab === 'GL' && (() => {
        // Per-session agencies have no approved amount, so they are left out of the
        // approved-basis percentages — including them would divide a consumed figure
        // by a denominator that does not contain it.
        const approvedWallets = wallets.filter(w => !w.perSession)
        const perSessionWallets = wallets.filter(w => w.perSession)
        const perSessionOutstanding = perSessionWallets.reduce((s, w) => s + toNum(w.balance), 0)
        const totalApproved = approvedWallets.reduce((s, w) => s + toNum(w.totalGlAmount), 0)
        // Use consumedOutstanding (= totalGlAmount − remaining balance) so that
        // zero-balance wallets and partially-consumed wallets are included correctly.
        const totalConsumed = approvedWallets.reduce((s, w) => s + (w.consumedOutstanding ?? 0), 0)
        const totalPaid = arPayments.reduce((s, p) => s + toNum(p.amount), 0)
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
        for (const w of wallets) {
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
        const totalHmoOrders = orders.reduce((s, o) => s + o.payments.reduce((ps, p) => ps + toNum(p.amount), 0), 0)
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

        // Department breakdown — split each order's payment proportionally across departments
        const deptMap = new Map<string, number>()
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
        const deptEntries = Array.from(deptMap.entries()).sort((a, b) => b[1] - a[1])
        const deptTotal = deptEntries.reduce((s, [, v]) => s + v, 0)
        const deptSlices = buildPie(deptEntries, deptTotal)

        // Provider breakdown (HMO orders by wallet/provider)
        const provMap = new Map<string, number>()
        for (const o of orders) {
          for (const p of o.payments) {
            const wallet = wallets.find(w => w.id === p.walletId)
            const name = wallet?.patientName || 'Unknown'
            provMap.set(name, (provMap.get(name) || 0) + toNum(p.amount))
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

      {/* ── Overview content (AR Dashboard + Filters + Cards + Table + Payment History) ── */}
      {(tab !== 'HMO' || hmoSubTab === 'overview') && <>

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

        {/* AR Days per wallet — sortable table */}
        {agingData && agingData.perWallet.filter(w => w.ar > 0 || w.revenue > 0).length > 0 && (
          <div id="ar-days-per-agency">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--mid-gray)' }}>AR Days per {tab === 'HMO' ? 'HMO' : 'Agency'}</p>
            <div className="rounded-xl border overflow-y-auto" style={{ borderColor: 'var(--light-gray)', background: 'white', maxHeight: '260px' }}>
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
            </div>
          </div>
        )}

        {/* Aging Receivable Details */}
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
          <div className="rounded-xl border overflow-y-auto" style={{ borderColor: 'var(--light-gray)', background: 'white', maxHeight: '280px' }}>
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
                    setBucketFilterIds(ids)
                    setBucketFilterLabel(`${w.walletName} · ${bucketLabels[b]}`)
                    setWalletFilter(w.walletId)
                    // Nudge the user to the table below
                    setTimeout(() => {
                      const el = document.querySelector('[data-ar-transactions-table]')
                      if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }, 50)
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
          </div>
        </div>
      </div>

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
      <div id="ar-utilization" className="rounded-xl border overflow-y-auto" style={{ borderColor: 'var(--light-gray)', background: 'white', maxHeight: '260px' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 z-10" style={{ background: 'var(--pale-teal)' }}>
              <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>
                {tab === 'GL' ? 'Agency / Name' : 'HMO Provider'}
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>
                {tab === 'GL' ? 'Approved SOA' : 'Outstanding'}
              </th>
              {tab === 'GL' && <>
                <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>Paid</th>
                <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>Months to pay</th>
                <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>Consumed</th>
                <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>% Consumed</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {/* Approved-SOA agencies first, then the per-session ones under their own
                heading: they are read differently, so they are not mixed in. */}
            {[...wallets.filter(w => !w.perSession), ...wallets.filter(w => w.perSession)].map((w, i, arr) => {
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
                    <td colSpan={6} className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>
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
                  <td className="px-3 py-2 text-right text-xs font-bold tabular-nums" style={{ color: approved > 0 ? '#dc2626' : '#166534' }}>
                    {formatCurrency(approved)}
                  </td>
                  {tab === 'GL' && <>
                    <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums" style={{ color: paid > 0 ? '#166534' : 'var(--light-gray)' }}>
                      {paid > 0 ? formatCurrency(paid) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: 'var(--charcoal)' }}>
                      {typeof w.monthsToPay === 'number'
                        ? `${w.monthsToPay.toFixed(1)} mo`
                        : <span style={{ color: 'var(--light-gray)' }}>unpaid</span>}
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
      </div>

      {/* Session Tagging — the sessions themselves, and which of them a payment has
          been applied to. Pick an agency above to see only that patient's sessions. */}
      {!(tab === 'HMO' && hmoSubTab === 'overview') && (
        <div className="flex items-baseline justify-between mt-4 mb-2">
          <h3 className="text-sm font-bold" style={{ color: 'var(--deep-teal)' }}>Session Tagging</h3>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            {walletFilter
              ? 'Tagging records which sessions a payment covered — it does not change the AR balance.'
              : 'Choose an agency above to tag that patient\u2019s sessions.'}
          </p>
        </div>
      )}
      {!(tab === 'HMO' && hmoSubTab === 'overview') && <div id="ar-transactions" data-ar-transactions-table className="rounded-2xl border overflow-y-auto" style={{ borderColor: 'var(--light-gray)', background: 'white', maxHeight: '400px' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 z-10" style={{ background: 'var(--off-white)' }}>
              <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                onClick={() => toggleSort('transactionDate')}>
                <span className="flex items-center gap-1">Date <SortIcon field="transactionDate" /></span>
              </th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Service</th>
              <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                onClick={() => toggleSort('patientName')}>
                <span className="flex items-center gap-1">Patient <SortIcon field="patientName" /></span>
              </th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>
                {tab === 'HMO' ? 'HMO' : 'Agency'}
              </th>
              <th className="text-right px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                onClick={() => toggleSort('netAmount')}>
                <span className="flex items-center justify-end gap-1">Amount <SortIcon field="netAmount" /></span>
              </th>
              <th className="text-center px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
              <th className="text-center px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Proof</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>Loading...</td></tr>
            ) : (bucketFilterIds ? orders.filter(o => bucketFilterIds.includes(o.id)) : orders).length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>No receivable transactions found</td></tr>
            ) : (bucketFilterIds ? orders.filter(o => bucketFilterIds.includes(o.id)) : orders).map(o => {
              // Sum all HMO/GL payments on this order (should normally be 1)
              const amt = o.payments.reduce((s, p) => s + toNum(p.amount), 0)
              const wallet = wallets.find(w => w.id === o.payments[0]?.walletId)
              const isPaid = o.arPaymentItems.length > 0
              return (
                <tr key={o.id} className="border-t hover:bg-gray-50/50 transition-colors" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{formatDate(o.transactionDate)}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>{o.items.map(i => i.name).join(', ')}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>{o.patientName || '—'}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{wallet?.patientName || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(amt)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-1 rounded-full text-xs font-semibold"
                      style={isPaid ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                      {isPaid ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ProofCell orderId={o.id} currentUrl={o.arProofUrl || null}
                      onChange={(url) => setOrders(prev => prev.map(x => x.id === o.id ? { ...x, arProofUrl: url } : x))} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>}

      {/* Payment History — always shown, on both tabs. Hiding it when empty made
          it look as though HMO had no such section at all, when in fact no HMO
          payment had been recorded (the one that was is since reversed). */}
      {(
        <div id="ar-payment-history">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
            Payment History — {tab}
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
              {arPayments.length}
            </span>
          </h3>
          <div className="rounded-2xl border overflow-y-auto" style={{ borderColor: 'var(--light-gray)', background: 'white', maxHeight: '320px' }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="sticky top-0 z-10" style={{ background: 'var(--off-white)' }}>
                  {['Date', 'SI Number', 'Provider/Agency', 'Amount', 'Discount', 'Debit Account', 'Orders', 'Notes', 'Proof', 'Recorded By', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {arPayments.length === 0 && (
                  <tr><td colSpan={11} className="text-center py-8 text-xs" style={{ color: 'var(--mid-gray)' }}>
                    No {tab} payments recorded yet. Payments recorded against {tab === 'HMO' ? 'an HMO provider' : 'a Guarantee Letter agency'} appear here, newest first.
                  </td></tr>
                )}
                {arPayments.map(p => {
                  const wallet = wallets.find(w => w.id === p.walletId)
                  const proofFiles = parseProofUrls(p.proofUrl)
                  return (
                    <tr key={p.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-2">{formatDate(p.paymentDate)}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: 'var(--charcoal)' }}>{p.salesInvoiceNumber || '—'}</td>
                      <td className="px-3 py-2">{wallet?.patientName || '—'}</td>
                      <td className="px-3 py-2 font-medium" style={{ color: '#166534' }}>{formatCurrency(toNum(p.amount))}</td>
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
          </div>
        </div>
      )}

      </>}

      {/* ── Per HMO sub-tab content ── */}
      {tab === 'HMO' && hmoSubTab === 'per-hmo' && (() => {
        // Filter the main orders data
        let perHmoOrders = orders
        if (perHmoWallet) perHmoOrders = perHmoOrders.filter(o => o.payments.some(p => p.walletId === perHmoWallet))
        if (perHmoFrom) perHmoOrders = perHmoOrders.filter(o => {
          const d = new Date(o.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
          return d >= perHmoFrom
        })
        if (perHmoTo) perHmoOrders = perHmoOrders.filter(o => {
          const d = new Date(o.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
          return d <= perHmoTo
        })
        // Apply column searches
        if (perHmoColSearch.patient) {
          const q = perHmoColSearch.patient.toLowerCase()
          perHmoOrders = perHmoOrders.filter(o => (o.patientName || '').toLowerCase().includes(q))
        }
        if (perHmoColSearch.service) {
          const q = perHmoColSearch.service.toLowerCase()
          perHmoOrders = perHmoOrders.filter(o => o.items.map(i => i.name).join(', ').toLowerCase().includes(q))
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
            const cols = ['Date', 'Service', 'Patient', 'HMO', 'Amount']
            const colWidths = [28, 75, 50, 50, 35]
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
              const row = [
                formatDate(o.transactionDate),
                o.items.map(i => i.name).join(', '),
                o.patientName || '—',
                wallet?.patientName || '—',
                amtStr,
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
              return {
                Date: formatDate(o.transactionDate),
                Service: o.items.map(i => i.name).join(', '),
                Patient: o.patientName || '—',
                HMO: wallet?.patientName || '—',
                Amount: amt,
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
          <div className="space-y-4">
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
                      { label: 'HMO', field: 'hmo', searchKey: 'hmo' },
                      { label: 'Amount', field: 'amount', searchKey: 'amount' },
                      { label: 'Status', field: 'status', searchKey: 'status' },
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
                        {col.searchKey && ['service', 'patient', 'hmo'].includes(col.searchKey) && (
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
                    <tr><td colSpan={9} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>Loading...</td></tr>
                  ) : perHmoOrders.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>No transactions found</td></tr>
                  ) : perHmoOrders.map(o => {
                    const wallet = wallets.find(w => w.id === o.payments[0]?.walletId)
                    const amt = o.payments.reduce((s, p) => s + toNum(p.amount), 0)
                    const isPaid = o.arPaymentItems.length > 0
                    const isEditingDate = changeDateEditId === o.id
                    const isBusyDate = changeDateBusy === o.id
                    return (
                      <tr key={o.id} className="border-t hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)' }}>
                        {/* Original transaction date */}
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{formatDate(o.transactionDate)}</td>
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
        />
      )}

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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-lg mb-8 relative">
            <button onClick={() => setShowPaymentModal(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>
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
                  <div className="rounded-xl border max-h-48 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                    {wallets.map(w => (
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
                // When editing, show all orders for this wallet (paid or unpaid); when creating, show only unpaid
                const selectedIds: string[] = payWalletId ? [payWalletId] : []
                const eligibleOrders = editingPaymentId
                  ? orders.filter(o => o.payments.some(p => selectedIds.includes(p.walletId || '')))
                  : unpaidOrders.filter(o => o.payments.some(p => selectedIds.includes(p.walletId || '')))
                return eligibleOrders.length > 0 ? (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Tag Transactions Included</label>
                  <div className="rounded-xl border max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                    {eligibleOrders.map(o => {
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
                </div>
                ) : null
              })()}

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
      )}
    </div>
  )
}
