import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postJournalEntry } from '@/lib/accounting/posting'
import { Prisma } from '@prisma/client'
import { fromAnnualPct, fromMonthlyAmort } from '@/lib/amortization'

// Branch allocation: which branch(es) the advance funds. The interest expense follows
// this split on the branch income statements. One branch → the full principal;
// several branches → the entered amounts must add up to the principal.
const ALLOC_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function allocationRows(b: any, principal: number): { rows: { branch: string; amount: number }[] | null; error?: string } {
  const raw = Array.isArray(b.branchAllocations) ? b.branchAllocations : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = raw.filter((a: any) => a && ALLOC_BRANCHES.includes(a.branch)).map((a: any) => ({ branch: String(a.branch), amount: Math.round(num(a.amount) * 100) / 100 }))
  if (!rows.length) return { rows: null }
  const seen = new Set<string>()
  for (const r of rows) { if (seen.has(r.branch)) return { rows: null, error: 'Each branch can only appear once in the allocation.' }; seen.add(r.branch) }
  if (rows.length === 1) return { rows: [{ branch: rows[0].branch, amount: principal }] }
  if (rows.some((r: { amount: number }) => !(r.amount > 0))) return { rows: null, error: 'Enter an amount for every allocated branch.' }
  const sum = rows.reduce((s: number, r: { amount: number }) => s + r.amount, 0)
  if (Math.abs(sum - principal) > 0.01) return { rows: null, error: `Branch allocations (₱${sum.toLocaleString()}) must add up to the principal (₱${principal.toLocaleString()}).` }
  return { rows }
}


const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const num = (v: unknown) => Number(v || 0)

const schedStep = (s?: string) => s === 'QUARTERLY' ? 3 : s === 'BIANNUALLY' ? 6 : s === 'ANNUALLY' ? 12 : 1
function computeInterest(body: { hasInterest?: boolean; interestMode?: string; principalAmount: number; annualPct?: number; termMonths?: number; monthlyAmortization?: number; payoutSchedule?: string }) {
  if (!body.hasInterest || !body.termMonths) return { computedAnnualPct: null as number | null, totalInterest: null as number | null, monthlyAmortization: null as number | null }
  // termMonths is the true horizon (numPeriods × step); the periodic amortization is per
  // payment period, so pass the number of PERIODS (not months) to the amort helper.
  const numPeriods = Math.max(1, Math.round(body.termMonths / schedStep(body.payoutSchedule)))
  if (body.interestMode === 'MONTHLY_AMORT' && body.monthlyAmortization) {
    const r = fromMonthlyAmort(body.principalAmount, num(body.monthlyAmortization), numPeriods)
    return { computedAnnualPct: r.flatAnnualPct, totalInterest: r.totalInterest, monthlyAmortization: r.monthlyAmortization }
  }
  if (body.interestMode === 'ANNUAL_PCT' && body.annualPct != null) {
    // The user entered the flat annual % directly; echo it back.
    const r = fromAnnualPct(body.principalAmount, num(body.annualPct), body.termMonths)
    return { computedAnnualPct: num(body.annualPct), totalInterest: r.totalInterest, monthlyAmortization: r.monthlyAmortization }
  }
  return { computedAnnualPct: null, totalInterest: null, monthlyAmortization: null }
}

async function releaseJE(tx: unknown, a: { id: string; name: string; principalAmount: number; bankAccountId: string | null; creditAccountId: string | null; date: Date; createdById: string }): Promise<string | null> {
  if (!a.bankAccountId || !a.creditAccountId || !(a.principalAmount > 0)) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const je = await postJournalEntry(tx as any, {
    entryDate: a.date, description: `Advance received — ${a.name}`, referenceType: 'ADVANCE', referenceId: a.id, branch: 'ALL', createdById: a.createdById,
    lines: [
      { accountId: a.bankAccountId, debit: a.principalAmount, description: `Advance from ${a.name}` },
      { accountId: a.creditAccountId, credit: a.principalAmount, description: `Advance payable — ${a.name}` },
    ],
  })
  return je.id
}

export async function GET() {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const [rows, shareholders] = await Promise.all([
    prisma.advance.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.shareholder.findMany({ orderBy: { shSeq: 'asc' }, select: { id: true, shNumber: true, name: true, email: true } }),
  ])
  return NextResponse.json({
    rows: rows.map(a => ({ ...a, principalAmount: num(a.principalAmount), annualPct: a.annualPct != null ? num(a.annualPct) : null,
      monthlyAmortization: a.monthlyAmortization != null ? num(a.monthlyAmortization) : null, computedAnnualPct: a.computedAnnualPct != null ? num(a.computedAnnualPct) : null,
      totalInterest: a.totalInterest != null ? num(a.totalInterest) : null })),
    shareholders,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const userId = session.user.id as string
    const principal = num(b.principalAmount)
    if (!b.name?.trim() || !(principal > 0) || !b.dateAcquired) return NextResponse.json({ error: 'Name, principal amount and date are required' }, { status: 400 })
    const alloc = allocationRows(b, principal)
    if (alloc.error) return NextResponse.json({ error: alloc.error }, { status: 400 })
    const interest = computeInterest({ ...b, principalAmount: principal })
    const created = await prisma.$transaction(async (tx) => {
      const a = await tx.advance.create({ data: {
        shareholderId: b.shareholderId || null, name: b.name.trim(), dateAcquired: new Date(b.dateAcquired),
        advanceType: b.advanceType || 'CASH', kindType: b.kindType?.trim() || null, principalAmount: principal,
        hasInterest: !!b.hasInterest, interestMode: b.hasInterest ? (b.interestMode || null) : null,
        annualPct: b.hasInterest && b.annualPct != null ? num(b.annualPct) : null, termMonths: b.hasInterest ? (b.termMonths || null) : null,
        monthlyAmortization: interest.monthlyAmortization, computedAnnualPct: interest.computedAnnualPct, totalInterest: interest.totalInterest,
        proofOfDepositUrls: Array.isArray(b.proofOfDepositUrls) ? b.proofOfDepositUrls : undefined,
        branchAllocations: alloc.rows ?? Prisma.JsonNull,
        bankAccountId: b.bankAccountId || null, creditAccountId: b.creditAccountId || null, interestExpenseAccountId: b.interestExpenseAccountId || null,
        payoutSchedule: b.payoutSchedule || null, payoutStartMonth: b.payoutStartMonth || null, payoutStartYear: b.payoutStartYear || null, payoutDay: b.payoutDay || null,
        payoutAmountPerPeriod: b.payoutAmountPerPeriod != null && b.payoutAmountPerPeriod !== '' ? num(b.payoutAmountPerPeriod) : null,
        repaymentMode: b.repaymentMode || null,
        principalPerPeriod: b.principalPerPeriod != null && b.principalPerPeriod !== '' ? num(b.principalPerPeriod) : null,
        paymentBankAccountId: b.paymentBankAccountId || null,
        pdcUrls: Array.isArray(b.pdcUrls) ? b.pdcUrls : undefined, remarks: b.remarks?.trim() || null, createdById: userId,
      } })
      const jeId = await releaseJE(tx, { id: a.id, name: a.name, principalAmount: principal, bankAccountId: b.bankAccountId || null, creditAccountId: b.creditAccountId || null, date: new Date(b.dateAcquired), createdById: userId })
      if (jeId) await tx.advance.update({ where: { id: a.id }, data: { journalEntryId: jeId } })
      return a
    })
    return NextResponse.json({ id: created.id })
  } catch (e) {
    console.error('Advance create error:', e)
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
    const alloc = allocationRows(b, principal)
    if (alloc.error) return NextResponse.json({ error: alloc.error }, { status: 400 })
    const interest = computeInterest({ ...b, principalAmount: principal })
    await prisma.$transaction(async (tx) => {
      await tx.journalEntry.deleteMany({ where: { referenceType: 'ADVANCE', referenceId: b.id } })
      await tx.advance.update({ where: { id: b.id }, data: {
        shareholderId: b.shareholderId || null, name: b.name.trim(), dateAcquired: new Date(b.dateAcquired),
        advanceType: b.advanceType || 'CASH', kindType: b.kindType?.trim() || null, principalAmount: principal,
        hasInterest: !!b.hasInterest, interestMode: b.hasInterest ? (b.interestMode || null) : null,
        annualPct: b.hasInterest && b.annualPct != null ? num(b.annualPct) : null, termMonths: b.hasInterest ? (b.termMonths || null) : null,
        monthlyAmortization: interest.monthlyAmortization, computedAnnualPct: interest.computedAnnualPct, totalInterest: interest.totalInterest,
        proofOfDepositUrls: Array.isArray(b.proofOfDepositUrls) ? b.proofOfDepositUrls : undefined,
        bankAccountId: b.bankAccountId || null, creditAccountId: b.creditAccountId || null, interestExpenseAccountId: b.interestExpenseAccountId || null,
        payoutSchedule: b.payoutSchedule || null, payoutStartMonth: b.payoutStartMonth || null, payoutStartYear: b.payoutStartYear || null, payoutDay: b.payoutDay || null,
        payoutAmountPerPeriod: b.payoutAmountPerPeriod != null && b.payoutAmountPerPeriod !== '' ? num(b.payoutAmountPerPeriod) : null,
        repaymentMode: b.repaymentMode || null,
        principalPerPeriod: b.principalPerPeriod != null && b.principalPerPeriod !== '' ? num(b.principalPerPeriod) : null,
        paymentBankAccountId: b.paymentBankAccountId || null,
        pdcUrls: Array.isArray(b.pdcUrls) ? b.pdcUrls : undefined, remarks: b.remarks?.trim() || null,
        branchAllocations: alloc.rows ?? Prisma.JsonNull,
      } })
      const jeId = await releaseJE(tx, { id: b.id, name: b.name.trim(), principalAmount: principal, bankAccountId: b.bankAccountId || null, creditAccountId: b.creditAccountId || null, date: new Date(b.dateAcquired), createdById: userId })
      await tx.advance.update({ where: { id: b.id }, data: { journalEntryId: jeId } })
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Advance update error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: { referenceType: 'ADVANCE', referenceId: id } })
    await tx.advance.delete({ where: { id } })
  })
  return NextResponse.json({ success: true })
}
