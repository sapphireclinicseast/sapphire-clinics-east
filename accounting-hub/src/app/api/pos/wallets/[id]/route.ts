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

      // First pass: compute balance from transactions only (starting at 0)
      // so we can derive the initial/starting balance
      let runningCheck = 0
      for (const entry of ledger) {
        runningCheck += entry.credit - entry.debit
      }
      const storedBalance = Number(wallet.balance)
      const initialBalance = Number((storedBalance - runningCheck).toFixed(2))

      // Build enriched ledger, prepending a "Starting Balance" row when > 0
      let running = 0
      const enriched: {
        date: string
        type: string
        description: string
        credit: number
        debit: number
        orderNumber: number | null
        orderId: string | null
        voided: boolean
        balanceBefore: number
        balanceAfter: number
      }[] = []

      if (initialBalance > 0.005) {
        // Prepend the opening/initial balance row using the wallet creation date
        enriched.push({
          date: wallet.createdAt.toISOString(),
          type: 'STARTING_BALANCE',
          description: 'Starting Balance',
          credit: initialBalance,
          debit: 0,
          orderNumber: null,
          orderId: null,
          voided: false,
          balanceBefore: 0,
          balanceAfter: initialBalance,
        })
        running = initialBalance
      }

      for (const entry of ledger) {
        const balanceBefore = running
        running += entry.credit - entry.debit
        enriched.push({ ...entry, date: entry.date.toISOString(), balanceBefore, balanceAfter: running })
      }

      return NextResponse.json({ ...wallet, ledger: enriched, initialBalance })
    }

    // For HMO wallets, balance is computed from unpaid orders (consumption-based AR).
    // For GL wallets, balance is the manually-maintained 'Remaining Balance (Usable Amount)'.
    // GL also gets a running-balance ledger so frontdesk can see how much has been consumed.
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

      // GL: build a running-balance ledger so frontdesk can see consumption
      const [glPayments, glVoidLogs] = await Promise.all([
        prisma.orderPayment.findMany({
          where: { walletId: id, method: 'GL' },
          include: {
            order: { select: { id: true, orderNumber: true, transactionDate: true, status: true, patientName: true } },
          },
        }),
        prisma.walletLog.findMany({
          where: { walletId: id, action: 'VOID_REVERSAL' },
          select: { id: true, createdAt: true, description: true },
        }),
      ])

      // Exclude voided-order payments — the balance was already restored on void,
      // and including them (without a matching VOID_REVERSAL log) would inflate
      // the derived starting balance.  Voided activity is still visible in the
      // Activity Logs section below.
      const glDeductions = glPayments
        .filter(p => p.order.status !== 'VOIDED')
        .map(p => ({
          date: new Date(p.order.transactionDate),
          type: 'DEDUCTION' as const,
          description: `Order #${p.order.orderNumber} · ${p.order.patientName || '—'}`,
          credit: 0,
          debit: Number(p.amount),
          orderNumber: p.order.orderNumber,
          orderId: p.order.id,
          voided: false,
        }))

      const glReversals = glVoidLogs.map(log => {
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

      const glLedger = [...glDeductions, ...glReversals]
        .sort((a, b) => a.date.getTime() - b.date.getTime())

      // Derive starting balance from stored balance and all transaction movements
      let glRunningCheck = 0
      for (const entry of glLedger) glRunningCheck += entry.credit - entry.debit
      const glStoredBalance = Number(wallet.balance)
      const glInitialBalance = Number((glStoredBalance - glRunningCheck).toFixed(2))

      let glRunning = 0
      const glEnriched: {
        date: string; type: string; description: string
        credit: number; debit: number; orderNumber: number | null
        orderId: string | null; voided: boolean
        balanceBefore: number; balanceAfter: number
      }[] = []

      if (glInitialBalance > 0.005) {
        glEnriched.push({
          date: wallet.createdAt.toISOString(),
          type: 'STARTING_BALANCE',
          description: 'Starting Balance',
          credit: glInitialBalance,
          debit: 0,
          orderNumber: null,
          orderId: null,
          voided: false,
          balanceBefore: 0,
          balanceAfter: glInitialBalance,
        })
        glRunning = glInitialBalance
      }

      for (const entry of glLedger) {
        const balanceBefore = glRunning
        glRunning += entry.credit - entry.debit
        glEnriched.push({ ...entry, date: entry.date.toISOString(), balanceBefore, balanceAfter: glRunning })
      }

      return NextResponse.json({ ...wallet, ledger: glEnriched, initialBalance: glInitialBalance, orders })
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
            dateObtained, paymentModeId, agency, approvedServices, vipTier, attachmentUrl, attachmentUrls, balance, rewardPoints, totalGlAmount, branch, soaStatus } = body

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
    if (approvedServices !== undefined) data.approvedServices = Array.isArray(approvedServices) && approvedServices.length > 0 ? approvedServices : null
    if (vipTier !== undefined) data.vipTier = vipTier || null
    if (attachmentUrl !== undefined) data.attachmentUrl = attachmentUrl || null
    if (attachmentUrls !== undefined) data.attachmentUrls = Array.isArray(attachmentUrls) && attachmentUrls.length > 0 ? attachmentUrls : null
    // HMO balance is computed from unpaid POS orders — never allow manual edits.
    // VIP / PREPAID_CARD / DOWNPAYMENT / ADVANCE / PACKAGE / GL balances are user-maintained.
    if (balance !== undefined && !isBalanceReadOnly) {
      const balNum = balance !== '' && balance !== null ? Number(balance) : 0
      data.balance = isNaN(balNum) ? 0 : balNum
    }
    if (rewardPoints !== undefined) data.rewardPoints = parseInt(rewardPoints) || 0
    if (totalGlAmount !== undefined) {
      // Use Number() instead of parseFloat()||null so that valid 0 values are preserved
      // and non-empty strings are properly coerced.
      const glNum = totalGlAmount !== '' && totalGlAmount !== null ? Number(totalGlAmount) : null
      data.totalGlAmount = glNum !== null && !isNaN(glNum) ? glNum : null
    }
    if (branch !== undefined) data.branch = branch || 'ALL'
    if (soaStatus !== undefined) data.soaStatus = soaStatus || 'With GL/No SOA'

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
