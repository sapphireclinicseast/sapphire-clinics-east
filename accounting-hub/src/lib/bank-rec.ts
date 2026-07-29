import { prisma } from '@/lib/prisma'

// Bank lines dated before an account's reconciliation start date are kept for
// the record but locked from tagging: they pre-date the Hub, so there is
// nothing recorded here for them to be matched or categorised against.
//
// The cut-off is the account's Beginning Balances start date — the same date
// that already bounds match suggestions (see api/bank-rec/matches).
export const ARCHIVED = 'ARCHIVED'

export async function tagCutoff(bankAccountId: string): Promise<Date | null> {
  const beg = await prisma.beginningBalance.findFirst({
    where: { accountId: bankAccountId, startDate: { not: null } },
    orderBy: { periodYear: 'desc' },
    select: { startDate: true },
  })
  return beg?.startDate ? new Date(beg.startDate) : null
}

export async function tagCutoffs(bankAccountIds: string[]): Promise<Map<string, Date>> {
  const rows = await prisma.beginningBalance.findMany({
    where: { accountId: { in: bankAccountIds }, startDate: { not: null } },
    orderBy: { periodYear: 'desc' },
    select: { accountId: true, startDate: true },
  })
  const out = new Map<string, Date>()
  for (const r of rows) if (r.startDate && !out.has(r.accountId)) out.set(r.accountId, new Date(r.startDate))
  return out
}

export function isLocked(date: Date, cutoff: Date | null): boolean {
  return !!cutoff && date < cutoff
}
