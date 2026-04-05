import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get('employeeId') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }
  if (employeeId) where.employeeId = employeeId

  const benefits = await prisma.employeeBenefit.findMany({
    where,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(benefits)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  // Bulk upsert: { bulk: [{ employeeId, benefitType, employeeShare, employerShare }, ...] }
  if (body.bulk && Array.isArray(body.bulk)) {
    const results = []
    for (const item of body.bulk) {
      if (!item.employeeId || !item.benefitType) continue
      await prisma.employeeBenefit.updateMany({
        where: { employeeId: item.employeeId, benefitType: item.benefitType, isActive: true },
        data: { isActive: false },
      })
      const b = await prisma.employeeBenefit.create({
        data: {
          employeeId: item.employeeId,
          benefitType: item.benefitType,
          employeeShare: item.employeeShare || 0,
          employerShare: item.employerShare || 0,
        },
      })
      results.push(b)
    }
    return NextResponse.json(results)
  }

  const { employeeId, benefitType, employeeShare, employerShare } = body

  if (!employeeId || !benefitType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Deactivate existing benefit of same type for this employee
  await prisma.employeeBenefit.updateMany({
    where: { employeeId, benefitType, isActive: true },
    data: { isActive: false },
  })

  const benefit = await prisma.employeeBenefit.create({
    data: {
      employeeId,
      benefitType,
      employeeShare: employeeShare || 0,
      employerShare: employerShare || 0,
    },
  })

  return NextResponse.json(benefit)
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, employeeShare, employerShare, isActive } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing benefit id' }, { status: 400 })
  }

  const benefit = await prisma.employeeBenefit.update({
    where: { id },
    data: {
      ...(employeeShare !== undefined && { employeeShare }),
      ...(employerShare !== undefined && { employerShare }),
      ...(isActive !== undefined && { isActive }),
    },
  })

  return NextResponse.json(benefit)
}
