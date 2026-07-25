import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

// GET ?consultantId= — active benefit settings (mirror employee-benefits)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const consultantId = searchParams.get('consultantId') || ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }
  if (consultantId) where.consultantId = consultantId

  const benefits = await prisma.consultantBenefit.findMany({
    where,
    include: { consultant: { select: { id: true, name: true, department: true, branch: true } } },
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

  // Bulk upsert: { bulk: [{ consultantId, benefitType, employeeShare, employerShare }, ...] }
  if (body.bulk && Array.isArray(body.bulk)) {
    const results = []
    for (const item of body.bulk) {
      if (!item.consultantId || !item.benefitType) continue
      await prisma.consultantBenefit.updateMany({
        where: { consultantId: item.consultantId, benefitType: item.benefitType, isActive: true },
        data: { isActive: false },
      })
      const b = await prisma.consultantBenefit.create({
        data: {
          consultantId: item.consultantId,
          benefitType: item.benefitType,
          employeeShare: item.employeeShare || 0,
          employerShare: item.employerShare || 0,
        },
      })
      results.push(b)
    }
    return NextResponse.json(results)
  }

  const { consultantId, benefitType, employeeShare, employerShare } = body
  if (!consultantId || !benefitType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  // Deactivate existing benefit of same type for this consultant
  await prisma.consultantBenefit.updateMany({
    where: { consultantId, benefitType, isActive: true },
    data: { isActive: false },
  })
  const benefit = await prisma.consultantBenefit.create({
    data: {
      consultantId,
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
  if (!id) return NextResponse.json({ error: 'Missing benefit id' }, { status: 400 })

  const benefit = await prisma.consultantBenefit.update({
    where: { id },
    data: {
      ...(employeeShare !== undefined && { employeeShare }),
      ...(employerShare !== undefined && { employerShare }),
      ...(isActive !== undefined && { isActive }),
    },
  })
  return NextResponse.json(benefit)
}
