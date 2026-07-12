// Buybacks against a common shareholding — a shareholder may have several.
// Each buyback posts its own DR Treasury / CR Bank journal entry.
//   GET    ?commonShareId= → list buybacks for that shareholding
//   POST   { commonShareId, date, shares, price, bankAccountId, treasuryAccountId, proofUrls } → add + post JE
//   DELETE ?id= → remove a buyback + reverse its JE
// Access: ADMIN only (matches the common-share routes).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postEquityBuyback } from '@/lib/accounting/equity'

const ADMIN = ['ADMIN']
const num = (v: unknown) => Number(v || 0)

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const commonShareId = new URL(req.url).searchParams.get('commonShareId') || ''
  if (!commonShareId) return NextResponse.json({ error: 'commonShareId required' }, { status: 400 })
  const buybacks = await prisma.shareBuyback.findMany({ where: { commonShareId }, orderBy: { date: 'asc' } })
  return NextResponse.json(buybacks.map(b => ({ id: b.id, date: b.date, shares: num(b.shares), price: num(b.price), amount: num(b.shares) * num(b.price), bankAccountId: b.bankAccountId, treasuryAccountId: b.treasuryAccountId, proofUrls: b.proofUrls })))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const commonShareId = String(b.commonShareId || '')
    const shares = num(b.shares), price = num(b.price)
    if (!commonShareId) return NextResponse.json({ error: 'commonShareId is required' }, { status: 400 })
    if (!(shares > 0)) return NextResponse.json({ error: 'Shares bought back must be greater than zero' }, { status: 400 })
    if (!(price > 0)) return NextResponse.json({ error: 'Buyback price must be greater than zero' }, { status: 400 })
    const share = await prisma.commonShare.findUnique({ where: { id: commonShareId }, include: { shareholder: { select: { name: true } }, buybacks: { select: { shares: true } } } })
    if (!share) return NextResponse.json({ error: 'Shareholding not found' }, { status: 404 })
    // A shareholder can never buy back more than they hold (across all buybacks).
    const already = share.buybacks.reduce((s, x) => s + num(x.shares), 0)
    if (already + shares > num(share.numberOfShares) + 1e-9) {
      return NextResponse.json({ error: `Only ${num(share.numberOfShares) - already} shares remain to buy back (holds ${num(share.numberOfShares)}, already bought back ${already}).` }, { status: 400 })
    }
    const date = b.date ? new Date(b.date) : new Date()
    const created = await prisma.$transaction(async (tx) => {
      const bb = await tx.shareBuyback.create({ data: {
        commonShareId, date, shares, price, bankAccountId: b.bankAccountId || null, treasuryAccountId: b.treasuryAccountId || null,
        proofUrls: Array.isArray(b.proofUrls) ? b.proofUrls : undefined, createdById: session.user!.id ?? null,
      } })
      const jeId = await postEquityBuyback(tx, { refId: bb.id, date, amount: shares * price, bankAccountId: b.bankAccountId, treasuryAccountId: b.treasuryAccountId, investor: share.shareholder.name, createdById: session.user!.id as string })
      if (jeId) await tx.shareBuyback.update({ where: { id: bb.id }, data: { journalEntryId: jeId } })
      // Keep the legacy flag in sync so anything still reading it sees "bought back".
      await tx.commonShare.update({ where: { id: commonShareId }, data: { boughtBack: true } })
      return bb
    })
    return NextResponse.json({ id: created.id })
  } catch (e) {
    console.error('Buyback create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const bb = await prisma.shareBuyback.findUnique({ where: { id } })
  if (!bb) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.$transaction(async (tx) => {
    if (bb.journalEntryId) await tx.journalEntry.deleteMany({ where: { id: bb.journalEntryId } })
    await tx.shareBuyback.delete({ where: { id } })
    const remaining = await tx.shareBuyback.count({ where: { commonShareId: bb.commonShareId } })
    if (remaining === 0) await tx.commonShare.update({ where: { id: bb.commonShareId }, data: { boughtBack: false } })
  })
  return NextResponse.json({ success: true })
}
