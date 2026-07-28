import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

/**
 * Settled PayMongo payments waiting to be put on the patient's ADVANCE wallet.
 *
 * Paying online is not the session — it is money on account. So a settled payment becomes an
 * ADVANCE wallet balance, and when the session actually happens the order raised from the
 * Clinic Schedule is paid from that wallet, which is what recognises the revenue and clears
 * the 4050 Unearned Revenue liability (see post-order.ts wallet draw-down).
 *
 * No journal entry is written here on purpose: the money was already booked when the payment
 * settled (DR PayMongo Clearing + DR Fees / CR 4050 Unearned Revenue, see postPaymongoSale).
 * Loading the wallet is an operational record of whose money it is, not a second receipt —
 * writing a JE here would credit the liability twice.
 *
 * GET  ?branch=…                → the queue the cashier sees in POS
 * POST { checkoutId, patientId?, patientName? } → load it onto the wallet
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const branch = String(new URL(req.url).searchParams.get('branch') || '')
  const rows = await prisma.paymongoCheckout.findMany({
    where: {
      status: 'PAID',
      advanceWalletId: null,      // not yet on a wallet
      orderId: null,              // and not recorded as a sale by the legacy POS-links flow
      ...(branch ? { branch } : {}),
    },
    orderBy: { paidAt: 'desc' },
    take: 100,
    select: {
      id: true, checkoutId: true, referenceCode: true, account: true, branch: true,
      itemName: true, quantity: true, description: true,
      customerFirstName: true, customerLastName: true, customerEmail: true, customerPhone: true,
      voucherCode: true, grossAmount: true, discountAmount: true, amount: true,
      fee: true, netAmount: true, paidAt: true, paymentMethodUsed: true,
    },
  })
  return NextResponse.json(rows.map(r => ({
    ...r,
    customerName: [r.customerFirstName, r.customerLastName].filter(Boolean).join(' '),
    grossAmount: r.grossAmount == null ? null : Number(r.grossAmount),
    discountAmount: r.discountAmount == null ? null : Number(r.discountAmount),
    amount: Number(r.amount),
    fee: r.fee == null ? null : Number(r.fee),
    netAmount: r.netAmount == null ? null : Number(r.netAmount),
  })))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const b = await req.json()
    const checkoutId = String(b.checkoutId || '')
    if (!checkoutId) return NextResponse.json({ error: 'checkoutId is required' }, { status: 400 })

    const co = await prisma.paymongoCheckout.findFirst({ where: { OR: [{ id: checkoutId }, { checkoutId }] } })
    if (!co) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (co.status !== 'PAID') return NextResponse.json({ error: 'Only settled payments can be put on an advance' }, { status: 400 })
    if (co.advanceWalletId) return NextResponse.json({ error: 'This payment is already on an advance' }, { status: 400 })
    if (co.orderId) return NextResponse.json({ error: 'This payment is already recorded as an order' }, { status: 400 })

    // The payer typed their own name at checkout; a cashier can correct it when converting.
    const patientName = String(b.patientName || '').trim()
      || [co.customerFirstName, co.customerLastName].filter(Boolean).join(' ').trim()
    if (!patientName) return NextResponse.json({ error: 'A patient name is required' }, { status: 400 })

    // Same key the Digital Wallet panel uses, so this tops up the wallet staff already see
    // rather than creating a parallel one.
    const patientId = String(b.patientId || '').trim() || `ADVANCE-${patientName.replace(/\s+/g, '-').toUpperCase()}`
    const amount = Number(co.amount)
    if (!(amount > 0)) return NextResponse.json({ error: 'This payment has no amount' }, { status: 400 })

    const result = await prisma.$transaction(async (tx) => {
      let wallet = await tx.digitalWallet.findFirst({
        where: { patientId, walletType: 'ADVANCE', isActive: true },
      })

      const before = wallet ? Number(wallet.balance) : 0
      if (wallet) {
        wallet = await tx.digitalWallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: amount } },
        })
      } else {
        wallet = await tx.digitalWallet.create({
          data: {
            patientId, patientName,
            patientEmail: co.customerEmail || null,
            barcode: `SCEI-ADV-${Date.now().toString(36).toUpperCase()}`,
            walletType: 'ADVANCE',
            balance: amount,
            branch: co.branch || 'ALL',
          },
        })
      }

      await tx.walletLog.create({
        data: {
          walletId: wallet.id,
          action: 'RELOAD',
          description: `PayMongo advance — ${co.itemName || co.description || 'online payment'}`
            + `${co.paymentMethodUsed ? ` (${co.paymentMethodUsed})` : ''}`
            + `${co.referenceCode ? ` · ${co.referenceCode}` : ''}`,
          balanceBefore: Math.round(before),
          balanceAfter: Math.round(before + amount),
          createdById: session.user!.id as string,
        },
      })

      await tx.paymongoCheckout.update({
        where: { id: co.id },
        data: { advanceWalletId: wallet.id, convertedAt: new Date() },
      })

      return wallet
    })

    return NextResponse.json({
      ok: true,
      walletId: result.id,
      patientName: result.patientName,
      balance: Number(result.balance),
      loaded: amount,
      message: `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} added to ${result.patientName}'s advance. `
        + `Charge the session against it in the Digital Wallet tab when they come in.`,
    })
  } catch (e) {
    console.error('PayMongo convert-to-advance error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to record the advance' }, { status: 500 })
  }
}
