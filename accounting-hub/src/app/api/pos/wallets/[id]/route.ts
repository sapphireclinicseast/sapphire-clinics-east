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

    // For HMO/GL wallets, also fetch orders that used this wallet as payment
    if (['HMO', 'GL'].includes(wallet.walletType)) {
      const orders = await prisma.order.findMany({
        where: {
          payments: { some: { walletId: id } },
          status: { not: 'VOIDED' },
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
        take: 100,
      })
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
    const { patientName, patientEmail, patientId, isActive, deleteReason, accountId } = body

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (patientName !== undefined) data.patientName = patientName.trim()
    if (patientEmail !== undefined) data.patientEmail = patientEmail?.trim() || null
    if (patientId !== undefined) data.patientId = patientId?.trim() || null
    if (isActive !== undefined) data.isActive = isActive
    if (accountId !== undefined) data.accountId = accountId || null

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
