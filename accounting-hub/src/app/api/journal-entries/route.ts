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

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

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

  const { accountIds, label } = await resolveAccountIds(searchParams)
  if (accountIds.length === 0) {
    return NextResponse.json({ lines: [], total: { dr: 0, cr: 0, net: 0 }, label, note: 'No matching accounts.' })
  }

  const start = month ? new Date(Date.UTC(year, month - 1, 1)) : new Date(Date.UTC(year, 0, 1))
  const end   = month ? new Date(Date.UTC(year, month, 1))     : new Date(Date.UTC(year + 1, 0, 1))

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
    take: 1000,
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

  return NextResponse.json({
    lines: out,
    total: { dr, cr, net: dr - cr },
    label,
    range: { year, month, branch, includeClosing },
  })
}
