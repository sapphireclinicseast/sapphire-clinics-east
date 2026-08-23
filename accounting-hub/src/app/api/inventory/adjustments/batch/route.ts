import { NextResponse } from 'next/server'
import type { Prisma, PrismaClient } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { consumeFifoLots, recalcWeightedUnitCost } from '@/lib/fifo'
import { postSoldCostRestatement, type SoldUnitCostChange } from '@/lib/accounting/post-cost-restatement'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

type TxClient = Prisma.TransactionClient | PrismaClient

/** A row after validation: quantity parsed, price converted to PHP, CBM computed. */
interface ProcessedRow {
  itemId: string
  qty: number
  manPrice: number
  manPricePHP: number
  manPriceIsForeign: boolean
  l: number
  w: number
  h: number
  totalCbm: number
}

/** Raised for conditions the user can fix in the form — surfaced as a 409. */
class BatchConflictError extends Error {}

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
        fxSourceAccount: { select: { id: true, accountNumber: true, accountTitle: true, currency: true } },
        manufacturerRfp: { select: { id: true, refNumber: true, grossTotal: true, status: true, payableTo: true } },
        freightRfp: { select: { id: true, refNumber: true, grossTotal: true, status: true, payableTo: true } },
      },
    })
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    return NextResponse.json({ batch })
  }
  // Single loose adjustment, so the freight form can adopt it (add freight to a
  // plain stock-in that was recorded without any).
  const adjustmentId = searchParams.get('adjustmentId')
  if (adjustmentId) {
    const adj = await prisma.inventoryAdjustment.findUnique({
      where: { id: adjustmentId },
      include: { item: { select: { name: true, sku: true, dimensionLength: true, dimensionWidth: true, dimensionHeight: true, unitCost: true } } },
    })
    if (!adj) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 })
    if (adj.type !== 'INCREASE') {
      return NextResponse.json({ error: 'Only stock-in (INCREASE) adjustments can carry freight costs.' }, { status: 400 })
    }
    if (adj.batchRefId) {
      return NextResponse.json({ error: 'This row already belongs to a freight batch — edit the batch instead.' }, { status: 409 })
    }
    return NextResponse.json({ adjustment: adj })
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
        fxSourceAccount: { select: { accountNumber: true, accountTitle: true, currency: true } },
        manufacturerRfp: { select: { refNumber: true, grossTotal: true, status: true } },
        freightRfp: { select: { refNumber: true, grossTotal: true, status: true } },
      },
    }),
    prisma.inventoryAdjustmentBatch.count(),
  ])

  return NextResponse.json({ batches, total, page, pageSize })
}

/* ── Shared helpers ────────────────────────────────────────────────── */

/** Units of an INCREASE lot that have already left through a sale or shrinkage. */
function soldUnitsOf(lot: { quantityChange: number; remainingQuantity: number | null }) {
  return lot.quantityChange - (lot.remainingQuantity ?? lot.quantityChange)
}

/** The lot's current cost per unit — landed cost first, then local cost, then the item average. */
function lotUnitCost(
  lot: { quantityChange: number; totalLandedCost: Prisma.Decimal | null; localCost: Prisma.Decimal | null },
  itemUnitCost: number,
) {
  if (lot.totalLandedCost != null && lot.quantityChange > 0) return Number(lot.totalLandedCost) / lot.quantityChange
  if (lot.localCost != null) return Number(lot.localCost)
  return itemUnitCost
}

/** Parse + validate the submitted rows and compute each one's CBM. */
async function processRows(rows: unknown) {
  const validRows = (Array.isArray(rows) ? rows : []).filter(
    (r: { itemId?: string; quantity?: string }) => r.itemId && parseInt(String(r.quantity)) > 0,
  )
  if (validRows.length === 0) throw new BatchConflictError('Each row needs an item and positive quantity')
  const itemIds = [...new Set(validRows.map((r: { itemId: string }) => r.itemId))] as string[]
  const dbItems = await prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } })
  const itemMap = new Map(dbItems.map((i) => [i.id, i]))
  return { validRows, itemMap }
}

/**
 * Reconcile a batch's lots against the submitted rows, IN PLACE.
 *
 * Lots are updated rather than deleted and recreated, so a lot that has
 * already fed a sale keeps its identity and its consumption history — which is
 * what makes editing a batch with sold units possible at all. Quantities move
 * by the difference; already-sold units stay consumed.
 *
 * Returns the per-lot cost movements on units already sold, for the caller to
 * restate into COGS.
 */
async function reconcileBatchRows(
  tx: TxClient,
  opts: {
    batchDbId: string
    refNumber: string
    adjDate: Date
    existing: {
      id: string
      itemId: string
      quantityChange: number
      remainingQuantity: number | null
      previousQuantity: number
      totalLandedCost: Prisma.Decimal | null
      localCost: Prisma.Decimal | null
    }[]
    processedRows: ProcessedRow[]
    grandTotalCbm: number
    totalFreightPHP: number
    hasForeignPurchase: boolean
    foreignCurrency: string | null
    exchangeRate: number | null
    remarks: string | null
    userId: string
  },
): Promise<{ changes: SoldUnitCostChange[]; touchedItemIds: string[] }> {
  const { existing, processedRows, grandTotalCbm, totalFreightPHP, adjDate, refNumber, remarks } = opts

  // Freight is shared out by cubic volume; with no dimensions anywhere, split it
  // evenly across the rows instead (same rule the original batch used).
  const rowCost = (row: ProcessedRow) => {
    const cbmShare = grandTotalCbm > 0 ? row.totalCbm / grandTotalCbm : 1 / processedRows.length
    const freightPerUnit = row.qty > 0 ? (cbmShare * totalFreightPHP) / row.qty : 0
    return { freightPerUnit, unitCost: row.manPricePHP + freightPerUnit }
  }

  const costFields = (row: ProcessedRow) => {
    const { freightPerUnit, unitCost } = rowCost(row)
    return {
      foreignCost: row.manPriceIsForeign && opts.hasForeignPurchase ? row.manPrice : null,
      foreignCurrency: row.manPriceIsForeign && opts.hasForeignPurchase ? opts.foreignCurrency : null,
      exchangeRate: opts.hasForeignPurchase ? opts.exchangeRate : null,
      localCost: unitCost,
      freightAllocation: freightPerUnit * row.qty,
      totalLandedCost: unitCost * row.qty,
    }
  }

  // Pair old lots with new rows per item, positionally — an item may legitimately
  // appear on more than one row of the same shipment.
  const oldByItem = new Map<string, typeof existing>()
  for (const a of existing) oldByItem.set(a.itemId, [...(oldByItem.get(a.itemId) || []), a])
  const newByItem = new Map<string, ProcessedRow[]>()
  for (const r of processedRows) newByItem.set(r.itemId, [...(newByItem.get(r.itemId) || []), r])

  const touchedItemIds = [...new Set([...oldByItem.keys(), ...newByItem.keys()])]
  const skuOf = new Map(
    (await tx.inventoryItem.findMany({ where: { id: { in: touchedItemIds } }, select: { id: true, sku: true, name: true } }))
      .map((i) => [i.id, `${i.sku} — ${i.name}`]),
  )
  const changes: SoldUnitCostChange[] = []

  for (const itemId of touchedItemIds) {
    const olds = oldByItem.get(itemId) || []
    const news = newByItem.get(itemId) || []
    const label = skuOf.get(itemId) || itemId

    for (let k = 0; k < Math.max(olds.length, news.length); k++) {
      const lot = olds[k]
      const row = news[k]

      /* Lot dropped from the batch — only possible while none of it was sold. */
      if (lot && !row) {
        const sold = soldUnitsOf(lot)
        if (sold > 0) {
          throw new BatchConflictError(
            `Cannot remove ${label} from this batch — ${sold} unit(s) have already been sold. Set its quantity to ${sold} instead, or reverse those sales first.`,
          )
        }
        await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: { decrement: lot.quantityChange } } })
        await tx.inventoryAdjustment.delete({ where: { id: lot.id } })
        continue
      }

      /* Row added to the batch — a brand new lot. */
      if (!lot && row) {
        const current = await tx.inventoryItem.findUnique({ where: { id: itemId } })
        if (!current) throw new BatchConflictError(`Item not found: ${itemId}`)
        const prevQty = current.quantity
        const newQty = prevQty + row.qty
        await tx.inventoryAdjustment.create({
          data: {
            itemId, type: 'INCREASE', quantityChange: row.qty, remainingQuantity: row.qty,
            previousQuantity: prevQty, newQuantity: newQty, adjustmentDate: adjDate,
            remarks: remarks || `Freight batch ${refNumber}`,
            batchId: refNumber, batchRefId: opts.batchDbId, referenceNumber: refNumber,
            ...costFields(row),
            adjustedById: opts.userId,
          },
        })
        await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: newQty } })
        // Pre-order backlog: sales made at 0/negative stock already deducted quantity,
        // so their units come out of this arrival — consume them from the new lot now
        // to keep lot remainingQuantity in line with physical stock.
        if (prevQty < 0) await consumeFifoLots(tx, itemId, Math.min(-prevQty, row.qty))
        continue
      }

      /* Lot kept — update it where it stands so its sold units survive. */
      if (lot && row) {
        const sold = soldUnitsOf(lot)
        if (row.qty < sold) {
          throw new BatchConflictError(
            `Cannot reduce ${label} to ${row.qty} unit(s) — ${sold} from this batch have already been sold. Enter at least ${sold}.`,
          )
        }
        const current = await tx.inventoryItem.findUnique({ where: { id: itemId } })
        if (!current) throw new BatchConflictError(`Item not found: ${itemId}`)
        const oldUnitCost = lotUnitCost(lot, Number(current.unitCost))
        const qtyDelta = row.qty - lot.quantityChange
        if (qtyDelta !== 0) {
          await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: current.quantity + qtyDelta } })
        }
        await tx.inventoryAdjustment.update({
          where: { id: lot.id },
          data: {
            quantityChange: row.qty,
            remainingQuantity: row.qty - sold,
            newQuantity: lot.previousQuantity + row.qty,
            adjustmentDate: adjDate,
            remarks: remarks || `Freight batch ${refNumber}`,
            batchId: refNumber, batchRefId: opts.batchDbId, referenceNumber: refNumber,
            ...costFields(row),
          },
        })
        if (sold > 0) {
          changes.push({ itemId, soldUnits: sold, oldUnitCost, newUnitCost: rowCost(row).unitCost })
        }
      }
    }
  }

  // Persist any dimensions the form supplied, then refresh weighted-average costs.
  for (const row of processedRows) {
    const dimUpdate: Record<string, number> = {}
    if (row.l > 0) dimUpdate.dimensionLength = row.l
    if (row.w > 0) dimUpdate.dimensionWidth = row.w
    if (row.h > 0) dimUpdate.dimensionHeight = row.h
    if (Object.keys(dimUpdate).length > 0) await tx.inventoryItem.update({ where: { id: row.itemId }, data: dimUpdate })
  }
  for (const itemId of touchedItemIds) {
    const c = await recalcWeightedUnitCost(tx, itemId)
    if (c > 0) await tx.inventoryItem.update({ where: { id: itemId }, data: { unitCost: c } })
  }

  return { changes, touchedItemIds }
}

/** Shared body parsing: freight totals in PHP, processed rows, CBM total. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildBatchInputs(body: any) {
  const {
    hasForeignPurchase = true, foreignCurrency = 'CNY', exchangeRate,
    freight1Amount, freight1IsForeign = false,
    freight2Amount, freight2IsForeign = false,
    freight3Amount, freight3IsForeign = false,
  } = body
  const exRate = hasForeignPurchase && exchangeRate ? parseFloat(exchangeRate) : 1
  const f1 = parseFloat(freight1Amount || '0') || 0
  const f2 = parseFloat(freight2Amount || '0') || 0
  const f3 = parseFloat(freight3Amount || '0') || 0
  const totalFreightPHP =
    f1 * (freight1IsForeign ? exRate : 1) +
    f2 * (freight2IsForeign ? exRate : 1) +
    f3 * (freight3IsForeign ? exRate : 1)
  return {
    hasForeignPurchase, foreignCurrency, exRate, f1, f2, f3, totalFreightPHP,
    freight1IsForeign, freight2IsForeign, freight3IsForeign,
    storedExchangeRate: hasForeignPurchase && exchangeRate ? parseFloat(exchangeRate) : null,
  }
}

function toProcessedRows(
  validRows: { itemId: string; quantity: string; manPrice?: string; manPriceIsForeign?: boolean; dimL?: string; dimW?: string; dimH?: string }[],
  itemMap: Map<string, { dimensionLength: Prisma.Decimal | null; dimensionWidth: Prisma.Decimal | null; dimensionHeight: Prisma.Decimal | null }>,
  hasForeignPurchase: boolean,
  exRate: number,
): { processedRows: ProcessedRow[]; grandTotalCbm: number } {
  const processedRows = validRows.map((row) => {
    const item = itemMap.get(row.itemId)
    if (!item) throw new BatchConflictError(`Item not found: ${row.itemId}`)
    const qty = parseInt(row.quantity) || 0
    const manPrice = parseFloat(row.manPrice || '0') || 0
    const manPriceIsForeign = !!row.manPriceIsForeign
    const manPricePHP = manPriceIsForeign && hasForeignPurchase ? manPrice * exRate : manPrice
    const l = parseFloat(row.dimL || '') || Number(item.dimensionLength) || 0
    const w = parseFloat(row.dimW || '') || Number(item.dimensionWidth) || 0
    const h = parseFloat(row.dimH || '') || Number(item.dimensionHeight) || 0
    const cbmPerUnit = l > 0 && w > 0 && h > 0 ? (l * w * h) / 1_000_000 : 0
    return { itemId: row.itemId, qty, manPrice, manPricePHP, manPriceIsForeign, l, w, h, totalCbm: cbmPerUnit * qty }
  })
  return { processedRows, grandTotalCbm: processedRows.reduce((s, r) => s + r.totalCbm, 0) }
}

async function nextBatchRef(adjDate: Date) {
  const ymd = `${adjDate.getFullYear()}${String(adjDate.getMonth() + 1).padStart(2, '0')}${String(adjDate.getDate()).padStart(2, '0')}`
  const datePrefix = `FRE-${ymd}-`
  const lastBatch = await prisma.inventoryAdjustmentBatch.findFirst({
    where: { referenceNumber: { startsWith: datePrefix } },
    orderBy: { referenceNumber: 'desc' },
    select: { referenceNumber: true },
  })
  const lastSeq = lastBatch ? parseInt(lastBatch.referenceNumber.split('-').pop() || '0') : 0
  return `${datePrefix}${String(lastSeq + 1).padStart(3, '0')}`
}

/* ── POST — record a new freight batch, or wrap an existing stock-in ─── */
// `adoptAdjustmentId` turns a plain stock-in adjustment (recorded with no
// freight) into a freight batch: the existing lot is kept and re-costed rather
// than reversed, so its FIFO history and any sales made from it stand.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { adjustmentDate, fxSourceAccountId, manufacturerRfpId, freightRfpId, proofUrls, remarks, rows, adoptAdjustmentId } = body
    const cfg = buildBatchInputs(body)

    const { validRows, itemMap } = await processRows(rows)
    const { processedRows, grandTotalCbm } = toProcessedRows(validRows, itemMap, cfg.hasForeignPurchase, cfg.exRate)

    let adopted: Awaited<ReturnType<typeof prisma.inventoryAdjustment.findUnique>> = null
    if (adoptAdjustmentId) {
      adopted = await prisma.inventoryAdjustment.findUnique({ where: { id: adoptAdjustmentId } })
      if (!adopted) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 })
      if (adopted.type !== 'INCREASE') {
        return NextResponse.json({ error: 'Only stock-in (INCREASE) adjustments can carry freight costs.' }, { status: 400 })
      }
      if (adopted.batchRefId) {
        return NextResponse.json({ error: 'This row already belongs to a freight batch — edit the batch instead.' }, { status: 409 })
      }
    }

    const adjDate = adjustmentDate ? new Date(adjustmentDate) : new Date()
    const refNumber = await nextBatchRef(adjDate)

    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryAdjustmentBatch.create({
        data: {
          referenceNumber: refNumber,
          adjustmentDate: adjDate,
          hasForeignPurchase: cfg.hasForeignPurchase,
          foreignCurrency: cfg.hasForeignPurchase ? (cfg.foreignCurrency || 'CNY') : null,
          exchangeRate: cfg.storedExchangeRate,
          freight1Amount: cfg.f1 > 0 ? cfg.f1 : null, freight1IsForeign: cfg.freight1IsForeign,
          freight2Amount: cfg.f2 > 0 ? cfg.f2 : null, freight2IsForeign: cfg.freight2IsForeign,
          freight3Amount: cfg.f3 > 0 ? cfg.f3 : null, freight3IsForeign: cfg.freight3IsForeign,
          totalFreightPHP: cfg.totalFreightPHP,
          fxSourceAccountId: fxSourceAccountId || null,
          manufacturerRfpId: manufacturerRfpId || null,
          freightRfpId: freightRfpId || null,
          proofUrls: Array.isArray(proofUrls) && proofUrls.length > 0 ? proofUrls : undefined,
          remarks: remarks?.trim() || null,
          createdById: session.user.id,
        },
      })

      const { changes } = await reconcileBatchRows(tx, {
        batchDbId: batch.id,
        refNumber,
        adjDate,
        existing: adopted ? [adopted] : [],
        processedRows,
        grandTotalCbm,
        totalFreightPHP: cfg.totalFreightPHP,
        hasForeignPurchase: cfg.hasForeignPurchase,
        foreignCurrency: cfg.foreignCurrency || 'CNY',
        exchangeRate: cfg.storedExchangeRate,
        remarks: remarks?.trim() || null,
        userId: session.user.id,
      })

      const restatement = await postSoldCostRestatement(tx, {
        changes,
        entryDate: new Date(),
        createdById: session.user.id,
        referenceType: 'INVENTORY_COST_RESTATEMENT',
        referenceId: batch.id,
        description: `Landed-cost restatement — freight batch ${refNumber}`,
      })

      return { batch, restatement }
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
          totalFreightPHP: cfg.totalFreightPHP,
          exchangeRate: cfg.hasForeignPurchase ? cfg.exRate : null,
          adoptedAdjustmentId: adoptAdjustmentId || null,
          costRestatement: result.restatement.posted
            ? { totalDelta: result.restatement.totalDelta, journalEntryIds: result.restatement.journalEntryIds }
            : { skipped: result.restatement.reason },
        },
      },
    })

    return NextResponse.json({ batch: result.batch, referenceNumber: refNumber, costRestatement: result.restatement }, { status: 201 })
  } catch (err) {
    if (err instanceof BatchConflictError) return NextResponse.json({ error: err.message }, { status: 409 })
    console.error('[Freight Batch] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/* ── PATCH — edit an existing freight batch ───────────────────────────
   Lots are reconciled in place, so a batch stays editable after some of its
   units have been sold. Whatever the re-costing does to those sold units is
   restated into Cost of Sales (see post-cost-restatement) rather than left
   sitting in Inventory. Quantities still cannot drop below what was sold —
   that would need the sales reversed. */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { id, adjustmentDate, fxSourceAccountId, manufacturerRfpId, freightRfpId, proofUrls, remarks, rows } = body
    if (!id) return NextResponse.json({ error: 'Batch id is required' }, { status: 400 })

    const existing = await prisma.inventoryAdjustmentBatch.findUnique({ where: { id }, include: { adjustments: true } })
    if (!existing) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

    const cfg = buildBatchInputs(body)
    const { validRows, itemMap } = await processRows(rows)
    const { processedRows, grandTotalCbm } = toProcessedRows(validRows, itemMap, cfg.hasForeignPurchase, cfg.exRate)

    const refNumber = existing.referenceNumber
    const adjDate = adjustmentDate ? new Date(adjustmentDate) : existing.adjustmentDate

    const restatement = await prisma.$transaction(async (tx) => {
      await tx.inventoryAdjustmentBatch.update({
        where: { id },
        data: {
          adjustmentDate: adjDate,
          hasForeignPurchase: cfg.hasForeignPurchase,
          foreignCurrency: cfg.hasForeignPurchase ? (cfg.foreignCurrency || 'CNY') : null,
          exchangeRate: cfg.storedExchangeRate,
          freight1Amount: cfg.f1 > 0 ? cfg.f1 : null, freight1IsForeign: cfg.freight1IsForeign,
          freight2Amount: cfg.f2 > 0 ? cfg.f2 : null, freight2IsForeign: cfg.freight2IsForeign,
          freight3Amount: cfg.f3 > 0 ? cfg.f3 : null, freight3IsForeign: cfg.freight3IsForeign,
          totalFreightPHP: cfg.totalFreightPHP,
          fxSourceAccountId: fxSourceAccountId || null,
          manufacturerRfpId: manufacturerRfpId || null,
          freightRfpId: freightRfpId || null,
          proofUrls: Array.isArray(proofUrls) && proofUrls.length > 0 ? proofUrls : undefined,
          remarks: remarks?.trim() || null,
        },
      })

      const { changes } = await reconcileBatchRows(tx, {
        batchDbId: id,
        refNumber,
        adjDate,
        existing: existing.adjustments,
        processedRows,
        grandTotalCbm,
        totalFreightPHP: cfg.totalFreightPHP,
        hasForeignPurchase: cfg.hasForeignPurchase,
        foreignCurrency: cfg.foreignCurrency || 'CNY',
        exchangeRate: cfg.storedExchangeRate,
        remarks: remarks?.trim() || null,
        userId: session.user!.id as string,
      })

      // Dated today, not back at the shipment: the correction is known now, and
      // the periods those sales fell in may already be closed.
      return postSoldCostRestatement(tx, {
        changes,
        entryDate: new Date(),
        createdById: session.user!.id as string,
        referenceType: 'INVENTORY_COST_RESTATEMENT',
        referenceId: id,
        description: `Landed-cost restatement — freight batch ${refNumber}`,
      })
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'FREIGHT_BATCH_EDIT',
        entity: 'inventoryAdjustmentBatch',
        entityId: id,
        details: {
          referenceNumber: refNumber,
          itemCount: validRows.length,
          totalFreightPHP: cfg.totalFreightPHP,
          costRestatement: restatement.posted
            ? { totalDelta: restatement.totalDelta, journalEntryIds: restatement.journalEntryIds }
            : { skipped: restatement.reason },
        },
      },
    })
    return NextResponse.json({ ok: true, referenceNumber: refNumber, costRestatement: restatement })
  } catch (err) {
    if (err instanceof BatchConflictError) return NextResponse.json({ error: err.message }, { status: 409 })
    console.error('[Freight Batch] Edit error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}

// DELETE ?id=<batchId> — remove a whole freight batch: reverse each item's stock
// and delete the adjustments + batch. Still blocked once a lot has been consumed:
// unlike an edit, there is no cost left to restate onto — the units the sale
// took would have no lot to have come from.
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
    if (consumed) return NextResponse.json({ error: 'Cannot delete: some items from this batch have already been sold/consumed. Edit the batch instead, or reverse those sales first.' }, { status: 409 })
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
