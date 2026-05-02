/**
 * GET /api/referrers/stats
 *
 * Returns per-doctor referral counts with service breakdown.
 * Query params: from, to (date strings), branch (e.g. SANDBOX_EAST)
 *
 * Response: [{ referrerId, referrerName, affiliation, specialization,
 *              totalReferrals, byService: [{ name, count }] }]
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const branch = searchParams.get('branch') || ''

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      referrerId: { not: null },
      status: { notIn: ['VOIDED'] },
    }
    if (from) where.transactionDate = { ...(where.transactionDate || {}), gte: new Date(from) }
    if (to) where.transactionDate = { ...(where.transactionDate || {}), lte: new Date(to + 'T23:59:59.999Z') }
    if (branch) where.branch = branch

    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        referrerId: true,
        referrer: { select: { id: true, name: true, affiliation: true, specialization: true } },
        items: { select: { name: true, quantity: true } },
      },
      orderBy: { transactionDate: 'desc' },
    })

    // Group by referrer
    const referrerMap = new Map<string, {
      referrerId: string
      referrerName: string
      affiliation: string | null
      specialization: string | null
      totalReferrals: number
      byService: Map<string, number>
    }>()

    for (const order of orders) {
      if (!order.referrerId || !order.referrer) continue
      if (!referrerMap.has(order.referrerId)) {
        referrerMap.set(order.referrerId, {
          referrerId: order.referrerId,
          referrerName: order.referrer.name,
          affiliation: order.referrer.affiliation,
          specialization: order.referrer.specialization,
          totalReferrals: 0,
          byService: new Map(),
        })
      }
      const entry = referrerMap.get(order.referrerId)!
      entry.totalReferrals += 1
      for (const item of order.items) {
        const qty = Number(item.quantity) || 1
        entry.byService.set(item.name, (entry.byService.get(item.name) || 0) + qty)
      }
    }

    const result = Array.from(referrerMap.values())
      .sort((a, b) => b.totalReferrals - a.totalReferrals)
      .map(r => ({
        referrerId: r.referrerId,
        referrerName: r.referrerName,
        affiliation: r.affiliation,
        specialization: r.specialization,
        totalReferrals: r.totalReferrals,
        byService: Array.from(r.byService.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count })),
      }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('Referrer stats error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
