import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = ['ADMIN', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'MARKETING_ADMIN']

const DAY_MAP: Record<number, string> = {
  0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT',
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string })?.role ?? ''
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const startDate  = searchParams.get('startDate')
  const endDate    = searchParams.get('endDate')
  const branch     = searchParams.get('branch')     // 'all' | 'SBEA' | 'SBGH'
  const department = searchParams.get('department')  // 'all' | specific dept
  const staffId    = searchParams.get('staffId')     // optional: specific therapist

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
  }

  // ── 1. Fetch all therapist configs (decking setup) ─────────────────────────
  const configWhere: Record<string, unknown> = {}
  if (branch && branch !== 'all') configWhere.branch = branch
  if (department && department !== 'all') configWhere.department = department
  if (staffId) configWhere.staffId = staffId

  const configs = await prisma.deckingTherapistConfig.findMany({
    where: configWhere,
    include: {
      staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
    },
  })

  if (configs.length === 0) {
    return NextResponse.json({ therapists: [], summary: null })
  }

  // ── 2. Fetch disabled decking slots for these staff ────────────────────────
  const staffIds = configs.map(c => c.staffId)

  const disabledSlots = await prisma.deckingSlot.findMany({
    where: {
      staffId: { in: staffIds },
      disabled: true,
    },
    select: { staffId: true, dayOfWeek: true, startTime: true },
  })

  // Build lookup: staffId -> Set of "DAY|startTime" for disabled slots
  const disabledLookup = new Map<string, Set<string>>()
  for (const ds of disabledSlots) {
    const key = ds.staffId
    if (!disabledLookup.has(key)) disabledLookup.set(key, new Set())
    disabledLookup.get(key)!.add(`${ds.dayOfWeek}|${ds.startTime}`)
  }

  // ── 3. Count available slots per therapist in the date range ───────────────
  const start = new Date(`${startDate}T00:00:00`)
  const end   = new Date(`${endDate}T00:00:00`)

  // Count occurrences of each day-of-week in the date range
  const dayOfWeekCounts: Record<string, number> = { MON: 0, TUE: 0, WED: 0, THU: 0, FRI: 0, SAT: 0, SUN: 0 }
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dayOfWeekCounts[DAY_MAP[d.getDay()]]++
  }

  // For each config, compute total available slots
  type TherapistData = {
    staffId: string
    staffName: string
    department: string
    branch: string
    totalSlots: number
    confirmed: number
    rescheduled: number
    cancelled: number
    pending: number
    blank: number
  }

  const therapistMap = new Map<string, TherapistData>()

  for (const cfg of configs) {
    const workDays = cfg.workDays as string[]
    const [startH] = cfg.startTime.split(':').map(Number)
    const [endH]   = cfg.endTime.split(':').map(Number)
    const slotsPerDay = endH - startH // hourly slots
    const disabled = disabledLookup.get(cfg.staffId) ?? new Set()

    let totalSlots = 0
    for (const day of workDays) {
      const daysInRange = dayOfWeekCounts[day] ?? 0
      if (daysInRange === 0) continue

      // Count non-disabled slots for this day
      let activeSlotsForDay = 0
      for (let h = startH; h < endH; h++) {
        const timeStr = `${String(h).padStart(2, '0')}:00`
        if (!disabled.has(`${day}|${timeStr}`)) {
          activeSlotsForDay++
        }
      }
      totalSlots += activeSlotsForDay * daysInRange
    }

    therapistMap.set(cfg.staffId, {
      staffId: cfg.staffId,
      staffName: `${cfg.staff.lastName}, ${cfg.staff.firstName}`,
      department: cfg.staff.department,
      branch: cfg.staff.branch,
      totalSlots,
      confirmed: 0,
      rescheduled: 0,
      cancelled: 0,
      pending: 0,
      blank: 0,
    })
  }

  // ── 4. Fetch actual sessions in the date range for these staff ─────────────
  const dayStart = new Date(`${startDate}T00:00:00.000Z`)
  const dayEnd   = new Date(`${endDate}T23:59:59.999Z`)

  const schedules = await prisma.schedule.findMany({
    where: {
      staffId: { in: staffIds },
      date: { gte: dayStart, lte: dayEnd },
    },
    select: { staffId: true, status: true },
  })

  for (const s of schedules) {
    const t = therapistMap.get(s.staffId)
    if (!t) continue
    switch (s.status) {
      case 'CONFIRMED':    t.confirmed++; break
      case 'RESCHEDULED':  t.rescheduled++; break
      case 'CANCELLED':    t.cancelled++; break
      case 'PENDING':      t.pending++; break
    }
  }

  // ── 5. Compute blank slots ─────────────────────────────────────────────────
  for (const t of therapistMap.values()) {
    const used = t.confirmed + t.rescheduled + t.cancelled + t.pending
    t.blank = Math.max(0, t.totalSlots - used)
  }

  const therapists = Array.from(therapistMap.values())
    .filter(t => t.totalSlots > 0)
    .sort((a, b) => a.staffName.localeCompare(b.staffName))

  // ── 6. Compute aggregated summary ─────────────────────────────────────────
  const summary = {
    totalSlots: 0,
    confirmed: 0,
    rescheduled: 0,
    cancelled: 0,
    pending: 0,
    blank: 0,
  }
  for (const t of therapists) {
    summary.totalSlots  += t.totalSlots
    summary.confirmed   += t.confirmed
    summary.rescheduled += t.rescheduled
    summary.cancelled   += t.cancelled
    summary.pending     += t.pending
    summary.blank       += t.blank
  }

  return NextResponse.json({ therapists, summary })
}
