// POST /api/sms/campaigns/[id]/resume — re-trigger a partial/failed campaign.
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
  if (c.status === 'sent')    return NextResponse.json({ error: 'Already fully sent.' }, { status: 400 })
  if (c.status === 'sending') return NextResponse.json({ error: 'Currently sending — please wait.' }, { status: 409 })

  executeSendSmsCampaign(id).catch(err => {
    console.error('[sms-resume] failed:', err)
  })

  return NextResponse.json({
    ok: true,
    resuming: c.sentCount > 0,
    startFrom: c.sentCount,
    total: c.recipientCount,
  })
}
