import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId, signRequestUpload } from '@/lib/auth'

// Mint a short-lived QR upload token so the patient can attach a referral from
// their phone (scan the QR shown on another device).
export async function GET(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const requestId = req.nextUrl.searchParams.get('requestId') ?? ''
  const own = await prisma.patientRequest.findFirst({ where: { id: requestId, patientId, status: 'PENDING_REFERRAL' }, select: { id: true } })
  if (!own) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  const token = signRequestUpload(own.id)
  const origin = req.nextUrl.origin
  return NextResponse.json({ token, url: `${origin}/r/req-upload?t=${token}` })
}
