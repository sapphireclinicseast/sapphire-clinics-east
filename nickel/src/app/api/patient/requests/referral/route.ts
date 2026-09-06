import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId, verifyRequestUpload } from '@/lib/auth'

// Attach a doctor's referral to a posted request, making it LIVE to therapists.
// Authorized either by the patient's own session, or by a signed QR upload token
// (so a referral can be photographed/uploaded from the patient's phone).
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { requestId?: string; token?: string; referralFile?: string; referralConsultId?: string }

  // Resolve which request, and authorize.
  let requestId: string | null = null
  const patientId = await getSessionPatientId()
  if (b.token) {
    requestId = verifyRequestUpload(b.token)
    if (!requestId) return NextResponse.json({ error: 'This upload link has expired. Please reopen the QR code from your requests.' }, { status: 401 })
  } else if (patientId && b.requestId) {
    const own = await prisma.patientRequest.findFirst({ where: { id: String(b.requestId), patientId }, select: { id: true } })
    if (!own) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
    requestId = own.id
  } else {
    return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })
  }

  const request = await prisma.patientRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, patientId: true } })
  if (!request) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  if (request.status === 'CANCELLED' || request.status === 'MATCHED') return NextResponse.json({ error: 'This request is no longer active.' }, { status: 409 })

  // Accept an uploaded referral (photo/PDF) or one from a completed Nickel consult.
  let referralFile: string | null = null
  let referralConsultId: string | null = null
  if (typeof b.referralFile === 'string' && b.referralFile.startsWith('data:')) {
    if (b.referralFile.length > 12_000_000) return NextResponse.json({ error: 'File too large (max ~9 MB).' }, { status: 413 })
    referralFile = b.referralFile
  } else if (b.referralConsultId) {
    const consult = await prisma.consult.findFirst({ where: { id: String(b.referralConsultId), patientId: request.patientId, referralIssued: true }, select: { id: true, referralFile: true } })
    if (consult?.referralFile) { referralFile = consult.referralFile; referralConsultId = consult.id }
  }
  if (!referralFile) return NextResponse.json({ error: 'Please attach a doctor’s referral (photo or PDF).' }, { status: 400 })

  await prisma.patientRequest.update({
    where: { id: request.id },
    data: { referralFile, referralConsultId, status: 'OPEN' },
  })
  return NextResponse.json({ ok: true })
}
