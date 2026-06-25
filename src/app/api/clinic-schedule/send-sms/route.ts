import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ── Branch config ──────────────────────────────────────────────────────────────
// SMS is sent via httpSMS — a free service that routes messages through your
// clinic's own Android phone (Globe SIM), so there is NO per-message cost.
// Setup: install the "httpSMS" app on the clinic Android phone, create a free
// account at https://httpsms.com, and add the API key below.
const BRANCH_CONFIG: Record<string, {
  httpSmsKey: string   // API key from httpsms.com (free account)
  phone:      string   // clinic phone in E.164 — used as SMS sender
  phoneDisplay: string // human-readable format for message text
  clinicName: string
  viberToken: string
}> = {
  SBEA: {
    httpSmsKey:   process.env.HTTPSMS_API_KEY_SBEA ?? '',
    phone:        '+639171189289',
    phoneDisplay: '+63 917 118 9289',
    clinicName:   'Sandbox Clinic East',
    viberToken:   process.env.VIBER_BOT_TOKEN_SBEA ?? '',
  },
  SBGH: {
    httpSmsKey:   process.env.HTTPSMS_API_KEY_SBGH ?? '',
    phone:        '+639177701686',
    phoneDisplay: '+63 917 770 1686',
    clinicName:   'Sandbox Clinic Greenhills',
    viberToken:   process.env.VIBER_BOT_TOKEN_SBGH ?? '',
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/**
 * Convert any Philippine phone format → E.164 (+63XXXXXXXXXX) for httpSMS.
 * Handles: +63 956 870 2220 | +639568702220 | 09568702220 | 9568702220
 */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 11) return '+' + digits
  if (digits.startsWith('0')  && digits.length === 11) return '+63' + digits.slice(1)
  if (digits.length === 10)                             return '+63' + digits
  return '+' + digits
}

const BRANCH_SHORT: Record<string, string> = {
  SBEA: 'East',
  SBGH: 'GH',
}

const DEPT_DISPLAY: Record<string, string> = {
  OT:         'OT',
  PT:         'PT',
  SLP:        'SLP',
  MD:         'MD',
  SPED:       'SPED',
  PSYCHOLOGY: 'Psych',
  ORTHOSIS:   'Orthosis',
}

function buildMessage(opts: {
  patientFirstName: string
  date:             string
  startTime:        string
  endTime:          string
  sessionType:      string
  branch:           string
  department:       string
}): string {
  const branch    = BRANCH_SHORT[opts.branch]     ?? opts.branch
  const dept      = DEPT_DISPLAY[opts.department] ?? opts.department
  // "Sun, Mar 15" — no year to save chars
  const shortDate = new Date(opts.date + 'T12:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
  return (
    `Hi ${opts.patientFirstName}! ${dept} ${opts.sessionType} at Aura Health ${branch} ` +
    `on ${shortDate}, ${formatTime(opts.startTime)}-${formatTime(opts.endTime)}. ` +
    `Please reply to confirm, thank you.`
  )
}

// ── Channel: Viber (via Viber Bot API) ─────────────────────────────────────────
// Succeeds only when the patient has subscribed to the clinic Viber bot.
async function sendVia_Viber(
  viberUserId: string,
  message:     string,
  token:       string,
): Promise<void> {
  if (!token) throw new Error('VIBER_BOT_TOKEN not configured for this branch')

  const res  = await fetch('https://chatapi.viber.com/pa/send_message', {
    method:  'POST',
    headers: { 'X-Viber-Auth-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiver: viberUserId, type: 'text', text: message }),
  })
  const json = await res.json()
  if (json.status !== 0) throw new Error(`Viber error ${json.status}: ${json.status_message}`)
}

// ── Channel: SMS (via httpSMS — free, uses clinic Android phone as gateway) ────
// Install the httpSMS app on the clinic phone, register at httpsms.com,
// add the API key as HTTPSMS_API_KEY_SBEA / HTTPSMS_API_KEY_SBGH in .env.
async function sendVia_SMS(
  toPhone:    string,   // patient phone (any PH format)
  fromPhone:  string,   // clinic phone in E.164 (must match phone registered in httpSMS app)
  message:    string,
  apiKey:     string,
): Promise<void> {
  if (!apiKey) throw new Error(
    'SMS gateway not configured. Install the httpSMS app on the clinic phone and add HTTPSMS_API_KEY to the server.'
  )

  const res = await fetch('https://api.httpsms.com/v1/messages/send', {
    method:  'POST',
    headers: {
      'x-api-key':    apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content:    message,
      from:       fromPhone,        // E.164 clinic number registered in the app
      to:         toE164(toPhone),  // E.164 patient number
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`httpSMS error ${res.status}: ${text}`)
  }
}

// ── Smart dispatcher: tries Viber → falls back to SMS ──────────────────────────
// Returns the channel that actually succeeded: 'viber' | 'sms'
async function dispatchReminder(opts: {
  patientId: string
  phone:     string | null
  branch:    string
  message:   string
}): Promise<'viber' | 'sms'> {
  const cfg = BRANCH_CONFIG[opts.branch] ?? BRANCH_CONFIG['SBEA']

  // ── Try Viber first (if patient has subscribed to the bot) ──────────────────
  if (cfg.viberToken) {
    const sub = await prisma.viberSubscription.findFirst({
      where: { patientId: opts.patientId, branch: opts.branch },
    })
    if (sub) {
      await sendVia_Viber(sub.viberUserId, opts.message, cfg.viberToken)
      return 'viber'
    }
  }

  // ── Fall back to SMS via httpSMS ─────────────────────────────────────────────
  if (!opts.phone) throw new Error('Patient has no mobile number on file')
  await sendVia_SMS(opts.phone, cfg.phone, opts.message, cfg.httpSmsKey)
  return 'sms'
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { scheduleId, staffId, date } = await req.json()

  // ── Single schedule ──────────────────────────────────────────────────────────
  if (scheduleId) {
    const schedule = await prisma.schedule.findUnique({
      where:   { id: scheduleId },
      include: { staff: true, patient: true },
    })

    if (!schedule)         return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    if (!schedule.patient) return NextResponse.json({ error: 'No patient on this schedule' }, { status: 400 })

    const branch  = schedule.staff.branch
    const dateStr = schedule.date.toISOString().split('T')[0]

    const message = buildMessage({
      patientFirstName: schedule.patient.firstName,
      date:             dateStr,
      startTime:        schedule.startTime,
      endTime:          schedule.endTime,
      sessionType:      schedule.sessionType,
      branch,
      department:       schedule.staff.department,
    })

    let channel: 'viber' | 'sms'
    try {
      channel = await dispatchReminder({
        patientId: schedule.patient.id,
        phone:     schedule.patient.phone,
        branch,
        message,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[send-sms] Failed for patient ${schedule.patient.id}:`, msg)
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    console.log(`[send-sms] [${channel.toUpperCase()}] → ${schedule.patient.firstName} ${schedule.patient.lastName}`)
    return NextResponse.json({ ok: true, sent: 1, channel })
  }

  // ── Bulk: all patients for a staff member on a date ──────────────────────────
  if (staffId && date) {
    const dayStart = new Date(`${date}T00:00:00.000Z`)
    const dayEnd   = new Date(`${date}T23:59:59.999Z`)

    const schedules = await prisma.schedule.findMany({
      where: {
        staffId,
        date: { gte: dayStart, lte: dayEnd },
        patient: { isNot: null },
      },
      include: { staff: true, patient: true },
      orderBy: { startTime: 'asc' },
    })

    if (schedules.length === 0) {
      return NextResponse.json(
        { error: 'No patients scheduled for this day' },
        { status: 400 },
      )
    }

    const branch = schedules[0].staff.branch
    let sent      = 0
    let viber     = 0
    let sms       = 0
    let lastError = ''

    for (const s of schedules) {
      if (!s.patient) continue
      try {
        const message = buildMessage({
          patientFirstName: s.patient.firstName,
          date,
          startTime:        s.startTime,
          endTime:          s.endTime,
          sessionType:      s.sessionType,
          branch,
          department:       s.staff.department,
        })
        const channel = await dispatchReminder({
          patientId: s.patient.id,
          phone:     s.patient.phone,
          branch,
          message,
        })
        sent++
        if (channel === 'viber') viber++
        else sms++
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        lastError = msg
        console.error(`[send-sms] Failed for patient ${s.patient.id}:`, msg)
      }
    }

    console.log(`[send-sms] Bulk: sent=${sent} (viber=${viber} sms=${sms}) staffId=${staffId} date=${date}`)
    // If nothing sent, surface the last error so the UI can show it
    if (sent === 0 && lastError) {
      return NextResponse.json({ error: lastError }, { status: 502 })
    }
    return NextResponse.json({ ok: true, sent, viber, sms })
  }

  return NextResponse.json({ error: 'Provide scheduleId or staffId + date' }, { status: 400 })
}
