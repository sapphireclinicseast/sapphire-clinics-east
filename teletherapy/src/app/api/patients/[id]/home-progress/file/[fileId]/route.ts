// GET /api/patients/[id]/home-progress/file/[fileId]
// Streams a patient's Home Progress media file (video/audio/photo) for the
// assigned therapist to play/preview. The files are written by the Operations
// Hub into its uploads dir, which is the host path /opt/sapphire/uploads
// (bind-mounted into the Ops Hub container). This staff app runs on the same
// host, so it reads them directly — no cross-app call. Honours HTTP Range so
// <video>/<audio> can seek (Safari/iOS refuse to play without a 206).

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import path from 'path'
import fs from 'fs/promises'

// Where the Operations Hub stores uploads on the host (bind-mounted to
// /app/uploads inside its container). Overridable for other environments.
const OPS_UPLOADS_DIR = process.env.OPS_UPLOADS_DIR || '/opt/sapphire/uploads'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, fileId } = await params

  const file = await prisma.homeProgressFile.findUnique({
    where: { id: fileId },
    select: { filePath: true, mimeType: true, fileName: true, entry: { select: { patientId: true } } },
  })
  // The file must belong to THIS patient — stops one patient's id in the URL
  // being paired with another patient's fileId.
  if (!file || !file.entry || file.entry.patientId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Guard against path traversal in the stored relative path — the resolved
  // path must stay inside the uploads dir.
  const safeRel = path.normalize(file.filePath).replace(/^(\.\.[/\\])+/, '')
  const base = path.resolve(OPS_UPLOADS_DIR)
  const filePath = path.resolve(base, safeRel)
  if (filePath !== base && !filePath.startsWith(base + path.sep)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let buf: Buffer
  try {
    buf = await fs.readFile(filePath)
  } catch {
    return NextResponse.json({ error: 'File missing on disk' }, { status: 404 })
  }

  const total = buf.length
  const contentType = file.mimeType || 'application/octet-stream'
  const disposition = `inline; filename="${(file.fileName || 'file').replace(/"/g, '')}"`

  const range = req.headers.get('range')
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (m && (m[1] !== '' || m[2] !== '')) {
    let start = m[1] === '' ? NaN : parseInt(m[1], 10)
    let end = m[2] === '' ? NaN : parseInt(m[2], 10)
    if (Number.isNaN(start)) { start = total - end; end = total - 1 }      // suffix range: bytes=-N
    else if (Number.isNaN(end)) { end = total - 1 }                        // open-ended: bytes=N-
    if (start > end || start < 0 || start >= total) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' },
      })
    }
    end = Math.min(end, total - 1)
    const chunk = buf.subarray(start, end + 1)
    return new NextResponse(chunk as unknown as BodyInit, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': String(chunk.length),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=300',
      },
    })
  }

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
