import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ── Branch config ──────────────────────────────────────────────────────────────
const BRANCH_CONFIG: Record<string, {
  semaphoreKey: string
  senderName:   string
  phone:        string
  clinicName:   string
  viberToken:   string
}> = {
  SBEA: {
    semaphoreKey: process.env.SEMAPHORE_API_KEY_SBEA ?? '',
    senderName:   process.env.SEMAPHORE_SENDER_SBEA  ?? 'SandboxEast',
    phone:        '+63 917 118 9289',
    clinicName:   'Sandbox Clinic East',
    viberToken:   process.env.VIBER_BOT_TOKEN_SBEA   ?? '',
  },
  SBGH: {
    semaphoreKey: process.env.SEMAPHORE_API_KEY_SBGH ?? '',
    senderName:   process.env.SEMAPHORE_SENDER_SBGH  ?? 'SandboxGH',
    phone:        '+63 917 770 1686',
    clinicName:   'Sandbox Clinic Greenhills',
    viberToken:   process.env.VIBER_BOT_TOKEN_SBGH   ?? '',
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/** Normalize any Philippine phone format → 11-digit 09XXXXXXXXX for Semaphore */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 11) return '0' + digits.slice(2)
  if (digits.startsWith('0') && digits.length === 11) return digits
  if (digits.length === 10) return '0' + digits
  return digits
}

// Short clinic labels keep the SMS under 160 chars even in worst case.
// Worst-case measured: 122 chars (38-char buffer to spare).
const CLINIC_SHORT: Record<string, string> = {
  SBEA: 'Sandbox East',
  SBGH: 'Sandbox GH',
}

function buildMessage(opts: {
  patientFirstName: string
  date:             string
  startTime:        string
  endTime:          string
  sessionType:      string
  branch:           string
}): string {
  const cfg       = BRANCH_CONFIG[opts.branch] ?? BRANCH_CONFIG['SBEA']
  const clinic    = CLINIC_SHORT[opts.branch]  ?? cfg.clinicName
  // "Sun, Mar 15" — no year to save chars
  const shortDate = new Date(opts.date + 'T12:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
  return (
    `Hi ${opts.patientFirstName}! ${opts.sessionType} at ${clinic} ` +
    `on ${shortDate}. ${formatTime(opts.startTime)}-${formatTime(opts.endTime)}. ` +
    `Call/Viber ${cfg.phone}.`
  )
}

// ── Channel: Viber (via Viber Bot API) ────────────────────────────────────────
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

// ── Channel: SMS (via Semaphore) ──────────────────────────────────────────────
async function sendVia_SMS(
  phone:      string,
  message:    string,
  senderName: string,
  apiKey:     string,
): Promise<void> {
  if (!apiKey) throw new Error('Semaphore API key is not configured for this branch')

  const res = await fetch('https://api.semaphore.co/api/v4/messages', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey:     apiKey,
      number:     normalizePhone(phone),
      message,
      sendername: senderName,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Semaphore error ${res.status}: ${text}`)
  }
}

// ── Smart dispatcher: tries Viber → falls back to SMS ─────────────────────────
// Returns the channel that actually succeeded: 'viber' | 'sms'
async function dispatchReminder(opts: {
  patientId:   string
  phone:       string | null
  branch:      string
  message:     string
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

  // ── Fall back to Semaphore SMS ───────────────────────────────────────────────
  if (!opts.phone) throw new Error('Patient has no mobile number on file')
  await sendVia_SMS(opts.phone, opts.message, cfg.senderName, cfg.semaphoreKey)
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
