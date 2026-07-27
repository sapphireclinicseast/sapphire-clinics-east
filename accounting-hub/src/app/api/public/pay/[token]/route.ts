import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createCheckoutSession, paymongoConfigured, paymongoLivemode } from '@/lib/paymongo'
import { checkVoucher, recordRedemption } from '@/lib/vouchers'

/**
 * PUBLIC (no auth) — the payer-facing side of a reusable payment link.
 *
 * GET  /api/public/pay/<token>  → what is being paid for + the current price.
 * POST /api/public/pay/<token>  → the payer's details + optional voucher; mints a fresh
 *                                 PayMongo checkout session and returns its URL.
 *
 * Prices are always re-read from the catalogue, never taken from the request, so a stale or
 * tampered page can't change what is charged.
 */

async function loadLink(token: string) {
  const link = await prisma.paymentLink.findUnique({ where: { token } })
  if (!link || !link.isActive) return null
  // Re-read the live price/name so an updated rate applies to new payers immediately.
  let unitPrice = Number(link.unitPrice)
  let itemName = link.itemName
  if (link.serviceId) {
    const svc = await prisma.service.findUnique({ where: { id: link.serviceId }, select: { name: true, price: true, isActive: true } })
    if (!svc || !svc.isActive) return null
    unitPrice = Number(svc.price); itemName = svc.name
  } else if (link.inventoryItemId) {
    const inv = await prisma.inventoryItem.findUnique({ where: { id: link.inventoryItemId }, select: { name: true, sellingPrice: true, isActive: true } })
    if (!inv || !inv.isActive || inv.sellingPrice == null) return null
    unitPrice = Number(inv.sellingPrice); itemName = inv.name
  }
  return { link, unitPrice, itemName, gross: Math.round(unitPrice * link.quantity * 100) / 100 }
}

const DEPT_LABELS: Record<string, string> = {
  PT: 'Physical Therapy', OT: 'Occupational Therapy', ST: 'Speech Therapy',
  SLP: 'Speech-Language Pathology', SPED: 'Special Education', PSY: 'Psychology',
  PSYCHOLOGY: 'Psychology', MD: 'Medical Consultation', CLI: 'Clinic',
  DIG: 'Digital & Tech', EDU: 'Training & Education', MER: 'Merchandise', OTHER: 'Other',
}

const BRANCH_LABEL: Record<string, string> = {
  AHEA: 'Aura Health Rehab — East Branch',
  AHGH: 'Aura Health Rehab — Greenhills Branch',
  VERDANA: 'Verdana Store',
  AHI: 'Aura Health Institute',
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await loadLink(token)
  if (!found) return NextResponse.json({ error: 'This payment link is not available.' }, { status: 404 })
  const { link, itemName, gross } = found
  // A promo baked into the link applies to everyone — reflect it in the shown price and
  // don't ask the payer for a code in that case.
  let linkDiscount = 0
  if (link.voucherCode) {
    const chk = await checkVoucher(prisma, { code: link.voucherCode, account: link.account, amountPhp: gross, atCreation: true })
    if (chk.ok) linkDiscount = chk.discount || 0
  }
  return NextResponse.json({
    itemName, quantity: link.quantity, amount: gross,
    // Shown to the payer so "TELETHERAPY" alone isn't ambiguous.
    department: link.department,
    departmentLabel: link.department ? (DEPT_LABELS[link.department.toUpperCase()] || link.department) : null,
    linkVoucherCode: link.voucherCode, linkDiscount,
    charged: Math.round((gross - linkDiscount) * 100) / 100,
    allowVoucher: link.allowVoucher && !link.voucherCode,
    account: link.account, branchLabel: BRANCH_LABEL[link.account] || link.account,
    configured: paymongoConfigured(link.account),
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const found = await loadLink(token)
    if (!found) return NextResponse.json({ error: 'This payment link is not available.' }, { status: 404 })
    const { link, itemName, gross } = found
    if (!paymongoConfigured(link.account)) {
      return NextResponse.json({ error: 'Online payment is temporarily unavailable. Please contact the clinic.' }, { status: 503 })
    }

    const b = await req.json()
    const firstName = String(b.firstName || '').trim()
    const lastName = String(b.lastName || '').trim()
    const phone = String(b.phone || '').trim()
    const email = String(b.email || '').trim()
    if (!firstName || !lastName) return NextResponse.json({ error: 'Please enter your first and last name.' }, { status: 400 })
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    if (phone.replace(/\D/g, '').length < 7) return NextResponse.json({ error: 'Please enter a valid contact number.' }, { status: 400 })

    // Voucher (optional) — full checks now apply because we know the payer's email.
    let voucherId: string | null = null, voucherCode: string | null = null
    let discountAmount = 0, amountPhp = gross
    // The link's own promo wins; otherwise use whatever the payer typed.
    const rawCode = link.voucherCode || String(b.voucherCode || '').trim()
    if (rawCode) {
      if (!link.voucherCode && !link.allowVoucher) return NextResponse.json({ error: 'Vouchers are not accepted on this link.' }, { status: 400 })
      const chk = await checkVoucher(prisma, { code: rawCode, account: link.account, amountPhp: gross, customerEmail: email })
      if (!chk.ok) return NextResponse.json({ error: chk.reason || 'That voucher code is not valid.' }, { status: 400 })
      voucherId = chk.voucher!.id; voucherCode = chk.voucher!.code
      discountAmount = chk.discount || 0
      amountPhp = chk.netAmount ?? gross
    }
    if (!(amountPhp > 0)) return NextResponse.json({ error: 'This voucher covers the full amount — please contact the clinic.' }, { status: 400 })

    const referenceCode = `${link.account}-${Date.now()}`.slice(0, 60)
    const origin = new URL(req.url).origin
    const customerName = `${firstName} ${lastName}`.trim()
    const description = `${itemName}${link.quantity > 1 ? ` x${link.quantity}` : ''}`

    const cs = await createCheckoutSession({
      account: link.account,
      amountPhp,
      description,
      lineItemName: description,
      referenceCode,
      successUrl: `${origin}/pay/${token}?status=success`,
      cancelUrl: `${origin}/pay/${token}?status=cancelled`,
      // Prefill from what the payer typed here — QRPh never asks for it on PayMongo's side.
      customerName, customerEmail: email, customerPhone: phone,
      metadata: { referenceCode, account: link.account, customer: customerName, email, ...(voucherCode ? { voucherCode } : {}) },
    })

    await prisma.$transaction(async (tx) => {
      await tx.paymongoCheckout.create({
        data: {
          checkoutId: cs.id, referenceCode, account: link.account, branch: link.branch,
          paymentLinkId: link.id,
          serviceId: link.serviceId, inventoryItemId: link.inventoryItemId,
          itemName, quantity: link.quantity,
          customerFirstName: firstName, customerLastName: lastName, customerPhone: phone, customerEmail: email,
          voucherId, voucherCode, grossAmount: gross, discountAmount,
          description, amount: amountPhp, status: 'PENDING', checkoutUrl: cs.checkoutUrl,
          livemode: paymongoLivemode(link.account), raw: cs.raw as object,
        },
      })
      if (voucherId) {
        await recordRedemption(tx, { voucherId, checkoutId: cs.id, customerEmail: email, account: link.account, discountAmount })
      }
    })

    return NextResponse.json({ checkoutUrl: cs.checkoutUrl, amount: amountPhp, discountAmount, voucherCode })
  } catch (e) {
    console.error('Public pay error:', e)
    return NextResponse.json({ error: 'Sorry, we could not start your payment. Please try again.' }, { status: 500 })
  }
}
