import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'HMO' // HMO or GL
  const branch = searchParams.get('branch') || ''
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''
  const walletId = searchParams.get('walletId') || ''
  const sortField = searchParams.get('sortField') || 'transactionDate'
  const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'

  try {
    // Get all active HMO or GL wallets
    const wallets = await prisma.digitalWallet.findMany({
      where: { walletType: type as 'HMO' | 'GL', isActive: true },
      select: { id: true, patientName: true, balance: true, accountId: true,
        account: { select: { accountNumber: true, accountTitle: true } } },
      orderBy: { patientName: 'asc' },
    })

    // Build order filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentFilter: any = { method: type }
    if (walletId) paymentFilter.walletId = walletId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderWhere: any = {
      status: { not: 'VOIDED' },
      payments: { some: paymentFilter },
    }
    if (branch) orderWhere.branch = branch
    if (dateFrom || dateTo) {
      orderWhere.transactionDate = {}
      if (dateFrom) orderWhere.transactionDate.gte = new Date(dateFrom)
      if (dateTo) orderWhere.transactionDate.lte = new Date(dateTo + 'T23:59:59.999Z')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderBy: any = {}
    if (['transactionDate', 'patientName', 'netAmount'].includes(sortField)) {
      orderBy[sortField] = sortDir
    } else {
      orderBy.transactionDate = 'desc'
    }

    const orders = await prisma.order.findMany({
      where: orderWhere,
      orderBy,
      select: {
        id: true,
        orderNumber: true,
        transactionDate: true,
        patientName: true,
        clinicianName: true,
        branch: true,
        netAmount: true,
        items: { select: { name: true } },
        payments: {
          where: { method: type as 'HMO' | 'GL' },
          select: { amount: true, walletId: true },
        },
        arPaymentItems: {
          select: { paymentId: true },
        },
      },
      take: 500,
    })

    // ── Compute outstanding balance per wallet from actual unpaid orders ──
    // This is more reliable than the stored balance field which can drift
    // (e.g. voided orders whose reversal predates the void-handler code).
    const walletIds = wallets.map(w => w.id)
    const unpaidPayments = await prisma.orderPayment.findMany({
      where: {
        walletId: { in: walletIds },
        method: type as 'HMO' | 'GL',
        order: {
          status: { not: 'VOIDED' },
          arPaymentItems: { none: {} },
        },
      },
      select: { walletId: true, amount: true },
    })
    const outstandingByWallet = new Map<string, number>()
    for (const p of unpaidPayments) {
      if (!p.walletId) continue
      outstandingByWallet.set(p.walletId, (outstandingByWallet.get(p.walletId) || 0) + Number(p.amount))
    }
    // Override stored balance with the computed outstanding so cards and table always agree
    const walletsOut = wallets.map(w => ({ ...w, balance: outstandingByWallet.get(w.id) ?? 0 }))

    // Get AR payments for these wallets
    const arPayments = await prisma.aRPayment.findMany({
      where: {
        wallet: { walletType: type as 'HMO' | 'GL' },
        ...(walletId ? { walletId } : {}),
      },
      orderBy: { paymentDate: 'desc' },
      select: {
        id: true,
        walletId: true,
        paymentDate: true,
        amount: true,
        discount: true,
        proofUrl: true,
        notes: true,
        branch: true,
        cashAccountId: true,
        cashAccount: { select: { accountNumber: true, accountTitle: true } },
        createdBy: { select: { name: true } },
        items: { select: { orderId: true } },
      },
      take: 200,
    })

    return NextResponse.json({ wallets: walletsOut, orders, arPayments })
  } catch (err) {
    console.error('AR API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
