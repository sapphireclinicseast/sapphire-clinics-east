import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)
  const branch = searchParams.get('branch')
  const orderType = searchParams.get('orderType')
  const status = searchParams.get('status')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (branch) where.branch = branch
  if (orderType) where.orderType = orderType
  if (status) where.status = status

  if (dateFrom || dateTo) {
    where.transactionDate = {}
    if (dateFrom) where.transactionDate.gte = new Date(`${dateFrom}T00:00:00+08:00`)
    if (dateTo) where.transactionDate.lte = new Date(`${dateTo}T23:59:59.999+08:00`)
  }

  try {
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { transactionDate: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          items: {
            include: {
              service: { select: { id: true, name: true, department: true, revenueType: true } },
            },
          },
          payments: true,
          arPaymentItems: { select: { paymentId: true } },
          referrer: true,
          createdBy: { select: { id: true, name: true } },
        },
      }),
      prisma.order.count({ where }),
    ])

    return NextResponse.json(paginatedResult(orders, total, params))
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const {
      orderType,
      branch,
      patientId,
      patientName,
      clinicianName,
      transactionDate,
      items,
      payments,
      discountType = 'NONE',
      discountAmount = 0,
      discountLabel,
      revenueType = 'EARNED',
      queueItemId,
      referrerId,
      notes,
      issuedOfficialInvoice,
      salesInvoiceNumber,
    } = body

    if (!orderType || !branch || !items?.length || !payments?.length) {
      return NextResponse.json(
        { error: 'orderType, branch, items, and payments are required' },
        { status: 400 }
      )
    }

    // Calculate subtotal from items
    const subtotal = items.reduce(
      (sum: number, item: { lineTotal: number }) => sum + Number(item.lineTotal),
      0
    )

    const netAmount = subtotal - Number(discountAmount)

    const order = await prisma.order.create({
      data: {
        orderType,
        branch,
        patientId: patientId || null,
        patientName: patientName || null,
        clinicianName: clinicianName || null,
        transactionDate: new Date(`${transactionDate}T08:00:00+08:00`),
        subtotal,
        discountType,
        discountAmount: Number(discountAmount),
        discountLabel: discountLabel || null,
        netAmount,
        revenueType,
        queueItemId: queueItemId || null,
        referrerId: referrerId || null,
        notes: notes || null,
        issuedOfficialInvoice: issuedOfficialInvoice || false,
        salesInvoiceNumber: (issuedOfficialInvoice && salesInvoiceNumber) ? salesInvoiceNumber.trim() : null,
        createdById: session.user.id,
        items: {
          createMany: {
            data: items.map((item: {
              serviceId?: string
              inventoryItemId?: string
              name: string
              quantity: number
              unitPrice: number
              lineTotal: number
            }) => ({
              serviceId: item.serviceId || null,
              inventoryItemId: item.inventoryItemId || null,
              name: item.name,
              quantity: item.quantity || 1,
              unitPrice: Number(item.unitPrice),
              lineTotal: Number(item.lineTotal),
            })),
          },
        },
        payments: {
          createMany: {
            data: payments.map((p: {
              method: string
              amount: number
              walletId?: string
              reference?: string
              paymentModeId?: string
            }) => ({
              method: p.method,
              amount: Number(p.amount),
              walletId: p.walletId || null,
              reference: p.reference || null,
              paymentModeId: p.paymentModeId || null,
            })),
          },
        },
      },
      include: {
        items: true,
        payments: true,
        referrer: true,
      },
    })

    // Deduct inventory for product orders (including bundle components)
    if (orderType === 'PRODUCT') {
      for (const item of items) {
        if (!item.inventoryItemId) continue
        const invItem = await prisma.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
          include: { bundleComponents: true },
        })
        if (!invItem) continue
        const orderQty = item.quantity || 1

        if (invItem.isBundle && invItem.bundleComponents.length > 0) {
          // Bundle: deduct each component's quantity × order quantity
          for (const bc of invItem.bundleComponents) {
            await prisma.inventoryItem.update({
              where: { id: bc.componentId },
              data: { quantity: { decrement: bc.quantity * orderQty } },
            })
          }
        } else {
          // Regular item: deduct directly
          await prisma.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { quantity: { decrement: orderQty } },
          })
        }
      }
    }

    // Credit HMO/GL wallet balances (accounts receivable — money owed by HMO/GL provider)
    const RECEIVABLE_METHODS = ['HMO', 'GL']
    console.log('[WALLET-CREDIT] Checking payments for HMO/GL credit:', JSON.stringify(payments.map((p: Record<string, unknown>) => ({ method: p.method, walletId: p.walletId, amount: p.amount }))))
    for (const p of payments) {
      if (RECEIVABLE_METHODS.includes(p.method) && p.walletId) {
        console.log(`[WALLET-CREDIT] Incrementing wallet ${p.walletId} by ${p.amount} for ${p.method}`)
        try {
          const beforeWallet = await prisma.digitalWallet.findUnique({ where: { id: p.walletId }, select: { balance: true } })
          console.log(`[WALLET-CREDIT] Before balance: ${beforeWallet?.balance}`)
          const updatedWallet = await prisma.digitalWallet.update({
            where: { id: p.walletId },
            data: { balance: { increment: Number(p.amount) } },
          })
          console.log(`[WALLET-CREDIT] After balance: ${updatedWallet.balance} (expected ${Number(beforeWallet?.balance || 0) + Number(p.amount)})`)
          // Verify with a direct read
          const verifyWallet = await prisma.digitalWallet.findUnique({ where: { id: p.walletId }, select: { balance: true } })
          console.log(`[WALLET-CREDIT] Verify read: ${verifyWallet?.balance}`)
        } catch (walletErr) {
          console.error(`[WALLET-CREDIT] Failed to credit wallet ${p.walletId}:`, walletErr)
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'order',
        entityId: order.id,
        details: {
          orderNumber: order.orderNumber,
          orderType,
          branch,
          netAmount,
          itemCount: items.length,
        },
      },
    })

    return NextResponse.json(order, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
