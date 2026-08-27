import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Per-branch inventory position.
 *
 * Custody model: consigned stock physically lives in a branch COPY of the
 * item — a real InventoryItem row at the clinic, created/incremented when a
 * consignment is RECEIVED and decremented when the clinic's front desk rings
 * a sale (the POS re-points such order lines at the copy). So:
 *
 *   onHand   — the branch copy's live quantity. This is the truth.
 *   received — lifetime consignments RECEIVED at the branch (context)
 *   inTransit— APPROVED/SHIPPED consignments on the way (not yet stock)
 *   returned — RETURNED transfers (context)
 *   sold     — order lines linked to the branch copy, plus (legacy, from
 *              before the re-pointing existed) clinic-cashier-rung lines
 *              still linked to the pool item
 *
 * The Verdana column is the pool row itself: onHand = pool quantity, sold =
 * pool-linked sales not attributed to a clinic cashier.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Drill mode: ?itemId=<pool item>&branch=<branch> returns the order lines
  // behind that cell's Sold figure, attributed exactly like the aggregate
  // below — copy-linked lines by the copy's branch, legacy pool-linked lines
  // by the clinic cashier who rang them.
  const { searchParams } = new URL(req.url)
  const drillItemId = searchParams.get('itemId')
  const drillBranch = searchParams.get('branch')

  const [transfers, soldLines, items] = await Promise.all([
    prisma.consignmentTransfer.findMany({
      where: { status: { in: ['APPROVED', 'SHIPPED', 'RECEIVED', 'RETURNED'] } },
      select: { itemId: true, toBranch: true, status: true, quantity: true },
    }),
    prisma.orderItem.findMany({
      where: { inventoryItemId: { not: null }, order: { status: 'COMPLETED' } },
      select: {
        inventoryItemId: true, quantity: true, isFreeSample: true, unitPrice: true, lineTotal: true,
        order: { select: {
          orderNumber: true, transactionDate: true, patientName: true, branch: true,
          createdBy: { select: { name: true, branch: true } },
        } },
      },
    }),
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { id: true, name: true, sku: true, branch: true, quantity: true, sourceItemId: true },
    }),
  ])

  const CLINICS = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS'] as const
  type Cell = { received: number; inTransit: number; returned: number; sold: number; onHand: number | null }
  const blank = (): Cell => ({ received: 0, inTransit: 0, returned: 0, sold: 0, onHand: null })

  // Map branch copies to their pool parent: explicit sourceItemId link first,
  // legacy SKU-suffix rows ("<pool sku>-SAND" etc.) as fallback.
  const bySku = new Map(items.map(i => [i.sku, i]))
  const byId = new Map(items.map(i => [i.id, i]))
  const parentOf = new Map<string, string>() // copyId -> poolId
  for (const it of items) {
    if (it.sourceItemId) { parentOf.set(it.id, it.sourceItemId); continue }
    const dash = it.sku.lastIndexOf('-')
    if (dash > 0) {
      const base = bySku.get(it.sku.slice(0, dash))
      if (base && base.id !== it.id && base.branch !== it.branch) parentOf.set(it.id, base.id)
    }
  }

  if (drillItemId && drillBranch) {
    const attrOf = (l: (typeof soldLines)[number]): { poolId: string; branch: string } => {
      const poolId = parentOf.get(l.inventoryItemId!) || l.inventoryItemId!
      if (parentOf.has(l.inventoryItemId!)) {
        const copy = byId.get(l.inventoryItemId!)
        return { poolId, branch: copy?.branch || l.order.branch }
      }
      const cashierBranch = l.order.createdBy?.branch as string | null
      const branch = cashierBranch && (CLINICS as readonly string[]).includes(cashierBranch)
        ? cashierBranch
        : l.order.branch
      return { poolId, branch }
    }
    const rows = soldLines
      .filter(l => {
        const a = attrOf(l)
        return a.poolId === drillItemId && a.branch === drillBranch
      })
      .map(l => ({
        orderNumber: l.order.orderNumber,
        date: l.order.transactionDate,
        patientName: l.order.patientName,
        cashier: l.order.createdBy?.name || null,
        quantity: l.quantity,
        isFreeSample: l.isFreeSample,
        unitPrice: Number(l.unitPrice),
        lineTotal: Number(l.lineTotal),
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return NextResponse.json({ rows })
  }

  const byItem = new Map<string, Record<string, Cell>>()
  const cell = (poolId: string, branch: string): Cell => {
    if (!byItem.has(poolId)) byItem.set(poolId, {})
    const m = byItem.get(poolId)!
    if (!m[branch]) m[branch] = blank()
    return m[branch]
  }

  for (const t of transfers) {
    const c = cell(t.itemId, t.toBranch)
    if (t.status === 'RECEIVED') c.received += t.quantity
    else if (t.status === 'RETURNED') c.returned += t.quantity
    else c.inTransit += t.quantity
  }

  // Live on-hand from the copies themselves; the pool's own branch cell too.
  for (const it of items) {
    const poolId = parentOf.get(it.id)
    if (poolId) {
      cell(poolId, it.branch).onHand = (cell(poolId, it.branch).onHand ?? 0) + it.quantity
    } else if (byItem.has(it.id) || items.some(x => parentOf.get(x.id) === it.id)) {
      cell(it.id, it.branch).onHand = it.quantity
    }
  }

  for (const l of soldLines) {
    if (!l.inventoryItemId) continue
    const poolId = parentOf.get(l.inventoryItemId)
    if (poolId) {
      // Line already points at a branch copy — its branch is authoritative.
      const copy = byId.get(l.inventoryItemId)
      cell(poolId, copy?.branch || l.order.branch).sold += l.quantity
    } else {
      // Pool-linked line: legacy cashier attribution (pre-re-pointing sales).
      const cashierBranch = l.order.createdBy?.branch as string | null
      const branch = cashierBranch && (CLINICS as readonly string[]).includes(cashierBranch)
        ? cashierBranch
        : l.order.branch
      cell(l.inventoryItemId, branch).sold += l.quantity
    }
  }

  const rows = items
    .filter(i => !parentOf.has(i.id) && byItem.has(i.id))
    .map(i => {
      const branches = byItem.get(i.id)!
      const copiesQty = items.filter(x => parentOf.get(x.id) === i.id).reduce((s, x) => s + x.quantity, 0)
      return {
        itemId: i.id, name: i.name, sku: i.sku,
        totalStock: i.quantity + copiesQty,
        branches,
        hasActivity: Object.values(branches).some(c => c.received || c.sold || c.inTransit || c.returned || (c.onHand ?? 0) !== 0),
      }
    })
    .filter(r => r.hasActivity)
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    rows,
    note: 'On-hand is the branch copy’s live counter — consignments received minus branch sales. In-transit consignments are not yet stock.',
  })
}
