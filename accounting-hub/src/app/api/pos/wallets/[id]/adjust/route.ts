import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Manually restore a GL wallet's remaining balance when a voided order failed to
// return the charged amount. Increments the balance and writes a VOID_REVERSAL log
// (parseable amount + tagged voided order #) so it shows in the running-balance ledger.
const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

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

// DELETE /api/pos/wallets/[id]/adjust?logId=<walletLogId>
// Reverses a manual balance adjustment: decrements the wallet balance by the logged
// amount and removes the adjustment log. Only manual adjustments (VOID_REVERSAL logs
// whose description we authored) can be deleted.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id } = await params
    const logId = new URL(req.url).searchParams.get('logId') || ''
    if (!logId) return NextResponse.json({ error: 'logId required' }, { status: 400 })
    const log = await prisma.walletLog.findUnique({ where: { id: logId } })
    if (!log || log.walletId !== id) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 })
    if (log.action !== 'VOID_REVERSAL' || !log.description.startsWith('Balance adjustment:')) {
      return NextResponse.json({ error: 'Only manual balance adjustments can be deleted here.' }, { status: 400 })
    }
    // The credited amount is embedded in the description (same value the ledger parses).
    const m = log.description.match(/[\d,]+\.\d{1,2}/)
    const amount = m ? parseFloat(m[0].replace(/,/g, '')) : 0

    await prisma.$transaction([
      prisma.digitalWallet.update({ where: { id }, data: { balance: { decrement: amount } } }),
      prisma.walletLog.delete({ where: { id: logId } }),
      prisma.auditLog.create({ data: { userId: session.user!.id as string, action: 'WALLET_ADJUST_DELETE', entity: 'digitalWallet', entityId: id, details: { logId, amount } } }),
    ])

    const updated = await prisma.digitalWallet.findUnique({ where: { id }, select: { balance: true } })
    return NextResponse.json({ ok: true, balance: Number(updated?.balance ?? 0) })
  } catch (e) {
    console.error('Wallet adjust delete error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to delete adjustment' }, { status: 500 })
  }
}
