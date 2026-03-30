import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await prisma.payrollTaxSettings.findFirst({
    include: { liabilityAccount: { select: { id: true, accountNumber: true, accountTitle: true } } },
  })
  return NextResponse.json(settings || { liabilityAccountId: null, liabilityAccount: null })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { liabilityAccountId } = await req.json()
  const existing = await prisma.payrollTaxSettings.findFirst()

  const settings = existing
    ? await prisma.payrollTaxSettings.update({
        where: { id: existing.id },
        data: { liabilityAccountId: liabilityAccountId || null },
        include: { liabilityAccount: { select: { id: true, accountNumber: true, accountTitle: true } } },
      })
    : await prisma.payrollTaxSettings.create({
        data: { liabilityAccountId: liabilityAccountId || null },
        include: { liabilityAccount: { select: { id: true, accountNumber: true, accountTitle: true } } },
      })

  return NextResponse.json(settings)
}
