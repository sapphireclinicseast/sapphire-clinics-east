import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (!q) return NextResponse.json([])

  const patients = await prisma.patient.findMany({
    where: {
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, email: true, branches: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 10,
  })

  return NextResponse.json(patients)
}
