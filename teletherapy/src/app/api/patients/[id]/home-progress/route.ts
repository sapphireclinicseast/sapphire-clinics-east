// GET /api/patients/[id]/home-progress
// Lists the videos / audio / photos a patient uploaded from the client portal
// (their "Home Progress" log), for the assigned therapist to review. Metadata
// only — the bytes are streamed by the sibling file/[fileId] route. Read-only:
// these entries are owned/created on the Operations Hub side.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const entries = await prisma.homeProgressEntry.findMany({
    where: { patientId: id },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      date: true,
      remarks: true,
      createdAt: true,
      files: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, kind: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
      },
    },
  })

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      remarks: e.remarks,
      createdAt: e.createdAt.toISOString(),
      files: e.files.map((f) => ({
        id: f.id,
        kind: f.kind,
        fileName: f.fileName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        createdAt: f.createdAt.toISOString(),
      })),
    })),
  })
}
