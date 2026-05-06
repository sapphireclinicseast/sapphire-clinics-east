import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

// Map a Staff.branch enum value to a label for the email
const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'Sandbox East',
  SBGH: 'Sandbox Greenhills',
  SANDBOX_EAST: 'Sandbox East',
  SANDBOX_GREENHILLS: 'Sandbox Greenhills',
  VERDANA_STORE: 'Verdana Store',
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: patientId, docId } = await params

  // @ts-ignore — patientDocument
  const doc = await prisma.patientDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.patientId !== patientId) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (doc.documentType !== 'INITIAL_EVALUATION') {
    return NextResponse.json(
      { error: 'Only Initial Evaluation documents can be sent to patient via this endpoint' },
      { status: 400 }
    )
  }

  // Authorization: admin OR (the original uploader AND active owner
  // AND the document is not locked). We don't want Caitlynn emailing
  // out an IE that Eloisa prepared and signed.
  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin) {
    if (doc.uploadedById !== session.user.id) {
      return NextResponse.json(
        { error: 'Only the original uploader can send this IE.' },
        { status: 403 },
      )
    }
    const active = await prisma.patientAssignment.findFirst({
      where: { patientId, therapistAccountId: session.user.id, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!active) {
      return NextResponse.json(
        { error: 'You no longer have active access to this patient.' },
        { status: 403 },
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((doc as any).lockedAt) {
      return NextResponse.json(
        { error: 'This document is locked and cannot be sent.' },
        { status: 403 },
      )
    }
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { firstName: true, lastName: true, email: true, branch: true, branches: true },
  })
  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }
  if (!patient.email) {
    return NextResponse.json({ error: 'Patient has no email on file' }, { status: 400 })
  }

  // Resolve cc email from BranchCCEmail using the patient's branch
  // Patient.branch is the primary branch; fallback to any branch in patient.branches
  const branchKey = patient.branch ?? patient.branches?.[0] ?? null
  let ccEmail: string | null = null
  if (branchKey) {
    // @ts-ignore — branchCCEmail
    const ccRow = await prisma.branchCCEmail.findUnique({ where: { branch: branchKey } })
    ccEmail = ccRow?.email ?? null
  }

  // Read the file from disk
  const fullPath = path.join(UPLOAD_DIR, doc.filePath)
  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: 'File missing on server' }, { status: 500 })
  }
  const fileBuffer = await readFile(fullPath)

  const patientName = `${patient.firstName} ${patient.lastName}`
  // Department label preserves abbreviations (OT, PT, SLP, SPED) and capitalizes others
  const DEPT_LABEL: Record<string, string> = {
    OT: 'OT', PT: 'PT', SLP: 'SLP', SPED: 'SPED',
    PSYCHOLOGY: 'Psychology', ORTHOSIS: 'Orthosis & Prosthesis',
  }
  const deptLabel = DEPT_LABEL[doc.department] ?? doc.department

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1B3F38; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #26554B, #1B3F38); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 22px;">Initial Evaluation Report</h1>
      </div>
      <div style="background: #F5F0E8; padding: 24px; border-radius: 0 0 12px 12px;">
        <p style="font-size: 15px;">Dear ${patientName},</p>
        <p style="font-size: 14px; line-height: 1.6;">
          Please find attached your Initial Evaluation report from your ${deptLabel} sessions at our clinic.
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
    await sendEmail({
      to: patient.email,
      cc: ccEmail ? [ccEmail] : undefined,
      subject: `Initial Evaluation Report — ${patientName}`,
      html,
      attachments: [{ filename: doc.fileName, content: fileBuffer }],
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Email send failed' }, { status: 500 })
  }

  // Update tracking fields
  // @ts-ignore — patientDocument
  await prisma.patientDocument.update({
    where: { id: docId },
    data: {
      sentToPatientAt: new Date(),
      sentToPatientBy: session.user.id,
      sentToPatientCc: ccEmail,
    },
  })

  return NextResponse.json({
    success: true,
    sentTo: patient.email,
    cc: ccEmail,
  })
}
