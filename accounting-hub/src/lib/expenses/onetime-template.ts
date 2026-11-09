// The One-time expense bulk-upload template (.xlsx), built by hand so its cells
// carry real Excel dropdowns (the xlsx package can't write data validation).
// Sheets: "One-Time Expenses" (fill in), "Instructions", and a hidden "Lists"
// that feeds the dropdowns, including the chart of accounts.

import JSZip from 'jszip'
import {
  COLUMNS, colLetter, DEPT_OPTIONS, VALIDITY_OPTIONS, VATABLE_OPTIONS, YES_NO, EWT_RATES, MAX_ROWS, PART_VAT,
  numberTitle, type Account, type ColKey,
} from '@/lib/expenses/onetime-bulk'

import { TEMPLATE_SHEET } from '@/lib/expenses/onetime-template-name'
export { TEMPLATE_SHEET }

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ref = (col: number, row: number) => {
  let s = '', n = col + 1
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return `${s}${row}`
}
const strCell = (c: number, r: number, v: string, style = 0) => `<c r="${ref(c, r)}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`
const numCell = (c: number, r: number, v: number, style = 0) => `<c r="${ref(c, r)}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`
const fCell = (c: number, r: number, f: string, style = 0) => `<c r="${ref(c, r)}"${style ? ` s="${style}"` : ''}><f>${esc(f)}</f></c>`

// Styles (cellXfs index): 1 header, 2 date, 3 amount, 4 computed, 5 text, 6 wrap,
// 7 title, 8 bold, 9 example input (blue), 10 example amount (blue), 11 example date (blue).
const S = { header: 1, date: 2, amount: 3, computed: 4, text: 5, wrap: 6, title: 7, bold: 8, exText: 9, exAmount: 10, exDate: 11 }
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/><numFmt numFmtId="165" formatCode="#,##0.00;(#,##0.00);\\-"/></numFmts>
<fonts count="6">
<font><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
<font><i/><sz val="10"/><color rgb="FF595959"/><name val="Arial"/></font>
<font><b/><sz val="13"/><name val="Arial"/></font>
<font><b/><sz val="10"/><name val="Arial"/></font>
<font><sz val="10"/><color rgb="FF0000FF"/><name val="Arial"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2F6F66"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="2" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="49" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

const L = (k: ColKey) => colLetter(k)
/** Live formulas for the computed columns of row r (mirror lib/vat and the grid's EWT). */
export function formulasFor(r: number): Partial<Record<ColKey, string>> {
  const [E, F, G, Lg, M, P, Q] = [L('validity'), L('vatable'), L('vatPortion'), L('grossAmount'), L('netOfVat'), L('hasEwt'), L('ewtRate')]
  const part = `MIN(N(${G}${r}),${Lg}${r})`
  return {
    netOfVat: `IF(${Lg}${r}="","",IF(${E}${r}<>"Valid",${Lg}${r},IF(${F}${r}="VAT",${Lg}${r}/1.12,IF(${F}${r}="${PART_VAT}",${Lg}${r}-${part}+${part}/1.12,${Lg}${r}))))`,
    vatAmount: `IF(${Lg}${r}="","",${Lg}${r}-${M}${r})`,
    ewtAmount: `IF(OR(${Lg}${r}="",${P}${r}<>"Yes"),"",${M}${r}*IF(${Q}${r}="",5,IF(${Q}${r}<1,${Q}${r}*100,${Q}${r}))/100)`,
  }
}

const colStyle = (k: ColKey, computed?: boolean) =>
  computed ? S.computed : k === 'date' ? S.date : (k === 'grossAmount' || k === 'vatPortion') ? S.amount : (k === 'siNumber' || k === 'tinNumber') ? S.text : 0

function dataSheet(): string {
  const last = MAX_ROWS + 1
  const cols = COLUMNS.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"${colStyle(c.key, c.computed) ? ` style="${colStyle(c.key, c.computed)}"` : ''}/>`).join('')
  const head = `<row r="1" ht="30" customHeight="1">${COLUMNS.map((c, i) => strCell(i, 1, c.computed ? `${c.header} (auto)` : c.header, S.header)).join('')}</row>`
  const rows: string[] = [head]
  for (let r = 2; r <= last; r++) {
    const f = formulasFor(r)
    rows.push(`<row r="${r}">${COLUMNS.map((c, i) => (c.computed ? fCell(i, r, f[c.key]!, S.computed) : '')).join('')}</row>`)
  }
  const rng = (k: ColKey) => `${L(k)}2:${L(k)}${last}`
  const prompt = (k: ColKey, title: string) => {
    const p = COLUMNS.find(c => c.key === k)?.prompt
    return p ? ` showInputMessage="1" promptTitle="${esc(title.slice(0, 32))}" prompt="${esc(p.slice(0, 250))}"` : ''
  }
  const list = (k: ColKey, name: string, title: string, style: 'stop' | 'warning' = 'stop', err = 'Pick a value from the dropdown.') =>
    `<dataValidation type="list" errorStyle="${style}" allowBlank="1" showErrorMessage="1" errorTitle="${esc(title.slice(0, 32))}" error="${esc(err)}"${prompt(k, title)} sqref="${rng(k)}"><formula1>${name}</formula1></dataValidation>`
  const dv = [
    list('departments', 'DeptList', 'Department', 'warning', 'Not in the list. Several departments can be typed separated by commas (e.g. PT, OT) — click Yes to keep it.'),
    `<dataValidation type="date" operator="greaterThan" allowBlank="1" showErrorMessage="1" errorTitle="Date" error="Enter a date, e.g. 2026-11-09."${prompt('date', 'Date')} sqref="${rng('date')}"><formula1>36526</formula1></dataValidation>`,
    list('validity', 'ValidityList', 'Valid/Invalid'),
    list('vatable', 'VatableList', 'Vatable'),
    `<dataValidation type="decimal" operator="greaterThanOrEqual" allowBlank="1" showErrorMessage="1" errorTitle="VAT part" error="Enter the VAT-inclusive amount (a number)."${prompt('vatPortion', 'VAT part (VAT + Non-VAT only)')} sqref="${rng('vatPortion')}"><formula1>0</formula1></dataValidation>`,
    `<dataValidation type="textLength" operator="lessThanOrEqual" allowBlank="1" showErrorMessage="1" errorTitle="TIN" error="TIN is up to 17 characters: XXX-XXX-XXX-XXXXX."${prompt('tinNumber', 'TIN')} sqref="${rng('tinNumber')}"><formula1>17</formula1></dataValidation>`,
    `<dataValidation type="decimal" operator="notEqual" allowBlank="1" showErrorMessage="1" errorTitle="Gross Amount" error="Enter the amount (a number)." sqref="${rng('grossAmount')}"><formula1>0</formula1></dataValidation>`,
    list('accountTitle', 'AccountTitles', 'Account Title', 'stop', 'Pick an account from the chart of accounts dropdown.'),
    list('hasEwt', 'YesNoList', 'Has EWT?'),
    list('ewtRate', 'EwtRateList', 'EWT %'),
  ]
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="13.5"/>
<cols>${cols}</cols>
<sheetData>${rows.join('')}</sheetData>
<dataValidations count="${dv.length}">${dv.join('')}</dataValidations>
<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`
}

function instructionsSheet(branchLabel: string, example: Account | null): string {
  const lines: [string, number][] = [
    [`One-time expenses — bulk upload template${branchLabel ? ` (${branchLabel})` : ''}`, S.title],
    ['', 0],
    ['How to fill it in', S.bold],
    [`1. Type one expense per row on the "${TEMPLATE_SHEET}" sheet. Keep the header row as it is.`, S.wrap],
    ['2. Required on every row: Date, Gross Amount, and a Payee or a Description.', S.wrap],
    ['3. These cells have a dropdown: Department, Valid/Invalid, Vatable, Has EWT?, EWT % and Account Title (the chart of accounts).', S.wrap],
    [`4. Part VAT and part non-VAT on one receipt: choose "${PART_VAT}" in Vatable and type the VAT-inclusive part in "VAT part (₱)". Net of VAT and the VAT Amount are computed from that part only; the rest of the gross is non-VAT.`, S.wrap],
    ['5. Vatable, SI Number and TIN apply only to Valid entries.', S.wrap],
    ['6. Grey columns (auto) compute themselves — no need to type in them; they are ignored on upload.', S.wrap],
    ['7. Upload it in Expenses → One-time expense → Bulk upload. The entries get the next PCV numbers of the branch selected on screen.', S.wrap],
    ['', 0],
    ['Proof of expense', S.bold],
    ['Proof cannot be uploaded with the spreadsheet. After the upload, attach the proof to each entry in the One-time grid — entries without proof are flagged "No proof" until it is attached.', S.wrap],
    ['', 0],
    ['Example row (for reference only — do not copy it to the upload sheet)', S.bold],
  ]
  const rows = lines.map(([t, st], i) => `<row r="${i + 1}">${t ? strCell(0, i + 1, t, st) : ''}</row>`)
  const hr = lines.length + 1, er = hr + 1
  rows.push(`<row r="${hr}" ht="30" customHeight="1">${COLUMNS.map((c, i) => strCell(i, hr, c.computed ? `${c.header} (auto)` : c.header, S.header)).join('')}</row>`)
  const ex: Partial<Record<ColKey, string | number>> = {
    requestor: 'ABC ADS AGENCY', departments: 'All', date: 46335, description: 'Facebook ads, Oct 2026 (one invoice, part VAT)',
    validity: 'Valid', vatable: PART_VAT, vatPortion: 8000, siNumber: '0012345', tinNumber: '123-456-789-00000',
    registeredName: 'ABC ADS AGENCY INC.', registeredAddress: 'PASIG CITY', grossAmount: 10000,
    accountTitle: example ? numberTitle(example) : '', hasEwt: 'No',
  }
  const f = formulasFor(er)
  const cells = COLUMNS.map((c, i) => {
    if (c.computed) return fCell(i, er, f[c.key]!, S.computed)
    const v = ex[c.key]
    if (v === undefined || v === '') return ''
    if (c.key === 'date') return numCell(i, er, v as number, S.exDate)
    return typeof v === 'number' ? numCell(i, er, v, S.exAmount) : strCell(i, er, v, S.exText)
  }).join('')
  rows.push(`<row r="${er}">${cells}</row>`)
  rows.push(`<row r="${er + 2}">${strCell(0, er + 2, 'Here the gross is ₱10,000 and ₱8,000 of it carries VAT, so Net of VAT = 2,000 + 8,000 ÷ 1.12 = ₱9,142.86 and VAT = ₱857.14. Blue = typed, grey = computed.', S.wrap)}</row>`)
  const cols = `<col min="1" max="1" width="110" customWidth="1"/>${COLUMNS.slice(1).map((c, i) => `<col min="${i + 2}" max="${i + 2}" width="${c.width}" customWidth="1"/>`).join('')}`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="13.5"/><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`
}

function listsSheet(lists: (string | number)[][]): string {
  const height = Math.max(...lists.map(l => l.length))
  const rows: string[] = []
  for (let r = 0; r < height; r++) {
    rows.push(`<row r="${r + 1}">${lists.map((l, c) => (r < l.length ? (typeof l[r] === 'number' ? numCell(c, r + 1, l[r] as number) : strCell(c, r + 1, String(l[r]), r === 0 ? S.bold : 0)) : '')).join('')}</row>`)
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="48" customWidth="1"/><col min="2" max="6" width="16" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData></worksheet>`
}

/** Build the template. `accounts` = the chart of accounts the grid's Account Title picker offers. */
export function buildOneTimeTemplate(opts: { accounts: Account[]; branchLabel?: string }): JSZip {
  const accounts = [...opts.accounts].sort((a, b) => a.accountNumber.localeCompare(b.accountNumber, undefined, { numeric: true }))
  const titles = accounts.map(numberTitle)
  const lists: (string | number)[][] = [
    ['Account Title', ...(titles.length ? titles : ['(no accounts)'])],
    ['Department', ...DEPT_OPTIONS],
    ['Valid/Invalid', ...VALIDITY_OPTIONS],
    ['Vatable', ...VATABLE_OPTIONS],
    ['Has EWT?', ...YES_NO],
    ['EWT %', ...EWT_RATES],
  ]
  const name = (col: number, len: number) => `Lists!$${String.fromCharCode(65 + col)}$2:$${String.fromCharCode(65 + col)}$${len}`
  const defined = [
    ['AccountTitles', name(0, lists[0].length)], ['DeptList', name(1, lists[1].length)], ['ValidityList', name(2, lists[2].length)],
    ['VatableList', name(3, lists[3].length)], ['YesNoList', name(4, lists[4].length)], ['EwtRateList', name(5, lists[5].length)],
  ]
  const example = accounts.find(a => /advert|marketing/i.test(a.accountTitle)) || accounts.find(a => /^[5-9]/.test(a.accountNumber)) || accounts[0] || null

  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="${TEMPLATE_SHEET}" sheetId="1" r:id="rId1"/><sheet name="Instructions" sheetId="2" r:id="rId2"/><sheet name="Lists" sheetId="3" state="hidden" r:id="rId3"/></sheets><definedNames>${defined.map(([n, v]) => `<definedName name="${n}">${v}</definedName>`).join('')}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)
  zip.file('xl/styles.xml', STYLES)
  zip.file('xl/worksheets/sheet1.xml', dataSheet())
  zip.file('xl/worksheets/sheet2.xml', instructionsSheet(opts.branchLabel || '', example))
  zip.file('xl/worksheets/sheet3.xml', listsSheet(lists))
  return zip
}
