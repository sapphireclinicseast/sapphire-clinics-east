import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth'

// Admin verifies / rejects / (de)activates a rehab doctor.
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { doctorId?: string; action?: string; reason?: string; active?: boolean }
  const doctorId = String(b.doctorId ?? '')
  if (!doctorId) return NextResponse.json({ error: 'Missing doctorId' }, { status: 400 })

  if (b.action === 'approve') {
    await prisma.doctor.update({ where: { id: doctorId }, data: { verificationStatus: 'VERIFIED', verifiedAt: new Date(), rejectionReason: null } })
  } else if (b.action === 'reject') {
    await prisma.doctor.update({ where: { id: doctorId }, data: { verificationStatus: 'REJECTED', rejectionReason: b.reason ? String(b.reason).slice(0, 300) : null } })
  } else if (b.action === 'setActive' && typeof b.active === 'boolean') {
    await prisma.doctor.update({ where: { id: doctorId }, data: { active: b.active } })
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
