import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// Display-only branch codes for human-readable JE descriptions (SBEA→AHEA rebrand).
// NEVER use for referenceId / branch fields — those must keep the stored codes.
const BRANCH_DISPLAY: Record<string, string> = { SBEA: 'AHEA', SBGH: 'AHGH' }
const branchDisplay = (b: string) => BRANCH_DISPLAY[b] ?? b

// Ledger-facing branch codes: JournalEntry.branch must use the chart/report codes
// (SANDBOX_EAST etc.) so branch-filtered financial statements include these entries.
// Payroll's own tables keep their stored codes (SBEA/SBGH).
const LEDGER_BRANCH: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', SBVR: 'VERDANA_STORE' }
const ledgerBranch = (b: string) => LEDGER_BRANCH[b] ?? b


// Unlock payroll — reverse a previous lock & finalize
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { cutoffPeriod, branch, payrollType } = await req.json()
    if (!cutoffPeriod || !branch || !payrollType) {
      return NextResponse.json({ error: 'cutoffPeriod, branch, and payrollType are required' }, { status: 400 })
    }

    const payable = await prisma.payrollPayableStatus.findUnique({
      where: { cutoffPeriod_branch_payrollType: { cutoffPeriod, branch, payrollType } },
    })
    if (!payable) {
      return NextResponse.json({ error: 'No locked payroll found for this period.' }, { status: 404 })
    }

    // Check if any remittances have been made — prevent unlock if so
    if (payable.salariesRemitted || payable.benefitsRemitted || payable.taxRemitted) {
      return NextResponse.json({ error: 'Cannot unlock — remittances have already been recorded against this payroll.' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      // Delete the journal entry and its lines
      if (payable.journalEntryId) {
        await tx.journalEntryLine.deleteMany({ where: { journalEntryId: payable.journalEntryId } })
        await tx.journalEntry.delete({ where: { id: payable.journalEntryId } })
      }

      // Delete the payable status record
      await tx.payrollPayableStatus.delete({
        where: { cutoffPeriod_branch_payrollType: { cutoffPeriod, branch, payrollType } },
      })

      // Set payslips back to FINAL
      if (payrollType === 'CONSULTANT') {
        await tx.payrollEntry.updateMany({
          where: { cutoffPeriod, branch, status: 'LOCKED' },
          data: { status: 'FINAL' },
        })
      } else {
        await tx.employeePayslip.updateMany({
          where: { cutoffPeriod, branch, status: 'LOCKED' },
          data: { status: 'FINAL' },
        })
      }
    })

    return NextResponse.json({ unlocked: true })
  } catch (err) {
    console.error('Payroll unlock error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { cutoffPeriod, branch, payrollType } = await req.json()
    if (!cutoffPeriod || !branch || !payrollType) {
      return NextResponse.json({ error: 'cutoffPeriod, branch, and payrollType are required' }, { status: 400 })
    }

    // Load COA mapping
    const mapping = await prisma.payrollCOAMapping.findFirst()
    if (!mapping) {
      return NextResponse.json({ error: 'Payroll COA mapping not configured. Go to Payroll Settings to set up account mappings.' }, { status: 400 })
    }

    // Check for existing finalization
    const existingPayable = await prisma.payrollPayableStatus.findUnique({
      where: { cutoffPeriod_branch_payrollType: { cutoffPeriod, branch, payrollType } },
    })

    // If a payable already exists but there are FINAL entries that weren't in the
    // original lock (e.g. someone got unlocked and re-finalized later), add them
    // to the existing journal entry and payable instead of refusing. Remittance
    // guard: if the period has already been remitted, refuse.
    if (existingPayable) {
      if (existingPayable.salariesRemitted || existingPayable.benefitsRemitted || existingPayable.taxRemitted) {
        return NextResponse.json({ error: 'Cannot lock more payslips — this period has already been remitted. Unlock the remittance first.' }, { status: 400 })
      }

      if (payrollType === 'CONSULTANT') {
        if (!mapping.professionalFeesAccountId || !mapping.salariesPayableAccountId) {
          return NextResponse.json({ error: 'Professional Fees and Salaries Payable accounts must be configured.' }, { status: 400 })
        }

        // RESTATE, never append: recompute the whole journal entry from every
        // payslip in the period. Appending double-posted whenever payslips were
        // unlocked back to FINAL and re-finalized, and payslip corrections made
        // after finalization silently drifted away from the JE. Re-running
        // finalize now always converges the JE and payable to payslip truth,
        // so it doubles as a "re-sync" after corrections.
        const addEntries = await prisma.payrollEntry.findMany({ where: { cutoffPeriod, branch, status: 'FINAL' } })
        if (addEntries.length === 0) {
          const draftCount = await prisma.payrollEntry.count({ where: { cutoffPeriod, branch, status: 'DRAFT' } })
          if (draftCount > 0) {
            return NextResponse.json({
              error: `${draftCount} payslip(s) are still in Draft status — please approve them to Final before locking payroll.`,
            }, { status: 400 })
          }
          // No new payslips — fall through and restate anyway (re-sync).
        }
        if (!existingPayable.journalEntryId) {
          return NextResponse.json({ error: 'Existing payable has no linked journal entry — unlock the period and re-lock.' }, { status: 400 })
        }
        const journalEntryId: string = existingPayable.journalEntryId

        const result = await prisma.$transaction(async (tx) => {
          await tx.payrollEntry.updateMany({ where: { cutoffPeriod, branch, status: 'FINAL' }, data: { status: 'LOCKED' } })
          const all = await tx.payrollEntry.findMany({ where: { cutoffPeriod, branch, status: 'LOCKED' } })
          let totalGross = 0, totalTax = 0, totalNet = 0
          for (const e of all) { totalGross += Number(e.grossPay); totalTax += Number(e.taxAmount); totalNet += Number(e.netPay) }

          const lines = await tx.journalEntryLine.findMany({ where: { journalEntryId } })
          const setLine = async (accountId: string | null, side: 'debit' | 'credit', amount: number, description: string) => {
            if (!accountId) return
            const line = lines.find(l => l.accountId === accountId)
            if (line) await tx.journalEntryLine.update({ where: { id: line.id }, data: { [side]: amount } })
            else if (amount > 0) await tx.journalEntryLine.create({ data: { journalEntryId, accountId, debit: side === 'debit' ? amount : 0, credit: side === 'credit' ? amount : 0, description } })
          }
          await setLine(mapping.professionalFeesAccountId, 'debit', totalGross, 'Professional Fees (Consultants)')
          await setLine(mapping.salariesPayableAccountId, 'credit', totalNet, 'Salaries Payable — Consultants')
          await setLine(mapping.taxPayableAccountId, 'credit', totalTax, 'Withholding Tax Payable — Consultants')

          await tx.journalEntry.update({ where: { id: journalEntryId }, data: { totalAmount: totalGross } })
          await tx.payrollPayableStatus.update({
            where: { id: existingPayable.id },
            data: { totalSalariesPayable: totalNet, totalTaxPayable: totalTax },
          })
          return { lockedCount: addEntries.length }
        })

        const journalEntry = await prisma.journalEntry.findUnique({
          where: { id: journalEntryId },
          include: { lines: { include: { account: { select: { id: true, accountNumber: true, accountTitle: true } } } } },
        })
        const payable = await prisma.payrollPayableStatus.findUnique({ where: { id: existingPayable.id } })
        return NextResponse.json({ journalEntry, payable, lockedCount: result.lockedCount, supplemented: true }, { status: 201 })
      }

      // EMPLOYEE supplement path: lock any FINAL payslips added after the initial lock
      // and append their amounts to the existing journal entry + payable.
      if (!mapping.salaryExpenseAccountId || !mapping.salariesPayableAccountId) {
        return NextResponse.json({ error: 'Salary Expense and Salaries Payable accounts must be configured.' }, { status: 400 })
      }
      // RESTATE, never append (see the consultant path above): re-running
      // finalize converges the JE and payable to current payslip truth.
      const addPayslips = await prisma.employeePayslip.findMany({ where: { cutoffPeriod, branch, status: 'FINAL' } })
      if (addPayslips.length === 0) {
        const draftCount = await prisma.employeePayslip.count({ where: { cutoffPeriod, branch, status: 'DRAFT' } })
        if (draftCount > 0) {
          return NextResponse.json({
            error: `${draftCount} payslip(s) are still in Draft status — please approve them to Final before locking payroll.`,
          }, { status: 400 })
        }
        // No new payslips — fall through and restate anyway (re-sync).
      }
      if (!existingPayable.journalEntryId) {
        return NextResponse.json({ error: 'Existing payable has no linked journal entry — unlock the period and re-lock.' }, { status: 400 })
      }
      // Verify the JE still exists (may have been manually deleted)
      const existingJE = await prisma.journalEntry.findUnique({ where: { id: existingPayable.journalEntryId } })
      if (!existingJE) {
        return NextResponse.json({ error: 'The original journal entry for this period was removed. Unlock the period first, then re-lock.' }, { status: 400 })
      }
      const journalEntryId: string = existingPayable.journalEntryId

      const suppResult = await prisma.$transaction(async (tx) => {
        await tx.employeePayslip.updateMany({ where: { cutoffPeriod, branch, status: 'FINAL' }, data: { status: 'LOCKED' } })
        const all = await tx.employeePayslip.findMany({ where: { cutoffPeriod, branch, status: 'LOCKED' } })
        let totalNet = 0, totalTax = 0
        let sssEE = 0, sssER = 0, philEE = 0, philER = 0, pagEE = 0, pagER = 0
        for (const p of all) {
          totalNet += Number(p.netPay);                totalTax += Number(p.taxDeduction)
          sssEE += Number(p.sssDeduction);             sssER += Number(p.sssEmployerShare)
          philEE += Number(p.philhealthDeduction);     philER += Number(p.philhealthEmployerShare)
          pagEE += Number(p.pagibigDeduction);         pagER += Number(p.pagibigEmployerShare)
        }
        const benefitsER = sssER + philER + pagER
        const benefits = (sssEE + philEE + pagEE) + benefitsER
        // 8232 debit = gross taxable earnings (excludes non-taxable allowances & undertime).
        // Formula: netPay + EE govt contributions + withholding tax
        const taxableSalary = totalNet + sssEE + philEE + pagEE + totalTax

        const lines = await tx.journalEntryLine.findMany({ where: { journalEntryId } })
        const setLine = async (accountId: string | null, side: 'debit' | 'credit', amount: number, description: string) => {
          if (!accountId) return
          const line = lines.find(l => l.accountId === accountId)
          if (line) await tx.journalEntryLine.update({ where: { id: line.id }, data: { [side]: amount } })
          else if (amount > 0) await tx.journalEntryLine.create({ data: { journalEntryId, accountId, debit: side === 'debit' ? amount : 0, credit: side === 'credit' ? amount : 0, description } })
        }
        await setLine(mapping.salaryExpenseAccountId, 'debit', taxableSalary, 'Salaries and Wages')
        await setLine(mapping.hdmfERAccountId, 'debit', pagER, 'HDMF Contribution (ER)')
        await setLine(mapping.sssERAccountId, 'debit', sssER, 'SSS Contribution (ER)')
        await setLine(mapping.philhealthERAccountId, 'debit', philER, 'PHIC Contribution (ER)')
        await setLine(mapping.salariesPayableAccountId, 'credit', totalNet, 'Salaries Payable — Employees')
        await setLine(mapping.benefitsPayableAccountId, 'credit', benefits, 'SSS, PHIC, HDMF Payable (EE + ER)')
        await setLine(mapping.taxPayableAccountId, 'credit', totalTax, 'Withholding Tax Payable — Employees')

        await tx.journalEntry.update({ where: { id: journalEntryId }, data: { totalAmount: taxableSalary + benefitsER } })
        await tx.payrollPayableStatus.update({
          where: { id: existingPayable.id },
          data: {
            totalSalariesPayable: totalNet,
            totalBenefitsPayable: benefits,
            totalTaxPayable: totalTax,
          },
        })
        return { lockedCount: addPayslips.length }
      })

      const journalEntry = await prisma.journalEntry.findUnique({
        where: { id: journalEntryId },
        include: { lines: { include: { account: { select: { id: true, accountNumber: true, accountTitle: true } } } } },
      })
      const payable = await prisma.payrollPayableStatus.findUnique({ where: { id: existingPayable.id } })
      return NextResponse.json({ journalEntry, payable, lockedCount: suppResult.lockedCount, supplemented: true }, { status: 201 })
    }

    const result = await prisma.$transaction(async (tx) => {
      if (payrollType === 'CONSULTANT') {
        // Validate required accounts
        if (!mapping.professionalFeesAccountId || !mapping.salariesPayableAccountId) {
          throw new Error('Professional Fees and Salaries Payable accounts must be configured for consultant payroll.')
        }

        // Load all FINAL consultant payslips
        const entries = await tx.payrollEntry.findMany({
          where: { cutoffPeriod, branch, status: 'FINAL' },
        })
        if (entries.length === 0) throw new Error('No finalized consultant payslips found for this period.')

        // Lock them
        await tx.payrollEntry.updateMany({
          where: { cutoffPeriod, branch, status: 'FINAL' },
          data: { status: 'LOCKED' },
        })

        // Aggregate
        let totalGross = 0, totalTax = 0, totalNet = 0
        for (const e of entries) {
          totalGross += Number(e.grossPay)
          totalTax += Number(e.taxAmount)
          totalNet += Number(e.netPay)
        }

        // Create journal entry lines
        // Debit Professional Fees = grossPay
        // Credit Salaries Payable = netPay
        // Credit Tax Payable = taxAmount (if any)
        const lines: { accountId: string; debit: number; credit: number; description: string }[] = [
          { accountId: mapping.professionalFeesAccountId, debit: totalGross, credit: 0, description: 'Professional Fees (Consultants)' },
          { accountId: mapping.salariesPayableAccountId, debit: 0, credit: totalNet, description: 'Salaries Payable — Consultants' },
        ]
        if (totalTax > 0 && mapping.taxPayableAccountId) {
          lines.push({ accountId: mapping.taxPayableAccountId, debit: 0, credit: totalTax, description: 'Withholding Tax Payable — Consultants' })
        }

        const journalEntry = await tx.journalEntry.create({
          data: {
            entryDate: new Date(),
            description: `Payroll — Consultants — ${cutoffPeriod} — ${branchDisplay(branch)}`,
            referenceType: 'PAYROLL_CONSULTANT',
            referenceId: `${cutoffPeriod}|${branch}`,
            totalAmount: totalGross,
            branch: ledgerBranch(branch),
            createdById: session.user.id as string,
            lines: { create: lines },
          },
          include: { lines: { include: { account: { select: { id: true, accountNumber: true, accountTitle: true } } } } },
        })

        const payable = await tx.payrollPayableStatus.create({
          data: {
            cutoffPeriod, branch, payrollType: 'CONSULTANT',
            totalSalariesPayable: totalNet,
            totalBenefitsPayable: 0,
            totalTaxPayable: totalTax,
            journalEntryId: journalEntry.id,
          },
        })

        return { journalEntry, payable, lockedCount: entries.length }
      } else {
        // EMPLOYEE
        if (!mapping.salaryExpenseAccountId || !mapping.salariesPayableAccountId) {
          throw new Error('Salary Expense and Salaries Payable accounts must be configured for employee payroll.')
        }

        const payslips = await tx.employeePayslip.findMany({
          where: { cutoffPeriod, branch, status: 'FINAL' },
        })
        if (payslips.length === 0) throw new Error('No finalized employee payslips found for this period.')

        // Lock them
        await tx.employeePayslip.updateMany({
          where: { cutoffPeriod, branch, status: 'FINAL' },
          data: { status: 'LOCKED' },
        })

        // Aggregate
        let totalGross = 0, totalNet = 0, totalTax = 0
        let totalSssEE = 0, totalSssER = 0
        let totalPhilEE = 0, totalPhilER = 0
        let totalPagEE = 0, totalPagER = 0
        for (const p of payslips) {
          totalGross += Number(p.grossPay)
          totalNet += Number(p.netPay)
          totalTax += Number(p.taxDeduction)
          totalSssEE += Number(p.sssDeduction)
          totalSssER += Number(p.sssEmployerShare)
          totalPhilEE += Number(p.philhealthDeduction)
          totalPhilER += Number(p.philhealthEmployerShare)
          totalPagEE += Number(p.pagibigDeduction)
          totalPagER += Number(p.pagibigEmployerShare)
        }

        const totalBenefitsEE = totalSssEE + totalPhilEE + totalPagEE
        const totalBenefitsER = totalSssER + totalPhilER + totalPagER
        const totalBenefits = totalBenefitsEE + totalBenefitsER

        // 8232 debit = gross taxable earnings (excludes non-taxable allowances & undertime).
        // Formula: netPay + EE govt contributions + withholding tax
        //          = grossPay − undertimeDeduction − otherDeductions (adj deductions)
        // This naturally balances the JE: Dr 8232 + Dr ER = Cr payable + Cr benefits + Cr tax
        const totalTaxableSalary = totalNet + totalSssEE + totalPhilEE + totalPagEE + totalTax

        // Journal entry lines
        const lines: { accountId: string; debit: number; credit: number; description: string }[] = [
          { accountId: mapping.salaryExpenseAccountId, debit: totalTaxableSalary, credit: 0, description: 'Salaries and Wages' },
        ]

        // Employer share expense debits
        if (totalPagER > 0 && mapping.hdmfERAccountId) {
          lines.push({ accountId: mapping.hdmfERAccountId, debit: totalPagER, credit: 0, description: 'HDMF Contribution (ER)' })
        }
        if (totalSssER > 0 && mapping.sssERAccountId) {
          lines.push({ accountId: mapping.sssERAccountId, debit: totalSssER, credit: 0, description: 'SSS Contribution (ER)' })
        }
        if (totalPhilER > 0 && mapping.philhealthERAccountId) {
          lines.push({ accountId: mapping.philhealthERAccountId, debit: totalPhilER, credit: 0, description: 'PHIC Contribution (ER)' })
        }

        // Credits
        lines.push({ accountId: mapping.salariesPayableAccountId, debit: 0, credit: totalNet, description: 'Salaries Payable — Employees' })

        if (totalBenefits > 0 && mapping.benefitsPayableAccountId) {
          lines.push({ accountId: mapping.benefitsPayableAccountId, debit: 0, credit: totalBenefits, description: 'SSS, PHIC, HDMF Payable (EE + ER)' })
        }
        if (totalTax > 0 && mapping.taxPayableAccountId) {
          lines.push({ accountId: mapping.taxPayableAccountId, debit: 0, credit: totalTax, description: 'Withholding Tax Payable — Employees' })
        }

        const journalEntry = await tx.journalEntry.create({
          data: {
            entryDate: new Date(),
            description: `Payroll — Employees — ${cutoffPeriod} — ${branchDisplay(branch)}`,
            referenceType: 'PAYROLL_EMPLOYEE',
            referenceId: `${cutoffPeriod}|${branch}`,
            totalAmount: totalTaxableSalary + totalBenefitsER,
            branch: ledgerBranch(branch),
            createdById: session.user.id as string,
            lines: { create: lines },
          },
          include: { lines: { include: { account: { select: { id: true, accountNumber: true, accountTitle: true } } } } },
        })

        const payable = await tx.payrollPayableStatus.create({
          data: {
            cutoffPeriod, branch, payrollType: 'EMPLOYEE',
            totalSalariesPayable: totalNet,
            totalBenefitsPayable: totalBenefits,
            totalTaxPayable: totalTax,
            journalEntryId: journalEntry.id,
          },
        })

        /* ── Staff loan repayments in this cutoff ──
           The payroll entry above deliberately excludes otherDeductions from
           both the expense debit and the payable credit, so a loan deduction
           never reaches the ledger: 1160 keeps the full receivable and salary
           expense is understated by the same amount. Every adjustment tied to
           a staff loan therefore posts its own leg here — Dr salary expense
           (the earnings were real; they just went to repaying the loan) /
           Cr 1160 via the loan register — and is recorded on the loan so the
           register, the payslip and the ledger all say the same thing. */
        const loanAdjs = await tx.cutoffAdjustment.findMany({
          where: { cutoffPeriod, branch, staffLoanId: { not: null }, deduction: { gt: 0 } },
          select: { staffLoanId: true, deduction: true, employeeId: true },
        })
        if (loanAdjs.length > 0) {
          const dueFrom = await tx.account.findFirst({
            where: { accountNumber: '1160', isActive: true }, select: { id: true },
          })
          const totalLoanDed = loanAdjs.reduce((s2, a2) => s2 + Number(a2.deduction), 0)
          let loanJeId: string | null = null
          if (dueFrom && mapping.salaryExpenseAccountId && totalLoanDed > 0) {
            const existing = await tx.journalEntry.findFirst({
              where: { referenceType: 'STAFF_LOAN_DEDUCTION', referenceId: `${cutoffPeriod}|${branch}` },
            })
            if (!existing) {
              const je = await tx.journalEntry.create({
                data: {
                  entryDate: new Date(),
                  description: `Staff loan repayments — ${cutoffPeriod} — ${branchDisplay(branch)}`,
                  referenceType: 'STAFF_LOAN_DEDUCTION',
                  referenceId: `${cutoffPeriod}|${branch}`,
                  totalAmount: totalLoanDed,
                  branch: ledgerBranch(branch),
                  createdById: session.user.id as string,
                  lines: {
                    create: [
                      { accountId: mapping.salaryExpenseAccountId, debit: totalLoanDed, credit: 0, description: 'Salaries earned, applied to staff loans' },
                      { accountId: dueFrom.id, debit: 0, credit: totalLoanDed, description: 'Due from Employees — staff loan repayments' },
                    ],
                  },
                },
              })
              loanJeId = je.id
            } else loanJeId = existing.id
          }
          for (const adj of loanAdjs) {
            await tx.staffLoanDeduction.upsert({
              where: { loanId_cutoffPeriod_source: { loanId: adj.staffLoanId as string, cutoffPeriod, source: 'PAYROLL' } },
              create: { loanId: adj.staffLoanId as string, cutoffPeriod, amount: Number(adj.deduction), source: 'PAYROLL', journalEntryId: loanJeId },
              update: { amount: Number(adj.deduction), journalEntryId: loanJeId },
            })
          }
          // A loan whose balance just reached zero is done — close it so it stops suggesting.
          for (const adj of loanAdjs) {
            const loan = await tx.staffLoan.findUnique({
              where: { id: adj.staffLoanId as string },
              select: { principal: true, deductions: { select: { amount: true } } },
            })
            if (loan) {
              const repaid = loan.deductions.reduce((s2, d2) => s2 + Number(d2.amount), 0)
              if (repaid >= Number(loan.principal) - 0.005) {
                await tx.staffLoan.update({ where: { id: adj.staffLoanId as string }, data: { status: 'PAID' } })
              }
            }
          }
        }

        return { journalEntry, payable, lockedCount: payslips.length }
      }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('Payroll finalize error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
