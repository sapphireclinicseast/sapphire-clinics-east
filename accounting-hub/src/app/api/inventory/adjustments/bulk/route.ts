import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postInventoryAdjustmentJournal } from '@/lib/accounting/post-inventory-adjustment'
import { recalcWeightedUnitCost } from '@/lib/fifo'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

/**
 * POST /api/inventory/adjustments/bulk
 *
 * Body: {
 *   items: [{ sku, quantity, foreignCostPerUnit, foreignCurrency }],
 *   localPaymentTotal: number,   // Total paid in PHP
 *   freightCost: number,         // Optional freight cost in PHP
 *   adjustmentDate: string,
 *   remarks: string,
 * }
 *
 * Auto-computes:
 * - Exchange rate = localPaymentTotal / foreignTotal
 * - Local cost per unit = foreignCostPerUnit * exchangeRate
 * - Freight allocation = pro-rated by (item foreign cost * qty) / total foreign cost
 * - Total landed cost = (localCost * qty) + freightAllocation
 * - Updates item.unitCost to new landed cost per unit
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { items, localPaymentTotal, freightCost = 0, adjustmentDate, remarks = 'Bulk import' } = body

    if (!items?.length) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }
    if (!localPaymentTotal || localPaymentTotal <= 0) {
      return NextResponse.json({ error: 'Local payment total (PHP) is required' }, { status: 400 })
    }

    // Look up all items by SKU
    const skus = items.map((it: { sku: string }) => it.sku?.trim()).filter(Boolean)
    const dbItems = await prisma.inventoryItem.findMany({
      where: { sku: { in: skus } },
    })
    const skuMap = new Map(dbItems.map(i => [i.sku, i]))

    // Validate all SKUs exist
    const missingSkus = skus.filter((s: string) => !skuMap.has(s))
    if (missingSkus.length > 0) {
      return NextResponse.json(
        { error: `SKUs not found: ${missingSkus.join(', ')}` },
        { status: 400 }
      )
    }

    // Calculate totals
    const foreignCurrency = items[0]?.foreignCurrency || 'CNY'
    const foreignTotal = items.reduce((sum: number, it: { quantity: number; foreignCostPerUnit: number }) => {
      return sum + (Number(it.foreignCostPerUnit) * Number(it.quantity))
    }, 0)

    if (foreignTotal <= 0) {
      return NextResponse.json({ error: 'Total foreign cost must be positive' }, { status: 400 })
    }

    // Auto-compute exchange rate
    const exchangeRate = Number(localPaymentTotal) / foreignTotal
    const totalFreight = Number(freightCost) || 0

    // Generate batch ID
    const batchId = `BULK-${Date.now()}`

    // Process each item
    const results = []
    const adjustmentOps = []
    const updateOps = []

    for (const rawItem of items) {
      const sku = rawItem.sku?.trim()
      const qty = Math.abs(parseInt(rawItem.quantity) || 0)
      const foreignCostPerUnit = Number(rawItem.foreignCostPerUnit) || 0
      const type = qty >= 0 ? 'INCREASE' : 'SHRINKAGE'
      const absQty = Math.abs(qty)

      if (absQty === 0) continue

      const dbItem = skuMap.get(sku)
      if (!dbItem) continue

      // Calculate costs
      const itemForeignTotal = foreignCostPerUnit * absQty
      const localCostPerUnit = foreignCostPerUnit * exchangeRate
      // Pro-rate freight by share of total foreign cost
      const freightShare = foreignTotal > 0 ? (itemForeignTotal / foreignTotal) * totalFreight : 0
      const totalLandedCost = (localCostPerUnit * absQty) + freightShare
      const landedCostPerUnit = absQty > 0 ? totalLandedCost / absQty : 0

      const previousQuantity = dbItem.quantity
      const newQuantity = type === 'INCREASE' ? previousQuantity + absQty : Math.max(0, previousQuantity - absQty)

      adjustmentOps.push(
        prisma.inventoryAdjustment.create({
          data: {
            itemId: dbItem.id,
            type,
            quantityChange: absQty,
            remainingQuantity: type === 'INCREASE' ? absQty : null,
            previousQuantity,
            newQuantity,
            adjustmentDate: adjustmentDate ? new Date(`${adjustmentDate}T08:00:00+08:00`) : new Date(),
            remarks: remarks.trim(),
            batchId,
            foreignCost: foreignCostPerUnit,
            foreignCurrency,
            exchangeRate,
            localCost: localCostPerUnit,
            freightAllocation: freightShare,
            totalLandedCost,
            adjustedById: session.user.id,
          },
        })
      )

      // Update item quantity and unit cost
      updateOps.push(
        prisma.inventoryItem.update({
          where: { id: dbItem.id },
          data: {
            quantity: newQuantity,
            unitCost: landedCostPerUnit, // Update to new landed cost
            supplierExchangeRate: exchangeRate,
          },
        })
      )

      results.push({
        sku,
        name: dbItem.name,
        quantity: absQty,
        type,
        foreignCostPerUnit,
        localCostPerUnit: Math.round(localCostPerUnit * 100) / 100,
        freightAllocation: Math.round(freightShare * 100) / 100,
        totalLandedCost: Math.round(totalLandedCost * 100) / 100,
        landedCostPerUnit: Math.round(landedCostPerUnit * 100) / 100,
      })
    }

    // Execute all in one transaction. The result preserves order, so the first
    // adjustmentOps.length entries are the created InventoryAdjustment rows.
    const txResults = await prisma.$transaction([...adjustmentOps, ...updateOps])
    const createdAdjustments = txResults.slice(0, adjustmentOps.length) as { id: string }[]

    // Tier 3 Step 5: Post each inventory movement to the GL. Non-fatal.
    for (const adj of createdAdjustments) {
      try {
        const r = await postInventoryAdjustmentJournal(prisma, adj.id, session.user.id)
        if (r.posted) console.log(`[GL] Posted bulk inventory JE ${r.journalEntryId} for adj ${adj.id}`)
        else if (process.env.ENABLE_GL_POSTING === 'true') console.warn(`[GL] Skipped bulk inventory posting for ${adj.id}: ${r.reason}`)
      } catch (postErr) {
        console.error(`[GL] Bulk inventory posting threw for ${adj.id}:`, postErr)
      }
    }

    // Recalculate weighted-average unitCost from FIFO lots for each affected item
    const affectedItemIds = [...new Set(results.map(r => skuMap.get(r.sku)?.id).filter(Boolean))] as string[]
    for (const id of affectedItemIds) {
      const weightedCost = await recalcWeightedUnitCost(prisma, id)
      if (weightedCost > 0) {
        await prisma.inventoryItem.update({ where: { id }, data: { unitCost: weightedCost } })
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'BULK_ADJUSTMENT',
        entity: 'inventoryAdjustment',
        entityId: batchId,
        details: {
          batchId,
          itemCount: results.length,
          foreignCurrency,
          foreignTotal,
          localPaymentTotal: Number(localPaymentTotal),
          exchangeRate: Math.round(exchangeRate * 10000) / 10000,
          freightCost: totalFreight,
        },
      },
    })

    return NextResponse.json({
      batchId,
      exchangeRate: Math.round(exchangeRate * 10000) / 10000,
      foreignTotal,
      localPaymentTotal: Number(localPaymentTotal),
      freightCost: totalFreight,
      itemCount: results.length,
      items: results,
    }, { status: 201 })
  } catch (err) {
    console.error('Bulk adjustment error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
