/**
 * Tier 3 follow-up — backfill endpoint.
 *
 * For every existing operational record (Order, ARPayment, InventoryAdjustment,
 * Asset), call the corresponding posting helper to write a balanced JE if one
 * doesn't already exist. All four helpers are idempotent — they refuse to
 * double-post — so this endpoint is safe to run repeatedly.
 *
 *   POST /api/backfill/run
 *     body: {
 *       year?:   number    // restrict to a specific fiscal year (default: all)
 *       branch?: string    // 'ALL' | 'SANDBOX_EAST' | …
 *       only?:   string[]  // ['orders'|'ar'|'inventory'|'assets'] (default: all four);
 *                          // 'redate-reversals', 'paymongo-sales' and 'paymongo-relink'
 *                          // are maintenance buckets that run ONLY when named
 *                          // explicitly — see their blocks below
 *     }
 *
 * Required: ENABLE_GL_POSTING=true (otherwise the helpers no-op).
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postOrderJournal, reverseOrderJournal, orderGlNetCents } from '@/lib/accounting/post-order'
import { postARPaymentJournal } from '@/lib/accounting/post-ar-payment'
import { postInventoryAdjustmentJournal } from '@/lib/accounting/post-inventory-adjustment'
import { postAssetJournal } from '@/lib/accounting/post-asset'
import { postPaymongoSale, PAYMONGO_SALE_BENIGN_REASONS } from '@/lib/accounting/post-paymongo-sale'

const RUN_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

interface BackfillBucket {
  scanned: number
  posted: number
  alreadyPosted: number
  failed: number
  failures: { id: string; reason: string }[]
}
const newBucket = (): BackfillBucket => ({ scanned: 0, posted: 0, alreadyPosted: 0, failed: 0, failures: [] })

export async function POST(req: Request) {
  const session = await auth()
  // Internal ops trigger: same access tier as DB/VPS access (server-only secret), so the
  // backfill can be run server-side without a browser session. Posting is idempotent.
  const internalSecret = process.env.NEXTAUTH_SECRET
  const isInternal = !!internalSecret && req.headers.get('x-internal-secret') === internalSecret
  if (!isInternal && (!session?.user || !RUN_ROLES.includes(session.user.role as string))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  // Actor for createdById on posted entries: the session user, or an admin when internal.
  let actorId = session?.user?.id as string | undefined
  if (!actorId) {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })
    actorId = admin?.id
    if (!actorId) return NextResponse.json({ error: 'no admin user for internal backfill' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({})) as { year?: number; branch?: string; only?: string[]; orderIds?: string[]; dryRun?: boolean }
  const branch = body.branch || 'ALL'
  const orderIds = Array.isArray(body.orderIds) && body.orderIds.length ? body.orderIds : undefined
  // 'redate-reversals', 'paymongo-sales' and 'paymongo-relink' are maintenance-only and
  // never part of the default sweep.
  const only = new Set(body.only?.length ? body.only : ['orders', 'ar', 'inventory', 'assets'])
  const dryRun = body.dryRun === true

  const dateFilter: { gte?: Date; lt?: Date } = {}
  if (body.year) {
    dateFilter.gte = new Date(Date.UTC(body.year, 0, 1))
    dateFilter.lt  = new Date(Date.UTC(body.year + 1, 0, 1))
  }

  const result = {
    enabled: process.env.ENABLE_GL_POSTING === 'true',
    year: body.year, branch,
    orders:    newBucket(),
    ar:        newBucket(),
    inventory: newBucket(),
    assets:    newBucket(),
    'redate-reversals': newBucket(),
    'paymongo-sales':   newBucket(),
    'paymongo-relink':  newBucket(),
    dryRun,
  }

  /* ── PayMongo collections (opt-in; run BEFORE 'orders' in the same call) ─
     Every PAID live-mode payment link should carry a PAYMONGO_SALE collection
     entry (DR Clearing + Fees / CR 4050). The webhook posts it at payment time
     since this bucket was added; links paid before then only got one if someone
     pressed Sync on the PayMongo tab while the row was still PENDING locally —
     webhook-flipped links never did ("bucket B/D" in the 2026-09 analysis).
     postPaymongoSale is idempotent and refuses a link whose POS order already
     stands in cash form, so this is safe to repeat. Converted links that get
     their collection entry here are then posted by the 'orders' bucket as a
     4050 draw-down (postOrderJournal detects the entry), which is why the
     buckets run in this order when both are named. `dryRun: true` only counts. */
  if (only.has('paymongo-sales')) {
    const bucket = result['paymongo-sales']
    const links = await prisma.paymongoCheckout.findMany({
      where: {
        status: 'PAID', livemode: true,
        ...(Object.keys(dateFilter).length ? { paidAt: dateFilter } : {}),
        ...(branch !== 'ALL' ? { branch } : {}),
        ...(orderIds ? { orderId: { in: orderIds } } : {}),
      },
      select: { checkoutId: true, orderId: true },
      orderBy: { paidAt: 'asc' },
    })
    bucket.scanned = links.length
    const booked = new Set((links.length ? await prisma.journalEntry.findMany({
      where: { referenceType: 'PAYMONGO_SALE', referenceId: { in: links.map(l => l.checkoutId) } },
      select: { referenceId: true },
    }) : []).map(j => j.referenceId))
    for (const l of links) {
      if (booked.has(l.checkoutId)) { bucket.alreadyPosted++; continue }
      if (dryRun) {
        // Report what WOULD post. A linked order already standing in cash form is
        // what postPaymongoSale refuses — mirror that here without posting.
        bucket.failures.push({ id: l.checkoutId, reason: l.orderId ? 'would post (linked order — only if its sale does not already stand in cash form)' : 'would post' })
        continue
      }
      try {
        const r = await postPaymongoSale(prisma, { checkoutId: l.checkoutId, userId: actorId })
        if (r.posted) bucket.posted++
        else if (r.reason === 'already posted' || r.reason === 'posted via POS order') bucket.alreadyPosted++
        else {
          bucket.failed++
          if (r.reason && !(PAYMONGO_SALE_BENIGN_REASONS as readonly string[]).includes(r.reason)) bucket.failures.push({ id: l.checkoutId, reason: r.reason })
        }
      } catch (e) {
        bucket.failed++
        bucket.failures.push({ id: l.checkoutId, reason: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  /* ── Orders ─────────────────────────────────────────────────── */
  if (only.has('orders')) {
    const orders = await prisma.order.findMany({
      where: orderIds
        ? { id: { in: orderIds }, status: { not: 'VOIDED' } }
        : {
            status: 'COMPLETED',
            ...(Object.keys(dateFilter).length ? { transactionDate: dateFilter } : {}),
            ...(branch !== 'ALL' ? { branch: branch as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | 'VERDANA_STORE' | 'AURA_INSTITUTE' } : {}),
          },
      select: { id: true },
      orderBy: { transactionDate: 'asc' },
    })
    result.orders.scanned = orders.length
    for (const o of orders) {
      try {
        if (dryRun) {
          // Count only: an order whose GL net carries no sale is what a real run posts.
          if (await orderGlNetCents(prisma, o.id) <= 0) result.orders.failures.push({ id: o.id, reason: 'would post' })
          else result.orders.alreadyPosted++
          continue
        }
        const r = await postOrderJournal(prisma, o.id, actorId)
        if (r.posted)               result.orders.posted++
        else if (r.alreadyPosted)   result.orders.alreadyPosted++
        else {
          result.orders.failed++
          if (r.reason) result.orders.failures.push({ id: o.id, reason: r.reason })
        }
      } catch (e) {
        result.orders.failed++
        result.orders.failures.push({ id: o.id, reason: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  /* ── PayMongo relink (opt-in; one-time repair of "bucket A") ──────
     An order converted from a paid link whose sale was posted in CASH form
     (DR payment-mode account / CR revenue) while the link ALSO carries a
     PAYMONGO_SALE collection entry counts the cash twice and never draws
     4050 down. Now that postOrderJournal routes such a leg DR 4050, the
     repair is: reverse the standing cash-form forward, repost. The pair
     nets inside the original month (reversals are dated at the forward's
     entryDate), so only the cash/4050 split changes — revenue is untouched.
     Detection: the newest standing POS_ORDER forward has a PAYMONGO cash
     leg (an 'Online collection applied' line is what the fixed engine
     writes, so its absence on an order with a PAYMONGO leg and a collection
     entry means cash form). `dryRun: true` lists the orders without touching them. */
  if (only.has('paymongo-relink')) {
    const bucket = result['paymongo-relink']
    const links = await prisma.paymongoCheckout.findMany({
      where: {
        status: 'PAID', livemode: true, orderId: { not: null },
        ...(Object.keys(dateFilter).length ? { paidAt: dateFilter } : {}),
        ...(branch !== 'ALL' ? { branch } : {}),
        ...(orderIds ? { orderId: { in: orderIds } } : {}),
      },
      select: { checkoutId: true, orderId: true },
      orderBy: { paidAt: 'asc' },
    })
    const withSale = new Set((links.length ? await prisma.journalEntry.findMany({
      where: { referenceType: 'PAYMONGO_SALE', referenceId: { in: links.map(l => l.checkoutId) } },
      select: { referenceId: true },
    }) : []).map(j => j.referenceId))
    const candidates = links.filter(l => withSale.has(l.checkoutId))
    bucket.scanned = candidates.length
    for (const l of candidates) {
      const oid = l.orderId as string
      try {
        const order = await prisma.order.findUnique({ where: { id: oid }, select: { status: true, orderNumber: true, payments: { select: { method: true } } } })
        if (!order || order.status === 'VOIDED' || !order.payments.some(p => p.method === 'PAYMONGO')) { bucket.alreadyPosted++; continue }
        const forward = await prisma.journalEntry.findFirst({
          where: { referenceType: 'POS_ORDER', referenceId: oid },
          orderBy: { createdAt: 'desc' },
          select: { id: true, lines: { select: { description: true } } },
        })
        if (!forward) { bucket.alreadyPosted++; continue }   // nothing standing — the 'orders' bucket posts it right
        if (forward.lines.some(ln => (ln.description || '').startsWith('Online collection applied'))) { bucket.alreadyPosted++; continue }
        if (dryRun) { bucket.failures.push({ id: oid, reason: `would reverse + repost order #${order.orderNumber} (cash form → 4050 draw-down)` }); continue }
        const rev = await reverseOrderJournal(prisma, oid, actorId, 'PayMongo link relink — cash form → 4050 draw-down')
        if (!rev.posted && !rev.alreadyPosted) { bucket.failed++; bucket.failures.push({ id: oid, reason: `reverse: ${rev.reason}` }); continue }
        const re = await postOrderJournal(prisma, oid, actorId)
        if (re.posted) bucket.posted++
        else { bucket.failed++; bucket.failures.push({ id: oid, reason: `repost: ${re.reason || 'already posted'}` }) }
      } catch (e) {
        bucket.failed++
        bucket.failures.push({ id: oid, reason: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  /* ── AR Payments ────────────────────────────────────────────── */
  if (only.has('ar') && !dryRun) {
    const payments = await prisma.aRPayment.findMany({
      where: {
        ...(Object.keys(dateFilter).length ? { paymentDate: dateFilter } : {}),
        ...(branch !== 'ALL' ? { branch } : {}),
      },
      select: { id: true },
      orderBy: { paymentDate: 'asc' },
    })
    result.ar.scanned = payments.length
    for (const p of payments) {
      try {
        const r = await postARPaymentJournal(prisma, p.id, actorId)
        if (r.posted)               result.ar.posted++
        else if (r.alreadyPosted)   result.ar.alreadyPosted++
        else {
          result.ar.failed++
          if (r.reason) result.ar.failures.push({ id: p.id, reason: r.reason })
        }
      } catch (e) {
        result.ar.failed++
        result.ar.failures.push({ id: p.id, reason: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  /* ── Inventory Adjustments ──────────────────────────────────── */
  if (only.has('inventory') && !dryRun) {
    const adjustments = await prisma.inventoryAdjustment.findMany({
      where: {
        ...(Object.keys(dateFilter).length ? { adjustmentDate: dateFilter } : {}),
        ...(branch !== 'ALL' ? { item: { branch: branch as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | 'VERDANA_STORE' | 'AURA_INSTITUTE' } } : {}),
      },
      select: { id: true },
      orderBy: { adjustmentDate: 'asc' },
    })
    result.inventory.scanned = adjustments.length
    for (const adj of adjustments) {
      try {
        const r = await postInventoryAdjustmentJournal(prisma, adj.id, actorId)
        if (r.posted)               result.inventory.posted++
        else if (r.alreadyPosted)   result.inventory.alreadyPosted++
        else {
          result.inventory.failed++
          if (r.reason) result.inventory.failures.push({ id: adj.id, reason: r.reason })
        }
      } catch (e) {
        result.inventory.failed++
        result.inventory.failures.push({ id: adj.id, reason: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  /* ── Assets ─────────────────────────────────────────────────── */
  if (only.has('assets') && !dryRun) {
    const assets = await prisma.asset.findMany({
      where: {
        ...(Object.keys(dateFilter).length ? { dateBought: dateFilter } : {}),
        ...(branch !== 'ALL' ? { branch: branch as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | 'VERDANA_STORE' | 'AURA_INSTITUTE' } : {}),
      },
      select: { id: true },
      orderBy: { dateBought: 'asc' },
    })
    result.assets.scanned = assets.length
    for (const a of assets) {
      try {
        const r = await postAssetJournal(prisma, a.id, actorId)
        if (r.posted)               result.assets.posted++
        else if (r.alreadyPosted)   result.assets.alreadyPosted++
        else {
          result.assets.failed++
          if (r.reason) result.assets.failures.push({ id: a.id, reason: r.reason })
        }
      } catch (e) {
        result.assets.failed++
        result.assets.failures.push({ id: a.id, reason: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  /* ── Redate reversals (one-time maintenance; opt-in only) ─────
     Reversals used to be entry-dated at posting time ("now") while the
     re-completion repost lands back at the order's transactionDate, so the
     original month double-counted the sale and the reversal month went
     negative — the 2026-09-05..16 mass reopen wave (192+ orders) pushed GH
     September SPED and Psychology revenue below zero this way. New reversals
     are dated at the mirrored forward's entryDate since 667ca40e; this bucket
     pins each EXISTING reversal to the entryDate of the forward it mirrored:
     the newest POS_ORDER JE for the same order created before the reversal
     (exactly what reverseOrderJournal mirrored at posting time). Every
     forward/reversal pair then nets inside one month — year-to-date totals
     are unchanged by construction, and the reversal cash legs return beside
     their forwards, healing month-end bank positions too. Idempotent: a
     reversal already on its forward's date counts as alreadyPosted. */
  if (only.has('redate-reversals') && !dryRun) {
    const bucket = result['redate-reversals']
    const reversals = await prisma.journalEntry.findMany({
      where: {
        referenceType: 'POS_ORDER_REVERSAL',
        ...(orderIds ? { referenceId: { in: orderIds } } : {}),
        ...(Object.keys(dateFilter).length ? { entryDate: dateFilter } : {}),
        ...(branch !== 'ALL' ? { branch } : {}),
      },
      select: { id: true, referenceId: true, entryDate: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    bucket.scanned = reversals.length
    const refIds = [...new Set(reversals.map(r => r.referenceId).filter((x): x is string => !!x))]
    const forwards = refIds.length ? await prisma.journalEntry.findMany({
      where: { referenceType: 'POS_ORDER', referenceId: { in: refIds } },
      select: { referenceId: true, entryDate: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }) : []
    const forwardsByRef = new Map<string, { entryDate: Date; createdAt: Date }[]>()
    for (const f of forwards) {
      if (!f.referenceId) continue
      if (!forwardsByRef.has(f.referenceId)) forwardsByRef.set(f.referenceId, [])
      forwardsByRef.get(f.referenceId)!.push(f)
    }
    for (const r of reversals) {
      // The forward this reversal mirrored: newest one created before it.
      const mirrored = (r.referenceId ? forwardsByRef.get(r.referenceId) || [] : [])
        .filter(f => f.createdAt < r.createdAt)
        .pop()
      if (!mirrored) {
        bucket.failed++
        bucket.failures.push({ id: r.id, reason: 'no forward JE created before this reversal' })
        continue
      }
      if (mirrored.entryDate.getTime() === r.entryDate.getTime()) {
        bucket.alreadyPosted++
        continue
      }
      try {
        await prisma.journalEntry.update({ where: { id: r.id }, data: { entryDate: mirrored.entryDate } })
        bucket.posted++
      } catch (e) {
        bucket.failed++
        bucket.failures.push({ id: r.id, reason: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  // A dry run reads only — no audit row for a pass that changed nothing. (Only the
  // 'orders', 'paymongo-sales' and 'paymongo-relink' buckets have a counting mode;
  // the rest are skipped outright when dryRun is set.)
  if (!dryRun) await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: 'BACKFILL_GL',
      entity: 'journalEntry',
      details: {
        year: body.year ?? null, branch,
        ordersScanned:    result.orders.scanned,    ordersPosted:    result.orders.posted,    ordersAlready:    result.orders.alreadyPosted,    ordersFailed:    result.orders.failed,
        arScanned:        result.ar.scanned,        arPosted:        result.ar.posted,        arAlready:        result.ar.alreadyPosted,        arFailed:        result.ar.failed,
        inventoryScanned: result.inventory.scanned, inventoryPosted: result.inventory.posted, inventoryAlready: result.inventory.alreadyPosted, inventoryFailed: result.inventory.failed,
        assetsScanned:    result.assets.scanned,    assetsPosted:    result.assets.posted,    assetsAlready:    result.assets.alreadyPosted,    assetsFailed:    result.assets.failed,
        redateScanned:    result['redate-reversals'].scanned, redatePosted: result['redate-reversals'].posted, redateAlready: result['redate-reversals'].alreadyPosted, redateFailed: result['redate-reversals'].failed,
        pmSalesScanned:   result['paymongo-sales'].scanned,   pmSalesPosted:  result['paymongo-sales'].posted,  pmSalesAlready:  result['paymongo-sales'].alreadyPosted,  pmSalesFailed:  result['paymongo-sales'].failed,
        pmRelinkScanned:  result['paymongo-relink'].scanned,  pmRelinkPosted: result['paymongo-relink'].posted, pmRelinkAlready: result['paymongo-relink'].alreadyPosted, pmRelinkFailed: result['paymongo-relink'].failed,
        dryRun,
      },
    },
  })

  return NextResponse.json(result)
}
