import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

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

  if (all) {
    const referrers = await prisma.referrer.findMany({
      where,
      select: { id: true, name: true, affiliation: true, specialization: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(referrers)
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
    const { name, affiliation, specialization } = await req.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Referrer name is required' }, { status: 400 })
    }

    const referrer = await prisma.referrer.create({
      data: {
        name: name.trim(),
        affiliation: affiliation?.trim() || null,
        specialization: specialization?.trim() || null,
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
    const { id, name, affiliation, specialization } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'Referrer ID is required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (name !== undefined) data.name = name.trim()
    if (affiliation !== undefined) data.affiliation = affiliation?.trim() || null
    if (specialization !== undefined) data.specialization = specialization?.trim() || null

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
