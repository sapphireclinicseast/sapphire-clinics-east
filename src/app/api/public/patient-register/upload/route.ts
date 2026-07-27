// POST /api/public/patient-register/upload
// No auth required. Allows a just-registered patient to upload their referral or PWD ID.
// Security: patient must exist and have been created within the last 15 minutes.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import path from 'path'
import fs from 'fs/promises'

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
])
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB
const MAX_AGE_MS = 15 * 60 * 1000  // 15 minutes — prevents uploading to arbitrary existing patients

export async function POST(req: NextRequest) {
  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'Failed to parse upload' }, { status: 400 })
  }

  const patientId = form.get('patientId') as string | null
  const docType   = form.get('docType')   as string | null  // 'referral' | 'pwd-id'
  const file      = form.get('file')      as File   | null

  if (!patientId || !docType || !file || file.size === 0)
    return NextResponse.json({ error: 'patientId, docType, and file are required' }, { status: 400 })

  if (!['referral', 'pwd-id'].includes(docType))
    return NextResponse.json({ error: 'docType must be referral or pwd-id' }, { status: 400 })

  // Verify patient exists and was created within the last 15 minutes
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, referralUrl: true, pwdIdUrl: true, createdAt: true },
  })
  if (!patient)
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  if (Date.now() - patient.createdAt.getTime() > MAX_AGE_MS)
    return NextResponse.json({ error: 'Upload window has expired. Please ask front desk for assistance.' }, { status: 403 })

  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 })

  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME.has(mime))
    return NextResponse.json({ error: 'Unsupported file type. Use JPEG, PNG, WebP, or PDF.' }, { status: 400 })

  const ext = mime === 'application/pdf' ? '.pdf'
    : mime === 'image/png' ? '.png'
    : mime === 'image/webp' ? '.webp'
    : '.jpg'

  const prefix   = docType === 'referral' ? 'referral' : 'pwdid'
  const filename  = `${prefix}-${patientId}-${Date.now()}${ext}`
  const uploadDir = path.join(process.cwd(), 'uploads')

  try { await fs.mkdir(uploadDir, { recursive: true }) } catch { /* exists */ }
  await fs.writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()))

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://marketing.sapphireclinicseast.org'
  const fileUrl = `${baseUrl}/api/uploads/${filename}`

  if (docType === 'referral') {
    // Remove old file if replacing
    if (patient.referralUrl) {
      const old = patient.referralUrl.split('/api/uploads/')[1]
      if (old) await fs.unlink(path.join(uploadDir, old)).catch(() => {})
    }
    await prisma.patient.update({ where: { id: patientId }, data: { referralUrl: fileUrl } })
  } else {
    if (patient.pwdIdUrl) {
      const old = patient.pwdIdUrl.split('/api/uploads/')[1]
      if (old) await fs.unlink(path.join(uploadDir, old)).catch(() => {})
    }
    await prisma.patient.update({ where: { id: patientId }, data: { pwdIdUrl: fileUrl } })
  }

  return NextResponse.json({ ok: true })
}
