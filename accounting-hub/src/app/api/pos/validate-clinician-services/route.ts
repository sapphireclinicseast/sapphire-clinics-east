import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST: check if a clinician has any disabled unit pays for the given services
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { clinicianName, serviceIds } = await req.json()

    if (!clinicianName || !serviceIds?.length) {
      return NextResponse.json({ valid: true, blockedServices: [] })
    }

    // Find consultant by name (same matching as payroll generation)
    const consultant = await prisma.consultant.findFirst({
      where: {
        isActive: true,
        name: { equals: clinicianName.trim(), mode: 'insensitive' },
      },
      include: {
        unitPayRates: {
          where: { disabled: true },
          select: { unitPayId: true, unitPay: { select: { name: true } } },
        },
      },
    })

    if (!consultant || consultant.unitPayRates.length === 0) {
      return NextResponse.json({ valid: true, blockedServices: [] })
    }

    // Get services that have unit pay assigned
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds }, unitPayId: { not: null }, unitPayEnabled: true },
      select: { id: true, name: true, unitPayId: true },
    })

    // Check for blocked services
    const disabledUnitPayIds = new Set(consultant.unitPayRates.map(r => r.unitPayId))
    const disabledUnitPayNames = new Map(consultant.unitPayRates.map(r => [r.unitPayId, r.unitPay.name]))

    const blockedServices = services
      .filter(s => s.unitPayId && disabledUnitPayIds.has(s.unitPayId))
      .map(s => ({ serviceName: s.name, unitPayName: disabledUnitPayNames.get(s.unitPayId!) || '' }))

    return NextResponse.json({
      valid: blockedServices.length === 0,
      blockedServices,
    })
  } catch (e: unknown) {
    console.error('[validate-clinician-services] Error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
