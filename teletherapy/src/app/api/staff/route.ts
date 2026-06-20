import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const staff = await prisma.staff.findMany({
    where: {
      // Clinical depts + non-clinical staff (Front Desk / Administration) so the
      // admin can also create limited accounts for them.
      department: {
        in: ['OT', 'PT', 'SLP', 'SPED', 'PSYCHOLOGY', 'MD', 'ORTHOSIS', 'FRONT_DESK', 'ADMINISTRATION'],
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      department: true,
      branch: true,
      email: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json({ staff })
}
