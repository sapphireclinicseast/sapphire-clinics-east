// POST /api/patients/[id]/pwd-id/token
// Generates a one-time upload token for the mobile QR code flow (PWD ID / Senior ID photo).

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import QRCode from 'qrcode'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  // Invalidate any existing unused tokens for this patient
  await prisma.pwdIdUploadToken.deleteMany({
    where: { patientId: id, used: false },
  })

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

  await prisma.pwdIdUploadToken.create({
    data: { token, patientId: id, expiresAt },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://marketing.sapphireclinicseast.org'
  const uploadUrl = `${baseUrl}/pwd-id/${token}`

  const qrDataUrl = await QRCode.toDataURL(uploadUrl, {
    width: 300,
    margin: 2,
    color: { dark: '#1C2B30', light: '#FFFFFF' },
  })

  return NextResponse.json({
    token,
    uploadUrl,
    qrDataUrl,
    expiresAt: expiresAt.toISOString(),
    patientName: `${patient.firstName} ${patient.lastName}`,
  })
}
