import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT']

const ACCOUNT_INCLUDES = {
  salaryExpenseAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
  professionalFeesAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
  sssERAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
  hdmfERAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
  philhealthERAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
  salariesPayableAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
  benefitsPayableAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
  taxPayableAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mapping = await prisma.payrollCOAMapping.findFirst({ include: ACCOUNT_INCLUDES })
  return NextResponse.json(mapping || {})
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const data = {
    salaryExpenseAccountId: body.salaryExpenseAccountId || null,
    professionalFeesAccountId: body.professionalFeesAccountId || null,
    sssERAccountId: body.sssERAccountId || null,
    hdmfERAccountId: body.hdmfERAccountId || null,
    philhealthERAccountId: body.philhealthERAccountId || null,
    salariesPayableAccountId: body.salariesPayableAccountId || null,
    benefitsPayableAccountId: body.benefitsPayableAccountId || null,
    taxPayableAccountId: body.taxPayableAccountId || null,
  }

  const existing = await prisma.payrollCOAMapping.findFirst()
  const mapping = existing
    ? await prisma.payrollCOAMapping.update({ where: { id: existing.id }, data, include: ACCOUNT_INCLUDES })
    : await prisma.payrollCOAMapping.create({ data, include: ACCOUNT_INCLUDES })

  return NextResponse.json(mapping)
}
