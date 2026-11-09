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

export const ROWS_PER_HOUR = 3        // name, payment, remark
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
export const FREE_TEXT_HINT = 'Free text  ·  type "+ name" to add another patient'

/**
 * Every prompt this line has ever shown.
 *
 * splitRemark treats any of them as empty. Without the older wording in here,
 * changing the prompt would turn thousands of existing placeholder cells into
 * real notes on the next pull — the sheet would look unchanged and every slot
 * in the clinic would quietly acquire one.
 */
export const FREE_TEXT_HINTS = ['Free text', FREE_TEXT_HINT]
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
}

export interface SheetSlot {
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

/** What one editable cell stands for, and what the sheet was last set to. */
export interface CellRef {
  row: number
  col: number
  staffId: string
  dayOfWeek: string
  startTime: string
  /** YYYY-MM-DD for a one-off, empty for the weekly pattern. */
  date: string
  /** Which of the three lines this is. */
  line: 'name' | 'pay' | 'remark'
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

function hoursBetween(start: string, end: string): number[] {
  const out: number[] = []
  for (let h = parseInt(start.slice(0, 2), 10); h < parseInt(end.slice(0, 2), 10); h++) out.push(h)
  return out
}
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
  validate: { row: number; col: number; kind: 'name' | 'pay' }[]
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

/** What the sheet should show on the remark line, overflow patients included. */
export function remarkFor(occupants: SheetSlot[], blocked: SheetSlot | undefined): string {
  const own = blocked ?? occupants[0] ?? null
  const overflow = occupants.slice(1).map(x => String(x.patient).toUpperCase())
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
  { staff, slots, dated = [] }: { staff: SheetStaff[]; slots: SheetSlot[]; dated?: SheetSlot[] },
): Grid | null {
  const live = staff.filter(s => (s.workDays ?? []).length > 0 && hoursBetween(s.startTime, s.endTime).length > 0)
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

  // ONE time axis for the whole tab. Per-block axes meant a therapist starting
  // at 11 sat level with two starting at 10, so reading across a band landed on
  // a different hour in every block.
  const axisStart = Math.min(...live.map(s => parseInt(s.startTime.slice(0, 2), 10)))
  const axisEnd = Math.max(...live.map(s => parseInt(s.endTime.slice(0, 2), 10)))
  const AXIS: number[] = []
  for (let h = axisStart; h < axisEnd; h++) AXIS.push(h)

  const k = Math.max(...live.map(s => s.workDays.length))
  const stride = k + 2
  // Three blocks across while they are narrow, two when they are not. Fixing
  // the day count would truncate the consultants who work six days.
  const perBand = k <= 3 ? 3 : 2
  const totalCols = perBand * stride - 1
  if (totalCols >= SAFE_COL) {
    throw new Error(`Grid needs ${totalCols} columns and would reach front desk's space at column ${SAFE_COL}.`)
  }

  const blocks = live.map(st => ({
    st,
    days: DAYS.filter(d => st.workDays.includes(d.key)),
    own: new Set(hoursBetween(st.startTime, st.endTime)),
  }))

  const rows: { values: Cell[] }[] = []
  const merges: Grid['merges'] = []
  const validate: Grid['validate'] = []
  const editable: Grid['editable'] = []
  const cells: CellRef[] = []

  for (let b = 0; b < blocks.length; b += perBand) {
    const band = blocks.slice(b, b + perBand)
    const bandRows = 2 + AXIS.length * ROWS_PER_HOUR
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

        const idx = r - 2
        const hourIdx = Math.floor(idx / ROWS_PER_HOUR)
        const line: CellRef['line'] = idx % ROWS_PER_HOUR === 0 ? 'name' : idx % ROWS_PER_HOUR === 1 ? 'pay' : 'remark'
        if (hourIdx >= AXIS.length) return
        const h = AXIS[hourIdx]

        if (line === 'name') {
          put(0, cell(hourLabel(h), { textFormat: { bold: true, fontSize: 9 } }))
          merges.push({ startRowIndex: top + r, endRowIndex: top + r + ROWS_PER_HOUR, startColumnIndex: base, endColumnIndex: base + 1 })
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
        if (!blk.own.has(h)) {
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
          if (!day) { put(c, formulaCell(`=IMAGE("${HATCH_URL}",2)`, { backgroundColor: rgb(OFF_BG) })); continue }

          const here = slotAt.get(`${blk.st.id}|${day.key}|${hhmm(h)}`) ?? []
          const occupants = here.filter(x => x.patient)
          const blocked = here.find(x => x.disabled)
          const name = nameFor(occupants, blocked)
          const pay = blocked || !occupants[0] ? '' : payLabel(occupants[0].paymentType, occupants[0].hmoProvider)
          const remark = remarkFor(occupants, blocked)

          const value = line === 'name' ? name : line === 'pay' ? pay : remark
          cells.push({ row: top + r, col: base + c, staffId: blk.st.id, dayOfWeek: day.key, startTime: hhmm(h), date: '', line, wrote: value })

          if (line !== 'remark') validate.push({ row: top + r, col: base + c, kind: line })

          // Editable is decided per SLOT, and a blocked hour is not one.
          //
          // This used to be one rectangle covering each therapist's whole span,
          // which left N/A and BREAK cells inside it — so an hour the clinic had
          // deliberately closed could be reopened from the spreadsheet, and the
          // decision to close it lived in two places. Blocking stays available
          // here; UNblocking is a hub decision.
          if (line === 'name' && !blocked) {
            editable.push({
              startRowIndex: top + r,
              endRowIndex: top + r + ROWS_PER_HOUR,
              startColumnIndex: base + c,
              endColumnIndex: base + c + 1,
            })
          }

          if (line === 'remark') {
            put(c, remark
              ? cell(remark, { backgroundColor: rgb(REMARK_BG), textFormat: { fontSize: 8, italic: true, foregroundColor: rgb('#6B7280') } })
              : cell(FREE_TEXT_HINT, { backgroundColor: rgb(REMARK_BG), textFormat: { fontSize: 8, italic: true, foregroundColor: rgb('#B3AFA4') } }))
          } else if (line === 'pay') {
            // Coloured by the CATEGORY, so "HMO – INTELLICARE" is amber like
            // any other HMO rather than falling back to the cash green.
            put(c, cell(pay, { backgroundColor: rgb(PAY_BG), textFormat: { bold: true, fontSize: 8, foregroundColor: rgb(pay.startsWith('HMO') ? INK.HMO : INK[pay as keyof typeof INK] ?? INK.CASH) } }))
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

          cells.push({ row: top + r, col: base + 1, staffId, dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, date: dateStr, line, wrote: value })
          if (line !== 'remark') validate.push({ row: top + r, col: base + 1, kind: line })
          if (line === 'name' && !blocked) {
            editable.push({ startRowIndex: top + r, endRowIndex: top + r + ROWS_PER_HOUR, startColumnIndex: base + 1, endColumnIndex: base + 2 })
          }

          if (line === 'remark') {
            put(1, remark
              ? cell(remark, { backgroundColor: rgb(REMARK_BG), textFormat: { fontSize: 8, italic: true, foregroundColor: rgb('#6B7280') } })
              : cell(FREE_TEXT_HINT, { backgroundColor: rgb(REMARK_BG), textFormat: { fontSize: 8, italic: true, foregroundColor: rgb('#B3AFA4') } }))
          } else if (line === 'pay') {
            put(1, cell(pay, { backgroundColor: rgb(PAY_BG), textFormat: { bold: true, fontSize: 8, foregroundColor: rgb(pay.startsWith('HMO') ? INK.HMO : INK[pay as keyof typeof INK] ?? INK.CASH) } }))
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

  return { rows, merges, validate, editable, cells, totalCols, perBand, k, staffCount: live.length }
}
