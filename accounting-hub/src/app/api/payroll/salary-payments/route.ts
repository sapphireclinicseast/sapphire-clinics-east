import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const paymentType = searchParams.get('paymentType') || 'CONSULTANT'

  const payments = await prisma.salaryPayment.findMany({
    where: { paymentType },
    include: { fromAccount: { select: { id: true, accountNumber: true, accountTitle: true } } },
    orderBy: { paymentDate: 'desc' },
  })

  // For each payment, fetch the linked PayrollEntry consultant names
  const paymentIds = payments.map(p => p.id)
  const linkedEntries = paymentIds.length > 0
    ? await prisma.payrollEntry.findMany({
        where: { salaryPaymentId: { in: paymentIds } },
        select: { salaryPaymentId: true, id: true, netPay: true, cutoffPeriod: true, consultant: { select: { name: true, department: true } } },
      })
    : []

  const entriesByPayment = new Map<string, typeof linkedEntries>()
  for (const e of linkedEntries) {
    if (!e.salaryPaymentId) continue
    if (!entriesByPayment.has(e.salaryPaymentId)) entriesByPayment.set(e.salaryPaymentId, [])
    entriesByPayment.get(e.salaryPaymentId)!.push(e)
  }

  // Fallback: for payments without linked entries (old remittances before salaryPaymentId was tracked),
  // look up remitted PayrollEntry records by cutoffPeriod + branch
  const paymentsWithoutLinks = payments.filter(p => !entriesByPayment.has(p.id))
  if (paymentsWithoutLinks.length > 0) {
    for (const payment of paymentsWithoutLinks) {
      const periods = payment.cutoffPeriod ? payment.cutoffPeriod.split(', ').map(s => s.trim()).filter(Boolean) : []
      if (!periods.length || !payment.branch) continue
      const fallback = await prisma.payrollEntry.findMany({
        where: { branch: payment.branch, cutoffPeriod: { in: periods }, salariesRemitted: true, salaryPaymentId: null },
        select: { salaryPaymentId: true, id: true, netPay: true, cutoffPeriod: true, consultant: { select: { name: true, department: true } } },
      })
      if (fallback.length > 0) entriesByPayment.set(payment.id, fallback)
    }
  }

  return NextResponse.json(payments.map(p => ({
    id: p.id,
    paymentDate: p.paymentDate.toISOString(),
    totalAmount: Number(p.totalAmount),
    fromAccount: p.fromAccount,
    proofUrl: p.proofUrl,
    notes: p.notes,
    paymentType: p.paymentType,
    cutoffPeriod: p.cutoffPeriod,
    branch: p.branch,
    createdAt: p.createdAt.toISOString(),
    consultants: (entriesByPayment.get(p.id) || []).map(e => ({
      name: e.consultant.name,
      department: e.consultant.department,
      netPay: Number(e.netPay),
      cutoffPeriod: e.cutoffPeriod,
    })),
  })))
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  try {
    const payment = await prisma.salaryPayment.findUnique({ where: { id } })
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

    await prisma.$transaction(async (tx) => {
      // Un-remit PayrollEntry records linked directly via salaryPaymentId
      await tx.payrollEntry.updateMany({
        where: { salaryPaymentId: id },
        data: { salariesRemitted: false, salaryPaymentId: null },
      })

      // Un-remit EmployeePayslip records linked via salaryPaymentId
      await tx.employeePayslip.updateMany({
        where: { salaryPaymentId: id },
        data: { salariesRemitted: false, salaryPaymentId: null },
      })

      // Also un-remit via fallback (old records matched by branch + cutoffPeriod)
      if (payment.branch && payment.cutoffPeriod) {
        const periods = payment.cutoffPeriod.split(', ').map(s => s.trim()).filter(Boolean)
        if (periods.length) {
          await tx.payrollEntry.updateMany({
            where: { branch: payment.branch, cutoffPeriod: { in: periods }, salariesRemitted: true, salaryPaymentId: null },
            data: { salariesRemitted: false },
          })
        }
      }

      // Reset PayrollPayableStatus records that point to this payment
      await tx.payrollPayableStatus.updateMany({
        where: { salaryPaymentId: id },
        data: { salariesRemitted: false, salaryPaymentId: null },
      })

      // Delete the journal entry (cascade deletes lines)
      if (payment.journalEntryId) {
        await tx.journalEntry.delete({ where: { id: payment.journalEntryId } })
      }

      // Delete the salary payment record
      await tx.salaryPayment.delete({ where: { id } })
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Salary payment delete error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, paymentDate, proofUrl, notes } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const updated = await prisma.salaryPayment.update({
      where: { id },
      data: {
        ...(paymentDate ? { paymentDate: new Date(paymentDate) } : {}),
        proofUrl: proofUrl ?? undefined,
        notes: notes ?? undefined,
      },
    })
    return NextResponse.json({ id: updated.id })
  } catch (err) {
    console.error('Salary payment update error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const {
      payrollEntryIds,      // for CONSULTANT per-person
      employeePayslipIds,   // for EMPLOYEE per-person
      payableIds,           // legacy aggregate
      paymentDate,
      fromAccountId,
      proofUrl,
      notes,
      remarks,
      feeAmount,
      feeExpenseAccountId,
      feeCashAccountId,
    } = await req.json()

    if (!paymentDate || !fromAccountId) {
      return NextResponse.json({ error: 'paymentDate and fromAccountId are required' }, { status: 400 })
    }

    const hasFee = feeAmount && Number(feeAmount) > 0 && feeExpenseAccountId
    const feeAmt = hasFee ? Number(feeAmount) : 0

    const mapping = await prisma.payrollCOAMapping.findFirst()
    if (!mapping?.salariesPayableAccountId) {
      return NextResponse.json({ error: 'Salaries Payable account not configured in Payroll Settings' }, { status: 400 })
    }

    // ── CONSULTANT per-person path ──
    if (payrollEntryIds?.length) {
      const entries = await prisma.payrollEntry.findMany({
        where: { id: { in: payrollEntryIds }, salariesRemitted: false },
        include: { consultant: { select: { name: true } } },
      })
      if (!entries.length) return NextResponse.json({ error: 'No valid unremitted entries found' }, { status: 404 })

      const totalNet = entries.reduce((s, e) => s + Number(e.netPay), 0)
      const descriptions = entries.map(e => `${e.consultant?.name} (${e.cutoffPeriod})`).join(', ')

      const result = await prisma.$transaction(async (tx) => {
        // Journal entry lines
        const lines: { accountId: string; debit: number; credit: number; description: string }[] = [
          { accountId: mapping.salariesPayableAccountId!, debit: totalNet, credit: 0, description: `Salaries Payable — ${descriptions}` },
          { accountId: fromAccountId, debit: 0, credit: totalNet, description: 'Cash/Bank — Salary Payment' },
        ]
        if (hasFee) {
          lines.push({ accountId: feeExpenseAccountId, debit: feeAmt, credit: 0, description: 'Remittance Fee Expense' })
          lines.push({ accountId: feeCashAccountId || fromAccountId, debit: 0, credit: feeAmt, description: 'Cash/Bank — Remittance Fee' })
        }

        const journalEntry = await tx.journalEntry.create({
          data: {
            entryDate: new Date(paymentDate),
            description: `Salary Payment${hasFee ? ` (+ ₱${feeAmt} fee)` : ''} — ${descriptions}`,
            referenceType: 'SALARY_PAYMENT',
            referenceId: entries.map(e => e.id).join(';'),
            totalAmount: totalNet + feeAmt,
            branch: entries[0].branch,
            createdById: session.user.id as string,
            lines: { create: lines },
          },
        })

        const payment = await tx.salaryPayment.create({
          data: {
            paymentDate: new Date(paymentDate),
            totalAmount: totalNet + feeAmt,
            fromAccountId,
            proofUrl: proofUrl || null,
            notes: notes ? `${notes}${hasFee ? ` | Fee: ₱${feeAmt}` : ''}` : (hasFee ? `Fee: ₱${feeAmt}` : null),
            remarks: remarks || null,
            paymentType: 'CONSULTANT',
            cutoffPeriod: entries.map(e => e.cutoffPeriod).join(', '),
            branch: entries[0].branch,
            journalEntryId: journalEntry.id,
            createdById: session.user.id as string,
          },
        })

        // Mark individual entries as remitted, link to payment
        await tx.payrollEntry.updateMany({
          where: { id: { in: entries.map(e => e.id) } },
          data: { salariesRemitted: true, salaryPaymentId: payment.id },
        })

        // If all entries in a PayrollPayableStatus are now remitted, mark the aggregate too
        for (const entry of entries) {
          const payable = await tx.payrollPayableStatus.findFirst({
            where: { cutoffPeriod: entry.cutoffPeriod, branch: entry.branch, payrollType: 'CONSULTANT' },
          })
          if (payable && !payable.salariesRemitted) {
            const remaining = await tx.payrollEntry.count({
              where: { cutoffPeriod: entry.cutoffPeriod, branch: entry.branch, salariesRemitted: false, status: { in: ['LOCKED', 'FINAL'] }, netPay: { gt: 0 } },
            })
            if (remaining === 0) {
              await tx.payrollPayableStatus.update({ where: { id: payable.id }, data: { salariesRemitted: true, salaryPaymentId: payment.id } })
            }
          }
        }

        return { payment, journalEntry }
      })

      return NextResponse.json(result, { status: 201 })
    }

    // ── EMPLOYEE per-person path ──
    if (employeePayslipIds?.length) {
      const payslips = await prisma.employeePayslip.findMany({
        where: { id: { in: employeePayslipIds }, salariesRemitted: false },
        include: { employee: { select: { firstName: true, lastName: true } } },
      })
      if (!payslips.length) return NextResponse.json({ error: 'No valid unremitted employee payslips found' }, { status: 404 })

      const totalNet = payslips.reduce((s, p) => s + Number(p.netPay), 0)
      const descriptions = payslips.map(p => `${p.employee.lastName} ${p.employee.firstName} (${p.cutoffPeriod})`).join(', ')

      const result = await prisma.$transaction(async (tx) => {
        const lines: { accountId: string; debit: number; credit: number; description: string }[] = [
          { accountId: mapping.salariesPayableAccountId!, debit: totalNet, credit: 0, description: `Salaries Payable — ${descriptions}` },
          { accountId: fromAccountId, debit: 0, credit: totalNet, description: 'Cash/Bank — Salary Payment' },
        ]
        if (hasFee) {
          lines.push({ accountId: feeExpenseAccountId, debit: feeAmt, credit: 0, description: 'Remittance Fee Expense' })
          lines.push({ accountId: feeCashAccountId || fromAccountId, debit: 0, credit: feeAmt, description: 'Cash/Bank — Remittance Fee' })
        }

        const journalEntry = await tx.journalEntry.create({
          data: {
            entryDate: new Date(paymentDate),
            description: `Salary Payment${hasFee ? ` (+ ₱${feeAmt} fee)` : ''} — ${descriptions}`,
            referenceType: 'SALARY_PAYMENT',
            referenceId: payslips.map(p => p.id).join(';'),
            totalAmount: totalNet + feeAmt,
            branch: payslips[0].branch,
            createdById: session.user.id as string,
            lines: { create: lines },
          },
        })

        const payment = await tx.salaryPayment.create({
          data: {
            paymentDate: new Date(paymentDate),
            totalAmount: totalNet + feeAmt,
            fromAccountId,
            proofUrl: proofUrl || null,
            notes: notes ? `${notes}${hasFee ? ` | Fee: ₱${feeAmt}` : ''}` : (hasFee ? `Fee: ₱${feeAmt}` : null),
            remarks: remarks || null,
            paymentType: 'EMPLOYEE',
            cutoffPeriod: [...new Set(payslips.map(p => p.cutoffPeriod))].join(', '),
            branch: payslips[0].branch,
            journalEntryId: journalEntry.id,
            createdById: session.user.id as string,
          },
        })

        await tx.employeePayslip.updateMany({
          where: { id: { in: payslips.map(p => p.id) } },
          data: { salariesRemitted: true, salaryPaymentId: payment.id },
        })

        // If all locked payslips in a period are now remitted, mark the aggregate too
        const periods = [...new Set(payslips.map(p => `${p.cutoffPeriod}|${p.branch}`))]
        for (const key of periods) {
          const [cp, br] = key.split('|')
          const payable = await tx.payrollPayableStatus.findFirst({
            where: { cutoffPeriod: cp, branch: br, payrollType: 'EMPLOYEE' },
          })
          if (payable && !payable.salariesRemitted) {
            const remaining = await tx.employeePayslip.count({
              where: { cutoffPeriod: cp, branch: br, status: 'LOCKED', salariesRemitted: false },
            })
            if (remaining === 0) {
              await tx.payrollPayableStatus.update({ where: { id: payable.id }, data: { salariesRemitted: true, salaryPaymentId: payment.id } })
            }
          }
        }

        return { payment, journalEntry }
      })

      return NextResponse.json(result, { status: 201 })
    }

    // ── Legacy aggregate path ──
    const ids: string[] = payableIds || []
    if (!ids.length) return NextResponse.json({ error: 'payrollEntryIds, employeePayslipIds, or payableIds required' }, { status: 400 })

    const payables = await prisma.payrollPayableStatus.findMany({ where: { id: { in: ids }, salariesRemitted: false } })
    if (!payables.length) return NextResponse.json({ error: 'No valid unremitted payable records found' }, { status: 404 })

    const totalAmount = payables.reduce((s, p) => s + Number(p.totalSalariesPayable), 0)
    const descriptions = payables.map(p => `${p.payrollType} ${p.cutoffPeriod} ${p.branch}`).join(', ')

    const result = await prisma.$transaction(async (tx) => {
      const lines: { accountId: string; debit: number; credit: number; description: string }[] = [
        { accountId: mapping.salariesPayableAccountId!, debit: totalAmount, credit: 0, description: 'Salaries Payable' },
        { accountId: fromAccountId, debit: 0, credit: totalAmount, description: 'Cash/Bank' },
      ]
      if (hasFee) {
        lines.push({ accountId: feeExpenseAccountId, debit: feeAmt, credit: 0, description: 'Remittance Fee Expense' })
        lines.push({ accountId: feeCashAccountId || fromAccountId, debit: 0, credit: feeAmt, description: 'Cash/Bank — Remittance Fee' })
      }

      const journalEntry = await tx.journalEntry.create({
        data: {
          entryDate: new Date(paymentDate),
          description: `Salary Payment — ${descriptions}`,
          referenceType: 'SALARY_PAYMENT',
          referenceId: payables.map(p => `${p.cutoffPeriod}|${p.branch}|${p.payrollType}`).join(';'),
          totalAmount: totalAmount + feeAmt,
          branch: payables[0].branch,
          createdById: session.user.id as string,
          lines: { create: lines },
        },
      })

      const payment = await tx.salaryPayment.create({
        data: {
          paymentDate: new Date(paymentDate),
          totalAmount: totalAmount + feeAmt,
          fromAccountId,
          proofUrl: proofUrl || null,
          notes: notes || null,
          paymentType: payables[0].payrollType,
          cutoffPeriod: payables.map(p => p.cutoffPeriod).join(', '),
          branch: payables[0].branch,
          journalEntryId: journalEntry.id,
          createdById: session.user.id as string,
        },
      })

      for (const p of payables) {
        await tx.payrollPayableStatus.update({ where: { id: p.id }, data: { salariesRemitted: true, salaryPaymentId: payment.id } })
      }

      return { payment, journalEntry }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('Salary payment error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
