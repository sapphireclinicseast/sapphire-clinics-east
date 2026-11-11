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
import { internWindowCovers } from '@/lib/intern-window'
import { sheetsClient } from '@/lib/google-sheets-auth'
import { recordDeckingSnapshot } from '@/lib/decking-snapshot'
import {
  payLabel,
  buildGrid, nameFor, hhmm, parsePay, spanLabel, DAYS,
  SAFE_COL, FREE_TEXT_HINT, FREE_TEXT_HINTS, BLOCKED, BREAK, INK,
  type SheetSlot, type SheetStaff, type SheetClass, type SheetCase, type Grid, type CellRef,
} from './grid'
import { daySlots } from '@/lib/decking-slots'
import type { sheets_v4 } from 'googleapis'

export const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY'] as const
const MAP_TAB = '_map'
// The hub's own cap, mirrored here so the sheet cannot write a cell the board
// would refuse to draw.
const MAX_PER_CELL = 3
/**
 * How many cells one tab may be seen to EMPTY in a single run.
 *
 * Both halves of the sync read "this cell is blank" as a decision somebody
 * made: the push preserves the blank, the pull deletes the booking behind it.
 * A misread sheet therefore does not degrade, it erases — on 2026-11-10 a
 * short read of the Greenhills SLP tab blanked 161 cells and the next pull
 * deleted 105 slots, 56 of them booked children.
 *
 * Nobody clears forty cells by hand between two five-minute syncs. Past this
 * count the run stops believing its own reading and says so, leaving the hub
 * as it is. Emptying a board in bulk is a hub action, where it is visible and
 * reversible.
 */
const MAX_BLANKED_PER_TAB = 40
const PATIENTS_TAB = '_patients'
const OPEN_TAB = 'OPEN SLOTS'
const OPEN_DATA_TAB = '_open'

/** One bookable hour with a seat still free in it. */
interface OpenSlot {
  dayIdx: number
  day: string
  dayLabel: string
  timeKey: string
  timeLabel: string
  department: string
  clinician: string
  free: number
  seats: number
}

export interface SyncReport {
  branch: string
  pushed: { tab: string; staff: number; rows: number; kept?: number }[]
  applied: { tab: string; cell: string; what: string }[]
  conflicts: { tab: string; cell: string; sheet: string; hub: string }[]
  unknownPatients: string[]
  errors: string[]
}

// ── loading what the hub knows ──────────────────────────────────────────────

/** The shape of a therapist config, as much of it as the merge below reads. */
interface ScheduleRow {
  staffId: string
  workDays: unknown
  startTime: string
  endTime: string
  deliveryMode: string | null
  updatedAt: Date
  slotsPerDay: number | null
  slotMinutes?: number | null
  breakStart?: string | null
  breakMinutes?: number | null
}

/**
 * One board schedule per consultant, built from EVERY row they hold.
 *
 * A consultant has a general schedule and, where the clinic has set one, a
 * narrower row per service. The sheet has a tab per DEPARTMENT, so it used to
 * pick exactly one of those rows and draw it — a service row ahead of the
 * general one, the newer ahead of the older.
 *
 * That loses days. Joan Yap keeps Thursdays in clinic and Fridays on
 * teletherapy; the teletherapy row won, so the board drew her a Friday
 * afternoon and nothing else, and her Thursday children had nowhere on the
 * sheet to appear. Three consultants were losing bookings that way.
 *
 * So: the board shows every day any of their rows gives the clinic, and each
 * day is drawn on the hours that govern THAT day — the service rows where one
 * covers it, the general row everywhere else. A service row still narrows its
 * own days, which is the behaviour it was added for; it just no longer erases
 * the days it says nothing about.
 */
export function mergeSchedules<T extends ScheduleRow>(
  configs: T[],
  /** Days each consultant actually holds a booking on. */
  bookedDays: Map<string, Set<string>> = new Map(),
) {
  const dayCount = (c: ScheduleRow) => ((c.workDays as string[]) ?? []).length
  const byStaff = new Map<string, T[]>()
  for (const c of configs) byStaff.set(c.staffId, [...(byStaff.get(c.staffId) ?? []), c])

  const out = new Map<string, {
    primary: T
    workDays: string[]
    startTime: string
    endTime: string
    dayHours: Record<string, { startTime: string; endTime: string }>
  }>()

  for (const [staffId, rows] of byStaff) {
    // The row the rest of the board takes its settings from: still the
    // service row, still the newest of its kind, and never an empty one.
    // Only the DAYS are pooled; patients-a-day and the like stay single-valued.
    let primary = rows[0]
    for (const c of rows.slice(1)) {
      const better =
        (dayCount(c) > 0 && dayCount(primary) === 0) ? true :
        (dayCount(c) === 0 && dayCount(primary) > 0) ? false :
        (c.deliveryMode !== null && primary.deliveryMode === null) ||
        (((c.deliveryMode === null) === (primary.deliveryMode === null)) && c.updatedAt > primary.updatedAt)
      if (better) primary = c
    }

    const real = rows.filter(c => dayCount(c) > 0)
    const service = real.filter(c => c.deliveryMode !== null)

    // ── Which days the board draws ────────────────────────────────────────
    //
    // The service rows, where the consultant has any — they are what front
    // desk edit from the board, and they are the current answer. The general
    // row is the fallback for a consultant who has never had one split out.
    //
    // Pooling the two instead drew days nobody works: Jerome Falsis has an
    // on-site row of Saturday and a general row from July still listing Friday
    // and Saturday, so the sheet offered a Friday column with seven empty
    // hours in it while the hub showed Saturday alone.
    //
    // Plus any day he actually HOLDS a booking on, whatever the rows say. That
    // is the part that must never be dropped: a booked hour with no column to
    // appear in is a session that exists in the hub and nowhere front desk can
    // see it, which is how Abarca's four Sundays went missing.
    const declared = service.length ? service : real
    const days = new Set([
      ...declared.flatMap(c => (c.workDays as string[]) ?? []),
      ...(bookedDays.get(staffId) ?? []),
    ])

    const dayHours: Record<string, { startTime: string; endTime: string }> = {}
    for (const day of days) {
      const covering = real.filter(c => ((c.workDays as string[]) ?? []).includes(day))
      // A service row governs the days it names. Only where no service row
      // mentions the day does the general schedule decide it — and a day that
      // appears only because something is booked on it takes the widest hours
      // the consultant keeps, so the booking lands inside them.
      const serviceCovering = covering.filter(c => c.deliveryMode !== null)
      const deciding = serviceCovering.length ? serviceCovering : covering.length ? covering : real
      if (!deciding.length) continue
      dayHours[day] = {
        startTime: deciding.map(c => c.startTime).sort()[0],
        endTime: deciding.map(c => c.endTime).sort().slice(-1)[0],
      }
    }

    const workDays = Object.keys(dayHours)
    const spans = Object.values(dayHours)
    out.set(staffId, {
      primary,
      workDays,
      // The block's outer span — the widest any of its days reaches. Each day
      // is still hatched back to its own hours inside it.
      startTime: spans.length ? spans.map(s => s.startTime).sort()[0] : primary.startTime,
      endTime: spans.length ? spans.map(s => s.endTime).sort().slice(-1)[0] : primary.endTime,
      dayHours,
    })
  }
  return out
}

async function loadDepartment(branch: string, department: string) {
  const [configs, slots, classRows, capacityRows, caseRows] = await Promise.all([
    prisma.deckingTherapistConfig.findMany({
      // EVERY config, not just the general one.
      //
      // A consultant can hold one schedule per service — the board writes a
      // service-specific row whenever front desk configure hours while a
      // service section is selected, which is most of the time. Reading only
      // deliveryMode: null meant the sheet was drawing schedules last touched
      // in April while the hub showed what had been set that morning.
      //
      // Two real consequences, both reported: a therapist cut to two hours
      // still showed four, and an hour added to another was never drawn at
      // all — so a real booking inside it could not appear on the sheet, and
      // clearing the sheet could not reach it.
      // Licensed staff only. Interns get their own tab: a student on
      // placement is supervised teaching time, not a clinician front desk can
      // book a patient with, and mixing the two on one board invites exactly
      // that mistake.
      //
      // The null arm is needed because `not: 'intern'` on a nullable column
      // drops every untagged consultant too — most of the roster.
      where: {
        branch, department,
        staff: {
          active: true,
          OR: [{ employmentType: null }, { employmentType: { not: 'intern' } }],
        },
      },
      select: {
        staffId: true, workDays: true, startTime: true, endTime: true, deliveryMode: true, updatedAt: true,
      slotsPerDay: true, slotMinutes: true, breakStart: true, breakMinutes: true,
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { staff: { lastName: 'asc' } },
    }),
    prisma.deckingSlot.findMany({
      // BOTH kinds. They are separated below: the weekly pattern draws the
      // grid, and the one-offs get their own dated blocks underneath it. A
      // one-off left out of the sheet entirely — which is what happened before
      // this — exists in the hub and nowhere front desk can see it.
      // A one-off the clinic has hidden is left out here rather than filtered
      // later, so it never reaches the grid, the map, or the pull. Weekly
      // slots are unaffected — the flag only ever applies to a dated one, and
      // `sheetHidden` is false on everything else.
      where: { branch, department, isClass: false, sheetHidden: false },
      select: {
        id: true, staffId: true, dayOfWeek: true, startTime: true, disabled: true,
        paymentType: true, hmoProvider: true, notes: true, patientId: true, date: true, endTime: true,
        patient: { select: { firstName: true, lastName: true } },
        patientBookings: { where: { paidAt: { not: null } }, select: { downpayment: true }, take: 1 },
      },
    }),
    // ── Classes ───────────────────────────────────────────────────────────
    //
    // A class is one hour with a whole group in it — five children with one
    // SPED teacher, booked as five rows against the same slot. The grid can
    // only ever draw the first of them, so classes were left out of the sheet
    // altogether and front desk could not see from the board that the hour
    // was taken at all, let alone by whom.
    //
    // They are listed below the grid instead, read-only: a class is composed
    // in the hub, and a roll typed over on the spreadsheet would be a way to
    // lose a child rather than a way to add one.
    prisma.deckingSlot.findMany({
      where: { branch, department, isClass: true, patientId: { not: null } },
      select: {
        staffId: true, dayOfWeek: true, startTime: true, endTime: true, date: true,
        paymentType: true, hmoProvider: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    }),
    // Which hours have been declared shared. A row exists only where the
    // answer is more than one patient, so this is a short list even on a full
    // board — and it is what gives a shared hour real dropdown lines on the
    // sheet instead of a name typed by hand on the notes line.
    prisma.deckingSlotCapacity.findMany({
      where: { branch, department },
      select: { staffId: true, dayOfWeek: true, startTime: true, date: true, capacity: true },
    }),
    // Patients carried with no day and no hour — annulment cases and the
    // like. Listed below the grid, never drawn as an hour.
    prisma.deckingCaseload.findMany({
      where: { branch, department },
      select: { staffId: true, reason: true, patient: { select: { firstName: true, lastName: true } } },
    }),
  ])

  // Days somebody is actually booked on, so a schedule that has moved on
  // cannot take a booked hour off the board.
  const bookedDays = new Map<string, Set<string>>()
  for (const sl of slots) {
    if (sl.date || !sl.patientId) continue
    bookedDays.set(sl.staffId, new Set([...(bookedDays.get(sl.staffId) ?? []), sl.dayOfWeek]))
  }

  // Every day the consultant gives this department, each on its own hours.
  const staff: SheetStaff[] = [...mergeSchedules(configs, bookedDays).values()].map(m => ({
    id: m.primary.staffId,
    firstName: m.primary.staff.firstName,
    lastName: m.primary.staff.lastName,
    workDays: m.workDays,
    startTime: m.startTime,
    endTime: m.endTime,
    slotsPerDay: m.primary.slotsPerDay,
    slotMinutes: m.primary.slotMinutes,
    breakStart: m.primary.breakStart,
    breakMinutes: m.primary.breakMinutes,
    dayHours: m.dayHours,
  })).sort((a, b) => a.lastName.localeCompare(b.lastName))

  // Consultants who hold a one-off but NO weekly schedule have to be named too.
  //
  // This list is built from therapist configs, and a doctor who comes in once
  // a quarter has none — that is the whole point of her being a one-off. Her
  // dated block was therefore rendering with a blank header: present on the
  // sheet, and unreadable, which from the desk looks exactly like missing.
  //
  // Safe to append: the weekly grid filters on workDays, so somebody with none
  // is still left out of it. Only the name reaches the dated block.
  const named = new Set(staff.map(x => x.id))
  const extraIds = [...new Set([
    ...slots.filter(sl => sl.date && !named.has(sl.staffId)).map(sl => sl.staffId),
    // And whoever carries a case: the list below is headed by their name.
    ...caseRows.filter(c => !named.has(c.staffId)).map(c => c.staffId),
    // Same for whoever runs a class: the list below is headed by their name,
    // and a block headed by nothing is a block nobody can read.
    ...classRows.filter(c => !named.has(c.staffId)).map(c => c.staffId),
  ])]
  if (extraIds.length) {
    const extras = await prisma.staff.findMany({
      where: { id: { in: extraIds } },
      select: { id: true, firstName: true, lastName: true },
    })
    for (const e of extras) {
      staff.push({ id: e.id, firstName: e.firstName, lastName: e.lastName, workDays: [], startTime: '00:00', endTime: '00:00' })
    }
  }

  const sheetSlots: SheetSlot[] = slots.map(s => ({
    // A one-off sheet row IS this row, and its id is the only thing that tells
    // two one-offs apart when they share a date, a start and an end.
    id: s.id,
    staffId: s.staffId,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
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

  // One entry per class — the hour — carrying every child in it.
  const grouped = new Map<string, SheetClass>()
  for (const c of classRows) {
    const date = c.date ? c.date.toISOString().slice(0, 10) : null
    const key = `${c.staffId}|${c.dayOfWeek}|${c.startTime}|${c.endTime}|${date ?? ''}`
    const got = grouped.get(key) ?? {
      staffId: c.staffId, dayOfWeek: c.dayOfWeek, startTime: c.startTime, endTime: c.endTime,
      date, patients: [], payment: payLabel(c.paymentType, c.hmoProvider),
    }
    if (c.patient) got.patients.push(`${c.patient.lastName}, ${c.patient.firstName}`.toUpperCase())
    grouped.set(key, got)
  }
  for (const g of grouped.values()) g.patients.sort((a, b) => a.localeCompare(b))

  // Weekly cells only: the one-off blocks below the grid are one slot each and
  // have no second line to give.
  const capacity = new Map<string, number>()
  for (const c of capacityRows) {
    if (c.date) continue
    capacity.set(`${c.staffId}|${c.dayOfWeek}|${c.startTime}`, c.capacity)
  }

  return {
    staff,
    slots: sheetSlots.filter(x => !x.date),
    dated: sheetSlots.filter(x => !!x.date),
    classes: [...grouped.values()],
    cases: caseRows.map((c): SheetCase => ({
      staffId: c.staffId,
      patient: `${c.patient.lastName}, ${c.patient.firstName}`.toUpperCase(),
      reason: c.reason ?? '',
    })),
    capacity,
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

/**
 * The interns of one department, and the hours they hold.
 *
 * Kept apart from the clinicians on purpose. Their block header names the
 * supervising clinician, because an intern's hour is only meaningful with one
 * — the whole board is supervised teaching time, and a reader who cannot see
 * who is signing for it has to go and ask.
 */
async function loadInterns(branch: string, department: string) {
  const all = await prisma.deckingTherapistConfig.findMany({
    where: { branch, department, staff: { active: true, employmentType: 'intern' } },
    select: {
      staffId: true, workDays: true, startTime: true, endTime: true, deliveryMode: true, updatedAt: true,
      slotsPerDay: true, slotMinutes: true, breakStart: true, breakMinutes: true,
      staff: { select: { id: true, firstName: true, lastName: true, dateHired: true, contractExpiry: true } },
    },
  })
  // An intern is only here for their rotation — a month, as HR records it. Once
  // the End Month is past they come off the board and their tab stops being
  // written, rather than sitting there for the next batch to work around.
  const configs = all.filter(c => internWindowCovers(c.staff.dateHired, c.staff.contractExpiry))
  if (configs.length === 0) return null

  // Loaded before the merge: which days an intern is booked on decides which
  // days the board draws, so the slots have to be in hand first.
  const ids = [...new Set(configs.map(c => c.staffId))]
  const slots = await prisma.deckingSlot.findMany({
    where: { branch, department, isClass: false, staffId: { in: ids } },
    select: {
      id: true, staffId: true, dayOfWeek: true, startTime: true, endTime: true, disabled: true,
      paymentType: true, hmoProvider: true, notes: true, patientId: true, date: true, supervisorId: true,
      patient: { select: { firstName: true, lastName: true } },
      patientBookings: { where: { paidAt: { not: null } }, select: { downpayment: true }, take: 1 },
    },
  })

  const internBookedDays = new Map<string, Set<string>>()
  for (const sl of slots) {
    if (sl.date || !sl.patientId) continue
    internBookedDays.set(sl.staffId, new Set([...(internBookedDays.get(sl.staffId) ?? []), sl.dayOfWeek]))
  }
  // Same rule as loadDepartment: the service rows where there are any, the
  // general row otherwise, plus every day something is actually booked on.
  const chosen = mergeSchedules(configs, internBookedDays)

  // Whoever is named on their hours. One supervisor per intern in practice;
  // if several, the board shows the one most of their hours point at.
  const supervisorIds = [...new Set(slots.map(x => x.supervisorId).filter((x): x is string => !!x))]
  const sups = supervisorIds.length
    ? await prisma.staff.findMany({ where: { id: { in: supervisorIds } }, select: { id: true, firstName: true, lastName: true } })
    : []
  const supName = new Map(sups.map(x => [x.id, `${x.lastName}, ${x.firstName}`]))
  const byIntern = new Map<string, string>()
  for (const sl of slots) {
    if (sl.supervisorId && !byIntern.has(sl.staffId)) byIntern.set(sl.staffId, supName.get(sl.supervisorId) ?? '')
  }

  const staff: SheetStaff[] = [...chosen.values()].map(m => {
    const c = m.primary
    const sup = byIntern.get(c.staffId)
    return {
      id: c.staffId,
      firstName: c.staff.firstName,
      lastName: c.staff.lastName,
      label: sup
        ? `${c.staff.lastName}, ${c.staff.firstName}  ·  supervised by ${sup}`
        : `${c.staff.lastName}, ${c.staff.firstName}  ·  NO SUPERVISOR SET`,
      workDays: m.workDays,
      startTime: m.startTime,
      endTime: m.endTime,
      slotsPerDay: c.slotsPerDay,
      slotMinutes: c.slotMinutes,
      breakStart: c.breakStart,
      breakMinutes: c.breakMinutes,
      dayHours: m.dayHours,
    }
  }).sort((a, b) => a.lastName.localeCompare(b.lastName))

  const mapped: SheetSlot[] = slots.map(s => ({
    id: s.id,
    staffId: s.staffId, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
    disabled: s.disabled, paymentType: s.paymentType, hmoProvider: s.hmoProvider, notes: s.notes,
    patient: s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : null,
    patientId: s.patientId,
    dp: s.patientBookings[0]?.downpayment ? Number(s.patientBookings[0].downpayment) : null,
    date: s.date ? s.date.toISOString().slice(0, 10) : null,
  }))

  return { staff, slots: mapped.filter(x => !x.date), dated: mapped.filter(x => !!x.date) }
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

/**
 * Every tab's id and height, read ONCE per run.
 *
 * tabId used to fetch the whole workbook's metadata on every call, which is
 * once per tab — about eleven reads a branch, all of them the same answer.
 * Sheets allows sixty read requests a minute per user and a full sync of one
 * branch was spending around forty-five of them, so a second sync inside the
 * same minute lost tabs to a quota error. The cron staggers the two branches
 * for that reason; this widens the margin rather than relying on it.
 */
type TabIndex = Map<string, { id: number; rowCount: number }>

async function loadTabs(api: sheets_v4.Sheets, spreadsheetId: string): Promise<TabIndex> {
  const meta = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
  const index: TabIndex = new Map()
  for (const sh of meta.data.sheets ?? []) {
    const title = sh.properties?.title
    if (title == null || sh.properties?.sheetId == null) continue
    index.set(title, { id: sh.properties.sheetId, rowCount: sh.properties.gridProperties?.rowCount ?? 0 })
  }
  return index
}

async function tabId(
  api: sheets_v4.Sheets, spreadsheetId: string, title: string, cols: number, rows: number,
  hidden = false, index?: TabIndex,
) {
  const cached = index?.get(title)
  if (cached) return cached
  // No index, or a tab this run has not seen: ask, then remember.
  if (!index) {
    const meta = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
    const found = meta.data.sheets?.find(s => s.properties?.title === title)
    if (found?.properties?.sheetId != null) {
      return { id: found.properties.sheetId, rowCount: found.properties.gridProperties?.rowCount ?? 0 }
    }
  }
  const added = await api.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title, hidden, gridProperties: { rowCount: rows, columnCount: cols } } } }] },
  })
  const made = { id: added.data.replies![0].addSheet!.properties!.sheetId!, rowCount: rows }
  index?.set(title, made)
  return made
}

/**
 * Which hours of a department still have a seat free.
 *
 * Worked out from the HUB — the same schedules, slots and capacities the grid
 * is drawn from — and not by reading the department tabs.
 *
 * It used to be the other way round: a frozen list of hours, each carrying a
 * formula pointing at a cell like =OT!G108, generated once by hand. Every
 * change to the board's shape moved the cells out from under those references,
 * and by the time this was written 266 of the 604 rows pointed at something
 * that was no longer a patient cell at all — one of them was reading a PAYMENT
 * cell and calling the hour taken. A reference that has to be re-derived every
 * time the layout moves is a reference that will be wrong.
 *
 * Reading the hub also answers both halves of the question at once: the pull
 * runs before the push, so anything typed into the spreadsheet is already in
 * the hub by the time this is built. An hour is listed when the decking
 * schedule says it exists, nobody has closed it, and it has a free seat.
 */
function openSlotsFor(
  department: string,
  staff: SheetStaff[],
  slots: SheetSlot[],
  capacity: Map<string, number>,
): OpenSlot[] {
  const weekly = slots.filter(s => !s.date)
  const at = new Map<string, SheetSlot[]>()
  for (const s of weekly) {
    const k = `${s.staffId}|${s.dayOfWeek}|${s.startTime}`
    at.set(k, [...(at.get(k) ?? []), s])
  }

  const out: OpenSlot[] = []
  for (const st of staff) {
    for (const day of st.workDays ?? []) {
      const dayIdx = DAYS.findIndex(d => d.key === day)
      if (dayIdx < 0) continue
      const hours = st.dayHours?.[day]
      for (const sl of daySlots(hours?.startTime ?? st.startTime, hours?.endTime ?? st.endTime, { slotsPerDay: st.slotsPerDay, slotMinutes: st.slotMinutes, breakStart: st.breakStart, breakMinutes: st.breakMinutes })) {
        const k = `${st.id}|${day}|${sl.startTime}`
        const here = at.get(k) ?? []
        // A closed hour is not capacity anybody can sell.
        if (here.some(x => x.disabled)) continue
        const taken = here.filter(x => x.patient).length
        const seats = Math.min(3, Math.max(capacity.get(k) ?? 1, taken))
        if (seats - taken <= 0) continue
        out.push({
          dayIdx, day,
          dayLabel: DAYS[dayIdx].label.charAt(0) + DAYS[dayIdx].label.slice(1).toLowerCase(),
          timeKey: sl.startTime,
          timeLabel: spanLabel(sl.startTime, sl.endTime),
          department,
          clinician: `${st.lastName}, ${st.firstName}`.toUpperCase(),
          free: seats - taken,
          seats,
        })
      }
    }
  }
  return out
}

/**
 * Write the OPEN SLOTS tab and the hidden list behind it.
 *
 * Two tabs because of the search box: `_open` is the data, `OPEN SLOTS` is one
 * FILTER over it that narrows as front desk type. The box itself (B6, merged
 * across to D6) is theirs and is never written — a sync that cleared what
 * somebody was in the middle of typing would be worse than no search at all.
 */
async function pushOpenSlots(
  api: sheets_v4.Sheets, spreadsheetId: string, branchLabel: string, rows: OpenSlot[], bookable: number,
  tabs?: TabIndex,
) {
  rows.sort((a, b) =>
    a.dayIdx - b.dayIdx || a.timeKey.localeCompare(b.timeKey)
    || a.department.localeCompare(b.department) || a.clinician.localeCompare(b.clinician))

  // ── the hidden list ──────────────────────────────────────────────────────
  const dataRows = rows.map(r => [
    r.dayLabel, r.timeLabel, r.department, r.clinician,
    // What the search box matches against: everything about the row in one
    // string, so "sat ot" and "sulit" both find it.
    `${r.dayLabel} ${r.timeLabel} ${r.department} ${r.clinician}`,
    r.free > 1 ? `${r.free} free` : '',
  ])
  const dataSpan = Math.max(dataRows.length + 50, 200)
  const { id: dataId } = await tabId(api, spreadsheetId, OPEN_DATA_TAB, 6, dataSpan, true, tabs)
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    { updateSheetProperties: { properties: { sheetId: dataId, hidden: true, gridProperties: { rowCount: dataSpan, columnCount: 6 } }, fields: 'hidden,gridProperties.rowCount,gridProperties.columnCount' } },
    { updateCells: { range: { sheetId: dataId, startRowIndex: 0, endRowIndex: dataSpan, startColumnIndex: 0, endColumnIndex: 6 }, fields: 'userEnteredValue' } },
  ] } })
  await api.spreadsheets.values.update({
    spreadsheetId, range: `'${OPEN_DATA_TAB}'!A1`, valueInputOption: 'RAW',
    requestBody: { values: [['DAY', 'TIME', 'DEPARTMENT', 'CLINICIAN', 'SEARCH KEY', 'SEATS'], ...dataRows] },
  })

  // ── the tab front desk read ──────────────────────────────────────────────
  const { id: sheetId } = await tabId(api, spreadsheetId, OPEN_TAB, 6, 1000, false, tabs)
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    { updateSheetProperties: {
      properties: { sheetId, gridProperties: { rowCount: Math.max(dataRows.length + 60, 300), columnCount: 6, frozenRowCount: 8, hideGridlines: true } },
      fields: 'gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount,gridProperties.hideGridlines',
    } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 240 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },
  ] } })

  const head = (v: string) => ({ userEnteredValue: { stringValue: v }, userEnteredFormat: {
    backgroundColor: rgb('#1F3A5F'), horizontalAlignment: 'LEFT',
    textFormat: { bold: true, fontSize: 9, fontFamily: 'Roboto', foregroundColor: rgb('#FFFFFF') },
  } })
  const plain = (v: string, fmt: Record<string, unknown> = {}) => ({
    userEnteredValue: v ? { stringValue: v } : {},
    userEnteredFormat: { textFormat: { fontFamily: 'Roboto', ...(fmt.textFormat as object ?? {}) }, ...fmt },
  })
  const formula = (f: string, fmt: Record<string, unknown> = {}) => ({
    userEnteredValue: { formulaValue: f },
    userEnteredFormat: { textFormat: { fontFamily: 'Roboto', ...(fmt.textFormat as object ?? {}) }, ...fmt },
  })

  // ── The search box, and the wreckage of older layouts ───────────────────
  //
  // B6 is the box front desk type in, so it is never written — except that an
  // EARLIER layout put its prompt text there, and this one reads it as a
  // search term. The East tab therefore came back "No open slot matches
  // that." against 183 open hours, because it was searching for the words
  // "Search a department, a day or a clinician".
  //
  // So the whole header block is cleared and rewritten, and whatever was in
  // the box is put back only when it is a real search rather than one of the
  // prompts a previous version left behind. Self-healing once, harmless after.
  const LEGACY_PROMPTS = ['search a department', 'type a department']
  const typed = await api.spreadsheets.values
    .get({ spreadsheetId, range: `'${OPEN_TAB}'!B6` })
    .then(r => String(r.data.values?.[0]?.[0] ?? '').trim())
    .catch(() => '')
  const keepSearch = typed && !LEGACY_PROMPTS.some(p => typed.toLowerCase().startsWith(p)) ? typed : ''

  // Written cell by cell, deliberately: row 6 column B is the search box and
  // belongs to whoever is typing in it.
  const put = (row: number, col: number, cell: object) => ({ updateCells: {
    rows: [{ values: [cell] }], fields: 'userEnteredValue,userEnteredFormat',
    start: { sheetId, rowIndex: row, columnIndex: col },
  } })

  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    // The header block, cleared whole so a previous layout cannot leave a
    // stray line standing — the East tab carried two "FIND AN OPEN SLOT"
    // headings, one from this layout and one from the last.
    { updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 6 }, fields: 'userEnteredValue,userEnteredFormat,note' } },
    // Its merges too. East was still merged the way the hand-built tab had it
    // and Greenhills was not merged at all, so the same search box was wide on
    // one branch and one narrow cell on the other. Cleared here and re-made
    // below, identically, on both.
    { unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 6 } } },
    // Everything from row 9 down is the FILTER's to spill into.
    { updateCells: { range: { sheetId, startRowIndex: 8, endRowIndex: Math.max(dataRows.length + 60, 300), startColumnIndex: 0, endColumnIndex: 6 }, fields: 'userEnteredValue,userEnteredFormat' } },
    put(0, 0, plain(`OPEN SLOTS — ${branchLabel}`, { textFormat: { bold: true, fontSize: 14, foregroundColor: rgb('#1F3A5F') } })),
    put(1, 0, formula(
      `=SUMPRODUCT(('${OPEN_DATA_TAB}'!A2:A<>"")*1)&" hours with a free seat, out of ${bookable} bookable."`,
      { textFormat: { fontSize: 10, foregroundColor: rgb('#5A6470') } })),
    put(2, 0, plain('Built from the Decking module every few minutes — book in the Hub or on the department tab, and this follows.',
      { textFormat: { fontSize: 9, italic: true, foregroundColor: rgb('#8A8F98') } })),
    put(4, 0, plain('FIND AN OPEN SLOT', { textFormat: { bold: true, fontSize: 10, foregroundColor: rgb('#1F3A5F') } })),
    // The box, and a label that points AT it. Front desk could not tell which
    // cell to type in: the prompt sat in the cell beside the box and read as
    // its contents, and one branch had the box merged while the other did not,
    // so the two tabs did not even look alike.
    put(5, 0, plain('🔍  TYPE HERE →', {
      horizontalAlignment: 'RIGHT',
      textFormat: { bold: true, fontSize: 10, foregroundColor: rgb('#1F3A5F') },
    })),
    // Put back only a real search term; a prompt left by an older layout is
    // dropped, which is what unsticks a tab that was filtering on its own
    // instructions.
    put(5, 1, {
      userEnteredValue: keepSearch ? { stringValue: keepSearch } : {},
      userEnteredFormat: {
        backgroundColor: rgb('#FFFFFF'),
        horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE',
        textFormat: { fontFamily: 'Roboto', fontSize: 12, bold: true, foregroundColor: rgb('#1F3A5F') },
        borders: {
          top: { style: 'SOLID_MEDIUM', color: rgb('#1F3A5F') },
          bottom: { style: 'SOLID_MEDIUM', color: rgb('#1F3A5F') },
          left: { style: 'SOLID_MEDIUM', color: rgb('#1F3A5F') },
          right: { style: 'SOLID_MEDIUM', color: rgb('#1F3A5F') },
        },
      },
      note: 'Type here to narrow the list below.\n\nA department (OT, PT, SLP, SPED), a day (Monday), a time (2 PM) or a clinician\u2019s name. Clear it to see every open hour again.',
    }),
    // Under the box, not beside it — beside it, the instruction looked like
    // something already typed into the search.
    put(6, 0, plain('Type a department, a day, a time or a clinician into the box above — leave it empty to see every open hour.',
      { textFormat: { fontSize: 9, italic: true, foregroundColor: rgb('#8A8F98') } })),
    // Six headers for six filtered columns; the fifth is the search key and
    // is hidden, because FILTER cannot skip a column in the middle of a range.
    ...['DAY', 'TIME', 'DEPARTMENT', 'CLINICIAN', '', 'SEATS'].map((h, i) => put(7, i, head(h))),
    // The box spans three columns so it is wide enough to read as a field,
    // and the long lines span the width so they are not cut off by column A.
    ...[0, 1, 2, 4, 6].map(r => ({ mergeCells: {
      range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 6 },
      mergeType: 'MERGE_ALL' as const,
    } })),
    { mergeCells: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },
    put(8, 0, formula(
      `=IFERROR(FILTER('${OPEN_DATA_TAB}'!A2:F, ('${OPEN_DATA_TAB}'!A2:A<>"")`
      + `*((($B$6="")+ISNUMBER(SEARCH($B$6,'${OPEN_DATA_TAB}'!E2:E)))>0)), "No open slot matches that.")`,
      { textFormat: { fontSize: 10 } })),
  ] } })

  // The FILTER returns six columns, of which E is the search key. Hidden
  // rather than left out, because FILTER cannot skip a column mid-range.
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } },
  ] } })

  // Keep the tab's protection pointing at the box.
  //
  // The tab is generated, so it is protected with one hole in it: the search
  // box. The box used to be B5 and is now B6, and the protection did not move
  // with it — East's hole still named row 5, so the only cell front desk are
  // meant to type into was the one cell they could not. It blocked nobody in
  // the end, because every account with edit access happened to be a named
  // editor of the range, but the next person given access would have found a
  // search box that refuses to be typed in.
  //
  // This realigns whatever protection is there rather than creating one:
  // Greenhills has none, and adding one would make that tab read-only for
  // everybody not named in it — a lockout nobody asked for. Editors are left
  // exactly as they are for the same reason.
  const prot = await api.spreadsheets
    .get({ spreadsheetId, fields: 'sheets(properties.sheetId,protectedRanges(protectedRangeId,range,unprotectedRanges))' })
    .then(r => (r.data.sheets ?? []).find(s => s.properties?.sheetId === sheetId)?.protectedRanges ?? [])
    .catch(() => [])
  const box = { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 4 }
  const misaligned = prot.filter(p => {
    const u = p.unprotectedRanges ?? []
    // Whole-tab protections only; a narrower one was somebody's own doing.
    if (p.range?.startRowIndex != null || p.range?.startColumnIndex != null) return false
    return u.length !== 1 || u[0].startRowIndex !== 5 || u[0].endRowIndex !== 6
      || u[0].startColumnIndex !== 1 || u[0].endColumnIndex !== 4
  })
  if (misaligned.length) {
    await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: misaligned.map(p => ({
      updateProtectedRange: {
        protectedRange: { protectedRangeId: p.protectedRangeId!, unprotectedRanges: [box] },
        fields: 'unprotectedRanges',
      },
    })) } }).catch(() => { /* cosmetic — never fail a sync over a protection */ })
  }

  return rows.length
}

/**
 * Empty a tab that has nothing to show, leaving a line that says why.
 *
 * An intern tab is only written while that department has someone on
 * placement. Without this, the tab from last month's rotation would stay
 * exactly as it was: still laid out, still unprotected in the slot cells, and
 * no longer in the map — so anything typed into it would go nowhere and never
 * reach the hub. A board that silently swallows entries is worse than no board,
 * so the tab is cleared and labelled instead of being left to look live.
 */
async function blankTab(api: sheets_v4.Sheets, spreadsheetId: string, tab: string, notice: string) {
  const meta = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
  const found = meta.data.sheets?.find(x => x.properties?.title === tab)
  const sheetId = found?.properties?.sheetId
  if (sheetId == null) return false                    // never existed; nothing to clear
  const rows = found?.properties?.gridProperties?.rowCount ?? 200

  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    // Drop the old protections first: they name ranges of a layout that is
    // about to stop existing, and a stale protected range blocks the rewrite.
    ...(await api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties.sheetId,protectedRanges.protectedRangeId)' })
      .then(r => (r.data.sheets ?? [])
        .filter(x => x.properties?.sheetId === sheetId)
        .flatMap(x => x.protectedRanges ?? [])
        .map(pr => ({ deleteProtectedRange: { protectedRangeId: pr.protectedRangeId! } })))
      .catch(() => [])),
    { updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: SAFE_COL + 8 }, fields: 'userEnteredValue,userEnteredFormat,dataValidation,note' } },
    { unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: SAFE_COL + 8 } } },
    { updateCells: {
      rows: [{ values: [{
        userEnteredValue: { stringValue: notice },
        userEnteredFormat: { textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.57, green: 0.25, blue: 0.05 } }, backgroundColor: { red: 1, green: 0.98, blue: 0.92 } },
      }] }],
      fields: 'userEnteredValue,userEnteredFormat', start: { sheetId, rowIndex: 1, columnIndex: 1 },
    } },
    // Read-only until somebody is on placement again.
    { addProtectedRange: { protectedRange: { range: { sheetId }, description: 'No one on placement', warningOnly: false, editors: { users: [] } } } },
  ] } }).catch(() => null)
  return true
}

/**
 * Write a tab — WITHOUT overwriting anything front desk typed since the last
 * push.
 *
 * Every run pulls all the tabs, then rewrites all the tabs from the hub. Those
 * two steps are tens of seconds apart, and the push rewrites every cell. So
 * anything typed inside that window was read by nobody and then overwritten by
 * the hub's idea of the cell — a name entered at the wrong moment simply
 * vanished, every five minutes, on any tab. That is the "it refreshes and
 * deletes them" the desk was seeing, and it is why the names that disappeared
 * looked random: it was a race, not a department or a kind of entry.
 *
 * `lastWrote` is what the map says this sync last put in each cell. Before
 * writing, the tab is read back: where the cell still holds what we wrote, the
 * hub's value goes in as before; where it does NOT, somebody has typed, so the
 * cell is left exactly as they typed it and the map keeps the OLD snapshot —
 * which is precisely what makes the next pull see a change and apply it.
 *
 * The cost is one extra read per tab. The alternative is a guaranteed loss
 * window on every run.
 */
async function pushTab(
  api: sheets_v4.Sheets, spreadsheetId: string, tab: string, grid: Grid, patientRows: number,
  payOptions: string[], robot: string,
  lastWrote?: Map<string, string>,
  consumed?: Set<string>,
  tabs?: TabIndex,
) {
  const need = grid.rows.length + 60
  const { id: sheetId, rowCount } = await tabId(api, spreadsheetId, tab, SAFE_COL + 8, need, false, tabs)
  const span = Math.max(rowCount, need)

  // ── Anything typed since the last push is kept, not overwritten ──────────
  let preserved = 0
  if (lastWrote?.size) {
    const live = await api.spreadsheets.values.get({
      spreadsheetId, range: `'${tab}'!A1:Z${span}`, valueRenderOption: 'UNFORMATTED_VALUE',
    }).catch(() => null)
    const rows = (live?.data.values ?? []) as string[][]
    // ── How far this read can be TRUSTED ───────────────────────────────────
    //
    // values.get trims trailing blanks, and a failed read comes back as no
    // rows at all — so "the API hiccupped" and "front desk emptied the tab"
    // are the same thing from here. Believing the second one blanks every
    // cell at once, and the next pull reads that as an instruction and
    // deletes the bookings behind them. That is exactly what happened to the
    // Greenhills SLP tab on 2026-11-10: a short read, 161 cells preserved as
    // empty, 105 slots and 56 bookings gone on the following run.
    //
    // So a row the read did not reach is not evidence of anything. Those
    // cells are written from the hub as usual, which at worst loses an edit
    // made in the last few seconds — the race this whole mechanism exists to
    // close — instead of emptying a board.
    const reached = rows.length
    // Every prompt the free-text line has ever shown counts as empty, or
    // replacing the prompt text would look like an edit on every single cell.
    const norm = (v: unknown) => {
      const t = String(v ?? '').trim()
      return FREE_TEXT_HINTS.includes(t) ? '' : t
    }
    // Decided first, applied second, so the set can be sanity-checked whole.
    const keep: { c: CellRef; now: string; mine: string }[] = []
    for (const c of grid.cells) {
      if (c.row >= reached) continue                // the read never got this far
      // The pull has already taken this cell into the hub this run.
      if (consumed?.has(`${tab}|${c.dayOfWeek} ${c.startTime}`)) continue
      const mine = lastWrote.get(`${c.row}|${c.col}`)
      if (mine === undefined) continue              // a cell this sync has not written before
      const now = norm(rows[c.row]?.[c.col])
      if (now === norm(mine)) continue              // untouched since we wrote it
      // Already agrees with what we are about to write — which is what an edit
      // the pull just consumed looks like. Writing it normally records the NEW
      // snapshot; preserving it here instead would keep the stale one and make
      // the next pull read a settled cell as a fresh change, then refuse it as
      // a conflict because the hub had moved to match.
      if (now === norm(c.wrote)) continue
      keep.push({ c, now, mine })
    }

    // A second line of defence, for the shapes the row count cannot catch —
    // a garbled read, a tab reflowed under a map that no longer lines up.
    // Front desk do not empty fifty cells between two five-minute syncs; a
    // run that thinks they did has misread the sheet, and acting on it blanks
    // a board and then deletes the bookings behind it on the next pull.
    // Clearing that many is a hub job, where it can be seen and undone.
    const emptied = keep.filter(k => k.now === '').length
    if (emptied > MAX_BLANKED_PER_TAB) {
      console.warn(`[decking-sheet] ${tab}: read says ${emptied} cells were emptied — refusing to believe it, pushing the hub's values instead`)
    } else {
      for (const { c, now, mine } of keep) {
        // Somebody typed here between the pull and now. Leave their text
        // exactly as it stands, and keep the OLD snapshot in the map so the
        // next pull still sees sheet ≠ snapshot and carries it into the hub.
        const cell = grid.rows[c.row]?.values?.[c.col] as { userEnteredValue?: unknown } | undefined
        if (cell) cell.userEnteredValue = now ? { stringValue: now } : {}
        c.wrote = mine
        preserved++
      }
    }
  }

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
    writes.push({ updateCells: { rows: grid.rows.slice(i, i + 150) as sheets_v4.Schema$RowData[], fields: 'userEnteredValue,userEnteredFormat,note', start: { sheetId, rowIndex: i, columnIndex: 0 } } })
  }
  // Below the content, and to the right of it. Only the rows were being
  // cleared, which is what left a stale block header standing.
  writes.push({ updateCells: { range: { sheetId, startRowIndex: grid.rows.length, endRowIndex: span, startColumnIndex: 0, endColumnIndex: SAFE_COL }, fields: 'userEnteredValue,userEnteredFormat,note' } })
  if (grid.totalCols < SAFE_COL) {
    writes.push({ updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: span, startColumnIndex: grid.totalCols, endColumnIndex: SAFE_COL }, fields: 'userEnteredValue,userEnteredFormat,note' } })
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
    // A closed hour's payment cell. It keeps its place in `validate` so the
    // grey-and-struck rule below still covers it, but no dropdown is written:
    // the whole range was cleared above, so skipping it here is what removes
    // the one a previous run left behind.
    if (v.locked) continue
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
  // A slot closed to N/A or BREAK greys its payment and notes lines AT ONCE.
  //
  // Choosing N/A cannot turn the cell into the hatched image on the spot: the
  // hatch is an =IMAGE() formula, which is a cell VALUE, and conditional
  // formatting can only change how a cell looks. The sync rewrites the slot
  // properly on its next run — within five minutes — and that is also when the
  // two lines below genuinely stop accepting input, because protection is
  // static and cannot react to a value either.
  //
  // What this does is close the gap in between: the moment N/A is chosen, the
  // payment and notes lines go grey and struck through, so nobody fills in a
  // payment for an hour that has just been closed and wonders later why it
  // vanished.
  //
  // One rule per line rather than one per cell: INDIRECT with an R1C1 relative
  // reference reads the patient line of whichever slot the cell belongs to, so
  // two rules cover a whole tab instead of six hundred.
  const payRanges = grid.validate.filter(v => v.kind === 'pay')
    .map(v => ({ sheetId, startRowIndex: v.row, endRowIndex: v.row + 1, startColumnIndex: v.col, endColumnIndex: v.col + 1 }))
  const remarkRanges = grid.validate.filter(v => v.kind === 'pay')
    .map(v => ({ sheetId, startRowIndex: v.row + 1, endRowIndex: v.row + 2, startColumnIndex: v.col, endColumnIndex: v.col + 1 }))
  const closedFormat = {
    backgroundColor: rgb('#E8EAED'),
    textFormat: { strikethrough: true, foregroundColor: rgb('#9AA0A6') },
  }
  for (const [rs, up] of [[payRanges, 1], [remarkRanges, 2]] as const) {
    if (!rs.length) continue
    post.push({ addConditionalFormatRule: { index: 0, rule: { ranges: rs, booleanRule: {
      condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue:
        `=OR(INDIRECT("R[-${up}]C",FALSE)="${BLOCKED}",INDIRECT("R[-${up}]C",FALSE)="${BREAK}")` }] },
      format: closedFormat,
    } } } })
  }

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

  return { sheetId, rows: grid.rows.length, preserved }
}

async function pushPatients(api: sheets_v4.Sheets, spreadsheetId: string, names: string[], tabs?: TabIndex) {
  // N/A and BREAK ride at the top of the same list: the cells are strict, so
  // anything front desk must be able to put in a slot has to be an option.
  const list = [BLOCKED, BREAK, ...names]
  const { id: sheetId, rowCount } = await tabId(api, spreadsheetId, PATIENTS_TAB, 2, list.length + 100, true, tabs)
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
async function pushMap(api: sheets_v4.Sheets, spreadsheetId: string, entries: (CellRef & { tab: string })[], tabs?: TabIndex) {
  const { id: sheetId, rowCount } = await tabId(api, spreadsheetId, MAP_TAB, 10, entries.length + 200, true, tabs)
  const span = Math.max(rowCount, entries.length + 200)
  const rows = [
    { values: ['TAB', 'ROW', 'COL', 'LINE', 'STAFF', 'DAY', 'TIME', 'WROTE', 'DATE', 'SLOT'].map(h => ({ userEnteredValue: { stringValue: h } })) },
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
      // A one-off's identity — see CellRef.slotId.
      { userEnteredValue: { stringValue: e.slotId ?? '' } },
    ] })),
  ]
  // Widened on its own, BEFORE anything writes into the new width.
  //
  // The map grew from 9 columns to 10 when one-offs started carrying their row
  // id. tabId() only sets a width when it CREATES the tab, so every existing
  // sheet still had a 9-column map, and the clear and the row writes both
  // addressed column 10 of a 9-wide grid: "Attempting to write column: 9,
  // beyond the last requested column of: 8". The whole sync died there, after
  // the department tabs had been written but before the map was updated —
  // which also leaves the map describing the previous push.
  const WIDTH = 10
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    { updateSheetProperties: { properties: { sheetId, hidden: true, gridProperties: { rowCount: span, columnCount: WIDTH } }, fields: 'hidden,gridProperties.rowCount,gridProperties.columnCount' } },
  ] } })
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
    { updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: span, startColumnIndex: 0, endColumnIndex: WIDTH }, fields: 'userEnteredValue' } },
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
  // Any prompt this line has ever shown counts as empty — see FREE_TEXT_HINTS.
  if (!text || FREE_TEXT_HINTS.includes(text.trim())) return { notes: '', extras: [] }
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

type Triple = { name: string; pay: string; name2: string; pay2: string; name3: string; pay3: string; notes: string; extras: string[] }
const same = (a: Triple, b: Triple) =>
  a.name === b.name && a.pay === b.pay &&
  a.name2 === b.name2 && a.pay2 === b.pay2 &&
  a.name3 === b.name3 && a.pay3 === b.pay3 &&
  a.notes === b.notes && a.extras.join('|') === b.extras.join('|')

type Field =
  | 'patient' | 'second patient' | 'third patient'
  | 'payment' | 'second payment' | 'third payment'
  | 'note' | 'others in the hour'
const fieldOf = (t: Triple, f: Field): string =>
  f === 'patient' ? t.name : f === 'second patient' ? t.name2 : f === 'third patient' ? t.name3
    : f === 'payment' ? t.pay : f === 'second payment' ? t.pay2 : f === 'third payment' ? t.pay3
      : f === 'note' ? t.notes : t.extras.join(' + ')

/**
 * Which field, if any, the HUB has moved on since the snapshot — the test for
 * "changed in both places, a person must look".
 *
 * A BLANK snapshot field is not evidence of anything. The map stores what the
 * last push wrote, and it writes '' both for a cell it deliberately emptied
 * and for a cell it never had a value for, so a blank cannot be read as "the
 * hub had nothing here". Treating it as one made every cell whose snapshot had
 * lost a payment permanently unresolvable: front desk changed CASH to GL, the
 * hub still said CASH, the snapshot said nothing, and the sync called it a
 * conflict on every run for as long as it stood.
 *
 * So a blank snapshot is ignored — but only for the payment and the note. WHO
 * is booked stays strict in both directions: an empty snapshot name next to a
 * hub booking is a genuine disagreement, and letting the sheet win it would
 * overwrite a booking made in the hub.
 */
function hubMoved(hub: Triple, snap: Triple): Field | null {
  if (hub.name !== snap.name) return 'patient'
  if (hub.name2 !== snap.name2) return 'second patient'
  if (hub.name3 !== snap.name3) return 'third patient'
  if (hub.extras.join('|') !== snap.extras.join('|')) return 'others in the hour'
  if (snap.pay && hub.pay !== snap.pay) return 'payment'
  if (snap.pay2 && hub.pay2 !== snap.pay2) return 'second payment'
  if (snap.pay3 && hub.pay3 !== snap.pay3) return 'third payment'
  if (snap.notes && hub.notes !== snap.notes) return 'note'
  return null
}

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
  const map = await api.spreadsheets.values.get({ spreadsheetId, range: `${MAP_TAB}!A2:J` }).catch(() => null)
  // Sheets drops trailing empty cells from a row, so a map row for a cell that
  // was pushed EMPTY comes back short: its WROTE and DATE columns are both ''.
  // Requiring all nine columns therefore hid every empty cell from the pull —
  // front desk could clear a booking but never add one, because the cell they
  // typed into was not in the map, and the next push wrote the hub's blank back
  // over their entry. Only the first seven columns are identity; pad the rest.
  const entries = (map?.data.values ?? [])
    .filter(r => r.length >= 7 && r.slice(0, 7).every(c => String(c ?? '') !== ''))
    .map(r => [...r, ...Array(Math.max(0, 10 - r.length)).fill('')])
  if (entries.length === 0) return            // nothing has been pushed yet

  const tabs = [...new Set(entries.map(r => String(r[0])))]
  const values = new Map<string, string[][]>()
  for (const t of tabs) {
    const got = await api.spreadsheets.values.get({ spreadsheetId, range: `'${t}'!A1:Z`, valueRenderOption: 'UNFORMATTED_VALUE' }).catch(() => null)
    values.set(t, (got?.data.values ?? []) as string[][])
  }

  // Group the three lines of each slot back together.
  const bySlot = new Map<string, { tab: string; staffId: string; day: string; time: string; date: string; slotId: string; sheet: Triple; snap: Triple; lines: number; ref: string }>()
  for (const r of entries) {
    const [tab, row, col, line, staffId, day, time, wrote, dateStr, slotIdStr] = r
    // The date is part of a cell's identity: the same staff, day and hour can
    // be both a weekly slot and a one-off, and writing one into the other
    // would move a booking between them.
    // A one-off is keyed by its own row id. Two of them can share a date, a
    // start AND an end, so no combination of times separates them; keyed on
    // times they merged into one cell and one row's entry was dropped on every
    // pull. Weekly cells have no single row and keep the time key.
    const key = `${tab}|${staffId}|${day}|${time}|${dateStr ?? ''}|${slotIdStr ?? ''}`
    const grid = values.get(String(tab)) ?? []
    const now = String(grid[Number(row)]?.[Number(col)] ?? '')
    const slot = bySlot.get(key) ?? {
      tab: String(tab), staffId: String(staffId), day: String(day), time: String(time),
      date: String(dateStr ?? ''), slotId: String(slotIdStr ?? ''),
      sheet: { name: '', pay: '', name2: '', pay2: '', name3: '', pay3: '', notes: '', extras: [] },
      snap: { name: '', pay: '', name2: '', pay2: '', name3: '', pay3: '', notes: '', extras: [] },
      // How many patient lines this cell was DRAWN with. Counted from the map
      // rather than looked up again, so the pull reads the cell exactly as the
      // push wrote it even if the capacity has been changed since.
      lines: 0,
      ref: `${tab} r${Number(row) + 1}`,
    }
    if (String(line) === 'remark') {
      const a = splitRemark(now); slot.sheet.notes = a.notes; slot.sheet.extras = a.extras
      const b = splitRemark(String(wrote ?? '')); slot.snap.notes = b.notes; slot.snap.extras = b.extras
    } else {
      const l = String(line) as 'name' | 'pay' | 'name2' | 'pay2' | 'name3' | 'pay3'
      if (l === 'name' || l === 'name2' || l === 'name3') slot.lines++
      slot.sheet[l] = now.trim().toUpperCase()
      slot.snap[l] = String(wrote ?? '').trim().toUpperCase()
    }
    bySlot.set(key, slot)
  }

  // Resolve names once.
  const wanted = [...new Set([...bySlot.values()]
    .flatMap(s => [s.sheet.name, s.sheet.name2, ...s.sheet.extras])
    .filter(n => n && n !== BLOCKED && n !== BREAK))]
  const patients = wanted.length
    ? await prisma.$queryRawUnsafe<{ id: string; n: string }[]>(
        `SELECT id, upper("lastName" || ', ' || "firstName") AS n FROM "Patient"
          WHERE upper("lastName" || ', ' || "firstName") = ANY($1::text[])`, wanted)
    : []
  const byName = new Map<string, string[]>()
  for (const p of patients) byName.set(p.n, [...(byName.get(p.n) ?? []), p.id])

  // Tabs that read as mass-emptied are not applied at all.
  //
  // The same reasoning as the push side, at the other end of the round trip:
  // a cell that reads blank where the snapshot had a name is taken as "unbook
  // this", and a tab-wide misreading therefore deletes a tab's worth of
  // bookings. Counted per tab before anything is written, so one bad tab does
  // not stop the other five.
  const clearing = new Map<string, number>()
  for (const slot of bySlot.values()) {
    if (same(slot.sheet, slot.snap)) continue
    if (slot.sheet.name || !slot.snap.name) continue
    clearing.set(slot.tab, (clearing.get(slot.tab) ?? 0) + 1)
  }
  const refusing = new Set<string>()
  for (const [tab, n] of clearing) {
    if (n <= MAX_BLANKED_PER_TAB) continue
    refusing.add(tab)
    report.errors.push(
      `${tab}: the sheet reads as ${n} slots emptied at once, which is not something anyone types — nothing was unbooked. `
      + `If the tab really is meant to be cleared, do it in the Hub.`,
    )
  }

  for (const slot of bySlot.values()) {
    if (same(slot.sheet, slot.snap)) continue          // front desk left it alone
    // This tab's clears are being refused; its other edits still apply.
    if (refusing.has(slot.tab) && !slot.sheet.name && slot.snap.name) continue

    // The intern tabs are named "<DEPT> INTERNS", but an intern's hours are
    // stored under the plain department — the tab is a presentation split, not
    // a department of its own. Reading the tab name straight through would look
    // for a department called "OT INTERNS" and silently match nothing, so a
    // booking typed on an intern tab would never reach the hub.
    const dept = slot.tab.replace(/ INTERNS$/, '')
    // How many patient LINES the sheet drew this cell with — the same number
    // the push used, read back from the cells the map holds for it. Anyone
    // past that is on the notes line as "+ NAME", as they always were.
    const lines = Math.max(1, slot.lines)
    const existing = await prisma.deckingSlot.findMany({
      where: {
        staffId: slot.staffId, dayOfWeek: slot.day, startTime: slot.time,
        branch, department: dept, isClass: false,
        date: slot.date ? new Date(`${slot.date}T00:00:00Z`) : null,
        // A one-off addresses its own row. Without this, two one-offs sharing a
        // start time both matched and the same patient was written into each.
        ...(slot.slotId ? { id: slot.slotId } : {}),
      },
      select: { id: true, patientId: true, disabled: true, paymentType: true, hmoProvider: true, notes: true, endTime: true, patient: { select: { firstName: true, lastName: true } } },
    })
    const occupants = existing.filter(e => e.patientId)
    const blockedRow = existing.find(e => e.disabled)
    const asSlots: SheetSlot[] = existing.map(e => ({
      staffId: slot.staffId, dayOfWeek: slot.day, startTime: slot.time, endTime: e.endTime, disabled: e.disabled,
      paymentType: e.paymentType, hmoProvider: e.hmoProvider, notes: e.notes,
      patient: e.patient ? `${e.patient.lastName}, ${e.patient.firstName}` : null,
      patientId: e.patientId, dp: null,
    }))
    const occ = asSlots.filter(x => x.patient).sort((a, b) => String(a.patient).localeCompare(String(b.patient)))
    // The hub read BY NAME ORDER, the same order the board draws.
    //
    // `occupants` is whatever Postgres returned; `occ` is sorted, and the sheet
    // shows the sorted one. Taking the name from `occ` and the payment and the
    // note from `occupants` described a two-child hour as GA's name with
    // MACADAEG's payment — a hub that matched nothing the sheet could hold, so
    // the cell was declared a conflict on every run and front desk's edits to
    // it were refused for ever.
    const hub: Triple = {
      name: nameFor(occ, asSlots.find(x => x.disabled)),
      pay: blockedRow || !occ[0] ? '' : payLabel(occ[0].paymentType, occ[0].hmoProvider),
      // With a second patient LINE, the second occupant belongs there rather
      // than on the notes line — otherwise the same child would be compared
      // against two different places and read as a change every sync.
      name2: lines > 1 && occ[1] ? String(occ[1].patient).toUpperCase() : '',
      pay2: lines > 1 && occ[1] ? payLabel(occ[1].paymentType, occ[1].hmoProvider) : '',
      name3: lines > 2 && occ[2] ? String(occ[2].patient).toUpperCase() : '',
      pay3: lines > 2 && occ[2] ? payLabel(occ[2].paymentType, occ[2].hmoProvider) : '',
      // BREAK is a STATE, carried in notes because there is nowhere else to put
      // it, and the board prints it on the patient line and nothing on the note
      // line. Reading it back as a note made every BREAK hour disagree with the
      // snapshot of itself, which is a conflict that can never be resolved.
      notes: splitRemark(String((blockedRow ?? occ[0])?.notes ?? '')).notes
        .replace(new RegExp(`^${BREAK}$`), ''),
      extras: occ.slice(lines).map(x => String(x.patient).toUpperCase()),
    }

    // Changed in BOTH places since the last sync. Neither wins — a person has
    // to look, because either value could be the right one and picking the
    // wrong one loses a booking nobody knows about.
    const differs = hubMoved(hub, slot.snap)
    if (differs) {
      // Named, because a conflict that prints the same name on both sides —
      // which is what every one of these looked like — tells nobody anything.
      // The names agreeing is the common case; the disagreement is in the
      // payment or the note.
      report.conflicts.push({
        tab: slot.tab, cell: `${slot.day} ${slot.time}`,
        sheet: `${differs}: ${fieldOf(slot.sheet, differs) || '(empty)'}`,
        hub: `${differs}: ${fieldOf(hub, differs) || '(empty)'}`,
      })
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
      // The patient LINES are the booking; the "+ names" on the note line are
      // companions in the same hour. They are resolved differently on purpose
      // — see below.
      const lineNames = [slot.sheet.name, slot.sheet.name2, slot.sheet.name3]
        .map(n => n.trim().toUpperCase()).filter(Boolean)
      const seen = new Set<string>()
      const want: string[] = []
      for (const n of lineNames) { if (!seen.has(n)) { seen.add(n); want.push(n) } }
      // Deduped against the lines AND against each other: "+ A  +  A" is one
      // child written twice, not an hour with two of them.
      const extraNames: string[] = []
      for (const n of slot.sheet.extras.map(x => x.trim().toUpperCase())) {
        if (!n || seen.has(n)) continue
        seen.add(n); extraNames.push(n)
      }

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
      // The patient on the line must resolve or nothing happens: that name came
      // from a dropdown, so a value that matches no patient means the cell is
      // not in a state worth writing to the hub.
      if (bad) continue

      // A companion that does not resolve is NOT a reason to refuse the hour.
      //
      // It was. Six real bookings on the East OT board had never reached the
      // hub because of what front desk had typed next to them — "+ ANDALUZ,
      // MARCO LORENZO CBT", "+ CABAL, RUNE EVERY OTHER WEEK", two names run
      // together with a slash. None of those match a patient, so the whole
      // cell was thrown away and Razon, Zapata, Moneda, Lee, Castillo and
      // Robinson sat on the sheet, booked as far as anyone could see, and in
      // no system at all.
      //
      // The note line is free text and always was. So a name that resolves is
      // booked, and one that does not stays on the note line as the text it
      // is — it loses its "+", which is the sheet saying "not read as a
      // patient" — and is reported as unknown. Nothing is silently dropped and
      // nothing holds up the booking beside it.
      const unresolved: string[] = []
      for (const n of extraNames) {
        const ids = byName.get(n) ?? []
        if (ids.length === 1) { resolved.push(ids[0]); continue }
        if (ids.length > 1) {
          report.conflicts.push({ tab: slot.tab, cell: `${slot.day} ${slot.time}`, sheet: n, hub: `${ids.length} patients share that name` })
        } else {
          report.unknownPatients.push(n)
        }
        unresolved.push(n)
      }
      if (resolved.length > MAX_PER_CELL) {
        report.conflicts.push({ tab: slot.tab, cell: `${slot.day} ${slot.time}`, sheet: `${resolved.length} patients`, hub: `at most ${MAX_PER_CELL} fit in one hour` })
        continue
      }

      const { paymentType: pay, hmoProvider } = parsePay(slot.sheet.pay)
      if (blockedRow) await prisma.deckingSlot.delete({ where: { id: blockedRow.id } })

      // Whatever did not resolve is kept, as the note it turned out to be.
      // Stored without its "+" so the next pull reads it back as free text
      // rather than trying to book it again and reporting it unknown for ever.
      const keptNote = [slot.sheet.notes, ...unresolved].filter(Boolean).join(' · ') || null

      // Reuse the rows already there before creating more, so a slot keeps its
      // id — and anything pointing at it, a booking's deckingSlotId included.
      const spare = [...occupants]
      for (const [i, patientId] of resolved.entries()) {
        const row = spare.shift()
        // Each occupant keeps its OWN payment. The second child of a paired
        // hour has a payment line of its own, and falling back to the first
        // child's would misbill an HMO case as cash.
        const typed = i === 1 ? slot.sheet.pay2 : i === 2 ? slot.sheet.pay3 : ''
        const own = typed ? parsePay(typed) : { paymentType: pay, hmoProvider }
        const data = i === 0
          ? { patientId, paymentType: pay, hmoProvider, notes: keptNote }
          : { patientId, paymentType: own.paymentType, hmoProvider: own.hmoProvider }
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

  // Cells the pull has just taken into the hub.
  //
  // Their text has been read and acted on, so the push may write the hub's
  // version over it — that is the whole point of a round trip. Without this
  // the push preserves them instead, because what front desk typed and what
  // the hub made of it are not always the same string: "+ NATIVIDAD, RAFAEL"
  // is stored as the note "NATIVIDAD, RAFAEL" once it turns out to be nobody
  // the clinic has on file. The cell then never settles — preserved on every
  // push, re-applied on every pull, reported unknown every five minutes for
  // as long as it stands.
  const consumed = new Set(report.applied.map(a => `${a.tab}|${a.cell}`))

  // CASH, GL, and one entry per live insurer — mirrored from the Accounting
  // Hub's HMO wallets, so the picker cannot drift from the receivable list.
  const providers = await prisma.hmoProvider.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { name: true } })
  const payOptions = ['CASH', 'GL', ...providers.map(p => `HMO\u2013${p.name.toUpperCase()}`.replace('HMO\u2013', 'HMO \u2013 '))]

  const names = await loadPatientNames(branch)
  // Every tab's id, read once and reused by each writer below.
  const tabs = await loadTabs(api, spreadsheetId)
  const patientRows = await pushPatients(api, spreadsheetId, names, tabs)

  // What this sync last wrote into each cell, per tab. Read once, before any
  // tab is rewritten, so pushTab can tell a cell it wrote from a cell somebody
  // has since typed into — see pushTab.
  const lastWrote = new Map<string, Map<string, string>>()
  try {
    const prev = await api.spreadsheets.values.get({ spreadsheetId, range: `${MAP_TAB}!A2:J` })
    for (const r of prev.data.values ?? []) {
      if (!r || r.length < 7) continue
      const t = String(r[0])
      const m = lastWrote.get(t) ?? new Map<string, string>()
      m.set(`${Number(r[1])}|${Number(r[2])}`, String(r[7] ?? ''))
      lastWrote.set(t, m)
    }
  } catch { /* no map yet — first push writes everything, which is correct */ }

  const mapEntries: (CellRef & { tab: string })[] = []
  // Gathered as the departments go past, and written once at the end.
  const openRows: OpenSlot[] = []
  let bookableHours = 0
  for (const dept of DEPARTMENTS) {
    try {
      const { staff, slots, dated, classes, cases, capacity } = await loadDepartment(branch, dept)
      const grid = buildGrid({ staff, slots, dated, classes, cases, capacity })
      if (!grid) continue
      const free = openSlotsFor(dept, staff, slots, capacity)
      openRows.push(...free)
      // Every hour the department offers, free or not — the denominator of
      // the line at the top of the tab.
      for (const st of staff) {
        for (const day of st.workDays ?? []) {
          const h = st.dayHours?.[day]
          bookableHours += daySlots(h?.startTime ?? st.startTime, h?.endTime ?? st.endTime, { slotsPerDay: st.slotsPerDay, slotMinutes: st.slotMinutes, breakStart: st.breakStart, breakMinutes: st.breakMinutes }).length
        }
      }
      const res = await pushTab(api, spreadsheetId, dept, grid, patientRows, payOptions, client.identity, lastWrote.get(dept), consumed, tabs)
      for (const c of grid.cells) mapEntries.push({ ...c, tab: dept })
      report.pushed.push({ tab: dept, staff: grid.staffCount, rows: res.rows, kept: res.preserved })

      // The interns of this department, on a tab of their own.
      const interns = await loadInterns(branch, dept)
      if (!interns) {
        // Nobody on placement this month. If a previous rotation left a tab
        // behind, clear it rather than leaving last month's board sitting there
        // looking fillable.
        await blankTab(api, spreadsheetId, `${dept} INTERNS`,
          `No ${dept} interns on placement this month. Their placement months live on the HR staff profile — once a new rotation starts, this tab fills itself in.`)
      }
      if (interns) {
        const iGrid = buildGrid({ ...interns })
        if (iGrid) {
          const iTab = `${dept} INTERNS`
          const iRes = await pushTab(api, spreadsheetId, iTab, iGrid, patientRows, payOptions, client.identity, lastWrote.get(iTab), consumed, tabs)
          for (const c of iGrid.cells) mapEntries.push({ ...c, tab: iTab })
          report.pushed.push({ tab: iTab, staff: iGrid.staffCount, rows: iRes.rows, kept: iRes.preserved })
        }
      }
    } catch (e) {
      report.errors.push(`${dept}: ${(e as Error).message}`)
    }
  }
  await pushMap(api, spreadsheetId, mapEntries, tabs)

  // The open-slot board. Built last, from what the departments just reported,
  // so it can never describe a layout the sync has already moved on from.
  try {
    const label = branch === 'SBEA' ? 'AURA HEALTH EAST' : branch === 'SBGH' ? 'AURA HEALTH GREENHILLS' : branch
    await pushOpenSlots(api, spreadsheetId, label, openRows, bookableHours, tabs)
  } catch (e) {
    // The boards are the point; a list OF the boards is not worth failing for.
    report.errors.push(`open slots: ${(e as Error).message}`)
  }

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
