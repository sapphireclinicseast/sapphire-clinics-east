/**
 * Verdana online store → hub orders.
 *
 * verdanarehab.com keeps its own order file and was never connected to the
 * books: paid web orders reached PayMongo (and later the bank) without a sale,
 * stock movement or cost ever being recorded here. This pulls the store's paid
 * orders and records each missing one as a Verdana "Website" POS order through
 * the POS route itself, so stock, FIFO cost and the order journal follow the
 * exact path a cashier's sale does.
 *
 * PayMongo is the source of truth for money — the store's own `amount` field
 * has been wrong (₱9,160 stored for a ₱13,280 charge) — so every order is
 * checked against its paid PayMongo payment before anything is written:
 * Σ items − discount + delivery must equal the charge.
 *
 * After the order posts, a companion entry (STORE_ORDER_PAYMONGO) brings the
 * PayMongo clearing up to the payment's actual NET: the delivery fee goes to
 * 7220 Other Income (same treatment as TikTok buyer-paid shipping) and any gap
 * between the payment mode's preset deduction and PayMongo's real fee goes to
 * 7140. The clearing then holds exactly what the payout will settle.
 *
 * Stock already counted out: if an inventory audit counted an item AFTER the
 * order was paid, the audit already removed those units from on-hand, so the
 * POS deduction is put back (an INCREASE lot, no ledger effect) — otherwise
 * a late-recorded order would take the same units off twice.
 *
 * Idempotent: an order is recorded once, keyed by the store order id in
 * Order.referenceNumber.
 */

import type { PrismaClient } from '@prisma/client'
import { retrieveCheckout } from '@/lib/paymongo'
import { postJournalEntry, type PostingLine } from '@/lib/accounting/posting'
import { POST as createPosOrder } from '@/app/api/pos/orders/route'

const STORE_ORDERS_URL = process.env.STORE_ORDERS_URL || 'https://verdanarehab.com/api/orders'
const SYNC_SECRET = process.env.STORE_SYNC_SECRET || process.env.WEIGHT_SYNC_SECRET || ''
// The store's first paid orders (July 2026) were never recorded anywhere.
const SYNC_FROM = new Date('2026-07-01T00:00:00+08:00')
const BRANCH = 'VERDANA_STORE'
const MODE_BY_SOURCE: Record<string, string> = {
  card: 'Paymongo - VER (Credit Card)',
  gcash: 'Paymongo - VER (Gcash)',
}
const FALLBACK_MODE = 'Paymongo - VER (QRPH)'
// Store listings since retired from the catalogue, so their product id no longer
// resolves to a SKU there (Hannah: Tangram pink = the Tangram set's PINK variant).
const RETIRED_LISTINGS: Record<string, { sku: string; variantSku?: string }> = {
  prod_tangram_puzzle_pink: { sku: 'OT-TOY-THP-014', variantSku: 'OT-TOY-THP-014-PINK' },
}

interface StoreOrder {
  id: string
  paymongoId?: string
  status?: string
  customerName?: string
  shippingFee?: number
  voucherCode?: string
  discountAmount?: number
  paidAt?: string
  items?: { productId?: string; title?: string; variantLabel?: string; variantSku?: string; quantity: number; price: number; sku?: string }[]
}

export interface StoreSyncResult { recorded: string[]; skipped: { id: string; reason: string }[]; error?: string }

const r2 = (n: number) => Math.round(n * 100) / 100
let running: Promise<StoreSyncResult> | null = null

/** Store orders as the store reports them (secret-authenticated). */
export async function fetchStoreOrders(): Promise<StoreOrder[]> {
  const res = await fetch(`${STORE_ORDERS_URL}?limit=1000`, {
    headers: SYNC_SECRET ? { 'x-sync-secret': SYNC_SECRET } : {},
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`store returned ${res.status}`)
  const json = await res.json()
  return Array.isArray(json?.orders) ? json.orders : []
}

/** One run at a time in this process — two triggers must not both record an order. */
export function syncStoreOrders(prisma: PrismaClient): Promise<StoreSyncResult> {
  if (!running) running = run(prisma).finally(() => { running = null })
  return running
}

async function run(prisma: PrismaClient): Promise<StoreSyncResult> {
  const out: StoreSyncResult = { recorded: [], skipped: [] }
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) return { ...out, error: 'NEXTAUTH_SECRET not set' }
  let orders: StoreOrder[]
  try { orders = await fetchStoreOrders() } catch (e) { return { ...out, error: e instanceof Error ? e.message : 'store unreachable' } }

  const [modes, otherIncome, mdr] = await Promise.all([
    prisma.paymentMode.findMany({ where: { name: { in: [...Object.values(MODE_BY_SOURCE), FALLBACK_MODE] } }, select: { id: true, name: true, accountId: true } }),
    prisma.account.findFirst({ where: { accountNumber: '7220' }, select: { id: true } }),
    prisma.account.findFirst({ where: { accountNumber: '7140' }, select: { id: true } }),
  ])
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (!otherIncome || !mdr || !admin) return { ...out, error: '7220/7140 account or admin user missing' }

  for (const o of orders) {
    const paidAt = o.paidAt ? new Date(o.paidAt) : null
    if (o.status !== 'paid' || !paidAt || paidAt < SYNC_FROM || !o.paymongoId?.startsWith('cs_')) continue
    const existing = await prisma.order.findFirst({
      where: { referenceNumber: o.id, branch: BRANCH as never, status: { not: 'VOIDED' as never } }, select: { id: true },
    })
    if (existing) continue
    try {
      const why = await recordOne(prisma, o, paidAt, secret, { modes, otherIncomeId: otherIncome.id, mdrId: mdr.id, adminId: admin.id })
      if (why) out.skipped.push({ id: o.id, reason: why })
      else out.recorded.push(o.id)
    } catch (e) {
      console.error('[STORE SYNC] order', o.id, 'failed:', e)
      out.skipped.push({ id: o.id, reason: e instanceof Error ? e.message : 'failed' })
    }
  }
  if (out.recorded.length || out.skipped.length) console.log('[STORE SYNC]', JSON.stringify(out))
  return out
}

/** Records one store order; returns a reason string when it has to be skipped. */
async function recordOne(
  prisma: PrismaClient, o: StoreOrder, paidAt: Date, secret: string,
  ctx: { modes: { id: string; name: string; accountId: string | null }[]; otherIncomeId: string; mdrId: string; adminId: string },
): Promise<string | null> {
  // ── PayMongo: the paid payment behind this checkout ──
  const cs = await retrieveCheckout('VERDANA', o.paymongoId!)
  const payments = (cs?.attributes?.payments || []) as { id: string; attributes: Record<string, unknown> }[]
  const pay = payments.find(p => p.attributes?.status === 'paid')
  if (!pay) return 'no paid PayMongo payment on the checkout'
  const charged = r2(Number(pay.attributes.amount || 0) / 100)
  const actualNet = r2(Number(pay.attributes.net_amount || 0) / 100)
  const source = String((pay.attributes.source as { type?: string } | undefined)?.type || '')

  // ── Items → Verdana inventory by SKU (the store keeps the hub SKU) ──
  const storeItems = o.items || []
  if (!storeItems.length) return 'order has no items'
  const lines: { inventoryItemId: string; name: string; quantity: number; unitPrice: number; lineTotal: number; variantId?: string; variantLabel?: string }[] = []
  const unmatched: string[] = []
  for (const it of storeItems) {
    const retired = it.productId ? RETIRED_LISTINGS[it.productId] : undefined
    const sku = (it.sku || '').trim() || retired?.sku || await skuFromStoreProduct(it.productId)
    const item = sku ? await prisma.inventoryItem.findFirst({
      where: { sku, branch: BRANCH as never, isActive: true }, select: { id: true, name: true },
    }) : null
    if (!item) { unmatched.push(`${it.title || it.productId} (${sku || 'no SKU'})`); continue }
    const variantSku = it.variantSku || retired?.variantSku
    const variant = variantSku ? await prisma.inventoryVariant.findFirst({
      where: { itemId: item.id, variantSku }, select: { id: true, variantLabel: true },
    }) : null
    const qty = Number(it.quantity) || 0
    const price = r2(Number(it.price) || 0)
    lines.push({
      inventoryItemId: item.id, name: item.name, quantity: qty, unitPrice: price, lineTotal: r2(qty * price),
      ...(variant ? { variantId: variant.id, variantLabel: variant.variantLabel } : it.variantLabel ? { variantLabel: it.variantLabel } : {}),
    })
  }
  if (unmatched.length) return `no Verdana inventory item for ${unmatched.join(', ')}`

  const subtotal = r2(lines.reduce((s, l) => s + l.lineTotal, 0))
  const discount = r2(Number(o.discountAmount || 0))
  const shipping = r2(Number(o.shippingFee || 0))
  const net = r2(subtotal - discount)
  if (Math.abs(net + shipping - charged) > 1) {
    return `amounts disagree with PayMongo: items ₱${subtotal} − discount ₱${discount} + delivery ₱${shipping} ≠ charged ₱${charged}`
  }
  const mode = ctx.modes.find(m => m.name === (MODE_BY_SOURCE[source] || FALLBACK_MODE))
  if (!mode?.accountId) return `payment mode for "${source}" is not set up with a clearing account`

  // ── Stock before, so a deduction already counted out by an audit can be put back ──
  const touched = await touchedItems(prisma, lines.map(l => l.inventoryItemId))
  const before = await quantities(prisma, touched)

  const body = {
    orderType: 'PRODUCT', branch: BRANCH, platform: 'Website', revenueType: 'EARNED',
    transactionDate: paidAt.toISOString(),
    patientName: (o.customerName || 'ONLINE CUSTOMER').toUpperCase(),
    referenceNumber: o.id,
    notes: `Verdana online store order ${o.id} — PayMongo ${pay.id} (${source || 'unknown'}), charged ₱${charged.toFixed(2)}${shipping ? ` incl. ₱${shipping.toFixed(2)} delivery` : ''}. Recorded automatically by the store sync.`,
    ...(discount > 0 ? { discountType: 'CUSTOM', discountAmount: discount, discountLabel: `Website voucher${o.voucherCode ? ` ${o.voucherCode}` : ''}` } : {}),
    items: lines,
    payments: [{ method: 'PAYMONGO', amount: net, paymentModeId: mode.id, reference: pay.id }],
  }
  const res = await createPosOrder(new Request('http://internal/api/pos/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify(body),
  }))
  const created = await res.json().catch(() => ({}))
  if (res.status !== 201 || !created?.id) return `POS rejected the order: ${created?.error || res.status}`

  // ── Clearing up to PayMongo's actual net (delivery → 7220, fee gap → 7140) ──
  const clearing = await prisma.journalEntryLine.aggregate({
    where: { accountId: mode.accountId, journalEntry: { referenceType: 'POS_ORDER', referenceId: created.id } },
    _sum: { debit: true, credit: true },
  })
  const booked = r2(Number(clearing._sum.debit || 0) - Number(clearing._sum.credit || 0))
  const toClearing = r2(actualNet - booked)
  const feeGap = r2(shipping - toClearing)
  const adj: PostingLine[] = []
  if (toClearing > 0.005) adj.push({ accountId: mode.accountId, debit: toClearing, description: 'PayMongo clearing up to the payment net' })
  if (toClearing < -0.005) adj.push({ accountId: mode.accountId, credit: -toClearing, description: 'PayMongo clearing down to the payment net' })
  if (shipping > 0.005) adj.push({ accountId: ctx.otherIncomeId, credit: shipping, description: 'Delivery fee charged to the online customer' })
  if (feeGap > 0.005) adj.push({ accountId: ctx.mdrId, debit: feeGap, description: 'PayMongo fee above the payment mode preset' })
  if (feeGap < -0.005) adj.push({ accountId: ctx.mdrId, credit: -feeGap, description: 'PayMongo fee below the payment mode preset' })
  if (adj.length >= 2 && booked !== 0) {
    await postJournalEntry(prisma, {
      entryDate: paidAt,
      description: `Online order ${o.id} (POS #${created.orderNumber ?? ''}) — PayMongo net ₱${actualNet.toFixed(2)} vs booked ₱${booked.toFixed(2)}${shipping ? `, delivery ₱${shipping.toFixed(2)}` : ''}`,
      referenceType: 'STORE_ORDER_PAYMONGO',
      referenceId: o.id,
      branch: BRANCH,
      createdById: ctx.adminId,
      lines: adj,
    })
  }

  // ── Put back units an audit after the sale already counted out ──
  const after = await quantities(prisma, touched)
  for (const id of touched.items) {
    const delta = (before.items.get(id) ?? 0) - (after.items.get(id) ?? 0)
    if (delta <= 0) continue
    // An audit count, or a hand correction of the count on the item form, after
    // the sale already reflects the units having left.
    const audit = await prisma.inventoryAdjustment.findFirst({
      where: {
        itemId: id, adjustmentDate: { gt: paidAt },
        OR: [{ countedQuantity: { not: null } }, { remarks: 'Quantity edited via item form' }],
      },
      select: { adjustmentDate: true }, orderBy: { adjustmentDate: 'asc' },
    })
    if (!audit) continue
    const item = await prisma.inventoryItem.findUnique({ where: { id }, select: { quantity: true, unitCost: true } })
    if (!item) continue
    await prisma.inventoryAdjustment.create({
      data: {
        itemId: id, type: 'INCREASE', quantityChange: delta,
        previousQuantity: item.quantity, newQuantity: item.quantity + delta,
        remainingQuantity: delta, localCost: Number(item.unitCost || 0),
        adjustmentDate: new Date(),
        remarks: `Online order ${o.id} recorded late — the ${audit.adjustmentDate.toISOString().slice(0, 10)} count already took these units out`,
        adjustedById: ctx.adminId,
      },
    })
    await prisma.inventoryItem.update({ where: { id }, data: { quantity: { increment: delta } } })
    for (const v of touched.variants.filter(x => x.itemId === id)) {
      const vd = (before.variants.get(v.id) ?? 0) - (after.variants.get(v.id) ?? 0)
      if (vd > 0) await prisma.inventoryVariant.update({ where: { id: v.id }, data: { quantity: { increment: vd } } })
    }
  }
  return null
}

// Items a POS sale of these lines can move: the lines themselves plus any
// bundle's components, and their variants.
async function touchedItems(prisma: PrismaClient, itemIds: string[]) {
  const comps = await prisma.bundleComponent.findMany({ where: { bundleId: { in: itemIds } }, select: { componentId: true } })
  const items = [...new Set([...itemIds, ...comps.map(c => c.componentId)])]
  const variants = await prisma.inventoryVariant.findMany({ where: { itemId: { in: items } }, select: { id: true, itemId: true } })
  return { items, variants }
}

async function quantities(prisma: PrismaClient, t: { items: string[]; variants: { id: string }[] }) {
  const [items, variants] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { id: { in: t.items } }, select: { id: true, quantity: true } }),
    prisma.inventoryVariant.findMany({ where: { id: { in: t.variants.map(v => v.id) } }, select: { id: true, quantity: true } }),
  ])
  return { items: new Map(items.map(i => [i.id, i.quantity])), variants: new Map(variants.map(v => [v.id, v.quantity])) }
}

// Older store orders don't carry the SKU on the line; the product id does map to
// it through the store catalogue, which the store serves alongside its orders.
const catalogue = new Map<string, string>()
async function skuFromStoreProduct(productId?: string): Promise<string> {
  if (!productId) return ''
  if (!catalogue.size) {
    try {
      const res = await fetch(STORE_ORDERS_URL.replace(/\/orders$/, '/products'), {
        headers: SYNC_SECRET ? { 'x-sync-secret': SYNC_SECRET } : {}, cache: 'no-store', signal: AbortSignal.timeout(15_000),
      })
      const json = res.ok ? await res.json() : null
      const list = Array.isArray(json) ? json : (json?.products || [])
      for (const p of list as { id?: string; sku?: string }[]) if (p.id && p.sku) catalogue.set(p.id, p.sku)
    } catch { /* falls through to "no SKU" */ }
  }
  return catalogue.get(productId) || ''
}
