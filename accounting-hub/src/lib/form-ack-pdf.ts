// Server-only: builds the signed acknowledgment PDF so it reads like the
// paper/tablet form the med rep used before (navy header band, light-blue
// field boxes, Items Received tick boxes, signature box, "Delivered by" line).
// Text is Roboto (Hannah: numbers in Roboto) from server-assets/fonts, which is
// a Latin-1 subset — sanitize() drops anything the font cannot draw.
import { readFile } from 'fs/promises'
import { join } from 'path'
import { jsPDF } from 'jspdf'
import { ACK_ITEMS, ackFormLabel, type AckPdfData } from '@/lib/form-ack'

let fontCache: { regular: string; bold: string } | null = null
async function loadFonts() {
  if (fontCache) return fontCache
  const dir = join(process.cwd(), 'server-assets', 'fonts')
  const [regular, bold] = await Promise.all([
    readFile(join(dir, 'Roboto-Regular.ttf')),
    readFile(join(dir, 'Roboto-Bold.ttf')),
  ])
  fontCache = { regular: regular.toString('base64'), bold: bold.toString('base64') }
  return fontCache
}

// Keep only what the Roboto subset can draw.
const EXTRA = new Set([0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x2192, 0x00b7])
function sanitize(s: string | null | undefined): string {
  return Array.from(String(s ?? '').normalize('NFC'))
    .filter((ch) => {
      const c = ch.codePointAt(0) || 0
      return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA.has(c)
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

// PNG width/height from the IHDR chunk.
function pngSize(dataUrl: string): { w: number; h: number } | null {
  const b64 = dataUrl.split(',')[1] || ''
  const buf = Buffer.from(b64.slice(0, 64), 'base64')
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

export function manilaDateTime(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const NAVY: [number, number, number] = [27, 42, 71]
const FIELD: [number, number, number] = [220, 227, 245]
const MUTED: [number, number, number] = [96, 106, 130]
const LINE: [number, number, number] = [184, 191, 208]
const BOX_FILL: [number, number, number] = [247, 228, 228]

export async function buildAckPdf(d: AckPdfData): Promise<Buffer> {
  const fonts = await loadFonts()
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  doc.addFileToVFS('Roboto-Regular.ttf', fonts.regular)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFileToVFS('Roboto-Bold.ttf', fonts.bold)
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')

  const W = doc.internal.pageSize.getWidth()
  const M = 44
  const CW = W - M * 2

  // Header band
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 112, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('Roboto', 'bold'); doc.setFontSize(20)
  doc.text('ACKNOWLEDGMENT RECEIPT', M, 54)
  doc.setFont('Roboto', 'normal'); doc.setFontSize(10)
  doc.setTextColor(176, 188, 214)
  doc.text('For brochures, referral pads, giveaways and documents received during coverage', M, 74)
  doc.setFontSize(9)
  doc.text(sanitize(d.branchName), M, 94)
  doc.text(sanitize(manilaDateTime(d.signedAt)), W - M, 94, { align: 'right' })

  let y = 140
  const label = (text: string, yy: number) => {
    doc.setFont('Roboto', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY)
    doc.setCharSpace(0.4)
    doc.text(text.toUpperCase(), M, yy)
    doc.setCharSpace(0)
  }
  // A light-blue field box with the value fitted to one line.
  const field = (title: string, value: string) => {
    label(title, y)
    doc.setFillColor(...FIELD)
    doc.rect(M, y + 7, CW, 26, 'F')
    let v = sanitize(value)
    let size = 11.5
    doc.setFont('Roboto', 'normal'); doc.setTextColor(...NAVY)
    doc.setFontSize(size)
    while (size > 8 && doc.getTextWidth(v) > CW - 18) { size -= 0.5; doc.setFontSize(size) }
    while (v.length > 1 && doc.getTextWidth(v) > CW - 18) v = v.slice(0, -2) + '…'
    if (v) doc.text(v, M + 9, y + 24.5)
    y += 47
  }
  field('Institution / Hospital', d.institution)
  field('Recipient Name', d.recipientName)
  field('Recipient Designation', d.recipientDesignation)
  field('Received By', d.receivedBy)
  field('Designation', d.receivedByDesignation)

  // Items received — two columns like the paper form.
  y += 8
  label('Items Received (check all that apply)', y)
  y += 22
  const left = ['BROCHURE', 'GIVEAWAY', 'PROPOSAL']
  const right = ['REFERRAL_PAD', 'DOCUMENTS']
  const itemLabel = Object.fromEntries(ACK_ITEMS.map((i) => [i.key, i.label]))
  const tick = (key: string, x: number, yy: number) => {
    const on = d.items.includes(key)
    doc.setDrawColor(154, 163, 184); doc.setLineWidth(0.8)
    doc.setFillColor(...BOX_FILL)
    doc.rect(x, yy - 11, 14, 14, 'FD')
    if (on) {
      doc.setDrawColor(...NAVY); doc.setLineWidth(1.8)
      doc.line(x + 3, yy - 4, x + 6, yy)
      doc.line(x + 6, yy, x + 12.5, yy - 10)
    }
    doc.setFont('Roboto', on ? 'bold' : 'normal'); doc.setFontSize(11)
    doc.setTextColor(on ? NAVY[0] : MUTED[0], on ? NAVY[1] : MUTED[1], on ? NAVY[2] : MUTED[2])
    doc.text(itemLabel[key] || key, x + 24, yy)
  }
  left.forEach((k, i) => tick(k, M + 4, y + i * 26))
  right.forEach((k, i) => tick(k, M + CW / 2 + 4, y + i * 26))
  y += 3 * 26 + 6

  // Referral pads handed out (control numbers), when any.
  if (d.pads.length) {
    label('Referral Pads Handed Out', y)
    y += 8
    // FORM is wide enough for "ADMIN23 — Patient/Client Referral Form".
    const cols = [
      { t: 'FORM', x: M + 9 },
      { t: 'CONTROL NO. FROM', x: M + CW * 0.6 },
      { t: 'TO', x: M + CW * 0.8 },
      { t: 'PCS', x: M + CW - 9, right: true },
    ]
    const formMax = cols[1].x - cols[0].x - 10
    doc.setFillColor(...FIELD)
    doc.rect(M, y, CW, 18 + d.pads.length * 18, 'F')
    doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    cols.forEach((c) => doc.text(c.t, c.x, y + 12.5, c.right ? { align: 'right' } : undefined))
    doc.setFont('Roboto', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...NAVY)
    d.pads.forEach((p, i) => {
      const yy = y + 30 + i * 18
      let form = sanitize(ackFormLabel(p.formType, p.formName))
      while (form.length > 8 && doc.getTextWidth(form) > formMax) form = `${form.slice(0, -2).trimEnd()}…`
      doc.text(form, cols[0].x, yy)
      doc.text(sanitize(p.fromControl), cols[1].x, yy)
      doc.text(sanitize(p.toControl), cols[2].x, yy)
      doc.text(String(p.quantity), cols[3].x, yy, { align: 'right' })
    })
    y += 18 + d.pads.length * 18 + 22
  }

  if (sanitize(d.remarks)) {
    label('Remarks', y)
    doc.setFont('Roboto', 'normal'); doc.setFontSize(10)
    const lines = doc.splitTextToSize(sanitize(d.remarks), CW - 18).slice(0, 3) as string[]
    const h = 12 + lines.length * 13
    doc.setFillColor(...FIELD)
    doc.rect(M, y + 7, CW, h, 'F')
    doc.setTextColor(...NAVY)
    doc.text(lines, M + 9, y + 22)
    y += h + 26
  }

  // Signature box. Shrinks (down to 80pt) when many pad ranges + remarks fill
  // the page; if even that will not fit above the footer, it moves to page 2
  // with the Delivered-by line so the signature is never split.
  const H = doc.internal.pageSize.getHeight()
  const footerTop = H - 52
  y += 4
  let boxH = Math.min(120, footerTop - (y + 9) - 34)
  if (boxH < 80) {
    doc.addPage()
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, W, 40, 'F')
    doc.setFont('Roboto', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255)
    doc.text('ACKNOWLEDGMENT RECEIPT (continued)', M, 25)
    y = 72
    boxH = 120
  }
  label('Signature of Doctor / Secretary', y)
  const boxY = y + 9
  doc.setDrawColor(...LINE); doc.setLineWidth(0.8)
  doc.rect(M, boxY, CW, boxH)
  const size = pngSize(d.signaturePng)
  if (size && size.w > 0 && size.h > 0) {
    const maxW = CW - 40, maxH = boxH - 30
    const scale = Math.min(maxW / size.w, maxH / size.h)
    const iw = size.w * scale, ih = size.h * scale
    doc.addImage(d.signaturePng, 'PNG', M + (CW - iw) / 2, boxY + 6 + (maxH - ih) / 2, iw, ih, undefined, 'FAST')
  }
  doc.setFont('Roboto', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
  doc.text(`Signed on the med rep's device · ${sanitize(manilaDateTime(d.signedAt))}`, M + 10, boxY + boxH - 9)
  y = boxY + boxH + 26

  doc.setFont('Roboto', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...MUTED)
  doc.text(`Delivered by: ${sanitize(d.deliveredByName)}  |  ${sanitize(d.deliveredByTitle)}`, M, y)

  // Footer reference on every page
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(...LINE); doc.setLineWidth(0.5)
    doc.line(M, H - 36, W - M, H - 36)
    doc.setFont('Roboto', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
    doc.text(`Ref ${sanitize(d.id)} · Recorded in the SCEI Accounting Hub (Inventory / Forms / Partner Distribution)`, M, H - 23)
    if (pages > 1) doc.text(`Page ${p} of ${pages}`, W - M, H - 23, { align: 'right' })
  }

  return Buffer.from(doc.output('arraybuffer'))
}
