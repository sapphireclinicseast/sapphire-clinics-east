// GET /api/public/patients/documents/[id]/file?token=…
// Serves a patient's own clinical document file (read-only). Verifies the
// patient token AND that the document belongs to that patient before streaming
// it from the shared teletherapy uploads volume.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import path from 'path'
import fs from 'fs/promises'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const session = verifyPatientToken(token)
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const doc = await prisma.patientDocument.findUnique({
    where: { id },
    select: { patientId: true, filePath: true, mimeType: true, fileName: true },
  })
  if (!doc || doc.patientId !== session.patientId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const filePath = path.join('/app/teletherapy-uploads', doc.filePath)
  let buf: Buffer
  try {
    buf = await fs.readFile(filePath)
  } catch {
    return NextResponse.json({ error: 'File missing on disk' }, { status: 404 })
  }

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': doc.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${(doc.fileName || 'document').replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
