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

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            service: { select: { id: true, name: true, department: true } },
            inventoryItem: { select: { id: true, name: true, sku: true } },
          },
        },
        payments: {
          include: {
            wallet: { select: { id: true, patientName: true, barcode: true } },
          },
        },
        referrer: true,
        createdBy: { select: { id: true, name: true } },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json(order)
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

    const existing = await prisma.order.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Handle status change actions (reopen / void)
    if (body.action === 'reopen' || body.action === 'void') {
      const newStatus = body.action === 'reopen' ? 'REOPENED' : 'VOIDED'

      const updated = await prisma.order.update({
        where: { id },
        data: { status: newStatus },
        include: { items: true, payments: true },
      })

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: body.action.toUpperCase(),
          entity: 'order',
          entityId: id,
          details: {
            orderNumber: existing.orderNumber,
            previousStatus: existing.status,
            newStatus,
            reason: body.reason || null,
          },
        },
      })

      return NextResponse.json(updated)
    }

    // Handle full order edit (only allowed for REOPENED orders)
    if (existing.status !== 'REOPENED') {
      return NextResponse.json(
        { error: 'Only reopened orders can be edited. Reopen the order first.' },
        { status: 400 }
      )
    }

    const {
      patientName,
      clinicianName,
      items,
      payments,
      discountType,
      discountAmount,
      discountLabel,
      revenueType,
      referrerId,
      notes,
    } = body

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { status: 'COMPLETED' }

    if (patientName !== undefined) data.patientName = patientName || null
    if (clinicianName !== undefined) data.clinicianName = clinicianName || null
    if (body.transactionDate) data.transactionDate = new Date(body.transactionDate)
    if (body.dateChangeReason) data.notes = `${existing.notes || ''}${existing.notes ? ' | ' : ''}Date changed: ${body.dateChangeReason}`.trim()
    if (discountType !== undefined) data.discountType = discountType
    if (discountAmount !== undefined) data.discountAmount = Number(discountAmount)
    if (discountLabel !== undefined) data.discountLabel = discountLabel || null
    if (revenueType !== undefined) data.revenueType = revenueType
    if (referrerId !== undefined) data.referrerId = referrerId || null
    if (notes !== undefined) data.notes = notes || null

    // If items are provided, recalculate subtotal and netAmount
    if (items?.length) {
      const subtotal = items.reduce(
        (sum: number, item: { lineTotal: number }) => sum + Number(item.lineTotal),
        0
      )
      data.subtotal = subtotal
      data.netAmount = subtotal - Number(data.discountAmount ?? existing.discountAmount)
    }

    // Use a transaction to replace items/payments atomically
    const updated = await prisma.$transaction(async (tx) => {
      // Delete and recreate items if provided
      if (items?.length) {
        await tx.orderItem.deleteMany({ where: { orderId: id } })
        await tx.orderItem.createMany({
          data: items.map((item: {
            serviceId?: string
            inventoryItemId?: string
            name: string
            quantity: number
            unitPrice: number
            lineTotal: number
          }) => ({
            orderId: id,
            serviceId: item.serviceId || null,
            inventoryItemId: item.inventoryItemId || null,
            name: item.name,
            quantity: item.quantity || 1,
            unitPrice: Number(item.unitPrice),
            lineTotal: Number(item.lineTotal),
          })),
        })
      }

      // Delete and recreate payments if provided
      if (payments?.length) {
        await tx.orderPayment.deleteMany({ where: { orderId: id } })
        await tx.orderPayment.createMany({
          data: payments.map((p: {
            method: string
            amount: number
            walletId?: string
            reference?: string
          }) => ({
            orderId: id,
            method: p.method,
            amount: Number(p.amount),
            walletId: p.walletId || null,
            reference: p.reference || null,
          })),
        })
      }

      return tx.order.update({
        where: { id },
        data,
        include: { items: true, payments: true, referrer: true },
      })
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'order',
        entityId: id,
        details: {
          orderNumber: existing.orderNumber,
          updatedFields: Object.keys(body),
          itemsReplaced: !!items,
          paymentsReplaced: !!payments,
        },
      },
    })

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
