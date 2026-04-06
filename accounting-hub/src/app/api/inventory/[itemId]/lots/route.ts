import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/inventory/[itemId]/lots
 *
 * Returns all INCREASE adjustment lots for an item, showing FIFO cost layers.
 * Ordered oldest-first (FIFO order).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await params

  const lots = await prisma.inventoryAdjustment.findMany({
    where: {
      itemId,
      type: 'INCREASE',
    },
    select: {
      id: true,
      adjustmentDate: true,
      quantityChange: true,
      remainingQuantity: true,
      foreignCost: true,
      foreignCurrency: true,
      exchangeRate: true,
      localCost: true,
      freightAllocation: true,
      totalLandedCost: true,
      batchId: true,
      remarks: true,
      createdAt: true,
    },
    orderBy: [{ adjustmentDate: 'asc' }, { createdAt: 'asc' }],
  })

  // Compute costPerUnit for each lot
  const enriched = lots.map(lot => {
    const costPerUnit = lot.totalLandedCost && lot.quantityChange > 0
      ? Number(lot.totalLandedCost) / lot.quantityChange
      : lot.localCost
        ? Number(lot.localCost)
        : 0

    return {
      ...lot,
      foreignCost: lot.foreignCost ? Number(lot.foreignCost) : null,
      exchangeRate: lot.exchangeRate ? Number(lot.exchangeRate) : null,
      localCost: lot.localCost ? Number(lot.localCost) : null,
      freightAllocation: lot.freightAllocation ? Number(lot.freightAllocation) : null,
      totalLandedCost: lot.totalLandedCost ? Number(lot.totalLandedCost) : null,
      costPerUnit: Math.round(costPerUnit * 100) / 100,
      remaining: lot.remainingQuantity ?? 0,
    }
  })

  // Weighted average of remaining lots
  let totalValue = 0
  let totalRemaining = 0
  for (const lot of enriched) {
    if (lot.remaining > 0) {
      totalValue += lot.costPerUnit * lot.remaining
      totalRemaining += lot.remaining
    }
  }
  const weightedAvgCost = totalRemaining > 0
    ? Math.round((totalValue / totalRemaining) * 100) / 100
    : 0

  return NextResponse.json({
    lots: enriched,
    summary: {
      totalLots: enriched.length,
      activeLots: enriched.filter(l => l.remaining > 0).length,
      totalRemaining,
      weightedAvgCost,
    },
  })
}
