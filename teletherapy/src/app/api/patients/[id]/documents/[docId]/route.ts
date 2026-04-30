import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

// DELETE — remove a document (uploader or admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { docId } = await params
  const isAdmin = session.user.role === 'ADMIN'

  // @ts-ignore
  const doc = await prisma.patientDocument.findUnique({ where: { id: docId } })
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Get the current clinician's department; allow delete if same department or admin
  const currentAccount = !isAdmin ? await prisma.therapistAccount.findUnique({
    where: { id: session.user.id },
    include: { staff: { select: { department: true } } },
  }) : null
  const currentDepartment = currentAccount?.staff?.department ?? null

  if (!isAdmin && currentDepartment !== doc.department) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Try to delete file from disk (best effort)
  try {
    await unlink(path.join(UPLOAD_DIR, doc.filePath))
  } catch {}

  // @ts-ignore
  await prisma.patientDocument.delete({ where: { id: docId } })

  return NextResponse.json({ success: true })
}
