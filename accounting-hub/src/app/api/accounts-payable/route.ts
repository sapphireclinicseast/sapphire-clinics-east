import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const AP_NUMBER = '4010'

async function apAccount() {
  const a = await prisma.account.findFirst({ where: { accountNumber: AP_NUMBER }, select: { id: true } })
  if (!a) throw new Error('No 4010 Accounts Payable account in the chart')
  return a.id
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await prisma.aPItem.findMany({ orderBy: [{ status: 'desc' }, { dateIncurred: 'asc' }] })
  const closeIds = [...new Set(items.map(i => i.closeAccountId).filter(Boolean) as string[])]
  const accts = closeIds.length ? await prisma.account.findMany({ where: { id: { in: closeIds } }, select: { id: true, accountNumber: true, accountTitle: true } }) : []
  const label = new Map(accts.map(a => [a.id, `${a.accountNumber} ${a.accountTitle}`]))
  // The lump the register itemizes: 4010 opening + posted movement this year.
  const apId = await apAccount()
  const year = new Date().getFullYear()
  const opening = await prisma.beginningBalance.aggregate({
    where: { accountId: apId, periodYear: year }, _sum: { amount: true },
  })
  const mv = await prisma.journalEntryLine.aggregate({
    where: { accountId: apId, journalEntry: { entryDate: { gte: new Date(Date.UTC(year, 0, 1)) }, referenceType: { notIn: ['CLOSING_ENTRY', 'CLOSING_ENTRY_REVERSAL'] } } },
    _sum: { credit: true, debit: true },
  })
  const ledgerBalance = Number(opening._sum.amount || 0) + Number(mv._sum.credit || 0) - Number(mv._sum.debit || 0)
  return NextResponse.json({
    items: items.map(i => ({ ...i, closeAccountLabel: i.closeAccountId ? (label.get(i.closeAccountId) || i.closeAccountId) : null })),
    ledgerBalance: Math.round(ledgerBalance * 100) / 100,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const b = await req.json()
  const amount = Number(b.amount)
  if (!b.vendor?.trim()) return NextResponse.json({ error: 'Who is this payable to?' }, { status: 400 })
  if (!(amount > 0)) return NextResponse.json({ error: 'Enter the amount owed' }, { status: 400 })
  if (!b.dateIncurred) return NextResponse.json({ error: 'When was it incurred?' }, { status: 400 })
  const item = await prisma.aPItem.create({
    data: {
      vendor: b.vendor.trim(), description: b.description?.trim() || null,
      amount, dateIncurred: new Date(b.dateIncurred), branch: b.branch || 'ALL',
      createdById: session.user.id as string,
    },
  })
  return NextResponse.json({ item })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const b = await req.json()
  const item = await prisma.aPItem.findUnique({ where: { id: b.id || '' } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (b.action === 'close') {
    if (item.status === 'CLOSED') return NextResponse.json({ error: 'Already closed' }, { status: 409 })
    // Some listed payables were already settled long ago (e.g. QuickBooks bills
    // whose payments were recorded separately) — the ledger never carried them,
    // so closing them must NOT post: marking them closed is a bookkeeping note,
    // not a transaction.
    if (b.noJournal) {
      const closed = await prisma.aPItem.update({
        where: { id: item.id },
        data: { status: 'CLOSED', closedAt: b.closedOn ? new Date(b.closedOn) : new Date(), closeAccountId: null, closeNote: (b.note?.trim() || 'Already settled — closed without posting'), closeJournalEntryId: null },
      })
      return NextResponse.json({ item: closed })
    }
    if (!b.closeAccountId) return NextResponse.json({ error: 'Choose the account that settles it — the bank it was paid from, or an income/equity account for a write-off' }, { status: 400 })
    const apId = await apAccount()
    if (b.closeAccountId === apId) return NextResponse.json({ error: 'That is 4010 itself — the entry would cancel out' }, { status: 400 })
    const amount = Number(item.amount)
    const when = b.closedOn ? new Date(b.closedOn) : new Date()
    const closed = await prisma.$transaction(async (tx) => {
      const je = await tx.journalEntry.create({
        data: {
          entryDate: when,
          description: `AP settled — ${item.vendor}${item.description ? `: ${item.description}` : ''}${b.note ? ` (${b.note})` : ''}`,
          referenceType: 'AP_SETTLEMENT', referenceId: item.id,
          totalAmount: amount, createdById: session.user!.id as string,
          lines: {
            create: [
              { accountId: apId, debit: amount, credit: 0, description: item.vendor },
              { accountId: b.closeAccountId, debit: 0, credit: amount, description: item.vendor },
            ],
          },
        },
      })
      return tx.aPItem.update({
        where: { id: item.id },
        data: { status: 'CLOSED', closedAt: when, closeAccountId: b.closeAccountId, closeNote: b.note?.trim() || null, closeJournalEntryId: je.id },
      })
    })
    return NextResponse.json({ item: closed })
  }

  if (b.action === 'reopen') {
    if (item.status !== 'CLOSED') return NextResponse.json({ error: 'Not closed' }, { status: 409 })
    if (item.closeJournalEntryId) {
      await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: item.closeJournalEntryId } })
      await prisma.journalEntry.delete({ where: { id: item.closeJournalEntryId } }).catch(() => {})
    }
    const reopened = await prisma.aPItem.update({
      where: { id: item.id },
      data: { status: 'OPEN', closedAt: null, closeAccountId: null, closeNote: null, closeJournalEntryId: null },
    })
    return NextResponse.json({ item: reopened })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || undefined
  const item = id ? await prisma.aPItem.findUnique({ where: { id } }) : null
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (item.status === 'CLOSED') return NextResponse.json({ error: 'Reopen it first — deleting a closed item would leave its settling entry behind' }, { status: 409 })
  await prisma.aPItem.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
