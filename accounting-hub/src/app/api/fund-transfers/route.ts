import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// GET → all fund transfers (newest first) with resolved bank-account labels.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const transfers = await prisma.fundTransfer.findMany({ orderBy: { date: 'desc' } })
  const ids = [...new Set(transfers.flatMap(t => [t.fromAccountId, t.toAccountId]))]
  const accounts = ids.length ? await prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, accountNumber: true, accountTitle: true } }) : []
  const label = (id: string) => { const a = accounts.find(x => x.id === id); return a ? `${a.accountNumber} — ${a.accountTitle}` : '—' }
  // How many of this transfer's two bank legs are matched in Bank Reconciliation
  // (0, 1 or 2) — the star on the list.
  const legAgg = await prisma.bankTransaction.groupBy({
    by: ['matchId'], where: { matchType: 'FUND_TRANSFER', matchId: { in: transfers.map(t => t.id) } }, _count: { _all: true },
  })
  const legs = new Map(legAgg.map(l => [l.matchId as string, l._count._all]))
  return NextResponse.json(transfers.map(t => ({
    matchedLegs: legs.get(t.id) || 0,
    id: t.id, refNumber: t.refNumber, date: t.date.toISOString().slice(0, 10),
    fromAccountId: t.fromAccountId, toAccountId: t.toAccountId, fromLabel: label(t.fromAccountId), toLabel: label(t.toAccountId),
    amount: Number(t.amount), checkNumber: t.checkNumber, description: t.description, proofUrl: t.proofUrl,
    toAmount: t.toAmount == null ? null : Number(t.toAmount),
    exchangeRate: t.exchangeRate == null ? null : Number(t.exchangeRate),
    proofUrls: Array.isArray(t.proofUrls) ? t.proofUrls : (t.proofUrl ? [t.proofUrl] : []),
  })))
}

// POST { date, fromAccountId, toAccountId, amount, toAmount?, checkNumber, description, proofUrl }
//
// A currency exchange is an ordinary transfer whose two sides are held in
// different currencies: `amount` is what left the source, `toAmount` what landed
// in the destination, and the rate they imply is amount / toAmount. Both stay
// null on a same-currency transfer.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { date, fromAccountId, toAccountId, amount, toAmount, checkNumber, description, proofUrl, proofUrls } = await req.json()
    if (!date || !fromAccountId || !toAccountId) return NextResponse.json({ error: 'Date, From and To accounts are required' }, { status: 400 })
    const urls: string[] = Array.isArray(proofUrls) ? proofUrls.filter(Boolean) : (proofUrl ? [proofUrl] : [])
    if (fromAccountId === toAccountId) return NextResponse.json({ error: 'From and To must be different accounts' }, { status: 400 })
    const amt = Number(amount)
    if (!amt || amt <= 0) return NextResponse.json({ error: 'Enter a valid amount' }, { status: 400 })

    // Cross-currency check is driven by the accounts themselves, so a plain
    // transfer can never be mistaken for an exchange (or the reverse).
    const [fromAcct, toAcct] = await Promise.all([
      prisma.account.findUnique({ where: { id: fromAccountId }, select: { currency: true } }),
      prisma.account.findUnique({ where: { id: toAccountId }, select: { currency: true } }),
    ])
    const crossCurrency = (fromAcct?.currency || 'PHP') !== (toAcct?.currency || 'PHP')
    const toAmt = toAmount == null || toAmount === '' ? null : Number(toAmount)
    if (crossCurrency && !(toAmt && toAmt > 0)) {
      return NextResponse.json({ error: 'The two accounts are held in different currencies — enter the amount that landed in the destination account' }, { status: 400 })
    }
    if (!crossCurrency && toAmt) {
      return NextResponse.json({ error: 'Both accounts are in the same currency, so there is no exchange to record' }, { status: 400 })
    }

    const created = await prisma.$transaction(async (tx) => {
      let s = await tx.fundTransferSettings.findUnique({ where: { id: 'singleton' } })
      if (!s) s = await tx.fundTransferSettings.create({ data: { id: 'singleton', nextSeq: 1 } })
      // The settings page lets the counter be set by hand, so it can fall behind
      // the transfers that already exist — never allocate below max(refSeq)+1 or
      // the refNumber unique constraint rejects the create.
      const maxSeq = (await tx.fundTransfer.aggregate({ _max: { refSeq: true } }))._max.refSeq ?? 0
      const seq = Math.max(s.nextSeq, maxSeq + 1)
      await tx.fundTransferSettings.update({ where: { id: 'singleton' }, data: { nextSeq: seq + 1 } })
      // Year comes from the transfer's own date, not today's — back-entering a 2025
      // transfer in 2026 was numbering it FT26.
      const yy = new Date(date).getFullYear() % 100
      const refNumber = `FT${yy}-${String(seq).padStart(6, '0')}`
      return tx.fundTransfer.create({
        data: {
          refNumber, refSeq: seq, date: new Date(date), fromAccountId, toAccountId, amount: amt,
          toAmount: crossCurrency ? toAmt : null,
          exchangeRate: crossCurrency && toAmt ? amt / toAmt : null,
          checkNumber: checkNumber || null, description: description || null,
          proofUrl: urls[0] || null, proofUrls: urls,
          createdById: session.user.id ?? null,
        },
      })
    })
    return NextResponse.json({ id: created.id, refNumber: created.refNumber })
  } catch (e) {
    console.error('Fund transfer create error:', e)
    return NextResponse.json({ error: 'Failed to create transfer' }, { status: 500 })
  }
}

// PATCH { id, ...fields } — edit an existing transfer (ref number stays).
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id, date, fromAccountId, toAccountId, amount, toAmount, checkNumber, description, proofUrl, proofUrls } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (date) data.date = new Date(date)
    if (fromAccountId) data.fromAccountId = fromAccountId
    if (toAccountId) data.toAccountId = toAccountId
    if (amount !== undefined) data.amount = Number(amount) || 0
    // Editing either leg re-derives the rate; clearing toAmount turns an exchange
    // back into a plain transfer.
    if (toAmount !== undefined) {
      const t = toAmount == null || toAmount === '' ? null : Number(toAmount)
      data.toAmount = t && t > 0 ? t : null
      const a = amount !== undefined ? Number(amount) || 0 : null
      const baseAmt = a ?? Number((await prisma.fundTransfer.findUnique({ where: { id }, select: { amount: true } }))?.amount ?? 0)
      data.exchangeRate = data.toAmount && baseAmt > 0 ? baseAmt / data.toAmount : null
    }
    if (checkNumber !== undefined) data.checkNumber = checkNumber || null
    if (description !== undefined) data.description = description || null
    if (proofUrls !== undefined) { const urls: string[] = Array.isArray(proofUrls) ? proofUrls.filter(Boolean) : []; data.proofUrls = urls; data.proofUrl = urls[0] || null }
    else if (proofUrl !== undefined) data.proofUrl = proofUrl || null
    const t = await prisma.fundTransfer.update({ where: { id }, data })
    return NextResponse.json({ id: t.id })
  } catch (e) {
    console.error('Fund transfer update error:', e)
    return NextResponse.json({ error: 'Failed to update transfer' }, { status: 500 })
  }
}

// DELETE ?id=...
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try { await prisma.fundTransfer.delete({ where: { id } }); return NextResponse.json({ success: true }) }
  catch { return NextResponse.json({ error: 'Failed to delete' }, { status: 500 }) }
}
