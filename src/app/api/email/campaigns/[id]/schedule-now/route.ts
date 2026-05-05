// POST /api/email/campaigns/[id]/schedule-now — fire the next tranche
// of an email campaign immediately, bypassing the BullMQ-scheduled time.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeSendCampaign } from '@/lib/email'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const c = await prisma.emailCampaign.findUnique({
    where: { id },
    select: { status: true, sentCount: true, recipientCount: true },
  })
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (c.status !== 'partial' && c.status !== 'failed') {
    return NextResponse.json({ error: `No tranche to fire — status is "${c.status}".` }, { status: 400 })
  }

  // Cancel any matching delayed job
  try {
    const { emailQueue } = await import('@/lib/queue')
    const delayed = await emailQueue.getDelayed()
    for (const j of delayed) {
      if (typeof j.id === 'string' && j.id.startsWith(`${id}_`)) {
        await j.remove().catch(() => undefined)
      }
    }
  } catch (e) {
    console.warn('[email-schedule-now] could not clear delayed job:', (e as Error).message)
  }

  await prisma.emailCampaign.update({
    where: { id },
    data: { nextTrancheAt: null },
  }).catch(() => undefined)

  executeSendCampaign(id).catch(err => {
    console.error('[email-schedule-now] failed:', err)
  })

  return NextResponse.json({
    ok: true,
    startFrom: c.sentCount,
    total: c.recipientCount,
  })
}
