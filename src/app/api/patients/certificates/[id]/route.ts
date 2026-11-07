// DELETE /api/patients/certificates/[id] — remove an issued certificate.

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CERT_DIR, isSafeStoredName } from '@/lib/certificate-files'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const row = await prisma.dischargeCertificate.findUnique({
    where: { id }, select: { filePath: true },
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Row first: an orphaned file on disk is harmless, a row pointing at a file
  // that is gone shows up as a broken certificate.
  await prisma.dischargeCertificate.delete({ where: { id } })
  if (isSafeStoredName(row.filePath)) {
    await fs.unlink(path.join(CERT_DIR, row.filePath)).catch(() => {})
  }
  return NextResponse.json({ ok: true })
}
