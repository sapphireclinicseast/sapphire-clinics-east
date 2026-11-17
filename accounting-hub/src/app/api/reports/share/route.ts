import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseShareBranch, shareStatus, SHARE_ROLES, SHARE_VIEWS } from '@/lib/reports/share'

// Reports → Share: list and create links. Whole-company finance roles only.

async function manager() {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role || ''
  return session?.user && SHARE_ROLES.includes(role) ? session : null
}

const out = (l: {
  id: string; token: string; label: string | null; tab: string; year: number; branch: string; view: string
  allowDrill: boolean; hideNames: boolean; expiresAt: Date | null; revokedAt: Date | null
  viewCount: number; lastViewedAt: Date | null; createdByName: string | null; createdAt: Date
}) => ({ ...l, status: shareStatus(l) })

export async function GET() {
  if (!await manager()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const links = await prisma.reportShareLink.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
  return NextResponse.json({ links: links.map(out) })
}

export async function POST(req: Request) {
  const session = await manager()
  if (!session) return NextResponse.json({ error: 'Only an admin or accountant can share reports' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const year = Number(body.year)
  const thisYear = new Date().getFullYear()
  if (!Number.isInteger(year) || year < 2024 || year > thisYear + 1) {
    return NextResponse.json({ error: 'Pick a year from 2024 on' }, { status: 400 })
  }
  const branch = String(body.branch || '')
  if (!parseShareBranch(branch)) return NextResponse.json({ error: 'Unknown branch selection' }, { status: 400 })
  const view = String(body.view || 'monthly')
  if (!(view in SHARE_VIEWS)) return NextResponse.json({ error: 'Unknown column view' }, { status: 400 })
  const days = Number(body.expiresInDays ?? 30)
  if (!Number.isInteger(days) || days < 0 || days > 366) {
    return NextResponse.json({ error: 'Expiry must be up to a year, or never' }, { status: 400 })
  }
  const label = String(body.label || '').trim().slice(0, 80) || null

  const link = await prisma.reportShareLink.create({
    data: {
      token: randomBytes(24).toString('base64url'),
      label, tab: 'income-statement', year, branch, view,
      allowDrill: body.allowDrill !== false,
      hideNames: body.hideNames !== false,
      expiresAt: days > 0 ? new Date(Date.now() + days * 86_400_000) : null,
      createdById: (session.user as { id?: string }).id || null,
      createdByName: session.user?.name || null,
    },
  })
  return NextResponse.json({ link: out(link) }, { status: 201 })
}
