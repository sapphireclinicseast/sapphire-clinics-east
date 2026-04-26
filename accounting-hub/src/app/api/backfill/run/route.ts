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
 *       only?:   string[]  // ['orders'|'ar'|'inventory'|'assets'] (default: all)
 *     }
 *
 * Required: ENABLE_GL_POSTING=true (otherwise the helpers no-op).
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postOrderJournal } from '@/lib/accounting/post-order'
import { postARPaymentJournal } from '@/lib/accounting/post-ar-payment'
import { postInventoryAdjustmentJournal } from '@/lib/accounting/post-inventory-adjustment'
import { postAssetJournal } from '@/lib/accounting/post-asset'

const RUN_ROLES = ['ADMIN', 'ACCOUNTANT']

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
  if (!session?.user || !RUN_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { year?: number; branch?: string; only?: string[] }
  const branch = body.branch || 'ALL'
  const only = new Set(body.only?.length ? body.only : ['orders', 'ar', 'inventory', 'assets'])

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
  }

  /* ── Orders ─────────────────────────────────────────────────── */
  if (only.has('orders')) {
    const orders = await prisma.order.findMany({
      where: {
        status: 'COMPLETED',
        ...(Object.keys(dateFilter).length ? { transactionDate: dateFilter } : {}),
        ...(branch !== 'ALL' ? { branch: branch as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | 'VERDANA_STORE' } : {}),
      },
      select: { id: true },
      orderBy: { transactionDate: 'asc' },
    })
    result.orders.scanned = orders.length
    for (const o of orders) {
      try {
        const r = await postOrderJournal(prisma, o.id, session.user.id)
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

  /* ── AR Payments ────────────────────────────────────────────── */
  if (only.has('ar')) {
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
        const r = await postARPaymentJournal(prisma, p.id, session.user.id)
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
  if (only.has('inventory')) {
    const adjustments = await prisma.inventoryAdjustment.findMany({
      where: {
        ...(Object.keys(dateFilter).length ? { adjustmentDate: dateFilter } : {}),
        ...(branch !== 'ALL' ? { item: { branch: branch as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | 'VERDANA_STORE' } } : {}),
      },
      select: { id: true },
      orderBy: { adjustmentDate: 'asc' },
    })
    result.inventory.scanned = adjustments.length
    for (const adj of adjustments) {
      try {
        const r = await postInventoryAdjustmentJournal(prisma, adj.id, session.user.id)
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
  if (only.has('assets')) {
    const assets = await prisma.asset.findMany({
      where: {
        ...(Object.keys(dateFilter).length ? { dateBought: dateFilter } : {}),
        ...(branch !== 'ALL' ? { branch: branch as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | 'VERDANA_STORE' } : {}),
      },
      select: { id: true },
      orderBy: { dateBought: 'asc' },
    })
    result.assets.scanned = assets.length
    for (const a of assets) {
      try {
        const r = await postAssetJournal(prisma, a.id, session.user.id)
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

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'BACKFILL_GL',
      entity: 'journalEntry',
      details: {
        year: body.year ?? null, branch,
        ordersScanned:    result.orders.scanned,    ordersPosted:    result.orders.posted,    ordersAlready:    result.orders.alreadyPosted,    ordersFailed:    result.orders.failed,
        arScanned:        result.ar.scanned,        arPosted:        result.ar.posted,        arAlready:        result.ar.alreadyPosted,        arFailed:        result.ar.failed,
        inventoryScanned: result.inventory.scanned, inventoryPosted: result.inventory.posted, inventoryAlready: result.inventory.alreadyPosted, inventoryFailed: result.inventory.failed,
        assetsScanned:    result.assets.scanned,    assetsPosted:    result.assets.posted,    assetsAlready:    result.assets.alreadyPosted,    assetsFailed:    result.assets.failed,
      },
    },
  })

  return NextResponse.json(result)
}
