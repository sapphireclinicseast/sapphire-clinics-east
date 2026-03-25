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
      department: {
        in: ['OT', 'PT', 'SLP', 'SPED', 'PSYCHOLOGY', 'MD'],
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
