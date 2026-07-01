import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

// Human-readable labels for payment methods (matches drill-down/reports conventions)
const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash', GCASH: 'GCash', PAYMAYA: 'PayMaya', PAYMONGO: 'PayMongo',
  DEBIT: 'Debit Card', CREDIT_CARD: 'Credit Card', VIP_CARD: 'VIP Card',
  PREPAID_CARD: 'Prepaid Card', REWARD_POINTS: 'Reward Points', SHOPEE: 'Shopee',
  LAZADA: 'Lazada', TIKTOK: 'TikTok', DOWNPAYMENT: 'Downpayment', PACKAGE: 'Package',
  ADVANCE: 'Advance', HMO: 'HMO', GL: 'GL',
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
        items: {
          where: { inventoryItemId: { not: null } },
          select: { inventoryItemId: true, name: true, quantity: true, lineTotal: true, isFreeSample: true, returnedQuantity: true, refundAmount: true },
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

    for (const order of orders) {
      const orderGross = Number(order.subtotal)
      const discountRatio = orderGross > 0 ? Number(order.discountAmount) / orderGross : 0
      const hasProduct = order.items.length > 0
      const usesRewardPoints = order.payments.some(p => p.method === 'REWARD_POINTS')
      const platformKey = (order.platform && order.platform.trim()) || 'Unspecified'

      for (const item of order.items) {
        const id = item.inventoryItemId as string
        const qty = item.quantity

        if (item.isFreeSample) {
          const f = freeSamples.get(id) || { name: item.name, qty: 0 }
          f.qty += qty; f.name = item.name
          freeSamples.set(id, f)
          continue
        }

        const itemGross = Number(item.lineTotal)
        const itemNet = itemGross - itemGross * discountRatio
        const s = sold.get(id) || { id, name: item.name, units: 0, gross: 0, net: 0 }
        s.units += qty; s.gross += itemGross; s.net += itemNet; s.name = item.name
        sold.set(id, s)

        // Refunds: line lineTotal is the sold (net-of-return) amount; refundAmount is the
        // returned portion. Gross product sales = lineTotal + refundAmount.
        const ref = Number(item.refundAmount || 0)
        if (ref > 0 || (item.returnedQuantity || 0) > 0) {
          const rf = refunded.get(id) || { name: item.name, units: 0, amount: 0 }
          rf.units += item.returnedQuantity || 0; rf.amount += ref; rf.name = item.name
          refunded.set(id, rf)
        }
        platformUnits.set(platformKey, (platformUnits.get(platformKey) || 0) + qty)

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
    const grossWithReturns = totalGross + totalRefundAmount
    const grossUnitsWithReturns = unitsSold + totalReturnedUnits

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
      },
      fastMoving,
      slowMoving,
      noPurchase,
      topPlatforms,
      freeSamples: [...freeSamples.values()].sort((a, b) => b.qty - a.qty),
      rewardPoints: [...rewardBuys.values()].sort((a, b) => b.qty - a.qty),
      paymentModes: [...payModes.entries()]
        .map(([method, v]) => ({ method, label: PAYMENT_LABELS[method] || method, amount: round2(v.amount), count: v.count }))
        .sort((a, b) => b.amount - a.amount),
    })
  } catch (err) {
    console.error('Products analysis error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
