import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postJournalEntry } from '@/lib/accounting/posting'
import { scheduleDates } from '@/lib/amortization'

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const num = (v: unknown) => Number(v || 0)
const stepOf = (s: string) => s === 'MONTHLY' ? 1 : s === 'QUARTERLY' ? 3 : s === 'BIANNUALLY' ? 6 : 12

interface Occ { seq: number; dueDate: string; principalPortion: number; interestPortion: number; amount: number }

const r2 = (n: number) => Math.round(n * 100) / 100

// Compute the scheduled payout occurrences for an advance or loan.
// payoutAmountPerPeriod (when set) overrides the derived per-period cash-out.
// repaymentMode: INTEREST_ONLY → interest each period, principal in the final payment;
// AMORTIZING (default) → principal + interest split each period.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function occurrences(item: any): Occ[] {
  const sched = item.payoutSchedule, sm = item.payoutStartMonth, sy = item.payoutStartYear, day = item.payoutDay
  const principal = num(item.principalAmount), totalInterest = num(item.totalInterest)
  const override = num(item.payoutAmountPerPeriod)
  // Corporate bond: coupon each period until maturity, principal repaid at maturity.
  if (item.loanType === 'CORPORATE_BOND') {
    if (!sched || !sm || !sy || !item.maturityDate) return []
    const step = stepOf(sched)
    const mat = new Date(item.maturityDate)
    const monthsToMat = (mat.getUTCFullYear() - sy) * 12 + (mat.getUTCMonth() + 1 - sm)
    const count = Math.max(1, Math.floor(monthsToMat / step) + 1)
    const derivedCoupon = principal * (num(item.annualPct) / 100) * (step / 12)
    const couponPerPeriod = r2(override > 0 ? override : derivedCoupon)
    const dates = scheduleDates(sm, sy, sched, day || 0, count)
    const occ: Occ[] = dates.map((d, i) => ({ seq: i + 1, dueDate: new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString(), principalPortion: 0, interestPortion: couponPerPeriod, amount: couponPerPeriod }))
    occ.push({ seq: occ.length + 1, dueDate: mat.toISOString(), principalPortion: principal, interestPortion: 0, amount: principal })
    return occ
  }
  if (!sched || !sm || !sy || !item.termMonths) return []
  const step = stepOf(sched)
  const count = Math.max(1, Math.round(num(item.termMonths) / step))
  const dates = scheduleDates(sm, sy, sched, day || 0, count)
  // Interest-only: interest each period; principal repaid with the final payment.
  if (item.repaymentMode === 'INTEREST_ONLY') {
    const perInterest = r2(override > 0 ? override : totalInterest / count)
    return dates.map((d, i) => {
      const isLast = i === count - 1
      const principalPortion = isLast ? principal : 0
      return { seq: i + 1, dueDate: new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString(), principalPortion, interestPortion: perInterest, amount: r2(perInterest + principalPortion) }
    })
  }
  // Amortizing (default / legacy): principal + interest each period.
  // - principalPerPeriod (when set) fixes the principal split explicitly (e.g. ₱16,444.44).
  // - otherwise principal amortizes straight-line (principal ÷ count).
  // Interest is the remainder of an explicit per-period amount, else totalInterest ÷ count.
  const perPrincipal = num(item.principalPerPeriod) > 0 ? r2(num(item.principalPerPeriod)) : r2(principal / count)
  const perInterest = override > 0 ? Math.max(0, r2(override - perPrincipal)) : r2(totalInterest / count)
  return dates.map((d, i) => ({ seq: i + 1, dueDate: new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString(), principalPortion: perPrincipal, interestPortion: perInterest, amount: r2(perPrincipal + perInterest) }))
}

// GET /api/loans/payments?type=advances|loans  → occurrences + recorded payments
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const type = new URL(req.url).searchParams.get('type') || 'advances'
  if (type === 'loans') {
    const [loans, paid, shareholders] = await Promise.all([prisma.loan.findMany({ orderBy: { dateAcquired: 'asc' } }), prisma.loanPayout.findMany(), prisma.shareholder.findMany({ select: { id: true, email: true } })])
    const paidBy = new Map(paid.map(p => [`${p.loanId}|${new Date(p.dueDate).toISOString().slice(0, 10)}`, p]))
    const emailById = new Map(shareholders.map(s => [s.id, s.email]))
    const rows = loans.flatMap(l => occurrences(l).map(o => {
      const rec = paidBy.get(`${l.id}|${o.dueDate.slice(0, 10)}`)
      return { kind: 'loan', parentId: l.id, name: l.name, ...o, status: rec?.status || 'PENDING', paidDate: rec?.paidDate || null, payoutId: rec?.id || null, emailedAt: rec?.emailedAt || null, shareholderId: l.shareholderId, email: l.shareholderId ? (emailById.get(l.shareholderId) || null) : null, bankAccountId: l.bankAccountId, paymentBankAccountId: l.paymentBankAccountId, creditAccountId: l.creditAccountId, interestExpenseAccountId: l.interestExpenseAccountId }
    }))
    return NextResponse.json({ rows })
  }
  const [advances, paid, shareholders] = await Promise.all([prisma.advance.findMany({ orderBy: { dateAcquired: 'asc' } }), prisma.advancePayout.findMany(), prisma.shareholder.findMany({ select: { id: true, email: true } })])
  const paidBy = new Map(paid.map(p => [`${p.advanceId}|${new Date(p.dueDate).toISOString().slice(0, 10)}`, p]))
  const emailById = new Map(shareholders.map(s => [s.id, s.email]))
  const rows = advances.flatMap(a => occurrences(a).map(o => {
    const rec = paidBy.get(`${a.id}|${o.dueDate.slice(0, 10)}`)
    return { kind: 'advance', parentId: a.id, shareholderId: a.shareholderId, name: a.name, ...o, status: rec?.status || 'PENDING', paidDate: rec?.paidDate || null, payoutId: rec?.id || null, emailedAt: rec?.emailedAt || null, email: a.shareholderId ? (emailById.get(a.shareholderId) || null) : null, bankAccountId: a.bankAccountId, paymentBankAccountId: a.paymentBankAccountId, creditAccountId: a.creditAccountId, interestExpenseAccountId: a.interestExpenseAccountId }
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

    // One payment per installment: the same (parent, due date) must not be recorded twice.
    const dupe = isLoan
      ? await prisma.loanPayout.findFirst({ where: { loanId: b.parentId, dueDate: new Date(b.dueDate) }, select: { paidDate: true } })
      : await prisma.advancePayout.findFirst({ where: { advanceId: b.parentId, dueDate: new Date(b.dueDate) }, select: { paidDate: true } })
    if (dupe) return NextResponse.json({ error: `This installment (due ${String(b.dueDate).slice(0, 10)}) is already recorded as paid${dupe.paidDate ? ` on ${dupe.paidDate.toISOString().slice(0, 10)}` : ''}. Delete the existing payment first to re-record it.` }, { status: 409 })

    // Other expenses tied to this payment transaction (bank/wire fees, DST, etc.):
    // each DR its expense account and increases the total CR bank (cash out).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const otherExpenses = (Array.isArray(b.otherExpenses) ? b.otherExpenses : []).filter((e: any) => e && e.accountId && num(e.amount) > 0)
    const otherTotal = otherExpenses.reduce((s: number, e: { amount: number }) => s + num(e.amount), 0)

    // Straight-line amortization JE: DR liability (principal) + DR interest expense
    // (+ DR any other expenses) / CR bank (principal + interest + other expenses).
    const lines: { accountId: string; debit?: number; credit?: number; description: string }[] = []
    if (parent.creditAccountId && principalPortion > 0) lines.push({ accountId: parent.creditAccountId, debit: principalPortion, description: 'Principal repayment' })
    if (parent.interestExpenseAccountId && interestPortion > 0) lines.push({ accountId: parent.interestExpenseAccountId, debit: interestPortion, description: 'Interest expense' })
    for (const e of otherExpenses) lines.push({ accountId: e.accountId, debit: num(e.amount), description: (e.description || 'Other expense').trim() })
    lines.push({ accountId: b.bankAccountId, credit: amount + otherTotal, description: `${isLoan ? 'Loan' : 'Advance'} payment — ${parent.name}` })
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
