import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGmailClient, getLegacyRefreshToken } from '@/lib/email'

function buildBirthdayEmailHtml(firstName: string, clinicName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Happy Birthday from ${clinicName}!</title>
</head>
<body style="margin:0;padding:0;background:#FFF5E8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF5E8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(237,104,35,0.1);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#ED6823,#FFA235);padding:36px 40px;text-align:center;">
              <div style="font-size:52px;margin-bottom:12px;">🎂</div>
              <h1 style="color:#fff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">
                Happy Birthday, ${firstName}!
              </h1>
              <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;font-weight:500;">
                Wishing you a wonderful day! 🧡
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="color:#4A3018;font-size:16px;line-height:1.7;margin:0 0 20px;">
                Dear <strong>${firstName}</strong>,
              </p>
              <p style="color:#4A3018;font-size:15px;line-height:1.8;margin:0 0 20px;">
                On behalf of everyone at <strong>${clinicName}</strong>, we want to wish you a very
                <strong style="color:#ED6823;">Happy Birthday!</strong> 🎉
              </p>
              <p style="color:#4A3018;font-size:15px;line-height:1.8;margin:0 0 24px;">
                We are grateful to have you as part of our clinic family. Your health and well-being
                mean the world to us — today and every day. May this special day bring you joy,
                laughter, and wonderful memories!
              </p>

              <!-- Birthday card highlight -->
              <div style="background:linear-gradient(135deg,#FFF5E8,#FFF0DD);border:2px solid #FFA235;border-radius:12px;padding:20px 24px;text-align:center;margin-bottom:24px;">
                <p style="color:#ED6823;font-size:20px;font-weight:800;margin:0 0 6px;">
                  🌟 You're a star! 🌟
                </p>
                <p style="color:#7A3020;font-size:14px;margin:0;font-style:italic;">
                  "May you continue to shine brightly in everything you do."
                </p>
              </div>

              <p style="color:#4A3018;font-size:15px;line-height:1.8;margin:0 0 8px;">
                With warmest wishes,
              </p>
              <p style="color:#ED6823;font-size:16px;font-weight:700;margin:0;">
                The ${clinicName} Team 🧡
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#FFF5E8;border-top:1px solid #F0E0CC;padding:20px 40px;text-align:center;">
              <p style="color:#AAA;font-size:12px;margin:0 0 4px;">
                ${clinicName}
              </p>
              <p style="color:#CCC;font-size:11px;margin:0;">
                This is an automated birthday greeting. You received this because you are a valued patient.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { patientId, branch } = await req.json()
  if (!patientId) return NextResponse.json({ error: 'patientId required' }, { status: 400 })

  // Load patient
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  if (!patient.email) return NextResponse.json({ error: 'Patient has no email address on file' }, { status: 422 })

  const clinicName =
    branch === 'SBEA' ? 'Aura Health Rehab East'
    : branch === 'SBGH' ? 'Aura Health Rehab Greenhills'
    : 'Aura Health Rehab'

  // Resolve Gmail credentials
  let refreshToken: string | null = null
  let senderEmail = 'noreply@sapphireclinicseast.org'

  const gmailAcct = await prisma.gmailAccount.findFirst()
  if (gmailAcct) {
    refreshToken = gmailAcct.refreshToken
    senderEmail = gmailAcct.email
  }
  if (!refreshToken) refreshToken = getLegacyRefreshToken()
  if (!refreshToken) return NextResponse.json({ error: 'No Gmail account connected' }, { status: 500 })

  const gmail = await getGmailClient(refreshToken)
  const html = buildBirthdayEmailHtml(patient.firstName, clinicName)

  const subjectText = `Happy Birthday, ${patient.firstName}! — ${clinicName}`
  // RFC 2047 encoded-word so non-ASCII/emoji in Subject is safe
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subjectText, 'utf-8').toString('base64')}?=`
  // Base64-encode the HTML body to avoid encoding issues with emojis
  const bodyBase64 = Buffer.from(html, 'utf-8').toString('base64')

  const rawLines = [
    `From: ${clinicName} <${senderEmail}>`,
    `To: ${patient.email}`,
    `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyBase64,
  ]
  // Email spec requires CRLF line endings
  const raw = Buffer.from(rawLines.join('\r\n')).toString('base64url')

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

  return NextResponse.json({ success: true })
}
