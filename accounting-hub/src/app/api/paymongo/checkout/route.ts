import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createCheckoutSession, expireCheckout, paymongoConfigured, paymongoLivemode, isPaymongoAccount, PAYMONGO_ACCOUNTS } from '@/lib/paymongo'
import { checkVoucher, recordRedemption } from '@/lib/vouchers'

import { PAYMONGO_WRITE_ROLES as WRITE_ROLES } from '@/lib/paymongo-access'

const branchOf = (account: string) => PAYMONGO_ACCOUNTS.find(a => a.code === account)?.branch || null

/**
 * POST — generate a payment link on a specific branch's PayMongo account.
 * Body: { account, kind:'SERVICE'|'PRODUCT', itemId, quantity?, firstName, lastName, phone, email, voucherCode? }
 * The amount is taken from the chosen Service/Inventory item (server-side, so the client
 * can't set its own price), then any valid voucher discount is applied.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const b = await req.json()
    const account = String(b.account || '').toUpperCase()
    if (!isPaymongoAccount(account)) return NextResponse.json({ error: 'Valid account is required' }, { status: 400 })
    if (!paymongoConfigured(account)) {
      return NextResponse.json({ error: `PayMongo is not configured for ${account}. Set PAYMONGO_SECRET_KEY_${account} on the server.` }, { status: 400 })
    }

    // Payer details are NOT collected here — the customer types their name, email and phone
    // on PayMongo's hosted checkout page, and we capture them from the payment's billing
    // object when the link is paid (see /api/paymongo/transactions sync).

    const kind = b.kind === 'PRODUCT' ? 'PRODUCT' : 'SERVICE'
    const itemId = String(b.itemId || '')
    if (!itemId) return NextResponse.json({ error: 'Select a service or product' }, { status: 400 })
    const quantity = Math.max(1, parseInt(String(b.quantity ?? 1), 10) || 1)

    // Price comes from our own records, never the client.
    let itemName = ''
    let unitPrice = 0
    let serviceId: string | null = null
    let inventoryItemId: string | null = null
    let serviceDepartment: string | null = null
    if (kind === 'SERVICE') {
      const svc = await prisma.service.findUnique({ where: { id: itemId }, select: { id: true, name: true, price: true, department: true, isActive: true } })
      if (!svc || !svc.isActive) return NextResponse.json({ error: 'Service not found' }, { status: 404 })
      serviceId = svc.id; itemName = svc.name; unitPrice = Number(svc.price); serviceDepartment = svc.department
    } else {
      const inv = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true, name: true, sellingPrice: true, isActive: true } })
      if (!inv || !inv.isActive) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      if (inv.sellingPrice == null) return NextResponse.json({ error: `"${inv.name}" has no selling price set` }, { status: 400 })
      inventoryItemId = inv.id; itemName = inv.name; unitPrice = Number(inv.sellingPrice)
    }
    const grossAmount = Math.round(unitPrice * quantity * 100) / 100
    if (!(grossAmount > 0)) return NextResponse.json({ error: 'The selected item has no price' }, { status: 400 })

    // Voucher (optional). ONCE_PER_CUSTOMER can't be checked yet (payer unknown) — it is
    // re-verified when the payment lands, so pass atCreation.
    let voucherId: string | null = null
    let voucherCode: string | null = null
    let discountAmount = 0
    let amountPhp = grossAmount
    if (b.voucherCode && String(b.voucherCode).trim()) {
      const chk = await checkVoucher(prisma, { code: String(b.voucherCode), account, amountPhp: grossAmount, department: serviceDepartment, atCreation: true })
      if (!chk.ok) return NextResponse.json({ error: chk.reason || 'Invalid voucher' }, { status: 400 })
      voucherId = chk.voucher!.id
      voucherCode = chk.voucher!.code
      discountAmount = chk.discount || 0
      amountPhp = chk.netAmount ?? grossAmount
    }
    if (!(amountPhp > 0)) {
      return NextResponse.json({ error: 'The voucher covers the full amount — nothing left to charge online.' }, { status: 400 })
    }

    const referenceCode = `${account}-${Date.now()}`.slice(0, 60)
    const origin = new URL(req.url).origin
    const description = `${itemName}${quantity > 1 ? ` x${quantity}` : ''}`

    const cs = await createCheckoutSession({
      account,
      amountPhp,
      description,
      lineItemName: description,
      referenceCode,
      successUrl: `${origin}/paymongo?status=success&ref=${encodeURIComponent(referenceCode)}`,
      cancelUrl: `${origin}/paymongo?status=cancelled&ref=${encodeURIComponent(referenceCode)}`,
      // No billing passed on purpose: PayMongo's page asks the payer for their details.
      metadata: {
        referenceCode, account, kind, itemId,
        ...(voucherCode ? { voucherCode } : {}),
      },
    })

    const rec = await prisma.$transaction(async (tx) => {
      const created = await tx.paymongoCheckout.create({
        data: {
          checkoutId: cs.id, referenceCode, account, branch: branchOf(account),
          serviceId, inventoryItemId, itemName, quantity,
          voucherId, voucherCode,
          grossAmount, discountAmount,
          description, amount: amountPhp, status: 'PENDING', checkoutUrl: cs.checkoutUrl,
          livemode: paymongoLivemode(account), raw: cs.raw as object, createdById: session.user!.id ?? null,
        },
      })
      // Reserve the voucher now so MAX_USES holds even before payment; the payer's email is
      // filled in on this redemption when the payment lands. Deleting an unpaid link releases it.
      if (voucherId) {
        await recordRedemption(tx, { voucherId, checkoutId: cs.id, account, discountAmount })
      }
      return created
    })

    return NextResponse.json({
      id: rec.id, checkoutId: cs.id, checkoutUrl: cs.checkoutUrl, referenceCode,
      grossAmount, discountAmount, amount: amountPhp, voucherCode,
    })
  } catch (e) {
    console.error('PayMongo link create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create payment link' }, { status: 500 })
  }
}

// DELETE ?id= — kill an UNPAID link and release any voucher reservation.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const rec = await prisma.paymongoCheckout.findFirst({ where: { OR: [{ id }, { checkoutId: id }] } })
  if (!rec) return NextResponse.json({ error: 'Payment link not found' }, { status: 404 })
  if (rec.status === 'PAID') return NextResponse.json({ error: 'This link is already paid — it cannot be deleted.' }, { status: 400 })

  if (rec.status === 'PENDING' && rec.checkoutId && rec.account) {
    try { await expireCheckout(rec.account, rec.checkoutId) }
    catch (e) { console.warn('[PayMongo] expire on delete failed (non-fatal):', e) }
  }
  await prisma.$transaction(async (tx) => {
    if (rec.checkoutId) await tx.voucherRedemption.deleteMany({ where: { checkoutId: rec.checkoutId } })
    await tx.paymongoCheckout.delete({ where: { id: rec.id } })
  })
  return NextResponse.json({ success: true })
}
