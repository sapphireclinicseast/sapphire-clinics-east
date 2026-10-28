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
  const sp = new URL(req.url).searchParams
  const commonShareId = sp.get('commonShareId') || ''
  const preferredShareId = sp.get('preferredShareId') || ''
  if (!commonShareId && !preferredShareId) return NextResponse.json({ error: 'commonShareId or preferredShareId required' }, { status: 400 })
  const transfers = await prisma.shareTransfer.findMany({
    where: commonShareId ? { fromCommonShareId: commonShareId } : { fromPreferredShareId: preferredShareId },
    include: { toShareholder: { select: { shNumber: true, name: true } } },
    orderBy: { date: 'asc' },
  })
  return NextResponse.json(transfers.map(t => ({
    id: t.id, date: t.date, shares: num(t.shares), price: num(t.price), amount: num(t.shares) * num(t.price),
    toShareholderId: t.toShareholderId, toShNumber: t.toShareholder.shNumber, toName: t.toShareholder.name,
    toCommonShareId: t.toCommonShareId, toPreferredShareId: t.toPreferredShareId, proofUrls: t.proofUrls,
  })))
}

// Resolve the buyer — an existing shareholder, or a new one for an external party.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveBuyer(tx: any, b: Record<string, any>, sellerShareholderId: string, userId: string) {
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
  if (buyer.id === sellerShareholderId) throw new Error('The buyer must be a different shareholder from the seller')
  return buyer
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const userId = session.user.id as string
    const commonShareId = String(b.commonShareId || '')
    const preferredShareId = String(b.preferredShareId || '')
    const shares = num(b.shares), price = num(b.price)
    if (!commonShareId && !preferredShareId) return NextResponse.json({ error: 'commonShareId or preferredShareId is required' }, { status: 400 })
    if (commonShareId && preferredShareId) return NextResponse.json({ error: 'Give exactly one of commonShareId / preferredShareId' }, { status: 400 })
    if (!(shares > 0)) return NextResponse.json({ error: 'Shares sold must be greater than zero' }, { status: 400 })
    if (!(price > 0)) return NextResponse.json({ error: 'Sale price per share is required' }, { status: 400 })
    if (!b.buyerShareholderId && !(b.buyerName || '').trim()) return NextResponse.json({ error: 'Pick a current shareholder or enter the external buyer\'s name' }, { status: 400 })

    // ── Preferred holding: same mechanics as common — the buyer's holding is
    // created at the seller's BOOK value and carries the preferred TERMS
    // (interest, maturity, payout schedule), so future dividends accrue to the
    // buyer while the seller's shrunken holding keeps earning on the rest.
    if (preferredShareId) {
      const share = await prisma.preferredShare.findUnique({
        where: { id: preferredShareId },
        include: { shareholder: true, buybacks: { select: { shares: true } }, transfersOut: { select: { shares: true } } },
      })
      if (!share) return NextResponse.json({ error: 'Preferred shareholding not found' }, { status: 404 })
      const gone = num(share.retiredShares) + share.buybacks.reduce((s, x) => s + num(x.shares), 0) + share.transfersOut.reduce((s, x) => s + num(x.shares), 0)
      const remaining = num(share.numberOfShares) - gone
      if (shares > remaining + 1e-9) {
        return NextResponse.json({ error: `Only ${remaining.toLocaleString('en-PH')} preferred shares remain to sell (holds ${num(share.numberOfShares).toLocaleString('en-PH')}, already retired / sold ${gone.toLocaleString('en-PH')}).` }, { status: 400 })
      }
      const date = b.date ? new Date(b.date) : new Date()
      const proofUrls = Array.isArray(b.proofUrls) ? b.proofUrls : undefined
      const created = await prisma.$transaction(async (tx) => {
        const buyer = await resolveBuyer(tx, b, share.shareholderId, userId)
        // Same full-sale certificate rule as common holdings.
        const isFullSale = shares >= remaining - 1e-9 && gone < 1e-9
        const toShare = await tx.preferredShare.create({ data: {
          shareholderId: buyer.id, dateAcquired: date, agreementType: 'DEED_OF_ASSIGNMENT',
          shareClass: share.shareClass, numberOfShares: shares,
          stockCertNumber: isFullSale ? share.stockCertNumber : null,
          truePar: share.truePar, apic: share.apic, pricePerShare: share.pricePerShare,
          bankAccountId: null, equityAccountId: share.equityAccountId,
          annualInterest: share.annualInterest, maturityYears: share.maturityYears,
          buybackPrice: share.buybackPrice, payoutSchedule: share.payoutSchedule,
          // The buyer CONTINUES the seller's dividend schedule. Write the
          // seller's effective anchor explicitly (their payout start, else
          // their acquisition date) so the clock never resets at the transfer.
          payoutStartMonth: share.payoutStartMonth ?? (share.dateAcquired ? new Date(share.dateAcquired).getUTCMonth() + 1 : null),
          payoutStartYear: share.payoutStartYear ?? (share.dateAcquired ? new Date(share.dateAcquired).getUTCFullYear() : null),
          payoutDay: share.payoutDay,
          agreementUrls: proofUrls, createdById: userId,
        } })
        if (isFullSale && share.stockCertNumber) {
          await tx.preferredShare.update({ where: { id: preferredShareId }, data: { stockCertNumber: null } })
        }
        const t = await tx.shareTransfer.create({ data: {
          fromPreferredShareId: preferredShareId, toPreferredShareId: toShare.id, toShareholderId: buyer.id,
          date, shares, price, proofUrls, createdById: userId,
        } })
        const jeId = await postEquityTransfer(tx, {
          refId: t.id, date, amount: shares * num(share.pricePerShare), equityAccountId: share.equityAccountId,
          fromInvestor: share.shareholder.name, toInvestor: buyer.name, createdById: userId,
        })
        if (jeId) await tx.shareTransfer.update({ where: { id: t.id }, data: { journalEntryId: jeId } })
        return t
      })
      return NextResponse.json({ id: created.id, toPreferredShareId: created.toPreferredShareId })
    }

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
      const buyer = await resolveBuyer(tx, b, share.shareholderId, userId)

      // The buyer's holding carries the seller's BOOK value (par/APIC) — the
      // private sale price lives on the transfer record only. No bank account,
      // no issuance JE: nothing was received by the company.
      //
      // A FULL sale hands over the physical stock certificate too: the cert
      // number moves to the buyer's holding and leaves the seller's. A partial
      // sale keeps the cert with the seller (the buyer's new cert, once issued,
      // is typed on their holding).
      //
      // "Full" means ONE buyer takes the ENTIRE original block in ONE deed —
      // when a holding is split across buyers (or nibbled by buybacks), the
      // last transfer merely zeroes the remainder; the paper certificate must
      // then be CANCELLED and each buyer issued a fresh number, so the cert
      // stays with the seller's retired holding as the cancelled record
      // (SCEIC-0013 Jahzeel→Tan+De Luna was the lesson).
      const isFullSale = shares >= remaining - 1e-9 && gone < 1e-9
      const toShare = await tx.commonShare.create({ data: {
        shareholderId: buyer.id, dateAcquired: date, agreementType: 'DEED_OF_ASSIGNMENT',
        shareClass: share.shareClass, numberOfShares: shares,
        stockCertNumber: isFullSale ? share.stockCertNumber : null,
        truePar: share.truePar, apic: share.apic, pricePerShare: share.pricePerShare,
        soldFromTreasury: false, bankAccountId: null, equityAccountId: share.equityAccountId,
        agreementUrls: proofUrls, createdById: userId,
      } })
      if (isFullSale && share.stockCertNumber) {
        await tx.commonShare.update({ where: { id: commonShareId }, data: { stockCertNumber: null } })
      }

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

// PATCH { id, date?, shares?, price?, proofUrls? } — edit a recorded sale in
// place. The buyer cannot change (undo and re-record for that). Changing the
// share count also resizes the buyer's holding, so it is refused once the
// buyer has sold on or bought back out of that holding. The memo JE is
// re-posted at the new date/amount, and the stock certificate follows the same
// full-sale rule as recording/undoing.
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const id = String(b.id || '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const t = await prisma.shareTransfer.findUnique({
      where: { id },
      include: {
        toShareholder: { select: { name: true } },
        toCommonShare: { include: { buybacks: { select: { id: true } }, transfersOut: { select: { id: true } } } },
        toPreferredShare: { include: { buybacks: { select: { id: true } }, transfersOut: { select: { id: true } } } },
      },
    })
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const shares = b.shares !== undefined ? num(b.shares) : num(t.shares)
    const price = b.price !== undefined ? num(b.price) : num(t.price)
    if (!(shares > 0)) return NextResponse.json({ error: 'Shares sold must be greater than zero' }, { status: 400 })
    if (!(price > 0)) return NextResponse.json({ error: 'Sale price per share is required' }, { status: 400 })
    const date = b.date ? new Date(b.date) : t.date
    const sharesChanged = Math.abs(shares - num(t.shares)) > 1e-9
    const buyerMovedOn = Boolean(
      (t.toCommonShare && (t.toCommonShare.buybacks.length > 0 || t.toCommonShare.transfersOut.length > 0)) ||
      (t.toPreferredShare && (t.toPreferredShare.buybacks.length > 0 || t.toPreferredShare.transfersOut.length > 0)))
    if (sharesChanged && buyerMovedOn) {
      return NextResponse.json({ error: 'The buyer has since sold on or bought back some of these shares — undo those records first before resizing this sale.' }, { status: 400 })
    }

    // Seller-side cap, excluding this very transfer; the full-sale cert rule is
    // recomputed the same way recording computes it.
    let fromInvestor = '', equityAccountId: string | null = null, bookPrice = 0
    let sellerCert: string | null = null, isFullSale = false
    if (t.fromCommonShareId) {
      const share = await prisma.commonShare.findUnique({ where: { id: t.fromCommonShareId }, include: { shareholder: { select: { name: true } }, buybacks: { select: { shares: true } }, transfersOut: { select: { id: true, shares: true } } } })
      if (!share) return NextResponse.json({ error: 'Shareholding not found' }, { status: 404 })
      const gone = share.buybacks.reduce((s, x) => s + num(x.shares), 0) + share.transfersOut.filter(x => x.id !== id).reduce((s, x) => s + num(x.shares), 0)
      const remaining = num(share.numberOfShares) - gone
      if (shares > remaining + 1e-9) return NextResponse.json({ error: `Only ${remaining.toLocaleString('en-PH')} shares fit this sale (holds ${num(share.numberOfShares).toLocaleString('en-PH')}, otherwise bought back / sold ${gone.toLocaleString('en-PH')}).` }, { status: 400 })
      fromInvestor = share.shareholder.name; equityAccountId = share.equityAccountId; bookPrice = num(share.pricePerShare)
      sellerCert = share.stockCertNumber; isFullSale = shares >= remaining - 1e-9 && gone < 1e-9
    } else if (t.fromPreferredShareId) {
      const share = await prisma.preferredShare.findUnique({ where: { id: t.fromPreferredShareId }, include: { shareholder: { select: { name: true } }, buybacks: { select: { shares: true } }, transfersOut: { select: { id: true, shares: true } } } })
      if (!share) return NextResponse.json({ error: 'Preferred shareholding not found' }, { status: 404 })
      const gone = num(share.retiredShares) + share.buybacks.reduce((s, x) => s + num(x.shares), 0) + share.transfersOut.filter(x => x.id !== id).reduce((s, x) => s + num(x.shares), 0)
      const remaining = num(share.numberOfShares) - gone
      if (shares > remaining + 1e-9) return NextResponse.json({ error: `Only ${remaining.toLocaleString('en-PH')} preferred shares fit this sale (holds ${num(share.numberOfShares).toLocaleString('en-PH')}, otherwise retired / sold ${gone.toLocaleString('en-PH')}).` }, { status: 400 })
      fromInvestor = share.shareholder.name; equityAccountId = share.equityAccountId; bookPrice = num(share.pricePerShare)
      sellerCert = share.stockCertNumber; isFullSale = shares >= remaining - 1e-9 && gone < 1e-9
    }

    await prisma.$transaction(async (tx) => {
      const matched = t.journalEntryId
        ? await tx.bankTransaction.findMany({ where: { journalEntryId: t.journalEntryId }, select: { id: true, matchId: true } })
        : []
      await tx.shareTransfer.update({ where: { id }, data: {
        date, shares, price, ...(Array.isArray(b.proofUrls) ? { proofUrls: b.proofUrls } : {}),
      } })
      // Keep the buyer's holding in step — it was created BY this sale.
      if (t.toCommonShareId) {
        await tx.commonShare.update({ where: { id: t.toCommonShareId }, data: {
          numberOfShares: shares, dateAcquired: date,
          ...(Array.isArray(b.proofUrls) ? { agreementUrls: b.proofUrls } : {}),
        } })
        // Cert follows the full-sale rule in both directions.
        if (isFullSale && sellerCert && !t.toCommonShare?.stockCertNumber) {
          await tx.commonShare.update({ where: { id: t.fromCommonShareId! }, data: { stockCertNumber: null } })
          await tx.commonShare.update({ where: { id: t.toCommonShareId }, data: { stockCertNumber: sellerCert } })
        } else if (!isFullSale && t.toCommonShare?.stockCertNumber && !sellerCert) {
          await tx.commonShare.update({ where: { id: t.toCommonShareId }, data: { stockCertNumber: null } })
          await tx.commonShare.update({ where: { id: t.fromCommonShareId! }, data: { stockCertNumber: t.toCommonShare.stockCertNumber } })
        }
      }
      if (t.toPreferredShareId) {
        await tx.preferredShare.update({ where: { id: t.toPreferredShareId }, data: {
          numberOfShares: shares, dateAcquired: date,
          ...(Array.isArray(b.proofUrls) ? { agreementUrls: b.proofUrls } : {}),
        } })
        if (isFullSale && sellerCert && !t.toPreferredShare?.stockCertNumber) {
          await tx.preferredShare.update({ where: { id: t.fromPreferredShareId! }, data: { stockCertNumber: null } })
          await tx.preferredShare.update({ where: { id: t.toPreferredShareId }, data: { stockCertNumber: sellerCert } })
        } else if (!isFullSale && t.toPreferredShare?.stockCertNumber && !sellerCert) {
          await tx.preferredShare.update({ where: { id: t.toPreferredShareId }, data: { stockCertNumber: null } })
          await tx.preferredShare.update({ where: { id: t.fromPreferredShareId! }, data: { stockCertNumber: t.toPreferredShare.stockCertNumber } })
        }
      }
      await reverseEquityJournal(tx, 'EQUITY_TRANSFER', id)
      const jeId = await postEquityTransfer(tx, {
        refId: id, date, amount: shares * bookPrice, equityAccountId,
        fromInvestor, toInvestor: t.toShareholder.name, createdById: session.user!.id as string,
      })
      await tx.shareTransfer.update({ where: { id }, data: { journalEntryId: jeId } })
      if (jeId) for (const m of matched) {
        await tx.bankTransaction.update({ where: { id: m.id }, data: { journalEntryId: jeId, ...(m.matchId === t.journalEntryId ? { matchId: jeId } : {}) } })
      }
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Share transfer edit error:', e)
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
    include: {
      toCommonShare: { include: { buybacks: { select: { id: true } }, transfersOut: { select: { id: true } } } },
      toPreferredShare: { include: { buybacks: { select: { id: true } }, transfersOut: { select: { id: true } } } },
    },
  })
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Undoing the transfer removes the buyer's holding — refuse if that holding
  // has since moved on (sold further or bought back), or the chain breaks.
  if (t.toCommonShare && (t.toCommonShare.buybacks.length > 0 || t.toCommonShare.transfersOut.length > 0)) {
    return NextResponse.json({ error: 'The buyer has since sold on or bought back some of these shares — undo those records first.' }, { status: 400 })
  }
  if (t.toPreferredShare && (t.toPreferredShare.buybacks.length > 0 || t.toPreferredShare.transfersOut.length > 0)) {
    return NextResponse.json({ error: 'The buyer has since sold on or retired some of these preferred shares — undo those records first.' }, { status: 400 })
  }
  await prisma.$transaction(async (tx) => {
    await reverseEquityJournal(tx, 'EQUITY_TRANSFER', id)
    const toShareId = t.toCommonShareId, toPrefId = t.toPreferredShareId, buyerId = t.toShareholderId
    await tx.shareTransfer.delete({ where: { id } })
    // If the certificate travelled to the buyer on a full sale, hand it back.
    if (toShareId && t.toCommonShare?.stockCertNumber && t.fromCommonShareId) {
      const seller = await tx.commonShare.findUnique({ where: { id: t.fromCommonShareId }, select: { stockCertNumber: true } })
      if (seller && !seller.stockCertNumber) {
        await tx.commonShare.update({ where: { id: t.fromCommonShareId }, data: { stockCertNumber: t.toCommonShare.stockCertNumber } })
      }
    }
    if (toPrefId && t.toPreferredShare?.stockCertNumber && t.fromPreferredShareId) {
      const seller = await tx.preferredShare.findUnique({ where: { id: t.fromPreferredShareId }, select: { stockCertNumber: true } })
      if (seller && !seller.stockCertNumber) {
        await tx.preferredShare.update({ where: { id: t.fromPreferredShareId }, data: { stockCertNumber: t.toPreferredShare.stockCertNumber } })
      }
    }
    if (toShareId) await tx.commonShare.delete({ where: { id: toShareId } }).catch(() => {})
    if (toPrefId) await tx.preferredShare.delete({ where: { id: toPrefId } }).catch(() => {})
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
