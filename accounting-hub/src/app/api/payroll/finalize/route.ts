import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// Display-only branch codes for human-readable JE descriptions (SBEA→AHEA rebrand).
// NEVER use for referenceId / branch fields — those must keep the stored codes.
const BRANCH_DISPLAY: Record<string, string> = { SBEA: 'AHEA', SBGH: 'AHGH' }
const branchDisplay = (b: string) => BRANCH_DISPLAY[b] ?? b

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

        const addEntries = await prisma.payrollEntry.findMany({ where: { cutoffPeriod, branch, status: 'FINAL' } })
        if (addEntries.length === 0) {
          // Distinguish: are entries still in DRAFT (not yet approved), or are they all LOCKED (truly done)?
          const draftCount = await prisma.payrollEntry.count({ where: { cutoffPeriod, branch, status: 'DRAFT' } })
          if (draftCount > 0) {
            return NextResponse.json({
              error: `${draftCount} payslip(s) are still in Draft status — please approve them to Final before locking payroll.`,
            }, { status: 400 })
          }
          return NextResponse.json({ error: 'This payroll period has already been finalized and locked.' }, { status: 400 })
        }
        if (!existingPayable.journalEntryId) {
          return NextResponse.json({ error: 'Existing payable has no linked journal entry — unlock the period and re-lock.' }, { status: 400 })
        }
        const journalEntryId: string = existingPayable.journalEntryId

        let addGross = 0, addTax = 0, addNet = 0
        for (const e of addEntries) { addGross += Number(e.grossPay); addTax += Number(e.taxAmount); addNet += Number(e.netPay) }

        const result = await prisma.$transaction(async (tx) => {
          const lines = await tx.journalEntryLine.findMany({ where: { journalEntryId } })
          for (const line of lines) {
            if (line.accountId === mapping.professionalFeesAccountId) {
              await tx.journalEntryLine.update({ where: { id: line.id }, data: { debit: (Number(line.debit) + addGross) } })
            } else if (line.accountId === mapping.salariesPayableAccountId) {
              await tx.journalEntryLine.update({ where: { id: line.id }, data: { credit: (Number(line.credit) + addNet) } })
            } else if (mapping.taxPayableAccountId && line.accountId === mapping.taxPayableAccountId) {
              await tx.journalEntryLine.update({ where: { id: line.id }, data: { credit: (Number(line.credit) + addTax) } })
            }
          }
          const hasTaxLine = lines.some(l => mapping.taxPayableAccountId && l.accountId === mapping.taxPayableAccountId)
          if (addTax > 0 && mapping.taxPayableAccountId && !hasTaxLine) {
            await tx.journalEntryLine.create({
              data: { journalEntryId, accountId: mapping.taxPayableAccountId, debit: 0, credit: addTax, description: 'Withholding Tax Payable — Consultants' },
            })
          }

          const je = await tx.journalEntry.findUnique({ where: { id: journalEntryId } })
          if (je) {
            await tx.journalEntry.update({ where: { id: je.id }, data: { totalAmount: (Number(je.totalAmount) + addGross) } })
          }

          await tx.payrollPayableStatus.update({
            where: { id: existingPayable.id },
            data: {
              totalSalariesPayable: (Number(existingPayable.totalSalariesPayable) + addNet),
              totalTaxPayable: (Number(existingPayable.totalTaxPayable) + addTax),
            },
          })

          await tx.payrollEntry.updateMany({ where: { cutoffPeriod, branch, status: 'FINAL' }, data: { status: 'LOCKED' } })
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
      const addPayslips = await prisma.employeePayslip.findMany({ where: { cutoffPeriod, branch, status: 'FINAL' } })
      if (addPayslips.length === 0) {
        // Distinguish: are payslips still in DRAFT (not yet approved), or all LOCKED (truly done)?
        const draftCount = await prisma.employeePayslip.count({ where: { cutoffPeriod, branch, status: 'DRAFT' } })
        if (draftCount > 0) {
          return NextResponse.json({
            error: `${draftCount} payslip(s) are still in Draft status — please approve them to Final before locking payroll.`,
          }, { status: 400 })
        }
        return NextResponse.json({ error: 'This payroll period has already been finalized and locked.' }, { status: 400 })
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

      let addGross = 0, addNet = 0, addTax = 0
      let addSssEE = 0, addSssER = 0, addPhilEE = 0, addPhilER = 0, addPagEE = 0, addPagER = 0
      for (const p of addPayslips) {
        addGross  += Number(p.grossPay);          addNet    += Number(p.netPay)
        addTax    += Number(p.taxDeduction);       addSssEE  += Number(p.sssDeduction)
        addSssER  += Number(p.sssEmployerShare);   addPhilEE += Number(p.philhealthDeduction)
        addPhilER += Number(p.philhealthEmployerShare); addPagEE += Number(p.pagibigDeduction)
        addPagER  += Number(p.pagibigEmployerShare)
      }
      const addBenefitsER = addSssER + addPhilER + addPagER
      const addBenefits   = (addSssEE + addPhilEE + addPagEE) + addBenefitsER
      // 8232 debit = gross taxable earnings (excludes non-taxable allowances & undertime).
      // Formula: netPay + EE govt contributions + withholding tax
      //          = grossPay − undertimeDeduction − otherDeductions (adj deductions)
      const addTaxableSalary = addNet + addSssEE + addPhilEE + addPagEE + addTax

      const suppResult = await prisma.$transaction(async (tx) => {
        const lines = await tx.journalEntryLine.findMany({ where: { journalEntryId } })
        for (const line of lines) {
          if (line.accountId === mapping.salaryExpenseAccountId) {
            await tx.journalEntryLine.update({ where: { id: line.id }, data: { debit: Number(line.debit) + addTaxableSalary } })
          } else if (line.accountId === mapping.salariesPayableAccountId) {
            await tx.journalEntryLine.update({ where: { id: line.id }, data: { credit: Number(line.credit) + addNet } })
          } else if (mapping.benefitsPayableAccountId && line.accountId === mapping.benefitsPayableAccountId) {
            await tx.journalEntryLine.update({ where: { id: line.id }, data: { credit: Number(line.credit) + addBenefits } })
          } else if (mapping.taxPayableAccountId && line.accountId === mapping.taxPayableAccountId) {
            await tx.journalEntryLine.update({ where: { id: line.id }, data: { credit: Number(line.credit) + addTax } })
          } else if (mapping.hdmfERAccountId && line.accountId === mapping.hdmfERAccountId) {
            await tx.journalEntryLine.update({ where: { id: line.id }, data: { debit: Number(line.debit) + addPagER } })
          } else if (mapping.sssERAccountId && line.accountId === mapping.sssERAccountId) {
            await tx.journalEntryLine.update({ where: { id: line.id }, data: { debit: Number(line.debit) + addSssER } })
          } else if (mapping.philhealthERAccountId && line.accountId === mapping.philhealthERAccountId) {
            await tx.journalEntryLine.update({ where: { id: line.id }, data: { debit: Number(line.debit) + addPhilER } })
          }
        }
        // Create missing ER / benefit / tax lines if they didn't exist in the original JE
        if (addPagER > 0 && mapping.hdmfERAccountId && !lines.some(l => l.accountId === mapping.hdmfERAccountId))
          await tx.journalEntryLine.create({ data: { journalEntryId, accountId: mapping.hdmfERAccountId, debit: addPagER, credit: 0, description: 'HDMF Contribution (ER)' } })
        if (addSssER > 0 && mapping.sssERAccountId && !lines.some(l => l.accountId === mapping.sssERAccountId))
          await tx.journalEntryLine.create({ data: { journalEntryId, accountId: mapping.sssERAccountId, debit: addSssER, credit: 0, description: 'SSS Contribution (ER)' } })
        if (addPhilER > 0 && mapping.philhealthERAccountId && !lines.some(l => l.accountId === mapping.philhealthERAccountId))
          await tx.journalEntryLine.create({ data: { journalEntryId, accountId: mapping.philhealthERAccountId, debit: addPhilER, credit: 0, description: 'PHIC Contribution (ER)' } })
        if (addBenefits > 0 && mapping.benefitsPayableAccountId && !lines.some(l => l.accountId === mapping.benefitsPayableAccountId))
          await tx.journalEntryLine.create({ data: { journalEntryId, accountId: mapping.benefitsPayableAccountId, debit: 0, credit: addBenefits, description: 'SSS, PHIC, HDMF Payable (EE + ER)' } })
        if (addTax > 0 && mapping.taxPayableAccountId && !lines.some(l => l.accountId === mapping.taxPayableAccountId))
          await tx.journalEntryLine.create({ data: { journalEntryId, accountId: mapping.taxPayableAccountId, debit: 0, credit: addTax, description: 'Withholding Tax Payable — Employees' } })

        await tx.journalEntry.update({ where: { id: journalEntryId }, data: { totalAmount: Number(existingJE.totalAmount) + addTaxableSalary + addBenefitsER } })
        await tx.payrollPayableStatus.update({
          where: { id: existingPayable.id },
          data: {
            totalSalariesPayable: Number(existingPayable.totalSalariesPayable) + addNet,
            totalBenefitsPayable: Number(existingPayable.totalBenefitsPayable) + addBenefits,
            totalTaxPayable: Number(existingPayable.totalTaxPayable) + addTax,
          },
        })
        await tx.employeePayslip.updateMany({ where: { cutoffPeriod, branch, status: 'FINAL' }, data: { status: 'LOCKED' } })
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
            branch: branch,
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
            branch: branch,
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
