import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Public API: returns minimal employee + consultant list for the request form.
 * Only returns name, department, branch — no sensitive data.
 * ?includeConsultants=true to also return consultants (for Certificate of Consultation).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const includeConsultants = searchParams.get('includeConsultants') === 'true'

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      department: true,
      branch: true,
      scheduleIn: true,
      scheduleOut: true,
      daySchedules: true,
      restDay: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  if (includeConsultants) {
    const consultants = await prisma.consultant.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        department: true,
        branch: true,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ employees, consultants })
  }

  return NextResponse.json(employees)
}
