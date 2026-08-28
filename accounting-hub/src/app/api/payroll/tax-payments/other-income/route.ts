import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { payrollEntryIds, paymentType } = await req.json()

    if (!payrollEntryIds?.length) {
      return NextResponse.json({ error: 'payrollEntryIds required' }, { status: 400 })
    }

    // Find accounts by account number: 4070 (Withholding Tax Payable) and 7220 (Other Comprehensive Income)
    const taxPayableAccount = await prisma.account.findFirst({ where: { accountNumber: '4070' } })
    const otherIncomeAccount = await prisma.account.findFirst({ where: { accountNumber: '7220' } })

    if (!taxPayableAccount || !otherIncomeAccount) {
      return NextResponse.json({
        error: `Missing required accounts: ${!taxPayableAccount ? '4070 Withholding Tax Payable' : ''} ${!otherIncomeAccount ? '7220 Other Comprehensive Income' : ''}`.trim()
      }, { status: 400 })
    }

    const entries = await prisma.payrollEntry.findMany({
      where: { id: { in: payrollEntryIds }, taxRemitted: false },
      select: { id: true, taxAmount: true, cutoffPeriod: true, branch: true, consultant: { select: { name: true, branch: true } } },
    })

    if (!entries.length) {
      return NextResponse.json({ error: 'No valid unremitted entries found' }, { status: 400 })
    }

    // Dr 4070 / Cr 7220 only reclassifies a liability that exists. The 4070 credit
    // comes from the payroll finalize accrual — an entry whose cutoff was never
    // finalized (QB-era / RFP-imported payments, where the withheld 5% was already
    // credited to income at payment) has nothing in 4070, and posting would
    // double-count the income (the Asistio ₱125 case, fixed 2026-08-28).
    const cutoffs = [...new Set(entries.map(e => `${e.cutoffPeriod}|${e.branch}`))]
    const accruals = await prisma.payrollPayableStatus.findMany({
      where: {
        OR: cutoffs.map(c => ({ cutoffPeriod: c.split('|')[0], branch: c.split('|')[1] })),
        payrollType: 'CONSULTANT',
        journalEntryId: { not: null },
      },
      select: { cutoffPeriod: true, branch: true },
    })
    const accrued = new Set(accruals.map(a => `${a.cutoffPeriod}|${a.branch}`))
    const unaccrued = entries.filter(e => !accrued.has(`${e.cutoffPeriod}|${e.branch}`))
    if (unaccrued.length) {
      return NextResponse.json({
        error: `No payroll accrual exists for: ${unaccrued.map(e => `${e.consultant?.name} (${e.cutoffPeriod})`).join(', ')} — the withheld tax was never credited to 4070 (QB-era or RFP-imported payment, where the 5% was already recognized as income at payment). Recording it again would double-count the income.`,
      }, { status: 409 })
    }

    // Refuse entries that already have a standing TAX_OTHER_INCOME journal entry —
    // the tax-payment "delete" flow un-remits entries but used to leave the JE
    // behind, so a re-click would post the income twice.
    const priorJEs = await prisma.journalEntry.findMany({
      where: { referenceType: 'TAX_OTHER_INCOME', OR: entries.map(e => ({ referenceId: { contains: e.id } })) },
      select: { id: true, referenceId: true },
    })
    if (priorJEs.length) {
      const dupIds = new Set(entries.filter(e => priorJEs.some(j => j.referenceId?.includes(e.id))).map(e => e.id))
      return NextResponse.json({
        error: `A Tax-as-Other-Income journal entry already exists for: ${entries.filter(e => dupIds.has(e.id)).map(e => `${e.consultant?.name} (${e.cutoffPeriod})`).join(', ')} (JE ${priorJEs.map(j => j.id).join(', ')}). Delete that entry first instead of recording it twice.`,
      }, { status: 409 })
    }

    const totalAmount = entries.reduce((s, e) => s + Number(e.taxAmount), 0)
    const descriptions = entries.map(e => `${e.consultant?.name} (${e.cutoffPeriod})`).join(', ')

    const result = await prisma.$transaction(async (tx) => {
      // Create journal entry: Debit 4070 Withholding Tax Payable / Credit 7220 Other Comprehensive Income
      const journalEntry = await tx.journalEntry.create({
        data: {
          entryDate: new Date(),
          description: `Tax recorded as Other Income — ${descriptions}`,
          referenceType: 'TAX_OTHER_INCOME',
          referenceId: entries.map(e => e.id).join(';'),
          totalAmount,
          createdById: session.user.id as string,
          lines: {
            create: [
              { accountId: taxPayableAccount.id, debit: totalAmount, credit: 0, description: 'Withholding Tax Payable' },
              { accountId: otherIncomeAccount.id, debit: 0, credit: totalAmount, description: 'Other Comprehensive Income' },
            ],
          },
        },
      })

      // Mark entries as remitted
      await tx.payrollEntry.updateMany({
        where: { id: { in: entries.map(e => e.id) } },
        data: { taxRemitted: true },
      })

      // Also create a tax payment record for history tracking
      const taxPayment = await tx.taxPayment.create({
        data: {
          paymentDate: new Date(),
          totalAmount,
          fromAccountId: otherIncomeAccount.id,
          notes: 'Recorded as Other Comprehensive Income',
          paymentType: paymentType || 'CONSULTANT',
          createdById: session.user.id,
          entries: {
            create: entries.map(e => ({ payrollEntryId: e.id, taxAmount: e.taxAmount })),
          },
        },
      })

      return { journalEntry, taxPayment }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('Record tax as other income error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
