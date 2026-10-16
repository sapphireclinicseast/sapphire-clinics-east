import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Same roles that already edit Per HMO rows (custom-date, soa-status). Both
// branches' HMO officers may point a claim at either branch — the reassignment
// is cooperative by design (East processes claims for sessions done at GH).
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

const SOA_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS']

/**
 * PATCH /api/accounts-receivable/soa-reassign
 * Body: { orderId: string, soaBranch: 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | null }
 * Tags the session with the branch whose SOA generation picks it up. The tag
 * moves the claim only in the HMO/SOA views — the order's own `branch` (sales,
 * payroll, aging, LOA) is never touched. Picking the order's own branch clears
 * the tag, so null always means "the branch where the session was done".
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { orderId, soaBranch } = await req.json()
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    if (soaBranch != null && !SOA_BRANCHES.includes(soaBranch)) {
      return NextResponse.json({ error: 'soaBranch must be SANDBOX_EAST, SANDBOX_GREENHILLS or null' }, { status: 400 })
    }

    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, branch: true } })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const normalized = soaBranch && soaBranch !== order.branch ? soaBranch : null
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { soaBranch: normalized },
      select: { id: true, soaBranch: true },
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
