import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// GET ?bankAccountId= → the statement uploads on this account, newest first,
// each with the live state of the rows it created.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bankAccountId = new URL(req.url).searchParams.get('bankAccountId') || ''
  if (!bankAccountId) return NextResponse.json({ error: 'bankAccountId is required' }, { status: 400 })

  const [batches, rows] = await Promise.all([
    prisma.bankImportBatch.findMany({ where: { bankAccountId }, orderBy: { createdAt: 'desc' } }),
    prisma.bankTransaction.findMany({
      where: { bankAccountId, importBatch: { not: null } },
      select: { importBatch: true, status: true, date: true },
    }),
  ])

  const byBatch = new Map<string, typeof rows>()
  for (const r of rows) {
    const k = r.importBatch as string
    if (!byBatch.has(k)) byBatch.set(k, [])
    byBatch.get(k)!.push(r)
  }

  const userIds = [...new Set(batches.map(b => b.createdById).filter(Boolean) as string[])]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : []
  const who = (id: string | null) => {
    const u = users.find(x => x.id === id)
    return u ? (u.name || u.email) : null
  }

  const shape = (id: string, fileName: string | null, createdAt: Date, createdById: string | null) => {
    const rs = byBatch.get(id) || []
    const dates = rs.map(r => r.date).sort((a, b) => +a - +b)
    return {
      id, fileName, createdAt: createdAt.toISOString(), createdBy: who(createdById),
      total: rs.length,
      pending: rs.filter(r => r.status === 'PENDING').length,
      posted: rs.filter(r => r.status === 'POSTED').length,
      archived: rs.filter(r => r.status === 'ARCHIVED').length,
      from: dates[0]?.toISOString().slice(0, 10) ?? null,
      to: dates[dates.length - 1]?.toISOString().slice(0, 10) ?? null,
    }
  }

  const out = batches.map(b => shape(b.id, b.fileName, b.createdAt, b.createdById))
  // Uploads made before batches were recorded still carry the old marker string.
  const known = new Set(batches.map(b => b.id))
  for (const key of byBatch.keys()) {
    if (!known.has(key)) out.push(shape(key, 'Earlier upload', new Date(0), null))
  }
  return NextResponse.json(out)
}

// DELETE ?id=<batch>[&force=1] — remove every row this upload created.
// Refuses by default if any of those rows have been posted, since deleting them
// would also drop the journal entries they produced.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const id = sp.get('id') || ''
  const force = sp.get('force') === '1'
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const rows = await prisma.bankTransaction.findMany({ where: { importBatch: id } })
  if (rows.length === 0) {
    await prisma.bankImportBatch.delete({ where: { id } }).catch(() => {})
    return NextResponse.json({ deleted: 0 })
  }
  const posted = rows.filter(r => r.status === 'POSTED')
  if (posted.length && !force) {
    return NextResponse.json({
      error: `${posted.length} of these ${rows.length} lines are already posted. Deleting them also removes the journal entries they created.`,
      needsForce: true, posted: posted.length, total: rows.length,
    }, { status: 409 })
  }

  const jeIds = rows.map(r => r.journalEntryId).filter(Boolean) as string[]
  const fxIds = [...new Set(rows.filter(r => r.matchType === 'FOREX' && r.matchId).map(r => r.matchId as string))]
  const deleted = await prisma.$transaction(async (tx) => {
    if (jeIds.length) await tx.journalEntry.deleteMany({ where: { id: { in: jeIds } } })
    // Release the far side of any currency exchange these rows took part in.
    if (fxIds.length) {
      await tx.bankTransaction.updateMany({
        where: { matchId: { in: fxIds }, importBatch: { not: id } },
        data: { status: 'PENDING', matchType: null, matchId: null, matchLabel: null, journalEntryId: null },
      })
      await tx.fundTransfer.deleteMany({ where: { id: { in: fxIds } } })
    }
    const res = await tx.bankTransaction.deleteMany({ where: { importBatch: id } })
    await tx.bankImportBatch.delete({ where: { id } }).catch(() => {})
    return res.count
  })
  return NextResponse.json({ deleted })
}
