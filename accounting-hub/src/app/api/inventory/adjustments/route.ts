import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'
import { consumeFifoLots, recalcWeightedUnitCost } from '@/lib/fifo'
import { postInventoryAdjustmentJournal, reverseInventoryAdjustmentJournal } from '@/lib/accounting/post-inventory-adjustment'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

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
        batch: { select: { referenceNumber: true } },
      },
      orderBy: { adjustmentDate: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.inventoryAdjustment.count({ where }),
  ])

  // Enrich with display reference numbers for records without one
  const enriched = adjustments.map((adj, idx) => ({
    ...adj,
    displayRef: adj.batch?.referenceNumber ?? adj.referenceNumber ?? null,
  }))
  return NextResponse.json(paginatedResult(enriched, total, params))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { itemId, type, quantityChange, adjustmentDate, remarks,
            foreignCost, foreignCurrency, localCost, exchangeRate, skipGl } = await req.json()

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

    // Tier 3 Step 5: Post the inventory movement to the GL.
    // skipGl → this adjustment mirrors a petty-cash / one-time-expense entry that
    // already carries the cash + GL impact (opening batch or replenishment funded
    // by petty cash). Posting a JE here would double-count inventory on the sheet,
    // so we deliberately skip it — same rule as assets-from-petty-cash.
    let invPostResult: Awaited<ReturnType<typeof postInventoryAdjustmentJournal>> | null = null
    try {
      invPostResult = skipGl === true
        ? { posted: false, reason: 'skipped: sourced from petty cash / expense (no double-count)' }
        : await postInventoryAdjustmentJournal(prisma, adjustment.id, session.user.id)
      if (invPostResult.posted) {
        console.log(`[GL] Posted inventory ${type} JE ${invPostResult.journalEntryId} for adj ${adjustment.id}`)
      } else if (process.env.ENABLE_GL_POSTING === 'true') {
        console.warn(`[GL] Skipped inventory ${type} posting for ${adjustment.id}: ${invPostResult.reason}`)
      }
    } catch (postErr) {
      console.error(`[GL] Inventory ${type} posting threw for ${adjustment.id}:`, postErr)
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ADJUSTMENT',
        entity: 'inventoryItem',
        entityId: itemId,
        details: {
          type, quantityChange: change, previousQuantity, newQuantity, remarks: remarks.trim(),
          glPosted: invPostResult?.posted ?? false,
          glReason: invPostResult?.posted ? undefined : invPostResult?.reason,
        },
      },
    })

    return NextResponse.json(adjustment, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Delete an adjustment and reverse its effect
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Adjustment ID is required' }, { status: 400 })

    const adjustment = await prisma.inventoryAdjustment.findUnique({ where: { id } })
    if (!adjustment) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 })

    // Tier 3 Step 5: Reverse the GL entry BEFORE deleting the adjustment row
    // so referenceId lookup still works. Reversal stays as the audit trail.
    try {
      const r = await reverseInventoryAdjustmentJournal(prisma, id, session.user.id, 'inventory adjustment deleted')
      if (r.posted) console.log(`[GL] Reversed inventory adj ${id} via JE ${r.journalEntryId}`)
    } catch (postErr) {
      console.error(`[GL] Inventory reversal threw for ${id}:`, postErr)
    }

    await prisma.$transaction(async (tx) => {
      // Reverse the quantity change on the item
      const item = await tx.inventoryItem.findUnique({ where: { id: adjustment.itemId } })
      if (!item) throw new Error('Item not found')

      const reversedQty = adjustment.type === 'INCREASE'
        ? Math.max(0, item.quantity - adjustment.quantityChange)
        : item.quantity + adjustment.quantityChange

      await tx.inventoryItem.update({
        where: { id: adjustment.itemId },
        data: { quantity: reversedQty },
      })

      // Delete the adjustment record
      await tx.inventoryAdjustment.delete({ where: { id } })

      // Recalculate weighted-average unit cost
      const newUnitCost = await recalcWeightedUnitCost(tx, adjustment.itemId)
      if (newUnitCost > 0) {
        await tx.inventoryItem.update({ where: { id: adjustment.itemId }, data: { unitCost: newUnitCost } })
      }
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE_ADJUSTMENT',
        entity: 'inventoryItem',
        entityId: adjustment.itemId,
        details: { adjustmentId: id, type: adjustment.type, quantityChange: adjustment.quantityChange },
      },
    })

    return NextResponse.json({ message: 'Adjustment deleted' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
