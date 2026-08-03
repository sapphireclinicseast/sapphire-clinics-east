import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ARCHIVED, isLocked, tagCutoff } from '@/lib/bank-rec'
import { isForeign, rateFor, recordRate, toPhp } from '@/lib/fx'
import { applyBankRules } from '@/lib/bank-rec-rules'

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
      // One batch record per upload so the whole file can be removed again later.
      const batchRow = await prisma.bankImportBatch.create({
        data: { bankAccountId, fileName: String(body.fileName || '').slice(0, 200) || null, createdById: session.user.id ?? null },
      })
      const batch = batchRow.id
      const cutoff = await tagCutoff(bankAccountId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = body.rows.map((r: any) => {
        const date = new Date(r.date)
        return {
          bankAccountId, date, description: String(r.description || '').slice(0, 500),
          spent: Number(r.spent) || 0, received: Number(r.received) || 0,
          statementBalance: r.balance === '' || r.balance == null || isNaN(Number(r.balance)) ? null : Number(r.balance),
          // Pre-Hub periods come in for the record only — locked from tagging.
          status: isLocked(date, cutoff) ? ARCHIVED : 'PENDING',
          importBatch: batch, createdById: session.user.id ?? null,
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }).filter((r: any) => !isNaN(+r.date) && (r.spent > 0 || r.received > 0))
      if (data.length === 0) {
        await prisma.bankImportBatch.delete({ where: { id: batch } }).catch(() => {})
        return NextResponse.json({ error: 'No valid rows found (need a date and a Spent or Received amount)' }, { status: 400 })
      }

      // Re-uploading a statement must not double up the ledger, so skip lines
      // this account already has on the same date, amount and description.
      //
      // Counted, not de-duplicated: a statement legitimately repeats a line —
      // two suppliers paying the same amount on the same day are two separate
      // transactions, not one entered twice. So a line is skipped only while the
      // account already holds an unclaimed copy of it. A file with two identical
      // rows against an empty account imports both; re-uploading that same file
      // then skips both.
      const dates = data.map((r: { date: Date }) => +r.date)
      const existing = await prisma.bankTransaction.findMany({
        where: { bankAccountId, date: { gte: new Date(Math.min(...dates)), lte: new Date(Math.max(...dates)) } },
        select: { date: true, description: true, spent: true, received: true },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const key = (r: any) => `${new Date(r.date).toISOString().slice(0, 10)}|${String(r.description).trim().toLowerCase()}|${Number(r.spent).toFixed(2)}|${Number(r.received).toFixed(2)}`
      const onFile = new Map<string, number>()
      for (const e of existing) onFile.set(key(e), (onFile.get(key(e)) || 0) + 1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fresh = data.filter((r: any) => {
        const k = key(r), left = onFile.get(k) || 0
        if (left > 0) { onFile.set(k, left - 1); return false }
        return true
      })
      const skipped = data.length - fresh.length
      if (fresh.length === 0) {
        await prisma.bankImportBatch.delete({ where: { id: batch } }).catch(() => {})
        return NextResponse.json({ imported: 0, skipped, archived: 0 })
      }

      const res = await prisma.bankTransaction.createMany({ data: fresh })
      await prisma.bankImportBatch.update({ where: { id: batch }, data: { rowCount: res.count } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const archived = fresh.filter((r: any) => r.status === ARCHIVED).length
      // Recurring payees are a decision made once: the active auto-rules run
      // over the batch that was just imported, so a fresh statement arrives
      // already categorized as far as the rules can carry it.
      let autoPosted = 0
      try {
        const auto = await applyBankRules(prisma, session.user.id as string, { importBatch: batch })
        autoPosted = auto.posted
      } catch { /* rules must never break an upload */ }
      return NextResponse.json({ imported: res.count, skipped, archived, autoPosted })
    }

    if (!body.date || !body.description) return NextResponse.json({ error: 'Date and description are required' }, { status: 400 })
    const spent = Number(body.spent) || 0, received = Number(body.received) || 0
    if (spent <= 0 && received <= 0) return NextResponse.json({ error: 'Enter a Spent or Received amount' }, { status: 400 })
    const date = new Date(body.date)
    const t = await prisma.bankTransaction.create({
      data: {
        bankAccountId, date, description: body.description, spent, received,
        status: isLocked(date, await tagCutoff(bankAccountId)) ? ARCHIVED : 'PENDING',
        fromToName: body.fromToName || null, createdById: session.user.id ?? null,
      },
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

    // Bulk: archive every still-untagged line that pre-dates the account's
    // reconciliation start date. Never touches POSTED lines.
    if (action === 'lock-older') {
      const bankAccountId = body.bankAccountId
      if (!bankAccountId) return NextResponse.json({ error: 'bankAccountId is required' }, { status: 400 })
      const cutoff = await tagCutoff(bankAccountId)
      if (!cutoff) return NextResponse.json({ error: 'Set a reconciliation start date for this account under Opening balance first.' }, { status: 400 })
      const res = await prisma.bankTransaction.updateMany({
        where: { bankAccountId, status: 'PENDING', date: { lt: cutoff } },
        data: { status: ARCHIVED },
      })
      return NextResponse.json({ success: true, archived: res.count, cutoff: cutoff.toISOString().slice(0, 10) })
    }

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const txn = await prisma.bankTransaction.findUnique({ where: { id } })
    if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (txn.status === ARCHIVED && ['categorise', 'match', 'match-forex', 'exclude', 'unpost'].includes(action)) {
      return NextResponse.json({ error: 'This period is locked. It pre-dates the Hub, so there is nothing here to match it against.' }, { status: 409 })
    }
    if (action === 'unarchive') {
      if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Only an admin can unlock an archived period' }, { status: 403 })
      await prisma.bankTransaction.update({ where: { id }, data: { status: 'PENDING' } })
      return NextResponse.json({ success: true })
    }

    if (action === 'categorise') {
      const categoryAccountId = body.categoryAccountId
      if (!categoryAccountId) return NextResponse.json({ error: 'Choose a category account' }, { status: 400 })
      // Categorising a bank line to the account it is already on would debit and
      // credit the same account: the entry cancels itself and records nothing.
      // Money leaving one of your own accounts belongs to the other side of a
      // transfer, not to a category.
      if (categoryAccountId === txn.bankAccountId) {
        return NextResponse.json({
          error: 'That is this line\'s own bank account, so the entry would cancel itself out and record nothing. If this moved money to another account of yours, use Match — and Currency exchange if the other account is held in a different currency.',
          selfCategorise: true,
        }, { status: 400 })
      }
      const native = Number(txn.spent) > 0 ? Number(txn.spent) : Number(txn.received)
      const isSpent = Number(txn.spent) > 0

      // The ledger is kept in PHP, so a line on an account held in another
      // currency is translated at the rate for its date before it is posted.
      const bankAcct = await prisma.account.findUnique({
        where: { id: txn.bankAccountId }, select: { currency: true },
      })
      const cur = bankAcct?.currency || 'PHP'
      let amount = native, usedRate: number | null = null
      if (isForeign(cur)) {
        const rate = body.fxRate ? { phpPerUnit: Number(body.fxRate), rateDate: '', onOrBefore: true } : await rateFor(cur, txn.date)
        if (!rate || !(rate.phpPerUnit > 0)) {
          return NextResponse.json({
            error: `No ${cur} exchange rate is on file for ${txn.date.toISOString().slice(0, 10)}. Add one, or match a currency exchange so the rate is captured from it.`,
            needsRate: true, currency: cur,
          }, { status: 400 })
        }
        usedRate = rate.phpPerUnit
        amount = toPhp(native, usedRate)
      }
      // Spent: Dr category / Cr bank.  Received: Dr bank / Cr category.
      const lines = isSpent
        ? [{ accountId: categoryAccountId, debit: amount, credit: 0 }, { accountId: txn.bankAccountId, debit: 0, credit: amount }]
        : [{ accountId: txn.bankAccountId, debit: amount, credit: 0 }, { accountId: categoryAccountId, debit: 0, credit: amount }]
      const je = await prisma.$transaction(async (tx) => {
        if (txn.journalEntryId) await tx.journalEntry.delete({ where: { id: txn.journalEntryId } }).catch(() => {})
        const created = await tx.journalEntry.create({
          data: {
            entryDate: txn.date,
            description: usedRate
              ? `Bank: ${txn.description} (${native.toLocaleString('en-PH', { minimumFractionDigits: 2 })} ${bankAcct?.currency} @ ${usedRate})`
              : `Bank: ${txn.description}`,
            referenceType: 'BANK_REC', referenceId: txn.id,
            totalAmount: amount, createdById: session.user!.id as string,
            lines: { create: lines.map(l => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: txn.description })) },
          },
        })
        await tx.bankTransaction.update({ where: { id }, data: { status: 'POSTED', categoryAccountId, journalEntryId: created.id, fxRate: usedRate, matchType: null, matchId: null, matchLabel: null, fromToName: body.fromToName ?? txn.fromToName } })
        return created
      })
      return NextResponse.json({ success: true, journalEntryId: je.id, php: amount, rate: usedRate })
    }

    // Currency exchange: this line and its counterpart on a bank account held in
    // another currency are two halves of one transfer. Recording it as a single
    // FundTransfer keeps the implied rate with the movement that produced it.
    if (action === 'match-forex') {
      const other = await prisma.bankTransaction.findUnique({ where: { id: body.counterpartId || '' } })
      if (!other) return NextResponse.json({ error: 'Choose the matching line on the other account' }, { status: 400 })
      if (other.bankAccountId === txn.bankAccountId) return NextResponse.json({ error: 'Both lines are on the same bank account' }, { status: 400 })
      if (other.status === 'POSTED') return NextResponse.json({ error: 'That line is already posted' }, { status: 409 })
      if (other.status === ARCHIVED) return NextResponse.json({ error: 'That line sits in a locked period and cannot be tagged.' }, { status: 409 })

      const out = Number(txn.spent) > 0 ? txn : (Number(other.spent) > 0 ? other : null)
      const inn = out && out.id === txn.id ? other : txn
      if (!out || !(Number(out.spent) > 0) || !(Number(inn.received) > 0)) {
        return NextResponse.json({ error: 'A currency exchange needs one line paying out and one receiving' }, { status: 400 })
      }
      const [fromAcct, toAcct] = await Promise.all([
        prisma.account.findUnique({ where: { id: out.bankAccountId }, select: { currency: true } }),
        prisma.account.findUnique({ where: { id: inn.bankAccountId }, select: { currency: true } }),
      ])
      if ((fromAcct?.currency || 'PHP') === (toAcct?.currency || 'PHP')) {
        return NextResponse.json({ error: 'Both accounts are in the same currency — use a normal fund transfer' }, { status: 400 })
      }
      const paid = Number(out.spent), got = Number(inn.received)
      if (!(paid > 0 && got > 0)) return NextResponse.json({ error: 'Both amounts must be greater than zero' }, { status: 400 })
      const rate = Number((paid / got).toFixed(6))

      const transfer = await prisma.$transaction(async (tx) => {
        let s = await tx.fundTransferSettings.findUnique({ where: { id: 'singleton' } })
        if (!s) s = await tx.fundTransferSettings.create({ data: { id: 'singleton', nextSeq: 1 } })
        // Never allocate below max(refSeq)+1 — the hand-settable counter can lag
        // the existing transfers and the refNumber unique constraint would reject.
        const maxSeq = (await tx.fundTransfer.aggregate({ _max: { refSeq: true } }))._max.refSeq ?? 0
        const seq = Math.max(s.nextSeq, maxSeq + 1)
        await tx.fundTransferSettings.update({ where: { id: 'singleton' }, data: { nextSeq: seq + 1 } })
        const created = await tx.fundTransfer.create({
          data: {
            refNumber: `FT${new Date().getFullYear() % 100}-${String(seq).padStart(6, '0')}`, refSeq: seq,
            date: out.date, fromAccountId: out.bankAccountId, toAccountId: inn.bankAccountId,
            amount: paid, toAmount: got, exchangeRate: rate,
            description: body.description
              || `Currency exchange · ${got.toLocaleString('en-PH', { minimumFractionDigits: 2 })} ${toAcct?.currency || ''} @ ${rate}`,
            createdById: session.user!.id ?? null,
          },
        })
        const label = `${created.refNumber} · FX @ ${rate} ${fromAcct?.currency || 'PHP'}/${toAcct?.currency || ''}`
        for (const t of [out, inn]) {
          await tx.bankTransaction.update({
            where: { id: t.id },
            data: { status: 'POSTED', matchType: 'FOREX', matchId: created.id, matchLabel: label, categoryAccountId: null },
          })
        }
        return created
      })
      // The exchange just proved a real rate for that day — keep it so other
      // lines on the foreign account can be stated in PHP.
      await recordRate(toAcct?.currency || '', out.date, rate, `${transfer.refNumber}`, session.user!.id)
      return NextResponse.json({ success: true, refNumber: transfer.refNumber, rate })
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
      // A currency exchange is one transfer spanning two bank lines, so undoing
      // either side must release both and drop the transfer they created —
      // otherwise the other line stays posted against a record that is gone.
      if (txn.matchType === 'FOREX' && txn.matchId) {
        const both = await prisma.bankTransaction.findMany({ where: { matchType: 'FOREX', matchId: txn.matchId } })
        await prisma.$transaction(async (tx) => {
          await tx.bankTransaction.updateMany({
            where: { id: { in: both.map(b => b.id) } },
            data: { status: 'PENDING', journalEntryId: null, categoryAccountId: null, matchType: null, matchId: null, matchLabel: null },
          })
          await tx.fundTransfer.delete({ where: { id: txn.matchId! } }).catch(() => {})
        })
        return NextResponse.json({ success: true, released: both.length })
      }
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
