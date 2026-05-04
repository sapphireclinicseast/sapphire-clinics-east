/**
 * Shared consultant payslip PDF builder.
 * Used by both:
 *   • the accounting hub UI (when an accountant clicks Download / Email),
 *   • the internal /api/internal/my-payslips/pdf endpoint that streams
 *     payslips to the teletherapy hub.
 *
 * jsPDF + jsPDF-autotable both run fine in Node 20+, so this module is
 * isomorphic. Keep it free of browser-only globals (window, document,
 * URL.createObjectURL, etc.).
 */

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

const BRANCH_INFO: Record<string, { name: string; address: string; phone: string; tin: string }> = {
  SBEA: {
    name: 'Sandbox Clinic – East Branch',
    address: '4th Floor Robinsons Metro East, Marcos Highway, Dela Paz, Pasig City',
    phone: '0917 118 9289 | (02) 5310-4991',
    tin: 'TIN 010-817-642-00000',
  },
  SBGH: {
    name: 'Sandbox Clinic – Greenhills Branch',
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
    name: 'Sandbox Clinic',
    address: 'Metro Manila, Philippines',
    phone: '0917 770 1686 | (02) 8529 1590',
    tin: '',
  },
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
  const taxableBase = totalUnitPay + retainer + taxedAdj
  const tax = p.taxDeduction === 'FIVE_PERCENT' ? Math.max(0, taxableBase) * 0.05 : 0
  const gross = taxableBase + nonTaxedAdj
  const net = gross - tax
  return { totalUnitPay, extraTotal, incentiveTotal, taxedAdj, nonTaxedAdj, taxableBase, tax, gross, net }
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
 * Same pixel-for-pixel layout the accounting hub uses — extracted from
 * payroll/page.tsx so the server can call it without duplicating logic.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const branchInfo = BRANCH_INFO[p.branch] || BRANCH_INFO['']
  const position = POSITION_LABELS[p.department] || p.department
  const deptLabel = DEPT_LABELS[p.department] || p.department
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
  const cutoffLabel = dateRange
    ? `${fmtDate(dateRange.start)} \u2013 ${fmtDate(dateRange.end)}`
    : getCutoffLabel(cutoffPeriod)

  const ORANGE: [number, number, number] = [168, 92, 61]
  const NET_GREEN: [number, number, number] = [226, 239, 217]
  const WHITE: [number, number, number] = [255, 255, 255]
  const DARK: [number, number, number] = [30, 30, 30]
  const MID: [number, number, number] = [80, 80, 80]
  const LIGHT_BORDER: [number, number, number] = [210, 210, 210]

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 25.4
  const contentW = pageW - margin * 2
  let y = margin

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...ORANGE)
  doc.text('SAPPHIRE CLINICS EAST INC.', pageW / 2, y + 8, { align: 'center' })
  y += 14

  doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(...DARK)
  doc.text(branchInfo.name, margin, y); y += 5
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MID)
  const addrLines = doc.splitTextToSize(branchInfo.address, contentW)
  addrLines.forEach((line: string) => { doc.text(line, margin, y); y += 4.5 })
  if (branchInfo.phone) { doc.text(branchInfo.phone, margin, y); y += 4.5 }
  if (branchInfo.tin) { doc.text(branchInfo.tin, margin, y); y += 4.5 }
  y += 4

  doc.setFontSize(16).setFont('helvetica', 'bold').setTextColor(...DARK)
  doc.text('PAYSLIP', pageW / 2, y, { align: 'center' })
  y += 8

  const details: [string, string][] = [
    ['Name', p.consultantName],
    ['Position', position],
    ['Department', deptLabel],
    ['Branch', branchInfo.name],
    ['Cutoff Period', cutoffLabel],
  ]
  const labelColW = 42
  for (const [label, value] of details) {
    doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(...MID)
    doc.text(`${label}:`, margin, y)
    doc.setFont('helvetica', 'normal').setTextColor(...DARK)
    doc.text(value, margin + labelColW, y)
    y += 6
  }
  y += 4

  const tableHeadStyles = { fillColor: ORANGE, textColor: WHITE, fontStyle: 'bold' as const, fontSize: 9, lineColor: ORANGE, lineWidth: 0 }
  const tableBodyStyles = { fontSize: 9, textColor: DARK, lineColor: LIGHT_BORDER, lineWidth: 0.3 }

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

  doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(...DARK)
  doc.text('EARNINGS', margin, y); y += 2

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

  if (p.incentives && p.incentives.length > 0) {
    doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(...DARK)
    doc.text('INCENTIVES', margin, y); y += 2

    const incBody = p.incentives.map(line => {
      const d = new Date(line.date + 'T00:00:00+08:00')
      const dateStr = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
      return [`${line.ruleName} \u2014 ${dateStr}`, String(line.patientCount), fmtPHP(line.bonusPerUnit), fmtPHP(line.bonus)]
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

  if (adjs.length > 0) {
    const adjBody = adjs.map(a => [a.name, (a.isAddition ? '+ ' : '- ') + fmtPHP(a.amount), a.remarks || '\u2014'])

    doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(...DARK)
    doc.text('ADJUSTMENTS', margin, y); y += 2

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

  doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(...DARK)
  doc.text('SUMMARY', margin, y); y += 2

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
        data.cell.styles.fontStyle = 'bold'
      } else if (row.red) {
        data.cell.styles.textColor = [160, 30, 30]
      }
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y

  y += 10
  doc.setDrawColor(...LIGHT_BORDER).setLineWidth(0.4).line(margin, y, pageW - margin, y)
  y += 6
  doc.setFontSize(7.5).setFont('helvetica', 'italic').setTextColor(160, 160, 160)
  doc.text('This payslip is computer-generated and does not require a signature.', pageW / 2, y, { align: 'center' })
  doc.text(
    `Generated: ${new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' })}`,
    pageW / 2, y + 5, { align: 'center' }
  )

  // Page 2 — session details
  const itemsWithSessions = p.items.filter(item => item.sessions && item.sessions.length > 0)
  if (itemsWithSessions.length > 0) {
    doc.addPage()
    let y2 = margin

    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...ORANGE)
    doc.text('SAPPHIRE CLINICS EAST INC.', pageW / 2, y2 + 8, { align: 'center' })
    y2 += 14
    doc.setFontSize(14).setFont('helvetica', 'bold').setTextColor(...DARK)
    doc.text('SESSION DETAILS', pageW / 2, y2, { align: 'center' })
    y2 += 8
    doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(...MID)
    doc.text(`${p.consultantName}  \u2014  ${cutoffLabel}`, pageW / 2, y2, { align: 'center' })
    y2 += 10

    for (const item of itemsWithSessions) {
      doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(...ORANGE)
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
          2: { cellWidth: 'auto' },
          3: { cellWidth: 12, halign: 'center' },
          4: { cellWidth: 22, halign: 'center' },
        },
        margin: { left: margin, right: margin },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 4) {
            const val = data.cell.raw as string
            if (val === 'Voided') data.cell.styles.textColor = [180, 40, 40]
            else if (val === 'Reopened') data.cell.styles.textColor = [180, 130, 20]
            else data.cell.styles.textColor = [30, 120, 60]
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
