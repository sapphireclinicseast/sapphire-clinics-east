import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const r2 = (n: number) => Math.round(n * 100) / 100

// Row-shaping for bank reconciliation. The matcher works line-for-line, but
// the bank does not: one deposit can settle several POS sales, and one payroll
// can leave in two transfers. Rather than teach every match flow N-to-M
// arithmetic, the statement lines themselves are reshaped first — then the
// ordinary one-line Match/Categorise flow takes over.
//
// POST { action: 'split',   id, legs: [{ amount, note? }, ...] }
//   → replaces one PENDING line with 2+ legs on the same side summing exactly
//     to it. Original sits EXCLUDED until an undo.
// POST { action: 'combine', ids: [...] }
//   → replaces 2+ PENDING lines (same account, any mix of spent/received)
//     with one net line. A set that nets to ZERO (a double-send and its
//     return) just closes: the sources are excluded as an offset pair.
// POST { action: 'undo', id }
//   → id is a derived row (split leg or combined line): deletes the derived
//     row(s) and restores the source line(s) to PENDING. Only possible while
//     no derived row has been posted.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()

    if (body.action === 'split') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
      const legs: { amount: number; note?: string }[] = Array.isArray(body.legs)
        ? body.legs.map((l: { amount: unknown; note?: unknown }) => ({ amount: Number(l.amount), note: typeof l.note === 'string' ? l.note : undefined }))
        : []
      if (legs.length < 2) return NextResponse.json({ error: 'A split needs at least two legs' }, { status: 400 })
      if (legs.some(l => !(l.amount > 0))) return NextResponse.json({ error: 'Every leg needs an amount above zero' }, { status: 400 })
      const txn = await prisma.bankTransaction.findUnique({ where: { id } })
      if (!txn) return NextResponse.json({ error: 'Bank line not found' }, { status: 404 })
      if (txn.status !== 'PENDING' || txn.journalEntryId) {
        return NextResponse.json({ error: 'Only an untagged PENDING line can be split — undo its posting first' }, { status: 400 })
      }
      const isSpent = Number(txn.spent) > 0
      const total = isSpent ? Number(txn.spent) : Number(txn.received)
      const legSum = r2(legs.reduce((s, l) => s + l.amount, 0))
      if (Math.abs(legSum - total) > 0.005) {
        return NextResponse.json({ error: `The legs add up to ${legSum.toFixed(2)}, but the line is ${total.toFixed(2)} — they must match exactly` }, { status: 400 })
      }
      const created = await prisma.$transaction(async (tx) => {
        const rows = []
        for (let i = 0; i < legs.length; i++) {
          rows.push(await tx.bankTransaction.create({
            data: {
              bankAccountId: txn.bankAccountId,
              date: txn.date,
              description: `${txn.description} — split ${i + 1}/${legs.length}`,
              spent: isSpent ? legs[i].amount : 0,
              received: isSpent ? 0 : legs[i].amount,
              status: 'PENDING',
              fromToName: txn.fromToName,
              fxRate: txn.fxRate,
              importBatch: txn.importBatch,
              note: legs[i].note || null,
              splitFromId: txn.id,
              createdById: session.user!.id as string,
            },
            select: { id: true },
          }))
        }
        await tx.bankTransaction.update({
          where: { id: txn.id },
          data: { status: 'EXCLUDED', note: `[SPLIT into ${legs.length} legs]${txn.note ? ` ${txn.note}` : ''}`.slice(0, 480) },
        })
        return rows
      })
      return NextResponse.json({ ok: true, legIds: created.map(r => r.id) }, { status: 201 })
    }

    if (body.action === 'combine') {
      const rawIds: unknown[] = Array.isArray(body.ids) ? body.ids : []
      const ids = [...new Set(rawIds.filter((x): x is string => typeof x === 'string' && !!x))]
      if (ids.length < 2) return NextResponse.json({ error: 'Pick at least two lines to combine' }, { status: 400 })
      const rows = await prisma.bankTransaction.findMany({ where: { id: { in: ids } } })
      if (rows.length !== ids.length) return NextResponse.json({ error: 'Some picked lines no longer exist — reload' }, { status: 400 })
      if (rows.some(r => r.status !== 'PENDING' || r.journalEntryId)) {
        return NextResponse.json({ error: 'Only untagged PENDING lines can be combined' }, { status: 400 })
      }
      if (new Set(rows.map(r => r.bankAccountId)).size > 1) {
        return NextResponse.json({ error: 'The lines must belong to the same bank account' }, { status: 400 })
      }
      const net = r2(rows.reduce((s, r) => s + Number(r.received) - Number(r.spent), 0))
      const latest = rows.reduce((a, b) => (a.date > b.date ? a : b))
      const result = await prisma.$transaction(async (tx) => {
        if (Math.abs(net) <= 0.005) {
          // A perfect offset (e.g. a double-sent salary and its return): nothing
          // left to match — close the pair against each other.
          for (const r of rows) {
            await tx.bankTransaction.update({
              where: { id: r.id },
              data: { status: 'EXCLUDED', note: `[OFFSET — nets to zero with ${rows.filter(x => x.id !== r.id).map(x => x.description).join(' + ')}]`.slice(0, 480) },
            })
          }
          return { offset: true as const }
        }
        const combined = await tx.bankTransaction.create({
          data: {
            bankAccountId: rows[0].bankAccountId,
            date: latest.date,
            description: `Combined (${rows.length} lines): ${rows.map(r => r.description).join(' + ')}`.slice(0, 480),
            spent: net < 0 ? -net : 0,
            received: net > 0 ? net : 0,
            status: 'PENDING',
            fromToName: rows.find(r => r.fromToName)?.fromToName || null,
            importBatch: rows[0].importBatch,
            sourceRowIds: ids,
            createdById: session.user!.id as string,
          },
          select: { id: true },
        })
        for (const r of rows) {
          await tx.bankTransaction.update({
            where: { id: r.id },
            data: { status: 'EXCLUDED', note: `[COMBINED into one ${net > 0 ? 'received' : 'spent'} line of ${Math.abs(net).toFixed(2)}]${r.note ? ` ${r.note}` : ''}`.slice(0, 480) },
          })
        }
        return { offset: false as const, combinedId: combined.id }
      })
      return NextResponse.json({ ok: true, ...result }, { status: 201 })
    }

    if (body.action === 'undo') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
      const row = await prisma.bankTransaction.findUnique({ where: { id } })
      if (!row) return NextResponse.json({ error: 'Bank line not found' }, { status: 404 })

      if (row.splitFromId) {
        const legs = await prisma.bankTransaction.findMany({ where: { splitFromId: row.splitFromId } })
        if (legs.some(l => l.status !== 'PENDING' || l.journalEntryId)) {
          return NextResponse.json({ error: 'A leg of this split is already posted — undo that posting first' }, { status: 400 })
        }
        await prisma.$transaction(async (tx) => {
          await tx.bankTransaction.deleteMany({ where: { splitFromId: row.splitFromId! } })
          await tx.bankTransaction.update({
            where: { id: row.splitFromId! },
            data: { status: 'PENDING', note: null },
          })
        })
        return NextResponse.json({ ok: true, restored: 1 })
      }

      const sourceIds = Array.isArray(row.sourceRowIds) ? (row.sourceRowIds as string[]) : null
      if (sourceIds?.length) {
        if (row.status !== 'PENDING' || row.journalEntryId) {
          return NextResponse.json({ error: 'This combined line is already posted — undo that posting first' }, { status: 400 })
        }
        await prisma.$transaction(async (tx) => {
          await tx.bankTransaction.delete({ where: { id: row.id } })
          await tx.bankTransaction.updateMany({ where: { id: { in: sourceIds } }, data: { status: 'PENDING', note: null } })
        })
        return NextResponse.json({ ok: true, restored: sourceIds.length })
      }

      return NextResponse.json({ error: 'This line is not a split leg or a combined line' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    console.error('Bank-rec reshape failed', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
