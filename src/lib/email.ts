import { google } from 'googleapis'
import { formatFromHeader } from '@/lib/email-headers'
import { prisma } from './prisma'
import fs from 'fs'
import path from 'path'

const TOKEN_FILE = path.join(process.cwd(), 'uploads', 'google-oauth.json')

// ── Tranche limits ────────────────────────────────────────────────────────
// Gmail's per-user daily send quota is 500 for regular accounts and ~2000 for
// Workspace. We send at most this many in a single tranche, then pause until
// tomorrow (the BullMQ scheduled-emails worker resumes the campaign).
const DAILY_CAP_PER_TRANCHE = 450
// Time of day (PHT, UTC+8) to fire the next tranche. 09:00 local = 01:00 UTC.
const NEXT_TRANCHE_HOUR_PHT = 9

function nextTrancheTime(now: Date = new Date()): Date {
  // Construct "tomorrow at 09:00 PHT" expressed as a UTC instant.
  // PHT is UTC+8 with no DST, so 09:00 PHT == 01:00 UTC.
  const tomorrow = new Date(now)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(NEXT_TRANCHE_HOUR_PHT - 8, 0, 0, 0)
  return tomorrow
}

async function scheduleNextTranche(campaignId: string, when: Date): Promise<void> {
  // Dynamic import to avoid a circular dep (queue.ts imports executeSendCampaign).
  const { emailQueue } = await import('./queue')
  const delay = Math.max(0, when.getTime() - Date.now())
  // Use a tranche-specific jobId so multiple successive tranches don't collide.
  const jobId = `${campaignId}_${when.toISOString().slice(0, 10)}`
  await emailQueue.add('send-email', { campaignId }, { delay, jobId })
}

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
    `From: ${formatFromHeader('Sapphire Clinics East', from)}`,
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
 *
 * Tranche behaviour: each invocation sends at most DAILY_CAP_PER_TRANCHE
 * recipients, then sets status='partial' and queues a fresh delayed job for
 * tomorrow 09:00 PHT. The worker re-enters this function the next day; the
 * resume-detection picks up where sentCount left off. The campaign auto-
 * progresses to 'sent' once sentCount === recipients.length.
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

  // Resume support: pick up where a previous tranche left off. We detect both
  // legacy 'failed' partials and the new 'partial' status.
  const resuming =
    (campaign.status === 'failed' || campaign.status === 'partial') &&
    campaign.sentCount > 0 &&
    campaign.sentCount < recipients.length
  const startFrom = resuming ? campaign.sentCount : 0

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'sending',
      recipientCount: recipients.length,
      ...(resuming ? {} : { sentCount: 0 }),
      nextTrancheAt: null,
    },
  })

  let sentCount = startFrom
  let trancheSentCount = 0    // emails sent in THIS invocation
  let rateLimitHit = false
  try {
    const gmail = await getGmailClient(refreshToken)

    // ── Operator copy ────────────────────────────────────────────────────────
    // Send ONE copy of the campaign to the requested address(es). Guarded on
    // startFrom === 0 so it goes out only on the first tranche: campaigns are
    // sent in daily tranches and resume via this same function, so an
    // unguarded send here would deliver a fresh copy on every resume.
    //
    // Deliberately a separate message rather than a Cc header on each
    // recipient's mail — a Cc would put one mail per recipient in the
    // operator's inbox (thousands) and expose their address to every patient.
    if (startFrom === 0 && campaign.ccEmails) {
      const ccList = campaign.ccEmails.split(/[,;]/).map((e: string) => e.trim()).filter(Boolean)
      for (const cc of ccList) {
        try {
          await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
              raw: makeEmailBody(cc, `[Copy] ${campaign.subject}`, campaign.body, senderEmail),
            },
          })
        } catch (ccErr) {
          // Never let the operator copy block the actual campaign.
          console.error('[email] operator copy failed for', cc, ccErr)
        }
      }
    }

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
      trancheSentCount++
      // Throttle ~4 messages/sec to stay safely under Gmail per-user limits.
      await new Promise(r => setTimeout(r, 250))
      // Persist progress every 10 sends so the UI can show "Partial (x/N)".
      if (sentCount % 10 === 0) {
        await prisma.emailCampaign.update({
          where: { id: campaignId },
          data: { sentCount },
        }).catch(() => undefined)
      }
      // Stop once we've hit today's tranche cap; resume tomorrow.
      if (trancheSentCount >= DAILY_CAP_PER_TRANCHE) break
    }

    const fullyDone = sentCount >= recipients.length
    if (fullyDone) {
      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { status: 'sent', sentAt: new Date(), sentCount, nextTrancheAt: null },
      })
      return
    }

    // Not yet done — either we hit DAILY_CAP_PER_TRANCHE or Gmail rate-limited
    // us partway. In both cases, schedule the next tranche for tomorrow 09:00
    // PHT and mark status='partial' so the UI shows the next-batch ETA.
    const next = nextTrancheTime()
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'partial', sentCount, nextTrancheAt: next },
    })
    await scheduleNextTranche(campaignId, next)

    if (rateLimitHit) {
      // Log only — do NOT throw. Throwing causes BullMQ to mark the job
      // failed, which historically clobbered the campaign's 'partial'
      // status with 'failed'. The DB is already in the correct 'partial'
      // state with the next tranche scheduled.
      console.warn(
        `[email] Rate limit hit at ${sentCount}/${recipients.length}. ` +
        `Next tranche scheduled for ${next.toISOString()}.`
      )
    }
  } catch (err) {
    // If we already moved to 'partial' above, don't downgrade to 'failed'.
    const cur = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    })
    if (cur?.status !== 'partial' && cur?.status !== 'sent') {
      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { status: 'failed', sentCount },
      }).catch(() => undefined)
    }
    throw err
  }
}
