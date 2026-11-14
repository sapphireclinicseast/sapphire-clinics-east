// Look up a gift card at the Cashier: GET ?code=GC-XXXXXXXX&for=sell|pay
//   for=sell → the card must be UNSOLD; returns its id and face value so the
//              till can add it as the order line.
//   for=pay  → the card must be ACTIVE with a balance; returns the balance.
// Any signed-in user may look one up. Nothing changes here — the sale and the
// draw-down happen in order creation, server-side and atomically.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const code = (sp.get('code') || '').trim().toUpperCase()
  const mode = sp.get('for') === 'sell' ? 'sell' : 'pay'
  if (!code) return NextResponse.json({ error: 'Scan or type the gift card code' }, { status: 400 })
  const c = await prisma.giftCard.findUnique({ where: { code } })
  if (!c) {
    const isVoucher = code.startsWith('VC-') && await prisma.serviceVoucher.findUnique({ where: { code }, select: { id: true } })
    return NextResponse.json({ error: isVoucher ? `${code} is a discount voucher — apply it in the Discounts section` : 'Gift card not found — check the code' }, { status: 404 })
  }
  const balance = Number(c.balance)
  const faceValue = Number(c.faceValue)
  if (c.status === 'VOIDED') return NextResponse.json({ error: `Gift card ${c.code} has been voided` }, { status: 400 })
  if (mode === 'sell') {
    if (c.status !== 'UNSOLD') return NextResponse.json({ error: `Gift card ${c.code} was already sold${c.soldAt ? ` on ${c.soldAt.toISOString().slice(0, 10)}` : ''}` }, { status: 400 })
  } else {
    if (c.status === 'UNSOLD') return NextResponse.json({ error: `Gift card ${c.code} has not been sold yet — it has no value until it is paid for` }, { status: 400 })
    if (c.status === 'USED_UP' || balance <= 0) return NextResponse.json({ error: `Gift card ${c.code} has no balance left` }, { status: 400 })
  }
  return NextResponse.json({ id: c.id, code: c.code, status: c.status, faceValue, balance })
}
