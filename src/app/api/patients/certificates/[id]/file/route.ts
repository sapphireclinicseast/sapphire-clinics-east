// GET /api/patients/certificates/[id]/file — the stored PDF, for staff.
//
// Served through here rather than from uploads/: /api/uploads/[filename] is
// public, which is exactly why these files live in a subdirectory it cannot
// reach. See lib/certificate-files.ts.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CERT_DIR, readStored } from '@/lib/certificate-files'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const row = await prisma.dischargeCertificate.findUnique({
    where: { id }, select: { filePath: true, patientName: true },
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const buf = await readStored(CERT_DIR, row.filePath)
  if (!buf) return NextResponse.json({ error: 'File missing on disk' }, { status: 404 })

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      // inline: this is opened to look at and print, not filed away.
      'Content-Disposition': 'inline; filename="discharge-certificate.pdf"',
      'Cache-Control': 'private, no-store',
    },
  })
}
