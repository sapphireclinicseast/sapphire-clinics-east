// POST /api/public/ugat/uploads   (scholar Bearer token)
// Body: { kind, filename, mimeType, dataBase64 }
// Stores a binary upload for the signed-in scholar, replacing any existing
// upload of the same kind (one photo, one letter, one grades-per-year, etc.).

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

const KINDS = new Set([
  'PHOTO', 'LETTER', 'GRADES_Y1', 'GRADES_Y2', 'GRADES_Y3', 'SIGNATURE',
  'TOR', 'GRAD_PROOF',
  'VALID_ID_1', 'VALID_ID_2', 'COMAKER_ID_1', 'COMAKER_ID_2', 'RSA_SIGNATURE',
])
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB
const ALLOWED_MIME: Record<string, RegExp> = {
  PHOTO: /^image\/(jpe?g|png|webp)$/,
  SIGNATURE: /^image\/(png|jpe?g)$/,
  LETTER: /^application\/pdf$/,
  GRADES_Y1: /^(image\/(jpe?g|png)|application\/pdf)$/,
  GRADES_Y2: /^(image\/(jpe?g|png)|application\/pdf)$/,
  GRADES_Y3: /^(image\/(jpe?g|png)|application\/pdf)$/,
  VALID_ID_1: /^(image\/(jpe?g|png)|application\/pdf)$/,
  VALID_ID_2: /^(image\/(jpe?g|png)|application\/pdf)$/,
  COMAKER_ID_1: /^(image\/(jpe?g|png)|application\/pdf)$/,
  COMAKER_ID_2: /^(image\/(jpe?g|png)|application\/pdf)$/,
  RSA_SIGNATURE: /^image\/(png|jpe?g)$/,
  TOR: /^(image\/(jpe?g|png)|application\/pdf)$/,
  GRAD_PROOF: /^(image\/(jpe?g|png)|application\/pdf)$/,
}

export async function POST(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || tok.role !== 'SCHOLAR' || !tok.scholarId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }
  let body: { kind?: string; filename?: string; mimeType?: string; dataBase64?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const kind = String(body.kind || '')
  const mimeType = String(body.mimeType || '')
  const filename = String(body.filename || 'upload').slice(0, 200)
  const b64 = String(body.dataBase64 || '').replace(/^data:[^;]+;base64,/, '')

  if (!KINDS.has(kind)) return NextResponse.json({ error: 'Invalid upload type.' }, { status: 400 })
  const rule = ALLOWED_MIME[kind]
  if (rule && !rule.test(mimeType)) {
    return NextResponse.json({ error: 'That file type is not accepted for this upload.' }, { status: 400 })
  }
  let data: Buffer
  try {
    data = Buffer.from(b64, 'base64')
  } catch {
    return NextResponse.json({ error: 'Could not read the file.' }, { status: 400 })
  }
  if (data.length === 0) return NextResponse.json({ error: 'Empty file.' }, { status: 400 })
  if (data.length > MAX_BYTES) return NextResponse.json({ error: 'File is too large (max 15 MB).' }, { status: 413 })

  // Replace any prior upload of this kind for this scholar.
  await prisma.ugatUpload.deleteMany({ where: { scholarId: tok.scholarId, kind } })
  const created = await prisma.ugatUpload.create({
    data: { scholarId: tok.scholarId, kind, filename, mimeType, data },
    select: { id: true },
  })
  return NextResponse.json({ id: created.id })
}
