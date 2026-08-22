// POST /api/public/patients/home-progress/[entryId]/file
// Multipart upload of ONE media file (voice / video / photo) onto an existing
// Home Progress entry. One file per request keeps each request under the
// client-portal's nginx limit and lets the client show per-file progress.
// Form fields: token, kind (AUDIO|VIDEO|PHOTO), file.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'
import { compressMedia } from '@/lib/media-compress'
import { preflight, withCors } from '../../../../_cors'
import path from 'path'
import fs from 'fs/promises'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

const MAX_BYTES = 18 * 1024 * 1024 // fits under the 25 MB client-portal nginx cap

function extFor(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('webm')) return '.webm'
  if (m.includes('mp4')) return '.mp4'
  if (m.includes('quicktime')) return '.mov'
  if (m.includes('mpeg') || m.includes('mp3')) return '.mp3'
  if (m.includes('ogg')) return '.ogg'
  if (m.includes('wav')) return '.wav'
  if (m.includes('m4a') || m.includes('aac') || m.includes('mp4a')) return '.m4a'
  if (m.includes('png')) return '.png'
  if (m.includes('webp')) return '.webp'
  if (m.includes('heic') || m.includes('heif')) return '.heic'
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg'
  return ''
}

function kindFor(mime: string, given?: string): string {
  const g = (given ?? '').toUpperCase()
  if (g === 'AUDIO' || g === 'VIDEO' || g === 'PHOTO') return g
  const m = mime.toLowerCase()
  if (m.startsWith('audio/')) return 'AUDIO'
  if (m.startsWith('video/')) return 'VIDEO'
  if (m.startsWith('image/')) return 'PHOTO'
  return 'OTHER'
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const origin = req.headers.get('origin')
  const { entryId } = await params

  let form: FormData
  try { form = await req.formData() } catch {
    return withCors(NextResponse.json({ error: 'Failed to parse upload' }, { status: 400 }), origin)
  }

  const token = String(form.get('token') ?? '')
  const session = verifyPatientToken(token)
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  // The entry must belong to this person (any of their interbranch records).
  const ids = await linkedPatientIds(session.patientId)
  const entry = await prisma.homeProgressEntry.findUnique({
    where: { id: entryId },
    select: { id: true, patientId: true },
  })
  if (!entry || !ids.includes(entry.patientId)) {
    return withCors(NextResponse.json({ error: 'Entry not found' }, { status: 404 }), origin)
  }

  const file = form.get('file') as File | null
  if (!file || file.size === 0) {
    return withCors(NextResponse.json({ error: 'No file provided' }, { status: 400 }), origin)
  }
  if (file.size > MAX_BYTES) {
    return withCors(NextResponse.json({ error: 'File too large (max 18 MB per file)' }, { status: 413 }), origin)
  }

  const mime = file.type || 'application/octet-stream'
  const kind = kindFor(mime, String(form.get('kind') ?? ''))
  if (kind === 'OTHER') {
    return withCors(NextResponse.json({ error: 'Only audio, video or image files are allowed.' }, { status: 400 }), origin)
  }

  const srcExt = extFor(mime) || path.extname(file.name || '') || ''
  const original = Buffer.from(await file.arrayBuffer())
  // Shrink before storing — photos via sharp, audio/video via ffmpeg. Falls back
  // to the original bytes if compression can't help, so uploads never fail here.
  const compressed = await compressMedia(original, kind, mime, srcExt)

  const ext = compressed.ext || srcExt
  const filename = `hp-${entryId}-${kind}-${Date.now()}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '')
  const uploadDir = path.join(process.cwd(), 'uploads', 'home-progress')
  await fs.mkdir(uploadDir, { recursive: true })
  await fs.writeFile(path.join(uploadDir, filename), compressed.buffer)

  const saved = await prisma.homeProgressFile.create({
    data: {
      entryId,
      kind,
      fileName: (file.name || filename).slice(0, 200),
      filePath: path.join('home-progress', filename),
      mimeType: compressed.mime,
      sizeBytes: compressed.buffer.length,
    },
    select: { id: true, kind: true, fileName: true, mimeType: true, sizeBytes: true },
  })

  return withCors(NextResponse.json({ ok: true, file: saved }), origin)
}
