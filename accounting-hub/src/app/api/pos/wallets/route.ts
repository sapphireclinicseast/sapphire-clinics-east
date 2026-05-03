import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

const TYPE_PREFIX: Record<string, string> = {
  PACKAGE: 'P',
  VIP: 'V',
  PREPAID_CARD: 'R',
  DOWNPAYMENT: 'D',
  ADVANCE: 'A',
  HMO: 'H',
  GL: 'G',
}

function generateBarcode(walletType: string): string {
  const prefix = TYPE_PREFIX[walletType] || 'W'
  const digits = Math.floor(100000 + Math.random() * 900000).toString()
  return `SCEI-${prefix}-${digits}`
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)
  const search = searchParams.get('search') || ''
  const patientId = searchParams.get('patientId') || ''
  const walletType = searchParams.get('walletType') || ''
  const branch = searchParams.get('branch') || ''

  const includeDeleted = searchParams.get('includeDeleted') === 'true'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = includeDeleted ? {} : { isActive: true }

  if (walletType) {
    where.walletType = walletType
  }

  // Filter wallets by branch: show wallets matching user's branch OR wallets set to ALL
  if (branch && branch !== 'ALL') {
    where.branch = { in: [branch, 'ALL'] }
  }

  if (patientId) {
    where.patientId = patientId
  }

  if (search) {
    where.OR = [
      { patientName: { contains: search, mode: 'insensitive' } },
      { barcode: { contains: search, mode: 'insensitive' } },
      { patientEmail: { contains: search, mode: 'insensitive' } },
      { agency: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [wallets, total] = await Promise.all([
    prisma.digitalWallet.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        _count: { select: { packages: true } },
        ...(walletType === 'PACKAGE' ? { packages: { select: { id: true, department: true, serviceName: true, isActive: true, totalSessions: true, usedSessions: true, amountPaid: true }, orderBy: { createdAt: 'desc' as const } } } : {}),
      },
    }),
    prisma.digitalWallet.count({ where }),
  ])

  // For HMO wallets, override stored balance with outstanding consumption
  // (unpaid POS orders). GL balance is now manually maintained as the
  // 'Remaining Balance (Usable Amount)' — return it as stored.
  if (walletType === 'HMO') {
    const wIds = wallets.map(w => w.id)
    const unpaidPayments = await prisma.orderPayment.findMany({
      where: {
        walletId: { in: wIds },
        method: 'HMO',
        order: {
          status: { not: 'VOIDED' },
          arPaymentItems: { none: {} },
        },
      },
      select: { walletId: true, amount: true },
    })
    const outstandingMap = new Map<string, number>()
    for (const p of unpaidPayments) {
      if (!p.walletId) continue
      outstandingMap.set(p.walletId, (outstandingMap.get(p.walletId) || 0) + Number(p.amount))
    }
    return NextResponse.json(paginatedResult(
      wallets.map(w => ({ ...w, balance: outstandingMap.get(w.id) ?? 0 })),
      total,
      params,
    ))
  }

  return NextResponse.json(paginatedResult(wallets, total, params))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { patientId, patientName, patientEmail, walletType, accountId, dateObtained, paymentModeId, initialBalance, attachmentUrl, attachmentUrls, agency, initialRewardPoints, totalGlAmount, branch: walletBranch } = await req.json()

    if (!patientName?.trim()) {
      return NextResponse.json({ error: 'Patient name is required' }, { status: 400 })
    }

    if (!walletType || !TYPE_PREFIX[walletType]) {
      return NextResponse.json(
        { error: 'Valid walletType is required (PACKAGE, VIP, PREPAID_CARD, DOWNPAYMENT, ADVANCE)' },
        { status: 400 }
      )
    }

    // For GL wallets, auto-assign 1010 Accounts Receivable
    let resolvedAccountId = accountId || null
    if (walletType === 'GL' && !resolvedAccountId) {
      const arAccount = await prisma.account.findFirst({
        where: { accountNumber: '1010', isActive: true },
        select: { id: true },
      })
      if (arAccount) resolvedAccountId = arAccount.id
    }

    // Check for existing wallet with same patientId/name + walletType
    // SKIP for PACKAGE wallets — same patient can have multiple packages (OT, ST, etc.)
    const lookupId = patientId?.trim() || `${walletType}-${patientName.trim().replace(/\s+/g, '-').toUpperCase()}`
    if (walletType !== 'PACKAGE') {
      const existingWallet = await prisma.digitalWallet.findFirst({
        where: {
          patientId: lookupId,
          walletType,
          isActive: true,
        },
        include: {
          _count: { select: { packages: true } },
        },
      })

      if (existingWallet) {
        return NextResponse.json({
          ...existingWallet,
          existingWallet: true,
        })
      }
    }

    // Generate unique barcode (only for VIP and PREPAID_CARD — others use internal ID)
    const CARD_TYPES = ['VIP', 'PREPAID_CARD']
    let barcode: string
    if (CARD_TYPES.includes(walletType)) {
      barcode = generateBarcode(walletType)
      let attempts = 0
      while (attempts < 10) {
        const existing = await prisma.digitalWallet.findUnique({ where: { barcode } })
        if (!existing) break
        barcode = generateBarcode(walletType)
        attempts++
      }
    } else {
      // Non-card wallets get a simple internal reference (no printed barcode)
      const prefix = TYPE_PREFIX[walletType] || 'W'
      barcode = `SCEI-${prefix}-${Date.now().toString(36).toUpperCase()}`
    }

    const wallet = await prisma.digitalWallet.create({
      data: {
        barcode,
        walletType,
        patientId: patientId?.trim() || (walletType === 'PACKAGE'
          ? `${walletType}-${patientName.trim().replace(/\s+/g, '-').toUpperCase()}-${Date.now().toString(36)}`
          : `${walletType}-${patientName.trim().replace(/\s+/g, '-').toUpperCase()}`),
        patientName: patientName.trim(),
        patientEmail: patientEmail?.trim() || null,
        accountId: resolvedAccountId,
        dateObtained: dateObtained ? new Date(dateObtained) : null,
        paymentModeId: paymentModeId || null,
        // HMO balance is computed from unpaid orders — always starts at 0.
        // GL balance is manually maintained ('Remaining Balance (Usable Amount)') —
        // if an initialBalance was provided at creation, use it.
        balance: walletType === 'HMO' ? 0 : (initialBalance ? Number(initialBalance) : 0),
        rewardPoints: walletType === 'VIP' && initialRewardPoints ? Number(initialRewardPoints) : 0,
        attachmentUrl: attachmentUrl || null,
        attachmentUrls: Array.isArray(attachmentUrls) && attachmentUrls.length > 0 ? attachmentUrls : undefined,
        agency: walletType === 'GL' ? (agency?.trim() || null) : null,
        totalGlAmount: walletType === 'GL' && totalGlAmount ? Number(totalGlAmount) : null,
        branch: walletBranch || 'ALL',
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'digitalWallet',
        entityId: wallet.id,
        details: { patientName: wallet.patientName, barcode: wallet.barcode, walletType: wallet.walletType },
      },
    })

    return NextResponse.json(wallet, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
