import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ── Govcon catch-up / manual contributions ───────────────────────────────────
// A person with NO payroll in a month (unpaid leave, maternity) has no payslip,
// so the Hub never recognizes a SSS/PHIC/HDMF payable for that month — yet the
// company must still remit (maternity months are contribution-inclusive), and a
// returning employee may ask to pay a skipped month in instalments so their
// hulog stays consecutive for an SSS/HDMF loan.
//
// This endpoint records that month as a contributions-only, zero-pay LOCKED
// payslip (cutoff "YYYY-MM-GOVCON"), so the Benefits Payable page can remit and
// tag it exactly like a payroll row, and posts the recognition JE:
//   mode DEDUCT  (hulugan): DR 1160 Due from Employees (EE) + DR ER expense / CR Benefits Payable
//                           + a GOVCON Staff Loan so coming payrolls deduct the EE share back
//   mode COMPANY (shouldered, e.g. maternity): DR ER expense (EE + ER) / CR Benefits Payable
const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const LEDGER_BRANCH: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', SBVR: 'VERDANA_STORE', VERDANA: 'VERDANA_STORE' }
const ledgerBranch = (b: string) => LEDGER_BRANCH[b] ?? b
const num = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const b = await req.json()
    const userId = session.user.id as string
    const mode = b.mode === 'COMPANY' ? 'COMPANY' : 'DEDUCT'
    const month = Number(b.month), year = Number(b.year)
    if (!b.employeeId || !b.branch || !(month >= 1 && month <= 12) || !(year >= 2000)) {
      return NextResponse.json({ error: 'Employee, branch, month and year are required' }, { status: 400 })
    }
    const sssEE = num(b.sssEE), sssER = num(b.sssER), philEE = num(b.philEE), philER = num(b.philER), pagEE = num(b.pagEE), pagER = num(b.pagER)
    const eeTotal = num(sssEE + philEE + pagEE), erTotal = num(sssER + philER + pagER)
    const total = num(eeTotal + erTotal)
    if (!(total > 0)) return NextResponse.json({ error: 'Enter at least one contribution amount' }, { status: 400 })

    const employee = await prisma.employee.findUnique({ where: { id: b.employeeId }, select: { id: true, firstName: true, lastName: true } })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const mapping = await prisma.payrollCOAMapping.findFirst()
    if (!mapping?.benefitsPayableAccountId) return NextResponse.json({ error: 'Benefits Payable account not configured (Payroll → COA Mapping)' }, { status: 400 })

    const cutoffPeriod = `${year}-${String(month).padStart(2, '0')}-GOVCON`
    const dupe = await prisma.employeePayslip.findFirst({ where: { employeeId: b.employeeId, cutoffPeriod, branch: b.branch }, select: { id: true } })
    if (dupe) return NextResponse.json({ error: `A Govcon catch-up for ${employee.lastName}, ${employee.firstName} already exists for ${cutoffPeriod.slice(0, 7)} on this branch.` }, { status: 409 })

    // The EE share goes to 1160 Due from Employees when it will be deducted back
    // (same account the Staff Loans register amortizes), or to the agency's ER
    // expense account when the company shoulders it.
    const dueFrom = mode === 'DEDUCT'
      ? await prisma.account.findFirst({ where: { accountNumber: '1160', isActive: true }, select: { id: true } })
      : null
    if (mode === 'DEDUCT' && eeTotal > 0 && !dueFrom) return NextResponse.json({ error: 'Account 1160 (Due from Employees) not found in the chart of accounts' }, { status: 400 })

    const lines: { accountId: string; debit: number; credit: number; description: string }[] = []
    const agencyDebits: [number, number, string | null, string][] = [
      [sssER, sssEE, mapping.sssERAccountId, 'SSS'],
      [philER, philEE, mapping.philhealthERAccountId, 'PHIC'],
      [pagER, pagEE, mapping.hdmfERAccountId, 'HDMF'],
    ]
    for (const [er, ee, accountId, label] of agencyDebits) {
      const debit = mode === 'COMPANY' ? num(er + ee) : er
      if (debit <= 0) continue
      if (!accountId) return NextResponse.json({ error: `${label} employer-share expense account not configured (Payroll → COA Mapping)` }, { status: 400 })
      lines.push({ accountId, debit, credit: 0, description: mode === 'COMPANY' ? `${label} Contribution (ER + EE company-shouldered)` : `${label} Contribution (ER)` })
    }
    if (mode === 'DEDUCT' && eeTotal > 0) lines.push({ accountId: dueFrom!.id, debit: eeTotal, credit: 0, description: 'Due from Employees — Govcon catch-up (EE share, to be deducted)' })
    lines.push({ accountId: mapping.benefitsPayableAccountId, debit: 0, credit: total, description: 'SSS, PHIC, HDMF Payable (EE + ER)' })

    const entryDate = b.entryDate ? new Date(b.entryDate) : new Date()
    const monthLabel = `${cutoffPeriod.slice(0, 7)}`
    const who = `${employee.lastName}, ${employee.firstName}`

    const result = await prisma.$transaction(async (tx) => {
      // A GOVCON Staff Loan makes the EE share come back through payroll: the
      // existing deduction-suggestion flow offers perCutoff every cutoff and
      // finalize posts the Cr 1160 on each repayment.
      const loan = mode === 'DEDUCT' && eeTotal > 0 ? await tx.staffLoan.create({ data: {
        employeeId: employee.id, staffName: who, branch: b.branch, category: 'GOVCON',
        description: `Govcon catch-up ${monthLabel} — SSS/PHIC/HDMF EE share advanced by the company`,
        principal: eeTotal, dateReleased: entryDate, perCutoff: num(b.perCutoff), status: 'ACTIVE',
        notes: typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null, createdById: userId,
      } }) : null
      const payslip = await tx.employeePayslip.create({ data: {
        employeeId: employee.id, cutoffPeriod, branch: b.branch, status: 'LOCKED',
        sssDeduction: sssEE, philhealthDeduction: philEE, pagibigDeduction: pagEE,
        sssEmployerShare: sssER, philhealthEmployerShare: philER, pagibigEmployerShare: pagER,
        totalDeductions: eeTotal, grossPay: 0, netPay: 0,
        details: { govconCatchup: true, mode, staffLoanId: loan?.id || null, notes: typeof b.notes === 'string' ? b.notes.trim() : '' },
        createdById: userId,
      } })
      const je = await tx.journalEntry.create({ data: {
        entryDate,
        description: `Govcon catch-up ${monthLabel} — ${who}${mode === 'COMPANY' ? ' (company-shouldered)' : ' (EE share to be deducted from coming payrolls)'}`,
        referenceType: 'GOVCON_CATCHUP', referenceId: payslip.id, totalAmount: total,
        branch: ledgerBranch(b.branch), createdById: userId,
        lines: { create: lines },
      } })
      return { payslipId: payslip.id, journalEntryId: je.id, staffLoanId: loan?.id || null }
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error('Govcon catch-up error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to record catch-up' }, { status: 500 })
  }
}

// DELETE /api/payroll/govcon-catchup?id=<payslipId> — undo an unremitted catch-up:
// removes the payslip row, its recognition JE, and the GOVCON staff loan (only if
// no payroll deduction has repaid it yet).
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const p = await prisma.employeePayslip.findUnique({ where: { id } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const details = (p?.details ?? {}) as any
  if (!p || !details.govconCatchup) return NextResponse.json({ error: 'Not a Govcon catch-up row' }, { status: 400 })
  if (p.benefitsRemitted || p.benefitRfpId || p.sssRfpId || p.philhealthRfpId || p.pagibigRfpId) {
    return NextResponse.json({ error: 'This catch-up is already remitted or in an RFP — undo that first.' }, { status: 409 })
  }
  if (details.staffLoanId) {
    const repaid = await prisma.staffLoanDeduction.count({ where: { loanId: details.staffLoanId } })
    if (repaid > 0) return NextResponse.json({ error: 'Payroll has already deducted against this catch-up’s staff loan — it can no longer be deleted.' }, { status: 409 })
  }
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: { referenceType: 'GOVCON_CATCHUP', referenceId: id } })
    if (details.staffLoanId) await tx.staffLoan.deleteMany({ where: { id: details.staffLoanId } })
    await tx.employeePayslip.delete({ where: { id } })
  })
  return NextResponse.json({ success: true })
}
