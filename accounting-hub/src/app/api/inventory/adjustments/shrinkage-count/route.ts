import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { consumeFifoLots, restoreFifoLots, recalcWeightedUnitCost } from '@/lib/fifo'
import crypto from 'crypto'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

/**
 * Bulk physical-count shrinkage — POST
 *   { adjustmentDate, auditorName, auditorSignature, rows: [{ itemId, countedQuantity }] }
 * For each row: shrinkage = current stock − counted. Positive → SHRINKAGE (deduct FIFO);
 * negative → INCREASE (overage found). Rows are grouped under one batchId, and every
 * adjustment carries the counted amount + auditor name + e-signature.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { adjustmentDate, auditorName, auditorSignature, rows } = await req.json()
    if (!auditorName?.trim()) return NextResponse.json({ error: 'Auditor name is required' }, { status: 400 })
    if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: 'At least one item row is required' }, { status: 400 })

    const when = adjustmentDate ? new Date(adjustmentDate) : new Date()
    const batchId = `SHRCOUNT-${crypto.randomUUID()}`
    const remarks = `Physical count shrinkage (Auditor: ${auditorName.trim()})`
    let created = 0
    const results: { itemId: string; shrinkage: number }[] = []

    for (const row of rows) {
      const itemId = row?.itemId
      if (!itemId || row?.countedQuantity === undefined || row?.countedQuantity === null || row.countedQuantity === '') continue
      const counted = Math.max(0, Math.round(Number(row.countedQuantity)))
      const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } })
      if (!item) continue
      const previousQuantity = item.quantity
      const shrink = previousQuantity - counted   // + = shrinkage, − = overage
      if (shrink === 0) continue                  // no discrepancy → skip
      const type = shrink > 0 ? 'SHRINKAGE' : 'INCREASE'
      const change = Math.abs(shrink)

      await prisma.$transaction(async (tx) => {
        await tx.inventoryAdjustment.create({
          data: {
            itemId, type, quantityChange: change,
            remainingQuantity: type === 'INCREASE' ? change : null,
            previousQuantity, newQuantity: counted,
            adjustmentDate: when, remarks, batchId,
            countedQuantity: counted, auditorName: auditorName.trim(), auditorSignature: auditorSignature || null,
            adjustedById: session.user!.id as string,
          },
        })
        await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: counted } })
        if (type === 'SHRINKAGE') await consumeFifoLots(tx, itemId, change)
        else await restoreFifoLots(tx, itemId, change)
      })
      const nc = await recalcWeightedUnitCost(prisma, itemId)
      if (nc > 0) await prisma.inventoryItem.update({ where: { id: itemId }, data: { unitCost: nc } })
      created++
      results.push({ itemId, shrinkage: shrink })
    }

    return NextResponse.json({ ok: true, batchId, created, results })
  } catch (e) {
    console.error('Shrinkage count error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
