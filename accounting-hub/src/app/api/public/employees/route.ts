import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Public API: returns minimal employee list for the employee request form.
 * Only returns name, department, branch — no sensitive data.
 */
export async function GET() {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      department: true,
      branch: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json(employees)
}
