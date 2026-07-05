import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postEquityIssuance, postEquityBuyback, reverseEquityJournal } from '@/lib/accounting/equity'

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
    prisma.commonShare.findMany({ include: { shareholder: true }, orderBy: { createdAt: 'asc' } }),
    prisma.preferredShare.findMany({ select: { numberOfShares: true, pricePerShare: true } }),
    prisma.shareholder.findMany({ orderBy: { shSeq: 'asc' }, select: { id: true, shNumber: true, name: true, tin: true, birthdate: true, email: true, address: true } }),
  ])

  const commonCap = commons.reduce((s, c) => s + num(c.numberOfShares) * num(c.pricePerShare), 0)
  const prefCap = preferreds.reduce((s, p) => s + num(p.numberOfShares) * num(p.pricePerShare), 0)
  const totalCapitalization = commonCap + prefCap
  const totalShares = commons.reduce((s, c) => s + num(c.numberOfShares), 0) + preferreds.reduce((s, p) => s + num(p.numberOfShares), 0)
  const treasuryShares = commons.reduce((s, c) => s + (c.boughtBack ? num(c.buybackShares) : 0), 0)

  const rows = commons.map(c => {
    const cap = num(c.numberOfShares) * num(c.pricePerShare)
    return {
      id: c.id, shareholderId: c.shareholderId, shNumber: c.shareholder.shNumber, name: c.shareholder.name,
      tin: c.shareholder.tin, birthdate: c.shareholder.birthdate, email: c.shareholder.email, address: c.shareholder.address,
      dateAcquired: c.dateAcquired, agreementType: c.agreementType, assignedToShareholderId: c.assignedToShareholderId,
      agreementUrls: c.agreementUrls, stockCertNumber: c.stockCertNumber, proofOfDepositUrls: c.proofOfDepositUrls,
      numberOfShares: num(c.numberOfShares), pricePerShare: num(c.pricePerShare), totalCapitalization: cap,
      equityStake: totalCapitalization > 0 ? (cap / totalCapitalization) * 100 : 0,
      bankAccountId: c.bankAccountId,
      boughtBack: c.boughtBack, buybackPrice: num(c.buybackPrice), buybackShares: num(c.buybackShares),
      buybackBankAccountId: c.buybackBankAccountId, buybackProofUrls: c.buybackProofUrls,
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
    const shares = num(body.numberOfShares), price = num(body.pricePerShare)
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
          numberOfShares: shares, pricePerShare: price, bankAccountId: body.bankAccountId || null, createdById: userId,
        },
      })
      const jeId = await postEquityIssuance(tx, { kind: 'COMMON', refId: c.id, date: new Date(body.dateAcquired), amount: shares * price, bankAccountId: body.bankAccountId, investor: sh.name, createdById: userId })
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
    const shares = num(body.numberOfShares), price = num(body.pricePerShare)

    await prisma.$transaction(async (tx) => {
      // Update shareholder profile fields
      await tx.shareholder.update({ where: { id: existing.shareholderId }, data: {
        name: (body.name || existing.shareholder.name).trim(), tin: body.tin?.trim() || null,
        birthdate: body.birthdate ? new Date(body.birthdate) : null, email: body.email?.trim() || null, address: body.address?.trim() || null,
      } })
      // Reverse + re-post the issuance JE
      await reverseEquityJournal(tx, 'EQUITY_COMMON', id)
      const boughtBack = !!body.boughtBack
      const buyShares = num(body.buybackShares), buyPrice = num(body.buybackPrice)
      await tx.commonShare.update({ where: { id }, data: {
        dateAcquired: new Date(body.dateAcquired), agreementType: body.agreementType || 'SUBSCRIPTION',
        assignedToShareholderId: body.assignedToShareholderId || null,
        agreementUrls: Array.isArray(body.agreementUrls) ? body.agreementUrls : undefined,
        stockCertNumber: body.stockCertNumber?.trim() || null,
        proofOfDepositUrls: Array.isArray(body.proofOfDepositUrls) ? body.proofOfDepositUrls : undefined,
        numberOfShares: shares, pricePerShare: price, bankAccountId: body.bankAccountId || null,
        boughtBack, buybackPrice: boughtBack ? buyPrice : null, buybackShares: boughtBack ? buyShares : null,
        buybackBankAccountId: boughtBack ? (body.buybackBankAccountId || null) : null,
        buybackProofUrls: boughtBack && Array.isArray(body.buybackProofUrls) ? body.buybackProofUrls : undefined,
      } })
      const jeId = await postEquityIssuance(tx, { kind: 'COMMON', refId: id, date: new Date(body.dateAcquired), amount: shares * price, bankAccountId: body.bankAccountId, investor: (body.name || existing.shareholder.name), createdById: userId })
      // Buyback JE (reverse + re-post)
      await reverseEquityJournal(tx, 'EQUITY_BUYBACK', id)
      let buyJe: string | null = null
      if (boughtBack) buyJe = await postEquityBuyback(tx, { refId: id, date: new Date(body.dateAcquired), amount: buyShares * buyPrice, bankAccountId: body.buybackBankAccountId, investor: (body.name || existing.shareholder.name), createdById: userId })
      await tx.commonShare.update({ where: { id }, data: { journalEntryId: jeId, buybackJournalEntryId: buyJe } })
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
    await reverseEquityJournal(tx, 'EQUITY_COMMON', id)
    await reverseEquityJournal(tx, 'EQUITY_BUYBACK', id)
    await tx.commonShare.delete({ where: { id } })
  })
  return NextResponse.json({ success: true })
}
