import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

// Authenticated — returns full patient names for POS / Accounting Hub
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')?.toUpperCase()   // SBEA | SBGH
  const date   = searchParams.get('date')                    // YYYY-MM-DD
  const statusFilter = searchParams.get('status')?.toUpperCase()

  if (!branch) return NextResponse.json({ error: 'branch required' }, { status: 400 })

  const dateStr = date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
  const dayEnd   = new Date(`${dateStr}T23:59:59.999Z`)

  const schedules = await prisma.schedule.findMany({
    where: {
      date: { gte: dayStart, lte: dayEnd },
      staff: { branch },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      staff:   { select: { firstName: true, lastName: true, department: true, branch: true } },
      patient: { select: { id: true, firstName: true, lastName: true } },
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
    clinician:   `${s.staff.lastName}, ${s.staff.firstName}`,
    patientId:   s.patient?.id ?? null,
    patientName: s.patient
      ? `${s.patient.firstName} ${s.patient.lastName}`
      : '—',
  }))

  return NextResponse.json({ date: dateStr, branch, items })
}
