import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// INVESTOR is deliberately NOT in this list — investor accounts are scoped to
// the Patient Dashboard only and must not be able to read therapist
// utilization data, including by calling this route directly.
const ALLOWED_ROLES = ['ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'MARKETING_ADMIN']

// Kept as defence-in-depth: if INVESTOR is ever re-granted access to this
// route, names stay masked to initials at the API layer rather than silently
// going out in full. Unreachable while INVESTOR is excluded above.
function initials(fullName: string): string {
  const parts = fullName.trim().split(/[\s,]+/).filter(Boolean)
  if (parts.length === 0) return '—'
  return parts.map(p => p[0].toUpperCase()).join('')
}

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
  configWhere.staff = { active: true }

  const configs = await prisma.deckingTherapistConfig.findMany({
    where: configWhere,
    include: {
      staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true, dateHired: true } },
    },
  })

  if (configs.length === 0) {
    return NextResponse.json({ therapists: [], summary: null })
  }

  // ── 2. Fetch ALL decking slots for these staff (used to count distinct
  //       timeslots — one slot per (day, hour) regardless of how many seats
  //       the decking module shows for that timeslot). The decking UI can
  //       have up to 3 patients per timeslot for high-capacity sessions,
  //       but for utilization purposes a session = a single timeslot. ────────
  const staffIds = configs.map(c => c.staffId)

  const allSlots = await prisma.deckingSlot.findMany({
    where: { staffId: { in: staffIds } },
    select: { staffId: true, dayOfWeek: true, startTime: true, disabled: true },
  })

  // Group by (staffId, day, time) and mark each group active if AT LEAST
  // one row in it is non-disabled. This handles the edge case where one
  // seat is taken down but the other is still bookable — the timeslot
  // itself is still active (count = 1, not 0 and not 2).
  const activeTimeslotsByStaff = new Map<string, Map<string, Set<string>>>() // staffId -> day -> Set of startTimes
  for (const ds of allSlots) {
    if (!activeTimeslotsByStaff.has(ds.staffId)) {
      activeTimeslotsByStaff.set(ds.staffId, new Map())
    }
    const byDay = activeTimeslotsByStaff.get(ds.staffId)!
    if (!byDay.has(ds.dayOfWeek)) byDay.set(ds.dayOfWeek, new Set())
  }
  // Second pass — only add a time to the active set if at least one row
  // for that (day, time) tuple is NOT disabled. We do this by first
  // collecting all timeslots, then removing those where ALL rows are
  // disabled.
  const slotStateByStaff = new Map<string, Map<string, Map<string, { anyActive: boolean }>>>()
  for (const ds of allSlots) {
    if (!slotStateByStaff.has(ds.staffId)) slotStateByStaff.set(ds.staffId, new Map())
    const byDay = slotStateByStaff.get(ds.staffId)!
    if (!byDay.has(ds.dayOfWeek)) byDay.set(ds.dayOfWeek, new Map())
    const byTime = byDay.get(ds.dayOfWeek)!
    if (!byTime.has(ds.startTime)) byTime.set(ds.startTime, { anyActive: false })
    if (!ds.disabled) byTime.get(ds.startTime)!.anyActive = true
  }
  // Now materialize the active sets
  for (const [staffId, byDay] of slotStateByStaff.entries()) {
    for (const [day, byTime] of byDay.entries()) {
      for (const [time, state] of byTime.entries()) {
        if (state.anyActive) {
          activeTimeslotsByStaff.get(staffId)?.get(day)?.add(time)
        }
      }
    }
  }

  // ── 3. Count available slots per therapist in the date range ───────────────
  const start = new Date(`${startDate}T00:00:00`)
  const end   = new Date(`${endDate}T00:00:00`)

  // Count occurrences of each day-of-week between two local-midnight dates
  // (inclusive). Pulled out so it can be re-run per therapist, clipped to
  // their hire date — see effectiveStartStr below.
  function countDaysOfWeek(rangeStart: Date, rangeEnd: Date): Record<string, number> {
    const counts: Record<string, number> = { MON: 0, TUE: 0, WED: 0, THU: 0, FRI: 0, SAT: 0, SUN: 0 }
    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
      counts[DAY_MAP[d.getDay()]]++
    }
    return counts
  }

  // Full-range counts — the common case (staff hired before the range).
  const dayOfWeekCounts = countDaysOfWeek(start, end)
  // Cache re-clipped counts by effective start date string so therapists who
  // share a hire date (or who were all hired before the range, the majority
  // case) don't each re-walk the whole range.
  const dayOfWeekCountsCache = new Map<string, Record<string, number>>([[startDate, dayOfWeekCounts]])

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
    overbooked: number
  }

  const therapistMap = new Map<string, TherapistData>()

  for (const cfg of configs) {
    const workDays = cfg.workDays as string[]
    const byDay = activeTimeslotsByStaff.get(cfg.staffId)

    // Clip the range to this therapist's hire date — a slot they weren't
    // yet employed for was never "available" and shouldn't count against
    // their utilization. Compare as YYYY-MM-DD strings (dateHired is
    // stored at UTC midnight from the sync; toISOString().slice(0,10)
    // recovers the intended calendar date regardless of server timezone).
    let dayCountsForStaff = dayOfWeekCounts
    const hiredStr = cfg.staff.dateHired ? cfg.staff.dateHired.toISOString().slice(0, 10) : null
    if (hiredStr && hiredStr > startDate) {
      let cached = dayOfWeekCountsCache.get(hiredStr)
      if (!cached) {
        const effectiveStart = new Date(`${hiredStr}T00:00:00`)
        cached = countDaysOfWeek(effectiveStart, end)
        dayOfWeekCountsCache.set(hiredStr, cached)
      }
      dayCountsForStaff = cached
    }

    let totalSlots = 0
    for (const day of workDays) {
      const daysInRange = dayCountsForStaff[day] ?? 0
      if (daysInRange === 0) continue

      // Distinct active timeslots for this day (always 1 per (day, hour)
      // regardless of seat count).
      const activeTimeslotsForDay = byDay?.get(day)?.size ?? 0
      totalSlots += activeTimeslotsForDay * daysInRange
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
      overbooked: 0,
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

  // ── 5. Compute blank and over-capacity slots ───────────────────────────────
  // Capacity is one slot per (day, hour) — the decking module can seat more
  // than one patient in a timeslot, but the hour itself is still one slot.
  //
  // Over-capacity counts only bookings that actually OCCUPY the hour, which is
  // CONFIRMED + PENDING. A CANCELLED session releases its slot, and a
  // RESCHEDULED one has been moved to a different time (where it exists as its
  // own row), so neither holds the original hour. Counting them would flag a
  // therapist as double-decked purely for having had churn in the period —
  // eight slots with eight confirmed sessions and four earlier cancellations
  // is a full day, not an over-booked one.
  //
  // `blank` keeps its existing definition (every non-blank status consumes a
  // slot) so historical figures do not shift under a change scoped to
  // over-capacity. Note this leaves the two deliberately asymmetric: a period
  // with heavy cancellation can report 0 blank and 0 overbooked at once.
  for (const t of therapistMap.values()) {
    const used = t.confirmed + t.rescheduled + t.cancelled + t.pending
    const occupied = t.confirmed + t.pending
    t.blank = Math.max(0, t.totalSlots - used)
    t.overbooked = Math.max(0, occupied - t.totalSlots)
  }

  // Sort by real name first (better alphabetical grouping), mask last —
  // staffId (already the Map key throughout) stays the grouping/dedup
  // identity, so masking staffName here can't merge two same-initial people.
  const therapists = Array.from(therapistMap.values())
    .filter(t => t.totalSlots > 0)
    .sort((a, b) => a.staffName.localeCompare(b.staffName))
    .map(t => role === 'INVESTOR' ? { ...t, staffName: initials(t.staffName) } : t)

  // ── 6. Compute aggregated summary ─────────────────────────────────────────
  const summary = {
    totalSlots: 0,
    confirmed: 0,
    rescheduled: 0,
    cancelled: 0,
    pending: 0,
    blank: 0,
    overbooked: 0,
  }
  for (const t of therapists) {
    summary.totalSlots  += t.totalSlots
    summary.confirmed   += t.confirmed
    summary.rescheduled += t.rescheduled
    summary.cancelled   += t.cancelled
    summary.pending     += t.pending
    summary.blank       += t.blank
    summary.overbooked  += t.overbooked
  }

  return NextResponse.json({ therapists, summary })
}
