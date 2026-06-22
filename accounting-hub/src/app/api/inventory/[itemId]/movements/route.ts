import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/inventory/[itemId]/movements
 *
 * Returns the complete quantity movement history for an inventory item:
 *   - INCREASE adjustments (stock in / purchases)
 *   - SHRINKAGE adjustments (write-offs / manual decreases)
 *   - POS sales (OrderItem where inventoryItemId = itemId)
 *
 * All entries are sorted chronologically with a running balance.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { itemId } = await params

  const [item, adjustments, orderItems] = await Promise.all([
    prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true, name: true, quantity: true, unitCost: true },
    }),

    prisma.inventoryAdjustment.findMany({
      where: { itemId },
      select: {
        id: true,
        type: true,
        quantityChange: true,
        previousQuantity: true,
        newQuantity: true,
        adjustmentDate: true,
        remarks: true,
        batchId: true,
        foreignCost: true,
        foreignCurrency: true,
        localCost: true,
        totalLandedCost: true,
        adjustedBy: { select: { name: true } },
      },
      orderBy: [{ adjustmentDate: 'asc' }, { createdAt: 'asc' }],
    }),

    prisma.orderItem.findMany({
      where: {
        inventoryItemId: itemId,
        // VOIDED orders are included: they show the original sale PLUS a
        // matching "Order voided" stock-return entry (added below).
      },
      select: {
        id: true,
        name: true,
        quantity: true,
        unitPrice: true,
        lineTotal: true,
        isFreeSample: true,
        cogsCost: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            transactionDate: true,
            orderType: true,
            branch: true,
            status: true,
            updatedAt: true,
          },
        },
      },
    }),
  ])

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  type RawEntry = {
    date: Date
    type: 'STOCK_IN' | 'SHRINKAGE' | 'SALE' | 'FREE_SAMPLE' | 'ORDER_VOID'
    qty: number
    direction: 1 | -1
    costPerUnit: number | null
    reference: string
    remarks: string
    adjustedBy?: string
  }

  const entries: RawEntry[] = []

  // ── Adjustments (INCREASE + SHRINKAGE) ─────────────────────────
  for (const adj of adjustments) {
    const costPerUnit = adj.totalLandedCost && adj.quantityChange > 0
      ? Number(adj.totalLandedCost) / adj.quantityChange
      : adj.localCost
        ? Number(adj.localCost)
        : null

    const foreignNote = adj.foreignCost && adj.foreignCurrency
      ? ` (${Number(adj.foreignCost).toFixed(2)} ${adj.foreignCurrency})`
      : ''

    entries.push({
      date: adj.adjustmentDate,
      type: adj.type === 'INCREASE' ? 'STOCK_IN' : 'SHRINKAGE',
      qty: adj.quantityChange,
      direction: adj.type === 'INCREASE' ? 1 : -1,
      costPerUnit,
      reference: adj.batchId ? `Batch: ${adj.batchId}` : '',
      remarks: adj.remarks + foreignNote,
      adjustedBy: adj.adjustedBy?.name,
    })
  }

  // ── POS Sales (OrderItem) ────────────────────────────────────────
  for (const oi of orderItems) {
    const costPerUnit = oi.cogsCost && oi.quantity > 0
      ? Number(oi.cogsCost) / oi.quantity
      : null

    entries.push({
      date: oi.order.transactionDate,
      type: oi.isFreeSample ? 'FREE_SAMPLE' : 'SALE',
      qty: oi.quantity,
      direction: -1,
      costPerUnit,
      reference: oi.order.orderNumber
        ? `Order #${oi.order.orderNumber} · ${oi.order.branch}`
        : oi.order.id,
      remarks: oi.isFreeSample ? 'Free sample (marketing)' : `Sold at ${Number(oi.unitPrice).toFixed(2)} each`,
    })

    // Voided order: the deduction was reversed (stock returned). Show it as a
    // matching "+N Order voided" entry so the history reflects the reversal.
    if (oi.order.status === 'VOIDED') {
      entries.push({
        date: oi.order.updatedAt,
        type: 'ORDER_VOID',
        qty: oi.quantity,
        direction: 1,
        costPerUnit,
        reference: oi.order.orderNumber
          ? `Order #${oi.order.orderNumber} · ${oi.order.branch}`
          : oi.order.id,
        remarks: 'Order voided — stock returned',
      })
    }
  }

  // ── Sort chronologically ─────────────────────────────────────────
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // ── Compute running balance ──────────────────────────────────────
  // Starting quantity: current qty + all OUT movements - all IN movements
  const totalIn = entries.filter(e => e.direction === 1).reduce((s, e) => s + e.qty, 0)
  const totalOut = entries.filter(e => e.direction === -1).reduce((s, e) => s + e.qty, 0)
  const startingQty = item.quantity + totalOut - totalIn

  let running = startingQty
  const movements = entries.map(e => {
    running += e.direction * e.qty
    return {
      date: e.date,
      type: e.type,
      qty: e.qty,
      direction: e.direction,
      balance: running,
      costPerUnit: e.costPerUnit,
      reference: e.reference,
      remarks: e.remarks,
      adjustedBy: e.adjustedBy ?? null,
    }
  })

  return NextResponse.json({
    itemName: item.name,
    currentQty: item.quantity,
    startingQty,
    movements,
  })
}
