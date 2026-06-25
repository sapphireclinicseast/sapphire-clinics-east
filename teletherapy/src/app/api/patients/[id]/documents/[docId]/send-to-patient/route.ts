import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { loadEmailLogo, emailHeader } from '@/lib/email-branding'
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

  // Authorization (relaxed for operational sends):
  //   admin → always
  //   non-admin → must have access to the patient (an active
  //     assignment OR any scheduled session for the patient) AND
  //     the document must not be locked.
  // Previously this required the caller to be the ORIGINAL uploader;
  // that gate made sense when emails were sent from the clinician's
  // personal identity. Now that outgoing email goes from the clinic
  // inbox (main@), any consultant who is involved with the patient
  // can route the IE — they aren't claiming authorship of the report.
  // Document content remains immutable (re-upload + delete are still
  // uploader-only via the documents DELETE handler).
  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((doc as any).lockedAt) {
      return NextResponse.json(
        { error: 'This document is locked and cannot be sent.' },
        { status: 403 },
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allowedStaffIds = (session.user as any).branches?.map((b: { staffId: string }) => b.staffId) ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffPool = allowedStaffIds.length > 0 ? allowedStaffIds : [(session.user as any).staffId].filter(Boolean)
    const hasSession = staffPool.length > 0
      ? await prisma.schedule.findFirst({
          where: { patientId, staffId: { in: staffPool } },
          select: { id: true },
        })
      : null
    const hasActive = await prisma.patientAssignment.findFirst({
      where: { patientId, therapistAccountId: session.user.id, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!hasSession && !hasActive) {
      return NextResponse.json(
        { error: 'You do not have access to this patient.' },
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

  const logo = await loadEmailLogo()

  const html = `
    <div style="font-family: 'Montserrat', 'Arimo', Verdana, sans-serif; color: #244952; max-width: 600px; margin: 0 auto;">
      ${emailHeader('Initial Evaluation Report', 'Sapphire Clinics East, Inc.', !!logo)}
      <div style="background: #ffffff; padding: 24px; border: 1px solid #d9e3c6; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 15px; margin-top: 0;">Dear <strong>${patientName}</strong>,</p>
        <div style="background: #edf3d9; border-left: 4px solid #c69849; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="font-size: 14px; line-height: 1.6; margin: 0;">
            Please find attached your <strong>Initial Evaluation report</strong> from your ${deptLabel} sessions at our clinic.
          </p>
        </div>
        <p style="font-size: 14px; line-height: 1.6; color: #244952;">
          For questions or concerns, please reach out to our front desk team.
        </p>
        <p style="font-size: 13px; color: #4a8073; margin-top: 24px;">
          — Sapphire Clinics East, Inc.
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
      inlineImages: logo ? [logo] : undefined,
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
