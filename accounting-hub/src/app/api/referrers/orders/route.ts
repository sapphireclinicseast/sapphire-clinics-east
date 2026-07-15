// GET /api/referrers/orders?id=<referrerId>
// Orders (non-voided) that name a given referrer — powers the clickable
// "Count of Referrals" drill-down: order number, date, patient, amount, branch.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'MEDREP']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'Referrer id is required' }, { status: 400 })

  const orders = await prisma.order.findMany({
    where: { referrerId: id, status: { notIn: ['VOIDED'] } },
    select: { id: true, orderNumber: true, transactionDate: true, patientName: true, netAmount: true, branch: true, status: true },
    orderBy: { transactionDate: 'desc' },
  })

  return NextResponse.json(orders.map(o => ({
    id: o.id,
    orderNumber: o.orderNumber,
    date: o.transactionDate,
    patientName: o.patientName,
    amount: Number(o.netAmount),
    branch: o.branch,
    status: o.status,
  })))
}
