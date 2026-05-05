// GET  /api/sms/campaigns — list past SMS campaigns (history view)
// DELETE /api/sms/campaigns — delete one campaign row by id

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

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const branch = searchParams.get('branch')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200)

  // Auto-recover stuck "sending" rows older than 2h — they're either crashed
  // or the worker process died mid-tranche.
  const staleCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000)
  await prisma.$executeRaw`
    UPDATE "SmsCampaign" SET status='failed', "updatedAt"=now()
    WHERE status='sending' AND "updatedAt" < ${staleCutoff}
  `

  // Build the WHERE clause
  const conditions: string[] = []
  const params: (string | number)[] = []
  if (status && status !== 'all') {
    params.push(status)
    conditions.push(`status = $${params.length}`)
  }
  if (branch && branch !== 'BOTH' && branch !== 'all') {
    params.push(branch)
    conditions.push(`(branch = $${params.length} OR branch = 'BOTH')`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit)

  const rows = await prisma.$queryRawUnsafe<SmsCampaignRow[]>(
    `SELECT id, subject, message, "recipientGroup", branch, department,
            status, "recipientCount", "sentCount", "nextTrancheAt",
            "scheduledAt", "sentAt", "createdAt"
       FROM "SmsCampaign"
       ${where}
       ORDER BY COALESCE("sentAt", "scheduledAt", "createdAt") DESC
       LIMIT $${params.length}`,
    ...params,
  )

  return NextResponse.json({ campaigns: rows })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string } | undefined)?.role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.$executeRaw`DELETE FROM "SmsCampaign" WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
