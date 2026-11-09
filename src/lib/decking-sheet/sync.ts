// Keeping a branch's decking Google Sheets and the Operations Hub in step.
//
// Front desk work in the spreadsheet. The hub is the record. Neither is allowed
// to silently overwrite the other, which is the whole difficulty: a copy in
// each direction is easy and loses data the first week.
//
// ── The rule ────────────────────────────────────────────────────────────────
// Every push writes down what it put in each cell. The next pull therefore has
// three values for every cell, not two:
//
//   sheet  — what the cell says now
//   snap   — what the last sync put there
//   hub    — what the database says now
//
//   sheet == snap          → front desk did not touch it. The hub wins.
//   hub == snap            → only the sheet changed. Apply it to the hub.
//   both differ from snap  → BOTH changed. Neither is applied; it is reported.
//
// Without the snapshot, "the sheet says X and the hub says Y" cannot tell a
// new booking from a stale cell, and a last-write-wins sync quietly deletes
// whichever one it saw second. In PT, MD and psychology — the departments that
// turn over constantly — that would be a lost booking most weeks.
//
// The snapshot lives on a hidden tab rather than in the database, so a sheet
// carries its own sync state and nothing has to be migrated to add a branch.

import { prisma } from '@/lib/prisma'
import { sheetsClient } from '@/lib/google-sheets-auth'
import { recordDeckingSnapshot } from '@/lib/decking-snapshot'
import {
  payLabel,
  buildGrid, nameFor, remarkFor, hhmm, parsePay, SAFE_COL, FREE_TEXT_HINT, BLOCKED, BREAK, INK,
  type SheetSlot, type SheetStaff, type Grid, type CellRef,
} from './grid'
import type { sheets_v4 } from 'googleapis'

export const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY'] as const
const MAP_TAB = '_map'
// The hub's own cap, mirrored here so the sheet cannot write a cell the board
// would refuse to draw.
const MAX_PER_CELL = 3
const PATIENTS_TAB = '_patients'

export interface SyncReport {
  branch: string
  pushed: { tab: string; staff: number; rows: number }[]
  applied: { tab: string; cell: string; what: string }[]
  conflicts: { tab: string; cell: string; sheet: string; hub: string }[]
  unknownPatients: string[]
  errors: string[]
}

// ── loading what the hub knows ──────────────────────────────────────────────

async function loadDepartment(branch: string, department: string) {
  const [configs, slots] = await Promise.all([
    prisma.deckingTherapistConfig.findMany({
      where: { branch, department, deliveryMode: null, staff: { active: true } },
      select: {
        staffId: true, workDays: true, startTime: true, endTime: true,
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { staff: { lastName: 'asc' } },
    }),
    prisma.deckingSlot.findMany({
      // BOTH kinds. They are separated below: the weekly pattern draws the
      // grid, and the one-offs get their own dated blocks underneath it. A
      // one-off left out of the sheet entirely — which is what happened before
      // this — exists in the hub and nowhere front desk can see it.
      where: { branch, department, isClass: false },
      select: {
        id: true, staffId: true, dayOfWeek: true, startTime: true, disabled: true,
        paymentType: true, hmoProvider: true, notes: true, patientId: true, date: true,
        patient: { select: { firstName: true, lastName: true } },
        patientBookings: { where: { paidAt: { not: null } }, select: { downpayment: true }, take: 1 },
      },
    }),
  ])

  const staff: SheetStaff[] = configs.map(c => ({
    id: c.staffId,
    firstName: c.staff.firstName,
    lastName: c.staff.lastName,
    workDays: (c.workDays as string[]) ?? [],
    startTime: c.startTime,
    endTime: c.endTime,
  }))

  const sheetSlots: SheetSlot[] = slots.map(s => ({
    staffId: s.staffId,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    disabled: s.disabled,
    paymentType: s.paymentType,
    hmoProvider: s.hmoProvider,
    notes: s.notes,
    patient: s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : null,
    patientId: s.patientId,
    dp: s.patientBookings[0]?.downpayment ? Number(s.patientBookings[0].downpayment) : null,
    // Carried, not dropped. Without this every slot looks weekly, `dated` is
    // always empty, and a one-off can never reach the sheet however carefully
    // the blocks below are drawn.
    date: s.date ? s.date.toISOString().slice(0, 10) : null,
  }))

  return {
    staff,
    slots: sheetSlots.filter(x => !x.date),
    dated: sheetSlots.filter(x => !!x.date),
    raw: slots,
  }
}

// Two different spellings of the same branch live in this database: decking,
// staff and schedules use SBEA/SBGH, while a patient's branch is the Branch
// enum, SANDBOX_EAST/SANDBOX_GREENHILLS. Querying patients with the decking
// code matches nothing at all — which is exactly how the patient dropdown came
// out holding only N/A and BREAK.
const PATIENT_BRANCH: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
}

/** Every patient the branch can book, for the dropdown. */
async function loadPatientNames(branch: string): Promise<string[]> {
  const patientBranch = PATIENT_BRANCH[branch] ?? branch
  const rows = await prisma.$queryRawUnsafe<{ n: string }[]>(
    `SELECT DISTINCT upper("lastName" || ', ' || "firstName") AS n
       FROM "Patient"
      WHERE $1 = ANY("branches"::text[]) OR branch::text = $1
      ORDER BY 1`,
    patientBranch,
  )
  return rows.map(r => r.n).filter(Boolean)
}

// ── pushing ─────────────────────────────────────────────────────────────────

const rgb = (hex: string) => ({
  red: parseInt(hex.slice(1, 3), 16) / 255,
  green: parseInt(hex.slice(3, 5), 16) / 255,
  blue: parseInt(hex.slice(5, 7), 16) / 255,
})

async function tabId(api: sheets_v4.Sheets, spreadsheetId: string, title: string, cols: number, rows: number, hidden = false) {
  const meta = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
  const found = meta.data.sheets?.find(s => s.properties?.title === title)
  if (found?.properties?.sheetId != null) {
    return { id: found.properties.sheetId, rowCount: found.properties.gridProperties?.rowCount ?? 0 }
  }
  const added = await api.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title, hidden, gridProperties: { rowCount: rows, columnCount: cols } } } }] },
  })
  return { id: added.data.replies![0].addSheet!.properties!.sheetId!, rowCount: rows }
}

async function pushTab(
  api: sheets_v4.Sheets, spreadsheetId: string, tab: string, grid: Grid, patientRows: number,
  payOptions: string[], robot: string,
) {
  const need = grid.rows.length + 60
  const { id: sheetId, rowCount } = await tabId(api, spreadsheetId, tab, SAFE_COL + 8, need)
  const span = Math.max(rowCount, need)

  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    { updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount: span, columnCount: SAFE_COL + 8 } }, fields: 'gridProperties.rowCount,gridProperties.columnCount' } },
    // Only ever within the grid's own columns: everything from SAFE_COL
    // rightwards is front desk's, and the hub does not touch it.
    // Cleared to SAFE_COL, not to this run's width: a narrower layout would
    // otherwise strand the previous, wider one to the right of its new edge.
    { unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: span, startColumnIndex: 0, endColumnIndex: SAFE_COL } } },
  ] } })

  const writes: sheets_v4.Schema$Request[] = []
  for (let i = 0; i < grid.rows.length; i += 150) {
    writes.push({ updateCells: { rows: grid.rows.slice(i, i + 150) as sheets_v4.Schema$RowData[], fields: 'userEnteredValue,userEnteredFormat', start: { sheetId, rowIndex: i, columnIndex: 0 } } })
  }
  // Below the content, and to the right of it. Only the rows were being
  // cleared, which is what left a stale block header standing.
  writes.push({ updateCells: { range: { sheetId, startRowIndex: grid.rows.length, endRowIndex: span, startColumnIndex: 0, endColumnIndex: SAFE_COL }, fields: 'userEnteredValue,userEnteredFormat' } })
  if (grid.totalCols < SAFE_COL) {
    writes.push({ updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: span, startColumnIndex: grid.totalCols, endColumnIndex: SAFE_COL }, fields: 'userEnteredValue,userEnteredFormat' } })
  }

  const stride = grid.k + 2
  for (let i = 0; i < grid.perBand; i++) {
    const base = i * stride
    writes.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: base, endIndex: base + 1 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } })
    writes.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: base + 1, endIndex: base + 1 + grid.k }, properties: { pixelSize: 120 }, fields: 'pixelSize' } })
  }
  for (const m of grid.merges) writes.push({ mergeCells: { range: { sheetId, ...m }, mergeType: 'MERGE_ALL' } })

  // Validation is not touched by updateCells, so stale dropdowns survive a
  // layout change and land on rows that are now something else entirely.
  writes.push({ setDataValidation: { range: { sheetId, startRowIndex: 0, endRowIndex: span, startColumnIndex: 0, endColumnIndex: SAFE_COL } } })
  for (const v of grid.validate) {
    writes.push({ setDataValidation: {
      range: { sheetId, startRowIndex: v.row, endRowIndex: v.row + 1, startColumnIndex: v.col, endColumnIndex: v.col + 1 },
      rule: v.kind === 'pay'
        ? { condition: { type: 'ONE_OF_LIST', values: payOptions.map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: true }
        : { condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `=${PATIENTS_TAB}!$A$2:$A$${patientRows + 1}` }] }, showCustomUi: true, strict: true },
    } })
  }

  for (let i = 0; i < writes.length; i += 400) {
    await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: writes.slice(i, i + 400) } })
  }

  // A heading over front desk's own space, written ONCE.
  //
  // The area from SAFE_COL rightwards is theirs and the generator never writes
  // into it — which left it invisible: empty columns past the edge of the
  // board, with nothing to say they were deliberate. This labels the first
  // cell, and only ever when that cell is empty, so anything already written
  // there is left exactly as it is. A guarantee nobody can find is not much of
  // a guarantee; one that overwrites their list to advertise itself is worse.
  try {
    const colA1 = (() => { let out = ''; for (let x = SAFE_COL; x >= 0; x = Math.floor(x / 26) - 1) out = String.fromCharCode(65 + (x % 26)) + out; return out })()
    const head = await api.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!${colA1}1` })
    if (!(head.data.values?.[0]?.[0] ?? '').toString().trim()) {
      await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ updateCells: {
        rows: [{ values: [{
          userEnteredValue: { stringValue: 'YOUR SPACE — the Hub never writes here' },
          userEnteredFormat: {
            backgroundColor: rgb('#FFF8E1'),
            textFormat: { bold: true, fontSize: 9, italic: true, foregroundColor: rgb('#8A6D1F'), fontFamily: 'Roboto' },
          },
        }] }],
        fields: 'userEnteredValue,userEnteredFormat',
        start: { sheetId, rowIndex: 0, columnIndex: SAFE_COL },
      } }] } })
    }
  } catch { /* a label is not worth failing a sync over */ }

  // Colour by value, and lock everything but the slot cells.
  const after = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.sheetId,sheets.protectedRanges,sheets.conditionalFormats' })
  const mine = after.data.sheets?.find(x => x.properties?.sheetId === sheetId)
  const post: sheets_v4.Schema$Request[] = []
  for (let i = (mine?.conditionalFormats?.length ?? 0) - 1; i >= 0; i--) post.push({ deleteConditionalFormatRule: { sheetId, index: i } })
  const ranges = grid.editable.map(r => ({ sheetId, ...r }))
  const nameRanges = grid.validate.filter(v => v.kind === 'name')
    .map(v => ({ sheetId, startRowIndex: v.row, endRowIndex: v.row + 1, startColumnIndex: v.col, endColumnIndex: v.col + 1 }))
  // Pushed first so it sinks to the bottom in priority — rules insert at 0.
  post.push({ addConditionalFormatRule: { index: 0, rule: { ranges, booleanRule: { condition: { type: 'TEXT_NOT_CONTAINS', values: [{ userEnteredValue: FREE_TEXT_HINT }] }, format: { textFormat: { foregroundColor: rgb('#1F2937') } } } } } })
  if (nameRanges.length) post.push({ addConditionalFormatRule: { index: 0, rule: { ranges: nameRanges, booleanRule: { condition: { type: 'BLANK' }, format: { backgroundColor: rgb('#DFF5E4') } } } } })
  // STARTS_WITH for HMO, because the value now carries the insurer's name.
  post.push({ addConditionalFormatRule: { index: 0, rule: { ranges, booleanRule: { condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: 'HMO' }] }, format: { textFormat: { bold: true, foregroundColor: rgb(INK.HMO) } } } } } })
  for (const [text, colour] of [['CASH', INK.CASH], ['GL', INK.GL]] as const) {
    post.push({ addConditionalFormatRule: { index: 0, rule: { ranges, booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: text }] }, format: { textFormat: { bold: true, foregroundColor: rgb(colour) } } } } } })
  }
  // A closed hour, shown the way the hub's own board shows one: quiet grey
  // rather than alarm red. Sheets has no pattern fills, so the diagonal
  // hatching cannot be reproduced — struck-through grey on a grey ground is
  // the nearest thing that still reads as "crossed out, not available".
  // N/A plain, BREAK struck through. They both close the hour, and the grey
  // ground says so for both — but N/A is the ordinary case, written across
  // most of a board, and a page of struck-out text reads as damage rather than
  // as a state. The strike is left on BREAK, where it is rare enough to mean
  // something by standing out.
  post.push({ addConditionalFormatRule: { index: 0, rule: { ranges: nameRanges, booleanRule: {
    condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: BLOCKED }] },
    format: { backgroundColor: rgb('#E8EAED'), textFormat: { bold: true, foregroundColor: rgb('#80868B') } },
  } } } })
  post.push({ addConditionalFormatRule: { index: 0, rule: { ranges: nameRanges, booleanRule: {
    condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: BREAK }] },
    format: { backgroundColor: rgb('#E8EAED'), textFormat: { bold: true, strikethrough: true, foregroundColor: rgb('#80868B') } },
  } } } })
  for (const pr of mine?.protectedRanges ?? []) post.push({ deleteProtectedRange: { protectedRangeId: pr.protectedRangeId! } })
  post.push({ addProtectedRange: { protectedRange: {
    range: { sheetId },
    description: 'Decking board — generated by the Operations Hub. Only the patient, payment and notes cells are editable.',
    warningOnly: false,
    unprotectedRanges: ranges,
    // WITHOUT this the protection binds nobody.
    //
    // Google fills `editors` with everyone who already has edit access at the
    // moment a protected range is created. The sheet is shared with the branch
    // accounts, so they were being added as editors OF THE PROTECTION — free to
    // change the times, the therapist names, the blocked hours, anything.
    // Naming the robot alone is what makes the lock real. The file's owner can
    // always edit regardless; that part is not ours to change.
    editors: { users: [robot] },
  } } })
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: post } })

  return { sheetId, rows: grid.rows.length }
}

async function pushPatients(api: sheets_v4.Sheets, spreadsheetId: string, names: string[]) {
  // N/A and BREAK ride at the top of the same list: the cells are strict, so
  // anything front desk must be able to put in a slot has to be an option.
  const list = [BLOCKED, BREAK, ...names]
  const { id: sheetId, rowCount } = await tabId(api, spreadsheetId, PATIENTS_TAB, 2, list.length + 100, true)
  const span = Math.max(rowCount, list.length + 100)
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    { updateSheetProperties: { properties: { sheetId, hidden: true, gridProperties: { rowCount: span, columnCount: 2 } }, fields: 'hidden,gridProperties.rowCount,gridProperties.columnCount' } },
    { updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: span, startColumnIndex: 0, endColumnIndex: 2 }, fields: 'userEnteredValue' } },
    { updateCells: {
      rows: [{ values: [{ userEnteredValue: { stringValue: 'PATIENT (from the CRM — do not edit)' } }] },
             ...list.map(n => ({ values: [{ userEnteredValue: { stringValue: n } }] }))],
      fields: 'userEnteredValue', start: { sheetId, rowIndex: 0, columnIndex: 0 },
    } },
  ] } })
  return list.length
}

/** The snapshot: one row per editable cell, with what this push wrote in it. */
async function pushMap(api: sheets_v4.Sheets, spreadsheetId: string, entries: (CellRef & { tab: string })[]) {
  const { id: sheetId, rowCount } = await tabId(api, spreadsheetId, MAP_TAB, 9, entries.length + 200, true)
  const span = Math.max(rowCount, entries.length + 200)
  const rows = [
    { values: ['TAB', 'ROW', 'COL', 'LINE', 'STAFF', 'DAY', 'TIME', 'WROTE', 'DATE'].map(h => ({ userEnteredValue: { stringValue: h } })) },
    ...entries.map(e => ({ values: [
      { userEnteredValue: { stringValue: e.tab } },
      { userEnteredValue: { numberValue: e.row } },
      { userEnteredValue: { numberValue: e.col } },
      { userEnteredValue: { stringValue: e.line } },
      { userEnteredValue: { stringValue: e.staffId } },
      { userEnteredValue: { stringValue: e.dayOfWeek } },
      { userEnteredValue: { stringValue: e.startTime } },
      { userEnteredValue: { stringValue: e.wrote } },
      { userEnteredValue: { stringValue: e.date ?? '' } },
    ] })),
  ]
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    { updateSheetProperties: { properties: { sheetId, hidden: true, gridProperties: { rowCount: span, columnCount: 9 } }, fields: 'hidden,gridProperties.rowCount,gridProperties.columnCount' } },
    { updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: span, startColumnIndex: 0, endColumnIndex: 9 }, fields: 'userEnteredValue' } },
  ] } })
  for (let i = 0; i < rows.length; i += 500) {
    await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
      { updateCells: { rows: rows.slice(i, i + 500) as sheets_v4.Schema$RowData[], fields: 'userEnteredValue', start: { sheetId, rowIndex: i, columnIndex: 0 } } },
    ] } })
  }
}

// ── pulling ─────────────────────────────────────────────────────────────────

/**
 * Pull a remark apart into the note somebody wrote and the extra patients.
 *
 * The notes line carries three different things: free text, the "+ NAME"
 * entries for a second or third patient in the same hour, and the hub's own
 * "1k paid" stamp. They have to be told apart — the extras are BOOKINGS, the
 * stamp is generated and must never be saved back as a note, and only what is
 * left is really the operator's text.
 */
export function splitRemark(text: string): { notes: string; extras: string[] } {
  if (!text || text === FREE_TEXT_HINT) return { notes: '', extras: [] }
  const notes: string[] = []
  const extras: string[] = []
  for (const part of String(text).split('·').map(p => p.trim()).filter(Boolean)) {
    if (/^\d+k?\s*paid$/i.test(part)) continue                 // written by the hub
    if (part.startsWith('+')) {
      // One segment can hold several: "+ A  +  B".
      for (const n of part.split('+').map(x => x.trim()).filter(Boolean)) extras.push(n.toUpperCase())
      continue
    }
    notes.push(part)
  }
  return { notes: notes.join(' · ').trim(), extras }
}

/** Kept for the old name; the sheet's free text only. */
export function userRemark(text: string): string {
  return splitRemark(text).notes
}

type Triple = { name: string; pay: string; notes: string; extras: string[] }
const same = (a: Triple, b: Triple) =>
  a.name === b.name && a.pay === b.pay && a.notes === b.notes &&
  a.extras.join('|') === b.extras.join('|')

/**
 * Read the sheet back and apply what front desk changed.
 *
 * Only the cells the map knows about are read, so a layout that shifted between
 * push and pull cannot misattribute a patient to the wrong therapist — which is
 * exactly what recomputing the positions would risk.
 */
async function pullTabs(
  api: sheets_v4.Sheets, spreadsheetId: string, branch: string, report: SyncReport,
) {
  const map = await api.spreadsheets.values.get({ spreadsheetId, range: `${MAP_TAB}!A2:I` }).catch(() => null)
  const entries = (map?.data.values ?? []).filter(r => r.length >= 8)
  if (entries.length === 0) return            // nothing has been pushed yet

  const tabs = [...new Set(entries.map(r => String(r[0])))]
  const values = new Map<string, string[][]>()
  for (const t of tabs) {
    const got = await api.spreadsheets.values.get({ spreadsheetId, range: `'${t}'!A1:Z`, valueRenderOption: 'UNFORMATTED_VALUE' }).catch(() => null)
    values.set(t, (got?.data.values ?? []) as string[][])
  }

  // Group the three lines of each slot back together.
  const bySlot = new Map<string, { tab: string; staffId: string; day: string; time: string; date: string; sheet: Triple; snap: Triple; ref: string }>()
  for (const r of entries) {
    const [tab, row, col, line, staffId, day, time, wrote, dateStr] = r
    // The date is part of a cell's identity: the same staff, day and hour can
    // be both a weekly slot and a one-off, and writing one into the other
    // would move a booking between them.
    const key = `${tab}|${staffId}|${day}|${time}|${dateStr ?? ''}`
    const grid = values.get(String(tab)) ?? []
    const now = String(grid[Number(row)]?.[Number(col)] ?? '')
    const slot = bySlot.get(key) ?? {
      tab: String(tab), staffId: String(staffId), day: String(day), time: String(time),
      date: String(dateStr ?? ''),
      sheet: { name: '', pay: '', notes: '', extras: [] }, snap: { name: '', pay: '', notes: '', extras: [] },
      ref: `${tab} r${Number(row) + 1}`,
    }
    if (String(line) === 'remark') {
      const a = splitRemark(now); slot.sheet.notes = a.notes; slot.sheet.extras = a.extras
      const b = splitRemark(String(wrote ?? '')); slot.snap.notes = b.notes; slot.snap.extras = b.extras
    } else {
      const l = String(line) as 'name' | 'pay'
      slot.sheet[l] = now.trim().toUpperCase()
      slot.snap[l] = String(wrote ?? '').trim().toUpperCase()
    }
    bySlot.set(key, slot)
  }

  // Resolve names once.
  const wanted = [...new Set([...bySlot.values()].flatMap(s => [s.sheet.name, ...s.sheet.extras])
    .filter(n => n && n !== BLOCKED && n !== BREAK))]
  const patients = wanted.length
    ? await prisma.$queryRawUnsafe<{ id: string; n: string }[]>(
        `SELECT id, upper("lastName" || ', ' || "firstName") AS n FROM "Patient"
          WHERE upper("lastName" || ', ' || "firstName") = ANY($1::text[])`, wanted)
    : []
  const byName = new Map<string, string[]>()
  for (const p of patients) byName.set(p.n, [...(byName.get(p.n) ?? []), p.id])

  for (const slot of bySlot.values()) {
    if (same(slot.sheet, slot.snap)) continue          // front desk left it alone

    const dept = slot.tab
    const existing = await prisma.deckingSlot.findMany({
      where: {
        staffId: slot.staffId, dayOfWeek: slot.day, startTime: slot.time,
        branch, department: dept, isClass: false,
        date: slot.date ? new Date(`${slot.date}T00:00:00Z`) : null,
      },
      select: { id: true, patientId: true, disabled: true, paymentType: true, hmoProvider: true, notes: true, patient: { select: { firstName: true, lastName: true } } },
    })
    const occupants = existing.filter(e => e.patientId)
    const blockedRow = existing.find(e => e.disabled)
    const asSlots: SheetSlot[] = existing.map(e => ({
      staffId: slot.staffId, dayOfWeek: slot.day, startTime: slot.time, disabled: e.disabled,
      paymentType: e.paymentType, hmoProvider: e.hmoProvider, notes: e.notes,
      patient: e.patient ? `${e.patient.lastName}, ${e.patient.firstName}` : null,
      patientId: e.patientId, dp: null,
    }))
    const occ = asSlots.filter(x => x.patient).sort((a, b) => String(a.patient).localeCompare(String(b.patient)))
    const hub: Triple = {
      name: nameFor(occ, asSlots.find(x => x.disabled)),
      pay: blockedRow || !occupants[0] ? '' : payLabel(occupants[0].paymentType, occupants[0].hmoProvider),
      notes: splitRemark(String((blockedRow ?? occupants[0])?.notes ?? '')).notes,
      extras: occ.slice(1).map(x => String(x.patient).toUpperCase()),
    }

    // Changed in BOTH places since the last sync. Neither wins — a person has
    // to look, because either value could be the right one and picking the
    // wrong one loses a booking nobody knows about.
    if (!same(hub, slot.snap)) {
      report.conflicts.push({ tab: slot.tab, cell: `${slot.day} ${slot.time}`, sheet: slot.sheet.name || '(empty)', hub: hub.name || '(empty)' })
      continue
    }

    const notes = slot.sheet.notes || null
    try {
      if (slot.sheet.name === BLOCKED || slot.sheet.name === BREAK) {
        const keepNote = slot.sheet.name === BREAK ? BREAK : notes
        if (blockedRow) {
          await prisma.deckingSlot.update({ where: { id: blockedRow.id }, data: { notes: keepNote } })
        } else {
          await prisma.deckingSlot.deleteMany({ where: { id: { in: occupants.map(o => o.id) } } })
          await prisma.deckingSlot.create({ data: {
            staffId: slot.staffId, dayOfWeek: slot.day, startTime: slot.time,
            endTime: hhmm(parseInt(slot.time.slice(0, 2), 10) + 1),
            branch, department: dept, disabled: true, notes: keepNote,
            date: slot.date ? new Date(`${slot.date}T00:00:00Z`) : null,
          } })
        }
        report.applied.push({ tab: slot.tab, cell: `${slot.day} ${slot.time}`, what: slot.sheet.name })
        continue
      }

      if (!slot.sheet.name) {
        // Cleared: unbook. The snapshot is what makes this readable as an
        // instruction rather than as a cell that was simply never filled.
        await prisma.deckingSlot.deleteMany({ where: { id: { in: [...occupants, ...(blockedRow ? [blockedRow] : [])].map(o => o.id) } } })
        report.applied.push({ tab: slot.tab, cell: `${slot.day} ${slot.time}`, what: 'cleared' })
        continue
      }

      // The cell is a LIST of patients: the name line plus any "+ NAME" on the
      // notes line. Front desk run group hours this way — one therapist, two or
      // three children — and the extras used to be display-only, stripped on
      // the way in, so typing one did nothing and said nothing.
      const wantNames = [slot.sheet.name, ...slot.sheet.extras]
        .map(n => n.trim().toUpperCase()).filter(Boolean)
      const seen = new Set<string>()
      const want: string[] = []
      for (const n of wantNames) { if (!seen.has(n)) { seen.add(n); want.push(n) } }

      const resolved: string[] = []
      let bad = false
      for (const n of want) {
        const ids = byName.get(n) ?? []
        if (ids.length === 0) { report.unknownPatients.push(n); bad = true; break }
        if (ids.length > 1) {
          report.conflicts.push({ tab: slot.tab, cell: `${slot.day} ${slot.time}`, sheet: n, hub: `${ids.length} patients share that name` })
          bad = true; break
        }
        resolved.push(ids[0])
      }
      // All or nothing. Applying the ones that resolved would leave the cell
      // half-written, and the next sync would read that as front desk having
      // deliberately removed whoever was missing.
      if (bad) continue
      if (resolved.length > MAX_PER_CELL) {
        report.conflicts.push({ tab: slot.tab, cell: `${slot.day} ${slot.time}`, sheet: `${resolved.length} patients`, hub: `at most ${MAX_PER_CELL} fit in one hour` })
        continue
      }

      const { paymentType: pay, hmoProvider } = parsePay(slot.sheet.pay)
      if (blockedRow) await prisma.deckingSlot.delete({ where: { id: blockedRow.id } })

      // Reuse the rows already there before creating more, so a slot keeps its
      // id — and anything pointing at it, a booking's deckingSlotId included.
      const spare = [...occupants]
      for (const [i, patientId] of resolved.entries()) {
        const row = spare.shift()
        const data = i === 0
          ? { patientId, paymentType: pay, hmoProvider, notes }
          : { patientId, paymentType: pay, hmoProvider }
        if (row) await prisma.deckingSlot.update({ where: { id: row.id }, data })
        else await prisma.deckingSlot.create({ data: {
          staffId: slot.staffId, dayOfWeek: slot.day, startTime: slot.time,
          endTime: hhmm(parseInt(slot.time.slice(0, 2), 10) + 1),
          branch, department: dept, ...data,
          date: slot.date ? new Date(`${slot.date}T00:00:00Z`) : null,
        } })
      }
      // Anyone the sheet no longer lists has been taken off this hour.
      if (spare.length) await prisma.deckingSlot.deleteMany({ where: { id: { in: spare.map(x => x.id) } } })

      report.applied.push({ tab: slot.tab, cell: `${slot.day} ${slot.time}`, what: want.join(' + ') })
    } catch (e) {
      report.errors.push(`${slot.tab} ${slot.day} ${slot.time}: ${(e as Error).message}`)
    }
  }
}

// ── the run ─────────────────────────────────────────────────────────────────

/**
 * Pull first, then push.
 *
 * In that order deliberately: pushing first would rewrite the cells front desk
 * had just edited, and their change would be gone before anything read it.
 */
export async function syncBranch(branch: string, spreadsheetId: string): Promise<SyncReport> {
  const report: SyncReport = { branch, pushed: [], applied: [], conflicts: [], unknownPatients: [], errors: [] }
  const client = sheetsClient()
  if (!client.ok) { report.errors.push(client.error); return report }
  const api = client.sheets

  // The workbook's own default, so every tab matches — including the ones this
  // sync does not generate (START HERE, OPEN SLOTS) and anything added later.
  // Setting it per cell would only ever cover what we happen to write.
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    { updateSpreadsheetProperties: { properties: { defaultFormat: { textFormat: { fontFamily: 'Roboto' } } }, fields: 'defaultFormat.textFormat.fontFamily' } },
  ] } }).catch(() => { /* cosmetic — never fail a sync over a font */ })

  await pullTabs(api, spreadsheetId, branch, report).catch(e => report.errors.push(`pull: ${(e as Error).message}`))

  // CASH, GL, and one entry per live insurer — mirrored from the Accounting
  // Hub's HMO wallets, so the picker cannot drift from the receivable list.
  const providers = await prisma.hmoProvider.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { name: true } })
  const payOptions = ['CASH', 'GL', ...providers.map(p => `HMO\u2013${p.name.toUpperCase()}`.replace('HMO\u2013', 'HMO \u2013 '))]

  const names = await loadPatientNames(branch)
  const patientRows = await pushPatients(api, spreadsheetId, names)

  const mapEntries: (CellRef & { tab: string })[] = []
  for (const dept of DEPARTMENTS) {
    try {
      const { staff, slots, dated } = await loadDepartment(branch, dept)
      const grid = buildGrid({ staff, slots, dated })
      if (!grid) continue
      const res = await pushTab(api, spreadsheetId, dept, grid, patientRows, payOptions, client.identity)
      for (const c of grid.cells) mapEntries.push({ ...c, tab: dept })
      report.pushed.push({ tab: dept, staff: grid.staffCount, rows: res.rows })
    } catch (e) {
      report.errors.push(`${dept}: ${(e as Error).message}`)
    }
  }
  await pushMap(api, spreadsheetId, mapEntries)

  // Re-read today's capacity after anything moved.
  //
  // Decking history is a daily snapshot, so a booking made in the spreadsheet
  // at 11am would not reach the chart — or the headline filled/open numbers —
  // until tomorrow's reading. recordDeckingSnapshot upserts on (date, branch,
  // department), so re-running it rewrites today rather than adding a second
  // row for the same day.
  if (report.applied.length > 0) {
    try {
      await recordDeckingSnapshot()
    } catch (e) {
      // Never fail a sync over the history chart — the bookings are the point.
      report.errors.push(`snapshot: ${(e as Error).message}`)
    }
  }
  return report
}
