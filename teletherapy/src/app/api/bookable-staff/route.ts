// GET /api/bookable-staff — staff who have published availability, i.e. the
// people a mentee / intern can book a 1-on-1 with ("Set a Meeting" picker).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const withSlots = await prisma.availabilitySlot.findMany({ select: { staffId: true }, distinct: ['staffId'] })
  const staffIds = withSlots.map((s) => s.staffId).filter(Boolean)
  if (staffIds.length === 0) return NextResponse.json({ staff: [] })

  const staff = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, firstName: true, lastName: true, department: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
  return NextResponse.json({
    staff: staff.map((s) => ({ staffId: s.id, name: `${s.firstName} ${s.lastName}`, department: s.department })),
  })
}
