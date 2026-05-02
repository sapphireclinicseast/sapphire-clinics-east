/**
 * GET /api/internal/file?documentId={id}
 *
 * Serves a patient document file to the accounting hub.
 * Auth: Authorization: Bearer {INTERNAL_API_KEY}
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

const MIME_MAP: Record<string, string> = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

function verifyKey(req: NextRequest): boolean {
  const key = process.env.INTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const documentId = req.nextUrl.searchParams.get('documentId')
  if (!documentId) {
    return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
  }

  try {
    const doc = await prisma.patientDocument.findUnique({
      where: { id: documentId },
      select: {
        filePath: true,
        fileName: true,
        mimeType: true,
        documentType: true,
      },
    })
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // filePath is relative, e.g. "patient-docs/{patientId}/timestamp-rand.pdf"
    const absPath = path.resolve(path.join(UPLOAD_DIR, doc.filePath))
    const uploadRoot = path.resolve(UPLOAD_DIR)

    // Prevent path traversal
    if (!absPath.startsWith(uploadRoot)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!existsSync(absPath)) {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
    }

    const ext = path.extname(absPath).slice(1).toLowerCase()
    const contentType = MIME_MAP[ext] ?? doc.mimeType ?? 'application/octet-stream'
    const buffer = await readFile(absPath)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.fileName)}"`,
        'Cache-Control': 'private, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    console.error('[internal/file] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
