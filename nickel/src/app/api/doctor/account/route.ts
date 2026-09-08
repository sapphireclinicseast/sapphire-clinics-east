import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionDoctorId, DOCTOR_COOKIE } from '@/lib/auth'

const RETAIN_YEARS = 3

// Rehab-doctor self-service account lifecycle: deactivate (reversible), reactivate,
// or delete (soft delete — data retained RETAIN_YEARS then disposed).
export async function POST(req: NextRequest) {
  const did = await getSessionDoctorId()
  if (!did) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { action?: string }

  if (b.action === 'deactivate') {
    await prisma.doctor.update({ where: { id: did }, data: { deactivatedAt: new Date(), active: false } })
    return NextResponse.json({ ok: true, status: 'deactivated' })
  }
  if (b.action === 'reactivate') {
    const d = await prisma.doctor.findUnique({ where: { id: did }, select: { deletedAt: true } })
    if (d?.deletedAt) return NextResponse.json({ error: 'This account is scheduled for deletion and cannot be reactivated. Contact support.' }, { status: 409 })
    await prisma.doctor.update({ where: { id: did }, data: { deactivatedAt: null, active: true } })
    return NextResponse.json({ ok: true, status: 'active' })
  }
  if (b.action === 'delete') {
    const now = new Date()
    const retain = new Date(now); retain.setFullYear(retain.getFullYear() + RETAIN_YEARS)
    await prisma.doctor.update({ where: { id: did }, data: { deletedAt: now, deactivatedAt: now, active: false, dataRetainUntil: retain } })
    const res = NextResponse.json({ ok: true, status: 'deleted', retainUntil: retain.toISOString() })
    res.cookies.set(DOCTOR_COOKIE, '', { path: '/', maxAge: 0 })
    return res
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
