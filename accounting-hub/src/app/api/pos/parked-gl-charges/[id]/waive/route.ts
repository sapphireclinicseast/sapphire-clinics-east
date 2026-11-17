// Waive a parked GL cancellation fee: it is forgiven instead of going on the
// patient's next letter. Admins and accountants only, with a reason; the row
// stays (status WAIVED) so the history shows who waived what and why.
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PARKED_FEE_WAIVE_ROLES } from '@/lib/pos/retro-cancellation'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || !PARKED_FEE_WAIVE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Only admins and accountants can waive a parked fee' }, { status: 403 })
  }
  const { id } = await params
  const { reason } = await req.json().catch(() => ({})) as { reason?: string }
  const why = String(reason || '').trim()
  if (why.length < 3) return NextResponse.json({ error: 'Say why the fee is waived' }, { status: 400 })

  // Only a fee that is still parked — not one being charged or already charged.
  const done = await prisma.parkedGlCharge.updateMany({
    where: { id, status: 'PARKED' },
    data: { status: 'WAIVED', waivedAt: new Date(), waivedById: session.user.id, waiveReason: why.slice(0, 500) },
  })
  if (done.count === 0) {
    const row = await prisma.parkedGlCharge.findUnique({ where: { id }, select: { status: true } })
    return NextResponse.json({ error: row ? `This fee is already ${row.status.toLowerCase()}` : 'Fee not found' }, { status: row ? 409 : 404 })
  }
  const row = await prisma.parkedGlCharge.findUnique({ where: { id } })
  await prisma.auditLog.create({
    data: {
      userId: session.user.id, action: 'UPDATE', entity: 'parkedGlCharge', entityId: id,
      details: { waived: true, reason: why, patientName: row?.patientName, amount: Number(row?.amount || 0), feeName: row?.feeName, detail: row?.detail },
    },
  })
  return NextResponse.json({ ok: true })
}
