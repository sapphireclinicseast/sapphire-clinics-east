import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

/**
 * PATCH /api/accounts-receivable/custom-date
 * Body: { orderId: string, arCustomDate: string | null }
 * Sets or clears the manually-overridden transaction date on an AR order.
 * When set, this date is used instead of transactionDate in both the Invoice and SOA PDFs.
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { orderId, arCustomDate } = await req.json()
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 })

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        arCustomDate: arCustomDate ? new Date(arCustomDate) : null,
      },
      select: { id: true, arCustomDate: true },
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
