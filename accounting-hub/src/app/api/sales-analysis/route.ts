import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash', GCASH: 'GCash', PAYMAYA: 'PayMaya', PAYMONGO: 'PayMongo', DEBIT: 'Debit Card',
  CREDIT_CARD: 'Credit Card', VIP_CARD: 'VIP Card', PREPAID_CARD: 'Prepaid Card',
  REWARD_POINTS: 'Reward Points', SHOPEE: 'Shopee', LAZADA: 'Lazada',
  TIKTOK: 'TikTok', DOWNPAYMENT: 'Downpayment', PACKAGE: 'Package', ADVANCE: 'Advance',
  HMO: 'HMO', GL: 'Guarantee Letter',
}

const DEPT_LABELS: Record<string, string> = {
  PT: 'Physical Therapy', OT: 'Occupational Therapy', ST: 'Speech Therapy',
  SLP: 'Speech-Language Pathology', SPED: 'Special Education',
  PSY: 'Psychology', PSYCHOLOGY: 'Psychology', MD: 'Medical Doctor',
  CLI: 'Clinic', DIG: 'Digital & Tech', EDU: 'Training & Education',
  MER: 'Merchandise', ORTHOSIS_PROSTHESIS: 'Orthosis & Prosthesis', OTHER: 'Other',
}

const WALLET_LABELS: Record<string, string> = {
  PACKAGE: 'Package', VIP: 'VIP Card', PREPAID_CARD: 'Prepaid Card',
  DOWNPAYMENT: 'Downpayment', ADVANCE: 'Advance',
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
    const orders = await prisma.order.findMany({
      where,
      select: {
        subtotal: true,
        netAmount: true,
        items: {
          select: {
            lineTotal: true,
            service: { select: { department: true } },
            inventoryItem: { select: { skuDepartment: true } },
          },
        },
        payments: { select: { method: true, amount: true } },
      },
    })

    let grossSales = 0, netSales = 0
    const deptGross = new Map<string, number>()
    const payAmt = new Map<string, number>()

    for (const o of orders) {
      grossSales += Number(o.subtotal)
      netSales += Number(o.netAmount)
      for (const it of o.items) {
        const dept = it.service?.department || it.inventoryItem?.skuDepartment || 'OTHER'
        deptGross.set(dept, (deptGross.get(dept) || 0) + Number(it.lineTotal))
      }
      for (const p of o.payments) {
        payAmt.set(p.method, (payAmt.get(p.method) || 0) + Number(p.amount))
      }
    }

    // ── Unearned revenue: current digital-wallet balances, EXCLUDING HMO & GL
    //    (those are Accounts Receivable, not unearned revenue). Branch-scoped; current snapshot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wWhere: any = {
      isActive: true,
      balance: { gt: 0 },
      walletType: { notIn: ['HMO', 'GL'] },
    }
    if (branch && branch !== 'ALL') wWhere.branch = { in: [branch, 'ALL'] }
    const wallets = await prisma.digitalWallet.groupBy({
      by: ['walletType'],
      where: wWhere,
      _sum: { balance: true },
    })

    const round2 = (n: number) => Math.round(n * 100) / 100
    const pct = (part: number, total: number) => total > 0 ? round2((part / total) * 100) : 0

    const totalDept = [...deptGross.values()].reduce((a, b) => a + b, 0)
    const byDepartment = [...deptGross.entries()].map(([key, gross]) => ({
      key, label: DEPT_LABELS[key] || key, gross: round2(gross), pct: pct(gross, totalDept),
    })).sort((a, b) => b.gross - a.gross)

    const totalPay = [...payAmt.values()].reduce((a, b) => a + b, 0)
    const byPayment = [...payAmt.entries()].map(([method, amount]) => ({
      method, label: PAYMENT_LABELS[method] || method, amount: round2(amount), pct: pct(amount, totalPay),
    })).sort((a, b) => b.amount - a.amount)

    const unearnedRows = wallets.map(w => ({ walletType: w.walletType, amount: Number(w._sum.balance || 0) }))
    const totalUnearned = unearnedRows.reduce((a, w) => a + w.amount, 0)
    const unearnedRevenue = unearnedRows.map(w => ({
      walletType: w.walletType, label: WALLET_LABELS[w.walletType] || w.walletType,
      amount: round2(w.amount), pct: pct(w.amount, totalUnearned),
    })).sort((a, b) => b.amount - a.amount)

    return NextResponse.json({
      summary: { grossSales: round2(grossSales), netSales: round2(netSales), orderCount: orders.length },
      byDepartment,
      byPayment,
      unearnedRevenue,
      totalUnearned: round2(totalUnearned),
    })
  } catch (err) {
    console.error('Sales analysis error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
