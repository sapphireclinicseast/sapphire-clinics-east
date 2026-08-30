import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { clinicId?: string; action?: string; reason?: string; active?: boolean }
  const clinicId = String(b.clinicId ?? '')
  if (!clinicId) return NextResponse.json({ error: 'Missing clinicId' }, { status: 400 })

  if (b.action === 'approve') await prisma.clinic.update({ where: { id: clinicId }, data: { verificationStatus: 'VERIFIED', verifiedAt: new Date(), rejectionReason: null } })
  else if (b.action === 'reject') await prisma.clinic.update({ where: { id: clinicId }, data: { verificationStatus: 'REJECTED', rejectionReason: b.reason ? String(b.reason).slice(0, 300) : null } })
  else if (b.action === 'setActive' && typeof b.active === 'boolean') await prisma.clinic.update({ where: { id: clinicId }, data: { active: b.active } })
  else return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
