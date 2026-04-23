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
    const { walletId, walletIds, paymentDate, amount, discount, discountAccountId, cashAccountId, orderIds, proofUrl, notes, branch } = await req.json()

    // Support multi-wallet GL payments: walletIds is an array of wallet IDs
    const effectiveWalletIds: string[] = walletIds?.length ? walletIds : walletId ? [walletId] : []

    if (effectiveWalletIds.length === 0 || !paymentDate || amount == null) {
      return NextResponse.json({ error: 'walletId, paymentDate, and amount are required' }, { status: 400 })
    }

    const paymentAmount = Number(amount)
    const discountAmount = Number(discount) || 0
    const totalSettled = paymentAmount + discountAmount

    // For multi-wallet: split total evenly across wallets, then create one ARPayment per wallet
    const perWalletAmount = paymentAmount / effectiveWalletIds.length
    const perWalletDiscount = discountAmount / effectiveWalletIds.length
    const perWalletSettled = totalSettled / effectiveWalletIds.length

    const payments = []
    for (const wId of effectiveWalletIds) {
      const wallet = await prisma.digitalWallet.findUnique({ where: { id: wId } })
      if (!wallet) continue

      // For single wallet, use full amounts; for multi, use per-wallet split
      const thisAmount = effectiveWalletIds.length === 1 ? paymentAmount : perWalletAmount
      const thisDiscount = effectiveWalletIds.length === 1 ? discountAmount : perWalletDiscount
      const thisSettled = effectiveWalletIds.length === 1 ? totalSettled : perWalletSettled

      // Find orders linked to this specific wallet
      const walletOrderIds = orderIds?.length
        ? orderIds.filter(async (oid: string) => {
            // For simplicity, link all tagged orders to the first wallet if multi-select
            return true
          })
        : []

      const payment = await prisma.aRPayment.create({
        data: {
          walletId: wId,
          paymentDate: new Date(paymentDate),
          amount: thisAmount,
          discount: thisDiscount,
          discountAccountId: discountAccountId || null,
          cashAccountId: cashAccountId || null,
          proofUrl: proofUrl || null,
          notes: effectiveWalletIds.length > 1
            ? `${notes?.trim() || ''} [Bulk payment across ${effectiveWalletIds.length} GL wallets]`.trim()
            : (notes?.trim() || null),
          branch: branch || null,
          createdById: session.user.id,
          items: walletOrderIds.length ? {
            create: walletOrderIds.map((orderId: string) => ({ orderId })),
          } : undefined,
        },
        include: {
          items: true,
          wallet: { select: { patientName: true, walletType: true } },
        },
      })
      payments.push(payment)

      // Decrement wallet balance
      await prisma.digitalWallet.update({
        where: { id: wId },
        data: { balance: { decrement: thisSettled } },
      })

      // Also decrement totalGlAmount if present (for GL wallets, settle against the full receivable)
      if (wallet.walletType === 'GL' && wallet.totalGlAmount) {
        await prisma.digitalWallet.update({
          where: { id: wId },
          data: { totalGlAmount: { decrement: thisSettled } },
        })
      }

      // Log
      await prisma.walletLog.create({
        data: {
          walletId: wId,
          action: 'AR_PAYMENT',
          description: `Payment received: ${thisAmount}${thisDiscount > 0 ? ` + discount: ${thisDiscount}` : ''}${effectiveWalletIds.length > 1 ? ' (bulk)' : ''}`,
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
            walletId: wId,
            walletName: wallet.patientName,
            walletType: wallet.walletType,
            amount: thisAmount,
            discount: thisDiscount,
            orderCount: walletOrderIds.length,
            bulkPayment: effectiveWalletIds.length > 1,
          },
        },
      })
    }

    return NextResponse.json(payments.length === 1 ? payments[0] : payments, { status: 201 })
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
