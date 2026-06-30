import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VER' }

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
    },
    orderBy: { date: 'asc' },
  })

  // Credit-card charges only surface once the card bill (CreditCardReport) is
  // settled. Map paid statements by card + period.
  const ccReports = await prisma.creditCardReport.findMany({
    where: { branch }, select: { cardId: true, periodMonth: true, periodYear: true, paidAt: true, paymentForm: true, paymentRef: true },
  })
  const ccPaid = new Map<string, { form: string | null; ref: string | null }>()
  for (const r of ccReports) if (r.paidAt) ccPaid.set(`${r.cardId}-${r.periodYear}-${r.periodMonth}`, { form: r.paymentForm, ref: r.paymentRef })
  const ccKey = (cardId: string, paidAt: Date | null) => { const d = paidAt ? new Date(paidAt) : null; return d ? `${cardId}-${d.getUTCFullYear()}-${d.getUTCMonth() + 1}` : '' }
  const isCcCharge = (e: { paymentMethod: string | null; creditCardId: string | null; recordType: string }) => e.paymentMethod === 'Credit card' && !!e.creditCardId && e.recordType === 'ONE_TIME'
  const expVisible = exp.filter(e => !isCcCharge(e) || ccPaid.has(ccKey(e.creditCardId!, e.paidAt)))
  // Petty cash entries in a reimbursement report that has been PAID.
  const pc = await prisma.pettyCashEntry.findMany({
    where: { branch, recordType: 'PETTY_CASH', reimbursement: { is: { paidAt: { not: null } } }, ...dateWhere },
    select: {
      id: true, date: true, pcvNumber: true, accountTitle: true, description: true, vatable: true, grossAmount: true,
      validity: true, filingStatus: true, reimbursementId: true, reimbursement: { select: { paymentMethod: true, checkNumber: true, transferRef: true, debitAccount: true, refNumber: true } },
    },
    orderBy: { date: 'asc' },
  })

  const rows = [
    ...expVisible.map(e => {
      const gross = Number(e.grossAmount)
      const acct = e.paymentBankAccount || e.creditCard || (e.payrollAccount ? `Acct ${e.payrollAccount}` : '')
      // For a credit-card charge, the reference column shows how the card bill was settled.
      const cc = isCcCharge(e) ? ccPaid.get(ccKey(e.creditCardId!, e.paidAt)) : null
      const checkInfo = cc
        ? `${cc.form || ''}${cc.ref ? ` · ${cc.ref}` : ''}`.trim()
        : (e.checkNumber ? `${e.paymentBankAccount || ''} ${e.checkNumber}`.trim() : '')
      return {
        id: e.id, source: e.recordType, reimbursementId: e.reimbursementId, refNumber: '', payee: e.requestor || '', paymentAccount: acct,
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
        id: e.id, source: 'PETTY_CASH', reimbursementId: e.reimbursementId, refNumber: e.reimbursement?.refNumber || '', payee: `${BRANCH_CODE[branch]} Petty Cash`,
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
