import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PPE_CLASSIFICATION_LABELS, NON_DEPRECIATING_CLASSIFICATION_LABELS } from '@/lib/asset-classification'

// GET /api/budgets/capex-actual?year=&branch=
// Actual asset purchases for the year, grouped by month and classification.
//
// Read from the LEDGER — the journal lines on the classification accounts
// (2020…2100), net of reversals and disposals, filtered by JournalEntry.branch —
// exactly the rows and totals the Subsidiary Ledger shows for those accounts.
// The Asset table is deliberately not used here: an asset row without a
// branch-tagged journal (or vice versa) would make Budget vs Actual disagree
// with the Subsidiary Ledger, and the ledger is the book of record.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '', 10)
  const branch = searchParams.get('branch') || 'ALL'
  if (!year) return NextResponse.json({ error: 'year is required' }, { status: 400 })

  const codes = Object.keys({ ...PPE_CLASSIFICATION_LABELS, ...NON_DEPRECIATING_CLASSIFICATION_LABELS })

  const lines = await prisma.journalEntryLine.findMany({
    where: {
      account: { accountNumber: { in: codes } },
      journalEntry: {
        entryDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
        ...(branch !== 'ALL' ? { branch } : {}),
      },
    },
    select: {
      debit: true, credit: true,
      account: { select: { accountNumber: true } },
      journalEntry: { select: { entryDate: true } },
    },
  })

  // { month: { "2050": amount } } — keyed by classification code alone; the page
  // matches it against its "<code> <label>" budget lines.
  const byMonth: Record<number, Record<string, number>> = {}
  for (const l of lines) {
    const m = l.journalEntry.entryDate.getUTCMonth() + 1
    const code = l.account.accountNumber
    byMonth[m] ??= {}
    byMonth[m][code] = (byMonth[m][code] || 0) + Number(l.debit) - Number(l.credit)
  }

  return NextResponse.json({ year, branch, capexByMonth: byMonth })
}
