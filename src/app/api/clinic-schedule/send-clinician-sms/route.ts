import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const BRANCH_CONFIG: Record<string, { httpSmsKey: string; phone: string }> = {
  SBEA: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBEA ?? '', phone: '+639171189289' },
  SBGH: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBGH ?? '', phone: '+639177701686' },
}

const BRANCH_SHORT: Record<string, string> = { SBEA: 'East', SBGH: 'GH' }

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 11) return '+' + digits
  if (digits.startsWith('0')  && digits.length === 11) return '+63' + digits.slice(1)
  if (digits.length === 10)                             return '+63' + digits
  return '+' + digits
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, date } = await req.json()
  if (!staffId || !date)
    return NextResponse.json({ error: 'staffId and date are required' }, { status: 400 })

  // Look up the clinician including their phone
  const staff = await prisma.staff.findUnique({ where: { id: staffId } })
  if (!staff)
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  if (!staff.phone)
    return NextResponse.json(
      { error: `${staff.firstName} has no mobile number on file in the Staff Module` },
      { status: 400 },
    )

  // Get all schedules for the day
  const dayStart = new Date(`${date}T00:00:00.000Z`)
  const dayEnd   = new Date(`${date}T23:59:59.999Z`)
  const schedules = await prisma.schedule.findMany({
    where:   { staffId, date: { gte: dayStart, lte: dayEnd } },
    include: { patient: true },
    orderBy: { startTime: 'asc' },
  })

  if (schedules.length === 0)
    return NextResponse.json({ error: 'No schedules found for this day' }, { status: 400 })

  const branch    = BRANCH_SHORT[staff.branch] ?? staff.branch
  const shortDate = new Date(date + 'T12:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  // Build the patient list lines
  const patientLines = schedules.map((s, i) => {
    const name = s.patient
      ? `${s.patient.lastName}, ${s.patient.firstName[0]}.`
      : '(no patient)'
    return `${i + 1}. ${name} ${formatTime(s.startTime)}-${formatTime(s.endTime)} ${s.sessionType}`
  })

  const allLines = [
    `Hi ${staff.firstName}! Your schedule for ${shortDate} at Sandbox ${branch}:`,
    ...patientLines,
    `${schedules.length} patient${schedules.length !== 1 ? 's' : ''} total.`,
  ]

  // Split into ≤160-char chunks, breaking only between lines
  const chunks: string[] = []
  let current = ''
  for (const line of allLines) {
    const candidate = current ? `${current}\n${line}` : line
    if (candidate.length <= 160) {
      current = candidate
    } else {
      if (current) chunks.push(current)
      current = line
    }
  }
  if (current) chunks.push(current)

  const cfg = BRANCH_CONFIG[staff.branch] ?? BRANCH_CONFIG['SBEA']
  if (!cfg.httpSmsKey)
    return NextResponse.json(
      { error: 'SMS gateway not configured for this branch' },
      { status: 500 },
    )

  const to = toE164(staff.phone)
  for (const chunk of chunks) {
    const res = await fetch('https://api.httpsms.com/v1/messages/send', {
      method:  'POST',
      headers: { 'x-api-key': cfg.httpSmsKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content:    chunk,
        from:       cfg.phone,
        to,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `httpSMS error ${res.status}: ${text}` }, { status: 502 })
    }
  }

  console.log(`[send-clinician-sms] → ${staff.firstName} ${staff.lastName} (${schedules.length} patients, ${date}, ${chunks.length} SMS)`)
  return NextResponse.json({ ok: true, patients: schedules.length, messages: chunks.length })
}
