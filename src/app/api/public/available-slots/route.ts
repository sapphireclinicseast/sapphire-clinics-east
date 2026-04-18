// GET /api/public/available-slots?staffId=...&branch=SBEA&department=PT&from=2026-04-20&to=2026-05-04
//
// Returns the open 1-hour slots for a single therapist across a date window,
// computed the same way the Decking Module UI renders availability:
//
//   1. Start from the therapist's DeckingTherapistConfig (workDays + hours),
//      or the branch's DeckingClinicHours if the therapist uses defaults.
//   2. Generate 1-hour cells on each work day where the clinic is open.
//   3. Subtract capacity used by:
//        - DeckingSlot rows at that cell (admin-side recurring assignments)
//        - PatientBooking rows at that date/time (portal bookings)
//      Also skip cells where any DeckingSlot is `disabled = true` (e.g. lunch).
//   4. A cell has capacity for up to 3 patients total (matches the cap in
//      /api/decking/slots).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../_cors'

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
const MAX_PATIENTS_PER_SLOT = 3

// Hardcoded fallback when neither DeckingClinicHours nor DeckingTherapistConfig
// provide hours. Matches DeckingClient.tsx DEFAULT_HOURS.
const DEFAULT_HOURS: Record<string, { startTime: string; endTime: string }> = {
  SBEA: { startTime: '10:00', endTime: '20:00' },
  SBGH: { startTime: '09:00', endTime: '19:00' },
}

interface ClinicHoursDay {
  open: boolean
  openTime: string
  closeTime: string
}

function hoursAt(hm: string): number {
  const [h] = hm.split(':').map(Number)
  return Number.isFinite(h) ? h : 0
}

function generateHourlySlots(startTime: string, endTime: string): Array<{ startTime: string; endTime: string }> {
  const out: Array<{ startTime: string; endTime: string }> = []
  const sh = hoursAt(startTime)
  const eh = hoursAt(endTime)
  for (let h = sh; h < eh; h++) {
    out.push({
      startTime: `${String(h).padStart(2, '0')}:00`,
      endTime: `${String(h + 1).padStart(2, '0')}:00`,
    })
  }
  return out
}

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') ?? ''
  const department = searchParams.get('department') ?? ''
  const staffId = searchParams.get('staffId') ?? ''
  const fromStr = searchParams.get('from') ?? ''
  const toStr = searchParams.get('to') ?? ''

  if (!branch || !department || !fromStr || !toStr) {
    return withCors(
      NextResponse.json(
        { error: 'branch, department, from, to are required (YYYY-MM-DD)' },
        { status: 400 },
      ),
      origin,
    )
  }

  const from = new Date(`${fromStr}T00:00:00.000Z`)
  const to = new Date(`${toStr}T23:59:59.999Z`)
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) {
    return withCors(NextResponse.json({ error: 'invalid date range' }, { status: 400 }), origin)
  }
  const maxMs = 60 * 24 * 60 * 60 * 1000
  if (to.getTime() - from.getTime() > maxMs) {
    return withCors(NextResponse.json({ error: 'range > 60 days' }, { status: 400 }), origin)
  }

  // Load every therapist (of this branch+dept) that we need to consider.
  // If staffId is set, filter to that one; otherwise load all.
  const staffList = await prisma.staff.findMany({
    where: {
      branch,
      department: department as never,
      ...(staffId ? { id: staffId } : {}),
    },
    select: { id: true, firstName: true, lastName: true, sex: true },
  })
  if (staffList.length === 0) {
    return withCors(NextResponse.json({ slots: [] }), origin)
  }

  // Their Decking Module configs (workDays + hours).
  const configs = await prisma.deckingTherapistConfig.findMany({
    where: { staffId: { in: staffList.map((s) => s.id) } },
  })
  const configById = new Map(configs.map((c) => [c.staffId, c]))

  // Branch-level clinic hours (per-day open + open/close times).
  const clinicHoursRow = await prisma.deckingClinicHours.findUnique({ where: { id: branch } })
  const clinicSchedule = (clinicHoursRow?.schedule as Record<string, ClinicHoursDay> | null) ?? null

  // All DeckingSlot rows for these therapists — used for capacity + disabled flag.
  // Filter by branch+dept so we don't scan the whole table.
  const deckingSlots = await prisma.deckingSlot.findMany({
    where: {
      staffId: { in: staffList.map((s) => s.id) },
      branch,
      department,
    },
    select: { staffId: true, dayOfWeek: true, startTime: true, disabled: true, patientId: true },
  })

  // Map (staffId|dayOfWeek|startTime) -> { anyPatient, anyDisabled }.
  // Rule: if ANY patient name is already assigned in that cell in the Decking
  // Module, we exclude the cell entirely from portal self-service (no
  // double-booking even if the admin-side cap of 3 would allow it). Likewise
  // for cells the admin has marked disabled (lunch breaks, etc.).
  const deckingByCell = new Map<string, { anyPatient: boolean; anyDisabled: boolean }>()
  for (const d of deckingSlots) {
    const key = `${d.staffId}|${d.dayOfWeek}|${d.startTime}`
    const cur = deckingByCell.get(key) ?? { anyPatient: false, anyDisabled: false }
    if (d.disabled) cur.anyDisabled = true
    if (d.patientId) cur.anyPatient = true
    deckingByCell.set(key, cur)
  }

  // PatientBooking records in the window that actually lock the slot.
  // PENDING bookings intentionally do NOT hold a seat — multiple patients can
  // submit for the same cell while front desk deliberates. The slot is only
  // locked once the front desk approves (or payment lands).
  const bookings = await prisma.patientBooking.findMany({
    where: {
      staffId: { in: staffList.map((s) => s.id) },
      date: { gte: from, lte: to },
      status: { in: ['APPROVED', 'PAID', 'COMPLETED'] },
    },
    select: { staffId: true, date: true, startTime: true },
  })
  const bookingByCell = new Map<string, number>()
  for (const b of bookings) {
    const dateStr = b.date.toISOString().slice(0, 10)
    const key = `${b.staffId}|${dateStr}|${b.startTime}`
    bookingByCell.set(key, (bookingByCell.get(key) ?? 0) + 1)
  }

  // Helper: resolve work window for a given therapist on a given dayOfWeek.
  // The therapist MUST have a DeckingTherapistConfig row for portal bookings to
  // be enabled — and that config's workDays list gates which days they consult.
  // (Matches the Decking Module, where non-configured therapists have no cells.)
  function windowFor(staffIdLocal: string, dow: string): { startTime: string; endTime: string } | null {
    const cfg = configById.get(staffIdLocal)
    if (!cfg) return null

    const days = (cfg.workDays as string[] | null) ?? []
    if (!days.includes(dow)) return null

    const clinicDay = clinicSchedule?.[dow]
    if (clinicDay && clinicDay.open === false) return null

    if (cfg.useDefault) {
      if (clinicDay) return { startTime: clinicDay.openTime, endTime: clinicDay.closeTime }
      const fallback = DEFAULT_HOURS[branch]
      return fallback ?? null
    }
    return { startTime: cfg.startTime, endTime: cfg.endTime }
  }

  type Out = {
    staffId: string
    initials: string
    sex: 'M' | 'F' | null
    date: string
    startTime: string
    endTime: string
    dayOfWeek: string
  }
  const out: Out[] = []

  const startDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const endDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))

  for (
    let d = new Date(startDay);
    d.getTime() <= endDay.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dow = DAY_NAMES[d.getUTCDay()]
    const dateStr = d.toISOString().slice(0, 10)

    for (const s of staffList) {
      const win = windowFor(s.id, dow)
      if (!win) continue
      const cells = generateHourlySlots(win.startTime, win.endTime)
      if (cells.length === 0) continue

      const rawSex = (s.sex ?? '').trim().toUpperCase()
      const sex: 'M' | 'F' | null = rawSex === 'M' ? 'M' : rawSex === 'F' ? 'F' : null
      const initials = `${s.firstName?.[0] ?? '?'}${s.lastName?.[0] ?? '?'}`.toUpperCase()

      for (const cell of cells) {
        const templateKey = `${s.id}|${dow}|${cell.startTime}`
        const cellKey = `${s.id}|${dateStr}|${cell.startTime}`
        const info = deckingByCell.get(templateKey)
        // If admin disabled the cell (lunch, etc.) or already assigned any
        // patient in the Decking Module, hide it from portal self-service.
        if (info?.anyDisabled || info?.anyPatient) continue
        const bookingFilled = bookingByCell.get(cellKey) ?? 0
        if (bookingFilled >= MAX_PATIENTS_PER_SLOT) continue
        out.push({
          staffId: s.id,
          initials,
          sex,
          date: dateStr,
          startTime: cell.startTime,
          endTime: cell.endTime,
          dayOfWeek: dow,
        })
        if (out.length >= 1000) break
      }
      if (out.length >= 1000) break
    }
    if (out.length >= 1000) break
  }

  return withCors(NextResponse.json({ slots: out }), origin)
}
