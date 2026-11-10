/**
 * Shared consultant payslip PDF builder (look: lib/payslip-look.ts).
 * Used by both:
 *   • the accounting hub UI (when an accountant clicks Download / Email),
 *   • the internal /api/internal/my-payslips/pdf endpoint that streams
 *     payslips to the teletherapy hub.
 *
 * jsPDF + jsPDF-autotable both run fine in Node 20+, so this module is
 * isomorphic. Keep it free of browser-only globals (window, document,
 * URL.createObjectURL, etc.).
 */

import { BRANCH_INFO } from './branch-info'
import {
  PS_M, PS_TEAL, PS_TEAL_SOFT, PS_INK, PS_GRAY, PS_WHITE, PS_RED, PS_GREEN, PS_AMBER,
  T, money, peso, payslipCompany, newPayslipDoc, drawPayslipHeader, drawPayslipCards,
  sectionLabel, payslipTable, drawNotesBox, drawPayslipFooters, roomLeft,
} from './payslip-look'

export interface ConsultantPayslipPreview {
  consultantId: string
  consultantName: string
  department: string
  branch: string
  taxDeduction: string
  items: {
    unitPayId?: string
    unitPayName: string
    unitAmount: number
    quantity: number
    lineTotal: number
    isReduced?: boolean
    sessions?: {
      date: string
      patientName: string
      serviceName: string
      quantity: number
      orderNetAmount?: number
      orderStatus?: string
    }[]
  }[]
  unitPayTotal: number
  retainerAmount: number
  incentives?: {
    ruleId?: string
    ruleName: string
    date: string
    patientCount: number
    bonusPerUnit: number
    bonus: number
  }[]
  incentiveTotal?: number
  grossPay: number
  taxAmount: number
  // The consultant's own SSS / PhilHealth / Pag-IBIG share for this cutoff,
  // withheld from net pay (cadence follows the employee benefit timing).
  sssDeduction?: number
  philhealthDeduction?: number
  pagibigDeduction?: number
  netPay: number
}

export interface ExtraUnitPayLine {
  id: string
  unitPayId: string
  unitPayName: string
  unitAmount: number
  qty: number
}

export interface AdjustmentLine {
  id: string
  name: string
  amount: number
  isAddition: boolean
  isTaxed: boolean
  remarks: string
}

const DEPT_LABELS: Record<string, string> = {
  PT: 'Physical Therapy',
  OT: 'Occupational Therapy',
  SLP: 'Speech-Language Pathology',
  SPED: 'Special Education',
  MD: 'Medical Doctor',
  PSYCHOLOGY: 'Psychology',
  ORTHOSIS: 'Orthosis & Prosthesis',
}

const POSITION_LABELS: Record<string, string> = {
  PT: 'Physical Therapist',
  OT: 'Occupational Therapist',
  SLP: 'Speech-Language Pathologist',
  SPED: 'Special Education Teacher',
  MD: 'Medical Doctor',
  PSYCHOLOGY: 'Psychologist',
  ORTHOSIS: 'Orthotist & Prosthetist',
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export function fmtPHP(n: number): string {
  return `PHP ${(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function getCutoffLabel(period: string) {
  const [y, m, h] = period.split('-')
  return `${MONTHS[parseInt(m) - 1]} ${y} — ${h === '1' ? '1st Cutoff' : '2nd Cutoff'}`
}

export function computeTotals(p: ConsultantPayslipPreview, extras: ExtraUnitPayLine[], adjs: AdjustmentLine[]) {
  const extraTotal = extras.reduce((s, e) => s + e.unitAmount * e.qty, 0)
  const totalUnitPay = p.unitPayTotal + extraTotal
  const retainer = p.retainerAmount
  // Incentive bonus is INFORMATIONAL — shown as its own SUMMARY row and
  // in the INCENTIVES table, but NOT added to Gross / NET PAY. This
  // matches the accounting hub's stored grossPay (items + extras +
  // retainer + adjustments only) so the teletherapy PDF agrees with
  // what the accountant sees. (The generate route's PayrollPreview
  // includes incentives in its own grossPay field — that's a display
  // value, not what gets persisted on lock.)
  // Threshold-reduced item rates are already baked into each item's
  // unitAmount/lineTotal upstream, so they need no separate handling.
  const incentiveTotal = p.incentiveTotal ?? 0
  const taxedAdj = adjs.filter(a => a.isTaxed).reduce((s, a) => s + (a.isAddition ? a.amount : -a.amount), 0)
  const nonTaxedAdj = adjs.filter(a => !a.isTaxed).reduce((s, a) => s + (a.isAddition ? a.amount : -a.amount), 0)
  // Incentive bonus is included in taxableBase (and thus in Gross / NET PAY) —
  // same formula used by the generate route when storing grossPay on lock.
  // It is also shown as its own SUMMARY row for clarity.
  const taxableBase = totalUnitPay + retainer + incentiveTotal + taxedAdj
  const tax = p.taxDeduction === 'FIVE_PERCENT' ? Math.max(0, taxableBase) * 0.05 : 0
  const gross = taxableBase + nonTaxedAdj
  // Must match the hub's computeTotals and the stored netPay
  // (generate: net = gross − tax − benefit EE), or the PDF overstates NET PAY.
  const sss = p.sssDeduction ?? 0
  const philhealth = p.philhealthDeduction ?? 0
  const pagibig = p.pagibigDeduction ?? 0
  const benefitEE = sss + philhealth + pagibig
  const net = gross - tax - benefitEE
  return { totalUnitPay, extraTotal, incentiveTotal, taxedAdj, nonTaxedAdj, taxableBase, tax, gross, sss, philhealth, pagibig, benefitEE, net }
}

/**
 * Optional override for the SUMMARY totals.
 * When provided (typically by the server-side internal endpoint serving
 * LOCKED payslips to teletherapy), the PDF's SUMMARY uses these values
 * verbatim instead of recomputing via computeTotals(). Guarantees that
 * the rendered PDF matches the gross/tax/net actually declared on the
 * locked PayrollEntry row in accounting, even if computeTotals() ever
 * diverges from the stored amounts.
 */
export interface OverrideTotals {
  gross: number
  tax: number
  net: number
}

/**
 * Build the consultant payslip PDF and return the jsPDF doc object.
 * Page 1: earnings, incentives, adjustments, deductions and summary.
 * Page 2+: session details per unit-pay line.
 * Look: lib/payslip-look.ts (the HMO collection report's look, portrait).
 */
export async function buildConsultantPayslipPdf(
  p: ConsultantPayslipPreview,
  extras: ExtraUnitPayLine[],
  adjs: AdjustmentLine[],
  cutoffPeriod: string,
  dateRange?: { start: string; end: string },
  overrideTotals?: OverrideTotals
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  // Recompute SUMMARY totals — but if the caller supplied overrideTotals
  // (e.g. the server endpoint passing the DB-stored gross/tax/net of a
  // locked row), use those values for the displayed Gross / Tax / NET PAY
  // so the PDF can never drift from what accounting has on record.
  const computed = computeTotals(p, extras, adjs)
  const totals = overrideTotals
    ? { ...computed, gross: overrideTotals.gross, tax: overrideTotals.tax, net: overrideTotals.net }
    : computed
  const co = payslipCompany(p.branch)
  const branchLabel = (BRANCH_INFO[p.branch] || BRANCH_INFO['']).name.replace(/^Sapphire Clinics East Inc\. – /, '')
  const position = POSITION_LABELS[p.department] || p.department
  const deptLabel = DEPT_LABELS[p.department] || p.department
  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
  const [cy, cm, ch] = cutoffPeriod.split('-')
  const monthIdx = parseInt(cm) - 1
  const isRegular = /^\d{4}-\d{2}-[12]$/.test(cutoffPeriod)
  const halfLabel = ch === '1' ? '1st cut-off' : '2nd cut-off'
  const periodTitle = isRegular ? `${MONTHS[monthIdx]} ${cy} · ${halfLabel}` : getCutoffLabel(cutoffPeriod)
  const periodShort = isRegular ? `${halfLabel}, ${MONTHS[monthIdx].slice(0, 3)} ${cy}` : periodTitle
  const range = dateRange ? `${shortDate(dateRange.start)} – ${shortDate(dateRange.end)}` : ''

  const doc = newPayslipDoc(jsPDF)
  const W = doc.internal.pageSize.getWidth()
  const M = PS_M
  const header = (compact: boolean) => drawPayslipHeader(doc, co, { compact, title: 'PAYSLIP', period: periodTitle, issued: compact ? undefined : new Date() })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastY = () => (doc as any).lastAutoTable?.finalY as number
  const ensure = (y: number, need: number) => (roomLeft(doc, y) < need ? (doc.addPage(), header(true)) : y)
  const base = { ...payslipTable(), margin: { left: M, right: M, top: 27, bottom: 16 }, didDrawPage: (d: { pageNumber: number }) => { if (d.pageNumber > 1) header(true) } }
  const R = (content: string) => ({ content, styles: { halign: 'right' as const } })

  // ── Page 1 ──
  let y = header(false)
  y = drawPayslipCards(doc, y, {
    who: { label: 'CONSULTANT', name: p.consultantName, lines: [position, deptLabel !== position ? deptLabel : ''] },
    period: { label: 'PAY PERIOD', rows: [['Cut-off', periodShort], ['Dates', range || '-'], ['Branch', branchLabel]] },
    net: { label: 'NET PAY', value: totals.net, sub: `Gross ${peso(totals.gross)}` },
  })

  // Earnings
  const earningsBody: string[][] = []
  for (const item of p.items) earningsBody.push([T(item.unitPayName), String(item.quantity), money(item.unitAmount), money(item.lineTotal)])
  for (const e of extras) earningsBody.push([T(`${e.unitPayName} (added)`), String(e.qty), money(e.unitAmount), money(e.unitAmount * e.qty)])
  if (p.retainerAmount > 0) earningsBody.push(['Monthly Retainer (½ cut-off)', '-', '-', money(p.retainerAmount)])
  autoTable(doc, {
    ...base,
    startY: sectionLabel(doc, 'EARNINGS', y),
    head: [['Description', 'Qty', 'Rate (PHP)', 'Total (PHP)']],
    body: earningsBody.length ? earningsBody : [['No unit pay this cut-off', '', '', money(0)]],
    foot: [[{ content: 'TOTAL EARNINGS', colSpan: 3, styles: { halign: 'right' } }, R(money(totals.totalUnitPay + p.retainerAmount))]],
    columnStyles: { 1: { halign: 'center', cellWidth: 16 }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 32 } },
  })
  y = lastY() + 7

  // Incentives
  if (p.incentives && p.incentives.length > 0) {
    y = ensure(y, 30)
    const incBody = p.incentives.map(line => {
      const d = new Date(line.date + 'T00:00:00+08:00')
      const dateStr = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
      return [T(`${line.ruleName} - ${dateStr}`), String(line.patientCount), money(line.bonusPerUnit), money(line.bonus)]
    })
    autoTable(doc, {
      ...base,
      startY: sectionLabel(doc, 'INCENTIVES', y),
      head: [['Description', 'Sessions', 'Rate / Session (PHP)', 'Total (PHP)']],
      body: incBody,
      foot: [[{ content: 'TOTAL INCENTIVES', colSpan: 3, styles: { halign: 'right' } }, R(money(p.incentiveTotal ?? p.incentives.reduce((s, l) => s + l.bonus, 0)))]],
      columnStyles: { 1: { halign: 'center', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 34 }, 3: { halign: 'right', cellWidth: 32 } },
      })
    y = lastY() + 7
  }

  // Adjustments
  if (adjs.length > 0) {
    y = ensure(y, 30)
    autoTable(doc, {
      ...base,
      startY: sectionLabel(doc, 'ADJUSTMENTS', y),
      head: [['Description', 'Amount (PHP)', 'Remarks']],
      body: adjs.map(a => [T(a.name), (a.isAddition ? '+ ' : '- ') + money(a.amount), T(a.remarks || '-')]),
      columnStyles: { 1: { halign: 'right', cellWidth: 34 }, 2: { cellWidth: 60 } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 1) data.cell.styles.textColor = adjs[data.row.index]?.isAddition ? PS_GREEN : PS_RED
      },
    })
    y = lastY() + 7
  }

  // Deductions (left) beside the summary (right), notes below
  type SummaryRow = { label: string; value: string; kind?: 'gross' | 'net' | 'less' }
  const summaryRows: SummaryRow[] = [
    { label: 'Unit Pay Total', value: money(totals.totalUnitPay) },
    ...(p.retainerAmount > 0 ? [{ label: 'Retainer (\u00bd cut-off)', value: money(p.retainerAmount) }] : []),
    ...((p.incentiveTotal ?? 0) > 0 ? [{ label: 'Incentive Bonus', value: money(p.incentiveTotal ?? 0) }] : []),
    ...(adjs.length > 0 ? [{
      label: 'Adjustments (net)',
      value: (totals.taxedAdj + totals.nonTaxedAdj >= 0 ? '+ ' : '- ') + money(Math.abs(totals.taxedAdj + totals.nonTaxedAdj)),
    }] : []),
    { label: 'Gross Pay', value: money(totals.gross), kind: 'gross' as const },
    ...(totals.tax > 0 ? [{ label: 'Less: Withholding Tax (5%)', value: `(${money(totals.tax)})`, kind: 'less' as const }] : []),
    ...(totals.benefitEE > 0 ? [{ label: 'Less: SSS / PhilHealth / Pag-IBIG', value: `(${money(totals.benefitEE)})`, kind: 'less' as const }] : []),
    { label: 'NET PAY', value: peso(totals.net), kind: 'net' as const },
  ]
  const gap = 6
  const half = (W - 2 * M - gap) / 2
  const totalDeductions = totals.tax + totals.benefitEE
  const dedRows: string[][] = [
    ['SSS', money(totals.sss)],
    ['PhilHealth', money(totals.philhealth)],
    ['Pag-IBIG', money(totals.pagibig)],
    ['Withholding Tax (5%)', money(totals.tax)],
  ]
  y = ensure(y, Math.max(summaryRows.length, dedRows.length + 2) * 7.6 + 8)
  const sy = sectionLabel(doc, 'SUMMARY', y, undefined, M + half + gap)
  autoTable(doc, {
    ...payslipTable(),
    startY: sy,
    margin: { left: M + half + gap, right: M, top: 27, bottom: 16 },
    tableWidth: half,
    body: summaryRows.map(r => [T(r.label), r.value]),
    columnStyles: { 1: { halign: 'right', cellWidth: 34 } },
    alternateRowStyles: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      const row = summaryRows[data.row.index]
      if (!row) return
      if (row.kind === 'net') { data.cell.styles.fillColor = PS_TEAL; data.cell.styles.textColor = PS_WHITE; data.cell.styles.fontStyle = 'bold'; data.cell.styles.fontSize = 10 }
      else if (row.kind === 'gross') { data.cell.styles.fillColor = PS_TEAL_SOFT; data.cell.styles.textColor = PS_TEAL; data.cell.styles.fontStyle = 'bold' }
      else if (row.kind === 'less') data.cell.styles.textColor = PS_RED
    },
  })
  const sumBottom = lastY()
  const hasSessions = p.items.some(item => item.sessions && item.sessions.length > 0)
  const notes = [
    'This payslip is computer-generated and does not require a signature.',
    ...(p.taxDeduction === 'FIVE_PERCENT' ? ['5% withholding tax applies to taxable earnings this cut-off.'] : []),
    ...(hasSessions ? ['Every session paid is listed on the following page(s).'] : []),
  ]
  if (totalDeductions > 0) {
    // each government contribution on its own line, then withholding tax
    sectionLabel(doc, 'DEDUCTIONS', y)
    autoTable(doc, {
      ...payslipTable(),
      startY: sy,
      margin: { left: M, right: W - M - half, top: 27, bottom: 16 },
      tableWidth: half,
      head: [['Description', 'Amount (PHP)']],
      body: dedRows,
      foot: [['TOTAL DEDUCTIONS', R(money(totalDeductions))]],
      columnStyles: { 1: { halign: 'right', cellWidth: 30 } },
    })
    y = Math.max(sumBottom, lastY()) + 6
    y = ensure(y, 24)
    drawNotesBox(doc, M, y, W - 2 * M, notes)
  } else {
    drawNotesBox(doc, M, sy, half, notes, sumBottom - sy)
  }

  // ── Page 2+: session details ──
  const itemsWithSessions = p.items.filter(item => item.sessions && item.sessions.length > 0)
  if (itemsWithSessions.length > 0) {
    doc.addPage()
    let y2 = header(true)
    y2 = sectionLabel(doc, 'SESSION DETAILS', y2 + 2, `${p.consultantName}   |   ${range || periodShort}`) + 4

    for (const item of itemsWithSessions) {
      y2 = ensure(y2, 30)
      const qty = item.sessions!.reduce((s, x) => s + (x.quantity ?? 1), 0)
      doc.setTextColor(...PS_INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
      doc.text(T(item.unitPayName), M, y2)
      const iw = doc.getTextWidth(T(item.unitPayName))
      doc.setTextColor(...PS_GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
      doc.text(`${qty} session${qty !== 1 ? 's' : ''}`, M + iw + 3, y2)

      const sorted = [...item.sessions!].sort((a, b) => a.date.localeCompare(b.date))
      const statusOf = (s: { orderStatus?: string }) => {
        const st = (s.orderStatus || 'COMPLETED').toUpperCase()
        return st === 'CANCELLED' || st === 'VOIDED' ? 'Voided' : st === 'REOPENED' ? 'Reopened' : 'Completed'
      }
      autoTable(doc, {
        ...base,
        startY: y2 + 2,
        head: [['Date', 'Patient', 'Service', 'Qty', 'Status']],
        body: sorted.map(s => {
          const d = new Date(s.date + 'T00:00:00+08:00')
          const dateStr = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
          return [dateStr, T(s.patientName || '-'), T(s.serviceName || '-'), String(s.quantity ?? 1), statusOf(s)]
        }),
        styles: { ...payslipTable().styles, fontSize: 7.8 },
        columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 46 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 22, halign: 'center' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell: (data: any) => {
          if (data.section !== 'body' || data.column.index !== 4) return
          const v = data.cell.raw as string
          data.cell.styles.textColor = v === 'Voided' ? PS_RED : v === 'Reopened' ? PS_AMBER : PS_GREEN
          data.cell.styles.fontStyle = 'bold'
        },
      })
      y2 = lastY() + 8
    }
  }

  drawPayslipFooters(doc, `${co.companyName}${co.tradeName ? `   |   ${co.tradeName}` : ''}`, `Payslip - ${p.consultantName}`)
  return doc
}
