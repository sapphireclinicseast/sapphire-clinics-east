import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { possibleDuplicates } from '@/lib/hmo-duplicates'
import { notDuplicateStamp, NOT_DUP_ROLES } from '@/lib/hmo-not-duplicate'
const MAX_REMARKS = 300

/**
 * POST /api/accounts-receivable/not-duplicate
 * Body: { orderId: string, remarks: string }
 * "Not a duplicate" on a Per HMO row flagged as a possible duplicate (Hannah
 * 2026-11-11). The remarks are appended to the order's remarks as a stamp
 * naming the twins; differing remarks clear the flag (lib/hmo-duplicates).
 * Returns the fresh flag lists for the order and its twins.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !NOT_DUP_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const orderId = typeof body.orderId === 'string' ? body.orderId : ''
    const remarks = typeof body.remarks === 'string' ? body.remarks.replace(/\s+/g, ' ').trim() : ''
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    if (!remarks) return NextResponse.json({ error: 'Write what sets this session apart' }, { status: 400 })
    if (remarks.length > MAX_REMARKS) {
      return NextResponse.json({ error: `Keep the remarks under ${MAX_REMARKS} characters` }, { status: 400 })
    }

    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true, notes: true } })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const twins = (await possibleDuplicates(prisma, [orderId])).get(orderId) ?? []
    if (!twins.length) {
      return NextResponse.json({ error: 'This session is no longer flagged as a possible duplicate. Refresh the page.' }, { status: 409 })
    }

    const userName = (session.user.name as string) || 'Unknown'
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    const stamp = notDuplicateStamp(twins, remarks, userName, day)
    await prisma.order.update({
      where: { id: orderId },
      data: { notes: order.notes ? `${order.notes} | ${stamp}` : stamp },
    })

    // A twin can still pair with a third order, so send fresh lists for all.
    const twinRows = await prisma.order.findMany({ where: { orderNumber: { in: twins } }, select: { id: true } })
    const ids = [orderId, ...twinRows.map(r => r.id)]
    const after = await possibleDuplicates(prisma, ids)
    const dupOf: Record<string, number[]> = Object.fromEntries(ids.map(id => [id, after.get(id) ?? []]))

    await prisma.auditLog.create({
      data: {
        userId: session.user.id as string,
        action: 'HMO_NOT_DUPLICATE',
        entity: 'order',
        entityId: orderId,
        details: { orderNumber: order.orderNumber, twins, remarks },
      },
    })

    return NextResponse.json({ orderId, dupOf, notDuplicateNote: stamp })
  } catch (err) {
    console.error('[AR not-duplicate] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
