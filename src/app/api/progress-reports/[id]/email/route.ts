// POST /api/progress-reports/[id]/email — email the PR to the patient
// using Resend HTTP API with the file as an attachment.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { promises as fs } from 'fs'
import path from 'path'

const FROM = 'Sapphire Clinics East <noreply@do-not-reply.sapphireclinicseast.org>'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as { id?: string } | undefined)?.id ?? null

  const { id } = await params
  const doc = await prisma.patientDocument.findUnique({
    where: { id },
    include: { patient: { select: { firstName: true, lastName: true, email: true } } },
  })
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (!doc.paidForAt) return NextResponse.json({ error: 'Mark as paid first' }, { status: 400 })
  if (!doc.patient.email) return NextResponse.json({ error: 'Patient has no email on file' }, { status: 400 })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })

  // Read the file from the read-only teletherapy mount
  const filePath = path.join('/app/teletherapy-uploads', doc.filePath)
  let fileBuffer: Buffer
  try {
    fileBuffer = await fs.readFile(filePath)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'File not found on disk: ' + msg }, { status: 500 })
  }

  const subject = `Your Progress Report from SAPPHIRE Clinics`
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="color:#0f172a;margin:0 0 12px">Hi ${doc.patient.firstName},</h2>
      <p>Please find your <strong>Progress Report</strong> attached to this email.</p>
      <p>If you have any questions about the contents of the report, feel free to reach out to your therapist or our front desk team.</p>
      <p>Thank you for trusting <strong>SAPPHIRE Clinics</strong> with your care.</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:32px">Sapphire Clinics East — sapphireclinicseast.org</p>
    </div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [doc.patient.email],
      subject,
      html,
      attachments: [{
        filename: doc.fileName,
        content: fileBuffer.toString('base64'),
      }],
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return NextResponse.json({ error: 'Resend error ' + res.status + ': ' + body.slice(0, 300) }, { status: 502 })
  }

  await prisma.patientDocument.update({
    where: { id },
    data: { emailedToPatientAt: new Date(), emailedById: userId ?? undefined },
  })

  return NextResponse.json({ ok: true, sentTo: doc.patient.email })
}
