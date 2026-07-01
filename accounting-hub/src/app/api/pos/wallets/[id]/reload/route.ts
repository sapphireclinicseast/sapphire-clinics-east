import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id } = await params
    const { serviceName, serviceId, department, totalSessions, amountPaid, expiresAt, usedSessions: usedSessionsRaw } = await req.json()
    const usedSessions = parseInt(usedSessionsRaw) || 0

    if (!serviceName?.trim()) {
      return NextResponse.json({ error: 'Service name is required' }, { status: 400 })
    }
    if (!totalSessions || totalSessions < 1) {
      return NextResponse.json({ error: 'Total sessions must be at least 1' }, { status: 400 })
    }
    if (!amountPaid || amountPaid <= 0) {
      return NextResponse.json({ error: 'Amount paid must be greater than 0' }, { status: 400 })
    }

    const wallet = await prisma.digitalWallet.findUnique({ where: { id } })
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    // Only VIP and PREPAID_CARD earn reward points
    const REWARD_ELIGIBLE = ['VIP', 'PREPAID_CARD']
    const rewardPointsEarned = REWARD_ELIGIBLE.includes(wallet.walletType) ? Math.floor(amountPaid / 100) : 0

    // For migrated packages, only add the remaining balance (not the full amount paid)
    const parsedTotal = parseInt(totalSessions)
    const remainingSessions = parsedTotal - usedSessions
    const perSessionRate = parseFloat(amountPaid) / parsedTotal
    const balanceToAdd = perSessionRate * remainingSessions

    const [walletPackage] = await prisma.$transaction([
      // Create the package (with usedSessions pre-set for migrations)
      prisma.walletPackage.create({
        data: {
          walletId: id,
          serviceName: serviceName.trim(),
          serviceId: serviceId || null,
          department: department || null,
          totalSessions: parsedTotal,
          usedSessions,
          amountPaid: parseFloat(amountPaid),
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      }),
      // Update balance (and reward points only for VIP/Prepaid)
      prisma.digitalWallet.update({
        where: { id },
        data: {
          ...(rewardPointsEarned > 0 ? { rewardPoints: { increment: rewardPointsEarned } } : {}),
          balance: { increment: balanceToAdd },
        },
      }),
    ])

    // Create wallet logs for RELOAD and REWARD_EARN
    await prisma.walletLog.create({
      data: {
        walletId: id,
        packageId: walletPackage.id,
        action: 'RELOAD',
        sessions: parsedTotal,
        description: usedSessions > 0
          ? `Package loaded: ${serviceName.trim()} (${parsedTotal} sessions, ${usedSessions} already used — balance +₱${balanceToAdd.toFixed(2)})`
          : `Package loaded: ${serviceName.trim()} (${parsedTotal} sessions)`,
        createdById: session.user.id,
      },
    })

    if (rewardPointsEarned > 0) {
      await prisma.walletLog.create({
        data: {
          walletId: id,
          packageId: walletPackage.id,
          action: 'REWARD_EARN',
          pointsChange: rewardPointsEarned,
          balanceBefore: wallet.rewardPoints,
          balanceAfter: wallet.rewardPoints + rewardPointsEarned,
          description: `Earned ${rewardPointsEarned} reward points from package reload`,
          createdById: session.user.id,
        },
      })
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'WALLET_RELOAD',
        entity: 'digitalWallet',
        entityId: id,
        details: {
          packageId: walletPackage.id,
          serviceName: serviceName.trim(),
          totalSessions,
          amountPaid,
          rewardPointsEarned,
        },
      },
    })

    return NextResponse.json(
      { package: walletPackage, rewardPointsEarned },
      { status: 201 }
    )
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
