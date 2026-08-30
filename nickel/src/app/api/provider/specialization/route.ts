import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionProviderId } from '@/lib/auth'

// A verified provider adds a specialization + its certificate. This does NOT
// change their verification status; the specialized RATE stays locked until an
// admin approves the certification (specializedRateApproved).
export async function POST(req: NextRequest) {
  const pid = await getSessionProviderId()
  if (!pid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { specialization?: string; certName?: string; certFile?: string }

  const specialization = String(b.specialization ?? '').trim()
  const certName = String(b.certName ?? '').trim()
  const certFile = typeof b.certFile === 'string' && b.certFile.startsWith('data:') ? b.certFile : null
  if (!specialization) return NextResponse.json({ error: 'Enter a specialization.' }, { status: 400 })
  if (!certFile) return NextResponse.json({ error: 'Upload the certificate.' }, { status: 400 })
  if (certFile.length > 12_000_000) return NextResponse.json({ error: 'File too large (max ~9 MB).' }, { status: 413 })

  const prov = await prisma.provider.findUnique({ where: { id: pid }, select: { certifications: true } })
  const existing = Array.isArray(prov?.certifications) ? (prov!.certifications as unknown[]) : []
  const certifications = [...existing, { name: certName || specialization, file: certFile }]

  await prisma.provider.update({
    where: { id: pid },
    data: { specialization, certifications: certifications as never, specializedRateApproved: false },
  })
  return NextResponse.json({ ok: true })
}
