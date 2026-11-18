// POS → Uncharged Cancellations, and the New Payment reminder
// (lib/pos/uncharged-cancellations).
//
//   GET  ?branch=&patientId=&since=YYYY-MM-DD[&all=1]
//        the fee-bearing missed bookings nobody charged (all=1: with the
//        settled, parked and waived ones too)
//   POST { action: 'charge-gl', patientId, scheduleId, walletId? }
//        put the fee on the patient's guarantee letter (parked if none has room)
//   POST { action: 'waive', patientId, scheduleId, reason }   admins/accountants
//   POST { action: 'record', orderId, scheduleIds }
//        New Payment rang these fees into an order — tie them to it
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadFeeBearingAbsences } from '@/lib/pos/uncharged-cancellations'
import { chargeAbsenceToGl, waiveAbsence, recordAbsenceFees } from '@/lib/pos/uncharged-cancellation-actions'
import { PARKED_FEE_WAIVE_ROLES } from '@/lib/pos/retro-cancellation'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = new URL(req.url).searchParams
  try {
    const rows = await loadFeeBearingAbsences(prisma, {
      branch: q.get('branch') || undefined,
      patientId: q.get('patientId') || undefined,
      since: q.get('since') || undefined,
    })
    const list = q.get('all') === '1' ? rows : rows.filter(r => r.state === 'UNCHARGED')
    const uncharged = rows.filter(r => r.state === 'UNCHARGED')
    return NextResponse.json({
      rows: list,
      summary: {
        uncharged: uncharged.length,
        amount: uncharged.reduce((s, r) => s + r.amount, 0),
        patients: new Set(uncharged.map(r => r.patientId)).size,
        gl: uncharged.filter(r => r.gl).length,
      },
    })
  } catch (e) {
    // Never "nothing owed" when the schedule couldn't be read.
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read the schedule' }, { status: 502 })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  const role = String(session?.user?.role || '')
  if (!session?.user || !WRITE_ROLES.includes(role)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(body.action || '')
  const userId = session.user.id ?? null

  if (action === 'charge-gl') {
    const r = await chargeAbsenceToGl(prisma, String(body.patientId || ''), String(body.scheduleId || ''), body.walletId ? String(body.walletId) : null, userId)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    await prisma.auditLog.create({ data: { userId: userId!, action: 'CREATE', entity: 'uncharged-cancellation', entityId: String(body.scheduleId), details: r } })
    return NextResponse.json(r)
  }

  if (action === 'waive') {
    if (!PARKED_FEE_WAIVE_ROLES.includes(role)) return NextResponse.json({ error: 'Only admins and accountants can waive a fee' }, { status: 403 })
    const reason = String(body.reason || '').trim()
    if (reason.length < 3) return NextResponse.json({ error: 'Say why the fee is waived' }, { status: 400 })
    const r = await waiveAbsence(prisma, String(body.patientId || ''), String(body.scheduleId || ''), reason.slice(0, 500), userId!)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    await prisma.auditLog.create({ data: { userId: userId!, action: 'UPDATE', entity: 'uncharged-cancellation', entityId: String(body.scheduleId), details: { waived: true, reason } } })
    return NextResponse.json(r)
  }

  if (action === 'record') {
    const ids = Array.isArray(body.scheduleIds) ? body.scheduleIds.map(String).filter(Boolean) : []
    const r = await recordAbsenceFees(prisma, String(body.orderId || ''), ids, userId)
    return NextResponse.json(r)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
