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

  const total = buf.length
  const contentType = file.mimeType || 'application/octet-stream'
  const disposition = `inline; filename="${(file.fileName || 'file').replace(/"/g, '')}"`

  // Honour HTTP Range requests so <audio>/<video> can stream and seek. Safari
  // and iOS refuse to play media unless the server answers a Range request with
  // 206 Partial Content; Chrome/Firefox rely on it for seeking.
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
