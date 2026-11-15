import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CUTOFF_RX } from '@/lib/payroll/si-coverage'
import { toAdjustment } from '@/lib/payroll/si-amounts-server'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

/**
 * PATCH { id, action, targetCutoff?, note? } — decide where an invoice's
 * difference from payroll goes (ConsultantSiAdjustment):
 *   carry  → absorbed by the invoice covering `targetCutoff` (status OPEN)
 *   flag   → keep it on record, carry nothing (FLAGGED)
 *   waive  → drop it (WAIVED)
 * An adjustment already absorbed by a later invoice (APPLIED) can't be moved;
 * remove or re-amount that invoice first.
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const b = await req.json()
    const id = String(b.id || '')
    const action = String(b.action || '')
    const row = id ? await prisma.consultantSiAdjustment.findUnique({ where: { id } }) : null
    if (!row) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 })
    if (row.status === 'APPLIED') {
      return NextResponse.json({ error: 'Already taken up by a later invoice — remove or correct that invoice first' }, { status: 409 })
    }
    const note = typeof b.note === 'string' ? b.note.trim() || null : row.note
    let data: { status: string; targetCutoff?: string | null; note: string | null }
    if (action === 'carry') {
      const target = String(b.targetCutoff || '')
      if (!CUTOFF_RX.test(target)) return NextResponse.json({ error: 'Pick the cutoff to carry it to' }, { status: 400 })
      if (row.sourceKeys.some(k => target === k || target.startsWith(`${k}-`))) {
        return NextResponse.json({ error: 'Pick a cutoff outside the invoice it came from' }, { status: 400 })
      }
      data = { status: 'OPEN', targetCutoff: target, note }
    } else if (action === 'flag') {
      data = { status: 'FLAGGED', targetCutoff: null, note }
    } else if (action === 'waive') {
      data = { status: 'WAIVED', note }
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    const updated = await prisma.consultantSiAdjustment.update({ where: { id }, data })
    return NextResponse.json({ ok: true, adjustment: toAdjustment(updated) })
  } catch (e) {
    console.error('SI adjustment update error:', e)
    return NextResponse.json({ error: 'Failed to update the adjustment' }, { status: 500 })
  }
}
