import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN = ['ADMIN']

export async function GET() {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const s = await prisma.equitySettings.findUnique({ where: { id: 'singleton' } })
  return NextResponse.json({ authorizedShares: s?.authorizedShares ?? 20000000 })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const authorizedShares = Math.round(Number(body.authorizedShares))
  if (!Number.isFinite(authorizedShares) || authorizedShares < 0) return NextResponse.json({ error: 'Authorized shares must be a non-negative number' }, { status: 400 })
  const s = await prisma.equitySettings.upsert({
    where: { id: 'singleton' },
    update: { authorizedShares },
    create: { id: 'singleton', authorizedShares },
  })
  return NextResponse.json({ authorizedShares: s.authorizedShares })
}
