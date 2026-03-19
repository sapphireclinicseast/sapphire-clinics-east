import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)
  const status = searchParams.get('status') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (status) where.status = status

  const [transfers, total] = await Promise.all([
    prisma.consignmentTransfer.findMany({
      where,
      include: {
        item: { select: { name: true, sku: true } },
        requestedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.consignmentTransfer.count({ where }),
  ])

  return NextResponse.json(paginatedResult(transfers, total, params))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { itemId, toBranch, quantity, remarks } = await req.json()

    if (!itemId || !toBranch || !quantity) {
      return NextResponse.json({ error: 'Item, destination branch, and quantity are required' }, { status: 400 })
    }

    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } })
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (item.branch === toBranch) {
      return NextResponse.json({ error: 'Cannot transfer to the same branch' }, { status: 400 })
    }

    const qty = parseInt(quantity)
    if (qty <= 0 || qty > item.quantity) {
      return NextResponse.json({ error: `Quantity must be between 1 and ${item.quantity}` }, { status: 400 })
    }

    const transfer = await prisma.consignmentTransfer.create({
      data: {
        itemId,
        fromBranch: item.branch,
        toBranch,
        quantity: qty,
        status: 'PENDING',
        requestedById: session.user.id,
        remarks: remarks?.trim() || null,
      },
      include: {
        item: { select: { name: true, sku: true } },
        requestedBy: { select: { name: true } },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CONSIGNMENT_REQUEST',
        entity: 'consignmentTransfer',
        entityId: transfer.id,
        details: { sku: item.sku, fromBranch: item.branch, toBranch, quantity: qty },
      },
    })

    return NextResponse.json(transfer, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update transfer status (approve, ship, receive, return, cancel)
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, action } = await req.json()

    if (!id || !action) {
      return NextResponse.json({ error: 'Transfer ID and action are required' }, { status: 400 })
    }

    const transfer = await prisma.consignmentTransfer.findUnique({
      where: { id },
      include: { item: true },
    })

    if (!transfer) {
      return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
    }

    // Validate state transitions
    const validTransitions: Record<string, string[]> = {
      PENDING: ['approve', 'cancel'],
      APPROVED: ['ship'],
      SHIPPED: ['receive', 'return'],
    }

    const allowed = validTransitions[transfer.status] || []
    if (!allowed.includes(action)) {
      return NextResponse.json({ error: `Cannot ${action} a ${transfer.status} transfer` }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {}

    switch (action) {
      case 'approve':
        updateData.status = 'APPROVED'
        updateData.approvedById = session.user.id
        updateData.approvedAt = new Date()
        break
      case 'cancel':
        updateData.status = 'CANCELLED'
        break
      case 'ship':
        updateData.status = 'SHIPPED'
        updateData.shippedAt = new Date()
        break
      case 'return':
        updateData.status = 'RETURNED'
        break
      case 'receive': {
        updateData.status = 'RECEIVED'
        updateData.receivedAt = new Date()

        // Deduct from source item
        await prisma.inventoryItem.update({
          where: { id: transfer.itemId },
          data: { quantity: { decrement: transfer.quantity } },
        })

        // Find or create destination item
        const destItem = await prisma.inventoryItem.findFirst({
          where: {
            sku: transfer.item.sku,
            branch: transfer.toBranch,
            isActive: true,
          },
        })

        if (destItem) {
          await prisma.inventoryItem.update({
            where: { id: destItem.id },
            data: { quantity: { increment: transfer.quantity } },
          })
        } else {
          // Create new item at destination branch
          await prisma.inventoryItem.create({
            data: {
              name: transfer.item.name,
              sku: `${transfer.item.sku}-${transfer.toBranch.substring(0, 4)}`,
              skuDepartment: transfer.item.skuDepartment,
              skuCategory: transfer.item.skuCategory,
              skuSubcategory: transfer.item.skuSubcategory,
              skuSequence: transfer.item.skuSequence,
              barcode: transfer.item.barcode,
              branch: transfer.toBranch,
              accountSubType: transfer.item.accountSubType,
              unitCost: transfer.item.unitCost,
              sellingPrice: transfer.item.sellingPrice,
              quantity: transfer.quantity,
              reorderLevel: transfer.item.reorderLevel,
              supplierId: transfer.item.supplierId,
              createdById: session.user.id,
            },
          })
        }
        break
      }
    }

    const updated = await prisma.consignmentTransfer.update({
      where: { id },
      data: updateData,
      include: {
        item: { select: { name: true, sku: true } },
        requestedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: `CONSIGNMENT_${action.toUpperCase()}`,
        entity: 'consignmentTransfer',
        entityId: id,
        details: { action, status: updated.status },
      },
    })

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
