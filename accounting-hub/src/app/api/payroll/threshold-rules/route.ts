import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// GET: list all consultants with their threshold settings per unit pay
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rates = await prisma.consultantUnitPay.findMany({
    where: { thresholdEnabled: true, consultant: { isActive: true } },
    include: {
      consultant: { select: { id: true, name: true, department: true, branch: true } },
      unitPay: { select: { id: true, name: true } },
    },
    orderBy: [{ unitPay: { name: 'asc' } }, { consultant: { name: 'asc' } }],
  })

  // Group by unitPayId + thresholdAmount + reducedAmount
  const rulesMap = new Map<string, {
    unitPayId: string; unitPayName: string
    thresholdAmount: number; reducedAmount: number
    consultants: { id: string; name: string; department: string; branch: string }[]
  }>()

  for (const r of rates) {
    const key = `${r.unitPayId}|${r.thresholdAmount}|${r.reducedAmount}`
    if (!rulesMap.has(key)) {
      rulesMap.set(key, {
        unitPayId: r.unitPayId,
        unitPayName: r.unitPay.name,
        thresholdAmount: Number(r.thresholdAmount),
        reducedAmount: Number(r.reducedAmount),
        consultants: [],
      })
    }
    rulesMap.get(key)!.consultants.push(r.consultant)
  }

  return NextResponse.json({ rules: Array.from(rulesMap.values()) })
}

// POST: apply a threshold rule to specific consultants
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!WRITE_ROLES.includes(session.user.role || '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { unitPayId, thresholdAmount, reducedAmount, consultantIds } = await req.json()

    if (!unitPayId || thresholdAmount == null || reducedAmount == null || !consultantIds?.length) {
      return NextResponse.json({ error: 'unitPayId, thresholdAmount, reducedAmount, and consultantIds are required' }, { status: 400 })
    }

    const numThreshold = Number(thresholdAmount)
    const numReduced = Number(reducedAmount)
    if (!Number.isFinite(numThreshold) || numThreshold <= 0) {
      return NextResponse.json({ error: 'thresholdAmount must be a positive number' }, { status: 400 })
    }
    if (!Number.isFinite(numReduced) || numReduced < 0) {
      return NextResponse.json({ error: 'reducedAmount must be a non-negative number' }, { status: 400 })
    }

    // Update existing ConsultantUnitPay records to enable threshold
    const result = await prisma.consultantUnitPay.updateMany({
      where: {
        unitPayId,
        consultantId: { in: consultantIds },
      },
      data: {
        thresholdEnabled: true,
        thresholdAmount: numThreshold,
        reducedAmount: numReduced,
      },
    })

    return NextResponse.json({ updated: result.count })
  } catch (e: unknown) {
    console.error('[threshold-rules] Error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: remove threshold rule from specific consultants (or all for a unit pay)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!WRITE_ROLES.includes(session.user.role || '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { unitPayId, consultantIds } = await req.json()
    if (!unitPayId) return NextResponse.json({ error: 'unitPayId is required' }, { status: 400 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { unitPayId, thresholdEnabled: true }
    if (consultantIds?.length) where.consultantId = { in: consultantIds }

    const result = await prisma.consultantUnitPay.updateMany({
      where,
      data: { thresholdEnabled: false, thresholdAmount: null, reducedAmount: null },
    })

    return NextResponse.json({ updated: result.count })
  } catch (e: unknown) {
    console.error('[threshold-rules] Error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
