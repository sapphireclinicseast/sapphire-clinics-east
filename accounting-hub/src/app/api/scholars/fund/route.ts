// Scholarship Fund — the appropriated-retained-earnings pool that scholar
// releases draw down. "Top up" records an appropriation JE (DR Retained
// Earnings / CR Scholarship Fund) and the GET reports funded vs. released.
//   GET    → { fundAccount, retainedAccount, appropriated, released, balance, appropriations, equityAccts }
//   POST   { date, amount, retainedAccountId, fundAccountId, note } → appropriation JE
//   DELETE ?id=  → reverse an appropriation JE
// Access: ADMIN / ACCOUNTANT / BOOKKEEPER.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postJournalEntry } from '@/lib/accounting/posting'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const num = (v: unknown) => Number(v || 0)
const APPROP = 'SCHOLAR_FUND_APPROP'

export async function GET() {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const equityAccts = await prisma.account.findMany({ where: { accountType: 'EQUITY', isActive: true }, select: { id: true, accountNumber: true, accountTitle: true }, orderBy: { accountNumber: 'asc' } })
  const fund = equityAccts.find(a => a.accountNumber === '6070') || null
  const retained = equityAccts.find(a => a.accountNumber === '6030') || null

  let appropriated = 0, released = 0
  let appropriations: { id: string; date: Date; amount: number; description: string }[] = []
  if (fund) {
    const agg = await prisma.journalEntryLine.aggregate({ where: { accountId: fund.id }, _sum: { debit: true, credit: true } })
    appropriated = num(agg._sum.credit)   // top-ups credit the fund
    released = num(agg._sum.debit)         // scholar releases debit the fund
    const jes = await prisma.journalEntry.findMany({ where: { referenceType: APPROP }, orderBy: { entryDate: 'desc' }, select: { id: true, entryDate: true, totalAmount: true, description: true } })
    appropriations = jes.map(j => ({ id: j.id, date: j.entryDate, amount: num(j.totalAmount), description: j.description }))
  }

  return NextResponse.json({
    fundAccount: fund, retainedAccount: retained, equityAccts,
    appropriated, released, balance: appropriated - released, appropriations,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const amount = num(b.amount)
    if (!(amount > 0)) return NextResponse.json({ error: 'Enter an amount greater than zero' }, { status: 400 })
    const date = b.date ? new Date(b.date) : new Date()
    const retainedAccountId = String(b.retainedAccountId || '')
    const fundAccountId = String(b.fundAccountId || '')
    if (!retainedAccountId || !fundAccountId) return NextResponse.json({ error: 'Pick both the Retained Earnings (DR) and Scholarship Fund (CR) accounts' }, { status: 400 })
    if (retainedAccountId === fundAccountId) return NextResponse.json({ error: 'The two accounts must differ' }, { status: 400 })
    const note = b.note ? String(b.note) : 'Scholarship Fund appropriation'

    const je = await prisma.$transaction(async (tx) => postJournalEntry(tx, {
      entryDate: date, description: note, referenceType: APPROP, referenceId: randomUUID(), branch: 'ALL', createdById: session.user!.id as string,
      lines: [
        { accountId: retainedAccountId, debit: amount, description: note },
        { accountId: fundAccountId, credit: amount, description: note },
      ],
    }))
    return NextResponse.json({ id: je.id })
  } catch (e) {
    console.error('Scholarship fund appropriation error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.journalEntry.deleteMany({ where: { id, referenceType: APPROP } }) // lines cascade
  return NextResponse.json({ success: true })
}
