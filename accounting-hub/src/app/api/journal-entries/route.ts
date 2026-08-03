/**
 * Journal-entries lookup — backs the drill-down panel on /reports/v2.
 *
 *   GET /api/journal-entries
 *     ?accountNumber=7000          (preferred — drills into one COA account)
 *     | accountId=<id>             (alternative)
 *     | accountType=ASSET          (drills into a whole bucket — e.g. all Cash)
 *     | bucket=cash|ar|inventory|ppe|revenue|cogs|opex|depreciation
 *                                  (named buckets matching v2 BS/IS rows)
 *     &year=2026                   (default: current year)
 *     &branch=ALL|SANDBOX_EAST|... (default: ALL)
 *     &month=1..12                 (optional — restricts to one month)
 *     &includeClosing=true         (default: false — mirrors v2 IS view)
 *
 *   Response: { lines: [{ date, account, debit, credit, description, refType, refId, jeId, jeDescription }, ...], total: { dr, cr, net } }
 *
 * Sorted by entryDate ASC then JE creation order.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const isCash = (n: string, t: string) => /^10/.test(n) || /cash|bank/i.test(t)
const isAR   = (n: string, t: string) => n === '1010' || /accounts? receivable|receivable/i.test(t)
const isInv  = (sub: string | null, t: string) => (sub || '').startsWith('INV') || /inventory|merchandise/i.test(t)
const isPPE  = (n: string, sub: string | null) => sub === 'PPE' || (/^2/.test(n) && n !== '2010')
const isAccDep = (n: string, t: string) => n === '2010' || /accumulated.*depreciation/i.test(t)
const isDepExp = (n: string, t: string) => n === '8070' || /depreciation/i.test(t)

interface AcctRef { id: string; accountNumber: string; accountTitle: string; accountType: string; subType: string | null }

async function resolveAccountIds(searchParams: URLSearchParams): Promise<{ accountIds: string[]; label: string }> {
  const accountId     = searchParams.get('accountId')
  const accountNumber = searchParams.get('accountNumber')
  const accountType   = searchParams.get('accountType')
  const bucket        = searchParams.get('bucket')

  if (accountId) {
    const a = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, accountNumber: true, accountTitle: true } })
    return { accountIds: a ? [a.id] : [], label: a ? `${a.accountNumber} ${a.accountTitle}` : 'unknown' }
  }
  if (accountNumber) {
    const a = await prisma.account.findUnique({ where: { accountNumber }, select: { id: true, accountNumber: true, accountTitle: true } })
    return { accountIds: a ? [a.id] : [], label: a ? `${a.accountNumber} ${a.accountTitle}` : `(${accountNumber})` }
  }

  // Bucket / accountType — pull all matching accounts and filter
  const all = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, accountNumber: true, accountTitle: true, accountType: true, subType: true },
  })
  let filtered: AcctRef[] = all
  let label = 'all accounts'
  if (accountType) {
    filtered = filtered.filter(a => a.accountType === accountType)
    label = `${accountType} accounts`
  }
  if (bucket) {
    label = bucket
    switch (bucket) {
      case 'cash':         filtered = filtered.filter(a => a.accountType === 'ASSET'    && isCash(a.accountNumber, a.accountTitle));  break
      case 'ar':           filtered = filtered.filter(a => a.accountType === 'ASSET'    && isAR(a.accountNumber, a.accountTitle));    break
      case 'inventory':    filtered = filtered.filter(a => a.accountType === 'ASSET'    && isInv(a.subType, a.accountTitle));         break
      case 'ppe':          filtered = filtered.filter(a => a.accountType === 'ASSET'    && isPPE(a.accountNumber, a.subType));        break
      case 'accumDep':     filtered = filtered.filter(a => a.accountType === 'ASSET'    && isAccDep(a.accountNumber, a.accountTitle));break
      case 'liabilities':  filtered = filtered.filter(a => a.accountType === 'LIABILITY');                                            break
      case 'equity':       filtered = filtered.filter(a => a.accountType === 'EQUITY');                                               break
      case 'revenue':      filtered = filtered.filter(a => a.accountType === 'REVENUE');                                              break
      case 'cogs':         filtered = filtered.filter(a => a.accountType === 'EXPENSE'  && (a.subType === 'COGS' || a.subType === 'DIRECT_EXPENSES'));  break
      case 'opex':         filtered = filtered.filter(a => a.accountType === 'EXPENSE'  && (a.subType === 'INDIRECT_EXPENSES' || a.subType === 'OPERATING_EXPENSES')); break
      case 'depreciation': filtered = filtered.filter(a => a.accountType === 'EXPENSE'  && isDepExp(a.accountNumber, a.accountTitle));break
    }
  }
  return { accountIds: filtered.map(a => a.id), label }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const year   = parseInt(searchParams.get('year') || String(new Date().getUTCFullYear()))
  const month  = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null
  const branch = searchParams.get('branch') || 'ALL'
  const includeClosing = searchParams.get('includeClosing') === 'true'

  // Explicit date range (?from=YYYY-MM-DD&to=YYYY-MM-DD) overrides year/month —
  // used by the Unearned Revenue page to reach back across years (2024 onwards).
  const fromStr = searchParams.get('from')
  const toStr   = searchParams.get('to')
  const limit   = Math.min(50_000, Math.max(1, parseInt(searchParams.get('limit') || '1000')))

  const { accountIds, label } = await resolveAccountIds(searchParams)
  if (accountIds.length === 0) {
    return NextResponse.json({ lines: [], total: { dr: 0, cr: 0, net: 0 }, label, note: 'No matching accounts.' })
  }

  let start = month ? new Date(Date.UTC(year, month - 1, 1)) : new Date(Date.UTC(year, 0, 1))
  let end   = month ? new Date(Date.UTC(year, month, 1))     : new Date(Date.UTC(year + 1, 0, 1))
  if (fromStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr)) start = new Date(fromStr + 'T00:00:00.000Z')
  if (toStr && /^\d{4}-\d{2}-\d{2}$/.test(toStr)) { end = new Date(toStr + 'T00:00:00.000Z'); end.setUTCDate(end.getUTCDate() + 1) }

  const lines = await prisma.journalEntryLine.findMany({
    where: {
      accountId: { in: accountIds },
      journalEntry: {
        entryDate: { gte: start, lt: end },
        ...(branch !== 'ALL' ? { branch } : {}),
        ...(includeClosing ? {} : { referenceType: { notIn: ['CLOSING_ENTRY', 'CLOSING_ENTRY_REVERSAL'] } }),
      },
    },
    select: {
      debit: true, credit: true, description: true,
      account: { select: { accountNumber: true, accountTitle: true } },
      journalEntry: {
        select: { id: true, entryDate: true, description: true, referenceType: true, referenceId: true, branch: true },
      },
    },
    orderBy: [{ journalEntry: { entryDate: 'asc' } }, { journalEntry: { createdAt: 'asc' } }],
    take: limit,
  })

  let dr = 0, cr = 0
  const out = lines.map(l => {
    const d = Number(l.debit  || 0)
    const c = Number(l.credit || 0)
    dr += d; cr += c
    return {
      date:           l.journalEntry.entryDate.toISOString(),
      accountNumber:  l.account?.accountNumber || '',
      accountTitle:   l.account?.accountTitle || '',
      debit:          d,
      credit:         c,
      description:    l.description || '',
      jeId:           l.journalEntry.id,
      jeDescription:  l.journalEntry.description,
      refType:        l.journalEntry.referenceType,
      refId:          l.journalEntry.referenceId,
      branch:         l.journalEntry.branch,
    }
  })

  // Opening balance for single-account views (e.g. the Unearned Revenue page):
  // the BeginningBalance rows for the window's starting year, plus any movement
  // between that year's Jan 1 and the window start, so a movement view can show
  // opening + received − released = balance for ANY from-date.
  let opening = 0
  if (accountIds.length) {
    const startYear = start.getUTCFullYear()
    const ob = await prisma.beginningBalance.aggregate({
      where: { accountId: { in: accountIds }, periodYear: startYear }, _sum: { amount: true },
    })
    opening = Number(ob._sum.amount || 0)
    const yearStart = new Date(Date.UTC(startYear, 0, 1))
    if (start > yearStart) {
      const pre = await prisma.journalEntryLine.aggregate({
        where: {
          accountId: { in: accountIds },
          journalEntry: {
            entryDate: { gte: yearStart, lt: start },
            ...(branch !== 'ALL' ? { branch } : {}),
            ...(includeClosing ? {} : { referenceType: { notIn: ['CLOSING_ENTRY', 'CLOSING_ENTRY_REVERSAL'] } }),
          },
        },
        _sum: { debit: true, credit: true },
      })
      // Liability-style movement view: credits grow the balance, debits release it.
      opening += Number(pre._sum.credit || 0) - Number(pre._sum.debit || 0)
    }
  }

  return NextResponse.json({
    lines: out,
    total: { dr, cr, net: dr - cr },
    opening,
    label,
    range: { year, month, branch, includeClosing, from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), limit },
  })
}

/* ── Manual general journal ─────────────────────────────────────────────
   POST creates a MANUAL journal entry — the QuickBooks-style catch-all for
   anything without a module of its own. It posts to the same JournalEntry
   table every ledger, statement and drill-down already reads, so a manual
   entry flows everywhere the moment it saves. Entries must balance;
   imbalance is refused, not plugged.
   DELETE removes MANUAL entries only — module-generated entries belong to
   their modules and are corrected there, not here. */

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const b = await req.json()
  if (!b.entryDate) return NextResponse.json({ error: 'Journal date is required' }, { status: 400 })
  const lines = Array.isArray(b.lines) ? b.lines
    .map((l: { accountId?: string; debit?: unknown; credit?: unknown; description?: string }) => ({
      accountId: l.accountId, debit: Math.round((Number(l.debit) || 0) * 100) / 100,
      credit: Math.round((Number(l.credit) || 0) * 100) / 100, description: (l.description || '').slice(0, 300) || null,
    }))
    .filter((l: { accountId?: string; debit: number; credit: number }) => l.accountId && (l.debit > 0 || l.credit > 0)) : []
  if (lines.length < 2) return NextResponse.json({ error: 'A journal entry needs at least two lines' }, { status: 400 })
  if (lines.some((l: { debit: number; credit: number }) => l.debit > 0 && l.credit > 0)) {
    return NextResponse.json({ error: 'A line is either a debit or a credit, not both' }, { status: 400 })
  }
  const dr = lines.reduce((s: number, l: { debit: number }) => s + l.debit, 0)
  const cr = lines.reduce((s: number, l: { credit: number }) => s + l.credit, 0)
  if (Math.abs(dr - cr) >= 0.01) {
    return NextResponse.json({ error: `Debits (${dr.toFixed(2)}) and credits (${cr.toFixed(2)}) must balance` }, { status: 400 })
  }
  const ids = [...new Set(lines.map((l: { accountId: string }) => l.accountId))]
  const found = await prisma.account.count({ where: { id: { in: ids as string[] } } })
  if (found !== ids.length) return NextResponse.json({ error: 'A line references an account that does not exist' }, { status: 400 })

  // Sequential journal number, QuickBooks-style: MJE-<year>-<seq>.
  const year = new Date(b.entryDate).getUTCFullYear()
  const count = await prisma.journalEntry.count({ where: { referenceType: 'MANUAL', referenceId: { startsWith: `MJE-${year}-` } } })
  const refId = `MJE-${year}-${String(count + 1).padStart(4, '0')}`

  const je = await prisma.journalEntry.create({
    data: {
      entryDate: new Date(b.entryDate),
      description: (b.memo || '').trim().slice(0, 400) || `Manual journal ${refId}`,
      referenceType: 'MANUAL', referenceId: refId,
      totalAmount: Math.round(dr * 100) / 100,
      createdById: session.user.id as string,
      branch: ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA', 'VERDANA_STORE', 'ALL'].includes(b.branch) ? b.branch : 'ALL',
      lines: { create: lines },
    },
  })
  return NextResponse.json({ id: je.id, refId })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  const je = await prisma.journalEntry.findUnique({ where: { id }, select: { referenceType: true } })
  if (!je) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (je.referenceType !== 'MANUAL') {
    return NextResponse.json({ error: 'Only manual entries can be deleted here — module-generated entries are corrected in their own module' }, { status: 409 })
  }
  await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: id } })
  await prisma.journalEntry.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
