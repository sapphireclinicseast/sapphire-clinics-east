import { prisma } from '@/lib/prisma'

/**
 * Record that a birthday greeting actually went out.
 *
 * Called only after the provider accepted the send, so the panel's green state
 * reflects a real send rather than an attempt. Idempotent: the unique
 * constraint on (patient, channel, year) means a retry or a second click can
 * never create a duplicate, and re-recording is a no-op instead of an error.
 *
 * Never throws — a bookkeeping failure must not turn a successful send into a
 * failed one for the caller, which would invite the operator to send again.
 */
export async function recordBirthdayGreeting(opts: {
  patientId: string
  channel: 'email' | 'sms'
  sentByName?: string | null
  branch?: string | null
}): Promise<void> {
  const year = new Date().getFullYear()
  try {
    await prisma.birthdayGreeting.upsert({
      where: { patientId_channel_year: { patientId: opts.patientId, channel: opts.channel, year } },
      update: {},   // first send wins; keep the original timestamp and sender
      create: {
        patientId: opts.patientId,
        channel: opts.channel,
        year,
        sentByName: opts.sentByName ?? null,
        branch: opts.branch ?? null,
      },
    })
  } catch (err) {
    console.error('[birthday-greeting] failed to record', opts.channel, opts.patientId, err)
  }
}
