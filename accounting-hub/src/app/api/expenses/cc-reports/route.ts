import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD' }

// GET /api/expenses/cc-reports?branch=...  → all CC reports for the branch
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const branch = new URL(req.url).searchParams.get('branch') || ''
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  const reports = await prisma.creditCardReport.findMany({ where: { branch }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(reports)
}

// POST /api/expenses/cc-reports  { branch, cardId, periodMonth, periodYear }
// Creates (or returns existing) report with an auto ref {CODE}-CC-{BANKCODE}-{seq}.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, cardId, periodMonth, periodYear } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    const m = parseInt(String(periodMonth), 10), y = parseInt(String(periodYear), 10)
    if (!cardId || isNaN(m) || m < 1 || m > 12 || isNaN(y)) return NextResponse.json({ error: 'card, month and year are required' }, { status: 400 })
    const card = await prisma.creditCard.findUnique({ where: { id: cardId } })
    if (!card) return NextResponse.json({ error: 'Credit card not found' }, { status: 404 })

    const existing = await prisma.creditCardReport.findUnique({
      where: { branch_cardId_periodMonth_periodYear: { branch, cardId, periodMonth: m, periodYear: y } },
    })
    if (existing) return NextResponse.json(existing)

    const report = await prisma.$transaction(async (tx) => {
      const last = await tx.creditCardReport.findFirst({
        where: { branch, bankCode: card.bankCode }, orderBy: { refSeq: 'desc' },
      })
      const seq = (last?.refSeq || 0) + 1
      const refNumber = `${BRANCH_CODE[branch]}-CC-${card.bankCode}-${String(seq).padStart(6, '0')}`
      return tx.creditCardReport.create({
        data: { branch, cardId, bankCode: card.bankCode, refSeq: seq, refNumber, periodMonth: m, periodYear: y },
      })
    })
    return NextResponse.json(report)
  } catch (e) {
    console.error('CC report create error:', e)
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 })
  }
}

// PATCH /api/expenses/cc-reports  { id, status?, statementUrl? }
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id, status, statementUrl, action, datePaid, paymentForm, paymentRef } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (action === 'pay') {
      // Settle the credit-card bill (date + form of payment). Only then do its
      // charged expenses surface in the Expense Report.
      if (!paymentForm) return NextResponse.json({ error: 'Form of payment is required' }, { status: 400 })
      data.paidAt = datePaid ? new Date(datePaid) : new Date()
      data.paymentForm = paymentForm
      data.paymentRef = paymentRef || null
    } else if (action === 'unpay') {
      data.paidAt = null; data.paymentForm = null; data.paymentRef = null
    }
    if (status !== undefined) {
      if (!['FILED', 'FOR_FILING'].includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      data.status = status
    }
    if (statementUrl !== undefined) data.statementUrl = statementUrl || null
    const report = await prisma.creditCardReport.update({ where: { id }, data })
    return NextResponse.json(report)
  } catch (e) {
    console.error('CC report update error:', e)
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 })
  }
}

// DELETE /api/expenses/cc-reports?id=...
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const report = await prisma.creditCardReport.findUnique({ where: { id } })
  if (!report) return NextResponse.json({ ok: true })
  // Release the one-time expenses this report covered back to editable drafts:
  // clear their payment + RFP lock so they reappear as editable in One-time.
  const start = new Date(Date.UTC(report.periodYear, report.periodMonth - 1, 1))
  const end = new Date(Date.UTC(report.periodYear, report.periodMonth, 1))
  const released = await prisma.pettyCashEntry.updateMany({
    where: {
      branch: report.branch, recordType: 'ONE_TIME', creditCardId: report.cardId,
      paidAt: { gte: start, lt: end },
    },
    data: {
      paidAt: null, paymentMethod: null, checkNumber: null, paymentBankAccount: null,
      creditCard: null, creditCardId: null, payrollAccount: null, reimbursementId: null,
    },
  })
  await prisma.creditCardReport.delete({ where: { id } })
  return NextResponse.json({ ok: true, released: released.count })
}
