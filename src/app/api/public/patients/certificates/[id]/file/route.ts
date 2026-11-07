// GET /api/public/patients/certificates/[id]/file?token=…
// Streams one of the signed-in patient's own discharge certificates.
//
// Ownership is checked against the portal token before anything is read. A
// certificate id is a short opaque string that ends up in browser history and
// print dialogs, so it is never sufficient on its own.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'
import { CERT_DIR, readStored } from '@/lib/certificate-files'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const session = verifyPatientToken(token)
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const row = await prisma.dischargeCertificate.findUnique({
    where: { id }, select: { patientId: true, filePath: true },
  })

  // One 404 for "no such certificate" and for "not yours" alike: telling a
  // caller which it was confirms that an id exists.
  const patientIds = await linkedPatientIds(session.patientId)
  if (!row || !patientIds.includes(row.patientId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const buf = await readStored(CERT_DIR, row.filePath)
  if (!buf) return NextResponse.json({ error: 'File missing on disk' }, { status: 404 })

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      // inline: families open these to look at and print, not to file away.
      'Content-Disposition': 'inline; filename="discharge-certificate.pdf"',
      'Cache-Control': 'private, no-store',
    },
  })
}
