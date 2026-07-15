import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const unitPays = await prisma.unitPay.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { consultantRates: true, services: true } },
      expenseAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
    },
  })

  return NextResponse.json(unitPays)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { name, departments, expenseAccountId } = await req.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const unitPay = await prisma.unitPay.create({
      data: {
        name: name.trim(),
        departments: departments || [],
        expenseAccountId: expenseAccountId || null,
      },
    })

    return NextResponse.json(unitPay, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, name, departments, isActive, expenseAccountId } = await req.json()
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (name !== undefined) data.name = name.trim()
    if (departments !== undefined) data.departments = departments
    if (isActive !== undefined) data.isActive = isActive
    if (expenseAccountId !== undefined) data.expenseAccountId = expenseAccountId || null

    const unitPay = await prisma.unitPay.update({ where: { id }, data })
    return NextResponse.json(unitPay)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    await prisma.unitPay.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
