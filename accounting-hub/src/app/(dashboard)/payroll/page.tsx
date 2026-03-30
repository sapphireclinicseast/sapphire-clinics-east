'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  BadgeDollarSign, Users, Settings, FileText, Plus, Pencil, Save,
  ChevronUp, ChevronDown, ArrowUpDown, Search, X, AlertCircle,
  RefreshCw, Loader2, ChevronRight, Download, Mail, Trash2,
  PlusCircle, CheckCircle2, ToggleLeft, ToggleRight, Receipt,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const toNum = (v: unknown) => Number(v) || 0

// PDF-safe currency formatter — jsPDF's Helvetica cannot render ₱, so we use "PHP"
function fmtPHP(n: number): string {
  const abs = Math.abs(n)
  const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (n < 0 ? '-PHP ' : 'PHP ') + formatted
}

/* ═══════════════════════════════════════════════════════════════
   INTERFACES
   ═══════════════════════════════════════════════════════════════ */
interface Consultant {
  id: string
  externalStaffId?: string | null
  name: string
  department: string
  branch: string
  taxDeduction: string
  monthlyRetainer: number | string
  isActive: boolean
  unitPayRates: { id: string; unitPayId: string; unitPay: { id: string; name: string }; amount: number | string }[]
}

interface UnitPayType {
  id: string
  name: string
  departments: string[]
  isActive: boolean
  _count?: { consultantRates: number; services: number }
  expenseAccount?: { id: string; accountNumber: string; accountTitle: string } | null
}

interface PayrollPreview {
  consultantId: string
  consultantName: string
  department: string
  branch: string
  taxDeduction: string
  items: { unitPayId: string; unitPayName: string; unitAmount: number; quantity: number; lineTotal: number }[]
  unitPayTotal: number
  retainerAmount: number
  grossPay: number
  taxAmount: number
  netPay: number
  orderCount: number
  existingStatus: string | null
}

interface ExtraUnitPayLine {
  id: string
  unitPayId: string
  unitPayName: string
  unitAmount: number
  qty: number
}

interface AdjustmentLine {
  id: string
  name: string
  amount: number
  isAddition: boolean  // true = +, false = deduction
  isTaxed: boolean
  remarks: string
}

interface PayrollSettings {
  c1StartDay: number        // Day of month for 1st cutoff start
  c1StartPrevMonth: boolean // true = start day is in the previous month
  c1EndDay: number          // Day of month for 1st cutoff end
  c2StartDay: number        // Day of month for 2nd cutoff start
  c2EndLastDay: boolean     // true = use last day of month
  c2EndDay: number          // Day for 2nd cutoff end (when c2EndLastDay is false)
}

interface TaxPayableEntry {
  payrollEntryId: string
  consultantId: string
  consultantName: string
  department: string
  branch: string
  cutoffPeriod: string
  grossPay: number
  taxAmount: number
  netPay: number
  taxRemitted: boolean
  status: string
  paymentDate: string | null
}

interface TaxPaymentRecord {
  id: string
  paymentDate: string
  totalAmount: number
  fromAccount: { id: string; accountNumber: string; accountTitle: string }
  proofUrl: string | null
  notes: string | null
  paymentType: string
  entryCount: number
  createdAt: string
}

interface AccountBrief {
  id: string
  accountNumber: string
  accountTitle: string
  accountType: string
}

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const DEPARTMENTS = [
  { value: '', label: 'All Departments' },
  { value: 'PT', label: 'Physical Therapy' },
  { value: 'OT', label: 'Occupational Therapy' },
  { value: 'SLP', label: 'Speech-Language Pathology' },
  { value: 'SPED', label: 'Special Education' },
  { value: 'MD', label: 'Medical Doctor' },
  { value: 'PSYCHOLOGY', label: 'Psychology' },
  { value: 'ORTHOSIS', label: 'Orthosis & Prosthesis' },
]

const DEPT_LABELS: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.filter(d => d.value).map(d => [d.value, d.label])
)

const POSITION_LABELS: Record<string, string> = {
  PT: 'Physical Therapist',
  OT: 'Occupational Therapist',
  SLP: 'Speech-Language Pathologist',
  SPED: 'Special Education Teacher',
  MD: 'Medical Doctor',
  PSYCHOLOGY: 'Psychologist',
  ORTHOSIS: 'Orthotist & Prosthetist',
}

const BRANCH_INFO: Record<string, { name: string; address: string; phone: string; tin: string }> = {
  SBEA: {
    name: 'Sandbox Clinic – East Branch',
    address: '4th Floor Robinsons Metro East, Marcos Highway, Dela Paz, Pasig City',
    phone: '0917 770 1686 | (02) 8529 1590',
    tin: 'TIN 010-817-642-00000',
  },
  SBGH: {
    name: 'Sandbox Clinic – Greenhills Branch',
    address: 'GHT1-08L GH Tower Offices, South Drive, Ortigas Ave., Greenhills, San Juan City',
    phone: '0917 770 1686 | (02) 8529 1590',
    tin: 'TIN 010-817-642-00001',
  },
  VERDANA_STORE: {
    name: 'Verdana Store',
    address: 'Metro Manila, Philippines',
    phone: '',
    tin: '',
  },
  '': {
    name: 'Sandbox Clinic',
    address: 'Metro Manila, Philippines',
    phone: '0917 770 1686 | (02) 8529 1590',
    tin: '',
  },
}

const BRANCHES = [
  { value: '', label: 'All Branches' },
  { value: 'SBEA', label: 'Sandbox East' },
  { value: 'SBGH', label: 'Sandbox Greenhills' },
]

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const DEFAULT_SETTINGS: PayrollSettings = {
  c1StartDay: 1, c1StartPrevMonth: false, c1EndDay: 15,
  c2StartDay: 16, c2EndLastDay: true, c2EndDay: 31,
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS (outside component to avoid re-creation)
   ═══════════════════════════════════════════════════════════════ */
function getCutoffLabel(period: string) {
  const [y, m, h] = period.split('-')
  return `${MONTHS[parseInt(m) - 1]} ${y} — ${h === '1' ? '1st Half (1–15)' : '2nd Half (16–End)'}`
}

function uid() { return Math.random().toString(36).slice(2, 10) }

function computeCustomDates(s: PayrollSettings, year: number, month: number, half: number): { start: Date; end: Date } {
  const pad = (n: number) => String(n).padStart(2, '0')
  if (half === 1) {
    const sm = s.c1StartPrevMonth ? (month === 1 ? 12 : month - 1) : month
    const sy = s.c1StartPrevMonth && month === 1 ? year - 1 : year
    return {
      start: new Date(`${sy}-${pad(sm)}-${pad(s.c1StartDay)}T00:00:00+08:00`),
      end: new Date(`${year}-${pad(month)}-${pad(s.c1EndDay)}T23:59:59.999+08:00`),
    }
  } else {
    const endDay = s.c2EndLastDay ? new Date(year, month, 0).getDate() : s.c2EndDay
    return {
      start: new Date(`${year}-${pad(month)}-${pad(s.c2StartDay)}T00:00:00+08:00`),
      end: new Date(`${year}-${pad(month)}-${pad(endDay)}T23:59:59.999+08:00`),
    }
  }
}

function getCustomCutoffLabel(s: PayrollSettings, year: number, month: number, half: number): string {
  const { start, end } = computeCustomDates(s, year, month, half)
  const fmt = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt(start)} \u2013 ${fmt(end)}`
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function computeTotals(p: PayrollPreview, extras: ExtraUnitPayLine[], adjs: AdjustmentLine[]) {
  const extraTotal = extras.reduce((s, e) => s + e.unitAmount * e.qty, 0)
  const totalUnitPay = p.unitPayTotal + extraTotal
  const retainer = p.retainerAmount
  const taxedAdj = adjs.filter(a => a.isTaxed).reduce((s, a) => s + (a.isAddition ? a.amount : -a.amount), 0)
  const nonTaxedAdj = adjs.filter(a => !a.isTaxed).reduce((s, a) => s + (a.isAddition ? a.amount : -a.amount), 0)
  const taxableBase = totalUnitPay + retainer + taxedAdj
  const tax = p.taxDeduction === 'FIVE_PERCENT' ? Math.max(0, taxableBase) * 0.05 : 0
  const gross = taxableBase + nonTaxedAdj
  const net = gross - tax
  return { totalUnitPay, extraTotal, taxedAdj, nonTaxedAdj, taxableBase, tax, gross, net }
}

/* ═══════════════════════════════════════════════════════════════
   PDF GENERATION (async — called only in browser)
   Template brand: Orange #FF9300, Net Pay green #E2EFD9
   Layout matches the Sandbox Clinic Word payslip template.
   ═══════════════════════════════════════════════════════════════ */
async function buildPayslipPdf(
  p: PayrollPreview,
  extras: ExtraUnitPayLine[],
  adjs: AdjustmentLine[],
  cutoffPeriod: string,
  dateRange?: { start: string; end: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const totals = computeTotals(p, extras, adjs)
  const branchInfo = BRANCH_INFO[p.branch] || BRANCH_INFO['']
  const position = POSITION_LABELS[p.department] || p.department
  const deptLabel = DEPT_LABELS[p.department] || p.department
  const cutoffLabel = getCutoffLabel(cutoffPeriod)

  // Brand colors
  const ORANGE: [number, number, number] = [255, 147, 0]   // #FF9300
  const NET_GREEN: [number, number, number] = [226, 239, 217] // #E2EFD9
  const WHITE: [number, number, number] = [255, 255, 255]
  const DARK: [number, number, number] = [30, 30, 30]
  const MID: [number, number, number] = [80, 80, 80]
  const LIGHT_BORDER: [number, number, number] = [210, 210, 210]

  // Build covered-dates label for the payslip
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
  const coveredDates = dateRange ? `${fmtDate(dateRange.start)} \u2013 ${fmtDate(dateRange.end)}` : null

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 25.4   // 1 inch — matches template page margins
  const contentW = pageW - margin * 2
  let y = margin

  /* ══ HEADER: Logo centered — height computed from natural aspect ratio ══ */
  const logoW = 56.7
  let logoH = 14 // default fallback height; overridden below from image dimensions
  const logoX = (pageW - logoW) / 2
  try {
    const logoB64 = await fetchImageAsBase64('/brand/sandbox-clinic-logo.png')
    // Preserve natural aspect ratio — never stretch the logo
    const props = doc.getImageProperties(logoB64)
    logoH = (props.height / props.width) * logoW
    doc.addImage(logoB64, 'PNG', logoX, y, logoW, logoH)
  } catch {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...ORANGE)
    doc.text('SANDBOX CLINIC', pageW / 2, y + 8, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MID)
    doc.text('Multi-Specialty Clinic and Rehabilitation Center', pageW / 2, y + 13, { align: 'center' })
  }
  y += logoH + 5

  /* ══ Branch info — left-aligned below logo ══ */
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text(branchInfo.name, margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MID)
  const addrLines = doc.splitTextToSize(branchInfo.address, contentW)
  addrLines.forEach((line: string) => { doc.text(line, margin, y); y += 4.5 })
  if (branchInfo.phone) { doc.text(branchInfo.phone, margin, y); y += 4.5 }
  if (branchInfo.tin)   { doc.text(branchInfo.tin, margin, y);   y += 4.5 }
  y += 4

  /* ══ PAYSLIP title — centered, bold 16pt ══ */
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text('PAYSLIP', pageW / 2, y, { align: 'center' })
  y += 8

  /* ══ CLINICIAN DETAILS — two-column label/value rows ══ */
  const details: [string, string][] = [
    ['Name', p.consultantName],
    ['Position', position],
    ['Department', deptLabel],
    ['Branch', branchInfo.name],
    ['Cutoff Period', cutoffLabel],
    ...(coveredDates ? [['Covered Dates', coveredDates] as [string, string]] : []),
  ]
  const labelColW = 42
  for (const [label, value] of details) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...MID)
    doc.text(`${label}:`, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK)
    doc.text(value, margin + labelColW, y)
    y += 6
  }
  y += 4

  /* ══ TABLE STYLE HELPERS ══ */
  const tableHeadStyles = {
    fillColor: ORANGE,
    textColor: WHITE,
    fontStyle: 'bold' as const,
    fontSize: 9,
    lineColor: ORANGE,
    lineWidth: 0,
  }
  const tableBodyStyles = {
    fontSize: 9,
    textColor: DARK,
    lineColor: LIGHT_BORDER,
    lineWidth: 0.3,
  }

  /* ══ EARNINGS TABLE ══
     Columns: Description | Quantity | Rate | Total             */
  const earningsBody: string[][] = []
  for (const item of p.items) {
    earningsBody.push([item.unitPayName, String(item.quantity), fmtPHP(item.unitAmount), fmtPHP(item.lineTotal)])
  }
  for (const e of extras) {
    earningsBody.push([`${e.unitPayName} (added)`, String(e.qty), fmtPHP(e.unitAmount), fmtPHP(e.unitAmount * e.qty)])
  }
  if (p.retainerAmount > 0) {
    earningsBody.push(['Monthly Retainer (\u00bd cutoff)', '\u2014', '\u2014', fmtPHP(p.retainerAmount)])
  }

  // Section label
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text('EARNINGS', margin, y)
  y += 2

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Quantity', 'Rate', 'Total']],
    body: earningsBody,
    theme: 'grid',
    headStyles: tableHeadStyles,
    bodyStyles: tableBodyStyles,
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'center', cellWidth: 22 },
      2: { halign: 'right', cellWidth: 36 },
      3: { halign: 'right', cellWidth: 36 },
    },
    margin: { left: margin, right: margin },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y
  y += 8

  /* ══ ADJUSTMENTS TABLE ══
     Columns: Description | Amount | Remarks                    */
  if (adjs.length > 0) {
    const adjBody = adjs.map(a => [
      a.name,
      (a.isAddition ? '+ ' : '- ') + fmtPHP(a.amount),
      a.remarks || '\u2014',
    ])

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text('ADJUSTMENTS', margin, y)
    y += 2

    autoTable(doc, {
      startY: y,
      head: [['Description', 'Amount', 'Remarks']],
      body: adjBody,
      theme: 'grid',
      headStyles: tableHeadStyles,
      bodyStyles: tableBodyStyles,
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 38 },
        2: { cellWidth: 45 },
      },
      margin: { left: margin, right: margin },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable?.finalY ?? y
    y += 8
  }

  /* ══ SUMMARY TABLE ══
     Plain 2-column (Label | Value), Net Pay row in green       */
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text('SUMMARY', margin, y)
  y += 2

  type SummaryRow = { label: string; value: string; netPay?: boolean; bold?: boolean; red?: boolean }
  const summaryRows: SummaryRow[] = [
    { label: 'Unit Pay Total', value: fmtPHP(totals.totalUnitPay) },
    ...(p.retainerAmount > 0 ? [{ label: 'Retainer (\u00bd cutoff)', value: fmtPHP(p.retainerAmount) }] : []),
    ...(adjs.length > 0 ? [{
      label: 'Adjustments (net)',
      value: (totals.taxedAdj + totals.nonTaxedAdj >= 0 ? '+ ' : '- ') + fmtPHP(Math.abs(totals.taxedAdj + totals.nonTaxedAdj)),
    }] : []),
    { label: 'Gross Pay', value: fmtPHP(totals.gross), bold: true },
    ...(totals.tax > 0 ? [{ label: 'Tax Deduction (5%)', value: '(' + fmtPHP(totals.tax) + ')', red: true }] : []),
    { label: 'NET PAY', value: fmtPHP(totals.net), bold: true, netPay: true },
  ]

  autoTable(doc, {
    startY: y,
    head: undefined,
    body: summaryRows.map(r => [r.label, r.value]),
    theme: 'grid',
    bodyStyles: tableBodyStyles,
    columnStyles: {
      0: { cellWidth: 'auto', fontStyle: 'normal' },
      1: { halign: 'right', cellWidth: 50 },
    },
    margin: { left: margin, right: margin },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      const row = summaryRows[data.row.index]
      if (!row) return
      if (row.netPay) {
        data.cell.styles.fillColor = NET_GREEN
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 10
        data.cell.styles.textColor = [30, 30, 30]
      } else if (row.bold) {
        data.cell.styles.fontStyle = 'bold'
      } else if (row.red) {
        data.cell.styles.textColor = [160, 30, 30]
      }
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y

  /* ══ FOOTER ══ */
  y += 10
  doc.setDrawColor(...LIGHT_BORDER)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageW - margin, y)
  y += 6
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(160, 160, 160)
  doc.text('This payslip is computer-generated and does not require a signature.', pageW / 2, y, { align: 'center' })
  doc.text(
    `Generated: ${new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' })}`,
    pageW / 2, y + 5, { align: 'center' }
  )

  return doc
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function PayrollPage() {
  const { data: session } = useSession()
  const canWrite = session?.user?.role && ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN'].includes(session.user.role as string)

  const now = new Date()
  const [branch, setBranch] = useState('')
  const [cutoffMonth, setCutoffMonth] = useState(now.getMonth() + 1)
  const [cutoffYear, setCutoffYear] = useState(now.getFullYear())
  const [cutoffHalf, setCutoffHalf] = useState(now.getDate() <= 15 ? 1 : 2)
  const cutoffPeriod = `${cutoffYear}-${String(cutoffMonth).padStart(2, '0')}-${cutoffHalf}`

  const [mainTab, setMainTab] = useState<'consultants' | 'employees' | 'tax-payable'>('consultants')
  const [subTab, setSubTab] = useState<'list' | 'unit-pay' | 'payslips'>('list')

  /* ── Core data ── */
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [unitPays, setUnitPays] = useState<UnitPayType[]>([])
  const [payrollPreviews, setPayrollPreviews] = useState<PayrollPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  /* ── Clinician list ── */
  const [cSearch, setCSearch] = useState('')
  const [cDeptFilter, setCDeptFilter] = useState('')
  const [cSortField, setCSortField] = useState('name')
  const [cSortDir, setCSortDir] = useState<'asc' | 'desc'>('asc')
  const [expandedConsultant, setExpandedConsultant] = useState<string | null>(null)
  const [editingRates, setEditingRates] = useState<Record<string, number>>({})
  const [editingTax, setEditingTax] = useState('')
  const [editingRetainer, setEditingRetainer] = useState('')
  const [savingConsultant, setSavingConsultant] = useState(false)

  /* ── Unit Pay form ── */
  const [showUnitPayForm, setShowUnitPayForm] = useState(false)
  const [editingUnitPay, setEditingUnitPay] = useState<UnitPayType | null>(null)
  const [upName, setUpName] = useState('')
  const [upDepts, setUpDepts] = useState<string[]>([])
  const [savingUP, setSavingUP] = useState(false)

  /* ── Payslip generation — base ── */
  const [genDept, setGenDept] = useState('')
  const [genConsultantId, setGenConsultantId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  /* ── Payslip generation — per-consultant extras ── */
  const [extraUnitPays, setExtraUnitPays] = useState<Record<string, ExtraUnitPayLine[]>>({})
  const [adjustments, setAdjustments] = useState<Record<string, AdjustmentLine[]>>({})

  // Per-card UI state for adding
  const [showUpAdd, setShowUpAdd] = useState<Record<string, boolean>>({})
  const [upAddSel, setUpAddSel] = useState<Record<string, string>>({})   // unitPayId
  const [upAddQty, setUpAddQty] = useState<Record<string, number>>({})   // qty
  const [upAddSearch, setUpAddSearch] = useState<Record<string, string>>({})

  const [showAdjAdd, setShowAdjAdd] = useState<Record<string, boolean>>({})
  const [adjName, setAdjName] = useState<Record<string, string>>({})
  const [adjAmount, setAdjAmount] = useState<Record<string, string>>({})
  const [adjIsAdd, setAdjIsAdd] = useState<Record<string, boolean>>({})  // true = addition
  const [adjIsTaxed, setAdjIsTaxed] = useState<Record<string, boolean>>({})
  const [adjRemarks, setAdjRemarks] = useState<Record<string, string>>({})

  /* ── Email / PDF ── */
  const [sendingEmailFor, setSendingEmailFor] = useState<string | null>(null)
  const [emailStatus, setEmailStatus] = useState<Record<string, 'success' | 'error'>>({})
  const [emailMsg, setEmailMsg] = useState<Record<string, string>>({})
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [generatedDateRange, setGeneratedDateRange] = useState<{ start: string; end: string } | null>(null)

  /* ── Payroll Settings ── */
  const [showSettings, setShowSettings] = useState(false)
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(DEFAULT_SETTINGS)
  const [editSettings, setEditSettings] = useState<PayrollSettings>(DEFAULT_SETTINGS)

  // Tax Payable tab state
  const [taxPayableEntries, setTaxPayableEntries] = useState<TaxPayableEntry[]>([])
  const [taxPayments, setTaxPayments] = useState<TaxPaymentRecord[]>([])
  const [taxFilter, setTaxFilter] = useState<'CONSULTANT' | 'EMPLOYEE'>('CONSULTANT')
  const [loadingTax, setLoadingTax] = useState(false)
  const [selectedTaxIds, setSelectedTaxIds] = useState<string[]>([])
  const [showRemitted, setShowRemitted] = useState(false)

  // Tax settings
  const [showTaxSettings, setShowTaxSettings] = useState(false)
  const [taxLiabilityAccount, setTaxLiabilityAccount] = useState<AccountBrief | null>(null)
  const [editTaxLiabilityId, setEditTaxLiabilityId] = useState('')
  const [taxSettingsSearch, setTaxSettingsSearch] = useState('')
  const [savingTaxSettings, setSavingTaxSettings] = useState(false)

  // Tax payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentFromAccountId, setPaymentFromAccountId] = useState('')
  const [paymentFromSearch, setPaymentFromSearch] = useState('')
  const [paymentProofUrl, setPaymentProofUrl] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [paymentUploadFile, setPaymentUploadFile] = useState<File | null>(null)
  const [uploadingProof, setUploadingProof] = useState(false)

  // Accounts for dropdowns
  const [allAccounts, setAllAccounts] = useState<AccountBrief[]>([])

  // Unit pay expense account editing
  const [upExpenseSearch, setUpExpenseSearch] = useState('')
  const [upExpenseAccountId, setUpExpenseAccountId] = useState('')

  /* ── Data fetching ── */
  const fetchConsultants = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)
      const res = await fetch(`/api/payroll/consultants?${params}`)
      setConsultants(await res.json())
    } catch { setConsultants([]) }
  }, [branch])

  const fetchUnitPays = useCallback(async () => {
    try {
      const res = await fetch('/api/payroll/unit-pay')
      setUnitPays(await res.json())
    } catch { setUnitPays([]) }
  }, [])

  const fetchAllAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/chart-of-accounts?limit=500')
      const data = await res.json()
      setAllAccounts(data.accounts || data || [])
    } catch { setAllAccounts([]) }
  }, [])

  const fetchTaxPayable = useCallback(async () => {
    setLoadingTax(true)
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)
      const res = await fetch(`/api/payroll/tax-payable?${params}`)
      setTaxPayableEntries(await res.json())
    } catch { setTaxPayableEntries([]) }
    finally { setLoadingTax(false) }
  }, [branch])

  const fetchTaxPayments = useCallback(async () => {
    try {
      const res = await fetch(`/api/payroll/tax-payments?paymentType=${taxFilter}`)
      setTaxPayments(await res.json())
    } catch { setTaxPayments([]) }
  }, [taxFilter])

  const fetchTaxSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/payroll/tax-settings')
      const data = await res.json()
      if (data.liabilityAccount) setTaxLiabilityAccount(data.liabilityAccount)
    } catch {}
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchConsultants(), fetchUnitPays()]).finally(() => setLoading(false))
  }, [fetchConsultants, fetchUnitPays])

  // Load payroll settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('payrollSettings')
      if (saved) {
        const parsed = JSON.parse(saved)
        setPayrollSettings({ ...DEFAULT_SETTINGS, ...parsed })
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (mainTab === 'tax-payable') {
      fetchTaxPayable()
      fetchTaxPayments()
      fetchTaxSettings()
    }
  }, [mainTab, fetchTaxPayable, fetchTaxPayments, fetchTaxSettings])

  useEffect(() => {
    fetchAllAccounts()
  }, [fetchAllAccounts])

  /* ── Sync ── */
  const syncConsultants = async () => {
    setSyncing(true)
    try {
      const params = new URLSearchParams({ sync: 'true' })
      if (branch) params.set('branch', branch)
      await fetch(`/api/payroll/consultants?${params}`)
      await fetchConsultants()
    } catch {}
    finally { setSyncing(false) }
  }

  /* ── Clinician list helpers ── */
  const filteredConsultants = consultants
    .filter(c => !cSearch || c.name.toLowerCase().includes(cSearch.toLowerCase()))
    .filter(c => !cDeptFilter || c.department === cDeptFilter)
    .sort((a, b) => {
      const av = cSortField === 'name' ? a.name : a.department
      const bv = cSortField === 'name' ? b.name : b.department
      return cSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })

  function toggleCSort(field: string) {
    if (cSortField === field) setCSortDir(p => p === 'asc' ? 'desc' : 'asc')
    else { setCSortField(field); setCSortDir('asc') }
  }

  function CSortIcon({ field }: { field: string }) {
    if (cSortField !== field) return <ArrowUpDown size={12} className="opacity-30" />
    return cSortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  const expandConsultant = (c: Consultant) => {
    if (expandedConsultant === c.id) { setExpandedConsultant(null); return }
    setExpandedConsultant(c.id)
    const rateMap: Record<string, number> = {}
    for (const r of c.unitPayRates) rateMap[r.unitPayId] = toNum(r.amount)
    setEditingRates(rateMap)
    setEditingTax(c.taxDeduction)
    setEditingRetainer(String(toNum(c.monthlyRetainer)))
  }

  const saveConsultantConfig = async (c: Consultant) => {
    setSavingConsultant(true)
    try {
      const unitPayRates = Object.entries(editingRates)
        .filter(([, amt]) => amt > 0)
        .map(([unitPayId, amount]) => ({ unitPayId, amount }))
      await fetch('/api/payroll/consultants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, taxDeduction: editingTax, monthlyRetainer: parseFloat(editingRetainer) || 0, unitPayRates }),
      })
      await fetchConsultants()
    } catch { setError('Failed to save') }
    finally { setSavingConsultant(false) }
  }

  /* ── Unit Pay CRUD ── */
  const openUPCreate = () => { setEditingUnitPay(null); setUpName(''); setUpDepts([]); setUpExpenseAccountId(''); setUpExpenseSearch(''); setShowUnitPayForm(true); setError('') }
  const openUPEdit = (up: UnitPayType) => { setEditingUnitPay(up); setUpName(up.name); setUpDepts(up.departments || []); setUpExpenseAccountId(up.expenseAccount?.id || ''); setUpExpenseSearch(up.expenseAccount ? `${up.expenseAccount.accountNumber} — ${up.expenseAccount.accountTitle}` : ''); setShowUnitPayForm(true); setError('') }
  const saveUnitPay = async () => {
    if (!upName.trim()) { setError('Name required'); return }
    setSavingUP(true); setError('')
    try {
      const body = { name: upName, departments: upDepts, expenseAccountId: upExpenseAccountId || null, ...(editingUnitPay ? { id: editingUnitPay.id } : {}) }
      await fetch('/api/payroll/unit-pay', { method: editingUnitPay ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setShowUnitPayForm(false)
      fetchUnitPays()
    } catch { setError('Failed to save') }
    finally { setSavingUP(false) }
  }

  /* ── Payroll settings handlers ── */
  const openSettings = () => { setEditSettings({ ...payrollSettings }); setShowSettings(true) }
  const saveSettings = () => {
    setPayrollSettings(editSettings)
    localStorage.setItem('payrollSettings', JSON.stringify(editSettings))
    setShowSettings(false)
  }

  /* ── Tax handlers ── */
  const saveTaxSettings = async () => {
    setSavingTaxSettings(true)
    try {
      const res = await fetch('/api/payroll/tax-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liabilityAccountId: editTaxLiabilityId || null }),
      })
      const data = await res.json()
      if (data.liabilityAccount) setTaxLiabilityAccount(data.liabilityAccount)
      setShowTaxSettings(false)
    } catch { setError('Failed to save settings') }
    finally { setSavingTaxSettings(false) }
  }

  const recordTaxPayment = async () => {
    if (!selectedTaxIds.length || !paymentFromAccountId || !paymentDate) return
    setRecordingPayment(true)
    try {
      let proofFinalUrl = paymentProofUrl
      if (paymentUploadFile) {
        setUploadingProof(true)
        const fd = new FormData()
        fd.append('file', paymentUploadFile)
        const upRes = await fetch('/api/upload', { method: 'POST', body: fd })
        const upData = await upRes.json()
        proofFinalUrl = upData.url || upData.fileUrl || ''
        setUploadingProof(false)
      }

      await fetch('/api/payroll/tax-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payrollEntryIds: selectedTaxIds,
          paymentDate,
          fromAccountId: paymentFromAccountId,
          proofUrl: proofFinalUrl || null,
          notes: paymentNotes || null,
          paymentType: taxFilter,
        }),
      })

      setShowPaymentModal(false)
      setSelectedTaxIds([])
      setPaymentFromAccountId('')
      setPaymentFromSearch('')
      setPaymentProofUrl('')
      setPaymentNotes('')
      setPaymentUploadFile(null)
      setPaymentDate(new Date().toISOString().slice(0, 10))
      await fetchTaxPayable()
      await fetchTaxPayments()
    } catch { setError('Failed to record payment') }
    finally { setRecordingPayment(false) }
  }

  /* ── Payslip generation ── */
  const generatePayslips = async () => {
    setGenerating(true); setError('')
    try {
      const customDates = computeCustomDates(payrollSettings, cutoffYear, cutoffMonth, cutoffHalf)
      const params = new URLSearchParams({ cutoffPeriod })
      params.set('dateFrom', customDates.start.toISOString())
      params.set('dateTo', customDates.end.toISOString())
      if (branch) params.set('branch', branch)
      if (genDept) params.set('department', genDept)
      if (genConsultantId) params.set('consultantId', genConsultantId)
      const res = await fetch(`/api/payroll/generate?${params}`)
      const data = await res.json()
      setPayrollPreviews(data.payrolls || [])
      setGeneratedDateRange({ start: customDates.start.toISOString(), end: customDates.end.toISOString() })
      // Reset per-consultant extras when regenerating
      setExtraUnitPays({})
      setAdjustments({})
    } catch { setError('Failed to generate') }
    finally { setGenerating(false) }
  }

  const savePayslips = async () => {
    setSaving(true)
    try {
      const entries = payrollPreviews.filter(p => p.grossPay > 0).map(p => {
        const extras = extraUnitPays[p.consultantId] || []
        const adjs = adjustments[p.consultantId] || []
        const t = computeTotals(p, extras, adjs)
        return {
          consultantId: p.consultantId, branch: p.branch,
          items: [...p.items, ...extras.map(e => ({ unitPayId: e.unitPayId, unitPayName: e.unitPayName, unitAmount: e.unitAmount, quantity: e.qty, lineTotal: e.unitAmount * e.qty }))],
          adjustments: adjs,
          grossPay: t.gross, retainerAmount: p.retainerAmount, taxAmount: t.tax, netPay: t.net, status: 'DRAFT',
        }
      })
      await fetch('/api/payroll/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cutoffPeriod, branch, entries }) })
      await generatePayslips()
    } catch { setError('Failed to save') }
    finally { setSaving(false) }
  }

  /* ── Extra Unit Pay handlers ── */
  const addExtraUP = (cid: string) => {
    const selId = upAddSel[cid]
    if (!selId) return
    const up = unitPays.find(u => u.id === selId)
    if (!up) return
    const consultant = consultants.find(c => c.id === cid)
    const rate = consultant?.unitPayRates.find(r => r.unitPayId === selId)
    const unitAmount = rate ? toNum(rate.amount) : 0
    const qty = upAddQty[cid] || 1
    setExtraUnitPays(prev => ({ ...prev, [cid]: [...(prev[cid] || []), { id: uid(), unitPayId: up.id, unitPayName: up.name, unitAmount, qty }] }))
    setUpAddSel(prev => ({ ...prev, [cid]: '' }))
    setUpAddQty(prev => ({ ...prev, [cid]: 1 }))
    setUpAddSearch(prev => ({ ...prev, [cid]: '' }))
    setShowUpAdd(prev => ({ ...prev, [cid]: false }))
  }

  const updateExtraQty = (cid: string, lid: string, qty: number) => {
    setExtraUnitPays(prev => ({ ...prev, [cid]: (prev[cid] || []).map(l => l.id === lid ? { ...l, qty } : l) }))
  }

  const removeExtraUP = (cid: string, lid: string) => {
    setExtraUnitPays(prev => ({ ...prev, [cid]: (prev[cid] || []).filter(l => l.id !== lid) }))
  }

  /* ── Adjustment handlers ── */
  const addAdjustment = (cid: string) => {
    const name = adjName[cid]?.trim()
    const amount = parseFloat(adjAmount[cid] || '0')
    if (!name || !amount) return
    setAdjustments(prev => ({
      ...prev, [cid]: [...(prev[cid] || []), {
        id: uid(), name, amount: Math.abs(amount),
        isAddition: adjIsAdd[cid] !== false,
        isTaxed: adjIsTaxed[cid] === true,
        remarks: adjRemarks[cid] || '',
      }],
    }))
    setAdjName(prev => ({ ...prev, [cid]: '' }))
    setAdjAmount(prev => ({ ...prev, [cid]: '' }))
    setAdjRemarks(prev => ({ ...prev, [cid]: '' }))
    setAdjIsAdd(prev => ({ ...prev, [cid]: true }))
    setAdjIsTaxed(prev => ({ ...prev, [cid]: false }))
    setShowAdjAdd(prev => ({ ...prev, [cid]: false }))
  }

  const removeAdjustment = (cid: string, aid: string) => {
    setAdjustments(prev => ({ ...prev, [cid]: (prev[cid] || []).filter(a => a.id !== aid) }))
  }

  /* ── PDF + Email ── */
  const downloadPdf = async (p: PayrollPreview) => {
    const extras = extraUnitPays[p.consultantId] || []
    const adjs = adjustments[p.consultantId] || []
    const doc = await buildPayslipPdf(p, extras, adjs, cutoffPeriod, generatedDateRange ?? undefined)
    const safeName = p.consultantName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
    doc.save(`payslip-${safeName}-${cutoffPeriod}.pdf`)
  }

  const downloadAllPdfs = async () => {
    const active = payrollPreviews.filter(p => p.grossPay > 0 || p.orderCount > 0)
    setDownloadingAll(true)
    for (const p of active) {
      try { await downloadPdf(p); await new Promise(r => setTimeout(r, 600)) }
      catch (e) { console.error('PDF error for', p.consultantName, e) }
    }
    setDownloadingAll(false)
  }

  const emailClinician = async (p: PayrollPreview) => {
    setSendingEmailFor(p.consultantId)
    setEmailStatus(prev => { const n = { ...prev }; delete n[p.consultantId]; return n })
    setEmailMsg(prev => { const n = { ...prev }; delete n[p.consultantId]; return n })

    try {
      // Look up email from marketing hub
      const consultant = consultants.find(c => c.id === p.consultantId)
      const emailRes = await fetch(
        `/api/payroll/staff-email?externalStaffId=${encodeURIComponent(consultant?.externalStaffId || '')}&name=${encodeURIComponent(p.consultantName)}`
      )
      if (!emailRes.ok) {
        const d = await emailRes.json()
        throw new Error(d.error || 'Could not find clinician email')
      }
      const { email, firstName } = await emailRes.json()

      // Generate PDF
      const extras = extraUnitPays[p.consultantId] || []
      const adjs = adjustments[p.consultantId] || []
      const doc = await buildPayslipPdf(p, extras, adjs, cutoffPeriod, generatedDateRange ?? undefined)
      const pdfBase64 = doc.output('datauristring')
      const totals = computeTotals(p, extras, adjs)

      // Send
      const sendRes = await fetch('/api/payroll/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultantName: p.consultantName,
          firstName,
          branch: BRANCH_INFO[p.branch]?.name || p.branch,
          cutoffPeriod,
          netPay: formatCurrency(totals.net),
          email,
          pdfBase64,
        }),
      })
      if (!sendRes.ok) {
        const d = await sendRes.json()
        throw new Error(d.error || 'Email failed to send')
      }
      setEmailStatus(prev => ({ ...prev, [p.consultantId]: 'success' }))
      setEmailMsg(prev => ({ ...prev, [p.consultantId]: `Sent to ${email}` }))
    } catch (e) {
      setEmailStatus(prev => ({ ...prev, [p.consultantId]: 'error' }))
      setEmailMsg(prev => ({ ...prev, [p.consultantId]: String(e) }))
    } finally {
      setSendingEmailFor(null)
    }
  }

  if (!session?.user) return null

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <BadgeDollarSign size={28} style={{ color: 'var(--teal)' }} /> Payroll
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>Consultant and employee compensation management</p>
        </div>
        <button onClick={openSettings}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-medium mt-1 shrink-0"
          style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
          <Settings size={15} /> Payroll Settings
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch</label>
          <select value={branch} onChange={e => setBranch(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Month</label>
          <select value={cutoffMonth} onChange={e => setCutoffMonth(parseInt(e.target.value))}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Year</label>
          <select value={cutoffYear} onChange={e => setCutoffYear(parseInt(e.target.value))}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Cutoff</label>
          <select value={cutoffHalf} onChange={e => setCutoffHalf(parseInt(e.target.value))}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            <option value={1}>1st Cutoff</option>
            <option value={2}>2nd Cutoff</option>
          </select>
        </div>
        <div className="flex flex-col px-3 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
          <span>{getCutoffLabel(cutoffPeriod)}</span>
          <span className="text-xs font-normal opacity-70">{getCustomCutoffLabel(payrollSettings, cutoffYear, cutoffMonth, cutoffHalf)}</span>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-2">
        {(['consultants', 'employees'] as const).map(t => (
          <button key={t} onClick={() => setMainTab(t)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors"
            style={mainTab === t ? { background: 'var(--teal)', color: 'white' } : { background: 'var(--off-white)', color: 'var(--charcoal)' }}>
            <Users size={16} /> {t}
          </button>
        ))}
        <button onClick={() => setMainTab('tax-payable')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          style={mainTab === 'tax-payable' ? { background: 'var(--teal)', color: 'white' } : { background: 'var(--off-white)', color: 'var(--charcoal)' }}>
          <Receipt size={16} /> Tax Payable
        </button>
      </div>

      {mainTab === 'employees' && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users size={36} className="mb-3 opacity-30" />
          <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Employee Payroll</p>
          <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Coming soon — employee salary and payroll management</p>
        </div>
      )}

      {mainTab === 'tax-payable' && (
        <div className="space-y-5">
          {/* Header row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              {/* Consultant / Employee filter */}
              {(['CONSULTANT', 'EMPLOYEE'] as const).map(type => (
                <button key={type} onClick={() => setTaxFilter(type)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                  style={taxFilter === type
                    ? { background: 'var(--teal)', color: 'white', borderColor: 'var(--teal)' }
                    : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                  {type === 'CONSULTANT' ? 'Consultants (BIR Form 2307)' : 'Employees (BIR Form 1601-C)'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--mid-gray)' }}>
                <input type="checkbox" checked={showRemitted} onChange={e => setShowRemitted(e.target.checked)} />
                Show already remitted
              </label>
              <button onClick={() => { setEditTaxLiabilityId(taxLiabilityAccount?.id || ''); setTaxSettingsSearch(''); setShowTaxSettings(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                <Settings size={13} /> Tax Settings
              </button>
              <button onClick={() => fetchTaxPayable()} className="p-1.5 rounded-lg hover:bg-gray-100">
                <RefreshCw size={14} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>
          </div>

          {/* Liability account info */}
          {taxLiabilityAccount && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs" style={{ background: '#fef3c7', color: '#78350f' }}>
              <AlertCircle size={13} />
              Tax payable lodged under: <strong>{taxLiabilityAccount.accountNumber} — {taxLiabilityAccount.accountTitle}</strong>
            </div>
          )}

          {/* Unremitted taxes table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>
                {showRemitted ? 'All Tax Records' : 'Unremitted Taxes Payable'}
              </p>
              {selectedTaxIds.length > 0 && (
                <button onClick={() => setShowPaymentModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ background: '#c44b00' }}>
                  <BadgeDollarSign size={14} /> Record BIR Payment ({selectedTaxIds.length})
                </button>
              )}
            </div>

            {loadingTax ? (
              <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>Loading...</p>
            ) : (() => {
              const filtered = taxPayableEntries.filter(e =>
                showRemitted ? true : !e.taxRemitted
              )
              const unremittedTotal = filtered.filter(e => !e.taxRemitted).reduce((s, e) => s + e.taxAmount, 0)
              const selectedTotal = filtered.filter(e => selectedTaxIds.includes(e.payrollEntryId)).reduce((s, e) => s + e.taxAmount, 0)
              const allUnremitted = filtered.filter(e => !e.taxRemitted)

              return (
                <div className="space-y-3">
                  <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: 'var(--off-white)' }}>
                          <th className="px-4 py-3 w-10">
                            <input type="checkbox"
                              checked={allUnremitted.length > 0 && allUnremitted.every(e => selectedTaxIds.includes(e.payrollEntryId))}
                              onChange={e => {
                                if (e.target.checked) setSelectedTaxIds(prev => [...new Set([...prev, ...allUnremitted.map(x => x.payrollEntryId)])])
                                else setSelectedTaxIds(prev => prev.filter(id => !allUnremitted.find(x => x.payrollEntryId === id)))
                              }} />
                          </th>
                          <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Consultant</th>
                          <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Cutoff Period</th>
                          <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Branch</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Gross Pay</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Tax (5%)</th>
                          <th className="text-center px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
                            {showRemitted ? 'No tax records found.' : 'No unremitted taxes — all caught up!'}
                          </td></tr>
                        ) : filtered.map(e => (
                          <tr key={e.payrollEntryId} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                            <td className="px-4 py-3">
                              {!e.taxRemitted && (
                                <input type="checkbox"
                                  checked={selectedTaxIds.includes(e.payrollEntryId)}
                                  onChange={ev => setSelectedTaxIds(prev =>
                                    ev.target.checked ? [...prev, e.payrollEntryId] : prev.filter(id => id !== e.payrollEntryId)
                                  )} />
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{e.consultantName}</p>
                              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{DEPT_LABELS[e.department] || e.department}</p>
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{getCutoffLabel(e.cutoffPeriod)}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{e.branch}</td>
                            <td className="px-4 py-3 text-right text-xs" style={{ color: 'var(--charcoal)' }}>{formatCurrency(e.grossPay)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-xs" style={{ color: '#c44b00' }}>{formatCurrency(e.taxAmount)}</td>
                            <td className="px-4 py-3 text-center">
                              {e.taxRemitted ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#dcfce7', color: '#166534' }}>
                                  <CheckCircle2 size={11} /> Remitted
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>
                                  Unremitted
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals row */}
                  {filtered.some(e => !e.taxRemitted) && (
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'var(--off-white)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>
                        Total unremitted: <span style={{ color: '#c44b00' }}>{formatCurrency(unremittedTotal)}</span>
                        {selectedTaxIds.length > 0 && <span className="ml-3">Selected: <span style={{ color: 'var(--teal)' }}>{formatCurrency(selectedTotal)}</span></span>}
                      </span>
                      {selectedTaxIds.length > 0 && (
                        <button onClick={() => setShowPaymentModal(true)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                          style={{ background: '#c44b00' }}>
                          <BadgeDollarSign size={14} /> Record BIR Payment ({selectedTaxIds.length} payslips)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Payment History */}
          {taxPayments.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>Payment History</p>
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--off-white)' }}>
                      <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Payment Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>From Account</th>
                      <th className="text-center px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Payslips</th>
                      <th className="text-right px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Amount Paid</th>
                      <th className="text-center px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Proof</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxPayments.map(tp => (
                      <tr key={tp.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--charcoal)' }}>
                          {new Date(tp.paymentDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                          {tp.fromAccount.accountNumber} — {tp.fromAccount.accountTitle}
                        </td>
                        <td className="px-4 py-3 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>{tp.entryCount}</td>
                        <td className="px-4 py-3 text-right font-semibold text-xs" style={{ color: '#166534' }}>{formatCurrency(tp.totalAmount)}</td>
                        <td className="px-4 py-3 text-center">
                          {tp.proofUrl ? (
                            <a href={tp.proofUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs underline" style={{ color: 'var(--teal)' }}>View</a>
                          ) : <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Employee placeholder */}
          {taxFilter === 'EMPLOYEE' && (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-dashed" style={{ borderColor: 'var(--light-gray)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Employee Tax (BIR Form 1601-C)</p>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Employee payroll is coming soon. This section will show withholding taxes for employed staff.</p>
            </div>
          )}

          {/* Tax Settings Modal */}
          {showTaxSettings && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--light-gray)' }}>
                  <h3 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Tax Payable Settings</h3>
                  <button onClick={() => setShowTaxSettings(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Liability Account (Tax Payable — BIR)</label>
                    <p className="text-xs mb-2" style={{ color: 'var(--mid-gray)' }}>Select the liability account where unremitted taxes are lodged. Typically a &ldquo;Taxes Payable&rdquo; or &ldquo;Withholding Tax Payable&rdquo; account.</p>
                    <input value={taxSettingsSearch} onChange={e => setTaxSettingsSearch(e.target.value)}
                      placeholder="Search accounts..."
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none mb-2" style={{ borderColor: 'var(--light-gray)' }} />
                    <div className="max-h-48 overflow-y-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                      {allAccounts
                        .filter(a => a.accountType === 'LIABILITY' &&
                          (!taxSettingsSearch || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(taxSettingsSearch.toLowerCase())))
                        .map(a => (
                          <button key={a.id} onClick={() => setEditTaxLiabilityId(a.id)}
                            className="w-full text-left px-3 py-2.5 text-xs flex items-center justify-between hover:bg-gray-50 transition-colors border-b last:border-b-0"
                            style={editTaxLiabilityId === a.id ? { background: '#f0fdfa', color: 'var(--deep-teal)' } : { color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>
                            <span className="font-medium">{a.accountNumber}</span>
                            <span className="ml-2 text-right flex-1">{a.accountTitle}</span>
                          </button>
                        ))}
                    </div>
                    {editTaxLiabilityId && (
                      <p className="text-xs mt-2 font-semibold" style={{ color: 'var(--teal)' }}>
                        Selected: {allAccounts.find(a => a.id === editTaxLiabilityId)?.accountNumber} — {allAccounts.find(a => a.id === editTaxLiabilityId)?.accountTitle}
                      </p>
                    )}
                  </div>
                </div>
                <div className="px-6 pb-5 flex gap-3">
                  <button onClick={() => setShowTaxSettings(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                  <button onClick={saveTaxSettings} disabled={savingTaxSettings}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                    {savingTaxSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Payment Modal */}
          {showPaymentModal && (() => {
            const selectedEntries = taxPayableEntries.filter(e => selectedTaxIds.includes(e.payrollEntryId))
            const totalTax = selectedEntries.reduce((s, e) => s + e.taxAmount, 0)
            const assetAccounts = allAccounts.filter(a => a.accountType === 'ASSET' &&
              (!paymentFromSearch || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(paymentFromSearch.toLowerCase())))
            const selFromAccount = allAccounts.find(a => a.id === paymentFromAccountId)

            return (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between px-6 py-5 border-b sticky top-0 bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                    <h3 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                      Record BIR Tax Payment
                    </h3>
                    <button onClick={() => setShowPaymentModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
                  </div>

                  <div className="px-6 py-5 space-y-5">
                    {/* Selected payslips summary */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>
                        Included Payslips ({selectedEntries.length})
                      </p>
                      <div className="rounded-xl border overflow-hidden max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                        {selectedEntries.map(e => (
                          <div key={e.payrollEntryId} className="flex items-center justify-between px-3 py-2 text-xs border-b last:border-b-0" style={{ borderColor: 'var(--light-gray)' }}>
                            <div>
                              <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{e.consultantName}</span>
                              <span className="ml-2" style={{ color: 'var(--mid-gray)' }}>{getCutoffLabel(e.cutoffPeriod)}</span>
                            </div>
                            <span className="font-semibold" style={{ color: '#c44b00' }}>{formatCurrency(e.taxAmount)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 rounded-b-xl text-sm font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>
                        <span>Total Tax to Remit</span>
                        <span>{formatCurrency(totalTax)}</span>
                      </div>
                    </div>

                    {/* Payment date */}
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment Date *</label>
                      <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>

                    {/* From account */}
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment From (Asset Account) *</label>
                      <input value={paymentFromSearch} onChange={e => { setPaymentFromSearch(e.target.value); setPaymentFromAccountId('') }}
                        placeholder="Search cash/bank accounts..."
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none mb-1" style={{ borderColor: 'var(--light-gray)' }} />
                      {(paymentFromSearch || !paymentFromAccountId) && (
                        <div className="max-h-36 overflow-y-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                          {assetAccounts.slice(0, 20).map(a => (
                            <button key={a.id} onClick={() => { setPaymentFromAccountId(a.id); setPaymentFromSearch(`${a.accountNumber} — ${a.accountTitle}`) }}
                              className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 hover:bg-gray-50 border-b last:border-b-0 transition-colors"
                              style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>
                              <span className="font-medium">{a.accountNumber}</span>
                              <span>{a.accountTitle}</span>
                            </button>
                          ))}
                          {assetAccounts.length === 0 && <p className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>No matching accounts</p>}
                        </div>
                      )}
                      {selFromAccount && !paymentFromSearch.includes(' — ') && (
                        <p className="text-xs mt-1" style={{ color: 'var(--teal)' }}>
                          Selected: {selFromAccount.accountNumber} — {selFromAccount.accountTitle}
                        </p>
                      )}
                    </div>

                    {/* Proof of payment */}
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Proof of Payment (optional)</label>
                      <input type="file" accept="image/*,.pdf"
                        onChange={e => setPaymentUploadFile(e.target.files?.[0] || null)}
                        className="w-full text-xs" />
                      {paymentUploadFile && <p className="text-xs mt-1" style={{ color: 'var(--teal)' }}>{paymentUploadFile.name}</p>}
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Notes (optional)</label>
                      <textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)}
                        rows={2} placeholder="e.g. BIR eFPS payment ref. no. 12345"
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  </div>

                  <div className="px-6 pb-5 flex gap-3 sticky bottom-0 bg-white pt-3 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <button onClick={() => setShowPaymentModal(false)}
                      className="flex-1 py-2.5 rounded-xl border text-sm font-medium" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                      Cancel
                    </button>
                    <button onClick={recordTaxPayment}
                      disabled={recordingPayment || uploadingProof || !paymentFromAccountId || !paymentDate || !selectedTaxIds.length}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                      style={{ background: '#c44b00' }}>
                      {recordingPayment ? 'Recording...' : uploadingProof ? 'Uploading...' : `Record Payment — ${formatCurrency(totalTax)}`}
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {mainTab === 'consultants' && (
        <>
          {/* Sub-tabs */}
          <div className="flex gap-2 border-b pb-2" style={{ borderColor: 'var(--light-gray)' }}>
            {[
              { key: 'list' as const, label: 'Clinician List', icon: Users },
              { key: 'unit-pay' as const, label: 'Unit Pay Settings', icon: Settings },
              { key: 'payslips' as const, label: 'Payslip Generation', icon: FileText },
            ].map(t => (
              <button key={t.key} onClick={() => setSubTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                style={subTab === t.key ? { background: 'var(--pale-teal)', color: 'var(--deep-teal)' } : { color: 'var(--mid-gray)' }}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}

          {/* ══ TAB 1: Clinician List ══ */}
          {subTab === 'list' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5" style={{ color: 'var(--mid-gray)' }} />
                    <input value={cSearch} onChange={e => setCSearch(e.target.value)} placeholder="Search clinicians..."
                      className="pl-9 pr-3 py-2 rounded-xl border text-sm outline-none w-60" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <select value={cDeptFilter} onChange={e => setCDeptFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                    {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                {canWrite && (
                  <button onClick={syncConsultants} disabled={syncing}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--teal)' }}>
                    {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Sync from Clinician Database
                  </button>
                )}
              </div>

              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--off-white)' }}>
                      <th className="w-8 px-4 py-3" />
                      <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }} onClick={() => toggleCSort('name')}>
                        <span className="flex items-center gap-1">Name <CSortIcon field="name" /></span>
                      </th>
                      <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }} onClick={() => toggleCSort('department')}>
                        <span className="flex items-center gap-1">Department <CSortIcon field="department" /></span>
                      </th>
                      <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</th>
                      <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Tax</th>
                      <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Retainer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>Loading...</td></tr>
                    ) : filteredConsultants.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                        No consultants found. Click &quot;Sync from Clinician Database&quot; to import.
                      </td></tr>
                    ) : filteredConsultants.map(c => (
                      <>
                        <tr key={c.id} className="border-t hover:bg-gray-50/50 cursor-pointer"
                          style={{ borderColor: 'var(--light-gray)' }} onClick={() => expandConsultant(c)}>
                          <td className="px-4 py-3">
                            <ChevronRight size={14} className={`transition-transform ${expandedConsultant === c.id ? 'rotate-90' : ''}`} style={{ color: 'var(--mid-gray)' }} />
                          </td>
                          <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{c.name}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{DEPT_LABELS[c.department] || c.department}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{c.branch}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={c.taxDeduction === 'FIVE_PERCENT' ? { background: '#fef3c7', color: '#92400e' } : { background: '#f3f4f6', color: '#374151' }}>
                              {c.taxDeduction === 'FIVE_PERCENT' ? '5% Tax' : 'No Tax'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-medium" style={{ color: 'var(--charcoal)' }}>
                            {toNum(c.monthlyRetainer) > 0 ? formatCurrency(toNum(c.monthlyRetainer)) + '/mo' : '—'}
                          </td>
                        </tr>
                        {expandedConsultant === c.id && (
                          <tr key={`${c.id}-exp`} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                            <td colSpan={6} className="px-6 py-4" style={{ background: '#fafafa' }}>
                              <div className="space-y-4 max-w-lg">
                                <div className="flex items-center gap-4">
                                  <label className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Tax Deduction:</label>
                                  {['FIVE_PERCENT', 'NONE'].map(v => (
                                    <label key={v} className="flex items-center gap-2 text-xs cursor-pointer">
                                      <input type="radio" name={`tax-${c.id}`} value={v} checked={editingTax === v} onChange={() => setEditingTax(v)} />
                                      {v === 'FIVE_PERCENT' ? '5% Tax Deduction' : 'No Tax Deduction'}
                                    </label>
                                  ))}
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Fixed Monthly Retainer</label>
                                  <input type="number" min={0} step="0.01" value={editingRetainer} onChange={e => setEditingRetainer(e.target.value)}
                                    className="px-3 py-2 rounded-xl border text-sm outline-none w-48" style={{ borderColor: 'var(--light-gray)' }} />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Unit Pay Rates</label>
                                  {unitPays.length === 0 ? (
                                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No unit pay types. Create them in Unit Pay Settings tab first.</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {unitPays.map(up => (
                                        <div key={up.id} className="flex items-center gap-3">
                                          <span className="text-xs font-medium w-40" style={{ color: 'var(--charcoal)' }}>{up.name}</span>
                                          <input type="number" min={0} step="0.01" value={editingRates[up.id] || ''}
                                            onChange={e => setEditingRates({ ...editingRates, [up.id]: parseFloat(e.target.value) || 0 })}
                                            placeholder="0.00" className="px-3 py-1.5 rounded-lg border text-sm outline-none w-32" style={{ borderColor: 'var(--light-gray)' }} />
                                          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>per unit</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {canWrite && (
                                  <button onClick={() => saveConsultantConfig(c)} disabled={savingConsultant}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                                    style={{ background: 'var(--teal)' }}>
                                    <Save size={14} /> {savingConsultant ? 'Saving...' : 'Save Configuration'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ TAB 2: Unit Pay Settings ══ */}
          {subTab === 'unit-pay' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Unit Pay Types</h3>
                {canWrite && (
                  <button onClick={openUPCreate} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--teal)' }}>
                    <Plus size={16} /> Add Unit Pay
                  </button>
                )}
              </div>
              {unitPays.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>No unit pay types created yet.</p>
              ) : (
                <div className="grid gap-3">
                  {unitPays.map(up => (
                    <div key={up.id} className="flex items-center justify-between p-4 rounded-xl border" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{up.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                          {(up.departments || []).length > 0
                            ? `Depts: ${(up.departments || []).map(d => DEPT_LABELS[d] || d).join(', ')}`
                            : 'All departments'}
                          {up._count && ` · ${up._count.consultantRates} consultants · ${up._count.services} services`}
                        </p>
                        {up.expenseAccount && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--teal)' }}>
                            Expense: {up.expenseAccount.accountNumber} — {up.expenseAccount.accountTitle}
                          </p>
                        )}
                      </div>
                      {canWrite && (
                        <button onClick={() => openUPEdit(up)} className="p-2 rounded-lg hover:bg-gray-100">
                          <Pencil size={14} style={{ color: 'var(--teal)' }} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {showUnitPayForm && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
                  <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md relative">
                    <button onClick={() => setShowUnitPayForm(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
                      <X size={18} style={{ color: 'var(--mid-gray)' }} />
                    </button>
                    <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                      {editingUnitPay ? 'Edit Unit Pay' : 'Add Unit Pay'}
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Name *</label>
                        <input value={upName} onChange={e => setUpName(e.target.value)} placeholder="e.g. Basic PF"
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Applicable Departments</label>
                        <p className="text-xs mb-2" style={{ color: 'var(--mid-gray)' }}>Leave empty for all departments</p>
                        <div className="flex flex-wrap gap-2">
                          {DEPARTMENTS.filter(d => d.value).map(d => (
                            <label key={d.value} className="flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-lg border"
                              style={{ borderColor: upDepts.includes(d.value) ? 'var(--teal)' : 'var(--light-gray)', background: upDepts.includes(d.value) ? '#f0fdfa' : 'white' }}>
                              <input type="checkbox" checked={upDepts.includes(d.value)}
                                onChange={e => setUpDepts(e.target.checked ? [...upDepts, d.value] : upDepts.filter(x => x !== d.value))} />
                              {d.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Expense Account (for COA)</label>
                        <p className="text-xs mb-2" style={{ color: 'var(--mid-gray)' }}>Link this unit pay to an expense account in the chart of accounts</p>
                        <input value={upExpenseSearch} onChange={e => setUpExpenseSearch(e.target.value)}
                          placeholder="Search expense accounts..."
                          className="w-full px-3 py-2 rounded-xl border text-sm outline-none mb-1" style={{ borderColor: 'var(--light-gray)' }} />
                        <div className="max-h-36 overflow-y-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                          {/* Clear option */}
                          <button onClick={() => { setUpExpenseAccountId(''); setUpExpenseSearch('') }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b" style={{ color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>
                            — No expense account —
                          </button>
                          {allAccounts
                            .filter(a => a.accountType === 'EXPENSE' &&
                              (!upExpenseSearch || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(upExpenseSearch.toLowerCase())))
                            .slice(0, 20)
                            .map(a => (
                              <button key={a.id} onClick={() => { setUpExpenseAccountId(a.id); setUpExpenseSearch(`${a.accountNumber} — ${a.accountTitle}`) }}
                                className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 hover:bg-gray-50 border-b last:border-b-0 transition-colors"
                                style={upExpenseAccountId === a.id ? { background: '#f0fdfa', color: 'var(--deep-teal)' } : { color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>
                                <span className="font-medium">{a.accountNumber}</span>
                                <span>{a.accountTitle}</span>
                              </button>
                            ))}
                        </div>
                      </div>
                      {error && <p className="text-xs text-red-600">{error}</p>}
                      <div className="flex gap-3 pt-2">
                        <button onClick={() => setShowUnitPayForm(false)}
                          className="flex-1 py-2.5 rounded-xl border text-sm font-medium" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                        <button onClick={saveUnitPay} disabled={savingUP}
                          className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                          style={{ background: 'var(--teal)' }}>{savingUP ? 'Saving...' : 'Save'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ TAB 3: Payslip Generation ══ */}
          {subTab === 'payslips' && (
            <div className="space-y-4">
              {/* Controls row */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <select value={genDept} onChange={e => setGenDept(e.target.value)}
                    className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                    {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <select value={genConsultantId} onChange={e => setGenConsultantId(e.target.value)}
                    className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="">All Consultants</option>
                    {consultants.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={generatePayslips} disabled={generating}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--teal)' }}>
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                    Generate Payslips
                  </button>
                  {payrollPreviews.some(p => p.grossPay > 0) && (
                    <button onClick={savePayslips} disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border disabled:opacity-50"
                      style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                      <Save size={14} /> {saving ? 'Saving...' : 'Save All as Draft'}
                    </button>
                  )}
                </div>

                {/* Download ALL PDFs */}
                {payrollPreviews.some(p => p.grossPay > 0 || p.orderCount > 0) && (
                  <button onClick={downloadAllPdfs} disabled={downloadingAll}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border disabled:opacity-50"
                    style={{ borderColor: 'var(--charcoal)', color: 'var(--charcoal)' }}>
                    {downloadingAll ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    {downloadingAll ? 'Generating PDFs...' : 'Download ALL PDFs'}
                  </button>
                )}
              </div>

              {/* Preview cards */}
              {payrollPreviews.length > 0 && (
                <div className="space-y-5">
                  <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>
                    Payroll for: {getCutoffLabel(cutoffPeriod)}
                  </p>

                  {payrollPreviews.filter(p => p.grossPay > 0 || p.orderCount > 0).map(p => {
                    const extras = extraUnitPays[p.consultantId] || []
                    const adjs = adjustments[p.consultantId] || []
                    const t = computeTotals(p, extras, adjs)

                    // Unit pays available for this clinician's dept
                    const availableUPs = unitPays.filter(up =>
                      up.departments.length === 0 || up.departments.includes(p.department)
                    )
                    const upSearch = upAddSearch[p.consultantId] || ''
                    const filteredUPs = availableUPs.filter(up =>
                      !upSearch || up.name.toLowerCase().includes(upSearch.toLowerCase())
                    )
                    const selUPId = upAddSel[p.consultantId] || ''
                    const selUP = availableUPs.find(u => u.id === selUPId)
                    const consultant = consultants.find(c => c.id === p.consultantId)
                    const selUPRate = selUP ? toNum(consultant?.unitPayRates.find(r => r.unitPayId === selUP.id)?.amount) : 0
                    const selUPQty = upAddQty[p.consultantId] || 1
                    const emailSt = emailStatus[p.consultantId]
                    const isSendingThis = sendingEmailFor === p.consultantId

                    return (
                      <div key={p.consultantId} className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                        {/* Card header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                          <div>
                            <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{p.consultantName}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                              {POSITION_LABELS[p.department] || p.department} · {DEPT_LABELS[p.department] || p.department} · {p.branch}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(t.net)}</p>
                            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Net Pay</p>
                          </div>
                        </div>

                        <div className="p-5 space-y-5">
                          {/* ── Auto-computed earnings ── */}
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>Earnings from Orders</p>
                            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ background: 'var(--off-white)' }}>
                                    {['Item', 'Rate', 'Qty', 'Amount'].map(h => (
                                      <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.items.map((item, idx) => (
                                    <tr key={idx} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                                      <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{item.unitPayName}</td>
                                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(item.unitAmount)}</td>
                                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{item.quantity}</td>
                                      <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(item.lineTotal)}</td>
                                    </tr>
                                  ))}
                                  {p.items.length === 0 && (
                                    <tr><td colSpan={4} className="px-3 py-3 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>No order-linked earnings this cutoff</td></tr>
                                  )}
                                  {p.retainerAmount > 0 && (
                                    <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                                      <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>Monthly Retainer (½)</td>
                                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>—</td>
                                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>—</td>
                                      <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(p.retainerAmount)}</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* ── Extra Unit Pays ── */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>
                                Additional Unit Pay {extras.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px]">{extras.length}</span>}
                              </p>
                              <button
                                onClick={() => setShowUpAdd(prev => ({ ...prev, [p.consultantId]: !prev[p.consultantId] }))}
                                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg"
                                style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                                <PlusCircle size={12} /> Add Unit Pay
                              </button>
                            </div>

                            {/* Add unit pay form */}
                            {showUpAdd[p.consultantId] && (
                              <div className="rounded-xl border p-3 mb-3 space-y-2" style={{ borderColor: 'var(--light-gray)', background: '#fafafa' }}>
                                <div className="relative">
                                  <Search size={12} className="absolute left-2.5 top-2.5" style={{ color: 'var(--mid-gray)' }} />
                                  <input
                                    value={upSearch}
                                    onChange={e => setUpAddSearch(prev => ({ ...prev, [p.consultantId]: e.target.value }))}
                                    placeholder={`Search unit pays for ${DEPT_LABELS[p.department] || p.department}...`}
                                    className="w-full pl-8 pr-3 py-2 rounded-lg border text-xs outline-none"
                                    style={{ borderColor: 'var(--light-gray)' }}
                                  />
                                </div>
                                {filteredUPs.length > 0 && (
                                  <div className="max-h-36 overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                                    {filteredUPs.map(up => {
                                      const rate = toNum(consultant?.unitPayRates.find(r => r.unitPayId === up.id)?.amount)
                                      return (
                                        <button key={up.id} onClick={() => setUpAddSel(prev => ({ ...prev, [p.consultantId]: up.id }))}
                                          className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-teal-50 transition-colors"
                                          style={selUPId === up.id ? { background: '#f0fdfa', color: 'var(--deep-teal)' } : { color: 'var(--charcoal)' }}>
                                          <span>{up.name}</span>
                                          <span style={{ color: 'var(--mid-gray)' }}>{rate > 0 ? formatCurrency(rate) + ' / unit' : 'No rate set'}</span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                                {filteredUPs.length === 0 && upSearch && (
                                  <p className="text-xs text-center py-2" style={{ color: 'var(--mid-gray)' }}>No matching unit pays for this department.</p>
                                )}
                                {selUPId && (
                                  <div className="flex items-center gap-3 pt-1">
                                    <div className="flex-1 text-xs px-2 py-1.5 rounded-lg" style={{ background: '#f0fdfa', color: 'var(--deep-teal)' }}>
                                      <span className="font-semibold">{selUP?.name}</span>
                                      {selUPRate > 0 && <span className="ml-2 opacity-70">@ {formatCurrency(selUPRate)}/unit</span>}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Qty:</label>
                                      <input type="number" min={1} step={1} value={selUPQty}
                                        onChange={e => setUpAddQty(prev => ({ ...prev, [p.consultantId]: parseInt(e.target.value) || 1 }))}
                                        className="w-16 px-2 py-1 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                                    </div>
                                    {selUPRate > 0 && (
                                      <span className="text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>
                                        = {formatCurrency(selUPRate * selUPQty)}
                                      </span>
                                    )}
                                    <button onClick={() => addExtraUP(p.consultantId)}
                                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                                      style={{ background: 'var(--teal)' }}>Add</button>
                                    <button onClick={() => setShowUpAdd(prev => ({ ...prev, [p.consultantId]: false }))}
                                      className="p-1.5 rounded-lg hover:bg-gray-100"><X size={12} /></button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* List of added unit pays */}
                            {extras.length > 0 && (
                              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr style={{ background: '#f0fdfa' }}>
                                      <th className="px-3 py-2 text-left font-semibold text-teal-700">Unit Pay</th>
                                      <th className="px-3 py-2 text-right font-semibold text-teal-700">Rate</th>
                                      <th className="px-3 py-2 text-center font-semibold text-teal-700">Qty</th>
                                      <th className="px-3 py-2 text-right font-semibold text-teal-700">Total</th>
                                      <th className="px-3 py-2 w-8" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {extras.map(e => (
                                      <tr key={e.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{e.unitPayName}</td>
                                        <td className="px-3 py-2 text-right" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(e.unitAmount)}</td>
                                        <td className="px-3 py-2 text-center">
                                          <input type="number" min={1} step={1} value={e.qty}
                                            onChange={ev => updateExtraQty(p.consultantId, e.id, parseInt(ev.target.value) || 1)}
                                            className="w-14 px-2 py-1 rounded border text-xs text-center outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(e.unitAmount * e.qty)}</td>
                                        <td className="px-3 py-2">
                                          <button onClick={() => removeExtraUP(p.consultantId, e.id)} className="p-1 hover:bg-red-50 rounded">
                                            <Trash2 size={12} className="text-red-400" />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* ── Adjustments ── */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>
                                Adjustments {adjs.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px]">{adjs.length}</span>}
                              </p>
                              <button
                                onClick={() => setShowAdjAdd(prev => ({ ...prev, [p.consultantId]: !prev[p.consultantId] }))}
                                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg"
                                style={{ background: '#fffbeb', color: '#92400e' }}>
                                <PlusCircle size={12} /> Add Adjustment
                              </button>
                            </div>

                            {/* Add adjustment form */}
                            {showAdjAdd[p.consultantId] && (
                              <div className="rounded-xl border p-3 mb-3 space-y-3" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-semibold mb-1" style={{ color: '#92400e' }}>Description *</label>
                                    <input
                                      value={adjName[p.consultantId] || ''}
                                      onChange={e => setAdjName(prev => ({ ...prev, [p.consultantId]: e.target.value }))}
                                      placeholder="e.g. Performance Bonus"
                                      className="w-full px-2.5 py-2 rounded-lg border text-xs outline-none"
                                      style={{ borderColor: '#fde68a' }}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-semibold mb-1" style={{ color: '#92400e' }}>Amount *</label>
                                    <input
                                      type="number" min={0} step="0.01"
                                      value={adjAmount[p.consultantId] || ''}
                                      onChange={e => setAdjAmount(prev => ({ ...prev, [p.consultantId]: e.target.value }))}
                                      placeholder="0.00"
                                      className="w-full px-2.5 py-2 rounded-lg border text-xs outline-none"
                                      style={{ borderColor: '#fde68a' }}
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center gap-4">
                                  {/* Addition / Deduction toggle */}
                                  <div>
                                    <label className="block text-[10px] font-semibold mb-1" style={{ color: '#92400e' }}>Type</label>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => setAdjIsAdd(prev => ({ ...prev, [p.consultantId]: true }))}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                                        style={adjIsAdd[p.consultantId] !== false ? { background: '#d1fae5', borderColor: '#6ee7b7', color: '#065f46' } : { borderColor: '#e5e7eb', color: '#6b7280' }}>
                                        + Addition
                                      </button>
                                      <button
                                        onClick={() => setAdjIsAdd(prev => ({ ...prev, [p.consultantId]: false }))}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                                        style={adjIsAdd[p.consultantId] === false ? { background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' } : { borderColor: '#e5e7eb', color: '#6b7280' }}>
                                        − Deduction
                                      </button>
                                    </div>
                                  </div>

                                  {/* Taxed toggle */}
                                  <div>
                                    <label className="block text-[10px] font-semibold mb-1" style={{ color: '#92400e' }}>Include in Tax Base?</label>
                                    <button
                                      onClick={() => setAdjIsTaxed(prev => ({ ...prev, [p.consultantId]: !prev[p.consultantId] }))}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                                      style={adjIsTaxed[p.consultantId] ? { background: '#fef3c7', borderColor: '#fcd34d', color: '#78350f' } : { borderColor: '#e5e7eb', color: '#6b7280' }}>
                                      {adjIsTaxed[p.consultantId]
                                        ? <><ToggleRight size={14} /> Taxed</>
                                        : <><ToggleLeft size={14} /> Non-taxed</>}
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-semibold mb-1" style={{ color: '#92400e' }}>Remarks (visible on payslip)</label>
                                  <input
                                    value={adjRemarks[p.consultantId] || ''}
                                    onChange={e => setAdjRemarks(prev => ({ ...prev, [p.consultantId]: e.target.value }))}
                                    placeholder="e.g. Q1 performance incentive"
                                    className="w-full px-2.5 py-2 rounded-lg border text-xs outline-none"
                                    style={{ borderColor: '#fde68a' }}
                                  />
                                </div>

                                <div className="flex gap-2">
                                  <button onClick={() => addAdjustment(p.consultantId)}
                                    disabled={!adjName[p.consultantId]?.trim() || !adjAmount[p.consultantId]}
                                    className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                                    style={{ background: '#d97706' }}>Add Adjustment</button>
                                  <button onClick={() => setShowAdjAdd(prev => ({ ...prev, [p.consultantId]: false }))}
                                    className="px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: '#e5e7eb', color: '#6b7280' }}>Cancel</button>
                                </div>
                              </div>
                            )}

                            {/* List of adjustments */}
                            {adjs.length > 0 && (
                              <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#fde68a' }}>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr style={{ background: '#fffbeb' }}>
                                      <th className="px-3 py-2 text-left font-semibold text-amber-800">Description</th>
                                      <th className="px-3 py-2 text-center font-semibold text-amber-800">Tax</th>
                                      <th className="px-3 py-2 text-right font-semibold text-amber-800">Amount</th>
                                      <th className="px-3 py-2 text-left font-semibold text-amber-800">Remarks</th>
                                      <th className="px-3 py-2 w-8" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {adjs.map(a => (
                                      <tr key={a.id} className="border-t" style={{ borderColor: '#fde68a' }}>
                                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{a.name}</td>
                                        <td className="px-3 py-2 text-center">
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                            style={a.isTaxed ? { background: '#fef3c7', color: '#78350f' } : { background: '#f3f4f6', color: '#6b7280' }}>
                                            {a.isTaxed ? 'Taxed' : 'Non-taxed'}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold"
                                          style={{ color: a.isAddition ? '#065f46' : '#991b1b' }}>
                                          {a.isAddition ? '+' : '−'} {formatCurrency(a.amount)}
                                        </td>
                                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{a.remarks || '—'}</td>
                                        <td className="px-3 py-2">
                                          <button onClick={() => removeAdjustment(p.consultantId, a.id)} className="p-1 hover:bg-red-50 rounded">
                                            <Trash2 size={12} className="text-red-400" />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* ── Computed totals ── */}
                          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                            <table className="w-full text-xs">
                              <tbody>
                                <tr className="border-b" style={{ borderColor: 'var(--light-gray)' }}>
                                  <td colSpan={3} className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>Unit Pay Total</td>
                                  <td className="px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(t.totalUnitPay)}</td>
                                </tr>
                                {p.retainerAmount > 0 && (
                                  <tr className="border-b" style={{ borderColor: 'var(--light-gray)' }}>
                                    <td colSpan={3} className="px-3 py-2 text-right" style={{ color: 'var(--charcoal)' }}>Retainer (½)</td>
                                    <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{formatCurrency(p.retainerAmount)}</td>
                                  </tr>
                                )}
                                {adjs.length > 0 && (
                                  <tr className="border-b" style={{ borderColor: 'var(--light-gray)' }}>
                                    <td colSpan={3} className="px-3 py-2 text-right" style={{ color: '#78350f' }}>Adjustments (net)</td>
                                    <td className="px-3 py-2 font-medium" style={{ color: (t.taxedAdj + t.nonTaxedAdj) >= 0 ? '#065f46' : '#991b1b' }}>
                                      {(t.taxedAdj + t.nonTaxedAdj) >= 0 ? '+' : ''}{formatCurrency(t.taxedAdj + t.nonTaxedAdj)}
                                    </td>
                                  </tr>
                                )}
                                <tr className="border-b" style={{ borderColor: 'var(--light-gray)' }}>
                                  <td colSpan={3} className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>Gross Pay</td>
                                  <td className="px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(t.gross)}</td>
                                </tr>
                                {t.tax > 0 && (
                                  <tr style={{ background: '#fef2f2' }}>
                                    <td colSpan={3} className="px-3 py-2 text-right font-semibold" style={{ color: '#991b1b' }}>Tax (5%)</td>
                                    <td className="px-3 py-2 font-semibold" style={{ color: '#991b1b' }}>({formatCurrency(t.tax)})</td>
                                  </tr>
                                )}
                                <tr style={{ background: '#f0fdf4' }}>
                                  <td colSpan={3} className="px-3 py-2 text-right font-bold" style={{ color: '#166534' }}>NET PAY</td>
                                  <td className="px-3 py-2 font-bold text-base" style={{ color: '#166534' }}>{formatCurrency(t.net)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* ── Action buttons ── */}
                          <div className="flex items-center gap-3 flex-wrap">
                            {p.existingStatus && (
                              <span className="text-xs px-2.5 py-1 rounded-lg font-semibold"
                                style={p.existingStatus === 'FINAL' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                                Status: {p.existingStatus}
                              </span>
                            )}
                            <button onClick={() => downloadPdf(p)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border"
                              style={{ borderColor: 'var(--charcoal)', color: 'var(--charcoal)' }}>
                              <Download size={14} /> Download PDF
                            </button>
                            <button onClick={() => emailClinician(p)} disabled={isSendingThis}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                              style={{ background: '#c44b00' }}>
                              {isSendingThis ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                              {isSendingThis ? 'Sending...' : 'Email Clinician'}
                            </button>
                            {emailSt === 'success' && (
                              <span className="flex items-center gap-1 text-xs text-green-700">
                                <CheckCircle2 size={13} /> {emailMsg[p.consultantId]}
                              </span>
                            )}
                            {emailSt === 'error' && (
                              <span className="flex items-center gap-1 text-xs text-red-600">
                                <AlertCircle size={13} /> {emailMsg[p.consultantId]}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {payrollPreviews.filter(p => p.grossPay > 0 || p.orderCount > 0).length === 0 && (
                    <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>No payable transactions found for this cutoff period.</p>
                  )}

                  {/* Grand total */}
                  {payrollPreviews.some(p => p.grossPay > 0) && (
                    <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: 'var(--pale-teal)' }}>
                      <span className="text-sm font-semibold" style={{ color: 'var(--deep-teal)' }}>
                        Total Payroll ({payrollPreviews.filter(p => p.grossPay > 0).length} consultants)
                      </span>
                      <span className="text-lg font-bold" style={{ color: 'var(--deep-teal)' }}>
                        {formatCurrency(payrollPreviews.reduce((s, p) => {
                          const t = computeTotals(p, extraUnitPays[p.consultantId] || [], adjustments[p.consultantId] || [])
                          return s + t.net
                        }, 0))}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {payrollPreviews.length === 0 && !generating && (
                <p className="text-sm py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                  Select a cutoff period and click &quot;Generate Payslips&quot; to preview consultant payroll.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ══ PAYROLL SETTINGS MODAL ══ */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg relative overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--light-gray)' }}>
              <h3 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                <Settings size={20} style={{ color: 'var(--teal)' }} /> Payroll Settings
              </h3>
              <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>Cutoff Date Ranges</p>
                <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
                  Set which days are covered for each payroll cutoff. These affect which transactions are counted when generating payslips.
                </p>

                {/* 1st Cutoff */}
                <div className="rounded-xl border p-4 mb-4 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                    1st Cutoff
                    <span className="text-xs font-normal ml-2" style={{ color: 'var(--mid-gray)' }}>salary released ~15th</span>
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs w-10" style={{ color: 'var(--mid-gray)' }}>From:</span>
                    <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Day</span>
                    <select value={editSettings.c1StartDay}
                      onChange={e => setEditSettings(s => ({ ...s, c1StartDay: parseInt(e.target.value) }))}
                      className="px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>of</span>
                    <select value={editSettings.c1StartPrevMonth ? 'prev' : 'same'}
                      onChange={e => setEditSettings(s => ({ ...s, c1StartPrevMonth: e.target.value === 'prev' }))}
                      className="px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="prev">Previous Month</option>
                      <option value="same">Current Month</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs w-10" style={{ color: 'var(--mid-gray)' }}>To:</span>
                    <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Day</span>
                    <select value={editSettings.c1EndDay}
                      onChange={e => setEditSettings(s => ({ ...s, c1EndDay: parseInt(e.target.value) }))}
                      className="px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>of Current Month</span>
                  </div>
                </div>

                {/* 2nd Cutoff */}
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                    2nd Cutoff
                    <span className="text-xs font-normal ml-2" style={{ color: 'var(--mid-gray)' }}>salary released ~30th</span>
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs w-10" style={{ color: 'var(--mid-gray)' }}>From:</span>
                    <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Day</span>
                    <select value={editSettings.c2StartDay}
                      onChange={e => setEditSettings(s => ({ ...s, c2StartDay: parseInt(e.target.value) }))}
                      className="px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>of Current Month</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs w-10" style={{ color: 'var(--mid-gray)' }}>To:</span>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer font-medium" style={{ color: 'var(--charcoal)' }}>
                      <input type="checkbox" checked={editSettings.c2EndLastDay}
                        onChange={e => setEditSettings(s => ({ ...s, c2EndLastDay: e.target.checked }))} />
                      End of Month
                    </label>
                    {!editSettings.c2EndLastDay && (
                      <>
                        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Day</span>
                        <select value={editSettings.c2EndDay}
                          onChange={e => setEditSettings(s => ({ ...s, c2EndDay: parseInt(e.target.value) }))}
                          className="px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>of Current Month</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Live preview */}
              <div className="rounded-xl p-4" style={{ background: 'var(--off-white)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>
                  Preview for {MONTHS[cutoffMonth - 1]} {cutoffYear}:
                </p>
                <p className="text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>
                  <span className="font-medium" style={{ color: 'var(--charcoal)' }}>1st Cutoff:</span>{' '}
                  {getCustomCutoffLabel(editSettings, cutoffYear, cutoffMonth, 1)}
                </p>
                <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                  <span className="font-medium" style={{ color: 'var(--charcoal)' }}>2nd Cutoff:</span>{' '}
                  {getCustomCutoffLabel(editSettings, cutoffYear, cutoffMonth, 2)}
                </p>
              </div>
            </div>

            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setShowSettings(false)}
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                Cancel
              </button>
              <button onClick={saveSettings}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold"
                style={{ background: 'var(--teal)' }}>
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
