/**
 * Greet every patient whose birthday is today, without anybody clicking.
 *
 * Front desk used to send these by hand from the dashboard, one button per
 * patient per channel. That worked exactly as well as somebody remembering:
 * on a busy morning the card sat there greeted-by-nobody, and a patient's
 * birthday is not a thing you can send late.
 *
 * The card stays — as a reminder that it IS their birthday, which is the part
 * a person actually needs to know when that patient walks in.
 *
 * Safe to run repeatedly. BirthdayGreeting carries a unique constraint on
 * (patient, channel, year) and every send checks it first, so an hourly cron,
 * a retry and a manual click between them cannot stack up three greetings.
 */

import { prisma } from '@/lib/prisma'
import { recordBirthdayGreeting } from '@/lib/birthday-greeting'
import { birthdayMessage, normaliseBranch, sendBirthdayEmail, sendBirthdaySms } from '@/lib/birthday-send'

/** Who the greeting is attributed to, so the dashboard can say so. */
export const AUTO_SENDER = 'Sent automatically'

export interface BirthdaySweepResult {
  /** Manila date the sweep ran for. */
  date: string
  celebrants: number
  emailSent: number
  smsSent: number
  /** Already greeted this year before this run — not re-sent. */
  skipped: number
  /** Had neither an email nor a phone number: nothing to send to. */
  noContact: number
  errors: { patientId: string; channel: 'email' | 'sms'; error: string }[]
}

/**
 * Today in Manila, as {month, day, iso}.
 *
 * The container runs in UTC and the clinic does not. Reading the date off the
 * server clock would start greeting people at 8am the day BEFORE their
 * birthday for the eight hours Manila is ahead.
 */
export function manilaToday(now = new Date()): { month: number; day: number; iso: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const iso = `${get('year')}-${get('month')}-${get('day')}`
  return { month: Number(get('month')), day: Number(get('day')), iso, hour: Number(get('hour')) }
}

/** The branch a patient belongs to, for the mailbox and the SMS number. */
function branchOf(p: { branch: string | null; branches: string[] }): string | null {
  return normaliseBranch(p.branch) ?? normaliseBranch(p.branches?.[0] ?? null)
}

export async function runBirthdayGreetings(opts: { dryRun?: boolean } = {}): Promise<BirthdaySweepResult> {
  const today = manilaToday()
  const year = Number(today.iso.slice(0, 4))

  const result: BirthdaySweepResult = {
    date: today.iso, celebrants: 0, emailSent: 0, smsSent: 0, skipped: 0, noContact: 0, errors: [],
  }

  // Raw SQL for the enum array, matching the dashboard's own query: the Prisma
  // PG driver adapter cannot use `has` on a PostgreSQL enum array.
  const patients = await prisma.$queryRawUnsafe<
    { id: string; firstName: string; dob: Date | null; email: string | null; phone: string | null; branch: string | null; branches: string[] }[]
  >(
    `SELECT id, "firstName", dob, email, phone, branch::text AS branch, "branches"::text[] AS branches
       FROM "Patient"
      WHERE dob IS NOT NULL
        AND EXTRACT(MONTH FROM dob) = $1
        AND EXTRACT(DAY   FROM dob) = $2`,
    today.month, today.day,
  )
  result.celebrants = patients.length
  if (patients.length === 0) return result

  // One query for the whole day's history rather than one per patient.
  const already = await prisma.birthdayGreeting.findMany({
    where: { year, patientId: { in: patients.map(p => p.id) } },
    select: { patientId: true, channel: true },
  })
  const done = new Set(already.map(g => `${g.channel}:${g.patientId}`))

  for (const p of patients) {
    const branch = branchOf(p)
    const hasEmail = !!p.email
    const hasPhone = !!p.phone
    if (!hasEmail && !hasPhone) { result.noContact += 1; continue }

    // Email.
    if (hasEmail) {
      if (done.has(`email:${p.id}`)) result.skipped += 1
      else if (!opts.dryRun) {
        try {
          await sendBirthdayEmail({ firstName: p.firstName, email: p.email!, branch })
          // Recorded only after the provider accepted it. A failure leaves
          // the patient greetable — by the next run, or by hand.
          await recordBirthdayGreeting({ patientId: p.id, channel: 'email', sentByName: AUTO_SENDER, branch })
          result.emailSent += 1
        } catch (err) {
          result.errors.push({ patientId: p.id, channel: 'email', error: (err as Error).message })
        }
      }
    }

    // SMS. Sent independently of the email: a gateway outage should not cost
    // the patient the greeting that did work.
    if (hasPhone) {
      if (done.has(`sms:${p.id}`)) result.skipped += 1
      else if (!opts.dryRun && branch) {
        try {
          await sendBirthdaySms({
            firstName: p.firstName, phone: p.phone!, branch,
            message: birthdayMessage(p.firstName, branch),
          })
          await recordBirthdayGreeting({ patientId: p.id, channel: 'sms', sentByName: AUTO_SENDER, branch })
          result.smsSent += 1
        } catch (err) {
          result.errors.push({ patientId: p.id, channel: 'sms', error: (err as Error).message })
        }
      }
    }
  }

  return result
}
