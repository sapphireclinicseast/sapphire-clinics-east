import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''
  const invoicedOnly = searchParams.get('invoicedOnly') === 'true'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    status: { in: ['COMPLETED', 'REOPENED'] },
  }

  if (branch && branch !== 'ALL') where.branch = branch
  if (dateFrom) {
    where.transactionDate = { ...where.transactionDate, gte: new Date(`${dateFrom}T00:00:00+08:00`) }
  }
  if (dateTo) {
    where.transactionDate = { ...where.transactionDate, lte: new Date(`${dateTo}T23:59:59.999+08:00`) }
  }
  if (invoicedOnly) {
    where.issuedOfficialInvoice = true
  }

  try {
    const orders = await prisma.order.findMany({
      where,
      orderBy: { transactionDate: 'asc' },
      select: {
        id: true,
        orderNumber: true,
        transactionDate: true,
        patientName: true,
        subtotal: true,
        discountAmount: true,
        netAmount: true,
        branch: true,
        issuedOfficialInvoice: true,
        salesInvoiceNumber: true,
        items: {
          select: {
            name: true,
            quantity: true,
            lineTotal: true,
            service: { select: { issuedOfficialInvoice: true } },
            inventoryItem: { select: { issuedOfficialInvoice: true } },
          },
        },
      },
    })

    // Flatten: one row per order item
    const rows = orders.flatMap(order => {
      const date = new Date(order.transactionDate).toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })

      // Distribute discount proportionally across items
      const orderGross = Number(order.subtotal)
      const orderNet = Number(order.netAmount)
      const discountRatio = orderGross > 0 ? (Number(order.discountAmount) / orderGross) : 0

      return order.items.map(item => {
        const itemGross = Number(item.lineTotal)
        const itemDiscount = itemGross * discountRatio
        const itemNet = itemGross - itemDiscount
        return {
          date,
          orderNumber: order.orderNumber,
          patientName: order.patientName || '—',
          serviceAvailed: item.name,
          quantity: item.quantity,
          salesInvoiceNumber: order.salesInvoiceNumber || '',
          grossAmount: itemGross,
          netAmount: itemNet,
          branch: order.branch,
          issuedOfficialInvoice: order.issuedOfficialInvoice,
          itemIssuedOfficialInvoice: item.service?.issuedOfficialInvoice || item.inventoryItem?.issuedOfficialInvoice || false,
        }
      })
    })

    return NextResponse.json({ rows, count: rows.length })
  } catch (err) {
    console.error('Sales summary error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
