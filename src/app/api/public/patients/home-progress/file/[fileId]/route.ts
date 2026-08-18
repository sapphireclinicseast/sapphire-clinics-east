// GET /api/public/patients/home-progress/file/[fileId]?token=…
// Streams a Home Progress media file (audio/video/photo) for playback/preview,
// after verifying the patient token and that the file belongs to the person
// (any of their interbranch records).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'
import path from 'path'
import fs from 'fs/promises'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const session = verifyPatientToken(token)
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const file = await prisma.homeProgressFile.findUnique({
    where: { id: fileId },
    select: { filePath: true, mimeType: true, fileName: true, entry: { select: { patientId: true } } },
  })
  const ids = await linkedPatientIds(session.patientId)
  if (!file || !file.entry || !ids.includes(file.entry.patientId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const filePath = path.join(process.cwd(), 'uploads', file.filePath)
  let buf: Buffer
  try {
    buf = await fs.readFile(filePath)
  } catch {
    return NextResponse.json({ error: 'File missing on disk' }, { status: 404 })
  }

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': file.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${(file.fileName || 'file').replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
