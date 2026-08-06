import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)
  const search = searchParams.get('search') || ''
  const all = searchParams.get('all') === 'true' // For dropdown (returns all active, no pagination)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }

  if (search) {
    where.OR = [
      { supplierName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (all) {
    const suppliers = await prisma.supplier.findMany({
      where,
      select: { id: true, supplierName: true, isForeign: true, currency: true, defaultExchangeRate: true },
      orderBy: { supplierName: 'asc' },
    })
    return NextResponse.json(suppliers)
  }

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { supplierName: 'asc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.supplier.count({ where }),
  ])

  return NextResponse.json(paginatedResult(suppliers, total, params))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { supplierName, email, contactNumber, contactPerson, contactMethod, contactHandle, isForeign, currency, defaultExchangeRate, address, notes } = await req.json()

    if (!supplierName?.trim()) {
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
    }

    const supplier = await prisma.supplier.create({
      data: {
        // Supplier names are stored upper case so the list reads uniformly no
        // matter how each one was typed in.
        supplierName: supplierName.trim().toUpperCase(),
        email: email?.trim() || null,
        contactNumber: contactNumber?.trim() || null,
        contactPerson: contactPerson?.trim() || null,
        contactMethod: contactMethod?.trim() || null,
        contactHandle: contactHandle?.trim() || null,
        isForeign: isForeign || false,
        currency: isForeign ? (currency?.trim() || 'USD') : 'PHP',
        defaultExchangeRate: isForeign && defaultExchangeRate ? parseFloat(defaultExchangeRate) : null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
        createdById: session.user.id,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'supplier',
        entityId: supplier.id,
        details: { supplierName: supplier.supplierName, isForeign: supplier.isForeign },
      },
    })

    return NextResponse.json(supplier, { status: 201 })
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
    const { id, supplierName, email, contactNumber, contactPerson, contactMethod, contactHandle, isForeign, currency, defaultExchangeRate, address, notes } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'Supplier ID is required' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (supplierName !== undefined) data.supplierName = supplierName.trim().toUpperCase()
    if (email !== undefined) data.email = email?.trim() || null
    if (contactNumber !== undefined) data.contactNumber = contactNumber?.trim() || null
    if (contactPerson !== undefined) data.contactPerson = contactPerson?.trim() || null
    if (contactMethod !== undefined) data.contactMethod = contactMethod?.trim() || null
    if (contactHandle !== undefined) data.contactHandle = contactHandle?.trim() || null
    if (isForeign !== undefined) data.isForeign = isForeign
    if (currency !== undefined) data.currency = currency?.trim() || 'PHP'
    if (defaultExchangeRate !== undefined) data.defaultExchangeRate = defaultExchangeRate ? parseFloat(defaultExchangeRate) : null
    if (address !== undefined) data.address = address?.trim() || null
    if (notes !== undefined) data.notes = notes?.trim() || null

    const supplier = await prisma.supplier.update({ where: { id }, data })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'supplier',
        entityId: supplier.id,
        details: { updated: Object.keys(data) },
      },
    })

    return NextResponse.json(supplier)
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
      return NextResponse.json({ error: 'Supplier ID is required' }, { status: 400 })
    }

    await prisma.supplier.update({ where: { id }, data: { isActive: false } })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: 'DEACTIVATE', entity: 'supplier', entityId: id },
    })

    return NextResponse.json({ message: 'Supplier deactivated' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
