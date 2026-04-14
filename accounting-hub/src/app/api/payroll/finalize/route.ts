import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

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
    if (existingPayable) {
      return NextResponse.json({ error: 'This payroll period has already been finalized and locked.' }, { status: 400 })
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
            description: `Payroll — Consultants — ${cutoffPeriod} — ${branch}`,
            referenceType: 'PAYROLL_CONSULTANT',
            referenceId: `${cutoffPeriod}|${branch}`,
            totalAmount: totalGross,
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

        // Journal entry lines
        const lines: { accountId: string; debit: number; credit: number; description: string }[] = [
          { accountId: mapping.salaryExpenseAccountId, debit: totalGross, credit: 0, description: 'Salaries and Wages' },
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
            description: `Payroll — Employees — ${cutoffPeriod} — ${branch}`,
            referenceType: 'PAYROLL_EMPLOYEE',
            referenceId: `${cutoffPeriod}|${branch}`,
            totalAmount: totalGross + totalBenefitsER,
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
