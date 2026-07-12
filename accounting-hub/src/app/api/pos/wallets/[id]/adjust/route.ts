import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Manually restore a GL wallet's remaining balance when a voided order failed to
// return the charged amount. Increments the balance and writes a VOID_REVERSAL log
// (parseable amount + tagged voided order #) so it shows in the running-balance ledger.
const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id } = await params
    const body = await req.json()
    const amount = Number(body.amount)
    const orderNumber = body.orderNumber != null ? String(body.orderNumber).trim().replace(/^#/, '') : ''
    const reason = body.reason ? String(body.reason).trim() : ''
    if (!(amount > 0)) return NextResponse.json({ error: 'Enter an amount greater than zero.' }, { status: 400 })

    const wallet = await prisma.digitalWallet.findUnique({ where: { id } })
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    if (wallet.walletType !== 'GL') return NextResponse.json({ error: 'Balance adjustments are only for GL wallets.' }, { status: 400 })

    // Amount is formatted into the description so the GL ledger parses it as a credit.
    const fmt = amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const orderTag = orderNumber ? ` from voided order #${orderNumber}` : ''
    const reasonTag = reason ? ` — ${reason}` : ''
    const description = `Balance adjustment: +₱${fmt} restored${orderTag}${reasonTag}`

    await prisma.$transaction([
      prisma.digitalWallet.update({ where: { id }, data: { balance: { increment: amount } } }),
      prisma.walletLog.create({ data: { walletId: id, action: 'VOID_REVERSAL', description, createdById: session.user!.id as string } }),
      prisma.auditLog.create({ data: { userId: session.user!.id as string, action: 'WALLET_ADJUST', entity: 'digitalWallet', entityId: id, details: { amount, orderNumber: orderNumber || null, reason: reason || null } } }),
    ])

    const updated = await prisma.digitalWallet.findUnique({ where: { id }, select: { balance: true } })
    return NextResponse.json({ ok: true, balance: Number(updated?.balance ?? 0) })
  } catch (e) {
    console.error('Wallet adjust error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to adjust balance' }, { status: 500 })
  }
}
