import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT']

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { payableId, payableIds, paymentDate, fromAccountId, proofUrl, notes } = await req.json()
    const ids: string[] = payableIds || (payableId ? [payableId] : [])
    if (!ids.length || !paymentDate || !fromAccountId) {
      return NextResponse.json({ error: 'payableId(s), paymentDate, and fromAccountId are required' }, { status: 400 })
    }

    const payables = await prisma.payrollPayableStatus.findMany({ where: { id: { in: ids }, benefitsRemitted: false } })
    if (!payables.length) return NextResponse.json({ error: 'No valid unremitted payable records found' }, { status: 404 })

    const mapping = await prisma.payrollCOAMapping.findFirst()
    if (!mapping?.benefitsPayableAccountId) {
      return NextResponse.json({ error: 'Benefits Payable account not configured' }, { status: 400 })
    }

    const totalAmount = payables.reduce((s, p) => s + Number(p.totalBenefitsPayable), 0)
    const descriptions = payables.map(p => `${p.payrollType} ${p.cutoffPeriod} ${p.branch}`).join(', ')

    const result = await prisma.$transaction(async (tx) => {
      const journalEntry = await tx.journalEntry.create({
        data: {
          entryDate: new Date(paymentDate),
          description: `Benefit Payment — ${descriptions}`,
          referenceType: 'BENEFIT_PAYMENT',
          referenceId: payables.map(p => `${p.cutoffPeriod}|${p.branch}|${p.payrollType}`).join(';'),
          totalAmount,
          createdById: session.user.id as string,
          lines: {
            create: [
              { accountId: mapping.benefitsPayableAccountId!, debit: totalAmount, credit: 0, description: 'SSS, PHIC, HDMF Payable' },
              { accountId: fromAccountId, debit: 0, credit: totalAmount, description: 'Cash/Bank' },
            ],
          },
        },
      })

      const payment = await tx.benefitPayment.create({
        data: {
          paymentDate: new Date(paymentDate),
          totalAmount,
          fromAccountId,
          proofUrl: proofUrl || null,
          notes: notes || null,
          cutoffPeriod: payables.map(p => p.cutoffPeriod).join(', '),
          branch: payables[0].branch,
          journalEntryId: journalEntry.id,
          createdById: session.user.id as string,
        },
      })

      for (const p of payables) {
        await tx.payrollPayableStatus.update({
          where: { id: p.id },
          data: { benefitsRemitted: true, benefitPaymentId: payment.id },
        })
      }

      return { payment, journalEntry }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('Benefit payment error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
