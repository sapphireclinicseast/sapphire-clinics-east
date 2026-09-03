// Secondary sales (share transfers) against a common shareholding — a
// shareholder sells part or all of a holding to a current shareholder or an
// external party. The price is settled privately between the two parties, so
// no cash entry is posted; the company records only the ownership move:
//   - the seller's holding shrinks by the transferred shares (net, like buybacks)
//   - a new holding is created for the buyer at the seller's BOOK value
//     (par/APIC), agreement type DEED_OF_ASSIGNMENT, with NO issuance entry
//   - a net-zero memo JE (DR/CR the same equity account) keeps the
//     per-investor attribution in the ledger (referenceType EQUITY_TRANSFER)
//   GET    ?commonShareId= → list transfers out of that shareholding
//   POST   { commonShareId, date, shares, price, proofUrls,
//            buyerShareholderId? — current shareholder, OR
//            buyerName/buyerTin/buyerBirthdate/buyerEmail/buyerAddress — external }
//   DELETE ?id= → undo a transfer: remove the buyer's holding created by it
//                 (refused if that holding has since been sold on or bought
//                 back), reverse the memo JE, delete the transfer
// Access: ADMIN only (matches the common-share routes).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postEquityTransfer, reverseEquityJournal } from '@/lib/accounting/equity'

const ADMIN = ['ADMIN']
const num = (v: unknown) => Number(v || 0)

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const commonShareId = new URL(req.url).searchParams.get('commonShareId') || ''
  if (!commonShareId) return NextResponse.json({ error: 'commonShareId required' }, { status: 400 })
  const transfers = await prisma.shareTransfer.findMany({
    where: { fromCommonShareId: commonShareId },
    include: { toShareholder: { select: { shNumber: true, name: true } } },
    orderBy: { date: 'asc' },
  })
  return NextResponse.json(transfers.map(t => ({
    id: t.id, date: t.date, shares: num(t.shares), price: num(t.price), amount: num(t.shares) * num(t.price),
    toShareholderId: t.toShareholderId, toShNumber: t.toShareholder.shNumber, toName: t.toShareholder.name,
    toCommonShareId: t.toCommonShareId, proofUrls: t.proofUrls,
  })))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const userId = session.user.id as string
    const commonShareId = String(b.commonShareId || '')
    const shares = num(b.shares), price = num(b.price)
    if (!commonShareId) return NextResponse.json({ error: 'commonShareId is required' }, { status: 400 })
    if (!(shares > 0)) return NextResponse.json({ error: 'Shares sold must be greater than zero' }, { status: 400 })
    if (!(price > 0)) return NextResponse.json({ error: 'Sale price per share is required' }, { status: 400 })
    if (!b.buyerShareholderId && !(b.buyerName || '').trim()) return NextResponse.json({ error: 'Pick a current shareholder or enter the external buyer\'s name' }, { status: 400 })

    const share = await prisma.commonShare.findUnique({
      where: { id: commonShareId },
      include: { shareholder: true, buybacks: { select: { shares: true } }, transfersOut: { select: { shares: true } } },
    })
    if (!share) return NextResponse.json({ error: 'Shareholding not found' }, { status: 404 })
    // Can only sell what is still held: net of buybacks AND earlier transfers.
    const gone = share.buybacks.reduce((s, x) => s + num(x.shares), 0) + share.transfersOut.reduce((s, x) => s + num(x.shares), 0)
    const remaining = num(share.numberOfShares) - gone
    if (shares > remaining + 1e-9) {
      return NextResponse.json({ error: `Only ${remaining.toLocaleString('en-PH')} shares remain to sell (holds ${num(share.numberOfShares).toLocaleString('en-PH')}, already bought back / sold ${gone.toLocaleString('en-PH')}).` }, { status: 400 })
    }

    const date = b.date ? new Date(b.date) : new Date()
    const proofUrls = Array.isArray(b.proofUrls) ? b.proofUrls : undefined
    const created = await prisma.$transaction(async (tx) => {
      // Resolve the buyer — an existing shareholder, or a new one for an external party.
      let buyer
      if (b.buyerShareholderId) {
        buyer = await tx.shareholder.findUnique({ where: { id: String(b.buyerShareholderId) } })
        if (!buyer) throw new Error('Buyer shareholder not found')
      } else {
        const name = String(b.buyerName).trim()
        buyer = await tx.shareholder.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
        if (!buyer) {
          const last = await tx.shareholder.findFirst({ orderBy: { shSeq: 'desc' } })
          const seq = (last?.shSeq || 0) + 1
          buyer = await tx.shareholder.create({ data: {
            shNumber: `SH${String(seq).padStart(4, '0')}`, shSeq: seq, name,
            tin: b.buyerTin?.trim() || null, birthdate: b.buyerBirthdate ? new Date(b.buyerBirthdate) : null,
            email: b.buyerEmail?.trim() || null, address: b.buyerAddress?.trim() || null, createdById: userId,
          } })
        }
      }
      if (buyer.id === share.shareholderId) throw new Error('The buyer must be a different shareholder from the seller')

      // The buyer's holding carries the seller's BOOK value (par/APIC) — the
      // private sale price lives on the transfer record only. No bank account,
      // no issuance JE: nothing was received by the company.
      const toShare = await tx.commonShare.create({ data: {
        shareholderId: buyer.id, dateAcquired: date, agreementType: 'DEED_OF_ASSIGNMENT',
        shareClass: share.shareClass, numberOfShares: shares,
        truePar: share.truePar, apic: share.apic, pricePerShare: share.pricePerShare,
        soldFromTreasury: false, bankAccountId: null, equityAccountId: share.equityAccountId,
        agreementUrls: proofUrls, createdById: userId,
      } })

      const t = await tx.shareTransfer.create({ data: {
        fromCommonShareId: commonShareId, toCommonShareId: toShare.id, toShareholderId: buyer.id,
        date, shares, price, proofUrls, createdById: userId,
      } })

      const jeId = await postEquityTransfer(tx, {
        refId: t.id, date, amount: shares * num(share.pricePerShare), equityAccountId: share.equityAccountId,
        fromInvestor: share.shareholder.name, toInvestor: buyer.name, createdById: userId,
      })
      if (jeId) await tx.shareTransfer.update({ where: { id: t.id }, data: { journalEntryId: jeId } })
      return t
    })
    return NextResponse.json({ id: created.id, toCommonShareId: created.toCommonShareId })
  } catch (e) {
    console.error('Share transfer create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const t = await prisma.shareTransfer.findUnique({
    where: { id },
    include: { toCommonShare: { include: { buybacks: { select: { id: true } }, transfersOut: { select: { id: true } } } } },
  })
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Undoing the transfer removes the buyer's holding — refuse if that holding
  // has since moved on (sold further or bought back), or the chain breaks.
  if (t.toCommonShare && (t.toCommonShare.buybacks.length > 0 || t.toCommonShare.transfersOut.length > 0)) {
    return NextResponse.json({ error: 'The buyer has since sold on or bought back some of these shares — undo those records first.' }, { status: 400 })
  }
  await prisma.$transaction(async (tx) => {
    await reverseEquityJournal(tx, 'EQUITY_TRANSFER', id)
    const toShareId = t.toCommonShareId, buyerId = t.toShareholderId
    await tx.shareTransfer.delete({ where: { id } })
    if (toShareId) await tx.commonShare.delete({ where: { id: toShareId } }).catch(() => {})
    // Remove the buyer if this was their only holding (mirrors the common-share delete).
    const [cCount, pCount, tCount] = await Promise.all([
      tx.commonShare.count({ where: { shareholderId: buyerId } }),
      tx.preferredShare.count({ where: { shareholderId: buyerId } }),
      tx.shareTransfer.count({ where: { toShareholderId: buyerId } }),
    ])
    if (cCount === 0 && pCount === 0 && tCount === 0) await tx.shareholder.delete({ where: { id: buyerId } }).catch(() => {})
  })
  return NextResponse.json({ success: true })
}
