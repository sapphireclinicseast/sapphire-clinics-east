import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Correct a GL wallet's STARTING balance (the usable amount at creation). The starting
// balance is derived as storedBalance − Σ(ledger movements), so to set it to a target
// we set storedBalance = target + Σ(credit − debit). This shifts the remaining balance
// by the same delta without adding any ledger row.
const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id } = await params
    const body = await req.json()
    const startingBalance = Number(body.startingBalance)
    if (isNaN(startingBalance) || startingBalance < 0) return NextResponse.json({ error: 'Enter a valid starting balance.' }, { status: 400 })

    const wallet = await prisma.digitalWallet.findUnique({ where: { id }, select: { walletType: true, balance: true } })
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    if (wallet.walletType !== 'GL') return NextResponse.json({ error: 'Starting-balance correction is only for GL wallets.' }, { status: 400 })

    // Net of ledger movements (same derivation as the GL running-balance ledger):
    // non-voided GL order payments are debits; VOID_REVERSAL logs are credits.
    const [glPayments, glVoidLogs] = await Promise.all([
      prisma.orderPayment.findMany({ where: { walletId: id, method: 'GL' }, include: { order: { select: { status: true } } } }),
      prisma.walletLog.findMany({ where: { walletId: id, action: 'VOID_REVERSAL' }, select: { description: true } }),
    ])
    let runningCheck = 0
    for (const p of glPayments) if (p.order.status !== 'VOIDED') runningCheck -= Number(p.amount)
    for (const log of glVoidLogs) { const m = log.description.match(/[\d,]+\.\d{1,2}/); if (m) runningCheck += parseFloat(m[0].replace(/,/g, '')) }

    const oldStarting = Number((Number(wallet.balance) - runningCheck).toFixed(2))
    const newBalance = Number((startingBalance + runningCheck).toFixed(2))

    await prisma.$transaction([
      prisma.digitalWallet.update({ where: { id }, data: { balance: newBalance } }),
      prisma.auditLog.create({ data: { userId: session.user!.id as string, action: 'WALLET_STARTING_BALANCE', entity: 'digitalWallet', entityId: id, details: { oldStarting, newStarting: startingBalance, oldBalance: Number(wallet.balance), newBalance } } }),
    ])
    return NextResponse.json({ ok: true, startingBalance, balance: newBalance, oldStarting })
  } catch (e) {
    console.error('Wallet starting-balance error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to set starting balance' }, { status: 500 })
  }
}
