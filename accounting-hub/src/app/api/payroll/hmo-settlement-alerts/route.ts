import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hmoPfAlerts } from '@/lib/payroll/hmo-pf-alerts'
import { BY_HAND, closedPayslipMessage, closedPayslipStatus } from '@/lib/payroll/pf-recovery'

const READ_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'VIEWER']
const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const CUTOFF_RE = /^\d{4}-(0[1-9]|1[0-2])-[12]$/

/**
 * GET /api/payroll/hmo-settlement-alerts[?settled=1]
 * PF released at the old (billed) amount on sessions later decreased with
 * "Decrease due to HMO Payment" (see lib/payroll/hmo-pf-alerts). Default = still
 * to recover; ?settled=1 adds the ones already tagged with the cutoff they were
 * deducted in.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const includeSettled = new URL(req.url).searchParams.get('settled') === '1'
  return NextResponse.json({ alerts: await hmoPfAlerts(includeSettled) })
}

/**
 * PATCH /api/payroll/hmo-settlement-alerts
 * Body: { settlementId, cutoff: "2026-11-1", note? } — deduct the overpaid PF in
 * that payroll cutoff: its payslip (same consultant, branch that paid the PF)
 * carries the PF recovery line. 409 { closed } when that payslip is already
 * final/locked; resend with byHand: true if it was deducted there by hand.
 * Body: { settlementId, undo: true } — reopen it (the payslip line goes too).
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { settlementId, cutoff, note, undo, byHand } = await req.json()
  if (!settlementId) return NextResponse.json({ error: 'settlementId is required' }, { status: 400 })
  const existing = await prisma.orderHmoSettlement.findUnique({ where: { id: settlementId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (undo) {
    await prisma.orderHmoSettlement.update({
      where: { id: settlementId },
      data: { pfResolvedAt: null, pfResolvedById: null, pfResolvedNote: null },
    })
    return NextResponse.json({ ok: true })
  }
  if (typeof cutoff !== 'string' || !CUTOFF_RE.test(cutoff)) {
    return NextResponse.json({ error: 'Choose the payroll cutoff to deduct the PF in' }, { status: 400 })
  }
  if (!byHand) {
    const targets = (await hmoPfAlerts(true))
      .filter(a => a.settlementId === settlementId)
      .map(a => ({ consultantId: a.consultantId, branch: a.payrollBranch }))
    const closed = await closedPayslipStatus(targets, cutoff)
    if (closed) return NextResponse.json({ error: closedPayslipMessage(closed), closed }, { status: 409 })
  }
  const extra = [byHand ? BY_HAND : '', typeof note === 'string' ? note.trim().slice(0, 280) : ''].filter(Boolean).join(' — ')
  await prisma.orderHmoSettlement.update({
    where: { id: settlementId },
    data: {
      pfResolvedAt: new Date(),
      pfResolvedById: session.user.id as string,
      pfResolvedNote: `cutoff:${cutoff}${extra ? ` — ${extra}` : ''}`,
    },
  })
  return NextResponse.json({ ok: true })
}
