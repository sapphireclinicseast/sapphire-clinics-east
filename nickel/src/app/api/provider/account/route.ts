import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionProviderId, SESSION_COOKIE } from '@/lib/auth'

const RETAIN_YEARS = 3

// Self-service account lifecycle: deactivate (reversible), reactivate, or delete
// (soft delete — data retained RETAIN_YEARS from deletion, then disposed).
export async function POST(req: NextRequest) {
  const pid = await getSessionProviderId()
  if (!pid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { action?: string }

  if (b.action === 'deactivate') {
    await prisma.provider.update({ where: { id: pid }, data: { deactivatedAt: new Date(), active: false } })
    return NextResponse.json({ ok: true, status: 'deactivated' })
  }
  if (b.action === 'reactivate') {
    const p = await prisma.provider.findUnique({ where: { id: pid }, select: { deletedAt: true } })
    if (p?.deletedAt) return NextResponse.json({ error: 'This account is scheduled for deletion and cannot be reactivated. Contact support.' }, { status: 409 })
    await prisma.provider.update({ where: { id: pid }, data: { deactivatedAt: null, active: true } })
    return NextResponse.json({ ok: true, status: 'active' })
  }
  if (b.action === 'delete') {
    const now = new Date()
    const retain = new Date(now); retain.setFullYear(retain.getFullYear() + RETAIN_YEARS)
    await prisma.provider.update({ where: { id: pid }, data: { deletedAt: now, deactivatedAt: now, active: false, dataRetainUntil: retain } })
    // Sign them out.
    const res = NextResponse.json({ ok: true, status: 'deleted', retainUntil: retain.toISOString() })
    res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
    return res
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
