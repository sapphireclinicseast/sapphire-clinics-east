import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD' }

const netOf = (vatable: string | null, gross: number) => (vatable === 'VAT' ? gross / 1.12 : gross)

// GET /api/expenses/expense-report?branch=&from=&to=
// Unified paid-expense rows: ONE_TIME/RECURRING (paid) + PETTY_CASH (in a reimbursement report).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const branch = sp.get('branch') || ''
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  const from = sp.get('from'), to = sp.get('to')
  const dateFilter: { gte?: Date; lt?: Date } = {}
  if (from) dateFilter.gte = new Date(from)
  if (to) { const d = new Date(to); d.setUTCDate(d.getUTCDate() + 1); dateFilter.lt = d } // inclusive of 'to'
  const dateWhere = (from || to) ? { date: dateFilter } : {}

  // Expenses (one-time + recurring), paid
  const exp = await prisma.pettyCashEntry.findMany({
    where: { branch, recordType: { in: ['ONE_TIME', 'RECURRING'] }, paidAt: { not: null }, ...dateWhere },
    select: {
      id: true, recordType: true, requestor: true, paymentBankAccount: true, creditCard: true, creditCardId: true, payrollAccount: true,
      date: true, paidAt: true, paymentMethod: true, checkNumber: true, pcvNumber: true, accountTitle: true, description: true,
      vatable: true, grossAmount: true, validity: true, filingStatus: true, reimbursementId: true,
      reimbursement: { select: { payableTo: true } },
    },
    orderBy: { date: 'asc' },
  })

  // A paid one-time/recurring entry is visible as soon as it's paid (its RFP paid,
  // or — for a credit-card SOA — settled via petty cash). Credit-card charges now
  // flow through the SOA pipeline, so there's no separate card-bill gate.
  const expVisible = exp
  // Petty cash entries in a reimbursement report that has been PAID.
  const pc = await prisma.pettyCashEntry.findMany({
    where: { branch, recordType: 'PETTY_CASH', reimbursement: { is: { paidAt: { not: null } } }, ...dateWhere },
    select: {
      id: true, date: true, pcvNumber: true, accountTitle: true, description: true, vatable: true, grossAmount: true,
      validity: true, filingStatus: true, reimbursementId: true, reimbursement: { select: { paymentMethod: true, checkNumber: true, transferRef: true, debitAccount: true, refNumber: true, payableTo: true } },
    },
    orderBy: { date: 'asc' },
  })

  // Paid payroll (salaries + benefits) — not PettyCashEntry, so queried separately.
  // SalaryPayment/BenefitPayment store the short payroll branch code (SBEA/SBGH/VERDANA).
  const PC_TO_PAYROLL: Record<string, string> = { SANDBOX_EAST: 'SBEA', SANDBOX_GREENHILLS: 'SBGH', VERDANA_STORE: 'VERDANA' }
  const payrollBranch = PC_TO_PAYROLL[branch] || branch
  const payDateWhere = (from || to) ? { paymentDate: dateFilter } : {}
  const [salPayments, benPayments, payrollRfps] = await Promise.all([
    prisma.salaryPayment.findMany({ where: { branch: payrollBranch, status: 'COMPLETED', ...payDateWhere }, select: { id: true, paymentDate: true, totalAmount: true, cutoffPeriod: true, paymentType: true, fromAccount: { select: { accountTitle: true } } } }),
    prisma.benefitPayment.findMany({ where: { branch: payrollBranch, status: 'COMPLETED', ...payDateWhere }, select: { id: true, paymentDate: true, totalAmount: true, cutoffPeriod: true, fromAccount: { select: { accountTitle: true } } } }),
    prisma.reimbursementReport.findMany({ where: { branch, module: { in: ['PAYROLL_SALARY', 'PAYROLL_BENEFIT'] } }, select: { refNumber: true, payableTo: true, meta: true } }),
  ])
  // Map a payment id → its RFP (refNumber + payableTo) via meta.paymentId.
  const rfpByPayment = new Map<string, { refNumber: string; payableTo: string | null }>()
  for (const r of payrollRfps) {
    const pid = (r.meta as { paymentId?: string } | null)?.paymentId
    if (pid) rfpByPayment.set(pid, { refNumber: r.refNumber, payableTo: r.payableTo })
  }

  // Cash-advance liquidation lines (the actual expenses of an event float).
  const caLines = await prisma.cashAdvanceLine.findMany({
    where: { kind: 'LIQUIDATION', advance: { is: { branch } }, ...(from || to ? { date: dateFilter } : {}) },
    select: { id: true, date: true, accountTitle: true, description: true, vatable: true, amount: true, siNumber: true, advance: { select: { refNumber: true, accountableName: true } } },
    orderBy: { date: 'asc' },
  })

  const rows = [
    ...caLines.map(l => {
      const gross = Number(l.amount)
      return {
        id: l.id, source: 'CASH_ADVANCE', reimbursementId: null, refNumber: l.advance?.refNumber || '',
        payee: l.advance?.accountableName || 'Cash Advance', paymentAccount: '', paymentDate: l.date.toISOString().slice(0, 10),
        paymentMethod: 'Cash Advance', pcvNumber: l.advance?.refNumber || '', accountTitle: l.accountTitle || '',
        description: l.description || '', netOfVat: netOf(l.vatable, gross), gross,
        checkInfo: l.siNumber ? `SI/OR ${l.siNumber}` : '', validity: 'Valid', filingStatus: 'FOR_FILING',
      }
    }),
    ...salPayments.map(p => {
      const amt = Number(p.totalAmount); const rfp = rfpByPayment.get(p.id)
      return {
        id: p.id, source: 'SALARY_PAYMENT', reimbursementId: null, refNumber: rfp?.refNumber || '',
        payee: rfp?.payableTo || (p.paymentType === 'CONSULTANT' ? 'Consultants — Salaries' : 'Employees — Salaries'),
        paymentAccount: p.fromAccount?.accountTitle || '', paymentDate: p.paymentDate.toISOString().slice(0, 10),
        paymentMethod: 'Payroll', pcvNumber: rfp?.refNumber || '', accountTitle: 'Salaries Payable',
        description: p.cutoffPeriod || '', netOfVat: amt, gross: amt, checkInfo: '', validity: 'Valid', filingStatus: 'FOR_FILING',
      }
    }),
    ...benPayments.map(p => {
      const amt = Number(p.totalAmount); const rfp = rfpByPayment.get(p.id)
      return {
        id: p.id, source: 'BENEFIT_PAYMENT', reimbursementId: null, refNumber: rfp?.refNumber || '',
        payee: rfp?.payableTo || 'Employees — Benefits (SSS/PHIC/HDMF)',
        paymentAccount: p.fromAccount?.accountTitle || '', paymentDate: p.paymentDate.toISOString().slice(0, 10),
        paymentMethod: 'Payroll', pcvNumber: rfp?.refNumber || '', accountTitle: 'Benefits Payable',
        description: p.cutoffPeriod || '', netOfVat: amt, gross: amt, checkInfo: '', validity: 'Valid', filingStatus: 'FOR_FILING',
      }
    }),
    ...expVisible.map(e => {
      const gross = Number(e.grossAmount)
      const acct = e.paymentBankAccount || e.creditCard || (e.payrollAccount ? `Acct ${e.payrollAccount}` : '')
      const checkInfo = e.checkNumber ? `${e.paymentBankAccount || ''} ${e.checkNumber}`.trim() : ''
      return {
        id: e.id, source: e.recordType, reimbursementId: e.reimbursementId, refNumber: '', payee: e.reimbursement?.payableTo || e.requestor || '', paymentAccount: acct,
        paymentDate: e.date ? new Date(e.date).toISOString().slice(0, 10) : '',
        paymentMethod: e.paymentMethod || '', pcvNumber: e.pcvNumber, accountTitle: e.accountTitle || '',
        description: e.description || '', netOfVat: netOf(e.vatable, gross), gross,
        checkInfo,
        validity: e.validity || '', filingStatus: e.filingStatus || 'FOR_FILING',
      }
    }),
    ...pc.map(e => {
      const gross = Number(e.grossAmount)
      const pm = e.reimbursement?.paymentMethod || ''
      const isCheck = pm === 'Check deposit' || pm === 'Check encashment to deposit as cash'
      const chk = e.reimbursement?.checkNumber || ''
      const tref = e.reimbursement?.transferRef || ''
      const debit = e.reimbursement?.debitAccount || ''
      return {
        id: e.id, source: 'PETTY_CASH', reimbursementId: e.reimbursementId, refNumber: e.reimbursement?.refNumber || '', payee: e.reimbursement?.payableTo || `${BRANCH_CODE[branch]} Petty Cash`,
        paymentAccount: e.reimbursement?.debitAccount || '',
        paymentDate: e.date ? new Date(e.date).toISOString().slice(0, 10) : '',
        paymentMethod: pm, pcvNumber: e.pcvNumber, accountTitle: e.accountTitle || '',
        description: e.description || '', netOfVat: netOf(e.vatable, gross), gross,
        checkInfo: isCheck && chk ? `${debit} ${chk}`.trim() : (pm === 'Online Fund Transfer' && tref ? `${debit} · Ref ${tref}`.trim() : ''),
        validity: e.validity || '', filingStatus: e.filingStatus || 'FOR_FILING',
      }
    }),
  ].sort((a, b) => (a.paymentDate < b.paymentDate ? -1 : a.paymentDate > b.paymentDate ? 1 : 0))

  return NextResponse.json({ rows })
}
