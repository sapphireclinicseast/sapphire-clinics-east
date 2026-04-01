import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

// GET — list all incentive rules
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rules = await prisma.incentiveRule.findMany({
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(rules)
}

// POST — create a new incentive rule
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { name, description, threshold, bonusPerUnit, departments, branch } = await req.json()

    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!threshold || threshold < 1) return NextResponse.json({ error: 'Threshold must be ≥ 1' }, { status: 400 })
    if (!bonusPerUnit || bonusPerUnit <= 0) return NextResponse.json({ error: 'Bonus per unit must be > 0' }, { status: 400 })

    const rule = await prisma.incentiveRule.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        threshold: parseInt(threshold),
        bonusPerUnit: parseFloat(bonusPerUnit),
        departments: Array.isArray(departments) ? departments : [],
        branch: branch || null,
        createdById: session.user.id,
      },
    })
    return NextResponse.json(rule, { status: 201 })
  } catch (err) {
    console.error('Incentive POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT — update an incentive rule
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, name, description, threshold, bonusPerUnit, departments, branch, isActive } = await req.json()

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const rule = await prisma.incentiveRule.update({
      where: { id },
      data: {
        name: name?.trim(),
        description: description?.trim() || null,
        threshold: threshold !== undefined ? parseInt(threshold) : undefined,
        bonusPerUnit: bonusPerUnit !== undefined ? parseFloat(bonusPerUnit) : undefined,
        departments: Array.isArray(departments) ? departments : undefined,
        branch: branch !== undefined ? (branch || null) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      },
    })
    return NextResponse.json(rule)
  } catch (err) {
    console.error('Incentive PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — hard delete (incentive rules have no financial records attached)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await prisma.incentiveRule.delete({ where: { id } })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('Incentive DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
