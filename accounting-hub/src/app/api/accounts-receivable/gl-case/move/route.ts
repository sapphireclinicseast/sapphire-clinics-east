import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/accounts-receivable/gl-case/move  { fromWalletId, toWalletId }
 *
 * Moves the Detailed GL paper trail from one Guarantee Letter wallet to another.
 *
 * A wallet-backed row IS its wallet, so it cannot be re-pointed the way a
 * standalone entry can. What staff actually need when they say "wrong wallet" is
 * for the case tracking they typed — dates, SOA amount, guardian, QB entry — to
 * sit on the other letter instead. That is this: the fields move, and the wallets
 * themselves are untouched. Balances, approved amounts, payments and orders all
 * stay exactly where they are; this route cannot reach them.
 *
 * Refuses rather than overwrites. If the destination already has any of these
 * fields filled, the response names them and nothing is written — losing a
 * recorded figure silently is worse than making someone clear it first.
 */
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN',
  'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

const CASE_FIELDS = [
  'glRequestedAmount', 'glDocsSubmittedAt', 'glReleasedAt',
  'soaAmount', 'soaSubmittedAt', 'guardianName',
  'soaCommissionRate', 'payoutBatch', 'qbEntry',
] as const

const LABELS: Record<string, string> = {
  glRequestedAmount: 'Requested GL', glDocsSubmittedAt: 'Date submission of documents',
  glReleasedAt: 'GL release date', soaAmount: 'Amount in SOA',
  soaSubmittedAt: 'Date submission of SOA', guardianName: 'Guardian name',
  soaCommissionRate: 'GL processor fee rate', payoutBatch: 'Payout', qbEntry: 'QB entry',
}

const SELECT = Object.fromEntries([...CASE_FIELDS, 'id', 'patientName', 'walletType'].map(f => [f, true]))

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const fromWalletId = String(body.fromWalletId ?? '')
    const toWalletId = String(body.toWalletId ?? '')
    if (!fromWalletId || !toWalletId) {
      return NextResponse.json({ error: 'fromWalletId and toWalletId are required' }, { status: 400 })
    }
    if (fromWalletId === toWalletId) {
      return NextResponse.json({ error: 'Pick a different wallet to move the details to' }, { status: 400 })
    }

    const [from, to] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma.digitalWallet.findUnique({ where: { id: fromWalletId }, select: SELECT as any }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma.digitalWallet.findUnique({ where: { id: toWalletId }, select: SELECT as any }),
    ]) as unknown as [Record<string, unknown> | null, Record<string, unknown> | null]

    if (!from) return NextResponse.json({ error: 'That letter no longer exists' }, { status: 404 })
    if (!to) return NextResponse.json({ error: 'The destination letter no longer exists' }, { status: 404 })
    if (from.walletType !== 'GL' || to.walletType !== 'GL') {
      return NextResponse.json({ error: 'Both must be Guarantee Letter wallets' }, { status: 400 })
    }

    const occupied = CASE_FIELDS.filter(f => to[f] !== null && to[f] !== undefined)
    if (occupied.length) {
      return NextResponse.json({
        error: `${to.patientName} already has ${occupied.map(f => LABELS[f]).join(', ')} recorded. `
             + 'Clear those first, or move the details to a letter with none.',
      }, { status: 409 })
    }

    const moving = CASE_FIELDS.filter(f => from[f] !== null && from[f] !== undefined)
    if (!moving.length) {
      return NextResponse.json({ error: 'There is nothing recorded on this letter to move' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set: any = {}, clear: any = {}
    for (const f of moving) { set[f] = from[f]; clear[f] = null }

    await prisma.$transaction([
      prisma.digitalWallet.update({ where: { id: toWalletId }, data: set }),
      prisma.digitalWallet.update({ where: { id: fromWalletId }, data: clear }),
    ])

    return NextResponse.json({
      ok: true,
      moved: moving.map(f => LABELS[f]),
      from: from.patientName,
      to: to.patientName,
    })
  } catch (e) {
    console.error('GL case move error:', e)
    return NextResponse.json({ error: 'Failed to move the details' }, { status: 500 })
  }
}
