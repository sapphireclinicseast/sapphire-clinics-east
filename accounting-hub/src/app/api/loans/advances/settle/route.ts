import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postJournalEntry } from '@/lib/accounting/posting'

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const num = (v: unknown) => Number(v || 0)
const r2 = (n: number) => Math.round(n * 100) / 100

// POST /api/loans/advances/settle  { id, paidDate, bankAccountId, proofUrls?, memo? }
// "Fully Paid": settles whatever principal is still outstanding on an advance in
// one payment — DR the advances liability / CR the chosen bank — and records it
// as a PAID payout. No schema of its own: the payout row is the settlement, so it
// shows in Payment History like any other payment and is offered in bank
// reconciliation against the bank it names.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const userId = session.user.id as string
    if (!b.id || !b.bankAccountId) return NextResponse.json({ error: 'Advance and the bank account it was paid from are required' }, { status: 400 })
    const [advance, payouts] = await Promise.all([
      prisma.advance.findUnique({ where: { id: b.id } }),
      prisma.advancePayout.findMany({ where: { advanceId: b.id }, select: { principalPortion: true } }),
    ])
    if (!advance) return NextResponse.json({ error: 'Advance not found' }, { status: 404 })
    if (!advance.creditAccountId) return NextResponse.json({ error: 'Set the "Account to be Credited" (advances liability) on the advance first — the settlement clears that account.' }, { status: 400 })
    const remaining = r2(num(advance.principalAmount) - payouts.reduce((s, p) => s + num(p.principalPortion), 0))
    if (!(remaining > 0)) return NextResponse.json({ error: 'Nothing left to settle — the recorded payments already cover the full principal.' }, { status: 400 })
    const paidDate = b.paidDate ? new Date(b.paidDate) : new Date()
    const proofUrls = Array.isArray(b.proofUrls) ? b.proofUrls : []
    const memo = typeof b.memo === 'string' && b.memo.trim() ? b.memo.trim().slice(0, 500) : null
    // Same branch rule as scheduled payments: dedicated to one branch → book there.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allocs = Array.isArray(advance.branchAllocations) ? (advance.branchAllocations as any[]).filter(a => a?.branch && Number(a?.amount) > 0) : []
    const jeBranch = allocs.length === 1 ? String(allocs[0].branch) : 'ALL'
    const rec = await prisma.$transaction(async (tx) => {
      const je = await postJournalEntry(tx as never, {
        entryDate: paidDate,
        description: `Advance fully paid — ${advance.name}${memo ? ` — ${memo}` : ''}`.slice(0, 250),
        referenceType: 'ADVANCE_PAYMENT', referenceId: advance.id, branch: jeBranch, createdById: userId,
        lines: [
          { accountId: advance.creditAccountId as string, debit: remaining, description: 'Advance settled in full' },
          { accountId: b.bankAccountId, credit: remaining, description: `Advance fully paid — ${advance.name}` },
        ],
      })
      return tx.advancePayout.create({ data: {
        advanceId: advance.id, dueDate: paidDate, principalPortion: remaining, interestPortion: 0, amount: remaining,
        status: 'PAID', paidDate, bankAccountId: b.bankAccountId, proofUrls, memo: memo || 'Fully paid — settlement',
        journalEntryId: je.id, createdById: userId,
      } })
    })
    return NextResponse.json({ id: rec.id, amount: remaining })
  } catch (e) {
    console.error('Advance settle error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to settle advance' }, { status: 500 })
  }
}
