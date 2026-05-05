// SMS campaign sender — mirrors lib/email.ts but routes through httpSMS
// (the Globe SIM running the httpSMS app on each clinic's Android phone).
// Tranche behaviour: each invocation sends at most DAILY_CAP_PER_TRANCHE
// recipients, then sets status='partial' and queues a delayed BullMQ job
// for tomorrow 09:00 PHT. The worker re-enters this function the next
// day; the resume-detection picks up where sentCount left off. The
// campaign auto-progresses to 'sent' once sentCount === recipients.length.

import { prisma } from './prisma'

// httpSMS-on-Globe-SIM safely handles ~1000/day; we leave headroom for
// schedule reminders, birthdays and other ad-hoc sends from the same SIM.
const DAILY_CAP_PER_TRANCHE = 400
// Time of day (PHT, UTC+8) to fire the next tranche. 09:00 local = 01:00 UTC.
const NEXT_TRANCHE_HOUR_PHT = 9
// Throttle ~1 SMS / 600ms (~1.6/sec) — well under the SIM's per-second limits.
const SMS_THROTTLE_MS = 600

const BRANCH_CONFIG: Record<string, { httpSmsKey: string; phone: string; clinicName: string }> = {
  SBEA: {
    httpSmsKey: process.env.HTTPSMS_API_KEY_SBEA ?? '',
    phone:      '+639171189289',
    clinicName: 'Sandbox Clinic East',
  },
  SBGH: {
    httpSmsKey: process.env.HTTPSMS_API_KEY_SBGH ?? '',
    phone:      '+639177701686',
    clinicName: 'Sandbox Clinic Greenhills',
  },
}

const BRANCH_ENUM: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
}

/** Convert any PH phone format → E.164 (+63XXXXXXXXXX) for httpSMS. */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 11) return '+' + digits
  if (digits.startsWith('0')  && digits.length === 11) return '+63' + digits.slice(1)
  if (digits.length === 10)                             return '+63' + digits
  return '+' + digits
}

function nextTrancheTime(now: Date = new Date()): Date {
  // PHT is UTC+8, no DST. 09:00 PHT == 01:00 UTC.
  const tomorrow = new Date(now)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(NEXT_TRANCHE_HOUR_PHT - 8, 0, 0, 0)
  return tomorrow
}

async function scheduleNextTranche(campaignId: string, when: Date): Promise<void> {
  const { smsQueue } = await import('./queue')
  const delay = Math.max(0, when.getTime() - Date.now())
  const jobId = `${campaignId}_${when.toISOString().slice(0, 10)}`
  await smsQueue.add('send-sms-campaign', { campaignId }, { delay, jobId })
}

/**
 * Resolve the recipient set for a given campaign — returns patients with a
 * usable phone number, deduplicated. Mirrors the email pipeline's group
 * semantics but adds the new 'actively-serviced-{DEPT}' groups, which are a
 * union of:
 *   • patients currently on a DeckingSlot for that branch + dept
 *   • patients with a CONFIRMED Schedule in the last 30 days for that
 *     branch + dept
 */
async function resolveRecipients(
  recipientGroup: string,
  branch: string, // 'SBEA' | 'SBGH' | 'BOTH'
): Promise<Array<{ id: string; firstName: string; lastName: string; phone: string }>> {
  const branchEnums = branch === 'BOTH'
    ? [BRANCH_ENUM.SBEA, BRANCH_ENUM.SBGH]
    : [BRANCH_ENUM[branch]].filter(Boolean)

  // ── pediatric / adult / both ──────────────────────────────────────────────
  if (recipientGroup === 'pediatric' || recipientGroup === 'adult' || recipientGroup === 'both') {
    const patientType =
      recipientGroup === 'pediatric' ? 'PEDIATRIC' :
      recipientGroup === 'adult'     ? 'ADULT' : null

    let patientIds: string[] | null = null
    if (branchEnums.length > 0 && branch !== 'BOTH') {
      const placeholders = branchEnums.map((_, i) => `$${i + 1}`).join(', ')
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT DISTINCT id FROM "Patient" WHERE branch::text = ANY(ARRAY[${placeholders}]) OR "branches"::text[] && ARRAY[${placeholders}]`,
        ...branchEnums,
      )
      patientIds = rows.map(r => r.id)
    }

    const patients = await prisma.patient.findMany({
      where: {
        ...(patientIds !== null ? { id: { in: patientIds } } : {}),
        unsubscribed: false,
        ...(patientType ? { patientType: patientType as 'PEDIATRIC' | 'ADULT' } : {}),
        phone: { not: null },
      },
      select: { id: true, firstName: true, lastName: true, phone: true },
    })

    return patients
      .filter((p): p is typeof p & { phone: string } => !!p.phone && p.phone.trim().length > 0)
  }

  // ── actively-serviced-{DEPT} ──────────────────────────────────────────────
  const m = /^actively-serviced-(.+)$/.exec(recipientGroup)
  if (m) {
    const dept = m[1].toUpperCase()
    const branchFilter = branch === 'BOTH' ? null : branch

    // Set A — patients currently on a DeckingSlot for this branch+dept.
    const deckingSlots = await prisma.deckingSlot.findMany({
      where: {
        department: dept,
        ...(branchFilter ? { branch: branchFilter } : {}),
        patientId: { not: null },
      },
      select: { patientId: true },
    })
    const deckingPatientIds = new Set(
      deckingSlots.map(s => s.patientId).filter((x): x is string => !!x)
    )

    // Set B — patients with a CONFIRMED schedule in the last 30 days for
    // this branch+dept (joined via Staff.branch & Staff.department).
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const scheduledRows = await prisma.schedule.findMany({
      where: {
        date:     { gte: thirtyDaysAgo },
        status:   'CONFIRMED',
        patientId: { not: null },
        staff: {
          department: dept,
          ...(branchFilter
            ? { branch: branchFilter as 'SBEA' | 'SBGH' }
            : {}),
        },
      },
      select: { patientId: true },
    })
    const schedulePatientIds = new Set(
      scheduledRows.map(s => s.patientId).filter((x): x is string => !!x)
    )

    // Union of A and B
    const allIds = new Set<string>([...deckingPatientIds, ...schedulePatientIds])
    if (allIds.size === 0) return []

    const patients = await prisma.patient.findMany({
      where: {
        id: { in: Array.from(allIds) },
        unsubscribed: false,
        phone: { not: null },
      },
      select: { id: true, firstName: true, lastName: true, phone: true },
    })

    return patients
      .filter((p): p is typeof p & { phone: string } => !!p.phone && p.phone.trim().length > 0)
  }

  return []
}

/** Public preview — used by /api/sms/recipient-count without enqueuing a send. */
export async function previewRecipientCount(
  recipientGroup: string,
  branch: string,
): Promise<number> {
  const list = await resolveRecipients(recipientGroup, branch)
  return list.length
}

async function sendOneSms(
  toPhone: string,
  fromPhone: string,
  message: string,
  apiKey: string,
): Promise<void> {
  if (!apiKey) {
    throw new Error(
      'SMS gateway not configured. Install httpSMS on the clinic phone and set HTTPSMS_API_KEY_<BRANCH>.'
    )
  }
  const res = await fetch('https://api.httpsms.com/v1/messages/send', {
    method:  'POST',
    headers: {
      'x-api-key':    apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content:    message,
      from:       fromPhone,
      to:         toE164(toPhone),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`httpSMS error ${res.status}: ${text}`)
  }
}

export async function executeSendSmsCampaign(campaignId: string): Promise<void> {
  // Use the shared client via prisma.$queryRaw for the dynamic table — the
  // client doesn't yet have an auto-generated SmsCampaign delegate because
  // the model was added live. We use raw queries to avoid requiring a
  // prisma generate step in this invocation.
  const rows = await prisma.$queryRaw<Array<{
    id: string; subject: string; message: string; recipientGroup: string;
    branch: string; status: string; recipientCount: number; sentCount: number;
  }>>`SELECT id, subject, message, "recipientGroup", branch, status,
              "recipientCount", "sentCount"
         FROM "SmsCampaign" WHERE id = ${campaignId}`
  const campaign = rows[0]
  if (!campaign) throw new Error(`SMS campaign ${campaignId} not found`)
  if (campaign.status === 'sent') return

  const recipients = await resolveRecipients(campaign.recipientGroup, campaign.branch)
  if (recipients.length === 0) {
    await prisma.$executeRaw`UPDATE "SmsCampaign" SET status='failed', "updatedAt"=now() WHERE id = ${campaignId}`
    throw new Error('No recipients with phone numbers in this group')
  }

  // Resume support
  const resuming =
    (campaign.status === 'failed' || campaign.status === 'partial') &&
    campaign.sentCount > 0 &&
    campaign.sentCount < recipients.length
  const startFrom = resuming ? campaign.sentCount : 0

  await prisma.$executeRaw`
    UPDATE "SmsCampaign"
       SET status='sending',
           "recipientCount"=${recipients.length},
           "sentCount"=${resuming ? campaign.sentCount : 0},
           "nextTrancheAt"=NULL,
           "updatedAt"=now()
     WHERE id = ${campaignId}`

  // For BOTH branch, we need an SMS-account-key for each branch. Otherwise
  // pick the configured branch's key.
  const useBranches = campaign.branch === 'BOTH' ? ['SBEA', 'SBGH'] : [campaign.branch]
  const fromCfg: Record<string, { key: string; from: string }> = {}
  for (const b of useBranches) {
    const cfg = BRANCH_CONFIG[b]
    if (!cfg) throw new Error(`Unknown branch ${b}`)
    fromCfg[b] = { key: cfg.httpSmsKey, from: cfg.phone }
  }

  let sentCount = startFrom
  let trancheSentCount = 0
  let rateLimitHit = false

  // Decide which branch each recipient belongs to (for BOTH). Patient.branches
  // is an array; use the first match in our active branches.
  const patientsWithBranch = await prisma.patient.findMany({
    where: { id: { in: recipients.map(r => r.id) } },
    select: { id: true, branches: true, branch: true },
  })
  const branchByPatient = new Map<string, string>()
  for (const p of patientsWithBranch) {
    const b = p.branches.find(x => useBranches.some(ub => BRANCH_ENUM[ub] === x))
            ?? (p.branch && useBranches.some(ub => BRANCH_ENUM[ub] === p.branch) ? p.branch : null)
    if (b) {
      // Map enum back to short code
      const short = Object.entries(BRANCH_ENUM).find(([, e]) => e === b)?.[0]
      if (short) branchByPatient.set(p.id, short)
    }
  }

  try {
    for (let i = startFrom; i < recipients.length; i++) {
      const patient = recipients[i]
      const branchShort = branchByPatient.get(patient.id) ?? useBranches[0]
      const cfg = fromCfg[branchShort] ?? fromCfg[useBranches[0]]

      try {
        await sendOneSms(patient.phone, cfg.from, campaign.message, cfg.key)
      } catch (sendErr) {
        const errObj = sendErr as { message?: string }
        const msg = (errObj?.message ?? '').toLowerCase()
        // httpSMS surfaces 429 / 'rate limit' / 'quota' phrasing in the body
        if (msg.includes('rate limit') || msg.includes('quota') || msg.includes('429') || msg.includes('403')) {
          rateLimitHit = true
          await new Promise(r => setTimeout(r, 5000))
          try {
            await sendOneSms(patient.phone, cfg.from, campaign.message, cfg.key)
            rateLimitHit = false
          } catch {
            break
          }
        } else {
          // Non-rate-limit error — log per-recipient but keep going so one
          // bad number doesn't abort the whole campaign.
          console.warn(`[sms] send to ${patient.phone} failed:`, errObj?.message)
          continue
        }
      }
      sentCount++
      trancheSentCount++
      await new Promise(r => setTimeout(r, SMS_THROTTLE_MS))
      if (sentCount % 10 === 0) {
        await prisma.$executeRaw`UPDATE "SmsCampaign" SET "sentCount"=${sentCount}, "updatedAt"=now() WHERE id = ${campaignId}`.catch(() => undefined)
      }
      if (trancheSentCount >= DAILY_CAP_PER_TRANCHE) break
    }

    const fullyDone = sentCount >= recipients.length
    if (fullyDone) {
      await prisma.$executeRaw`
        UPDATE "SmsCampaign"
           SET status='sent', "sentAt"=now(), "sentCount"=${sentCount},
               "nextTrancheAt"=NULL, "updatedAt"=now()
         WHERE id = ${campaignId}`
      return
    }

    const next = nextTrancheTime()
    await prisma.$executeRaw`
      UPDATE "SmsCampaign"
         SET status='partial', "sentCount"=${sentCount},
             "nextTrancheAt"=${next}, "updatedAt"=now()
       WHERE id = ${campaignId}`
    await scheduleNextTranche(campaignId, next)

    if (rateLimitHit) {
      console.warn(`[sms] Rate limit hit at ${sentCount}/${recipients.length}. Next tranche ${next.toISOString()}.`)
    }
  } catch (err) {
    const cur = await prisma.$queryRaw<Array<{ status: string }>>`SELECT status FROM "SmsCampaign" WHERE id = ${campaignId}`
    if (cur[0]?.status !== 'partial' && cur[0]?.status !== 'sent') {
      await prisma.$executeRaw`UPDATE "SmsCampaign" SET status='failed', "sentCount"=${sentCount}, "updatedAt"=now() WHERE id = ${campaignId}`.catch(() => undefined)
    }
    throw err
  }
}
