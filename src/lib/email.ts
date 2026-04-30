import { google } from 'googleapis'
import { prisma } from './prisma'
import fs from 'fs'
import path from 'path'

const TOKEN_FILE = path.join(process.cwd(), 'uploads', 'google-oauth.json')

export function getLegacyRefreshToken(): string | null {
  if (process.env.GOOGLE_REFRESH_TOKEN) return process.env.GOOGLE_REFRESH_TOKEN
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'))
      if (data.refresh_token) return data.refresh_token
    }
  } catch {
    // ignore
  }
  return null
}

export async function getGmailClient(refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  return google.gmail({ version: 'v1', auth: oauth2Client })
}

export function makeEmailBody(to: string, subject: string, body: string, from: string): string {
  // RFC 2047 encoded-word so non-ASCII/emoji in Subject is displayed correctly.
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
  // Auto-detect HTML vs plain text so campaigns with HTML content render correctly.
  const isHtml = /<[a-z][\s\S]*>/i.test(body)
  // Base64-encode the body with explicit UTF-8 so em-dashes, curly quotes and
  // emoji don't get rendered as "Ã¢Â€Â"" when the client assumes Latin-1.
  const bodyBase64 = Buffer.from(body, 'utf-8').toString('base64')
  // Break base64 into 76-char lines (RFC 2045); Gmail is strict about this.
  const bodyLines = bodyBase64.replace(/(.{76})/g, '$1\r\n')

  const message = [
    `From: Sapphire Clinics East <${from}>`,
    `To: ${to}`,
    `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0',
    `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
    'Content-Transfer-Encoding: base64',
    '',
    bodyLines,
  ].join('\r\n')

  return Buffer.from(message).toString('base64url')
}

/**
 * Build an RFC 2045 multipart/mixed message with an HTML body and ONE
 * binary attachment. Used for sending Progress Reports / Initial Evaluation
 * documents to patients via Gmail.
 */
export function makeEmailBodyWithAttachment(args: {
  to: string
  cc?: string
  subject: string
  htmlBody: string
  from: string
  attachment: { filename: string; mimeType: string; content: Buffer }
}): string {
  const { to, cc, subject, htmlBody, from, attachment } = args
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
  const boundary = `=_SCEI_${Math.random().toString(36).slice(2)}_${Date.now()}_=`

  const htmlBase64 = Buffer.from(htmlBody, 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n')
  const fileBase64 = attachment.content.toString('base64').replace(/(.{76})/g, '$1\r\n')

  const headers = [
    `From: Sapphire Clinics East <${from}>`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
  ]

  const parts = [
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    htmlBase64,
    '',
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    fileBase64,
    '',
    `--${boundary}--`,
  ]

  const message = [...headers, ...parts].join('\r\n')
  return Buffer.from(message).toString('base64url')
}

/**
 * Actually sends the emails for a campaign. Called by both the route (send-now)
 * and the BullMQ worker (scheduled delivery).
 */
export async function executeSendCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)
  if (campaign.status === 'sent') return // already sent

  // Resolve Gmail credentials
  let refreshToken: string | null = null
  let senderEmail = 'noreply@sapphireclinicseast.org'

  if (campaign.gmailAccountId) {
    const gmailAcct = await prisma.gmailAccount.findUnique({ where: { id: campaign.gmailAccountId } })
    if (gmailAcct) {
      refreshToken = gmailAcct.refreshToken
      senderEmail = gmailAcct.email
    }
  }
  if (!refreshToken) refreshToken = getLegacyRefreshToken()
  if (!refreshToken) {
    await prisma.emailCampaign.update({ where: { id: campaignId }, data: { status: 'failed' } })
    throw new Error('No Gmail account connected')
  }

  // Parse recipientGroup — may include branch filter encoded as "group|BRANCH1,BRANCH2"
  const [group, branchPart] = campaign.recipientGroup.split('|')
  const branches = branchPart ? branchPart.split(',').filter(Boolean) : []

  // Fetch recipients — use raw SQL for branch filter to avoid enum array type mismatch
  let patientIds: string[] | null = null
  if (branches.length > 0) {
    const placeholders = branches.map((_: string, i: number) => `$${i + 1}`).join(', ')
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT DISTINCT id FROM "Patient" WHERE branch::text = ANY(ARRAY[${placeholders}]) OR "branches"::text[] && ARRAY[${placeholders}]`,
      ...branches,
    )
    patientIds = rows.map((r: { id: string }) => r.id)
  }

  let patients = await prisma.patient.findMany({
    where: {
      ...(patientIds !== null ? { id: { in: patientIds } } : {}),
      unsubscribed: false,
    },
    select: { email: true, firstName: true, lastName: true, dob: true, patientType: true },
  })

  if (group === 'pediatric') {
    patients = patients.filter((p) => p.patientType === 'PEDIATRIC')
  } else if (group === 'adult') {
    patients = patients.filter((p) => p.patientType === 'ADULT')
  } else if (group === 'birthday-month') {
    const currentMonth = new Date().getMonth()
    patients = patients.filter((p) => p.dob && new Date(p.dob).getMonth() === currentMonth)
  }

  const recipients = patients.filter((p) => p.email)
  if (recipients.length === 0) {
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'failed' },
    })
    throw new Error('No patients with email addresses in this group')
  }

  // Resume support: if the campaign was previously partially sent (status
  // 'failed' with sentCount > 0), pick up where it left off. Otherwise start
  // fresh and reset sentCount to 0.
  const resuming = campaign.status === 'failed' && campaign.sentCount > 0 && campaign.sentCount < recipients.length
  const startFrom = resuming ? campaign.sentCount : 0

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'sending',
      recipientCount: recipients.length,
      ...(resuming ? {} : { sentCount: 0 }),
    },
  })

  let sentCount = startFrom
  let rateLimitHit = false
  try {
    const gmail = await getGmailClient(refreshToken)
    for (let i = startFrom; i < recipients.length; i++) {
      const patient = recipients[i]
      if (!patient.email) continue
      const raw = makeEmailBody(patient.email, campaign.subject, campaign.body, senderEmail)
      try {
        await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
      } catch (sendErr) {
        // Detect rate-limit / quota errors and stop gracefully so the operator
        // can resume later. Gmail returns 429 / 403 with rateLimitExceeded.
        const errObj = sendErr as { code?: number; message?: string; errors?: Array<{ reason?: string }> }
        const reason = errObj?.errors?.[0]?.reason ?? ''
        const status = errObj?.code
        if (status === 429 || status === 403 ||
            reason === 'rateLimitExceeded' || reason === 'quotaExceeded' ||
            reason === 'userRateLimitExceeded' ||
            (errObj?.message ?? '').toLowerCase().includes('rate limit')) {
          rateLimitHit = true
          // One short retry after a 5s pause in case it's a transient burst
          await new Promise(r => setTimeout(r, 5000))
          try {
            await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
            rateLimitHit = false
          } catch {
            // Still hitting the limit — bail out, leave sentCount where it is
            break
          }
        } else {
          throw sendErr
        }
      }
      sentCount++
      // Throttle ~4 messages/sec to stay safely under Gmail per-user limits.
      await new Promise(r => setTimeout(r, 250))
      // Persist progress every 10 sends so the UI can show "Partial (x/N)".
      if (sentCount % 10 === 0) {
        await prisma.emailCampaign.update({
          where: { id: campaignId },
          data: { sentCount },
        }).catch(() => undefined)
      }
    }

    if (rateLimitHit) {
      // Mark as failed so the operator sees a Resume button. The UI shows
      // "Partial (x/N)" because sentCount < recipientCount.
      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { status: 'failed', sentCount },
      })
      throw new Error(`Rate limit hit at ${sentCount}/${recipients.length}. Resume later when the quota resets.`)
    }

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'sent', sentAt: new Date(), sentCount },
    })
  } catch (err) {
    // Preserve whatever we managed to send before the crash so the UI can
    // render "Partial (x/N)" instead of just "Failed".
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'failed', sentCount },
    }).catch(() => undefined)
    throw err
  }
}
