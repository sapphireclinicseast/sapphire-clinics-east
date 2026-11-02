import { prisma } from '@/lib/prisma'

/**
 * Why a clinician's schedule send found nothing to send.
 *
 * The two clinician routes (send-clinician-sms, send-clinician-email) list
 * CONFIRMED sessions only. On a day nobody has confirmed yet that returns an
 * empty list, and a bare "no schedules found" sent front desk hunting for a
 * booking that is sitting right there in the calendar — the real answer is
 * that it still needs confirming. So count what was filtered out and say so.
 */
export async function emptyReason(
  staffId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<string> {
  const pending = await prisma.schedule.count({
    where: { staffId, date: { gte: dayStart, lte: dayEnd }, status: 'PENDING' },
  })
  if (pending === 0) return 'No confirmed sessions for this day'
  return pending === 1
    ? 'No confirmed sessions for this day — 1 session is still Pending. Confirm it in the schedule first.'
    : `No confirmed sessions for this day — ${pending} sessions are still Pending. Confirm them in the schedule first.`
}
