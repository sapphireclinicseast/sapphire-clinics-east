import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth'

// Admin actions on a provider's verification.
// action: 'approve' | 'reject' | 'setSpecialized'
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as {
    providerId?: string; action?: string; reason?: string; note?: string; allowSpecialized?: boolean
  }
  const providerId = String(b.providerId ?? '')
  if (!providerId) return NextResponse.json({ error: 'Missing providerId' }, { status: 400 })
  const provider = await prisma.provider.findUnique({ where: { id: providerId }, select: { id: true } })
  if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  if (b.action === 'approve') {
    await prisma.provider.update({
      where: { id: providerId },
      data: {
        verificationStatus: 'VERIFIED', verifiedAt: new Date(), rejectionReason: null,
        reviewerNote: b.note?.trim() || undefined,
        ...(typeof b.allowSpecialized === 'boolean' ? { specializedRateApproved: b.allowSpecialized } : {}),
      },
    })
    return NextResponse.json({ ok: true, status: 'VERIFIED' })
  }
  if (b.action === 'reject') {
    await prisma.provider.update({
      where: { id: providerId },
      data: { verificationStatus: 'REJECTED', rejectionReason: b.reason?.trim() || 'Please review and resubmit your documents.', reviewerNote: b.note?.trim() || undefined },
    })
    return NextResponse.json({ ok: true, status: 'REJECTED' })
  }
  if (b.action === 'setSpecialized') {
    await prisma.provider.update({ where: { id: providerId }, data: { specializedRateApproved: !!b.allowSpecialized } })
    return NextResponse.json({ ok: true, specializedRateApproved: !!b.allowSpecialized })
  }
  if (b.action === 'setActive') {
    // Suspend/reactivate a provider (deactivated providers drop off the marketplace).
    await prisma.provider.update({ where: { id: providerId }, data: { active: !!(b as { active?: boolean }).active } })
    return NextResponse.json({ ok: true, active: !!(b as { active?: boolean }).active })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
