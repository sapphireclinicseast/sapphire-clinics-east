'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { SCEI_LOGO_DATA_URI, SCEI_LOGO_W, SCEI_LOGO_H } from '@/lib/scei-logo'
import { useSession } from 'next-auth/react'
import {
  BadgeDollarSign, Users, Settings, FileText, Plus, Pencil, Save,
  ChevronUp, ChevronDown, ArrowUpDown, Search, X, AlertCircle,
  RefreshCw, Loader2, ChevronRight, Download, Mail, Trash2,
  PlusCircle, CheckCircle2, ToggleLeft, ToggleRight, Receipt, ShieldOff, Upload,
  Lock, LockOpen, ClipboardList, Eye,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import EmployeePayroll from './EmployeePayroll'

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
  email?: string | null
  phone?: string | null
  bioId?: number | null
  tinNumber?: string | null
  birAddress?: string | null
  sssNumber?: string | null
  philhealthNumber?: string | null
  pagibigNumber?: string | null
  taxDeduction: string
  monthlyRetainer: number | string
  bankName?: string | null
  bankAccountNo?: string | null
  isActive: boolean
  unitPayRates: { id: string; unitPayId: string; unitPay: { id: string; name: string }; amount: number | string; disabled?: boolean; thresholdEnabled?: boolean; thresholdAmount?: number | string | null; reducedAmount?: number | string | null }[]
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
  items: { unitPayId: string; unitPayName: string; unitAmount: number; quantity: number; lineTotal: number; isReduced?: boolean; sessions?: { date: string; patientName: string; serviceName: string; quantity: number; orderNetAmount: number; orderStatus?: string }[] }[]
  unitPayTotal: number
  retainerAmount: number
  incentives: IncentiveLine[]
  incentiveTotal: number
  grossPay: number
  taxAmount: number
  netPay: number
  orderCount: number
  existingStatus: string | null
  storedAdjustments?: AdjustmentLine[]
  storedExtraItems?: ExtraUnitPayLine[]
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

interface IncentiveLine {
  ruleId: string
  ruleName: string
  date: string         // YYYY-MM-DD
  patientCount: number
  bonusPerUnit: number
  bonus: number
}

interface IncentiveRule {
  id: string
  name: string
  description?: string | null
  threshold: number
  bonusPerUnit: number
  departments: string[]
  branch?: string | null
  isActive: boolean
}

interface IEPRDoc {
  id: string
  documentType: string  // INITIAL_EVALUATION | PROGRESS_REPORT
  patient: { id: string; name: string; branch: string | null }
  therapist: { staffId: string; name: string; department: string; branch: string } | null
  department: string
  fileName: string
  mimeType: string
  description: string | null
  uploadedAt: string
  // Merged from local IEPRPayrollRecord
  countedInPayroll: boolean
  cutoffPeriod: string | null
  notes: string | null
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

interface SalaryPayableEntry {
  id: string
  consultantId?: string
  consultantName: string | null
  department: string
  branch: string
  cutoffPeriod: string
  grossPay: number | null
  taxAmount: number | null
  netPay: number
  salariesRemitted: boolean
  status?: string
  isAggregateRow?: boolean
  isConsultantEntry?: boolean
  isEmployeePayslip?: boolean
  employeeId?: string
  employeeName?: string | null
}

interface BenefitEmployeeEntry {
  id: string
  employeeId: string
  employeeName: string
  department: string
  branch: string
  cutoffPeriod: string
  sssEE: number
  sssER: number
  philEE: number
  philER: number
  pagEE: number
  pagER: number
  totalBenefitsPayable: number
  benefitsRemitted: boolean
  benefitPaymentId: string | null
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
    name: 'Sapphire Clinics East Inc. – East Branch',
    address: '4th Floor Robinsons Metro East, Marcos Highway, Dela Paz, Pasig City',
    phone: '0917 118 9289 | (02) 5310-4991',
    tin: 'TIN 010-817-642-00000',
  },
  SBGH: {
    name: 'Sapphire Clinics East Inc. – Greenhills Branch',
    address: 'Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City',
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
    name: 'Sapphire Clinics East Inc.',
    address: 'Metro Manila, Philippines',
    phone: '0917 770 1686 | (02) 8529 1590',
    tin: '',
  },
}

const BRANCHES = [
  { value: '', label: 'All Branches' },
  { value: 'SBEA', label: 'East Branch' },
  { value: 'SBGH', label: 'Greenhills Branch' },
  { value: 'VERDANA', label: 'Verdana Store' },
]

// Friendly branch labels for read-only displays (codes stay for form values).
const BRANCH_LABELS: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
  VERDANA: 'Verdana Store',
  VERDANA_STORE: 'Verdana Store',
}
const branchLabel = (b?: string | null) => (b ? (BRANCH_LABELS[b] || b) : '')

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const DEFAULT_SETTINGS: PayrollSettings = {
  c1StartDay: 26, c1StartPrevMonth: true, c1EndDay: 10,
  c2StartDay: 11, c2EndLastDay: false, c2EndDay: 25,
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS (outside component to avoid re-creation)
   ═══════════════════════════════════════════════════════════════ */
function getCutoffLabel(period: string) {
  const [y, m, h] = period.split('-')
  return `${MONTHS[parseInt(m) - 1]} ${y} — ${h === '1' ? '1st Cutoff' : '2nd Cutoff'}`
}

function uid() { return Math.random().toString(36).slice(2, 10) }

/** Generates the last 12 months × 2 halves as cutoff period options */
function buildCutoffOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    opts.push(
      { value: `${y}-${String(m).padStart(2, '0')}-2`, label: `${MONTHS[d.getMonth()]} ${y} — 2nd Cutoff` },
      { value: `${y}-${String(m).padStart(2, '0')}-1`, label: `${MONTHS[d.getMonth()]} ${y} — 1st Cutoff` },
    )
  }
  return opts
}
const CUTOFF_OPTIONS = buildCutoffOptions()

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

function computeTotals(p: PayrollPreview, extras: ExtraUnitPayLine[], adjs: AdjustmentLine[]) {
  const extraTotal = extras.reduce((s, e) => s + e.unitAmount * e.qty, 0)
  const incentiveTotal = p.incentiveTotal ?? 0
  // Total Unit Pay includes orders + additional unit pay + incentive bonuses
  const totalUnitPay = p.unitPayTotal + extraTotal + incentiveTotal
  const retainer = p.retainerAmount
  const taxedAdj = adjs.filter(a => a.isTaxed).reduce((s, a) => s + (a.isAddition ? a.amount : -a.amount), 0)
  const nonTaxedAdj = adjs.filter(a => !a.isTaxed).reduce((s, a) => s + (a.isAddition ? a.amount : -a.amount), 0)
  const taxableBase = totalUnitPay + retainer + taxedAdj
  const tax = p.taxDeduction === 'FIVE_PERCENT' ? Math.max(0, taxableBase) * 0.05 : 0
  const gross = taxableBase + nonTaxedAdj
  const net = gross - tax
  return { totalUnitPay, extraTotal, incentiveTotal, taxedAdj, nonTaxedAdj, taxableBase, tax, gross, net }
}

/* ═══════════════════════════════════════════════════════════════
   PDF GENERATION
   The body of buildPayslipPdf used to live here; it has been moved
   to src/lib/payslip-pdf-consultant.ts so the same code can run
   server-side (e.g. /api/internal/my-payslips/pdf streaming to the
   teletherapy hub). This wrapper just delegates and keeps the call
   sites stable.
   ═══════════════════════════════════════════════════════════════ */
async function buildPayslipPdf(
  p: PayrollPreview,
  extras: ExtraUnitPayLine[],
  adjs: AdjustmentLine[],
  cutoffPeriod: string,
  dateRange?: { start: string; end: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { buildConsultantPayslipPdf } = await import('@/lib/payslip-pdf-consultant')
  return buildConsultantPayslipPdf(p, extras, adjs, cutoffPeriod, dateRange)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _legacyBuildPayslipPdf_REMOVED_OLD(
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
  // Build cutoff period label — use custom date range if available, otherwise generic label
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
  const cutoffLabel = dateRange
    ? `${fmtDate(dateRange.start)} \u2013 ${fmtDate(dateRange.end)}`
    : getCutoffLabel(cutoffPeriod)

  // Brand colors
  const ORANGE: [number, number, number] = [74, 128, 115]    // #4A8073 teal (heads/lines/title)
  const NET_GREEN: [number, number, number] = [237, 243, 217] // #EDF3D9 pale green (net-pay band)
  const GOLD: [number, number, number] = [198, 152, 73]      // #C69849 gold (head rule)
  const CLAY_ACCENT: [number, number, number] = [207, 157, 136] // #CF9D88 clay (gross-pay band)
  const WHITE: [number, number, number] = [255, 255, 255]
  const DARK: [number, number, number] = [30, 30, 30]
  const MID: [number, number, number] = [80, 80, 80]
  const LIGHT_BORDER: [number, number, number] = [210, 210, 210]

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 25.4   // 1 inch — matches template page margins
  const contentW = pageW - margin * 2
  let y = margin

  /* ══ HEADER: Brand title centered ══ */
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...ORANGE)
  doc.addImage(SCEI_LOGO_DATA_URI, 'PNG', margin, 10, SCEI_LOGO_W, SCEI_LOGO_H)
  doc.text('SAPPHIRE CLINICS EAST INC.', pageW / 2, y + 8, { align: 'center' })
  y += 14

  /* ══ Branch info — left-aligned below header ══ */
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
    lineColor: GOLD,
    lineWidth: 0.5,
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

  /* ══ INCENTIVES TABLE ══
     Shows daily threshold bonuses                              */
  if (p.incentives && p.incentives.length > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text('INCENTIVES', margin, y)
    y += 2

    const incBody = p.incentives.map(line => {
      const d = new Date(line.date + 'T00:00:00+08:00')
      const dateStr = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
      return [
        `${line.ruleName} — ${dateStr}`,
        String(line.patientCount),
        fmtPHP(line.bonusPerUnit),
        fmtPHP(line.bonus),
      ]
    })

    autoTable(doc, {
      startY: y,
      head: [['Description', 'Sessions', 'Rate / Session', 'Total']],
      body: incBody,
      theme: 'grid',
      headStyles: tableHeadStyles,
      bodyStyles: tableBodyStyles,
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 36 },
        3: { halign: 'right', cellWidth: 36 },
      },
      margin: { left: margin, right: margin },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable?.finalY ?? y
    y += 8
  }

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
    ...((p.incentiveTotal ?? 0) > 0 ? [{ label: 'Incentive Bonus', value: fmtPHP(p.incentiveTotal ?? 0) }] : []),
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
        data.cell.styles.fillColor = CLAY_ACCENT
        data.cell.styles.textColor = [36, 73, 82]
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

  /* ══ PAGE 2: SESSION DETAILS ══ */
  const itemsWithSessions = p.items.filter(item => item.sessions && item.sessions.length > 0)
  if (itemsWithSessions.length > 0) {
    doc.addPage()
    let y2 = margin

    // Header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...ORANGE)
    doc.text('SAPPHIRE CLINICS EAST INC.', pageW / 2, y2 + 8, { align: 'center' })
    y2 += 14

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text('SESSION DETAILS', pageW / 2, y2, { align: 'center' })
    y2 += 8

    // Consultant name + cutoff
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...MID)
    doc.text(`${p.consultantName}  \u2014  ${cutoffLabel}`, pageW / 2, y2, { align: 'center' })
    y2 += 10

    for (const item of itemsWithSessions) {
      // Section header for each unit pay type
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...ORANGE)
      const sessionQtyTotal = item.sessions!.reduce((s, x) => s + (x.quantity ?? 1), 0)
      doc.text(`${item.unitPayName}  (${sessionQtyTotal} session${sessionQtyTotal !== 1 ? 's' : ''})`, margin, y2)
      y2 += 2

      const sessionRows = [...item.sessions!].sort((a, b) => a.date.localeCompare(b.date)).map(s => {
        const d = new Date(s.date + 'T00:00:00+08:00')
        const dateStr = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
        const status = (s.orderStatus || 'COMPLETED').toUpperCase()
        const statusLabel = status === 'CANCELLED' || status === 'VOIDED' ? 'Voided'
          : status === 'REOPENED' ? 'Reopened' : 'Completed'
        return [dateStr, s.patientName || '\u2014', s.serviceName || '\u2014', String(s.quantity ?? 1), statusLabel]
      })

      autoTable(doc, {
        startY: y2,
        head: [['Date', 'Patient', 'Service', 'Qty', 'Status']],
        body: sessionRows,
        theme: 'grid',
        headStyles: { ...tableHeadStyles, fontSize: 8 },
        bodyStyles: { ...tableBodyStyles, fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 38 },
          2: { cellWidth: 'auto' },   // service — takes remaining width; wraps if long
          3: { cellWidth: 12, halign: 'center' },
          4: { cellWidth: 22, halign: 'center' },
        },
        margin: { left: margin, right: margin },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 4) {
            const val = data.cell.raw as string
            if (val === 'Voided') {
              data.cell.styles.textColor = [180, 40, 40]
            } else if (val === 'Reopened') {
              data.cell.styles.textColor = [180, 130, 20]
            } else {
              data.cell.styles.textColor = [30, 120, 60]
            }
          }
        },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y2 = (doc as any).lastAutoTable?.finalY ?? y2
      y2 += 8
    }
  }

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

  const [mainTab, setMainTab] = useState<'consultants' | 'employees' | 'tax-payable' | 'salaries-payable' | 'benefits-payable' | 'payroll-settings'>('consultants')
  const [subTab, setSubTab] = useState<'list' | 'unit-pay' | 'pay-rules' | 'adjustments' | 'initial-eval' | 'progress-report' | 'payslips'>('list')

  /* ── IE / PR tracking ── */
  const [ieprDocs, setIeprDocs] = useState<IEPRDoc[]>([])
  const [ieprLoading, setIeprLoading] = useState(false)
  const [ieprError, setIeprError] = useState('')
  const [ieprSearch, setIeprSearch] = useState('')
  const [ieprExpanded, setIeprExpanded] = useState<Set<string>>(new Set())
  const [ieprSaving, setIeprSaving] = useState<Set<string>>(new Set())

  /* ── Core data ── */
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [unitPays, setUnitPays] = useState<UnitPayType[]>([])
  const [unitPaySearch, setUnitPaySearch] = useState('')
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
  const [editingRates, setEditingRates] = useState<Record<string, { amount: number; disabled: boolean; thresholdEnabled: boolean; thresholdAmount: number | null; reducedAmount: number | null }>>({})
  const [editingTax, setEditingTax] = useState('')
  const [editingRetainer, setEditingRetainer] = useState('')
  const [editingBirAddress, setEditingBirAddress] = useState('')
  const [savingConsultant, setSavingConsultant] = useState(false)

  // Inline BIR Address editing directly in the consultant table row
  const [inlineBirEditId, setInlineBirEditId] = useState<string | null>(null)
  const [inlineBirValue, setInlineBirValue] = useState('')
  const [savingInlineBir, setSavingInlineBir] = useState(false)

  /* ── Past Payslips in Clinician List ── */
  interface ConsultantPayslip { id: string; cutoffPeriod: string; branch: string; grossPay: number; netPay: number; status: string; pdfUrl?: string | null }
  const [clinicianPastPayslips, setClinicianPastPayslips] = useState<ConsultantPayslip[]>([])
  const [loadingClinicianPayslips, setLoadingClinicianPayslips] = useState(false)
  const [showClinicianPayslips, setShowClinicianPayslips] = useState<string | null>(null)

  /* ── Bulk unit pay ── */
  const [bulkDept, setBulkDept] = useState('')
  const [bulkUnitPayId, setBulkUnitPayId] = useState('')
  const [bulkAmount, setBulkAmount] = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  /* ── Threshold rules ── */
  interface ThresholdRule { unitPayId: string; unitPayName: string; thresholdAmount: number; reducedAmount: number; consultants: { id: string; name: string; department: string; branch: string }[] }
  const [thresholdRules, setThresholdRules] = useState<ThresholdRule[]>([])
  const [trLoading, setTrLoading] = useState(false)
  const [trFormOpen, setTrFormOpen] = useState(false)
  const [trUnitPayId, setTrUnitPayId] = useState('')
  const [trThreshold, setTrThreshold] = useState('')
  const [trReduced, setTrReduced] = useState('')
  const [trSelectedConsultants, setTrSelectedConsultants] = useState<string[]>([])
  const [trSaving, setTrSaving] = useState(false)

  /* ── Unit Pay form ── */
  const [showUnitPayForm, setShowUnitPayForm] = useState(false)
  const [editingUnitPay, setEditingUnitPay] = useState<UnitPayType | null>(null)
  const [upName, setUpName] = useState('')
  const [upDepts, setUpDepts] = useState<string[]>([])
  const [savingUP, setSavingUP] = useState(false)

  /* ── Incentive Rules ── */
  const [incentiveRules, setIncentiveRules] = useState<IncentiveRule[]>([])
  const [showIncentiveForm, setShowIncentiveForm] = useState(false)
  const [editingIncentive, setEditingIncentive] = useState<IncentiveRule | null>(null)
  const [incForm, setIncForm] = useState({ name: '', description: '', threshold: 7, bonusPerUnit: 20, departments: [] as string[], branch: '', isActive: true })
  const [savingInc, setSavingInc] = useState(false)

  /* ── Consultant Cutoff Adjustments ── */
  interface ConAdjRow { consultantId: string; consultantName?: string; allowance: number; allowanceType: string; allowanceLabel: string; deduction: number; deductionLabel: string; rowKey: string }
  const [conAdjCutoffMonth, setConAdjCutoffMonth] = useState(now.getMonth() + 1)
  const [conAdjCutoffYear, setConAdjCutoffYear] = useState(now.getFullYear())
  const [conAdjCutoffHalf, setConAdjCutoffHalf] = useState(now.getDate() <= 15 ? 1 : 2)
  const [conAdjRows, setConAdjRows] = useState<ConAdjRow[]>([])
  const [conAdjLoading, setConAdjLoading] = useState(false)
  const [conAdjSaving, setConAdjSaving] = useState(false)
  const [conAdjSaved, setConAdjSaved] = useState(false)
  const [conAdjBranch, setConAdjBranch] = useState('')

  /* ── Payslip generation — base ── */
  const [genDept, setGenDept] = useState('')
  const [genConsultantId, setGenConsultantId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [sessionBreakdown, setSessionBreakdown] = useState<{ unitPayName: string; sessions: { date: string; patientName: string; serviceName: string; quantity: number; orderNetAmount: number; orderStatus?: string }[] } | null>(null)

  /* ── Payslip generation — per-consultant extras ── */
  const [extraUnitPays, setExtraUnitPays] = useState<Record<string, ExtraUnitPayLine[]>>({})
  const [adjustments, setAdjustments] = useState<Record<string, AdjustmentLine[]>>({})
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({})
  const [lockingMap, setLockingMap] = useState<Record<string, boolean>>({})
  const [unlockingMap, setUnlockingMap] = useState<Record<string, boolean>>({})
  const [rerunningMap, setRerunningMap] = useState<Record<string, boolean>>({})

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
  const [downloadPct, setDownloadPct] = useState(0)
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
  // Payment edit state
  const [editPayment, setEditPayment] = useState<{ id: string; type: 'tax' | 'salary'; paymentDate: string; proofUrl: string; notes: string } | null>(null)
  const [editPaymentSaving, setEditPaymentSaving] = useState(false)
  const [editProofFile, setEditProofFile] = useState<File | null>(null)
  const [editProofFileName, setEditProofFileName] = useState('')
  const [editPaymentConfirmReverse, setEditPaymentConfirmReverse] = useState(false)
  const [reversingPayment, setReversingPayment] = useState(false)
  // Salary payment history
  const [salaryPayments, setSalaryPayments] = useState<{ id: string; paymentDate: string; totalAmount: number; fromAccount: { accountNumber: string; accountTitle: string }; proofUrl: string | null; notes: string | null; cutoffPeriod: string; branch: string; consultants?: { name: string; department: string; netPay: number; cutoffPeriod: string }[] }[]>([])

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

  // COA Mapping state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [coaMapping, setCoaMapping] = useState<Record<string, any>>({})
  const [coaEdits, setCoaEdits] = useState<Record<string, string>>({})
  const [savingCoa, setSavingCoa] = useState(false)
  const [coaSearch, setCoaSearch] = useState('')

  // Salaries Payable tab state
  const [salPayableSubTab, setSalPayableSubTab] = useState<'employees' | 'consultants'>('employees')
  const [salariesPayables, setSalariesPayables] = useState<SalaryPayableEntry[]>([])   // consultants
  const [empSalPayables, setEmpSalPayables] = useState<SalaryPayableEntry[]>([])       // employees
  const [loadingSalPayable, setLoadingSalPayable] = useState(false)
  const [loadingEmpSalPayable, setLoadingEmpSalPayable] = useState(false)
  const [showSalRemitted, setShowSalRemitted] = useState(false)
  const [showEmpSalRemitted, setShowEmpSalRemitted] = useState(false)

  // Benefits Payable tab state
  const [benefitsPayables, setBenefitsPayables] = useState<BenefitEmployeeEntry[]>([])
  const [loadingBenPayable, setLoadingBenPayable] = useState(false)
  const [showBenRemitted, setShowBenRemitted] = useState(false)

  // Multi-select for salary/benefit payables
  const [selectedSalaryPayableIds, setSelectedSalaryPayableIds] = useState<string[]>([])
  const [selectedEmpSalPayableIds, setSelectedEmpSalPayableIds] = useState<string[]>([])
  const [selectedBenefitPayableIds, setSelectedBenefitPayableIds] = useState<string[]>([])

  // Remit modal state (shared between salary and benefit payments)
  const [showRemitModal, setShowRemitModal] = useState<'salary' | 'benefit' | null>(null)
  const [remitPayableId, setRemitPayableId] = useState('')
  const [remitDate, setRemitDate] = useState(new Date().toISOString().slice(0, 10))
  const [remitFromAccountId, setRemitFromAccountId] = useState('')
  const [remitFromSearch, setRemitFromSearch] = useState('')
  const [remitProofUrl, setRemitProofUrl] = useState('')
  const [remitProofFile, setRemitProofFile] = useState<File | null>(null)
  const [remitProofFileName, setRemitProofFileName] = useState('')
  const [remitUploading, setRemitUploading] = useState(false)
  const [remitNotes, setRemitNotes] = useState('')
  const [remitFeeAmount, setRemitFeeAmount] = useState('')
  const [remitFeeExpenseAccountId, setRemitFeeExpenseAccountId] = useState('')
  const [remitFeeExpenseSearch, setRemitFeeExpenseSearch] = useState('')
  const [remitFeeCashAccountId, setRemitFeeCashAccountId] = useState('')
  const [remitFeeCashSearch, setRemitFeeCashSearch] = useState('')
  const [remitting, setRemitting] = useState(false)

  // Finalize state
  const [finalizing, setFinalizing] = useState(false)
  const [emailingAll, setEmailingAll] = useState(false)

  // Consultant payslip expanded view
  const [expandedPayslip, setExpandedPayslip] = useState<string | null>(null)

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
      const res = await fetch('/api/chart-of-accounts?pageSize=500')
      const data = await res.json()
      setAllAccounts(data.data || [])
    } catch { setAllAccounts([]) }
  }, [])

  const fetchIncentiveRules = useCallback(async () => {
    try {
      const res = await fetch('/api/payroll/incentives')
      const data = await res.json()
      setIncentiveRules(Array.isArray(data) ? data : [])
    } catch { setIncentiveRules([]) }
  }, [])

  const fetchIEPR = useCallback(async (documentType: 'INITIAL_EVALUATION' | 'PROGRESS_REPORT') => {
    setIeprLoading(true)
    setIeprError('')
    try {
      const res = await fetch(`/api/payroll/ie-pr?documentType=${documentType}`)
      const text = await res.text()
      if (!res.ok) {
        // Handle HTML error pages (e.g. session expired → login redirect)
        let msg = 'Failed to load'
        try { msg = JSON.parse(text).error || msg } catch { /* html response */ }
        if (res.status === 401) msg = 'Session expired — please refresh the page and log in again.'
        throw new Error(msg)
      }
      const data = JSON.parse(text)
      setIeprDocs(Array.isArray(data) ? data : [])
    } catch (e) {
      setIeprError(e instanceof Error ? e.message : 'Could not reach teletherapy hub')
      setIeprDocs([])
    } finally {
      setIeprLoading(false)
    }
  }, [])

  const updateIEPR = useCallback(async (
    doc: IEPRDoc,
    countedInPayroll: boolean,
    cutoffPeriod: string | null
  ) => {
    setIeprSaving(prev => new Set(prev).add(doc.id))
    try {
      await fetch('/api/payroll/ie-pr', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: doc.id,
          staffId: doc.therapist?.staffId ?? null,
          countedInPayroll,
          cutoffPeriod: countedInPayroll ? cutoffPeriod : null,
        }),
      })
      // Update local state
      setIeprDocs(prev => prev.map(d =>
        d.id === doc.id ? { ...d, countedInPayroll, cutoffPeriod: countedInPayroll ? cutoffPeriod : null } : d
      ))
    } catch {
      // silently ignore — user can retry
    } finally {
      setIeprSaving(prev => { const s = new Set(prev); s.delete(doc.id); return s })
    }
  }, [])

  const fetchTaxPayable = useCallback(async () => {
    setLoadingTax(true)
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)
      params.set('payrollType', taxFilter)
      const res = await fetch(`/api/payroll/tax-payable?${params}`)
      setTaxPayableEntries(await res.json())
    } catch { setTaxPayableEntries([]) }
    finally { setLoadingTax(false) }
  }, [branch, taxFilter])

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
  }, [mainTab, taxFilter, fetchTaxPayable, fetchTaxPayments, fetchTaxSettings])

  // Fetch consultant salaries payable
  const fetchSalariesPayable = useCallback(async () => {
    setLoadingSalPayable(true)
    try {
      const params = new URLSearchParams({ payrollType: 'CONSULTANT' })
      if (branch) params.set('branch', branch)
      if (showSalRemitted) params.set('showRemitted', 'true')
      const res = await fetch(`/api/payroll/salaries-payable?${params}`)
      setSalariesPayables(await res.json())
    } catch { setSalariesPayables([]) }
    finally { setLoadingSalPayable(false) }
  }, [branch, showSalRemitted])

  // Fetch employee salaries payable
  const fetchEmpSalPayable = useCallback(async () => {
    setLoadingEmpSalPayable(true)
    try {
      const params = new URLSearchParams({ payrollType: 'EMPLOYEE' })
      if (branch) params.set('branch', branch)
      if (showEmpSalRemitted) params.set('showRemitted', 'true')
      const res = await fetch(`/api/payroll/salaries-payable?${params}`)
      setEmpSalPayables(await res.json())
    } catch { setEmpSalPayables([]) }
    finally { setLoadingEmpSalPayable(false) }
  }, [branch, showEmpSalRemitted])

  // Fetch benefits payable
  const fetchBenefitsPayable = useCallback(async () => {
    setLoadingBenPayable(true)
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)
      if (showBenRemitted) params.set('showRemitted', 'true')
      const res = await fetch(`/api/payroll/benefits-payable?${params}`)
      setBenefitsPayables(await res.json())
    } catch { setBenefitsPayables([]) }
    finally { setLoadingBenPayable(false) }
  }, [branch, showBenRemitted])

  // Fetch COA mapping
  const fetchCoaMapping = useCallback(async () => {
    try {
      const res = await fetch('/api/payroll/coa-mapping')
      const data = await res.json()
      setCoaMapping(data)
    } catch {}
  }, [])

  useEffect(() => {
    if (mainTab === 'salaries-payable') {
      fetchSalariesPayable()
      fetchEmpSalPayable()
      fetch('/api/payroll/salary-payments?paymentType=CONSULTANT')
        .then(r => r.json()).then(setSalaryPayments).catch(() => setSalaryPayments([]))
    }
  }, [mainTab, fetchSalariesPayable, fetchEmpSalPayable])

  useEffect(() => {
    if (mainTab === 'salaries-payable') fetchEmpSalPayable()
  }, [showEmpSalRemitted]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mainTab === 'benefits-payable') fetchBenefitsPayable()
  }, [mainTab, fetchBenefitsPayable])

  useEffect(() => {
    if (mainTab === 'payroll-settings') fetchCoaMapping()
  }, [mainTab, fetchCoaMapping])

  // IE / PR: re-fetch whenever the user switches to the relevant sub-tab
  useEffect(() => {
    if (mainTab !== 'consultants') return
    if (subTab === 'initial-eval')    fetchIEPR('INITIAL_EVALUATION')
    if (subTab === 'progress-report') fetchIEPR('PROGRESS_REPORT')
  }, [mainTab, subTab, fetchIEPR])

  useEffect(() => {
    fetchAllAccounts()
    fetchIncentiveRules()
  }, [fetchAllAccounts, fetchIncentiveRules])

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

  /* ── Lock and Finalize ── */
  const lockAndFinalize = async (payrollType: 'CONSULTANT' | 'EMPLOYEE') => {
    if (!confirm(`Lock and finalize all ${payrollType === 'CONSULTANT' ? 'consultant' : 'employee'} payslips for ${cutoffPeriod} — ${branch || 'all branches'}? This cannot be undone.`)) return
    setFinalizing(true)
    try {
      // Consultant payroll: save a fresh FINAL snapshot from live orders before locking,
      // so Lock can never freeze stale items left behind by an un-saved Re-run.
      if (payrollType === 'CONSULTANT') {
        const lockBranch = branch || 'SBEA'
        const customDates = computeCustomDates(payrollSettings, cutoffYear, cutoffMonth, cutoffHalf)
        const freshParams = new URLSearchParams({ cutoffPeriod, branch: lockBranch })
        freshParams.set('dateFrom', customDates.start.toISOString())
        freshParams.set('dateTo', customDates.end.toISOString())
        const freshRes = await fetch(`/api/payroll/generate?${freshParams}`)
        if (freshRes.ok) {
          const freshData = await freshRes.json()
          const freshPreviews = (freshData.payrolls || []) as PayrollPreview[]
          const entries = freshPreviews
            .filter(p => p.existingStatus !== 'LOCKED')
            .map(p => buildEntry(
              p,
              // undefined ⇒ state never loaded for this consultant ⇒ use stored.
              // [] ⇒ user intentionally cleared ⇒ honour the empty.
              extraUnitPays[p.consultantId] !== undefined
                ? extraUnitPays[p.consultantId]
                : ((p.storedExtraItems as unknown as ExtraUnitPayLine[]) || []),
              adjustments[p.consultantId] !== undefined
                ? adjustments[p.consultantId]
                : ((p.storedAdjustments as unknown as AdjustmentLine[]) || []),
              'FINAL'
            ))
          if (entries.length > 0) {
            await fetch('/api/payroll/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cutoffPeriod, branch: lockBranch, entries }),
            })
          }
        }
      }

      const res = await fetch('/api/payroll/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoffPeriod, branch: branch || 'SBEA', payrollType }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to finalize'); return }
      setError('')
      alert(`Payroll locked! ${data.lockedCount} payslips finalized. Journal entry created.`)
      // Refresh data and restore adjustments from DB
      if (payrollType === 'CONSULTANT') {
        const previewRes = await fetch(`/api/payroll/generate?cutoffPeriod=${cutoffPeriod}&branch=${branch || 'SBEA'}`)
        if (previewRes.ok) {
          const d = await previewRes.json()
          const payrolls: PayrollPreview[] = d.payrolls || []
          setPayrollPreviews(payrolls)
          const newAdj: Record<string, AdjustmentLine[]> = {}
          const newExtra: Record<string, ExtraUnitPayLine[]> = {}
          for (const p of payrolls) {
            if (p.storedAdjustments?.length) newAdj[p.consultantId] = p.storedAdjustments as AdjustmentLine[]
            if (p.storedExtraItems?.length) newExtra[p.consultantId] = p.storedExtraItems as ExtraUnitPayLine[]
          }
          setAdjustments(newAdj)
          setExtraUnitPays(newExtra)
        }
      }
    } catch (e) { setError(String(e)) }
    finally { setFinalizing(false) }
  }

  /* ── Unlock payroll ── */
  const [unlocking, setUnlocking] = useState(false)
  const unlockPayroll = async (payrollType: 'CONSULTANT' | 'EMPLOYEE') => {
    if (!confirm(`Unlock ${payrollType === 'CONSULTANT' ? 'consultant' : 'employee'} payslips for ${cutoffPeriod} — ${branch || 'all branches'}? This will delete the journal entry and allow editing again.`)) return
    setUnlocking(true)
    try {
      const res = await fetch('/api/payroll/finalize', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoffPeriod, branch: branch || 'SBEA', payrollType }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to unlock'); return }
      setError('')
      alert('Payroll unlocked. Payslips are now editable again.')
      if (payrollType === 'CONSULTANT') {
        const previewRes = await fetch(`/api/payroll/generate?cutoffPeriod=${cutoffPeriod}&branch=${branch || 'SBEA'}`)
        if (previewRes.ok) {
          const d = await previewRes.json()
          const payrolls: PayrollPreview[] = d.payrolls || []
          setPayrollPreviews(payrolls)
          const newAdj: Record<string, AdjustmentLine[]> = {}
          const newExtra: Record<string, ExtraUnitPayLine[]> = {}
          for (const p of payrolls) {
            if (p.storedAdjustments?.length) newAdj[p.consultantId] = p.storedAdjustments as AdjustmentLine[]
            if (p.storedExtraItems?.length) newExtra[p.consultantId] = p.storedExtraItems as ExtraUnitPayLine[]
          }
          setAdjustments(newAdj)
          setExtraUnitPays(newExtra)
        }
      }
    } catch (e) { setError(String(e)) }
    finally { setUnlocking(false) }
  }

  /* ── Remit payment ── */
  const handleRemit = async () => {
    if (!remitFromAccountId) return
    // For salary modal: use whichever subtab is active
    const isEmpSalary = showRemitModal === 'salary' && salPayableSubTab === 'employees'
    const ids = showRemitModal === 'salary'
      ? (isEmpSalary ? selectedEmpSalPayableIds : selectedSalaryPayableIds)
      : selectedBenefitPayableIds
    if (!ids.length) return
    setRemitting(true)
    try {
      let proofFinalUrl = remitProofUrl
      if (remitProofFile) {
        setRemitUploading(true)
        const fd = new FormData()
        fd.append('file', remitProofFile)
        const upRes = await fetch('/api/upload', { method: 'POST', body: fd })
        const upData = await upRes.json()
        proofFinalUrl = upData.url || upData.fileUrl || ''
        setRemitUploading(false)
      }

      const endpoint = showRemitModal === 'salary' ? '/api/payroll/salary-payments' : '/api/payroll/benefit-payments'
      const hasFee = showRemitModal === 'salary' && Number(remitFeeAmount) > 0

      let bodyIds: Record<string, string[]>
      if (showRemitModal === 'benefit') {
        bodyIds = { employeePayslipIds: ids }
      } else if (isEmpSalary) {
        bodyIds = { employeePayslipIds: ids }
      } else {
        bodyIds = { payrollEntryIds: ids }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bodyIds,
          paymentDate: remitDate,
          fromAccountId: remitFromAccountId,
          proofUrl: proofFinalUrl || null,
          notes: remitNotes || null,
          ...(hasFee ? {
            feeAmount: Number(remitFeeAmount),
            feeExpenseAccountId: remitFeeExpenseAccountId || null,
            feeCashAccountId: remitFeeCashAccountId || remitFromAccountId,
          } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to record payment'); return }
      setShowRemitModal(null)
      setRemitProofFile(null)
      setRemitProofFileName('')
      setSelectedSalaryPayableIds([])
      setSelectedEmpSalPayableIds([])
      setSelectedBenefitPayableIds([])
      if (mainTab === 'salaries-payable') { fetchSalariesPayable(); fetchEmpSalPayable() }
      if (mainTab === 'benefits-payable') fetchBenefitsPayable()
    } catch (e) { setError(String(e)) }
    finally { setRemitting(false); setRemitUploading(false) }
  }

  /* ── Record tax as Other Income ── */
  const [recordingOtherIncome, setRecordingOtherIncome] = useState(false)
  const recordTaxAsOtherIncome = async () => {
    if (!selectedTaxIds.length) return
    setRecordingOtherIncome(true)
    try {
      const res = await fetch('/api/payroll/tax-payments/other-income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payrollEntryIds: selectedTaxIds, paymentType: taxFilter }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to record as other income'); return }
      setSelectedTaxIds([])
      await fetchTaxPayable()
      await fetchTaxPayments()
    } catch { setError('Failed to record as other income') }
    finally { setRecordingOtherIncome(false) }
  }

  /* ── Save edited payment (tax or salary) ── */
  const saveEditPayment = async () => {
    if (!editPayment) return
    setEditPaymentSaving(true)
    try {
      let proofFinalUrl = editPayment.proofUrl
      if (editProofFile) {
        const fd = new FormData()
        fd.append('file', editProofFile)
        const upRes = await fetch('/api/upload', { method: 'POST', body: fd })
        const upData = await upRes.json()
        proofFinalUrl = upData.url || upData.fileUrl || proofFinalUrl
      }
      const url = editPayment.type === 'tax' ? '/api/payroll/tax-payments' : '/api/payroll/salary-payments'
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editPayment.id, paymentDate: editPayment.paymentDate, proofUrl: proofFinalUrl || null, notes: editPayment.notes || null }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to save'); return }
      setEditPayment(null)
      setEditProofFile(null)
      setEditProofFileName('')
      setEditPaymentConfirmReverse(false)
      if (editPayment.type === 'tax') await fetchTaxPayments()
      else {
        fetch('/api/payroll/salary-payments?paymentType=CONSULTANT')
          .then(r => r.json()).then(setSalaryPayments).catch(() => setSalaryPayments([]))
      }
    } catch { setError('Failed to save payment') }
    finally { setEditPaymentSaving(false) }
  }

  /* ── Reverse remittance ── */
  const reversePayment = async () => {
    if (!editPayment) return
    setReversingPayment(true)
    try {
      const url = editPayment.type === 'tax' ? `/api/payroll/tax-payments?id=${editPayment.id}` : `/api/payroll/salary-payments?id=${editPayment.id}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to reverse remittance'); return }
      setEditPayment(null)
      setEditProofFile(null)
      setEditProofFileName('')
      setEditPaymentConfirmReverse(false)
      if (editPayment.type === 'tax') {
        await fetchTaxPayable()
        await fetchTaxPayments()
      } else {
        fetchSalariesPayable()
        fetchEmpSalPayable()
        fetch('/api/payroll/salary-payments?paymentType=CONSULTANT')
          .then(r => r.json()).then(setSalaryPayments).catch(() => setSalaryPayments([]))
      }
    } catch { setError('Failed to reverse remittance') }
    finally { setReversingPayment(false) }
  }

  /* ── Save COA mapping ── */
  const saveCoaMapping = async () => {
    setSavingCoa(true)
    try {
      // Merge existing mapping IDs with new edits so we don't overwrite previously saved fields
      const allKeys = [
        'salaryExpenseAccountId', 'professionalFeesAccountId', 'sssERAccountId',
        'hdmfERAccountId', 'philhealthERAccountId', 'salariesPayableAccountId',
        'benefitsPayableAccountId', 'taxPayableAccountId',
      ]
      const merged: Record<string, string | null> = {}
      for (const key of allKeys) {
        merged[key] = coaEdits[key] ?? coaMapping[key] ?? null
      }
      const res = await fetch('/api/payroll/coa-mapping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      })
      if (res.ok) {
        const data = await res.json()
        setCoaMapping(data)
        setCoaEdits({})
      }
    } catch {}
    finally { setSavingCoa(false) }
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

  const bulkApplicableUPs = unitPays.filter(up =>
    bulkDept && ((up.departments as string[])?.length === 0 || (up.departments as string[])?.includes(bulkDept))
  )

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
    const rateMap: Record<string, { amount: number; disabled: boolean; thresholdEnabled: boolean; thresholdAmount: number | null; reducedAmount: number | null }> = {}
    for (const r of c.unitPayRates) rateMap[r.unitPayId] = {
      amount: toNum(r.amount),
      disabled: r.disabled || false,
      thresholdEnabled: r.thresholdEnabled || false,
      thresholdAmount: r.thresholdAmount != null ? toNum(r.thresholdAmount) : null,
      reducedAmount: r.reducedAmount != null ? toNum(r.reducedAmount) : null,
    }
    setEditingRates(rateMap)
    setEditingTax(c.taxDeduction)
    setEditingRetainer(String(toNum(c.monthlyRetainer)))
    setEditingBirAddress(c.birAddress || '')
  }

  const fetchClinicianPastPayslips = async (consultantId: string) => {
    if (showClinicianPayslips === consultantId) { setShowClinicianPayslips(null); return }
    setShowClinicianPayslips(consultantId)
    setLoadingClinicianPayslips(true)
    try {
      const r = await fetch(`/api/payroll/consultant-payslips?consultantId=${consultantId}`)
      const d = await r.json()
      setClinicianPastPayslips(Array.isArray(d) ? d : [])
    } catch { setClinicianPastPayslips([]) }
    finally { setLoadingClinicianPayslips(false) }
  }

  const saveConsultantConfig = async (c: Consultant) => {
    setSavingConsultant(true)
    try {
      const unitPayRates = Object.entries(editingRates)
        .filter(([, r]) => r.amount > 0 || r.disabled)
        .map(([unitPayId, r]) => ({
          unitPayId,
          amount: r.amount,
          disabled: r.disabled,
          thresholdEnabled: r.thresholdEnabled || false,
          thresholdAmount: r.thresholdAmount ?? null,
          reducedAmount: r.reducedAmount ?? null,
        }))
      await fetch('/api/payroll/consultants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, taxDeduction: editingTax, monthlyRetainer: parseFloat(editingRetainer) || 0, birAddress: editingBirAddress, unitPayRates }),
      })
      await fetchConsultants()
    } catch { setError('Failed to save') }
    finally { setSavingConsultant(false) }
  }

  async function applyBulkUnitPay() {
    if (!bulkDept || !bulkUnitPayId || !bulkAmount) return
    const numAmount = parseFloat(bulkAmount)
    if (!Number.isFinite(numAmount) || numAmount < 0) { setError('Amount must be a non-negative number'); return }
    setBulkApplying(true); setError(''); setBulkResult(null)
    try {
      const res = await fetch('/api/payroll/consultants/bulk-unit-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: bulkDept, unitPayId: bulkUnitPayId, amount: numAmount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setBulkResult(`Updated ${data.updated} clinician(s)`)
      setBulkAmount('')
      await fetchConsultants()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to apply bulk rate') }
    finally { setBulkApplying(false) }
  }

  /* ── Threshold rules ── */
  const fetchThresholdRules = useCallback(async () => {
    setTrLoading(true)
    try {
      const res = await fetch('/api/payroll/threshold-rules')
      const data = await res.json()
      setThresholdRules(data.rules || [])
    } catch { /* ignore */ }
    finally { setTrLoading(false) }
  }, [])

  useEffect(() => { if (subTab === 'pay-rules') fetchThresholdRules() }, [subTab, fetchThresholdRules])

  const saveThresholdRule = async () => {
    if (!trUnitPayId || !trThreshold || !trReduced || !trSelectedConsultants.length) { setError('All fields and at least one clinician are required'); return }
    setTrSaving(true); setError('')
    try {
      const res = await fetch('/api/payroll/threshold-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitPayId: trUnitPayId, thresholdAmount: parseFloat(trThreshold), reducedAmount: parseFloat(trReduced), consultantIds: trSelectedConsultants }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setTrFormOpen(false); setTrUnitPayId(''); setTrThreshold(''); setTrReduced(''); setTrSelectedConsultants([])
      // Refetch consultants so the Clinician List reflects the new threshold settings
      // (prevents stale expand→save from wiping the threshold)
      await Promise.all([fetchThresholdRules(), fetchConsultants()])
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to save rule') }
    finally { setTrSaving(false) }
  }

  const deleteThresholdRule = async (unitPayId: string, consultantIds?: string[]) => {
    if (!confirm('Remove this threshold rule?')) return
    try {
      const res = await fetch('/api/payroll/threshold-rules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitPayId, consultantIds }),
      })
      if (!res.ok) throw new Error('Failed')
      // Refetch consultants too so expand→save won't incorrectly restore a deleted threshold
      await Promise.all([fetchThresholdRules(), fetchConsultants()])
    } catch { setError('Failed to remove rule') }
  }

  /* ── Unit Pay CRUD ── */
  const openUPCreate = () => { setEditingUnitPay(null); setUpName(''); setUpDepts([]); setUpExpenseAccountId(''); setUpExpenseSearch(''); setShowUnitPayForm(true); setError('') }
  const saveIncentiveRule = async () => {
    if (!incForm.name.trim()) { setError('Name is required'); return }
    if (incForm.threshold < 1) { setError('Threshold must be at least 1'); return }
    if (incForm.bonusPerUnit <= 0) { setError('Bonus per unit must be greater than 0'); return }
    setSavingInc(true); setError('')
    try {
      const body = {
        ...incForm,
        ...(editingIncentive ? { id: editingIncentive.id } : {}),
      }
      const res = await fetch('/api/payroll/incentives', {
        method: editingIncentive ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setShowIncentiveForm(false)
        setEditingIncentive(null)
        fetchIncentiveRules()
      } else {
        const d = await res.json()
        setError(d.error || 'Failed to save')
      }
    } catch { setError('Network error') }
    finally { setSavingInc(false) }
  }

  const deleteIncentiveRule = async (id: string) => {
    if (!window.confirm('Delete this incentive rule?')) return
    await fetch('/api/payroll/incentives', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchIncentiveRules()
  }

  const openIncCreate = () => {
    setEditingIncentive(null)
    setIncForm({ name: '', description: '', threshold: 7, bonusPerUnit: 20, departments: [], branch: '', isActive: true })
    setShowIncentiveForm(true)
    setError('')
  }

  const openIncEdit = (rule: IncentiveRule) => {
    setEditingIncentive(rule)
    setIncForm({
      name: rule.name,
      description: rule.description || '',
      threshold: rule.threshold,
      bonusPerUnit: Number(rule.bonusPerUnit),
      departments: rule.departments || [],
      branch: rule.branch || '',
      isActive: rule.isActive,
    })
    setShowIncentiveForm(true)
    setError('')
  }

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
  const generatePayslips = async (resetExtras = false) => {
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
      const payrolls: PayrollPreview[] = data.payrolls || []
      setPayrollPreviews(payrolls)
      setGeneratedDateRange({ start: customDates.start.toISOString(), end: customDates.end.toISOString() })
      if (resetExtras) {
        // User clicked Generate — fresh slate
        setExtraUnitPays({})
        setAdjustments({})
      } else {
        // Restore saved adjustments/extras from DB
        const newAdj: Record<string, AdjustmentLine[]> = {}
        const newExtra: Record<string, ExtraUnitPayLine[]> = {}
        for (const p of payrolls) {
          if (p.storedAdjustments?.length) newAdj[p.consultantId] = p.storedAdjustments as AdjustmentLine[]
          if (p.storedExtraItems?.length) newExtra[p.consultantId] = p.storedExtraItems as ExtraUnitPayLine[]
        }
        setAdjustments(newAdj)
        setExtraUnitPays(newExtra)
      }
    } catch { setError('Failed to generate') }
    finally { setGenerating(false) }
  }

  const saveInlineBirAddress = async (consultantId: string) => {
    setSavingInlineBir(true)
    try {
      const res = await fetch('/api/payroll/consultants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: consultantId, birAddress: inlineBirValue }),
      })
      if (res.ok) {
        // Update local state without full refetch
        setConsultants(prev => prev.map(c =>
          c.id === consultantId ? { ...c, birAddress: inlineBirValue || null } : c
        ))
      }
    } catch { /* ignore */ }
    finally {
      setSavingInlineBir(false)
      setInlineBirEditId(null)
    }
  }

  const generatePayreg = async () => {
    try {
      const XLSX = await import('xlsx')
      const cutoffLabel = getCutoffLabel(cutoffPeriod)
      const rows = payrollPreviews.filter(p => p.grossPay > 0 || p.orderCount > 0 || p.existingStatus !== null)

      // ── Consultant sheet ──────────────────────────────────
      const consultantHeaders = [
        'PAYROLL DATE', 'LOCATION', 'ID NO', 'NAME',
        'GROSS PAY', 'TAXABLE ADJUSTMENT', 'TAXABLE AMOUNT BEFORE TAX',
        'EXPANDED WITHHOLDING TAX AMOUNT', 'TAXABLE AMOUNT AFTER TAX',
        'NON TAXABLE ADJUSTMENT', 'TOTAL NET PAY', 'TIN NUMBER', 'ADDRESS',
      ]

      // 3 blank rows on top to match the template layout, then header
      const consultantData: (string | number)[][] = [[], [], [], consultantHeaders]

      let totGross = 0, totTaxAdj = 0, totTaxableBefore = 0, totEWT = 0
      let totTaxableAfter = 0, totNonTaxAdj = 0, totNet = 0

      for (const p of rows) {
        const extras = extraUnitPays[p.consultantId] !== undefined
          ? extraUnitPays[p.consultantId]
          : ((p.storedExtraItems as unknown as ExtraUnitPayLine[]) || [])
        const adjs = adjustments[p.consultantId] !== undefined
          ? adjustments[p.consultantId]
          : ((p.storedAdjustments as unknown as AdjustmentLine[]) || [])
        const t = computeTotals(p, extras, adjs)
        const consultant = consultants.find(c => c.id === p.consultantId)
        const taxableAfter = t.taxableBase - t.tax

        totGross += t.gross; totTaxAdj += t.taxedAdj
        totTaxableBefore += t.taxableBase; totEWT += t.tax
        totTaxableAfter += taxableAfter; totNonTaxAdj += t.nonTaxedAdj; totNet += t.net

        consultantData.push([
          cutoffLabel, p.branch, consultant?.bioId ?? '', p.consultantName,
          Math.round(t.gross * 100) / 100,
          Math.round(t.taxedAdj * 100) / 100,
          Math.round(t.taxableBase * 100) / 100,
          Math.round(t.tax * 100) / 100,
          Math.round(taxableAfter * 100) / 100,
          Math.round(t.nonTaxedAdj * 100) / 100,
          Math.round(t.net * 100) / 100,
          consultant?.tinNumber || '',
          consultant?.birAddress || '',
        ])
      }

      // TOTAL row
      consultantData.push([
        'TOTAL', '', '', '',
        Math.round(totGross * 100) / 100,
        Math.round(totTaxAdj * 100) / 100,
        Math.round(totTaxableBefore * 100) / 100,
        Math.round(totEWT * 100) / 100,
        Math.round(totTaxableAfter * 100) / 100,
        Math.round(totNonTaxAdj * 100) / 100,
        Math.round(totNet * 100) / 100,
        '', '',
      ])

      const wsConsultant = XLSX.utils.aoa_to_sheet(consultantData)
      wsConsultant['!cols'] = [
        { wch: 28 }, { wch: 10 }, { wch: 6 }, { wch: 30 },
        { wch: 14 }, { wch: 20 }, { wch: 26 }, { wch: 34 },
        { wch: 26 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 40 },
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, wsConsultant, 'Consultant')

      const labelSafe = cutoffLabel.replace(/[^a-zA-Z0-9-]/g, '_')
      XLSX.writeFile(wb, `payreg_${labelSafe}${branch ? '_' + branch : ''}.xlsx`)
    } catch (e) { alert('Failed to generate payreg: ' + (e instanceof Error ? e.message : String(e))) }
  }

  const exportPayrollXlsx = async () => {
    try {
      const XLSX = await import('xlsx')
      const cutoffLabel = getCutoffLabel(cutoffPeriod)
      // Include anyone who has numbers this cutoff
      const rows = payrollPreviews.filter(p => p.grossPay > 0 || p.orderCount > 0 || p.existingStatus !== null)

      const headers = [
        'PAYROLL DATE', 'LOCATION', 'ID NO', 'NAME',
        'GROSS PAY', 'TAXABLE ADJUSTMENT', 'TAXABLE AMOUNT BEFORE TAX',
        'EXPANDED WITHHOLDING TAX AMOUNT', 'TAXABLE AMOUNT AFTER TAX',
        'NON TAXABLE ADJUSTMENT', 'TOTAL NET PAY', 'TIN NUMBER', 'ADDRESS',
      ]

      const sheetData: (string | number)[][] = [headers]

      let totGross = 0, totTaxAdj = 0, totTaxableBefore = 0, totEWT = 0
      let totTaxableAfter = 0, totNonTaxAdj = 0, totNet = 0
      let idNo = 1

      for (const p of rows) {
        const extras = extraUnitPays[p.consultantId] !== undefined
          ? extraUnitPays[p.consultantId]
          : ((p.storedExtraItems as unknown as ExtraUnitPayLine[]) || [])
        const adjs = adjustments[p.consultantId] !== undefined
          ? adjustments[p.consultantId]
          : ((p.storedAdjustments as unknown as AdjustmentLine[]) || [])
        const t = computeTotals(p, extras, adjs)
        const consultant = consultants.find(c => c.id === p.consultantId)
        const taxableAfter = t.taxableBase - t.tax

        totGross += t.gross
        totTaxAdj += t.taxedAdj
        totTaxableBefore += t.taxableBase
        totEWT += t.tax
        totTaxableAfter += taxableAfter
        totNonTaxAdj += t.nonTaxedAdj
        totNet += t.net

        sheetData.push([
          cutoffLabel,
          p.branch,
          idNo++,
          p.consultantName,
          Math.round(t.gross * 100) / 100,
          Math.round(t.taxedAdj * 100) / 100,
          Math.round(t.taxableBase * 100) / 100,
          Math.round(t.tax * 100) / 100,
          Math.round(taxableAfter * 100) / 100,
          Math.round(t.nonTaxedAdj * 100) / 100,
          Math.round(t.net * 100) / 100,
          consultant?.tinNumber || '',
          consultant?.birAddress || '',
        ])
      }

      // TOTAL row
      sheetData.push([
        'TOTAL', '', '', '',
        Math.round(totGross * 100) / 100,
        Math.round(totTaxAdj * 100) / 100,
        Math.round(totTaxableBefore * 100) / 100,
        Math.round(totEWT * 100) / 100,
        Math.round(totTaxableAfter * 100) / 100,
        Math.round(totNonTaxAdj * 100) / 100,
        Math.round(totNet * 100) / 100,
        '', '',
      ])

      const ws = XLSX.utils.aoa_to_sheet(sheetData)

      // Column widths
      ws['!cols'] = [
        { wch: 28 }, // PAYROLL DATE
        { wch: 10 }, // LOCATION
        { wch: 6 },  // ID NO
        { wch: 30 }, // NAME
        { wch: 14 }, // GROSS PAY
        { wch: 20 }, // TAXABLE ADJUSTMENT
        { wch: 26 }, // TAXABLE AMOUNT BEFORE TAX
        { wch: 34 }, // EXPANDED WITHHOLDING TAX AMOUNT
        { wch: 26 }, // TAXABLE AMOUNT AFTER TAX
        { wch: 22 }, // NON TAXABLE ADJUSTMENT
        { wch: 14 }, // TOTAL NET PAY
        { wch: 18 }, // TIN NUMBER
        { wch: 40 }, // ADDRESS
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Consultant')

      const labelSafe = cutoffLabel.replace(/[^a-zA-Z0-9-]/g, '_')
      XLSX.writeFile(wb, `payroll_${labelSafe}${branch ? '_' + branch : ''}.xlsx`)
    } catch { alert('Failed to export payroll') }
  }

  const buildEntry = (p: PayrollPreview, extras: ExtraUnitPayLine[], adjs: AdjustmentLine[], status: string) => {
    const t = computeTotals(p, extras, adjs)
    return {
      consultantId: p.consultantId, branch: p.branch,
      // items = order-derived lines only. extras live separately in extraItems.
      // Merging them into items caused double-display (items list + extras list)
      // and double-counting in computeTotals on LOCKED reloads.
      items: [...p.items],
      extraItems: extras,
      adjustments: adjs,
      incentives: p.incentives || [],
      incentiveTotal: p.incentiveTotal ?? 0,
      grossPay: t.gross, retainerAmount: p.retainerAmount, taxAmount: t.tax, netPay: t.net, status,
    }
  }

  const savePayslips = async () => {
    setSaving(true)
    try {
      const entries = payrollPreviews.filter(p => p.existingStatus !== 'LOCKED').map(p =>
        buildEntry(p, extraUnitPays[p.consultantId] || [], adjustments[p.consultantId] || [], 'DRAFT')
      )
      if (entries.length === 0) return
      await fetch('/api/payroll/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cutoffPeriod, branch, entries }) })
      await generatePayslips()
    } catch { setError('Failed to save') }
    finally { setSaving(false) }
  }

  const createBankFile = async (type: 'CONSULTANT' | 'EMPLOYEE') => {
    if (!cutoffPeriod) { setError('Select a cutoff period first'); return }
    const params = new URLSearchParams({ cutoffPeriod, payrollType: type })
    if (branch) params.set('branch', branch)
    const url = `/api/payroll/bank-file?${params}`
    const res = await fetch(url)
    if (!res.ok) { setError('Failed to generate bank file'); return }
    const text = await res.text()
    const blob = new Blob([text], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bank-${type.toLowerCase()}-${cutoffPeriod}${branch ? `-${branch}` : ''}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const saveSingleConsultant = async (cid: string) => {
    const p = payrollPreviews.find(pr => pr.consultantId === cid)
    if (!p || p.existingStatus === 'LOCKED') return
    // Use state if it has been populated (undefined ⇒ never-loaded, fall back
    // to stored). An empty array [] is treated as an intentional removal and
    // kept as-is, so the user can delete all extras via the UI.
    const extras = extraUnitPays[cid] !== undefined
      ? extraUnitPays[cid]
      : ((p.storedExtraItems as unknown as ExtraUnitPayLine[]) || [])
    const adjs = adjustments[cid] !== undefined
      ? adjustments[cid]
      : ((p.storedAdjustments as unknown as AdjustmentLine[]) || [])
    const status = p.existingStatus === 'FINAL' ? 'FINAL' : 'DRAFT'
    setSavingMap(prev => ({ ...prev, [cid]: true }))
    try {
      await fetch('/api/payroll/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoffPeriod, branch, entries: [buildEntry(p, extras, adjs, status)] }),
      })
      setSavedMap(prev => ({ ...prev, [cid]: true }))
      setTimeout(() => setSavedMap(prev => ({ ...prev, [cid]: false })), 2500)
      // Update local existingStatus so consultant stays visible in the list
      setPayrollPreviews(prev => prev.map(pr =>
        pr.consultantId === cid ? { ...pr, existingStatus: pr.existingStatus || 'DRAFT' } : pr
      ))
    } catch { setError('Failed to save') }
    finally { setSavingMap(prev => ({ ...prev, [cid]: false })) }
  }

  /* ── Per-consultant Lock (→ FINAL) ── */
  const lockSingleConsultant = async (cid: string) => {
    const p = payrollPreviews.find(pr => pr.consultantId === cid)
    if (!p) return
    if (p.existingStatus === 'LOCKED') { setError('Cannot modify a locked payslip. Unlock the consultant first.'); return }
    // Same rule as saveSingleConsultant: undefined ⇒ use stored, [] ⇒ honour
    // intentional removal.
    const extras = extraUnitPays[cid] !== undefined
      ? extraUnitPays[cid]
      : ((p.storedExtraItems as unknown as ExtraUnitPayLine[]) || [])
    const adjs = adjustments[cid] !== undefined
      ? adjustments[cid]
      : ((p.storedAdjustments as unknown as AdjustmentLine[]) || [])
    setLockingMap(prev => ({ ...prev, [cid]: true }))
    try {
      // Save current state as FINAL
      await fetch('/api/payroll/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoffPeriod, branch, entries: [buildEntry(p, extras, adjs, 'FINAL')] }),
      })
      setPayrollPreviews(prev => prev.map(pr =>
        pr.consultantId === cid ? { ...pr, existingStatus: 'FINAL' } : pr
      ))
    } catch { setError('Failed to lock') }
    finally { setLockingMap(prev => ({ ...prev, [cid]: false })) }
  }

  /* ── Per-consultant Unlock (→ DRAFT) ── */
  const unlockSingleConsultant = async (cid: string) => {
    const p = payrollPreviews.find(pr => pr.consultantId === cid)
    if (!p) return
    if (!confirm(`Unlock ${p.consultantName}? This will allow re-editing their payslip.`)) return
    setUnlockingMap(prev => ({ ...prev, [cid]: true }))
    try {
      const res = await fetch('/api/payroll/generate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoffPeriod, branch: branch || p.branch || '', consultantId: cid, action: 'unlock' }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to unlock'); return }
      setPayrollPreviews(prev => prev.map(pr =>
        pr.consultantId === cid ? { ...pr, existingStatus: 'DRAFT' } : pr
      ))
    } catch { setError('Failed to unlock') }
    finally { setUnlockingMap(prev => ({ ...prev, [cid]: false })) }
  }

  /* ── Per-consultant Re-run (refresh from POS orders) ── */
  const rerunSingleConsultant = async (cid: string) => {
    setRerunningMap(prev => ({ ...prev, [cid]: true }))
    try {
      const params = new URLSearchParams({ cutoffPeriod, consultantId: cid })
      // Match the date range used by Generate Payslip so per-consultant Re-run
      // returns the same numbers as the main generate flow.
      const customDates = computeCustomDates(payrollSettings, cutoffYear, cutoffMonth, cutoffHalf)
      params.set('dateFrom', customDates.start.toISOString())
      params.set('dateTo', customDates.end.toISOString())
      if (branch) params.set('branch', branch)
      const res = await fetch(`/api/payroll/generate?${params}`)
      if (res.ok) {
        const d = await res.json()
        const fresh: PayrollPreview | undefined = d.payrolls?.[0]
        if (fresh) {
          setPayrollPreviews(prev => prev.map(pr =>
            pr.consultantId === cid ? { ...fresh, existingStatus: pr.existingStatus } : pr
          ))
        }
      }
    } catch { setError('Failed to re-run') }
    finally { setRerunningMap(prev => ({ ...prev, [cid]: false })) }
  }

  const finalizeConsultantPayslips = async () => {
    setSaving(true)
    try {
      const entries = payrollPreviews.filter(p => p.existingStatus === 'DRAFT').map(p =>
        buildEntry(p, extraUnitPays[p.consultantId] || [], adjustments[p.consultantId] || [], 'FINAL')
      )
      if (entries.length === 0) return
      await fetch('/api/payroll/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cutoffPeriod, branch, entries }) })
      await generatePayslips()
    } catch { setError('Failed to finalize') }
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
    // Store PDF server-side
    try {
      const pdfBase64 = doc.output('datauristring')
      await fetch('/api/payroll/payslip-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'consultant', pdfBase64, consultantId: p.consultantId, cutoffPeriod, branch: p.branch }),
      })
    } catch (e) { console.error('PDF storage error:', e) }
  }

  // Minimal in-browser ZIP writer (STORE method — PDFs are already compressed).
  const makeZipBlob = (files: { name: string; data: Uint8Array }[]): Blob => {
    const crcTable = (() => {
      const t = new Uint32Array(256)
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0 }
      return t
    })()
    const crc32 = (buf: Uint8Array) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
    const enc = new TextEncoder()
    const parts: Uint8Array[] = []
    const central: Uint8Array[] = []
    let offset = 0
    for (const f of files) {
      const nameB = enc.encode(f.name)
      const crc = crc32(f.data)
      const lh = new DataView(new ArrayBuffer(30))
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true); lh.setUint16(8, 0, true)
      lh.setUint16(10, 0, true); lh.setUint16(12, 0, true); lh.setUint32(14, crc, true)
      lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true)
      lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true)
      parts.push(new Uint8Array(lh.buffer), nameB, f.data)
      const ch = new DataView(new ArrayBuffer(46))
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0, true)
      ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0, true); ch.setUint32(16, crc, true)
      ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true)
      ch.setUint16(28, nameB.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true)
      ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true)
      central.push(new Uint8Array(ch.buffer), nameB)
      offset += 30 + nameB.length + f.data.length
    }
    const centralSize = central.reduce((sum, c) => sum + c.length, 0)
    const eocd = new DataView(new ArrayBuffer(22))
    eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true)
    eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true)
    eocd.setUint32(12, centralSize, true); eocd.setUint32(16, offset, true); eocd.setUint16(20, 0, true)
    return new Blob([...parts, ...central, new Uint8Array(eocd.buffer)] as BlobPart[], { type: 'application/zip' })
  }

  const downloadAllPdfs = async () => {
    const active = payrollPreviews.filter(p => (p.grossPay > 0 || p.orderCount > 0 || p.existingStatus !== null) && p.department !== 'ADMINISTRATION')
    if (active.length === 0) return
    setDownloadingAll(true)
    setDownloadPct(0)
    try {
      const files: { name: string; data: Uint8Array }[] = []
      for (let i = 0; i < active.length; i++) {
        const p = active[i]
        try {
          const extras = extraUnitPays[p.consultantId] || []
          const adjs = adjustments[p.consultantId] || []
          const doc = await buildPayslipPdf(p, extras, adjs, cutoffPeriod, generatedDateRange ?? undefined)
          const safeName = p.consultantName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
          files.push({ name: `payslip-${safeName}-${cutoffPeriod}.pdf`, data: new Uint8Array(doc.output('arraybuffer') as ArrayBuffer) })
          // Keep the server-side copy used by the my-payslips portal
          try {
            const pdfBase64 = doc.output('datauristring')
            await fetch('/api/payroll/payslip-pdf', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'consultant', pdfBase64, consultantId: p.consultantId, cutoffPeriod, branch: p.branch }),
            })
          } catch (e) { console.error('PDF storage error:', e) }
        } catch (e) { console.error('PDF error for', p.consultantName, e) }
        setDownloadPct(Math.round(((i + 1) / active.length) * 100))
      }
      if (files.length > 0) {
        const url = URL.createObjectURL(makeZipBlob(files))
        const a = document.createElement('a')
        a.href = url
        a.download = `consultant-payslips-${cutoffPeriod}.zip`
        document.body.appendChild(a); a.click(); a.remove()
        URL.revokeObjectURL(url)
      }
    } finally {
      setDownloadingAll(false)
      setDownloadPct(0)
    }
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

      // Store PDF server-side
      try {
        await fetch('/api/payroll/payslip-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'consultant', pdfBase64, consultantId: p.consultantId, cutoffPeriod, branch: p.branch }),
        })
      } catch (e) { console.error('PDF storage error:', e) }

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
        const text = await sendRes.text()
        let msg = 'Email failed to send'
        try { msg = JSON.parse(text).error || msg } catch { msg = `Email failed (${sendRes.status})` }
        throw new Error(msg)
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

  const emailAllClinicians = async () => {
    setEmailingAll(true)
    const visible = payrollPreviews.filter(p => p.grossPay > 0 || p.orderCount > 0 || p.existingStatus !== null)
    for (const p of visible) {
      try { await emailClinician(p) } catch (e) { console.error('Email error for', p.consultantName, e) }
      await new Promise(r => setTimeout(r, 800))
    }
    setEmailingAll(false)
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
        {(['tax-payable', 'salaries-payable', 'benefits-payable', 'payroll-settings'] as const).map(t => {
          const labels: Record<string, string> = { 'tax-payable': 'Tax Payable', 'salaries-payable': 'Salaries Payable', 'benefits-payable': 'Benefits Payable', 'payroll-settings': 'Payroll Settings' }
          return (
            <button key={t} onClick={() => setMainTab(t)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={mainTab === t ? { background: 'var(--teal)', color: 'white' } : { background: 'var(--off-white)', color: 'var(--charcoal)' }}>
              <Receipt size={16} /> {labels[t]}
            </button>
          )
        })}
      </div>

      {mainTab === 'employees' && (
        <EmployeePayroll canWrite={!!canWrite} branch={branch} cutoffMonth={cutoffMonth} cutoffYear={cutoffYear} cutoffHalf={cutoffHalf} cutoffPeriod={cutoffPeriod} />
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
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowPaymentModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ background: '#c44b00' }}>
                    <BadgeDollarSign size={14} /> Record BIR Payment ({selectedTaxIds.length})
                  </button>
                  <button onClick={recordTaxAsOtherIncome} disabled={recordingOtherIncome}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: '#6d28d9' }}>
                    {recordingOtherIncome ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
                    Record as Other Income
                  </button>
                </div>
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
                          <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>{taxFilter === 'EMPLOYEE' ? 'Employee' : 'Consultant'}</th>
                          <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Cutoff Period</th>
                          <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Branch</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Gross Pay</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Withholding Tax</th>
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
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{branchLabel(e.branch)}</td>
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
                        <div className="flex items-center gap-2">
                          <button onClick={() => setShowPaymentModal(true)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                            style={{ background: '#c44b00' }}>
                            <BadgeDollarSign size={14} /> Record BIR Payment ({selectedTaxIds.length} payslips)
                          </button>
                          <button onClick={recordTaxAsOtherIncome} disabled={recordingOtherIncome}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                            style={{ background: '#6d28d9' }}>
                            {recordingOtherIncome ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
                            Record as Other Income
                          </button>
                        </div>
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
                      <th className="px-4 py-3" />
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
                        <td className="px-4 py-3 text-center">
                          {canWrite && (
                            <button onClick={() => setEditPayment({ id: tp.id, type: 'tax', paymentDate: tp.paymentDate.slice(0, 10), proofUrl: tp.proofUrl || '', notes: tp.notes || '' })}
                              className="text-xs px-2 py-1 rounded-lg border font-medium hover:bg-gray-50"
                              style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
              { key: 'pay-rules' as const, label: 'Clinician Pay Rules', icon: BadgeDollarSign },
              { key: 'initial-eval' as const, label: 'Initial Evaluation', icon: ClipboardList },
              { key: 'progress-report' as const, label: 'Progress Report', icon: FileText },
              { key: 'payslips' as const, label: 'Payslip Generation', icon: FileText },
            ].map(t => (
              <button key={t.key} onClick={() => { setSubTab(t.key); setIeprSearch(''); setIeprExpanded(new Set()) }}
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

              {canWrite && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                  <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>Bulk Set Rate:</span>
                  <select value={bulkDept} onChange={e => { setBulkDept(e.target.value); setBulkUnitPayId(''); setBulkResult(null) }}
                    className="px-3 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="">Select Department</option>
                    {DEPARTMENTS.filter(d => d.value).map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <select value={bulkUnitPayId} onChange={e => { setBulkUnitPayId(e.target.value); setBulkResult(null) }}
                    disabled={!bulkDept} className="px-3 py-1.5 rounded-lg border text-xs outline-none disabled:opacity-40" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="">Select Unit Pay Type</option>
                    {bulkApplicableUPs.map(up => <option key={up.id} value={up.id}>{up.name}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>&#8369;</span>
                    <input type="number" min="0" step="any" value={bulkAmount} onChange={e => { setBulkAmount(e.target.value); setBulkResult(null) }}
                      disabled={!bulkUnitPayId} placeholder="Amount" className="w-28 px-2 py-1.5 rounded-lg border text-xs outline-none disabled:opacity-40" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <button onClick={applyBulkUnitPay} disabled={!bulkDept || !bulkUnitPayId || !bulkAmount || bulkApplying}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                    style={{ background: 'var(--teal)' }}>
                    {bulkApplying ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Apply to All
                  </button>
                  {bulkResult && (
                    <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--teal)' }}>
                      <CheckCircle2 size={12} /> {bulkResult}
                    </span>
                  )}
                </div>
              )}

              <div className="rounded-2xl border overflow-x-auto" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                <table className="w-full text-sm min-w-[1200px]">
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
                      <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Bio ID</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Email</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Phone</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>TIN</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>BIR Address</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>SSS</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>PhilHealth</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Pag-IBIG</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Bank</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Bank Account No.</th>
                      <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Tax</th>
                      <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Retainer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={16} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>Loading...</td></tr>
                    ) : filteredConsultants.length === 0 ? (
                      <tr><td colSpan={16} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
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
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{branchLabel(c.branch)}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{c.bioId ?? '—'}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{c.email || '—'}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{c.phone || '—'}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{c.tinNumber || '—'}</td>
                          <td className="px-4 py-3 text-xs" style={{ maxWidth: '200px' }}
                            onClick={e => e.stopPropagation()}>
                            {inlineBirEditId === c.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  autoFocus
                                  type="text"
                                  value={inlineBirValue}
                                  onChange={e => setInlineBirValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveInlineBirAddress(c.id)
                                    if (e.key === 'Escape') setInlineBirEditId(null)
                                  }}
                                  onBlur={() => saveInlineBirAddress(c.id)}
                                  placeholder="BIR registered address…"
                                  className="px-2 py-1 rounded-lg border text-xs outline-none flex-1"
                                  style={{ borderColor: 'var(--teal)', minWidth: 140 }}
                                  disabled={savingInlineBir}
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 group/bir">
                                <span style={{ color: 'var(--mid-gray)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  title={c.birAddress || undefined}>
                                  {c.birAddress || '—'}
                                </span>
                                <button
                                  className="opacity-0 group-hover/bir:opacity-100 p-0.5 rounded hover:bg-teal-50 flex-shrink-0"
                                  title="Edit BIR Address"
                                  onClick={() => { setInlineBirEditId(c.id); setInlineBirValue(c.birAddress || '') }}>
                                  <Pencil size={10} style={{ color: 'var(--teal)' }} />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{c.sssNumber || '—'}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{c.philhealthNumber || '—'}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{c.pagibigNumber || '—'}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{c.bankName || '—'}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{c.bankAccountNo || '—'}</td>
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
                            <td colSpan={15} className="px-6 py-4" style={{ background: '#fafafa' }}>
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
                                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>
                                    BIR Registered Address
                                    <span className="ml-1.5 font-normal" style={{ color: 'var(--mid-gray)' }}>(for payroll XLSX export)</span>
                                  </label>
                                  <input type="text" value={editingBirAddress} onChange={e => setEditingBirAddress(e.target.value)}
                                    placeholder="Enter BIR registered address..."
                                    className="px-3 py-2 rounded-xl border text-sm outline-none w-full max-w-md" style={{ borderColor: 'var(--light-gray)' }} />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Unit Pay Rates</label>
                                  {unitPays.length === 0 ? (
                                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No unit pay types. Create them in Unit Pay Settings tab first.</p>
                                  ) : (() => {
                                    // Only show unit pays applicable to this consultant's department
                                    const applicableUPs = unitPays.filter(up =>
                                      !up.departments || up.departments.length === 0 || up.departments.includes(c.department)
                                    )
                                    return applicableUPs.length === 0 ? (
                                      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No unit pay types assigned to the {DEPT_LABELS[c.department] || c.department} department.</p>
                                    ) : (
                                      <div className="space-y-2">
                                        {applicableUPs.map(up => {
                                          const r = editingRates[up.id] || { amount: 0, disabled: false, thresholdEnabled: false, thresholdAmount: null, reducedAmount: null }
                                          return (
                                            <div key={up.id} className="flex items-center gap-3">
                                              <label className="flex items-center gap-1.5 w-40 cursor-pointer">
                                                <input type="checkbox" checked={!r.disabled}
                                                  onChange={e => setEditingRates({ ...editingRates, [up.id]: { ...r, disabled: !e.target.checked } })}
                                                  className="rounded" />
                                                <span className="text-xs font-medium" style={{ color: r.disabled ? 'var(--mid-gray)' : 'var(--charcoal)', textDecoration: r.disabled ? 'line-through' : 'none' }}>{up.name}</span>
                                              </label>
                                              {r.disabled ? (
                                                <span className="text-xs px-2 py-1 rounded-lg" style={{ color: '#dc2626', background: '#fef2f2' }}>Disabled</span>
                                              ) : (
                                                <>
                                                  <input type="number" min={0} step="0.01" value={r.amount || ''}
                                                    onChange={e => setEditingRates({ ...editingRates, [up.id]: { ...r, amount: parseFloat(e.target.value) || 0 } })}
                                                    placeholder="0.00" className="px-3 py-1.5 rounded-lg border text-sm outline-none w-32" style={{ borderColor: 'var(--light-gray)' }} />
                                                  <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>per unit</span>
                                                </>
                                              )}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )
                                  })()}
                                </div>
                                {canWrite && (
                                  <button onClick={() => saveConsultantConfig(c)} disabled={savingConsultant}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                                    style={{ background: 'var(--teal)' }}>
                                    <Save size={14} /> {savingConsultant ? 'Saving...' : 'Save Configuration'}
                                  </button>
                                )}

                                {/* Past Payslips */}
                                <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--light-gray)' }}>
                                  <button onClick={() => fetchClinicianPastPayslips(c.id)}
                                    className="flex items-center gap-1.5 text-xs font-semibold hover:opacity-80 transition-opacity"
                                    style={{ color: 'var(--teal)' }}>
                                    <FileText size={14} /> {showClinicianPayslips === c.id ? 'Hide' : 'View'} Past Payslips
                                  </button>
                                  {showClinicianPayslips === c.id && (
                                    <div className="mt-2">
                                      {loadingClinicianPayslips ? (
                                        <div className="flex items-center gap-2 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
                                          <Loader2 size={12} className="animate-spin" /> Loading...
                                        </div>
                                      ) : clinicianPastPayslips.length === 0 ? (
                                        <p className="text-xs py-1" style={{ color: 'var(--mid-gray)' }}>No saved payslips found.</p>
                                      ) : (
                                        <div className="grid gap-1">
                                          {clinicianPastPayslips.map(ps => (
                                            <div key={ps.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                                              <div className="flex items-center gap-4">
                                                <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{ps.cutoffPeriod}</span>
                                                <span style={{ color: 'var(--mid-gray)' }}>{branchLabel(ps.branch)}</span>
                                                <span className="font-mono" style={{ color: 'var(--charcoal)' }}>Net: {formatCurrency(toNum(ps.netPay))}</span>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                                  style={ps.status === 'FINAL' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                                                  {ps.status}
                                                </span>
                                              </div>
                                              {ps.pdfUrl && (
                                                <a href={ps.pdfUrl} target="_blank" rel="noopener noreferrer"
                                                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors text-xs"
                                                  style={{ color: 'var(--teal)' }}>
                                                  <Download size={12} /> View PDF
                                                </a>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
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
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
                  <input
                    placeholder="Search unit pay types..."
                    value={unitPaySearch}
                    onChange={e => setUnitPaySearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--light-gray)' }}
                  />
                </div>
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
                  {unitPays.filter(up => !unitPaySearch || up.name.toLowerCase().includes(unitPaySearch.toLowerCase())).map(up => (
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
              {/* ══ INCENTIVES SECTION ══ */}
              <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Incentives</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                      Rules that grant additional pay when a clinician reaches a daily session threshold (order quantity counts: one order of qty 2 = 2 sessions)
                    </p>
                  </div>
                  {canWrite && (
                    <button onClick={openIncCreate} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
                      <Plus size={13} /> Add Incentive
                    </button>
                  )}
                </div>

                {incentiveRules.length === 0 ? (
                  <p className="text-sm italic py-4 text-center" style={{ color: 'var(--mid-gray)' }}>No incentive rules yet.</p>
                ) : (
                  <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: 'var(--pale-teal)' }}>
                          {['Rule', 'Trigger', 'Bonus', 'Applies To', 'Status', ''].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {incentiveRules.map(rule => (
                          <tr key={rule.id} className="border-t" style={{ borderColor: 'var(--light-gray)', opacity: rule.isActive ? 1 : 0.5 }}>
                            <td className="px-4 py-3">
                              <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{rule.name}</p>
                              {rule.description && <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{rule.description}</p>}
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--charcoal)' }}>
                              ≥ <span className="font-bold">{rule.threshold}</span> sessions/day
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold" style={{ color: 'var(--teal)' }}>
                              +{formatCurrency(Number(rule.bonusPerUnit))} / session
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                              {rule.departments && rule.departments.length > 0 ? rule.departments.join(', ') : 'All depts'}
                              {rule.branch ? ` · ${branchLabel(rule.branch)}` : ''}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rule.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {rule.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {canWrite && (
                                <div className="flex gap-1">
                                  <button onClick={() => openIncEdit(rule)} className="p-1.5 rounded-lg hover:bg-gray-100">
                                    <Pencil size={13} style={{ color: 'var(--teal)' }} />
                                  </button>
                                  <button onClick={() => deleteIncentiveRule(rule.id)} className="p-1.5 rounded-lg hover:bg-red-50">
                                    <Trash2 size={13} className="text-red-400" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Incentive Rule Form Modal */}
              {showIncentiveForm && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
                  <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md relative">
                    <button onClick={() => setShowIncentiveForm(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
                      <X size={18} style={{ color: 'var(--mid-gray)' }} />
                    </button>
                    <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                      {editingIncentive ? 'Edit Incentive Rule' : 'Add Incentive Rule'}
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Rule Name *</label>
                        <input value={incForm.name} onChange={e => setIncForm({ ...incForm, name: e.target.value })}
                          placeholder="e.g. Daily Session Threshold Bonus"
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Description (optional)</label>
                        <input value={incForm.description} onChange={e => setIncForm({ ...incForm, description: e.target.value })}
                          placeholder="e.g. Bonus for high-volume days"
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Min. Sessions / Day *</label>
                          <input type="number" min={1} value={incForm.threshold}
                            onChange={e => setIncForm({ ...incForm, threshold: parseInt(e.target.value) || 1 })}
                            className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                          <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Trigger threshold (counts order qty — one order of qty 2 = 2 sessions)</p>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Bonus per Session (₱) *</label>
                          <input type="number" min={0.01} step={0.01} value={incForm.bonusPerUnit}
                            onChange={e => setIncForm({ ...incForm, bonusPerUnit: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                          <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Paid for every session on qualifying days</p>
                        </div>
                      </div>
                      {/* Preview calculation */}
                      <div className="rounded-xl p-3 text-xs" style={{ background: 'var(--pale-teal)' }}>
                        <p style={{ color: 'var(--deep-teal)' }}>
                          <span className="font-semibold">Preview: </span>
                          {incForm.threshold} sessions → {incForm.threshold} × ₱{incForm.bonusPerUnit.toFixed(2)} = <span className="font-bold">₱{(incForm.threshold * incForm.bonusPerUnit).toFixed(2)}</span> bonus for that day
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Applicable Departments (empty = all)</label>
                        <div className="flex flex-wrap gap-2">
                          {DEPARTMENTS.filter(d => d.value).map(d => (
                            <label key={d.value} className="flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-lg border"
                              style={{ borderColor: incForm.departments.includes(d.value) ? 'var(--teal)' : 'var(--light-gray)', background: incForm.departments.includes(d.value) ? '#f0fdfa' : 'white' }}>
                              <input type="checkbox" checked={incForm.departments.includes(d.value)}
                                onChange={e => setIncForm({ ...incForm, departments: e.target.checked ? [...incForm.departments, d.value] : incForm.departments.filter(x => x !== d.value) }) } />
                              {d.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch (empty = all branches)</label>
                        <select value={incForm.branch} onChange={e => setIncForm({ ...incForm, branch: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                          <option value="">All branches</option>
                          <option value="SBEA">East Branch (SBEA)</option>
                          <option value="SBGH">Greenhills Branch (SBGH)</option>
                          <option value="VERDANA">Verdana Store</option>
                        </select>
                      </div>
                      {editingIncentive && (
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setIncForm({ ...incForm, isActive: !incForm.isActive })}>
                            {incForm.isActive
                              ? <ToggleRight size={22} style={{ color: 'var(--teal)' }} />
                              : <ToggleLeft size={22} style={{ color: 'var(--mid-gray)' }} />}
                          </button>
                          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{incForm.isActive ? 'Active' : 'Inactive'}</span>
                        </div>
                      )}
                      {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
                      <div className="flex gap-3 pt-2">
                        <button onClick={() => setShowIncentiveForm(false)}
                          className="flex-1 py-2.5 rounded-xl border text-sm font-medium" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                        <button onClick={saveIncentiveRule} disabled={savingInc}
                          className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                          {savingInc ? 'Saving...' : editingIncentive ? 'Save Changes' : 'Add Rule'}
                        </button>
                      </div>
                    </div>
                  </div>
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

          {/* ══ TAB: Clinician Pay Rules ══ */}
          {subTab === 'pay-rules' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Threshold-Based Pay Rules</h3>
                {canWrite && (
                  <button onClick={() => { setTrFormOpen(true); setTrUnitPayId(''); setTrThreshold(''); setTrReduced(''); setTrSelectedConsultants([]); setError('') }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
                    style={{ background: 'var(--teal)' }}>
                    <Plus size={14} /> Add Rule
                  </button>
                )}
              </div>

              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                Set rules where a clinician&apos;s unit pay rate depends on the order&apos;s net sales amount. If the adjusted order net is below the threshold, the reduced rate is used instead of the normal rate.
              </p>

              {trLoading ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--teal)' }} /></div>
              ) : thresholdRules.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No threshold rules configured yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {thresholdRules.map((rule, idx) => (
                    <div key={idx} className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{rule.unitPayName}</span>
                          <span className="ml-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                            If order net &lt; &#8369;{rule.thresholdAmount.toLocaleString()} → pay &#8369;{rule.reducedAmount.toLocaleString()} instead
                          </span>
                        </div>
                        {canWrite && (
                          <button onClick={() => deleteThresholdRule(rule.unitPayId, rule.consultants.map(c => c.id))}
                            className="text-xs px-3 py-1 rounded-lg border hover:bg-red-50" style={{ borderColor: 'var(--light-gray)', color: '#dc2626' }}>
                            <Trash2 size={12} className="inline mr-1" />Remove
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {rule.consultants.map(c => (
                          <span key={c.id} className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                            {c.name} <span className="opacity-60">({branchLabel(c.branch)})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Rule Form */}
              {trFormOpen && (
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--teal)', background: '#f0fdfa' }}>
                  <h4 className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>New Threshold Rule</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Unit Pay Type</label>
                      <select value={trUnitPayId} onChange={e => setTrUnitPayId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">Select...</option>
                        {unitPays.map(up => <option key={up.id} value={up.id}>{up.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Threshold (min order net)</label>
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>&#8369;</span>
                        <input type="number" min={0} step="0.01" value={trThreshold} onChange={e => setTrThreshold(e.target.value)}
                          placeholder="1800" className="w-full px-2 py-2 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Reduced rate (if below threshold)</label>
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>&#8369;</span>
                        <input type="number" min={0} step="0.01" value={trReduced} onChange={e => setTrReduced(e.target.value)}
                          placeholder="500" className="w-full px-2 py-2 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>
                      Assign to clinicians <span className="opacity-60">(only showing those with a rate set for the selected unit pay)</span>
                    </label>
                    <div className="max-h-40 overflow-y-auto rounded-lg border p-2 space-y-1" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                      {consultants
                        .filter(c => c.isActive && (!trUnitPayId || c.unitPayRates.some(r => r.unitPayId === trUnitPayId)))
                        .map(c => (
                          <label key={c.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                            <input type="checkbox" checked={trSelectedConsultants.includes(c.id)}
                              onChange={e => setTrSelectedConsultants(prev =>
                                e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                              )} className="rounded" />
                            <span className="text-xs" style={{ color: 'var(--charcoal)' }}>{c.name}</span>
                            <span className="text-xs opacity-50">({branchLabel(c.branch)})</span>
                          </label>
                        ))}
                      {trUnitPayId && consultants.filter(c => c.isActive && c.unitPayRates.some(r => r.unitPayId === trUnitPayId)).length === 0 && (
                        <p className="text-xs py-2" style={{ color: 'var(--mid-gray)' }}>No clinicians have a rate set for this unit pay type. Set rates in the Clinician List tab first.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={saveThresholdRule} disabled={trSaving}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white disabled:opacity-50"
                      style={{ background: 'var(--teal)' }}>
                      {trSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Rule
                    </button>
                    <button onClick={() => setTrFormOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ TAB: Consultant Allowance/Deduction ══ */}
          {subTab === 'adjustments' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <select value={conAdjCutoffMonth} onChange={e => setConAdjCutoffMonth(parseInt(e.target.value))}
                  className="px-3 py-2.5 rounded-xl border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <input type="number" value={conAdjCutoffYear} onChange={e => setConAdjCutoffYear(parseInt(e.target.value))}
                  className="w-20 px-3 py-2.5 rounded-xl border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
                <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
                  {[1, 2].map(h => (
                    <button key={h} onClick={() => setConAdjCutoffHalf(h)}
                      className="px-3 py-2 text-xs font-medium transition-colors"
                      style={conAdjCutoffHalf === h ? { background: 'var(--pale-teal)', color: 'var(--deep-teal)' } : { color: 'var(--mid-gray)' }}>
                      {h === 1 ? '1st Half' : '2nd Half'}
                    </button>
                  ))}
                </div>
                <select value={conAdjBranch} onChange={e => setConAdjBranch(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                  {BRANCHES.filter(b => b.value).map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
                <button onClick={async () => {
                  if (!conAdjBranch) return
                  setConAdjLoading(true)
                  const cp = `${conAdjCutoffYear}-${conAdjCutoffMonth}-${conAdjCutoffHalf}`
                  try {
                    const branchConsultants = consultants.filter(c => c.branch === conAdjBranch && c.isActive)
                    const r = await fetch(`/api/payroll/consultant-adjustments?cutoffPeriod=${cp}&branch=${conAdjBranch}`)
                    const data = await r.json()
                    const existing = Array.isArray(data) ? data : []
                    const existByConsultant = new Map<string, { allowance: number; allowanceType: string; allowanceLabel: string; deduction: number; deductionLabel: string }[]>()
                    for (const a of existing) {
                      if (!existByConsultant.has(a.consultantId)) existByConsultant.set(a.consultantId, [])
                      existByConsultant.get(a.consultantId)!.push(a)
                    }
                    const rows: ConAdjRow[] = []
                    let rk = 0
                    for (const c of branchConsultants) {
                      const cAdjs = existByConsultant.get(c.id)
                      if (cAdjs && cAdjs.length > 0) {
                        for (const ex of cAdjs) {
                          rows.push({
                            consultantId: c.id, consultantName: c.name,
                            allowance: toNum(ex.allowance), allowanceType: ex.allowanceType || 'NON_TAXABLE',
                            allowanceLabel: ex.allowanceLabel || '', deduction: toNum(ex.deduction),
                            deductionLabel: ex.deductionLabel || '', rowKey: `cr${rk++}`,
                          })
                        }
                      } else {
                        rows.push({
                          consultantId: c.id, consultantName: c.name,
                          allowance: 0, allowanceType: 'NON_TAXABLE', allowanceLabel: '',
                          deduction: 0, deductionLabel: '', rowKey: `cr${rk++}`,
                        })
                      }
                    }
                    setConAdjRows(rows)
                    setConAdjSaved(false)
                  } catch {}
                  setConAdjLoading(false)
                }} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-white transition-all hover:opacity-90" style={{ background: 'var(--teal)' }}>
                  <Search size={13} /> Load
                </button>
                <button onClick={async () => {
                  if (!conAdjBranch) return
                  setConAdjLoading(true)
                  const cp = `${conAdjCutoffYear}-${conAdjCutoffMonth}-${conAdjCutoffHalf}`
                  try {
                    const branchConsultants = consultants.filter(c => c.branch === conAdjBranch && c.isActive)
                    const r = await fetch(`/api/payroll/consultant-adjustments?cutoffPeriod=${cp}&branch=${conAdjBranch}`, { method: 'PUT' })
                    const data = await r.json()
                    const prevByConsultant = new Map<string, { allowance: number; allowanceType: string; allowanceLabel: string; deduction: number; deductionLabel: string }[]>()
                    for (const a of (data.adjustments || [])) {
                      if (!prevByConsultant.has(a.consultantId)) prevByConsultant.set(a.consultantId, [])
                      prevByConsultant.get(a.consultantId)!.push(a)
                    }
                    const rows: ConAdjRow[] = []
                    let rk = 0
                    for (const c of branchConsultants) {
                      const cAdjs = prevByConsultant.get(c.id)
                      if (cAdjs && cAdjs.length > 0) {
                        for (const ex of cAdjs) {
                          rows.push({
                            consultantId: c.id, consultantName: c.name,
                            allowance: toNum(ex.allowance), allowanceType: ex.allowanceType || 'NON_TAXABLE',
                            allowanceLabel: ex.allowanceLabel || '', deduction: toNum(ex.deduction),
                            deductionLabel: ex.deductionLabel || '', rowKey: `cr${rk++}`,
                          })
                        }
                      } else {
                        rows.push({
                          consultantId: c.id, consultantName: c.name,
                          allowance: 0, allowanceType: 'NON_TAXABLE', allowanceLabel: '',
                          deduction: 0, deductionLabel: '', rowKey: `cr${rk++}`,
                        })
                      }
                    }
                    setConAdjRows(rows)
                    setConAdjSaved(false)
                  } catch {}
                  setConAdjLoading(false)
                }} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all hover:opacity-80" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                  <Download size={13} /> Pre-fill from Previous
                </button>
              </div>

              {conAdjLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
              ) : conAdjRows.length === 0 ? (
                <p className="text-center py-8 text-xs" style={{ color: 'var(--mid-gray)' }}>Select a branch and click Load to view adjustments for this cutoff.</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'var(--off-white)' }}>
                          <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Consultant</th>
                          <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Allowance</th>
                          <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Type</th>
                          <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Allowance Label</th>
                          <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Deduction</th>
                          <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Deduction Label</th>
                          {canWrite && <th className="px-2 py-2.5 w-8"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const shownConsultants = new Set<string>()
                          return conAdjRows.map((row) => {
                            const updateRow = (field: string, value: unknown) => {
                              setConAdjRows(prev => prev.map(r => r.rowKey === row.rowKey ? { ...r, [field]: value } : r))
                              setConAdjSaved(false)
                            }
                            const isFirst = !shownConsultants.has(row.consultantId)
                            if (isFirst) shownConsultants.add(row.consultantId)
                            const rowCount = conAdjRows.filter(r => r.consultantId === row.consultantId).length
                            return (
                              <tr key={row.rowKey} className="border-t transition-colors hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)' }}>
                                <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>
                                  {isFirst ? (row.consultantName || row.consultantId) : ''}
                                </td>
                                <td className="px-2 py-1">
                                  <input type="number" min={0} step="0.01" value={row.allowance || ''} onChange={e => updateRow('allowance', parseFloat(e.target.value) || 0)}
                                    className="w-24 px-2 py-1.5 rounded border text-xs text-right" style={{ borderColor: 'var(--light-gray)' }} />
                                </td>
                                <td className="px-2 py-1">
                                  <select value={row.allowanceType} onChange={e => updateRow('allowanceType', e.target.value)}
                                    className="px-2 py-1.5 rounded border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                                    <option value="NON_TAXABLE">Non-Taxable</option>
                                    <option value="TAXABLE">Taxable</option>
                                  </select>
                                </td>
                                <td className="px-2 py-1">
                                  <input type="text" value={row.allowanceLabel} onChange={e => updateRow('allowanceLabel', e.target.value)}
                                    placeholder="e.g. De Minimis"
                                    className="w-28 px-2 py-1.5 rounded border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
                                </td>
                                <td className="px-2 py-1">
                                  <input type="number" min={0} step="0.01" value={row.deduction || ''} onChange={e => updateRow('deduction', parseFloat(e.target.value) || 0)}
                                    className="w-24 px-2 py-1.5 rounded border text-xs text-right" style={{ borderColor: 'var(--light-gray)' }} />
                                </td>
                                <td className="px-2 py-1">
                                  <input type="text" value={row.deductionLabel} onChange={e => updateRow('deductionLabel', e.target.value)}
                                    placeholder="e.g. Cash Advance"
                                    className="w-28 px-2 py-1.5 rounded border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
                                </td>
                                {canWrite && (
                                  <td className="px-1 py-1">
                                    <div className="flex items-center gap-0.5">
                                      {isFirst && (
                                        <button onClick={() => {
                                          const newRow: ConAdjRow = {
                                            consultantId: row.consultantId, consultantName: row.consultantName,
                                            allowance: 0, allowanceType: 'NON_TAXABLE', allowanceLabel: '',
                                            deduction: 0, deductionLabel: '', rowKey: `cr${Date.now()}`,
                                          }
                                          const lastIdx = conAdjRows.reduce((acc, r, i) => r.consultantId === row.consultantId ? i : acc, 0)
                                          setConAdjRows(prev => [...prev.slice(0, lastIdx + 1), newRow, ...prev.slice(lastIdx + 1)])
                                          setConAdjSaved(false)
                                        }} className="p-0.5 rounded hover:bg-green-50" title="Add another line">
                                          <Plus size={13} className="text-green-600" />
                                        </button>
                                      )}
                                      {rowCount > 1 && (
                                        <button onClick={() => {
                                          setConAdjRows(prev => prev.filter(r => r.rowKey !== row.rowKey))
                                          setConAdjSaved(false)
                                        }} className="p-0.5 rounded hover:bg-red-50" title="Remove this line">
                                          <X size={13} className="text-red-400" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            )
                          })
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {canWrite && (
                    <div className="flex items-center justify-end gap-3">
                      {conAdjSaved && (
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#16a34a' }}>
                          <CheckCircle2 size={14} /> Saved
                        </span>
                      )}
                      <button onClick={async () => {
                        setConAdjSaving(true)
                        const cp = `${conAdjCutoffYear}-${conAdjCutoffMonth}-${conAdjCutoffHalf}`
                        try {
                          await fetch('/api/payroll/consultant-adjustments', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ cutoffPeriod: cp, branch: conAdjBranch, adjustments: conAdjRows }),
                          })
                          setConAdjSaved(true)
                        } catch { setError('Failed to save adjustments') }
                        setConAdjSaving(false)
                      }} disabled={conAdjSaving}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-80 active:scale-[0.97]"
                        style={{ background: 'var(--teal)' }}>
                        {conAdjSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Adjustments
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ══ IE/PR TABS (Initial Evaluation & Progress Report) ══ */}
          {(subTab === 'initial-eval' || subTab === 'progress-report') && (() => {
            const docType = subTab === 'initial-eval' ? 'INITIAL_EVALUATION' : 'PROGRESS_REPORT'
            const tabLabel = subTab === 'initial-eval' ? 'Initial Evaluation / Re-evaluation' : 'Progress Report'

            // Group documents by therapist staffId (or "unknown" fallback)
            const grouped = new Map<string, { therapist: IEPRDoc['therapist']; docs: IEPRDoc[] }>()
            for (const doc of ieprDocs) {
              const key = doc.therapist?.staffId ?? `__unknown__${doc.department}`
              if (!grouped.has(key)) grouped.set(key, { therapist: doc.therapist, docs: [] })
              grouped.get(key)!.docs.push(doc)
            }

            // Match therapist to accounting consultant by externalStaffId
            const consultantByStaffId = new Map(
              consultants.filter(c => c.externalStaffId).map(c => [c.externalStaffId!, c])
            )

            // Filter by search
            const filtered = Array.from(grouped.entries()).filter(([, { therapist }]) => {
              if (!ieprSearch.trim()) return true
              const q = ieprSearch.toLowerCase()
              const name = (therapist?.name ?? '').toLowerCase()
              return name.includes(q)
            })

            return (
              <div className="space-y-4">
                {/* Toolbar */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-xs">
                    <Search size={14} className="absolute left-3 top-2.5" style={{ color: 'var(--mid-gray)' }} />
                    <input
                      value={ieprSearch}
                      onChange={e => setIeprSearch(e.target.value)}
                      placeholder="Search clinician name..."
                      className="pl-9 pr-3 py-2 rounded-xl border text-sm outline-none w-full"
                      style={{ borderColor: 'var(--light-gray)' }}
                    />
                  </div>
                  <button
                    onClick={() => fetchIEPR(docType as 'INITIAL_EVALUATION' | 'PROGRESS_REPORT')}
                    disabled={ieprLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border disabled:opacity-50"
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    {ieprLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Refresh
                  </button>
                  <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                    Source: teletherapy hub
                  </span>
                </div>

                {ieprError && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: '#fef2f2', color: '#dc2626' }}>
                    <AlertCircle size={14} /> {ieprError}
                  </div>
                )}

                {ieprLoading && (
                  <div className="flex items-center justify-center py-12 gap-2" style={{ color: 'var(--mid-gray)' }}>
                    <Loader2 size={18} className="animate-spin" /> Loading {tabLabel} documents…
                  </div>
                )}

                {!ieprLoading && !ieprError && filtered.length === 0 && (
                  <div className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>
                    No {tabLabel} documents found.
                  </div>
                )}

                {!ieprLoading && filtered.map(([key, { therapist, docs }]) => {
                  const consultant = therapist?.staffId ? consultantByStaffId.get(therapist.staffId) : undefined
                  const displayName = consultant?.name ?? therapist?.name ?? '(Unknown therapist)'
                  const dept = consultant?.department ?? therapist?.department ?? ''
                  const branchLabel = consultant?.branch ?? therapist?.branch ?? ''
                  const isOpen = ieprExpanded.has(key)
                  const uncountedCount = docs.filter(d => !d.countedInPayroll).length

                  return (
                    <div key={key} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                      {/* Clinician header row */}
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                        onClick={() => {
                          setIeprExpanded(prev => {
                            const s = new Set(prev)
                            s.has(key) ? s.delete(key) : s.add(key)
                            return s
                          })
                        }}>
                        <div className="flex items-center gap-3">
                          {isOpen ? <ChevronDown size={14} style={{ color: 'var(--mid-gray)' }} /> : <ChevronRight size={14} style={{ color: 'var(--mid-gray)' }} />}
                          <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{displayName}</span>
                          {dept && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{dept}</span>}
                          {branchLabel && <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{branchLabel}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {uncountedCount > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#fff3cd', color: '#b45309' }}>
                              {uncountedCount} uncounted
                            </span>
                          )}
                          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{docs.length} doc{docs.length !== 1 ? 's' : ''}</span>
                        </div>
                      </button>

                      {/* Document rows */}
                      {isOpen && (
                        <div className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                          <table className="w-full text-xs">
                            <thead>
                              <tr style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                                <th className="px-4 py-2 text-left font-medium">Patient</th>
                                <th className="px-4 py-2 text-left font-medium">Date Uploaded</th>
                                <th className="px-4 py-2 text-left font-medium">File</th>
                                <th className="px-4 py-2 text-center font-medium">Counted in Payroll?</th>
                                <th className="px-4 py-2 text-left font-medium">Cutoff Period</th>
                                <th className="px-4 py-2 text-center font-medium">View</th>
                              </tr>
                            </thead>
                            <tbody>
                              {docs.map(doc => {
                                const isSaving = ieprSaving.has(doc.id)
                                const uploadDate = new Date(doc.uploadedAt).toLocaleDateString('en-PH', {
                                  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
                                })
                                return (
                                  <tr key={doc.id} className="border-t hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}>
                                    {/* Patient */}
                                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>
                                      {doc.patient.name}
                                    </td>

                                    {/* Date */}
                                    <td className="px-4 py-2.5" style={{ color: 'var(--mid-gray)' }}>
                                      {uploadDate}
                                    </td>

                                    {/* File name */}
                                    <td className="px-4 py-2.5 max-w-[180px]">
                                      <span className="truncate block" style={{ color: 'var(--charcoal)' }} title={doc.fileName}>
                                        {doc.fileName}
                                      </span>
                                    </td>

                                    {/* Counted checkbox */}
                                    <td className="px-4 py-2.5 text-center">
                                      {isSaving ? (
                                        <Loader2 size={13} className="animate-spin inline" style={{ color: 'var(--mid-gray)' }} />
                                      ) : (
                                        <input
                                          type="checkbox"
                                          checked={doc.countedInPayroll}
                                          onChange={e => {
                                            const checked = e.target.checked
                                            // If checking and no cutoff set, default to current period
                                            const defaultCutoff = doc.cutoffPeriod ?? cutoffPeriod
                                            updateIEPR(doc, checked, checked ? defaultCutoff : null)
                                          }}
                                          className="w-4 h-4 rounded accent-teal-600 cursor-pointer"
                                        />
                                      )}
                                    </td>

                                    {/* Cutoff dropdown */}
                                    <td className="px-4 py-2.5">
                                      {doc.countedInPayroll ? (
                                        <select
                                          value={doc.cutoffPeriod ?? ''}
                                          onChange={e => updateIEPR(doc, true, e.target.value || null)}
                                          disabled={isSaving}
                                          className="px-2 py-1 rounded-lg border text-xs outline-none disabled:opacity-50"
                                          style={{ borderColor: 'var(--light-gray)', maxWidth: 200 }}>
                                          <option value="">— Select cutoff —</option>
                                          {CUTOFF_OPTIONS.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#fee2e2', color: '#b91c1c' }}>Not counted</span>
                                      )}
                                    </td>

                                    {/* View button */}
                                    <td className="px-4 py-2.5 text-center">
                                      <a
                                        href={`/api/payroll/ie-pr/file?documentId=${doc.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
                                        style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}
                                        title={`View ${doc.fileName}`}>
                                        <Eye size={12} /> View
                                      </a>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* ══ TAB 4: Payslip Generation ══ */}
          {subTab === 'payslips' && (
            <div className="space-y-4">
              {/* Controls row */}
              {(() => {
                const activeConsultants = payrollPreviews
                const allConsultantLocked = activeConsultants.length > 0 && activeConsultants.every(p => p.existingStatus === 'LOCKED')
                return (
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
                  {/* Regenerate — always available so branch/cutoff/department filter changes
                      can be re-run without refreshing the page, even when every consultant
                      is already locked. Re-save-protected: LOCKED entries are skipped
                      server-side, and this is a GET-only preview refresh anyway. */}
                  <button onClick={() => generatePayslips(false)} disabled={generating}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--teal)' }}>
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {payrollPreviews.length > 0 ? 'Regenerate' : 'Generate Payslips'}
                  </button>
                  {!allConsultantLocked && (
                    <>
                      <button onClick={() => createBankFile('CONSULTANT')}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border"
                        style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                        <Download size={14} /> Create Bank File
                      </button>
                      {payrollPreviews.some(p => p.grossPay > 0) && (
                        <button onClick={savePayslips} disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border disabled:opacity-50"
                          style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                          <Save size={14} /> {saving ? 'Saving...' : 'Save All as Draft'}
                        </button>
                      )}
                      {activeConsultants.some(p => p.existingStatus === 'DRAFT') && (
                        <button onClick={finalizeConsultantPayslips} disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border disabled:opacity-50"
                          style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                          <CheckCircle2 size={14} /> {saving ? 'Finalizing...' : 'Finalize All'}
                        </button>
                      )}
                      {activeConsultants.some(p => p.existingStatus === 'FINAL') && (
                        <button onClick={() => lockAndFinalize('CONSULTANT')} disabled={finalizing}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                          style={{ background: '#dc2626' }}>
                          {finalizing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          {finalizing ? 'Locking...' : 'Lock Payroll'}
                        </button>
                      )}
                    </>
                  )}
                  {allConsultantLocked && (
                    <button onClick={() => unlockPayroll('CONSULTANT')} disabled={unlocking}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border disabled:opacity-50"
                      style={{ borderColor: '#4338ca', color: '#4338ca' }}>
                      {unlocking ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                      {unlocking ? 'Unlocking...' : 'Unlock Payroll'}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Generate Payreg — formatted Excel matching template (Consultant sheet only) */}
                  <button onClick={generatePayreg}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border"
                    style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                    <Download size={14} /> Generate Payreg
                  </button>
                  {/* Export raw payroll XLSX */}
                  <button onClick={exportPayrollXlsx}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border"
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    <Download size={14} /> Download Payroll
                  </button>

                  {/* Download ALL PDFs */}
                  {payrollPreviews.some(p => p.grossPay > 0 || p.orderCount > 0 || p.existingStatus !== null) && (
                    <button onClick={downloadAllPdfs} disabled={downloadingAll}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border disabled:opacity-50"
                      style={{ borderColor: 'var(--charcoal)', color: 'var(--charcoal)' }}>
                      {downloadingAll ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      {downloadingAll ? `Generating ZIP… ${downloadPct}%` : 'Download ALL PDFs'}
                    </button>
                  )}
                  {payrollPreviews.some(p => p.grossPay > 0 || p.orderCount > 0 || p.existingStatus !== null) && (
                    <button onClick={emailAllClinicians} disabled={emailingAll}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: '#c44b00' }}>
                      {emailingAll ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                      {emailingAll ? 'Sending...' : 'Email All Consultants'}
                    </button>
                  )}
                </div>
              </div>
                )
              })()}

              {/* Preview table — expandable summary rows */}
              {payrollPreviews.length > 0 && (() => {
                const visiblePreviews = payrollPreviews.filter(p => p.grossPay > 0 || p.orderCount > 0 || p.existingStatus !== null)
                return (
                <div className="space-y-3">
                  <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>
                    Payroll for: {getCutoffLabel(cutoffPeriod)} — {visiblePreviews.length} consultant(s)
                  </p>

                  {visiblePreviews.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'var(--off-white)' }}>
                            <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Consultant</th>
                            <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Unit Pay</th>
                            <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Retainer</th>
                            <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Adj</th>
                            <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Gross</th>
                            <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Tax</th>
                            <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Net Pay</th>
                            <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
                            <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {visiblePreviews.map(p => {
                            const extras = extraUnitPays[p.consultantId] || []
                            const adjs = adjustments[p.consultantId] || []
                            const t = computeTotals(p, extras, adjs)
                            const adjNet = t.taxedAdj + t.nonTaxedAdj
                            const isExpanded = expandedPayslip === p.consultantId

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
                              <React.Fragment key={p.consultantId}>
                                {/* ── Summary row ── */}
                                <tr className="border-t hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--light-gray)' }}
                                  onClick={() => setExpandedPayslip(isExpanded ? null : p.consultantId)}>
                                  <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>
                                    {p.consultantName}
                                    <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{p.department}</span>
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(t.totalUnitPay)}</td>
                                  <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(p.retainerAmount)}</td>
                                  <td className="px-3 py-2.5 text-right font-mono" style={{ color: adjNet >= 0 ? '#065f46' : '#991b1b' }}>
                                    {adjNet !== 0 ? ((adjNet > 0 ? '+' : '') + formatCurrency(adjNet)) : '—'}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(t.gross)}</td>
                                  <td className="px-3 py-2.5 text-right font-mono" style={{ color: '#d97706' }}>{t.tax > 0 ? formatCurrency(t.tax) : '—'}</td>
                                  <td className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(t.net)}</td>
                                  <td className="px-3 py-2.5 text-center">
                                    {p.existingStatus && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold"
                                        style={{ background: p.existingStatus === 'FINAL' ? '#dcfce7' : p.existingStatus === 'LOCKED' ? '#e0e7ff' : '#fef3c7', color: p.existingStatus === 'FINAL' ? '#059669' : p.existingStatus === 'LOCKED' ? '#4338ca' : '#d97706' }}>
                                        {p.existingStatus}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-center">
                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </td>
                                </tr>

                                {/* ── Expanded breakdown ── */}
                                {isExpanded && (
                                  <tr key={`${p.consultantId}-detail`}>
                                    <td colSpan={9} className="px-5 py-4" style={{ background: 'var(--off-white)' }}>
                                      <div className="space-y-4">
                                        {/* ── Earnings from Orders ── */}
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>Earnings from Orders</p>
                                          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
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
                                                    <td className="px-3 py-2 cursor-pointer underline" style={{ color: 'var(--teal)' }}
                                                      onClick={(e) => { e.stopPropagation(); item.sessions?.length ? setSessionBreakdown({ unitPayName: item.unitPayName, sessions: item.sessions }) : undefined }}
                                                      title="Click to view session details">{item.quantity}</td>
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
                                            {p.existingStatus !== 'LOCKED' && (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); setShowUpAdd(prev => ({ ...prev, [p.consultantId]: !prev[p.consultantId] })) }}
                                              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg"
                                              style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                                              <PlusCircle size={12} /> Add Unit Pay
                                            </button>
                                            )}
                                          </div>

                                          {showUpAdd[p.consultantId] && (
                                            <div className="rounded-xl border p-3 mb-3 space-y-2" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                                              <div className="relative">
                                                <Search size={12} className="absolute left-2.5 top-2.5" style={{ color: 'var(--mid-gray)' }} />
                                                <input
                                                  value={upSearch}
                                                  onChange={e => setUpAddSearch(prev => ({ ...prev, [p.consultantId]: e.target.value }))}
                                                  placeholder={`Search unit pays for ${DEPT_LABELS[p.department] || p.department}...`}
                                                  className="w-full pl-8 pr-3 py-2 rounded-lg border text-xs outline-none"
                                                  style={{ borderColor: 'var(--light-gray)' }}
                                                  onClick={e => e.stopPropagation()}
                                                />
                                              </div>
                                              {filteredUPs.length > 0 && (
                                                <div className="max-h-36 overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                                                  {filteredUPs.map(up => {
                                                    const rate = toNum(consultant?.unitPayRates.find(r => r.unitPayId === up.id)?.amount)
                                                    return (
                                                      <button key={up.id} onClick={(e) => { e.stopPropagation(); setUpAddSel(prev => ({ ...prev, [p.consultantId]: up.id })) }}
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
                                                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
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
                                                  <button onClick={(e) => { e.stopPropagation(); addExtraUP(p.consultantId) }}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                                                    style={{ background: 'var(--teal)' }}>Add</button>
                                                  <button onClick={(e) => { e.stopPropagation(); setShowUpAdd(prev => ({ ...prev, [p.consultantId]: false })) }}
                                                    className="p-1.5 rounded-lg hover:bg-gray-100"><X size={12} /></button>
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {extras.length > 0 && (
                                            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
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
                                                      <td className="px-3 py-2 text-center" onClick={e2 => e2.stopPropagation()}>
                                                        <input type="number" min={1} step={1} value={e.qty}
                                                          onChange={ev => updateExtraQty(p.consultantId, e.id, parseInt(ev.target.value) || 1)}
                                                          className="w-14 px-2 py-1 rounded border text-xs text-center outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                                                      </td>
                                                      <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(e.unitAmount * e.qty)}</td>
                                                      <td className="px-3 py-2">
                                                        {p.existingStatus !== 'LOCKED' && (
                                                        <button onClick={(e2) => { e2.stopPropagation(); removeExtraUP(p.consultantId, e.id) }} className="p-1 hover:bg-red-50 rounded">
                                                          <Trash2 size={12} className="text-red-400" />
                                                        </button>
                                                        )}
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
                                            {p.existingStatus !== 'LOCKED' && (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); setShowAdjAdd(prev => ({ ...prev, [p.consultantId]: !prev[p.consultantId] })) }}
                                              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg"
                                              style={{ background: '#fffbeb', color: '#92400e' }}>
                                              <PlusCircle size={12} /> Add Adjustment
                                            </button>
                                            )}
                                          </div>

                                          {showAdjAdd[p.consultantId] && (
                                            <div className="rounded-xl border p-3 mb-3 space-y-3" style={{ borderColor: '#fde68a', background: '#fffbeb' }} onClick={e => e.stopPropagation()}>
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

                                          {adjs.length > 0 && (
                                            <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#fde68a', background: 'white' }}>
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
                                                        {p.existingStatus !== 'LOCKED' && (
                                                        <button onClick={(e) => { e.stopPropagation(); removeAdjustment(p.consultantId, a.id) }} className="p-1 hover:bg-red-50 rounded">
                                                          <Trash2 size={12} className="text-red-400" />
                                                        </button>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                        </div>

                                        {/* ── Totals summary ── */}
                                        <div className="grid grid-cols-3 gap-4 text-xs">
                                          <div>
                                            <p className="font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Earnings</p>
                                            <div className="space-y-1">
                                              <div className="flex justify-between"><span>Unit Pay (orders)</span><span className="font-mono">{formatCurrency(p.unitPayTotal)}</span></div>
                                              {t.extraTotal > 0 && <div className="flex justify-between"><span>Additional Unit Pay</span><span className="font-mono">{formatCurrency(t.extraTotal)}</span></div>}
                                              {p.retainerAmount > 0 && <div className="flex justify-between"><span>Retainer (½)</span><span className="font-mono">{formatCurrency(p.retainerAmount)}</span></div>}
                                              {p.incentiveTotal > 0 && <div className="flex justify-between"><span>Incentives</span><span className="font-mono">{formatCurrency(p.incentiveTotal)}</span></div>}
                                              <div className="flex justify-between border-t pt-1 font-bold" style={{ borderColor: 'var(--light-gray)' }}><span>Total Unit Pay</span><span className="font-mono">{formatCurrency(t.totalUnitPay)}</span></div>
                                            </div>
                                          </div>
                                          <div>
                                            <p className="font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Adjustments &amp; Tax</p>
                                            <div className="space-y-1">
                                              {t.taxedAdj !== 0 && <div className="flex justify-between"><span>Taxed Adj</span><span className="font-mono" style={{ color: t.taxedAdj >= 0 ? '#065f46' : '#991b1b' }}>{t.taxedAdj >= 0 ? '+' : ''}{formatCurrency(t.taxedAdj)}</span></div>}
                                              {t.nonTaxedAdj !== 0 && <div className="flex justify-between"><span>Non-taxed Adj</span><span className="font-mono" style={{ color: t.nonTaxedAdj >= 0 ? '#065f46' : '#991b1b' }}>{t.nonTaxedAdj >= 0 ? '+' : ''}{formatCurrency(t.nonTaxedAdj)}</span></div>}
                                              {t.tax > 0 && <div className="flex justify-between"><span>Tax (5%)</span><span className="font-mono" style={{ color: '#991b1b' }}>({formatCurrency(t.tax)})</span></div>}
                                              {t.taxedAdj === 0 && t.nonTaxedAdj === 0 && t.tax === 0 && <div className="flex justify-between" style={{ color: 'var(--mid-gray)' }}><span>None</span><span>—</span></div>}
                                            </div>
                                          </div>
                                          <div>
                                            <p className="font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Summary</p>
                                            <div className="space-y-1">
                                              <div className="flex justify-between"><span>Gross Pay</span><span className="font-mono font-semibold">{formatCurrency(t.gross)}</span></div>
                                              <div className="flex justify-between"><span>Tax</span><span className="font-mono" style={{ color: '#991b1b' }}>{t.tax > 0 ? `(${formatCurrency(t.tax)})` : '—'}</span></div>
                                              <div className="flex justify-between border-t pt-1 font-bold" style={{ borderColor: 'var(--light-gray)', color: '#166534' }}><span>NET PAY</span><span className="font-mono">{formatCurrency(t.net)}</span></div>
                                            </div>
                                          </div>
                                        </div>

                                        {/* ── Actions ── */}
                                        <div className="flex items-center gap-2 pt-2 border-t flex-wrap" style={{ borderColor: 'var(--light-gray)' }}>
                                          <button onClick={(e) => { e.stopPropagation(); downloadPdf(p) }}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium border"
                                            style={{ borderColor: 'var(--charcoal)', color: 'var(--charcoal)' }}>
                                            <Download size={13} /> PDF
                                          </button>
                                          {p.existingStatus !== 'LOCKED' && p.existingStatus !== 'FINAL' && (
                                            <button onClick={(e) => { e.stopPropagation(); saveSingleConsultant(p.consultantId) }} disabled={savingMap[p.consultantId]}
                                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white disabled:opacity-50"
                                              style={{ background: savedMap[p.consultantId] ? '#059669' : 'var(--deep-teal)', transition: 'background 0.3s' }}>
                                              {savingMap[p.consultantId] ? <Loader2 size={13} className="animate-spin" /> : savedMap[p.consultantId] ? <CheckCircle2 size={13} /> : <Save size={13} />}
                                              {savingMap[p.consultantId] ? 'Saving...' : savedMap[p.consultantId] ? 'Saved!' : 'Save'}
                                            </button>
                                          )}
                                          {/* Re-run: only when DRAFT (not locked/finalized) */}
                                          {(!p.existingStatus || p.existingStatus === 'DRAFT') && (
                                            <button onClick={(e) => { e.stopPropagation(); rerunSingleConsultant(p.consultantId) }} disabled={rerunningMap[p.consultantId]}
                                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium border disabled:opacity-50"
                                              style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}
                                              title="Re-fetch from POS orders">
                                              {rerunningMap[p.consultantId] ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                              {rerunningMap[p.consultantId] ? 'Running...' : 'Re-run'}
                                            </button>
                                          )}
                                          {/* Lock per person: DRAFT → FINAL */}
                                          {(!p.existingStatus || p.existingStatus === 'DRAFT') && (
                                            <button onClick={(e) => { e.stopPropagation(); lockSingleConsultant(p.consultantId) }} disabled={lockingMap[p.consultantId]}
                                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white disabled:opacity-50"
                                              style={{ background: '#4338ca' }}
                                              title="Finalize this payslip (status → FINAL). Full LOCKED status with journal entry requires clicking 'Lock Payroll' at the top of the page.">
                                              {lockingMap[p.consultantId] ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                                              {lockingMap[p.consultantId] ? 'Finalizing...' : 'Finalize'}
                                            </button>
                                          )}
                                          {/* Unlock per person: FINAL or LOCKED → DRAFT */}
                                          {(p.existingStatus === 'FINAL' || p.existingStatus === 'LOCKED') && (
                                            <button onClick={(e) => { e.stopPropagation(); unlockSingleConsultant(p.consultantId) }} disabled={unlockingMap[p.consultantId]}
                                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium border disabled:opacity-50"
                                              style={{ borderColor: '#4338ca', color: '#4338ca' }}
                                              title="Unlock to allow corrections">
                                              {unlockingMap[p.consultantId] ? <Loader2 size={13} className="animate-spin" /> : <LockOpen size={13} />}
                                              {unlockingMap[p.consultantId] ? 'Unlocking...' : 'Unlock'}
                                            </button>
                                          )}
                                          <button onClick={(e) => { e.stopPropagation(); emailClinician(p) }} disabled={isSendingThis || emailSt === 'success'}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white disabled:opacity-50"
                                            style={{ background: emailSt === 'success' ? '#059669' : '#c44b00' }}>
                                            {isSendingThis ? <Loader2 size={13} className="animate-spin" /> : emailSt === 'success' ? <CheckCircle2 size={13} /> : <Mail size={13} />}
                                            {isSendingThis ? 'Sending...' : emailSt === 'success' ? 'Sent' : 'Email'}
                                          </button>
                                          {emailSt === 'error' && (
                                            <span className="flex items-center gap-1 text-xs text-red-600">
                                              <AlertCircle size={13} /> {emailMsg[p.consultantId]}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            )
                          })}
                        </tbody>
                        {visiblePreviews.length > 0 && (
                          <tfoot>
                            <tr style={{ background: 'var(--off-white)' }} className="border-t font-bold">
                              <td className="px-3 py-2.5" style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>TOTAL ({visiblePreviews.length})</td>
                              <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(visiblePreviews.reduce((s, p) => s + computeTotals(p, extraUnitPays[p.consultantId] || [], adjustments[p.consultantId] || []).totalUnitPay, 0))}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(visiblePreviews.reduce((s, p) => s + p.retainerAmount, 0))}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{(() => { const v = visiblePreviews.reduce((s, p) => { const t = computeTotals(p, extraUnitPays[p.consultantId] || [], adjustments[p.consultantId] || []); return s + t.taxedAdj + t.nonTaxedAdj }, 0); return v !== 0 ? ((v > 0 ? '+' : '') + formatCurrency(v)) : '—' })()}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(visiblePreviews.reduce((s, p) => s + computeTotals(p, extraUnitPays[p.consultantId] || [], adjustments[p.consultantId] || []).gross, 0))}</td>
                              <td className="px-3 py-2.5 text-right font-mono" style={{ color: '#d97706' }}>{formatCurrency(visiblePreviews.reduce((s, p) => s + computeTotals(p, extraUnitPays[p.consultantId] || [], adjustments[p.consultantId] || []).tax, 0))}</td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(visiblePreviews.reduce((s, p) => s + computeTotals(p, extraUnitPays[p.consultantId] || [], adjustments[p.consultantId] || []).net, 0))}</td>
                              <td colSpan={2}></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>No payable transactions found for this cutoff period.</p>
                  )}
                </div>
                )
              })()}

              {payrollPreviews.length === 0 && !generating && (
                <p className="text-sm py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                  Select a cutoff period and click &quot;Generate Payslips&quot; to preview consultant payroll.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ══ EDIT PAYMENT MODAL (global — used by both Tax and Salary tabs) ══ */}
      {editPayment && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--light-gray)' }}>
              <h3 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                Edit {editPayment.type === 'tax' ? 'Tax' : 'Salary'} Payment
              </h3>
              <button onClick={() => { setEditPayment(null); setEditProofFile(null); setEditProofFileName(''); setEditPaymentConfirmReverse(false) }} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment Date</label>
                <input type="date" value={editPayment.paymentDate}
                  onChange={e => setEditPayment(prev => prev ? { ...prev, paymentDate: e.target.value } : prev)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Proof of Remittance (optional)</label>
                {editPayment.proofUrl && !editProofFile && (
                  <div className="flex items-center gap-2 mb-2">
                    <a href={editPayment.proofUrl} target="_blank" rel="noreferrer" className="text-xs underline truncate max-w-[260px]" style={{ color: 'var(--teal)' }}>{editPayment.proofUrl}</a>
                    <button onClick={() => setEditPayment(prev => prev ? { ...prev, proofUrl: '' } : prev)} className="text-xs shrink-0" style={{ color: 'var(--mid-gray)' }}>Remove</button>
                  </div>
                )}
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs cursor-pointer" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                  <Upload size={14} />
                  {editProofFileName || 'Upload new proof file'}
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { setEditProofFile(f); setEditProofFileName(f.name) } }} />
                </label>
                {editProofFile && <p className="text-[10px] mt-1" style={{ color: 'var(--teal)' }}>New file selected — will replace existing proof on save</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Notes (optional)</label>
                <textarea value={editPayment.notes}
                  onChange={e => setEditPayment(prev => prev ? { ...prev, notes: e.target.value } : prev)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--light-gray)' }} />
              </div>

              {/* Reverse remittance section */}
              <div className="pt-2 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                {!editPaymentConfirmReverse ? (
                  <button onClick={() => setEditPaymentConfirmReverse(true)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border"
                    style={{ borderColor: '#fca5a5', color: '#ef4444' }}>
                    <ShieldOff size={13} /> Reverse Remittance
                  </button>
                ) : (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: '#fff1f2' }}>
                    <p className="text-xs font-semibold" style={{ color: '#dc2626' }}>This will undo the remittance and move the entries back to the unremitted list. The journal entry will be deleted. Are you sure?</p>
                    <div className="flex gap-2">
                      <button onClick={() => setEditPaymentConfirmReverse(false)}
                        className="flex-1 py-1.5 rounded-lg border text-xs font-medium" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                        Cancel
                      </button>
                      <button onClick={reversePayment} disabled={reversingPayment}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ background: '#ef4444' }}>
                        {reversingPayment ? 'Reversing...' : 'Yes, Reverse'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => { setEditPayment(null); setEditProofFile(null); setEditProofFileName(''); setEditPaymentConfirmReverse(false) }}
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                Cancel
              </button>
              <button onClick={saveEditPayment} disabled={editPaymentSaving}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                {editPaymentSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
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

      {/* ═══════════════════════════════════════════════════════════
         TAB: SALARIES PAYABLE
         ═══════════════════════════════════════════════════════════ */}
      {mainTab === 'salaries-payable' && (() => {
        const isEmpTab = salPayableSubTab === 'employees'
        const activePayables = isEmpTab ? empSalPayables : salariesPayables
        const activeSelected = isEmpTab ? selectedEmpSalPayableIds : selectedSalaryPayableIds
        const setActiveSelected = isEmpTab ? setSelectedEmpSalPayableIds : setSelectedSalaryPayableIds
        const unremitted = activePayables.filter(p => !p.salariesRemitted)
        const selectedTotal = activePayables.filter(p => activeSelected.includes(p.id)).reduce((s, p) => s + p.netPay, 0)
        const isLoading = isEmpTab ? loadingEmpSalPayable : loadingSalPayable
        return (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Salaries Payable</h2>
            <div className="flex items-center gap-3">
              {activeSelected.length > 0 && (
                <button onClick={() => { setShowRemitModal('salary'); setRemitFromAccountId(''); setRemitFromSearch(''); setRemitProofUrl(''); setRemitNotes(''); setRemitFeeAmount(''); setRemitFeeExpenseAccountId(''); setRemitFeeExpenseSearch(''); setRemitFeeCashAccountId(''); setRemitFeeCashSearch('') }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ background: 'var(--teal)' }}>
                  <BadgeDollarSign size={14} /> Remit Selected ({activeSelected.length})
                </button>
              )}
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--mid-gray)' }}>
                <input type="checkbox"
                  checked={isEmpTab ? showEmpSalRemitted : showSalRemitted}
                  onChange={e => isEmpTab ? setShowEmpSalRemitted(e.target.checked) : setShowSalRemitted(e.target.checked)} />
                Show already remitted
              </label>
            </div>
          </div>

          {/* Subtabs */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--off-white)', width: 'fit-content' }}>
            {(['employees', 'consultants'] as const).map(t => (
              <button key={t} onClick={() => setSalPayableSubTab(t)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={salPayableSubTab === t ? { background: 'white', color: 'var(--deep-teal)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: 'var(--mid-gray)' }}>
                {t === 'employees' ? 'Employees' : 'Consultants'}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--teal)' }} /></div>
          ) : activePayables.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>
              {isEmpTab
                ? 'No employee salary records. Lock employee payslips to see them here.'
                : 'No consultant salary records. Finalize consultant payroll to create entries.'}
            </p>
          ) : (
            <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="px-3 py-2.5 w-10">
                      <input type="checkbox"
                        checked={unremitted.length > 0 && unremitted.every(p => activeSelected.includes(p.id))}
                        onChange={e => {
                          if (e.target.checked) setActiveSelected(prev => [...new Set([...prev, ...unremitted.map(p => p.id)])])
                          else setActiveSelected(prev => prev.filter(id => !unremitted.find(p => p.id === id)))
                        }} />
                    </th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>
                      {isEmpTab ? 'Employee' : 'Consultant'}
                    </th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Cutoff Period</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</th>
                    <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Gross Pay</th>
                    <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Deductions</th>
                    <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Net Pay</th>
                    <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activePayables.map(p => (
                    <tr key={p.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-2.5">
                        {!p.salariesRemitted && (
                          <input type="checkbox"
                            checked={activeSelected.includes(p.id)}
                            onChange={e => setActiveSelected(prev =>
                              e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                            )} />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium" style={{ color: 'var(--charcoal)' }}>
                          {isEmpTab ? (p.employeeName || '—') : (p.consultantName || '—')}
                        </p>
                        {p.department && <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{DEPT_LABELS[p.department] || p.department}</p>}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{getCutoffLabel(p.cutoffPeriod)}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{branchLabel(p.branch)}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{p.grossPay != null ? formatCurrency(p.grossPay) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: '#c44b00' }}>{p.taxAmount != null && p.taxAmount > 0 ? formatCurrency(p.taxAmount) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--teal)' }}>{formatCurrency(p.netPay)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={p.salariesRemitted ? { background: '#dcfce7', color: '#16a34a' } : { background: '#fef3c7', color: '#d97706' }}>
                          {p.salariesRemitted ? 'REMITTED' : 'PENDING'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {unremitted.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'var(--off-white)' }}>
                <span className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>
                  Total unremitted: <span style={{ color: 'var(--teal)' }}>{formatCurrency(unremitted.reduce((s, p) => s + p.netPay, 0))}</span>
                  {activeSelected.length > 0 && <span className="ml-3">Selected: <span style={{ color: 'var(--deep-teal)' }}>{formatCurrency(selectedTotal)}</span></span>}
                </span>
                {activeSelected.length > 0 && (
                  <button onClick={() => { setShowRemitModal('salary'); setRemitFromAccountId(''); setRemitFromSearch(''); setRemitProofUrl(''); setRemitNotes(''); setRemitFeeAmount(''); setRemitFeeExpenseAccountId(''); setRemitFeeExpenseSearch(''); setRemitFeeCashAccountId(''); setRemitFeeCashSearch('') }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'var(--teal)' }}>
                    <BadgeDollarSign size={14} /> Remit Selected ({activeSelected.length} payslips)
                  </button>
                )}
              </div>
            )}
            </div>
          )}

          {/* Salary Payment History — only on Consultants tab */}
          {salPayableSubTab === 'consultants' && salaryPayments.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>Payment History</p>
              <div className="space-y-3">
                {salaryPayments.map(sp => (
                  <div key={sp.id} className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>
                          {new Date(sp.paymentDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                          {sp.fromAccount.accountNumber} — {sp.fromAccount.accountTitle}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                          {sp.cutoffPeriod}{sp.branch ? ` · ${branchLabel(sp.branch)}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold" style={{ color: '#166534' }}>{formatCurrency(sp.totalAmount)}</span>
                        {sp.proofUrl ? (
                          <a href={sp.proofUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs underline" style={{ color: 'var(--teal)' }}>Proof</a>
                        ) : null}
                        {canWrite && (
                          <button onClick={() => setEditPayment({ id: sp.id, type: 'salary', paymentDate: sp.paymentDate.slice(0, 10), proofUrl: sp.proofUrl || '', notes: sp.notes || '' })}
                            className="text-xs px-2 py-1 rounded-lg border font-medium hover:bg-gray-50"
                            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                    {sp.consultants && sp.consultants.length > 0 ? (
                      <table className="w-full text-xs">
                        <tbody>
                          {sp.consultants.map((c, i) => (
                            <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                              <td className="px-4 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{c.name}</td>
                              <td className="px-4 py-2" style={{ color: 'var(--mid-gray)' }}>{DEPT_LABELS[c.department] || c.department}</td>
                              <td className="px-4 py-2" style={{ color: 'var(--mid-gray)' }}>{getCutoffLabel(c.cutoffPeriod)}</td>
                              <td className="px-4 py-2 text-right font-mono font-semibold" style={{ color: 'var(--teal)' }}>{formatCurrency(c.netPay)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="px-4 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{sp.notes || '—'}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        )
      })()}

      {/* ═══════════════════════════════════════════════════════════
         TAB: BENEFITS PAYABLE
         ═══════════════════════════════════════════════════════════ */}
      {mainTab === 'benefits-payable' && (() => {
        const benUnremitted = benefitsPayables.filter(p => !p.benefitsRemitted)
        const benSelectedTotal = benefitsPayables.filter(p => selectedBenefitPayableIds.includes(p.id)).reduce((s, p) => s + p.totalBenefitsPayable, 0)
        return (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Benefits Payable (SSS, PHIC, HDMF)</h2>
            <div className="flex items-center gap-3">
              {selectedBenefitPayableIds.length > 0 && (
                <button onClick={() => { setShowRemitModal('benefit'); setRemitFromAccountId(''); setRemitFromSearch(''); setRemitProofUrl(''); setRemitNotes('') }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ background: 'var(--teal)' }}>
                  <BadgeDollarSign size={14} /> Remit Selected ({selectedBenefitPayableIds.length})
                </button>
              )}
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--mid-gray)' }}>
                <input type="checkbox" checked={showBenRemitted} onChange={e => setShowBenRemitted(e.target.checked)} />
                Show already remitted
              </label>
            </div>
          </div>
          {loadingBenPayable ? (
            <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--teal)' }} /></div>
          ) : benefitsPayables.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>No benefits payable records. Lock employee payslips to see individual contributions here.</p>
          ) : (
            <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="px-3 py-2.5 w-10">
                      <input type="checkbox"
                        checked={benUnremitted.length > 0 && benUnremitted.every(p => selectedBenefitPayableIds.includes(p.id))}
                        onChange={e => {
                          if (e.target.checked) setSelectedBenefitPayableIds(prev => [...new Set([...prev, ...benUnremitted.map(p => p.id)])])
                          else setSelectedBenefitPayableIds(prev => prev.filter(id => !benUnremitted.find(p => p.id === id)))
                        }} />
                    </th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Employee</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Cutoff</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</th>
                    <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>SSS EE</th>
                    <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>SSS ER</th>
                    <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>PHIC EE</th>
                    <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>PHIC ER</th>
                    <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>HDMF EE</th>
                    <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>HDMF ER</th>
                    <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Total</th>
                    <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {benefitsPayables.map(p => (
                    <tr key={p.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-2.5">
                        {!p.benefitsRemitted && (
                          <input type="checkbox"
                            checked={selectedBenefitPayableIds.includes(p.id)}
                            onChange={e => setSelectedBenefitPayableIds(prev =>
                              e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                            )} />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium" style={{ color: 'var(--charcoal)' }}>{p.employeeName}</p>
                        {p.department && <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{DEPT_LABELS[p.department] || p.department}</p>}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{getCutoffLabel(p.cutoffPeriod)}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{branchLabel(p.branch)}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{p.sssEE > 0 ? formatCurrency(p.sssEE) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{p.sssER > 0 ? formatCurrency(p.sssER) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{p.philEE > 0 ? formatCurrency(p.philEE) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{p.philER > 0 ? formatCurrency(p.philER) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{p.pagEE > 0 ? formatCurrency(p.pagEE) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{p.pagER > 0 ? formatCurrency(p.pagER) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--teal)' }}>{formatCurrency(p.totalBenefitsPayable)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={p.benefitsRemitted ? { background: '#dcfce7', color: '#16a34a' } : { background: '#fef3c7', color: '#d97706' }}>
                          {p.benefitsRemitted ? 'REMITTED' : 'PENDING'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(benUnremitted.length > 0 || selectedBenefitPayableIds.length > 0) && (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'var(--off-white)' }}>
                <span className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>
                  Total unremitted: <span style={{ color: 'var(--teal)' }}>{formatCurrency(benUnremitted.reduce((s, p) => s + p.totalBenefitsPayable, 0))}</span>
                  {selectedBenefitPayableIds.length > 0 && <span className="ml-3">Selected: <span style={{ color: 'var(--deep-teal)' }}>{formatCurrency(benSelectedTotal)}</span></span>}
                </span>
                {selectedBenefitPayableIds.length > 0 && (
                  <button onClick={() => { setShowRemitModal('benefit'); setRemitFromAccountId(''); setRemitFromSearch(''); setRemitProofUrl(''); setRemitNotes('') }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'var(--teal)' }}>
                    <BadgeDollarSign size={14} /> Remit Selected ({selectedBenefitPayableIds.length} employees)
                  </button>
                )}
              </div>
            )}
            </div>
          )}
        </div>
        )
      })()}

      {/* ═══════════════════════════════════════════════════════════
         TAB: PAYROLL SETTINGS (COA MAPPING)
         ═══════════════════════════════════════════════════════════ */}
      {mainTab === 'payroll-settings' && (
        <div className="space-y-5">
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Payroll Chart of Accounts Mapping</h2>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Configure which chart of accounts are used when payroll is finalized. These determine the journal entries created.</p>

          {/* Search accounts */}
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={coaSearch} onChange={e => setCoaSearch(e.target.value)} placeholder="Search accounts..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Expense Accounts */}
            <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Expense Accounts (Debits)</h3>
              {[
                { key: 'salaryExpenseAccountId', label: 'Gross Salary — Employees', rel: 'salaryExpenseAccount' },
                { key: 'professionalFeesAccountId', label: 'Gross Fees — Consultants', rel: 'professionalFeesAccount' },
                { key: 'sssERAccountId', label: 'SSS Contribution (ER)', rel: 'sssERAccount' },
                { key: 'hdmfERAccountId', label: 'HDMF/Pag-IBIG Contribution (ER)', rel: 'hdmfERAccount' },
                { key: 'philhealthERAccountId', label: 'PhilHealth Contribution (ER)', rel: 'philhealthERAccount' },
              ].map(({ key, label, rel }) => {
                const current = coaMapping[rel] as { accountNumber: string; accountTitle: string } | null
                const filteredAccts = allAccounts.filter(a =>
                  a.accountType === 'EXPENSE' && (!coaSearch || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(coaSearch.toLowerCase()))
                )
                return (
                  <div key={key}>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>{label}</label>
                    <select value={coaEdits[key] ?? coaMapping[key] ?? ''} onChange={e => setCoaEdits(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— Select Account —</option>
                      {filteredAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
                    </select>
                    {current && !coaEdits[key] && <p className="text-[10px] mt-0.5" style={{ color: 'var(--teal)' }}>Current: {current.accountNumber} — {current.accountTitle}</p>}
                  </div>
                )
              })}
            </div>

            {/* Liability Accounts */}
            <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Liability Accounts (Credits)</h3>
              {[
                { key: 'salariesPayableAccountId', label: 'Salaries and Wages Payable', rel: 'salariesPayableAccount' },
                { key: 'benefitsPayableAccountId', label: 'SSS, PHIC, HDMF Payable', rel: 'benefitsPayableAccount' },
                { key: 'taxPayableAccountId', label: 'Withholding Tax Payable', rel: 'taxPayableAccount' },
              ].map(({ key, label, rel }) => {
                const current = coaMapping[rel] as { accountNumber: string; accountTitle: string } | null
                const filteredAccts = allAccounts.filter(a =>
                  a.accountType === 'LIABILITY' && (!coaSearch || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(coaSearch.toLowerCase()))
                )
                return (
                  <div key={key}>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>{label}</label>
                    <select value={coaEdits[key] ?? coaMapping[key] ?? ''} onChange={e => setCoaEdits(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— Select Account —</option>
                      {filteredAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
                    </select>
                    {current && !coaEdits[key] && <p className="text-[10px] mt-0.5" style={{ color: 'var(--teal)' }}>Current: {current.accountNumber} — {current.accountTitle}</p>}
                  </div>
                )
              })}
            </div>
          </div>

          <button onClick={saveCoaMapping} disabled={savingCoa || Object.keys(coaEdits).length === 0}
            className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: Object.keys(coaEdits).length > 0 ? 'var(--teal)' : 'var(--mid-gray)' }}>
            {savingCoa ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {savingCoa ? 'Saving...' : 'Save COA Mapping'}
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
         REMIT PAYMENT MODAL
         ═══════════════════════════════════════════════════════════ */}
      {showRemitModal && (() => {
        const isEmpSalaryModal = showRemitModal === 'salary' && salPayableSubTab === 'employees'
        const ids = showRemitModal === 'salary'
          ? (isEmpSalaryModal ? selectedEmpSalPayableIds : selectedSalaryPayableIds)
          : selectedBenefitPayableIds
        const modalTotal = showRemitModal === 'salary'
          ? (isEmpSalaryModal
              ? empSalPayables.filter(p => ids.includes(p.id)).reduce((s, p) => s + p.netPay, 0)
              : salariesPayables.filter(p => ids.includes(p.id)).reduce((s, p) => s + p.netPay, 0))
          : benefitsPayables.filter(p => ids.includes(p.id)).reduce((s, p) => s + p.totalBenefitsPayable, 0)
        const feeAmt = showRemitModal === 'salary' ? (Number(remitFeeAmount) || 0) : 0
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowRemitModal(null)}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: 'white' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                Record {showRemitModal === 'salary' ? 'Salary' : 'Benefit'} Payment
              </h3>
              <button onClick={() => setShowRemitModal(null)} className="p-1 rounded-lg hover:bg-gray-100"><X size={16} /></button>
            </div>

            <div className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: '#f0fdfa', color: 'var(--deep-teal)' }}>
              {ids.length} entries — Net Pay: {formatCurrency(modalTotal)}{feeAmt > 0 ? ` + Fee: ${formatCurrency(feeAmt)} = Total: ${formatCurrency(modalTotal + feeAmt)}` : ''}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payment Date</label>
                <input type="date" value={remitDate} onChange={e => setRemitDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Source Account (Cash/Bank)</label>
                <input value={remitFromSearch} onChange={e => setRemitFromSearch(e.target.value)} placeholder="Search asset accounts..."
                  className="w-full px-3 py-2 rounded-lg border text-xs mb-1" style={{ borderColor: 'var(--light-gray)' }} />
                <select value={remitFromAccountId} onChange={e => setRemitFromAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">— Select Account —</option>
                  {allAccounts
                    .filter(a => a.accountType === 'ASSET' && (!remitFromSearch || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(remitFromSearch.toLowerCase())))
                    .map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Notes (optional)</label>
                <input value={remitNotes} onChange={e => setRemitNotes(e.target.value)} placeholder="Payment reference, check number, etc."
                  className="w-full px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Proof of Remittance (optional)</label>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                  <Upload size={13} />
                  {remitProofFileName || 'Upload proof file (image or PDF)'}
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { setRemitProofFile(f); setRemitProofFileName(f.name) } }} />
                </label>
                {remitUploading && <p className="text-[10px] mt-1" style={{ color: 'var(--teal)' }}>Uploading...</p>}
              </div>
            </div>

            {showRemitModal === 'salary' && (
              <div className="space-y-3 pt-1 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Remittance Fee (optional)</p>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Fee Amount</label>
                  <input type="number" min="0" step="0.01" value={remitFeeAmount} onChange={e => setRemitFeeAmount(e.target.value)}
                    placeholder="0.00" className="w-full px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
                {Number(remitFeeAmount) > 0 && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Fee Expense Account (Debit)</label>
                      <input value={remitFeeExpenseSearch} onChange={e => setRemitFeeExpenseSearch(e.target.value)} placeholder="Search expense accounts..."
                        className="w-full px-3 py-2 rounded-lg border text-xs mb-1" style={{ borderColor: 'var(--light-gray)' }} />
                      <select value={remitFeeExpenseAccountId} onChange={e => setRemitFeeExpenseAccountId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">— Select Expense Account —</option>
                        {allAccounts
                          .filter(a => a.accountType === 'EXPENSE' && (!remitFeeExpenseSearch || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(remitFeeExpenseSearch.toLowerCase())))
                          .map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Fee Cash Account (Credit — defaults to source above)</label>
                      <input value={remitFeeCashSearch} onChange={e => setRemitFeeCashSearch(e.target.value)} placeholder="Search asset accounts (leave blank to use source account)..."
                        className="w-full px-3 py-2 rounded-lg border text-xs mb-1" style={{ borderColor: 'var(--light-gray)' }} />
                      <select value={remitFeeCashAccountId} onChange={e => setRemitFeeCashAccountId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">— Same as Source Account —</option>
                        {allAccounts
                          .filter(a => a.accountType === 'ASSET' && (!remitFeeCashSearch || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(remitFeeCashSearch.toLowerCase())))
                          .map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowRemitModal(null)}
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                Cancel
              </button>
              <button onClick={handleRemit} disabled={remitting || !remitFromAccountId}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--teal)' }}>
                {remitting ? 'Recording...' : `Record Payment — ${formatCurrency(modalTotal + feeAmt)}`}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Session Breakdown Modal */}
      {sessionBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setSessionBreakdown(null)}>
          <div className="w-full max-w-4xl max-h-[85vh] overflow-auto rounded-2xl p-6 space-y-3" style={{ background: 'white' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Session Details: {sessionBreakdown.unitPayName}</h3>
              <button onClick={() => setSessionBreakdown(null)} className="p-1 rounded-lg hover:bg-gray-100"><X size={16} /></button>
            </div>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{sessionBreakdown.sessions.reduce((s, x) => s + (x.quantity ?? 1), 0)} session(s) counted</p>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--pale-teal)' }}>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--deep-teal)' }}>Date</th>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--deep-teal)' }}>Patient</th>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--deep-teal)' }}>Service</th>
                    <th className="px-3 py-2 text-center font-semibold" style={{ color: 'var(--deep-teal)' }}>Qty</th>
                    <th className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--deep-teal)' }}>Order Net</th>
                    <th className="px-3 py-2 text-center font-semibold" style={{ color: 'var(--deep-teal)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sessionBreakdown.sessions].sort((a, b) => a.date.localeCompare(b.date)).map((s, i) => {
                    const status = s.orderStatus || 'COMPLETED'
                    const isVoided = status === 'CANCELLED' || status === 'VOIDED'
                    const isReopened = status === 'REOPENED'
                    return (
                      <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)', opacity: isVoided ? 0.5 : 1 }}>
                        <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{new Date(s.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{s.patientName}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{s.serviceName}</td>
                        <td className="px-3 py-2 text-center font-semibold" style={{ color: 'var(--charcoal)' }}>{s.quantity ?? 1}</td>
                        <td className="px-3 py-2 text-right font-medium" style={{ color: isVoided ? '#991b1b' : 'var(--charcoal)', textDecoration: isVoided ? 'line-through' : 'none' }}>{formatCurrency(s.orderNetAmount)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={isVoided ? { background: '#fee2e2', color: '#991b1b' } : isReopened ? { background: '#fef3c7', color: '#92400e' } : { background: '#dcfce7', color: '#166534' }}>
                            {isVoided ? 'Voided' : isReopened ? 'Reopened' : 'Completed'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
