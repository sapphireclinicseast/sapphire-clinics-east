'use client'
import * as XLSX from 'xlsx'

/* ═══════════════════════════════════════════════════════════
   EXPORT UTILITIES — xlsx + PDF download for all modules
   ═══════════════════════════════════════════════════════════ */

// ── XLSX Export ──────────────────────────────────────────────

interface ExportSheet {
  name: string
  headers: string[]
  rows: (string | number | null | undefined)[][]
}

export function downloadXlsx(filename: string, sheets: ExportSheet[]) {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const data = [sheet.headers, ...sheet.rows]
    const ws = XLSX.utils.aoa_to_sheet(data)

    // Auto-size columns
    const colWidths = sheet.headers.map((h, i) => {
      let max = h.length
      for (const row of sheet.rows) {
        const v = row[i]
        const len = v != null ? String(v).length : 0
        if (len > max) max = len
      }
      return { wch: Math.min(max + 2, 50) }
    })
    ws['!cols'] = colWidths

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31))
  }
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ── PDF Export (HTML → Print) ───────────────────────────────

interface PdfTableConfig {
  title: string
  subtitle?: string
  headers: string[]
  rows: (string | number | null | undefined)[][]
  landscape?: boolean
  columnWidths?: string[] // e.g. ['60px', 'auto', '100px']
  images?: (string | null | undefined)[] // optional photo per row (aligned to rows); prepends a photo column
  imageHeader?: string    // header label for the photo column (default 'Photo')
}

export function downloadPdf(config: PdfTableConfig) {
  const { title, subtitle, headers, rows, landscape = false, columnWidths, images, imageHeader = 'Photo' } = config
  const withPhotos = Array.isArray(images)

  const colgroup = columnWidths
    ? `<colgroup>${withPhotos ? '<col style="width:54px">' : ''}${columnWidths.map(w => `<col style="width:${w}">`).join('')}</colgroup>`
    : ''

  const headerRow = `${withPhotos ? `<th>${imageHeader}</th>` : ''}${headers.map(h => `<th>${h}</th>`).join('')}`
  const bodyRows = rows.map((row, ri) => {
    const photoCell = withPhotos
      ? `<td style="text-align:center;">${images![ri] ? `<img src="${images![ri]}" crossOrigin="anonymous" onerror="this.style.display='none'" style="height:34px;max-width:46px;object-fit:cover;border-radius:4px;" />` : ''}</td>`
      : ''
    return `<tr>${photoCell}${row.map((cell, i) => {
      const val = cell ?? ''
      // Right-align numeric columns (check if header contains amount/price/cost/qty/balance/rate)
      const hdr = headers[i]?.toLowerCase() || ''
      const isNumeric = /amount|price|cost|qty|quantity|balance|rate|total|fee|debit|credit|sessions|level|points/.test(hdr)
      return `<td style="${isNumeric ? 'text-align:right;' : ''}">${val}</td>`
    }).join('')}</tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #1a1a1a; padding: 20px; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; border-bottom: 2px solid #0d9488; padding-bottom: 10px; }
    .header img { height: 44px; }
    .header-text h1 { font-size: 10px; font-weight: 600; color: #374151; letter-spacing: 0.5px; }
    .header-text p { font-size: 8px; color: #6b7280; }
    .report-title { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 14px 0 2px 0; }
    .report-subtitle { font-size: 10px; color: #6b7280; margin-bottom: 12px; }
    .timestamp { font-size: 8px; color: #9ca3af; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    th { background: #0d9488; color: white; padding: 6px 8px; text-align: left; font-weight: 600; font-size: 8px; text-transform: uppercase; letter-spacing: 0.3px; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }
    tr:hover td { background: #f0fdfa; }
    .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 8px; color: #9ca3af; display: flex; justify-content: space-between; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://accounting.sapphireclinicseast.org/sandbox-logo.png" alt="Logo" crossOrigin="anonymous"
      onerror="this.style.display='none'" />
    <div class="header-text">
      <h1>SAPPHIRE CLINICS EAST INCORPORATED</h1>
      <p>Multi-Specialty Clinic and Rehabilitation Center</p>
    </div>
  </div>

  <div class="report-title">${title}</div>
  ${subtitle ? `<div class="report-subtitle">${subtitle}</div>` : ''}
  <div class="timestamp">Generated: ${new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila' })}</div>

  <table>
    ${colgroup}
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>

  <div class="footer">
    <span>Sapphire Clinics East — Accounting Hub</span>
    <span>Total rows: ${rows.length}</span>
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`

  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

// ── Combined download button component helper ───────────────

export type ExportFormat = 'xlsx' | 'pdf'

// Inclusive [from, to] filter on a YYYY-MM-DD-ish date value. Blank bound = open.
export function inDateRange(dateVal: string | Date | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true
  if (!dateVal) return false
  const d = String(typeof dateVal === 'string' ? dateVal : dateVal.toISOString()).slice(0, 10)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}
