import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hmoPfAlerts } from '@/lib/payroll/hmo-pf-alerts'

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
 * Body: { settlementId, cutoff: "2026-11-1", note? } — the overpaid PF was
 * deducted in that payroll cutoff; the alert clears.
 * Body: { settlementId, undo: true } — reopen a mis-tagged one.
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { settlementId, cutoff, note, undo } = await req.json()
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
    return NextResponse.json({ error: 'Choose the payroll cutoff the PF was deducted in' }, { status: 400 })
  }
  await prisma.orderHmoSettlement.update({
    where: { id: settlementId },
    data: {
      pfResolvedAt: new Date(),
      pfResolvedById: session.user.id as string,
      pfResolvedNote: `cutoff:${cutoff}${typeof note === 'string' && note.trim() ? ` — ${note.trim().slice(0, 280)}` : ''}`,
    },
  })
  return NextResponse.json({ ok: true })
}
