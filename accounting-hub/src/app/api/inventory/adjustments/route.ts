import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'
import { consumeFifoLots, recalcWeightedUnitCost } from '@/lib/fifo'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)
  const itemId = searchParams.get('itemId') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (itemId) where.itemId = itemId

  const [adjustments, total] = await Promise.all([
    prisma.inventoryAdjustment.findMany({
      where,
      include: {
        item: { select: { name: true, sku: true } },
        adjustedBy: { select: { name: true } },
      },
      orderBy: { adjustmentDate: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.inventoryAdjustment.count({ where }),
  ])

  return NextResponse.json(paginatedResult(adjustments, total, params))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { itemId, type, quantityChange, adjustmentDate, remarks,
            foreignCost, foreignCurrency, localCost, exchangeRate } = await req.json()

    if (!itemId || !type || !quantityChange || !remarks?.trim()) {
      return NextResponse.json({ error: 'Item, type, quantity change, and remarks are required' }, { status: 400 })
    }

    if (!['SHRINKAGE', 'INCREASE'].includes(type)) {
      return NextResponse.json({ error: 'Type must be SHRINKAGE or INCREASE' }, { status: 400 })
    }

    const change = Math.abs(parseInt(quantityChange))
    if (change <= 0) {
      return NextResponse.json({ error: 'Quantity change must be positive' }, { status: 400 })
    }

    // Get current item
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } })
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const previousQuantity = item.quantity
    const newQuantity = type === 'INCREASE' ? previousQuantity + change : Math.max(0, previousQuantity - change)

    // Create adjustment and update item quantity in one transaction
    const adjustment = await prisma.$transaction(async (tx) => {
      // For INCREASE, calculate cost data if provided
      const costData: Record<string, unknown> = {}
      if (type === 'INCREASE') {
        if (foreignCost) {
          costData.foreignCost = parseFloat(foreignCost)
          costData.foreignCurrency = foreignCurrency || 'PHP'
        }
        if (localCost) {
          costData.localCost = parseFloat(localCost)
          costData.totalLandedCost = parseFloat(localCost) * change
        } else if (foreignCost && exchangeRate) {
          const lc = parseFloat(foreignCost) * parseFloat(exchangeRate)
          costData.localCost = lc
          costData.exchangeRate = parseFloat(exchangeRate)
          costData.totalLandedCost = lc * change
        }
      }

      const adj = await tx.inventoryAdjustment.create({
        data: {
          itemId,
          type,
          quantityChange: change,
          remainingQuantity: type === 'INCREASE' ? change : null,
          previousQuantity,
          newQuantity,
          adjustmentDate: adjustmentDate ? new Date(adjustmentDate) : new Date(),
          remarks: remarks.trim(),
          adjustedById: session.user.id,
          ...costData,
        },
        include: {
          item: { select: { name: true, sku: true } },
          adjustedBy: { select: { name: true } },
        },
      })

      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { quantity: newQuantity },
      })

      // For SHRINKAGE, consume from oldest FIFO lots
      if (type === 'SHRINKAGE') {
        await consumeFifoLots(tx, itemId, change)
      }

      // Recalculate weighted-average unit cost from remaining lots
      const newUnitCost = await recalcWeightedUnitCost(tx, itemId)
      if (newUnitCost > 0) {
        await tx.inventoryItem.update({ where: { id: itemId }, data: { unitCost: newUnitCost } })
      }

      return adj
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ADJUSTMENT',
        entity: 'inventoryItem',
        entityId: itemId,
        details: { type, quantityChange: change, previousQuantity, newQuantity, remarks: remarks.trim() },
      },
    })

    return NextResponse.json(adjustment, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
