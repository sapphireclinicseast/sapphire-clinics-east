/**
 * Shared EMPLOYEE payslip PDF builder — the single source of truth for the
 * employee payslip, used by:
 *   • Payroll → Employees (download / email / download all) in the hub,
 *   • /api/internal/my-payslips/pdf, which the staff portal downloads from.
 * Page 1 is the payslip; page 2 is the daily attendance breakdown for
 * biometrics-based employees (skipped for fixed-salary staff and special runs).
 *
 * Look: lib/payslip-look.ts (the HMO collection report's look, portrait).
 * jsPDF + jsPDF-autotable run in both Node 20+ and the browser.
 */
import { specialPeriodLabel } from '@/lib/payroll/special-runs'
import {
  PS_M, PS_TEAL_SOFT, PS_WEEKEND, PS_GRAY, PS_TEAL,
  T, money, peso, payslipCompany, newPayslipDoc, drawPayslipHeader, drawPayslipCards,
  sectionLabel, payslipTable, drawNotesBox, drawPayslipFooters, roomLeft,
} from '@/lib/payslip-look'

const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
  SANDBOX_EAST: 'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
  VERDANA_STORE: 'Verdana Store',
}
export function payslipBranchLabel(branch?: string | null): string {
  if (!branch) return ''
  return BRANCH_LABEL[branch] ?? branch
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const CUTOFF = {
  c1StartDay: 26, c1StartPrevMonth: true, c1EndDay: 10,
  c2StartDay: 11, c2EndLastDay: false, c2EndDay: 25,
}

/** "November 2026 · 1st cut-off" + "Oct 26 – Nov 10, 2026", or a special run's name. */
function employeePeriod(period: string, start?: string, end?: string): { title: string; short: string; range: string; special: boolean } {
  const m = period.match(/^(\d{4})-(\d{2})-([12])$/)
  if (!m) {
    const label = specialPeriodLabel(period) || period
    return { title: label, short: label, range: '', special: true }
  }
  const year = Number(m[1]); const month = Number(m[2]); const half = Number(m[3]) as 1 | 2
  const halfLabel = half === 1 ? '1st cut-off' : '2nd cut-off'
  let range: string
  if (start && end) {
    const s = new Date(start + 'T00:00:00Z'); const e = new Date(end + 'T00:00:00Z')
    range = `${MON[s.getUTCMonth()]} ${s.getUTCDate()} – ${MON[e.getUTCMonth()]} ${e.getUTCDate()}, ${e.getUTCFullYear()}`
  } else {
    let startMonth: number, startDay: number, endDay: number
    if (half === 1) {
      startDay = CUTOFF.c1StartDay
      startMonth = CUTOFF.c1StartPrevMonth ? (month === 1 ? 12 : month - 1) : month
      endDay = CUTOFF.c1EndDay
    } else {
      startDay = CUTOFF.c2StartDay; startMonth = month
      endDay = CUTOFF.c2EndLastDay ? new Date(year, month, 0).getDate() : CUTOFF.c2EndDay
    }
    range = `${MON[startMonth - 1]} ${startDay} – ${MON[month - 1]} ${endDay}, ${year}`
  }
  return { title: `${MONTHS[month - 1]} ${year} · ${halfLabel}`, short: `${halfLabel}, ${MON[month - 1]} ${year}`, range, special: false }
}

const titleCase = (s?: string | null) => (s ? s.toLowerCase().replace(/(^|[\s_/-])\w/g, c => c.toUpperCase()).replace(/_/g, ' ') : '')

export interface EmployeePayslipInput {
  cutoffPeriod: string
  branch: string
  basicPay: unknown; leavePay?: unknown; overtimePay: unknown; holidayPay: unknown; nightDiffPay: unknown
  restDayPay: unknown; allowances: unknown; grossPay: unknown
  sssDeduction: unknown; philhealthDeduction: unknown; pagibigDeduction: unknown
  taxDeduction: unknown; lateDeduction: unknown; undertimeDeduction: unknown
  otherDeductions: unknown; totalDeductions: unknown; netPay: unknown
  daysWorked: unknown; hoursWorked: unknown
  employee: { firstName: string; lastName: string; department?: string | null }
  // dailyBreakdown / cutoffStart / cutoffEnd drive page 2; referralIncentive
  // (med rep) prints as its own earnings row, carved out of the Allowances lump.
  details?: unknown
}

type DayRow = { timeIn: string; timeOut: string; regHrs: number; otHrs: number; holOtHrs: number; holiday: string; lateUt: number; leave: string }

/** Build the employee payslip (page 1 + attendance page 2 when there is a daily breakdown) and return the jsPDF doc. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildEmployeePayslipPdf(slip: EmployeePayslipInput): Promise<any> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = newPayslipDoc(jsPDF)
  const W = doc.internal.pageSize.getWidth()
  const M = PS_M

  const num = (v: unknown) => Number(v ?? 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const det = (slip.details || {}) as Record<string, any>
  const period = employeePeriod(slip.cutoffPeriod, det.cutoffStart, det.cutoffEnd)
  const co = payslipCompany(slip.branch)
  const name = `${slip.employee.lastName}, ${slip.employee.firstName}`
  const header = (compact: boolean) => drawPayslipHeader(doc, co, { compact, title: 'PAYSLIP', period: period.title, issued: compact ? undefined : new Date() })

  // ── Page 1 ──
  let y = header(false)
  const days = num(slip.daysWorked)
  y = drawPayslipCards(doc, y, {
    who: { label: 'EMPLOYEE', name, lines: [payslipBranchLabel(slip.branch), titleCase(slip.employee.department)] },
    period: period.special
      ? { label: 'PAY RUN', text: period.title }
      : { label: 'PAY PERIOD', rows: [['Cut-off', period.short], ['Dates', period.range], ['Days worked', days ? String(days) : '-']] },
    net: { label: 'NET PAY', value: num(slip.netPay), sub: `Gross ${peso(num(slip.grossPay))}` },
  })

  // The referral incentive is saved inside Allowances; print it as its own row
  // (Allowances shows the remainder) so the payslip spells the scheme out.
  const ri = det.referralIncentive as { count: number; amount: number; total: number } | undefined
  const riTotal = ri ? num(ri.total) : 0
  const earnings: [string, number][] = [
    ['Basic Pay', num(slip.basicPay)],
    ['Leave', num(slip.leavePay)],
    ['Overtime Pay', num(slip.overtimePay)],
    ['Holiday Pay', num(slip.holidayPay)],
    ['Night Differential', num(slip.nightDiffPay)],
    ['Rest Day Pay', num(slip.restDayPay)],
    ['Allowances', num(slip.allowances) - riTotal],
    ...(ri ? [[`Referral incentive (${ri.count} new patient${ri.count === 1 ? '' : 's'} × ${peso(num(ri.amount))})`, riTotal] as [string, number]] : []),
  ]
  const deductions: [string, number][] = [
    ['SSS', num(slip.sssDeduction)],
    ['PhilHealth', num(slip.philhealthDeduction)],
    ['Pag-IBIG', num(slip.pagibigDeduction)],
    ['Withholding Tax', num(slip.taxDeduction)],
    ['Late', num(slip.lateDeduction)],
    ['Undertime', num(slip.undertimeDeduction)],
    ['Other Deductions', num(slip.otherDeductions)],
  ]

  // Earnings and deductions side by side
  const gap = 6
  const half = (W - 2 * M - gap) / 2
  const tableY = y
  const side =(rows: [string, number][], head: string, foot: string, total: number, left: number) => {
    autoTable(doc, {
      ...payslipTable(),
      startY: tableY,
      margin: { left, right: W - left - half, top: 27, bottom: 16 },
      tableWidth: half,
      head: [[head, 'Amount (PHP)']],
      body: rows.map(([k, v]) => [T(k), money(v)]),
      foot: [[foot, money(total)]],
      columnStyles: { 1: { halign: 'right', cellWidth: 30 } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (data: any) => { if (data.section === 'foot' && data.column.index === 1) data.cell.styles.halign = 'right' },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (doc as any).lastAutoTable.finalY as number
  }
  const yL = side(earnings, 'Earnings', 'GROSS PAY', num(slip.grossPay), M)
  const yR = side(deductions, 'Deductions', 'TOTAL DEDUCTIONS', num(slip.totalDeductions), M + half + gap)
  y = Math.max(yL, yR) + 6

  // Net pay strip: gross less deductions
  doc.setFillColor(...PS_TEAL_SOFT); doc.roundedRect(M, y, W - 2 * M, 13, 2, 2, 'F')
  doc.setTextColor(...PS_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  doc.text(T(`Gross pay ${peso(num(slip.grossPay))}   less   total deductions ${peso(num(slip.totalDeductions))}`), M + 5, y + 8)
  const netText = peso(num(slip.netPay))
  doc.setTextColor(...PS_TEAL); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text(netText, W - M - 5, y + 8.6, { align: 'right' })
  const nw = doc.getTextWidth(netText)
  doc.setFontSize(8); doc.text('NET PAY', W - M - 5 - nw - 4, y + 8.3, { align: 'right' })
  y += 13 + 6

  // Attendance page only for biometrics-based staff with a cut-off range
  const bd = (det.dailyBreakdown || {}) as Record<string, Record<string, unknown>[]>
  const basicPayBd = bd.basicPay || []
  const isFixedSalary = basicPayBd.length === 1 && typeof basicPayBd[0]?.note === 'string' && (basicPayBd[0].note as string).includes('Fixed salary')
  const hasAttendance = !isFixedSalary && !!det.cutoffStart && !!det.cutoffEnd

  const notes = [
    ...(period.special ? [] : [`Days worked: ${days}   |   Hours worked: ${num(slip.hoursWorked).toFixed(2)}`]),
    'This payslip is computer-generated and does not require a signature.',
    ...(hasAttendance ? ['Your daily attendance for this cut-off is on the next page.'] : []),
  ]
  if (roomLeft(doc, y) < 26) { doc.addPage(); y = header(true) }
  drawNotesBox(doc, M, y, W - 2 * M, notes)

  // ── Page 2: daily attendance breakdown ──
  if (hasAttendance) {
    doc.addPage()
    y = header(true)
    y = sectionLabel(doc, 'DAILY ATTENDANCE', y + 2, `${name}   |   ${period.range}`) + 1

    const dayMap = new Map<string, DayRow>()
    const getRow = (date: string): DayRow => {
      if (!dayMap.has(date)) dayMap.set(date, { timeIn: '—', timeOut: '—', regHrs: 0, otHrs: 0, holOtHrs: 0, holiday: '', lateUt: 0, leave: '' })
      return dayMap.get(date)!
    }
    const n = (v: unknown) => (typeof v === 'number' ? v : 0)
    for (const e of basicPayBd) {
      if (!e.date) continue
      const r = getRow(String(e.date))
      if (e.timeIn) r.timeIn = String(e.timeIn)
      if (e.timeOut) r.timeOut = String(e.timeOut)
      r.regHrs = n(e.hours)
    }
    for (const e of bd.overtimePay || []) if (e.date) getRow(String(e.date)).otHrs = n(e.otHours)
    for (const e of bd.holidayOvertimePay || []) if (e.date) getRow(String(e.date)).holOtHrs = n(e.otHours)
    for (const e of bd.holidayPay || []) {
      if (!e.date) continue
      const ht = String(e.holidayType || '')
      getRow(String(e.date)).holiday = ht === 'REGULAR' ? 'Regular Holiday' : ht === 'SPECIAL_NON_WORKING' ? 'Special Holiday' : ht
    }
    // Late/undertime: undertimeMinutes captures both (late shifts the baseline)
    for (const e of bd.undertimeDeduction || []) if (e.date) getRow(String(e.date)).lateUt += n(e.undertimeMinutes)
    for (const e of bd.leavePay || []) {
      if (!e.date) continue
      const lt = String(e.leaveType || 'Leave')
      getRow(String(e.date)).leave = e.isHalfDay ? `${lt} (Half)` : lt
    }

    const rows: string[][] = []
    const kinds: ('weekend' | 'leave' | '')[] = []
    const cursor = new Date(det.cutoffStart + 'T00:00:00Z')
    const endD = new Date(det.cutoffEnd + 'T00:00:00Z')
    while (cursor <= endD) {
      const ds = cursor.toISOString().substring(0, 10)
      const dow = cursor.getUTCDay()
      const r = dayMap.get(ds)
      rows.push([
        `${MON[cursor.getUTCMonth()]} ${cursor.getUTCDate()}, ${cursor.getUTCFullYear()} (${DAY[dow]})`,
        r?.timeIn || '—', r?.timeOut || '—',
        r && r.regHrs > 0 ? r.regHrs.toFixed(2) : '',
        r && r.otHrs > 0 ? r.otHrs.toFixed(2) : '',
        r && r.holOtHrs > 0 ? r.holOtHrs.toFixed(2) : '',
        r?.holiday || '',
        r && r.lateUt > 0 ? `${r.lateUt} min` : '',
        r?.leave || '',
      ].map(s => T(s)))
      kinds.push(r?.leave ? 'leave' : dow === 0 || dow === 6 ? 'weekend' : '')
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    const tot = (i: number) => rows.reduce((s, r) => s + (Number(r[i]) || 0), 0)

    autoTable(doc, {
      ...payslipTable(),
      startY: y,
      margin: { left: M, right: M, top: 27, bottom: 16 },
      head: [['Date', 'In', 'Out', 'Reg Hrs', 'OT', 'Hol OT', 'Holiday', 'Late/UT', 'Leave']],
      body: rows,
      foot: [['TOTAL', '', '', tot(3).toFixed(2), tot(4) ? tot(4).toFixed(2) : '', tot(5) ? tot(5).toFixed(2) : '', '', '', '']],
      styles: { ...payslipTable().styles, fontSize: 7.6, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 } },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 17, halign: 'center' },
        2: { cellWidth: 17, halign: 'center' },
        3: { cellWidth: 16, halign: 'right' },
        4: { cellWidth: 13, halign: 'right' },
        5: { cellWidth: 14, halign: 'right' },
        6: { cellWidth: 'auto' },
        7: { cellWidth: 17, halign: 'right' },
        8: { cellWidth: 'auto' },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (data: any) => {
        if (data.section === 'foot' && data.column.index >= 3 && data.column.index <= 5) data.cell.styles.halign = 'right'
        if (data.section !== 'body') return
        const k = kinds[data.row.index]
        if (k === 'leave') data.cell.styles.fillColor = PS_TEAL_SOFT
        else if (k === 'weekend') { data.cell.styles.fillColor = PS_WEEKEND; data.cell.styles.textColor = PS_GRAY }
      },
      didDrawPage: (data: { pageNumber: number }) => { if (data.pageNumber > 1) header(true) },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 5
    doc.setTextColor(...PS_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text('Grey rows are weekends; teal rows are leave days. Late/UT is late arrival and undertime combined, in minutes.', M, y)
  }

  drawPayslipFooters(doc, `${co.companyName}${co.tradeName ? `   |   ${co.tradeName}` : ''}`, `Payslip - ${name}`)
  return doc
}
