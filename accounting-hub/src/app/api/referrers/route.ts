import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'MEDREP']
const REFERRER_TYPES = ['DOCTOR', 'LAW_FIRM', 'PARTNER_SCHOOL']
const normType = (t: unknown) => (REFERRER_TYPES.includes(String(t)) ? String(t) : 'DOCTOR')
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS']
const normBranches = (b: unknown): string[] => Array.isArray(b) ? Array.from(new Set(b.map(String).filter(x => VALID_BRANCHES.includes(x)))) : []
// A branch-scoped user (East/Greenhills admin or front desk) only sees referrers
// tagged for their branch (or untagged = all branches). Everyone else sees all.
function branchScope(role?: string): string | null {
  if (role === 'AHEA_ADMIN' || role === 'AHEA_FRONTDESK') return 'SANDBOX_EAST'
  if (role === 'AHGH_ADMIN' || role === 'AHGH_FRONTDESK') return 'SANDBOX_GREENHILLS'
  return null
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)
  const search = searchParams.get('search') || ''
  const all = searchParams.get('all') === 'true'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { affiliation: { contains: search, mode: 'insensitive' } },
      { specialization: { contains: search, mode: 'insensitive' } },
    ]
  }

  // Branch visibility: East/Greenhills users see only their branch's referrers (or untagged).
  const scope = branchScope(session.user.role as string)
  if (scope) where.AND = [{ OR: [{ branches: { isEmpty: true } }, { branches: { has: scope } }] }]

  if (all) {
    const referrers = await prisma.referrer.findMany({
      where,
      select: { id: true, name: true, type: true, affiliation: true, specialization: true, branches: true },
      orderBy: { name: 'asc' },
    })
    // Attach live referral counts (non-voided orders that name each referrer).
    const grouped = await prisma.order.groupBy({
      by: ['referrerId'],
      where: { referrerId: { not: null }, status: { notIn: ['VOIDED'] } },
      _count: { _all: true },
    })
    const counts = new Map(grouped.map(g => [g.referrerId as string, g._count._all]))
    return NextResponse.json(referrers.map(r => ({ ...r, referralCount: counts.get(r.id) || 0 })))
  }

  const [referrers, total] = await Promise.all([
    prisma.referrer.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.referrer.count({ where }),
  ])

  return NextResponse.json(paginatedResult(referrers, total, params))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { name, type, affiliation, specialization, branches } = await req.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Referrer name is required' }, { status: 400 })
    }

    const existing = await prisma.referrer.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
    })
    if (existing) {
      return NextResponse.json({ error: 'A referrer with this name already exists' }, { status: 409 })
    }

    const referrer = await prisma.referrer.create({
      data: {
        name: name.trim(),
        type: normType(type),
        affiliation: affiliation?.trim() || null,
        specialization: specialization?.trim() || null,
        branches: normBranches(branches),
        createdById: session.user.id,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'referrer',
        entityId: referrer.id,
        details: { name: referrer.name },
      },
    })

    return NextResponse.json(referrer, { status: 201 })
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
    const { id, name, type, affiliation, specialization, branches } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'Referrer ID is required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (name !== undefined) data.name = name.trim()
    if (type !== undefined) data.type = normType(type)
    if (affiliation !== undefined) data.affiliation = affiliation?.trim() || null
    if (specialization !== undefined) data.specialization = specialization?.trim() || null
    if (branches !== undefined) data.branches = normBranches(branches)

    const referrer = await prisma.referrer.update({ where: { id }, data })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'referrer',
        entityId: referrer.id,
        details: { updated: Object.keys(data) },
      },
    })

    return NextResponse.json(referrer)
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
    if (!id) {
      return NextResponse.json({ error: 'Referrer ID is required' }, { status: 400 })
    }

    await prisma.referrer.update({ where: { id }, data: { isActive: false } })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: 'DEACTIVATE', entity: 'referrer', entityId: id },
    })

    return NextResponse.json({ message: 'Referrer deactivated' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
