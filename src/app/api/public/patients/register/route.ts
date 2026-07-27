// POST /api/public/patients/register — patient self-registration.
// Accepts the same field set as the marketing CRM's Add Patient form so
// the record lands cleanly in Patient CRM.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { issuePatientToken } from '@/lib/patient-session'
import { hashPassword, validatePassword } from '@/lib/patient-password'
import { preflight, withCors } from '../../_cors'
import path from 'path'
import fs from 'fs/promises'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

// A file the patient optionally attaches at sign-up (Doctor's Referral or
// PWD/Senior ID). Sent as a base64 data URL so it rides along in the JSON the
// client-portal proxy already forwards.
type UploadInput = { name?: string; dataUrl?: string }

type Body = {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  dob?: string              // "YYYY-MM-DD"
  sex?: string              // "Male" | "Female" | free text
  address?: string          // barangay / street
  city?: string
  civilStatus?: string
  religion?: string
  nationality?: string
  diagnosis?: string
  pwdSeniorId?: string
  password?: string         // optional: create a portal login account
  branch?: 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS'
  patientType?: 'PEDIATRIC' | 'ADULT'
  referralFile?: UploadInput  // optional Doctor's Referral
  pwdIdFile?: UploadInput     // optional PWD / Senior ID
}

function uc(v: string | undefined): string | null {
  if (v == null) return null
  const s = v.trim()
  return s.length > 0 ? s.toUpperCase() : null
}

// Same storage convention as /api/referral-upload/[token]: files land in
// ./uploads and are served back over /api/uploads/<filename>, which the
// Operations Hub Patient CRM already links to (referralUrl / pwdIdUrl).
const UPLOAD_ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
])
const UPLOAD_MAX_BYTES = 12 * 1024 * 1024 // decoded size cap

function extForMime(mime: string): string {
  return mime === 'application/pdf' ? '.pdf'
    : mime === 'image/png' ? '.png'
    : mime === 'image/webp' ? '.webp'
    : mime === 'image/heic' || mime === 'image/heif' ? '.heic'
    : '.jpg'
}

// Decode a base64 data URL and write it under ./uploads, returning the public
// URL — or null if absent/invalid (uploads are optional, so we never fail the
// registration over a bad attachment).
async function saveUpload(
  patientId: string,
  kind: 'referral' | 'pwdid',
  input: UploadInput | undefined,
): Promise<string | null> {
  const dataUrl = input?.dataUrl
  if (!dataUrl) return null
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
  if (!m) return null
  const mime = m[1].toLowerCase()
  if (!UPLOAD_ALLOWED_MIME.has(mime)) return null
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length === 0 || buf.length > UPLOAD_MAX_BYTES) return null

  const filename = `${kind}-${patientId}-${Date.now()}${extForMime(mime)}`
  const uploadDir = path.join(process.cwd(), 'uploads')
  await fs.mkdir(uploadDir, { recursive: true })
  await fs.writeFile(path.join(uploadDir, filename), buf)

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://marketing.sapphireclinicseast.org'
  return `${baseUrl}/api/uploads/${filename}`
}

// Persist any attached files onto the patient record. Only overwrites a URL
// when a new file was actually provided (so returning patients keep prior docs).
async function applyUploads(patientId: string, body: Body): Promise<void> {
  const [referralUrl, pwdIdUrl] = await Promise.all([
    saveUpload(patientId, 'referral', body.referralFile),
    saveUpload(patientId, 'pwdid', body.pwdIdFile),
  ])
  const data: { referralUrl?: string; pwdIdUrl?: string } = {}
  if (referralUrl) data.referralUrl = referralUrl
  if (pwdIdUrl) data.pwdIdUrl = pwdIdUrl
  if (Object.keys(data).length > 0) {
    await prisma.patient.update({ where: { id: patientId }, data })
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = (await req.json().catch(() => ({}))) as Body

  const firstName = (body.firstName ?? '').trim()
  const lastName = (body.lastName ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const branch = body.branch
  const patientType = body.patientType

  if (!firstName || !lastName || !email || !branch || !patientType) {
    return withCors(
      NextResponse.json(
        { error: 'firstName, lastName, email, branch, patientType are required' },
        { status: 400 },
      ),
      origin,
    )
  }
  if (branch !== 'SANDBOX_EAST' && branch !== 'SANDBOX_GREENHILLS') {
    return withCors(NextResponse.json({ error: 'invalid branch' }, { status: 400 }), origin)
  }
  if (patientType !== 'PEDIATRIC' && patientType !== 'ADULT') {
    return withCors(NextResponse.json({ error: 'invalid patientType' }, { status: 400 }), origin)
  }

  // Optional portal account: validate the password up front if one was supplied.
  const wantsAccount = typeof body.password === 'string' && body.password.length > 0
  if (wantsAccount) {
    const pwErr = validatePassword(body.password)
    if (pwErr) {
      return withCors(NextResponse.json({ error: pwErr }, { status: 400 }), origin)
    }
  }

  // Merge with existing patient if email+lastName already exist (returning user).
  const existing = await prisma.patient.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, passwordHash: true },
  })
  if (existing && existing.lastName.toLowerCase() === lastName.toLowerCase()) {
    if (wantsAccount) {
      // Claiming a portal account for a record already in the CRM.
      if (existing.passwordHash) {
        return withCors(
          NextResponse.json(
            { error: 'An account already exists for this email. Please sign in instead.' },
            { status: 409 },
          ),
          origin,
        )
      }
      await prisma.patient.update({
        where: { id: existing.id },
        data: { passwordHash: await hashPassword(body.password as string) },
      })
    }
    // Attach any uploaded Doctor's Referral / PWD ID to the existing record.
    await applyUploads(existing.id, body)
    const token = issuePatientToken(existing.id)
    return withCors(
      NextResponse.json({
        patientId: existing.id,
        firstName: existing.firstName,
        token,
        reused: true,
      }),
      origin,
    )
  }

  // Match marketing CRM convention: UPPERCASE all text except email/dob.
  const dob = (body.dob ?? '').trim()
  const created = await prisma.patient.create({
    data: {
      firstName: firstName.toUpperCase(),
      lastName: lastName.toUpperCase(),
      email,
      phone: (body.phone ?? '').trim() || null,
      dob: dob ? new Date(`${dob}T00:00:00.000Z`) : null,
      sex: uc(body.sex),
      address: uc(body.address),
      city: uc(body.city),
      civilStatus: uc(body.civilStatus),
      religion: uc(body.religion),
      nationality: uc(body.nationality),
      diagnosis: uc(body.diagnosis),
      pwdSeniorId: uc(body.pwdSeniorId),
      passwordHash: wantsAccount ? await hashPassword(body.password as string) : null,
      branch,
      branches: [branch],
      patientType,
    },
    select: { id: true, firstName: true },
  })

  // Attach any uploaded Doctor's Referral / PWD ID so it lands in Patient CRM.
  await applyUploads(created.id, body)

  const token = issuePatientToken(created.id)
  return withCors(
    NextResponse.json({ patientId: created.id, firstName: created.firstName, token }),
    origin,
  )
}
