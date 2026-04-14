import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

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
    const body = await req.json()

    const wallet = await prisma.digitalWallet.findUnique({ where: { id } })
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    // Mode 1: Monetary deduction (amount-based, for VIP/Prepaid card usage)
    if (body.amount !== undefined) {
      const amount = parseFloat(body.amount)
      if (amount <= 0) {
        return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
      }

      const currentBalance = Number(wallet.balance)
      if (amount > currentBalance) {
        return NextResponse.json(
          { error: `Insufficient balance. Current: ${currentBalance.toFixed(2)}, Requested: ${amount.toFixed(2)}` },
          { status: 400 }
        )
      }

      const updated = await prisma.digitalWallet.update({
        where: { id },
        data: { balance: { decrement: amount } },
      })

      await prisma.walletLog.create({
        data: {
          walletId: id,
          action: 'DEDUCTION',
          description: body.description || `Balance deduction: ${amount.toFixed(2)}`,
          createdById: session.user.id,
        },
      })

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'WALLET_DEDUCT',
          entity: 'digitalWallet',
          entityId: id,
          details: {
            type: 'monetary',
            amountDeducted: amount,
            previousBalance: currentBalance,
            newBalance: Number(updated.balance),
            orderId: body.orderId || null,
          },
        },
      })

      return NextResponse.json({
        balance: Number(updated.balance),
        amountDeducted: amount,
      })
    }

    // Mode 2: Reward points deduction
    if (body.rewardPoints !== undefined) {
      const points = parseInt(body.rewardPoints)
      if (points <= 0) {
        return NextResponse.json({ error: 'Points must be greater than 0' }, { status: 400 })
      }

      if (wallet.rewardPoints < points) {
        return NextResponse.json(
          { error: `Insufficient reward points. Current: ${wallet.rewardPoints}, Requested: ${points}` },
          { status: 400 }
        )
      }

      const updated = await prisma.digitalWallet.update({
        where: { id },
        data: { rewardPoints: { decrement: points } },
      })

      await prisma.walletLog.create({
        data: {
          walletId: id,
          action: 'REWARD_SPEND',
          pointsChange: -points,
          balanceBefore: wallet.rewardPoints,
          balanceAfter: updated.rewardPoints,
          description: body.description || `Spent ${points} reward points`,
          createdById: session.user.id,
        },
      })

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'WALLET_REWARD_SPEND',
          entity: 'digitalWallet',
          entityId: id,
          details: {
            type: 'reward_points',
            pointsDeducted: points,
            previousPoints: wallet.rewardPoints,
            newPoints: updated.rewardPoints,
            orderId: body.orderId || null,
          },
        },
      })

      return NextResponse.json({
        rewardPoints: updated.rewardPoints,
        pointsDeducted: points,
      })
    }

    // Mode 3: Session deduction (package-based)
    const { packageId, sessions = 1 } = body

    if (!packageId) {
      return NextResponse.json({ error: 'Package ID, amount, or rewardPoints is required' }, { status: 400 })
    }

    const walletPackage = await prisma.walletPackage.findUnique({ where: { id: packageId } })
    if (!walletPackage) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }
    if (walletPackage.walletId !== id) {
      return NextResponse.json({ error: 'Package does not belong to this wallet' }, { status: 400 })
    }

    const sessionsToDeduct = parseInt(sessions) || 1
    const remainingSessions = walletPackage.totalSessions - walletPackage.usedSessions
    if (sessionsToDeduct > remainingSessions) {
      return NextResponse.json(
        { error: `Only ${remainingSessions} session(s) remaining` },
        { status: 400 }
      )
    }

    if (walletPackage.expiresAt && new Date(walletPackage.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Package has expired' }, { status: 400 })
    }

    // Calculate per-session rate from package purchase price
    const perSessionRate = Number(walletPackage.amountPaid) / walletPackage.totalSessions
    const deductionAmount = perSessionRate * sessionsToDeduct
    const currentBalance = Number(wallet.balance)

    const [updatedPackage, updatedWallet] = await prisma.$transaction([
      prisma.walletPackage.update({
        where: { id: packageId },
        data: { usedSessions: { increment: sessionsToDeduct } },
      }),
      prisma.digitalWallet.update({
        where: { id },
        data: { balance: { decrement: deductionAmount } },
      }),
    ])

    await prisma.walletLog.create({
      data: {
        walletId: id,
        packageId,
        action: 'DEDUCTION',
        sessions: sessionsToDeduct,
        description: `Deducted ${sessionsToDeduct} session(s) from ${walletPackage.serviceName} — ₱${deductionAmount.toFixed(2)} (₱${perSessionRate.toFixed(2)}/session)`,
        createdById: session.user.id,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'WALLET_DEDUCT',
        entity: 'digitalWallet',
        entityId: id,
        details: {
          packageId,
          sessionsDeducted: sessionsToDeduct,
          perSessionRate,
          amountDeducted: deductionAmount,
          previousBalance: currentBalance,
          newBalance: Number(updatedWallet.balance),
          usedSessions: updatedPackage.usedSessions,
          totalSessions: updatedPackage.totalSessions,
        },
      },
    })

    return NextResponse.json({
      package: updatedPackage,
      remaining: updatedPackage.totalSessions - updatedPackage.usedSessions,
      perSessionRate,
      amountDeducted: deductionAmount,
      newBalance: Number(updatedWallet.balance),
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
