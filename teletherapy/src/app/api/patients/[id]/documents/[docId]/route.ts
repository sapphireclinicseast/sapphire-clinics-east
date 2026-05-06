import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

// DELETE — remove a document (uploader or admin only)
//
// Authorization rules (mirrors the GET route's canEdit computation):
//   - Admin can always delete.
//   - Otherwise: the requester must be the original uploader AND
//     currently be the ACTIVE owner of the patient AND the document
//     must not be locked. This is what makes Eloisa's old IE/PR
//     uploads view-only for Caitlynn (different uploader) and also
//     view-only for Eloisa herself if she's been endorsed away
//     (lockedAt is set, and she's no longer ACTIVE).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: patientId, docId } = await params
  const isAdmin = session.user.role === 'ADMIN'

  // @ts-ignore
  const doc = await prisma.patientDocument.findUnique({ where: { id: docId } })
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (!isAdmin) {
    // Must be the original uploader.
    if (doc.uploadedById !== session.user.id) {
      return NextResponse.json(
        { error: 'Only the original uploader can delete this document.' },
        { status: 403 },
      )
    }
    // Must currently be the ACTIVE owner of the patient.
    const active = await prisma.patientAssignment.findFirst({
      where: { patientId, therapistAccountId: session.user.id, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!active) {
      return NextResponse.json(
        { error: 'You no longer have active access to this patient.' },
        { status: 403 },
      )
    }
    // Must not be locked. Lock happens at endorsement / discharge and
    // is permanent — even if the uploader is endorsed BACK to the
    // patient later, historical uploads stay frozen.
    if (doc.lockedAt) {
      return NextResponse.json(
        { error: 'This document is locked and cannot be modified.' },
        { status: 403 },
      )
    }
  }

  // Try to delete file from disk (best effort)
  try {
    await unlink(path.join(UPLOAD_DIR, doc.filePath))
  } catch {}

  // @ts-ignore
  await prisma.patientDocument.delete({ where: { id: docId } })

  return NextResponse.json({ success: true })
}
