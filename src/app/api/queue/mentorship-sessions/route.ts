/**
 * Sessions booked "With Mentor", for the Accounting Hub's mentorship audit.
 *
 * The cashier prompt to add the "Mentorship" service is advisory — deliberately,
 * so a missing service never stands between a cashier and a paying patient. The
 * cost of that choice is that a miss is silent: payroll simply never sees the
 * session as mentorship. This endpoint is the other half of the bargain, letting
 * the Accounting Hub reconcile ticked sessions against what was actually billed.
 *
 * GET /api/queue/mentorship-sessions?from=YYYY-MM-DD&to=YYYY-MM-DD[&branch=SBEA]
 *   Auth: Bearer $EXTERNAL_API_KEY (same key the queue endpoint uses).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const key = process.env.EXTERNAL_API_KEY
  const auth = req.headers.get('authorization')
  if (!key || auth !== `Bearer ${key}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const branch = searchParams.get('branch')
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const sessions = await prisma.schedule.findMany({
    where: {
      withMentor: true,
      date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
      ...(branch && branch !== 'all' ? { branch } : {}),
      // A cancelled session was never delivered, so it is not a billing miss.
      status: { not: 'CANCELLED' },
    },
    select: {
      id: true, date: true, startTime: true, endTime: true, status: true,
      sessionType: true, branch: true,
      patient: { select: { firstName: true, lastName: true } },
      staff: { select: { firstName: true, lastName: true, department: true } },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  return NextResponse.json({
    items: sessions.map(s => ({
      id: s.id,
      date: s.date.toISOString().slice(0, 10),
      time: s.startTime ? `${s.startTime}–${s.endTime ?? ''}` : '',
      status: s.status,
      sessionType: s.sessionType,
      branch: s.branch,
      patientName: s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : '—',
      clinician: `${s.staff.lastName}, ${s.staff.firstName}`,
      department: s.staff.department,
    })),
  })
}
