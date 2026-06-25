import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGmailClient, getLegacyRefreshToken } from '@/lib/email'

const LOGO_URL = 'https://operations.sapphireclinicseast.org/brand/aura-logo-color.png'

function clinicNameForBranch(branch?: string): string {
  if (branch === 'SBEA') return 'Aura Health Rehab East'
  if (branch === 'SBGH') return 'Aura Health Rehab Greenhills'
  return 'Aura Health Rehab'
}

function buildBirthdayEmailHtml(firstName: string, clinicName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Happy Birthday from ${clinicName}!</title>
</head>
<body style="margin:0;padding:0;background:#edf3d9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#edf3d9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(36,73,82,0.12);">

          <!-- Header: paper background with full-color logo -->
          <tr>
            <td style="background:linear-gradient(160deg,#edf3d9 0%,#d4e8d8 100%);padding:36px 40px 28px;text-align:center;">
              <img src="${LOGO_URL}" alt="${clinicName}" style="height:130px;max-width:300px;display:inline-block;margin-bottom:20px;">
              <h1 style="color:#244952;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">
                Happy Birthday, ${firstName}!
              </h1>
              <p style="color:#4a8073;margin:8px 0 0;font-size:14px;font-weight:500;">
                Wishing you a wonderful day! 🎉
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="color:#244952;font-size:16px;line-height:1.7;margin:0 0 20px;">
                Dear <strong>${firstName}</strong>,
              </p>
              <p style="color:#244952;font-size:15px;line-height:1.8;margin:0 0 20px;">
                On behalf of everyone at <strong>${clinicName}</strong>, we want to wish you a very
                <strong style="color:#4a8073;">Happy Birthday!</strong>
              </p>
              <p style="color:#244952;font-size:15px;line-height:1.8;margin:0 0 24px;">
                We are grateful to have you as part of our clinic family. Your health and well-being
                mean the world to us &mdash; today and every day. May this special day bring you joy,
                laughter, and wonderful memories!
              </p>

              <!-- Birthday highlight -->
              <div style="background:rgba(198,152,73,0.08);border:2px solid #c69849;border-radius:12px;padding:22px 24px;text-align:center;margin-bottom:28px;">
                <p style="color:#c69849;font-size:20px;font-weight:800;margin:0 0 8px;">
                  ✨ You&rsquo;re a star! ✨
                </p>
                <p style="color:#244952;font-size:14px;margin:0;font-style:italic;">
                  &ldquo;May you continue to shine brightly in everything you do.&rdquo;
                </p>
              </div>

              <p style="color:#244952;font-size:15px;line-height:1.8;margin:0 0 8px;">
                With warmest wishes,
              </p>
              <p style="color:#244952;font-size:16px;font-weight:700;margin:0 0 2px;">
                The ${clinicName} Team
              </p>
              <p style="margin:0;"><a href="https://www.sapphireclinicseast.org" style="color:#4a8073;font-size:13px;">www.sapphireclinicseast.org</a></p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#244952;border-top:1px solid #193339;padding:16px 40px;text-align:center;">
              <p style="color:rgba(237,243,217,0.55);font-size:11px;margin:0;">
                You received this because you are a valued patient.
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

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  if (!patient.email) return NextResponse.json({ error: 'Patient has no email address on file' }, { status: 422 })

  const clinicName = clinicNameForBranch(branch)

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
  const encode2047 = (s: string) => `=?UTF-8?B?${Buffer.from(s, 'utf-8').toString('base64')}?=`
  const subjectEncoded = encode2047(subjectText)
  const fromNameEncoded = encode2047(clinicName)
  const bodyBase64 = Buffer.from(html, 'utf-8').toString('base64')

  const rawLines = [
    `From: ${fromNameEncoded} <${senderEmail}>`,
    `To: ${patient.email}`,
    `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyBase64,
  ]
  const raw = Buffer.from(rawLines.join('\r\n')).toString('base64url')

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

  return NextResponse.json({ success: true })
}
