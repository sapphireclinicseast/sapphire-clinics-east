import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recalcWeightedUnitCost } from '@/lib/fifo'
import { postSoldCostRestatement } from '@/lib/accounting/post-cost-restatement'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// POST { adjustmentId, freightAmount, sourceEntryId?, remarks? }
// Capitalize a freight-forwarder cost (paid via petty cash / one-time expense)
// into an existing INCREASE stock lot. The freight is added to that lot's landed
// cost — NO quantity change — so the item's weighted-average unit cost rises
// across the units in that batch. No journal entry is posted: the freight's
// petty-cash / expense entry already carries the cash + GL impact (same rule as
// assets-from-petty-cash), so posting here would double-count inventory value.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { adjustmentId, freightAmount, sourceEntryId, remarks } = await req.json()
    const freight = Number(freightAmount)
    if (!adjustmentId || !(freight > 0)) {
      return NextResponse.json({ error: 'adjustmentId and a positive freightAmount are required' }, { status: 400 })
    }

    const lot = await prisma.inventoryAdjustment.findUnique({ where: { id: adjustmentId } })
    if (!lot) return NextResponse.json({ error: 'Stock adjustment not found' }, { status: 404 })
    if (lot.type !== 'INCREASE') {
      return NextResponse.json({ error: 'Freight can only be capitalized into an INCREASE (stock-in) batch' }, { status: 400 })
    }
    const qty = lot.quantityChange
    if (!qty || qty <= 0) {
      return NextResponse.json({ error: 'This batch has no quantity to spread the freight over' }, { status: 400 })
    }

    const item = await prisma.inventoryItem.findUnique({ where: { id: lot.itemId }, select: { id: true, name: true, unitCost: true } })
    if (!item) return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 })

    // Current landed cost basis for this lot: prefer stored landed cost, then
    // localCost × qty, then the item's unit cost × qty (pre-FIFO fallback).
    const priorTotal = lot.totalLandedCost != null
      ? Number(lot.totalLandedCost)
      : lot.localCost != null
        ? Number(lot.localCost) * qty
        : Number(item.unitCost) * qty
    const newTotal = Math.round((priorTotal + freight) * 100) / 100
    const newLocal = Math.round((newTotal / qty) * 100) / 100

    const capNote = `Freight capitalized +₱${freight.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${remarks ? ` (${remarks})` : ''}`

    const result = await prisma.$transaction(async (tx) => {
      await tx.inventoryAdjustment.update({
        where: { id: adjustmentId },
        data: {
          totalLandedCost: newTotal,
          localCost: newLocal,
          remarks: `${lot.remarks || ''}${lot.remarks ? ' — ' : ''}${capNote}`.slice(0, 500),
        },
      })
      const newUnitCost = await recalcWeightedUnitCost(tx, lot.itemId)
      if (newUnitCost > 0) {
        await tx.inventoryItem.update({ where: { id: lot.itemId }, data: { unitCost: newUnitCost } })
      }
      // Units of this lot already sold carry the pre-freight cost in their COGS.
      // Recalc above only re-values what is still on hand, so the sold units'
      // share of the freight would otherwise stay stranded in Inventory.
      const soldUnits = qty - (lot.remainingQuantity ?? qty)
      const restatement = await postSoldCostRestatement(tx, {
        changes: [{ itemId: lot.itemId, soldUnits, oldUnitCost: priorTotal / qty, newUnitCost: newLocal }],
        entryDate: new Date(),
        createdById: session.user!.id as string,
        referenceType: 'INVENTORY_COST_RESTATEMENT',
        referenceId: adjustmentId,
        description: `Freight capitalized into sold units — ${item.name}`,
      })
      return { newUnitCost, restatement }
    })

    // Stamp the source entry so the "Recorded in Inventory" state persists.
    let inventoryRecordedAt: Date | null = null
    if (sourceEntryId) {
      const src = await prisma.pettyCashEntry.findUnique({ where: { id: sourceEntryId }, select: { inventoryRecordedAt: true } })
      if (src) {
        inventoryRecordedAt = src.inventoryRecordedAt ?? new Date()
        if (!src.inventoryRecordedAt) {
          await prisma.pettyCashEntry.update({ where: { id: sourceEntryId }, data: { inventoryRecordedAt } })
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'FREIGHT_CAPITALIZE',
        entity: 'inventoryAdjustment',
        entityId: adjustmentId,
        details: {
          itemId: lot.itemId, itemName: item.name, freight,
          priorTotalLandedCost: priorTotal, newTotalLandedCost: newTotal, newUnitCost: result.newUnitCost,
          sourceEntryId: sourceEntryId || null,
          costRestatement: result.restatement.posted
            ? { totalDelta: result.restatement.totalDelta, journalEntryIds: result.restatement.journalEntryIds }
            : { skipped: result.restatement.reason },
        },
      },
    })

    return NextResponse.json({ ok: true, newUnitCost: result.newUnitCost, newTotalLandedCost: newTotal, inventoryRecordedAt, costRestatement: result.restatement })
  } catch (err) {
    console.error('capitalize freight error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to capitalize freight' }, { status: 500 })
  }
}
