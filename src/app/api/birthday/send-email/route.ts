// POST /api/birthday/send-email — one birthday email, sent by a person.
//
// Greetings normally go out on their own (see /api/birthday/cron). This stays
// for the mornings the automatic run could not finish the job: no Gmail
// account was connected, or an address was added to the record after 9am.
//
// The message itself lives in lib/birthday-send so this and the cron cannot
// end up sending two different emails.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordBirthdayGreeting } from '@/lib/birthday-greeting'
import { sendBirthdayEmail } from '@/lib/birthday-send'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { patientId, branch } = await req.json()
  if (!patientId) return NextResponse.json({ error: 'patientId required' }, { status: 400 })

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  if (!patient.email) return NextResponse.json({ error: 'Patient has no email address on file' }, { status: 422 })

  try {
    await sendBirthdayEmail({ firstName: patient.firstName, email: patient.email, branch })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  await recordBirthdayGreeting({
    patientId,
    channel: 'email',
    sentByName: session.user?.name ?? null,
    branch: branch ?? null,
  })

  return NextResponse.json({ success: true })
}
