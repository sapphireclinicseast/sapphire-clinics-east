import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

/**
 * PATCH /api/accounts-receivable/soa-status
 * Body: { orderId: string, status: 'APPROVED' | 'DISAPPROVED' | null }
 * Sets the SOA submission outcome on an AR order; null returns it to Pending.
 * (A paid order displays as Approved in the UI regardless of this field.)
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { orderId, status } = await req.json()
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    if (status != null && !['APPROVED', 'DISAPPROVED'].includes(status)) {
      return NextResponse.json({ error: 'status must be APPROVED, DISAPPROVED, or null (pending)' }, { status: 400 })
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { soaApprovalStatus: status ?? null },
      select: { id: true, soaApprovalStatus: true },
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
