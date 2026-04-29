// POST /api/email/campaigns/[id]/resume — continue a failed/partial campaign.
// Calls executeSendCampaign which auto-detects the resume case and continues
// from `sentCount` instead of starting from 0.

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

  const campaign = await prisma.emailCampaign.findUnique({ where: { id } })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status === 'sent') {
    return NextResponse.json({ error: 'This campaign has already been sent in full.' }, { status: 400 })
  }
  if (campaign.status === 'sending') {
    return NextResponse.json({ error: 'This campaign is currently sending — please wait.' }, { status: 409 })
  }

  // Kick off in the background so the HTTP response returns quickly. The
  // executeSendCampaign function detects status=failed + sentCount>0 and
  // resumes from there.
  executeSendCampaign(id).catch(err => {
    console.error('[resume-campaign] failed:', err)
  })

  return NextResponse.json({
    ok: true,
    resuming: campaign.sentCount > 0,
    startFrom: campaign.sentCount,
    total: campaign.recipientCount,
  })
}
