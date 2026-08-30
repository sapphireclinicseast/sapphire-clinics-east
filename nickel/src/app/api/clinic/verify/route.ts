import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionClinicId } from '@/lib/auth'

const DOC_FIELDS = ['secDtiFile', 'bir2303File', 'aoiFile', 'byLawsFile', 'businessPermitFile'] as const

// Clinic submits business documents → status PENDING for admin review.
export async function POST(req: NextRequest) {
  const cid = await getSessionClinicId()
  if (!cid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const data: Record<string, unknown> = {}
  for (const f of DOC_FIELDS) {
    const v = b[f]
    if (typeof v === 'string' && v.startsWith('data:')) {
      if (v.length > 8_000_000) return NextResponse.json({ error: 'A file is too large (max ~6 MB).' }, { status: 413 })
      data[f] = v
    }
  }
  if (typeof b.tin === 'string') data.tin = b.tin.slice(0, 40)
  if (typeof b.businessType === 'string' && ['SOLE_PROP', 'PARTNERSHIP', 'CORPORATION'].includes(b.businessType)) data.businessType = b.businessType

  const existing = await prisma.clinic.findUnique({ where: { id: cid }, select: { secDtiFile: true, bir2303File: true, businessPermitFile: true, businessType: true, aoiFile: true } })
  const secDti = data.secDtiFile ?? existing?.secDtiFile
  const bir = data.bir2303File ?? existing?.bir2303File
  const permit = data.businessPermitFile ?? existing?.businessPermitFile
  const bType = (data.businessType as string) ?? existing?.businessType
  if (!secDti || !bir || !permit) return NextResponse.json({ error: 'Please upload SEC/DTI registration, BIR 2303, and your business permit.' }, { status: 400 })
  if (bType === 'CORPORATION' && !(data.aoiFile ?? existing?.aoiFile)) return NextResponse.json({ error: 'Corporations must also upload Articles of Incorporation.' }, { status: 400 })

  await prisma.clinic.update({ where: { id: cid }, data: { ...data, verificationStatus: 'PENDING', verificationSubmittedAt: new Date(), rejectionReason: null } })
  return NextResponse.json({ ok: true })
}
