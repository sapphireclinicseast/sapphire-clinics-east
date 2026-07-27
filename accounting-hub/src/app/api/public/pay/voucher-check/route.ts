import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkVoucher } from '@/lib/vouchers'

/**
 * PUBLIC (no auth) — preview a voucher on the payer page without consuming it.
 * Scoped to a payment-link token so a stranger can't probe codes against arbitrary amounts:
 * the amount and branch always come from the link, never from the request.
 */
export async function POST(req: Request) {
  try {
    const b = await req.json()
    const token = String(b.token || '')
    const link = await prisma.paymentLink.findUnique({ where: { token } })
    if (!link || !link.isActive) return NextResponse.json({ ok: false, reason: 'This payment link is not available.' }, { status: 404 })
    if (!link.allowVoucher) return NextResponse.json({ ok: false, reason: 'Vouchers are not accepted on this link.' })

    // Re-read the live price so the preview matches what will actually be charged.
    let unitPrice = Number(link.unitPrice)
    if (link.serviceId) {
      const svc = await prisma.service.findUnique({ where: { id: link.serviceId }, select: { price: true } })
      if (svc) unitPrice = Number(svc.price)
    } else if (link.inventoryItemId) {
      const inv = await prisma.inventoryItem.findUnique({ where: { id: link.inventoryItemId }, select: { sellingPrice: true } })
      if (inv?.sellingPrice != null) unitPrice = Number(inv.sellingPrice)
    }
    const gross = Math.round(unitPrice * link.quantity * 100) / 100

    const res = await checkVoucher(prisma, {
      code: String(b.code || ''),
      account: link.account,
      amountPhp: gross,
      customerEmail: b.email || null,
      // Needed by a PWD/Senior-gated code, which is matched against Patient CRM.
      customerFirstName: b.firstName || null,
      customerLastName: b.lastName || null,
      customerPhone: b.phone || null,
    })
    // Don't leak voucher internals to the public — just the outcome and amounts, plus the
    // matched patient name so the payer can see whose registered ID was recognised.
    return NextResponse.json({
      ok: res.ok, reason: res.reason, discount: res.discount, netAmount: res.netAmount,
      pwdPatientName: res.pwdPatientName,
    })
  } catch {
    return NextResponse.json({ ok: false, reason: 'Could not check that code.' }, { status: 500 })
  }
}
