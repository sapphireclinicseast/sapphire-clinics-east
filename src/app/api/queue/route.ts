import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public — no auth required (used by TV queue display)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')?.toUpperCase()   // SBEA | SBGH
  const date   = searchParams.get('date')                    // YYYY-MM-DD, defaults to today PH

  if (!branch) return NextResponse.json({ error: 'branch required' }, { status: 400 })

  const dateStr = date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
  const dayEnd   = new Date(`${dateStr}T23:59:59.999Z`)

  const schedules = await prisma.schedule.findMany({
    where: {
      date: { gte: dayStart, lte: dayEnd },
      staff: { branch },
    },
    include: {
      staff:   { select: { firstName: true, lastName: true, department: true, branch: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
    orderBy: { startTime: 'asc' },
  })

  const items = schedules.map(s => ({
    id:          s.id,
    startTime:   s.startTime,
    endTime:     s.endTime,
    sessionType: s.sessionType,
    status:      s.status,
    department:  s.staff.department,
    branch:      s.staff.branch,
    therapist:   `${s.staff.lastName}, ${s.staff.firstName}`,
    // initials only — privacy
    initials: s.patient
      ? `${s.patient.firstName[0].toUpperCase()}.${s.patient.lastName[0]?.toUpperCase() ?? ''}`.replace(/\.$/, '')
      : '—',
  }))

  return NextResponse.json({ date: dateStr, branch, items })
}
