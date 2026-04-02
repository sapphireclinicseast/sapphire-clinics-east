import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://marketing.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const department = searchParams.get('department') || ''
  const sync = searchParams.get('sync') === 'true'

  // Optionally sync from marketing hub
  if (sync) {
    try {
      const res = await fetch(`${MARKETING_HUB_URL}/api/staff/external`, {
        headers: { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        const staff = data.staff || []
        for (const s of staff) {
          const name = `${s.lastName}, ${s.firstName}`
          const dept = s.department || ''
          const br = s.branch || ''
          // Only sync clinical departments (not admin/front desk)
          if (['FRONT_DESK', 'ADMINISTRATION'].includes(dept)) continue
          await prisma.consultant.upsert({
            where: { externalStaffId: s.id },
            update: { name, department: dept, branch: br },
            create: { externalStaffId: s.id, name, department: dept, branch: br },
          })
        }
      }
    } catch (e) {
      console.error('Consultant sync error:', e)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }
  if (branch) where.branch = branch
  if (department) where.department = department

  const consultants = await prisma.consultant.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      unitPayRates: {
        include: { unitPay: { select: { id: true, name: true } } },
      },
    },
  })

  return NextResponse.json(consultants)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { name, department, branch, externalStaffId } = await req.json()
    if (!name?.trim() || !department || !branch) {
      return NextResponse.json({ error: 'Name, department, and branch are required' }, { status: 400 })
    }

    const consultant = await prisma.consultant.create({
      data: {
        name: name.trim(),
        department,
        branch,
        externalStaffId: externalStaffId || null,
      },
    })

    return NextResponse.json(consultant, { status: 201 })
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
    const { id, taxDeduction, monthlyRetainer, unitPayRates, isActive, name, department, branch } = await req.json()
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (taxDeduction !== undefined) data.taxDeduction = taxDeduction
    if (monthlyRetainer !== undefined) data.monthlyRetainer = Number(monthlyRetainer)
    if (isActive !== undefined) data.isActive = isActive
    if (name !== undefined) data.name = name.trim()
    if (department !== undefined) data.department = department
    if (branch !== undefined) data.branch = branch

    const consultant = await prisma.consultant.update({ where: { id }, data })

    // Update unit pay rates if provided
    if (unitPayRates && Array.isArray(unitPayRates)) {
      // Delete existing and recreate
      await prisma.consultantUnitPay.deleteMany({ where: { consultantId: id } })
      if (unitPayRates.length > 0) {
        await prisma.consultantUnitPay.createMany({
          data: unitPayRates.map((r: { unitPayId: string; amount: number; disabled?: boolean; thresholdEnabled?: boolean; thresholdAmount?: number; reducedAmount?: number }) => ({
            consultantId: id,
            unitPayId: r.unitPayId,
            amount: Number(r.amount),
            disabled: r.disabled || false,
            thresholdEnabled: r.thresholdEnabled || false,
            thresholdAmount: r.thresholdAmount != null ? Number(r.thresholdAmount) : null,
            reducedAmount: r.reducedAmount != null ? Number(r.reducedAmount) : null,
          })),
          skipDuplicates: true,
        })
      }
    }

    // Re-fetch with rates
    const result = await prisma.consultant.findUnique({
      where: { id },
      include: {
        unitPayRates: {
          include: { unitPay: { select: { id: true, name: true } } },
        },
      },
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
