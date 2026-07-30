import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

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
      select: { id: true, patientName: true, balance: true, totalGlAmount: true, accountId: true, approvedServices: true,
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
    if (branch) orderWhere.branch = { in: [branch, 'ALL'] }
    if (dateFrom || dateTo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rangeFilter: any = {}
      if (dateFrom) rangeFilter.gte = new Date(dateFrom)
      if (dateTo) rangeFilter.lte = new Date(dateTo + 'T23:59:59.999Z')
      // When arCustomDate is set it overrides transactionDate for period membership.
      // An order belongs to a period if:
      //   - it HAS a custom date AND that custom date falls in range, OR
      //   - it has NO custom date AND its transactionDate falls in range.
      orderWhere.OR = [
        { arCustomDate: { not: null, ...rangeFilter } },
        { arCustomDate: null, transactionDate: rangeFilter },
      ]
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
        patientId: true,
        transactionDate: true,
        arCustomDate: true,
        patientName: true,
        clinicianName: true,
        branch: true,
        netAmount: true,
        arProofUrl: true,
        createdBy: { select: { name: true } },
        items: { select: { name: true, service: { select: { department: true } } } },
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
    const [unpaidPayments, allConsumedPayments] = await Promise.all([
      prisma.orderPayment.findMany({
        where: {
          walletId: { in: walletIds },
          method: type as 'HMO' | 'GL',
          order: {
            status: { not: 'VOIDED' },
            arPaymentItems: { none: {} },
          },
        },
        select: { walletId: true, amount: true },
      }),
      // For GL: also compute TOTAL consumed (paid + unpaid) for the summary dashboard
      type === 'GL'
        ? prisma.orderPayment.findMany({
            where: {
              walletId: { in: walletIds },
              method: 'GL',
              order: { status: { not: 'VOIDED' } },
            },
            select: { walletId: true, amount: true },
          })
        : Promise.resolve([]),
    ])

    const outstandingByWallet = new Map<string, number>()
    for (const p of unpaidPayments) {
      if (!p.walletId) continue
      outstandingByWallet.set(p.walletId, (outstandingByWallet.get(p.walletId) || 0) + Number(p.amount))
    }
    const totalConsumedByWallet = new Map<string, number>()
    for (const p of allConsumedPayments) {
      if (!p.walletId) continue
      totalConsumedByWallet.set(p.walletId, (totalConsumedByWallet.get(p.walletId) || 0) + Number(p.amount))
    }

    // For HMO: balance = outstanding computed from unpaid orders (consumption-based AR).
    // For GL: balance = totalGlAmount (approved-amount AR) — government agencies pay the
    //   approved amount on the Guarantee Letter regardless of how much was consumed; the
    //   consumption-based number is still exposed as `consumedOutstanding` for reference.
    const walletsOut = wallets.map(w => {
      const ordersOutstanding = outstandingByWallet.get(w.id) ?? 0
      const totalConsumedAmount = totalConsumedByWallet.get(w.id) ?? 0
      const isGL = type === 'GL'
      const approved = w.totalGlAmount != null ? Number(w.totalGlAmount) : 0
      // For GL: consumed = totalGlAmount − remaining usable balance.
      // This captures zero-balance wallets (fully consumed) and partial consumption
      // (difference between approved SOA and remaining balance), independent of
      // whether individual orders have been tagged with an AR payment.
      // An agency Guarantee Letter with no approved amount is not a drawdown against
      // an authorisation — the Municipality of Cainta bills per session and settles
      // afterwards, exactly as an HMO does — so its receivable comes from the
      // sessions, and `perSession` lets the screen group those separately.
      const perSession = isGL && approved <= 0
      const consumedOutstanding = isGL && !perSession
        ? Math.max(0, approved - Number(w.balance))
        : ordersOutstanding
      return {
        ...w,
        perSession,
        balance: isGL && !perSession ? approved : ordersOutstanding,
        consumedOutstanding,
        totalGlAmount: approved,
        totalConsumedAmount,
      }
    })

    // Get AR payments for these wallets
    const arPayments = await prisma.aRPayment.findMany({
      where: {
        wallet: { walletType: type as 'HMO' | 'GL' },
        ...(walletId ? { walletId } : {}),
      },
      orderBy: { paymentDate: 'desc' },
      // The history is meant to show everything recorded, so the cap is a
      // runaway guard rather than a page size.
      take: 2000,
      select: {
        id: true,
        walletId: true,
        paymentDate: true,
        amount: true,
        discount: true,
        proofUrl: true,
        notes: true,
        salesInvoiceNumber: true,
        branch: true,
        cashAccountId: true,
        cashAccount: { select: { accountNumber: true, accountTitle: true } },
        createdBy: { select: { name: true } },
        items: { select: { orderId: true } },
      },
    })

    return NextResponse.json({ wallets: walletsOut, orders, arPayments })
  } catch (err) {
    console.error('AR API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
