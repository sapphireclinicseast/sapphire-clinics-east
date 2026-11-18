import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PRICE_TIERS, priceTiers, hasSetPrice, readPriceChoice, type PriceChoice, type TierKey, type Tiers } from '@/lib/price-tiers'

/**
 * Price list — three tiers per product we sell, from the CURRENT COGS
 * (see lib/price-tiers.ts for the rule), next to the price POS charges today.
 *
 * GET  → every active product (branch consignment copies folded into their
 *        pool product), with COGS, tiers, current price, units sold and
 *        whether it counts as sold (has a selling price or sales history).
 * POST → { ids?: string[], tier?: 'lowest'|'standard'|'highest', dryRun? }
 *        sets the POS selling price to a tier, recomputed here from the live
 *        COGS (never trusted from the client).
 *        With `tier` (a click on a price in the list): that tier becomes the
 *        product's chosen tier (InventoryItem.priceTier) and its price.
 *        Without: each product goes to its own chosen tier (Standard unless
 *        one was picked), so a re-price after a COGS change keeps the choice.
 *        A Custom product (price typed in the item form, matching no tier) is
 *        never re-priced by the bulk path — only a click on a tier moves it.
 *        No ids = every sold product whose price differs from its tier.
 *        Branch copies and per-variant prices follow; each change is audited
 *        with the old price so it can be undone. verdanarehab.com reads the
 *        POS price every 15 minutes (/api/internal/store-prices), so the
 *        website follows on its own.
 */

const TIER_KEYS = PRICE_TIERS.map(t => t.key) as TierKey[]
const asTier = (v: unknown): TierKey | null => (TIER_KEYS.includes(v as TierKey) ? (v as TierKey) : null)
const TIER_RULE: Record<TierKey, string> = {
  lowest: 'Lowest = COGS × 3, rounded up to ₱10',
  standard: 'Standard = COGS × 7, rounded up to ₱10',
  highest: 'Highest = COGS × 9, rounded up to ₱10',
}

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
  /** Merchandise / books with their own set price: no tiers, never re-priced here. */
  setPrice: boolean
  /** The tier this product is priced at (chosen on the list; Standard by default). */
  /** Chosen tier (Standard by default), or Custom: a price typed in the item form. */
  tier: PriceChoice
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
        unitCost: true, sellingPrice: true, priceTier: true, sourceItemId: true,
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
    const setPrice = hasSetPrice(it.skuDepartment)
    const tiers = setPrice ? null : priceTiers(cogs)
    const currentPrice = num(it.sellingPrice)
    const s = soldBy.get(it.id)
    const variants: VariantRow[] = it.variants.map(v => {
      const own = v.unitCost != null && Number(v.unitCost) > 0
      const vCogs = own ? r2(Number(v.unitCost)) : cogs
      return {
        id: v.id, label: v.variantLabel, sku: v.variantSku, ownCost: own, cogs: vCogs,
        currentPrice: num(v.sellingPrice), tiers: setPrice ? null : own ? priceTiers(vCogs) : tiers,
      }
    })
    const hasPrice = (currentPrice ?? 0) > 0 || variants.some(v => (v.currentPrice ?? 0) > 0)
    rows.push({
      id: it.id, sku: it.sku, name: it.name, branch: it.branch, department: it.skuDepartment,
      isBundle: it.isBundle, imageUrl: it.imageUrl,
      cogs, cogsSource: bundleCost && bundleCost > 0 ? 'bundle' : 'unitCost',
      currentPrice, tiers, setPrice, tier: readPriceChoice(it.priceTier),
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
  const pick = body?.tier == null ? null : asTier(body.tier)
  if (body?.tier != null && !pick) return NextResponse.json({ error: 'Unknown price tier' }, { status: 400 })
  // Picking a tier is a per-product choice; it never sweeps the whole list.
  if (pick && !ids?.length) return NextResponse.json({ error: 'Pick the products to price' }, { status: 400 })

  const rows = await loadRows()
  if (pick && rows.some(r => r.setPrice && ids!.includes(r.id))) {
    return NextResponse.json({ error: 'Merchandise and books keep their set price — change it on the product instead' }, { status: 400 })
  }
  // Set-price departments have no tiers, so they never enter this list.
  // Custom prices are kept as typed unless a tier is picked for them.
  const target = rows.filter(r => r.sold && r.tiers && (ids ? ids.includes(r.id) : true) && (pick || r.tier !== 'custom'))
  const tierOf = (r: PriceListRow): TierKey => pick ?? (r.tier as TierKey)

  type Change = { kind: 'item' | 'copy' | 'variant'; id: string; sku: string; cogs: number | null; oldPrice: number | null; newPrice: number; tier: TierKey }
  const changes: Change[] = []
  for (const r of target) {
    const t = tierOf(r)
    const price = r.tiers![t]
    if (r.currentPrice !== price) changes.push({ kind: 'item', id: r.id, sku: r.sku, cogs: r.cogs, oldPrice: r.currentPrice, newPrice: price, tier: t })
    for (const v of r.variants) {
      // A variant with no price of its own already charges the product price.
      if (!v.ownCost && v.currentPrice == null) continue
      const vPrice = v.tiers?.[t]
      if (vPrice != null && v.currentPrice !== vPrice) changes.push({ kind: 'variant', id: v.id, sku: v.sku, cogs: v.cogs, oldPrice: v.currentPrice, newPrice: vPrice, tier: t })
    }
  }
  // Products whose chosen tier changes (saved even when the price already matches).
  const tierSets = pick ? target.filter(r => r.tier !== pick) : []

  // Branch copies carry the pool price so a clinic sale charges the same.
  const poolIds = target.map(r => r.id)
  const copies = poolIds.length
    ? await prisma.inventoryItem.findMany({
        where: { sourceItemId: { in: poolIds }, isActive: true },
        select: { id: true, sku: true, sellingPrice: true, sourceItemId: true },
      })
    : []
  const poolPrice = new Map(target.map(r => [r.id, { price: r.tiers![tierOf(r)], tier: tierOf(r) }]))
  for (const c of copies) {
    const p = poolPrice.get(c.sourceItemId!)
    if (p && num(c.sellingPrice) !== p.price) changes.push({ kind: 'copy', id: c.id, sku: c.sku, cogs: null, oldPrice: num(c.sellingPrice), newPrice: p.price, tier: p.tier })
  }

  if (body?.dryRun) return NextResponse.json({ dryRun: true, changes })
  if (!changes.length && !tierSets.length) return NextResponse.json({ updated: 0, changes })

  await prisma.$transaction(async tx => {
    for (const c of changes) {
      if (c.kind === 'variant') await tx.inventoryVariant.update({ where: { id: c.id }, data: { sellingPrice: c.newPrice } })
      else await tx.inventoryItem.update({ where: { id: c.id }, data: { sellingPrice: c.newPrice } })
    }
    // Standard is the default, so it is stored as "no choice".
    for (const r of tierSets) {
      await tx.inventoryItem.update({ where: { id: r.id }, data: { priceTier: pick === 'standard' ? null : pick } })
    }
    await tx.auditLog.createMany({
      data: [
        ...changes.map(c => ({
          userId: session.user.id!,
          action: 'PRICE_TIER_APPLY',
          entity: c.kind === 'variant' ? 'inventoryVariant' : 'inventoryItem',
          entityId: c.id,
          details: { sku: c.sku, cogs: c.cogs, oldPrice: c.oldPrice, newPrice: c.newPrice, tier: c.tier, rule: TIER_RULE[c.tier] },
        })),
        ...tierSets.map(r => ({
          userId: session.user.id!,
          action: 'PRICE_TIER_CHOSEN',
          entity: 'inventoryItem',
          entityId: r.id,
          details: { sku: r.sku, oldTier: r.tier, newTier: pick },
        })),
      ],
    })
  }, { timeout: 60_000 })

  return NextResponse.json({ updated: changes.length, tierChanged: tierSets.length, changes })
}
