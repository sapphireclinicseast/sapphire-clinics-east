// POST /api/sms/campaigns/[id]/schedule-now — fire the next tranche
// immediately instead of waiting for the BullMQ-scheduled time.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeSendSmsCampaign } from '@/lib/sms'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const rows = await prisma.$queryRaw<Array<{ status: string; sentCount: number; recipientCount: number }>>`
    SELECT status, "sentCount", "recipientCount" FROM "SmsCampaign" WHERE id = ${id}
  `
  const c = rows[0]
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (c.status !== 'partial' && c.status !== 'failed') {
    return NextResponse.json({ error: `No tranche to fire — status is "${c.status}".` }, { status: 400 })
  }

  // Cancel the scheduled BullMQ job so it doesn't double-fire when its
  // delay elapses, then run the campaign now.
  try {
    const { smsQueue } = await import('@/lib/queue')
    // The job-id format is `${campaignId}_${YYYY-MM-DD}` from scheduleNextTranche.
    // We don't know the exact date suffix, so iterate matching jobs.
    const delayed = await smsQueue.getDelayed()
    for (const j of delayed) {
      if (typeof j.id === 'string' && j.id.startsWith(`${id}_`)) {
        await j.remove().catch(() => undefined)
      }
    }
  } catch (e) {
    console.warn('[sms-schedule-now] could not clear delayed job:', (e as Error).message)
  }

  // Clear nextTrancheAt while we run
  await prisma.$executeRaw`UPDATE "SmsCampaign" SET "nextTrancheAt"=NULL, "updatedAt"=now() WHERE id = ${id}`

  executeSendSmsCampaign(id).catch(err => {
    console.error('[sms-schedule-now] failed:', err)
  })

  return NextResponse.json({
    ok: true,
    startFrom: c.sentCount,
    total: c.recipientCount,
  })
}
