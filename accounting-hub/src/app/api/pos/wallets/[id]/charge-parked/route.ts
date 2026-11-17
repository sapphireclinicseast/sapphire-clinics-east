// "Charge to this letter": put the patient's parked cancellation fees on this
// guarantee letter, oldest first, as far as its balance goes
// (lib/pos/parked-gl-charges). New letters get this automatically on creation.
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { chargeParkedToLetter } from '@/lib/pos/parked-gl-charges'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { id } = await params
  const result = await chargeParkedToLetter(prisma, id, session.user.id)
  if (result.charged.length) {
    await prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'UPDATE', entity: 'digitalWallet', entityId: id,
        details: { parkedFeesCharged: result.charged.length, amount: result.chargedAmount, orders: result.charged.map(c => c.orderNumber) },
      },
    })
  }
  return NextResponse.json(result, { status: result.error && !result.charged.length ? 400 : 200 })
}
