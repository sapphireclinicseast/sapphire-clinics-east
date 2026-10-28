// Buybacks against a shareholding — a shareholder may have several. Works for
// COMMON holdings (buyback → treasury) and PREFERRED holdings (redemption /
// retirement) alike; exactly one of commonShareId / preferredShareId is given.
// Each buyback posts its own DR Treasury-or-equity / CR Bank journal entry.
//   GET    ?commonShareId= | ?preferredShareId= → list buybacks for that holding
//   POST   { commonShareId | preferredShareId, date, shares, price, bankAccountId, treasuryAccountId, proofUrls } → add + post JE
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
  const sp = new URL(req.url).searchParams
  const commonShareId = sp.get('commonShareId') || ''
  const preferredShareId = sp.get('preferredShareId') || ''
  if (!commonShareId && !preferredShareId) return NextResponse.json({ error: 'commonShareId or preferredShareId required' }, { status: 400 })
  const buybacks = await prisma.shareBuyback.findMany({ where: commonShareId ? { commonShareId } : { preferredShareId }, orderBy: { date: 'asc' } })
  return NextResponse.json(buybacks.map(b => ({ id: b.id, date: b.date, shares: num(b.shares), price: num(b.price), amount: num(b.shares) * num(b.price), bankAccountId: b.bankAccountId, treasuryAccountId: b.treasuryAccountId, proofUrls: b.proofUrls })))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const commonShareId = String(b.commonShareId || '')
    const preferredShareId = String(b.preferredShareId || '')
    const shares = num(b.shares), price = num(b.price)
    if (!commonShareId && !preferredShareId) return NextResponse.json({ error: 'commonShareId or preferredShareId is required' }, { status: 400 })
    if (commonShareId && preferredShareId) return NextResponse.json({ error: 'Give exactly one of commonShareId / preferredShareId' }, { status: 400 })
    if (!(shares > 0)) return NextResponse.json({ error: 'Shares bought back must be greater than zero' }, { status: 400 })
    if (!(price > 0)) return NextResponse.json({ error: 'Buyback price must be greater than zero' }, { status: 400 })
    const date = b.date ? new Date(b.date) : new Date()

    let holderName = ''
    if (commonShareId) {
      const share = await prisma.commonShare.findUnique({ where: { id: commonShareId }, include: { shareholder: { select: { name: true } }, buybacks: { select: { shares: true } } } })
      if (!share) return NextResponse.json({ error: 'Shareholding not found' }, { status: 404 })
      // A shareholder can never buy back more than they hold (across all buybacks).
      const already = share.buybacks.reduce((s, x) => s + num(x.shares), 0)
      if (already + shares > num(share.numberOfShares) + 1e-9) {
        return NextResponse.json({ error: `Only ${num(share.numberOfShares) - already} shares remain to buy back (holds ${num(share.numberOfShares)}, already bought back ${already}).` }, { status: 400 })
      }
      holderName = share.shareholder.name
    } else {
      const share = await prisma.preferredShare.findUnique({ where: { id: preferredShareId }, include: { shareholder: { select: { name: true } }, buybacks: { select: { shares: true } }, transfersOut: { select: { shares: true } } } })
      if (!share) return NextResponse.json({ error: 'Preferred shareholding not found' }, { status: 404 })
      // Net of the legacy manual retired counter, earlier redemptions, and
      // shares already sold on to another shareholder.
      const gone = num(share.retiredShares) + share.buybacks.reduce((s, x) => s + num(x.shares), 0) + share.transfersOut.reduce((s, x) => s + num(x.shares), 0)
      if (gone + shares > num(share.numberOfShares) + 1e-9) {
        return NextResponse.json({ error: `Only ${num(share.numberOfShares) - gone} preferred shares remain to retire (holds ${num(share.numberOfShares)}, already retired/sold ${gone}).` }, { status: 400 })
      }
      holderName = share.shareholder.name
    }

    const created = await prisma.$transaction(async (tx) => {
      const bb = await tx.shareBuyback.create({ data: {
        commonShareId: commonShareId || null, preferredShareId: preferredShareId || null,
        date, shares, price, bankAccountId: b.bankAccountId || null, treasuryAccountId: b.treasuryAccountId || null,
        proofUrls: Array.isArray(b.proofUrls) ? b.proofUrls : undefined, createdById: session.user!.id ?? null,
      } })
      const jeId = await postEquityBuyback(tx, { refId: bb.id, date, amount: shares * price, bankAccountId: b.bankAccountId, treasuryAccountId: b.treasuryAccountId, investor: holderName, createdById: session.user!.id as string })
      if (jeId) await tx.shareBuyback.update({ where: { id: bb.id }, data: { journalEntryId: jeId } })
      // Keep the legacy flag in sync so anything still reading it sees "bought back".
      if (commonShareId) await tx.commonShare.update({ where: { id: commonShareId }, data: { boughtBack: true } })
      return bb
    })
    return NextResponse.json({ id: created.id })
  } catch (e) {
    console.error('Buyback create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

// PATCH { id, date?, shares?, price?, bankAccountId?, treasuryAccountId?, proofUrls? }
// Edit a recorded buyback in place: the record is updated and its journal entry
// re-posted at the new date/amount/accounts. Any bank line already matched to
// the old entry is re-pointed to the new one so Bank Rec never dangles.
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const id = String(b.id || '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const bb = await prisma.shareBuyback.findUnique({ where: { id } })
    if (!bb) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const shares = b.shares !== undefined ? num(b.shares) : num(bb.shares)
    const price = b.price !== undefined ? num(b.price) : num(bb.price)
    if (!(shares > 0)) return NextResponse.json({ error: 'Shares bought back must be greater than zero' }, { status: 400 })
    if (!(price > 0)) return NextResponse.json({ error: 'Buyback price must be greater than zero' }, { status: 400 })
    const date = b.date ? new Date(b.date) : bb.date
    const bankAccountId = b.bankAccountId !== undefined ? (b.bankAccountId || null) : bb.bankAccountId
    const treasuryAccountId = b.treasuryAccountId !== undefined ? (b.treasuryAccountId || null) : bb.treasuryAccountId

    // Same cap as recording: this buyback's NEW size plus every OTHER buyback
    // must still fit inside the holding.
    let holderName = ''
    if (bb.commonShareId) {
      const share = await prisma.commonShare.findUnique({ where: { id: bb.commonShareId }, include: { shareholder: { select: { name: true } }, buybacks: { select: { id: true, shares: true } } } })
      if (!share) return NextResponse.json({ error: 'Shareholding not found' }, { status: 404 })
      const others = share.buybacks.filter(x => x.id !== id).reduce((s, x) => s + num(x.shares), 0)
      if (others + shares > num(share.numberOfShares) + 1e-9) {
        return NextResponse.json({ error: `Only ${num(share.numberOfShares) - others} shares fit this buyback (holds ${num(share.numberOfShares)}, other buybacks ${others}).` }, { status: 400 })
      }
      holderName = share.shareholder.name
    } else {
      const share = await prisma.preferredShare.findUnique({ where: { id: bb.preferredShareId! }, include: { shareholder: { select: { name: true } }, buybacks: { select: { id: true, shares: true } }, transfersOut: { select: { shares: true } } } })
      if (!share) return NextResponse.json({ error: 'Preferred shareholding not found' }, { status: 404 })
      const gone = num(share.retiredShares) + share.buybacks.filter(x => x.id !== id).reduce((s, x) => s + num(x.shares), 0) + share.transfersOut.reduce((s, x) => s + num(x.shares), 0)
      if (gone + shares > num(share.numberOfShares) + 1e-9) {
        return NextResponse.json({ error: `Only ${num(share.numberOfShares) - gone} preferred shares fit this retirement (holds ${num(share.numberOfShares)}, otherwise retired/sold ${gone}).` }, { status: 400 })
      }
      holderName = share.shareholder.name
    }

    await prisma.$transaction(async (tx) => {
      // Remember which bank lines were matched to the old entry before it goes.
      const matched = bb.journalEntryId
        ? await tx.bankTransaction.findMany({ where: { journalEntryId: bb.journalEntryId }, select: { id: true, matchId: true } })
        : []
      await tx.shareBuyback.update({ where: { id }, data: {
        date, shares, price, bankAccountId, treasuryAccountId,
        ...(Array.isArray(b.proofUrls) ? { proofUrls: b.proofUrls } : {}),
      } })
      if (bb.journalEntryId) await tx.journalEntry.deleteMany({ where: { id: bb.journalEntryId } })
      const jeId = await postEquityBuyback(tx, { refId: id, date, amount: shares * price, bankAccountId, treasuryAccountId, investor: holderName, createdById: session.user!.id as string })
      await tx.shareBuyback.update({ where: { id }, data: { journalEntryId: jeId } })
      if (jeId) for (const m of matched) {
        await tx.bankTransaction.update({ where: { id: m.id }, data: { journalEntryId: jeId, ...(m.matchId === bb.journalEntryId ? { matchId: jeId } : {}) } })
      }
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Buyback edit error:', e)
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
    if (bb.commonShareId) {
      const remaining = await tx.shareBuyback.count({ where: { commonShareId: bb.commonShareId } })
      if (remaining === 0) await tx.commonShare.update({ where: { id: bb.commonShareId }, data: { boughtBack: false } })
    }
  })
  return NextResponse.json({ success: true })
}
