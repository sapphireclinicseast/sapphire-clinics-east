// POST /api/sms/send — create an SmsCampaign row and either send-now or
// schedule for later. Mirrors the email send route but routes through
// httpSMS via lib/sms.ts.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeSendSmsCampaign } from '@/lib/sms'

const MAX_MESSAGE_LEN = 160

function genId(): string {
  // cuid-ish — 24 lowercase chars; good enough for a row PK.
  return 'sms_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const subject = String(body.subject ?? '').trim()
  const message = String(body.message ?? '').trim()
  const recipientGroup = String(body.recipientGroup ?? '').trim()
  const branch = String(body.branch ?? 'BOTH').trim()
  const scheduledAtRaw = body.scheduledAt as string | undefined

  if (!subject) return NextResponse.json({ error: 'subject required (internal label)' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json(
      { error: `message must be ≤ ${MAX_MESSAGE_LEN} characters (currently ${message.length})` },
      { status: 400 },
    )
  }
  if (!recipientGroup) return NextResponse.json({ error: 'recipientGroup required' }, { status: 400 })
  if (!['SBEA', 'SBGH', 'BOTH'].includes(branch)) {
    return NextResponse.json({ error: 'branch must be SBEA, SBGH, or BOTH' }, { status: 400 })
  }

  // Optional dept (for actively-serviced groups) — extract from group name.
  const deptMatch = /^actively-serviced-(.+)$/.exec(recipientGroup)
  const department = deptMatch ? deptMatch[1].toUpperCase() : null

  const id = genId()
  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null
  const now = new Date()

  // Insert row via raw SQL (no Prisma client delegate yet for SmsCampaign).
  await prisma.$executeRaw`
    INSERT INTO "SmsCampaign"
      (id, subject, message, "recipientGroup", branch, department,
       status, "recipientCount", "sentCount",
       "scheduledAt", "userId", "createdAt", "updatedAt")
    VALUES
      (${id}, ${subject}, ${message}, ${recipientGroup}, ${branch}, ${department},
       ${scheduledAt ? 'scheduled' : 'sending'}, 0, 0,
       ${scheduledAt}, ${userId}, ${now}, ${now})
  `

  if (scheduledAt && scheduledAt.getTime() > Date.now()) {
    // Schedule via BullMQ
    const { smsQueue } = await import('@/lib/queue')
    const delay = scheduledAt.getTime() - Date.now()
    await smsQueue.add('send-sms-campaign', { campaignId: id }, { delay, jobId: id })
    return NextResponse.json({ ok: true, id, scheduled: true, scheduledAt })
  }

  // Send-now: fire and forget so the HTTP response returns quickly.
  executeSendSmsCampaign(id).catch(err => {
    console.error('[sms-send] failed:', err)
  })

  return NextResponse.json({ ok: true, id, scheduled: false })
}
