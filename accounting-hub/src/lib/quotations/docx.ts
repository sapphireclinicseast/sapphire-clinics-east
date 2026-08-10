/**
 * Renders a quotation into the branch's own .docx letterhead.
 *
 * The uploaded template is never re-created — we open it as a zip, keep every part
 * (headers, footers, artwork, fonts, styles) and swap only the body of
 * `word/document.xml`. The template's trailing `<w:sectPr>` is carried over
 * verbatim: it is what binds the header/footer parts and the page setup, so
 * dropping it would silently strip the letterhead off the page.
 *
 * Images (product photos, the signature) are added as new parts under
 * `word/media/` with fresh relationship ids, and their extents are computed from
 * the real pixel dimensions so nothing is squashed.
 */

import JSZip from 'jszip'
import { formatPeso, validUntil, type PricedLine } from './pricing'

const EMU_PER_INCH = 914400

/**
 * The letterheads carry their artwork as a full-page background image, so Word
 * has no idea the banner is there — every template ships a plain 1" top margin
 * and the first line lands inside the header graphic.
 *
 * Measured against the four supplied letterheads, the solid banner ends between
 * 1.15" (East) and 1.47" (Greenhills), and the footer motif occupies the bottom
 * 0.78"–0.83". These minimums clear the tallest of them with room to breathe.
 * They are floors, never ceilings: a template that already asks for more keeps
 * its own margins.
 */
const MIN_TOP_MARGIN_TWIPS = 2880 // 2.0"
const MIN_BOTTOM_MARGIN_TWIPS = 2016 // 1.4"

/** Push the body clear of the letterhead artwork without touching anything else in sectPr. */
function withSafeMargins(sectPr: string): string {
  if (!sectPr) return sectPr

  const raise = (tag: string): string => {
    const read = (attr: string): number | null => {
      const m = tag.match(new RegExp(`w:${attr}="(-?\\d+)"`))
      return m ? parseInt(m[1], 10) : null
    }
    const top = Math.max(read('top') ?? 0, MIN_TOP_MARGIN_TWIPS)
    const bottom = Math.max(read('bottom') ?? 0, MIN_BOTTOM_MARGIN_TWIPS)
    let out = tag
    out = read('top') != null ? out.replace(/w:top="-?\d+"/, `w:top="${top}"`) : out.replace('<w:pgMar', `<w:pgMar w:top="${top}"`)
    out = read('bottom') != null ? out.replace(/w:bottom="-?\d+"/, `w:bottom="${bottom}"`) : out.replace('<w:pgMar', `<w:pgMar w:bottom="${bottom}"`)
    return out
  }

  if (/<w:pgMar\b[^>]*\/>/.test(sectPr)) return sectPr.replace(/<w:pgMar\b[^>]*\/>/, raise)

  // No page margins declared — state them, otherwise Word falls back to 1" and overlaps again.
  return sectPr.replace(
    '<w:sectPr',
    `<w:sectPr`,
  ).replace(
    /(<w:sectPr[^>]*>)/,
    `$1<w:pgMar w:top="${MIN_TOP_MARGIN_TWIPS}" w:right="1440" w:bottom="${MIN_BOTTOM_MARGIN_TWIPS}" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>`,
  )
}

export interface QuotationDocInput {
  quotationNumber: string
  branchLabel: string
  recipientName: string
  recipientEmail?: string | null
  recipientPhone?: string | null
  contactPerson?: string | null
  datePrepared: Date
  validityDays: number
  services: PricedLine[]
  products: PricedLine[]
  grandTotal: number
  remarks?: string | null
  /** Downpayment percentage agreed, if any. */
  downpaymentPercent?: number | null
  bankAccountName?: string | null
  bankAccountNumber?: string | null
  bankName?: string | null
  preparedByName: string
  preparedByPosition: string
  /** Raw bytes of the signature image, if one was provided. */
  signature?: { data: Buffer; contentType: string } | null
  /** Product photos keyed by the imageUrl on the line. */
  photos?: Map<string, { data: Buffer; contentType: string }>
}

/* ── XML helpers ─────────────────────────────────────────────── */

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface RunOpts { bold?: boolean; size?: number; color?: string; italic?: boolean }

function run(text: string, o: RunOpts = {}): string {
  const props = [
    o.bold ? '<w:b/>' : '',
    o.italic ? '<w:i/>' : '',
    o.color ? `<w:color w:val="${o.color}"/>` : '',
    o.size ? `<w:sz w:val="${o.size * 2}"/><w:szCs w:val="${o.size * 2}"/>` : '',
  ].join('')
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

interface ParaOpts extends RunOpts { align?: 'left' | 'center' | 'right'; spaceAfter?: number }

function para(text: string, o: ParaOpts = {}): string {
  const pPr = [
    o.align ? `<w:jc w:val="${o.align}"/>` : '',
    o.spaceAfter != null ? `<w:spacing w:after="${o.spaceAfter}"/>` : '',
  ].join('')
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${text ? run(text, o) : ''}</w:p>`
}

function emptyPara(): string {
  return '<w:p/>'
}

function cell(content: string, widthPct: number, opts: { shade?: string; align?: string } = {}): string {
  const shade = opts.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.shade}"/>` : ''
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${Math.round(widthPct * 50)}" w:type="pct"/>${shade}` +
    `<w:vAlign w:val="center"/></w:tcPr>${content}</w:tc>`
  )
}

function textCell(text: string, widthPct: number, o: ParaOpts & { shade?: string } = {}): string {
  return cell(para(text, o), widthPct, { shade: o.shade })
}

function table(rows: string[]): string {
  const borders =
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/>`)
      .join('') +
    '</w:tblBorders>'
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
    borders +
    '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>' +
    '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>' +
    '</w:tblPr>' +
    rows.join('') +
    '</w:tbl>'
  )
}

const rowOf = (cells: string[]) => `<w:tr>${cells.join('')}</w:tr>`

/* ── Images ──────────────────────────────────────────────────── */

/** Pixel dimensions straight from the file header — no image library needed. */
function imageSize(buf: Buffer): { width: number; height: number } | null {
  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
  if (buf.length > 24 && buf.toString('hex', 0, 8) === '89504e470d0a1a0a') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  // JPEG: walk the segments to the first SOF marker.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue }
      const marker = buf[i + 1]
      const len = buf.readUInt16BE(i + 2)
      // SOF0..SOF15, excluding the non-frame markers DHT/JPG/DAC.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
      }
      i += 2 + len
    }
  }
  return null
}

function extFor(contentType: string): string {
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('gif')) return 'gif'
  if (contentType.includes('webp')) return 'webp'
  return 'jpeg'
}

/** Inline image run, sized to `maxWidthInches` with the aspect ratio preserved. */
function imageRun(rId: string, docPrId: number, name: string, buf: Buffer, maxWidthInches: number): string {
  const size = imageSize(buf)
  const ratio = size && size.width > 0 ? size.height / size.width : 1
  const cx = Math.round(maxWidthInches * EMU_PER_INCH)
  const cy = Math.round(cx * ratio)
  return (
    '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${docPrId}" name="${esc(name)}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  )
}

/* ── Document assembly ───────────────────────────────────────── */

const HEAD_SHADE = 'EFF6F5'

function serviceTable(lines: PricedLine[]): string {
  const w = [30, 18, 14, 14, 8, 16]
  const header = rowOf([
    textCell('Service', w[0], { bold: true, size: 9, shade: HEAD_SHADE }),
    textCell('Department', w[1], { bold: true, size: 9, shade: HEAD_SHADE }),
    textCell('Gross Price', w[2], { bold: true, size: 9, align: 'right', shade: HEAD_SHADE }),
    textCell('Discounted Price', w[3], { bold: true, size: 9, align: 'right', shade: HEAD_SHADE }),
    textCell('Qty', w[4], { bold: true, size: 9, align: 'center', shade: HEAD_SHADE }),
    textCell('Total Price', w[5], { bold: true, size: 9, align: 'right', shade: HEAD_SHADE }),
  ])
  const body = lines.map(l =>
    rowOf([
      textCell(l.name, w[0], { size: 9 }),
      textCell(l.department || '—', w[1], { size: 9 }),
      textCell(formatPeso(l.grossPrice), w[2], { size: 9, align: 'right' }),
      textCell(
        l.discountedPrice != null ? `${formatPeso(l.discountedPrice)}${l.discountLabel ? ` (${l.discountLabel})` : ''}` : '—',
        w[3],
        { size: 9, align: 'right' },
      ),
      textCell(String(l.quantity), w[4], { size: 9, align: 'center' }),
      textCell(formatPeso(l.lineTotal), w[5], { size: 9, align: 'right', bold: true }),
    ]),
  )
  return table([header, ...body])
}

function productTable(
  lines: PricedLine[],
  photoRun: (line: PricedLine) => string,
): string {
  const w = [10, 14, 28, 13, 13, 7, 15]
  const header = rowOf([
    textCell('Photo', w[0], { bold: true, size: 9, shade: HEAD_SHADE }),
    textCell('SKU', w[1], { bold: true, size: 9, shade: HEAD_SHADE }),
    textCell('Name', w[2], { bold: true, size: 9, shade: HEAD_SHADE }),
    textCell('Gross Price', w[3], { bold: true, size: 9, align: 'right', shade: HEAD_SHADE }),
    textCell('Discounted Price', w[4], { bold: true, size: 9, align: 'right', shade: HEAD_SHADE }),
    textCell('Qty', w[5], { bold: true, size: 9, align: 'center', shade: HEAD_SHADE }),
    textCell('Total Price', w[6], { bold: true, size: 9, align: 'right', shade: HEAD_SHADE }),
  ])
  const body = lines.map(l => {
    const img = photoRun(l)
    return rowOf([
      cell(img ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${img}</w:p>` : para('—', { size: 9, align: 'center' }), w[0]),
      textCell(l.sku || '—', w[1], { size: 9 }),
      textCell(l.name, w[2], { size: 9 }),
      textCell(formatPeso(l.grossPrice), w[3], { size: 9, align: 'right' }),
      textCell(
        l.discountedPrice != null ? `${formatPeso(l.discountedPrice)}${l.discountLabel ? ` (${l.discountLabel})` : ''}` : '—',
        w[4],
        { size: 9, align: 'right' },
      ),
      textCell(String(l.quantity), w[5], { size: 9, align: 'center' }),
      textCell(formatPeso(l.lineTotal), w[6], { size: 9, align: 'right', bold: true }),
    ])
  })
  return table([header, ...body])
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })

export async function buildQuotationDocx(templateBytes: Buffer, input: QuotationDocInput): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBytes)

  const documentPath = 'word/document.xml'
  const relsPath = 'word/_rels/document.xml.rels'
  const original = await zip.file(documentPath)?.async('string')
  if (!original) throw new Error('The template is not a valid .docx (no word/document.xml)')

  let rels = (await zip.file(relsPath)?.async('string')) ||
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'

  // Keep the section properties — they bind the header/footer parts and page setup.
  const sectPr = original.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0] || ''

  let nextRelNum = 1
  for (const m of rels.matchAll(/Id="rId(\d+)"/g)) {
    nextRelNum = Math.max(nextRelNum, parseInt(m[1], 10) + 1)
  }
  let docPrId = 1000
  let mediaNum = 1
  const newRels: string[] = []

  /** Adds an image part and returns the run XML that displays it. */
  const addImage = (data: Buffer, contentType: string, widthInches: number, name: string): string => {
    const ext = extFor(contentType)
    const fileName = `quotation-media-${mediaNum++}.${ext}`
    zip.file(`word/media/${fileName}`, data)
    const rId = `rId${nextRelNum++}`
    newRels.push(
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${fileName}"/>`,
    )
    return imageRun(rId, docPrId++, name, data, widthInches)
  }

  /* Body */
  const parts: string[] = []

  parts.push(para('QUOTATION', { bold: true, size: 16, align: 'center', spaceAfter: 60 }))
  parts.push(para(input.branchLabel, { size: 10, align: 'center', color: '5B6770', spaceAfter: 160 }))

  // Reference block — number and dates on one side, recipient on the other.
  const meta = [
    ['Quotation No.', input.quotationNumber],
    ['Date Prepared', fmtDate(input.datePrepared)],
    ['Valid Until', `${fmtDate(validUntil(input.datePrepared, input.validityDays))} (${input.validityDays} days)`],
  ]
  const recipient: [string, string][] = [['Quotation For', input.recipientName]]
  if (input.contactPerson) recipient.push(['Contact Person', input.contactPerson])
  if (input.recipientEmail) recipient.push(['Email', input.recipientEmail])
  if (input.recipientPhone) recipient.push(['Contact Number', input.recipientPhone])

  const infoRows = Math.max(meta.length, recipient.length)
  const infoTable: string[] = []
  for (let i = 0; i < infoRows; i++) {
    infoTable.push(
      rowOf([
        textCell(recipient[i]?.[0] ? `${recipient[i][0]}:` : '', 16, { size: 9, bold: true }),
        textCell(recipient[i]?.[1] || '', 34, { size: 9 }),
        textCell(meta[i]?.[0] ? `${meta[i][0]}:` : '', 18, { size: 9, bold: true }),
        textCell(meta[i]?.[1] || '', 32, { size: 9 }),
      ]),
    )
  }
  parts.push(
    '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
      '<w:tblCellMar><w:top w:w="20" w:type="dxa"/><w:left w:w="0" w:type="dxa"/>' +
      '<w:bottom w:w="20" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
      infoTable.join('') +
      '</w:tbl>',
  )
  parts.push(emptyPara())

  if (input.services.length > 0) {
    parts.push(para('Services', { bold: true, size: 11, spaceAfter: 80 }))
    parts.push(serviceTable(input.services))
    parts.push(emptyPara())
  }

  if (input.products.length > 0) {
    parts.push(para('Products', { bold: true, size: 11, spaceAfter: 80 }))
    parts.push(
      productTable(input.products, line => {
        const photo = line.imageUrl ? input.photos?.get(line.imageUrl) : null
        return photo ? addImage(photo.data, photo.contentType, 0.7, line.name) : ''
      }),
    )
    parts.push(emptyPara())
  }

  // Grand total, right-aligned against the table edge.
  parts.push(
    table([
      rowOf([
        textCell('GRAND TOTAL', 70, { bold: true, size: 11, align: 'right', shade: HEAD_SHADE }),
        textCell(formatPeso(input.grandTotal), 30, { bold: true, size: 11, align: 'right', shade: HEAD_SHADE }),
      ]),
    ]),
  )
  parts.push(emptyPara())

  // Payment terms — what to pay now, what is left, and exactly where it goes.
  const hasPaymentTerms = !!input.downpaymentPercent || !!input.bankAccountNumber
  if (hasPaymentTerms) {
    parts.push(para('Payment Terms', { bold: true, size: 10, spaceAfter: 40 }))
    const rows: string[] = []
    if (input.downpaymentPercent) {
      const down = Math.round(input.grandTotal * (input.downpaymentPercent / 100) * 100) / 100
      const balance = Math.round((input.grandTotal - down) * 100) / 100
      rows.push(
        rowOf([
          textCell(`Downpayment (${input.downpaymentPercent}%)`, 34, { size: 9, bold: true }),
          textCell(formatPeso(down), 26, { size: 9, align: 'right' }),
          textCell('Balance', 20, { size: 9, bold: true, align: 'right' }),
          textCell(formatPeso(balance), 20, { size: 9, align: 'right' }),
        ]),
      )
    }
    if (input.bankAccountNumber) {
      const label = [input.bankName, 'Account'].filter(Boolean).join(' ')
      rows.push(
        rowOf([
          textCell(`Deposit to (${label})`, 34, { size: 9, bold: true }),
          textCell(input.bankAccountName || '', 26, { size: 9 }),
          textCell('Account No.', 20, { size: 9, bold: true, align: 'right' }),
          textCell(input.bankAccountNumber, 20, { size: 9, align: 'right' }),
        ]),
      )
    }
    parts.push(table(rows))
    parts.push(emptyPara())
  }

  if (input.remarks?.trim()) {
    parts.push(para('Remarks', { bold: true, size: 10, spaceAfter: 40 }))
    for (const line of input.remarks.split('\n')) parts.push(para(line, { size: 9 }))
    parts.push(emptyPara())
  }

  // Prepared by — signature sits above the name, as on a signed page.
  parts.push(para('Prepared by:', { size: 9, spaceAfter: 40 }))
  if (input.signature) {
    parts.push(`<w:p>${addImage(input.signature.data, input.signature.contentType, 1.8, 'Signature')}</w:p>`)
  } else {
    parts.push(emptyPara())
    parts.push(emptyPara())
  }
  parts.push(para(input.preparedByName, { bold: true, size: 10 }))
  parts.push(para(input.preparedByPosition, { size: 9, color: '5B6770' }))

  const body = parts.join('') + withSafeMargins(sectPr)

  const newDocument = original.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${body}</w:body>`)
  zip.file(documentPath, newDocument)

  if (newRels.length > 0) {
    rels = rels.replace('</Relationships>', newRels.join('') + '</Relationships>')
    zip.file(relsPath, rels)

    // Word refuses to open the file if an image extension has no content-type default.
    const ctPath = '[Content_Types].xml'
    let ct = (await zip.file(ctPath)?.async('string')) || ''
    for (const [ext, type] of [
      ['png', 'image/png'],
      ['jpeg', 'image/jpeg'],
      ['gif', 'image/gif'],
      ['webp', 'image/webp'],
    ]) {
      if (ct && !ct.includes(`Extension="${ext}"`)) {
        ct = ct.replace('</Types>', `<Default Extension="${ext}" ContentType="${type}"/></Types>`)
      }
    }
    if (ct) zip.file(ctPath, ct)
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
