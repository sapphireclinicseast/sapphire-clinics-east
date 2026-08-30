import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { FormSchema, Section } from './schemas'

export interface DocMeta {
  patientName: string
  patientDob?: string | null
  therapistName: string
  license?: string | null
  signature?: string | null // data URI PNG (optional)
  generatedOn?: string
}

const A4 = { w: 595.28, h: 841.89 }
const M = 42 // margin
const INK = rgb(0.08, 0.14, 0.23)
const SLATE = rgb(0.33, 0.4, 0.5)
const STEEL = rgb(0.18, 0.42, 0.69)
const LINE = rgb(0.85, 0.88, 0.92)

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = []
  for (const para of String(text ?? '').split('\n')) {
    if (para === '') { out.push(''); continue }
    let line = ''
    for (const word of para.split(/\s+/)) {
      const t = line ? line + ' ' + word : word
      if (font.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = word } else line = t
    }
    if (line) out.push(line)
  }
  return out
}

export async function generateFormPdf(schema: FormSchema, data: Record<string, unknown>, meta: DocMeta): Promise<string> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const contentW = A4.w - M * 2

  let page: PDFPage = pdf.addPage([A4.w, A4.h])
  let y = A4.h - M

  const need = (h: number) => { if (y - h < M + 24) { page = pdf.addPage([A4.w, A4.h]); y = A4.h - M } }
  const text = (s: string, x: number, size: number, f: PDFFont, color = INK) => page.drawText(s, { x, y, size, font: f, color })

  // Header — Nickel wordmark (no logo, no form number)
  text('Nickel', M, 20, bold, STEEL); y -= 22
  text(schema.title, M, 14, bold, INK); y -= 16
  const metaLine = `Patient: ${meta.patientName}${meta.patientDob ? `  ·  DOB: ${meta.patientDob}` : ''}`
  text(metaLine, M, 9.5, font, SLATE); y -= 12
  text(`Therapist: ${meta.therapistName}${meta.license ? `  ·  Lic. No. ${meta.license}` : ''}${meta.generatedOn ? `  ·  ${meta.generatedOn}` : ''}`, M, 9.5, font, SLATE); y -= 10
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 1, color: LINE }); y -= 16

  const drawFieldRow = (label: string, value: string, full: boolean) => {
    const size = 10
    const labelLines = wrap(label + ':', bold, size, full ? contentW : contentW * 0.4)
    const valLines = wrap(value || '—', font, size, full ? contentW : contentW * 0.55)
    if (full) {
      need(14 * labelLines.length)
      for (const l of labelLines) { text(l, M, size, bold); y -= 13 }
      need(13 * valLines.length + 4)
      for (const l of valLines) { text(l, M, size, font, SLATE); y -= 13 }
      y -= 4
    } else {
      const rows = Math.max(labelLines.length, valLines.length)
      need(13 * rows + 2)
      const startY = y
      labelLines.forEach((l, i) => page.drawText(l, { x: M, y: startY - i * 13, size, font: bold, color: INK }))
      valLines.forEach((l, i) => page.drawText(l, { x: M + contentW * 0.42, y: startY - i * 13, size, font, color: SLATE }))
      y = startY - rows * 13 - 2
    }
  }

  const drawTable = (columns: string[], rows: string[][]) => {
    const size = 8.5
    const colW = contentW / columns.length
    need(18)
    // header
    page.drawRectangle({ x: M, y: y - 14, width: contentW, height: 14, color: rgb(0.95, 0.97, 0.99) })
    columns.forEach((c, i) => page.drawText(c, { x: M + i * colW + 3, y: y - 10, size, font: bold, color: INK }))
    y -= 14
    const dataRows = rows.length ? rows : []
    for (const r of dataRows) {
      const cellLines = columns.map((_, i) => wrap(String(r[i] ?? ''), font, size, colW - 6))
      const rowH = Math.max(14, ...cellLines.map((cl) => cl.length * 10 + 4))
      need(rowH)
      const top = y
      columns.forEach((_, i) => cellLines[i].forEach((l, li) => page.drawText(l, { x: M + i * colW + 3, y: top - 10 - li * 10, size, font, color: SLATE })))
      // column separators + bottom border
      page.drawLine({ start: { x: M, y: top - rowH }, end: { x: A4.w - M, y: top - rowH }, thickness: 0.5, color: LINE })
      y = top - rowH
    }
    for (let i = 0; i <= columns.length; i++) page.drawLine({ start: { x: M + i * colW, y }, end: { x: M + i * colW, y: y }, thickness: 0 }) // no-op keeps layout simple
    y -= 8
  }

  const renderSection = (s: Section) => {
    if (s.note) { const lines = wrap(s.note, italic, 8.5, contentW); need(11 * lines.length + 6); for (const l of lines) { text(l, M, 8.5, italic, SLATE); y -= 11 } y -= 4; return }
    if (s.title) { need(18); text(s.title.toUpperCase(), M, 10.5, bold, STEEL); y -= 15 }
    for (const f of s.fields ?? []) drawFieldRow(f.label, String(data[f.key] ?? ''), !!f.full || f.type === 'textarea')
    if (s.table) {
      const raw = data[s.table.key]
      const rows = Array.isArray(raw) ? (raw as unknown[]).map((r) => (Array.isArray(r) ? (r as unknown[]).map((c) => String(c ?? '')) : [])) : []
      drawTable(s.table.columns, rows.filter((r) => r.some((c) => c)))
    }
  }

  for (const s of schema.sections) renderSection(s)

  // Signature block
  need(70)
  y -= 10
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 1, color: LINE }); y -= 16
  text('Prepared by:', M, 9.5, bold, INK); y -= 14
  if (meta.signature && meta.signature.startsWith('data:image')) {
    try {
      const b64 = meta.signature.split(',')[1]
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const img = meta.signature.includes('image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
      const dims = img.scale(60 / img.height)
      page.drawImage(img, { x: M, y: y - dims.height + 8, width: dims.width, height: dims.height }); y -= dims.height
    } catch { /* ignore bad signature */ }
  }
  text(meta.therapistName, M, 10, font, INK); y -= 12
  if (meta.license) { text(`License No. ${meta.license}`, M, 9, font, SLATE); y -= 12 }

  const bytes = await pdf.save()
  const b64 = Buffer.from(bytes).toString('base64')
  return `data:application/pdf;base64,${b64}`
}
