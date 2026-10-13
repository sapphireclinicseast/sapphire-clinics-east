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
  const sp = new URL(req.url).searchParams
  const branch = String(sp.get('branch') || '')

  // ?converted=1 → the recent conversions, so a wrong one can be undone from
  // the same card. Only conversions whose money is still sitting on the wallet
  // as an advance (no order raised from this checkout) are listed.
  if (sp.get('converted') === '1') {
    const conv = await prisma.paymongoCheckout.findMany({
      where: { status: 'PAID', advanceWalletId: { not: null }, orderId: null, ...(branch ? { branch } : {}) },
      orderBy: { convertedAt: 'desc' },
      take: 15,
      select: {
        id: true, checkoutId: true, referenceCode: true, itemName: true, description: true,
        customerFirstName: true, customerLastName: true, amount: true, paidAt: true,
        convertedAt: true, advanceWalletId: true, paymentMethodUsed: true,
      },
    })
    const wids = [...new Set(conv.map(r => r.advanceWalletId).filter((x): x is string => !!x))]
    const wallets = wids.length ? await prisma.digitalWallet.findMany({ where: { id: { in: wids } }, select: { id: true, patientName: true, balance: true } }) : []
    const wOf = (id: string | null) => wallets.find(w => w.id === id)
    return NextResponse.json(conv.map(r => ({
      id: r.id, checkoutId: r.checkoutId, referenceCode: r.referenceCode,
      itemName: r.itemName, description: r.description,
      customerName: [r.customerFirstName, r.customerLastName].filter(Boolean).join(' '),
      amount: Number(r.amount), paidAt: r.paidAt, convertedAt: r.convertedAt,
      paymentMethodUsed: r.paymentMethodUsed,
      walletName: wOf(r.advanceWalletId)?.patientName || null,
      walletBalance: wOf(r.advanceWalletId) ? Number(wOf(r.advanceWalletId)!.balance) : null,
    })))
  }

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

// DELETE ?checkoutId=… — undo a conversion: take the amount back off the
// patient's ADVANCE wallet (logged as a DEDUCTION) and return the payment to
// the queue. Refused when the wallet no longer holds the full amount — part of
// it was already charged to a session, and that charge must be undone first.
// No journal entry moves: the conversion never posted one.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const checkoutId = String(new URL(req.url).searchParams.get('checkoutId') || '')
  if (!checkoutId) return NextResponse.json({ error: 'checkoutId is required' }, { status: 400 })
  try {
    const co = await prisma.paymongoCheckout.findFirst({ where: { OR: [{ id: checkoutId }, { checkoutId }] } })
    if (!co) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (!co.advanceWalletId) return NextResponse.json({ error: 'This payment is not on an advance' }, { status: 400 })
    if (co.orderId) return NextResponse.json({ error: 'This payment is already recorded as an order' }, { status: 400 })
    const amount = Number(co.amount)

    await prisma.$transaction(async (tx) => {
      const wallet = await tx.digitalWallet.findUnique({ where: { id: co.advanceWalletId! } })
      if (wallet) {
        const before = Number(wallet.balance)
        if (before + 1e-9 < amount) {
          throw new Error(`Only ₱${before.toLocaleString('en-PH', { minimumFractionDigits: 2 })} is left on ${wallet.patientName}'s advance — part of this payment was already charged to a session. Undo that charge first.`)
        }
        await tx.digitalWallet.update({ where: { id: wallet.id }, data: { balance: { decrement: amount } } })
        await tx.walletLog.create({
          data: {
            walletId: wallet.id,
            action: 'DEDUCTION',
            description: `Undo PayMongo advance conversion — returned to the POS queue${co.referenceCode ? ` · ${co.referenceCode}` : ''}`,
            balanceBefore: Math.round(before),
            balanceAfter: Math.round(before - amount),
            createdById: session.user!.id as string,
          },
        })
      }
      await tx.paymongoCheckout.update({ where: { id: co.id }, data: { advanceWalletId: null, convertedAt: null } })
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PayMongo advance undo error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to undo' }, { status: 500 })
  }
}
