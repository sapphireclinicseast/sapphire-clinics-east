/**
 * AR Aging & Days-Outstanding dashboard API
 *
 * Returns:
 *   - totalAR            GL: sum of (totalGlAmount - arPaid) per wallet
 *                        HMO: sum of unpaid outstanding order amounts
 *   - totalRevenue       netAmount total of COMPLETED orders in the window
 *   - arDaysOverall      (totalAR / totalRevenue) * periodDays  (DSO, days)
 *   - perWallet[]        per-HMO/-GL aging breakdown:
 *       { walletId, walletName, agency, ar, revenue, arDays,
 *         aging:    { b0_30, b31_60, b61_90, b90plus },
 *         orderIdsByBucket: { b0_30:[id…], b31_60:[…], b61_90:[…], b90plus:[…] } }
 *
 * GL wallets:
 *   - ar = totalGlAmount − sum(ARPayment.amount + ARPayment.discount)
 *   - The full net AR is placed in one bucket based on GL age (dateObtained or createdAt)
 *   - orderIdsByBucket contains all unpaid order IDs for drill-down reference
 *
 * HMO wallets:
 *   - ar = sum of unpaid order amounts (orders with no ARPaymentItem)
 *   - Aging buckets are order-date based
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']
const DAY_MS = 24 * 60 * 60 * 1000

type Bucket = 'b0_30' | 'b31_60' | 'b61_90' | 'b90plus'

function ageBucket(ageDays: number): Bucket {
  if (ageDays <= 30) return 'b0_30'
  if (ageDays <= 60) return 'b31_60'
  if (ageDays <= 90) return 'b61_90'
  return 'b90plus'
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const type = (searchParams.get('type') || 'HMO') as 'HMO' | 'GL'
  const periodDays = Math.max(1, Number(searchParams.get('periodDays') || '90'))
  const branch = searchParams.get('branch') || ''
  const isGL = type === 'GL'

  try {
    const wallets = await prisma.digitalWallet.findMany({
      where: { walletType: type, isActive: true },
      select: { id: true, patientName: true, totalGlAmount: true, agency: true, dateObtained: true, createdAt: true },
      orderBy: { patientName: 'asc' },
    })
    const walletIds = wallets.map(w => w.id)
    if (walletIds.length === 0) {
      return NextResponse.json({ periodDays, totalAR: 0, totalRevenue: 0, totalAllDeptRevenue: 0, arDaysOverall: 0, perWallet: [] })
    }

    // Unpaid orders — orders that have no ARPaymentItem applied
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

    // Period revenue: sum of amounts billed to each wallet for COMPLETED orders in window
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

    // All-department revenue (HMO-relevant departments)
    const hmoOrderIds = periodPayments.map(p => p.orderId).filter(Boolean) as string[]
    const hmoOrderItems = hmoOrderIds.length > 0 ? await prisma.orderItem.findMany({
      where: { orderId: { in: hmoOrderIds }, service: { isNot: null } },
      select: { service: { select: { department: true } } },
    }) : []
    const hmoDepts = new Set(hmoOrderItems.map(i => i.service?.department).filter(Boolean) as string[])
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

    // ── GL-specific: AR payments already received (amount + discount = total settled) ──
    const arPaidByWallet = new Map<string, number>()
    const allUnpaidIdsByWallet = new Map<string, string[]>()

    if (isGL) {
      const glArPayments = await prisma.aRPayment.findMany({
        where: { walletId: { in: walletIds } },
        select: { walletId: true, amount: true, discount: true },
      })
      for (const p of glArPayments) {
        if (!p.walletId) continue
        const settled = Number(p.amount) + Number(p.discount || 0)
        arPaidByWallet.set(p.walletId, (arPaidByWallet.get(p.walletId) || 0) + settled)
      }
      // Collect all unpaid order IDs per wallet (shown on drill-down click)
      for (const order of unpaidOrders) {
        const pay = order.payments.find(pp => pp.walletId && walletIds.includes(pp.walletId))
        if (!pay || !pay.walletId) continue
        const arr = allUnpaidIdsByWallet.get(pay.walletId) || []
        arr.push(order.id)
        allUnpaidIdsByWallet.set(pay.walletId, arr)
      }
    }

    // ── HMO-specific: aggregate order amounts into aging buckets ──
    type AgingRow = {
      b0_30: number; b31_60: number; b61_90: number; b90plus: number
      orderIdsByBucket: Record<Bucket, string[]>
      arTotal: number
    }
    const agingByWallet = new Map<string, AgingRow>()
    for (const w of wallets) {
      agingByWallet.set(w.id, {
        b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0,
        orderIdsByBucket: { b0_30: [], b31_60: [], b61_90: [], b90plus: [] },
        arTotal: 0,
      })
    }

    if (!isGL) {
      for (const order of unpaidOrders) {
        const p = order.payments.find(pp => pp.walletId && agingByWallet.has(pp.walletId))
        if (!p || !p.walletId) continue
        const amount = Number(p.amount)
        const row = agingByWallet.get(p.walletId)!
        const ageDays = Math.floor((now.getTime() - new Date(order.transactionDate).getTime()) / DAY_MS)
        const bucket = ageBucket(ageDays)
        row[bucket] += amount
        row.orderIdsByBucket[bucket].push(order.id)
        row.arTotal += amount
      }
    }

    // ── Build perWallet response ──
    const perWallet = wallets.map(w => {
      const rev = revenueByWallet.get(w.id) || 0

      if (isGL) {
        // GL: net AR = Approved SOA minus what's already been paid
        const approved = w.totalGlAmount != null ? Number(w.totalGlAmount) : 0
        const arPaid = arPaidByWallet.get(w.id) || 0
        const arNet = Math.max(0, approved - arPaid)

        // Place the entire net AR into one bucket based on GL age
        const refDate = w.dateObtained ? new Date(w.dateObtained) : new Date(w.createdAt)
        const ageDays = Math.floor((now.getTime() - refDate.getTime()) / DAY_MS)
        const glBucket = ageBucket(ageDays)

        const glAging: Record<Bucket, number> = { b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0 }
        const glOrderIds: Record<Bucket, string[]> = { b0_30: [], b31_60: [], b61_90: [], b90plus: [] }
        if (arNet > 0) {
          glAging[glBucket] = arNet
          glOrderIds[glBucket] = allUnpaidIdsByWallet.get(w.id) || []
        }

        const arDays = rev > 0 ? (arNet / rev) * periodDays : 0
        return {
          walletId: w.id,
          walletName: w.patientName,
          agency: w.agency || null,
          ar: arNet,
          revenue: rev,
          arDays,
          aging: glAging,
          orderIdsByBucket: glOrderIds,
        }
      }

      // HMO: order-based aging
      const aging = agingByWallet.get(w.id)!
      const ar = aging.arTotal
      const arDays = rev > 0 ? (ar / rev) * periodDays : 0
      return {
        walletId: w.id,
        walletName: w.patientName,
        agency: null,
        ar,
        revenue: rev,
        arDays,
        aging: { b0_30: aging.b0_30, b31_60: aging.b31_60, b61_90: aging.b61_90, b90plus: aging.b90plus },
        orderIdsByBucket: aging.orderIdsByBucket,
      }
    })

    const totalAR = isGL
      ? perWallet.reduce((s, w) => s + w.ar, 0)
      : perWallet.reduce((s, w) => s + w.ar, 0)

    const arDaysOverall = totalRevenue > 0 ? (totalAR / totalRevenue) * periodDays : 0

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
