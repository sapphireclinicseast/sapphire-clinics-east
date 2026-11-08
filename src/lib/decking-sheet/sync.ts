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
import {
  payLabel,
  buildGrid, nameFor, remarkFor, hhmm, parsePay, SAFE_COL, FREE_TEXT_HINT, BLOCKED, BREAK, INK,
  type SheetSlot, type SheetStaff, type Grid, type CellRef,
} from './grid'
import type { sheets_v4 } from 'googleapis'

export const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY'] as const
const MAP_TAB = '_map'
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
      // Recurring slots only. A dated one-off belongs to the psych/MD dated
      // boards, and drawn on the weekly grid it would claim its weekday for
      // ever — see the guards added with DeckingSlot.date.
      where: { branch, department, isClass: false, date: null },
      select: {
        id: true, staffId: true, dayOfWeek: true, startTime: true, disabled: true,
        paymentType: true, hmoProvider: true, notes: true, patientId: true,
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
  }))

  return { staff, slots: sheetSlots, raw: slots }
}

/** Every patient the branch can book, for the dropdown. */
async function loadPatientNames(branch: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ n: string }[]>(
    `SELECT DISTINCT upper("lastName" || ', ' || "firstName") AS n
       FROM "Patient"
      WHERE $1 = ANY("branches"::text[]) OR branch::text = $1
      ORDER BY 1`,
    branch,
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
  payOptions: string[],
) {
  const need = grid.rows.length + 60
  const { id: sheetId, rowCount } = await tabId(api, spreadsheetId, tab, SAFE_COL + 8, need)
  const span = Math.max(rowCount, need)

  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    { updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount: span, columnCount: SAFE_COL + 8 } }, fields: 'gridProperties.rowCount,gridProperties.columnCount' } },
    // Only ever within the grid's own columns: everything from SAFE_COL
    // rightwards is front desk's, and the hub does not touch it.
    { unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: span, startColumnIndex: 0, endColumnIndex: grid.totalCols } } },
  ] } })

  const writes: sheets_v4.Schema$Request[] = []
  for (let i = 0; i < grid.rows.length; i += 150) {
    writes.push({ updateCells: { rows: grid.rows.slice(i, i + 150) as sheets_v4.Schema$RowData[], fields: 'userEnteredValue,userEnteredFormat', start: { sheetId, rowIndex: i, columnIndex: 0 } } })
  }
  writes.push({ updateCells: { range: { sheetId, startRowIndex: grid.rows.length, endRowIndex: span, startColumnIndex: 0, endColumnIndex: grid.totalCols }, fields: 'userEnteredValue,userEnteredFormat' } })

  const stride = grid.k + 2
  for (let i = 0; i < grid.perBand; i++) {
    const base = i * stride
    writes.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: base, endIndex: base + 1 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } })
    writes.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: base + 1, endIndex: base + 1 + grid.k }, properties: { pixelSize: 120 }, fields: 'pixelSize' } })
  }
  for (const m of grid.merges) writes.push({ mergeCells: { range: { sheetId, ...m }, mergeType: 'MERGE_ALL' } })

  // Validation is not touched by updateCells, so stale dropdowns survive a
  // layout change and land on rows that are now something else entirely.
  writes.push({ setDataValidation: { range: { sheetId, startRowIndex: 0, endRowIndex: span, startColumnIndex: 0, endColumnIndex: grid.totalCols } } })
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
  for (const text of [BLOCKED, BREAK]) {
    post.push({ addConditionalFormatRule: { index: 0, rule: { ranges: nameRanges, booleanRule: {
      condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: text }] },
      format: { backgroundColor: rgb('#E8EAED'), textFormat: { bold: true, strikethrough: true, foregroundColor: rgb('#80868B') } },
    } } } })
  }
  for (const pr of mine?.protectedRanges ?? []) post.push({ deleteProtectedRange: { protectedRangeId: pr.protectedRangeId! } })
  post.push({ addProtectedRange: { protectedRange: {
    range: { sheetId },
    description: 'Decking board — generated by the Operations Hub. Only the patient, payment and notes cells are editable.',
    warningOnly: false,
    unprotectedRanges: ranges,
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
  const { id: sheetId, rowCount } = await tabId(api, spreadsheetId, MAP_TAB, 8, entries.length + 200, true)
  const span = Math.max(rowCount, entries.length + 200)
  const rows = [
    { values: ['TAB', 'ROW', 'COL', 'LINE', 'STAFF', 'DAY', 'TIME', 'WROTE'].map(h => ({ userEnteredValue: { stringValue: h } })) },
    ...entries.map(e => ({ values: [
      { userEnteredValue: { stringValue: e.tab } },
      { userEnteredValue: { numberValue: e.row } },
      { userEnteredValue: { numberValue: e.col } },
      { userEnteredValue: { stringValue: e.line } },
      { userEnteredValue: { stringValue: e.staffId } },
      { userEnteredValue: { stringValue: e.dayOfWeek } },
      { userEnteredValue: { stringValue: e.startTime } },
      { userEnteredValue: { stringValue: e.wrote } },
    ] })),
  ]
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    { updateSheetProperties: { properties: { sheetId, hidden: true, gridProperties: { rowCount: span, columnCount: 8 } }, fields: 'hidden,gridProperties.rowCount,gridProperties.columnCount' } },
    { updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: span, startColumnIndex: 0, endColumnIndex: 8 }, fields: 'userEnteredValue' } },
  ] } })
  for (let i = 0; i < rows.length; i += 500) {
    await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
      { updateCells: { rows: rows.slice(i, i + 500) as sheets_v4.Schema$RowData[], fields: 'userEnteredValue', start: { sheetId, rowIndex: i, columnIndex: 0 } } },
    ] } })
  }
}

// ── pulling ─────────────────────────────────────────────────────────────────

/** Strip the parts of a remark the hub itself wrote, so they never become notes. */
export function userRemark(text: string): string {
  if (!text || text === FREE_TEXT_HINT) return ''
  return text
    .split('·')
    .map(p => p.trim())
    .filter(p => p && !/^\+/.test(p) && !/^\d+k?\s*paid$/i.test(p))
    .join(' · ')
    .trim()
}

type Triple = { name: string; pay: string; remark: string }
const same = (a: Triple, b: Triple) => a.name === b.name && a.pay === b.pay && a.remark === b.remark

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
  const map = await api.spreadsheets.values.get({ spreadsheetId, range: `${MAP_TAB}!A2:H` }).catch(() => null)
  const entries = (map?.data.values ?? []).filter(r => r.length >= 8)
  if (entries.length === 0) return            // nothing has been pushed yet

  const tabs = [...new Set(entries.map(r => String(r[0])))]
  const values = new Map<string, string[][]>()
  for (const t of tabs) {
    const got = await api.spreadsheets.values.get({ spreadsheetId, range: `'${t}'!A1:Z`, valueRenderOption: 'UNFORMATTED_VALUE' }).catch(() => null)
    values.set(t, (got?.data.values ?? []) as string[][])
  }

  // Group the three lines of each slot back together.
  const bySlot = new Map<string, { tab: string; staffId: string; day: string; time: string; sheet: Triple; snap: Triple; ref: string }>()
  for (const r of entries) {
    const [tab, row, col, line, staffId, day, time, wrote] = r
    const key = `${tab}|${staffId}|${day}|${time}`
    const grid = values.get(String(tab)) ?? []
    const now = String(grid[Number(row)]?.[Number(col)] ?? '')
    const slot = bySlot.get(key) ?? {
      tab: String(tab), staffId: String(staffId), day: String(day), time: String(time),
      sheet: { name: '', pay: '', remark: '' }, snap: { name: '', pay: '', remark: '' },
      ref: `${tab} r${Number(row) + 1}`,
    }
    const l = String(line) as keyof Triple
    slot.sheet[l] = l === 'remark' ? userRemark(now) : now.trim().toUpperCase()
    slot.snap[l] = l === 'remark' ? userRemark(String(wrote ?? '')) : String(wrote ?? '').trim().toUpperCase()
    bySlot.set(key, slot)
  }

  // Resolve names once.
  const wanted = [...new Set([...bySlot.values()].map(s => s.sheet.name).filter(n => n && n !== BLOCKED && n !== BREAK))]
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
      where: { staffId: slot.staffId, dayOfWeek: slot.day, startTime: slot.time, branch, department: dept, isClass: false, date: null },
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
    const hub: Triple = {
      name: nameFor(asSlots.filter(x => x.patient), asSlots.find(x => x.disabled)),
      pay: blockedRow || !occupants[0] ? '' : payLabel(occupants[0].paymentType, occupants[0].hmoProvider),
      remark: userRemark(remarkFor(asSlots.filter(x => x.patient), asSlots.find(x => x.disabled))),
    }

    // Changed in BOTH places since the last sync. Neither wins — a person has
    // to look, because either value could be the right one and picking the
    // wrong one loses a booking nobody knows about.
    if (!same(hub, slot.snap)) {
      report.conflicts.push({ tab: slot.tab, cell: `${slot.day} ${slot.time}`, sheet: slot.sheet.name || '(empty)', hub: hub.name || '(empty)' })
      continue
    }

    const notes = slot.sheet.remark || null
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

      const ids = byName.get(slot.sheet.name) ?? []
      if (ids.length === 0) { report.unknownPatients.push(slot.sheet.name); continue }
      if (ids.length > 1) {
        report.conflicts.push({ tab: slot.tab, cell: `${slot.day} ${slot.time}`, sheet: slot.sheet.name, hub: `${ids.length} patients share that name` })
        continue
      }
      const patientId = ids[0]
      const { paymentType: pay, hmoProvider } = parsePay(slot.sheet.pay)

      if (blockedRow) await prisma.deckingSlot.delete({ where: { id: blockedRow.id } })
      if (occupants[0]) {
        await prisma.deckingSlot.update({ where: { id: occupants[0].id }, data: { patientId, paymentType: pay, hmoProvider, notes } })
      } else {
        await prisma.deckingSlot.create({ data: {
          staffId: slot.staffId, dayOfWeek: slot.day, startTime: slot.time,
          endTime: hhmm(parseInt(slot.time.slice(0, 2), 10) + 1),
          branch, department: dept, patientId, paymentType: pay, hmoProvider, notes,
        } })
      }
      report.applied.push({ tab: slot.tab, cell: `${slot.day} ${slot.time}`, what: slot.sheet.name })
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
      const { staff, slots } = await loadDepartment(branch, dept)
      const grid = buildGrid({ staff, slots })
      if (!grid) continue
      const res = await pushTab(api, spreadsheetId, dept, grid, patientRows, payOptions)
      for (const c of grid.cells) mapEntries.push({ ...c, tab: dept })
      report.pushed.push({ tab: dept, staff: grid.staffCount, rows: res.rows })
    } catch (e) {
      report.errors.push(`${dept}: ${(e as Error).message}`)
    }
  }
  await pushMap(api, spreadsheetId, mapEntries)
  return report
}
