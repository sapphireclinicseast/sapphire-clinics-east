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
    const { walletId, paymentDate, amount, discount, discountAccountId, cashAccountId, orderIds, proofUrl, notes, branch } = await req.json()

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
        cashAccountId: cashAccountId || null,
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

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, walletId, paymentDate, amount, discount, discountAccountId, cashAccountId, orderIds, proofUrl, notes, branch } = await req.json()

    if (!id) return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 })
    if (!walletId || !paymentDate || amount == null) {
      return NextResponse.json({ error: 'walletId, paymentDate, and amount are required' }, { status: 400 })
    }

    // Get current payment to calculate balance difference
    const existing = await prisma.aRPayment.findUnique({
      where: { id },
      include: { wallet: true },
    })
    if (!existing) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

    const oldTotal = Number(existing.amount) + Number(existing.discount)
    const newAmount = Number(amount)
    const newDiscount = Number(discount) || 0
    const newTotal = newAmount + newDiscount
    const balanceDiff = newTotal - oldTotal // positive = more settled, negative = less settled

    // Replace linked orders
    await prisma.aRPaymentItem.deleteMany({ where: { paymentId: id } })

    // Update the payment
    const payment = await prisma.aRPayment.update({
      where: { id },
      data: {
        walletId,
        paymentDate: new Date(paymentDate),
        amount: newAmount,
        discount: newDiscount,
        discountAccountId: discountAccountId || null,
        cashAccountId: cashAccountId || null,
        proofUrl: proofUrl || null,
        notes: notes?.trim() || null,
        branch: branch || null,
        items: orderIds?.length ? {
          create: orderIds.map((orderId: string) => ({ orderId })),
        } : undefined,
      },
      include: {
        items: true,
        wallet: { select: { patientName: true, walletType: true } },
      },
    })

    // Adjust wallet balance for the difference
    if (balanceDiff !== 0) {
      await prisma.digitalWallet.update({
        where: { id: walletId },
        data: { balance: { decrement: balanceDiff } },
      })
    }

    // If wallet changed, undo the same-wallet adjustment above, then restore old + deduct new
    if (walletId !== existing.walletId) {
      // Undo the same-wallet decrement we already did above
      if (balanceDiff !== 0) {
        await prisma.digitalWallet.update({
          where: { id: walletId },
          data: { balance: { increment: balanceDiff } },
        })
      }
      // Restore old wallet balance fully
      await prisma.digitalWallet.update({
        where: { id: existing.walletId },
        data: { balance: { increment: oldTotal } },
      })
      // Deduct new wallet balance fully
      await prisma.digitalWallet.update({
        where: { id: walletId },
        data: { balance: { decrement: newTotal } },
      })
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'AR_PAYMENT_UPDATE',
        entity: 'arPayment',
        entityId: id,
        details: {
          walletId,
          amount: newAmount,
          discount: newDiscount,
          balanceDiff,
          orderCount: orderIds?.length || 0,
        },
      },
    })

    return NextResponse.json(payment)
  } catch (err) {
    console.error('AR Payment update error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const reason = searchParams.get('reason') || ''

    if (!id) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 })
    }

    // Get the payment to reverse the balance
    const payment = await prisma.aRPayment.findUnique({
      where: { id },
      include: { wallet: { select: { id: true, patientName: true, walletType: true } }, items: true },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const totalSettled = Number(payment.amount) + Number(payment.discount)

    // Restore wallet balance
    await prisma.digitalWallet.update({
      where: { id: payment.walletId },
      data: { balance: { increment: totalSettled } },
    })

    // Delete linked order items first, then the payment
    await prisma.aRPaymentItem.deleteMany({ where: { paymentId: id } })
    await prisma.aRPayment.delete({ where: { id } })

    // Log the reversal
    await prisma.walletLog.create({
      data: {
        walletId: payment.walletId,
        action: 'AR_PAYMENT_REVERSED',
        description: `Payment reversed: ${Number(payment.amount)}${Number(payment.discount) > 0 ? ` + discount: ${Number(payment.discount)}` : ''}${reason ? ` — Reason: ${reason}` : ''}`,
        createdById: session.user.id,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'AR_PAYMENT_DELETE',
        entity: 'arPayment',
        entityId: id,
        details: {
          walletId: payment.walletId,
          walletName: payment.wallet.patientName,
          walletType: payment.wallet.walletType,
          amount: Number(payment.amount),
          discount: Number(payment.discount),
          reason,
        },
      },
    })

    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('AR Payment delete error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
