import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sortDays } from '@/lib/decking-days'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')

  const configs = await prisma.deckingTherapistConfig.findMany({
    where: branch ? { branch } : {},
  })
  return NextResponse.json(configs)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, workDays: rawWorkDays, startTime, endTime, useDefault, branch, department, deliveryMode: rawMode, slotsPerDay: rawCount, slotMinutes: rawLen, breakStart: rawBreak, breakMinutes: rawBreakLen } = await req.json()
  // How many patients a day, when that is not one an hour. Null restores the
  // hourly board, so clearing the field is a real action and not a no-op.
  // Capped: a window divided more than 24 ways gives slots too short to be a
  // consult and a grid too tall to read.
  const n = Number(rawCount)
  const slotsPerDay = Number.isFinite(n) && n >= 1 ? Math.min(24, Math.round(n)) : null
  // Minutes per patient, when the doctor is told a LENGTH rather than a count
  // — "two hours each". Wins over the count when both are set. Floored at 5
  // minutes and capped at a working day, so a typo cannot generate hundreds of
  // rows or none at all.
  const len = Number(rawLen)
  const slotMinutes = Number.isFinite(len) && len >= 5 ? Math.min(720, Math.round(len)) : null
  // One break, stepped over rather than booked around. Both halves or neither:
  // a start with no length closes nothing, and a length with no start has
  // nowhere to be.
  const breakLen = Number(rawBreakLen)
  const validBreakStart = typeof rawBreak === 'string' && /^\d{2}:\d{2}$/.test(rawBreak)
  const breakMinutes = validBreakStart && Number.isFinite(breakLen) && breakLen >= 5
    ? Math.min(480, Math.round(breakLen)) : null
  const breakStart = breakMinutes ? rawBreak : null
  // Null = the consultant's general schedule (what every row was before this).
  // A named service overrides it, so on-site days and teletherapy days can
  // differ. Anything unrecognised falls back to the general row rather than
  // creating a schedule no board will ever read.
  const deliveryMode = ['ONSITE', 'TELETHERAPY', 'HOMECARE'].includes(rawMode) ? rawMode : null
  // Stored in calendar order so the board never has to trust the order the
  // checkboxes arrived in. The boards sort on render too — this just stops new
  // rows from being written scrambled in the first place.
  const workDays = sortDays(Array.isArray(rawWorkDays) ? rawWorkDays : [])
  if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
  if (!branch) return NextResponse.json({ error: 'branch is required' }, { status: 400 })

  // Interbranch staff get one config PER branch (staffId+branch is the unique
  // key, not staffId alone) — otherwise saving a secondary-branch schedule
  // would silently overwrite their primary-branch config.
  //
  // Looked up and then written, rather than upserted on the compound unique
  // key. `deliveryMode` is nullable and null is exactly what the GENERAL
  // schedule stores — the one the "All" view saves — but SQL unique indexes do
  // not treat two NULLs as equal, so Prisma rejects a null inside a compound
  // unique `where` outright ("Argument `deliveryMode` must not be null"). Every
  // save of a general schedule therefore threw a 500, and because the caller
  // never read the response it looked exactly like success: the board reloaded
  // and the schedule simply had not changed.
  const existing = await prisma.deckingTherapistConfig.findFirst({
    where: { staffId, branch, deliveryMode },
    select: { id: true },
  })
  const config = existing
    ? await prisma.deckingTherapistConfig.update({
        where: { id: existing.id },
        data: { workDays, startTime, endTime, useDefault, branch, department, slotsPerDay, slotMinutes, breakStart, breakMinutes },
      })
    : await prisma.deckingTherapistConfig.create({
    data: {
      staffId,
      workDays: workDays ?? [],
      startTime: startTime ?? '10:00',
      endTime: endTime ?? '20:00',
      useDefault: useDefault ?? true,
      branch: branch ?? '',
      department: department ?? '',
      deliveryMode,
      slotsPerDay,
      slotMinutes,
      breakStart,
      breakMinutes,
    } })
  return NextResponse.json(config)
}


/**
 * Remove a service-specific schedule, putting that service back on the
 * consultant's general days. Deleting the general row is not offered here —
 * that is what the work-days checkboxes already do by clearing them.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, branch, deliveryMode } = await req.json()
  if (!staffId || !branch) {
    return NextResponse.json({ error: 'staffId and branch are required' }, { status: 400 })
  }
  if (!['ONSITE', 'TELETHERAPY', 'HOMECARE'].includes(deliveryMode)) {
    return NextResponse.json({ error: 'deliveryMode must name a service' }, { status: 400 })
  }

  await prisma.deckingTherapistConfig.deleteMany({ where: { staffId, branch, deliveryMode } })
  return NextResponse.json({ ok: true })
}
