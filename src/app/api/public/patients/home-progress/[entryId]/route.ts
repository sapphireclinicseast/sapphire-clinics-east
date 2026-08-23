// DELETE /api/public/patients/home-progress/[entryId]?token=…
// Removes a Home Progress entry the patient owns, including its media files on
// disk. Cascade also removes the HomeProgressFile rows.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'
import { preflight, withCors } from '../../../_cors'
import path from 'path'
import fs from 'fs/promises'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const origin = req.headers.get('origin')
  const { entryId } = await params
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const session = verifyPatientToken(token)
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const ids = await linkedPatientIds(session.patientId)
  const entry = await prisma.homeProgressEntry.findUnique({
    where: { id: entryId },
    select: { id: true, patientId: true, files: { select: { filePath: true } } },
  })
  if (!entry || !ids.includes(entry.patientId)) {
    return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)
  }

  // Best-effort remove the files from disk, then delete the entry (cascade).
  for (const f of entry.files) {
    await fs.unlink(path.join(process.cwd(), 'uploads', f.filePath)).catch(() => {})
  }
  await prisma.homeProgressEntry.delete({ where: { id: entryId } })

  return withCors(NextResponse.json({ ok: true }), origin)
}
