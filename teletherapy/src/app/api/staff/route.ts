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
      OR: [
        // Clinical depts + non-clinical staff (Front Desk / Administration) so
        // the admin can also create limited accounts for them.
        {
          department: {
            in: ['OT', 'PT', 'SLP', 'SPED', 'PSYCHOLOGY', 'MD', 'ORTHOSIS', 'FRONT_DESK', 'ADMINISTRATION'],
          },
        },
        // Interns of ANY department, so the admin can always create intern
        // accounts even if their department isn't in the clinical list.
        { employmentType: 'intern' },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      department: true,
      branch: true,
      email: true,
      employmentType: true,
      jobTitle: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json({ staff })
}
