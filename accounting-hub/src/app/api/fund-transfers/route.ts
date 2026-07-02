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
  return NextResponse.json(transfers.map(t => ({
    id: t.id, refNumber: t.refNumber, date: t.date.toISOString().slice(0, 10),
    fromAccountId: t.fromAccountId, toAccountId: t.toAccountId, fromLabel: label(t.fromAccountId), toLabel: label(t.toAccountId),
    amount: Number(t.amount), checkNumber: t.checkNumber, description: t.description, proofUrl: t.proofUrl,
    proofUrls: Array.isArray(t.proofUrls) ? t.proofUrls : (t.proofUrl ? [t.proofUrl] : []),
  })))
}

// POST { date, fromAccountId, toAccountId, amount, checkNumber, description, proofUrl }
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { date, fromAccountId, toAccountId, amount, checkNumber, description, proofUrl, proofUrls } = await req.json()
    if (!date || !fromAccountId || !toAccountId) return NextResponse.json({ error: 'Date, From and To accounts are required' }, { status: 400 })
    const urls: string[] = Array.isArray(proofUrls) ? proofUrls.filter(Boolean) : (proofUrl ? [proofUrl] : [])
    if (fromAccountId === toAccountId) return NextResponse.json({ error: 'From and To must be different accounts' }, { status: 400 })
    const amt = Number(amount)
    if (!amt || amt <= 0) return NextResponse.json({ error: 'Enter a valid amount' }, { status: 400 })

    const created = await prisma.$transaction(async (tx) => {
      let s = await tx.fundTransferSettings.findUnique({ where: { id: 'singleton' } })
      if (!s) s = await tx.fundTransferSettings.create({ data: { id: 'singleton', nextSeq: 1 } })
      const seq = s.nextSeq
      await tx.fundTransferSettings.update({ where: { id: 'singleton' }, data: { nextSeq: seq + 1 } })
      const yy = new Date().getFullYear() % 100
      const refNumber = `FT${yy}-${String(seq).padStart(6, '0')}`
      return tx.fundTransfer.create({
        data: {
          refNumber, refSeq: seq, date: new Date(date), fromAccountId, toAccountId, amount: amt,
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
    const { id, date, fromAccountId, toAccountId, amount, checkNumber, description, proofUrl, proofUrls } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (date) data.date = new Date(date)
    if (fromAccountId) data.fromAccountId = fromAccountId
    if (toAccountId) data.toAccountId = toAccountId
    if (amount !== undefined) data.amount = Number(amount) || 0
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
