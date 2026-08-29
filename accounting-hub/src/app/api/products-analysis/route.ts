import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { productSubtypeLabel } from '@/lib/sku-taxonomy'

const READ_ROLES = ['ADMIN', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// Human-readable labels for payment methods (matches drill-down/reports conventions)
const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash', GCASH: 'GCash', PAYMAYA: 'PayMaya', PAYMONGO: 'PayMongo',
  DEBIT: 'Debit Card', CREDIT_CARD: 'Credit Card', VIP_CARD: 'VIP Card',
  PREPAID_CARD: 'Prepaid Card', REWARD_POINTS: 'Reward Points', SHOPEE: 'Shopee',
  LAZADA: 'Lazada', TIKTOK: 'TikTok', DOWNPAYMENT: 'Downpayment', PACKAGE: 'Package',
  ADVANCE: 'Advance', HMO: 'HMO', GL: 'GL',
}

// TikTok orders that never became a sale (cancelled / failed-delivery), with TikTok's
// own reason — informational, no GL linkage. Only Verdana has these today (TikTok is
// Verdana-only), so an "all branches" or non-Verdana view returns null rather than a
// misleadingly-empty card. Dated by cancelledTime, which is null for the handful of
// failed-delivery rows TikTok hasn't formally cancelled yet — those fall outside any
// date filter, same as an order with no completion date would.
async function tiktokCancellationSummary(branch: string, dateFrom: string, dateTo: string, completedTiktokOrders: number) {
  if (branch && branch !== 'VERDANA_STORE') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { branch: 'VERDANA_STORE' }
  if (dateFrom || dateTo) {
    where.cancelledTime = {}
    if (dateFrom) where.cancelledTime.gte = new Date(`${dateFrom}T00:00:00+08:00`)
    if (dateTo) where.cancelledTime.lte = new Date(`${dateTo}T23:59:59.999+08:00`)
  }
  const rows = await prisma.tiktokCancellation.findMany({ where, select: { cancelReason: true, status: true, orderAmount: true } })
  if (rows.length === 0) return null
  const byReason = new Map<string, { reason: string; count: number; orderAmount: number }>()
  // Split the two underlying problems: a delivery that failed (whether or not
  // TikTok has formally auto-cancelled it yet) vs. a genuine cancellation
  // (buyer/seller/system before shipment).
  const isFailedDelivery = (r: { cancelReason: string | null; status: string }) =>
    r.cancelReason ? /delivery\s+failed|failed\s+delivery/i.test(r.cancelReason) : r.status !== 'Canceled'
  let cancelledOrders = 0, cancelledAmount = 0, failedDeliveryOrders = 0, failedDeliveryAmount = 0
  for (const r of rows) {
    const key = r.cancelReason || (r.status !== 'Canceled' ? 'Failed delivery — not yet formally cancelled' : 'Unknown')
    const cur = byReason.get(key) || { reason: key, count: 0, orderAmount: 0 }
    cur.count++
    cur.orderAmount += Number(r.orderAmount || 0)
    byReason.set(key, cur)
    if (isFailedDelivery(r)) { failedDeliveryOrders++; failedDeliveryAmount += Number(r.orderAmount || 0) }
    else { cancelledOrders++; cancelledAmount += Number(r.orderAmount || 0) }
  }
  // Rates are against ALL TikTok orders placed: completed sales in range + these
  // never-became-sales rows (they exist only here — the POS has no order for them).
  const allOrders = completedTiktokOrders + rows.length
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    total: rows.length,
    topReasons: [...byReason.values()].sort((a, b) => b.count - a.count),
    cancelledOrders,
    cancelledAmount: r2(cancelledAmount),
    failedDeliveryOrders,
    failedDeliveryAmount: r2(failedDeliveryAmount),
    completedOrders: completedTiktokOrders,
    cancelledPct: allOrders > 0 ? r2((cancelledOrders / allOrders) * 100) : 0,
    failedDeliveryPct: allOrders > 0 ? r2((failedDeliveryOrders / allOrders) * 100) : 0,
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes((session.user as { role?: string }).role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { status: { in: ['COMPLETED', 'REOPENED'] } }
  if (branch && branch !== 'ALL') where.branch = branch
  if (dateFrom) where.transactionDate = { ...where.transactionDate, gte: new Date(`${dateFrom}T00:00:00+08:00`) }
  if (dateTo) where.transactionDate = { ...where.transactionDate, lte: new Date(`${dateTo}T23:59:59.999+08:00`) }

  try {
    // Orders in range, with their PHYSICAL-PRODUCT line items (inventoryItemId set) + payments.
    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        subtotal: true,
        discountAmount: true,
        platform: true,
        transactionDate: true,
        items: {
          where: { inventoryItemId: { not: null } },
          select: {
            inventoryItemId: true, name: true, quantity: true, lineTotal: true,
            isFreeSample: true, returnedQuantity: true, refundAmount: true,
            // SKU classification for the monthly per-category breakdown, plus
            // sourceItemId so a branch consignment copy aggregates under its
            // pool item instead of appearing as a duplicate product row.
            inventoryItem: { select: { skuDepartment: true, skuCategory: true, sourceItemId: true } },
          },
        },
        payments: { select: { method: true, amount: true } },
      },
    })

    type Agg = { id: string; name: string; units: number; gross: number; net: number }
    const sold = new Map<string, Agg>()          // paid product sales (excludes free samples)
    const freeSamples = new Map<string, { name: string; qty: number }>()
    const rewardBuys = new Map<string, { name: string; qty: number }>()
    const payModes = new Map<string, { amount: number; count: number }>()
    const platformUnits = new Map<string, number>()   // product units purchased per sales channel
    const refunded = new Map<string, { name: string; units: number; amount: number }>()  // per-product refunds
    const platformRefund = new Map<string, { gross: number; grossUnits: number; refund: number; returnedUnits: number }>()  // refund rate per channel
    // Monthly product sales: overall per month + per SKU classification (Dept · Category) per month.
    const monthTotals = new Map<string, { units: number; gross: number; net: number }>()
    const classByMonth = new Map<string, Map<string, { units: number; gross: number; net: number }>>()  // label → month → totals

    for (const order of orders) {
      const orderGross = Number(order.subtotal)
      const discountRatio = orderGross > 0 ? Number(order.discountAmount) / orderGross : 0
      const hasProduct = order.items.length > 0
      const usesRewardPoints = order.payments.some(p => p.method === 'REWARD_POINTS')
      const platformKey = (order.platform && order.platform.trim()) || 'Unspecified'
      // Month bucket in clinic time (Asia/Manila), matching how the rest of the app dates orders.
      const monthKey = new Date(order.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7)

      for (const item of order.items) {
        // Branch consignment copies roll up under their pool item — same
        // product, different custody row — so tables don't show duplicates.
        const id = (item.inventoryItem?.sourceItemId || item.inventoryItemId) as string
        const qty = item.quantity

        if (item.isFreeSample) {
          const f = freeSamples.get(id) || { name: item.name, qty: 0 }
          f.qty += qty; f.name = item.name
          freeSamples.set(id, f)
          continue
        }

        // lineTotal = full gross sale (incl. returned units); refundAmount = returned portion.
        const itemGross = Number(item.lineTotal)
        const ref = Number(item.refundAmount || 0)
        const itemNet = itemGross - itemGross * discountRatio - ref   // net of discount AND refund
        const s = sold.get(id) || { id, name: item.name, units: 0, gross: 0, net: 0 }
        s.units += qty; s.gross += itemGross; s.net += itemNet; s.name = item.name
        sold.set(id, s)

        // ── Monthly rollups (paid sales only; free samples skipped above) ──
        const mt = monthTotals.get(monthKey) || { units: 0, gross: 0, net: 0 }
        mt.units += qty; mt.gross += itemGross; mt.net += itemNet
        monthTotals.set(monthKey, mt)

        const clsLabel = productSubtypeLabel(item.inventoryItem?.skuDepartment, item.inventoryItem?.skuCategory)
        if (!classByMonth.has(clsLabel)) classByMonth.set(clsLabel, new Map())
        const cm = classByMonth.get(clsLabel)!
        const cv = cm.get(monthKey) || { units: 0, gross: 0, net: 0 }
        cv.units += qty; cv.gross += itemGross; cv.net += itemNet
        cm.set(monthKey, cv)

        if (ref > 0 || (item.returnedQuantity || 0) > 0) {
          const rf = refunded.get(id) || { name: item.name, units: 0, amount: 0 }
          rf.units += item.returnedQuantity || 0; rf.amount += ref; rf.name = item.name
          refunded.set(id, rf)
        }
        platformUnits.set(platformKey, (platformUnits.get(platformKey) || 0) + qty)

        const pr = platformRefund.get(platformKey) || { gross: 0, grossUnits: 0, refund: 0, returnedUnits: 0 }
        pr.gross += itemGross; pr.grossUnits += qty; pr.refund += ref; pr.returnedUnits += (item.returnedQuantity || 0)
        platformRefund.set(platformKey, pr)

        if (usesRewardPoints) {
          const r = rewardBuys.get(id) || { name: item.name, qty: 0 }
          r.qty += qty; r.name = item.name
          rewardBuys.set(id, r)
        }
      }

      // Top modes of payment — scoped to orders that contain at least one physical product.
      if (hasProduct) {
        for (const p of order.payments) {
          const m = payModes.get(p.method) || { amount: 0, count: 0 }
          m.amount += Number(p.amount); m.count += 1
          payModes.set(p.method, m)
        }
      }
    }

    const soldList = [...sold.values()]
    const unitsSold = soldList.reduce((a, s) => a + s.units, 0)
    const totalGross = soldList.reduce((a, s) => a + s.gross, 0)
    const totalNet = soldList.reduce((a, s) => a + s.net, 0)

    // Refunds: rate = refunded ÷ overall product sales (gross-of-returns = sold gross + refunds).
    const refundList = [...refunded.values()]
    const totalRefundAmount = refundList.reduce((a, r) => a + r.amount, 0)
    const totalReturnedUnits = refundList.reduce((a, r) => a + r.units, 0)
    // lineTotal/quantity already include returned units → totals are gross-of-returns.
    const grossWithReturns = totalGross
    const grossUnitsWithReturns = unitsSold

    // Active product catalog (branch-scoped; include ALL-branch items) → for "no purchase" + canonical names.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catWhere: any = { isActive: true }
    if (branch && branch !== 'ALL') catWhere.branch = { in: [branch, 'ALL'] }
    const catalog = await prisma.inventoryItem.findMany({
      where: catWhere,
      select: { id: true, name: true, sku: true },
      orderBy: { name: 'asc' },
    })

    const round2 = (n: number) => Math.round(n * 100) / 100
    const skuById = new Map(catalog.map(c => [c.id, c.sku]))
    const withSku = (s: Agg) => ({ name: s.name, sku: skuById.get(s.id) || '', units: s.units, gross: round2(s.gross), net: round2(s.net) })

    const fastMoving = [...soldList].sort((a, b) => b.units - a.units || b.gross - a.gross).slice(0, 10).map(withSku)
    const slowMoving = [...soldList].sort((a, b) => a.units - b.units || a.gross - b.gross).slice(0, 10).map(withSku)
    const topByGross = [...soldList].sort((a, b) => b.gross - a.gross).slice(0, 10).map(withSku)
    const topByNet = [...soldList].sort((a, b) => b.net - a.net).slice(0, 10).map(withSku)

    // No-purchase list: one row per distinct product NAME (a product can have multiple catalog
    // rows — e.g. per branch/variant — which previously showed as duplicates). Exclude any name
    // that was sold under ANY of its rows.
    const soldNames = new Set(soldList.map(s => s.name.trim().toLowerCase()))
    const seenNames = new Set<string>()
    const noPurchase = catalog.filter(c => {
      const key = c.name.trim().toLowerCase()
      if (soldNames.has(key) || seenNames.has(key)) return false
      seenNames.add(key)
      return true
    }).map(c => ({ name: c.name, sku: c.sku }))

    const topPlatforms = [...platformUnits.entries()]
      .map(([platform, qty]) => ({ platform, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)

    // ── Monthly products sold: overall per month + a classification × month matrix ──
    const months = [...monthTotals.keys()].sort()
    const monthlySales = {
      months,
      totals: months.map(m => {
        const v = monthTotals.get(m)!
        return { month: m, units: v.units, gross: round2(v.gross), net: round2(v.net) }
      }),
      byClassification: [...classByMonth.entries()].map(([label, byMonth]) => {
        const perMonth: Record<string, number> = {}
        let units = 0, gross = 0, net = 0
        for (const m of months) {
          const v = byMonth.get(m)
          perMonth[m] = v?.units || 0
          units += v?.units || 0; gross += v?.gross || 0; net += v?.net || 0
        }
        return { label, unitsByMonth: perMonth, units, gross: round2(gross), net: round2(net) }
      }).sort((a, b) => b.units - a.units || a.label.localeCompare(b.label)),
    }

    return NextResponse.json({
      summary: {
        unitsSold,
        distinctProductsSold: soldList.length,
        totalGross: round2(totalGross),
        totalNet: round2(totalNet),
        avgGrossPerUnit: unitsSold > 0 ? round2(totalGross / unitsSold) : 0,
        avgNetPerUnit: unitsSold > 0 ? round2(totalNet / unitsSold) : 0,
      },
      refunds: {
        grossProductSales: round2(grossWithReturns),
        refundedAmount: round2(totalRefundAmount),
        returnedUnits: totalReturnedUnits,
        refundRateAmount: grossWithReturns > 0 ? round2((totalRefundAmount / grossWithReturns) * 100) : 0,
        refundRateUnits: grossUnitsWithReturns > 0 ? round2((totalReturnedUnits / grossUnitsWithReturns) * 100) : 0,
        topRefunded: [...refunded.entries()].map(([id, r]) => ({ name: r.name, sku: skuById.get(id) || '', units: r.units, amount: round2(r.amount) })).sort((a, b) => b.amount - a.amount).slice(0, 10),
        byPlatform: [...platformRefund.entries()].map(([platform, v]) => ({
          platform,
          grossProductSales: round2(v.gross),
          refundedAmount: round2(v.refund),
          returnedUnits: v.returnedUnits,
          refundRateAmount: v.gross > 0 ? round2((v.refund / v.gross) * 100) : 0,
          refundRateUnits: v.grossUnits > 0 ? round2((v.returnedUnits / v.grossUnits) * 100) : 0,
        })).sort((a, b) => b.grossProductSales - a.grossProductSales),
      },
      monthlySales,
      fastMoving,
      slowMoving,
      topByGross,
      topByNet,
      noPurchase,
      topPlatforms,
      freeSamples: [...freeSamples.values()].sort((a, b) => b.qty - a.qty),
      rewardPoints: [...rewardBuys.values()].sort((a, b) => b.qty - a.qty),
      paymentModes: [...payModes.entries()]
        .map(([method, v]) => ({ method, label: PAYMENT_LABELS[method] || method, amount: round2(v.amount), count: v.count }))
        .sort((a, b) => b.amount - a.amount),
      cancellations: await tiktokCancellationSummary(branch, dateFrom, dateTo,
        orders.filter(o => (o.platform || '').trim().toLowerCase() === 'tiktok').length),
    })
  } catch (err) {
    console.error('Products analysis error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
