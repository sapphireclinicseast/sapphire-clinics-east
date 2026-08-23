import { NextResponse } from 'next/server'
import type { Prisma, PrismaClient } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { consumeFifoLots, restoreFifoLots, recalcWeightedUnitCost } from '@/lib/fifo'
import { postInventoryAdjustmentJournal, reverseInventoryAdjustmentJournal } from '@/lib/accounting/post-inventory-adjustment'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

/**
 * Multi-item stock shrinkage — write off several products in one go.
 *
 * The rows of one submission share a `SHR-YYYYMMDD-NNN` reference so they read
 * as a single event, and editing any of them brings the whole set back up.
 *
 * A SHRINKAGE row is not a FIFO lot (only INCREASE rows are), so an edit can
 * safely undo and re-apply the whole set: each old row gives its units back to
 * the item and its lots, its journal entry is reversed, and the new rows are
 * applied from scratch. Nothing downstream depends on a shrinkage row's id.
 */

type TxClient = Prisma.TransactionClient | PrismaClient

interface ShrinkRow { itemId: string; quantity: number }

/** Raised for conditions the user can fix in the form — surfaced as a 400. */
class ShrinkageError extends Error {}

function parseRows(rows: unknown): ShrinkRow[] {
  const out: ShrinkRow[] = []
  for (const r of Array.isArray(rows) ? rows : []) {
    const itemId = (r as { itemId?: string })?.itemId
    const qty = Math.round(Number((r as { quantity?: unknown })?.quantity))
    if (!itemId || !Number.isFinite(qty) || qty <= 0) continue
    out.push({ itemId, quantity: qty })
  }
  return out
}

async function nextShrinkRef(when: Date) {
  const ymd = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}${String(when.getDate()).padStart(2, '0')}`
  const prefix = `SHR-${ymd}-`
  const last = await prisma.inventoryAdjustment.findFirst({
    where: { batchId: { startsWith: prefix } },
    orderBy: { batchId: 'desc' },
    select: { batchId: true },
  })
  const lastSeq = last?.batchId ? parseInt(last.batchId.split('-').pop() || '0') : 0
  return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`
}

/** Apply one set of shrinkage rows: deduct stock, consume FIFO lots, record each row. */
async function applyRows(
  tx: TxClient,
  rows: ShrinkRow[],
  opts: { when: Date; remarks: string; ref: string; userId: string },
): Promise<string[]> {
  const createdIds: string[] = []
  for (const row of rows) {
    const item = await tx.inventoryItem.findUnique({ where: { id: row.itemId } })
    if (!item) throw new Error(`Item not found: ${row.itemId}`)
    const previousQuantity = item.quantity
    // Refuse rather than clamp: writing off fewer units than entered would look
    // like it worked while leaving the count wrong.
    if (row.quantity > previousQuantity) {
      throw new ShrinkageError(`${item.sku} — ${item.name}: cannot write off ${row.quantity} unit(s), only ${previousQuantity} on hand.`)
    }
    const newQuantity = previousQuantity - row.quantity
    const adj = await tx.inventoryAdjustment.create({
      data: {
        itemId: row.itemId,
        type: 'SHRINKAGE',
        quantityChange: row.quantity,
        previousQuantity,
        newQuantity,
        adjustmentDate: opts.when,
        remarks: opts.remarks,
        batchId: opts.ref,
        referenceNumber: opts.ref,
        adjustedById: opts.userId,
      },
      select: { id: true },
    })
    await tx.inventoryItem.update({ where: { id: row.itemId }, data: { quantity: newQuantity } })
    await consumeFifoLots(tx, row.itemId, row.quantity)
    createdIds.push(adj.id)
  }
  return createdIds
}

/** Give back everything a set of shrinkage rows took, then remove the rows. */
async function undoRows(
  tx: TxClient,
  existing: { id: string; itemId: string; quantityChange: number }[],
) {
  for (const a of existing) {
    await tx.inventoryItem.update({ where: { id: a.itemId }, data: { quantity: { increment: a.quantityChange } } })
    await restoreFifoLots(tx, a.itemId, a.quantityChange)
  }
  await tx.inventoryAdjustment.deleteMany({ where: { id: { in: existing.map((a) => a.id) } } })
}

async function refreshUnitCosts(itemIds: string[]) {
  for (const itemId of [...new Set(itemIds)]) {
    const c = await recalcWeightedUnitCost(prisma, itemId)
    if (c > 0) await prisma.inventoryItem.update({ where: { id: itemId }, data: { unitCost: c } })
  }
}

/** GET ?id=<adjustmentId> — the row and everything else written off with it. */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'Adjustment id is required' }, { status: 400 })

  const adj = await prisma.inventoryAdjustment.findUnique({ where: { id } })
  if (!adj) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 })
  if (adj.type !== 'SHRINKAGE') {
    return NextResponse.json({ error: 'Only shrinkage rows are edited here.' }, { status: 400 })
  }

  // Rows written off together share a SHR- reference; older one-off rows stand alone.
  const group = adj.batchId?.startsWith('SHR-')
    ? await prisma.inventoryAdjustment.findMany({
        where: { batchId: adj.batchId, type: 'SHRINKAGE' },
        orderBy: { createdAt: 'asc' },
        include: { item: { select: { sku: true, name: true, quantity: true } } },
      })
    : [await prisma.inventoryAdjustment.findUnique({ where: { id }, include: { item: { select: { sku: true, name: true, quantity: true } } } })]

  return NextResponse.json({
    referenceNumber: adj.batchId?.startsWith('SHR-') ? adj.batchId : (adj.referenceNumber || null),
    batchId: adj.batchId?.startsWith('SHR-') ? adj.batchId : null,
    adjustmentDate: adj.adjustmentDate,
    remarks: adj.remarks,
    rows: group.filter(Boolean).map((a) => ({
      adjustmentId: a!.id,
      itemId: a!.itemId,
      quantity: a!.quantityChange,
      itemSku: a!.item?.sku || '',
      itemName: a!.item?.name || '',
    })),
  })
}

/** POST { adjustmentDate, remarks, rows: [{ itemId, quantity }] } */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { adjustmentDate, remarks, rows } = await req.json()
    const parsed = parseRows(rows)
    if (parsed.length === 0) return NextResponse.json({ error: 'Add at least one item with a quantity greater than zero.' }, { status: 400 })
    if (!remarks?.trim()) return NextResponse.json({ error: 'Remarks are required — record why the stock is being written off.' }, { status: 400 })

    const when = adjustmentDate ? new Date(adjustmentDate) : new Date()
    const ref = await nextShrinkRef(when)

    const createdIds = await prisma.$transaction((tx) =>
      applyRows(tx, parsed, { when, remarks: remarks.trim(), ref, userId: session.user!.id as string }),
    )

    await refreshUnitCosts(parsed.map((r) => r.itemId))

    // Tier 3 Step 5: post each write-off to the GL (non-fatal, gated by ENABLE_GL_POSTING).
    for (const adjId of createdIds) {
      try {
        const r = await postInventoryAdjustmentJournal(prisma, adjId, session.user.id)
        if (!r.posted && process.env.ENABLE_GL_POSTING === 'true') {
          console.warn(`[GL] Skipped shrinkage posting for ${adjId}: ${r.reason}`)
        }
      } catch (e) {
        console.error(`[GL] Shrinkage posting threw for ${adjId}:`, e)
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'SHRINKAGE_BATCH',
        entity: 'inventoryAdjustment',
        entityId: createdIds[0] || ref,
        details: { referenceNumber: ref, itemCount: parsed.length, rows: parsed.map((r) => ({ ...r })) },
      },
    })

    return NextResponse.json({ ok: true, referenceNumber: ref, created: createdIds.length }, { status: 201 })
  } catch (err) {
    if (err instanceof ShrinkageError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[Shrinkage] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}

/** PATCH { id, adjustmentDate, remarks, rows } — replace a whole write-off. */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id, adjustmentDate, remarks, rows } = await req.json()
    if (!id) return NextResponse.json({ error: 'Adjustment id is required' }, { status: 400 })
    const parsed = parseRows(rows)
    if (parsed.length === 0) return NextResponse.json({ error: 'Add at least one item with a quantity greater than zero.' }, { status: 400 })
    if (!remarks?.trim()) return NextResponse.json({ error: 'Remarks are required — record why the stock is being written off.' }, { status: 400 })

    const anchor = await prisma.inventoryAdjustment.findUnique({ where: { id } })
    if (!anchor) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 })
    if (anchor.type !== 'SHRINKAGE') return NextResponse.json({ error: 'Only shrinkage rows are edited here.' }, { status: 400 })

    const existing = anchor.batchId?.startsWith('SHR-')
      ? await prisma.inventoryAdjustment.findMany({ where: { batchId: anchor.batchId, type: 'SHRINKAGE' }, select: { id: true, itemId: true, quantityChange: true } })
      : [{ id: anchor.id, itemId: anchor.itemId, quantityChange: anchor.quantityChange }]

    const when = adjustmentDate ? new Date(adjustmentDate) : anchor.adjustmentDate
    // Keep the original reference when there is one, so the write-off stays traceable.
    const ref = anchor.batchId?.startsWith('SHR-') ? anchor.batchId : await nextShrinkRef(when)

    // Reverse the old entries before the rows go — the reversal looks the
    // original up by adjustment id, and stays on file as the audit trail.
    for (const a of existing) {
      try {
        await reverseInventoryAdjustmentJournal(prisma, a.id, session.user.id, 'shrinkage edited')
      } catch (e) {
        console.error(`[GL] Shrinkage reversal threw for ${a.id}:`, e)
      }
    }

    const createdIds = await prisma.$transaction(async (tx) => {
      await undoRows(tx, existing)
      return applyRows(tx, parsed, { when, remarks: remarks.trim(), ref, userId: session.user!.id as string })
    })

    await refreshUnitCosts([...existing.map((a) => a.itemId), ...parsed.map((r) => r.itemId)])

    for (const adjId of createdIds) {
      try {
        const r = await postInventoryAdjustmentJournal(prisma, adjId, session.user.id)
        if (!r.posted && process.env.ENABLE_GL_POSTING === 'true') {
          console.warn(`[GL] Skipped shrinkage posting for ${adjId}: ${r.reason}`)
        }
      } catch (e) {
        console.error(`[GL] Shrinkage posting threw for ${adjId}:`, e)
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'SHRINKAGE_BATCH_EDIT',
        entity: 'inventoryAdjustment',
        entityId: createdIds[0] || ref,
        details: { referenceNumber: ref, replaced: existing.length, itemCount: parsed.length, rows: parsed.map((r) => ({ ...r })) },
      },
    })

    return NextResponse.json({ ok: true, referenceNumber: ref, created: createdIds.length })
  } catch (err) {
    if (err instanceof ShrinkageError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[Shrinkage] Edit error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
