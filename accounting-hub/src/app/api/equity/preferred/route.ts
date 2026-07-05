import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postEquityIssuance, reverseEquityJournal } from '@/lib/accounting/equity'

const ADMIN = ['ADMIN']
const num = (v: unknown) => Number(v || 0)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveShareholder(tx: any, body: { shareholderId?: string; name?: string; tin?: string; birthdate?: string; email?: string; address?: string }, createdById: string) {
  if (body.shareholderId) { const sh = await tx.shareholder.findUnique({ where: { id: body.shareholderId } }); if (sh) return sh }
  const name = (body.name || '').trim()
  if (name) { const ex = await tx.shareholder.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } }); if (ex) return ex }
  const last = await tx.shareholder.findFirst({ orderBy: { shSeq: 'desc' } })
  const seq = (last?.shSeq || 0) + 1
  return tx.shareholder.create({ data: { shNumber: `SH${String(seq).padStart(4, '0')}`, shSeq: seq, name: name || 'Unnamed',
    tin: body.tin?.trim() || null, birthdate: body.birthdate ? new Date(body.birthdate) : null, email: body.email?.trim() || null, address: body.address?.trim() || null, createdById } })
}

export async function GET() {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const [prefs, commons, shareholders] = await Promise.all([
    prisma.preferredShare.findMany({ include: { shareholder: true }, orderBy: { createdAt: 'asc' } }),
    prisma.commonShare.findMany({ select: { numberOfShares: true, pricePerShare: true } }),
    prisma.shareholder.findMany({ orderBy: { shSeq: 'asc' }, select: { id: true, shNumber: true, name: true, tin: true, birthdate: true, email: true, address: true } }),
  ])
  const commonCap = commons.reduce((s, c) => s + num(c.numberOfShares) * num(c.pricePerShare), 0)
  const prefCap = prefs.reduce((s, p) => s + num(p.numberOfShares) * num(p.pricePerShare), 0)
  const total = commonCap + prefCap
  const rows = prefs.map(p => {
    const cap = num(p.numberOfShares) * num(p.pricePerShare)
    return {
      id: p.id, shareholderId: p.shareholderId, shNumber: p.shareholder.shNumber, name: p.shareholder.name,
      tin: p.shareholder.tin, birthdate: p.shareholder.birthdate, email: p.shareholder.email, address: p.shareholder.address,
      dateAcquired: p.dateAcquired, agreementType: p.agreementType, agreementUrls: p.agreementUrls, stockCertNumber: p.stockCertNumber,
      proofOfDepositUrls: p.proofOfDepositUrls, numberOfShares: num(p.numberOfShares), pricePerShare: num(p.pricePerShare), totalCapitalization: cap,
      equityStake: total > 0 ? (cap / total) * 100 : 0, bankAccountId: p.bankAccountId, equityAccountId: p.equityAccountId,
      annualInterest: p.annualInterest != null ? num(p.annualInterest) : null, maturityYears: p.maturityYears, buybackPrice: p.buybackPrice != null ? num(p.buybackPrice) : null,
      payoutSchedule: p.payoutSchedule, payoutStartMonth: p.payoutStartMonth, payoutStartYear: p.payoutStartYear, payoutDay: p.payoutDay, pdcUrls: p.pdcUrls,
    }
  })
  return NextResponse.json({ rows, shareholders, figures: { totalCapitalization: total, preferredCapitalization: prefCap } })
}

function dataFrom(b: Record<string, unknown>) {
  return {
    dateAcquired: new Date(b.dateAcquired as string), agreementType: (b.agreementType as string) || 'SUBSCRIPTION',
    agreementUrls: Array.isArray(b.agreementUrls) ? b.agreementUrls : undefined, stockCertNumber: (b.stockCertNumber as string)?.trim() || null,
    proofOfDepositUrls: Array.isArray(b.proofOfDepositUrls) ? b.proofOfDepositUrls : undefined,
    numberOfShares: num(b.numberOfShares), pricePerShare: num(b.pricePerShare), bankAccountId: (b.bankAccountId as string) || null, equityAccountId: (b.equityAccountId as string) || null,
    annualInterest: b.annualInterest != null ? num(b.annualInterest) : null, maturityYears: b.maturityYears ? Number(b.maturityYears) : null,
    buybackPrice: b.buybackPrice != null ? num(b.buybackPrice) : null,
    payoutSchedule: (b.payoutSchedule as string) || null, payoutStartMonth: b.payoutStartMonth ? Number(b.payoutStartMonth) : null,
    payoutStartYear: b.payoutStartYear ? Number(b.payoutStartYear) : null, payoutDay: b.payoutDay ? Number(b.payoutDay) : null,
    pdcUrls: Array.isArray(b.pdcUrls) ? b.pdcUrls : undefined,
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const userId = session.user.id as string
    const shares = num(b.numberOfShares), price = num(b.pricePerShare)
    if (!(shares > 0) || !(price > 0) || !b.name?.trim() || !b.dateAcquired) return NextResponse.json({ error: 'Name, shares, price and date are required' }, { status: 400 })
    const created = await prisma.$transaction(async (tx) => {
      const sh = await resolveShareholder(tx, b, userId)
      const p = await tx.preferredShare.create({ data: { shareholderId: sh.id, ...dataFrom(b), createdById: userId } })
      const jeId = await postEquityIssuance(tx, { kind: 'PREFERRED', refId: p.id, date: new Date(b.dateAcquired), amount: shares * price, bankAccountId: b.bankAccountId, equityAccountId: b.equityAccountId, investor: sh.name, createdById: userId })
      if (jeId) await tx.preferredShare.update({ where: { id: p.id }, data: { journalEntryId: jeId } })
      return p
    })
    return NextResponse.json({ id: created.id })
  } catch (e) {
    console.error('Preferred share create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const userId = session.user.id as string
    if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const existing = await prisma.preferredShare.findUnique({ where: { id: b.id }, include: { shareholder: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const shares = num(b.numberOfShares), price = num(b.pricePerShare)
    await prisma.$transaction(async (tx) => {
      await tx.shareholder.update({ where: { id: existing.shareholderId }, data: {
        name: (b.name || existing.shareholder.name).trim(), tin: b.tin?.trim() || null,
        birthdate: b.birthdate ? new Date(b.birthdate) : null, email: b.email?.trim() || null, address: b.address?.trim() || null,
      } })
      await reverseEquityJournal(tx, 'EQUITY_PREFERRED', b.id)
      await tx.preferredShare.update({ where: { id: b.id }, data: dataFrom(b) })
      const jeId = await postEquityIssuance(tx, { kind: 'PREFERRED', refId: b.id, date: new Date(b.dateAcquired), amount: shares * price, bankAccountId: b.bankAccountId, equityAccountId: b.equityAccountId, investor: (b.name || existing.shareholder.name), createdById: userId })
      await tx.preferredShare.update({ where: { id: b.id }, data: { journalEntryId: jeId } })
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Preferred share update error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.$transaction(async (tx) => {
    const share = await tx.preferredShare.findUnique({ where: { id }, select: { shareholderId: true } })
    await reverseEquityJournal(tx, 'EQUITY_PREFERRED', id)
    await tx.preferredShare.delete({ where: { id } })
    if (share) {
      const [c, p] = await Promise.all([tx.commonShare.count({ where: { shareholderId: share.shareholderId } }), tx.preferredShare.count({ where: { shareholderId: share.shareholderId } })])
      if (c === 0 && p === 0) await tx.shareholder.delete({ where: { id: share.shareholderId } }).catch(() => {})
    }
  })
  return NextResponse.json({ success: true })
}
