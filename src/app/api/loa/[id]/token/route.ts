// POST /api/loa/[id]/token
// One-time upload link + QR code for the patient to photograph their LOA.
// Mirrors /api/patients/[id]/referral/token, which is the flow front desk
// already knows.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import QRCode from 'qrcode'
import { LOA_WRITE_ROLES, loaBranchScope } from '@/lib/loa-access'

// Long enough for the patient to find the letter and photograph it, short
// enough that a link forwarded on later is dead. The referral flow uses 30
// minutes for a document already in hand; an LOA often has to be dug out of
// email, so this gets the rest of the working day.
const TTL_MS = 12 * 60 * 60 * 1000

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!LOA_WRITE_ROLES.includes(role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const loa = await prisma.loaSubmission.findUnique({
    where: { id },
    select: {
      id: true, branch: true, hmoName: true, patientName: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  })
  if (!loa) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { branch: locked, forced } = loaBranchScope(role, null)
  if (forced && loa.branch !== locked)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Supersede any outstanding link for this letter, so a QR left on a screen
  // earlier cannot be used to overwrite a document that has since arrived.
  await prisma.loaUploadToken.deleteMany({ where: { loaId: id, used: false } })

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + TTL_MS)
  await prisma.loaUploadToken.create({ data: { token, loaId: id, expiresAt } })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://operations.sapphireclinicseast.org'
  const uploadUrl = `${baseUrl}/loa/${token}`

  const qrDataUrl = await QRCode.toDataURL(uploadUrl, {
    width: 300,
    margin: 2,
    color: { dark: '#1C2B30', light: '#FFFFFF' },
  })

  const name = loa.patient
    ? `${loa.patient.firstName} ${loa.patient.lastName}`
    : (loa.patientName ?? '')

  return NextResponse.json({
    token, uploadUrl, qrDataUrl,
    expiresAt: expiresAt.toISOString(),
    patientName: name,
    hmoName: loa.hmoName,
  })
}
