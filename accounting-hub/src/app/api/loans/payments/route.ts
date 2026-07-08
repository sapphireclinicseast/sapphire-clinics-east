import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postJournalEntry } from '@/lib/accounting/posting'
import { scheduleDates } from '@/lib/amortization'

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const num = (v: unknown) => Number(v || 0)
const stepOf = (s: string) => s === 'MONTHLY' ? 1 : s === 'QUARTERLY' ? 3 : s === 'BIANNUALLY' ? 6 : 12

interface Occ { seq: number; dueDate: string; principalPortion: number; interestPortion: number; amount: number }

// Compute the scheduled payout occurrences for an advance or loan (straight-line).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function occurrences(item: any): Occ[] {
  const sched = item.payoutSchedule, sm = item.payoutStartMonth, sy = item.payoutStartYear, day = item.payoutDay
  const principal = num(item.principalAmount), totalInterest = num(item.totalInterest)
  // Corporate bond: coupon each period until maturity, principal repaid at maturity.
  if (item.loanType === 'CORPORATE_BOND') {
    if (!sched || !sm || !sy || !item.maturityDate) return []
    const step = stepOf(sched)
    const mat = new Date(item.maturityDate)
    const monthsToMat = (mat.getUTCFullYear() - sy) * 12 + (mat.getUTCMonth() + 1 - sm)
    const count = Math.max(1, Math.floor(monthsToMat / step) + 1)
    const couponPerPeriod = principal * (num(item.annualPct) / 100) * (step / 12)
    const dates = scheduleDates(sm, sy, sched, day || 0, count)
    const occ: Occ[] = dates.map((d, i) => ({ seq: i + 1, dueDate: new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString(), principalPortion: 0, interestPortion: Math.round(couponPerPeriod * 100) / 100, amount: Math.round(couponPerPeriod * 100) / 100 }))
    occ.push({ seq: occ.length + 1, dueDate: mat.toISOString(), principalPortion: principal, interestPortion: 0, amount: principal })
    return occ
  }
  if (!sched || !sm || !sy || !item.termMonths) return []
  const step = stepOf(sched)
  const count = Math.max(1, Math.round(num(item.termMonths) / step))
  const perPrincipal = Math.round((principal / count) * 100) / 100
  const perInterest = Math.round((totalInterest / count) * 100) / 100
  const dates = scheduleDates(sm, sy, sched, day || 0, count)
  return dates.map((d, i) => ({ seq: i + 1, dueDate: new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString(), principalPortion: perPrincipal, interestPortion: perInterest, amount: Math.round((perPrincipal + perInterest) * 100) / 100 }))
}

// GET /api/loans/payments?type=advances|loans  → occurrences + recorded payments
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const type = new URL(req.url).searchParams.get('type') || 'advances'
  if (type === 'loans') {
    const [loans, paid] = await Promise.all([prisma.loan.findMany({ orderBy: { dateAcquired: 'asc' } }), prisma.loanPayout.findMany()])
    const paidBy = new Map(paid.map(p => [`${p.loanId}|${new Date(p.dueDate).toISOString().slice(0, 10)}`, p]))
    const rows = loans.flatMap(l => occurrences(l).map(o => {
      const rec = paidBy.get(`${l.id}|${o.dueDate.slice(0, 10)}`)
      return { kind: 'loan', parentId: l.id, name: l.name, ...o, status: rec?.status || 'PENDING', paidDate: rec?.paidDate || null, payoutId: rec?.id || null, bankAccountId: l.bankAccountId, creditAccountId: l.creditAccountId, interestExpenseAccountId: l.interestExpenseAccountId }
    }))
    return NextResponse.json({ rows })
  }
  const [advances, paid] = await Promise.all([prisma.advance.findMany({ orderBy: { dateAcquired: 'asc' } }), prisma.advancePayout.findMany()])
  const paidBy = new Map(paid.map(p => [`${p.advanceId}|${new Date(p.dueDate).toISOString().slice(0, 10)}`, p]))
  const rows = advances.flatMap(a => occurrences(a).map(o => {
    const rec = paidBy.get(`${a.id}|${o.dueDate.slice(0, 10)}`)
    return { kind: 'advance', parentId: a.id, shareholderId: a.shareholderId, name: a.name, ...o, status: rec?.status || 'PENDING', paidDate: rec?.paidDate || null, payoutId: rec?.id || null, emailedAt: rec?.emailedAt || null, bankAccountId: a.bankAccountId, creditAccountId: a.creditAccountId, interestExpenseAccountId: a.interestExpenseAccountId }
  }))
  return NextResponse.json({ rows })
}

// POST record a payment. { kind, parentId, dueDate, principalPortion, interestPortion, amount, paidDate, bankAccountId, proofUrls }
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const userId = session.user.id as string
    const principalPortion = num(b.principalPortion), interestPortion = num(b.interestPortion), amount = num(b.amount)
    if (!b.parentId || !b.dueDate || !b.bankAccountId || !(amount > 0)) return NextResponse.json({ error: 'Parent, due date, bank account and amount are required' }, { status: 400 })
    const paidDate = b.paidDate ? new Date(b.paidDate) : new Date()
    const proofUrls = Array.isArray(b.proofUrls) ? b.proofUrls : []
    const isLoan = b.kind === 'loan'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parent: any = isLoan ? await prisma.loan.findUnique({ where: { id: b.parentId } }) : await prisma.advance.findUnique({ where: { id: b.parentId } })
    if (!parent) return NextResponse.json({ error: 'Parent not found' }, { status: 404 })

    // Straight-line amortization JE: DR liability (principal) + DR interest expense / CR bank.
    const lines: { accountId: string; debit?: number; credit?: number; description: string }[] = []
    if (parent.creditAccountId && principalPortion > 0) lines.push({ accountId: parent.creditAccountId, debit: principalPortion, description: 'Principal repayment' })
    if (parent.interestExpenseAccountId && interestPortion > 0) lines.push({ accountId: parent.interestExpenseAccountId, debit: interestPortion, description: 'Interest expense' })
    lines.push({ accountId: b.bankAccountId, credit: amount, description: `${isLoan ? 'Loan' : 'Advance'} payment — ${parent.name}` })
    let jeId: string | null = null
    if (lines.length >= 2 && parent.creditAccountId) {
      const je = await postJournalEntry(prisma as never, { entryDate: paidDate, description: `${isLoan ? 'Loan' : 'Advance'} amortization — ${parent.name}`, referenceType: isLoan ? 'LOAN_PAYMENT' : 'ADVANCE_PAYMENT', referenceId: b.parentId, branch: 'ALL', createdById: userId, lines })
      jeId = je.id
    }
    const data = { dueDate: new Date(b.dueDate), principalPortion, interestPortion, amount, status: 'PAID', paidDate, bankAccountId: b.bankAccountId, proofUrls, journalEntryId: jeId, createdById: userId }
    const rec = isLoan
      ? await prisma.loanPayout.create({ data: { loanId: b.parentId, ...data } })
      : await prisma.advancePayout.create({ data: { advanceId: b.parentId, ...data } })
    return NextResponse.json({ id: rec.id })
  } catch (e) {
    console.error('Payment record error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to record payment' }, { status: 500 })
  }
}
