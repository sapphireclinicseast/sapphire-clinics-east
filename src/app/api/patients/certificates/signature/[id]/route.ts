// A signatory's e-signature image: upload, fetch, remove.
//
//   POST   /api/patients/certificates/signature/[id]   multipart, field "signature"
//   GET    /api/patients/certificates/signature/[id]   the image, for the preview
//   DELETE /api/patients/certificates/signature/[id]

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SIG_DIR, ensureCertDirs, readStored, isSafeStoredName } from '@/lib/certificate-files'

// PNG first in the UI copy because a transparent signature sits on the rule
// properly; a JPEG brings its white box with it.
const ALLOWED: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
}
// Stamped at roughly 155x34pt, so anything past a couple of megabytes is a
// scan nobody needed at that size.
const MAX_BYTES = 2 * 1024 * 1024

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const sig = await prisma.certificateSignatory.findUnique({ where: { id } })
  if (!sig) return NextResponse.json({ error: 'Signatory not found' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('signature')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No image uploaded' }, { status: 400 })
  }
  const ext = ALLOWED[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Signatures must be a PNG or JPEG image' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Signature must be under 2 MB' }, { status: 400 })
  }

  await ensureCertDirs()
  const filename = `sig-${id}-${Date.now()}${ext}`
  await fs.writeFile(path.join(SIG_DIR, filename), Buffer.from(await file.arrayBuffer()))

  // Replacing: drop the previous image rather than orphaning it.
  if (sig.signaturePath && isSafeStoredName(sig.signaturePath)) {
    await fs.unlink(path.join(SIG_DIR, sig.signaturePath)).catch(() => {})
  }
  await prisma.certificateSignatory.update({
    where: { id }, data: { signaturePath: filename },
  })

  return NextResponse.json({ ok: true })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const sig = await prisma.certificateSignatory.findUnique({
    where: { id }, select: { signaturePath: true },
  })
  const buf = await readStored(SIG_DIR, sig?.signaturePath)
  if (!buf) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': sig!.signaturePath!.endsWith('.png') ? 'image/png' : 'image/jpeg',
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const sig = await prisma.certificateSignatory.findUnique({ where: { id } })
  if (!sig) return NextResponse.json({ error: 'Signatory not found' }, { status: 404 })

  if (sig.signaturePath && isSafeStoredName(sig.signaturePath)) {
    await fs.unlink(path.join(SIG_DIR, sig.signaturePath)).catch(() => {})
  }
  await prisma.certificateSignatory.update({
    where: { id }, data: { signaturePath: null },
  })
  return NextResponse.json({ ok: true })
}
