// POST /api/birthday/cron — send today's birthday greetings.
//
// Called hourly. The route decides whether it is the right hour, rather than
// the crontab: the server runs on Europe/Berlin and the clinic on Asia/Manila,
// so a fixed crontab time drifts by an hour twice a year — which for this job
// means greeting somebody at 8am or at 10am depending on the season.
//
// Auth: x-cron-secret, same as the other crons here.

import { NextRequest, NextResponse } from 'next/server'
import { manilaToday, runBirthdayGreetings } from '@/lib/birthday-auto'

/** Manila hour the greetings go out. */
const SEND_HOUR = 9

// Gmail and httpSMS are both per-patient round trips, so a morning with a
// dozen celebrants needs more than the default.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured on server.' }, { status: 503 })
  }
  if ((req.headers.get('x-cron-secret') ?? '') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = manilaToday()
  // `force` runs it off-hour — for a morning the cron missed, and for
  // checking the thing works without waiting until tomorrow. The unique
  // constraint means forcing it cannot double-send.
  const force = req.nextUrl.searchParams.get('force') === '1'
  // `ran` is what the cron wrapper keys off, and it is a BOOLEAN on both
  // replies for a reason: the wrapper used to look for the word "skipped",
  // which a successful run also carried as a count of patients already
  // greeted. Every real run read as an off-hour no-op and logged nothing.
  if (!force && now.hour !== SEND_HOUR) {
    return NextResponse.json({
      ok: true, ran: false,
      reason: `Manila hour is ${now.hour}, greetings go out at ${SEND_HOUR}.`,
    })
  }

  try {
    const result = await runBirthdayGreetings()
    console.log(
      `[birthday-cron] ${result.date}: ${result.celebrants} celebrant(s), ` +
      `${result.emailSent} email, ${result.smsSent} SMS, ${result.alreadyGreeted} already done, ` +
      `${result.noContact} with no contact details, ${result.errors.length} error(s)`,
    )
    for (const e of result.errors) console.error(`[birthday-cron] ${e.channel} ${e.patientId}: ${e.error}`)
    return NextResponse.json({ ok: true, ran: true, ...result })
  } catch (err) {
    console.error('[birthday-cron]', err)
    return NextResponse.json({ ok: false, ran: true, error: (err as Error).message }, { status: 500 })
  }
}

// Health check, mirroring the other crons: reports whether it COULD run
// without running it. A silently missing CRON_SECRET has cost this codebase
// months of unwritten data before.
export async function GET() {
  const now = manilaToday()
  return NextResponse.json({
    cronSecretConfigured: !!process.env.CRON_SECRET,
    manilaDate: now.iso,
    manilaHour: now.hour,
    sendHour: SEND_HOUR,
  })
}
