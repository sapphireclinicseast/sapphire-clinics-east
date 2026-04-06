/**
 * FIFO (First In, First Out) inventory lot consumption.
 *
 * When inventory is consumed (POS order or shrinkage), this function
 * depletes the oldest purchase lots first, recording the actual cost
 * from each lot.
 */

import { PrismaClient, Prisma } from '@prisma/client'

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export interface FifoResult {
  totalCost: number
  lots: { lotId: string; quantity: number; costPerUnit: number; cost: number }[]
}

/**
 * Consume inventory using FIFO: deplete oldest lots first.
 * Must be called within a Prisma interactive transaction.
 *
 * @param tx - Prisma transaction client
 * @param itemId - The inventory item being consumed
 * @param quantityToConsume - How many units to consume
 * @returns Total FIFO cost and breakdown by lot
 */
export async function consumeFifoLots(
  tx: TxClient,
  itemId: string,
  quantityToConsume: number,
): Promise<FifoResult> {
  // Get all INCREASE lots with remaining stock, oldest first
  const lots = await tx.inventoryAdjustment.findMany({
    where: {
      itemId,
      type: 'INCREASE',
      remainingQuantity: { gt: 0 },
    },
    orderBy: [{ adjustmentDate: 'asc' }, { createdAt: 'asc' }],
  })

  let remaining = quantityToConsume
  let totalCost = 0
  const consumptions: FifoResult['lots'] = []

  for (const lot of lots) {
    if (remaining <= 0) break

    const available = lot.remainingQuantity ?? 0
    if (available <= 0) continue

    const take = Math.min(available, remaining)

    // Cost per unit from this lot
    // Prefer landed cost, fall back to local cost, then 0
    const costPerUnit = lot.totalLandedCost && lot.quantityChange > 0
      ? Number(lot.totalLandedCost) / lot.quantityChange
      : lot.localCost
        ? Number(lot.localCost)
        : 0

    const lotCost = costPerUnit * take

    // Decrement remaining quantity on the lot
    await tx.inventoryAdjustment.update({
      where: { id: lot.id },
      data: { remainingQuantity: available - take },
    })

    consumptions.push({
      lotId: lot.id,
      quantity: take,
      costPerUnit: Math.round(costPerUnit * 100) / 100,
      cost: Math.round(lotCost * 100) / 100,
    })

    totalCost += lotCost
    remaining -= take
  }

  // If we couldn't fulfill entirely from lots (pre-FIFO data), use item's unitCost as fallback
  if (remaining > 0) {
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId }, select: { unitCost: true } })
    const fallbackCost = item ? Number(item.unitCost) * remaining : 0
    totalCost += fallbackCost
    // No lot to record — this is a data gap from before FIFO was enabled
  }

  return {
    totalCost: Math.round(totalCost * 100) / 100,
    lots: consumptions,
  }
}

/**
 * Recalculate the weighted-average unit cost from remaining FIFO lots.
 * Useful after bulk import or consumption to keep unitCost current.
 */
export async function recalcWeightedUnitCost(
  tx: TxClient,
  itemId: string,
): Promise<number> {
  const lots = await tx.inventoryAdjustment.findMany({
    where: {
      itemId,
      type: 'INCREASE',
      remainingQuantity: { gt: 0 },
    },
    select: {
      quantityChange: true,
      remainingQuantity: true,
      totalLandedCost: true,
      localCost: true,
    },
  })

  let totalValue = 0
  let totalQty = 0

  for (const lot of lots) {
    const qty = lot.remainingQuantity ?? 0
    if (qty <= 0) continue

    const costPerUnit = lot.totalLandedCost && lot.quantityChange > 0
      ? Number(lot.totalLandedCost) / lot.quantityChange
      : lot.localCost
        ? Number(lot.localCost)
        : 0

    totalValue += costPerUnit * qty
    totalQty += qty
  }

  return totalQty > 0 ? Math.round((totalValue / totalQty) * 100) / 100 : 0
}
