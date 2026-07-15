import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createCheckoutSession, expireCheckout, paymongoConfigured, paymongoLivemode } from '@/lib/paymongo'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

// GET → config status + recent PayMongo transactions (for the monitor page).
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const recent = await prisma.paymongoCheckout.findMany({
    orderBy: { createdAt: 'desc' }, take: 100,
    select: { id: true, referenceCode: true, description: true, branch: true, amount: true, status: true, checkoutUrl: true, fee: true, netAmount: true, paidAt: true, livemode: true, createdAt: true },
  })
  return NextResponse.json({ configured: paymongoConfigured(), livemode: paymongoLivemode(), recent })
}

// POST { amountPhp, description?, referenceCode?, branch?, orderId?, paymentMethodTypes? }
// Creates a PayMongo checkout session and returns its URL. The sale is confirmed later
// via the webhook (payment.paid).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  if (!paymongoConfigured()) return NextResponse.json({ error: 'PayMongo is not configured on the server (PAYMONGO_SECRET_KEY missing).' }, { status: 400 })
  try {
    const b = await req.json()
    const amountPhp = Number(b.amountPhp)
    if (!(amountPhp > 0)) return NextResponse.json({ error: 'A positive amount is required' }, { status: 400 })
    const referenceCode = (b.referenceCode || `POS-${Date.now()}`).toString().slice(0, 60)

    const origin = new URL(req.url).origin
    const cs = await createCheckoutSession({
      amountPhp,
      description: b.description || 'POS payment',
      referenceCode,
      lineItemName: b.description || 'POS payment',
      successUrl: `${origin}/pos?paymongo=success&ref=${encodeURIComponent(referenceCode)}`,
      cancelUrl: `${origin}/pos?paymongo=cancelled&ref=${encodeURIComponent(referenceCode)}`,
      paymentMethodTypes: Array.isArray(b.paymentMethodTypes) ? b.paymentMethodTypes : undefined,
      metadata: { referenceCode, branch: b.branch || '', orderId: b.orderId || '' },
    })

    const rec = await prisma.paymongoCheckout.create({
      data: {
        checkoutId: cs.id, referenceCode, orderId: b.orderId || null, branch: b.branch || null,
        description: b.description || null, amount: amountPhp, status: 'PENDING', checkoutUrl: cs.checkoutUrl,
        livemode: paymongoLivemode(), raw: cs.raw as object, createdById: session.user.id ?? null,
      },
    })
    return NextResponse.json({ id: rec.id, checkoutId: cs.id, checkoutUrl: cs.checkoutUrl, referenceCode })
  } catch (e) {
    console.error('PayMongo checkout error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create checkout' }, { status: 500 })
  }
}

// DELETE ?id=<PaymongoCheckout id or checkoutId> — remove an UNPAID payment link.
// Expires the PayMongo session (so it can't be paid) and voids the unpaid POS order
// created with it. Paid links are protected — void the POS order instead.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const rec = await prisma.paymongoCheckout.findFirst({ where: { OR: [{ id }, { checkoutId: id }] } })
  if (!rec) return NextResponse.json({ error: 'Payment link not found' }, { status: 404 })
  if (rec.status === 'PAID') {
    return NextResponse.json({ error: 'This link is already paid and recorded — void the POS order instead of deleting the link.' }, { status: 400 })
  }

  // Best-effort: expire the session on PayMongo so the link is dead.
  if (rec.status === 'PENDING' && rec.checkoutId) {
    try { await expireCheckout(rec.checkoutId) } catch (e) { console.warn('[PayMongo] expire on delete failed (non-fatal):', e) }
  }
  // Void the linked, never-paid POS order so it doesn't linger as UNPAID.
  if (rec.orderId) {
    const order = await prisma.order.findUnique({ where: { id: rec.orderId }, select: { paymentStatus: true } })
    if (order && order.paymentStatus === 'UNPAID') {
      await prisma.order.update({ where: { id: rec.orderId }, data: { status: 'VOIDED' } })
    }
  }
  await prisma.paymongoCheckout.delete({ where: { id: rec.id } })
  return NextResponse.json({ ok: true })
}
