/* Statement of Account — shared PDF generator.
 *
 * Lifted out of the Accounts Receivable SoaReport screen so the POS wallet
 * detail can print the same document. Both callers must produce a byte-identical
 * SOA: a statement the front desk hands an HMO must not differ from the one
 * Accounts Receivable generated for the same provider and month.
 */

export interface SoaSettings {
  clinicName?: string | null
  clinicAddress?: string | null
  bankName?: string | null
  bankBranch?: string | null
  bankAccountName?: string | null
  bankAccountNo?: string | null
  hmoOfficerName?: string | null
  hmoOfficerEsigUrl?: string | null
  clinicManagerName?: string | null
  clinicManagerEsigUrl?: string | null
  contactEmail?: string | null
  contactPhone1?: string | null
  contactPhone2?: string | null
}

export interface SoaOrder {
  id: string
  transactionDate: string
  arCustomDate?: string | null  // Manually overridden date — used in SOA when set
  patientName: string | null
  items: { name: string }[]
  payments: { amount: string | number; walletId?: string | null }[]
  arPaymentItems: { paymentId: string }[]
  // Present when already tagged in an SOA Submissions batch (or a previously
  // generated SOA Report) — such orders are excluded from a new SOA Report.
  soaSubmissionItems?: { submission: { submittedDate: string } }[]
}

/* ─── Month options ────────────────────────────────────────── */
export const MONTHS = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December']

export function buildMonthOptions() {
  const opts: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    opts.push({ value: val, label })
  }
  return opts
}
export const MONTH_OPTIONS = buildMonthOptions()

export function periodLabel(period: string) {
  const [y, m] = period.split('-')
  return `${MONTHS[parseInt(m) - 1]} ${y}`
}

/* ─── Number helpers ───────────────────────────────────────── */
export const toNum = (v: unknown) => Number(v) || 0

export function fmt(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/* ─── PDF generator ────────────────────────────────────────── */
export async function buildSoaPdf(
  orders: SoaOrder[],
  walletId: string,
  walletName: string,
  period: string,
  settings: SoaSettings,
): Promise<string> { // returns base64
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210
  const margin = 20

  // Color palette
  const C_TEAL:  [number,number,number] = [13, 148, 136]
  const C_TEAL_BG: [number,number,number] = [224, 242, 241]
  const C_DARK:  [number,number,number] = [25, 25, 25]
  const C_GRAY:  [number,number,number] = [100, 100, 100]
  const C_WHITE: [number,number,number] = [255, 255, 255]
  const C_RULE:  [number,number,number] = [200, 200, 200]

  const clinicName = settings.clinicName || 'Sapphire Clinics East Incorporated'
  const clinicAddr = settings.clinicAddress || 'Level 4, Robinsons Metroeast, Brgy. Dela Paz, Pasig City'

  // ── Teal header band ─────────────────────────────────────────
  doc.setFillColor(...C_TEAL)
  doc.rect(0, 0, pageW, 40, 'F')

  doc.setTextColor(...C_WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(clinicName, pageW / 2, 14, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(clinicAddr, pageW / 2, 21, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('STATEMENT OF ACCOUNT', pageW / 2, 32, { align: 'center' })

  // ── Meta section ─────────────────────────────────────────────
  doc.setTextColor(...C_DARK)
  const today = new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
  let metaY = 50

  const metaLine = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C_GRAY)
    doc.text(label, margin, metaY)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C_DARK)
    doc.text(value, margin + 42, metaY)
    metaY += 5
  }
  metaLine('DATE', today)
  metaLine('STATEMENT PERIOD', periodLabel(period))
  metaLine('HMO PROVIDER', walletName)

  // thin rule below meta
  doc.setDrawColor(...C_RULE)
  doc.setLineWidth(0.3)
  doc.line(margin, metaY + 1, pageW - margin, metaY + 1)
  metaY += 7

  // ── Build table rows (one row per order, sorted by effective date) ──────
  // Use arCustomDate for sorting and display when set, otherwise fall back to transactionDate
  const effectiveDateOf = (o: SoaOrder) => o.arCustomDate || o.transactionDate
  const sortedOrders = [...orders].sort((a, b) => effectiveDateOf(a).localeCompare(effectiveDateOf(b)))
  let grandTotal = 0
  const tableBody: string[][] = []

  for (const o of sortedOrders) {
    const hmoAmt = o.payments
      .filter(p => p.walletId === walletId)
      .reduce((s, p) => s + toNum(p.amount), 0)
    if (hmoAmt === 0) continue
    const dateStr = new Date(effectiveDateOf(o))
      .toLocaleDateString('en-PH', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
    const services = o.items.map(i => i.name).join('\n')
    const patient = o.patientName || ''
    grandTotal += hmoAmt
    tableBody.push([dateStr, services, patient, fmt(hmoAmt)])
  }

  // ── Transaction table ─────────────────────────────────────────
  autoTable(doc, {
    startY: metaY,
    head: [['Date', 'Service Rendered', 'Patient Name', 'Total Amount']],
    body: tableBody,
    theme: 'grid',
    showFoot: 'lastPage',
    styles: {
      fontSize: 8,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      font: 'helvetica',
      textColor: C_DARK,
    },
    headStyles: {
      fillColor: C_TEAL,
      textColor: C_WHITE,
      fontStyle: 'bold',
      halign: 'center',
      lineWidth: 0,
      fontSize: 8,
    },
    bodyStyles: {
      lineWidth: 0.15,
      lineColor: C_RULE,
    },
    alternateRowStyles: { fillColor: [245, 250, 250] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 72 },
      2: { cellWidth: 50 },
      3: { cellWidth: 26, halign: 'right' },
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = (doc as any).lastAutoTable.finalY + 10

  const checkPage = (need: number) => {
    if (y + need > 272) { doc.addPage(); y = margin }
  }

  // ── Summary of Charges ────────────────────────────────────────
  checkPage(35)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...C_TEAL)
  doc.text('SUMMARY OF CHARGES', margin, y)
  doc.setTextColor(...C_DARK)
  y += 4

  autoTable(doc, {
    startY: y,
    body: [
      ['Total Services Rendered', `${fmt(grandTotal)}`],
      ['Other Charges / Adjustments', '—'],
      ['TOTAL DUE', `${fmt(grandTotal)}`],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
    columnStyles: {
      0: { cellWidth: 110, textColor: C_DARK },
      1: { cellWidth: 40, halign: 'right', textColor: C_DARK },
    },
    didParseCell: (data) => {
      if (data.row.index === 2) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = C_TEAL_BG
        data.cell.styles.textColor = C_TEAL
        data.cell.styles.lineWidth = 0.3
        data.cell.styles.lineColor = C_TEAL
      } else {
        data.cell.styles.lineWidth = 0.15
        data.cell.styles.lineColor = C_RULE
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10
  checkPage(50)

  // ── Payment Details ────────────────────────────────────────────
  if (settings.bankName || settings.bankAccountNo) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...C_TEAL)
    doc.text('PAYMENT DETAILS', margin, y)
    doc.setTextColor(...C_DARK)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text('Please remit payment to:', margin, y); y += 5

    if (settings.bankName) {
      doc.setFont('helvetica', 'bold')
      doc.text(settings.bankName, margin, y); y += 5
    }
    if (settings.bankBranch) {
      doc.setFont('helvetica', 'normal')
      doc.text(`Branch: ${settings.bankBranch}`, margin, y); y += 5
    }
    if (settings.bankAccountName) {
      doc.setFont('helvetica', 'bold')
      doc.text(`Account Name: ${settings.bankAccountName}`, margin, y); y += 5
    }
    if (settings.bankAccountNo) {
      doc.text(`Account No.: ${settings.bankAccountNo}`, margin, y); y += 5
    }
    doc.setFont('helvetica', 'normal')
    y += 5
  }

  checkPage(40)

  // ── Terms and Conditions ───────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...C_TEAL)
  doc.text('TERMS AND CONDITIONS', margin, y)
  doc.setTextColor(...C_DARK)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text('Payment is due within 30 days from the date of this statement.', margin, y); y += 5

  const hasContact = settings.contactEmail || settings.contactPhone1 || settings.contactPhone2
  if (hasContact) {
    doc.text('For inquiries, please contact:', margin, y); y += 5
    doc.setFont('helvetica', 'bold')
    if (settings.contactEmail) { doc.text(settings.contactEmail, margin, y); y += 5 }
    if (settings.contactPhone1) { doc.text(settings.contactPhone1, margin, y); y += 5 }
    if (settings.contactPhone2) { doc.text(settings.contactPhone2, margin, y); y += 5 }
    doc.setFont('helvetica', 'normal')
  }
  y += 12

  // ── Signatures ─────────────────────────────────────────────────
  checkPage(55)

  const drawSig = async (
    esigUrl: string | null | undefined,
    name: string | null | undefined,
    title: string,
    xPos: number,
    sigY: number,
  ) => {
    if (esigUrl) {
      try {
        let dataUri: string
        if (esigUrl.startsWith('data:')) {
          // Already a base64 data URI (stored directly in DB)
          dataUri = esigUrl
        } else {
          // Legacy URL — fetch and convert
          const resp = await fetch(esigUrl)
          const blob = await resp.blob()
          dataUri = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
        }
        // Detect format from MIME type
        const mimeMatch = dataUri.match(/^data:image\/(\w+);/)
        const imgFmt = mimeMatch ? mimeMatch[1].toUpperCase().replace('JPEG', 'JPEG') : 'PNG'
        doc.addImage(dataUri, imgFmt as 'PNG' | 'JPEG', xPos, sigY - 15, 50, 15)
      } catch { /* skip */ }
    }
    doc.setDrawColor(...C_DARK)
    doc.setLineWidth(0.3)
    doc.line(xPos, sigY, xPos + 75, sigY)
    let ly = sigY + 5
    if (name) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(...C_DARK)
      doc.text(name.toUpperCase(), xPos, ly); ly += 4
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C_GRAY)
    doc.text(title, xPos, ly)
    doc.setTextColor(...C_DARK)
  }

  const sigStartY = y + 15
  await drawSig(settings.hmoOfficerEsigUrl, settings.hmoOfficerName, 'HMO OFFICER', margin, sigStartY)

  checkPage(30)
  await drawSig(settings.clinicManagerEsigUrl, settings.clinicManagerName, 'CLINIC MANAGER', margin, sigStartY + 30)

  return doc.output('datauristring').split(',')[1] // base64 only
}
