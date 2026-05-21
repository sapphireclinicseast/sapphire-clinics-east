// Export helpers for the enrollment register — used by both the front
// desk's spreadsheet and the public /admission view.
//
// PDF is built with jsPDF in landscape A3 so wide tables don't get clipped.
// XLSX uses the `xlsx` lib, dynamically imported so the ~700KB sheet
// runtime only loads when the user actually clicks Export.

import { jsPDF } from 'jspdf'

export interface ExportCol<T> {
  header: string
  /** Stringifier for a single row's cell. */
  value: (row: T) => string
  /** Approximate width hint (in PDF mm). Falls back to auto. */
  width?: number
}

function ts(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

export async function exportToXlsx<T>(rows: T[], cols: ExportCol<T>[], filename: string, sheetName = 'Sheet1') {
  // Dynamic import keeps the 700KB+ xlsx runtime out of the initial bundle.
  const XLSX = await import('xlsx')
  const data: Array<Record<string, string>> = rows.map(r => {
    const obj: Record<string, string> = {}
    for (const c of cols) obj[c.header] = c.value(r)
    return obj
  })
  const ws = XLSX.utils.json_to_sheet(data, { header: cols.map(c => c.header) })
  // Set column widths so the partner school doesn't have to widen each one.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(ws as any)['!cols'] = cols.map(c => ({ wch: Math.max(10, Math.min(60, Math.round((c.width ?? 80) / 6))) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  download(blob, filename.endsWith('.xlsx') ? filename : `${filename}-${ts()}.xlsx`)
}

export function exportToPdf<T>(rows: T[], cols: ExportCol<T>[], filename: string, title: string) {
  // A3 landscape (420mm x 297mm) so wide tables fit on one page width.
  const doc = new jsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' })
  const PAGE_W = 420
  const PAGE_H = 297
  const MARGIN = 12

  // ── Title bar ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.setTextColor(30, 30, 30)
  doc.text(title, MARGIN, MARGIN + 2)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  doc.setTextColor(110, 110, 110)
  doc.text(`Generated ${new Date().toLocaleString()}`, MARGIN, MARGIN + 7)

  // ── Width distribution ────────────────────────────────────────
  const usableW = PAGE_W - MARGIN * 2
  const totalHint = cols.reduce((s, c) => s + (c.width ?? 100), 0)
  const colWidths = cols.map(c => Math.max(20, ((c.width ?? 100) / totalHint) * usableW))

  // ── Header row ────────────────────────────────────────────────
  let y = MARGIN + 14
  const ROW_H = 7
  const HEADER_H = 7
  doc.setFillColor(245, 240, 232) // paper-2
  doc.rect(MARGIN, y - 5, usableW, HEADER_H, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
  doc.setTextColor(60, 60, 60)
  let x = MARGIN
  for (let i = 0; i < cols.length; i++) {
    const text = doc.splitTextToSize(cols[i].header, colWidths[i] - 1.5) as string[]
    doc.text(text[0] ?? '', x + 1, y - 0.5)
    x += colWidths[i]
  }
  y += HEADER_H - 3

  // ── Rows ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  doc.setTextColor(20, 20, 20)
  for (const row of rows) {
    if (y > PAGE_H - MARGIN - 4) {
      doc.addPage()
      y = MARGIN + 14
      // Re-render the header on each new page.
      doc.setFillColor(245, 240, 232)
      doc.rect(MARGIN, y - 5, usableW, HEADER_H, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
      doc.setTextColor(60, 60, 60)
      x = MARGIN
      for (let i = 0; i < cols.length; i++) {
        const text = doc.splitTextToSize(cols[i].header, colWidths[i] - 1.5) as string[]
        doc.text(text[0] ?? '', x + 1, y - 0.5)
        x += colWidths[i]
      }
      y += HEADER_H - 3
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      doc.setTextColor(20, 20, 20)
    }
    x = MARGIN
    // Light row separator at the top of the row.
    doc.setDrawColor(225, 220, 210)
    doc.setLineWidth(0.1)
    doc.line(MARGIN, y - 3, MARGIN + usableW, y - 3)
    for (let i = 0; i < cols.length; i++) {
      const raw = cols[i].value(row) || ''
      const lines = doc.splitTextToSize(raw, colWidths[i] - 1.5) as string[]
      doc.text(lines.slice(0, 2).join(' '), x + 1, y)
      x += colWidths[i]
    }
    y += ROW_H
  }

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}-${ts()}.pdf`)
}
