import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notMigratedOrder } from '@/lib/payroll/exclude-migrated'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const dateFromParam = searchParams.get('dateFrom')
  const dateToParam = searchParams.get('dateTo')
  const branch = searchParams.get('branch') || ''

  if (!dateFromParam || !dateToParam) {
    return NextResponse.json({ error: 'dateFrom and dateTo are required' }, { status: 400 })
  }

  const start = new Date(dateFromParam)
  const end = new Date(dateToParam)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderWhere: any = {
    status: 'COMPLETED',
    transactionDate: { gte: start, lte: end },
    AND: [notMigratedOrder],
  }
  if (branch) orderWhere.branch = branch

  const orders = await prisma.order.findMany({
    where: orderWhere,
    select: {
      id: true,
      transactionDate: true,
      patientName: true,
      clinicianName: true,
      discountAmount: true,
      netAmount: true,
      subtotal: true,
      referrer: { select: { name: true } },
      payments: {
        select: {
          method: true,
          amount: true,
          paymentMode: { select: { name: true } },
        },
      },
      items: {
        select: {
          name: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          service: { select: { name: true } },
        },
      },
    },
    orderBy: { transactionDate: 'asc' },
  })

  // Build CSV rows — one row per order item
  // Discount is at the order level; we distribute it proportionally across items
  const rows: string[][] = []
  const header = [
    'Date',
    'Service',
    'Patient Name',
    'Clinician Name',
    'Doctor Referral',
    'Form of Payment',
    'Gross Amount',
    'Discount Amount',
    'Net Amount',
  ]
  rows.push(header)

  for (const order of orders) {
    // Form of payment: use paymentMode name if set, else method label
    const paymentLabel = order.payments.length > 0
      ? (order.payments[0].paymentMode?.name || order.payments[0].method.replace(/_/g, ' '))
      : ''

    const dateStr = new Date(order.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    const referrerName = order.referrer?.name || ''

    // Calculate order-level discount ratio to distribute across items
    const orderSubtotal = Number(order.subtotal) || 0
    const orderDiscount = Number(order.discountAmount) || 0
    const discountRatio = orderSubtotal > 0 ? orderDiscount / orderSubtotal : 0

    for (const item of order.items) {
      const serviceName = item.service?.name || item.name || ''
      const lineTotal = Number(item.lineTotal)
      // Distribute order-level discount proportionally per item
      const itemDiscount = Math.round(lineTotal / (1 - discountRatio) * discountRatio * 100) / 100
      const grossAmount = lineTotal + itemDiscount
      const netAmount = lineTotal

      rows.push([
        dateStr,
        serviceName,
        order.patientName || '',
        order.clinicianName || '',
        referrerName,
        paymentLabel,
        grossAmount.toFixed(2),
        itemDiscount.toFixed(2),
        netAmount.toFixed(2),
      ])
    }
  }

  // Serialize to CSV
  const csv = rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? '')
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }).join(',')
  ).join('\r\n')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="sales_summary.csv"',
    },
  })
}
