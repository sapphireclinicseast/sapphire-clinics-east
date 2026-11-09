// Read a filled One-time bulk-upload template (or any sheet with the same
// headers): find the header row, map columns by header text, skip blank rows.
// Computed (auto) columns are never read.

import { COLUMNS, type ColKey, type RawCell, type RawRow } from '@/lib/expenses/onetime-bulk'
import { TEMPLATE_SHEET } from '@/lib/expenses/onetime-template-name'

const key = (h: unknown) => String(h ?? '').toLowerCase().replace(/\(auto\)/g, '').replace(/[^a-z0-9]/g, '')
const HEADER_TO_COL = new Map(COLUMNS.map(c => [key(c.header), c.key] as [string, ColKey]))

export async function parseOneTimeWorkbook(data: ArrayBuffer | Uint8Array): Promise<{ row: number; cells: RawRow }[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data, { type: 'array' })
  const ws = wb.Sheets[TEMPLATE_SHEET] || wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('The file has no sheets')
  const aoa = XLSX.utils.sheet_to_json<RawCell[]>(ws, { header: 1, raw: true, defval: '' })
  const start = XLSX.utils.decode_range(ws['!ref'] || 'A1').s.r
  const hIdx = aoa.slice(0, 10).findIndex(r => r.some(c => key(c) === 'payee') && r.some(c => key(c) === 'grossamount'))
  if (hIdx < 0) throw new Error('Could not find the header row (Payee … Gross Amount). Use the downloaded template.')
  const map = aoa[hIdx].map(h => HEADER_TO_COL.get(key(h)))
  const out: { row: number; cells: RawRow }[] = []
  aoa.slice(hIdx + 1).forEach((r, i) => {
    const cells: RawRow = {}
    map.forEach((k, ci) => { if (k && !COLUMNS.find(c => c.key === k)?.computed) cells[k] = r[ci] })
    if (Object.values(cells).some(v => String(v ?? '').trim() !== '')) out.push({ row: start + hIdx + i + 2, cells })
  })
  return out
}
