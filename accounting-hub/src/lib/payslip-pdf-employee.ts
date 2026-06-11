/**
 * Shared EMPLOYEE payslip PDF page-1 builder.
 *
 * This is the SINGLE source of truth for the employee payslip's look so the
 * copy generated inside the Accounting Hub (Payroll → download/email) is
 * visually identical to the one employees see in teletherapy.sapphireclinicseast.org
 * (which streams from /api/internal/my-payslips/pdf). Returns the jsPDF doc so
 * callers can either `doc.save()` (client) or `doc.output('arraybuffer')` (server),
 * and the EmployeePayroll admin view can append its own Page-2 attendance breakdown.
 *
 * jsPDF + jsPDF-autotable run in both Node 20+ and the browser, so this works
 * server- and client-side.
 */
import { SCEI_LOGO_DATA_URI, SCEI_LOGO_W, SCEI_LOGO_H } from '@/lib/scei-logo'

const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
  SANDBOX_EAST: 'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
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

export interface EmployeePayslipInput {
  cutoffPeriod: string
  branch: string
  basicPay: unknown; overtimePay: unknown; holidayPay: unknown; nightDiffPay: unknown
  restDayPay: unknown; allowances: unknown; grossPay: unknown
  sssDeduction: unknown; philhealthDeduction: unknown; pagibigDeduction: unknown
  taxDeduction: unknown; lateDeduction: unknown; undertimeDeduction: unknown
  otherDeductions: unknown; totalDeductions: unknown; netPay: unknown
  daysWorked: unknown; hoursWorked: unknown
  employee: { firstName: string; lastName: string }
}

/**
 * Build the employee payslip (page 1) and return the jsPDF doc.
 * eslint-disable-next-line @typescript-eslint/no-explicit-any
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildEmployeePayslipPdf(slip: EmployeePayslipInput): Promise<any> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const NARRA: [number, number, number] = [36, 73, 82]
  const CLAY: [number, number, number] = [74, 128, 115]
  const NET_GREEN: [number, number, number] = [237, 243, 217]
  const MID: [number, number, number] = [80, 80, 80]

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 20
  let y = margin

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...CLAY)
  doc.addImage(SCEI_LOGO_DATA_URI, 'PNG', margin, 10, SCEI_LOGO_W, SCEI_LOGO_H)
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

  return doc
}
