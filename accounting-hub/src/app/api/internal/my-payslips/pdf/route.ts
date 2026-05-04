/**
 * GET /api/internal/my-payslips/pdf?email=<email>&kind=employee|consultant&id=<payslip-id>
 *
 * Streams the LOCKED payslip PDF for a given (email, kind, id) tuple.
 * Resolution strategy:
 *   1. If a stored PDF exists on disk (uploaded by the accountant when
 *      they Download/Email from the accounting hub), stream that — it's
 *      the version the accountant has already vetted.
 *   2. Otherwise, GENERATE a brand-aligned PDF on the fly from the
 *      payslip row in the DB so clinicians can view their pay even
 *      when no PDF has been uploaded yet.
 *
 * Either way we re-verify status === 'LOCKED' and email match first.
 *
 * Auth: Authorization: Bearer ${TELETHERAPY_INTERNAL_API_KEY}
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'

const PDF_DIR = process.env.PDF_STORAGE_DIR || '/app/uploads/payslips'

function verifyKey(req: NextRequest): boolean {
  const key = process.env.TELETHERAPY_INTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'Sandbox East',
  SBGH: 'Sandbox Greenhills',
  SANDBOX_EAST: 'Sandbox East',
  SANDBOX_GREENHILLS: 'Sandbox Greenhills',
  VERDANA_STORE: 'Verdana Store',
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const CUTOFF = {
  c1StartDay: 26, c1StartPrevMonth: true, c1EndDay: 10,
  c2StartDay: 11, c2EndLastDay: false, c2EndDay: 25,
}
function fmtCutoffLabel(period: string): string {
  const m = period.match(/^(\d{4})-(\d{2})-([12])$/)
  if (!m) return period
  const year = Number(m[1]); const month = Number(m[2]); const half = Number(m[3]) as 1 | 2
  const monthLabel = MONTHS[month - 1]
  const halfLabel = half === 1 ? 'First Cut-off' : 'Second Cut-off'
  let startMonth: number, startYear: number, startDay: number, endDay: number
  if (half === 1) {
    startDay = CUTOFF.c1StartDay
    startMonth = CUTOFF.c1StartPrevMonth ? (month === 1 ? 12 : month - 1) : month
    startYear = CUTOFF.c1StartPrevMonth && month === 1 ? year - 1 : year
    endDay = CUTOFF.c1EndDay
  } else {
    startDay = CUTOFF.c2StartDay; startMonth = month; startYear = year
    endDay = CUTOFF.c2EndLastDay ? new Date(year, month, 0).getDate() : CUTOFF.c2EndDay
  }
  const startMonthLabel = MONTHS[startMonth - 1]
  const range = startMonth === month && startYear === year
    ? `${startMonthLabel} ${startDay}-${endDay}, ${year}`
    : `${startMonthLabel} ${startDay}-${monthLabel} ${endDay}, ${year}`
  return `${monthLabel} ${year} (${halfLabel}): ${range}`
}
const fmtPHP = (n: number) =>
  `PHP ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── PDF builders (server-side, jsPDF in Node) ─────────────────────
async function buildEmployeePdf(slip: {
  cutoffPeriod: string; branch: string; basicPay: unknown; overtimePay: unknown
  holidayPay: unknown; nightDiffPay: unknown; restDayPay: unknown; allowances: unknown
  grossPay: unknown; sssDeduction: unknown; philhealthDeduction: unknown
  pagibigDeduction: unknown; taxDeduction: unknown; lateDeduction: unknown
  undertimeDeduction: unknown; otherDeductions: unknown; totalDeductions: unknown
  netPay: unknown; daysWorked: unknown; hoursWorked: unknown
  employee: { firstName: string; lastName: string }
}): Promise<Buffer> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const NARRA: [number, number, number] = [27, 63, 56]
  const CLAY: [number, number, number] = [168, 92, 61]
  const NET_GREEN: [number, number, number] = [226, 239, 217]
  const MID: [number, number, number] = [80, 80, 80]

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 20
  let y = margin

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...CLAY)
  doc.text('SAPPHIRE CLINICS EAST INC.', pageW / 2, y + 8, { align: 'center' })
  y += 12
  doc.setFontSize(11).setTextColor(...NARRA).text('Payslip', pageW / 2, y, { align: 'center' })
  y += 8
  doc.setDrawColor(...CLAY).setLineWidth(0.6).line(margin, y, pageW - margin, y)
  y += 6

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MID)
  doc.text(`Employee:  ${slip.employee.lastName}, ${slip.employee.firstName}`, margin, y); y += 5
  doc.text(`Branch:    ${BRANCH_LABEL[slip.branch] ?? slip.branch}`, margin, y); y += 5
  doc.text(`Cut-off:   ${fmtCutoffLabel(slip.cutoffPeriod)}`, margin, y); y += 8

  const num = (v: unknown) => Number(v ?? 0)
  const earningsRows: [string, string][] = [
    ['Basic Pay', fmtPHP(num(slip.basicPay))],
    ['Overtime Pay', fmtPHP(num(slip.overtimePay))],
    ['Holiday Pay', fmtPHP(num(slip.holidayPay))],
    ['Night Differential', fmtPHP(num(slip.nightDiffPay))],
    ['Rest Day Pay', fmtPHP(num(slip.restDayPay))],
    ['Allowances', fmtPHP(num(slip.allowances))],
  ]
  autoTable(doc, {
    startY: y,
    head: [['Earnings', 'Amount']],
    body: [...earningsRows, [{ content: 'Gross Pay', styles: { fontStyle: 'bold' } }, { content: fmtPHP(num(slip.grossPay)), styles: { fontStyle: 'bold' } }]],
    theme: 'grid',
    headStyles: { fillColor: NARRA, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    styles: { fontSize: 9, cellPadding: 2 },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 4

  const dedRows: [string, string][] = [
    ['SSS', fmtPHP(num(slip.sssDeduction))],
    ['PhilHealth', fmtPHP(num(slip.philhealthDeduction))],
    ['Pag-IBIG', fmtPHP(num(slip.pagibigDeduction))],
    ['Withholding Tax', fmtPHP(num(slip.taxDeduction))],
    ['Late', fmtPHP(num(slip.lateDeduction))],
    ['Undertime', fmtPHP(num(slip.undertimeDeduction))],
    ['Other Deductions', fmtPHP(num(slip.otherDeductions))],
  ]
  autoTable(doc, {
    startY: y,
    head: [['Deductions', 'Amount']],
    body: [...dedRows, [{ content: 'Total Deductions', styles: { fontStyle: 'bold' } }, { content: fmtPHP(num(slip.totalDeductions)), styles: { fontStyle: 'bold' } }]],
    theme: 'grid',
    headStyles: { fillColor: NARRA, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    styles: { fontSize: 9, cellPadding: 2 },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6

  // Net pay highlight box
  doc.setFillColor(...NET_GREEN).rect(margin, y, pageW - margin * 2, 14, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...NARRA)
  doc.text('NET PAY', margin + 4, y + 9)
  doc.text(fmtPHP(num(slip.netPay)), pageW - margin - 4, y + 9, { align: 'right' })
  y += 18

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MID)
  doc.text(`Days worked: ${num(slip.daysWorked)}  ·  Hours worked: ${num(slip.hoursWorked)}`, margin, y)
  y += 8
  doc.text('This payslip was generated by Sapphire Clinics East accounting.', margin, y)

  // jsPDF returns ArrayBuffer when called with 'arraybuffer' option
  const out = doc.output('arraybuffer') as ArrayBuffer
  return Buffer.from(out)
}

interface ConsultantItem { unitPayName?: string; quantity?: number; lineTotal?: number; unitAmount?: number }
async function buildConsultantPdf(entry: {
  cutoffPeriod: string; branch: string; items: unknown
  grossPay: unknown; retainerAmount: unknown; taxAmount: unknown; netPay: unknown
  consultant: { name: string }
}): Promise<Buffer> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const NARRA: [number, number, number] = [27, 63, 56]
  const CLAY: [number, number, number] = [168, 92, 61]
  const NET_GREEN: [number, number, number] = [226, 239, 217]
  const MID: [number, number, number] = [80, 80, 80]

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 20
  let y = margin

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...CLAY)
  doc.text('SAPPHIRE CLINICS EAST INC.', pageW / 2, y + 8, { align: 'center' })
  y += 12
  doc.setFontSize(11).setTextColor(...NARRA).text('Payslip — Consultant', pageW / 2, y, { align: 'center' })
  y += 8
  doc.setDrawColor(...CLAY).setLineWidth(0.6).line(margin, y, pageW - margin, y)
  y += 6

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MID)
  doc.text(`Consultant: ${entry.consultant.name}`, margin, y); y += 5
  doc.text(`Branch:     ${BRANCH_LABEL[entry.branch] ?? entry.branch}`, margin, y); y += 5
  doc.text(`Cut-off:    ${fmtCutoffLabel(entry.cutoffPeriod)}`, margin, y); y += 8

  const num = (v: unknown) => Number(v ?? 0)
  const items = (Array.isArray(entry.items) ? entry.items : []) as ConsultantItem[]
  const itemRows: (string | number)[][] = items.length === 0
    ? [['No itemised line items recorded.', '', '', '']]
    : items.map((it) => [
        it.unitPayName ?? '—',
        Number(it.quantity ?? 0).toString(),
        fmtPHP(Number(it.unitAmount ?? 0)),
        fmtPHP(Number(it.lineTotal ?? 0)),
      ])

  autoTable(doc, {
    startY: y,
    head: [['Service', 'Qty', 'Rate', 'Total']],
    body: itemRows,
    theme: 'grid',
    headStyles: { fillColor: NARRA, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    styles: { fontSize: 9, cellPadding: 2 },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6

  const summary: [string, string][] = [
    ['Retainer', fmtPHP(num(entry.retainerAmount))],
    ['Gross Pay', fmtPHP(num(entry.grossPay))],
    ['Withholding Tax', fmtPHP(num(entry.taxAmount))],
  ]
  autoTable(doc, {
    startY: y,
    body: summary,
    theme: 'plain',
    columnStyles: { 1: { halign: 'right' } },
    styles: { fontSize: 9, cellPadding: 1.5 },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 4

  doc.setFillColor(...NET_GREEN).rect(margin, y, pageW - margin * 2, 14, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...NARRA)
  doc.text('NET PAY', margin + 4, y + 9)
  doc.text(fmtPHP(num(entry.netPay)), pageW - margin - 4, y + 9, { align: 'right' })
  y += 18

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MID)
  doc.text('This payslip was generated by Sapphire Clinics East accounting.', margin, y)

  const out = doc.output('arraybuffer') as ArrayBuffer
  return Buffer.from(out)
}

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = (req.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase()
  const kind = req.nextUrl.searchParams.get('kind') ?? ''
  const id = req.nextUrl.searchParams.get('id') ?? ''

  if (!email || !id || !['employee', 'consultant'].includes(kind)) {
    return NextResponse.json({ error: 'email, kind (employee|consultant), and id are required' }, { status: 400 })
  }

  let buffer: Buffer | null = null

  if (kind === 'employee') {
    const slip = await prisma.employeePayslip.findUnique({
      where: { id },
      include: { employee: { select: { email: true, firstName: true, lastName: true } } },
    })
    if (!slip || slip.status !== 'LOCKED') {
      return NextResponse.json({ error: 'Not found or not locked' }, { status: 404 })
    }
    if ((slip.employee.email ?? '').toLowerCase() !== email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Prefer stored PDF if present on disk (accountant has vetted it).
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
    const filePath = path.join(PDF_DIR, kind, `${safeId}.pdf`)
    if (existsSync(filePath)) {
      buffer = await readFile(filePath)
    } else {
      buffer = await buildEmployeePdf(slip)
    }
  } else {
    const entry = await prisma.payrollEntry.findUnique({
      where: { id },
      include: { consultant: { select: { email: true, name: true } } },
    })
    if (!entry || entry.status !== 'LOCKED') {
      return NextResponse.json({ error: 'Not found or not locked' }, { status: 404 })
    }
    if ((entry.consultant.email ?? '').toLowerCase() !== email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
    const filePath = path.join(PDF_DIR, kind, `${safeId}.pdf`)
    if (existsSync(filePath)) {
      buffer = await readFile(filePath)
    } else {
      buffer = await buildConsultantPdf(entry)
    }
  }

  // Convert Buffer → Uint8Array so it's a valid BodyInit for NextResponse.
  const body = new Uint8Array(buffer)
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="payslip-${id}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
