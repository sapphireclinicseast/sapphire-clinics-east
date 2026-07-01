import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recalcWeightedUnitCost } from '@/lib/fifo'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  // Single batch (for editing) — include per-item dims to rebuild the form rows.
  if (id) {
    const batch = await prisma.inventoryAdjustmentBatch.findUnique({
      where: { id },
      include: {
        adjustments: {
          orderBy: { createdAt: 'asc' },
          include: { item: { select: { name: true, sku: true, dimensionLength: true, dimensionWidth: true, dimensionHeight: true } } },
        },
      },
    })
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    return NextResponse.json({ batch })
  }
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')

  const [batches, total] = await Promise.all([
    prisma.inventoryAdjustmentBatch.findMany({
      orderBy: { adjustmentDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        createdBy: { select: { name: true } },
        adjustments: {
          include: { item: { select: { name: true, sku: true } } },
        },
      },
    }),
    prisma.inventoryAdjustmentBatch.count(),
  ])

  return NextResponse.json({ batches, total, page, pageSize })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const {
      adjustmentDate,
      hasForeignPurchase = true,
      foreignCurrency = 'CNY',
      exchangeRate,
      freight1Amount,
      freight1IsForeign = false,
      freight2Amount,
      freight2IsForeign = false,
      freight3Amount,
      freight3IsForeign = false,
      proofUrls,
      remarks,
      rows,
    } = await req.json()

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'At least one item row is required' }, { status: 400 })
    }

    const validRows = rows.filter((r: { itemId: string; quantity: string }) => r.itemId && parseInt(r.quantity) > 0)
    if (validRows.length === 0) {
      return NextResponse.json({ error: 'Each row needs an item and positive quantity' }, { status: 400 })
    }

    const exRate = hasForeignPurchase && exchangeRate ? parseFloat(exchangeRate) : 1

    // Convert freight costs to PHP
    const f1 = parseFloat(freight1Amount || '0') || 0
    const f2 = parseFloat(freight2Amount || '0') || 0
    const f3 = parseFloat(freight3Amount || '0') || 0
    const freight1PHP = f1 * (freight1IsForeign ? exRate : 1)
    const freight2PHP = f2 * (freight2IsForeign ? exRate : 1)
    const freight3PHP = f3 * (freight3IsForeign ? exRate : 1)
    const totalFreightPHP = freight1PHP + freight2PHP + freight3PHP

    // Fetch items to get current quantities and dimensions
    const itemIds = [...new Set(validRows.map((r: { itemId: string }) => r.itemId))] as string[]
    const dbItems = await prisma.inventoryItem.findMany({
      where: { id: { in: itemIds } },
    })
    const itemMap = new Map(dbItems.map(i => [i.id, i]))

    // Compute CBM and prices per row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processedRows = validRows.map((row: any) => {
      const item = itemMap.get(row.itemId)
      if (!item) throw new Error(`Item not found: ${row.itemId}`)
      const qty = parseInt(row.quantity) || 0
      const manPrice = parseFloat(row.manPrice || '0') || 0
      const manPricePHP = row.manPriceIsForeign && hasForeignPurchase ? manPrice * exRate : manPrice
      // Use row-provided dims or fall back to item dims
      const l = parseFloat(row.dimL || '') || Number(item.dimensionLength) || 0
      const w = parseFloat(row.dimW || '') || Number(item.dimensionWidth) || 0
      const h = parseFloat(row.dimH || '') || Number(item.dimensionHeight) || 0
      const cbmPerUnit = l > 0 && w > 0 && h > 0 ? (l * w * h) / 1_000_000 : 0
      const totalCbm = cbmPerUnit * qty
      return { ...row, item, qty, manPricePHP, manPrice, l, w, h, cbmPerUnit, totalCbm }
    })

    const grandTotalCbm = processedRows.reduce((s: number, r: { totalCbm: number }) => s + r.totalCbm, 0)

    // Generate reference number: FRE-YYYYMMDD-NNN
    const adjDate = adjustmentDate ? new Date(adjustmentDate) : new Date()
    const ymd = `${adjDate.getFullYear()}${String(adjDate.getMonth() + 1).padStart(2, '0')}${String(adjDate.getDate()).padStart(2, '0')}`
    const datePrefix = `FRE-${ymd}-`
    const lastBatch = await prisma.inventoryAdjustmentBatch.findFirst({
      where: { referenceNumber: { startsWith: datePrefix } },
      orderBy: { referenceNumber: 'desc' },
      select: { referenceNumber: true },
    })
    const lastSeq = lastBatch ? parseInt(lastBatch.referenceNumber.split('-').pop() || '0') : 0
    const refNumber = `${datePrefix}${String(lastSeq + 1).padStart(3, '0')}`

    // Create batch and all adjustments in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryAdjustmentBatch.create({
        data: {
          referenceNumber: refNumber,
          adjustmentDate: adjDate,
          hasForeignPurchase,
          foreignCurrency: hasForeignPurchase ? (foreignCurrency || 'CNY') : null,
          exchangeRate: hasForeignPurchase && exchangeRate ? parseFloat(exchangeRate) : null,
          freight1Amount: f1 > 0 ? f1 : null,
          freight1IsForeign,
          freight2Amount: f2 > 0 ? f2 : null,
          freight2IsForeign,
          freight3Amount: f3 > 0 ? f3 : null,
          freight3IsForeign,
          totalFreightPHP,
          proofUrls: Array.isArray(proofUrls) && proofUrls.length > 0 ? proofUrls : undefined,
          remarks: remarks?.trim() || null,
          createdById: session.user.id,
        },
      })

      const adjustments = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of processedRows as any[]) {
        const cbmShare = grandTotalCbm > 0 ? row.totalCbm / grandTotalCbm : 1 / processedRows.length
        const freightPerUnit = row.qty > 0 ? (cbmShare * totalFreightPHP) / row.qty : 0
        const unitCost = row.manPricePHP + freightPerUnit
        const freightAllocation = freightPerUnit * row.qty

        const currentItem = await tx.inventoryItem.findUnique({ where: { id: row.itemId } })
        if (!currentItem) throw new Error(`Item ${row.itemId} not found`)
        const prevQty = currentItem.quantity
        const newQty = prevQty + row.qty

        const adj = await tx.inventoryAdjustment.create({
          data: {
            itemId: row.itemId,
            type: 'INCREASE',
            quantityChange: row.qty,
            remainingQuantity: row.qty,
            previousQuantity: prevQty,
            newQuantity: newQty,
            adjustmentDate: adjDate,
            remarks: remarks?.trim() || `Freight batch ${refNumber}`,
            batchId: refNumber,
            batchRefId: batch.id,
            referenceNumber: refNumber,
            foreignCost: row.manPriceIsForeign && hasForeignPurchase ? row.manPrice : null,
            foreignCurrency: row.manPriceIsForeign && hasForeignPurchase ? (foreignCurrency || 'CNY') : null,
            exchangeRate: hasForeignPurchase && exchangeRate ? parseFloat(exchangeRate) : null,
            localCost: unitCost,
            freightAllocation,
            totalLandedCost: unitCost * row.qty,
            adjustedById: session.user.id,
          },
          include: {
            item: { select: { name: true, sku: true } },
            adjustedBy: { select: { name: true } },
          },
        })

        await tx.inventoryItem.update({
          where: { id: row.itemId },
          data: { quantity: newQty },
        })

        // Persist dimensions on the item if provided in the row
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dimUpdate: any = {}
        if (row.l > 0) dimUpdate.dimensionLength = row.l
        if (row.w > 0) dimUpdate.dimensionWidth = row.w
        if (row.h > 0) dimUpdate.dimensionHeight = row.h
        if (Object.keys(dimUpdate).length > 0) {
          await tx.inventoryItem.update({ where: { id: row.itemId }, data: dimUpdate })
        }

        adjustments.push(adj)
      }

      // Recalculate weighted unit costs for all affected items
      for (const itemId of itemIds) {
        const newUnitCost = await recalcWeightedUnitCost(tx, itemId)
        if (newUnitCost > 0) {
          await tx.inventoryItem.update({ where: { id: itemId }, data: { unitCost: newUnitCost } })
        }
      }

      return { batch, adjustments }
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'FREIGHT_BATCH',
        entity: 'inventoryAdjustmentBatch',
        entityId: result.batch.id,
        details: {
          referenceNumber: refNumber,
          itemCount: validRows.length,
          totalFreightPHP,
          exchangeRate: hasForeignPurchase ? exRate : null,
        },
      },
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[Freight Batch] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH — edit an existing freight batch. Reverses the batch's stock movements
// (blocked if any of its lots were already sold/consumed), then re-applies the
// new set of rows + freight under the SAME reference number.
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const {
      id, adjustmentDate, hasForeignPurchase = true, foreignCurrency = 'CNY', exchangeRate,
      freight1Amount, freight1IsForeign = false, freight2Amount, freight2IsForeign = false,
      freight3Amount, freight3IsForeign = false, proofUrls, remarks, rows,
    } = await req.json()
    if (!id) return NextResponse.json({ error: 'Batch id is required' }, { status: 400 })

    const existing = await prisma.inventoryAdjustmentBatch.findUnique({ where: { id }, include: { adjustments: true } })
    if (!existing) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    // Guard: only editable while none of its lots have been consumed by sales.
    const consumed = existing.adjustments.find(a => a.type !== 'INCREASE' || (a.remainingQuantity ?? a.quantityChange) !== a.quantityChange)
    if (consumed) return NextResponse.json({ error: 'Cannot edit: some items from this batch have already been sold/consumed. Reverse those sales first.' }, { status: 409 })

    const validRows = (Array.isArray(rows) ? rows : []).filter((r: { itemId: string; quantity: string }) => r.itemId && parseInt(r.quantity) > 0)
    if (validRows.length === 0) return NextResponse.json({ error: 'Each row needs an item and positive quantity' }, { status: 400 })

    const exRate = hasForeignPurchase && exchangeRate ? parseFloat(exchangeRate) : 1
    const f1 = parseFloat(freight1Amount || '0') || 0
    const f2 = parseFloat(freight2Amount || '0') || 0
    const f3 = parseFloat(freight3Amount || '0') || 0
    const totalFreightPHP = f1 * (freight1IsForeign ? exRate : 1) + f2 * (freight2IsForeign ? exRate : 1) + f3 * (freight3IsForeign ? exRate : 1)

    const newItemIds = [...new Set(validRows.map((r: { itemId: string }) => r.itemId))] as string[]
    const dbItems = await prisma.inventoryItem.findMany({ where: { id: { in: newItemIds } } })
    const itemMap = new Map(dbItems.map(i => [i.id, i]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processedRows = validRows.map((row: any) => {
      const item = itemMap.get(row.itemId)
      if (!item) throw new Error(`Item not found: ${row.itemId}`)
      const qty = parseInt(row.quantity) || 0
      const manPrice = parseFloat(row.manPrice || '0') || 0
      const manPricePHP = row.manPriceIsForeign && hasForeignPurchase ? manPrice * exRate : manPrice
      const l = parseFloat(row.dimL || '') || Number(item.dimensionLength) || 0
      const w = parseFloat(row.dimW || '') || Number(item.dimensionWidth) || 0
      const h = parseFloat(row.dimH || '') || Number(item.dimensionHeight) || 0
      const cbmPerUnit = l > 0 && w > 0 && h > 0 ? (l * w * h) / 1_000_000 : 0
      return { ...row, qty, manPricePHP, manPrice, l, w, h, totalCbm: cbmPerUnit * qty }
    })
    const grandTotalCbm = processedRows.reduce((s: number, r: { totalCbm: number }) => s + r.totalCbm, 0)
    const refNumber = existing.referenceNumber
    const adjDate = adjustmentDate ? new Date(adjustmentDate) : existing.adjustmentDate
    const oldItemIds = existing.adjustments.map(a => a.itemId)

    await prisma.$transaction(async (tx) => {
      // Reverse the old movements, then delete the old adjustments (removes their lots).
      for (const a of existing.adjustments) {
        await tx.inventoryItem.update({ where: { id: a.itemId }, data: { quantity: { decrement: a.quantityChange } } })
      }
      await tx.inventoryAdjustment.deleteMany({ where: { batchRefId: id } })

      await tx.inventoryAdjustmentBatch.update({
        where: { id },
        data: {
          adjustmentDate: adjDate, hasForeignPurchase,
          foreignCurrency: hasForeignPurchase ? (foreignCurrency || 'CNY') : null,
          exchangeRate: hasForeignPurchase && exchangeRate ? parseFloat(exchangeRate) : null,
          freight1Amount: f1 > 0 ? f1 : null, freight1IsForeign,
          freight2Amount: f2 > 0 ? f2 : null, freight2IsForeign,
          freight3Amount: f3 > 0 ? f3 : null, freight3IsForeign,
          totalFreightPHP,
          proofUrls: Array.isArray(proofUrls) && proofUrls.length > 0 ? proofUrls : undefined,
          remarks: remarks?.trim() || null,
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of processedRows as any[]) {
        const cbmShare = grandTotalCbm > 0 ? row.totalCbm / grandTotalCbm : 1 / processedRows.length
        const freightPerUnit = row.qty > 0 ? (cbmShare * totalFreightPHP) / row.qty : 0
        const unitCost = row.manPricePHP + freightPerUnit
        const current = await tx.inventoryItem.findUnique({ where: { id: row.itemId } })
        if (!current) throw new Error(`Item ${row.itemId} not found`)
        const prevQty = current.quantity
        const newQty = prevQty + row.qty
        await tx.inventoryAdjustment.create({
          data: {
            itemId: row.itemId, type: 'INCREASE', quantityChange: row.qty, remainingQuantity: row.qty,
            previousQuantity: prevQty, newQuantity: newQty, adjustmentDate: adjDate,
            remarks: remarks?.trim() || `Freight batch ${refNumber}`, batchId: refNumber, batchRefId: id, referenceNumber: refNumber,
            foreignCost: row.manPriceIsForeign && hasForeignPurchase ? row.manPrice : null,
            foreignCurrency: row.manPriceIsForeign && hasForeignPurchase ? (foreignCurrency || 'CNY') : null,
            exchangeRate: hasForeignPurchase && exchangeRate ? parseFloat(exchangeRate) : null,
            localCost: unitCost, freightAllocation: freightPerUnit * row.qty, totalLandedCost: unitCost * row.qty,
            adjustedById: session.user!.id as string,
          },
        })
        await tx.inventoryItem.update({ where: { id: row.itemId }, data: { quantity: newQty } })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dimUpdate: any = {}
        if (row.l > 0) dimUpdate.dimensionLength = row.l
        if (row.w > 0) dimUpdate.dimensionWidth = row.w
        if (row.h > 0) dimUpdate.dimensionHeight = row.h
        if (Object.keys(dimUpdate).length > 0) await tx.inventoryItem.update({ where: { id: row.itemId }, data: dimUpdate })
      }

      for (const itemId of [...new Set([...oldItemIds, ...newItemIds])]) {
        const c = await recalcWeightedUnitCost(tx, itemId)
        if (c > 0) await tx.inventoryItem.update({ where: { id: itemId }, data: { unitCost: c } })
      }
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: 'FREIGHT_BATCH_EDIT', entity: 'inventoryAdjustmentBatch', entityId: id, details: { referenceNumber: refNumber, itemCount: validRows.length, totalFreightPHP } },
    })
    return NextResponse.json({ ok: true, referenceNumber: refNumber })
  } catch (err) {
    console.error('[Freight Batch] Edit error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}

// DELETE ?id=<batchId> — remove a whole freight batch: reverse each item's stock
// and delete the adjustments + batch. Blocked if any lot was already consumed.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'Batch id is required' }, { status: 400 })
  try {
    const batch = await prisma.inventoryAdjustmentBatch.findUnique({ where: { id }, include: { adjustments: true } })
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    const consumed = batch.adjustments.find(a => a.type !== 'INCREASE' || (a.remainingQuantity ?? a.quantityChange) !== a.quantityChange)
    if (consumed) return NextResponse.json({ error: 'Cannot delete: some items from this batch have already been sold/consumed. Reverse those sales first.' }, { status: 409 })
    const itemIds = [...new Set(batch.adjustments.map(a => a.itemId))]
    await prisma.$transaction(async (tx) => {
      for (const a of batch.adjustments) {
        await tx.inventoryItem.update({ where: { id: a.itemId }, data: { quantity: { decrement: a.quantityChange } } })
      }
      await tx.inventoryAdjustment.deleteMany({ where: { batchRefId: id } })
      await tx.inventoryAdjustmentBatch.delete({ where: { id } })
      for (const itemId of itemIds) {
        const c = await recalcWeightedUnitCost(tx, itemId)
        if (c > 0) await tx.inventoryItem.update({ where: { id: itemId }, data: { unitCost: c } })
      }
    })
    await prisma.auditLog.create({ data: { userId: session.user.id, action: 'FREIGHT_BATCH_DELETE', entity: 'inventoryAdjustmentBatch', entityId: id, details: { referenceNumber: batch.referenceNumber, itemCount: batch.adjustments.length } } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Freight Batch] Delete error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
