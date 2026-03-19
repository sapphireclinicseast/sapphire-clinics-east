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
    const { packageId, sessions = 1 } = await req.json()

    if (!packageId) {
      return NextResponse.json({ error: 'Package ID is required' }, { status: 400 })
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

    const updated = await prisma.walletPackage.update({
      where: { id: packageId },
      data: { usedSessions: { increment: sessionsToDeduct } },
    })

    await prisma.walletLog.create({
      data: {
        walletId: id,
        packageId,
        action: 'DEDUCTION',
        sessions: sessionsToDeduct,
        description: `Deducted ${sessionsToDeduct} session(s) from ${walletPackage.serviceName}`,
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
          usedSessions: updated.usedSessions,
          totalSessions: updated.totalSessions,
        },
      },
    })

    return NextResponse.json({
      package: updated,
      remaining: updated.totalSessions - updated.usedSessions,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
