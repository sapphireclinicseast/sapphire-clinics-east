// ── A paid salary RFP pays its payslips ──────────────────────────────────────
// Payroll → "Prepare RFP" locks the payslips (salaryRfpId) so they can't be paid
// twice. The Payroll pay flow marks them remitted through a SalaryPayment, but an
// RFP marked paid straight from Expenses → RFP never told them: the money was
// recorded (the bank line matched the RFP) while the payslips still read unpaid
// (Hannah 2026-11-17, GH Aug-2 staff on AHGH-RFP26-000133-SAL; also GH May-1 and
// Jun-1 and East Aug-1). This flips the status only — no journal entry: the
// payment is already in the books through the RFP.
//
// Payslips settled by a SalaryPayment record (salaryPaymentId set) are left
// alone in both directions, so unpaying an RFP never undoes a real payment.
import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export async function syncSalaryRfpRemitted(db: Db, rfpId: string, paid: boolean): Promise<number> {
  const rep = await db.reimbursementReport.findUnique({ where: { id: rfpId }, select: { module: true, meta: true } })
  if (rep?.module !== 'PAYROLL_SALARY') return 0
  const meta = (rep.meta && typeof rep.meta === 'object' && !Array.isArray(rep.meta) ? rep.meta : {}) as Record<string, unknown>
  const consultants = meta.idKind === 'payrollEntry'
  const where = { salaryRfpId: rfpId, salaryPaymentId: null, salariesRemitted: !paid }

  const changed = consultants
    ? (await db.payrollEntry.updateMany({ where, data: { salariesRemitted: paid } })).count
    : (await db.employeePayslip.updateMany({ where, data: { salariesRemitted: paid } })).count
  if (!changed) return 0

  // The cutoff's payable reads paid once nothing in it is left unpaid.
  const keys = consultants
    ? await db.payrollEntry.findMany({ where: { salaryRfpId: rfpId }, select: { cutoffPeriod: true, branch: true }, distinct: ['cutoffPeriod', 'branch'] })
    : await db.employeePayslip.findMany({ where: { salaryRfpId: rfpId }, select: { cutoffPeriod: true, branch: true }, distinct: ['cutoffPeriod', 'branch'] })
  for (const { cutoffPeriod, branch } of keys) await rollupSalaryPayable(db, cutoffPeriod, branch, consultants ? 'CONSULTANT' : 'EMPLOYEE')
  return changed
}

// Sets a cutoff's salaries payable to paid exactly when no payslip in it is left
// unpaid, and back to unpaid otherwise. paymentId is recorded as the payment
// that closed the cutoff when it newly reads paid; a pointer to a payment that
// no longer closes it is cleared.
export async function rollupSalaryPayable(
  db: Db, cutoffPeriod: string, branch: string, payrollType: 'CONSULTANT' | 'EMPLOYEE', paymentId?: string,
): Promise<void> {
  const payable = await db.payrollPayableStatus.findFirst({ where: { cutoffPeriod, branch, payrollType } })
  if (!payable) return
  const remaining = payrollType === 'CONSULTANT'
    ? await db.payrollEntry.count({ where: { cutoffPeriod, branch, salariesRemitted: false, status: { in: ['LOCKED', 'FINAL'] }, netPay: { gt: 0 } } })
    : await db.employeePayslip.count({ where: { cutoffPeriod, branch, salariesRemitted: false, status: 'LOCKED' } })
  const allPaid = remaining === 0
  if (allPaid && !payable.salariesRemitted) {
    await db.payrollPayableStatus.update({ where: { id: payable.id }, data: { salariesRemitted: true, ...(paymentId ? { salaryPaymentId: paymentId } : {}) } })
  } else if (!allPaid && payable.salariesRemitted) {
    await db.payrollPayableStatus.update({ where: { id: payable.id }, data: { salariesRemitted: false, salaryPaymentId: null } })
  }
}
