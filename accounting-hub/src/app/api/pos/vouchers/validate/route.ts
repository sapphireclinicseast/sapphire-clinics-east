// Validate a voucher code at checkout: GET ?code=VC-XXXXXXXX
// Returns the discount it grants when the voucher is ACTIVE and unexpired.
// Any signed-in POS user may validate — redemption itself is marked by order
// creation, server-side, so front desk can accept vouchers without being able
// to create them.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const code = (new URL(req.url).searchParams.get('code') || '').trim().toUpperCase()
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
  const v = await prisma.serviceVoucher.findUnique({ where: { code }, include: { batch: true } })
  if (!v) return NextResponse.json({ error: 'Voucher not found — check the code' }, { status: 404 })
  if (v.status === 'USED') return NextResponse.json({ error: `Voucher ${v.code} was already redeemed${v.usedAt ? ` on ${new Date(v.usedAt).toISOString().slice(0, 10)}` : ''}` }, { status: 400 })
  if (v.status === 'VOIDED') return NextResponse.json({ error: `Voucher ${v.code} has been voided` }, { status: 400 })
  if (v.batch.validUntil < new Date()) return NextResponse.json({ error: `Voucher ${v.code} expired on ${new Date(v.batch.validUntil).toISOString().slice(0, 10)}` }, { status: 400 })
  return NextResponse.json({
    id: v.id, code: v.code,
    discountKind: v.batch.discountKind, value: Number(v.batch.value || 0),
    validUntil: v.batch.validUntil, reason: v.batch.reason,
  })
}
