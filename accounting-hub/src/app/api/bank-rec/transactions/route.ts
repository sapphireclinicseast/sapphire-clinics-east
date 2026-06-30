import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// GET ?bankAccountId=&status=PENDING&search=&from=&to=
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const bankAccountId = sp.get('bankAccountId') || ''
  if (!bankAccountId) return NextResponse.json({ error: 'bankAccountId is required' }, { status: 400 })
  const status = sp.get('status') || 'PENDING'
  const search = (sp.get('search') || '').trim()
  const from = sp.get('from'), to = sp.get('to')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { bankAccountId, status }
  if (search) where.description = { contains: search, mode: 'insensitive' }
  if (from || to) {
    where.date = {}
    if (from) where.date.gte = new Date(from)
    if (to) { const d = new Date(to); d.setUTCDate(d.getUTCDate() + 1); where.date.lt = d }
  }
  const txns = await prisma.bankTransaction.findMany({ where, orderBy: { date: 'desc' } })
  // resolve category account labels
  const catIds = [...new Set(txns.map(t => t.categoryAccountId).filter(Boolean) as string[])]
  const cats = catIds.length ? await prisma.account.findMany({ where: { id: { in: catIds } }, select: { id: true, accountNumber: true, accountTitle: true } }) : []
  const catLabel = (id: string | null) => { if (!id) return null; const a = cats.find(x => x.id === id); return a ? `${a.accountNumber} — ${a.accountTitle}` : null }
  return NextResponse.json(txns.map(t => ({
    id: t.id, date: t.date.toISOString().slice(0, 10), description: t.description,
    spent: Number(t.spent), received: Number(t.received), status: t.status, fromToName: t.fromToName,
    categoryAccountId: t.categoryAccountId, categoryLabel: catLabel(t.categoryAccountId),
    matchType: t.matchType, matchId: t.matchId, matchLabel: t.matchLabel, note: t.note, proofUrl: t.proofUrl,
  })))
}

// POST — manual add { bankAccountId, date, description, spent, received, fromToName }
//        OR bulk import { bankAccountId, rows: [{ date, description, spent, received }] }
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const bankAccountId = body.bankAccountId
    if (!bankAccountId) return NextResponse.json({ error: 'bankAccountId is required' }, { status: 400 })

    if (Array.isArray(body.rows)) {
      const batch = `imp_${session.user.id}_${body.batchStamp || ''}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = body.rows.map((r: any) => ({
        bankAccountId, date: new Date(r.date), description: String(r.description || '').slice(0, 500),
        spent: Number(r.spent) || 0, received: Number(r.received) || 0, importBatch: batch, createdById: session.user.id ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })).filter((r: any) => !isNaN(+r.date) && (r.spent > 0 || r.received > 0))
      if (data.length === 0) return NextResponse.json({ error: 'No valid rows found (need a date and a Spent or Received amount)' }, { status: 400 })
      const res = await prisma.bankTransaction.createMany({ data })
      return NextResponse.json({ imported: res.count })
    }

    if (!body.date || !body.description) return NextResponse.json({ error: 'Date and description are required' }, { status: 400 })
    const spent = Number(body.spent) || 0, received = Number(body.received) || 0
    if (spent <= 0 && received <= 0) return NextResponse.json({ error: 'Enter a Spent or Received amount' }, { status: 400 })
    const t = await prisma.bankTransaction.create({
      data: { bankAccountId, date: new Date(body.date), description: body.description, spent, received, fromToName: body.fromToName || null, createdById: session.user.id ?? null },
    })
    return NextResponse.json({ id: t.id })
  } catch (e) {
    console.error('Bank txn create error:', e)
    return NextResponse.json({ error: 'Failed to add transaction(s)' }, { status: 500 })
  }
}

// PATCH { id, action } — categorise | match | exclude | unpost | update
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { id, action } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const txn = await prisma.bankTransaction.findUnique({ where: { id } })
    if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (action === 'categorise') {
      const categoryAccountId = body.categoryAccountId
      if (!categoryAccountId) return NextResponse.json({ error: 'Choose a category account' }, { status: 400 })
      const amount = Number(txn.spent) > 0 ? Number(txn.spent) : Number(txn.received)
      const isSpent = Number(txn.spent) > 0
      // Spent: Dr category / Cr bank.  Received: Dr bank / Cr category.
      const lines = isSpent
        ? [{ accountId: categoryAccountId, debit: amount, credit: 0 }, { accountId: txn.bankAccountId, debit: 0, credit: amount }]
        : [{ accountId: txn.bankAccountId, debit: amount, credit: 0 }, { accountId: categoryAccountId, debit: 0, credit: amount }]
      const je = await prisma.$transaction(async (tx) => {
        if (txn.journalEntryId) await tx.journalEntry.delete({ where: { id: txn.journalEntryId } }).catch(() => {})
        const created = await tx.journalEntry.create({
          data: {
            entryDate: txn.date, description: `Bank: ${txn.description}`, referenceType: 'BANK_REC', referenceId: txn.id,
            totalAmount: amount, createdById: session.user!.id as string,
            lines: { create: lines.map(l => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: txn.description })) },
          },
        })
        await tx.bankTransaction.update({ where: { id }, data: { status: 'POSTED', categoryAccountId, journalEntryId: created.id, matchType: null, matchId: null, matchLabel: null, fromToName: body.fromToName ?? txn.fromToName } })
        return created
      })
      return NextResponse.json({ success: true, journalEntryId: je.id })
    }

    if (action === 'match') {
      await prisma.bankTransaction.update({ where: { id }, data: { status: 'POSTED', matchType: body.matchType || 'MANUAL', matchId: body.matchId || null, matchLabel: body.matchLabel || null, categoryAccountId: null } })
      return NextResponse.json({ success: true })
    }
    if (action === 'exclude') {
      if (txn.journalEntryId) await prisma.journalEntry.delete({ where: { id: txn.journalEntryId } }).catch(() => {})
      await prisma.bankTransaction.update({ where: { id }, data: { status: 'EXCLUDED', journalEntryId: null, categoryAccountId: null, matchType: null, matchId: null, matchLabel: null } })
      return NextResponse.json({ success: true })
    }
    if (action === 'unpost') {
      if (txn.journalEntryId) await prisma.journalEntry.delete({ where: { id: txn.journalEntryId } }).catch(() => {})
      await prisma.bankTransaction.update({ where: { id }, data: { status: 'PENDING', journalEntryId: null, categoryAccountId: null, matchType: null, matchId: null, matchLabel: null } })
      return NextResponse.json({ success: true })
    }
    if (action === 'update') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = {}
      if (body.date) data.date = new Date(body.date)
      if (body.description !== undefined) data.description = body.description
      if (body.spent !== undefined) data.spent = Number(body.spent) || 0
      if (body.received !== undefined) data.received = Number(body.received) || 0
      if (body.fromToName !== undefined) data.fromToName = body.fromToName || null
      if (body.note !== undefined) data.note = body.note || null
      if (body.proofUrl !== undefined) data.proofUrl = body.proofUrl || null
      await prisma.bankTransaction.update({ where: { id }, data })
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    console.error('Bank txn patch error:', e)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
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
  try {
    const txn = await prisma.bankTransaction.findUnique({ where: { id } })
    if (txn?.journalEntryId) await prisma.journalEntry.delete({ where: { id: txn.journalEntryId } }).catch(() => {})
    await prisma.bankTransaction.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Failed to delete' }, { status: 500 }) }
}
