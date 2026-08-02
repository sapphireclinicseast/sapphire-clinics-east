import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { paymongoPaymentModeName } from '@/lib/paymongo'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

/**
 * PayMongo payments that are settled but not yet recorded as a POS sale.
 *
 * GET  ?branch=… → the queue the cashier sees in POS ("Convert to Order").
 * POST { checkoutId, patientName?, revenueType? } → creates the POS order with the payment
 *        already tagged to the matching "Paymongo - <BRANCH> (<METHOD>)" payment mode.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const branch = String(new URL(req.url).searchParams.get('branch') || '')
  const rows = await prisma.paymongoCheckout.findMany({
    where: {
      status: 'PAID',
      orderId: null,                 // not yet turned into a sale
      ...(branch ? { branch } : {}),
    },
    orderBy: { paidAt: 'desc' },
    take: 100,
    select: {
      id: true, checkoutId: true, referenceCode: true, account: true, branch: true,
      itemName: true, quantity: true, serviceId: true, inventoryItemId: true,
      customerFirstName: true, customerLastName: true, customerEmail: true, customerPhone: true,
      voucherCode: true, grossAmount: true, discountAmount: true, amount: true,
      fee: true, netAmount: true, paidAt: true, paymentMethodUsed: true,
    },
  })
  return NextResponse.json(rows.map(r => ({
    ...r,
    customerName: [r.customerFirstName, r.customerLastName].filter(Boolean).join(' '),
    grossAmount: r.grossAmount == null ? null : Number(r.grossAmount),
    discountAmount: r.discountAmount == null ? null : Number(r.discountAmount),
    amount: Number(r.amount),
    fee: r.fee == null ? null : Number(r.fee),
    netAmount: r.netAmount == null ? null : Number(r.netAmount),
    paymentModeName: r.paymentMethodUsed && r.account
      ? paymongoPaymentModeName(r.account, r.paymentMethodUsed as 'CARD' | 'GCASH' | 'PAYMAYA' | 'QRPH')
      : null,
  })))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const b = await req.json()
    const checkoutId = String(b.checkoutId || '')
    if (!checkoutId) return NextResponse.json({ error: 'checkoutId is required' }, { status: 400 })

    const co = await prisma.paymongoCheckout.findFirst({ where: { OR: [{ id: checkoutId }, { checkoutId }] } })
    if (!co) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (co.status !== 'PAID') return NextResponse.json({ error: 'Only settled payments can be converted' }, { status: 400 })
    if (co.orderId) return NextResponse.json({ error: 'This payment is already recorded as an order' }, { status: 400 })
    if (!co.branch) return NextResponse.json({ error: 'This payment has no branch' }, { status: 400 })

    // Match the POS payment mode to the instrument the payer used. If we couldn't determine
    // it, fall back to any PayMongo mode for the branch rather than blocking the cashier —
    // and report which mode was used so a mis-tag is visible.
    let mode: { id: string; name: string } | null = null
    if (co.paymentMethodUsed && co.account) {
      const wanted = paymongoPaymentModeName(co.account, co.paymentMethodUsed as 'CARD' | 'GCASH' | 'PAYMAYA' | 'QRPH')
      mode = await prisma.paymentMode.findFirst({ where: { name: wanted, isActive: true }, select: { id: true, name: true } })
    }
    let fallbackUsed = false
    if (!mode) {
      mode = await prisma.paymentMode.findFirst({
        where: { isActive: true, name: { contains: 'Paymongo', mode: 'insensitive' }, branch: co.branch },
        select: { id: true, name: true },
      })
      fallbackUsed = !!mode
    }
    if (!mode) {
      return NextResponse.json({ error: `No PayMongo payment mode is set up for ${co.branch}. Add one under Payment Modes first.` }, { status: 400 })
    }

    const qty = Math.max(1, co.quantity || 1)
    const charged = Number(co.amount)
    const gross = co.grossAmount != null ? Number(co.grossAmount) : charged
    const discount = co.discountAmount != null ? Number(co.discountAmount) : 0
    const patientName = String(b.patientName || '').trim()
      || [co.customerFirstName, co.customerLastName].filter(Boolean).join(' ').trim()
      || 'PayMongo customer'

    // Revenue timing: a downpayment is unearned until the service is delivered.
    const revenueType = b.revenueType === 'UNEARNED' ? 'UNEARNED' : 'EARNED'

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderType: co.serviceId ? 'SERVICE' : 'PRODUCT',
          branch: co.branch as never,
          patientName,
          subtotal: gross,
          discountAmount: discount,
          netAmount: charged,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          revenueType: revenueType as never,
          transactionDate: co.paidAt || new Date(),
          notes: `PayMongo ${co.paymentMethodUsed || ''} · ${co.referenceCode || co.checkoutId}${co.voucherCode ? ` · voucher ${co.voucherCode}` : ''}`.trim(),
          createdById: session.user!.id as string,
          items: {
            create: [{
              serviceId: co.serviceId, inventoryItemId: co.inventoryItemId,
              name: co.itemName || co.description || 'PayMongo payment',
              quantity: qty,
              unitPrice: qty > 0 ? Math.round((gross / qty) * 100) / 100 : gross,
              lineTotal: gross,
            }],
          },
          payments: {
            create: [{ method: 'PAYMONGO', amount: charged, paymentModeId: mode!.id }],
          },
        },
        select: { id: true, patientName: true, netAmount: true },
      })
      await tx.paymongoCheckout.update({
        where: { id: co.id },
        data: { orderId: created.id, convertedAt: new Date() },
      })
      return created
    })

    return NextResponse.json({
      ok: true, orderId: order.id, patientName: order.patientName,
      amount: Number(order.netAmount), paymentMode: mode.name,
      warning: fallbackUsed
        ? `PayMongo didn't report which instrument was used, so this was tagged as "${mode.name}". Change it on the order if that's wrong.`
        : undefined,
    })
  } catch (e) {
    console.error('PayMongo convert-to-order error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to convert to order' }, { status: 500 })
  }
}
