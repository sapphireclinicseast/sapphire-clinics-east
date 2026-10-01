/**
 * BIR Form 2307 PDF — overlay on the official form template, ported verbatim
 * from the HR hub's generator (box positions were extracted from the template
 * with pdfminer; do not "tidy" the coordinates). Runs in the browser: the
 * template and the signatory e-signature are fetched from the auth-gated
 * /api/payroll/bir-2307?mode=asset endpoint, never from public/.
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'

export interface Bir2307Row { desc: string; atc: string; m1: number; m2: number; m3: number; total: number; tax: number }
export interface Bir2307Input {
  payee: { name: string; tin: string; address: string; zip: string }
  payor: { name: string; tin: string; address: string; zip: string }
  fromDate: string // YYYY-MM-DD
  toDate: string   // YYYY-MM-DD
  rows: Bir2307Row[]
  signatory: { name: string; title: string }
}

const fmtNum = (n: number) => n ? n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

export async function generateBir2307Pdf(input: Bir2307Input): Promise<Uint8Array> {
  const [templateRes, sigRes] = await Promise.all([
    fetch('/api/payroll/bir-2307?mode=asset&name=template'),
    fetch('/api/payroll/bir-2307?mode=asset&name=signature'),
  ])
  if (!templateRes.ok) throw new Error('Could not load the BIR 2307 template')
  const templateBytes = await templateRes.arrayBuffer()

  const pdfDoc = await PDFDocument.load(templateBytes)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const page: PDFPage = pdfDoc.getPages()[0]
  const H = 936
  const black = rgb(0, 0, 0)

  // Draw text at (x, topY) — topY measured from the TOP of the 936pt page.
  const t = (text: string | number | null | undefined, x: number, topY: number, size?: number, bold?: boolean) => {
    if (!text) return
    page.drawText(String(text), { x, y: H - topY, size: size || 9, font: bold ? fontBold : font, color: black })
  }
  const drawDigitsInBoxes = (digits: string, boxes: { x0: number; x1: number }[], boxTopY: number, boxH: number, sz?: number) => {
    const chars = String(digits).replace(/[^0-9]/g, '').split('')
    const baseline = boxTopY + boxH - 4
    chars.forEach((ch, i) => {
      if (i >= boxes.length) return
      const cw = font.widthOfTextAtSize(ch, sz || 10)
      t(ch, boxes[i].x0 + (boxes[i].x1 - boxes[i].x0 - cw) / 2, baseline, sz || 10)
    })
  }
  const tFit = (text: string, x: number, topY: number, maxW: number, maxSz?: number, bold?: boolean) => {
    if (!text) return
    let sz = maxSz || 9
    const f: PDFFont = bold ? fontBold : font
    while (sz > 4 && f.widthOfTextAtSize(String(text), sz) > maxW) sz -= 0.5
    t(text, x, topY, sz, bold)
  }

  const { payee, payor, fromDate, toDate, rows, signatory } = input

  // ── 1. Period dates (MMDDYYYY digit boxes) ──
  if (fromDate) {
    const [fy, fm, fd] = fromDate.split('-')
    const bw = 13.15
    const boxes: { x0: number; x1: number }[] = []
    for (let i = 0; i < 4; i++) boxes.push({ x0: 151.5 + i * bw, x1: 151.5 + (i + 1) * bw })
    for (let i = 0; i < 4; i++) boxes.push({ x0: 204.1 + i * bw, x1: 204.1 + (i + 1) * bw })
    drawDigitsInBoxes(fm + fd + fy, boxes, 106.4, 15.9, 10)
  }
  if (toDate) {
    const [ty, tm, td] = toDate.split('-')
    const bw = 13.18
    const boxes: { x0: number; x1: number }[] = []
    for (let i = 0; i < 4; i++) boxes.push({ x0: 399.1 + i * bw, x1: 399.1 + (i + 1) * bw })
    for (let i = 0; i < 4; i++) boxes.push({ x0: 451.8 + i * bw, x1: 451.8 + (i + 1) * bw })
    drawDigitsInBoxes(tm + td + ty, boxes, 105.7, 16.5, 10)
  }

  // ── 2. Payee TIN ──
  if (payee.tin) {
    const boxes: { x0: number; x1: number }[] = []
    ;[207.2, 220.4, 233.6].forEach(x => boxes.push({ x0: x, x1: x + 13.2 }))
    ;[258.9, 272.1, 285.3].forEach(x => boxes.push({ x0: x, x1: x + 13.2 }))
    ;[310.2, 323.4, 336.6].forEach(x => boxes.push({ x0: x, x1: x + 13.2 }))
    for (let i = 0; i < 5; i++) boxes.push({ x0: 361.5 + i * 14.78, x1: 361.5 + (i + 1) * 14.78 })
    drawDigitsInBoxes(payee.tin, boxes, 137.3, 15.6, 10)
  }

  // ── 3/4. Payee name, address, zip ──
  t(payee.name, 36, 164.3 + 15.9 - 4, 10, true)
  tFit(payee.address, 36, 192.7 + 15.9 - 4, 498, 8)
  if (payee.zip) {
    const zw = 50.0 / 4
    const zBoxes: { x0: number; x1: number }[] = []
    for (let i = 0; i < 4; i++) zBoxes.push({ x0: 541.8 + i * zw, x1: 541.8 + (i + 1) * zw })
    drawDigitsInBoxes(payee.zip, zBoxes, 192.7, 15.8, 9)
  }

  // ── 6. Payor TIN ──
  if (payor.tin) {
    const boxes: { x0: number; x1: number }[] = []
    ;[208.0, 221.2, 234.4].forEach(x => boxes.push({ x0: x, x1: x + 13.2 }))
    ;[259.5, 272.7, 285.9].forEach(x => boxes.push({ x0: x, x1: x + 13.2 }))
    ;[310.9, 324.1, 337.3].forEach(x => boxes.push({ x0: x, x1: x + 13.2 }))
    for (let i = 0; i < 5; i++) boxes.push({ x0: 362.3 + i * 14.8, x1: 362.3 + (i + 1) * 14.8 })
    drawDigitsInBoxes(payor.tin, boxes, 252.5, 16.1, 10)
  }

  // ── 7/8. Payor name, address, zip ──
  t(payor.name, 36, 279.5 + 15.9 - 4, 10, true)
  tFit(payor.address, 36, 307.9 + 15.9 - 4, 498, 7)
  if (payor.zip) {
    const zw = 50.0 / 4
    const zBoxes: { x0: number; x1: number }[] = []
    for (let i = 0; i < 4; i++) zBoxes.push({ x0: 541.8 + i * zw, x1: 541.8 + (i + 1) * zw })
    drawDigitsInBoxes(payor.zip, zBoxes, 307.9, 15.8, 9)
  }

  // ── Part III — income payments table ──
  const COL = { desc: 22, atc: 180, m1: 230, m2: 305, m3: 378, total: 458, tax: 538 }
  const tblTop = 375
  const rowH = 13.7
  const dSz = 7
  const items = rows.filter(r => r.desc || r.m1 || r.m2 || r.m3)
  for (let i = 0; i < items.length && i < 10; i++) {
    const item = items[i]
    const ry = tblTop + i * rowH
    t(item.desc, COL.desc, ry, dSz)
    t(item.atc, COL.atc, ry, dSz)
    if (item.m1) t(fmtNum(item.m1), COL.m1, ry, dSz)
    if (item.m2) t(fmtNum(item.m2), COL.m2, ry, dSz)
    if (item.m3) t(fmtNum(item.m3), COL.m3, ry, dSz)
    if (item.total) t(fmtNum(item.total), COL.total, ry, dSz)
    if (item.tax) t(fmtNum(item.tax), COL.tax, ry, dSz)
  }
  const totAll = items.reduce((s, r) => s + r.total, 0)
  const totTax = items.reduce((s, r) => s + r.tax, 0)
  const expTotY = 502.1 + 13.8 - 4
  if (totAll) t(fmtNum(totAll), COL.total, expTotY, dSz, true)
  if (totTax) t(fmtNum(totTax), COL.tax, expTotY, dSz, true)
  const monTotY = 671.6 + 13.8 - 4
  if (totAll) t(fmtNum(totAll), COL.total, monTotY, dSz, true)
  if (totTax) t(fmtNum(totTax), COL.tax, monTotY, dSz, true)

  // ── Signatures: payor signatory (printed name + title + e-signature image),
  //    payee printed name over the "Signature over Printed Name" line ──
  const sigName = (signatory.name || '').toUpperCase()
  const sigTitle = signatory.title || ''
  if (sigName) {
    const w = fontBold.widthOfTextAtSize(sigName, 9)
    t(sigName, (612 - w) / 2, 743, 9, true)
  }
  if (sigTitle) {
    const w = font.widthOfTextAtSize(sigTitle, 7)
    t(sigTitle, (612 - w) / 2, 753, 7)
  }
  try {
    if (sigRes.ok) {
      const sigImg = await pdfDoc.embedPng(await sigRes.arrayBuffer())
      const sigW = 120
      const sigH = sigW * (sigImg.height / sigImg.width)
      page.drawImage(sigImg, { x: (612 - sigW) / 2, y: H - 780 + 2, width: sigW, height: sigH })
    }
  } catch { /* signature image is best-effort — the printed name always renders */ }
  if (payee.name) {
    const w = fontBold.widthOfTextAtSize(payee.name, 9)
    t(payee.name, (612 - w) / 2, 820, 9, true)
  }

  return pdfDoc.save()
}
