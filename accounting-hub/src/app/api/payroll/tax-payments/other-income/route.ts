import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

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
      select: { id: true, taxAmount: true, cutoffPeriod: true, consultant: { select: { name: true, branch: true } } },
    })

    if (!entries.length) {
      return NextResponse.json({ error: 'No valid unremitted entries found' }, { status: 400 })
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
