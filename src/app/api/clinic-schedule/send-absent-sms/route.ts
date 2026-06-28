import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const BRANCH_CONFIG: Record<string, {
  httpSmsKey:   string
  phone:        string
  viberToken:   string
}> = {
  SBEA: {
    httpSmsKey: process.env.HTTPSMS_API_KEY_SBEA ?? '',
    phone:      '+639171189289',
    viberToken: process.env.VIBER_BOT_TOKEN_SBEA ?? '',
  },
  SBGH: {
    httpSmsKey: process.env.HTTPSMS_API_KEY_SBGH ?? '',
    phone:      '+639177701686',
    viberToken: process.env.VIBER_BOT_TOKEN_SBGH ?? '',
  },
}

const BRANCH_SHORT: Record<string, string> = {
  SBEA: 'East',
  SBGH: 'Greenhills',
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

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 11) return '+' + digits
  if (digits.startsWith('0')  && digits.length === 11) return '+63' + digits.slice(1)
  if (digits.length === 10)                             return '+63' + digits
  return '+' + digits
}

function buildAbsentMessage(opts: {
  patientFirstName:   string
  clinicianFirstName: string
  date:               string
  branch:             string
  department:         string
}): string {
  const branch = BRANCH_SHORT[opts.branch] ?? opts.branch
  const dept   = DEPT_DISPLAY[opts.department] ?? opts.department
  const shortDate = new Date(opts.date + 'T12:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
  return (
    `Hi ${opts.patientFirstName}! Your ${dept} session at Aura Health ${branch} ` +
    `today (${shortDate}) has been cancelled — ${opts.clinicianFirstName} will be absent. ` +
    `We sincerely apologize and will contact you to reschedule. Thank you.`
  )
}

async function sendVia_Viber(viberUserId: string, message: string, token: string): Promise<void> {
  if (!token) throw new Error('VIBER_BOT_TOKEN not configured for this branch')
  const res  = await fetch('https://chatapi.viber.com/pa/send_message', {
    method:  'POST',
    headers: { 'X-Viber-Auth-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiver: viberUserId, type: 'text', text: message }),
  })
  const json = await res.json()
  if (json.status !== 0) throw new Error(`Viber error ${json.status}: ${json.status_message}`)
}

async function sendVia_SMS(toPhone: string, fromPhone: string, message: string, apiKey: string): Promise<void> {
  if (!apiKey) throw new Error(
    'SMS gateway not configured. Install the httpSMS app on the clinic phone and add HTTPSMS_API_KEY to the server.'
  )
  const res = await fetch('https://api.httpsms.com/v1/messages/send', {
    method:  'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content:    message,
      from:       fromPhone,
      to:         toE164(toPhone),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`httpSMS error ${res.status}: ${text}`)
  }
}

async function dispatch(opts: {
  patientId: string
  phone:     string | null
  branch:    string
  message:   string
}): Promise<'viber' | 'sms'> {
  const cfg = BRANCH_CONFIG[opts.branch] ?? BRANCH_CONFIG['SBEA']

  if (cfg.viberToken) {
    const sub = await prisma.viberSubscription.findFirst({
      where: { patientId: opts.patientId, branch: opts.branch },
    })
    if (sub) {
      await sendVia_Viber(sub.viberUserId, opts.message, cfg.viberToken)
      return 'viber'
    }
  }

  if (!opts.phone) throw new Error('Patient has no mobile number on file')
  await sendVia_SMS(opts.phone, cfg.phone, opts.message, cfg.httpSmsKey)
  return 'sms'
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, date } = await req.json()
  if (!staffId || !date) {
    return NextResponse.json({ error: 'Provide staffId and date' }, { status: 400 })
  }

  const dayStart = new Date(`${date}T00:00:00.000Z`)
  const dayEnd   = new Date(`${date}T23:59:59.999Z`)

  const schedules = await prisma.schedule.findMany({
    where: {
      staffId,
      date:    { gte: dayStart, lte: dayEnd },
      patient: { isNot: null },
    },
    include: { staff: true, patient: true },
    orderBy: { startTime: 'asc' },
  })

  if (schedules.length === 0) {
    return NextResponse.json({ error: 'No patients scheduled for this day' }, { status: 400 })
  }

  const branch = schedules[0].staff.branch
  const clinicianFirstName = schedules[0].staff.firstName
  let sent = 0, viber = 0, sms = 0, lastError = ''

  for (const s of schedules) {
    if (!s.patient) continue
    try {
      const message = buildAbsentMessage({
        patientFirstName:   s.patient.firstName,
        clinicianFirstName,
        date,
        branch,
        department:         s.staff.department,
      })
      const channel = await dispatch({
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
      console.error(`[send-absent-sms] Failed for patient ${s.patient?.id}:`, msg)
    }
  }

  console.log(`[send-absent-sms] sent=${sent} (viber=${viber} sms=${sms}) staffId=${staffId} date=${date}`)
  if (sent === 0 && lastError) {
    return NextResponse.json({ error: lastError }, { status: 502 })
  }
  return NextResponse.json({ ok: true, sent, viber, sms })
}
