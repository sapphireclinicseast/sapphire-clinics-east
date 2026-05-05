// GET /api/sms/campaigns/[id] — full campaign record incl. message body
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface SmsCampaignRow {
  id: string
  subject: string
  message: string
  recipientGroup: string
  branch: string
  department: string | null
  status: string
  recipientCount: number
  sentCount: number
  nextTrancheAt: Date | null
  scheduledAt: Date | null
  sentAt: Date | null
  createdAt: Date
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const rows = await prisma.$queryRaw<SmsCampaignRow[]>`
    SELECT id, subject, message, "recipientGroup", branch, department,
           status, "recipientCount", "sentCount", "nextTrancheAt",
           "scheduledAt", "sentAt", "createdAt"
      FROM "SmsCampaign" WHERE id = ${id}
  `
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ campaign: rows[0] })
}
