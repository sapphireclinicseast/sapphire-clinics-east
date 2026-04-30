import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getGmailClient,
  getLegacyRefreshToken,
  makeEmailBodyWithAttachment,
} from '@/lib/email'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const ALLOWED_ROLES = new Set([
  'SBEA_FRONT_DESK', 'SBGH_FRONT_DESK',
  'SBEA_ADMIN', 'SBGH_ADMIN', 'SUPER_ADMIN',
])

// Teletherapy upload root — files were saved here by the teletherapy app.
// In production this is /var/www/sapphireclinicseast.org/teletherapy/uploads.
// In dev / build, fall back to a relative path.
const TELE_UPLOAD_DIR =
  process.env.TELETHERAPY_UPLOAD_DIR ||
  '/var/www/sapphireclinicseast.org/teletherapy/uploads'

const DEPT_LABEL: Record<string, string> = {
  OT: 'OT', PT: 'PT', SLP: 'SLP', SPED: 'SPED',
  PSYCHOLOGY: 'Psychology', ORTHOSIS: 'Orthosis & Prosthesis',
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: 'Front desk role required' }, { status: 403 })
  }

  const { docId } = await params

  // @ts-ignore — patientDocument added in this PR
  const doc = await prisma.patientDocument.findUnique({
    where: { id: docId },
    include: {
      patient: {
        select: { firstName: true, lastName: true, email: true, branch: true, branches: true },
      },
    },
  })

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (doc.documentType !== 'PROGRESS_REPORT') {
    return NextResponse.json({ error: 'Not a progress report' }, { status: 400 })
  }
  if (!doc.paidForAt) {
    return NextResponse.json(
      { error: 'Patient must be marked as paid before emailing the PR' },
      { status: 400 },
    )
  }
  if (!doc.patient?.email) {
    return NextResponse.json({ error: 'Patient has no email on file' }, { status: 400 })
  }

  // Read the file from disk (lives in teletherapy uploads dir)
  const fullPath = path.join(TELE_UPLOAD_DIR, doc.filePath)
  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: 'File missing on server' }, { status: 500 })
  }
  const fileBuffer = await readFile(fullPath)

  // Resolve Gmail credentials (prefer GmailAccount, fall back to legacy)
  const refreshToken = getLegacyRefreshToken()
  if (!refreshToken) {
    return NextResponse.json({ error: 'No Gmail account connected' }, { status: 500 })
  }

  const senderEmail = process.env.GMAIL_FROM ?? 'frontdesk@sapphireclinicseast.org'
  const patientName = `${doc.patient.firstName} ${doc.patient.lastName}`
  const deptLabel = DEPT_LABEL[doc.department] ?? doc.department

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1A2E2B; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #2E5E5A, #1F4944); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 22px;">Progress Report</h1>
      </div>
      <div style="background: #F7FAF9; padding: 24px; border-radius: 0 0 12px 12px;">
        <p style="font-size: 15px;">Dear ${patientName},</p>
        <p style="font-size: 14px; line-height: 1.6;">
          Please find attached your Progress Report from your ${deptLabel} sessions at our clinic.
        </p>
        <p style="font-size: 14px; line-height: 1.6;">
          For questions or concerns, please reach out to our front desk team.
        </p>
        <p style="font-size: 13px; color: #7A908C; margin-top: 24px;">
          — Sapphire Clinics East Inc.
        </p>
      </div>
    </div>
  `

  try {
    const gmail = await getGmailClient(refreshToken)
    const raw = makeEmailBodyWithAttachment({
      to: doc.patient.email,
      subject: `Progress Report — ${patientName}`,
      htmlBody: html,
      from: senderEmail,
      attachment: {
        filename: doc.fileName,
        mimeType: doc.mimeType || 'application/octet-stream',
        content: fileBuffer,
      },
    })
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Email send failed' },
      { status: 500 },
    )
  }

  // @ts-ignore
  const updated = await prisma.patientDocument.update({
    where: { id: docId },
    data: {
      emailedToPatientAt: new Date(),
      emailedById: user.id ?? user.email ?? null,
    },
  })

  return NextResponse.json({
    success: true,
    sentTo: doc.patient.email,
    emailedAt: updated.emailedToPatientAt,
  })
}
