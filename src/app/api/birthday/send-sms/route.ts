// POST /api/birthday/send-sms — one birthday SMS, sent by a person.
//
// Greetings normally go out on their own (see /api/birthday/cron). This stays
// for the mornings the automatic run could not finish the job: the httpSMS
// phone was offline, or a number was added to the record after 9am.
//
// The send itself lives in lib/birthday-send so this and the cron cannot end
// up wording the message differently.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordBirthdayGreeting } from '@/lib/birthday-greeting'
import { birthdayMessage, sendBirthdaySms } from '@/lib/birthday-send'

// Fail fast — don't let a slow httpSMS response hang the client UI for minutes
export const maxDuration = 15

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { patientId, branch, message } = await req.json()
  if (!patientId || !branch)
    return NextResponse.json({ error: 'patientId and branch are required' }, { status: 400 })

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { phone: true, firstName: true },
  })
  if (!patient)
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  if (!patient.phone)
    return NextResponse.json(
      { error: `${patient.firstName} has no phone number on file` },
      { status: 400 },
    )

  try {
    await sendBirthdaySms({
      firstName: patient.firstName,
      phone: patient.phone,
      branch,
      // The client used to build the text and post it. Its copy is still
      // honoured so an older tab keeps working, but the default is now the
      // shared one.
      message: typeof message === 'string' && message.trim()
        ? message
        : birthdayMessage(patient.firstName, branch),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `Could not send (${msg}). Check that the phone running httpSMS is online.` },
      { status: 502 },
    )
  }

  console.log(`[birthday-sms] Sent to ${patient.firstName} (${branch})`)
  await recordBirthdayGreeting({
    patientId,
    channel: 'sms',
    sentByName: session.user?.name ?? null,
    branch,
  })

  return NextResponse.json({ ok: true })
}
