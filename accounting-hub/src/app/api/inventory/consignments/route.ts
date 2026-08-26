import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'
import { resolveProductAccounts } from '@/lib/inventory-accounts'
import { consumeFifoLots } from '@/lib/fifo'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

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
    const body = await req.json()

    // Support batch transfer: { items: [{itemId, quantity}], toBranch, remarks }
    // OR single: { itemId, toBranch, quantity, remarks }
    const toBranch = body.toBranch
    const remarks = body.remarks?.trim() || null
    const itemsList = body.items || [{ itemId: body.itemId, quantity: body.quantity }]

    if (!toBranch || !itemsList.length) {
      return NextResponse.json({ error: 'Destination branch and at least one item are required' }, { status: 400 })
    }

    // Generate reference number for batch
    const refNum = `CT-${Date.now().toString(36).toUpperCase()}`

    const results = []
    const errors = []

    for (let i = 0; i < itemsList.length; i++) {
      const { itemId, quantity } = itemsList[i]
      if (!itemId || !quantity) {
        errors.push(`Item ${i + 1}: itemId and quantity are required`)
        continue
      }

      const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } })
      if (!item) { errors.push(`Item ${i + 1}: not found`); continue }
      if (item.branch === toBranch) { errors.push(`Item ${i + 1}: cannot transfer to same branch`); continue }

      const qty = parseInt(quantity)
      if (qty <= 0 || qty > item.quantity) {
        errors.push(`Item ${i + 1} (${item.name}): quantity must be 1-${item.quantity}`)
        continue
      }

      const transfer = await prisma.consignmentTransfer.create({
        data: {
          referenceNumber: itemsList.length > 1 ? refNum : null,
          itemId,
          fromBranch: item.branch,
          toBranch,
          quantity: qty,
          status: 'PENDING',
          requestedById: session.user.id,
          remarks,
        },
        include: {
          item: { select: { name: true, sku: true } },
          requestedBy: { select: { name: true } },
        },
      })

      results.push(transfer)
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CONSIGNMENT_REQUEST',
        entity: 'consignmentTransfer',
        entityId: refNum,
        details: { referenceNumber: refNum, itemCount: results.length, toBranch, errors: errors.length },
      },
    })

    return NextResponse.json({
      referenceNumber: itemsList.length > 1 ? refNum : null,
      transfers: results,
      errors,
    }, { status: 201 })
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
    const body = await req.json()
    const { id, ids, referenceNumber, action } = body

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 })
    }

    // Determine which transfers to update
    let transferIds: string[] = []
    if (ids && Array.isArray(ids)) {
      transferIds = ids
    } else if (referenceNumber) {
      const batch = await prisma.consignmentTransfer.findMany({
        where: { referenceNumber },
        select: { id: true },
      })
      transferIds = batch.map(t => t.id)
    } else if (id) {
      transferIds = [id]
    }

    if (transferIds.length === 0) {
      return NextResponse.json({ error: 'Transfer ID(s), ids array, or referenceNumber required' }, { status: 400 })
    }

    // Process each transfer
    const results = []
    const errors = []

    for (const tid of transferIds) {
    const transfer = await prisma.consignmentTransfer.findUnique({
      where: { id: tid },
      include: { item: true },
    })

    if (!transfer) {
      errors.push(`Transfer ${tid}: not found`)
      continue
    }

    // Validate state transitions
    const validTransitions: Record<string, string[]> = {
      PENDING: ['approve', 'cancel'],
      APPROVED: ['ship'],
      SHIPPED: ['receive', 'return'],
    }

    const allowed = validTransitions[transfer.status] || []
    if (!allowed.includes(action)) {
      // Skip, don't abort: in a batch (one referenceNumber, several transfers)
      // one already-received line was killing the whole request AFTER earlier
      // lines had committed — the UI showed "Cannot receive a RECEIVED
      // transfer" even though the receive had worked.
      errors.push(`${transfer.item.name}: cannot ${action} a ${transfer.status} transfer`)
      continue
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

        // Deduct from source item — quantity AND its FIFO lots, so the cost
        // rides along with the stock instead of staying behind on the pool.
        const fifo = await consumeFifoLots(prisma, transfer.itemId, transfer.quantity)
        const costPerUnit = transfer.quantity > 0
          ? Math.round((fifo.totalCost / transfer.quantity) * 100) / 100
          : Number(transfer.item.unitCost)
        await prisma.inventoryItem.update({
          where: { id: transfer.itemId },
          data: { quantity: { decrement: transfer.quantity } },
        })

        // Find the destination branch copy. Prefer the explicit sourceItemId
        // link; fall back to SKU-family match for rows created before the link
        // existed. (The old exact-SKU lookup could never find the very row this
        // handler creates — it appends a branch suffix — so every second receive
        // to the same branch crashed on the unique SKU.)
        let destItem = await prisma.inventoryItem.findFirst({
          where: {
            branch: transfer.toBranch,
            isActive: true,
            OR: [
              { sourceItemId: transfer.itemId },
              { sku: transfer.item.sku },
              { sku: { startsWith: `${transfer.item.sku}-` } },
            ],
          },
        })

        const destPrevQty = destItem?.quantity ?? 0
        if (destItem) {
          await prisma.inventoryItem.update({
            where: { id: destItem.id },
            data: { quantity: { increment: transfer.quantity }, sourceItemId: transfer.itemId },
          })
        } else {
          const destAcct = await resolveProductAccounts(prisma, transfer.item.skuDepartment, {
            revenueAccountId: transfer.item.revenueAccountId,
            expenseAccountId: transfer.item.expenseAccountId,
            sourceAccountId: transfer.item.sourceAccountId,
            accountSubType: transfer.item.accountSubType,
          })
          // Create new item at destination branch. The suffix must be unique
          // per branch: substring(0,4) made every SANDBOX_* clinic "-SAND", so
          // the second clinic's receive collided with the first on the unique SKU.
          const SUFFIX: Record<string, string> = { SANDBOX_EAST: 'EAST', SANDBOX_GREENHILLS: 'GH' }
          const suffix = SUFFIX[transfer.toBranch] || transfer.toBranch.substring(0, 4)
          destItem = await prisma.inventoryItem.create({
            data: {
              name: transfer.item.name,
              sku: `${transfer.item.sku}-${suffix}`,
              sourceItemId: transfer.itemId,
              skuDepartment: transfer.item.skuDepartment,
              skuCategory: transfer.item.skuCategory,
              skuSubcategory: transfer.item.skuSubcategory,
              skuSequence: transfer.item.skuSequence,
              barcode: transfer.item.barcode,
              branch: transfer.toBranch,
              accountSubType: transfer.item.accountSubType,
              unitCost: costPerUnit || transfer.item.unitCost,
              sellingPrice: transfer.item.sellingPrice,
              quantity: transfer.quantity,
              reorderLevel: transfer.item.reorderLevel,
              supplierId: transfer.item.supplierId,
              // Carry the source item's GL wiring across (falling back to the
              // department defaults if the source itself was never wired). Without
              // this the destination copy had no revenue/COGS accounts at all, so
              // selling it posted to 7000 Unclassified Revenue — the origin of the
              // stray "-SAND" catalogue entries.
              revenueAccountId: destAcct.revenueAccountId,
              expenseAccountId: destAcct.expenseAccountId,
              sourceAccountId: destAcct.sourceAccountId,
              createdById: session.user.id,
            },
          })
        }

        // Give the branch copy a real FIFO lot for the received units, at the
        // cost consumed from the source lots. Without it the copy has no lot,
        // so its sales carry zero COGS and its movement history shows nothing
        // arriving.
        await prisma.inventoryAdjustment.create({
          data: {
            itemId: destItem.id,
            type: 'INCREASE',
            quantityChange: transfer.quantity,
            previousQuantity: destPrevQty,
            newQuantity: destPrevQty + transfer.quantity,
            remainingQuantity: transfer.quantity,
            localCost: costPerUnit || Number(transfer.item.unitCost),
            adjustmentDate: new Date(),
            remarks: `Consignment received from ${transfer.fromBranch}${transfer.referenceNumber ? ` · ${transfer.referenceNumber}` : ''}`,
            adjustedById: session.user.id,
          },
        })
        break
      }
    }

    const updated = await prisma.consignmentTransfer.update({
      where: { id: tid },
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
        entityId: tid,
        details: { action, status: updated.status, referenceNumber: transfer.referenceNumber },
      },
    })

    results.push(updated)
    } // end for loop

    // Return single or batch result
    if (transferIds.length === 1 && results.length === 1) {
      return NextResponse.json(results[0])
    }
    if (results.length === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
    }
    return NextResponse.json({ updated: results.length, errors, transfers: results })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
