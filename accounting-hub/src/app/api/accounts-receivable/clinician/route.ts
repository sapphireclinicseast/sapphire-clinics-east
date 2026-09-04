import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Frontdesk is deliberately included: sessions reach AR with the clinician
// blank when the POS entry skipped it, and the front desk / HMO officer are
// the ones who know who actually rendered the session.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

/**
 * PATCH /api/accounts-receivable/clinician
 * Body: { orderId: string, clinicianName: string | null }
 * Sets or clears the clinician on an AR order (blank POS entries, corrections).
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { orderId, clinicianName } = await req.json()
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    const clean = typeof clinicianName === 'string' && clinicianName.trim() ? clinicianName.trim().slice(0, 200) : null

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { clinicianName: clean },
      select: { id: true, clinicianName: true },
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
