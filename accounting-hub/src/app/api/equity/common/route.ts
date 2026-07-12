import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postEquityIssuance, reverseEquityJournal } from '@/lib/accounting/equity'

const ADMIN = ['ADMIN']
const num = (v: unknown) => Number(v || 0)

// Resolve an existing shareholder (by id or name) or create a new one with the next SH number.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveShareholder(tx: any, body: { shareholderId?: string; name?: string; tin?: string; birthdate?: string; email?: string; address?: string }, createdById: string) {
  if (body.shareholderId) {
    const sh = await tx.shareholder.findUnique({ where: { id: body.shareholderId } })
    if (sh) return sh
  }
  const name = (body.name || '').trim()
  if (name) {
    const existing = await tx.shareholder.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
    if (existing) return existing
  }
  const last = await tx.shareholder.findFirst({ orderBy: { shSeq: 'desc' } })
  const seq = (last?.shSeq || 0) + 1
  return tx.shareholder.create({
    data: {
      shNumber: `SH${String(seq).padStart(4, '0')}`, shSeq: seq, name: name || 'Unnamed',
      tin: body.tin?.trim() || null, birthdate: body.birthdate ? new Date(body.birthdate) : null,
      email: body.email?.trim() || null, address: body.address?.trim() || null, createdById,
    },
  })
}

export async function GET() {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const [commons, preferreds, shareholders] = await Promise.all([
    prisma.commonShare.findMany({ include: { shareholder: true, buybacks: { orderBy: { date: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
    prisma.preferredShare.findMany({ select: { numberOfShares: true, pricePerShare: true } }),
    prisma.shareholder.findMany({ orderBy: { shSeq: 'asc' }, select: { id: true, shNumber: true, name: true, tin: true, birthdate: true, email: true, address: true } }),
  ])

  const commonCap = commons.reduce((s, c) => s + num(c.numberOfShares) * num(c.pricePerShare), 0)
  const prefCap = preferreds.reduce((s, p) => s + num(p.numberOfShares) * num(p.pricePerShare), 0)
  const totalCapitalization = commonCap + prefCap
  const totalShares = commons.reduce((s, c) => s + num(c.numberOfShares), 0) + preferreds.reduce((s, p) => s + num(p.numberOfShares), 0)
  // Buybacks are now recorded as ShareBuyback rows (multiple per shareholder).
  const treasuryShares = commons.reduce((s, c) => s + c.buybacks.reduce((t, b) => t + num(b.shares), 0), 0)

  const rows = commons.map(c => {
    const cap = num(c.numberOfShares) * num(c.pricePerShare)
    const buybacks = c.buybacks.map(b => ({
      id: b.id, date: b.date, shares: num(b.shares), price: num(b.price), amount: num(b.shares) * num(b.price),
      bankAccountId: b.bankAccountId, treasuryAccountId: b.treasuryAccountId, proofUrls: b.proofUrls,
    }))
    const buybackShares = buybacks.reduce((s, b) => s + b.shares, 0)
    return {
      id: c.id, shareholderId: c.shareholderId, shNumber: c.shareholder.shNumber, name: c.shareholder.name,
      tin: c.shareholder.tin, birthdate: c.shareholder.birthdate, email: c.shareholder.email, address: c.shareholder.address,
      dateAcquired: c.dateAcquired, agreementType: c.agreementType, assignedToShareholderId: c.assignedToShareholderId,
      agreementUrls: c.agreementUrls, stockCertNumber: c.stockCertNumber, proofOfDepositUrls: c.proofOfDepositUrls, validIdUrls: c.validIdUrls, shareClass: c.shareClass,
      numberOfShares: num(c.numberOfShares), truePar: num(c.truePar), apic: num(c.apic), pricePerShare: num(c.pricePerShare), totalCapitalization: cap,
      soldFromTreasury: c.soldFromTreasury,
      // % equity is share-count based: this holding's shares ÷ total shares (common + preferred).
      equityStake: totalShares > 0 ? (num(c.numberOfShares) / totalShares) * 100 : 0,
      bankAccountId: c.bankAccountId, equityAccountId: c.equityAccountId,
      boughtBack: buybacks.length > 0, buybackShares, buybacks,
    }
  })

  return NextResponse.json({
    rows, shareholders,
    figures: { totalCapitalization, totalShares, treasuryShares },
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const body = await req.json()
    const userId = session.user.id as string
    const shares = num(body.numberOfShares)
    // Price per share = True Par + APIC (fall back to an explicit pricePerShare for older callers).
    const truePar = num(body.truePar), apic = num(body.apic)
    const price = (body.truePar != null || body.apic != null) ? truePar + apic : num(body.pricePerShare)
    if (!(shares > 0) || !(price > 0)) return NextResponse.json({ error: 'Number of shares and price are required' }, { status: 400 })
    if (!body.dateAcquired) return NextResponse.json({ error: 'Date acquired is required' }, { status: 400 })

    const created = await prisma.$transaction(async (tx) => {
      const sh = await resolveShareholder(tx, body, userId)
      const c = await tx.commonShare.create({
        data: {
          shareholderId: sh.id, dateAcquired: new Date(body.dateAcquired),
          agreementType: body.agreementType || 'SUBSCRIPTION', assignedToShareholderId: body.assignedToShareholderId || null,
          agreementUrls: Array.isArray(body.agreementUrls) ? body.agreementUrls : undefined,
          stockCertNumber: body.stockCertNumber?.trim() || null,
          proofOfDepositUrls: Array.isArray(body.proofOfDepositUrls) ? body.proofOfDepositUrls : undefined,
          validIdUrls: Array.isArray(body.validIdUrls) ? body.validIdUrls : undefined,
          shareClass: body.shareClass?.trim() || null,
          numberOfShares: shares, truePar, apic, pricePerShare: price, soldFromTreasury: !!body.soldFromTreasury, bankAccountId: body.bankAccountId || null, equityAccountId: body.equityAccountId || null,
          createdById: userId,
        },
      })
      const jeId = await postEquityIssuance(tx, { kind: 'COMMON', refId: c.id, date: new Date(body.dateAcquired), amount: shares * price, bankAccountId: body.bankAccountId, equityAccountId: body.equityAccountId, investor: sh.name, createdById: userId })
      if (jeId) await tx.commonShare.update({ where: { id: c.id }, data: { journalEntryId: jeId } })
      return c
    })
    return NextResponse.json({ id: created.id })
  } catch (e) {
    console.error('Common share create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const body = await req.json()
    const userId = session.user.id as string
    const id = body.id
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const existing = await prisma.commonShare.findUnique({ where: { id }, include: { shareholder: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const shares = num(body.numberOfShares)
    const truePar = num(body.truePar), apic = num(body.apic)
    const price = (body.truePar != null || body.apic != null) ? truePar + apic : num(body.pricePerShare)

    await prisma.$transaction(async (tx) => {
      // Update shareholder profile fields
      await tx.shareholder.update({ where: { id: existing.shareholderId }, data: {
        name: (body.name || existing.shareholder.name).trim(), tin: body.tin?.trim() || null,
        birthdate: body.birthdate ? new Date(body.birthdate) : null, email: body.email?.trim() || null, address: body.address?.trim() || null,
      } })
      // Reverse + re-post the issuance JE. Buybacks are managed separately (ShareBuyback
      // rows via /api/equity/buybacks) and are intentionally left untouched here.
      await reverseEquityJournal(tx, 'EQUITY_COMMON', id)
      await tx.commonShare.update({ where: { id }, data: {
        dateAcquired: new Date(body.dateAcquired), agreementType: body.agreementType || 'SUBSCRIPTION',
        assignedToShareholderId: body.assignedToShareholderId || null,
        agreementUrls: Array.isArray(body.agreementUrls) ? body.agreementUrls : undefined,
        stockCertNumber: body.stockCertNumber?.trim() || null,
        proofOfDepositUrls: Array.isArray(body.proofOfDepositUrls) ? body.proofOfDepositUrls : undefined,
        validIdUrls: Array.isArray(body.validIdUrls) ? body.validIdUrls : undefined,
        shareClass: body.shareClass?.trim() || null,
        numberOfShares: shares, truePar, apic, pricePerShare: price, soldFromTreasury: !!body.soldFromTreasury, bankAccountId: body.bankAccountId || null, equityAccountId: body.equityAccountId || null,
      } })
      const jeId = await postEquityIssuance(tx, { kind: 'COMMON', refId: id, date: new Date(body.dateAcquired), amount: shares * price, bankAccountId: body.bankAccountId, equityAccountId: body.equityAccountId, investor: (body.name || existing.shareholder.name), createdById: userId })
      await tx.commonShare.update({ where: { id }, data: { journalEntryId: jeId } })
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Common share update error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.$transaction(async (tx) => {
    const share = await tx.commonShare.findUnique({ where: { id }, select: { shareholderId: true } })
    await reverseEquityJournal(tx, 'EQUITY_COMMON', id)
    await reverseEquityJournal(tx, 'EQUITY_BUYBACK', id)
    await tx.commonShare.delete({ where: { id } })
    // Remove the shareholder if this was their last holding (keeps SH numbering tight).
    if (share) {
      const [cCount, pCount] = await Promise.all([
        tx.commonShare.count({ where: { shareholderId: share.shareholderId } }),
        tx.preferredShare.count({ where: { shareholderId: share.shareholderId } }),
      ])
      if (cCount === 0 && pCount === 0) await tx.shareholder.delete({ where: { id: share.shareholderId } }).catch(() => {})
    }
  })
  return NextResponse.json({ success: true })
}
