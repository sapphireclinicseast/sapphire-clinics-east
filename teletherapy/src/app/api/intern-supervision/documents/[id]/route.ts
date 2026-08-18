/**
 * Remove an internship document (the uploader or an admin only).
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  // @ts-ignore — internshipDocument
  const doc = await prisma.internshipDocument.findUnique({ where: { id } })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && doc.uploadedByAccountId !== session.user.id) {
    return NextResponse.json({ error: 'Only the uploader or an admin can remove this.' }, { status: 403 })
  }

  try { await unlink(path.join(UPLOAD_DIR, doc.filePath)) } catch { /* file already gone */ }
  // @ts-ignore — internshipDocument
  await prisma.internshipDocument.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
