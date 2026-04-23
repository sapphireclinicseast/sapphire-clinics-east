import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    const wallet = await prisma.digitalWallet.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, accountNumber: true, accountTitle: true } },
        packages: {
          orderBy: { createdAt: 'desc' },
          include: {
            logs: { orderBy: { createdAt: 'desc' } },
          },
        },
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    })

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    // For monetary wallets (VIP, PREPAID_CARD, DOWNPAYMENT, ADVANCE), build a
    // running-balance ledger from OrderPayments (debits), WalletPackage purchases
    // (credits), and VOID_REVERSAL logs (credits). Lets the user audit that
    // stored balance matches what the deductions add up to.
    const MONETARY_TYPES = ['VIP', 'PREPAID_CARD', 'DOWNPAYMENT', 'ADVANCE']
    const METHOD_BY_WALLET: Record<string, string> = {
      VIP: 'VIP_CARD',
      PREPAID_CARD: 'PREPAID_CARD',
      DOWNPAYMENT: 'DOWNPAYMENT',
      ADVANCE: 'ADVANCE',
    }

    if (MONETARY_TYPES.includes(wallet.walletType)) {
      const method = METHOD_BY_WALLET[wallet.walletType]

      const [payments, voidLogs] = await Promise.all([
        prisma.orderPayment.findMany({
          where: { walletId: id, ...(method ? { method: method as 'VIP_CARD' | 'PREPAID_CARD' | 'DOWNPAYMENT' | 'ADVANCE' } : {}) },
          include: {
            order: { select: { id: true, orderNumber: true, transactionDate: true, status: true, patientName: true } },
          },
        }),
        prisma.walletLog.findMany({
          where: { walletId: id, action: 'VOID_REVERSAL' },
          select: { id: true, createdAt: true, description: true },
        }),
      ])

      // WalletPackage purchases represent monetary loads for non-PACKAGE wallets
      const reloads = (wallet.packages || []).map(pkg => ({
        date: new Date(pkg.purchaseDate),
        type: 'RELOAD' as const,
        description: `Load: ${pkg.serviceName}${pkg.department ? ` (${pkg.department})` : ''}`,
        credit: Number(pkg.amountPaid),
        debit: 0,
        orderNumber: null as number | null,
        orderId: null as string | null,
        voided: false,
      }))

      const deductions = payments.map(p => ({
        date: new Date(p.order.transactionDate),
        type: 'DEDUCTION' as const,
        description: `Order #${p.order.orderNumber} · ${p.order.patientName || '—'}`,
        credit: 0,
        debit: Number(p.amount),
        orderNumber: p.order.orderNumber,
        orderId: p.order.id,
        voided: p.order.status === 'VOIDED',
      }))

      const reversals = voidLogs.map(log => {
        const m = log.description.match(/[\d,]+\.\d{1,2}/)
        const amount = m ? parseFloat(m[0].replace(/,/g, '')) : 0
        return {
          date: new Date(log.createdAt),
          type: 'VOID_REVERSAL' as const,
          description: log.description,
          credit: amount,
          debit: 0,
          orderNumber: null as number | null,
          orderId: null as string | null,
          voided: false,
        }
      })

      const ledger = [...reloads, ...deductions, ...reversals]
        .sort((a, b) => a.date.getTime() - b.date.getTime())

      let running = 0
      const enriched = ledger.map(entry => {
        const balanceBefore = running
        running += entry.credit - entry.debit
        return { ...entry, date: entry.date.toISOString(), balanceBefore, balanceAfter: running }
      })

      const computedEndingBalance = running
      const storedBalance = Number(wallet.balance)
      const ledgerDiscrepancy = Number((storedBalance - computedEndingBalance).toFixed(2))

      return NextResponse.json({ ...wallet, ledger: enriched, computedEndingBalance, ledgerDiscrepancy })
    }

    // For HMO wallets, balance is computed from unpaid orders (consumption-based AR).
    // For GL wallets, balance is now the manually-maintained 'Remaining Balance
    // (Usable Amount)' stored on the wallet itself — we keep returning unpaid
    // orders for the detail view, but do NOT override balance with computed.
    if (['HMO', 'GL'].includes(wallet.walletType)) {
      const orders = await prisma.order.findMany({
        where: {
          payments: { some: { walletId: id } },
          status: { not: 'VOIDED' },
          arPaymentItems: { none: {} },   // ← only unpaid orders
        },
        orderBy: { transactionDate: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          transactionDate: true,
          patientName: true,
          clinicianName: true,
          items: { select: { name: true } },
          payments: { select: { method: true, amount: true, walletId: true } },
          arPaymentItems: { select: { paymentId: true } },
        },
        take: 200,
      })
      if (wallet.walletType === 'HMO') {
        const computedBalance = orders.reduce((sum, o) => {
          const pay = o.payments.find(p => p.walletId === id)
          return sum + (pay ? Number(pay.amount) : 0)
        }, 0)
        return NextResponse.json({ ...wallet, balance: computedBalance, orders })
      }
      // GL: return stored balance as-is
      return NextResponse.json({ ...wallet, orders })
    }

    return NextResponse.json(wallet)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const { patientName, patientEmail, patientId, isActive, deleteReason, accountId,
            dateObtained, paymentModeId, agency, vipTier, attachmentUrl, balance, rewardPoints, totalGlAmount, branch } = body

    // Look up wallet type so we can protect HMO balance from manual edits.
    // GL now allows a manually-maintained 'Remaining Balance (Usable Amount)' that
    // represents how much of the Guarantee Letter approval is still consumable —
    // distinct from totalGlAmount (AR / what the agency owes us).
    const existing = await prisma.digitalWallet.findUnique({ where: { id }, select: { walletType: true } })
    const isBalanceReadOnly = existing?.walletType === 'HMO'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (patientName !== undefined) data.patientName = patientName.trim()
    if (patientEmail !== undefined) data.patientEmail = patientEmail?.trim() || null
    if (patientId !== undefined) data.patientId = patientId?.trim() || null
    if (isActive !== undefined) data.isActive = isActive
    if (accountId !== undefined) data.accountId = accountId || null
    if (dateObtained !== undefined) data.dateObtained = dateObtained ? new Date(dateObtained) : null
    if (paymentModeId !== undefined) data.paymentModeId = paymentModeId || null
    if (agency !== undefined) data.agency = agency?.trim() || null
    if (vipTier !== undefined) data.vipTier = vipTier || null
    if (attachmentUrl !== undefined) data.attachmentUrl = attachmentUrl || null
    // HMO balance is computed from unpaid POS orders — never allow manual edits.
    // VIP / PREPAID_CARD / DOWNPAYMENT / ADVANCE / PACKAGE / GL balances are user-maintained.
    if (balance !== undefined && !isBalanceReadOnly) data.balance = parseFloat(balance)
    if (rewardPoints !== undefined) data.rewardPoints = parseInt(rewardPoints) || 0
    if (totalGlAmount !== undefined) data.totalGlAmount = parseFloat(totalGlAmount) || null
    if (branch !== undefined) data.branch = branch || 'ALL'

    const wallet = await prisma.digitalWallet.update({ where: { id }, data })

    const action = isActive === false ? 'DELETE' : 'UPDATE'

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action,
        entity: 'digitalWallet',
        entityId: wallet.id,
        details: {
          updated: Object.keys(data),
          ...(deleteReason ? { deleteReason, patientName: wallet.patientName, walletType: wallet.walletType, balance: Number(wallet.balance) } : {}),
        },
      },
    })

    return NextResponse.json(wallet)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
