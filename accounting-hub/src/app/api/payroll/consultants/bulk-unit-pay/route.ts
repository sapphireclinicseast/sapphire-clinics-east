import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { pfBlockMessage, rateBlocks } from '@/lib/payroll/pf-price-server'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!WRITE_ROLES.includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { department, unitPayId, amount } = await req.json()

    if (!department || !unitPayId || amount == null) {
      return NextResponse.json({ error: 'department, unitPayId, and amount are required' }, { status: 400 })
    }
    const numAmount = Number(amount)
    if (!Number.isFinite(numAmount) || numAmount < 0) {
      return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 })
    }

    const unitPay = await prisma.unitPay.findUnique({ where: { id: unitPayId } })
    if (!unitPay || !unitPay.isActive) {
      return NextResponse.json({ error: 'Unit pay type not found or inactive' }, { status: 400 })
    }
    const depts = (unitPay.departments as string[]) || []
    if (depts.length > 0 && !depts.includes(department)) {
      return NextResponse.json({ error: 'Unit pay type does not apply to this department' }, { status: 400 })
    }

    const consultants = await prisma.consultant.findMany({
      where: { department, isActive: true },
      select: { id: true, unitPayRates: { where: { unitPayId } } },
    })

    // We can't pay more PF than we charge: refuse an amount above a service price it pays on.
    const blocks = await rateBlocks(consultants.map(c => {
      const existing = c.unitPayRates[0]
      return { consultantId: c.id, rates: [{ ...(existing || {}), unitPayId, amount: numAmount, disabled: existing?.disabled ?? false }] }
    }))
    if (blocks.length) {
      return NextResponse.json({ error: pfBlockMessage(blocks, 'use a lower amount, or raise the service price / set up a new service first.'), blocks }, { status: 400 })
    }

    if (consultants.length === 0) {
      return NextResponse.json({ updated: 0, department, unitPayName: unitPay.name, amount: numAmount })
    }

    await prisma.$transaction(
      consultants.map(c =>
        prisma.consultantUnitPay.upsert({
          where: { consultantId_unitPayId: { consultantId: c.id, unitPayId } },
          update: { amount: numAmount },
          create: { consultantId: c.id, unitPayId, amount: numAmount },
        })
      )
    )

    return NextResponse.json({
      updated: consultants.length,
      department,
      unitPayName: unitPay.name,
      amount: numAmount,
    })
  } catch (e: unknown) {
    console.error('[bulk-unit-pay] Error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
