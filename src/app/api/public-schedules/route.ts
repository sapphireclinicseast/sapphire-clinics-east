import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  // Cookie gate — same passcode as the UI
  const cookie = req.cookies.get('sched_access')
  if (cookie?.value !== 'scei') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch     = searchParams.get('branch')
  const department = searchParams.get('department')
  const date       = searchParams.get('date')
  const startDate  = searchParams.get('startDate')
  const endDate    = searchParams.get('endDate')

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

  return NextResponse.json(schedules)
}
