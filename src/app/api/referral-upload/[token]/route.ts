// Public endpoint — no auth required (access controlled via one-time token)
// GET  → verify token, return patient first name
// POST → accept file upload, update patient referralUrl, mark token used

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import path from 'path'
import fs from 'fs/promises'

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
])
const MAX_BYTES = 20 * 1024 * 1024

async function resolveToken(token: string) {
  const record = await prisma.referralUploadToken.findUnique({
    where: { token },
    include: { patient: { select: { id: true, firstName: true, referralUrl: true } } },
  })
  if (!record) return { error: 'Invalid or expired link', status: 404 }
  if (record.used) return { error: 'This link has already been used', status: 410 }
  if (record.expiresAt < new Date()) return { error: 'This link has expired. Please ask the front desk to generate a new QR code.', status: 410 }
  return { record }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const result = await resolveToken(token)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({
    firstName: result.record.patient.firstName,
    hasExisting: !!result.record.patient.referralUrl,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const result = await resolveToken(token)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const { record } = result
  const patientId = record.patient.id

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
    return NextResponse.json({ error: 'Unsupported file type. Please use JPEG, PNG, or PDF.' }, { status: 400 })

  const ext = mime === 'application/pdf' ? '.pdf'
    : mime === 'image/png' ? '.png'
    : mime === 'image/webp' ? '.webp'
    : '.jpg'

  const filename = `referral-${patientId}-${Date.now()}${ext}`
  const uploadDir = path.join(process.cwd(), 'uploads')
  await fs.mkdir(uploadDir, { recursive: true })
  await fs.writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()))

  // Remove old referral file if local
  if (record.patient.referralUrl) {
    const oldFile = record.patient.referralUrl.split('/api/uploads/')[1]
    if (oldFile) await fs.unlink(path.join(uploadDir, oldFile)).catch(() => {})
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://operations.sapphireclinicseast.org'
  const referralUrl = `${baseUrl}/api/uploads/${filename}`

  await prisma.$transaction([
    prisma.patient.update({ where: { id: patientId }, data: { referralUrl } }),
    prisma.referralUploadToken.update({ where: { id: record.id }, data: { used: true } }),
  ])

  return NextResponse.json({ ok: true, referralUrl })
}
