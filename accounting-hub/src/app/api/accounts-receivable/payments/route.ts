import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { walletId, paymentDate, amount, discount, discountAccountId, orderIds, proofUrl, notes, branch } = await req.json()

    if (!walletId || !paymentDate || amount == null) {
      return NextResponse.json({ error: 'walletId, paymentDate, and amount are required' }, { status: 400 })
    }

    const wallet = await prisma.digitalWallet.findUnique({ where: { id: walletId } })
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    const paymentAmount = Number(amount)
    const discountAmount = Number(discount) || 0

    // Create AR payment with linked orders
    const payment = await prisma.aRPayment.create({
      data: {
        walletId,
        paymentDate: new Date(paymentDate),
        amount: paymentAmount,
        discount: discountAmount,
        discountAccountId: discountAccountId || null,
        proofUrl: proofUrl || null,
        notes: notes?.trim() || null,
        branch: branch || null,
        createdById: session.user.id,
        items: orderIds?.length ? {
          create: orderIds.map((orderId: string) => ({ orderId })),
        } : undefined,
      },
      include: {
        items: true,
        wallet: { select: { patientName: true, walletType: true } },
      },
    })

    // Decrement wallet balance by payment + discount (total settled)
    const totalSettled = paymentAmount + discountAmount
    await prisma.digitalWallet.update({
      where: { id: walletId },
      data: { balance: { decrement: totalSettled } },
    })

    // Log the payment
    await prisma.walletLog.create({
      data: {
        walletId,
        action: 'AR_PAYMENT',
        description: `Payment received: ${paymentAmount}${discountAmount > 0 ? ` + discount: ${discountAmount}` : ''}`,
        createdById: session.user.id,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'AR_PAYMENT',
        entity: 'arPayment',
        entityId: payment.id,
        details: {
          walletId,
          walletName: wallet.patientName,
          walletType: wallet.walletType,
          amount: paymentAmount,
          discount: discountAmount,
          orderCount: orderIds?.length || 0,
        },
      },
    })

    return NextResponse.json(payment, { status: 201 })
  } catch (err) {
    console.error('AR Payment error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
