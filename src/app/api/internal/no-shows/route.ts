// POST /api/internal/no-shows — log a no-show rung up at the POS.
//
// The cashier presses "No Show" in the Appointment Queue, the till charges the
// no-show fee, and the patient's record in Patient Relationship has to say so
// without anybody opening the other hub and typing it again. A fee collected
// for a no-show nobody logged is a fee with no record behind it.
//
// Auth: x-api-key against the shared service key, the same gate
// /api/internal/cancellations uses. There is no user session at a till.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isCoverage } from '@/lib/cancellation-types'

export const dynamic = 'force-dynamic'

function authorised(req: NextRequest): boolean {
  const key = process.env.EXTERNAL_API_KEY ?? ''
  if (!key) return false
  return req.headers.get('x-api-key') === key
}

/** The POS speaks SBEA/SBGH; the logs are keyed the long way. */
const BRANCH: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
  SANDBOX_EAST: 'SANDBOX_EAST',
  SANDBOX_GREENHILLS: 'SANDBOX_GREENHILLS',
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const patientId = String(body.patientId ?? '').trim()
  const branch = BRANCH[String(body.branch ?? '').toUpperCase()]
  if (!patientId || !branch) {
    return NextResponse.json({ error: 'patientId and a known branch are required' }, { status: 400 })
  }

  // The session it came from, when the queue row had one. Used for the dedupe
  // below, exactly as a no-show logged from Clinic Schedule is.
  const scheduleId = String(body.scheduleId ?? '').trim() || null
  // What paid for the missed session. On a guarantee letter this is what makes
  // it chargeable — and the till knows it better than anyone, because it is
  // about to take the money.
  const paymentType = isCoverage(body.paymentType) ? body.paymentType : null
  const remarks = String(body.remarks ?? '').trim() || null

  // ── The session itself is marked NO_SHOW ────────────────────────────────
  //
  // This is the half that matters. The outcome prompt in Clinic Schedule is
  // skippable and gets skipped: roughly NINE IN TEN absences in 2026 were
  // never logged at all, which is how that many GL sessions went uncharged.
  // The uncharged-cancellation flag therefore reads the SCHEDULE, not the
  // log — so a no-show that only ever became a log would be invisible to the
  // very thing built to catch it.
  //
  // Marking the schedule also makes the two hubs agree about what happened:
  // the cashier saw the patient not arrive, and the clinic's own board should
  // not still be claiming a confirmed session.
  //
  // Failures here are reported rather than swallowed, for the same reason as
  // everywhere else on this path: the fee has already been taken.
  let statusSet = false
  if (scheduleId) {
    try {
      const updated = await prisma.schedule.updateMany({
        // Only from a status that means "we still expect them". A session
        // already cancelled or completed is not re-written by a till press.
        where: { id: scheduleId, status: { in: ['PENDING', 'CONFIRMED'] } },
        data: { status: 'NO_SHOW' },
      })
      statusSet = updated.count > 0
    } catch (err) {
      console.error('[internal/no-shows] could not mark the schedule', scheduleId, err)
    }
  }

  // A patient can be rung up, voided and rung again. One log per session, so a
  // correction at the till does not stack two no-shows on a patient's record —
  // the same rule the Clinic Schedule path already follows.
  if (scheduleId) {
    const existing = await prisma.noShowLog.findFirst({
      where: { scheduleId, deletedAt: null },
      select: { id: true },
    })
    if (existing) return NextResponse.json({ ok: true, log: existing, deduped: true, statusSet })
  }

  // The patient has to exist here, or the log would hang off nothing. Said
  // plainly rather than 500ing: the till has already taken the fee, and the
  // cashier needs to know the record did not land.
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } })
  if (!patient) {
    return NextResponse.json({ error: 'No such patient in the Operations Hub' }, { status: 404 })
  }

  const log = await prisma.noShowLog.create({
    data: { patientId, branch, scheduleId, paymentType, remarks },
    select: { id: true, createdAt: true },
  })
  console.log(
    `[internal/no-shows] logged ${log.id} for patient ${patientId} ` +
    `(${paymentType ?? 'funding not stated'}, schedule ${statusSet ? 'marked NO_SHOW' : 'not marked'})`,
  )
  return NextResponse.json({ ok: true, log, statusSet })
}
