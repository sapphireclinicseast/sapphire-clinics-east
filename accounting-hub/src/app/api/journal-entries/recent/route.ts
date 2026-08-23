import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// The register behind the General Journal page: recent entries of every
// source, so a manual entry is seen in the same stream as the module-posted
// ones it sits beside on the ledger.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const onlyManual = sp.get('manual') === 'true'
  const q = (sp.get('q') || '').trim()
  const take = Math.min(parseInt(sp.get('take') || '50', 10) || 50, 200)
  const entries = await prisma.journalEntry.findMany({
    where: {
      ...(onlyManual ? { referenceType: 'MANUAL' } : {}),
      ...(q ? { OR: [{ description: { contains: q, mode: 'insensitive' } }, { referenceId: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    take,
    select: {
      id: true, entryDate: true, description: true, referenceType: true, referenceId: true,
      totalAmount: true, branch: true, createdAt: true,
      lines: { select: { debit: true, credit: true, description: true, account: { select: { accountNumber: true, accountTitle: true } } } },
    },
  })
  return NextResponse.json({
    entries: entries.map(e => ({
      id: e.id, entryDate: e.entryDate.toISOString().slice(0, 10), description: e.description,
      refType: e.referenceType, refId: e.referenceId, branch: e.branch,
      total: Number(e.totalAmount),
      lines: e.lines.map(l => ({
        account: l.account ? `${l.account.accountNumber} ${l.account.accountTitle}` : '(deleted account)',
        debit: Number(l.debit), credit: Number(l.credit), description: l.description,
      })),
    })),
  })
}
