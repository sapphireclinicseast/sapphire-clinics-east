import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Ledger-facing branch codes: JournalEntry.branch must use the chart/report codes
// (SANDBOX_EAST etc.) so branch-filtered financial statements include these entries.
// Payroll's own tables keep their stored codes (SBEA/SBGH).
const LEDGER_BRANCH: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', SBVR: 'VERDANA_STORE' }
const ledgerBranch = (b: string) => LEDGER_BRANCH[b] ?? b


const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { employeePayslipIds, payableId, payableIds, paymentDate, fromAccountId, proofUrl, notes, remarks } = await req.json()

    if (!paymentDate || !fromAccountId) {
      return NextResponse.json({ error: 'paymentDate and fromAccountId are required' }, { status: 400 })
    }

    const mapping = await prisma.payrollCOAMapping.findFirst()
    if (!mapping?.benefitsPayableAccountId) {
      return NextResponse.json({ error: 'Benefits Payable account not configured' }, { status: 400 })
    }

    // ── Per-employee payslip path ──
    if (employeePayslipIds?.length) {
      const payslips = await prisma.employeePayslip.findMany({
        where: { id: { in: employeePayslipIds }, benefitsRemitted: false },
        include: { employee: { select: { firstName: true, lastName: true } } },
      })
      if (!payslips.length) return NextResponse.json({ error: 'No valid unremitted payslips found' }, { status: 404 })

      const totalAmount = payslips.reduce((s, p) =>
        s + Number(p.sssDeduction) + Number(p.sssEmployerShare)
          + Number(p.philhealthDeduction) + Number(p.philhealthEmployerShare)
          + Number(p.pagibigDeduction) + Number(p.pagibigEmployerShare), 0)

      const descriptions = payslips.map(p => `${p.employee.lastName} ${p.employee.firstName} (${p.cutoffPeriod})`).join(', ')

      const result = await prisma.$transaction(async (tx) => {
        const journalEntry = await tx.journalEntry.create({
          data: {
            entryDate: new Date(paymentDate),
            description: `Benefit Payment — ${descriptions}`,
            referenceType: 'BENEFIT_PAYMENT',
            referenceId: payslips.map(p => p.id).join(';'),
            totalAmount,
            branch: ledgerBranch(payslips[0].branch),
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
            remarks: remarks || null,
            cutoffPeriod: [...new Set(payslips.map(p => p.cutoffPeriod))].join(', '),
            branch: payslips[0].branch,
            journalEntryId: journalEntry.id,
            createdById: session.user.id as string,
          },
        })

        await tx.employeePayslip.updateMany({
          where: { id: { in: payslips.map(p => p.id) } },
          data: { benefitsRemitted: true, benefitPaymentId: payment.id },
        })

        // If all locked payslips in a period have benefits remitted, mark the aggregate too
        const periods = [...new Set(payslips.map(p => `${p.cutoffPeriod}|${p.branch}`))]
        for (const key of periods) {
          const [cp, br] = key.split('|')
          const payable = await tx.payrollPayableStatus.findFirst({
            where: { cutoffPeriod: cp, branch: br, payrollType: 'EMPLOYEE' },
          })
          if (payable && !payable.benefitsRemitted) {
            const remaining = await tx.employeePayslip.count({
              where: { cutoffPeriod: cp, branch: br, status: 'LOCKED', benefitsRemitted: false,
                OR: [
                  { sssDeduction: { gt: 0 } }, { philhealthDeduction: { gt: 0 } }, { pagibigDeduction: { gt: 0 } },
                  { sssEmployerShare: { gt: 0 } }, { philhealthEmployerShare: { gt: 0 } }, { pagibigEmployerShare: { gt: 0 } },
                ],
              },
            })
            if (remaining === 0) {
              await tx.payrollPayableStatus.update({ where: { id: payable.id }, data: { benefitsRemitted: true, benefitPaymentId: payment.id } })
            }
          }
        }

        return { payment, journalEntry }
      })

      return NextResponse.json(result, { status: 201 })
    }

    // ── Legacy aggregate path ──
    const ids: string[] = payableIds || (payableId ? [payableId] : [])
    if (!ids.length) return NextResponse.json({ error: 'employeePayslipIds or payableId(s) required' }, { status: 400 })

    const payables = await prisma.payrollPayableStatus.findMany({ where: { id: { in: ids }, benefitsRemitted: false } })
    if (!payables.length) return NextResponse.json({ error: 'No valid unremitted payable records found' }, { status: 404 })

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
          branch: ledgerBranch(payables[0].branch),
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
