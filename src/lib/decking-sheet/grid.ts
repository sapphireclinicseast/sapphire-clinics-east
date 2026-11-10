// Building a decking tab: the layout, as data.
//
// Pure — it takes the hub's rows and returns cells, merges, dropdown targets,
// editable rectangles and the cell map. Nothing here talks to Google, so the
// layout can be reasoned about and changed without a spreadsheet in the loop.
//
// The shape copies the sheet front desk already keep by hand: a block per
// therapist, only their working days as columns, the patient's name with the
// payment beneath it, N/A for an hour nobody may be booked into. What differs
// is that each value gets its own cell, so each can be validated.

import { daySlots, isCustomLength } from '@/lib/decking-slots'

export const ROWS_PER_HOUR = 3        // name, payment, remark
/**
 * Departments that run group hours get a second patient line of their own.
 *
 * SLP sessions routinely put two children with one therapist, and the "+ name"
 * convention on the notes line asks front desk to remember a syntax. A real
 * dropdown cannot share a cell with free text, so the second patient gets its
 * own line — and its own PAYMENT line, because inheriting the first child's
 * arrangement would quietly misbill an HMO case as cash.
 *
 * SLP only. OT and SPED run one child per hour; SPED group work is a CLASS,
 * which has its own board and its own block shape. Five lines per hour costs a
 * board a third of its height, which is not worth paying where the second
 * patient does not arise — and a second row that is always empty reads as a
 * board that is half unfilled.
 */
/**
 * Retired, and deliberately left here as a name that resolves to nothing.
 *
 * Sharing an hour is a property of the HOUR, not of a department. This was a
 * department-wide flag, so every SLP hour in both clinics carried a second
 * patient line — a third of the board's height — for the sake of the single
 * hour that actually had two children in it. Which hours are shared is now
 * declared per cell and read from DeckingSlotCapacity.
 */
export const PAIRED_DEPARTMENTS = new Set<string>()
/** Most patients one cell may hold. The board refuses a fourth. */
export const MAX_LINES = 3
export const SAFE_COL = 26            // column AA — front desk's own space
/**
 * What an empty notes line says.
 *
 * It said "Free text", which told front desk the line was theirs but not what
 * it could do — and the one thing they most need from it, a second patient in
 * the same hour, is invisible unless somebody tells them the "+" convention.
 *
 * A dropdown here is not an option: a Sheets cell can carry data validation or
 * free text, not both, and a validated cell flags every typed note as invalid.
 * So the prompt itself carries the instruction.
 */
// Short enough to sit on ONE line in a 120px column at 7pt. The long form wrapped
// to two lines in every empty slot, which across a full board cost more vertical
// space than the bookings did. The full wording moved to the cell's note, where
// it is a hover away instead of permanently on screen.
export const FREE_TEXT_HINT = 'Free text  ·  "+ name"'
export const FREE_TEXT_NOTE = 'Type anything here — "CBT only", "BS only", "1k".\n\nTo add another patient to this same hour, type "+ " and their name, e.g. "+ DELA CRUZ, JUAN".'
/** Every wording this line has ever shown. All of them read as empty. */
const FREE_TEXT_HINT_LEGACY = 'Free text  ·  type "+ name" to add another patient'

/**
 * Every prompt this line has ever shown.
 *
 * splitRemark treats any of them as empty. Without the older wording in here,
 * changing the prompt would turn thousands of existing placeholder cells into
 * real notes on the next pull — the sheet would look unchanged and every slot
 * in the clinic would quietly acquire one.
 */
export const FREE_TEXT_HINTS = ['Free text', FREE_TEXT_HINT, FREE_TEXT_HINT_LEGACY]
export const BLOCKED = 'N/A'
export const BREAK = 'BREAK'
/** "HMO – INTELLICARE", the way front desk already write it on their own sheet. */
export const HMO_JOIN = ' \u2013 '
export function payLabel(paymentType: string | null, provider: string | null): string {
  const t = (paymentType ?? 'CASH').toUpperCase()
  return t === 'HMO' && provider ? `HMO${HMO_JOIN}${provider.toUpperCase()}` : t
}
/** The inverse, for reading a sheet back. Accepts either dash. */
export function parsePay(value: string): { paymentType: string; hmoProvider: string | null } {
  const v = String(value ?? '').trim().toUpperCase()
  if (v.startsWith('HMO')) {
    const rest = v.slice(3).replace(/^[\s\u2013\u2014-]+/, '').trim()
    return { paymentType: 'HMO', hmoProvider: rest || null }
  }
  return { paymentType: v === 'GL' ? 'GL' : 'CASH', hmoProvider: null }
}

export const DAYS = [
  { key: 'MON', label: 'MONDAY' }, { key: 'TUE', label: 'TUESDAY' },
  { key: 'WED', label: 'WEDNESDAY' }, { key: 'THU', label: 'THURSDAY' },
  { key: 'FRI', label: 'FRIDAY' }, { key: 'SAT', label: 'SATURDAY' },
  { key: 'SUN', label: 'SUNDAY' },
] as const

export interface SheetStaff {
  id: string
  firstName: string
  lastName: string
  /** Overrides the block header. Interns carry their supervisor here. */
  label?: string
  workDays: string[]
  startTime: string
  endTime: string
  /** Patients a day, when the day is not one slot per whole hour. */
  slotsPerDay?: number | null
  /**
   * Hours for ONE named day, where that day's hours are not the block's.
   *
   * A consultant holds a schedule per service: a general one, and a narrower
   * row for on-site or teletherapy. The board is per DEPARTMENT, not per
   * service, so it has to show every day they work — but each day on the hours
   * that actually govern it, which is the service row where one covers that
   * day and the general row everywhere else.
   *
   * Without this the tab could only pick one of those rows, and a consultant
   * whose teletherapy row was the newer one had her clinic days drawn with her
   * teletherapy hours — or not drawn at all. Her booked children then sat in
   * the hub with nowhere on the sheet to appear.
   */
  dayHours?: Record<string, { startTime: string; endTime: string }>
}

export interface SheetSlot {
  /** The DeckingSlot row id. A one-off sheet row IS one of these. */
  id?: string
  staffId: string
  dayOfWeek: string
  startTime: string
  /** Needed for one-offs, which are not whole hours. */
  endTime: string
  disabled: boolean
  paymentType: string | null
  hmoProvider: string | null
  notes: string | null
  patient: string | null      // "SURNAME, Firstname", already uppercased upstream
  patientId: string | null
  dp: number | null           // downpayment taken against this slot, if any
  /** YYYY-MM-DD when this is a one-off rather than part of the weekly pattern. */
  date?: string | null
}

/**
 * One class hour, with everybody in it.
 *
 * A class is a group session — five children with one SPED teacher — held in
 * the hub as one booking per child against the same hour. The weekly grid has
 * a single patient line per slot, so it can only ever draw the first of them;
 * listing the class whole, below the grid, is what lets front desk see that
 * the hour is taken and by whom.
 *
 * Read-only on the sheet. A class is composed in the hub, where adding a child
 * checks the roll and the billing; a name typed over on a spreadsheet would be
 * a way to lose one rather than a way to add one.
 */
export interface SheetClass {
  staffId: string
  dayOfWeek: string
  startTime: string
  endTime: string
  /** YYYY-MM-DD when the class is a one-off rather than part of the week. */
  date?: string | null
  /** "SURNAME, Firstname", already uppercased upstream. */
  patients: string[]
  /** Already formatted, e.g. "CASH" or "HMO – INTELLICARE". */
  payment: string
}

/** What one editable cell stands for, and what the sheet was last set to. */
export interface CellRef {
  row: number
  col: number
  staffId: string
  dayOfWeek: string
  startTime: string
  /**
   * For a ONE-OFF, the DeckingSlot row this cell is: its identity.
   *
   * A consultant can hold two one-offs on the same date with the same start AND
   * the same end — a 10:30–11:00 left over from an earlier split sitting beside
   * the real 10:30–11:00. No combination of times tells those apart, so keying
   * on times merged them in the map: one row's typed name was dropped on every
   * pull, and an edit to one could be applied to the other. That is how the
   * same patient comes to be shown against two rows.
   *
   * Empty for weekly cells, which are not one row but a CELL that may hold
   * several patients, and whose (staff, day, start) is already unique.
   */
  slotId: string
  /** YYYY-MM-DD for a one-off, empty for the weekly pattern. */
  date: string
  /** Which of the three lines this is. */
  line: 'name' | 'pay' | 'name2' | 'pay2' | 'name3' | 'pay3' | 'remark'
  /** The value this sync wrote. The next pull compares against it. */
  wrote: string
}

const rgb = (hex: string) => ({
  red: parseInt(hex.slice(1, 3), 16) / 255,
  green: parseInt(hex.slice(3, 5), 16) / 255,
  blue: parseInt(hex.slice(5, 7), 16) / 255,
})

export const INK = { CASH: '#15803D', HMO: '#B45309', GL: '#93460B', NA: '#DC2626' }
const BLOCK_BG = '#1F3A5F'
const HEAD_BG = '#E8EDF2'
const OFF_BG = '#EDEFF1'
// Sheets cannot fill a cell with a pattern, and =IMAGE takes no data URI — so
// the hatching is a real image the hub serves. Drawn as slash characters
// before this, which read as hatching from a distance and as typed text up
// close.
const HATCH_URL = `${process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'https://operations.sapphireclinicseast.org'}/api/public/hatch.png`
const PAY_BG = '#E4EEF9'
const REMARK_BG = '#FBF3E2'
const PAIR_BG = '#F4F1FB'   // the second child of a paired hour
/** A closed hour's own grey. Matches the rule that greys N/A live on the sheet. */
export const CLOSED_BG = '#E8EAED'
// The classes list. Its own colour, distinct from the pink of the one-off
// blocks, so the two lists below the grid are not read as one.
const CLASS_BG = '#0F766E'
const CLASS_HEAD_BG = '#115E59'
const CLASS_SUB_BG = '#CCFBF1'

const BORDER = {
  top: { style: 'SOLID', color: rgb('#D0D7DE') },
  bottom: { style: 'SOLID', color: rgb('#D0D7DE') },
  left: { style: 'SOLID', color: rgb('#D0D7DE') },
  right: { style: 'SOLID', color: rgb('#D0D7DE') },
}

type Cell = Record<string, unknown>
const cell = (value: string, fmt: Record<string, unknown> = {}): Cell => ({
  userEnteredValue: value === '' ? {} : { stringValue: value },
  userEnteredFormat: {
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP',
    borders: BORDER, ...fmt,
    // Merged rather than spread, so a cell can still choose its own size,
    // weight and colour without dropping the typeface.
    textFormat: { fontFamily: 'Roboto', ...((fmt.textFormat as Record<string, unknown>) ?? {}) },
  },
})
const blank = (): Cell => ({ userEnteredValue: {}, userEnteredFormat: {} })
/** A cell whose value is a formula rather than text. */
const formulaCell = (formula: string, fmt: Record<string, unknown> = {}): Cell => ({
  userEnteredValue: { formulaValue: formula },
  userEnteredFormat: {
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    borders: BORDER, ...fmt,
  },
})

/** One row of a band's time axis. */
interface AxisSlot { startTime: string; endTime: string; label: string }

export function hourLabel(h: number): string {
  const tw = (x: number) => (x % 12 === 0 ? 12 : x % 12)
  const m = (x: number) => (x % 24 < 12 ? 'AM' : 'PM')
  return `${tw(h)} - ${tw(h + 1)} ${m(h + 1)}`
}
export const hhmm = (h: number) => `${String(h).padStart(2, '0')}:00`

/**
 * "09:00 – 09:30" for a one-off.
 *
 * The weekly grid is hourly by construction, so hourLabel() serves it. A dated
 * slot is not: a doctor giving the clinic 9 to 12 for six patients makes six
 * half-hours, and labelling those by the hour they start in would print
 * "9 - 10 AM" three times over.
 */
export function spanLabel(startTime: string, endTime: string): string {
  const pretty = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const tw = h % 12 === 0 ? 12 : h % 12
    const ap = h % 24 < 12 ? 'AM' : 'PM'
    return m ? `${tw}:${String(m).padStart(2, '0')} ${ap}` : `${tw} ${ap}`
  }
  return `${pretty(startTime)} – ${pretty(endTime)}`
}

export interface Grid {
  rows: { values: Cell[] }[]
  merges: { startRowIndex: number; endRowIndex: number; startColumnIndex: number; endColumnIndex: number }[]
  /**
   * Cells that carry a dropdown — and, when `locked`, one that must NOT.
   *
   * A closed hour keeps its place in this list because the colouring rules are
   * built from it, but it is skipped when the dropdowns are written: an hour
   * shown as N/A offering a choice of CASH, GL or HMO invites a payment to be
   * recorded against a slot nobody can be booked into.
   */
  validate: { row: number; col: number; kind: 'name' | 'pay'; locked?: boolean }[]
  editable: { startRowIndex: number; endRowIndex: number; startColumnIndex: number; endColumnIndex: number }[]
  cells: CellRef[]
  totalCols: number
  perBand: number
  k: number
  staffCount: number
}

/** What the sheet should show for one cell's patient line. */
export function nameFor(occupants: SheetSlot[], blocked: SheetSlot | undefined): string {
  if (blocked) return String(blocked.notes ?? '').trim().toUpperCase() === BREAK ? BREAK : BLOCKED
  return occupants[0]?.patient ? String(occupants[0].patient).toUpperCase() : ''
}

/**
 * What the sheet should show on the remark line, overflow patients included.
 *
 * `shown` is how many patient LINES this cell has. Anyone past that has
 * nowhere of their own to appear, so they fall back to "+ NAME" here — which
 * is now the exception rather than the mechanism, because a declared capacity
 * gives a shared hour real dropdown lines instead.
 */
export function remarkFor(occupants: SheetSlot[], blocked: SheetSlot | undefined, shown = 1): string {
  const own = blocked ?? occupants[0] ?? null
  const overflow = occupants.slice(shown).map(x => String(x.patient).toUpperCase())
  // A downpayment the clinic has already taken, stated by the hub rather than
  // remembered by a person. This is the whole reason the booking→slot link was
  // worth fixing.
  const dp = occupants[0]?.dp
  const paid = dp ? `${Number(dp) >= 1000 ? `${Math.round(Number(dp) / 1000)}k` : Number(dp)} paid` : ''
  return [own?.notes, paid, overflow.length ? `+ ${overflow.join('  +  ')}` : '']
    .map(t => String(t ?? '').trim())
    .filter(t => t && t.toUpperCase() !== BREAK)
    .join('  ·  ')
}

export function buildGrid(
  { staff, slots, dated = [], classes = [], capacity = new Map() }:
    {
      staff: SheetStaff[]; slots: SheetSlot[]; dated?: SheetSlot[]; classes?: SheetClass[]
      /** `staffId|DAY|HH:MM` → patients that cell holds, where it is not one. */
      capacity?: Map<string, number>
    },
): Grid | null {
  // A consultant is on the board if they work days and those days divide into
  // at least one slot. Tested through daySlots, not hoursBetween: a doctor who
  // gives the clinic 1:00–1:40 for two patients has no whole hour at all, and
  // the hour test dropped them from the sheet entirely.
  const live = staff.filter(s =>
    (s.workDays ?? []).length > 0 && daySlots(s.startTime, s.endTime, s.slotsPerDay).length > 0)
  if (live.length === 0) return null

  // A cell can hold up to three patients, so this maps to an ARRAY. Keyed to a
  // single slot, a second patient in the same hour overwrote the first and
  // vanished from the board entirely.
  const slotAt = new Map<string, SheetSlot[]>()
  for (const s of slots) {
    const k = `${s.staffId}|${s.dayOfWeek}|${s.startTime}`
    slotAt.set(k, [...(slotAt.get(k) ?? []), s])
  }
  for (const list of slotAt.values()) {
    list.sort((a, b) => String(a.patient ?? '').localeCompare(String(b.patient ?? '')))
  }

  // ── How many patient lines each cell gets ────────────────────────────────
  //
  // One, unless the hour has been declared shared — and never fewer than the
  // patients already in it, so a cell can never hold somebody it cannot draw.
  // Everything downstream reads this and nothing else: a department-wide
  // "paired" flag used to decide it, which gave every SLP hour in the clinic a
  // second line for the sake of the one hour that needed it.
  const capOf = (staffId: string, day: string, time: string) => {
    const k = `${staffId}|${day}|${time}`
    const here = (slotAt.get(k) ?? []).filter(x => x.patient).length
    return Math.min(MAX_LINES, Math.max(1, capacity.get(k) ?? 1, here))
  }
  /** name + payment for each patient, then the one shared notes line. */
  const rowsForLines = (lines: number) => lines * 2 + 1

  // ONE time axis for the whole tab. Per-block axes meant a therapist starting
  // at 11 sat level with two starting at 10, so reading across a band landed on
  // a different hour in every block.
  //
  // That shared axis is made of whole hours, which is why a consultant on a
  // patient COUNT cannot sit on it: their rows start at 1:54 and 2:48 and line
  // up with nobody. Those consultants are split out below and given a band of
  // their own, labelled by span. Everyone else keeps the aligned axis.
  const hourly = live.filter(s => !isCustomLength(s.slotsPerDay))
  const custom = live.filter(s => isCustomLength(s.slotsPerDay))

  const axisOf = (list: SheetStaff[]): AxisSlot[] => {
    const from = Math.min(...list.map(s => parseInt(s.startTime.slice(0, 2), 10)))
    const to = Math.max(...list.map(s => parseInt(s.endTime.slice(0, 2), 10)))
    const out: AxisSlot[] = []
    for (let h = from; h < to; h++) out.push({ startTime: hhmm(h), endTime: hhmm(h + 1), label: hourLabel(h) })
    return out
  }
  const SHARED: AxisSlot[] = hourly.length ? axisOf(hourly) : []

  const k = Math.max(...live.map(s => s.workDays.length))
  const stride = k + 2
  // Three blocks across while they are narrow, two when they are not. Fixing
  // the day count would truncate the consultants who work six days.
  const perBand = k <= 3 ? 3 : 2
  const totalCols = perBand * stride - 1
  if (totalCols >= SAFE_COL) {
    throw new Error(`Grid needs ${totalCols} columns and would reach front desk's space at column ${SAFE_COL}.`)
  }

  const blockOf = (st: SheetStaff, _axis: AxisSlot[]) => ({
    st,
    days: DAYS.filter(d => st.workDays.includes(d.key)),
    // Which rows of this band's axis are actually theirs, PER DAY. Keyed by
    // start TIME rather than by hour number, so a 54-minute row is as
    // addressable as a whole hour. Everything else in the band is hatched.
    //
    // Per day, because a consultant's hours are not the same on every day they
    // work: a teletherapy Friday of 13:00–16:00 sits beside a clinic Thursday
    // of 09:00–19:00. One set for the whole block had to pick one of the two,
    // and whichever it picked made the other day's bookings undrawable.
    own: new Map(st.workDays.map(d => {
      const h = st.dayHours?.[d]
      return [d, new Set(
        daySlots(h?.startTime ?? st.startTime, h?.endTime ?? st.endTime, st.slotsPerDay).map(x => x.startTime),
      )] as const
    })),
  })

  // Bands, in order: the aligned hourly ones, then one per custom consultant.
  const bands: { members: ReturnType<typeof blockOf>[]; axis: AxisSlot[] }[] = []
  for (let b = 0; b < hourly.length; b += perBand) {
    bands.push({ members: hourly.slice(b, b + perBand).map(st => blockOf(st, SHARED)), axis: SHARED })
  }
  for (const st of custom) {
    const axis: AxisSlot[] = daySlots(st.startTime, st.endTime, st.slotsPerDay)
      .map(x => ({ ...x, label: spanLabel(x.startTime, x.endTime) }))
    bands.push({ members: [blockOf(st, axis)], axis })
  }

  const rows: { values: Cell[] }[] = []
  const merges: Grid['merges'] = []
  const validate: Grid['validate'] = []
  const editable: Grid['editable'] = []
  const cells: CellRef[] = []

  for (const { members: band, axis: AXIS } of bands) {
    // ── This band's row heights, hour by hour ──────────────────────────────
    //
    // An hour is as tall as the most crowded cell ON THAT ROW, not as the most
    // crowded cell on the tab. The blocks in a band share a time axis, so one
    // shared 10 o'clock does make every block's 10 o'clock taller — but it
    // leaves 11, and every other band, alone. Sized tab-wide instead, one
    // three-patient hour would have added four rows to all three hundred.
    const linesAt = AXIS.map(h => Math.max(
      1,
      ...band.flatMap(blk => blk.days.map(d => capOf(blk.st.id, d.key, h.startTime))),
    ))
    /** Local row of the band each hour starts at, the two header rows aside. */
    const startOf: number[] = []
    const layout: { hourIdx: number; within: number }[] = []
    linesAt.forEach((lines, hourIdx) => {
      startOf.push(layout.length)
      for (let within = 0; within < rowsForLines(lines); within++) layout.push({ hourIdx, within })
    })
    const bandRows = 2 + layout.length
    const top = rows.length

    for (let r = 0; r < bandRows; r++) {
      const values: Cell[] = Array.from({ length: totalCols }, () => blank())
      band.forEach((blk, i) => {
        const base = i * stride
        const put = (off: number, c: Cell) => { values[base + off] = c }

        if (r === 0) {
          put(0, cell((blk.st.label ?? `${blk.st.lastName}, ${blk.st.firstName}`).toUpperCase(), {
            backgroundColor: rgb(BLOCK_BG),
            textFormat: { bold: true, fontSize: 10, foregroundColor: rgb('#FFFFFF') },
          }))
          for (let c = 1; c <= k; c++) put(c, cell('', { backgroundColor: rgb(BLOCK_BG) }))
          merges.push({ startRowIndex: top, endRowIndex: top + 1, startColumnIndex: base, endColumnIndex: base + k + 1 })
          return
        }
        if (r === 1) {
          put(0, cell('TIME', { backgroundColor: rgb(HEAD_BG), textFormat: { bold: true, fontSize: 9 } }))
          for (let c = 1; c <= k; c++) {
            put(c, cell(blk.days[c - 1]?.label ?? '', { backgroundColor: rgb(HEAD_BG), textFormat: { bold: true, fontSize: 9 } }))
          }
          return
        }

        const at = layout[r - 2]
        if (!at) return
        const { hourIdx, within } = at
        const h = AXIS[hourIdx]
        // How many patient lines THIS HOUR has across the band, and which of
        // them this row is. The notes line is always the last.
        const bandLines = linesAt[hourIdx]
        const perHour = rowsForLines(bandLines)
        const slotIndex = Math.floor(within / 2)        // 0, 1, 2 — which patient
        const line: CellRef['line'] = within === perHour - 1
          ? 'remark'
          : within % 2 === 0
            ? (['name', 'name2', 'name3'] as const)[slotIndex]
            : (['pay', 'pay2', 'pay3'] as const)[slotIndex]

        if (within === 0) {
          put(0, cell(h.label, { textFormat: { bold: true, fontSize: 9 } }))
          merges.push({ startRowIndex: top + r, endRowIndex: top + r + perHour, startColumnIndex: base, endColumnIndex: base + 1 })
        } else {
          put(0, cell(''))
        }

        // Hours outside this therapist's own span are HATCHED, not blank: a
        // blank cell reads as "open — book someone here", which is wrong, and
        // flat grey alone was being mistaken for a cell somebody had shaded.
        //
        // Sheets has no pattern fill, so the diagonals are drawn as text — a
        // run of light slashes on the grey. These cells are decorative: they
        // carry no slot, are never written to the map, and the sync never reads
        // them, so text here cannot be mistaken for data.
        //
        // Tested across the block's days first, so a row no day of theirs
        // reaches is still hatched in one go; days are then checked one at a
        // time below, because this hour can belong to their Thursday and not
        // to their Friday.
        if (!blk.days.some(d => blk.own.get(d.key)?.has(h.startTime))) {
          for (let c = 1; c <= k; c++) {
            // Mode 2 stretches the tile to the cell. The image is already
            // close to a cell's proportions, so the diagonals stay at 45°
            // instead of flattening out.
            put(c, formulaCell(`=IMAGE("${HATCH_URL}",2)`, { backgroundColor: rgb(OFF_BG) }))
          }
          return
        }

        for (let c = 1; c <= k; c++) {
          const day = blk.days[c - 1]
          // A column this consultant has no day for. Hatched down the whole
          // block, not left white: the column count comes from the widest
          // consultant in the department, so a one-day therapist carries spare
          // columns that are not hours at all. Blank during their shift and
          // hatched outside it — which is what this did — says two different
          // things about the same column.
          //
          // Hatched too when this hour is outside what THIS day gives the
          // clinic, which is how a 13:00–16:00 teletherapy Friday sits beside
          // a 09:00–19:00 Thursday without either one claiming the other's
          // hours.
          if (!day || !blk.own.get(day.key)?.has(h.startTime)) {
            put(c, formulaCell(`=IMAGE("${HATCH_URL}",2)`, { backgroundColor: rgb(OFF_BG) }))
            continue
          }

          const here = slotAt.get(`${blk.st.id}|${day.key}|${h.startTime}`) ?? []
          const occupants = here.filter(x => x.patient)
          const blocked = here.find(x => x.disabled)
          // This CELL's own capacity, which can be less than the row's: the
          // hour next door is shared, this one is not. The lines past it are
          // spare rows of a taller band, not slots anybody may book into.
          const cellLines = capOf(blk.st.id, day.key, h.startTime)
          const spare = slotIndex >= cellLines

          // Spare lines carry nothing at all — no value, no dropdown, no map
          // entry, nothing the pull can read — so the extra height a shared
          // hour costs its neighbours is only height.
          if (spare && line !== 'remark') {
            put(c, cell('', { backgroundColor: rgb(OFF_BG) }))
            continue
          }

          // Each occupant on their own line, each with their own payment:
          // inheriting the first child's arrangement would misbill an HMO case
          // as cash, a guess the clinic pays for.
          const mine = blocked ? undefined : occupants[slotIndex]
          const name = slotIndex === 0
            ? nameFor(occupants, blocked)
            : (mine?.patient ? String(mine.patient).toUpperCase() : '')
          const pay = blocked || !mine ? '' : payLabel(mine.paymentType, mine.hmoProvider)
          const remark = remarkFor(occupants, blocked, cellLines)

          const value = line === 'remark' ? remark : within % 2 === 0 ? name : pay
          cells.push({ row: top + r, col: base + c, staffId: blk.st.id, dayOfWeek: day.key, startTime: h.startTime, slotId: '', date: '', line, wrote: value })

          if (line === 'remark') { /* free text: no dropdown */ }
          else if (within % 2 === 0) validate.push({ row: top + r, col: base + c, kind: 'name' })
          // A closed hour's payment line keeps its entry — the grey-and-struck
          // rule is built from this list — but is marked so no dropdown is
          // written onto it. An hour showing N/A must not offer a payment.
          else validate.push({ row: top + r, col: base + c, kind: 'pay', locked: !!blocked })

          // Editable is decided per SLOT, and a blocked hour is not one.
          //
          // This used to be one rectangle covering each therapist's whole span,
          // which left N/A and BREAK cells inside it — so an hour the clinic had
          // deliberately closed could be reopened from the spreadsheet, and the
          // decision to close it lived in two places. Blocking stays available
          // here; UNblocking is a hub decision.
          if (line === 'name' && !blocked) {
            const col = { startColumnIndex: base + c, endColumnIndex: base + c + 1 }
            if (cellLines === bandLines) {
              editable.push({ startRowIndex: top + r, endRowIndex: top + r + perHour, ...col })
            } else {
              // The spare lines sit BETWEEN this cell's last payment line and
              // the notes line, so the two editable stretches cannot be one.
              editable.push({ startRowIndex: top + r, endRowIndex: top + r + cellLines * 2, ...col })
              editable.push({ startRowIndex: top + r + perHour - 1, endRowIndex: top + r + perHour, ...col })
            }
          }

          if (line === 'remark') {
            put(c, remark
              ? cell(remark, { backgroundColor: rgb(REMARK_BG), textFormat: { fontSize: 7, italic: true, foregroundColor: rgb('#6B7280') } })
              : { ...cell(FREE_TEXT_HINT, { backgroundColor: rgb(REMARK_BG), textFormat: { fontSize: 7, italic: true, foregroundColor: rgb('#B3AFA4') } }), note: FREE_TEXT_NOTE })
          } else if (within % 2 === 1) {
            // Coloured by the CATEGORY, so "HMO – INTELLICARE" is amber like
            // any other HMO rather than falling back to the cash green.
            put(c, blocked
              // Closed: grey like the hour above it, and empty. The dropdown is
              // gone (see `locked`), so the cell reads as part of the closure
              // rather than as a payment somebody forgot to fill in.
              ? cell('', { backgroundColor: rgb(CLOSED_BG) })
              : cell(pay, { backgroundColor: rgb(PAY_BG), textFormat: { bold: true, fontSize: 8, foregroundColor: rgb(pay.startsWith('HMO') ? INK.HMO : INK[pay as keyof typeof INK] ?? INK.CASH) } }))
          } else if (slotIndex > 0) {
            // Tinted, so a shared hour reads as one hour and not as two.
            put(c, cell(name, { backgroundColor: rgb(blocked ? CLOSED_BG : PAIR_BG), textFormat: { bold: true, fontSize: 9 } }))
          } else {
            put(c, name === BLOCKED || name === BREAK
              ? cell(name, { textFormat: { bold: true, fontSize: 9, foregroundColor: rgb(INK.NA) } })
              : cell(name, { textFormat: { bold: true, fontSize: 9 } }))
          }
        }
      })
      rows.push({ values })
    }
    // Spacers must be explicitly blank across the width: a row with no values
    // clears nothing, which stranded old block headers under new ones.
    rows.push({ values: Array.from({ length: totalCols }, () => blank()) })
    rows.push({ values: Array.from({ length: totalCols }, () => blank()) })
  }

  // ── One-off dates ─────────────────────────────────────────────────────────
  //
  // Consultants who give the clinic named days rather than a standing week —
  // medical doctors mostly, and psychology, some of whom come once a quarter.
  // They cannot go in the grid above: a cell in a weekday column means "every
  // Tuesday", and a single visit drawn there would claim that hour for ever.
  //
  // So they are their own blocks, below, each headed with its actual date. The
  // clinic's own psych sheet is kept exactly this way, which is where the shape
  // comes from.
  const byStaffDate = new Map<string, SheetSlot[]>()
  for (const d of dated) {
    if (!d.date) continue
    const key = `${d.staffId}|${d.date.slice(0, 10)}`
    byStaffDate.set(key, [...(byStaffDate.get(key) ?? []), d])
  }
  const nameOf = new Map(staff.map(st => [st.id, `${st.lastName}, ${st.firstName}`.toUpperCase()]))

  if (byStaffDate.size > 0) {
    rows.push({ values: Array.from({ length: totalCols }, () => blank()) })
    const head = Array.from({ length: totalCols }, () => blank())
    head[0] = cell('ONE-OFF DATES', {
      backgroundColor: rgb('#BE185D'),
      textFormat: { bold: true, fontSize: 10, foregroundColor: rgb('#FFFFFF') },
      horizontalAlignment: 'LEFT',
    })
    for (let c = 1; c < totalCols; c++) head[c] = cell('', { backgroundColor: rgb('#BE185D') })
    merges.push({ startRowIndex: rows.length, endRowIndex: rows.length + 1, startColumnIndex: 0, endColumnIndex: totalCols })
    rows.push({ values: head })

    const keys = [...byStaffDate.keys()].sort((a, b) => {
      const [sa, da] = a.split('|'); const [sb, db] = b.split('|')
      return da.localeCompare(db) || String(nameOf.get(sa)).localeCompare(String(nameOf.get(sb)))
    })

    for (let i = 0; i < keys.length; i += perBand) {
      const band = keys.slice(i, i + perBand)
      const tallest = Math.max(...band.map(key => (byStaffDate.get(key) ?? []).length))
      const top = rows.length
      const bandRows = 2 + tallest * ROWS_PER_HOUR

      for (let r = 0; r < bandRows; r++) {
        const values: Cell[] = Array.from({ length: totalCols }, () => blank())
        band.forEach((key, bi) => {
          const base = bi * stride
          const put = (off: number, c: Cell) => { values[base + off] = c }
          const [staffId, dateStr] = key.split('|')
          const mine = (byStaffDate.get(key) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime))
          const when = new Date(`${dateStr}T00:00:00Z`)

          if (r === 0) {
            put(0, cell(nameOf.get(staffId) ?? '', {
              backgroundColor: rgb('#9D174D'),
              textFormat: { bold: true, fontSize: 10, foregroundColor: rgb('#FFFFFF') },
            }))
            for (let c = 1; c <= k; c++) put(c, cell('', { backgroundColor: rgb('#9D174D') }))
            merges.push({ startRowIndex: top, endRowIndex: top + 1, startColumnIndex: base, endColumnIndex: base + k + 1 })
            return
          }
          if (r === 1) {
            put(0, cell('TIME', { backgroundColor: rgb('#FBCFE8'), textFormat: { bold: true, fontSize: 9 } }))
            // The date IS the column heading here, with its weekday beside it —
            // a one-off is read as "12 November", not as "a Thursday".
            put(1, cell(when.toLocaleDateString('en-PH', { day: 'numeric', month: 'long', timeZone: 'UTC' })
              + ' · ' + when.toLocaleDateString('en-PH', { weekday: 'long', timeZone: 'UTC' }).toUpperCase(),
              { backgroundColor: rgb('#FBCFE8'), textFormat: { bold: true, fontSize: 9 } }))
            for (let c = 2; c <= k; c++) put(c, cell('', { backgroundColor: rgb('#FBCFE8') }))
            if (k > 1) merges.push({ startRowIndex: top + 1, endRowIndex: top + 2, startColumnIndex: base + 1, endColumnIndex: base + k + 1 })
            return
          }

          const idx = r - 2
          const hourIdx = Math.floor(idx / ROWS_PER_HOUR)
          const line: CellRef['line'] = idx % ROWS_PER_HOUR === 0 ? 'name' : idx % ROWS_PER_HOUR === 1 ? 'pay' : 'remark'
          const slot = mine[hourIdx]
          if (!slot) return

          if (line === 'name') {
            put(0, cell(spanLabel(slot.startTime, slot.endTime), { textFormat: { bold: true, fontSize: 9 } }))
            merges.push({ startRowIndex: top + r, endRowIndex: top + r + ROWS_PER_HOUR, startColumnIndex: base, endColumnIndex: base + 1 })
          } else {
            put(0, cell(''))
          }

          const occupants = slot.patient ? [slot] : []
          const blocked = slot.disabled ? slot : undefined
          const name = nameFor(occupants, blocked)
          const pay = blocked || !occupants[0] ? '' : payLabel(occupants[0].paymentType, occupants[0].hmoProvider)
          const remark = remarkFor(occupants, blocked)
          const value = line === 'name' ? name : line === 'pay' ? pay : remark

          cells.push({ row: top + r, col: base + 1, staffId, dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, slotId: slot.id ?? '', date: dateStr, line, wrote: value })
          if (line !== 'remark') validate.push({ row: top + r, col: base + 1, kind: line, locked: line === 'pay' && !!blocked })
          if (line === 'name' && !blocked) {
            editable.push({ startRowIndex: top + r, endRowIndex: top + r + ROWS_PER_HOUR, startColumnIndex: base + 1, endColumnIndex: base + 2 })
          }

          if (line === 'remark') {
            put(1, remark
              ? cell(remark, { backgroundColor: rgb(REMARK_BG), textFormat: { fontSize: 7, italic: true, foregroundColor: rgb('#6B7280') } })
              : { ...cell(FREE_TEXT_HINT, { backgroundColor: rgb(REMARK_BG), textFormat: { fontSize: 7, italic: true, foregroundColor: rgb('#B3AFA4') } }), note: FREE_TEXT_NOTE })
          } else if (line === 'pay') {
            put(1, blocked
              ? cell('', { backgroundColor: rgb(CLOSED_BG) })
              : cell(pay, { backgroundColor: rgb(PAY_BG), textFormat: { bold: true, fontSize: 8, foregroundColor: rgb(pay.startsWith('HMO') ? INK.HMO : INK[pay as keyof typeof INK] ?? INK.CASH) } }))
          } else {
            put(1, name === BLOCKED || name === BREAK
              ? cell(name, { textFormat: { bold: true, fontSize: 9, foregroundColor: rgb(INK.NA) } })
              : cell(name, { textFormat: { bold: true, fontSize: 9 } }))
          }
          for (let c = 2; c <= k; c++) put(c, cell('', { backgroundColor: rgb(OFF_BG) }))
        })
        rows.push({ values })
      }
      rows.push({ values: Array.from({ length: totalCols }, () => blank()) })
      rows.push({ values: Array.from({ length: totalCols }, () => blank()) })
    }
  }

  // ── Classes ───────────────────────────────────────────────────────────────
  //
  // A group hour, listed whole. The grid above has one patient line per slot,
  // so a class of five showed one child and hid four — and since classes were
  // left out of the hub's sheet query entirely, the hour read as free.
  //
  // Nothing here is editable, validated, or written to the cell map, so the
  // pull never reads it back: the list is a view of the hub, not a copy of it.
  const classOf = new Map<string, SheetClass[]>()
  for (const c of classes) {
    if (!c.patients.length) continue
    classOf.set(c.staffId, [...(classOf.get(c.staffId) ?? []), c])
  }
  if (classOf.size > 0) {
    const dayIdx = (d: string) => DAYS.findIndex(x => x.key === d)
    for (const list of classOf.values()) {
      list.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')
        || dayIdx(a.dayOfWeek) - dayIdx(b.dayOfWeek)
        || a.startTime.localeCompare(b.startTime))
    }

    rows.push({ values: Array.from({ length: totalCols }, () => blank()) })
    const head = Array.from({ length: totalCols }, () => blank())
    head[0] = cell('CLASSES  ·  read-only — group sessions are set in the Hub', {
      backgroundColor: rgb(CLASS_BG),
      textFormat: { bold: true, fontSize: 10, foregroundColor: rgb('#FFFFFF') },
      horizontalAlignment: 'LEFT',
    })
    for (let c = 1; c < totalCols; c++) head[c] = cell('', { backgroundColor: rgb(CLASS_BG) })
    merges.push({ startRowIndex: rows.length, endRowIndex: rows.length + 1, startColumnIndex: 0, endColumnIndex: totalCols })
    rows.push({ values: head })

    const keys = [...classOf.keys()].sort((a, b) =>
      String(nameOf.get(a) ?? '').localeCompare(String(nameOf.get(b) ?? '')))

    for (let i = 0; i < keys.length; i += perBand) {
      const band = keys.slice(i, i + perBand)
      // One line per CHILD, so a class of five is five rows tall.
      const tallest = Math.max(...band.map(id =>
        (classOf.get(id) ?? []).reduce((n, c) => n + c.patients.length, 0)))
      const top = rows.length
      const bandRows = 2 + tallest

      for (let r = 0; r < bandRows; r++) {
        const values: Cell[] = Array.from({ length: totalCols }, () => blank())
        band.forEach((staffId, bi) => {
          const base = bi * stride
          const put = (off: number, c: Cell) => { values[base + off] = c }
          const mine = classOf.get(staffId) ?? []

          if (r === 0) {
            put(0, cell(nameOf.get(staffId) ?? '', {
              backgroundColor: rgb(CLASS_HEAD_BG),
              textFormat: { bold: true, fontSize: 10, foregroundColor: rgb('#FFFFFF') },
            }))
            for (let c = 1; c <= k; c++) put(c, cell('', { backgroundColor: rgb(CLASS_HEAD_BG) }))
            merges.push({ startRowIndex: top, endRowIndex: top + 1, startColumnIndex: base, endColumnIndex: base + k + 1 })
            return
          }
          if (r === 1) {
            put(0, cell('WHEN', { backgroundColor: rgb(CLASS_SUB_BG), textFormat: { bold: true, fontSize: 9 } }))
            put(1, cell('IN THE CLASS', { backgroundColor: rgb(CLASS_SUB_BG), textFormat: { bold: true, fontSize: 9 } }))
            for (let c = 2; c <= k; c++) put(c, cell('', { backgroundColor: rgb(CLASS_SUB_BG) }))
            if (k > 1) merges.push({ startRowIndex: top + 1, endRowIndex: top + 2, startColumnIndex: base + 1, endColumnIndex: base + k + 1 })
            return
          }

          // Walk the therapist's classes as one flat list of children, so the
          // when-label can be merged down over the class it belongs to.
          let idx = r - 2
          for (const cls of mine) {
            if (idx < cls.patients.length) {
              if (idx === 0) {
                const when = cls.date
                  ? `${new Date(`${cls.date}T00:00:00Z`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', timeZone: 'UTC' })}  ·  ${spanLabel(cls.startTime, cls.endTime)}`
                  : `${DAYS.find(d => d.key === cls.dayOfWeek)?.label ?? cls.dayOfWeek}\n${spanLabel(cls.startTime, cls.endTime)}`
                put(0, cell(when, { backgroundColor: rgb(CLASS_SUB_BG), textFormat: { bold: true, fontSize: 8 } }))
                if (cls.patients.length > 1) {
                  merges.push({ startRowIndex: top + r, endRowIndex: top + r + cls.patients.length, startColumnIndex: base, endColumnIndex: base + 1 })
                }
              }
              put(1, cell(cls.patients[idx], { textFormat: { fontSize: 9 } }))
              for (let c = 2; c <= k; c++) put(c, cell('', { backgroundColor: rgb(OFF_BG) }))
              return
            }
            idx -= cls.patients.length
          }
          // Shorter than the tallest block in the band: nothing to show.
          for (let c = 0; c <= k; c++) put(c, cell('', { backgroundColor: rgb(OFF_BG) }))
        })
        rows.push({ values })
      }
      rows.push({ values: Array.from({ length: totalCols }, () => blank()) })
      rows.push({ values: Array.from({ length: totalCols }, () => blank()) })
    }
  }

  return { rows, merges, validate, editable, cells, totalCols, perBand, k, staffCount: live.length }
}
