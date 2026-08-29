import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionProviderId } from '@/lib/auth'

// Submit identity + credentials for SCEI review. Flips the account to PENDING;
// an admin approves it to VERIFIED (see nickel/TERMS_IMPLEMENTATION_GAP.md).
export async function POST(req: NextRequest) {
  const pid = await getSessionProviderId()
  if (!pid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const s = (k: string) => String(b[k] ?? '').trim()

  const facePhoto = s('facePhoto')
  const prcHoldingPhoto = s('prcHoldingPhoto')
  const prcNumber = s('prcNumber')
  const school = s('school')
  const yearGraduated = s('yearGraduated')
  const yearsExperience = s('yearsExperience')
  const postgraduate = s('postgraduate')
  const postNominals = s('postNominals')
  const diplomaScan = s('diplomaScan')
  const torScan = s('torScan')
  const bankName = s('bankName')
  // NOTE: keep the account number EXACTLY as typed — never Number() it, or a
  // leading zero (common in PH account numbers) would be dropped.
  const bankAccountNo = s('bankAccountNo')
  const bankAccountName = s('bankAccountName')

  // Optional specialization request (unlocks a specialized rate once admin verifies the cert).
  const specialization = s('specialization') || null
  const specializedRateRaw = s('specializedRate')
  const specializedRate = specializedRateRaw ? Number(specializedRateRaw.replace(/[^0-9.]/g, '')) : null
  const certifications = Array.isArray(b.certifications)
    ? (b.certifications as unknown[])
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
        .map((c) => ({ name: String(c.name ?? 'Certification').trim(), file: String(c.file ?? '') }))
        .filter((c) => c.name && c.file.startsWith('data:'))
    : []

  const missing: string[] = []
  if (!facePhoto.startsWith('data:image/')) missing.push('a face-scan selfie')
  if (!prcHoldingPhoto.startsWith('data:image/')) missing.push('a photo holding your PRC ID')
  if (!prcNumber) missing.push('your PRC number')
  if (!school) missing.push('the school you graduated from')
  if (!yearGraduated) missing.push('your year graduated')
  if (!yearsExperience) missing.push('your years of experience')
  if (!diplomaScan.startsWith('data:')) missing.push('a diploma scan')
  if (!torScan.startsWith('data:')) missing.push('a transcript of records scan')
  if (!bankName) missing.push('your bank')
  if (!bankAccountNo) missing.push('your bank account number')
  if (!bankAccountName) missing.push('your bank account name')
  if (missing.length) return NextResponse.json({ error: `Please provide: ${missing.join(', ')}.` }, { status: 400 })

  await prisma.provider.update({
    where: { id: pid },
    data: {
      facePhoto, prcHoldingPhoto, prcNumber, school, yearGraduated,
      yearsExperience, postgraduate: postgraduate || null, postNominals: postNominals || null,
      diplomaScan, torScan,
      bankName, bankAccountNo, bankAccountName,
      specialization, specializedRate: specializedRate && specializedRate > 0 ? specializedRate : null,
      certifications, specializedRateApproved: false,
      verificationStatus: 'PENDING', verificationSubmittedAt: new Date(), rejectionReason: null,
    },
  })
  return NextResponse.json({ ok: true })
}
