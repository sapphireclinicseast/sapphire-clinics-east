// POST /api/progress-reports/[id]/email — email the PR to the patient
// using Resend HTTP API with the file as an attachment.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { promises as fs } from 'fs'
import path from 'path'

const FROM = 'Sapphire Clinics East <noreply@do-not-reply.sapphireclinicseast.org>'

// Branch-specific From for the Progress Report email. Requires the root domain
// sapphireclinicseast.org to be verified in Resend (SPF/DKIM); if it isn't, the
// send below falls back to FROM so the report still reaches the patient.
function branchFrom(branch?: string | null): string {
  switch (branch) {
    case 'SBEA':
      return process.env.RESEND_FROM_EAST ?? 'Aura Health East <east@sapphireclinicseast.org>'
    case 'SBGH':
      return process.env.RESEND_FROM_GREENHILLS ?? 'Aura Health Greenhills <greenhills@sapphireclinicseast.org>'
    default:
      return FROM
  }
}

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
    include: { patient: { select: { firstName: true, lastName: true, email: true, branch: true, branches: true } } },
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

  const subject = `Your Progress Report from Sapphire Clinics East Inc.`
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.6">
      <p style="margin:0 0 16px">Hi ${doc.patient.firstName},</p>
      <p style="margin:0 0 16px">Please find your <strong>Progress Report</strong> attached to this email.</p>
      <p style="margin:0 0 16px">If you have any questions about the contents of the report, feel free to reach out to our front desk team.</p>
      <p style="margin:0 0 24px">Thank you for trusting <strong>Sapphire Clinics East Inc.</strong> with your care.</p>
      <p style="margin:0;color:#475569;font-size:13px">
        <strong style="color:#0f172a">Sapphire Clinics East Inc.</strong><br>
        <a href="https://sapphireclinicseast.org" style="color:#ED6823;text-decoration:none">sapphireclinicseast.org</a>
      </p>
    </div>`

  // Look up CC list for the patient's branch (configurable in Connected Accounts)
  const patientBranch = doc.patient.branch ?? doc.patient.branches?.[0] ?? null
  let ccList: string[] = []
  if (patientBranch) {
    const ccRow = await prisma.branchCCEmail.findUnique({ where: { branch: patientBranch } })
    if (ccRow?.email) {
      ccList = ccRow.email.split(/[,;]/).map(s => s.trim()).filter(Boolean)
    }
  }

  const sendViaResend = (fromAddr: string) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddr,
        to: [doc.patient.email],
        ...(ccList.length > 0 ? { cc: ccList } : {}),
        subject,
        html,
        attachments: [{
          filename: doc.fileName,
          content: fileBuffer.toString('base64'),
        }],
      }),
      signal: AbortSignal.timeout(15_000),
    })

  // Try the branch address first; if Resend rejects it (e.g. the root domain
  // isn't verified yet), fall back to the always-verified FROM so the patient
  // still receives their report.
  const branchFromAddr = branchFrom(patientBranch)
  let res = await sendViaResend(branchFromAddr)
  if (!res.ok && branchFromAddr !== FROM) {
    const body = await res.text().catch(() => '')
    console.error('Resend send from', branchFromAddr, 'failed:', res.status, body.slice(0, 200), '— retrying from default')
    res = await sendViaResend(FROM)
  }

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
