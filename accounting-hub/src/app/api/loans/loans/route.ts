import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postJournalEntry } from '@/lib/accounting/posting'
import { fromAnnualPct, fromMonthlyAmort } from '@/lib/amortization'

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const num = (v: unknown) => Number(v || 0)

// Interest math for CASH / KIND loans (straight-line, mirrors Advances).
// Corporate bonds carry an annual coupon only (principal repaid at maturity),
// so no amortization split is computed here.
function computeInterest(b: { loanType?: string; hasInterest?: boolean; interestMode?: string; principalAmount: number; annualPct?: number; termMonths?: number; monthlyAmortization?: number }) {
  const none = { computedAnnualPct: null as number | null, totalInterest: null as number | null, monthlyAmortization: null as number | null }
  if (b.loanType === 'CORPORATE_BOND') {
    // Annual coupon; total interest is per-year and settled each period until maturity.
    return { computedAnnualPct: b.annualPct != null ? num(b.annualPct) : null, totalInterest: null, monthlyAmortization: null }
  }
  if (!b.hasInterest || !b.termMonths) return none
  if (b.interestMode === 'MONTHLY_AMORT' && b.monthlyAmortization) {
    const r = fromMonthlyAmort(b.principalAmount, num(b.monthlyAmortization), b.termMonths)
    return { computedAnnualPct: r.flatAnnualPct, totalInterest: r.totalInterest, monthlyAmortization: r.monthlyAmortization }
  }
  if (b.interestMode === 'ANNUAL_PCT' && b.annualPct != null) {
    const r = fromAnnualPct(b.principalAmount, num(b.annualPct), b.termMonths)
    return { computedAnnualPct: num(b.annualPct), totalInterest: r.totalInterest, monthlyAmortization: r.monthlyAmortization }
  }
  return none
}

// Release JE: DR bank (full principal) / CR loan liability. Charges are booked
// separately as Expenses entries (expensed once there) — never in this JE — so
// the Income Statement, which derives expenses from those entries, isn't double-counted.
async function releaseJE(tx: unknown, l: { id: string; name: string; principalAmount: number; bankAccountId: string | null; creditAccountId: string | null; date: Date; createdById: string }): Promise<string | null> {
  if (!l.bankAccountId || !l.creditAccountId || !(l.principalAmount > 0)) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const je = await postJournalEntry(tx as any, {
    entryDate: l.date, description: `Loan received — ${l.name}`, referenceType: 'LOAN', referenceId: l.id, branch: 'ALL', createdById: l.createdById,
    lines: [
      { accountId: l.bankAccountId, debit: l.principalAmount, description: `Loan from ${l.name}` },
      { accountId: l.creditAccountId, credit: l.principalAmount, description: `Loan payable — ${l.name}` },
    ],
  })
  return je.id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chargeRows(b: any): { date: Date; description: string; registeredName: string | null; vatable: string | null; amount: number; siNumber: string | null; chargeAccountId: string | null; deductedFromDebit: boolean; proofUrls: string[] }[] {
  const raw = Array.isArray(b.charges) ? b.charges : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return raw.filter((c: any) => num(c.amount) > 0 && (c.description || '').trim()).map((c: any) => ({
    date: c.date ? new Date(c.date) : new Date(b.dateAcquired),
    description: String(c.description).trim(),
    registeredName: c.registeredName?.trim() || null,
    vatable: c.vatable || null,
    amount: num(c.amount),
    siNumber: c.siNumber?.trim() || null,
    chargeAccountId: c.chargeAccountId || null,
    deductedFromDebit: !!c.deductedFromDebit,
    proofUrls: Array.isArray(c.proofUrls) ? c.proofUrls : [],
  }))
}

export async function GET() {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const [rows, shareholders] = await Promise.all([
    prisma.loan.findMany({ include: { charges: true }, orderBy: { createdAt: 'desc' } }),
    prisma.shareholder.findMany({ orderBy: { shSeq: 'asc' }, select: { id: true, shNumber: true, name: true, email: true } }),
  ])
  return NextResponse.json({
    rows: rows.map(l => ({
      ...l,
      principalAmount: num(l.principalAmount), annualPct: l.annualPct != null ? num(l.annualPct) : null,
      monthlyAmortization: l.monthlyAmortization != null ? num(l.monthlyAmortization) : null, computedAnnualPct: l.computedAnnualPct != null ? num(l.computedAnnualPct) : null,
      totalInterest: l.totalInterest != null ? num(l.totalInterest) : null, netAmountToDebit: l.netAmountToDebit != null ? num(l.netAmountToDebit) : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      charges: (l.charges || []).map((c: any) => ({ ...c, amount: num(c.amount) })),
    })),
    shareholders,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loanData(b: any, principal: number, interest: ReturnType<typeof computeInterest>, netDebit: number) {
  return {
    loanEntity: b.loanEntity || 'BANK', shareholderId: b.loanEntity === 'SHAREHOLDER' ? (b.shareholderId || null) : null,
    entityName: b.loanEntity === 'SHAREHOLDER' ? null : (b.entityName?.trim() || null),
    name: b.name.trim(), dateAcquired: new Date(b.dateAcquired), loanType: b.loanType || 'CASH', kindType: b.loanType === 'KIND' ? (b.kindType?.trim() || null) : null,
    principalAmount: principal,
    hasInterest: b.loanType === 'CORPORATE_BOND' ? true : !!b.hasInterest,
    interestMode: b.loanType === 'CORPORATE_BOND' ? null : (b.hasInterest ? (b.interestMode || null) : null),
    annualPct: b.annualPct != null ? num(b.annualPct) : null,
    termMonths: b.loanType === 'CORPORATE_BOND' ? null : (b.hasInterest ? (b.termMonths || null) : null),
    monthlyAmortization: interest.monthlyAmortization, computedAnnualPct: interest.computedAnnualPct, totalInterest: interest.totalInterest,
    maturityDate: b.loanType === 'CORPORATE_BOND' && b.maturityDate ? new Date(b.maturityDate) : null,
    proofOfDepositUrls: Array.isArray(b.proofOfDepositUrls) ? b.proofOfDepositUrls : undefined,
    bankAccountId: b.bankAccountId || null, creditAccountId: b.creditAccountId || null, interestExpenseAccountId: b.interestExpenseAccountId || null,
    payoutSchedule: b.payoutSchedule || null, payoutStartMonth: b.payoutStartMonth || null, payoutStartYear: b.payoutStartYear || null, payoutDay: b.payoutDay || null,
    loanAgreementUrls: Array.isArray(b.loanAgreementUrls) ? b.loanAgreementUrls : undefined,
    pdcUrls: Array.isArray(b.pdcUrls) ? b.pdcUrls : undefined, netAmountToDebit: netDebit, remarks: b.remarks?.trim() || null,
    fromCreditLineId: b.fromCreditLineId || null,
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const userId = session.user.id as string
    const principal = num(b.principalAmount)
    if (!b.name?.trim() || !(principal > 0) || !b.dateAcquired) return NextResponse.json({ error: 'Name, principal amount and date are required' }, { status: 400 })
    const interest = computeInterest({ ...b, principalAmount: principal })
    const charges = chargeRows(b)
    const deducted = charges.filter(c => c.deductedFromDebit).reduce((s, c) => s + c.amount, 0)
    const netDebit = Math.round((principal - deducted) * 100) / 100
    const created = await prisma.$transaction(async (tx) => {
      const l = await tx.loan.create({ data: { ...loanData(b, principal, interest, netDebit), createdById: userId } })
      if (charges.length) await tx.loanCharge.createMany({ data: charges.map(c => ({ ...c, proofUrls: c.proofUrls, loanId: l.id })) })
      const jeId = await releaseJE(tx, { id: l.id, name: l.name, principalAmount: principal, bankAccountId: b.bankAccountId || null, creditAccountId: b.creditAccountId || null, date: new Date(b.dateAcquired), createdById: userId })
      if (jeId) await tx.loan.update({ where: { id: l.id }, data: { journalEntryId: jeId } })
      return l
    })
    return NextResponse.json({ id: created.id })
  } catch (e) {
    console.error('Loan create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const userId = session.user.id as string
    if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const principal = num(b.principalAmount)
    const interest = computeInterest({ ...b, principalAmount: principal })
    const charges = chargeRows(b)
    const deducted = charges.filter(c => c.deductedFromDebit).reduce((s, c) => s + c.amount, 0)
    const netDebit = Math.round((principal - deducted) * 100) / 100
    await prisma.$transaction(async (tx) => {
      await tx.journalEntry.deleteMany({ where: { referenceType: 'LOAN', referenceId: b.id } })
      await tx.loanCharge.deleteMany({ where: { loanId: b.id } })
      await tx.loan.update({ where: { id: b.id }, data: loanData(b, principal, interest, netDebit) })
      if (charges.length) await tx.loanCharge.createMany({ data: charges.map(c => ({ ...c, proofUrls: c.proofUrls, loanId: b.id })) })
      const jeId = await releaseJE(tx, { id: b.id, name: b.name.trim(), principalAmount: principal, bankAccountId: b.bankAccountId || null, creditAccountId: b.creditAccountId || null, date: new Date(b.dateAcquired), createdById: userId })
      await tx.loan.update({ where: { id: b.id }, data: { journalEntryId: jeId } })
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Loan update error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: { referenceType: 'LOAN', referenceId: id } })
    await tx.loan.delete({ where: { id } }) // charges + payouts cascade
  })
  return NextResponse.json({ success: true })
}
