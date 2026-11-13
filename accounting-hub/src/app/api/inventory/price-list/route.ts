import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { priceTiers, type Tiers } from '@/lib/price-tiers'

/**
 * Price list — three tiers per product we sell, from the CURRENT COGS
 * (see lib/price-tiers.ts for the rule), next to the price POS charges today.
 *
 * GET  → every active product (branch consignment copies folded into their
 *        pool product), with COGS, tiers, current price, units sold and
 *        whether it counts as sold (has a selling price or sales history).
 * POST → { ids?: string[] } sets the POS selling price to the Standard tier,
 *        recomputed here from the live COGS (never trusted from the client).
 *        No ids = every sold product whose price differs from Standard.
 *        Branch copies and per-variant prices follow; each change is audited
 *        with the old price so it can be undone.
 */

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const num = (v: unknown) => (v == null ? null : Number(v))
const r2 = (n: number) => Math.round(n * 100) / 100

interface VariantRow {
  id: string
  label: string
  sku: string
  ownCost: boolean
  cogs: number | null
  currentPrice: number | null // null = inherits the product price
  tiers: Tiers | null
}

export interface PriceListRow {
  id: string
  sku: string
  name: string
  branch: string
  department: string
  isBundle: boolean
  imageUrl: string | null
  cogs: number | null
  cogsSource: 'unitCost' | 'bundle'
  currentPrice: number | null
  tiers: Tiers | null
  unitsSold: number
  lastSold: string | null
  sold: boolean
  copies: number
  variants: VariantRow[]
}

async function loadRows(): Promise<PriceListRow[]> {
  const [items, sales] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: {
        id: true, sku: true, name: true, branch: true, skuDepartment: true, isBundle: true, imageUrl: true,
        unitCost: true, sellingPrice: true, sourceItemId: true,
        variants: {
          where: { isActive: true },
          select: { id: true, variantLabel: true, variantSku: true, unitCost: true, sellingPrice: true },
          orderBy: { variantLabel: 'asc' },
        },
        bundleComponents: { select: { quantity: true, component: { select: { unitCost: true } } } },
      },
      orderBy: { sku: 'asc' },
    }),
    prisma.orderItem.groupBy({
      by: ['inventoryItemId'],
      where: { inventoryItemId: { not: null }, isFreeSample: false, order: { status: 'COMPLETED' } },
      _sum: { quantity: true, returnedQuantity: true },
      _max: { createdAt: true },
    }),
  ])

  // Branch copies → pool product: sourceItemId first, legacy "<pool sku>-SUFFIX"
  // rows as fallback (same mapping as the Branch Stock panel).
  const bySku = new Map(items.map(i => [i.sku, i]))
  const parentOf = new Map<string, string>()
  for (const it of items) {
    if (it.sourceItemId) { parentOf.set(it.id, it.sourceItemId); continue }
    const dash = it.sku.lastIndexOf('-')
    if (dash > 0) {
      const base = bySku.get(it.sku.slice(0, dash))
      if (base && base.id !== it.id && base.branch !== it.branch) parentOf.set(it.id, base.id)
    }
  }
  // A copy whose pool product is archived/missing stands on its own.
  const activeIds = new Set(items.map(i => i.id))
  for (const [copy, pool] of parentOf) if (!activeIds.has(pool)) parentOf.delete(copy)

  const soldBy = new Map<string, { units: number; last: Date | null }>()
  for (const s of sales) {
    const id = parentOf.get(s.inventoryItemId!) || s.inventoryItemId!
    const cur = soldBy.get(id) || { units: 0, last: null }
    cur.units += (s._sum.quantity || 0) - (s._sum.returnedQuantity || 0)
    const last = s._max.createdAt
    if (last && (!cur.last || last > cur.last)) cur.last = last
    soldBy.set(id, cur)
  }
  const copyCount = new Map<string, number>()
  for (const pool of parentOf.values()) copyCount.set(pool, (copyCount.get(pool) || 0) + 1)

  const rows: PriceListRow[] = []
  for (const it of items) {
    if (parentOf.has(it.id)) continue
    // A bundle's own unitCost is only refreshed when its components are edited,
    // so price it from the components' live costs.
    const bundleCost = it.isBundle && it.bundleComponents.length
      ? r2(it.bundleComponents.reduce((s, bc) => s + Number(bc.component.unitCost || 0) * bc.quantity, 0))
      : null
    const cogs = bundleCost && bundleCost > 0 ? bundleCost : (Number(it.unitCost) > 0 ? r2(Number(it.unitCost)) : null)
    const tiers = priceTiers(cogs)
    const currentPrice = num(it.sellingPrice)
    const s = soldBy.get(it.id)
    const variants: VariantRow[] = it.variants.map(v => {
      const own = v.unitCost != null && Number(v.unitCost) > 0
      const vCogs = own ? r2(Number(v.unitCost)) : cogs
      return {
        id: v.id, label: v.variantLabel, sku: v.variantSku, ownCost: own, cogs: vCogs,
        currentPrice: num(v.sellingPrice), tiers: own ? priceTiers(vCogs) : tiers,
      }
    })
    const hasPrice = (currentPrice ?? 0) > 0 || variants.some(v => (v.currentPrice ?? 0) > 0)
    rows.push({
      id: it.id, sku: it.sku, name: it.name, branch: it.branch, department: it.skuDepartment,
      isBundle: it.isBundle, imageUrl: it.imageUrl,
      cogs, cogsSource: bundleCost && bundleCost > 0 ? 'bundle' : 'unitCost',
      currentPrice, tiers,
      unitsSold: s?.units || 0,
      lastSold: s?.last ? s.last.toISOString() : null,
      // "Sold" = something we sell: priced for POS or with sales on record.
      // Internal consumables (never priced, never rung up) drop out here.
      sold: hasPrice || (s?.units || 0) > 0,
      copies: copyCount.get(it.id) || 0,
      variants,
    })
  }
  return rows
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await loadRows()
  return NextResponse.json({ rows })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const ids: string[] | null = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : null

  const rows = await loadRows()
  const target = rows.filter(r => r.sold && r.tiers && (ids ? ids.includes(r.id) : true))

  type Change = { kind: 'item' | 'copy' | 'variant'; id: string; sku: string; cogs: number | null; oldPrice: number | null; newPrice: number }
  const changes: Change[] = []
  for (const r of target) {
    const std = r.tiers!.standard
    if (r.currentPrice !== std) changes.push({ kind: 'item', id: r.id, sku: r.sku, cogs: r.cogs, oldPrice: r.currentPrice, newPrice: std })
    for (const v of r.variants) {
      // A variant with no price of its own already charges the product price.
      if (!v.ownCost && v.currentPrice == null) continue
      const vStd = v.tiers?.standard
      if (vStd != null && v.currentPrice !== vStd) changes.push({ kind: 'variant', id: v.id, sku: v.sku, cogs: v.cogs, oldPrice: v.currentPrice, newPrice: vStd })
    }
  }

  // Branch copies carry the pool price so a clinic sale charges the same.
  const poolIds = target.map(r => r.id)
  const copies = poolIds.length
    ? await prisma.inventoryItem.findMany({
        where: { sourceItemId: { in: poolIds }, isActive: true },
        select: { id: true, sku: true, sellingPrice: true, sourceItemId: true },
      })
    : []
  const stdOf = new Map(target.map(r => [r.id, r.tiers!.standard]))
  for (const c of copies) {
    const std = stdOf.get(c.sourceItemId!)
    if (std != null && num(c.sellingPrice) !== std) changes.push({ kind: 'copy', id: c.id, sku: c.sku, cogs: null, oldPrice: num(c.sellingPrice), newPrice: std })
  }

  if (body?.dryRun) return NextResponse.json({ dryRun: true, changes })
  if (!changes.length) return NextResponse.json({ updated: 0, changes })

  await prisma.$transaction(async tx => {
    for (const c of changes) {
      if (c.kind === 'variant') await tx.inventoryVariant.update({ where: { id: c.id }, data: { sellingPrice: c.newPrice } })
      else await tx.inventoryItem.update({ where: { id: c.id }, data: { sellingPrice: c.newPrice } })
    }
    await tx.auditLog.createMany({
      data: changes.map(c => ({
        userId: session.user.id!,
        action: 'PRICE_TIER_APPLY',
        entity: c.kind === 'variant' ? 'inventoryVariant' : 'inventoryItem',
        entityId: c.id,
        details: { sku: c.sku, cogs: c.cogs, oldPrice: c.oldPrice, newPrice: c.newPrice, rule: 'Standard = COGS × 7, rounded up to ₱10' },
      })),
    })
  }, { timeout: 60_000 })

  return NextResponse.json({ updated: changes.length, changes })
}
