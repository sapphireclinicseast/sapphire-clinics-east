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

  // A patient can be rung up, voided and rung again. One log per session, so a
  // correction at the till does not stack two no-shows on a patient's record —
  // the same rule the Clinic Schedule path already follows.
  if (scheduleId) {
    const existing = await prisma.noShowLog.findFirst({
      where: { scheduleId, deletedAt: null },
      select: { id: true },
    })
    if (existing) return NextResponse.json({ ok: true, log: existing, deduped: true })
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
  console.log(`[internal/no-shows] logged ${log.id} for patient ${patientId} (${paymentType ?? 'funding not stated'})`)
  return NextResponse.json({ ok: true, log })
}
