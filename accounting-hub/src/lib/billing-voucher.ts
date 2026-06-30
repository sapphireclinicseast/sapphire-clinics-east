// Billing Voucher PDF (A4 portrait) — mirrors the SCEI Expense Voucher layout:
// company header + 3 logos (SCEI · Aura · Verdana), BILL TO, ref/date, line
// table, grey Memo (description), and BALANCE DUE. Used by Expenses + Taxes RFPs.
import type { jsPDF as JsPDF } from 'jspdf'

export interface BVLine { account: string; description: string; amount: number }
export interface BillingVoucherOpts {
  refNumber: string
  date: string          // display date (e.g. 02/12/2026)
  billedTo: string      // free text, newlines allowed
  memo: string          // description shown in grey, lower-left
  lines: BVLine[]
}

// Build Billing-Voucher line items from a tax RFP's meta (WC / EWT / VAT).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function taxRfpLines(meta: any, grossTotal: number): BVLine[] {
  const t = meta?.taxType
  const items = Array.isArray(meta?.items) ? meta.items : []
  if (t === 'WC') return items.map((i: { name: string; period: string; tax: number }) => ({ account: 'Withholding Tax — Compensation', description: `${i.name}${i.period ? ` — ${i.period}` : ''}`, amount: Number(i.tax || 0) }))
  if (t === 'EWT') return items.map((i: { name: string; period: string; rate: number | null; ewt: number; source: string }) => ({ account: i.source === 'CONSULTANT' ? 'EWT — Consultant' : 'EWT — Expense', description: `${i.name}${i.rate != null ? ` (${i.rate}%)` : ''}${i.period ? ` · ${i.period}` : ''}`, amount: Number(i.ewt || 0) }))
  if (t === 'VAT') return [{ account: 'Value-Added Tax (2550Q)', description: meta?.period ? `VAT payable · ${meta.period.from} to ${meta.period.to}` : 'VAT payable', amount: Number(grossTotal || 0) }]
  return items.map((i: { name?: string; description?: string; amount?: number }) => ({ account: 'Tax', description: i.name || i.description || '', amount: Number(i.amount || 0) }))
}

const COMPANY = 'Sapphire Clinics East Inc.'
const COMPANY_LINES = [
  'Level 4, Robinsons Metro East, Marcos Highway, Brgy. Dela Paz, Santolan',
  'Pasig, Metro Manila  1600 PHL',
  '+639955403624',
  'east.sandboxclinic@gmail.com',
]
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

export async function buildBillingVoucher(opts: BillingVoucherOpts): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const left = 14, right = pageW - 14

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

  // Company header (top-left)
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(30, 30, 30).text(COMPANY, left, 18)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90, 90, 90)
  let cy = 24
  for (const l of COMPANY_LINES) { doc.text(l, left, cy); cy += 4.5 }

  // Title
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(196, 75, 0).text('Billing Voucher', left, 58)

  // BILL TO + Ref/Date
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(120, 120, 120)
  doc.text('BILL TO', left, 66)
  doc.text('Reference No:', 130, 66)
  doc.text('Date:', 130, 71)
  doc.setTextColor(30, 30, 30).setFontSize(9)
  let by = 71
  for (const l of (opts.billedTo || '').split('\n').slice(0, 4)) { if (l.trim()) { doc.text(l.trim(), left, by); by += 4.5 } }
  doc.text(opts.refNumber, 162, 66)
  doc.text(opts.date, 162, 71)

  const total = opts.lines.reduce((s, l) => s + l.amount, 0)
  autoTable(doc, {
    startY: Math.max(by + 4, 84),
    head: [['Account/Item', 'Description', 'Amount']],
    body: opts.lines.map(l => [l.account, l.description, peso(l.amount)]),
    styles: { fontSize: 8.5, cellPadding: 2.2, textColor: [30, 30, 30] },
    headStyles: { fillColor: [252, 228, 214], textColor: [120, 60, 20], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 55 }, 2: { halign: 'right', cellWidth: 30 } },
    margin: { left, right: 14 },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const endY = (doc as any).lastAutoTable.finalY as number
  doc.setDrawColor(200, 200, 200).setLineWidth(0.2)
  doc.line(left, endY + 4, right, endY + 4)

  // Memo (grey, lower-left) + BALANCE DUE (right)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120, 120, 120)
  const memo = `Memo: ${opts.memo || ''}`
  doc.text(doc.splitTextToSize(memo, 110), left, endY + 11)
  doc.setFontSize(10).setTextColor(60, 60, 60).text('BALANCE DUE', 130, endY + 11)
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(30, 30, 30).text(`PHP ${peso(total)}`, right, endY + 11, { align: 'right' })

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(150, 150, 150)
  doc.text('Page 1 of 1', pageW / 2, 287, { align: 'center' })
  return doc
}
