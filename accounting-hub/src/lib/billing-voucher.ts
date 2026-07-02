// Billing Voucher PDF (A4 portrait) — mirrors the SCEI Expense Voucher layout:
// branch-specific company header + 3 logos (SCEI · Aura · Verdana), BILL TO,
// ref/date, line table (Gross · VAT · Net of VAT · EWT · Net of EWT), grey Memo,
// and BALANCE DUE. Used by Expenses + Taxes RFPs.
import type { jsPDF as JsPDF } from 'jspdf'

export interface BVLine { account: string; description: string; gross: number; vat: number; netVat: number; netEwt: number }
export interface BillingVoucherOpts {
  refNumber: string
  date: string          // display date (e.g. 02/12/2026)
  billedTo: string      // free text, newlines allowed
  memo: string          // description shown in grey, lower-left
  lines: BVLine[]
  branch?: string       // SANDBOX_EAST | SBEA | AHEA | … selects the header
  preparedBy?: string   // printed under the "Prepared By" signature line
}

const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Branch header (name / address / phone / email). Address + phone are the SCEI
// principal office; per-branch email per finance. Keyed by any branch alias.
interface Header { name: string; lines: string[]; email: string }
const EAST_ADDR = ['Level 4, Robinsons Metro East, Marcos Highway, Brgy. Dela Paz, Santolan, Pasig', '+63 917 118 9289 | (02) 5310-4991']
const GREENHILLS_ADDR = ['Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City', '+63 917 770 1686 | (02) 8529-1590']
const VERDANA_ADDR = ['210B Henry’s Building, 80 Ortigas Avenue, Greenhills, San Juan City, Metro Manila, Philippines, 1502', '+63 917 173 1368']
const HEADERS: Record<string, Header> = {
  EAST: { name: 'Aura Health Rehab - East', lines: EAST_ADDR, email: 'east@sapphireclinicseast.org' },
  GREENHILLS: { name: 'Aura Health Rehab - Greenhills', lines: GREENHILLS_ADDR, email: 'greenhills@sapphireclinicseast.org' },
  VERDANA: { name: 'Verdana', lines: VERDANA_ADDR, email: 'verdanatrading@gmail.com' },
}
function resolveHeader(branch?: string): Header {
  const b = (branch || '').toUpperCase()
  if (b.includes('GREEN') || b === 'SBGH' || b === 'AHGH') return HEADERS.GREENHILLS
  if (b.includes('VERDANA') || b === 'VER') return HEADERS.VERDANA
  return HEADERS.EAST
}

// Build Billing-Voucher line items from a tax RFP's meta (WC / EWT / VAT).
// VAT/EWT columns don't apply to tax lines, so net = gross for those.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function taxRfpLines(meta: any, grossTotal: number): BVLine[] {
  const flat = (account: string, description: string, amount: number): BVLine => ({ account, description, gross: amount, vat: 0, netVat: amount, netEwt: amount })
  const t = meta?.taxType
  const items = Array.isArray(meta?.items) ? meta.items : []
  if (t === 'WC') return items.map((i: { name: string; period: string; tax: number }) => flat('Withholding Tax — Compensation', `${i.name}${i.period ? ` — ${i.period}` : ''}`, Number(i.tax || 0)))
  if (t === 'EWT') return items.map((i: { name: string; period: string; rate: number | null; ewt: number; source: string }) => flat(i.source === 'CONSULTANT' ? 'EWT — Consultant' : 'EWT — Expense', `${i.name}${i.rate != null ? ` (${i.rate}%)` : ''}${i.period ? ` · ${i.period}` : ''}`, Number(i.ewt || 0)))
  if (t === 'VAT') return [flat('Value-Added Tax (2550Q)', meta?.period ? `VAT payable · ${meta.period.from} to ${meta.period.to}` : 'VAT payable', Number(grossTotal || 0))]
  return items.map((i: { name?: string; description?: string; amount?: number }) => flat('Tax', i.name || i.description || '', Number(i.amount || 0)))
}

export async function buildBillingVoucher(opts: BillingVoucherOpts): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const left = 14, right = pageW - 14
  const hdr = resolveHeader(opts.branch)

  // 3 logos top-right (SCEI · Aura · Verdana)
  const logoH = 16
  let lx = right
  for (const src of ['/login-verdana.png', '/login-aura.png', '/login-scei.png']) {
    const data = await fetchDataUrl(src)
    if (!data) continue
    try {
      const p = doc.getImageProperties(data)
      const w = (p.width / p.height) * logoH
      lx -= w
      doc.addImage(data, 'PNG', lx, 12, w, logoH)
      lx -= 4
    } catch { /* skip */ }
  }

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(30, 30, 30).text(hdr.name, left, 18)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90, 90, 90)
  let cy = 24
  for (const l of [...hdr.lines, hdr.email]) { doc.text(l, left, cy); cy += 4.5 }

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(196, 75, 0).text('Billing Voucher', left, 58)

  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(120, 120, 120)
  doc.text('BILL TO', left, 66)
  doc.text('Reference No:', 130, 66)
  doc.text('Date:', 130, 71)
  doc.setTextColor(30, 30, 30).setFontSize(9)
  let by = 71
  for (const l of (opts.billedTo || '').split('\n').slice(0, 4)) { if (l.trim()) { doc.text(l.trim(), left, by); by += 4.5 } }
  doc.text(opts.refNumber, 162, 66)
  doc.text(opts.date, 162, 71)

  const tot = (k: keyof BVLine) => opts.lines.reduce((s, l) => s + (l[k] as number), 0)
  const ewtOf = (l: BVLine) => Math.max(0, l.netVat - l.netEwt)   // EWT withheld = Net of VAT − Net of EWT (0 if none)
  const totEwt = opts.lines.reduce((s, l) => s + ewtOf(l), 0)
  const NUMERIC_COLS = [2, 3, 4, 5, 6]
  autoTable(doc, {
    startY: Math.max(by + 4, 84),
    head: [['Account/Item', 'Description', 'Gross Amount', 'VAT', 'Net of VAT', 'EWT', 'Net of EWT']],
    body: opts.lines.map(l => [l.account, l.description, peso(l.gross), peso(l.vat), peso(l.netVat), peso(ewtOf(l)), peso(l.netEwt)]),
    foot: [['', 'TOTAL', peso(tot('gross')), peso(tot('vat')), peso(tot('netVat')), peso(totEwt), peso(tot('netEwt'))]],
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: [30, 30, 30] },
    headStyles: { fillColor: [252, 228, 214], textColor: [120, 60, 20], fontStyle: 'bold' },
    footStyles: { fillColor: [248, 240, 234], textColor: [30, 30, 30], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 22 }, 3: { cellWidth: 15 }, 4: { cellWidth: 22 }, 5: { cellWidth: 18 }, 6: { cellWidth: 22 } },
    // Right-align the numeric columns in EVERY section so the headers line up
    // with the amounts below them (headers were previously centered).
    didParseCell: (data) => { if (NUMERIC_COLS.includes(data.column.index)) data.cell.styles.halign = 'right' },
    margin: { left, right: 14 },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const endY = (doc as any).lastAutoTable.finalY as number
  doc.setDrawColor(200, 200, 200).setLineWidth(0.2)
  doc.line(left, endY + 4, right, endY + 4)

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120, 120, 120)
  doc.text(doc.splitTextToSize(`Memo: ${opts.memo || ''}`, 110), left, endY + 11)
  doc.setFontSize(10).setTextColor(60, 60, 60).text('BALANCE DUE (Net of EWT)', 130, endY + 11)
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(30, 30, 30).text(`PHP ${peso(tot('netEwt'))}`, right, endY + 16, { align: 'right' })

  // Prepared By — wet-signature line (they print this), name printed underneath.
  const sigY = Math.min(endY + 40, 272)
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(30, 30, 30).text(opts.preparedBy || '', left, sigY - 1)
  doc.setDrawColor(120, 120, 120).setLineWidth(0.3).line(left, sigY, left + 62, sigY)
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(120, 120, 120).text('Prepared By (signature over printed name)', left, sigY + 4)

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(150, 150, 150)
  doc.text('Page 1 of 1', pageW / 2, 287, { align: 'center' })
  return doc
}

const fetchDataUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url); if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>(resolve => {
      const fr = new FileReader()
      fr.onloadend = () => resolve(fr.result as string)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch { return null }
}
