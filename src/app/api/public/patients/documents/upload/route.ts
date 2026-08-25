// POST /api/public/patients/documents/upload
// Authenticated (patient token) upload/replace of the signed-in patient's
// Doctor's Referral or PWD/Senior ID. Saves the file and points
// Patient.referralUrl / pwdIdUrl at it on EVERY interbranch record, so the
// document also appears in the Operations Hub Patient CRM (which reads those
// fields) regardless of which branch record the front desk opens.
// Form fields: token, docType (referral|pwd-id), file.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'
import { preflight, withCors } from '../../../_cors'
import path from 'path'
import fs from 'fs/promises'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
])
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB (fits under the 25 MB client-portal nginx cap)

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')

  let form: FormData
  try { form = await req.formData() } catch {
    return withCors(NextResponse.json({ error: 'Failed to parse upload' }, { status: 400 }), origin)
  }

  const token = String(form.get('token') ?? '')
  const session = verifyPatientToken(token)
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const docType = String(form.get('docType') ?? '')
  if (docType !== 'referral' && docType !== 'pwd-id') {
    return withCors(NextResponse.json({ error: 'docType must be referral or pwd-id' }, { status: 400 }), origin)
  }

  const file = form.get('file') as File | null
  if (!file || file.size === 0) {
    return withCors(NextResponse.json({ error: 'No file provided' }, { status: 400 }), origin)
  }
  if (file.size > MAX_BYTES) {
    return withCors(NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 }), origin)
  }

  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME.has(mime)) {
    return withCors(NextResponse.json({ error: 'Unsupported file type. Use JPEG, PNG, WebP, or PDF.' }, { status: 400 }), origin)
  }

  const ext = mime === 'application/pdf' ? '.pdf'
    : mime === 'image/png' ? '.png'
    : mime === 'image/webp' ? '.webp'
    : mime === 'image/heic' || mime === 'image/heif' ? '.heic'
    : '.jpg'

  const prefix = docType === 'referral' ? 'referral' : 'pwdid'
  const filename = `${prefix}-${session.patientId}-${Date.now()}${ext}`
  const uploadDir = path.join(process.cwd(), 'uploads')
  await fs.mkdir(uploadDir, { recursive: true }).catch(() => {})
  await fs.writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()))

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://marketing.sapphireclinicseast.org'
  const fileUrl = `${baseUrl}/api/uploads/${filename}`

  // Point every interbranch record's field at the new file.
  const ids = await linkedPatientIds(session.patientId)
  const existing = await prisma.patient.findMany({
    where: { id: { in: ids } },
    select: { referralUrl: true, pwdIdUrl: true },
  })
  // Best-effort remove the previous file(s) being replaced.
  const oldUrls = new Set<string>()
  for (const p of existing) {
    const v = docType === 'referral' ? p.referralUrl : p.pwdIdUrl
    if (v) oldUrls.add(v)
  }
  for (const url of oldUrls) {
    const old = url.split('/api/uploads/')[1]
    if (old && old !== filename) await fs.unlink(path.join(uploadDir, old)).catch(() => {})
  }
  await prisma.patient.updateMany({
    where: { id: { in: ids } },
    data: docType === 'referral' ? { referralUrl: fileUrl } : { pwdIdUrl: fileUrl },
  })

  return withCors(NextResponse.json({ ok: true, url: fileUrl }), origin)
}
