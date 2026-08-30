import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionDoctorId } from '@/lib/auth'

// Doctor submits verification documents → status PENDING for admin review.
export async function POST(req: NextRequest) {
  const did = await getSessionDoctorId()
  if (!did) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { prcNumber?: string; prcLicenseFile?: string; governmentIdFile?: string }

  const prcLicenseFile = typeof b.prcLicenseFile === 'string' && b.prcLicenseFile.startsWith('data:') ? b.prcLicenseFile : undefined
  const governmentIdFile = typeof b.governmentIdFile === 'string' && b.governmentIdFile.startsWith('data:') ? b.governmentIdFile : undefined
  for (const f of [prcLicenseFile, governmentIdFile]) if (f && f.length > 8_000_000) return NextResponse.json({ error: 'A file is too large (max ~6 MB).' }, { status: 413 })

  const existing = await prisma.doctor.findUnique({ where: { id: did }, select: { prcLicenseFile: true, governmentIdFile: true } })
  const finalPrc = prcLicenseFile ?? existing?.prcLicenseFile
  const finalId = governmentIdFile ?? existing?.governmentIdFile
  if (!finalPrc || !finalId) return NextResponse.json({ error: 'Please upload both your PRC licence and a government ID.' }, { status: 400 })

  await prisma.doctor.update({
    where: { id: did },
    data: {
      prcNumber: b.prcNumber ? String(b.prcNumber).slice(0, 40) : undefined,
      ...(prcLicenseFile ? { prcLicenseFile } : {}),
      ...(governmentIdFile ? { governmentIdFile } : {}),
      verificationStatus: 'PENDING', verificationSubmittedAt: new Date(), rejectionReason: null,
    },
  })
  return NextResponse.json({ ok: true })
}
