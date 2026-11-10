import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { consultantServices, hubPayrollStart, payslipDeductions, rateIssues, ratesForService, sessionIssues } from '@/lib/payroll/pf-price-server'
import { BY_HAND, closedPayslipMessage, closedPayslipStatus } from '@/lib/payroll/pf-recovery'

const READ_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'VIEWER']
const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const YMD = /^\d{4}-\d{2}-\d{2}$/
const CUTOFF_RE = /^\d{4}-(0[1-9]|1[0-2])-[12]$/

/**
 * GET /api/payroll/pf-price-check[?since=YYYY-MM-DD]
 * PF (unit pay) above what the clinic charges: consultant rates set above the
 * price of a service they cover, and sessions since `since` (default Jan 1 this
 * year) whose PF came to more than they were charged — each with the payroll it
 * was adjusted in, if recorded (`recovered`) — plus the manual deductions on
 * those consultants' payslips.
 *
 * GET /api/payroll/pf-price-check?consultantId=…
 * The services each unit pay pays that consultant for, with prices — the rate
 * editor warns as a PF above one of them is typed.
 *
 * GET /api/payroll/pf-price-check?unitPayId=…&name=…&department=…&branch=…[&serviceId=…]
 * The consultants whose PF that service (as being edited) would pay, with their
 * rates — the Services page warns as a price below one of them is typed.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams

  const unitPayId = sp.get('unitPayId')
  if (unitPayId) {
    const rates = await ratesForService({
      id: sp.get('serviceId'), unitPayId,
      name: sp.get('name') || '', department: sp.get('department') || '', branch: sp.get('branch') || 'ALL',
    })
    return NextResponse.json({ rates })
  }

  const consultantId = sp.get('consultantId')
  if (consultantId) {
    const services = await consultantServices(consultantId)
    if (!services) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })
    return NextResponse.json({ services })
  }

  const thisYear = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 4)
  const since = YMD.test(sp.get('since') || '') ? sp.get('since')! : `${thisYear}-01-01`
  const hubStart = await hubPayrollStart()
  const [rates, sessions] = await Promise.all([
    rateIssues(),
    sessionIssues(new Date(`${since}T00:00:00+08:00`), hubStart),
  ])
  const deductions = await payslipDeductions([...new Set(sessions.map(x => x.consultantId))])
  return NextResponse.json({ since, hubStart, rates, sessions, deductions })
}

/**
 * PATCH /api/payroll/pf-price-check
 * { orderId, consultantId, unitPayId, cutoff, branch?, amount?, note? } — deduct a
 * session's overpaid PF in `cutoff`: that cutoff's payslip (same consultant, the
 * branch that paid the PF) carries the PF recovery line. 409 { closed } when that
 * payslip is already final/locked; resend with byHand: true if it was deducted
 * there by hand. Add { undo: true } to reopen it.
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const { orderId, consultantId, unitPayId, cutoff, note, amount, undo, byHand, branch } = body as Record<string, unknown>
  if (typeof orderId !== 'string' || typeof consultantId !== 'string' || typeof unitPayId !== 'string' || !orderId || !consultantId) {
    return NextResponse.json({ error: 'orderId, consultantId and unitPayId are required' }, { status: 400 })
  }
  const key = { orderId_consultantId_unitPayId: { orderId, consultantId, unitPayId } }
  if (undo) {
    await prisma.pfOverPriceRecovery.deleteMany({ where: { orderId, consultantId, unitPayId } })
    return NextResponse.json({ ok: true })
  }
  if (typeof cutoff !== 'string' || !CUTOFF_RE.test(cutoff)) {
    return NextResponse.json({ error: 'Choose the cutoff to deduct the PF in' }, { status: 400 })
  }
  if (!byHand) {
    const closed = await closedPayslipStatus([{ consultantId, branch: typeof branch === 'string' ? branch : null }], cutoff)
    if (closed) return NextResponse.json({ error: closedPayslipMessage(closed), closed }, { status: 409 })
  }
  const typed = typeof note === 'string' && note.trim() ? note.trim() : ''
  const data = {
    cutoffPeriod: cutoff,
    amount: Number.isFinite(Number(amount)) ? Number(amount) : null,
    note: [byHand ? BY_HAND : '', typed].filter(Boolean).join(' — ') || null,
    recordedById: (session.user as { id?: string }).id || null,
    recordedAt: new Date(),
  }
  await prisma.pfOverPriceRecovery.upsert({ where: key, update: data, create: { orderId, consultantId, unitPayId, ...data } })
  return NextResponse.json({ ok: true })
}
