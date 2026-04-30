import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const TELE_UPLOAD_DIR =
  process.env.TELETHERAPY_UPLOAD_DIR ||
  '/var/www/sapphireclinicseast.org/teletherapy/uploads'

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

// Streams a PR file from the teletherapy uploads dir to authenticated
// marketing-hub users (front desk + admin). Used to View / Download
// progress reports without round-tripping through teletherapy auth.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { docId } = await params

  // @ts-ignore
  const doc = await prisma.patientDocument.findUnique({
    where: { id: docId },
    select: { documentType: true, filePath: true, mimeType: true, fileName: true },
  })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const fullPath = path.join(TELE_UPLOAD_DIR, doc.filePath)
  const resolved = path.resolve(fullPath)
  const root = path.resolve(TELE_UPLOAD_DIR)
  if (!resolved.startsWith(root)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!existsSync(resolved)) {
    return NextResponse.json({ error: 'File missing' }, { status: 404 })
  }

  const ext = path.extname(resolved).slice(1).toLowerCase()
  const contentType = doc.mimeType || MIME_MAP[ext] || 'application/octet-stream'
  const buffer = await readFile(resolved)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${doc.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
