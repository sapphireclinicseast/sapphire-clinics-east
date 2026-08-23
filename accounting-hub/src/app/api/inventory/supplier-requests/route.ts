import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

/**
 * Purchase requests sent to a supplier.
 *
 * The printed sheet quotes each product the way the SUPPLIER lists it
 * (supplierProductName), with its photo and packed dimensions, because that is
 * what they recognise when we reorder. Those details are read live from the
 * item rather than copied here, so a corrected dimension or a new photo shows
 * on a reprint; only the quantity and who prepared it belong to the request.
 */

const STATUSES = ['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  const itemSelect = {
    id: true, sku: true, name: true, supplierProductName: true, description: true,
    imageUrl: true, dimensionLength: true, dimensionWidth: true, dimensionHeight: true,
    weightKg: true, quantity: true, reorderLevel: true,
  }

  if (id) {
    const request = await prisma.supplierRequest.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, supplierName: true, email: true, contactNumber: true, contactPerson: true, contactMethod: true, contactHandle: true, address: true, currency: true } },
        items: { orderBy: { createdAt: 'asc' }, include: { item: { select: itemSelect } } },
      },
    })
    if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    return NextResponse.json(request)
  }

  const requests = await prisma.supplierRequest.findMany({
    orderBy: { requestDate: 'desc' },
    take: 200,
    include: {
      supplier: { select: { id: true, supplierName: true } },
      items: { include: { item: { select: itemSelect } } },
    },
  })
  return NextResponse.json({ data: requests })
}

/** POST { supplierId, requestDate, remarks?, items: [{ itemId, quantity, remarks? }] } */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { supplierId, requestDate, remarks, items } = await req.json()
    if (!supplierId) return NextResponse.json({ error: 'Choose a supplier' }, { status: 400 })

    const rows = (Array.isArray(items) ? items : [])
      .map((r: { itemId?: string; quantity?: unknown; remarks?: string }) => ({
        itemId: String(r?.itemId || ''),
        quantity: Math.round(Number(r?.quantity)),
        remarks: r?.remarks?.trim() || null,
      }))
      .filter((r) => r.itemId && Number.isFinite(r.quantity) && r.quantity > 0)
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Add at least one product with a quantity greater than zero' }, { status: 400 })
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } })
    if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })

    const when = requestDate ? new Date(requestDate) : new Date()
    const ymd = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}${String(when.getDate()).padStart(2, '0')}`
    const prefix = `SR-${ymd}-`
    const last = await prisma.supplierRequest.findFirst({
      where: { referenceNumber: { startsWith: prefix } },
      orderBy: { referenceNumber: 'desc' },
      select: { referenceNumber: true },
    })
    const seq = last ? parseInt(last.referenceNumber.split('-').pop() || '0') + 1 : 1
    const referenceNumber = `${prefix}${String(seq).padStart(3, '0')}`

    const created = await prisma.supplierRequest.create({
      data: {
        referenceNumber,
        supplierId,
        requestDate: when,
        remarks: remarks?.trim() || null,
        preparedByName: session.user.name || session.user.email || 'Unknown',
        preparedById: session.user.id,
        items: { create: rows },
      },
      include: { supplier: { select: { supplierName: true } }, items: true },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'SUPPLIER_REQUEST',
        entity: 'supplierRequest',
        entityId: created.id,
        details: { referenceNumber, supplierId, itemCount: rows.length },
      },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    console.error('[Supplier Request] create error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}

/** PATCH { id, requestDate?, remarks?, status?, items? } — replaces the item list when given. */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id, requestDate, remarks, status, items } = await req.json()
    if (!id) return NextResponse.json({ error: 'Request id is required' }, { status: 400 })
    if (status && !STATUSES.includes(status)) {
      return NextResponse.json({ error: `Status must be one of ${STATUSES.join(', ')}` }, { status: 400 })
    }

    const existing = await prisma.supplierRequest.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

    const rows = Array.isArray(items)
      ? items
          .map((r: { itemId?: string; quantity?: unknown; remarks?: string }) => ({
            itemId: String(r?.itemId || ''),
            quantity: Math.round(Number(r?.quantity)),
            remarks: r?.remarks?.trim() || null,
          }))
          .filter((r) => r.itemId && Number.isFinite(r.quantity) && r.quantity > 0)
      : null
    if (rows && rows.length === 0) {
      return NextResponse.json({ error: 'Add at least one product with a quantity greater than zero' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.supplierRequest.update({
        where: { id },
        data: {
          ...(requestDate ? { requestDate: new Date(requestDate) } : {}),
          ...(remarks !== undefined ? { remarks: remarks?.trim() || null } : {}),
          ...(status ? { status } : {}),
        },
      })
      if (rows) {
        await tx.supplierRequestItem.deleteMany({ where: { requestId: id } })
        await tx.supplierRequestItem.createMany({ data: rows.map((r) => ({ ...r, requestId: id })) })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Supplier Request] update error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}

/** DELETE ?id= — items cascade. */
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'Request id is required' }, { status: 400 })
  try {
    const existing = await prisma.supplierRequest.findUnique({ where: { id }, select: { referenceNumber: true } })
    if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    await prisma.supplierRequest.delete({ where: { id } })
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'SUPPLIER_REQUEST_DELETE',
        entity: 'supplierRequest',
        entityId: id,
        details: { referenceNumber: existing.referenceNumber },
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Supplier Request] delete error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
