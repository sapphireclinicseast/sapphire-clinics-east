// GET /api/email/campaigns — list past email campaigns for the history view.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')   // 'sent' | 'scheduled' | 'failed' | 'draft'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200)

  // Auto-recover campaigns stuck in "sending" status — if the server crashed
  // mid-send (or the job timed out), the row would otherwise stay "sending"
  // forever. 2 hours is comfortably longer than any legitimate large send.
  const staleCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000)
  await prisma.emailCampaign.updateMany({
    where: { status: 'sending', updatedAt: { lt: staleCutoff } },
    data: { status: 'failed' },
  })

  const where: Record<string, unknown> = {}
  if (status && status !== 'all') where.status = status

  const campaigns = await prisma.emailCampaign.findMany({
    where,
    orderBy: [{ sentAt: 'desc' }, { scheduledAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      subject: true,
      recipientGroup: true,
      recipientCount: true,
      sentCount: true,
      status: true,
      scheduledAt: true,
      sentAt: true,
      createdAt: true,
      gmailAccountId: true,
    },
  })

  return NextResponse.json({ campaigns })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string } | undefined)?.role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.emailCampaign.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// GET the full body/details of a specific campaign
