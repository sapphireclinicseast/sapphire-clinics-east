// GET    /api/patients/[id]/pwd-id  → return pwdIdUrl
// POST   /api/patients/[id]/pwd-id  → upload a PWD ID photo
// DELETE /api/patients/[id]/pwd-id  → remove PWD ID photo

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import path from 'path'
import fs from 'fs/promises'

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
])
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { pwdIdUrl: true },
  })
  if (!patient) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ pwdIdUrl: patient.pwdIdUrl })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const patient = await prisma.patient.findUnique({ where: { id }, select: { id: true, pwdIdUrl: true } })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'Failed to parse upload' }, { status: 400 })
  }

  const file = form.get('file') as File | null
  if (!file || file.size === 0)
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 })

  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME.has(mime))
    return NextResponse.json({ error: 'Unsupported file type. Use JPEG, PNG, WebP, or PDF.' }, { status: 400 })

  const ext = mime === 'application/pdf' ? '.pdf'
    : mime === 'image/png' ? '.png'
    : mime === 'image/webp' ? '.webp'
    : '.jpg'

  const filename = `pwdid-${id}-${Date.now()}${ext}`
  const uploadDir = path.join(process.cwd(), 'uploads')
  try {
    await fs.mkdir(uploadDir, { recursive: true })
  } catch (mkErr) {
    const code = (mkErr as NodeJS.ErrnoException).code
    if (code !== 'EEXIST') {
      return NextResponse.json({ error: `Cannot create uploads dir (${code}).` }, { status: 500 })
    }
  }
  const filepath = path.join(uploadDir, filename)
  try {
    await fs.writeFile(filepath, Buffer.from(await file.arrayBuffer()))
  } catch (wErr) {
    const code = (wErr as NodeJS.ErrnoException).code
    const msg = (wErr as Error).message
    return NextResponse.json({ error: `Failed to save file (${code}): ${msg}` }, { status: 500 })
  }

  // Delete old PWD ID file from disk if it was a local upload
  if (patient.pwdIdUrl) {
    const oldFile = patient.pwdIdUrl.split('/api/uploads/')[1]
    if (oldFile) {
      await fs.unlink(path.join(uploadDir, oldFile)).catch(() => {})
    }
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://marketing.sapphireclinicseast.org'
  const pwdIdUrl = `${baseUrl}/api/uploads/${filename}`

  await prisma.patient.update({ where: { id }, data: { pwdIdUrl } })

  return NextResponse.json({ pwdIdUrl })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const patient = await prisma.patient.findUnique({ where: { id }, select: { pwdIdUrl: true } })
  if (!patient) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (patient.pwdIdUrl) {
    const oldFile = patient.pwdIdUrl.split('/api/uploads/')[1]
    if (oldFile) {
      await fs.unlink(path.join(process.cwd(), 'uploads', oldFile)).catch(() => {})
    }
  }

  await prisma.patient.update({ where: { id }, data: { pwdIdUrl: null } })
  return NextResponse.json({ ok: true })
}
