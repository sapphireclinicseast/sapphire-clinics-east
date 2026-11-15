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

// Exports hand amounts over as text ('1250.00', '₱1,250.00'), which Excel shows
// but SUM skips. Text that reads exactly like a two-decimal amount becomes a real
// number. Order, reference and TIN numbers never read that way, so they stay text.
const AMOUNT_TEXT = /^-?₱?\d+(,\d{3})*\.\d{2}$/
const amountOf = (v: unknown) => (typeof v === 'string' && AMOUNT_TEXT.test(v) ? Number(v.replace(/[₱,]/g, '')) : null)

/** A row ready for aoa_to_sheet, with its amounts as real numbers shown as 1,250.00. */
export function amountCells(row: (string | number | null | undefined)[]) {
  return row.map(v => {
    const n = amountOf(v)
    return n === null ? v : { t: 'n' as const, v: n, z: '#,##0.00' }
  })
}

export function downloadXlsx(filename: string, sheets: ExportSheet[]) {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const data = [sheet.headers, ...sheet.rows.map(amountCells)]
    const ws = XLSX.utils.aoa_to_sheet(data)

    // Auto-size columns
    const colWidths = sheet.headers.map((h, i) => {
      let max = h.length
      for (const row of sheet.rows) {
        const v = row[i]
        const n = amountOf(v)
        const len = n !== null ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length : v != null ? String(v).length : 0
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

/* Both PDF exports below open a blank window, write a branded page into it and
   print it. The pieces they share live here. */

const escHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** At this many columns a table prints compact, so every column fits across the page. */
const WIDE_TABLE_COLS = 14

const manilaStamp = () =>
  new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila' })

/** Text for <title> and CSS strings: markup and angle brackets dropped. */
const plainText = (v: unknown) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim()
const cssString = (v: string) => `'${plainText(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\s+/g, ' ')}'`

/** Chrome names the saved PDF after the window title, so the date goes in. */
const printTitle = (title: string) =>
  `${plainText(title)} - ${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}`

/** A cell holding one long unbroken token (a reference, an e-mail) may break inside it rather than push the table off the page. */
const longToken = (v: unknown) => /[^\s\-/]{18,}/.test(String(v ?? ''))

/**
 * Page setup and the fonts shared by every print window.
 *
 * The window is opened on about:blank. With Chrome's "Headers and footers"
 * option on, Chrome would print its own date, the title, "about:blank" and
 * "1/4" in the margins. Chrome (131+) leaves its header out when the page
 * defines a top margin box, and its footer out when the page defines a bottom
 * one. So the page sets an empty top box and its own footer (company, report,
 * page X of Y). The margins themselves stay, so every page keeps its border.
 *
 * Numbers print in Roboto (Hannah's rule for the whole hub). The window shares
 * the hub's origin, so the self-hosted subset loads from /fonts.
 */
function printShellCss(title: string, landscape: boolean): string {
  const origin = window.location.origin
  const face = (weight: number) =>
    `@font-face { font-family: 'Print Roboto'; font-weight: ${weight}; font-style: normal; src: url('${origin}/fonts/roboto-latin-${weight}.woff2') format('woff2'); }`
  const marginFont = `font-family: 'Print Roboto', Roboto, Arial, sans-serif; font-size: 7pt; color: #9ca3af;`
  return `
    ${face(400)} ${face(500)} ${face(700)}
    @page {
      size: A4 ${landscape ? 'landscape' : 'portrait'};
      margin: 12mm 12mm 14mm;
      @top-right { content: ''; }
      @bottom-left { content: ${cssString(`Sapphire Clinics East Incorporated · ${title}`)}; ${marginFont} }
      @bottom-right { content: 'Page ' counter(page) ' of ' counter(pages); ${marginFont} }
    }
    /* The column headers repeat on every page, and a row never splits across two. */
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    td.brk { overflow-wrap: anywhere; }
    /* Wide tables (Detailed GL has 25 columns): smaller type, tighter cells. */
    table.wide { font-size: 7px; }
    table.wide th { font-size: 6.5px; letter-spacing: 0; padding: 4px 3px; }
    table.wide td { padding: 3px 3px; }`
}

/** Prints once the fonts are in, so the PDF never falls back mid-print. */
const PRINT_SCRIPT = `<script>window.onload = function () { (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { window.print() }) }</script>`

const FONT_STACK = `'Print Roboto', Roboto, 'Segoe UI', Arial, sans-serif`

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

  // The print window is opened on about:blank, so a stored relative path like
  // "/api/files/photo.jpg" has no origin to resolve against and the image
  // silently fails. Make every src absolute against the app's own origin.
  const absoluteUrl = (u: string) => /^(https?:)?\/\/|^data:/.test(u) ? u : `${window.location.origin}${u.startsWith('/') ? '' : '/'}${u}`

  const headerRow = `${withPhotos ? `<th>${imageHeader}</th>` : ''}${headers.map(h => `<th>${h}</th>`).join('')}`
  const bodyRows = rows.map((row, ri) => {
    const src = images?.[ri] ? absoluteUrl(images[ri]!) : ''
    const photoCell = withPhotos
      ? `<td style="text-align:center;">${src ? `<img src="${src}" crossOrigin="anonymous" onerror="this.style.display='none'" style="height:34px;max-width:46px;object-fit:cover;border-radius:4px;" />` : ''}</td>`
      : ''
    return `<tr>${photoCell}${row.map((cell, i) => {
      const val = cell ?? ''
      // Right-align numeric columns (check if header contains amount/price/cost/qty/balance/rate)
      const hdr = headers[i]?.toLowerCase() || ''
      const isNumeric = /amount|price|cost|qty|quantity|balance|rate|total|fee|debit|credit|sessions|level|points/.test(hdr)
      return `<td${longToken(val) ? ' class="brk"' : ''} style="${isNumeric ? 'text-align:right;' : ''}">${val}</td>`
    }).join('')}</tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${escHtml(printTitle(title))}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${FONT_STACK}; font-size: 10px; color: #1a1a1a; padding: 20px; }
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
    ${printShellCss(title, landscape)}
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
  <div class="timestamp">Generated: ${manilaStamp()}</div>

  <table${headers.length + (withPhotos ? 1 : 0) >= WIDE_TABLE_COLS ? ' class="wide"' : ''}>
    ${colgroup}
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>

  <div class="footer">
    <span>Sapphire Clinics East — Accounting Hub</span>
    <span>Total rows: ${rows.length}</span>
  </div>

  ${PRINT_SCRIPT}
</body>
</html>`

  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

// ── Multi-section report PDF ────────────────────────────────

/**
 * A dashboard doesn't fit downloadPdf, which renders exactly one table. This
 * prints several tables — plus an optional headline figures strip — inside the
 * same branded shell, so a summary screen exports as one clean document
 * instead of one file per table.
 */
export interface ReportSection {
  heading: string
  note?: string
  headers: string[]
  rows: (string | number | null | undefined)[][]
  /** Renders bold with a tinted background — use for a TOTAL line. */
  totalRow?: (string | number | null | undefined)[]
}

export interface ReportPdfConfig {
  title: string
  subtitle?: string
  /** Headline figures shown as cards above the tables. */
  kpis?: { label: string; value: string }[]
  sections: ReportSection[]
  landscape?: boolean
}

export function downloadReportPdf(config: ReportPdfConfig) {
  const { title, subtitle, kpis = [], sections, landscape = false } = config

  // Same right-align rule as downloadPdf, so a column reads the same in both.
  const isNumericHeader = (h: string) =>
    /amount|price|cost|qty|quantity|balance|rate|total|fee|debit|credit|days|paid|approved|consumed|outstanding|commission|%/.test(h.toLowerCase())

  const renderRow = (row: (string | number | null | undefined)[], headers: string[], bold = false) =>
    `<tr${bold ? ' class="total"' : ''}>${row.map((cell, i) =>
      `<td${longToken(cell) ? ' class="brk"' : ''} style="${isNumericHeader(headers[i] || '') ? 'text-align:right;' : ''}">${escHtml(cell)}</td>`
    ).join('')}</tr>`

  // A short table stays in one piece (it moves to the next page whole when it
  // won't fit). A long one starts right where it is and runs on across pages:
  // keeping it whole used to push it past a page, leaving page 1 holding only
  // the title (Detailed GL, 2026-11-15).
  const KEEP_WHOLE_ROWS = 15

  const sectionHtml = sections.map(s => `
    <div class="section${s.rows.length + (s.totalRow ? 1 : 0) <= KEEP_WHOLE_ROWS ? ' keep' : ''}">
      <div class="section-heading">${escHtml(s.heading)}</div>
      ${s.note ? `<div class="section-note">${escHtml(s.note)}</div>` : ''}
      ${s.rows.length === 0
        ? '<div class="empty">Nothing to show for the current filters.</div>'
        : `<table${s.headers.length >= WIDE_TABLE_COLS ? ' class="wide"' : ''}>
             <thead><tr>${s.headers.map(h => `<th style="${isNumericHeader(h) ? 'text-align:right;' : ''}">${escHtml(h)}</th>`).join('')}</tr></thead>
             <tbody>
               ${s.rows.map(r => renderRow(r, s.headers)).join('')}
               ${s.totalRow ? renderRow(s.totalRow, s.headers, true) : ''}
             </tbody>
           </table>`}
    </div>`).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${escHtml(printTitle(title))}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${FONT_STACK}; font-size: 10px; color: #1a1a1a; padding: 20px; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; border-bottom: 2px solid #0d9488; padding-bottom: 10px; }
    .header img { height: 44px; }
    .header-text h1 { font-size: 10px; font-weight: 600; color: #374151; letter-spacing: 0.5px; }
    .header-text p { font-size: 8px; color: #6b7280; }
    .report-title { font-size: 16px; font-weight: 700; margin: 14px 0 2px 0; }
    .report-subtitle { font-size: 10px; color: #6b7280; }
    .timestamp { font-size: 8px; color: #9ca3af; margin: 4px 0 12px; }
    .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .kpi { flex: 1 1 140px; border: 1px solid #e5e7eb; border-left: 3px solid #0d9488; border-radius: 6px; padding: 8px 10px; }
    .kpi .k-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.4px; color: #6b7280; }
    .kpi .k-value { font-size: 13px; font-weight: 700; color: #0f766e; margin-top: 2px; }
    .section { margin-bottom: 18px; }
    .section.keep { break-inside: avoid; page-break-inside: avoid; }
    /* A heading or note never sits alone at the foot of a page. */
    .section-heading, .section-note { break-after: avoid; page-break-after: avoid; }
    .section-heading { font-size: 11px; font-weight: 700; color: #0f766e; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin-bottom: 6px; }
    .section-note { font-size: 8px; color: #6b7280; margin-bottom: 5px; }
    .empty { font-size: 9px; color: #9ca3af; padding: 6px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    th { background: #0d9488; color: white; padding: 5px 8px; text-align: left; font-weight: 600; font-size: 8px; text-transform: uppercase; letter-spacing: 0.3px; }
    td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }
    tr.total td { background: #f0fdfa; font-weight: 700; border-top: 1.5px solid #0d9488; }
    .footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 8px; color: #9ca3af; display: flex; justify-content: space-between; }
    @media print { body { padding: 0; } }
    ${printShellCss(title, landscape)}
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

  <div class="report-title">${escHtml(title)}</div>
  ${subtitle ? `<div class="report-subtitle">${escHtml(subtitle)}</div>` : ''}
  <div class="timestamp">Generated: ${manilaStamp()}</div>

  ${kpis.length ? `<div class="kpis">${kpis.map(k => `
    <div class="kpi"><div class="k-label">${escHtml(k.label)}</div><div class="k-value">${escHtml(k.value)}</div></div>`).join('')}</div>` : ''}

  ${sectionHtml}

  <div class="footer">
    <span>Sapphire Clinics East — Accounting Hub</span>
    <span>${sections.length} section${sections.length === 1 ? '' : 's'}</span>
  </div>

  ${PRINT_SCRIPT}
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
