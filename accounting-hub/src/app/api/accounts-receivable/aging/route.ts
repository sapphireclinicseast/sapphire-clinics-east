/**
 * AR Aging & Days-Outstanding dashboard API
 *
 * Returns:
 *   - totalAR            sum of unpaid outstanding for every active wallet of this type
 *   - totalRevenue       netAmount total of COMPLETED orders in the window
 *   - arDaysOverall      (totalAR / totalRevenue) * periodDays  (DSO, days)
 *   - perWallet[]        per-HMO/-GL aging breakdown:
 *       { walletId, walletName, ar, revenue, arDays,
 *         aging:    { b0_30, b31_60, b61_90, b90plus },
 *         orderIdsByBucket: { b0_30:[id…], b31_60:[…], b61_90:[…], b90plus:[…] } }
 *
 * An unpaid order is one with `status != VOIDED` and no ARPayment applied.
 * Once a payment is recorded (the order appears in ARPaymentItem), it drops
 * out of the aging table — handled by the `arPaymentItems: { none: {} }`
 * filter on the orders query.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']
const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const type = (searchParams.get('type') || 'HMO') as 'HMO' | 'GL'
  const periodDays = Math.max(1, Number(searchParams.get('periodDays') || '90'))
  const branch = searchParams.get('branch') || ''

  try {
    const wallets = await prisma.digitalWallet.findMany({
      where: { walletType: type, isActive: true },
      select: { id: true, patientName: true },
      orderBy: { patientName: 'asc' },
    })
    const walletIds = wallets.map(w => w.id)
    if (walletIds.length === 0) {
      return NextResponse.json({ periodDays, totalAR: 0, totalRevenue: 0, totalAllDeptRevenue: 0, arDaysOverall: 0, perWallet: [] })
    }

    // Unpaid outstanding orders — no ARPayment has been applied yet
    const unpaidOrders = await prisma.order.findMany({
      where: {
        status: { not: 'VOIDED' },
        payments: { some: { walletId: { in: walletIds }, method: type } },
        arPaymentItems: { none: {} },
        ...(branch ? { branch } : {}),
      },
      select: {
        id: true,
        transactionDate: true,
        payments: { where: { method: type }, select: { walletId: true, amount: true } },
      },
    })

    // Period revenue (used to compute DSO). For each wallet: sum of amounts billed
    // to that wallet via OrderPayment for COMPLETED orders within the window.
    const now = new Date()
    const periodStart = new Date(now.getTime() - periodDays * DAY_MS)
    const periodPayments = await prisma.orderPayment.findMany({
      where: {
        walletId: { in: walletIds },
        method: type,
        order: {
          status: 'COMPLETED',
          transactionDate: { gte: periodStart, lte: now },
          ...(branch ? { branch } : {}),
        },
      },
      select: { walletId: true, amount: true, orderId: true },
    })
    const revenueByWallet = new Map<string, number>()
    for (const p of periodPayments) {
      if (!p.walletId) continue
      revenueByWallet.set(p.walletId, (revenueByWallet.get(p.walletId) || 0) + Number(p.amount))
    }
    const totalRevenue = [...revenueByWallet.values()].reduce((s, v) => s + v, 0)

    // All-department revenue: sum netAmount of ALL completed orders in period
    // whose departments appear in at least one HMO/GL order in the same period.
    // Step 1: find distinct departments from HMO/GL period orders
    const hmoOrderIds = periodPayments.map(p => p.orderId).filter(Boolean) as string[]

    // Get departments from order items of those HMO orders
    const hmoOrderItems = hmoOrderIds.length > 0 ? await prisma.orderItem.findMany({
      where: { orderId: { in: hmoOrderIds }, service: { isNot: null } },
      select: { service: { select: { department: true } } },
    }) : []
    const hmoDepts = new Set(hmoOrderItems.map(i => i.service?.department).filter(Boolean) as string[])

    // Step 2: Sum ALL completed orders in period from those departments
    let totalAllDeptRevenue = 0
    if (hmoDepts.size > 0) {
      const allDeptOrders = await prisma.order.findMany({
        where: {
          status: 'COMPLETED',
          transactionDate: { gte: periodStart, lte: now },
          ...(branch ? { branch } : {}),
          items: { some: { service: { department: { in: Array.from(hmoDepts) } } } },
        },
        select: { netAmount: true },
      })
      totalAllDeptRevenue = allDeptOrders.reduce((s, o) => s + Number(o.netAmount), 0)
    }

    // Aggregate AR + aging per wallet
    type Bucket = 'b0_30' | 'b31_60' | 'b61_90' | 'b90plus'
    type AgingRow = {
      b0_30: number; b31_60: number; b61_90: number; b90plus: number;
      orderIdsByBucket: Record<Bucket, string[]>;
      arTotal: number;
    }
    const agingByWallet = new Map<string, AgingRow>()
    for (const w of wallets) {
      agingByWallet.set(w.id, {
        b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0,
        orderIdsByBucket: { b0_30: [], b31_60: [], b61_90: [], b90plus: [] },
        arTotal: 0,
      })
    }

    for (const order of unpaidOrders) {
      const p = order.payments.find(pp => pp.walletId && agingByWallet.has(pp.walletId))
      if (!p || !p.walletId) continue
      const amount = Number(p.amount)
      const row = agingByWallet.get(p.walletId)!
      const ageDays = Math.floor((now.getTime() - new Date(order.transactionDate).getTime()) / DAY_MS)
      let bucket: Bucket
      if (ageDays <= 30) bucket = 'b0_30'
      else if (ageDays <= 60) bucket = 'b31_60'
      else if (ageDays <= 90) bucket = 'b61_90'
      else bucket = 'b90plus'
      row[bucket] += amount
      row.orderIdsByBucket[bucket].push(order.id)
      row.arTotal += amount
    }

    const totalAR = [...agingByWallet.values()].reduce((s, r) => s + r.arTotal, 0)
    const arDaysOverall = totalRevenue > 0 ? (totalAR / totalRevenue) * periodDays : 0

    const perWallet = wallets.map(w => {
      const aging = agingByWallet.get(w.id)!
      const ar = aging.arTotal
      const rev = revenueByWallet.get(w.id) || 0
      const arDays = rev > 0 ? (ar / rev) * periodDays : 0
      return {
        walletId: w.id,
        walletName: w.patientName,
        ar,
        revenue: rev,
        arDays,
        aging: { b0_30: aging.b0_30, b31_60: aging.b31_60, b61_90: aging.b61_90, b90plus: aging.b90plus },
        orderIdsByBucket: aging.orderIdsByBucket,
      }
    })

    return NextResponse.json({
      periodDays,
      totalAR,
      totalRevenue,
      totalAllDeptRevenue,
      arDaysOverall,
      perWallet,
    })
  } catch (err) {
    console.error('AR aging error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
