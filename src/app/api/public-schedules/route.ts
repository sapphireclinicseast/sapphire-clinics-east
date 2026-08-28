import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  // Cookie gate — same passcode as the UI
  const cookie = req.cookies.get('sched_access')
  if (cookie?.value !== 'scei') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch       = searchParams.get('branch')
  const department   = searchParams.get('department')
  const date         = searchParams.get('date')
  const startDate    = searchParams.get('startDate')
  const endDate      = searchParams.get('endDate')
  const withDecking  = searchParams.get('withDecking') === '1'

  if (!branch || !department) {
    return NextResponse.json({ error: 'branch and department are required' }, { status: 400 })
  }

  let dayStart: Date, dayEnd: Date
  if (startDate && endDate) {
    dayStart = new Date(`${startDate}T00:00:00.000Z`)
    dayEnd   = new Date(`${endDate}T23:59:59.999Z`)
  } else if (date) {
    dayStart = new Date(`${date}T00:00:00.000Z`)
    dayEnd   = new Date(`${date}T23:59:59.999Z`)
  } else {
    return NextResponse.json({ error: 'date or startDate+endDate is required' }, { status: 400 })
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      date:  { gte: dayStart, lte: dayEnd },
      staff: { branch, department },
    },
    include: {
      staff:   { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { startTime: 'asc' },
  })

  if (!withDecking) return NextResponse.json(schedules)

  // Fill-in patients from the Decking module (recurring weekly slots) for
  // (staff, day) pairs that have NO confirmed/cancelled/rescheduled schedule.
  const [deckingSlots, configs] = await Promise.all([
    prisma.deckingSlot.findMany({
      where: { branch, department, disabled: false },
      include: {
        staff:   { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.deckingTherapistConfig.findMany({
      where: { branch, department },
      select: { staffId: true, workDays: true },
    }),
  ])

  // Only show decking slots on days the therapist has configured in the Decking Module.
  const configuredDaysByStaff = new Map<string, Set<string>>()
  for (const c of configs) {
    const days = Array.isArray(c.workDays) ? c.workDays as string[] : []
    configuredDaysByStaff.set(c.staffId, new Set(days))
  }

  const blocked = new Set<string>()
  for (const s of schedules) {
    if (s.status === 'CONFIRMED' || s.status === 'CANCELLED' || s.status === 'RESCHEDULED') {
      const dayKey = s.date.toISOString().slice(0, 10)
      blocked.add(`${s.staffId}|${dayKey}`)
    }
  }

  const DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT']
  const todayUTC = new Date()
  const todayKey = todayUTC.toISOString().slice(0, 10)
  const fillIns: unknown[] = []
  for (let d = new Date(dayStart); d <= dayEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    const dayKey = d.toISOString().slice(0, 10)
    if (dayKey < todayKey) continue  // decking fill-ins: today onwards only
    const dow = DOW[d.getUTCDay()]
    for (const slot of deckingSlots) {
      if (slot.dayOfWeek !== dow) continue
      const configured = configuredDaysByStaff.get(slot.staffId)
      if (!configured || !configured.has(slot.dayOfWeek)) continue
      if (blocked.has(`${slot.staffId}|${dayKey}`)) continue
      fillIns.push({
        id:          `decking-${slot.id}-${dayKey}`,
        date:        new Date(`${dayKey}T00:00:00.000Z`),
        startTime:   slot.startTime,
        endTime:     slot.endTime,
        sessionType: 'Decking',
        status:      'PENDING',
        staff:       slot.staff,
        patient:     slot.patient,
      })
    }
  }

  return NextResponse.json([...schedules, ...fillIns])
}
