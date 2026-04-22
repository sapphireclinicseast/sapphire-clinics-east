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
    where: patientIds !== null ? { id: { in: patientIds } } : {},
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

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: 'sending', recipientCount: recipients.length },
  })

  try {
    const gmail = await getGmailClient(refreshToken)
    for (const patient of recipients) {
      if (!patient.email) continue
      const raw = makeEmailBody(patient.email, campaign.subject, campaign.body, senderEmail)
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    }
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'sent', sentAt: new Date() },
    })
  } catch (err) {
    await prisma.emailCampaign.update({ where: { id: campaignId }, data: { status: 'failed' } })
    throw err
  }
}
