import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Per-branch inventory position, computed live from the two record streams
 * that actually exist:
 *
 *   IN   — ConsignmentTransfer rows RECEIVED at the branch
 *   OUT  — RETURNED transfers, plus POS sales attributed to the branch by the
 *          CASHIER who rang them (policy from the user, 2026-08-11): product
 *          sales are recorded as store orders, but a sale rung by a clinic
 *          front-desk account (e.g. "AHEA Front Desk") happened at that
 *          clinic, out of its consigned stock. Attribution = the cashier's
 *          User.branch when it is a clinic; otherwise the order's own branch.
 *
 * remaining = received − returned − sold. In-transit (APPROVED/SHIPPED) is
 * reported separately and not yet part of the branch's stock.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [transfers, soldLines, items] = await Promise.all([
    prisma.consignmentTransfer.findMany({
      where: { status: { in: ['APPROVED', 'SHIPPED', 'RECEIVED', 'RETURNED'] } },
      select: { itemId: true, toBranch: true, status: true, quantity: true },
    }),
    prisma.orderItem.findMany({
      where: { inventoryItemId: { not: null }, order: { status: 'COMPLETED' } },
      select: {
        inventoryItemId: true, quantity: true,
        order: { select: { branch: true, createdBy: { select: { name: true, branch: true } } } },
      },
    }),
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { id: true, name: true, sku: true, quantity: true, branchStock: true },
    }),
  ])

  type Cell = { received: number; inTransit: number; returned: number; sold: number; remaining: number }
  const blank = (): Cell => ({ received: 0, inTransit: 0, returned: 0, sold: 0, remaining: 0 })
  const CLINICS = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS'] as const
  const byItem = new Map<string, Record<string, Cell>>()
  const cell = (itemId: string, branch: string): Cell => {
    if (!byItem.has(itemId)) byItem.set(itemId, {})
    const m = byItem.get(itemId)!
    if (!m[branch]) m[branch] = blank()
    return m[branch]
  }

  for (const t of transfers) {
    const c = cell(t.itemId, t.toBranch)
    if (t.status === 'RECEIVED') c.received += t.quantity
    else if (t.status === 'RETURNED') c.returned += t.quantity
    else c.inTransit += t.quantity // APPROVED or SHIPPED — on the way
  }
  for (const l of soldLines) {
    if (!l.inventoryItemId) continue
    // The cashier's clinic wins over the order's branch: product sales are
    // store orders on paper, but the front-desk account says where the unit
    // physically walked out.
    const cashierBranch = l.order.createdBy?.branch as string | null
    const branch = cashierBranch && (CLINICS as readonly string[]).includes(cashierBranch)
      ? cashierBranch
      : l.order.branch
    cell(l.inventoryItemId, branch).sold += l.quantity
  }

  const rows = items
    .map(i => {
      const branches = byItem.get(i.id) || {}
      for (const b of Object.keys(branches)) {
        const c = branches[b]
        c.remaining = c.received - c.returned - c.sold
      }
      return {
        itemId: i.id, name: i.name, sku: i.sku, totalStock: i.quantity,
        branches,
        hasActivity: Object.values(branches).some(c => c.received || c.sold || c.inTransit || c.returned),
      }
    })
    .filter(r => r.hasActivity)
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    rows,
    note: 'Sales are attributed to a clinic when rung by its front-desk cashier account; all other sales belong to the order’s own branch.',
  })
}
