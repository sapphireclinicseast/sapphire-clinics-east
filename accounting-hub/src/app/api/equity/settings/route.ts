import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN = ['ADMIN']

export async function GET() {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const s = await prisma.equitySettings.findUnique({ where: { id: 'singleton' } })
  return NextResponse.json({
    authorizedShares: s?.authorizedShares ?? 20000000,
    authorizedCommonShares: s?.authorizedCommonShares ?? null,
    authorizedFounderShares: s?.authorizedFounderShares ?? null,
  })
}

// Optional non-negative integer, or null to clear.
function optInt(v: unknown): number | null | undefined {
  if (v === null || v === '' || v === undefined) return v === undefined ? undefined : null
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const authorizedShares = Math.round(Number(body.authorizedShares))
  if (!Number.isFinite(authorizedShares) || authorizedShares < 0) return NextResponse.json({ error: 'Authorized shares must be a non-negative number' }, { status: 400 })
  const common = optInt(body.authorizedCommonShares)
  const founder = optInt(body.authorizedFounderShares)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { authorizedShares }
  if (common !== undefined) data.authorizedCommonShares = common
  if (founder !== undefined) data.authorizedFounderShares = founder
  const s = await prisma.equitySettings.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  })
  return NextResponse.json({ authorizedShares: s.authorizedShares, authorizedCommonShares: s.authorizedCommonShares, authorizedFounderShares: s.authorizedFounderShares })
}
