import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Ledger-facing branch codes: JournalEntry.branch must use the chart/report codes
// (SANDBOX_EAST etc.) so branch-filtered financial statements include these entries.
// Payroll's own tables keep their stored codes (SBEA/SBGH).
const LEDGER_BRANCH: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', SBVR: 'VERDANA_STORE', VERDANA: 'VERDANA_STORE' }
const ledgerBranch = (b: string) => LEDGER_BRANCH[b] ?? b


const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { employeePayslipIds, payableId, payableIds, paymentDate, fromAccountId, proofUrl, notes, remarks, benefitTypes } = await req.json()

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

      // The payment covers only the agencies the RFP bundled (body.benefitTypes,
      // e.g. a PHIC+HDMF combined RFP). Absent = all three (legacy RFPs, direct
      // payments). Paying agency-blind was the 2026-10 GH bug: the JE posted
      // the FULL six-component total (₱23,736 of unpaid SSS on a ₱10,684.96
      // PHIC+HDMF payment) and benefitsRemitted locked the uncovered agencies.
      type Slip = (typeof payslips)[number]
      const AGENCIES = [
        { type: 'SSS', label: 'SSS', amt: (p: Slip) => Number(p.sssDeduction) + Number(p.sssEmployerShare), rfp: (p: Slip) => p.sssRfpId },
        { type: 'PHILHEALTH', label: 'PHIC', amt: (p: Slip) => Number(p.philhealthDeduction) + Number(p.philhealthEmployerShare), rfp: (p: Slip) => p.philhealthRfpId },
        { type: 'PAGIBIG', label: 'HDMF', amt: (p: Slip) => Number(p.pagibigDeduction) + Number(p.pagibigEmployerShare), rfp: (p: Slip) => p.pagibigRfpId },
      ]
      const wanted: string[] = Array.isArray(benefitTypes) ? benefitTypes.map(String) : []
      const covered = wanted.length ? AGENCIES.filter(a => wanted.includes(a.type)) : AGENCIES
      if (!covered.length) return NextResponse.json({ error: 'benefitTypes matched no agency' }, { status: 400 })
      const coveredLabel = covered.map(a => a.label).join(', ')

      const totalAmount = payslips.reduce((s, p) => s + covered.reduce((x, a) => x + a.amt(p), 0), 0)

      // benefitsRemitted stays a FULL-remit flag: set it only when every agency
      // with amounts on the payslip is settled — by this payment, or by an
      // earlier PAID per-agency RFP (legacy combined benefitRfpId counts too).
      const uncovered = AGENCIES.filter(a => !covered.includes(a))
      const otherRfpIds = [...new Set(payslips.flatMap(p => uncovered.map(a => a.rfp(p)).concat(p.benefitRfpId)).filter(Boolean))] as string[]
      const paidRfps = otherRfpIds.length
        ? new Set((await prisma.reimbursementReport.findMany({ where: { id: { in: otherRfpIds }, status: 'PAID' }, select: { id: true } })).map(r => r.id))
        : new Set<string>()
      const fullyIds: string[] = []
      const partialIds: string[] = []
      for (const p of payslips) {
        const outstanding = uncovered.some(a => {
          if (a.amt(p) <= 0) return false
          const rid = a.rfp(p) || p.benefitRfpId
          return !(rid && paidRfps.has(rid))
        })
        ;(outstanding ? partialIds : fullyIds).push(p.id)
      }

      const descriptions = payslips.map(p => `${p.employee.lastName} ${p.employee.firstName} (${p.cutoffPeriod})`).join(', ')

      const result = await prisma.$transaction(async (tx) => {
        const journalEntry = await tx.journalEntry.create({
          data: {
            entryDate: new Date(paymentDate),
            description: `Benefit Payment (${coveredLabel}) — ${descriptions}`,
            referenceType: 'BENEFIT_PAYMENT',
            referenceId: payslips.map(p => p.id).join(';'),
            totalAmount,
            branch: ledgerBranch(payslips[0].branch),
            createdById: session.user.id as string,
            lines: {
              create: [
                { accountId: mapping.benefitsPayableAccountId!, debit: totalAmount, credit: 0, description: `${coveredLabel} Payable` },
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

        if (fullyIds.length) {
          await tx.employeePayslip.updateMany({
            where: { id: { in: fullyIds } },
            data: { benefitsRemitted: true, benefitPaymentId: payment.id },
          })
        }
        // Partially covered payslips keep benefitsRemitted=false so the
        // uncovered agencies (e.g. SSS after a PHIC+HDMF payment) stay open
        // for their own RFP; the tab shows them settled per agency instead.
        if (partialIds.length) {
          await tx.employeePayslip.updateMany({
            where: { id: { in: partialIds } },
            data: { benefitPaymentId: payment.id },
          })
        }

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
